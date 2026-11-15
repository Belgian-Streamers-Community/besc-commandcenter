import {z} from 'zod';
import {contactAnswer,mailAnswer,type CrmProvider,type CrmConnection,type MailAnswer} from './crm-communication.ts';
type Credential={token:string;scopes:readonly string[]};
const external=z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);
const header=z.object({name:z.string(),value:z.string().max(5000)});
type Part={mimeType?:string;filename?:string;body?:{data?:string;attachmentId?:string};parts?:Part[]};
function textParts(part:Part,depth=0):{body:string;attachment:boolean}{
 if(depth>10)throw Error('crm_message_too_deep');
 if(part.filename||part.body?.attachmentId)return{body:'',attachment:true};
 let body='',attachment=false;
 if(part.mimeType==='text/plain'&&part.body?.data)body=Buffer.from(part.body.data,'base64url').toString('utf8');
 for(const child of part.parts??[]){const p=textParts(child,depth+1);body+=p.body;attachment||=p.attachment;}
 if(body.length>20000)throw Error('crm_message_too_large');return{body,attachment};
}
function addressList(raw:string){
 if(!raw.trim())return[];
 return raw.split(',').map(x=>{const value=x.trim().match(/<([^<>]+)>$/)?.[1]??x.trim();return z.email().parse(value);});
}
export function crmGoogleProvider(credential:Credential,transport:typeof fetch,enabled=false):CrmProvider{
 if(!enabled)throw Error('crm_provider_disabled');if(!credential.token)throw Error('crm_credential_required');
 async function json(host:'gmail'|'people'|'identity',path:string,init:RequestInit={}){
  const origins={gmail:'https://gmail.googleapis.com/gmail/v1/users/me/',people:'https://people.googleapis.com/v1/',identity:'https://openidconnect.googleapis.com/v1/'};
  try{
   const response=await transport(origins[host]+path,{...init,headers:{Authorization:'Bearer '+credential.token,...(init.body?{'Content-Type':'application/json'}:{})},cache:'no-store',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});
   if(!response.ok){await response.body?.cancel();throw Error('HTTP '+response.status);}
   const reader=response.body?.getReader();if(!reader)throw Error('No body');let size=0,text='';const decoder=new TextDecoder();
   try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1_000_000)throw Error('Oversize');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
   return JSON.parse(text) as unknown;
  }catch{throw Error('crm_provider_not_confirmed');}
 }
 function scope(name:string){if(!credential.scopes.includes('https://www.googleapis.com/auth/'+name))throw Error('crm_scope_required');}
 async function message(raw:unknown,format:'full'|'metadata'):Promise<MailAnswer>{
  const m=z.object({id:external,threadId:external,payload:z.object({headers:z.array(header).default([])}).passthrough()}).parse(raw);
  const h=(key:string)=>m.payload.headers.find(x=>x.name.toLowerCase()===key)?.value??'';
  const parts=format==='full'?textParts(m.payload as Part):{body:'',attachment:false};
  return mailAnswer.parse({external_id:m.id,thread_id:m.threadId,message_id:h('message-id')||null,subject:h('subject'),from:h('from'),to:h('to'),date:h('date'),body:parts.body,has_attachments:parts.attachment,format});
 }
 return{
  identity:async(c:CrmConnection)=>{
   const answer=z.object({sub:z.string(),email:z.email(),email_verified:z.literal(true)}).parse(await json('identity','userinfo'));
   if(answer.sub!==c.subject_id||answer.email.toLowerCase()!==c.owner_email.toLowerCase())throw Error('crm_identity_mismatch');
  },
  contacts:async(page,sync)=>{
   scope('contacts.readonly');
   const params=new URLSearchParams({personFields:'metadata,names,emailAddresses,phoneNumbers,organizations',sources:'READ_SOURCE_TYPE_CONTACT',pageSize:'50',requestSyncToken:'true'});
   if(page)params.set('pageToken',page);if(sync)params.set('syncToken',sync);
   const answer=z.object({connections:z.array(z.object({resourceName:z.string(),metadata:z.object({deleted:z.boolean().optional(),sources:z.array(z.object({type:z.string(),id:z.string(),etag:z.string()})).default([])}),names:z.array(z.object({displayName:z.string()})).optional(),emailAddresses:z.array(z.object({value:z.string()})).optional(),phoneNumbers:z.array(z.object({value:z.string()})).optional(),organizations:z.array(z.object({name:z.string()})).optional()})).max(50).default([]),nextPageToken:z.string().max(4096).optional(),nextSyncToken:z.string().max(4096).optional()}).parse(await json('people','people/me/connections?'+params));
   const items=answer.connections.map(p=>{const sources=p.metadata.sources.filter(x=>x.type==='CONTACT');if(sources.length>1||!p.metadata.deleted&&sources.length!==1)throw Error('crm_contact_source_ambiguous');const source=sources[0];return contactAnswer.parse({external_id:p.resourceName,source_id:source?.id??null,etag:source?.etag??null,deleted:p.metadata.deleted??false,names:p.names?.map(x=>x.displayName)??[],emails:p.emailAddresses?.map(x=>x.value)??[],phones:p.phoneNumbers?.map(x=>x.value)??[],organizations:p.organizations?.map(x=>x.name)??[]});});
   if(!answer.nextPageToken&&!answer.nextSyncToken)throw Error('crm_sync_checkpoint_missing');
   return{items,next_page:answer.nextPageToken??null,finish_token:answer.nextSyncToken??null};
  },
  thread:async(thread,format)=>{
   external.parse(thread);scope(format==='full'?'gmail.readonly':credential.scopes.includes('https://www.googleapis.com/auth/gmail.metadata')?'gmail.metadata':'gmail.readonly');
   const params=new URLSearchParams({format});
   if(format==='metadata')for(const name of ['Message-ID','Subject','From','To','Date'])params.append('metadataHeaders',name);
   const answer=z.object({id:external,messages:z.array(z.unknown()).max(50).default([])}).parse(await json('gmail','threads/'+thread+'?'+params));
   if(answer.id!==thread)throw Error('crm_thread_mismatch');const items=await Promise.all(answer.messages.map(x=>message(x,format)));
   if(items.some(m=>m.thread_id!==thread))throw Error('crm_thread_mismatch');return items;
  },
  draft:async(draft)=>{
   scope('gmail.compose');external.parse(draft);
   const answer=z.object({id:external,message:z.object({payload:z.object({headers:z.array(header)}).passthrough()})}).parse(await json('gmail','drafts/'+draft+'?format=full'));
   if(answer.id!==draft)throw Error('crm_draft_mismatch');const h=(key:string)=>answer.message.payload.headers.find(x=>x.name.toLowerCase()===key)?.value??'';
   const body=textParts(answer.message.payload as Part);if(body.attachment)throw Error('crm_attachments_not_supported');
   return{subject:h('subject'),body:body.body.replace(/\r\n/g,'\n'),to:addressList(h('to')),cc:addressList(h('cc')),bcc:addressList(h('bcc'))};
  },
  send:async(raw,thread)=>{
   scope('gmail.compose');if(raw.length>100000)throw Error('crm_mail_too_large');if(thread)external.parse(thread);
   const answer=z.object({id:external,threadId:external}).parse(await json('gmail','messages/send',{method:'POST',body:JSON.stringify({raw,...(thread?{threadId:thread}:{})})}));
   if(thread&&answer.threadId!==thread)throw Error('crm_reply_thread_not_confirmed');return{id:answer.id,thread_id:answer.threadId};
  },
 };
}
