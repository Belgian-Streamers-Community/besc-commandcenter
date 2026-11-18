'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireActiveMembership} from '@/lib/auth-context';

export async function crmReviewAction(form:FormData){
 if(process.env.BESC_CRM_COMMUNICATION_ENABLED!=='true'||process.env.BESC_CRM_REVIEW_ENABLED!=='true')redirect('/app/communicatie?fout=crm-uitgeschakeld');
 const {supabase,membership}=await requireActiveMembership();
 // React appends transport metadata; reject all other unrecognised user fields.
 const fields=Object.fromEntries([...form.entries()].filter(([key])=>!key.startsWith('$ACTION_')));
 const parsed=z.object({connection:z.uuid(),grant:z.uuid(),action:z.enum(['execute','stop']),confirmed:z.literal('yes').optional()}).strict().safeParse(fields);
 if(!parsed.success||!['admin','board'].includes(membership.role)||parsed.data.action==='execute'&&parsed.data.confirmed!=='yes')redirect('/app/communicatie/werkruimte?fout=velden');
 const {connection,grant,action}=parsed.data;
 let failed=false;
 try{const {error}=await supabase.rpc('crm_review_owner',{p_org:membership.organization_id,p_action:action,p_connection:connection,p_grant:grant});failed=Boolean(error);}catch{failed=true;}
 revalidatePath('/app/communicatie/werkruimte');
 redirect('/app/communicatie/werkruimte?connection='+connection+(failed?'&fout=actie-niet-bevestigd':'&succes=opgeslagen'));
}
