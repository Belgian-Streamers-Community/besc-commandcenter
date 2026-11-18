import {z} from 'zod';
import {contactAnswer,mailAnswer,crmConnection} from './crm-communication.ts';
import {crmGoogleProvider} from './crm-google-provider.ts';

const external=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const boundedSelection=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('contacts'),external_id:z.string().regex(/^people\/[A-Za-z0-9_-]{1,128}$/)}).strict(),
 z.object({kind:z.literal('gmail'),external_id:external}).strict(),
]);
export type BoundedSelection=z.infer<typeof boundedSelection>;
type Credential={token:string;scopes:readonly string[]};
export function boundedGoogleProvider(credential:Credential,transport:typeof fetch){
 const identity=crmGoogleProvider(credential,transport,true).identity;
 return {identity,async read(selection:BoundedSelection){
  const s=boundedSelection.parse(selection),contacts=s.kind==='contacts';
  if(!credential.scopes.includes('https://www.googleapis.com/auth/'+(contacts?'contacts.readonly':'gmail.metadata')))throw Error('bounded_scope_required');
  const url=contacts?new URL('https://people.googleapis.com/v1/'+s.external_id):new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+s.external_id);
  if(contacts){url.searchParams.set('personFields','metadata,names,emailAddresses');url.searchParams.set('sources','READ_SOURCE_TYPE_CONTACT');url.searchParams.set('fields','resourceName,metadata(deleted,sources(type,id,etag)),names(displayName),emailAddresses(value)');}
  else{url.searchParams.set('format','metadata');for(const h of ['From','To','Subject','Date','Message-ID'])url.searchParams.append('metadataHeaders',h);url.searchParams.set('fields','id,threadId,payload(headers)');}
  let raw:unknown;
  try{
   const response=await transport(url.href,{method:'GET',headers:{Authorization:'Bearer '+credential.token},cache:'no-store',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});
   if(!response.ok){await response.body?.cancel();throw Error('http');}
   const reader=response.body?.getReader();if(!reader)throw Error('body');let text='',size=0;const decoder=new TextDecoder();
   try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>32000)throw Error('size');text+=decoder.decode(x.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}raw=JSON.parse(text);
  }catch{throw Error('bounded_provider_not_confirmed');}
  if(contacts){
   const p=z.object({resourceName:z.string(),metadata:z.object({deleted:z.boolean().optional(),sources:z.array(z.object({type:z.literal('CONTACT'),id:z.string().min(1),etag:z.string().min(1)}).strict()).length(1)}).strict(),names:z.array(z.object({displayName:z.string()}).strict()).max(10).optional(),emailAddresses:z.array(z.object({value:z.email()}).strict()).max(10).optional()}).strict().parse(raw);
   if(p.resourceName!==s.external_id||p.metadata.deleted)throw Error('bounded_selection_mismatch');
   return contactAnswer.parse({external_id:p.resourceName,source_id:p.metadata.sources[0].id,etag:p.metadata.sources[0].etag,deleted:false,names:p.names?.map(x=>x.displayName)??[],emails:p.emailAddresses?.map(x=>x.value)??[],phones:[],organizations:[]});
  }
  const m=z.object({id:external,threadId:external,payload:z.object({headers:z.array(z.object({name:z.string(),value:z.string().max(1000)}).strict()).max(5)}).strict()}).strict().parse(raw);
  if(m.id!==s.external_id)throw Error('bounded_selection_mismatch');
  const headers=new Map<string,string>();
  for(const h of m.payload.headers){const name=h.name.toLowerCase();if(!['from','to','subject','date','message-id'].includes(name)||headers.has(name))throw Error('bounded_header_mismatch');headers.set(name,h.value);}
  const h=(name:string)=>headers.get(name)??'';
  return mailAnswer.parse({external_id:m.id,thread_id:m.threadId,message_id:h('message-id')||null,subject:h('subject'),from:h('from'),to:h('to'),date:h('date'),body:'',has_attachments:false,format:'metadata'});
 }};
}

export type BoundedOwner=(action:'claim'|'check'|'status'|'stop',grant:string)=>Promise<unknown>;
type Provider=ReturnType<typeof boundedGoogleProvider>;
export async function receiveBoundedCrm(grant:string,owner:BoundedOwner,deps:{provider:(connection:string)=>Promise<Provider>;commit:(grant:string,nonce:string,item:unknown)=>Promise<unknown>;now?:()=>number},enabled=false){
 if(!enabled)throw Error('bounded_disabled');z.uuid().parse(grant);
 // Claim is durable BEFORE credentials or network work. It is never reclaimed.
 const claim=z.object({state:z.string(),nonce:z.uuid().optional(),connection:crmConnection.optional(),selection:boundedSelection.optional(),expires_at:z.string().optional()}).strict().parse(await owner('claim',grant));
 if(claim.state!=='claimed'||!claim.nonce)return{state:claim.state};
 const {nonce}=claim,c=crmConnection.parse(claim.connection),selection=boundedSelection.parse(claim.selection);
 const check=async()=>{const now=(deps.now??Date.now)(),dates=[Date.parse(claim.expires_at??''),Date.parse(c.valid_until),Date.parse(c.retain_until)];if(selection.kind!==c.kind||dates.some(d=>!Number.isFinite(d))||Math.min(...dates)<=now)throw Error('bounded_expired');await owner('check',grant);};
 try{
  await check();const provider=await deps.provider(c.id);await check();await provider.identity(c);await check();
  const item=await provider.read(selection);await check();
  return await deps.commit(grant,nonce,item);
 }catch{
  // A commit reply can be lost. Read durable status; never refetch or resend.
  try{const status=z.object({state:z.string()}).passthrough().parse(await owner('status',grant));if(status.state==='done')return{state:'done'};}catch{/* Preserve uncertain outcome. */}
  try{await owner('stop',grant);}catch{/* Expiry/revocation may already block writes. */}
  return{state:'attention'};
 }
}
