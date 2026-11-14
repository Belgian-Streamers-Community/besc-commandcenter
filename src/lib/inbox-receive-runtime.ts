import 'server-only';
import {z} from 'zod';
import {createAdminClient} from './supabase/admin';
import {usableMetaCredentials} from './meta-integration';
import {createResumableInboxReader} from './resumable-inbox-page';
import {runInboxStep} from './resumable-inbox-worker';
import {inboxReceiveEnabled,inboxChoices,syncDetail,type OwnerPort} from './inbox-control';
import {metaInboxSelection} from './meta-inbox-protocol';

// One explicit page per user action. No timer, cron or provider write method.
export async function executeInboxPage(job:string,organization:string,owner:OwnerPort){
 if(!inboxReceiveEnabled(process.env))throw Error('inbox_disabled');
 z.uuid().parse(job);z.uuid().parse(organization);
 const choices=inboxChoices(process.env.BESC_SOCIAL_INBOX_SELECTIONS,organization);
 const config=z.object({apiVersion:z.string().regex(/^v\d+\.\d+$/),appId:z.string().regex(/^\d{1,64}$/),appSecret:z.string().min(1)}).parse({apiVersion:process.env.META_GRAPH_API_VERSION,appId:process.env.META_APP_ID,appSecret:process.env.META_APP_SECRET});
 const signature=(v:unknown)=>JSON.stringify(metaInboxSelection.parse(v));
 async function authorize(){
  const detail=syncDetail.parse(await owner('read',job));
  if(detail.id!==job||detail.selection.organization_id!==organization||detail.account_id!==detail.selection.account_id||detail.api_version!==config.apiVersion||!choices.some(c=>signature(c.target)===signature(detail.selection)))throw Error('inbox_access_denied');
  return detail;
 }
 const pinned=await authorize(),admin=createAdminClient();
 const result=await runInboxStep(job,{
  server:async(id,action,data={})=>{
   if(id!==job)throw Error('inbox_job_mismatch');await authorize();
   const r=await admin.rpc('inbox_sync_server',{p_job:job,p_action:action,p_data:data});if(r.error)throw Error('inbox_state_not_confirmed');
   if(action==='claim'&&r.data?.state==='processing'){
    if(r.data.id!==job||signature(r.data.target)!==signature(pinned.selection))throw Error('inbox_account_mismatch');
   }
   return r.data;
  },
  credentials:async(account)=>{
   await authorize();if(account!==pinned.account_id)throw Error('inbox_account_mismatch');
   return(await usableMetaCredentials(account)).access_token;
  },
  reader:createResumableInboxReader(config,fetch,true),
 },true);
 return{state:result.state,inserted:result.inserted,recovered:result.recovered===true};
}
