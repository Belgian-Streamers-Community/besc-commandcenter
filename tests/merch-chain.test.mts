import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MerchChain,emptyMerchState,merchFixtureOrganization,type MerchActor,type MerchTransaction,type MerchEnvelope,type MerchMockProvider} from '../src/lib/merch-chain.ts';
import {emptyMerchMockLedger,mockMerchProvider,signMockMerchEvent,localMerchProviderTransaction,type MerchMockOutcome} from '../src/lib/merch-mock-provider.ts';
import {localMerchTransaction,type FixtureTransaction} from '../src/lib/merch-local-store.ts';

const manager:MerchActor={id:'fixture-manager',organizationId:merchFixtureOrganization,kind:'manager',membership:{role:'admin',finance_role:'none'}};
const buyer:MerchActor={id:'fixture-buyer',organizationId:merchFixtureOrganization,kind:'customer'};
const other:MerchActor={...buyer,id:'fixture-other'};
const cart=[{variant:'fixture-shirt-m',quantity:1}];
function memory<T>(initial:T):FixtureTransaction<T>{let state=structuredClone(initial),tail=Promise.resolve();return async operation=>{const next=tail.then(()=>{const copy=structuredClone(state),answer=operation(copy);state=copy;return answer;});tail=next.then(()=>{},()=>{});return next;};}
function fixture(){
  let now=1900000000000;const key=randomBytes(32),tx:MerchTransaction=memory(emptyMerchState()),ledger=memory(emptyMerchMockLedger()),chain=new MerchChain(tx,key,()=>now);
  return{chain,key,tx,ledger,provider:(outcome:MerchMockOutcome='accepted')=>mockMerchProvider(ledger,key,outcome,()=>now),advance:(ms:number)=>now+=ms,now:()=>now};
}
async function checkout(f:ReturnType<typeof fixture>,lines=cart,actor=buyer,key=randomUUID()){const q=await f.chain.quote(actor,lines);return f.chain.checkout(actor,lines,key,q.quoteHash);}
async function paid(f:ReturnType<typeof fixture>){const id=await checkout(f),job=await f.chain.pay(buyer,id);await f.chain.dispatch(manager,job,f.provider());return{id,job};}
async function delivered(f:ReturnType<typeof fixture>){const result=await paid(f);await f.chain.fulfill(manager,result.id,'ship');await f.chain.fulfill(manager,result.id,'deliver');return result;}

test('catalogus bevat alleen gemarkeerde fixtures en geeft geen klanten of interne taken prijs',async()=>{
  const f=fixture(),catalog=await f.chain.catalog();assert.equal(catalog.variants.length,3);assert.ok(catalog.variants.every(v=>v.product.startsWith('TESTFIXTURE')));assert.doesNotMatch(JSON.stringify(catalog),/owner|receipt|attempt|secret|fixture-buyer/);
});
test('offerte rekent op de server met gehele eurocenten, vaste proefverzending en EUR',async()=>{
  const f=fixture(),q=await f.chain.quote(buyer,[{variant:'fixture-shirt-m',quantity:2},{variant:'fixture-mug',quantity:1}]);assert.equal(q.subtotalCents,6200);assert.equal(q.shippingCents,450);assert.equal(q.totalCents,6650);assert.equal(q.currency,'EUR');
});
test('lege, dubbele, onbekende en te grote winkelmanden en gemanipuleerde bedragen worden geweigerd',async()=>{
  const f=fixture();for(const input of [[],[...cart,...cart],[{variant:'unknown',quantity:1}],[{variant:'fixture-shirt-m',quantity:0}],[{variant:'fixture-shirt-m',quantity:1.5}],[{variant:'fixture-shirt-m',quantity:11}],[{variant:'fixture-shirt-m',quantity:1,unitCents:1}]])await assert.rejects(f.chain.quote(buyer,input));
});
test('prijs- of beschikbaarheidswijziging vereist een nieuwe expliciete offerte',async()=>{
  const f=fixture(),q=await f.chain.quote(buyer,cart);await f.chain.updateVariant(manager,'fixture-shirt-m',1,{priceCents:3000,stock:3,available:true});await assert.rejects(f.chain.checkout(buyer,cart,'checkout-key',q.quoteHash),/quote_changed/);
  await f.chain.updateVariant(manager,'fixture-shirt-m',2,{priceCents:3000,stock:3,available:false});await assert.rejects(f.chain.quote(buyer,cart),/stock_unavailable/);
});
test('dezelfde bestelknop reserveert één keer en conflicterend hergebruik van een sleutel faalt',async()=>{
  const f=fixture(),q=await f.chain.quote(buyer,cart);const [a,b]=await Promise.all([f.chain.checkout(buyer,cart,'checkout-key',q.quoteHash),f.chain.checkout(buyer,cart,'checkout-key',q.quoteHash)]);assert.equal(a,b);assert.equal((await f.chain.catalog()).variants[0].available,2);
  await assert.rejects(f.chain.checkout(buyer,[{variant:'fixture-shirt-m',quantity:2}],'checkout-key',q.quoteHash),/idempotency_conflict/);
});
test('twee klanten kunnen dezelfde laatste voorraad niet dubbel reserveren',async()=>{
  const f=fixture();await f.chain.updateVariant(manager,'fixture-shirt-m',1,{priceCents:2500,stock:1,available:true});const q=await f.chain.quote(buyer,cart);
  const results=await Promise.allSettled([f.chain.checkout(buyer,cart,'customer-a',q.quoteHash),f.chain.checkout(other,cart,'customer-b',q.quoteHash)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.chain.catalog()).variants[0].available,0);
});
test('reservering verloopt na vijftien minuten zonder dat een oude bestelknop een nieuwe order maakt',async()=>{
  const f=fixture(),q=await f.chain.quote(buyer,cart),id=await f.chain.checkout(buyer,cart,'checkout-key',q.quoteHash);f.advance(900000);assert.equal((await f.chain.read(buyer,id)).state,'cancelled');assert.equal((await f.chain.catalog()).variants[0].available,3);
  assert.equal(await f.chain.checkout(buyer,cart,'checkout-key',q.quoteHash),id);await assert.rejects(f.chain.pay(buyer,id),/payment_blocked/);
});
test('rollen, eigendom en organisatiegrenzen beschermen bestellingen en beheer',async()=>{
  const f=fixture(),id=await checkout(f);await assert.rejects(f.chain.read(other,id),/forbidden/);await assert.rejects(f.chain.pay(other,id),/forbidden/);await assert.rejects(f.chain.cancel(other,id),/forbidden/);assert.equal((await f.chain.mine(other)).length,0);
  for(const actor of [buyer,{...manager,organizationId:'other'},{...manager,membership:{role:'member',finance_role:'none'}},{...manager,membership:{role:'volunteer',finance_role:'none',capabilities:['manageContent']}}]){
    await assert.rejects(f.chain.inspect(actor),/forbidden/);await assert.rejects(f.chain.updateVariant(actor,'fixture-shirt-m',1,{priceCents:1,stock:1,available:true}),/forbidden/);await assert.rejects(f.chain.pause(actor,true),/forbidden/);await assert.rejects(f.chain.fulfill(actor,id,'ship'),/forbidden/);await assert.rejects(f.chain.recover(actor),/forbidden/);await assert.rejects(f.chain.refund(actor,id),/forbidden/);
  }
});
test('voorraad kan niet lager dan actieve reserveringen worden gezet; oude catalogusversie faalt',async()=>{
  const f=fixture();await checkout(f);await assert.rejects(f.chain.updateVariant(manager,'fixture-shirt-m',1,{priceCents:2500,stock:0,available:true}),/reserved_stock/);await assert.rejects(f.chain.updateVariant(manager,'fixture-shirt-m',2,{priceCents:2500,stock:3,available:true}),/revision_conflict/);
});
test('klant of browser kan een order niet als betaald markeren of zonder betaling laten leveren',async()=>{
  const f=fixture(),id=await checkout(f);await assert.rejects(f.chain.fulfill(manager,id,'ship'),/fulfillment_blocked/);await assert.rejects(f.chain.applyEvent({body:'{"paid":true}',signature:'0'.repeat(64)}),/invalid_signature/);assert.equal((await f.chain.read(buyer,id)).state,'awaiting_payment');
});
test('gelijktijdige betaalknoppen en workers veroorzaken één nagebootste afschrijving',async()=>{
  const f=fixture(),id=await checkout(f),[a,b]=await Promise.all([f.chain.pay(buyer,id),f.chain.pay(buyer,id)]);assert.equal(a,b);
  await Promise.all(Array.from({length:5},()=>f.chain.dispatch(manager,a,f.provider())));const s=await f.chain.inspect(manager);assert.equal(s.jobs.length,1);assert.equal(s.jobs[0].state,'accepted');assert.equal(s.variants[0].stock,2);assert.equal((await f.chain.read(buyer,id)).state,'paid');
  assert.equal(await f.ledger(s=>Object.keys(s.records).length),1);
});
test('afgewezen betaling geeft voorraad vrij en kan geen verzending of retour starten',async()=>{
  const f=fixture(),id=await checkout(f),job=await f.chain.pay(buyer,id);await f.chain.dispatch(manager,job,f.provider('rejected'));assert.equal((await f.chain.read(buyer,id)).state,'payment_failed');assert.equal((await f.chain.catalog()).variants[0].available,3);await assert.rejects(f.chain.fulfill(manager,id,'ship'));await assert.rejects(f.chain.requestReturn(buyer,id));
});
test('onzeker vóór provideruitkomst houdt voorraad vast en start nooit automatisch een nieuwe afschrijving',async()=>{
  const f=fixture(),id=await checkout(f),job=await f.chain.pay(buyer,id);await f.chain.dispatch(manager,job,f.provider('unknown_before'));f.advance(86400000);assert.equal((await f.chain.read(buyer,id)).state,'payment_unknown');assert.equal((await f.chain.catalog()).variants[0].available,2);
  assert.deepEqual(await f.chain.dispatch(manager,job,f.provider()),{processed:false});assert.deepEqual(await f.chain.reconcile(manager,job,f.provider()),{confirmed:false});assert.equal(await f.ledger(s=>Object.keys(s.records).length),0);await assert.rejects(f.chain.cancel(buyer,id),/cancellation_blocked/);
});
test('onzeker ná provideracceptatie wordt uit onafhankelijk bewijs hersteld zonder opnieuw te betalen',async()=>{
  const f=fixture(),id=await checkout(f),job=await f.chain.pay(buyer,id);await f.chain.dispatch(manager,job,f.provider('unknown_after'));assert.equal((await f.chain.read(buyer,id)).state,'payment_unknown');f.advance(3600000);
  assert.deepEqual(await f.chain.reconcile(manager,job,f.provider()),{confirmed:true});assert.equal((await f.chain.read(buyer,id)).state,'paid');assert.equal(await f.ledger(s=>Object.keys(s.records).length),1);assert.equal((await f.chain.inspect(manager)).variants[0].stock,2);
});
test('vervalste, verlopen, verkeerde en nog niet gestarte callbacks worden geweigerd',async()=>{
  const f=fixture(),id=await checkout(f),job=await f.chain.pay(buyer,id),j=(await f.chain.inspect(manager)).jobs[0];const event={mode:'mock' as const,provider:'fixture' as const,event:randomUUID(),attempt:job,order:id,kind:'charge' as const,amountCents:j.amountCents,currency:'EUR' as const,outcome:'accepted' as const,receipt:`mock-${randomUUID()}`,at:f.now()};
  await assert.rejects(f.chain.applyEvent(signMockMerchEvent(event,f.key)),/unstarted_attempt/);await f.tx(s=>{s.jobs[0].state='dispatching';});
  await assert.rejects(f.chain.applyEvent(signMockMerchEvent({...event,amountCents:1},f.key)),/event_mismatch/);await assert.rejects(f.chain.applyEvent(signMockMerchEvent({...event,order:randomUUID()},f.key)),/event_mismatch/);
  const foreign=JSON.stringify({...event,currency:'USD'});await assert.rejects(f.chain.applyEvent({body:foreign,signature:createHmac('sha256',f.key).update(foreign).digest('hex')}));
  f.advance(300001);await assert.rejects(f.chain.applyEvent(signMockMerchEvent(event,f.key)),/event_expired/);assert.equal((await f.chain.inspect(manager)).variants[0].stock,3);
});
test('dubbele providerberichten zijn onschadelijk; hergebruikt event-ID met gewijzigde inhoud faalt',async()=>{
  const f=fixture(),id=await checkout(f),job=await f.chain.pay(buyer,id);let envelope:MerchEnvelope|undefined;const provider=f.provider();await f.chain.dispatch(manager,job,{...provider,async execute(j){envelope=await provider.execute(j);return envelope;}});assert.ok(envelope);
  await f.chain.applyEvent(envelope);assert.equal((await f.chain.inspect(manager)).variants[0].stock,2);
  const event=JSON.parse(envelope.body);event.outcome='rejected';await assert.rejects(f.chain.applyEvent(signMockMerchEvent(event,f.key)),/event_conflict/);assert.equal((await f.chain.read(buyer,id)).state,'paid');
});
test('ongekende callback of terugbetaling vóór betaalacceptatie kan geen order aanpassen',async()=>{
  const f=fixture(),id=await checkout(f),job=await f.chain.pay(buyer,id);const event={mode:'mock' as const,provider:'fixture' as const,event:randomUUID(),attempt:randomUUID(),order:id,kind:'refund' as const,amountCents:2950,currency:'EUR' as const,outcome:'accepted' as const,receipt:`mock-${randomUUID()}`,at:f.now()};await assert.rejects(f.chain.applyEvent(signMockMerchEvent(event,f.key)),/job_not_found/);assert.equal((await f.chain.read(buyer,id)).state,'processing');assert.equal((await f.chain.inspect(manager)).jobs[0].id,job);
});
test('annuleren vóór betalen is idempotent en maakt reservering vrij',async()=>{
  const f=fixture(),id=await checkout(f);await f.chain.cancel(buyer,id);await f.chain.cancel(buyer,id);assert.equal((await f.chain.catalog()).variants[0].available,3);await assert.rejects(f.chain.pay(buyer,id));
});
test('betaalde annulering wacht op terugbetaling en herstelt voorraad pas na bevestigd resultaat',async()=>{
  const f=fixture(),{id}=await paid(f);await f.chain.cancel(buyer,id);await assert.rejects(f.chain.fulfill(manager,id,'ship'));
  const [a,b]=await Promise.all([f.chain.refund(manager,id),f.chain.refund(manager,id)]);assert.equal(a,b);assert.equal((await f.chain.inspect(manager)).variants[0].stock,2);await f.chain.dispatch(manager,a,f.provider());assert.equal((await f.chain.read(buyer,id)).state,'refunded');assert.equal((await f.chain.inspect(manager)).variants[0].stock,3);await f.chain.dispatch(manager,a,f.provider());assert.equal((await f.chain.inspect(manager)).variants[0].stock,3);
});
test('fictieve levering vereist betaald → verzonden → afgeleverd en bewaart proeftracking',async()=>{
  const f=fixture(),{id}=await paid(f);await assert.rejects(f.chain.fulfill(manager,id,'deliver'));await f.chain.fulfill(manager,id,'ship');assert.match((await f.chain.read(buyer,id)).tracking!,/^TESTFIXTURE-/);await assert.rejects(f.chain.cancel(buyer,id));await f.chain.fulfill(manager,id,'deliver');await assert.rejects(f.chain.fulfill(manager,id,'ship'));
});
test('retour vereist eigen afgeleverde order en afzonderlijke beoordeling en ontvangst',async()=>{
  const f=fixture(),{id}=await delivered(f);await assert.rejects(f.chain.requestReturn(other,id),/forbidden/);await f.chain.requestReturn(buyer,id);await assert.rejects(f.chain.receiveReturn(manager,id,true));await assert.rejects(f.chain.reviewReturn(buyer,id,true),/forbidden/);await f.chain.reviewReturn(manager,id,true);await f.chain.receiveReturn(manager,id,true);assert.equal((await f.chain.read(buyer,id)).state,'refund_pending');
  const refund=await f.chain.refund(manager,id);await f.chain.dispatch(manager,refund,f.provider());assert.equal((await f.chain.inspect(manager)).variants[0].stock,3);assert.equal((await f.chain.read(buyer,id)).state,'refunded');
});
test('beschadigde retour komt niet opnieuw in voorraad en geweigerde retour start geen restitutie',async()=>{
  for(const approved of [true,false]){const f=fixture(),{id}=await delivered(f);await f.chain.requestReturn(buyer,id);await f.chain.reviewReturn(manager,id,approved);
    if(approved){await f.chain.receiveReturn(manager,id,false);const job=await f.chain.refund(manager,id);await f.chain.dispatch(manager,job,f.provider());assert.equal((await f.chain.inspect(manager)).variants[0].stock,2);}
    else {await assert.rejects(f.chain.refund(manager,id));assert.equal((await f.chain.read(buyer,id)).state,'paid');}
  }
});
test('onzekere terugbetaling behoudt voorraad en wordt uitsluitend uit providerbewijs hersteld',async()=>{
  const f=fixture(),{id}=await paid(f);await f.chain.cancel(buyer,id);const job=await f.chain.refund(manager,id);await f.chain.dispatch(manager,job,f.provider('unknown_after'));assert.equal((await f.chain.read(buyer,id)).state,'refund_unknown');assert.equal((await f.chain.inspect(manager)).variants[0].stock,2);assert.deepEqual(await f.chain.dispatch(manager,job,f.provider()),{processed:false});await f.chain.reconcile(manager,job,f.provider());assert.equal((await f.chain.inspect(manager)).variants[0].stock,3);
});
test('definitief geweigerde terugbetaling mag alleen expliciet en idempotent opnieuw worden geprobeerd',async()=>{
  const f=fixture(),{id}=await paid(f);await f.chain.cancel(buyer,id);const first=await f.chain.refund(manager,id);await f.chain.dispatch(manager,first,f.provider('rejected'));
  assert.equal((await f.chain.read(buyer,id)).state,'refund_pending');assert.equal((await f.chain.inspect(manager)).variants[0].stock,2);
  assert.equal(await f.chain.refund(manager,id),first);
  const [a,b]=await Promise.all([f.chain.refund(manager,id,first),f.chain.refund(manager,id,first)]);assert.notEqual(a,first);assert.equal(a,b);await f.chain.dispatch(manager,a,f.provider());assert.equal((await f.chain.inspect(manager)).variants[0].stock,3);assert.equal((await f.chain.read(buyer,id)).state,'refunded');
});
test('pauzeren stopt nieuwe bestellingen en afschrijvingen maar blokkeert geen terugbetaling',async()=>{
  const f=fixture(),{id}=await paid(f);await f.chain.pause(manager,true);await assert.rejects(f.chain.quote(buyer,cart),/paused/);await f.chain.cancel(buyer,id);const refund=await f.chain.refund(manager,id);await f.chain.dispatch(manager,refund,f.provider());assert.equal((await f.chain.read(buyer,id)).state,'refunded');
});
test('echte provider, ontbrekende sleutel en onbevoegde dispatch worden geweigerd',async()=>{
  const f=fixture(),id=await checkout(f),job=await f.chain.pay(buyer,id);await assert.rejects(f.chain.dispatch(manager,job,{mode:'real'} as unknown as MerchMockProvider),/mock_provider_required/);await assert.rejects(f.chain.dispatch(buyer,job,f.provider()),/forbidden/);assert.throws(()=>new MerchChain(f.tx,Buffer.alloc(0)),/fixture_key_required/);
});
test('herstart herstelt order en onafhankelijk betaalbewijs uit afzonderlijke versleutelde bestanden',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'besc-merch-')),key=randomBytes(32);
  const f=fixture();f.chain=new MerchChain(localMerchTransaction(directory,key),key);const id=await checkout(f),job=await f.chain.pay(buyer,id);await f.chain.dispatch(manager,job,mockMerchProvider(localMerchProviderTransaction(directory,key),key,'unknown_after'));
  const restored=new MerchChain(localMerchTransaction(directory,key),key);await restored.reconcile(manager,job,mockMerchProvider(localMerchProviderTransaction(directory,key),key));assert.equal((await restored.read(buyer,id)).state,'paid');
  for(const file of ['merch-orders.encrypted.json','merch-provider.encrypted.json'])assert.doesNotMatch(await readFile(join(directory,file),'utf8'),/fixture-buyer|TESTFIXTURE|mock-|receipt|2950/);
  await assert.rejects(new MerchChain(localMerchTransaction(directory,randomBytes(32)),key).catalog(),/storage_unreadable/);
});
test('beschadigde opslag en achtergebleven lock stoppen zonder reset; transactie blijft atomair',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'besc-merch-')),tx=localMerchTransaction(directory,randomBytes(32));await assert.rejects(tx(s=>{s.paused=true;throw Error('rollback');}));assert.equal(await tx(s=>s.paused),false);
  const file=join(directory,'merch-orders.encrypted.json');await writeFile(file,'broken');await assert.rejects(tx(()=>{}),/storage_unreadable/);assert.equal(await readFile(file,'utf8'),'broken');await mkdir(join(directory,'merch-orders.lock'));await assert.rejects(tx(()=>{}),/storage_busy/);
});
test('onzekere claim blijft na herstel vaststaan en kan niet nogmaals worden uitgevoerd',async()=>{
  const f=fixture(),id=await checkout(f),job=await f.chain.pay(buyer,id);await f.tx(s=>{s.jobs[0].state='dispatching';});await f.chain.recover(manager);assert.equal((await f.chain.read(buyer,id)).state,'payment_unknown');assert.equal((await f.chain.dispatch(manager,job,f.provider())).processed,false);
});
