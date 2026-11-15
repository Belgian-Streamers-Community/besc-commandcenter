import 'server-only';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {isAbsolute,relative,sep} from 'node:path';
import {z} from 'zod';
import {createAdminClient} from './supabase/admin';
import {crmConnection,receiveCrmPage,sendCrmMail,type CrmServer} from './crm-communication';
import {crmGoogleProvider} from './crm-google-provider';

const binding=z.object({connection_id:z.string().uuid(),client_id:z.string().min(1),client_secret:z.string().min(1),refresh_token:z.string().min(1)}).strict();
export async function readCrmCredentialBinding(connectionId:string){
 const configured=process.env.BESC_CRM_GOOGLE_CONFIG_FILE;
 if(!configured||!isAbsolute(configured))throw Error('crm_private_configuration_required');
 const file=await realpath(configured),root=await realpath(process.cwd()),inside=relative(root,file);
 if(!(inside==='..'||inside.startsWith('..'+sep)||isAbsolute(inside)))throw Error('crm_private_configuration_outside_app_required');
 const info=await lstat(configured);if(!info.isFile()||info.isSymbolicLink()||info.size>50000||process.platform!=='win32'&&(info.mode&0o077)!==0)throw Error('crm_private_configuration_permissions');
 const config=z.object({bindings:z.array(binding).min(1).max(20)}).strict().parse(JSON.parse(await readFile(file,'utf8')));
 const matches=config.bindings.filter(x=>x.connection_id===connectionId);if(matches.length!==1)throw Error('crm_explicit_binding_required');return matches[0];
}
type OwnerPort=(action:string,connection:string,data:Record<string,unknown>)=>Promise<unknown>;
// Only a signed-in owner's port can authorize a target. All privileged operations
// still recheck the initiating session and connection ACL in the database.
export async function dispatchCrmOperation(kind:'receive'|'send',object:string,connection:string,owner:OwnerPort){
 if(process.env.BESC_CRM_COMMUNICATION_ENABLED!=='true')throw Error('crm_disabled');
 z.string().uuid().parse(object);z.string().uuid().parse(connection);
 const authorize=()=>owner('authorize',connection,kind==='receive'?{run_id:object}:{job_id:object});
 await authorize();
 const admin=createAdminClient();
 const server:CrmServer=async(action,id,data={})=>{
  await authorize();const {data:answer,error}=await admin.rpc('crm_communication_server',{p_action:action,p_object:id,p_data:data});
  if(error)throw Error('crm_storage_not_confirmed');return answer;
 };
 const initial=z.object({connection:crmConnection}).passthrough().parse(await server(kind==='receive'?'run_read':'mail_read',object));
 if(initial.connection.id!==connection)throw Error('crm_connection_mismatch');
 const state=(initial as Record<string,unknown>)[kind==='receive'?'run':'job'] as {state:string};
 if(state.state!==(kind==='receive'?'ready':'approved'))return{state:state.state};
 const credentials=await readCrmCredentialBinding(connection);
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:credentials.client_id,client_secret:credentials.client_secret,refresh_token:credentials.refresh_token,grant_type:'refresh_token'}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok){await response.body?.cancel();throw Error('crm_credentials_unavailable');}
 const token=z.object({access_token:z.string().min(1).max(10000),scope:z.string().max(2000)}).parse(await response.json());
 const provider=crmGoogleProvider({token:token.access_token,scopes:token.scope.split(' ')},fetch,true);
 try{return kind==='receive'?await receiveCrmPage(object,server,provider,true):await sendCrmMail(object,server,provider,true);}
 catch{if(kind==='receive')await server('run_attention',object,{revision:((initial as Record<string,unknown>).run as {revision:number}).revision});throw Error('crm_operation_not_confirmed');}
}
