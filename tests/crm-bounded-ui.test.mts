import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createRequire}from'node:module';import{runInNewContext}from'node:vm';import ts from'typescript';import React from'react';import{renderToStaticMarkup}from'react-dom/server';
const native=createRequire(import.meta.url),id='11111111-1111-4111-8111-111111111111';
function fixture(options:{enabled?:boolean;main?:boolean;error?:boolean;role?:string}={}){
 const calls:{op:string;data?:unknown}[]=[];
 const env={BESC_CRM_COMMUNICATION_ENABLED:options.main===false?'false':'true',BESC_CRM_BOUNDED_RECEIVE_ENABLED:options.enabled===false?'false':'true'};
 const mocks:Record<string,unknown>={
  'server-only':{},'@/lib/auth-context':{requireActiveMembership:async()=>{calls.push({op:'auth'});return{membership:{organization_id:id,role:options.role??'admin'},supabase:{rpc:async(name:string,args:unknown)=>{calls.push({op:name,data:args});return{data:{state:'claimed'},error:options.error?{message:'PRIVATE_ERROR'}:null};}}};}},
  '@/lib/crm-bounded-runtime':{dispatchBoundedCrm:async(grant:string,owner:(op:string,id:string)=>Promise<unknown>)=>{calls.push({op:'dispatch'});await owner('claim',grant);}},
  'next/navigation':{redirect:(url:string)=>{throw Error('REDIRECT '+url);}},'next/cache':{revalidatePath:()=>{}},
  './bounded-actions':{boundedReceiveAction:()=>{}},
  './supabase/admin':{createAdminClient:()=>{calls.push({op:'admin'});throw Error('NO NETWORK');}},
  './crm-communication-runtime':{readCrmCredentialBinding:()=>{calls.push({op:'credential'});throw Error('NO SECRET');}},
 };
 function load(file:string){const compiled={exports:{}};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:compiled,exports:compiled.exports,process:{env},URL,Error,require:(key:string)=>key in mocks?mocks[key]:native(key)});return compiled.exports;}
 const action=load('app/app/communicatie/werkruimte/bounded-actions.ts')as{boundedReceiveAction:(f:FormData)=>Promise<void>};
 const panel=load('app/app/communicatie/werkruimte/bounded-panel.tsx')as{BoundedPanel:(props:{grants:unknown[]})=>React.ReactNode};
 const form=(op='receive')=>{const f=new FormData();f.set('grant',id);f.set('action',op);return f;};
 return{calls,form,action:action.boundedReceiveAction,html:(state='ready',can_receive=true)=>renderToStaticMarkup(panel.BoundedPanel({grants:[{id,state,kind:'gmail',expires_at:'2030-01-01',can_receive}]})),load};
}
test('ready grant shows one receive button, no ordinary write/apply/send controls',()=>{const h=fixture().html();assert.equal((h.match(/Geselecteerd item eenmaal ontvangen/g)??[]).length,1);assert.doesNotMatch(h,/contact_decide|compose|send|external_id|FAKE_SUBJECT/);});
for(const state of ['claimed','done','cancelled','attention'])test(state+' has no receive button',()=>{assert.doesNotMatch(fixture().html(state),/Geselecteerd item eenmaal ontvangen/);});
test('expired or revoked ready grant has no receive button',()=>assert.doesNotMatch(fixture().html('ready',false),/Geselecteerd item eenmaal ontvangen/));
test('separate flag disabled stops before account/database/provider work',async()=>{const f=fixture({enabled:false});await assert.rejects(f.action(f.form()),/uitgeschakeld/);assert.deepEqual(f.calls,[]);});
test('main flag disabled also stops before work',async()=>{const f=fixture({main:false});await assert.rejects(f.action(f.form()),/uitgeschakeld/);assert.deepEqual(f.calls,[]);});
test('forged action and ordinary member cannot dispatch',async()=>{const f=fixture();await assert.rejects(f.action(f.form('send')),/velden/);assert.ok(!f.calls.some(x=>x.op==='dispatch'));const m=fixture({role:'member'});await assert.rejects(m.action(m.form()),/velden/);assert.ok(!m.calls.some(x=>x.op==='dispatch'));});
test('active tenant is used, posted tenant cannot override it',async()=>{const f=fixture(),form=f.form();form.set('p_org','OTHER');await assert.rejects(f.action(form),/REDIRECT/);const rpc=f.calls.find(x=>x.op==='crm_bounded_owner')?.data as{p_org:string};assert.equal(rpc.p_org,id);});
test('stop only calls the own grant port, never provider runtime',async()=>{const f=fixture();await assert.rejects(f.action(f.form('stop')),/REDIRECT/);assert.ok(!f.calls.some(x=>x.op==='dispatch'));assert.ok(f.calls.some(x=>x.op==='crm_bounded_owner'));});
test('private database errors never appear in redirect',async()=>{const f=fixture({error:true});await assert.rejects(f.action(f.form()),e=>e instanceof Error&&e.message.includes('actie-niet-bevestigd')&&!e.message.includes('PRIVATE_ERROR'));});
