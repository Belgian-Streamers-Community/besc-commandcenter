import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {runInNewContext} from 'node:vm';
import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import * as review from '../src/lib/crm-review.ts';
const native=createRequire(import.meta.url),id='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222';
const options=[{value:'project|'+target+'|2030-01-01',label:'Project: TESTFIXTURE <script>',type:'project'},{value:'community_person|'+target+'|2030-01-01',label:'Persoon: TESTFIXTURE',type:'community_person'}];
function fixture(config:{main?:boolean;enabled?:boolean;role?:string;error?:boolean;throws?:boolean}={}){
 const calls:{name:string;data?:unknown}[]=[];
 const mocks:Record<string,unknown>={
  '@/lib/crm-review':review,'./review-actions':{crmReviewAction:()=>{}},
  'next/link':{__esModule:true,default:({children,...p}:{children:React.ReactNode})=>React.createElement('a',p,children)},
  'next/navigation':{redirect:(url:string)=>{throw Error('REDIRECT '+url);}},'next/cache':{revalidatePath:()=>{}},
  '@/lib/auth-context':{requireActiveMembership:async()=>{calls.push({name:'auth'});return{membership:{organization_id:id,role:config.role??'admin'},supabase:{rpc:async(name:string,data:unknown)=>{calls.push({name,data});if(config.throws)throw Error('PRIVATE_TOKEN');return{error:config.error?{message:'PRIVATE_TOKEN'}:null,data:{state:'done'}};}}};}},
 };
 const load=(file:string)=>{const m={exports:{}};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/app/communicatie/werkruimte/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,process:{env:{BESC_CRM_COMMUNICATION_ENABLED:config.main===false?'false':'true',BESC_CRM_REVIEW_ENABLED:config.enabled===false?'false':'true'}},Error,require:(name:string)=>name in mocks?mocks[name]:native(name)});return m.exports;};
 const action=(load('review-actions.ts') as {crmReviewAction:(f:FormData)=>Promise<void>}).crmReviewAction;
 const panel=(load('review-panel.tsx') as {ReviewPanel:(props:unknown)=>React.ReactNode}).ReviewPanel;
 const form=(op='execute')=>{const f=new FormData();f.set('connection',id);f.set('grant',id);f.set('action',op);if(op==='execute')f.set('confirmed','yes');return f;};
 const html=(type='community_person',state='ready',available=true,can_execute=true)=>renderToStaticMarkup(panel({connection:id,options:available?options:[],grants:[{id,incoming_id:id,entity_type:type,entity_id:target,state,can_execute,can_stop:true,expires_at:'2030-01-01'}]}));
 return{calls,action,form,html};
}
test('contact UI confirms existing contact without point, name or account input',()=>{const h=fixture().html();assert.match(h,/Bestaand contact bevestigen zonder aanvullingen/);assert.match(h,/Behoud alle bestaande contactgegevens en accountrechten/);assert.match(h,/type="checkbox"/);assert.doesNotMatch(h,/name="(point|name|entity|entity_id|can_write)"|PRIVATE|send|compose/);});
test('project UI shows fixed safe target and no target selector',()=>{const h=fixture().html('project');assert.match(h,new RegExp('/app/projecten/'+target));assert.match(h,/>Project: TESTFIXTURE &lt;script&gt;<\/a>/);assert.doesNotMatch(h,/<select|name="entity_id"/);});
for(const state of ['done','cancelled'])test(state+' has no second execution button',()=>{assert.doesNotMatch(fixture().html('project',state),/<button>Geselecteerde gesprekskoppeling bewaren/);});
test('unavailable target and expired/revoked grant cannot be executed from panel',()=>{assert.doesNotMatch(fixture().html('project','ready',false),/href=|<button>Geselecteerde gesprekskoppeling bewaren/);assert.doesNotMatch(fixture().html('project','ready',true,false),/<button>Geselecteerde gesprekskoppeling bewaren/);});
for(const config of [{main:false},{enabled:false}])test('disabled gate stops before auth or database',async()=>{const f=fixture(config);await assert.rejects(f.action(f.form()),/uitgeschakeld/);assert.deepEqual(f.calls,[]);});
test('ordinary member, missing confirmation and extra target fields rejected before RPC',async()=>{
 const member=fixture({role:'member'});await assert.rejects(member.action(member.form()),/velden/);assert(!member.calls.some(c=>c.name==='crm_review_owner'));
 for(const mode of ['missing','forged','send']){const f=fixture(),form=f.form();if(mode==='missing')form.delete('confirmed');if(mode==='forged')form.set('entity_id',target);if(mode==='send')form.set('action','send');await assert.rejects(f.action(form),/velden/);assert(!f.calls.some(c=>c.name==='crm_review_owner'));}
});
test('review execution uses active tenant, owner RPC only and no ambient provider',async()=>{const f=fixture();await assert.rejects(f.action(f.form()),/succes=opgeslagen/);assert.deepEqual(f.calls.map(c=>c.name),['auth','crm_review_owner']);assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].data)),{p_org:id,p_action:'execute',p_connection:id,p_grant:id});});
test('React server-action transport metadata does not prevent a valid confirmed form',async()=>{const f=fixture(),form=f.form();form.set('$ACTION_ID_fixture','');await assert.rejects(f.action(form),/succes=opgeslagen/);assert.equal(f.calls[1].name,'crm_review_owner');});
test('stop requires no execute confirmation and uses only own stop RPC',async()=>{const f=fixture();await assert.rejects(f.action(f.form('stop')),/succes=opgeslagen/);assert.equal((f.calls[1].data as {p_action:string}).p_action,'stop');});
for(const config of [{error:true},{throws:true}])test('database/transport errors redirect safely without private details',async()=>{const f=fixture(config);await assert.rejects(f.action(f.form()),e=>e instanceof Error&&e.message.includes('actie-niet-bevestigd')&&!e.message.includes('PRIVATE'));});
test('conversation links filter mailbox/thread and require target from authorised options',()=>{
 const row={connection_id:id,thread_id:'FAKE',entity_type:'project',entity_id:target};
 const links=review.crmVisibleConversationLinks([row,{...row,thread_id:'OTHER'},{...row,connection_id:target}],id,'FAKE',options)!;
 assert.equal(links.length,1);assert.equal(links[0].target?.href,'/app/projecten/'+target);
 assert.equal(review.crmVisibleConversationLinks([row],id,'FAKE',[])![0].target,null);
 assert.equal(review.crmVisibleConversationLinks([{...row,entity_type:'javascript:alert(1)'}],id,'FAKE',options)![0].target,null);
 assert.equal(review.crmVisibleConversationLinks([{...row,entity_id:'evil'}],id,'FAKE',options),null);
});
