import {createHash} from 'node:crypto';
import {z} from 'zod';

const uuid=z.string().uuid(),id=z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);
export const crmConnection=z.object({id:uuid,organization_id:uuid,kind:z.enum(['gmail','contacts']),owner_email:z.email(),subject_id:z.string().min(1),enabled:z.literal(true),valid_until:z.string(),retain_until:z.string()});
export type CrmConnection=z.infer<typeof crmConnection>;
export const contactAnswer=z.object({external_id:z.string().regex(/^people\/[A-Za-z0-9_-]{1,128}$/),source_id:z.string().min(1).max(256).nullable(),etag:z.string().min(1).max(512).nullable(),deleted:z.boolean(),names:z.array(z.string().max(180)).max(10),emails:z.array(z.email()).max(10),phones:z.array(z.string().min(1).max(50)).max(10),organizations:z.array(z.string().max(180)).max(10)}).strict().refine(x=>x.deleted||x.source_id!==null&&x.etag!==null,'CONTACT source identity required');
export const mailAnswer=z.object({external_id:id,thread_id:id,message_id:z.string().regex(/^<[^<>\r\n\s]{1,250}>$/).nullable(),subject:z.string().max(300),from:z.string().max(500),to:z.string().max(1000),date:z.string().max(100),body:z.string().max(20000),has_attachments:z.boolean(),format:z.enum(['metadata','full'])}).strict();
export type ContactAnswer=z.infer<typeof contactAnswer>;
export type MailAnswer=z.infer<typeof mailAnswer>;
export type CrmProvider={
 identity:(c:CrmConnection)=>Promise<void>;
 contacts:(page:string|null,sync:string|null)=>Promise<{items:ContactAnswer[];next_page:string|null;finish_token:string|null}>;
 thread:(thread:string,format:'metadata'|'full')=>Promise<MailAnswer[]>;
 draft:(draft:string)=>Promise<{subject:string;body:string;to:string[];cc:string[];bcc:string[]}>;
 send:(raw:string,thread:string|null)=>Promise<{id:string;thread_id:string}>;
};
export type CrmServer=(action:string,object:string,data?:Record<string,unknown>)=>Promise<unknown>;
export function crmEmailKey(value:string){const trimmed=value.trim(),at=trimmed.lastIndexOf('@');return at<0?trimmed:trimmed.slice(0,at)+'@'+trimmed.slice(at+1).toLowerCase();}
export function crmRecipientChoices(input:{central?:{id:string;email:string|null};legacy?:string|null;organization?:{id:string;email:string|null};points?:{id:string;value:string}[]}){
 const choices:{id:string;email:string;source:string}[]=[];
 if(input.central?.email)choices.push({id:input.central.id,email:input.central.email,source:'central'});
 if(input.organization?.email)choices.push({id:input.organization.id,email:input.organization.email,source:'organization'});
 for(const point of input.points??[])choices.push({id:point.id,email:point.value,source:'contact_point'});
 const stale=Boolean(input.central?.email&&input.legacy&&crmEmailKey(input.central.email)!==crmEmailKey(input.legacy));
 if(input.legacy&&!input.central?.email)choices.push({id:'legacy',email:input.legacy,source:'relationship'});
 return{choices:choices.filter(x=>z.email().safeParse(x.email).success),stale_legacy:stale,automatic_choice:null};
}
export function crmContactDiff(base:ContactAnswer|null,local:{names:string[];emails:string[];phones:string[];organizations:string[]},remote:ContactAnswer){
 const result:Record<string,{local:string[];remote:string[];state:string}>={};
 for(const key of ['names','emails','phones','organizations'] as const){
  const value=(a:string[])=>JSON.stringify([...new Set(a)].sort()),b=base?.[key]??[],l=local[key],r=remote[key];
  const state=remote.deleted?'source_deleted':value(l)===value(r)?'same':r.length===0?'keep_local':!base?'proposal':value(b)===value(r)?'keep_local':value(b)===value(l)?'proposal':'conflict';
  result[key]={local:l,remote:r,state};
 }return result;
}
export function crmMatchCandidates(email:string,people:{id:string;email:string|null}[]){return people.filter(p=>p.email&&crmEmailKey(p.email)===crmEmailKey(email)).map(p=>p.id);}
export function crmFingerprint(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function validConnection(c:CrmConnection){if(!c.enabled||Date.parse(c.valid_until)<=Date.now()||Date.parse(c.retain_until)<=Date.now()||!Number.isFinite(Date.parse(c.valid_until))||!Number.isFinite(Date.parse(c.retain_until)))throw Error('crm_connection_expired');}

// The caller must supply a transport/provider and a durable server port explicitly.
// No ambient token, HTTP request, timer or retrying mutation is installed here.
export async function receiveCrmPage(runId:string,server:CrmServer,provider:CrmProvider,enabled=false){
 if(!enabled)throw Error('crm_disabled');uuid.parse(runId);
 const read=z.object({connection:crmConnection,run:z.object({id:uuid,connection_id:uuid,selection:z.record(z.string(),z.unknown()),revision:z.number().int().nonnegative(),page_token:z.string().nullable(),finish_token:z.string().nullable(),state:z.string(),pages:z.number().int().nonnegative()})}).parse(await server('run_read',runId));
 const {connection:c,run:r}=read;validConnection(c);if(r.connection_id!==c.id||r.id!==runId)throw Error('crm_connection_mismatch');
 if(r.state!=='ready')return{state:r.state};
 await provider.identity(c);
 let page:{items:(ContactAnswer|MailAnswer)[];next_page:string|null;finish_token:string|null};
 if(c.kind==='contacts'){
  const selection=z.object({source:z.literal('CONTACT'),max_pages:z.number().int().min(1).max(100)}).strict().parse(r.selection);void selection;
  const answer=await provider.contacts(r.page_token,r.finish_token);page={...answer,items:z.array(contactAnswer).max(50).parse(answer.items)};
 }else{
  const selection=z.object({thread_ids:z.array(id).min(1).max(5),format:z.enum(['metadata','full'])}).strict().parse(r.selection);
  const index=r.page_token===null?0:Number(r.page_token);if(!Number.isInteger(index)||index<0||index>=selection.thread_ids.length)throw Error('crm_cursor_invalid');
  const items=z.array(mailAnswer).max(50).parse(await provider.thread(selection.thread_ids[index],selection.format));
  if(items.some(m=>m.thread_id!==selection.thread_ids[index]||m.format!==selection.format||selection.format==='metadata'&&m.body!==''))throw Error('crm_selection_mismatch');
  page={items,next_page:index+1<selection.thread_ids.length?String(index+1):null,finish_token:null};
 }
 if(page.next_page!==null&&page.next_page.length>4096||page.finish_token!==null&&page.finish_token.length>4096)throw Error('crm_cursor_invalid');
 // The SQL transaction stores items and checkpoint together. A lost commit answer
 // is surfaced; the next request reads the durable revision before fetching again.
 return server('run_commit',runId,{revision:r.revision,...page});
}

const frozenEmail=z.object({to_addresses:z.array(z.email()).min(1).max(25),cc_addresses:z.array(z.email()).max(25),bcc_addresses:z.array(z.email()).max(25),subject:z.string().min(2).max(300),body_text:z.string().min(2).max(20000),gmail_draft_id:z.string().nullable()});
export function crmRawMail(input:{from:string;to:string[];cc:string[];bcc:string[];subject:string;body:string;reply?:MailAnswer|null;job:string}){
 const clean=(v:string)=>{if(/[\r\n]/.test(v))throw Error('crm_invalid_header');return v;};
 z.email().parse(input.from);for(const address of [...input.to,...input.cc,...input.bcc])z.email().parse(address);uuid.parse(input.job);
 const headers=[`From: ${clean(input.from)}`,`To: ${input.to.map(clean).join(', ')}`,
  ...(input.cc.length?[`Cc: ${input.cc.map(clean).join(', ')}`]:[]),...(input.bcc.length?[`Bcc: ${input.bcc.map(clean).join(', ')}`]:[]),
  `Subject: =?UTF-8?B?${Buffer.from(clean(input.subject)).toString('base64')}?=`,`Message-ID: <${input.job}@commandcenter.invalid>`];
 if(input.reply){if(!input.reply.message_id)throw Error('crm_reply_headers_missing');if(input.reply.subject!==input.subject&&'Re: '+input.reply.subject!==input.subject)throw Error('crm_reply_subject_changed');headers.push('In-Reply-To: '+clean(input.reply.message_id),'References: '+clean(input.reply.message_id));}
 headers.push('MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64');
 return Buffer.from(headers.join('\r\n')+'\r\n\r\n'+Buffer.from(input.body).toString('base64').match(/.{1,76}/g)!.join('\r\n')).toString('base64url');
}
export async function sendCrmMail(jobId:string,server:CrmServer,provider:CrmProvider,enabled=false){
 if(!enabled)throw Error('crm_disabled');uuid.parse(jobId);
 const {job,connection:c}=z.object({connection:crmConnection,job:z.object({id:uuid,connection_id:uuid,state:z.string(),snapshot:z.object({from:z.email(),email:frozenEmail,reply:mailAnswer.nullable()})})}).parse(await server('mail_read',jobId));
 validConnection(c);if(job.id!==jobId||job.connection_id!==c.id||c.kind!=='gmail'||job.snapshot.from!==c.owner_email)throw Error('crm_connection_mismatch');
 if(job.state!=='approved')return{state:job.state};
 const claim=z.object({state:z.string(),nonce:uuid.optional()}).parse(await server('mail_claim',jobId));
 if(claim.state!=='claimed'||!claim.nonce)return{state:claim.state};const nonce=uuid.parse(claim.nonce),email=job.snapshot.email;
 let raw:string;
 try{
  await provider.identity(c);
  if(email.gmail_draft_id){
   const draft=await provider.draft(email.gmail_draft_id);
   if(crmFingerprint(draft)!==crmFingerprint({subject:email.subject,body:email.body_text,to:email.to_addresses,cc:email.cc_addresses,bcc:email.bcc_addresses}))throw Error('crm_draft_changed');
  }
  raw=crmRawMail({from:c.owner_email,to:email.to_addresses,cc:email.cc_addresses,bcc:email.bcc_addresses,subject:email.subject,body:email.body_text,reply:job.snapshot.reply,job:jobId});
 }catch{await server('mail_block',jobId,{nonce});return{state:'blocked'};}
 try{
  await server('mail_dispatch',jobId,{nonce});
  // Send the frozen MIME, never the mutable external draft: a concurrent Gmail
  // editor cannot substitute recipients/content between preflight and sending.
  const receipt=z.object({id,thread_id:id}).strict().parse(await provider.send(raw,job.snapshot.reply?.thread_id??null));
  await server('mail_complete',jobId,{nonce,receipt});return{state:'confirmed'};
 }catch{
  try{await server('mail_uncertain',jobId,{nonce});return{state:'uncertain'};}catch{
   return z.object({state:z.string()}).parse(await server('mail_status',jobId));
  }
 }
}
