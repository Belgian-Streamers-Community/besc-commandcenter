import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {isManager,type MembershipAccess} from './permissions.ts';

export const merchFixtureOrganization='merch-fixture-org';
export type MerchActor={id:string;organizationId:string;kind:'customer'|'manager';membership?:MembershipAccess};
export type MerchVariant={id:string;product:string;label:string;priceCents:number;stock:number;available:boolean;revision:number};
type Line={variant:string;label:string;quantity:number;unitCents:number;revision:number};
type OrderStatus='awaiting_payment'|'processing'|'payment_unknown'|'paid'|'payment_failed'|'cancelled'|'refund_pending'|'refund_unknown'|'refunded';
export type MerchOrder={id:string;owner:string;key:string;requestHash:string;lines:Line[];shippingCents:number;totalCents:number;currency:'EUR';state:OrderStatus;allocation:'held'|'committed'|'released';expires:number;fulfillment:'unfulfilled'|'shipped'|'delivered'|'returned';tracking:string|null;returnState:'none'|'requested'|'approved'|'rejected'|'received';restock:boolean;created:number;updated:number};
export type MerchJob={id:string;order:string;kind:'charge'|'refund';amountCents:number;currency:'EUR';state:'queued'|'dispatching'|'unknown'|'accepted'|'rejected';receipt:string|null};
export type MerchState={version:1;organizationId:string;paused:boolean;variants:MerchVariant[];orders:MerchOrder[];jobs:MerchJob[];events:Record<string,string>;audit:{at:number;event:string;actor:string|null;object:string}[]};
export type MerchTransaction=<T>(operation:(state:MerchState)=>T)=>Promise<T>;
export const mockMerchEvent=z.object({mode:z.literal('mock'),provider:z.literal('fixture'),event:z.string().uuid(),attempt:z.string().uuid(),order:z.string().uuid(),kind:z.enum(['charge','refund']),amountCents:z.number().int().positive().max(10000000),currency:z.literal('EUR'),outcome:z.enum(['accepted','rejected']),receipt:z.string().regex(/^mock-[a-f0-9-]{1,80}$/),at:z.number().int().positive()}).strict();
export type MerchEvent=z.infer<typeof mockMerchEvent>;
export type MerchEnvelope={body:string;signature:string};
export type MerchMockProvider={mode:'mock';execute:(job:Readonly<MerchJob>)=>Promise<MerchEnvelope>;lookup:(attempt:string)=>Promise<MerchEnvelope|undefined>};
export const merchHash=(s:string)=>createHash('sha256').update(s).digest('hex');
const fail=(message:string):never=>{throw Error(message);};
const integer=z.number().int().min(1).max(10);
const cartSchema=z.array(z.object({variant:z.string().min(1).max(100),quantity:integer}).strict()).min(1).max(10);
const idempotency=z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/);
function own(s:MerchState,a:MerchActor){if(!a.id||a.organizationId!==s.organizationId)fail('merch_forbidden');}
function manager(s:MerchState,a:MerchActor){own(s,a);if(a.kind!=='manager'||!a.membership||!isManager(a.membership))fail('merch_forbidden');}
function order(s:MerchState,id:string){return s.orders.find(o=>o.id===id)??fail('merch_order_not_found');}
function access(s:MerchState,a:MerchActor,o:MerchOrder){own(s,a);if(a.kind==='manager')manager(s,a);else if(a.kind!=='customer'||o.owner!==a.id)fail('merch_forbidden');}
function audit(s:MerchState,at:number,event:string,object:string,actor:string|null=null){s.audit.push({at,event,object,actor});}
function held(s:MerchState,id:string){return s.orders.filter(o=>o.allocation==='held').reduce((sum,o)=>sum+o.lines.filter(l=>l.variant===id).reduce((n,l)=>n+l.quantity,0),0);}
function expire(s:MerchState,now:number){for(const o of s.orders)if(o.state==='awaiting_payment'&&o.expires<=now){o.state='cancelled';o.allocation='released';o.updated=now;audit(s,now,'reservation_expired',o.id);}}
function quote(s:MerchState,raw:unknown){
  if(s.paused)fail('merch_paused');const input=cartSchema.parse(raw),seen=new Set<string>();
  const lines=input.map(i=>{
    if(seen.has(i.variant))fail('merch_duplicate_variant');seen.add(i.variant);
    const v=s.variants.find(v=>v.id===i.variant)??fail('merch_variant_unavailable');
    if(!v.available||v.stock-held(s,v.id)<i.quantity)fail('merch_stock_unavailable');
    return {variant:v.id,label:`${v.product} — ${v.label}`,quantity:i.quantity,unitCents:v.priceCents,revision:v.revision};
  }).sort((a,b)=>a.variant.localeCompare(b.variant));
  const subtotalCents=lines.reduce((sum,l)=>sum+l.unitCents*l.quantity,0),shippingCents=450,totalCents=subtotalCents+shippingCents;
  if(!Number.isSafeInteger(totalCents)||totalCents>10000000)fail('merch_amount_invalid');
  return {lines,subtotalCents,shippingCents,totalCents,currency:'EUR' as const,quoteHash:merchHash(JSON.stringify([lines,shippingCents,'EUR']))};
}
export function emptyMerchState():MerchState{return {version:1,organizationId:merchFixtureOrganization,paused:false,variants:[
  {id:'fixture-shirt-m',product:'TESTFIXTURE — NIET PUBLICEREN · Shirt',label:'Zwart / M',priceCents:2500,stock:3,available:true,revision:1},
  {id:'fixture-shirt-l',product:'TESTFIXTURE — NIET PUBLICEREN · Shirt',label:'Zwart / L',priceCents:2500,stock:2,available:true,revision:1},
  {id:'fixture-mug',product:'TESTFIXTURE — NIET PUBLICEREN · Mok',label:'Proefvariant',priceCents:1200,stock:2,available:true,revision:1}
],orders:[],jobs:[],events:{},audit:[]};}

// This kernel has no payment SDK, credential loader, fetch or database client.
export class MerchChain {
  private tx:MerchTransaction;private key:Buffer;private now:()=>number;
  constructor(tx:MerchTransaction,key:Buffer,now=()=>Date.now()) {if(key.length!==32)fail('merch_fixture_key_required');this.tx=tx;this.key=Buffer.from(key);this.now=now;}
  async catalog(){return this.tx(s=>{expire(s,this.now());return {paused:s.paused,variants:s.variants.filter(v=>v.available).map(v=>({id:v.id,product:v.product,label:v.label,priceCents:v.priceCents,currency:'EUR',available:Math.max(0,v.stock-held(s,v.id))}))};});}
  async quote(actor:MerchActor,cart:unknown){return this.tx(s=>{own(s,actor);if(actor.kind!=='customer')fail('merch_forbidden');expire(s,this.now());return quote(s,cart);});}
  async checkout(actor:MerchActor,cart:unknown,key:string,quoteHash:string){
    idempotency.parse(key);const input=cartSchema.parse(cart).sort((a,b)=>a.variant.localeCompare(b.variant)),requestHash=merchHash(JSON.stringify([input,quoteHash]));
    return this.tx(s=>{
      own(s,actor);if(actor.kind!=='customer')fail('merch_forbidden');expire(s,this.now());
      const previous=s.orders.find(o=>o.owner===actor.id&&o.key===key);
      if(previous){if(previous.requestHash!==requestHash)fail('merch_idempotency_conflict');return previous.id;}
      const q=quote(s,input);if(q.quoteHash!==quoteHash)fail('merch_quote_changed');
      const now=this.now(),o:MerchOrder={id:randomUUID(),owner:actor.id,key,requestHash,lines:q.lines,shippingCents:q.shippingCents,totalCents:q.totalCents,currency:q.currency,state:'awaiting_payment',allocation:'held',expires:now+900000,fulfillment:'unfulfilled',tracking:null,returnState:'none',restock:false,created:now,updated:now};
      s.orders.push(o);audit(s,now,'order_reserved',o.id,actor.id);return o.id;
    });
  }
  async read(actor:MerchActor,id:string){return this.tx(s=>{expire(s,this.now());const o=order(s,id);access(s,actor,o);return structuredClone(o);});}
  async mine(actor:MerchActor){return this.tx(s=>{own(s,actor);if(actor.kind!=='customer')fail('merch_forbidden');expire(s,this.now());return structuredClone(s.orders.filter(o=>o.owner===actor.id));});}
  async inspect(actor:MerchActor){return this.tx(s=>{manager(s,actor);expire(s,this.now());return structuredClone(s);});}
  async pause(actor:MerchActor,paused:boolean){return this.tx(s=>{manager(s,actor);s.paused=paused;audit(s,this.now(),paused?'shop_paused':'shop_resumed','catalog',actor.id);});}
  async updateVariant(actor:MerchActor,id:string,revision:number,raw:{priceCents:number;stock:number;available:boolean}){
    const input=z.object({priceCents:z.number().int().positive().max(1000000),stock:z.number().int().min(0).max(10000),available:z.boolean()}).strict().parse(raw);
    return this.tx(s=>{manager(s,actor);expire(s,this.now());const v=s.variants.find(v=>v.id===id)??fail('merch_variant_unavailable');if(v.revision!==revision)fail('merch_revision_conflict');if(input.stock<held(s,id))fail('merch_reserved_stock');Object.assign(v,input,{revision:v.revision+1});audit(s,this.now(),'variant_updated',id,actor.id);});
  }
  async pay(actor:MerchActor,id:string){return this.tx(s=>{
    const o=order(s,id);access(s,actor,o);expire(s,this.now());
    const previous=s.jobs.find(j=>j.order===id&&j.kind==='charge');if(previous)return previous.id;
    if(s.paused||o.state!=='awaiting_payment'||o.allocation!=='held')fail('merch_payment_blocked');
    const j:MerchJob={id:randomUUID(),order:id,kind:'charge',amountCents:o.totalCents,currency:'EUR',state:'queued',receipt:null};s.jobs.push(j);o.state='processing';o.updated=this.now();audit(s,this.now(),'payment_requested',id,actor.id);return j.id;
  });}
  async cancel(actor:MerchActor,id:string){return this.tx(s=>{
    const o=order(s,id);access(s,actor,o);expire(s,this.now());
    if(o.state==='cancelled')return;
    if(o.state==='awaiting_payment'||o.state==='payment_failed'){o.state='cancelled';o.allocation='released';o.updated=this.now();audit(s,this.now(),'order_cancelled',id,actor.id);return;}
    if(o.state==='paid'&&o.fulfillment==='unfulfilled'){o.state='refund_pending';audit(s,this.now(),'paid_cancellation_requested',id,actor.id);return;}
    fail('merch_cancellation_blocked');
  });}
  async fulfill(actor:MerchActor,id:string,action:'ship'|'deliver'){
    return this.tx(s=>{manager(s,actor);const o=order(s,id);if(o.state!=='paid')fail('merch_fulfillment_blocked');
      if(action==='ship'&&o.fulfillment==='unfulfilled'){o.fulfillment='shipped';o.tracking=`TESTFIXTURE-${o.id}`;}
      else if(action==='deliver'&&o.fulfillment==='shipped')o.fulfillment='delivered';else fail('merch_fulfillment_blocked');
      o.updated=this.now();audit(s,this.now(),action==='ship'?'fixture_shipped':'fixture_delivered',id,actor.id);
    });
  }
  async requestReturn(actor:MerchActor,id:string){return this.tx(s=>{const o=order(s,id);access(s,actor,o);if(o.state!=='paid'||o.fulfillment!=='delivered'||o.returnState!=='none')fail('merch_return_blocked');o.returnState='requested';audit(s,this.now(),'return_requested',id,actor.id);});}
  async reviewReturn(actor:MerchActor,id:string,approved:boolean){return this.tx(s=>{manager(s,actor);const o=order(s,id);if(o.state!=='paid'||o.returnState!=='requested')fail('merch_return_blocked');o.returnState=approved?'approved':'rejected';audit(s,this.now(),approved?'return_approved':'return_rejected',id,actor.id);});}
  async receiveReturn(actor:MerchActor,id:string,restock:boolean){return this.tx(s=>{manager(s,actor);const o=order(s,id);if(o.state!=='paid'||o.returnState!=='approved')fail('merch_return_blocked');o.returnState='received';o.fulfillment='returned';o.restock=restock;o.state='refund_pending';audit(s,this.now(),'return_received',id,actor.id);});}
  async refund(actor:MerchActor,id:string,retryRejectedAttempt?:string){
    if(retryRejectedAttempt)z.string().uuid().parse(retryRejectedAttempt);
    return this.tx(s=>{manager(s,actor);const o=order(s,id);const previous=s.jobs.filter(j=>j.order===id&&j.kind==='refund').at(-1);
    if(previous&&(!retryRejectedAttempt||previous.id!==retryRejectedAttempt||previous.state!=='rejected'))return previous.id;
    if(retryRejectedAttempt&&!previous)fail('merch_refund_blocked');
    if(o.state!=='refund_pending')fail('merch_refund_blocked');const j:MerchJob={id:randomUUID(),order:id,kind:'refund',amountCents:o.totalCents,currency:'EUR',state:'queued',receipt:null};s.jobs.push(j);audit(s,this.now(),'refund_requested',id,actor.id);return j.id;
  });}
  async dispatch(actor:MerchActor,id:string,provider:MerchMockProvider){
    if(provider.mode!=='mock')fail('merch_mock_provider_required');
    const job=await this.tx(s=>{manager(s,actor);const j=s.jobs.find(j=>j.id===id)??fail('merch_job_not_found');
      if(j.state!=='queued')return null;if(s.paused&&j.kind==='charge')fail('merch_paused');
      j.state='dispatching';audit(s,this.now(),'provider_attempt_started',id,actor.id);return structuredClone(j);
    });
    if(!job)return {processed:false};
    try {const answer=await provider.execute(job);await this.applyEvent(answer);}
    catch {await this.tx(s=>{const j=s.jobs.find(j=>j.id===id)??fail('merch_job_not_found');if(j.state==='dispatching'){j.state='unknown';const o=order(s,j.order);o.state=j.kind==='charge'?'payment_unknown':'refund_unknown';audit(s,this.now(),'provider_outcome_unknown',id,actor.id);}});}
    return {processed:true};
  }
  async reconcile(actor:MerchActor,id:string,provider:MerchMockProvider){
    if(provider.mode!=='mock')fail('merch_mock_provider_required');
    await this.tx(s=>{manager(s,actor);const j=s.jobs.find(j=>j.id===id)??fail('merch_job_not_found');if(j.state!=='unknown')fail('merch_reconcile_blocked');});
    const evidence=await provider.lookup(id);if(!evidence)return {confirmed:false};await this.applyEvent(evidence);return {confirmed:true};
  }
  async recover(actor:MerchActor){return this.tx(s=>{manager(s,actor);for(const j of s.jobs)if(j.state==='dispatching'){j.state='unknown';const o=order(s,j.order);o.state=j.kind==='charge'?'payment_unknown':'refund_unknown';audit(s,this.now(),'provider_attempt_interrupted',j.id,actor.id);}});}
  async applyEvent(envelope:MerchEnvelope){
    if(Buffer.byteLength(envelope.body)>10000||!/^[a-f0-9]{64}$/.test(envelope.signature))fail('merch_invalid_signature');
    const expected=createHmac('sha256',this.key).update(envelope.body).digest();
    if(!timingSafeEqual(expected,Buffer.from(envelope.signature,'hex')))fail('merch_invalid_signature');
    const event=mockMerchEvent.parse(JSON.parse(envelope.body));
    if(Math.abs(this.now()-event.at)>300000)fail('merch_event_expired');
    return this.tx(s=>{
      const hash=merchHash(envelope.body);if(Object.hasOwn(s.events,event.event)){if(s.events[event.event]!==hash)fail('merch_event_conflict');return;}
      const j=s.jobs.find(j=>j.id===event.attempt)??fail('merch_job_not_found'),o=order(s,j.order);
      if(j.order!==event.order||j.kind!==event.kind||j.amountCents!==event.amountCents||j.currency!==event.currency)fail('merch_event_mismatch');
      if(j.state==='queued')fail('merch_unstarted_attempt');
      if(j.state==='accepted'||j.state==='rejected'){
        if(j.state!==event.outcome||j.receipt!==event.receipt)fail('merch_event_conflict');s.events[event.event]=hash;return;
      }
      if(j.kind==='charge'){
        if(!['processing','payment_unknown'].includes(o.state)||o.allocation!=='held')fail('merch_payment_state_conflict');
        if(event.outcome==='accepted'){
          for(const l of o.lines){const v=s.variants.find(v=>v.id===l.variant)??fail('merch_variant_unavailable');if(v.stock<l.quantity)fail('merch_stock_invariant');v.stock-=l.quantity;}
          o.state='paid';o.allocation='committed';
        }else{o.state='payment_failed';o.allocation='released';}
      } else {
        if(!['refund_pending','refund_unknown'].includes(o.state)||o.allocation!=='committed')fail('merch_refund_state_conflict');
        if(event.outcome==='accepted'){
          o.state='refunded';o.allocation='released';
          if(o.fulfillment==='unfulfilled'||o.fulfillment==='returned'&&o.restock)for(const l of o.lines){const v=s.variants.find(v=>v.id===l.variant)??fail('merch_variant_unavailable');v.stock+=l.quantity;}
        } else o.state='refund_pending';
      }
      j.state=event.outcome;j.receipt=event.receipt;o.updated=this.now();s.events[event.event]=hash;audit(s,this.now(),`${j.kind}_${event.outcome}`,o.id);
    });
  }
}
