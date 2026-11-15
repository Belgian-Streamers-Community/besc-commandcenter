import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {z} from 'zod';
import {newsletterHtml} from './newsletter-html.ts';
import {isManager, type MembershipAccess} from './permissions.ts';

// Local acceptance kernel. No network, environment configuration or privileged DB client.
// The authenticated actor must be supplied by the host, never by a public form.
export type NewsletterActor = {id:string; organizationId:string; membership:MembershipAccess};
type Subscriber = {id:string; email:string; status:'subscribed'|'unsubscribed'|'bounced'; revision:number; consentAt:number|null; consentVersion:string|null};
type Confirmation = {digest:string; kind:'subscribe'|'unsubscribe'; email:string; expires:number; used:boolean; created:number; ip:string};
type Edition = {id:string; title:string; subject:string; body:string; publicArchive:boolean; revision:number; author:string; requestedBy:string|null; approvedBy:string|null; seal:string|null; status:'draft'|'pending_approval'|'changes_requested'|'approved'|'sending'|'attention'|'sent'; recipients:{id:string; revision:number}[]; sentAt:number|null};
export type NewsletterMail = {id:string; kind:'confirmation'|'edition'; to:string; subject:string; text:string; html:string; editionId:string|null; subscriberId:string|null; subscriberRevision:number|null; confirmationDigest:string|null; status:'queued'|'dispatching'|'sent'|'unknown'|'rejected'|'skipped'; receipt:string|null};
export type NewsletterState = {version:1; organizationId:string; list:{id:string; name:string; paused:boolean}; subscribers:Subscriber[]; confirmations:Confirmation[]; editions:Edition[]; outbox:NewsletterMail[]; audit:{at:number; event:string; actor:string|null; object:string}[]};
export type NewsletterTransaction = <T>(operation:(state:NewsletterState)=>T)=>Promise<T>;
export type MockNewsletterProvider = {mode:'mock'; send:(mail:Readonly<NewsletterMail>)=>Promise<{status:'accepted'; receipt:string}|{status:'rejected'}>};
export const newsletterConsentVersion = 'besc-newsletter-local-v1';
const genericRequest = {accepted:true} as const;
export const digest = (value:string) => createHash('sha256').update(value).digest('hex');
const clean = z.string().trim().min(2).max(300).refine(x=>!/[\r\n]/.test(x));
const editionInput = z.object({title:clean,subject:clean,body:z.string().trim().min(2).max(30000).refine(x=>!/{{[^}]+}}/.test(x)),publicArchive:z.boolean()}).strict();
const address = z.string().trim().toLowerCase().email().max(254);
const fail = (message:string):never => {throw new Error(message);};
function authorize(s:NewsletterState,actor:NewsletterActor) {
  if(!actor.id||actor.organizationId!==s.organizationId||!isManager(actor.membership)) fail('newsletter_forbidden');
}
function audit(s:NewsletterState,at:number,event:string,object:string,actor:string|null=null) {s.audit.push({at,event,object,actor});}
function seal(e:Edition) {return digest(JSON.stringify([e.title,e.subject,e.body,e.publicArchive,e.revision,e.recipients]));}
function edition(s:NewsletterState,id:string) {return s.editions.find(e=>e.id===id)??fail('newsletter_not_found');}
function addMail(s:NewsletterState,mail:Omit<NewsletterMail,'id'|'status'|'receipt'>) {
  s.outbox.push({...mail,id:randomUUID(),status:'queued',receipt:null});
}
export function emptyNewsletterState():NewsletterState {
  return {version:1,organizationId:'newsletter-fixture-org',list:{id:'newsletter-fixture-list',name:'TESTFIXTURE — NIET PUBLICEREN',paused:false},subscribers:[],confirmations:[],editions:[],outbox:[],audit:[]};
}

export class NewsletterChain {
  private readonly origin:string;
  private tx:NewsletterTransaction;
  private now:()=>number;
  constructor(tx:NewsletterTransaction,origin:string,now=()=>Date.now()) {
    this.tx=tx;this.now=now;
    const url=new URL(origin);
    if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash) fail('newsletter_local_origin_required');
    this.origin=url.origin;
  }

  async request(kind:'subscribe'|'unsubscribe',input:{email:string; consent?:boolean; website?:string},ip:string) {
    if(!['subscribe','unsubscribe'].includes(kind)) fail('newsletter_invalid_action');
    const email=address.parse(input.email);
    // Local acceptance uses reserved, undeliverable addresses only.
    if(!email.endsWith('@example.invalid')) fail('newsletter_fixture_address_required');
    if(kind==='subscribe'&&input.consent!==true) fail('newsletter_consent_required');
    if(input.website)return genericRequest;
    const now=this.now(),raw=randomBytes(32).toString('base64url'),tokenHash=digest(raw),ipHash=digest(ip);
    await this.tx(s=>{
      const recent=s.confirmations.filter(r=>r.kind===kind&&r.created>now-3600000);
      if(kind==='subscribe'&&s.list.paused||recent.filter(r=>r.ip===ipHash).length>=5||recent.filter(r=>r.email===email).length>=3)return;
      const subscriber=s.subscribers.find(x=>x.email===email);
      if(kind==='subscribe'&&subscriber?.status==='subscribed'||kind==='unsubscribe'&&(!subscriber||subscriber.status!=='subscribed'))return;
      if(recent.some(r=>r.email===email&&r.kind===kind&&!r.used&&r.expires>now))return;
      // A new request invalidates all earlier requests for this address and action.
      for(const r of s.confirmations)if(r.email===email&&r.kind===kind)r.used=true;
      s.confirmations.push({digest:tokenHash,kind,email,expires:now+86400000,used:false,created:now,ip:ipHash});
      const url=`${this.origin}/bevestigen?token=${raw}`;
      const subject=kind==='subscribe'?'Bevestig je inschrijving':'Bevestig je uitschrijving';
      addMail(s,{kind:'confirmation',to:email,subject,text:`TESTFIXTURE — NIET PUBLICEREN\n${subject}: ${url}\nDeze link is 24 uur geldig. Niet aangevraagd? Negeer dit bericht.`,html:'',editionId:null,subscriberId:null,subscriberRevision:null,confirmationDigest:tokenHash});
      audit(s,now,`${kind}_requested`,tokenHash);
    });
    return genericRequest;
  }

  async confirm(token:string):Promise<{confirmed:boolean;kind?:'subscribe'|'unsubscribe'}> {
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))return {confirmed:false};
    const now=this.now();
    return this.tx(s=>{
      const r=s.confirmations.find(r=>r.digest===digest(token));
      if(!r||r.used||r.expires<=now||r.kind==='subscribe'&&s.list.paused)return {confirmed:false};
      r.used=true;
      let subscriber=s.subscribers.find(x=>x.email===r.email);
      if(r.kind==='subscribe'){
        if(!subscriber){subscriber={id:randomUUID(),email:r.email,status:'unsubscribed',revision:0,consentAt:null,consentVersion:null};s.subscribers.push(subscriber);}
        subscriber.status='subscribed';subscriber.consentAt=now;subscriber.consentVersion=newsletterConsentVersion;subscriber.revision++;
      } else if(subscriber){subscriber.status='unsubscribed';subscriber.revision++;}
      // Also invalidate opposite-action links so an older subscribe link cannot undo opt-out.
      for(const other of s.confirmations)if(other.email===r.email)other.used=true;
      audit(s,now,r.kind==='subscribe'?'subscription_confirmed':'unsubscription_confirmed',subscriber?.id??r.digest);
      return {confirmed:true,kind:r.kind};
    });
  }

  async save(actor:NewsletterActor,input:z.infer<typeof editionInput>,id?:string,revision?:number) {
    const parsed=editionInput.parse(input);
    return this.tx(s=>{
      authorize(s,actor);const now=this.now();
      if(id){
        const e=edition(s,id);
        if(e.revision!==revision)fail('newsletter_revision_conflict');
        if(!['draft','changes_requested','pending_approval','approved'].includes(e.status))fail('newsletter_not_editable');
        Object.assign(e,parsed,{author:actor.id,revision:e.revision+1,status:'draft',seal:null,approvedBy:null,requestedBy:null,recipients:[]});
        audit(s,now,'edition_edited_approval_reset',e.id,actor.id);return e.id;
      }
      const e:Edition={...parsed,id:randomUUID(),revision:1,author:actor.id,requestedBy:null,approvedBy:null,seal:null,status:'draft',recipients:[],sentAt:null};
      s.editions.push(e);audit(s,now,'edition_created',e.id,actor.id);return e.id;
    });
  }

  async submit(actor:NewsletterActor,id:string,revision:number) {
    return this.tx(s=>{
      authorize(s,actor);const e=edition(s,id);
      if(e.revision!==revision||!['draft','changes_requested'].includes(e.status))fail('newsletter_revision_conflict');
      const recipients=s.subscribers.filter(x=>x.status==='subscribed'&&x.consentAt!==null&&x.consentVersion===newsletterConsentVersion);
      if(s.list.paused||!recipients.length||recipients.length>100)fail('newsletter_audience_unavailable');
      e.recipients=recipients.map(x=>({id:x.id,revision:x.revision})).sort((a,b)=>a.id.localeCompare(b.id));
      e.status='pending_approval';e.requestedBy=actor.id;e.seal=seal(e);
      audit(s,this.now(),'approval_requested',id,actor.id);
    });
  }

  async review(actor:NewsletterActor,id:string,revision:number,decision:'approve'|'changes_requested') {
    return this.tx(s=>{
      authorize(s,actor);const e=edition(s,id);
      if(!['approve','changes_requested'].includes(decision))fail('newsletter_invalid_action');
      if(e.status!=='pending_approval'||e.revision!==revision||e.seal!==seal(e))fail('newsletter_revision_conflict');
      if(actor.id===e.requestedBy||actor.id===e.author)fail('newsletter_independent_reviewer_required');
      e.status=decision==='approve'?'approved':'changes_requested';e.approvedBy=decision==='approve'?actor.id:null;
      audit(s,this.now(),decision==='approve'?'edition_approved':'changes_requested',id,actor.id);
    });
  }

  async queue(actor:NewsletterActor,id:string) {
    return this.tx(s=>{
      authorize(s,actor);const e=edition(s,id);
      if(['sending','attention','sent'].includes(e.status))return; // Repeated button press is harmless.
      if(s.list.paused||e.status!=='approved'||!e.approvedBy||e.seal!==seal(e))fail('newsletter_not_approved');
      for(const recipient of e.recipients){
        const subscriber=s.subscribers.find(x=>x.id===recipient.id);
        if(!subscriber||subscriber.status!=='subscribed'||subscriber.revision!==recipient.revision)continue;
        const unsubscribe=`${this.origin}/uitschrijven`;
        addMail(s,{kind:'edition',to:subscriber.email,subject:e.subject,text:`${e.body}\n\nUitschrijven: ${unsubscribe}`,html:newsletterHtml({title:e.title,bodyText:e.body,unsubscribeUrl:unsubscribe}),editionId:id,subscriberId:subscriber.id,subscriberRevision:subscriber.revision,confirmationDigest:null});
      }
      e.status='sending';audit(s,this.now(),'edition_queued',id,actor.id);this.settle(s,id);
    });
  }

  private settle(s:NewsletterState,id:string) {
    const e=edition(s,id),jobs=s.outbox.filter(m=>m.editionId===id);
    if(jobs.some(m=>m.status==='dispatching'||m.status==='queued'))return;
    if(jobs.some(m=>m.status==='unknown'||m.status==='rejected')||!jobs.some(m=>m.status==='sent')){e.status='attention';return;}
    e.status='sent';e.sentAt=this.now();audit(s,this.now(),'edition_sent',id);
  }

  async dispatch(actor:NewsletterActor,provider:MockNewsletterProvider) {
    if(provider.mode!=='mock')fail('newsletter_mock_provider_required');
    const mail=await this.tx(s=>{
      authorize(s,actor);
      for(const m of s.outbox.filter(x=>x.status==='queued')){
        if(m.editionId){
          if(s.list.paused)continue;
          const e=edition(s,m.editionId),subscriber=s.subscribers.find(x=>x.id===m.subscriberId);
          if(!subscriber||subscriber.status!=='subscribed'||subscriber.revision!==m.subscriberRevision){m.status='skipped';audit(s,this.now(),'delivery_suppressed',m.id);this.settle(s,e.id);continue;}
          if(e.seal!==seal(e)||!e.approvedBy||!['sending','attention'].includes(e.status))fail('newsletter_not_approved');
        } else {
          const r=s.confirmations.find(x=>x.digest===m.confirmationDigest);
          if(!r||r.used||r.expires<=this.now()){m.status='skipped';continue;}
          if(s.list.paused&&r.kind==='subscribe')continue;
        }
        m.status='dispatching';audit(s,this.now(),'delivery_started',m.id,actor.id);return structuredClone(m);
      }
      return null;
    });
    if(!mail)return {processed:false};
    let result:Awaited<ReturnType<MockNewsletterProvider['send']>>|null=null;
    try{result=await provider.send(mail);if(result.status==='accepted'&&!/^mock-[a-zA-Z0-9-]{1,100}$/.test(result.receipt))result=null;}catch{/* Ambiguous: never retry automatically. */}
    await this.tx(s=>{
      const m=s.outbox.find(x=>x.id===mail.id)??fail('newsletter_delivery_missing');
      if(m.status!=='dispatching')fail('newsletter_delivery_conflict');
      m.status=result?.status==='accepted'?'sent':result?.status==='rejected'?'rejected':'unknown';
      m.receipt=result?.status==='accepted'?result.receipt:null;
      audit(s,this.now(),`delivery_${m.status}`,m.id,actor.id);
      if(m.editionId)this.settle(s,m.editionId);
    });
    return {processed:true};
  }

  async recover(actor:NewsletterActor) {
    return this.tx(s=>{
      authorize(s,actor);
      for(const m of s.outbox)if(m.status==='dispatching'){m.status='unknown';audit(s,this.now(),'delivery_interrupted',m.id,actor.id);if(m.editionId)this.settle(s,m.editionId);}
    });
  }

  async pause(actor:NewsletterActor,paused:boolean) {return this.tx(s=>{authorize(s,actor);s.list.paused=paused;audit(s,this.now(),paused?'list_paused':'list_resumed',s.list.id,actor.id);});}
  async inspect(actor:NewsletterActor) {return this.tx(s=>{authorize(s,actor);return structuredClone(s);});}
  async archive() {return this.tx(s=>s.editions.filter(e=>e.status==='sent'&&e.publicArchive).sort((a,b)=>(b.sentAt??0)-(a.sentAt??0)).map(e=>({id:e.id,title:e.title,subject:e.subject,body:e.body,sentAt:e.sentAt})));}
}
