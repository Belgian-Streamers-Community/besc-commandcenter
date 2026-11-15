'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {localDateTimeToIso} from '@/lib/format';
import {requireActiveMembership} from '@/lib/auth-context';
import {dispatchCrmOperation} from '@/lib/crm-communication-runtime';

export async function crmCommunicationAction(form:FormData){
 if(process.env.BESC_CRM_COMMUNICATION_ENABLED!=='true')redirect('/app/communicatie?fout=crm-uitgeschakeld');
 const context=await requireActiveMembership();
 const parsed=z.object({connection:z.string().uuid(),action:z.enum(['start','receive','send','approve','cancel_mail','cancel_run','contact_decide','contact_ignore','link_thread','freeze','compose','follow_up','resume_run','disable']),data:z.string().max(25000)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)redirect('/app/communicatie/werkruimte?fout=velden');
 const {connection,action}=parsed.data,href='/app/communicatie/werkruimte?connection='+connection;
 let failed=false;
 try{
  const data=z.record(z.string(),z.unknown()).parse(JSON.parse(parsed.data.data));
  const field=(name:string)=>String(form.get(name)??'');
  if(form.has('confirmed'))data.confirmed=field('confirmed');
  if(form.has('entity')){
   const [type,id,updated]=field('entity').split('|');data.entity_type=type;data.entity_id=id;data.expected_updated_at=updated;
   const points=z.array(z.object({id:z.string(),kind:z.string(),value:z.string(),person_id:z.string().nullable(),partner_id:z.string().nullable()}).passthrough()).parse(data.point_sets??[]);
   data.expected_points=points.filter(p=>p.person_id===id||p.partner_id===id).map(p=>({id:p.id,kind:p.kind,value:p.value})).sort((a,b)=>a.id.localeCompare(b.id));delete data.point_sets;
  }
  if(action==='start')data.selection=field('kind')==='gmail'?{thread_ids:field('threads').split(/[\s,]+/).filter(Boolean),format:field('format')}:{source:'CONTACT',max_pages:3};
  if(action==='start'&&!data.request_id)data.request_id=randomUUID();
  if(action==='contact_decide'){
   data.points=form.getAll('point').map(p=>z.object({kind:z.enum(['email','phone']),value:z.string().max(320)}).strict().parse(JSON.parse(String(p))));
   if(field('create_person')==='yes'){data.create_person='yes';data.entity_type='community_person';data.entity_id=null;data.name=field('name');}
  }
  if(action==='compose'){
   const addresses=(v:string)=>z.array(z.email()).max(25).parse(v.split(/[;,]/).map(s=>s.trim()).filter(Boolean));
   data.to=addresses(field('to'));data.cc=addresses(field('cc'));data.bcc=addresses(field('bcc'));
   data.subject=z.string().min(2).max(240).parse(field('subject'));data.body=z.string().min(2).max(20000).parse(field('body'));
  }
  if(action==='freeze'){data.email_id=field('email_id');data.reply_to=field('reply_to')||null;}
  if(action==='follow_up'){data.title=field('title');data.assignee=field('assignee');data.due_at=field('due_at')?localDateTimeToIso(field('due_at')):null;}
  const owner=async(op:string,id:string,value:Record<string,unknown>)=>{
   const {data:answer,error}=await context.supabase.rpc('crm_communication_owner',{p_org:context.membership.organization_id,p_action:op,p_object:id,p_data:value});
   if(error)throw Error('crm_state_not_confirmed');return answer;
  };
  if(action==='receive'||action==='send')await dispatchCrmOperation(action,z.string().uuid().parse(data.id),connection,owner);
  else await owner(action,connection,data);
 }catch{failed=true;}
 revalidatePath('/app/communicatie/werkruimte');
 redirect(href+(failed?'&fout=actie-niet-bevestigd':'&succes=opgeslagen'));
}
