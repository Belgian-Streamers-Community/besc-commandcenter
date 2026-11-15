import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {NewsletterChain,emptyNewsletterState,type NewsletterActor,type NewsletterTransaction,type MockNewsletterProvider} from '../src/lib/newsletter-chain.ts';
import {LocalNewsletterStore} from '../src/lib/newsletter-local-store.ts';
import {mockNewsletterProvider} from '../src/lib/newsletter-mock-provider.ts';

const author:NewsletterActor={id:'fixture-author',organizationId:'newsletter-fixture-org',membership:{role:'admin',finance_role:'none'}};
const reviewer:NewsletterActor={...author,id:'fixture-reviewer',membership:{role:'board',finance_role:'none'}};
const content={title:'TESTFIXTURE — NIET PUBLICEREN',subject:'Testeditie',body:'Dit is een lokale nieuwsbriefproef.',publicArchive:true};
function fixture(){
  let state=emptyNewsletterState(),now=1900000000000;
  let pending=Promise.resolve();
  const tx:NewsletterTransaction=async operation=>{
    const turn=pending.then(()=>{const copy=structuredClone(state),result=operation(copy);state=copy;return result;});
    pending=turn.then(()=>{},()=>{});return turn;
  };
  return {chain:new NewsletterChain(tx,'http://127.0.0.1:21421',()=>now),state:()=>structuredClone(state),advance:(ms:number)=>now+=ms,tx};
}
async function token(chain:NewsletterChain,kind:'subscribe'|'unsubscribe',email='creator@example.invalid'){
  await chain.request(kind,{email,consent:true},email);
  const s=await chain.inspect(author),mail=s.outbox.filter(m=>m.kind==='confirmation'&&m.to===email).at(-1);
  assert.ok(mail);return new URL(mail.text.match(/http:\/\/\S+/)![0]).searchParams.get('token')!;
}
async function subscriber(chain:NewsletterChain,email='creator@example.invalid') {const t=await token(chain,'subscribe',email);assert.equal((await chain.confirm(t)).confirmed,true);return t;}
async function approved(chain:NewsletterChain,input=content){const id=await chain.save(author,input);await chain.submit(author,id,1);await chain.review(reviewer,id,1,'approve');return id;}
async function drain(chain:NewsletterChain,provider=mockNewsletterProvider()){for(let n=0;n<110;n++)if(!(await chain.dispatch(author,provider)).processed)return;throw Error('drain_limit');}

test('inschrijven vereist expliciete toestemming en uitsluitend fictieve adressen',async()=>{
  const {chain,state}=fixture();
  await assert.rejects(chain.request('subscribe',{email:'creator@example.invalid'},'ip'),/consent_required/);
  await assert.rejects(chain.request('subscribe',{email:'real@example.com',consent:true},'ip'),/fixture_address_required/);
  await chain.request('subscribe',{email:'creator@example.invalid',consent:true,website:'bot'},'ip');
  assert.equal(state().outbox.length,0);
});
test('dubbele bevestiging, eenmalige tokens, toestemming en generieke respons',async()=>{
  const {chain,state}=fixture();const t=await token(chain,'subscribe');
  assert.equal(state().subscribers.length,0);
  assert.ok(!JSON.stringify(state().confirmations).includes(t));
  assert.equal((await chain.confirm(t)).confirmed,true);
  assert.equal((await chain.confirm(t)).confirmed,false);
  assert.equal(state().subscribers[0].consentVersion,'besc-newsletter-local-v1');
  assert.deepEqual(await chain.request('subscribe',{email:'creator@example.invalid',consent:true},'ip'),{accepted:true});
  assert.deepEqual(await chain.request('unsubscribe',{email:'unknown@example.invalid'},'ip'),{accepted:true});
  assert.equal(state().outbox.length,1);
});
test('tokens verlopen op 24 uur en ongeldige tokens veranderen niets',async()=>{
  const {chain,advance,state}=fixture(),t=await token(chain,'subscribe');advance(86400000);
  assert.equal((await chain.confirm(t)).confirmed,false);
  assert.equal((await chain.confirm('bad')).confirmed,false);
  assert.equal(state().subscribers.length,0);
});
test('herhaalde aanvragen worden samengevoegd en een verlopen token wordt vervangen',async()=>{
  const {chain,advance,state}=fixture(),old=await token(chain,'subscribe');
  for(let n=0;n<10;n++)await chain.request('subscribe',{email:'creator@example.invalid',consent:true},'ip');
  assert.equal(state().outbox.length,1);advance(86400001);
  const next=await token(chain,'subscribe');assert.notEqual(old,next);
  assert.equal((await chain.confirm(old)).confirmed,false);assert.equal((await chain.confirm(next)).confirmed,true);
});
test('IP-beperking en honeypot voorkomen extra bevestigingsmails',async()=>{
  const {chain,state}=fixture();
  for(let n=0;n<8;n++)await chain.request('subscribe',{email:`test${n}@example.invalid`,consent:true},'same-ip');
  assert.equal(state().outbox.length,5);assert.ok(!JSON.stringify(state().confirmations).includes('same-ip'));
});
test('GET-scanners kunnen niet bevestigen; bevestiging wordt door de host expliciet aangeroepen',async()=>{
  const {chain,state}=fixture();await token(chain,'subscribe');
  assert.equal(state().subscribers.length,0);assert.equal((await chain.archive()).length,0);
});
test('uitschrijven werkt ook bij een gepauzeerde lijst; opnieuw inschrijven vraagt nieuwe toestemming',async()=>{
  const {chain,state}=fixture();const old=await subscriber(chain);await chain.pause(author,true);
  const leave=await token(chain,'unsubscribe');assert.equal((await chain.confirm(leave)).kind,'unsubscribe');
  assert.equal(state().subscribers[0].status,'unsubscribed');assert.equal((await chain.confirm(old)).confirmed,false);
  await chain.pause(author,false);await subscriber(chain);assert.equal(state().subscribers[0].revision,3);
});
test('pauzeren blokkeert edities maar nooit de nagebootste uitschrijfbevestigingsmail',async()=>{
  const {chain,state}=fixture();await subscriber(chain);const id=await approved(chain);await chain.queue(author,id);await chain.pause(author,true);
  const leave=await token(chain,'unsubscribe');const deliveries:string[]=[];
  await drain(chain,{mode:'mock',async send(m){deliveries.push(m.subject);return {status:'accepted',receipt:'mock-unsubscribe'};}});
  assert.deepEqual(deliveries,['Bevestig je uitschrijving']);assert.equal(state().outbox.find(m=>m.kind==='edition')?.status,'queued');
  assert.equal((await chain.confirm(leave)).kind,'unsubscribe');
});
test('rechten en organisatiegrenzen gelden voor alle beheeroperaties',async()=>{
  const {chain}=fixture();await subscriber(chain);const id=await chain.save(author,content);
  for(const denied of [{...author,organizationId:'other'},{...author,membership:{role:'member',finance_role:'none'}},{...author,membership:{role:'volunteer',finance_role:'none',capabilities:['manageContent']}}]){
    await assert.rejects(chain.save(denied,content),/forbidden/);
    await assert.rejects(chain.submit(denied,id,1),/forbidden/);
    await assert.rejects(chain.inspect(denied),/forbidden/);
    await assert.rejects(chain.queue(denied,id),/forbidden/);
    await assert.rejects(chain.review(denied,id,1,'approve'),/forbidden/);
    await assert.rejects(chain.pause(denied,true),/forbidden/);
    await assert.rejects(chain.dispatch(denied,mockNewsletterProvider()),/forbidden/);
    await assert.rejects(chain.recover(denied),/forbidden/);
  }
});
test('zelfgoedkeuring wordt geweigerd en wijzigingen trekken goedkeuring in',async()=>{
  const {chain,state}=fixture();await subscriber(chain);const id=await chain.save(author,content);
  await chain.submit(author,id,1);await assert.rejects(chain.review(author,id,1,'approve'),/independent_reviewer/);
  await chain.review(reviewer,id,1,'approve');await chain.save(author,{...content,subject:'Aangepast'},id,1);
  assert.equal(state().editions[0].status,'draft');assert.equal(state().editions[0].approvedBy,null);
  await assert.rejects(chain.queue(author,id),/not_approved/);
});
test('de laatste redacteur kan zijn eigen gewijzigde inhoud niet via een andere indiener goedkeuren',async()=>{
  const {chain}=fixture();await subscriber(chain);const id=await chain.save(author,content);
  await chain.save(reviewer,{...content,subject:'Gewijzigd door beoordelaar'},id,1);await chain.submit(author,id,2);
  await assert.rejects(chain.review(reviewer,id,2,'approve'),/independent_reviewer_required/);
});
test('wijzigingsverzoek, nieuwe versie en verouderde knoppen zijn afgeschermd',async()=>{
  const {chain}=fixture();await subscriber(chain);const id=await chain.save(author,content);
  await chain.submit(author,id,1);await chain.review(reviewer,id,1,'changes_requested');
  await chain.save(author,content,id,1);await assert.rejects(chain.submit(author,id,1),/revision_conflict/);
  await chain.submit(author,id,2);await chain.review(reviewer,id,2,'approve');await chain.queue(author,id);
  await assert.rejects(chain.save(author,content,id,2),/not_editable/);
});
test('lege ontvangerslijst, gepauzeerde lijst en onbevestigde inschrijving worden geblokkeerd',async()=>{
  const {chain}=fixture();const id=await chain.save(author,content);await token(chain,'subscribe');
  await assert.rejects(chain.submit(author,id,1),/audience_unavailable/);await subscriber(chain);
  await chain.pause(author,true);await assert.rejects(chain.submit(author,id,1),/audience_unavailable/);
});
test('meer dan 100 bevestigde ontvangers wordt geweigerd zonder stilzwijgende afkapping',async()=>{
  const f=fixture();await f.tx(s=>{for(let n=0;n<101;n++)s.subscribers.push({id:`s${n}`,email:`s${n}@example.invalid`,status:'subscribed',revision:1,consentAt:1,consentVersion:'besc-newsletter-local-v1'});});
  const id=await f.chain.save(author,content);await assert.rejects(f.chain.submit(author,id,1),/audience_unavailable/);
});
test('gelijktijdige verzendknoppen en workers slaan per ontvanger slechts één taak op',async()=>{
  const {chain,state}=fixture();await subscriber(chain);const id=await approved(chain);await Promise.all([chain.queue(author,id),chain.queue(author,id)]);
  let calls=0;const provider:MockNewsletterProvider={mode:'mock',async send(){calls++;return {status:'accepted',receipt:'mock-accepted'};}};
  await Promise.all(Array.from({length:6},()=>chain.dispatch(author,provider)));await drain(chain,provider);
  assert.equal(state().outbox.filter(x=>x.kind==='edition').length,1);assert.equal(calls,1);assert.equal(state().editions[0].status,'sent');
});
test('uitschrijving na goedkeuring en na klaarzetten voorkomt verzending',async()=>{
  for(const beforeQueue of [true,false]){
    const {chain,state}=fixture();await subscriber(chain);const id=await approved(chain);
    if(!beforeQueue)await chain.queue(author,id);
    await chain.confirm(await token(chain,'unsubscribe'));
    if(beforeQueue)await chain.queue(author,id);
    const delivered:string[]=[];await drain(chain,{mode:'mock',async send(m){delivered.push(m.to);return {status:'accepted',receipt:'mock-ok'};}});
    assert.equal(delivered.length,0);assert.equal(state().editions[0].status,'attention');assert.equal((await chain.archive()).length,0);
  }
});
test('nieuwe inschrijvers komen niet in een eerder goedgekeurde ontvangersselectie',async()=>{
  const {chain,state}=fixture();await subscriber(chain);const id=await approved(chain);await subscriber(chain,'later@example.invalid');await chain.queue(author,id);
  assert.deepEqual(state().outbox.filter(m=>m.kind==='edition').map(m=>m.to),['creator@example.invalid']);
});
test('uitschrijving en herinschrijving herstellen geen oudere klaarstaande taak',async()=>{
  const {chain,state}=fixture();await subscriber(chain);const id=await approved(chain);await chain.queue(author,id);
  await chain.confirm(await token(chain,'unsubscribe'));await subscriber(chain);await drain(chain);
  assert.equal(state().outbox.find(m=>m.kind==='edition')?.status,'skipped');
});
test('onzekere provideruitkomst en afwijzing leiden tot aandacht zonder automatische herhaling',async()=>{
  for(const outcome of ['unknown','rejected'] as const){
    const {chain,state}=fixture();await subscriber(chain);const id=await approved(chain);await chain.queue(author,id);
    await drain(chain,mockNewsletterProvider(outcome));await chain.queue(author,id);await drain(chain);
    assert.equal(state().editions[0].status,'attention');assert.equal(state().outbox.find(m=>m.kind==='edition')?.status,outcome);
    assert.equal((await chain.archive()).length,0);assert.ok(!JSON.stringify(state().audit).includes('provider response'));
  }
});
test('onderbreking na claim wordt bij herstel onzeker en niet opnieuw verstuurd',async()=>{
  const {chain,state,tx}=fixture();await subscriber(chain);const id=await approved(chain);await chain.queue(author,id);
  await tx(s=>{for(const m of s.outbox)if(m.kind==='edition')m.status='dispatching';});
  await chain.recover(author);await drain(chain);
  assert.equal(state().outbox.find(m=>m.kind==='edition')?.status,'unknown');assert.equal(state().editions[0].status,'attention');
});
test('archief bevat uitsluitend succesvol verzonden en expliciet voor archief goedgekeurde inhoud',async()=>{
  const {chain}=fixture();await subscriber(chain);
  const publicId=await approved(chain);const privateId=await approved(chain,{...content,title:'Intern',publicArchive:false});
  assert.equal((await chain.archive()).length,0);
  await chain.queue(author,publicId);await chain.queue(author,privateId);await drain(chain);
  const archive=await chain.archive();assert.equal(archive.length,1);assert.equal(archive[0].id,publicId);
  assert.doesNotMatch(JSON.stringify(archive),/email|recipient|approvedBy|example.invalid|token|seal/);
});
test('veilige HTML-opmaak en verplichte uitschrijfinstructie per individuele ontvanger',async()=>{
  const {chain,state}=fixture();await subscriber(chain);const id=await approved(chain,{...content,body:'<script>alert(1)</script> [fout](javascript:alert)'});await chain.queue(author,id);
  const mail=state().outbox.find(m=>m.kind==='edition')!;
  assert.match(mail.text,/Uitschrijven: http:\/\/127.0.0.1/);assert.doesNotMatch(mail.html,/<script>|href="javascript:/);
  assert.ok(!('bcc' in mail));assert.equal(mail.to,'creator@example.invalid');
});
test('een echte provider of externe callback-origin wordt altijd geweigerd',async()=>{
  const {chain,tx}=fixture();await assert.rejects(chain.dispatch(author,{mode:'real'} as unknown as MockNewsletterProvider),/mock_provider_required/);
  for(const url of ['https://besc.example','http://127.0.0.1.evil.test','http://user@localhost','http://localhost/path'])assert.throws(()=>new NewsletterChain(tx,url),/local_origin_required/);
});
test('versleutelde opslag herstelt bevestiging, editie, ontvangstbewijs en historie na herstart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'besc-newsletter-')),key=randomBytes(32);
  let chain=new NewsletterChain(new LocalNewsletterStore(dir,key).transaction,'http://localhost:21421');
  const t=await token(chain,'subscribe');
  chain=new NewsletterChain(new LocalNewsletterStore(dir,key).transaction,'http://localhost:21421');
  assert.equal((await chain.confirm(t)).confirmed,true);const id=await approved(chain);await chain.queue(author,id);await drain(chain);
  chain=new NewsletterChain(new LocalNewsletterStore(dir,key).transaction,'http://localhost:21421');
  const state=await chain.inspect(author);assert.equal(state.editions[0].status,'sent');assert.ok(state.audit.some(a=>a.event==='edition_approved'));
  const disk=await readFile(join(dir,'newsletter.encrypted.json'),'utf8');assert.doesNotMatch(disk,/example.invalid|TESTFIXTURE|token|fixture-author/);
  await assert.rejects(new NewsletterChain(new LocalNewsletterStore(dir,randomBytes(32)).transaction,'http://localhost').archive(),/storage_unreadable/);
});
test('beschadigde opslag en achtergebleven proceslock stoppen zonder stil dataverlies',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'besc-newsletter-')),key=randomBytes(32),store=new LocalNewsletterStore(dir,key);
  await store.transaction(()=>{});const file=join(dir,'newsletter.encrypted.json');await writeFile(file,'broken');
  await assert.rejects(store.transaction(()=>{}),/storage_unreadable/);assert.equal(await readFile(file,'utf8'),'broken');
  await mkdir(join(dir,'newsletter.lock'));await assert.rejects(store.transaction(()=>{}),/storage_busy/);
});
test('mislukte transactie blijft atomair en gelijktijdige lokale wijzigingen blijven behouden',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'besc-newsletter-')),store=new LocalNewsletterStore(dir,randomBytes(32));
  await assert.rejects(store.transaction(s=>{s.list.name='not saved';throw Error('rollback');}),/rollback/);
  assert.equal(await store.transaction(s=>s.list.name),'TESTFIXTURE — NIET PUBLICEREN');
  await Promise.all(Array.from({length:10},(_,n)=>store.transaction(s=>{s.audit.push({at:n,event:'fixture',actor:null,object:String(n)});})));assert.equal(await store.transaction(s=>s.audit.length),10);
});
