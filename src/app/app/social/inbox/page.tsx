import {AppShell} from '@/components/app-shell';
import {SocialInboxView} from '@/components/social-inbox-view';
import {requirePermission} from '@/lib/auth-context';
import {inboxRow,inboxDetail} from '@/lib/social-inbox';
import {z} from 'zod';
import Link from 'next/link';
import './social-inbox.css';
import {randomUUID} from 'node:crypto';
import {InboxControls} from '@/components/inbox-controls';
import {inboxReceiveEnabled,inboxChoices,syncRow,syncDetail,type InboxChoice,type SyncRow,type SyncDetail} from '@/lib/inbox-control';

export default async function SocialInboxPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 if(process.env.BESC_SOCIAL_INBOX_ENABLED!=='true')return <AppShell active="Social planning"><header className="topbar"><h1>Socialinbox</h1></header><div className="module-body"><p>De socialinbox is nog niet ingeschakeld.</p><Link href="/app/social">Naar social planning</Link></div></AppShell>;
 const {supabase,membership}=await requirePermission('manageInbox');
 const raw=await searchParams;
 const parsed=z.object({status:z.enum(['','open','in_progress','waiting','resolved']).optional(),platform:z.enum(['','facebook','instagram']).optional(),mine:z.enum(['true']).optional(),before:z.uuid().optional(),thread:z.uuid().optional(),messages_before:z.uuid().optional(),events_before:z.string().regex(/^[1-9][0-9]{0,14}$/).optional(),sync_job:z.uuid().optional(),sync_before:z.uuid().optional(),sync_events_before:z.string().regex(/^[1-9][0-9]{0,14}$/).optional()}).safeParse(raw);
 const query=parsed.success?parsed.data:{};
 let error=parsed.success?raw.fout:'velden',rows:z.infer<typeof inboxRow>[]=[],detail:z.infer<typeof inboxDetail>|null=null,members:{id:string;name:string}[]=[];
 const rpc=async(action:string,thread:string|null=null,data:Record<string,unknown>={})=>{const answer=await supabase.rpc('social_inbox_owner',{p_org:membership.organization_id,p_action:action,p_thread:thread,p_data:data});if(answer.error)throw Error('social_inbox_unavailable');return answer.data;};
 try{
  rows=z.array(inboxRow).max(26).parse(await rpc('list',null,query));
  members=z.array(z.object({id:z.uuid(),name:z.string()})).parse(await rpc('members'));
  if(query.thread)detail=inboxDetail.parse(await rpc('read',query.thread,query));
 }catch{error='controle';rows=[];detail=null;members=[];}
 const receive=inboxReceiveEnabled(process.env);let syncError=false,choices:InboxChoice[]=[],syncRows:SyncRow[]=[],sync:SyncDetail|null=null;
 if(receive)try{
  if(!parsed.success)throw Error('invalid_query');
  const owner=async(action:string,job:string|null=null,data:Record<string,unknown>={})=>{
   const r=await supabase.rpc('inbox_sync_owner',{p_org:membership.organization_id,p_action:action,p_job:job,p_data:data});if(r.error)throw Error('inbox_unavailable');return r.data;
  };
  const accounts=z.array(z.object({id:z.uuid(),platform:z.enum(['facebook','instagram']),external_account_id:z.string()})).max(201).parse(await owner('accounts'));
  if(accounts.length>200)throw Error('account_limit');
  try{choices=inboxChoices(process.env.BESC_SOCIAL_INBOX_SELECTIONS,membership.organization_id).filter(c=>accounts.some(a=>a.id===c.target.account_id&&a.platform===c.target.platform&&a.external_account_id===c.target.external_account_id));}catch{syncError=true;choices=[];}
  syncRows=z.array(syncRow).max(51).parse(await owner('list',null,{before:query.sync_before}));
  if(query.sync_job){sync=syncDetail.parse(await owner('read',query.sync_job,{events_before:query.sync_events_before}));if(sync.id!==query.sync_job||sync.selection.organization_id!==membership.organization_id||sync.account_id!==sync.selection.account_id)throw Error('inbox_mismatch');}
 }catch{syncError=true;choices=[];syncRows=[];sync=null;}
 const notice=raw.sync_result;
 const verifiedNotice=sync&&(
  notice===sync.state||notice==='created'&&sync.state==='pending'&&sync.attempts===0||notice==='restarted'&&sync.state==='pending'&&sync.revision>0||['unconfirmed','skipped'].includes(notice??'')
 )?notice:undefined;
 return <AppShell active="Social planning"><InboxControls enabled={receive} choices={choices} rows={syncRows} detail={sync} request={randomUUID()} before={query.sync_before} eventsBefore={query.sync_events_before} feedback={verifiedNotice} error={syncError||raw.sync_error==='1'}/><SocialInboxView rows={rows} detail={detail} members={members} filters={query} error={error} success={raw.succes==='opgeslagen'&&!error}/></AppShell>;
}
