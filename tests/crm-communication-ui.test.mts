import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as kernel from '../src/lib/crm-communication.ts';
const native=createRequire(import.meta.url),org='11111111-1111-4111-8111-111111111111',connection='22222222-2222-4222-8222-222222222222',job='33333333-3333-4333-8333-333333333333';
function fixture(options:{enabled?:boolean;role?:string;contacts?:boolean;state?:string;error?:boolean;readOnly?:boolean}={}){
 const calls:string[]=[],rpc:Record<string,unknown>[]=[],state=options.state??'uncertain';
 const mail={external_id:'m1',thread_id:'t1',message_id:'<msg@fixture.invalid>',subject:'TESTFIXTURE bericht',from:'from@fixture.invalid',to:'mailbox@fixture.invalid',date:'2026-11-15',body:'<script>fixture</script>',has_attachments:false,format:'full'};
 const contact={external_id:'people/one',source_id:'source',etag:'v1',deleted:false,names:['TESTFIXTURE Noor'],emails:['person@fixture.invalid'],phones:['+32000000000'],organizations:[]};
 const data={access:{can_write:!options.readOnly,can_approve:!options.readOnly},connection:{id:connection,kind:options.contacts?'contacts':'gmail'},incoming:[{id:job,payload:options.contacts?contact:mail,revision:0,decision:null,previous_decision:null}],outbox:options.contacts?[]:[{id:job,state,requested_by:org,follow_up_task:null,snapshot:{from:'mailbox@fixture.invalid',email:{subject:'TESTFIXTURE mail',body_text:'Fictieve tekst',to_addresses:['recipient@fixture.invalid'],cc_addresses:[],bcc_addresses:['private@fixture.invalid']}}}],points:[],runs:[{id:job,state:'ready',revision:0,pages:0}],events:[{operation:'submitted',created_at:'2026-11-15'}],links:[]};
 const supabase={from(table:string){calls.push(table);const query={select(){return query;},eq(){return query;},is(){return query;},limit(){return query;},in(){return query;},order(){return query;},then(resolve:(v:unknown)=>void){resolve({data:table==='email_communications'?[{id:job,title:'TESTFIXTURE concept',status:'draft'}]:table==='organization_members'?[{user_id:org,profiles:{display_name:'TESTFIXTURE account'}}]:[{id:org,display_name:'TESTFIXTURE Noor',name:'TESTFIXTURE Organisatie',title:'TESTFIXTURE Dossier',email:'person@fixture.invalid',updated_at:'2026-11-15'}],error:null});}};return query;},async rpc(name:string,args:Record<string,unknown>){rpc.push({name,...args});return{data:args.p_action==='connections'?[{id:connection,kind:options.contacts?'contacts':'gmail',owner_email:'mailbox@fixture.invalid'}]:data,error:options.error?{message:'PRIVATE_TOKEN_DO_NOT_LEAK'}:null};}};
 const mocks:Record<string,unknown>={'@/lib/auth-context':{requireActiveMembership:async()=>{calls.push('auth');return{supabase,user:{id:org},membership:{organization_id:org,role:options.role??'admin'}};}},'@/components/app-shell':{AppShell:({children}:{children:React.ReactNode})=>React.createElement('main',null,children)},'next/link':{__esModule:true,default:({children,...props}:{children:React.ReactNode})=>React.createElement('a',props,children)},'next/navigation':{notFound:()=>{throw Error('NOT_FOUND');},redirect:(url:string)=>{throw Error('REDIRECT '+url);}},'next/cache':{revalidatePath:()=>{}},'@/lib/crm-communication':kernel,'@/lib/crm-communication-runtime':{dispatchCrmOperation:async()=>{calls.push('provider');}},'./actions':{crmCommunicationAction:()=>{}},'@/lib/format':{localDateTimeToIso:(x:string)=>x}};
 function load(file:string){const compiled={exports:{}};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:compiled,exports:compiled.exports,process:{env:{BESC_CRM_COMMUNICATION_ENABLED:options.enabled===false?'false':'true'}},Error,URL,FormData,Buffer,fetch:()=>{throw Error('Ambient HTTP forbidden');},require:(key:string)=>key in mocks?mocks[key]:native(key)});return compiled.exports as {default:(p:unknown)=>Promise<React.ReactNode>;crmCommunicationAction:(f:FormData)=>Promise<void>};}
 return{calls,rpc,page:()=>load('app/app/communicatie/werkruimte/page.tsx').default({searchParams:Promise.resolve({connection})}),action:(f:FormData)=>load('app/app/communicatie/werkruimte/actions.ts').crmCommunicationAction(f)};
}
test('CRM UI: disabled page and action perform no auth, database or provider work',async()=>{
 const f=fixture({enabled:false}),form=new FormData();await assert.rejects(f.page(),/NOT_FOUND/);await assert.rejects(f.action(form),/uitgeschakeld/);assert.deepEqual(f.calls,[]);assert.deepEqual(f.rpc,[]);
});
test('CRM UI: ordinary members cannot open the workspace or see a mailbox',async()=>{
 const f=fixture({role:'member'});await assert.rejects(f.page(),/NOT_FOUND/);assert.deepEqual(f.rpc,[]);
});
test('CRM UI: uncertain send has warning and no second-send control; incoming body is escaped',async()=>{
 const html=renderToStaticMarkup(await fixture().page());assert.match(html,/De mail kan al verzonden zijn/);assert.doesNotMatch(html,/De goedgekeurde mail eenmaal verzenden|<script>fixture/);assert.match(html,/&lt;script&gt;fixture/);
});
test('CRM UI: read preparation, individual page processing, separate approval, reply context and explicit recipients are usable',async()=>{
 const html=renderToStaticMarkup(await fixture({state:'approved'}).page());assert.match(html,/Leesronde voorbereiden/);assert.match(html,/Eén pagina ophalen/);assert.match(html,/Alleen kopgegevens/);assert.match(html,/Antwoord op/);assert.match(html,/De goedgekeurde mail eenmaal verzenden/);assert.match(html,/type="checkbox"/);
});
test('CRM UI: Contacts offers selected additions and deliberate contact creation, no Google write or permission assignment',async()=>{
 const html=renderToStaticMarkup(await fixture({contacts:true}).page());assert.match(html,/Gekozen gegevens bij bestaand contact bewaren/);assert.match(html,/Nieuwe contactfiche maken/);assert.match(html,/zonder accounttoegang/);assert.doesNotMatch(html,/De goedgekeurde mail eenmaal verzenden|Sorteer|PRIVATE_TOKEN/);
});
test('CRM UI: missing connection proof fails closed without displaying raw provider/database errors',async()=>{
 const html=renderToStaticMarkup(await fixture({error:true}).page());assert.match(html,/niet worden gecontroleerd/);assert.doesNotMatch(html,/PRIVATE_TOKEN|Gekozen gegevens/);
});
test('CRM action: posted tenant never overrides active membership and no arbitrary provider error leaks',async()=>{
 const f=fixture(),form=new FormData();for(const[k,v]of Object.entries({connection,action:'contact_ignore',data:JSON.stringify({incoming_id:job,revision:0,p_org:'foreign'})}))form.set(k,v);
 await assert.rejects(f.action(form),/succes=opgeslagen/);assert.equal(f.rpc[0].p_org,org);assert.equal(f.calls.includes('provider'),false);
 const bad=fixture({error:true});await assert.rejects(bad.action(form),e=>e instanceof Error&&e.message.includes('actie-niet-bevestigd')&&!e.message.includes('PRIVATE_TOKEN'));
});

test('CRM UI: a reader sees history but no receive, apply, approval or send controls',async()=>{
 const html=renderToStaticMarkup(await fixture({readOnly:true,state:'approved'}).page());assert.match(html,/Historie/);assert.doesNotMatch(html,/<button>Eén pagina ophalen|<button>Leesronde voorbereiden|De goedgekeurde mail eenmaal verzenden|<h2>Een mail voorbereiden/);
});
