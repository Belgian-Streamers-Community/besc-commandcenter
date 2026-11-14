import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadInboxModule} from './helpers/inbox-runtime-fixture.mts';
const org='11111111-1111-4111-8111-111111111111',job='22222222-2222-4222-8222-222222222222',account='33333333-3333-4333-8333-333333333333',request='44444444-4444-4444-8444-444444444444';
const selection={key:'fixture',label:'TESTFIXTURE - NIET PUBLICEREN',target:{organization_id:org,account_id:account,platform:'instagram' as const,external_account_id:'123',page_id:'456',kind:'direct' as const,resources:[]}};
const detail={id:job,account_id:account,kind:'direct' as const,selection:selection.target,api_version:'v25.0',observed_at:'2026-11-14T00:00:00Z',state:'pending' as const,revision:0,pages_committed:0,attempts:0,reason:null,available_at:'2000-01-01T00:00:00Z',events:[]};
const status=loadInboxModule<typeof import('../src/components/inbox-sync-status.tsx')>('components/inbox-sync-status.tsx',{});
const ui=loadInboxModule<typeof import('../src/components/inbox-controls.tsx')>('components/inbox-controls.tsx',{'./inbox-sync-status':status,'@/app/app/social/inbox/actions':{controlSocialInbox:async()=>{throw Error('SSR cannot execute action');}}});
const html=(props:Partial<Parameters<typeof ui.InboxControls>[0]>={})=>renderToStaticMarkup(ui.InboxControls({enabled:true,choices:[selection],rows:[detail],detail,request,...props}));

test('Inboxbediening UI: standaard uit heeft geen formulieren of voorbereidingsknop',()=>{const s=html({enabled:false});assert.match(s,/nog niet ingeschakeld/);assert.doesNotMatch(s,/<form|Leesronde voorbereiden|Volgende pagina/);});
test('Inboxbediening UI: start en volgende pagina zijn gescheiden, met revisie en idempotente request',()=>{const s=html();assert.match(s,/Leesronde voorbereiden/);assert.match(s,/Volgende pagina ophalen/);assert.match(s,/name="request"/);assert.match(s,/name="revision"/);assert.match(s,/maximaal één pagina/);assert.doesNotMatch(s,/fixture-only|access_token|appSecret|cursor|Bericht versturen/);});
test('Inboxbediening UI: wachten en levende lease bieden geen tweede paginaverzoek',()=>{
 for(const d of [{...detail,state:'retry_wait' as const,available_at:'2099-01-01T00:00:00Z',reason:'rate_limited'},{...detail,state:'processing' as const,lease_until:'2099-01-01T00:00:00Z'}])assert.doesNotMatch(html({detail:d}),/Volgende pagina ophalen|Hervatten na onderbreking/);
 assert.match(html({detail:{...detail,state:'processing',lease_until:'2000-01-01T00:00:00Z'}}),/Hervatten na onderbreking/);
});
test('Inboxbediening UI: afgerond of geannuleerd betekent geen ophalen; opnieuw beginnen vraagt bevestiging',()=>{
 for(const state of ['completed','cancelled'] as const){const s=html({detail:{...detail,state}});assert.doesNotMatch(s,/Volgende pagina ophalen|Leesronde annuleren/);assert.match(s,/type="checkbox"/);assert.match(s,/name="confirm"/);assert.match(s,/Bestaande berichten blijven bewaard/);}
});
test('Inboxbediening UI: leesrondes en historie zijn doorbladerbaar zonder overslaan van sentinel',()=>{
 const rows=Array.from({length:51},(_,i)=>({...detail,id:job.slice(0,-2)+String(i).padStart(2,'0')}));const events=Array.from({length:51},(_,i)=>({id:i+1,operation:'claimed',reason:null,created_at:'2026-01-01T00:00:00Z'}));
 const s=html({rows,detail:{...detail,events}});assert.match(s,/Oudere leesrondes/);assert.match(s,/sync_events_before=2/);assert.match(s,/Eerdere ontvangsthistorie/);
});
test('Inboxbediening UI: fout en onbevestigde uitvoering tonen geen verzonnen succes of ruwe fout',()=>{
 const s=html({feedback:'unconfirmed',error:true});assert.match(s,/niet bevestigd/);assert.match(s,/role="alert"/);assert.doesNotMatch(html({feedback:'RAW_SECRET'}),/RAW_SECRET/);
});

function actions(enabled:boolean,denied=false){
 const calls:Record<string,unknown>[]=[],env=enabled?{BESC_SOCIAL_INBOX_ENABLED:'true',BESC_SOCIAL_INBOX_RECEIVE_ENABLED:'true',BESC_SOCIAL_INBOX_SELECTIONS:JSON.stringify([selection]),META_GRAPH_API_VERSION:'v25.0'}:{};
 const api=loadInboxModule<typeof import('../src/app/app/social/inbox/actions.ts')>('app/app/social/inbox/actions.ts',{
  'next/navigation':{redirect:(path:string)=>{throw Error('REDIRECT '+path);}},'next/cache':{revalidatePath:()=>{}},
  '@/lib/auth-context':{requirePermission:async(capability:string)=>{calls.push({permission:capability});if(denied)throw Error('DENIED');return{membership:{organization_id:org},supabase:{rpc:async(name:string,input:Record<string,unknown>)=>{calls.push({name,...input});return{data:{id:job,state:'pending'},error:null};}}};}},
  '@/lib/inbox-receive-runtime':{executeInboxPage:async()=>{throw Error('Start must not invoke provider');}},
 },env);
 return{api,calls};
}
test('Inboxserveractie: uitgeschakeld stopt voor autorisatie/database; geweigerde gebruiker bereikt geen RPC',async()=>{
 let f=actions(false);await assert.rejects(f.api.controlSocialInbox(new FormData()),/sync_error/);assert.deepEqual(f.calls,[]);
 f=actions(true,true);await assert.rejects(f.api.controlSocialInbox(new FormData()),/DENIED/);assert.equal(f.calls.length,1);
});
test('Inboxserveractie: organisatie en account komen uit sessie/configuratie, niet uit formulier',async()=>{
 const f=actions(true),form=new FormData();for(const [k,v]of Object.entries({operation:'start',selection:'fixture',request,organization_id:request,account_id:request}))form.set(k,v);
 await assert.rejects(f.api.controlSocialInbox(form),/sync_result=created/);const rpc=f.calls.find(c=>c.name==='inbox_sync_owner')!;assert.equal(rpc.p_org,org);assert.equal((rpc.p_data as {target:{account_id:string}}).target.account_id,account);
});
test('Inboxserveractie: ontbrekende herstartbevestiging geeft vaste fout zonder opslag of provider',async()=>{
 const f=actions(true),form=new FormData();for(const[k,v]of Object.entries({operation:'restart',job,revision:'0'}))form.set(k,v);
 await assert.rejects(f.api.controlSocialInbox(form),/sync_error/);assert.equal(f.calls.length,1);
});
