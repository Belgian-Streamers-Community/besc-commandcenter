import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {MerchChain,merchHash,merchFixtureOrganization,type MerchActor,type MerchOrder} from '../src/lib/merch-chain.ts';
import {localMerchTransaction} from '../src/lib/merch-local-store.ts';
import {localMerchProviderTransaction,mockMerchProvider,type MerchMockOutcome} from '../src/lib/merch-mock-provider.ts';

const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const euros=(n:number)=>new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(n/100);
const manager:MerchActor={id:'fixture-manager',organizationId:merchFixtureOrganization,kind:'manager',membership:{role:'admin',finance_role:'none'}};
const statuses:Record<string,string>={awaiting_payment:'Wacht op proefbetaling',processing:'Proefbetaling klaargezet',payment_unknown:'Betaaluitkomst onzeker — eerst bewijs controleren',paid:'Nagebootst betaald',payment_failed:'Proefbetaling geweigerd',cancelled:'Geannuleerd',refund_pending:'Wacht op proefterugbetaling',refund_unknown:'Terugbetaling onzeker — eerst bewijs controleren',refunded:'Nagebootst terugbetaald',queued:'Klaargezet',dispatching:'In behandeling',unknown:'Onzeker',accepted:'Nagebootst geaccepteerd',rejected:'Nagebootst geweigerd',unfulfilled:'Nog niet verzonden',shipped:'Fictief verzonden',delivered:'Fictief afgeleverd',returned:'Retour ontvangen',none:'Geen retour',requested:'Retour aangevraagd',approved:'Retour goedgekeurd',received:'Retour ontvangen'};
function page(title:string,body:string){return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · BESC merchproef</title><style>
:root{color-scheme:light dark;--bg:#f5f3ef;--fg:#181818;--card:#fff;--line:#bbb;--link:#a90010}@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#f5f3ef;--card:#1c1c1c;--line:#555;--link:#ff7780}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.6 system-ui,sans-serif}.notice{background:#a90010;color:#fff;text-align:center;padding:10px;font-size:14px}header,main,footer{max-width:1050px;margin:auto;padding:24px}header,nav,.controls{display:flex;gap:18px;flex-wrap:wrap;align-items:center}a{color:var(--link)}.brand{font-size:30px;font-weight:900}h1{font-size:clamp(28px,5vw,42px);line-height:1.2}h2{font-size:25px}article,section{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:22px;margin:22px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:20px}.grid article{margin:0}form,label{display:grid;gap:10px}form{max-width:680px}input,button,select{font:inherit;padding:10px;border-radius:6px;border:1px solid var(--line);max-width:100%;min-width:0}button{background:#a90010;color:#fff;border:0;font-weight:700;cursor:pointer}button:disabled{opacity:.5;cursor:default}.controls form{display:block}.muted{font-size:14px}code{overflow-wrap:anywhere}*:focus-visible{outline:3px solid #d69e00;outline-offset:4px}.message{border-left:5px solid #d69e00;padding:12px}ul{padding-left:24px}
</style></head><body><div class="notice">TESTFIXTURE — NIET PUBLICEREN · geen echte producten, voorraad, bestellingen of betalingen</div><header><a class="brand" href="/">BESC</a><nav aria-label="Merchproef"><a href="/">Merch</a><a href="/bestellingen">Mijn proefbestellingen</a><a href="/service">Levering en retouren</a></nav></header><main><h1>${esc(title)}</h1>${body}</main><footer>Belgian Streamers Community · afgeschermde lokale proef</footer></body></html>`;}
function orderContent(o:MerchOrder){return `<p><strong>${esc(statuses[o.state])}</strong> · ${esc(statuses[o.fulfillment])}</p><ul>${o.lines.map(l=>`<li>${esc(l.label)} × ${l.quantity} — ${esc(euros(l.unitCents*l.quantity))}</li>`).join('')}</ul><p>Proefverzending: ${esc(euros(o.shippingCents))}<br><strong>Totaal: ${esc(euros(o.totalCents))}</strong></p><p>Retour: ${esc(statuses[o.returnState])}</p>${o.tracking?`<p>Proeftracking: <code>${esc(o.tracking)}</code></p>`:''}`;}

export async function startLocalMerchPreview(options:{enabled:boolean;directory:string;key:Buffer;port?:number}){
  if(options.enabled!==true||process.env.NODE_ENV==='production')throw Error('merch_local_preview_disabled');
  const chain=new MerchChain(localMerchTransaction(options.directory,options.key),options.key),ledger=localMerchProviderTransaction(options.directory,options.key);
  const capability=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');let origin='';
  const hidden=(id:string)=>`<input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="id" value="${esc(id)}">`;
  const action=(path:string,label:string,id:string)=>`<form method="post" action="${path}">${hidden(id)}<button>${esc(label)}</button></form>`;
  async function handle(req:IncomingMessage,res:ServerResponse){
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','strict-origin');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const respond=(status:number,html:string)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(html);};
    const redirect=(path:string)=>{res.writeHead(303,{Location:path});res.end();};
    if(req.headers.host!==new URL(origin).host)return respond(403,page('Geen toegang','<p>Ongeldige lokale host.</p>'));
    const url=new URL(req.url??'/',origin),cookies=(req.headers.cookie??'').split(';').map(c=>c.trim());
    const isManager=cookies.some(c=>equal(c,`merch_manager=${capability}`));
    let customerToken=cookies.find(c=>/^merch_customer=[a-f0-9]{64}$/.test(c))?.split('=')[1];
    if(!customerToken){customerToken=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`merch_customer=${customerToken}; HttpOnly; SameSite=Strict; Path=/`);}
    const customer:MerchActor={id:`fixture-customer-${merchHash(customerToken)}`,organizationId:merchFixtureOrganization,kind:'customer'};
    if(req.method==='GET'&&url.pathname==='/lokale-toegang'&&equal(url.searchParams.get('code')??'',capability)){
      res.setHeader('Set-Cookie',[`merch_customer=${customerToken}; HttpOnly; SameSite=Strict; Path=/`,`merch_manager=${capability}; HttpOnly; SameSite=Strict; Path=/beheer`]);return redirect('/beheer');
    }
    if(url.pathname.startsWith('/beheer')&&!isManager)return respond(403,page('Geen toegang','<p>Gebruik de lokale beheerlink van deze proef.</p>'));
    if(req.method==='POST'){
      if(req.headers.origin!==origin||req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded')return respond(403,page('Geen toegang','<p>Ongeldige aanvraag.</p>'));
      let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>20000)return respond(413,page('Aanvraag te groot',''));}
      const form=new URLSearchParams(body);if(!equal(form.get('csrf')??'',csrf))return respond(403,page('Geen toegang','<p>Ververs het formulier en probeer opnieuw.</p>'));
      const id=form.get('id')??'';
      try{
        switch(url.pathname){
          case '/offerte':{
            const cart=[{variant:form.get('variant')??'',quantity:Number(form.get('quantity'))}],q=await chain.quote(customer,cart);
            return respond(200,page('Controleer je proefbestelling',`<section><ul>${q.lines.map(l=>`<li>${esc(l.label)} × ${l.quantity}</li>`).join('')}</ul><p>Producten: ${esc(euros(q.subtotalCents))}<br>Proefverzending: ${esc(euros(q.shippingCents))}<br><strong>Totaal: ${esc(euros(q.totalCents))}</strong></p><form method="post" action="/bestellen">${hidden('')}<input type="hidden" name="cart" value="${esc(JSON.stringify(cart))}"><input type="hidden" name="quote" value="${q.quoteHash}"><input type="hidden" name="key" value="${randomUUID()}"><label><input type="checkbox" name="fixture" value="yes" required>Ik bevestig uitsluitend deze fictieve bestelling. Er wordt niets gekocht of betaald.</label><button>Fictieve bestelling plaatsen</button></form></section>`));
          }
          case '/bestellen': {if(form.get('fixture')!=='yes')throw Error();const order=await chain.checkout(customer,JSON.parse(form.get('cart')??''),form.get('key')??'',form.get('quote')??'');return redirect(`/bestellingen/${order}`);}
          case '/betalen':await chain.pay(customer,id);return redirect(`/bestellingen/${id}`);
          case '/annuleren':await chain.cancel(customer,id);return redirect(`/bestellingen/${id}`);
          case '/retour':await chain.requestReturn(customer,id);return redirect(`/bestellingen/${id}`);
          case '/beheer/verwerken': {const outcome=form.get('outcome') as MerchMockOutcome;if(!['accepted','rejected','unknown_before','unknown_after'].includes(outcome))throw Error();await chain.dispatch(manager,id,mockMerchProvider(ledger,options.key,outcome));break;}
          case '/beheer/bewijs':await chain.reconcile(manager,id,mockMerchProvider(ledger,options.key));break;
          case '/beheer/herstel':await chain.recover(manager);break;
          case '/beheer/pauze':await chain.pause(manager,form.get('paused')==='true');break;
          case '/beheer/verzenden':await chain.fulfill(manager,id,'ship');break;
          case '/beheer/afleveren':await chain.fulfill(manager,id,'deliver');break;
          case '/beheer/retour-goedkeuren':await chain.reviewReturn(manager,id,true);break;
          case '/beheer/retour-weigeren':await chain.reviewReturn(manager,id,false);break;
          case '/beheer/retour-ontvangen':await chain.receiveReturn(manager,id,form.get('restock')==='yes');break;
          case '/beheer/terugbetalen':await chain.refund(manager,id,form.get('prior')||undefined);break;
          case '/beheer/variant':await chain.updateVariant(manager,id,Number(form.get('revision')),{priceCents:Number(form.get('priceCents')),stock:Number(form.get('stock')),available:form.get('available')==='yes'});break;
          default:return respond(404,page('Niet gevonden',''));
        }
        return redirect('/beheer');
      }catch{return respond(400,page('Actie niet uitgevoerd','<p role="alert">Controleer voorraad, actuele offerte, eigendom, rechten en bestelstatus. Een onzekere betaling of terugbetaling wordt nooit automatisch herhaald.</p><p>Er is geen echte transactie uitgevoerd.</p><a href="/">Terug naar de proefshop</a>'));}
    }
    if(req.method!=='GET')return respond(405,page('Niet toegestaan',''));
    if(url.pathname==='/'){
      const catalog=await chain.catalog();return respond(200,page('Merch — lokale proef',`<p>Dit zijn fictieve producten en bedragen. De bestaande BESC-shop is niet aangesloten.</p>${catalog.paused?'<p class="message">Nieuwe proefbestellingen zijn gepauzeerd.</p>':''}<div class="grid">${catalog.variants.map(v=>`<article><h2>${esc(v.product)}</h2><p>${esc(v.label)}<br><strong>${esc(euros(v.priceCents))}</strong> · ${v.available} beschikbaar</p><form method="post" action="/offerte">${hidden('')}<input type="hidden" name="variant" value="${esc(v.id)}"><label>Aantal<input type="number" name="quantity" min="1" max="10" value="1" required></label><button ${catalog.paused||!v.available?'disabled':''}>Proefbestelling bekijken</button></form></article>`).join('')}</div>`));
    }
    if(url.pathname==='/bestellingen'){
      const orders=await chain.mine(customer);return respond(200,page('Mijn proefbestellingen',orders.length?orders.map(o=>`<article><h2><a href="/bestellingen/${o.id}">Proefbestelling ${esc(o.id.slice(0,8))}</a></h2>${orderContent(o)}</article>`).join(''):'<p>Nog geen eigen proefbestellingen in deze browsersessie.</p>'));
    }
    if(/^\/bestellingen\/[a-f0-9-]{36}$/.test(url.pathname)){
      try{const o=await chain.read(customer,url.pathname.split('/')[2]);return respond(200,page('Je proefbestelling',`<section><p><code>${esc(o.id)}</code></p>${orderContent(o)}<div class="controls">${o.state==='awaiting_payment'?action('/betalen','Proefbetaling klaarzetten',o.id):''}${['awaiting_payment','payment_failed'].includes(o.state)||o.state==='paid'&&o.fulfillment==='unfulfilled'?action('/annuleren','Annuleren',o.id):''}${o.state==='paid'&&o.fulfillment==='delivered'&&o.returnState==='none'?action('/retour','Retour aanvragen',o.id):''}</div><p class="muted">Betaalstatus verandert alleen na gecontroleerd bewijs van de nagebootste provider. De lokale beheeromgeving verwerkt de proefbetaling.</p></section>`));}catch{return respond(404,page('Niet gevonden','<p>Deze proefbestelling is niet beschikbaar.</p>'));}
    }
    if(url.pathname==='/service')return respond(200,page('Levering en retouren — proefafspraken','<p>Deze lokale simulatie gebruikt uitsluitend fictieve goederen. Verzendkosten zijn voor de proef vast € 4,50; betaalde annuleringen en ontvangen, goedgekeurde retouren worden in de proef volledig terugbetaald. Dit zijn geen echte BESC-prijzen, leverbeloftes, verkoopvoorwaarden of rechtenafspraken.</p><p>Een retour wordt apart aangevraagd, beoordeeld en ontvangen. Alleen na inspectie en een bevestigde proefterugbetaling komt herbruikbare voorraad terug. Voor ingebruikname moeten leverancier, betaling, levering en retourbeleid worden vastgesteld.</p>'));
    if(url.pathname==='/beheer'){
      const s=await chain.inspect(manager);
      const variants=s.variants.map(v=>`<article><h3>${esc(v.product)} · ${esc(v.label)}</h3><form method="post" action="/beheer/variant">${hidden(v.id)}<input type="hidden" name="revision" value="${v.revision}"><label>Prijs in proefcenten<input name="priceCents" type="number" min="1" value="${v.priceCents}" required></label><label>Fictieke fysieke voorraad<input name="stock" type="number" min="0" value="${v.stock}" required></label><label><input type="checkbox" name="available" value="yes" ${v.available?'checked':''}>Variant beschikbaar in de proef</label><button>Variant opslaan</button></form></article>`).join('');
      const orders=s.orders.map(o=>`<article><h3>Proefbestelling ${esc(o.id.slice(0,8))}</h3>${orderContent(o)}<div class="controls">${o.state==='paid'&&o.fulfillment==='unfulfilled'?action('/beheer/verzenden','Fictief verzenden',o.id):''}${o.state==='paid'&&o.fulfillment==='shipped'?action('/beheer/afleveren','Fictief afleveren',o.id):''}${o.returnState==='requested'?action('/beheer/retour-goedkeuren','Retour goedkeuren',o.id)+action('/beheer/retour-weigeren','Retour weigeren',o.id):''}${o.state==='refund_pending'?action('/beheer/terugbetalen','Proefterugbetaling klaarzetten',o.id):''}</div>${o.returnState==='approved'?`<form method="post" action="/beheer/retour-ontvangen">${hidden(o.id)}<label><input name="restock" type="checkbox" value="yes">Geïnspecteerd en herbruikbaar voor proefvoorraad</label><button>Retour als ontvangen registreren</button></form>`:''}</article>`).join('');
      const jobs=s.jobs.map(j=>`<article><h3>${j.kind==='charge'?'Proefbetaling':'Proefterugbetaling'} · ${esc(euros(j.amountCents))}</h3><p>${esc(statuses[j.state])} · order ${esc(j.order.slice(0,8))}</p>${j.state==='queued'?`<form method="post" action="/beheer/verwerken">${hidden(j.id)}<label>Nagebootste uitkomst<select name="outcome"><option value="accepted">Geaccepteerd</option><option value="rejected">Geweigerd</option><option value="unknown_before">Onderbroken vóór resultaat</option><option value="unknown_after">Geaccepteerd, antwoord verloren</option></select></label><button>Proeftaak verwerken</button></form>`:''}${j.state==='unknown'?action('/beheer/bewijs','Alleen providerbewijs opvragen',j.id):''}${j.kind==='refund'&&j.state==='rejected'?`<form method="post" action="/beheer/terugbetalen">${hidden(j.order)}<input type="hidden" name="prior" value="${j.id}"><button>Nieuwe poging na definitief geweigerde proefterugbetaling</button></form>`:''}</article>`).join('');
      return respond(200,page('Merchbeheer — lokale proef',`<p>Fictieve beheerder/bestuurder. Geen echte BESC-accounts, magazijngegevens, betalingen of boekhouding.</p><section><h2>Proefbediening</h2><div class="controls">${action('/beheer/herstel','Onderbroken taken onzeker markeren','')}<form method="post" action="/beheer/pauze">${hidden('')}<input type="hidden" name="paused" value="${!s.paused}"><button>${s.paused?'Proefshop hervatten':'Proefshop pauzeren'}</button></form></div></section><section><h2>Varianten en voorraad</h2>${variants}</section><section><h2>Bestellingen en retouren</h2>${orders||'<p>Nog geen proefbestellingen.</p>'}</section><section><h2>Providerproeven</h2>${jobs||'<p>Nog geen proeftaken.</p>'}</section><section><h2>Historie</h2><ol>${s.audit.slice(-50).reverse().map(a=>`<li>${esc(a.event)} · ${esc(a.object.slice(0,12))}</li>`).join('')}</ol></section>`));
    }
    return respond(404,page('Niet gevonden',''));
  }
  const server=createServer((req,res)=>{handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('Lokale proefopslag niet beschikbaar.');});});
  await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(options.port??0,'127.0.0.1',done);});
  const bound=server.address();if(!bound||typeof bound==='string')throw Error('merch_local_bind');origin=`http://127.0.0.1:${bound.port}`;
  return {origin,adminUrl:`${origin}/lokale-toegang?code=${capability}`,chain,close:()=>new Promise<void>((done,reject)=>server.close(e=>e?reject(e):done()))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv[2]!=='--local-merch-fixture')throw Error('Explicit local fixture option required');
  const directory=process.env.BESC_MERCH_FIXTURE_DIRECTORY,key=process.env.BESC_MERCH_FIXTURE_KEY;
  if(!directory||!key||!/^[a-f0-9]{64}$/i.test(key))throw Error('Explicit local directory and 32-byte hex fixture key required');
  const preview=await startLocalMerchPreview({enabled:true,directory,key:Buffer.from(key,'hex'),port:21422});console.log(`Lokale merchproef: ${preview.origin}\nLokale beheerlink (alleen deze computer): ${preview.adminUrl}`);
}
