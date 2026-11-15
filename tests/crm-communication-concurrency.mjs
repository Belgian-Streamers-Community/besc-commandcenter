import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres'||process.env.PGPASSWORD!=='fixture-only')throw Error('Dedicated localhost fixture only');
const config={host:'127.0.0.1',port:Number(process.env.PGPORT),database:'besc_f1_fixture',user:'postgres',password:'fixture-only',connectionTimeoutMillis:5000};
const root=new pg.Client(config),a=new pg.Client(config),b=new pg.Client(config),sessions=new Map();let org,users,gmail,contacts;
const capture=p=>p.then(value=>({value}),error=>({error}));
async function begin(c,user=users.admin,role='authenticated'){
 await c.query('begin');await c.query("set local lock_timeout='5s';set local statement_timeout='10s'");
 await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claims',$3,true)",[user,role,JSON.stringify({sub:user,role,session_id:sessions.get(user)})]);await c.query('set local role '+role);
}
async function as(c,fn,user=users.admin,role='authenticated'){await begin(c,user,role);try{const value=await fn();await c.query('commit');return value;}catch(e){await c.query('rollback');throw e;}}
const owner=(c,action,id,data={})=>c.query('select public.crm_communication_owner($1,$2,$3,$4) v',[org,action,id,JSON.stringify(data)]).then(r=>r.rows[0].v);
const service=(c,action,id,data={})=>c.query('select public.crm_communication_server($1,$2,$3) v',[action,id,JSON.stringify(data)]).then(r=>r.rows[0].v);
async function waiting(){const deadline=Date.now()+2500;while(Date.now()<deadline){if((await root.query('select wait_event_type from pg_stat_activity where pid=$1',[b.processID])).rows[0]?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,10));}throw Error('Expected real PostgreSQL lock wait');}
async function fixture(){
 const email=await as(a,()=>owner(a,'compose',gmail,{confirmed:'yes',entity_type:'partner',entity_id:partner,to:['recipient@fixture.invalid'],subject:'TESTFIXTURE - NIET VERZENDEN',body:'Fictieve tekst'}));
 const job=await as(a,()=>owner(a,'freeze',gmail,{email_id:email.id,confirmed:'yes'}));await as(a,()=>owner(a,'approve',gmail,{job_id:job.id,decision:'approve'}),users.chair);return job.id;
}
let partner;
try{
 await Promise.all([root.connect(),a.connect(),b.connect()]);assert.match((await root.query('show server_version')).rows[0].server_version,/^17\./);
 assert.equal((await root.query("select email from auth.users where id='00000000-0000-4000-8000-000000000001'")).rows[0].email,'fixture@example.invalid');
 org=(await root.query("select id from public.organizations where slug='besc'")).rows[0].id;
 users=Object.fromEntries((await root.query("select split_part(email,'@',1) name,id from auth.users where email like '%@fixture.invalid'")).rows.map(r=>[r.name,r.id]));
 for(const user of [users.admin,users.chair]){const sid=randomUUID();sessions.set(user,sid);await root.query('update auth.users set email_confirmed_at=now() where id=$1',[user]);await root.query('insert into auth.sessions(id,user_id)values($1,$2)',[sid,user]);}
 await root.query("update public.organization_members set finance_role='approver' where organization_id=$1 and user_id=$2",[org,users.chair]);
 partner=(await root.query('select id from public.partners where organization_id=$1 limit 1',[org])).rows[0].id;
 const configure=async(kind)=>(await as(a,()=>owner(a,'configure',null,{confirmed:'yes',kind,owner_email:'mailbox@fixture.invalid',subject_id:'subject1',valid_until:'2030-01-01',retain_until:'2030-02-01'}))).id;
 gmail=await configure('gmail');contacts=await configure('contacts');await as(a,()=>owner(a,'grant',gmail,{user_id:users.chair,read:true,write:true,approve:true}));
 let job=await fixture();await begin(a,users.admin,'service_role');assert.equal((await service(a,'mail_claim',job)).state,'claimed');
 await begin(b,users.admin,'service_role');let pending=capture(service(b,'mail_claim',job));await waiting();await a.query('commit');let result=await pending;assert.ifError(result.error);assert.equal(result.value.state,'claimed');assert.equal(result.value.nonce,undefined);await b.query('commit');console.log('PASS 1: concurrent send claims have one nonce and one winner.');
 job=await fixture();await begin(a);await owner(a,'cancel_mail',gmail,{job_id:job});await begin(b,users.admin,'service_role');pending=capture(service(b,'mail_claim',job));await waiting();await a.query('commit');result=await pending;assert.ifError(result.error);assert.equal(result.value.state,'cancelled');await b.query('commit');console.log('PASS 2: committed cancellation blocks a waiting send.');
 const run=await as(a,()=>owner(a,'start',contacts,{request_id:randomUUID(),selection:{source:'CONTACT',max_pages:3}}));
 const page={revision:0,items:[{external_id:'people/race',source_id:'source',etag:'v1',deleted:false,names:['TESTFIXTURE'],emails:['race@fixture.invalid'],phones:[],organizations:[]}],next_page:null,finish_token:'sync1'};
 await begin(a,users.admin,'service_role');await service(a,'run_commit',run.id,page);await begin(b,users.admin,'service_role');pending=capture(service(b,'run_commit',run.id,page));await waiting();await a.query('commit');result=await pending;assert.ifError(result.error);assert.equal(result.value.replayed,true);await b.query('commit');assert.equal((await root.query('select count(*)::int n from private.crm_incoming where connection_id=$1',[contacts])).rows[0].n,1);console.log('PASS 3: duplicate concurrent page receipts store one item and checkpoint.');
 job=await fixture();await begin(a);await owner(a,'grant',gmail,{user_id:users.admin,read:false,write:false,approve:false});await begin(b,users.admin,'service_role');pending=capture(service(b,'mail_claim',job));await waiting();await a.query('commit');result=await pending;assert.match(result.error?.message??'',/access_denied/);await b.query('rollback');await as(a,()=>owner(a,'grant',gmail,{user_id:users.admin,read:true,write:true,approve:true}));console.log('PASS 4: permission revocation blocks an already waiting send claim.');
 job=await fixture();const claim=await as(a,()=>service(a,'mail_claim',job),users.admin,'service_role');await as(a,()=>service(a,'mail_dispatch',job,{nonce:claim.nonce}),users.admin,'service_role');await as(a,()=>service(a,'mail_complete',job,{nonce:claim.nonce,receipt:{id:'sent1',thread_id:'thread1'}}),users.admin,'service_role');
 const follow={job_id:job,confirmed:'yes',title:'TESTFIXTURE opvolging',assignee:users.chair,due_at:'2030-01-01T12:00:00Z'};
 await begin(a);const first=await owner(a,'follow_up',gmail,follow);await begin(b);pending=capture(owner(b,'follow_up',gmail,follow));await waiting();await a.query('commit');result=await pending;assert.ifError(result.error);assert.equal(result.value.id,first.id);await b.query('commit');console.log('PASS 5: simultaneous follow-up clicks create one assigned task.');
 console.log('All 5 CRM races passed on isolated PostgreSQL 17. No real Google or Cloud access.');
}finally{await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.allSettled([root.end(),a.end(),b.end()]);}
