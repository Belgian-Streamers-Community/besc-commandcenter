'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireActiveMembership} from '@/lib/auth-context';
import {dispatchBoundedCrm} from '@/lib/crm-bounded-runtime';

export async function boundedReceiveAction(form:FormData){
 if(process.env.BESC_CRM_COMMUNICATION_ENABLED!=='true'||process.env.BESC_CRM_BOUNDED_RECEIVE_ENABLED!=='true')redirect('/app/communicatie?fout=crm-uitgeschakeld');
 const {supabase,membership}=await requireActiveMembership();
 const parsed=z.object({grant:z.uuid(),action:z.enum(['receive','stop'])}).safeParse(Object.fromEntries(form));
 if(!parsed.success||!['admin','board'].includes(membership.role))redirect('/app/communicatie/werkruimte?fout=velden');
 let failed=false;
 const owner=async(action:'claim'|'check'|'status'|'stop',grant:string)=>{
  const {data,error}=await supabase.rpc('crm_bounded_owner',{p_org:membership.organization_id,p_action:action,p_grant:grant});
  if(error)throw Error('bounded_access_not_confirmed');return data;
 };
 try{if(parsed.data.action==='receive')await dispatchBoundedCrm(parsed.data.grant,owner);else await owner('stop',parsed.data.grant);}catch{failed=true;}
 revalidatePath('/app/communicatie/werkruimte');
 redirect('/app/communicatie/werkruimte'+(failed?'?fout=actie-niet-bevestigd':''));
}
