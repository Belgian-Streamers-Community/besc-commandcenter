import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import * as kernel from '../src/lib/social-inbox.ts';
import * as control from '../src/lib/inbox-control.ts';
const native=createRequire(import.meta.url),org='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const member='33333333-3333-4333-8333-333333333333';
function fixture(options:{enabled?:boolean;denied?:boolean;error?:string;invalid?:boolean;receive?:boolean}={}){
 const calls:{name:string;data:Record<string,unknown>}[]=[],auth:string[]=[];
 const row={id,created_at:'2026-01-01T12:00:00Z',platform:'instagram',kind:'direct',status:'open',revision:1,assignee_id:null,last_message_at:'2026-01-01T12:00:00Z',account_name:'TESTFIXTURE account',preview:'<img src=x onerror=alert(1)>'};
 const detail={...row,account_id:id,messages:[{id,sender:'<script>attacker</script>',body:row.preview,occurred_at:row.created_at}],events:[{id:1,operation:'note',actor_id:member,detail:{note:'<script>private note</script>'},created_at:row.created_at}]};
 const target={organization_id:org,account_id:id,platform:'instagram',external_account_id:'123',page_id:'456',kind:'direct',resources:[]};
 const sync={id,account_id:id,kind:'direct',state:'pending',revision:0,pages_committed:0,attempts:0,reason:null,available_at:'2026-01-01T00:00:00Z',selection:target,api_version:'v25.0',observed_at:'2026-11-14T00:00:00Z',events:[]};
 const mocks={'@/lib/auth-context':{requirePermission:async(capability:string)=>{auth.push(capability);if(options.denied)throw Error('REDIRECT denied');return{membership:{organization_id:org},supabase:{rpc:async(name:string,data:Record<string,unknown>)=>{calls.push({name,data});if(options.error)return{error:{code:options.error,message:'SECRET_TOKEN'},data:null};if(name==='inbox_sync_owner')return{error:null,data:data.p_action==='accounts'?[{id,platform:'instagram',external_account_id:'123'}]:data.p_action==='list'?[sync]:sync};return{error:null,data:options.invalid?{bad:'SECRET_TOKEN'}:data.p_action==='list'?[row]:data.p_action==='members'?[{id:member,name:'Fictieve beheerder'}]:detail};}}};}},'@/lib/social-inbox':kernel,'@/lib/inbox-control':control,'next/navigation':{redirect:(href:string)=>{throw Error('REDIRECT '+href);}},'next/cache':{revalidatePath:()=>{}},'next/link':{__esModule:true,default:({href,children}:Record<string,unknown>)=>native('react').createElement('a',{href},children)},'@/components/app-shell':{AppShell:({children}:Record<string,unknown>)=>children}};
 function load<T>(file:string,extra:Record<string,unknown>={}):T{const compiled={exports:{}};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:compiled,exports:compiled.exports,URL,URLSearchParams,FormData,Error,process:{env:{BESC_SOCIAL_INBOX_ENABLED:options.enabled===false?'false':'true',BESC_SOCIAL_INBOX_RECEIVE_ENABLED:options.receive?'true':'false',BESC_SOCIAL_INBOX_SELECTIONS:JSON.stringify([{key:'fixture',label:'TESTFIXTURE selectie',target}])}},fetch:()=>{throw Error('Ambient network forbidden');},require:(key:string)=>key.endsWith('.css')?{}:key in extra?extra[key]:key in mocks?mocks[key as keyof typeof mocks]:native(key)});return compiled.exports as T;}
 const action=load<typeof import('../src/app/app/social/inbox/actions.ts')>('app/app/social/inbox/actions.ts');
 const view=load<typeof import('../src/components/social-inbox-view.tsx')>('components/social-inbox-view.tsx',{'@/app/app/social/inbox/actions':action});
 const status=load<typeof import('../src/components/inbox-sync-status.tsx')>('components/inbox-sync-status.tsx');
 const controls=load<typeof import('../src/components/inbox-controls.tsx')>('components/inbox-controls.tsx',{'./inbox-sync-status':status,'@/app/app/social/inbox/actions':action});
 const page=load<typeof import('../src/app/app/social/inbox/page.tsx')>('app/app/social/inbox/page.tsx',{'@/components/social-inbox-view':view,'@/components/inbox-controls':controls});
 return{calls,auth,row,detail,action,view,page};
}
function form(action='status',extra:Record<string,string>={}){const f=new FormData();for(const [k,v]of Object.entries({thread:id,action,revision:'1',status:'resolved',...extra}))f.set(k,v);return f;}
test('Socialinbox: standaard uit opent geen inboxopslag of provider en blokkeert acties',async()=>{
 const f=fixture({enabled:false});const html=renderToStaticMarkup(await f.page.default({searchParams:Promise.resolve({})}));assert.match(html,/nog niet ingeschakeld/);await assert.rejects(f.action.manageSocialInbox(form()),/uitgeschakeld/);assert.deepEqual(f.calls,[]);assert.deepEqual(f.auth,[]);
});
test('Socialinbox: pagina gebruikt uitsluitend eigen organisatie, beperkte RPC en manageInbox',async()=>{
 const f=fixture();await f.page.default({searchParams:Promise.resolve({thread:id,p_org:'foreign'})});assert.deepEqual(f.auth,['manageInbox']);assert.equal(f.calls.length,3);assert(f.calls.every(c=>c.name==='social_inbox_owner'&&c.data.p_org===org));
});
test('Socialinbox: onbevoegde gebruiker en ongeldige invoer kunnen niets opslaan',async()=>{
 const denied=fixture({denied:true});await assert.rejects(denied.action.manageSocialInbox(form()),/denied/);assert.deepEqual(denied.calls,[]);
 for(const value of [form('send'),form('status',{revision:'-1'}),form('status',{revision:''}),form('note',{note:' '}),form('assign',{thread:'not-a-uuid'})]){const f=fixture();if(value.get('revision')==='')value.delete('revision');await assert.rejects(f.action.manageSocialInbox(value),/velden/);assert.deepEqual(f.calls,[]);}
});
test('Socialinbox: wijziging neemt actor en organisatie van sessie en vereist actuele revisie',async()=>{
 const f=fixture();await assert.rejects(f.action.manageSocialInbox(form('status',{p_org:'foreign',revision:'7'})),/succes=opgeslagen/);assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{name:'social_inbox_owner',data:{p_org:org,p_action:'status',p_thread:id,p_data:{revision:7,status:'resolved'}}}]);
 const conflict=fixture({error:'40001'});await assert.rejects(conflict.action.manageSocialInbox(form()),e=>e instanceof Error&&/fout=gewijzigd/.test(e.message)&&!e.message.includes('SECRET_TOKEN'));
});
test('Socialinbox: providertekst en notities blijven ontsnapte tekst; geen externe antwoordknop',()=>{
 const f=fixture();const html=renderToStaticMarkup(f.view.SocialInboxView({rows:[f.row] as never,detail:f.detail as never,members:[{id:member,name:'Fictieve beheerder'}],filters:{}}));assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>attacker|<script>private note|<img src=x|Antwoord versturen|Bericht verzenden|name="token"/);assert.match(html,/Intern afhandelen verstuurt geen antwoord/);assert.match(html,/Interne notitie/);assert.match(html,/name="revision" value="1"/);
});
test('Socialinbox: opslagfout of verkeerde antwoordvorm toont geen lege succesinbox of geheimen',async()=>{
 for(const options of [{error:'XX000'},{invalid:true}]){const f=fixture(options);const node=await f.page.default({searchParams:Promise.resolve({thread:id})});const child=(node as unknown as {props:{children:{type:unknown;props:{error:string;detail:unknown;rows:unknown[]}}[]}}).props.children.find(c=>c.type===f.view.SocialInboxView)!;assert.equal(child.props.error,'controle');assert.equal(child.props.detail,null);assert.equal(child.props.rows.length,0);}
});

test('Socialinbox: ontvangstpagina leest alleen eigen ownerstatus en haalt bij GET nooit Meta op',async()=>{
 const f=fixture({receive:true});const node=await f.page.default({searchParams:Promise.resolve({sync_job:id,sync_result:'completed'})});
 const html=renderToStaticMarkup(node);assert.match(html,/Leesronde voorbereiden/);assert.match(html,/Volgende pagina ophalen/);assert.doesNotMatch(html,/Leesronde afgerond/);
 const own=f.calls.filter(c=>c.name==='inbox_sync_owner');assert.equal(own.length,3);assert(own.every(c=>c.data.p_org===org));assert.deepEqual(own.map(c=>c.data.p_action),['accounts','list','read']);
});
