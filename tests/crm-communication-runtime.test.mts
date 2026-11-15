import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as kernel from '../src/lib/crm-communication.ts';
const appRoot=resolve('crm-app-fixture'),privateFile=resolve('crm-private-fixture','config.json');
const native=createRequire(import.meta.url),id='11111111-1111-4111-8111-111111111111';
function fixture(options:{enabled?:boolean;path?:string;mode?:number;duplicates?:boolean;done?:boolean}={}){
 const calls:string[]=[],binding={connection_id:id,client_id:'fixture-client',client_secret:'fixture-private',refresh_token:'fixture-refresh'};
 const mocks:Record<string,unknown>={'server-only':{},'./crm-communication':kernel,'./crm-google-provider':{crmGoogleProvider:()=>{throw Error('No provider expected');}},'./supabase/admin':{createAdminClient:()=>({rpc:async()=>{calls.push('database');return{data:{connection:{id,organization_id:id,kind:'gmail',owner_email:'mailbox@fixture.invalid',subject_id:'subject',enabled:true,valid_until:'2030-01-01',retain_until:'2030-02-01'},job:{state:options.done?'confirmed':'approved'}},error:null};}})},'node:fs/promises':{realpath:async(path:string)=>path,lstat:async()=>({isFile:()=>true,isSymbolicLink:()=>false,size:100,mode:options.mode??0o100600}),readFile:async()=>{calls.push('private-file');return JSON.stringify({bindings:options.duplicates?[binding,binding]:[binding]});}}};
 const compiled={exports:{}};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/crm-communication-runtime.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiled,exports:compiled.exports,process:{env:{BESC_CRM_COMMUNICATION_ENABLED:options.enabled===false?'false':'true',BESC_CRM_GOOGLE_CONFIG_FILE:options.path},platform:'linux',cwd:()=>appRoot},Error,fetch:()=>{calls.push('HTTP');throw Error('No ambient HTTP');},require:(key:string)=>key in mocks?mocks[key]:native(key)});
 return{calls,api:compiled.exports as {readCrmCredentialBinding:(id:string)=>Promise<unknown>;dispatchCrmOperation:(kind:string,id:string,connection:string,owner:()=>Promise<unknown>)=>Promise<unknown>}};
}
test('CRM runtime: disabled dispatch does not authorize, read credentials, connect to database or refresh tokens',async()=>{
 const f=fixture({enabled:false});await assert.rejects(f.api.dispatchCrmOperation('send',id,id,async()=>{f.calls.push('owner');}),/disabled/);assert.deepEqual(f.calls,[]);
});
test('CRM runtime: missing explicit private binding cannot fall back to Workspace or creator credentials',async()=>{
 const f=fixture();await assert.rejects(f.api.dispatchCrmOperation('send',id,id,async()=>{}),/private_configuration_required/);assert.deepEqual(f.calls,['database']);
});
test('CRM runtime: already confirmed job causes no private-file read or refresh',async()=>{
 const f=fixture({done:true});assert.deepEqual(JSON.parse(JSON.stringify(await f.api.dispatchCrmOperation('send',id,id,async()=>{}))),{state:'confirmed'});assert.deepEqual(f.calls,['database']);
});
test('CRM runtime: config inside app, permissive file and duplicate bindings are rejected',async()=>{
 for(const options of [{path:resolve(appRoot,'config.json')},{path:resolve(appRoot,'..private','config.json')},{path:privateFile,mode:0o100644},{path:privateFile,duplicates:true}]){
  const f=fixture(options);await assert.rejects(f.api.readCrmCredentialBinding(id));assert.ok(!f.calls.includes('HTTP'));
 }
 const f=fixture({path:privateFile});assert.ok(await f.api.readCrmCredentialBinding(id));assert.deepEqual(f.calls,['private-file']);
});
