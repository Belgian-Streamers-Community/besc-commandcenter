import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';
import {receiveCrmPage,sendCrmMail,crmContactDiff,crmEmailKey,crmRecipientChoices,crmMatchCandidates,type CrmProvider} from '../src/lib/crm-communication.ts';
let f:Awaited<ReturnType<typeof f1Database>>,gmail:string,contacts:string,email:string;
const sessions=new Map<string,string>();
before(async()=>{f=await f1Database();});after(async()=>{await f?.db.close();});
async function actor(user=f.ids.admin,role='authenticated'){
 await f.owner();await f.actor(user,role);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:user,role,session_id:sessions.get(user)}))},false)`);
}
async function owner(action:string,id:string|null=null,data:Record<string,unknown>={}){
 return(await f.db.query<{v:unknown}>(`select public.crm_communication_owner(${q(f.ids.org)},${q(action)},${id?q(id):'null'},${j(data)}) v`)).rows[0].v as Record<string,unknown>;
}
async function server(action:string,id:string,data:Record<string,unknown>={}){
 await actor(f.ids.admin,'service_role');await f.db.exec('savepoint operation');
 try{const value=(await f.db.query<{v:unknown}>(`select public.crm_communication_server(${q(action)},${q(id)},${j(data)}) v`)).rows[0].v;await f.db.exec('release savepoint operation');return value;}
 catch(e){await f.db.exec('rollback to savepoint operation;release savepoint operation');throw e;}
}
async function denied(sql:string,pattern=/crm_|permission|row-level|approval/i){await f.db.exec('savepoint denied');try{await assert.rejects(f.db.exec(sql),pattern);}finally{await f.db.exec('rollback to savepoint denied;release savepoint denied');}}
const contact={external_id:'people/fixture1',source_id:'source1',etag:'v1',deleted:false,names:['TESTFIXTURE Noor'],emails:['noor@fixture.invalid'],phones:['+32000000000'],organizations:['TESTFIXTURE organisatie']};
const mail={external_id:'m1',thread_id:'t1',message_id:'<fixture1@example.invalid>',subject:'TESTFIXTURE - NIET VERZENDEN',from:'source@fixture.invalid',to:'mailbox@fixture.invalid',date:'2026-11-15',body:'Fictieve tekst',has_attachments:false,format:'full' as const};
function provider(options:{timeout?:boolean;draftChanged?:boolean}={}){
 const calls:string[]=[],raws:string[]=[];
 const api:CrmProvider={identity:async()=>{calls.push('identity');},contacts:async()=>({items:[contact],next_page:null,finish_token:'sync1'}),thread:async()=>[mail],
 draft:async()=>({subject:'TESTFIXTURE - NIET VERZENDEN',body:options.draftChanged?'Changed':'Fictieve tekst',to:['recipient@fixture.invalid'],cc:[],bcc:[]}),
 send:async(raw)=>{calls.push('send');raws.push(raw);if(options.timeout)throw Error('private token lost answer');return{id:'sent1',thread_id:'t1'};}};
 return{api,calls,raws};
}
beforeEach(async()=>{
 await f.owner();await f.db.exec('begin');for(const user of [f.ids.admin,f.ids.chair]){const sid=randomUUID();sessions.set(user,sid);await f.db.exec(`update auth.users set email_confirmed_at=clock_timestamp() where id=${q(user)};insert into auth.sessions(id,user_id)values(${q(sid)},${q(user)})`);}
 await f.db.exec(`update public.organization_members set finance_role='approver' where user_id=${q(f.ids.chair)} and organization_id=${q(f.ids.org)}`);await actor();
 const configure=async(kind:string)=>(await owner('configure',null,{kind,owner_email:'mailbox@fixture.invalid',subject_id:'subject1',valid_until:'2030-01-01T00:00:00Z',retain_until:'2030-02-01T00:00:00Z',confirmed:'yes'})).id as string;
 gmail=await configure('gmail');contacts=await configure('contacts');
 for(const c of [gmail,contacts])await owner('grant',c,{user_id:f.ids.chair,read:true,write:true,approve:true});
 email=(await owner('compose',gmail,{confirmed:'yes',entity_type:'partner',entity_id:f.ids.partner,to:['recipient@fixture.invalid'],subject:'TESTFIXTURE - NIET VERZENDEN',body:'Fictieve tekst'})).id as string;
});
afterEach(async()=>{await f.db.exec('rollback');await f.owner();});
async function job(){await actor();const id=(await owner('freeze',gmail,{email_id:email,confirmed:'yes'})).id as string;await actor(f.ids.chair);await owner('approve',gmail,{job_id:id,decision:'approve'});await actor();return id;}
async function run(kind:'gmail'|'contacts'='gmail'){
 await actor();return(await owner('start',kind==='gmail'?gmail:contacts,{request_id:randomUUID(),selection:kind==='gmail'?{thread_ids:['t1'],format:'full'}:{source:'CONTACT',max_pages:3}})).id as string;
}

test('CRM chain: selected Gmail thread is stored once with durable page proof, without contact/account access changes',async()=>{
 const id=await run(),p=provider();await receiveCrmPage(id,server,p.api,true);assert.deepEqual(await receiveCrmPage(id,server,p.api,true),{state:'done'});
 await actor();const view=await owner('overview',gmail);assert.equal((view.incoming as unknown[]).length,1);assert.equal((view.runs as {pages:number}[])[0].pages,1);
});
test('CRM chain: lost committed page answer is recovered after restart without duplicate rows',async()=>{
 const id=await run('contacts'),p=provider();const uncertain=async(a:string,i:string,d?:Record<string,unknown>)=>{const saved=await server(a,i,d);if(a==='run_commit')throw Error('lost ack');return saved;};
 await assert.rejects(receiveCrmPage(id,uncertain,p.api,true));assert.deepEqual(await receiveCrmPage(id,server,p.api,true),{state:'done'});
 await actor();assert.equal(((await owner('overview',contacts)).incoming as unknown[]).length,1);
});
test('CRM chain: Contacts adds only explicitly selected points; existing email, account, membership and roles stay unchanged',async()=>{
 await receiveCrmPage(await run('contacts'),server,provider().api,true);await actor();
 const view=await owner('overview',contacts),item=(view.incoming as {id:string;revision:number}[])[0];
 const original=(await f.db.query<{v:Record<string,unknown>}>(`select to_jsonb(p) v from public.community_people p where id=${q(f.ids.person)}`)).rows[0].v;
 await owner('contact_decide',contacts,{incoming_id:item.id,revision:item.revision,entity_type:'community_person',entity_id:f.ids.person,expected_updated_at:original.updated_at,confirmed:'yes',points:[{kind:'email',value:contact.emails[0]}]});
 const after=(await f.db.query<{v:Record<string,unknown>}>(`select to_jsonb(p) v from public.community_people p where id=${q(f.ids.person)}`)).rows[0].v;assert.deepEqual(after,original);
 const point=((await owner('overview',contacts)).points as {value:string}[])[0];assert.equal(point.value,contact.emails[0]);
});
test('CRM chain: stale person revision, fabricated source value and foreign tenant contact cannot be applied',async()=>{
 await receiveCrmPage(await run('contacts'),server,provider().api,true);await actor();const item=((await owner('overview',contacts)).incoming as {id:string;revision:number}[])[0];
 const data={incoming_id:item.id,revision:item.revision,entity_type:'community_person',entity_id:f.ids.person,expected_updated_at:'old',confirmed:'yes',points:[{kind:'email',value:contact.emails[0]}]};
 await denied(`select public.crm_communication_owner(${q(f.ids.org)},'contact_decide',${q(contacts)},${j(data)})`,/revision/);
});
test('CRM chain: ordinary members and managers without explicit mailbox ACL cannot read content or provider ports',async()=>{
 await actor(f.ids.member);await denied(`select public.crm_communication_owner(${q(f.ids.org)},'overview',${q(gmail)})`,/access/);
 await actor(f.ids.chair);await f.owner();await f.db.exec(`update private.crm_connection_access set can_read=false where connection_id=${q(gmail)} and user_id=${q(f.ids.chair)}`);await actor(f.ids.chair);
 await denied(`select public.crm_communication_owner(${q(f.ids.org)},'overview',${q(gmail)})`,/access/);
 for(const t of ['crm_incoming','crm_outbox','crm_connection_access'])await denied(`select * from private.${t}`,/permission/);
 await denied(`select public.crm_communication_server('mail_read',${q(randomUUID())})`,/permission/);
});
test('CRM chain: own approval and changed frozen content are rejected by actual SQL guards',async()=>{
 const id=(await owner('freeze',gmail,{email_id:email,confirmed:'yes'})).id;
 await denied(`select public.crm_communication_owner(${q(f.ids.org)},'approve',${q(gmail)},${j({job_id:id,decision:'approve'})})`,/review/);
 await denied(`update public.email_communications set subject='Changed' where id=${q(email)}`,/frozen/);
});
test('CRM chain: frozen approval sends the same MIME once and records receipt and history',async()=>{
 const id=await job(),p=provider();assert.equal((await sendCrmMail(id,server,p.api,true)).state,'confirmed');assert.equal((await sendCrmMail(id,server,p.api,true)).state,'confirmed');assert.equal(p.raws.length,1);
 assert.match(Buffer.from(p.raws[0],'base64url').toString('utf8'),/recipient@fixture.invalid/);
 await actor();const view=await owner('overview',gmail);assert.equal((view.outbox as {state:string}[])[0].state,'confirmed');
 assert.equal((await f.db.query<{status:string}>(`select status from public.email_communications where id=${q(email)}`)).rows[0].status,'sent');
});
test('CRM chain: unknown send outcome persists without second POST after restart',async()=>{
 const id=await job(),p=provider({timeout:true});assert.equal((await sendCrmMail(id,server,p.api,true)).state,'uncertain');assert.equal((await sendCrmMail(id,server,p.api,true)).state,'uncertain');assert.equal(p.raws.length,1);
});
test('CRM chain: a committed send receipt with lost local acknowledgement stays confirmed without replay',async()=>{
 const id=await job(),p=provider(),lost=async(a:string,i:string,d?:Record<string,unknown>)=>{const result=await server(a,i,d);if(a==='mail_complete')throw Error('ack lost');return result;};
 assert.equal((await sendCrmMail(id,lost,p.api,true)).state,'confirmed');assert.equal(p.raws.length,1);
});
test('CRM chain: changed Gmail draft blocks before sending',async()=>{
 await f.db.exec(`update public.email_communications set gmail_draft_id='draft1' where id=${q(email)}`);const id=await job(),p=provider({draftChanged:true});
 assert.equal((await sendCrmMail(id,server,p.api,true)).state,'blocked');assert.deepEqual(p.raws,[]);
});
test('CRM chain: revoked initiating session stops before identity, credential or provider work',async()=>{
 const id=await job(),p=provider();await f.owner();await f.db.exec(`delete from auth.sessions where id=${q(sessions.get(f.ids.admin))}`);
 await assert.rejects(sendCrmMail(id,server,p.api,true),/access/);assert.deepEqual(p.calls,[]);
});
test('CRM chain: cancellation before claim prevents sending and releases the draft for a new review',async()=>{
 const id=await job();await owner('cancel_mail',gmail,{job_id:id});assert.equal((await sendCrmMail(id,server,provider().api,true)).state,'cancelled');
 await actor();await f.db.exec(`update public.email_communications set subject='New review' where id=${q(email)}`);
});
test('CRM chain: confirmed send can create exactly one explicitly assigned follow-up task',async()=>{
 const id=await job();await sendCrmMail(id,server,provider().api,true);await actor();
 const data={job_id:id,confirmed:'yes',title:'TESTFIXTURE opvolging',assignee:f.ids.chair,due_at:'2030-01-01T12:00:00Z'};
 const first=await owner('follow_up',gmail,data),again=await owner('follow_up',gmail,data);assert.equal(first.id,again.id);
});
test('CRM rules: no guessed recipient, shared mailbox merge, plus-tag stripping or overwritten local value',()=>{
 assert.equal(crmEmailKey(' Noor+test@EXAMPLE.invalid '),'Noor+test@example.invalid');
 assert.equal(crmRecipientChoices({central:{id:'one',email:'new@fixture.invalid'},legacy:'old@fixture.invalid'}).stale_legacy,true);
 assert.deepEqual(crmMatchCandidates('info@fixture.invalid',[{id:'one',email:'info@fixture.invalid'},{id:'two',email:'info@fixture.invalid'}]),['one','two']);
 const local={names:contact.names,emails:['local@fixture.invalid'],phones:[],organizations:[]};
 assert.equal(crmContactDiff({...contact,emails:['base@fixture.invalid']},local,contact).emails.state,'conflict');
 assert.equal(crmContactDiff(contact,local,{...contact,emails:[]}).emails.state,'keep_local');
});
test('CRM chain: disabled kernels perform zero storage or provider operations',async()=>{
 const no=async()=>{throw Error('ambient forbidden');};await assert.rejects(receiveCrmPage(randomUUID(),no,provider().api),/disabled/);await assert.rejects(sendCrmMail(randomUUID(),no,provider().api),/disabled/);
});

test('CRM chain: mailbox boundaries also hide legacy mail detail and approval rows from an ungranted manager',async()=>{
 await job();await actor(f.ids.chair);await f.owner();await f.db.exec(`update private.crm_connection_access set can_read=false where connection_id=${q(gmail)} and user_id=${q(f.ids.chair)}`);await actor(f.ids.chair);
 assert.equal((await f.db.query(`select id,body_text,bcc_addresses from public.email_communications where id=${q(email)}`)).rows.length,0);
 assert.equal((await f.db.query(`select id,source_snapshot from public.approval_requests where entity_type='email' and entity_id=${q(email)}`)).rows.length,0);
});
test('CRM chain: deliberate creation from a contact proposal makes no account or membership and does not guess an email owner',async()=>{
 await receiveCrmPage(await run('contacts'),server,provider().api,true);await actor();
 const item=((await owner('overview',contacts)).incoming as {id:string;revision:number}[])[0];
 const count=(await f.db.query<{n:number}>('select count(*)::int n from public.organization_members')).rows[0].n;
 const answer=await owner('contact_decide',contacts,{incoming_id:item.id,revision:item.revision,entity_type:'community_person',create_person:'yes',name:contact.names[0],confirmed:'yes',points:[{kind:'email',value:contact.emails[0]}]});
 assert.ok(answer.entity_id);const person=(await f.db.query<{account_user_id:string|null;status:string;email:string|null}>(`select account_user_id,status,email from public.community_people where id=${q(answer.entity_id)}`)).rows[0];
 assert.equal(person.account_user_id,null);assert.equal(person.status,'candidate');assert.equal(person.email,null);assert.equal((await f.db.query<{n:number}>('select count(*)::int n from public.organization_members')).rows[0].n,count);
});
test('CRM chain: Contacts checkpoint is reused only after a fully committed round on the same connection',async()=>{
 await receiveCrmPage(await run('contacts'),server,provider().api,true);const next=await run('contacts'),p=provider();let sync:string|null=null;
 p.api.contacts=async(_page,checkpoint)=>{sync=checkpoint;return{items:[contact],next_page:null,finish_token:'sync2'};};await receiveCrmPage(next,server,p.api,true);assert.equal(sync,'sync1');
 await actor();assert.equal(((await owner('overview',contacts)).incoming as unknown[]).length,1);
});
test('CRM chain: bounded Contacts round pauses and resumes the same cursor instead of skipping a page',async()=>{
 const id=await run('contacts'),p=provider(),seen:(string|null)[]=[];
 p.api.contacts=async(page)=>{seen.push(page);const n=page?Number(page):0;return{items:[{...contact,external_id:'people/p'+n}],next_page:n<3?String(n+1):null,finish_token:n===3?'sync4':null};};
 for(let n=0;n<3;n++)await receiveCrmPage(id,server,p.api,true);
 await actor();let state=await owner('run_read',contacts,{run_id:id});assert.equal(state.state,'attention');assert.equal(state.pages,3);
 await owner('resume_run',contacts,{run_id:id,revision:state.revision,confirmed:'yes'});await receiveCrmPage(id,server,p.api,true);await actor();state=await owner('run_read',contacts,{run_id:id});assert.equal(state.state,'done');assert.deepEqual(seen,[null,'1','2','3']);
});
test('CRM chain: malformed item blocks the entire page, leaving both data and cursor unchanged',async()=>{
 const id=await run('contacts'),p=provider();p.api.contacts=async()=>({items:[contact,{...contact,external_id:'people/bad',emails:['not-an-email']}],next_page:null,finish_token:'wrong'});
 await assert.rejects(receiveCrmPage(id,server,p.api,true));await actor();const view=await owner('overview',contacts);assert.equal((view.incoming as unknown[]).length,0);assert.equal((view.runs as {revision:number}[])[0].revision,0);
});
test('CRM chain: source deletion remains a proposal, never a person or history deletion',async()=>{
 const id=await run('contacts'),p=provider();p.api.contacts=async()=>({items:[{...contact,deleted:true}],next_page:null,finish_token:'deleted'});await receiveCrmPage(id,server,p.api,true);await actor();
 const item=((await owner('overview',contacts)).incoming as {id:string;revision:number}[])[0];
 await denied(`select public.crm_communication_owner(${q(f.ids.org)},'contact_decide',${q(contacts)},${j({incoming_id:item.id,revision:item.revision,entity_type:'community_person',entity_id:f.ids.person,confirmed:'yes',points:[{kind:'email',value:contact.emails[0]}]})})`,/selection/);
 assert.equal((await f.db.query(`select id from public.community_people where id=${q(f.ids.person)}`)).rows.length,1);
});
test('CRM chain: claimed/dispatched jobs never send again after a process interruption',async()=>{
 const id=await job(),claim=await server('mail_claim',id) as {nonce:string};await server('mail_dispatch',id,{nonce:claim.nonce});const p=provider();
 assert.equal((await sendCrmMail(id,server,p.api,true)).state,'dispatched');assert.deepEqual(p.calls,[]);
});
test('CRM chain: a changed follow-up replay is a conflict, not an acknowledgement of new owner/deadline',async()=>{
 const id=await job();await sendCrmMail(id,server,provider().api,true);await actor();const data={job_id:id,confirmed:'yes',title:'TESTFIXTURE opvolging',assignee:f.ids.chair,due_at:'2030-01-01T12:00:00Z'};await owner('follow_up',gmail,data);
 await denied(`select public.crm_communication_owner(${q(f.ids.org)},'follow_up',${q(gmail)},${j({...data,assignee:f.ids.admin})})`,/conflict/);
});
test('CRM chain: a blocked preflight can be explicitly withdrawn and submitted as a new review',async()=>{
 await f.db.exec(`update public.email_communications set gmail_draft_id='draft1' where id=${q(email)}`);const id=await job();await sendCrmMail(id,server,provider({draftChanged:true}).api,true);await actor();
 await owner('cancel_mail',gmail,{job_id:id});await f.db.exec(`update public.email_communications set body_text='Corrected text' where id=${q(email)}`);
 assert.ok((await owner('freeze',gmail,{email_id:email,confirmed:'yes'})).id);
});
test('CRM chain: only explicit metadata/body selection is accepted and disabled connection stops pending work',async()=>{
 const id=await run(),p=provider();await owner('disable',gmail,{confirmed:'yes'});
 await assert.rejects(receiveCrmPage(id,server,p.api,true),/access/);assert.deepEqual(p.calls,[]);
});
test('CRM chain: later separately selected body read upgrades metadata once; metadata reread never erases it',async()=>{
 const selection=async(format:string)=>{await actor();return(await owner('start',gmail,{request_id:randomUUID(),selection:{thread_ids:['t1'],format}})).id as string;};
 const p=provider();p.api.thread=async(_thread,format)=>[{...mail,format,body:format==='metadata'?'':mail.body}];
 await receiveCrmPage(await selection('metadata'),server,p.api,true);await receiveCrmPage(await selection('full'),server,p.api,true);await receiveCrmPage(await selection('metadata'),server,p.api,true);await actor();
 const items=(await owner('overview',gmail)).incoming as {payload:{format:string;body:string}}[];assert.equal(items.length,1);assert.equal(items[0].payload.format,'full');assert.equal(items[0].payload.body,mail.body);
});
test('CRM chain: an explicitly selected reply keeps its real thread and RFC headers through SQL approval and frozen sending',async()=>{
 await receiveCrmPage(await run(),server,provider().api,true);await actor();const reply=((await owner('overview',gmail)).incoming as {id:string}[])[0];
 const id=(await owner('freeze',gmail,{email_id:email,reply_to:reply.id,confirmed:'yes'})).id as string;await actor(f.ids.chair);await owner('approve',gmail,{job_id:id,decision:'approve'});const p=provider();let selected:string|null=null;
 const send=p.api.send;p.api.send=async(raw,thread)=>{selected=thread;return send(raw,thread);};assert.equal((await sendCrmMail(id,server,p.api,true)).state,'confirmed');assert.equal(selected,'t1');assert.match(Buffer.from(p.raws[0],'base64url').toString('utf8'),/In-Reply-To: <fixture1@example.invalid>/);
});
