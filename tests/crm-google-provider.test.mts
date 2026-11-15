import test from 'node:test';
import assert from 'node:assert/strict';
import {crmGoogleProvider} from '../src/lib/crm-google-provider.ts';
import {crmRawMail,receiveCrmPage,sendCrmMail,type CrmConnection} from '../src/lib/crm-communication.ts';
const connection:CrmConnection={id:'11111111-1111-4111-8111-111111111111',organization_id:'22222222-2222-4222-8222-222222222222',kind:'gmail',owner_email:'mailbox@fixture.invalid',subject_id:'subject1',enabled:true,valid_until:'2030-01-01',retain_until:'2030-02-01'};
const scopes=['contacts.readonly','gmail.readonly','gmail.metadata','gmail.compose'].map(s=>'https://www.googleapis.com/auth/'+s);
const mail={id:'m1',threadId:'t1',payload:{mimeType:'text/plain',headers:[{name:'Subject',value:'TESTFIXTURE'},{name:'Message-ID',value:'<msg@fixture.invalid>'},{name:'From',value:'sender@fixture.invalid'},{name:'To',value:'mailbox@fixture.invalid'}],body:{data:Buffer.from('Plain text').toString('base64url')}}};
test('CRM provider: identity and all reads use injected HTTPS transport, Bearer header and strict redirect/timeout',async()=>{
 const urls:string[]=[];
 const p=crmGoogleProvider({token:'fixture-secret',scopes},async(url,init)=>{
  const parsed=new URL(String(url));urls.push(String(url));assert.ok(['openidconnect.googleapis.com','gmail.googleapis.com','people.googleapis.com'].includes(parsed.hostname));assert.ok(!parsed.searchParams.has('access_token'));assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-secret');assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');assert.ok(init?.signal);
  if(parsed.hostname==='openidconnect.googleapis.com')return Response.json({sub:'subject1',email:connection.owner_email,email_verified:true});
  if(parsed.pathname.includes('/threads/'))return Response.json({id:'t1',messages:[mail]});
  assert.equal(parsed.searchParams.get('sources'),'READ_SOURCE_TYPE_CONTACT');assert.equal(parsed.searchParams.get('pageSize'),'50');assert.equal(parsed.searchParams.get('syncToken'),'s1');
  return Response.json({connections:[{resourceName:'people/p1',metadata:{sources:[{type:'CONTACT',id:'s',etag:'v1'}]},names:[{displayName:'TESTFIXTURE'}],emailAddresses:[{value:'person@fixture.invalid'}]}],nextSyncToken:'s2'});
 },true);
 await p.identity(connection);const messages=await p.thread('t1','full');assert.equal(messages[0].body,'Plain text');assert.equal(messages[0].message_id,'<msg@fixture.invalid>');assert.equal((await p.contacts(null,'s1')).finish_token,'s2');assert.equal(urls.length,3);
});
test('CRM provider: disabled adapter and missing scopes make zero HTTP requests',async()=>{
 let requests=0;const no:typeof fetch=async()=>{requests++;throw Error('forbidden');};assert.throws(()=>crmGoogleProvider({token:'fixture',scopes},no),/disabled/);
 const p=crmGoogleProvider({token:'fixture',scopes:[]},no,true);await assert.rejects(p.contacts(null,null),/scope/);await assert.rejects(p.thread('t1','full'),/scope/);await assert.rejects(p.send('eA',null),/scope/);assert.equal(requests,0);
});
for(const reply of [{sub:'other',email:connection.owner_email,email_verified:true},{sub:'subject1',email:'other@fixture.invalid',email_verified:true},{sub:'subject1',email:connection.owner_email,email_verified:false}])test('CRM provider: foreign or unverified OAuth identity cannot bind this mailbox '+JSON.stringify(reply),async()=>{
 const p=crmGoogleProvider({token:'fixture',scopes},async()=>Response.json(reply),true);await assert.rejects(p.identity(connection));
});
test('CRM provider: metadata mode never exposes a provider body or Bcc',async()=>{
 const p=crmGoogleProvider({token:'fixture',scopes},async()=>Response.json({id:'t1',messages:[{...mail,payload:{...mail.payload,headers:[...mail.payload.headers,{name:'Bcc',value:'private@fixture.invalid'}]}}]}),true);
 const item=(await p.thread('t1','metadata'))[0];assert.equal(item.body,'');assert.ok(!JSON.stringify(item).includes('private@fixture.invalid'));
});
test('CRM provider: HTML, scripts and tracking pixels are never rendered or fetched, attachments not downloaded',async()=>{
 let reads=0;const p=crmGoogleProvider({token:'fixture',scopes},async()=>{reads++;return Response.json({id:'t1',messages:[{...mail,payload:{headers:mail.payload.headers,parts:[{mimeType:'text/html',body:{data:Buffer.from('<script>alert(1)</script><img src="https://tracking.invalid/">').toString('base64url')}},{filename:'private.pdf',body:{attachmentId:'no-download'}}]}}]});},true);
 const item=(await p.thread('t1','full'))[0];assert.equal(item.body,'');assert.equal(item.has_attachments,true);assert.equal(reads,1);assert.ok(!JSON.stringify(item).includes('tracking.invalid'));
});
for(const response of [()=>new Response('fixture-secret',{status:403}),()=>new Response('not-json'),()=>new Response('x'.repeat(1_000_001))])test('CRM provider: refused, invalid or oversized responses disclose no token',async()=>{
 const p=crmGoogleProvider({token:'fixture-secret',scopes},async()=>response(),true);await assert.rejects(p.identity(connection),e=>e instanceof Error&&e.message==='crm_provider_not_confirmed');
});
test('CRM provider: wrong thread, ambiguous CONTACT source or missing final checkpoint fail closed',async()=>{
 for(const body of [{connections:[{resourceName:'people/p',metadata:{sources:[]}}],nextSyncToken:'next'},{connections:[]},{connections:[{resourceName:'people/p',metadata:{sources:[{type:'CONTACT',id:'one',etag:'v'},{type:'CONTACT',id:'two',etag:'v'}]}}],nextSyncToken:'next'}]){
  const p=crmGoogleProvider({token:'fixture',scopes},async()=>Response.json(body),true);await assert.rejects(p.contacts(null,null));
 }
 const p=crmGoogleProvider({token:'fixture',scopes},async()=>Response.json({id:'foreign',messages:[mail]}),true);await assert.rejects(p.thread('t1','full'),/mismatch/);
});
test('CRM provider: no Google Contacts writes are exposed; send uses immutable MIME and exact reply thread',async()=>{
 const calls:string[]=[];const p=crmGoogleProvider({token:'fixture',scopes},async(url,init)=>{calls.push(String(url));assert.equal(init?.method,'POST');assert.deepEqual(JSON.parse(String(init?.body)),{raw:'eA',threadId:'t1'});return Response.json({id:'sent',threadId:'t1'});},true);
 assert.deepEqual(await p.send('eA','t1'),{id:'sent',thread_id:'t1'});assert.ok(!('updateContact' in p));assert.ok(calls[0].endsWith('/messages/send'));
});
test('CRM provider: minimal deleted-contact tombstone keeps absence honest without inventing source identity',async()=>{
 const p=crmGoogleProvider({token:'fixture',scopes},async()=>Response.json({connections:[{resourceName:'people/deleted',metadata:{deleted:true}}],nextSyncToken:'next'}),true);
 const item=(await p.contacts(null,null)).items[0];assert.equal(item.deleted,true);assert.equal(item.source_id,null);assert.equal(item.etag,null);assert.deepEqual(item.emails,[]);
});
test('CRM MIME: Unicode headers, reply context, frozen recipients and rejection of header injection',()=>{
 const input={from:'mailbox@fixture.invalid',to:['recipient@fixture.invalid'],cc:[],bcc:['private@fixture.invalid'],subject:'TESTFIXTURE',body:'Eerste\nTweede 😀',job:connection.id};
 const raw=Buffer.from(crmRawMail({...input,reply:{external_id:'m1',thread_id:'t1',message_id:'<msg@fixture.invalid>',subject:'TESTFIXTURE',from:'',to:'',date:'',body:'',has_attachments:false,format:'full'}}),'base64url').toString('utf8');
 assert.match(raw,/In-Reply-To: <msg@fixture.invalid>/);assert.match(raw,/References: <msg@fixture.invalid>/);assert.match(raw,/Content-Transfer-Encoding: base64/);assert.match(raw,/Bcc: private@fixture.invalid/);
 assert.throws(()=>crmRawMail({...input,subject:'Unsafe\r\nBcc: attacker@fixture.invalid'}),/header/);
});
test('CRM kernel: wrong job/connection, expired configuration and malformed selections perform no provider work',async()=>{
 let work=0;const p=crmGoogleProvider({token:'fixture',scopes},async()=>{work++;throw Error('ambient');},true);
 await assert.rejects(receiveCrmPage(connection.id,async()=>({connection:{...connection,valid_until:'2000-01-01'},run:{id:connection.id,connection_id:connection.id,selection:{},revision:0,page_token:null,finish_token:null,state:'ready',pages:0}}),p,true),/expired/);
 await assert.rejects(sendCrmMail(connection.id,async()=>({connection,job:{id:connection.organization_id,connection_id:connection.id,state:'approved',snapshot:{from:connection.owner_email,email:{to_addresses:['recipient@fixture.invalid'],cc_addresses:[],bcc_addresses:[],subject:'TEST',body_text:'text',gmail_draft_id:null},reply:null}}}),p,true),/mismatch/);assert.equal(work,0);
});
