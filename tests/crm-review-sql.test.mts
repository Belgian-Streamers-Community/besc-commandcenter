import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {f1Database,q,j} from './helpers/f1-database.mts';
let f:Awaited<ReturnType<typeof f1Database>>,sid:string,contacts:string,gmail:string,contact:string,mail:string,person:string,project:string;
before(async()=>{f=await f1Database();await f.owner();await f.db.exec('alter table auth.sessions add column if not exists not_after timestamptz');await f.db.exec(await readFile(new URL('../supabase/local/c10-review.sql',import.meta.url),'utf8'));});
after(async()=>{await f?.db.close();});
async function actor(user=f.ids.admin,session=sid,role='authenticated'){
 await f.actor(user,role);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:user,role,session_id:session}))},false)`);
}
async function call(action:string,grant:string|null=null,c=contacts,o=f.ids.org){
 return (await f.db.query<{v:Record<string,unknown>}>(`select public.crm_review_owner(${q(o)},${q(action)},${q(c)},${grant?q(grant):'null'}) v`)).rows[0].v;
}
async function deny(fn:()=>Promise<unknown>,pattern=/review|permission denied|unique constraint/){
 await f.db.exec('savepoint rejected');try{await assert.rejects(fn(),pattern);}finally{await f.db.exec('rollback to savepoint rejected;release savepoint rejected');}
}
async function issue(kind='contacts',target?:string,minutes=10){
 await f.owner();const c=kind==='contacts'?contacts:gmail,t=target??(kind==='contacts'?person:project),table=kind==='contacts'?'community_people':'projects';
 await f.db.exec(`update private.crm_connections set enabled=false where id=${q(c)}`);
 const grant=(await f.db.query<{v:string}>(`select private.crm_review_issue(${q(c)},${q(f.ids.admin)},${q(sid)},${q(kind==='contacts'?contact:mail)},0,${q(kind==='contacts'?'community_person':'project')},${q(t)},(select updated_at from public.${table} where id=${q(t)}),clock_timestamp()+interval '${minutes} minutes') v`)).rows[0].v;
 await f.db.exec(`update private.crm_connections set enabled=true where id=${q(c)}`);await actor();return grant;
}
async function n(table:string){await f.owner();return (await f.db.query<{n:number}>(`select count(*)::int n from ${table}`)).rows[0].n;}
beforeEach(async()=>{
 await f.owner();await f.db.exec('begin');sid=randomUUID();contacts=randomUUID();gmail=randomUUID();contact=randomUUID();mail=randomUUID();project=randomUUID();
 person=(await f.db.query<{id:string}>(`select id from public.community_people where account_user_id=${q(f.ids.admin)} and organization_id=${q(f.ids.org)}`)).rows[0].id;
 await f.db.exec(`update auth.users set email_confirmed_at=clock_timestamp() where id=${q(f.ids.admin)};insert into auth.sessions(id,user_id)values(${q(sid)},${q(f.ids.admin)});
 update public.community_people set email='admin@fixture.invalid' where id=${q(person)};
 insert into public.projects(id,organization_id,title,created_by)values(${q(project)},${q(f.ids.org)},'TESTFIXTURE - NIET PUBLICEREN - C10',${q(f.ids.admin)});`);
 for(const [id,kind]of[[contacts,'contacts'],[gmail,'gmail']])await f.db.exec(`insert into private.crm_connections(id,organization_id,kind,owner_email,subject_id,enabled,valid_until,retain_until,created_by)values(${q(id)},${q(f.ids.org)},${q(kind)},'admin@fixture.invalid','FAKE',false,clock_timestamp()+interval '7 days',clock_timestamp()+interval '30 days',${q(f.ids.admin)});insert into private.crm_connection_access values(${q(id)},${q(f.ids.admin)},true,false,false);`);
 const cp={external_id:'people/FAKE',source_id:'FAKE',etag:'FAKE',deleted:false,names:['TESTFIXTURE alternate name'],emails:['admin@fixture.invalid','private@fixture.invalid','admin@fixture.invalid'],phones:[],organizations:[]};
 const mp={external_id:'FAKE',thread_id:'FAKE_THREAD',message_id:'<fake@fixture.invalid>',subject:'TESTFIXTURE - NIET PUBLICEREN',from:'admin@fixture.invalid',to:'admin@fixture.invalid',date:'2030-01-01',body:'',has_attachments:false,format:'metadata'};
 await f.db.exec(`insert into private.crm_incoming(id,connection_id,external_id,payload)values(${q(contact)},${q(contacts)},'people/FAKE',${j(cp)}),(${q(mail)},${q(gmail)},'FAKE',${j(mp)})`);
});
afterEach(async()=>{await f.db.exec('rollback');await f.owner();});

test('confirm existing contact adds one decision/audit, zero points, preserves entire person and account',async()=>{
 const g=await issue();await f.owner();
 const before=(await f.db.query<{v:unknown}>(`select to_jsonb(p) v from public.community_people p where id=${q(person)}`)).rows[0].v;
 const users=await n('auth.users'),members=await n('public.organization_members'),people=await n('public.community_people');
 await actor();assert.deepEqual(await call('execute',g),{state:'done'});
 assert.deepEqual(await call('execute',g),{state:'done',replayed:true});
 assert.equal(await n('private.crm_contact_points'),0);assert.equal(await n('private.crm_contact_decisions'),1);assert.equal(await n('auth.users'),users);assert.equal(await n('public.organization_members'),members);assert.equal(await n('public.community_people'),people);
 assert.deepEqual((await f.db.query<{v:unknown}>(`select to_jsonb(p) v from public.community_people p where id=${q(person)}`)).rows[0].v,before);
 assert.equal((await f.db.query<{n:number}>("select count(*)::int n from private.crm_events where operation='contact_confirmed_existing'")).rows[0].n,1);
});
test('project link survives reread and replay without another link/audit or project change',async()=>{
 const g=await issue('gmail');await f.owner();const before=(await f.db.query<{v:unknown}>(`select to_jsonb(p) v from public.projects p where id=${q(project)}`)).rows[0].v;
 await actor();assert.deepEqual(await call('execute',g,gmail),{state:'done'});await actor();assert.deepEqual(await call('execute',g,gmail),{state:'done',replayed:true});
 const view=(await f.db.query<{v:{links:{entity_id:string}[]}}>(`select public.crm_communication_owner(${q(f.ids.org)},'overview',${q(gmail)}) v`)).rows[0].v;
 assert.equal(view.links.length,1);assert.equal(view.links[0].entity_id,project);assert.equal(await n('private.crm_outbox'),0);
 assert.deepEqual((await f.db.query<{v:unknown}>(`select to_jsonb(p) v from public.projects p where id=${q(project)}`)).rows[0].v,before);
 assert.equal((await f.db.query<{n:number}>("select count(*)::int n from private.crm_events where operation='thread_linked'")).rows[0].n,1);
});
for(const change of ['actor','session','tenant','connection','grant'])test('wrong '+change+' denied, including list isolation',async()=>{
 const g=await issue();if(change==='actor')await actor(f.ids.chair);if(change==='session')await actor(f.ids.admin,randomUUID());
 await deny(()=>call('execute',change==='grant'?randomUUID():g,change==='connection'?gmail:contacts,change==='tenant'?f.ids.otherOrg:f.ids.org));
});
for(const change of ['expiry','revoke','disabled','read','write','approve','session','member','email','user_deleted','source_revision','source_payload','target_revision','target_deleted'])test('execution rechecks '+change,async()=>{
 const g=await issue();await f.owner();
 const sql:Record<string,string>={
 expiry:`update private.crm_review_grants set issued_at=clock_timestamp()-interval '20 minutes',expires_at=clock_timestamp()-interval '10 minutes' where id=${q(g)}`,
 revoke:`update private.crm_review_grants set revoked_at=clock_timestamp() where id=${q(g)}`,
 disabled:`update private.crm_connections set enabled=false where id=${q(contacts)}`,
 read:`update private.crm_connection_access set can_read=false where connection_id=${q(contacts)}`,
 write:`update private.crm_connection_access set can_write=true where connection_id=${q(contacts)}`,
 approve:`update private.crm_connection_access set can_approve=true where connection_id=${q(contacts)}`,
 session:`delete from auth.sessions where id=${q(sid)}`,
 member:`update public.organization_members set role='member' where organization_id=${q(f.ids.org)} and user_id=${q(f.ids.admin)}`,
 email:`update auth.users set email='changed@fixture.invalid' where id=${q(f.ids.admin)}`,
 user_deleted:`update auth.users set deleted_at=clock_timestamp() where id=${q(f.ids.admin)}`,
 source_revision:`update private.crm_incoming set revision=revision+1 where id=${q(contact)}`,
 source_payload:`update private.crm_incoming set payload=payload||'{"names":["changed"]}' where id=${q(contact)}`,
 target_revision:`update public.community_people set updated_at=clock_timestamp() where id=${q(person)}`,
 target_deleted:`update public.community_people set deleted_at=clock_timestamp() where id=${q(person)}`,
 };await f.db.exec(sql[change]);await actor();await deny(()=>call('execute',g));assert.equal(await n('private.crm_contact_decisions'),0);
});
test('ambiguous identity created after issuance cannot be silently confirmed',async()=>{const g=await issue();await f.owner();await f.db.exec(`update public.community_people set email='private@fixture.invalid' where id=${q(f.ids.otherPerson)}`);await actor();await deny(()=>call('execute',g),/ambiguous/);});
test('mismatched primary email cannot receive a grant',async()=>{await f.owner();await f.db.exec(`update public.community_people set email='unrelated@fixture.invalid' where id=${q(person)}`);await deny(()=>issue(),/ambiguous/);});
test('grant cancelled after connection disabled preserves incoming and cannot be reissued',async()=>{const g=await issue();await f.owner();await f.db.exec(`update private.crm_connections set enabled=false where id=${q(contacts)}`);await actor();assert.deepEqual(await call('stop',g),{state:'cancelled'});await deny(()=>call('execute',g));assert.equal(await n('private.crm_incoming'),2);await deny(()=>issue());});
test('done grant can be revoked while keeping decision and proof',async()=>{const g=await issue();await call('execute',g);assert.deepEqual(await call('stop',g),{state:'done'});assert.equal(await n('private.crm_contact_decisions'),1);});
test('no general write actions through review RPC',async()=>{const g=await issue();for(const op of ['receive','send','compose','approve','grant','contact_decide','link_thread'])await deny(()=>call(op,g),/action_denied/);await deny(()=>f.db.query(`select public.crm_communication_owner(${q(f.ids.org)},'contact_decide',${q(contacts)},'{}')`),/access_denied/);});
test('issuance rejects more than fifteen minutes and unrelated contact',async()=>{await f.owner();await deny(()=>issue('contacts',person,16),/issue_denied/);await deny(()=>issue('contacts',f.ids.otherPerson),/ambiguous/);});
test('another organisation project cannot be issued or disclosed',async()=>{await f.owner();const foreign=randomUUID();await f.db.exec(`insert into public.projects(id,organization_id,title,created_by)values(${q(foreign)},${q(f.ids.otherOrg)},'TESTFIXTURE FOREIGN',${q(f.ids.other)})`);await deny(()=>issue('gmail',foreign),/target_changed/);});
test('another valid own session cannot list the fixed session grants',async()=>{await issue();await f.owner();const other=randomUUID();await f.db.exec(`insert into auth.sessions(id,user_id)values(${q(other)},${q(f.ids.admin)})`);await actor(f.ids.admin,other);assert.deepEqual(await call('list'),[]);});
test('expired session cannot execute an otherwise valid grant',async()=>{const g=await issue();await f.owner();await f.db.exec(`update auth.sessions set not_after=clock_timestamp()-interval '1 minute' where id=${q(sid)}`);await actor();await deny(()=>call('execute',g),/access_denied/);});
test('changed project without updated_at increment still invalidates fixed review',async()=>{const g=await issue('gmail');await f.owner();await f.db.exec(`update public.projects set title='TESTFIXTURE changed without timestamp' where id=${q(project)}`);await actor();await deny(()=>call('execute',g,gmail),/target_changed/);assert.equal(await n('private.crm_thread_links'),0);});
test('authenticated and service role cannot issue grants or read their table directly',async()=>{
 await issue();for(const role of ['authenticated','service_role','anon']){await actor(f.ids.admin,sid,role);await deny(()=>f.db.query('select * from private.crm_review_grants'));await deny(()=>f.db.query(`select private.crm_review_issue(${q(contacts)},${q(f.ids.admin)},${q(sid)},${q(contact)},0,'community_person',${q(person)},now(),now()+interval '1 minute')`));}
});
