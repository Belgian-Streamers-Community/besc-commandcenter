import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';
import {controlInbox,inboxChoices,syncDetail,type OwnerPort,type InboxChoice} from '../src/lib/inbox-control.ts';
import {initialInboxCheckpoint} from '../src/lib/resumable-inbox-page.ts';
import {socialInboxMetaRequirements,mockInboxProvider} from './helpers/resumable-inbox-provider.mts';
import {loadInboxModule} from './helpers/inbox-runtime-fixture.mts';
let f:Awaited<ReturnType<typeof f1Database>>,session:string,selection:InboxChoice,owner:OwnerPort,job:string;
before(async()=>{f=await f1Database();});after(async()=>{await f?.db.close();});
async function actor(user=f.ids.admin,role='authenticated'){
 await f.owner();await f.actor(user,role);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:user,role,session_id:session}))},false)`);
}
async function safe<T>(fn:()=>Promise<T>){await f.db.exec('savepoint rpc');try{const answer=await fn();await f.db.exec('release savepoint rpc');return answer;}catch(e){await f.db.exec('rollback to savepoint rpc;release savepoint rpc');throw e;}}
beforeEach(async()=>{
 await f.owner();await f.db.exec('begin');session=randomUUID();
 await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(f.ids.admin)};insert into auth.sessions(id,user_id)values(${q(session)},${q(f.ids.admin)})`);
 selection={key:'fixture-direct',label:'TESTFIXTURE - NIET PUBLICEREN',target:{organization_id:f.ids.org,account_id:randomUUID(),platform:'instagram',external_account_id:'123',page_id:'456',kind:'direct',resources:[]}};
 await actor();await f.db.exec(`insert into public.social_accounts(id,organization_id,platform,account_name,external_account_id,status,granted_scopes,created_by)values(${q(selection.target.account_id)},${q(f.ids.org)},'instagram','TESTFIXTURE - NIET PUBLICEREN','123','connected',${q('{'+socialInboxMetaRequirements('instagram','direct').join(',')+'}')}::text[],${q(f.ids.admin)})`);
 owner=async(action,id=null,data={})=>{await actor();return safe(async()=>(await f.db.query<{v:unknown}>(`select public.inbox_sync_owner(${q(f.ids.org)},${q(action)},${id?q(id):'null'},${j(data)}) v`)).rows[0].v);};
 job=(await owner('create',null,{target:selection.target,checkpoint:initialInboxCheckpoint(selection.target,'v25.0'),request_id:randomUUID()}) as {id:string}).id;
});
afterEach(async()=>{await f.db.exec('rollback');await f.owner();});
function fixture(options:{enabled?:boolean;revoke?:boolean;lost?:boolean;foreign?:boolean}={}){
 const mock=mockInboxProvider(selection.target,70),calls:string[]=[];let lost=false;
 const mocks={
  './supabase/admin':{createAdminClient:()=>{calls.push('admin');return{rpc:async(_name:string,args:Record<string,unknown>)=>{
   await actor(f.ids.admin,'service_role');calls.push(String(args.p_action));
   const value=await safe(async()=>(await f.db.query<{v:unknown}>(`select public.inbox_sync_server(${q(args.p_job)},${q(args.p_action)},${j(args.p_data)}) v`)).rows[0].v);
   if(options.lost&&args.p_action==='commit'&&!lost){lost=true;throw Error('FIXTURE_SECRET lost ack');}
   if(options.foreign&&args.p_action==='claim'&&value&&typeof value==='object'&&'target' in value)(value as {target:unknown}).target={...selection.target,organization_id:f.ids.otherOrg};
   return{data:value,error:null};
  }};}},
  './meta-integration':{usableMetaCredentials:async()=>{calls.push('credentials');return{access_token:'fixture-only'};}},
 };
 const transport:typeof fetch=async(input,init)=>{const response=await mock.transport(input,init);if(options.revoke&&new URL(String(input)).pathname.endsWith('/messages')){await f.owner();await f.db.exec(`delete from auth.sessions where id=${q(session)}`);}return response;};
 const api=loadInboxModule<typeof import('../src/lib/inbox-receive-runtime.ts')>('lib/inbox-receive-runtime.ts',mocks,{BESC_SOCIAL_INBOX_ENABLED:'true',BESC_SOCIAL_INBOX_RECEIVE_ENABLED:options.enabled===false?'false':'true',BESC_SOCIAL_INBOX_SELECTIONS:JSON.stringify([selection]),META_GRAPH_API_VERSION:'v25.0',META_APP_ID:'100',META_APP_SECRET:'fixture-only'},transport);
 return{api,mock,calls};
}
async function count(){await f.owner();return(await f.db.query<{n:number}>('select count(*)::int n from private.si_messages')).rows[0].n;}
function ports(step:(id:string)=>Promise<{state:string}>){return{enabled:true,organization:f.ids.org,apiVersion:'v25.0',choices:[selection],owner,step};}

test('Inboxbediening: echte owner-RPC, runtime, nagebootste Meta en SQL hervatten 70 teksten zonder dubbelen',async()=>{
 const flow=fixture();let detail=syncDetail.parse(await owner('read',job));assert.deepEqual(detail.selection,selection.target);assert(!JSON.stringify(detail).includes('checkpoint'));
 for(let n=0;n<10;n++){
  const result=await controlInbox({operation:'step',job,revision:detail.revision},ports(id=>flow.api.executeInboxPage(id,f.ids.org,owner)));
  detail=syncDetail.parse(await owner('read',job));if(result.status==='completed')break;assert.equal(result.status,'pending');
 }
 assert.equal(detail.state,'completed');assert.equal(await count(),70);assert(flow.mock.calls.every(c=>c.method==='GET'));
});
test('Inboxbediening: start bereidt alleen voor, is idempotent en accepteert geen browseraccount of cursor',async()=>{
 await owner('cancel',job,{revision:0});const request=randomUUID();let calls=0;
 const input={operation:'start',selection:selection.key,request,target:{organization_id:f.ids.otherOrg},checkpoint:{queue:[]}};
 const first=await controlInbox(input,ports(async()=>{calls++;return{state:'wrong'};}));assert.equal(first.status,'created');assert.equal((await controlInbox(input,ports(async()=>{throw Error();}))).job,first.job);assert.equal(calls,0);
 const detail=syncDetail.parse(await owner('read',first.job));assert.deepEqual(detail.selection,selection.target);assert.equal(detail.attempts,0);
 await assert.rejects(controlInbox({...input,selection:'not-configured'},ports(async()=>({state:'wrong'}))),/selection_denied/);
});
test('Inboxbediening: verloren opslagbevestiging wordt met dezelfde duurzame receipt herkend',async()=>{
 const flow=fixture({lost:true});const result=await flow.api.executeInboxPage(job,f.ids.org,owner);assert.equal(result.recovered,true);assert.equal(result.state,'pending');assert.deepEqual(flow.calls.filter(c=>['commit','receipt'].includes(c)),['commit','receipt']);
});
test('Inboxbediening: geannuleerde job en uitgeschakelde runtime vragen geen credentials of provider',async()=>{
 let flow=fixture({enabled:false});await assert.rejects(flow.api.executeInboxPage(job,f.ids.org,owner),/disabled/);assert.deepEqual(flow.calls,[]);
 await controlInbox({operation:'cancel',job,revision:0},ports(async()=>{throw Error();}));flow=fixture();assert.equal((await flow.api.executeInboxPage(job,f.ids.org,owner)).state,'skipped');assert(!flow.calls.includes('credentials'));assert.equal(flow.mock.calls.length,0);
});
test('Inboxbediening: sessie-intrekking tijdens lezen voorkomt opslag en voortgang',async()=>{
 const flow=fixture({revoke:true});await flow.api.executeInboxPage(job,f.ids.org,owner);assert.equal((await flow.api.executeInboxPage(job,f.ids.org,owner)).state,'unconfirmed');assert.equal(await count(),0);
 await f.owner();assert.equal((await f.db.query<{r:number}>(`select revision::int r from private.rs_jobs where id=${q(job)}`)).rows[0].r,1);
});
test('Inboxbediening: afwijkende serverclaim kan geen credentials of Meta lezen',async()=>{
 const flow=fixture({foreign:true});assert.equal((await flow.api.executeInboxPage(job,f.ids.org,owner)).state,'unconfirmed');assert(!flow.calls.includes('credentials'));assert.equal(flow.mock.calls.length,0);
});
test('Inboxbediening: verouderde revisie, vreemde organisatie en ontbrekende herstartbevestiging stoppen vóór uitvoering',async()=>{
 let calls=0;const p=ports(async()=>{calls++;return{state:'wrong'};});
 await assert.rejects(controlInbox({operation:'step',job,revision:3},p),/revision_changed/);
 await assert.rejects(controlInbox({operation:'step',job,revision:0},{...p,organization:f.ids.otherOrg}),/access_denied/);
 await assert.rejects(controlInbox({operation:'restart',job,revision:0},p));assert.equal(calls,0);
 await owner('cancel',job,{revision:0});await controlInbox({operation:'restart',job,revision:1,confirm:'yes'},p);assert.equal(syncDetail.parse(await owner('read',job)).state,'pending');
});
test('Inboxbediening: accountlijst vereist echte sessie en beheerrecht, onthult geen credentials',async()=>{
 const list=await owner('accounts');assert.equal((list as unknown[]).length,1);assert(!/token|secret|checkpoint/.test(JSON.stringify(list)));
 await actor(f.ids.member);await assert.rejects(safe(()=>f.db.exec(`select public.inbox_sync_owner(${q(f.ids.org)},'accounts')`)),/denied/);
 await f.owner();await f.db.exec(`delete from auth.sessions where id=${q(session)}`);await assert.rejects(owner('accounts'),/denied/);
});
test('Inboxbediening: 55 oudere leesrondes blijven zonder verlies door te bladeren',async()=>{
 await f.owner();await f.db.exec(`insert into private.rs_jobs(organization_id,account_id,requested_by,session_id,request_id,target,checkpoint,kind,state)
 select organization_id,account_id,requested_by,session_id,gen_random_uuid(),target,checkpoint,kind,'completed' from private.rs_jobs cross join generate_series(1,55) where id=${q(job)}`);
 const page=await owner('list') as {id:string}[];assert.equal(page.length,51);
 const next=await owner('list',null,{before:page[49].id}) as {id:string}[];assert.equal(next.length,6);assert.equal(new Set([...page.slice(0,50),...next].map(r=>r.id)).size,56);
 await assert.rejects(owner('list',null,{before:randomUUID()}),/unavailable/);
});
test('Inboxbediening: selectieconfiguratie weigert dubbelzinnige of onveilige selecties',()=>{
 assert.throws(()=>inboxChoices(JSON.stringify([selection,selection]),f.ids.org));assert.throws(()=>inboxChoices(JSON.stringify([{...selection,target:{...selection.target,page_id:'https://evil.invalid'}}]),f.ids.org));assert.deepEqual(inboxChoices(JSON.stringify([selection]),f.ids.otherOrg),[]);
});

test('Inboxbediening: ontbrekend pages_messaging-recht blokkeert Instagram vóór credentials',async()=>{
 await f.owner();await f.db.exec(`update public.social_accounts set granted_scopes=array_remove(granted_scopes,'pages_messaging') where id=${q(selection.target.account_id)}`);
 const flow=fixture();assert.equal((await flow.api.executeInboxPage(job,f.ids.org,owner)).state,'blocked');assert(!flow.calls.includes('credentials'));assert.equal(flow.mock.calls.length,0);
});
