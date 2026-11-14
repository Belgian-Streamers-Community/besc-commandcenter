'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requirePermission} from '@/lib/auth-context';

export async function manageSocialInbox(form:FormData){
 const href='/app/social/inbox';
 if(process.env.BESC_SOCIAL_INBOX_ENABLED!=='true')redirect(href+'?fout=uitgeschakeld');
 const parsed=z.object({thread:z.uuid(),action:z.enum(['assign','status','note']),revision:z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),assignee:z.union([z.uuid(),z.literal('')]).optional(),status:z.enum(['open','in_progress','waiting','resolved']).optional(),note:z.string().trim().min(1).max(2000).optional()}).safeParse(Object.fromEntries(form));
 if(!parsed.success)redirect(href+'?fout=velden');
 const {supabase,membership}=await requirePermission('manageInbox');
 const d=parsed.data,payload:Record<string,unknown>={revision:d.revision};
 if(d.action==='assign')payload.assignee=d.assignee??'';
 if(d.action==='status')payload.status=d.status;
 if(d.action==='note')payload.note=d.note;
 const {error}=await supabase.rpc('social_inbox_owner',{p_org:membership.organization_id,p_action:d.action,p_thread:d.thread,p_data:payload});
 const detail=href+'?thread='+d.thread;
 if(error)redirect(detail+'&fout='+ (error.code==='40001'?'gewijzigd':'controle'));
 revalidatePath(href);redirect(detail+'&succes=opgeslagen');
}

export async function controlSocialInbox(form:FormData){
 const href='/app/social/inbox';
 const {inboxReceiveEnabled,inboxChoices,controlInbox}=await import('@/lib/inbox-control');
 if(!inboxReceiveEnabled(process.env))redirect(href+'?sync_error=1');
 const {supabase,membership}=await requirePermission('manageInbox');
 let destination=href+'?sync_error=1';
 try{
  const input=Object.fromEntries(form);
  const choices=input.operation==='start'?inboxChoices(process.env.BESC_SOCIAL_INBOX_SELECTIONS,membership.organization_id):[];
  const owner=async(action:string,job:string|null=null,data:Record<string,unknown>={})=>{
   const r=await supabase.rpc('inbox_sync_owner',{p_org:membership.organization_id,p_action:action,p_job:job,p_data:data});
   if(r.error)throw Error('inbox_control_unconfirmed');return r.data;
  };
  const result=await controlInbox(input,{enabled:true,organization:membership.organization_id,apiVersion:process.env.META_GRAPH_API_VERSION??'',choices,owner,
   step:async job=>(await import('@/lib/inbox-receive-runtime')).executeInboxPage(job,membership.organization_id,owner),
  });
  revalidatePath(href);destination=href+'?sync_job='+encodeURIComponent(result.job)+'&sync_result='+encodeURIComponent(result.status);
 }catch{destination=href+'?sync_error=1';}
 redirect(destination);
}
