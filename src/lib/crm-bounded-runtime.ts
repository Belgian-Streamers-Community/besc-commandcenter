import 'server-only';
import {z} from 'zod';
import {createAdminClient} from './supabase/admin';
import {readCrmCredentialBinding} from './crm-communication-runtime';
import {receiveBoundedCrm,boundedGoogleProvider,type BoundedOwner} from './crm-bounded-receive';

export async function dispatchBoundedCrm(grant:string,owner:BoundedOwner){
 if(process.env.BESC_CRM_COMMUNICATION_ENABLED!=='true'||process.env.BESC_CRM_BOUNDED_RECEIVE_ENABLED!=='true')throw Error('bounded_disabled');
 return receiveBoundedCrm(grant,owner,{
  provider:async connection=>{
   const binding=await readCrmCredentialBinding(connection);
   const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:binding.client_id,client_secret:binding.client_secret,refresh_token:binding.refresh_token,grant_type:'refresh_token'}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok){await response.body?.cancel();throw Error('bounded_credentials_unavailable');}
   const token=z.object({access_token:z.string().min(1).max(10000),scope:z.string().max(2000)}).parse(await response.json());
   return boundedGoogleProvider({token:token.access_token,scopes:token.scope.split(' ')},fetch);
  },
  commit:async(id,nonce,item)=>{
   const {data,error}=await createAdminClient().rpc('crm_bounded_commit',{p_grant:id,p_nonce:nonce,p_item:item});
   if(error)throw Error('bounded_commit_not_confirmed');return data;
  },
 },true);
}
