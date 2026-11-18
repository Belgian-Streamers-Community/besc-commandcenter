import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {writeFile} from 'node:fs/promises';import pg from 'pg';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres'||process.env.PGPASSWORD!=='fixture-only'||!/^\d+$/.test(process.env.PGPORT??''))throw Error('Dedicated localhost fixture required');
const config={host:'127.0.0.1',port:Number(process.env.PGPORT),database:'besc_f1_fixture',user:'postgres',password:'fixture-only',connectionTimeoutMillis:5000};
const root=new pg.Client(config),a=new pg.Client(config),b=new pg.Client(config);let org,user,session,person;const results=[];
const capture=p=>p.then(value=>({value}),error=>({error}));
async function begin(c,role='authenticated'){
 await c.query('begin');await c.query("set local lock_timeout='6s';set local statement_timeout='10s'");
 await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claims',$3,true)",[user,role,JSON.stringify({sub:user,role,session_id:session})]);await c.query('set local role '+role);
}
const execute=(client,f)=>client.query("select public.crm_review_owner($1,'execute',$2,$3) v",[org,f.c,f.g]).then(x=>x.rows[0].v);
async function issue(client,f){return (await client.query("select private.crm_review_issue($1,$2,$3,$4,0,$5,$6,$7,clock_timestamp()+interval '10 minutes') g",[f.c,user,session,f.item,f.kind==='contacts'?'community_person':'project',f.target,f.updated])).rows[0].g;}
async function fixture(kind='contacts',issued=true){
 const c=randomUUID(),item=randomUUID();let target=person;
 if(kind==='gmail'){target=randomUUID();await root.query("insert into public.projects(id,organization_id,title,created_by) values($1,$2,'TESTFIXTURE - NIET PUBLICEREN - RACE',$3)",[target,org,user]);}
 const table=kind==='gmail'?'projects':'community_people';const updated=(await root.query(`select updated_at::text updated_at from public.${table} where id=$1`,[target])).rows[0].updated_at;
 await root.query("insert into private.crm_connections(id,organization_id,kind,owner_email,subject_id,enabled,valid_until,retain_until,created_by)values($1,$2,$3,'admin@fixture.invalid','FAKE',false,now()+interval '7 days',now()+interval '30 days',$4)",[c,org,kind,user]);await root.query('insert into private.crm_connection_access values($1,$2,true,false,false)',[c,user]);
 const payload=kind==='contacts'?{external_id:'people/FAKE',source_id:'FAKE',etag:'FAKE',deleted:false,names:['TESTFIXTURE'],emails:['admin@fixture.invalid'],phones:[],organizations:[]}:{external_id:'FAKE',thread_id:'FAKE',message_id:'<fake@fixture.invalid>',subject:'TESTFIXTURE',from:'admin@fixture.invalid',to:'admin@fixture.invalid',body:'',format:'metadata',has_attachments:false,date:'2030-01-01'};
 await root.query('insert into private.crm_incoming(id,connection_id,external_id,payload)values($1,$2,$3,$4)',[item,c,payload.external_id,payload]);
 const f={c,item,target,updated,kind};if(issued){f.g=await issue(root,f);await root.query('update private.crm_connections set enabled=true where id=$1',[c]);}return f;
}
async function waiting(){const end=Date.now()+3000;while(Date.now()<end){if((await root.query('select wait_event_type from pg_stat_activity where pid=$1',[b.processID])).rows[0]?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,15));}throw Error('Expected genuine row lock wait');}
function pass(name){results.push({name,passed:true});console.log('PASS '+name);}
try{
 await Promise.all([root.connect(),a.connect(),b.connect()]);assert.match((await root.query('show server_version')).rows[0].server_version,/^17\./);
 assert.equal((await root.query("select email from auth.users where id='00000000-0000-4000-8000-000000000001'")).rows[0]?.email,'fixture@example.invalid');
 org=(await root.query("select id from public.organizations where slug='besc'")).rows[0].id;user=(await root.query("select id from auth.users where email='admin@fixture.invalid'")).rows[0].id;
 person=(await root.query('select id from public.community_people where organization_id=$1 and account_user_id=$2',[org,user])).rows[0].id;
 await root.query("update public.community_people set email='admin@fixture.invalid' where id=$1",[person]);await root.query('update auth.users set email_confirmed_at=now() where id=$1',[user]);session=randomUUID();await root.query('insert into auth.sessions(id,user_id)values($1,$2)',[session,user]);
 for(const kind of ['contacts','gmail']){
  const f=await fixture(kind);await begin(a);assert.deepEqual(await execute(a,f),{state:'done'});await begin(b);const pending=capture(execute(b,f));await waiting();await a.query('commit');const second=await pending;assert.ifError(second.error);assert.deepEqual(second.value,{state:'done',replayed:true});await b.query('commit');
  const table=kind==='contacts'?'crm_contact_decisions':'crm_thread_links';const where=kind==='contacts'?'incoming_id':'connection_id';const id=kind==='contacts'?f.item:f.c;assert.equal((await root.query(`select count(*)::int n from private.${table} where ${where}=$1`,[id])).rows[0].n,1);pass('Concurrent '+kind+' execution creates one result and replays second request');
 }
 for(const kind of ['stop','acl','session','target','expiry']){
  const f=await fixture(kind==='target'||kind==='expiry'?'gmail':'contacts');
  if(kind==='expiry')await root.query("update private.crm_review_grants set expires_at=clock_timestamp()+interval '1 second' where id=$1",[f.g]);
  await begin(a,kind==='stop'?'authenticated':'postgres');
  if(kind==='stop')await a.query("select public.crm_review_owner($1,'stop',$2,$3)",[org,f.c,f.g]);
  if(kind==='acl')await a.query('update private.crm_connection_access set can_read=false where connection_id=$1',[f.c]);
  if(kind==='session')await a.query('delete from auth.sessions where id=$1',[session]);
  if(kind==='target')await a.query("update public.projects set title='TESTFIXTURE CHANGED' where id=$1",[f.target]);
  if(kind==='expiry')await a.query('select id from public.projects where id=$1 for update',[f.target]);
  await begin(b);const pending=capture(execute(b,f));await waiting();if(kind==='expiry')await root.query('select pg_sleep(1.2)');await a.query('commit');const result=await pending;assert.match(result.error?.message??'',/review/);await b.query('rollback');
  assert.equal((await root.query("select count(*)::int n from private.crm_contact_decisions where incoming_id=$1",[f.item])).rows[0].n,0);
  assert.equal((await root.query('select count(*)::int n from private.crm_thread_links where connection_id=$1',[f.c])).rows[0].n,0);
  if(kind==='session')await root.query('insert into auth.sessions(id,user_id)values($1,$2)',[session,user]);pass(kind+' during a real row lock wait prevents application');
 }
 const f=await fixture('contacts',false);await begin(a,'postgres');await issue(a,f);await begin(b,'postgres');const pending=capture(issue(b,f));await waiting();await a.query('commit');const second=await pending;assert.match(second.error?.message??'',/unique constraint/);await b.query('rollback');pass('Concurrent issuance cannot create two grants for the same fixed action');
 const output=process.env.C10_REVIEW_RACE_REPORT;if(!output)throw Error('Explicit report path required');await writeFile(output,JSON.stringify({checked_utc:new Date().toISOString(),passed:results.length,results,cloud_access:false,provider_requests:0},null,2)+'\n');
}finally{await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.allSettled([root.end(),a.end(),b.end()]);}
