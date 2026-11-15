import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import * as drive from '../src/lib/drive-browser.ts';
const org='11111111-1111-4111-8111-111111111111', id='22222222-2222-4222-8222-222222222222';
function load(path:string, deps:Record<string,unknown>, env:Record<string,string>={}) {
  const exports:Record<string,unknown>={};const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports','process',code)((name:string)=>{assert.ok(name in deps,name);return deps[name];},exports,{env});return exports;
}
function runtime(options:{enabled?:boolean;finance?:boolean;org?:string}={}) {
  const calls:string[]=[];
  const api=load('src/lib/drive-browser-runtime.ts',{'server-only':{},'@/lib/auth-context':{requirePermission:async(capability:string)=>{calls.push(capability);return {membership:{organization_id:org}};}},'@/lib/permissions':{hasPermission:()=>options.finance!==false},'@/lib/google-workspace':{googleAccessToken:async()=>{calls.push('token');throw Error('no live');}},'@/lib/drive-browser':drive},{BESC_DRIVE_BROWSER_ENABLED:String(options.enabled!==false),BESC_DRIVE_BROWSER_ORGANIZATION_ID:options.org??org,GOOGLE_DRIVE_ROOT_FOLDER_ID:'root',GOOGLE_SHARED_DRIVE_ID:'shared'});
  return {calls,run:api.requireDriveBrowser as ()=>Promise<unknown>};
}
test('Drive runtime: off means no auth, credentials or provider access',async()=>{const f=runtime({enabled:false});await assert.rejects(f.run());assert.deepEqual(f.calls,[]);});
test('Drive runtime: root requires organization management, finance access and explicit organization match',async()=>{
  for(const options of [{finance:false},{org:id}]){const f=runtime(options);await assert.rejects(f.run());assert.deepEqual(f.calls,['manageOrganization']);}
  const f=runtime();await f.run();assert.deepEqual(f.calls,['manageOrganization']);
});
function action(options:{enabled?:boolean;dossier?:boolean;capability?:boolean;providerError?:boolean;saveError?:boolean;shortcut?:boolean}={}) {
  const calls:unknown[][]=[];
  const query={select:(...args:unknown[])=>{calls.push(['select',...args]);return query;},eq:(...args:unknown[])=>{calls.push(['eq',...args]);return query;},is:(...args:unknown[])=>{calls.push(['is',...args]);return query;},maybeSingle:async()=>({data:options.dossier===false?null:{id},error:null}),insert:async(value:unknown)=>{calls.push(['insert',value]);return {error:options.saveError?{}:null};}};
  const api=load('src/app/app/documenten/drive-actions.ts',{'zod':{z},'next/cache':{revalidatePath:(path:string)=>calls.push(['revalidate',path])},'next/navigation':{redirect:(path:string)=>{throw Error('REDIRECT '+path);}},'@/lib/drive-browser-runtime':{requireDriveBrowser:async()=>{calls.push(['authorize']);return {supabase:{from:(table:string)=>{calls.push(['from',table]);return query;}},user:{id},membership:{organization_id:org},browser:{file:async(file:string)=>{calls.push(['file',file]);if(options.providerError)throw Error('revoked');return {id:'image',name:'Authoritative provider title',mimeType:options.shortcut?'application/vnd.google-apps.shortcut':'image/png'};}}};}},'@/lib/drive-browser':drive,'@/lib/dossier-relations':{dossierEntityTypes:['project'],dossierEntityConfig:{project:{capability:'manageProjects',table:'projects'}},dossierPath:()=>`/app/projecten/${id}`},'@/lib/permissions':{hasPermission:()=>options.capability!==false}},{BESC_DOSSIER_LINKS_ENABLED:String(options.enabled!==false)});
  const form=new FormData();form.set('file_id','image');form.set('entity_type','project');form.set('entity_id',id);form.set('name','untrusted');form.set('url','https://evil.test');
  return {calls,form,run:api.linkDriveBrowserFile as (data:FormData)=>Promise<unknown>};
}
test('Drive dossier action: verifies org, active dossier and authoritative provider data before canonical link insert',async()=>{
  const f=action();await assert.rejects(f.run(f.form),/REDIRECT.*succes/);const row=f.calls.find(c=>c[0]==='insert')?.[1] as Record<string,unknown>;assert.equal(row.label,'Authoritative provider title');assert.equal(row.url,'https://drive.google.com/file/d/image/view');assert.equal(row.link_type,'image');assert.equal(row.organization_id,org);assert.ok(f.calls.some(c=>c[0]==='eq'&&c[1]==='organization_id'&&c[2]===org));assert.ok(f.calls.some(c=>c[0]==='is'&&c[1]==='deleted_at'));assert.ok(f.calls.findIndex(c=>c[0]==='file')<f.calls.findIndex(c=>c[0]==='insert'));
});
test('Drive dossier action: off, insufficient rights, deleted dossier, revoked access and shortcut never insert',async()=>{
  for(const options of [{enabled:false},{capability:false},{dossier:false},{providerError:true},{shortcut:true}]){const f=action(options);await assert.rejects(f.run(f.form));assert.ok(!f.calls.some(c=>c[0]==='insert'));}
});
test('Drive dossier action: duplicate or failed insert never reports saved',async()=>{const f=action({saveError:true});await assert.rejects(f.run(f.form),/fout=drive-link-opslaan/);assert.ok(!f.calls.some(c=>c[0]==='revalidate'));});
test('Drive preview route: gates before authorization and returns private, noncacheable bytes or generic failure',async()=>{
  let calls=0;const deps={'@/lib/drive-browser-runtime':{requireDriveBrowser:async()=>{calls++;return {browser:{},token:()=>{}};}},'@/lib/drive-image-preview':{readDriveImagePreview:async()=>new Uint8Array([1,2,3])}};
  for(const enabled of [false,true]){
    const api=load('src/app/app/documenten/drive-preview/[id]/route.ts',deps,enabled?{BESC_DOSSIER_LINKS_ENABLED:'true',BESC_DRIVE_BROWSER_ENABLED:'true'}:{});
    // VM uses real Web Response/Uint8Array globals through new Function.
    const response=await (api.GET as (r:Request,c:unknown)=>Promise<Response>)(new Request('http://localhost'),{params:Promise.resolve({id:'image'})});assert.equal(response.status,enabled?200:404);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');
  }assert.equal(calls,1);
});
