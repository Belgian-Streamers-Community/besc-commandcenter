import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {NewsletterChain,type NewsletterActor} from '../src/lib/newsletter-chain.ts';
import {LocalNewsletterStore} from '../src/lib/newsletter-local-store.ts';
import {mockNewsletterProvider} from '../src/lib/newsletter-mock-provider.ts';

const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const author:NewsletterActor={id:'fixture-author',organizationId:'newsletter-fixture-org',membership:{role:'admin',finance_role:'none'}};
const reviewer:NewsletterActor={...author,id:'fixture-reviewer',membership:{role:'board',finance_role:'none'}};
const statusNames:Record<string,string>={draft:'Concept',pending_approval:'Wacht op goedkeuring',changes_requested:'Wijzigingen gevraagd',approved:'Goedgekeurd',sending:'Klaar voor nagebootste verzending',attention:'Aandacht nodig',sent:'Nagebootst verzonden',queued:'Klaargezet',dispatching:'In behandeling',unknown:'Uitkomst onzeker',rejected:'Geweigerd',skipped:'Overgeslagen'};
function page(title:string,body:string){return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · BESC nieuwsbriefproef</title><style>
:root{color-scheme:light dark;--bg:#f5f3ef;--fg:#181818;--card:#fff;--line:#ccc;--accent:#a90010}@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#f5f3ef;--card:#1c1c1c;--line:#555;--accent:#ff6874}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.6 system-ui,sans-serif}.notice{background:#a90010;color:#fff;text-align:center;padding:10px;font-size:14px}header,main,footer{max-width:1000px;margin:auto;padding:24px}header{display:flex;gap:24px;align-items:center;flex-wrap:wrap}.brand{font-size:30px;font-weight:900;color:var(--accent)}nav{display:flex;gap:18px;flex-wrap:wrap}a{color:var(--accent)}h1{font-size:clamp(28px,5vw,42px);line-height:1.2}h2{font-size:24px}section,article{background:var(--card);border:1px solid var(--line);padding:24px;margin:22px 0;border-radius:12px}form{display:grid;gap:16px;max-width:700px}label{display:grid;gap:6px}input,textarea,select,button{font:inherit;padding:10px;border-radius:6px;border:1px solid var(--line);max-width:100%;min-width:0}textarea{min-height:150px}button{background:#a90010;color:#fff;border:0;cursor:pointer;font-weight:700}input[type=checkbox]{width:20px;height:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.muted{font-size:14px}.controls{display:flex;gap:10px;flex-wrap:wrap}.controls form{display:block}code{overflow-wrap:anywhere}.honeypot{position:absolute;left:-9999px}*:focus-visible{outline:3px solid #d69e00;outline-offset:4px}.message{border-left:5px solid #d69e00;padding:14px}summary{cursor:pointer}
</style></head><body><div class="notice">TESTFIXTURE — NIET PUBLICEREN · lokale proef · er worden geen echte mails verstuurd</div><header><a class="brand" href="/">BESC</a><nav aria-label="Nieuwsbrief"><a href="/">Inschrijven</a><a href="/uitschrijven">Uitschrijven</a><a href="/archief">Archief</a></nav></header><main><h1>${esc(title)}</h1>${body}</main><footer>Belgian Streamers Community · lokale nieuwsbriefproef</footer></body></html>`;}
const secureEqual=(a:string,b:string)=>{const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);};

export async function startLocalNewsletterPreview(options:{enabled:boolean;directory:string;key:Buffer;port?:number}) {
  if(options.enabled!==true||process.env.NODE_ENV==='production')throw Error('newsletter_local_preview_disabled');
  const store=new LocalNewsletterStore(options.directory,options.key);
  const capability=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
  let origin='',chain:NewsletterChain;
  const hidden=(id:string,revision?:number)=>`<input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="id" value="${esc(id)}">${revision===undefined?'':`<input type="hidden" name="revision" value="${revision}">`}`;
  const action=(name:string,label:string,id:string,revision?:number)=>`<form method="post" action="/beheer/${name}">${hidden(id,revision)}<button>${esc(label)}</button></form>`;
  async function handle(req:IncomingMessage,res:ServerResponse){
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','strict-origin');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const respond=(status:number,html:string)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(html);};
    const redirect=(path:string)=>{res.writeHead(303,{Location:path});res.end();};
    const expectedHost=new URL(origin).host;
    if(req.headers.host!==expectedHost)return respond(403,page('Geen toegang','<p>Ongeldige lokale host.</p>'));
    const url=new URL(req.url??'/',origin),cookies=req.headers.cookie??'';
    const isAdmin=cookies.split(';').some(c=>secureEqual(c.trim(),`newsletter_preview=${capability}`));
    if(req.method==='GET'&&url.pathname==='/lokale-toegang'&&secureEqual(url.searchParams.get('code')??'',capability)){
      res.setHeader('Set-Cookie',`newsletter_preview=${capability}; HttpOnly; SameSite=Strict; Path=/beheer`);return redirect('/beheer');
    }
    if(url.pathname.startsWith('/beheer')&&!isAdmin)return respond(403,page('Geen toegang','<p>Open de lokale beheerlink uit de proefomgeving.</p>'));
    if(req.method==='POST'){
      if(req.headers.origin!==origin||req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded')return respond(403,page('Geen toegang','<p>Ongeldige aanvraag.</p>'));
      let body='';for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>40000)return respond(413,page('Te veel gegevens','<p>Maak de aanvraag korter.</p>'));}
      const form=new URLSearchParams(body);
      try{
        if(url.pathname==='/aanvragen'){
          const kind=form.get('kind');if(kind!=='subscribe'&&kind!=='unsubscribe')throw Error('invalid');
          await chain.request(kind,{email:form.get('email')??'',consent:form.get('consent')==='yes',website:form.get('website')??''},req.socket.remoteAddress??'local');
          return respond(200,page('Aanvraag ontvangen','<p class="message">Als dit adres in aanmerking komt, staat de bevestigingsmail klaar in de afgeschermde proefmailbox. De link is 24 uur geldig.</p>'));
        }
        if(url.pathname==='/bevestigen'){
          const result=await chain.confirm(form.get('token')??'');
          return respond(200,page(result.confirmed?(result.kind==='subscribe'?'Inschrijving bevestigd':'Je bent uitgeschreven'):'Link niet geldig',`<p>${result.confirmed?'Je keuze is opgeslagen in de lokale proef.':'Deze link is ongeldig, verlopen of al gebruikt. Vraag een nieuwe link aan.'}</p>`));
        }
        if(!url.pathname.startsWith('/beheer/')||!secureEqual(form.get('csrf')??'',csrf))return respond(403,page('Geen toegang','<p>Ongeldige aanvraag.</p>'));
        const id=form.get('id')??'',revision=Number(form.get('revision'));
        switch(url.pathname){
          case '/beheer/opslaan': await chain.save(author,{title:form.get('title')??'',subject:form.get('subject')??'',body:form.get('body')??'',publicArchive:form.get('publicArchive')==='yes'},id||undefined,id?revision:undefined);break;
          case '/beheer/indienen': await chain.submit(author,id,revision);break;
          case '/beheer/goedkeuren': await chain.review(reviewer,id,revision,'approve');break;
          case '/beheer/wijzigingen': await chain.review(reviewer,id,revision,'changes_requested');break;
          case '/beheer/klaarzetten': await chain.queue(author,id);break;
          case '/beheer/volgende': {const outcome=form.get('outcome');if(outcome!=='accepted'&&outcome!=='rejected'&&outcome!=='unknown')throw Error('invalid');await chain.dispatch(author,mockNewsletterProvider(outcome));break;}
          case '/beheer/herstel': await chain.recover(author);break;
          case '/beheer/pauze': await chain.pause(author,form.get('paused')==='true');break;
          default:return respond(404,page('Niet gevonden',''));
        }
        return redirect('/beheer');
      }catch{return respond(400,page('Actie niet uitgevoerd','<p role="alert">Controleer je gegevens, toestemming, rechten en de actuele status. Er is geen echte mail verstuurd.</p><a href="/beheer">Terug naar lokaal beheer</a>'));}
    }
    if(req.method!=='GET')return respond(405,page('Niet toegestaan',''));
    if(url.pathname==='/'||url.pathname==='/uitschrijven'){
      const unsubscribe=url.pathname==='/uitschrijven';
      return respond(200,page(unsubscribe?'Uitschrijven':'Blijf op de hoogte',`<p>${unsubscribe?'Vraag een eenmalige uitschrijflink aan.':'Schrijf je in en bevestig daarna je keuze. Alleen fictieve adressen met @example.invalid zijn hier toegestaan.'}</p><section><form method="post" action="/aanvragen"><input type="hidden" name="kind" value="${unsubscribe?'unsubscribe':'subscribe'}"><label>E-mailadres<input name="email" type="email" autocomplete="email" placeholder="creator@example.invalid" required></label>${unsubscribe?'':'<label><input type="checkbox" name="consent" value="yes" required>Ik wil de nieuwsbrief ontvangen. Mijn adres wordt alleen hiervoor gebruikt en ik kan altijd uitschrijven.</label>'}<label class="honeypot" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><button>Bevestigingsmail aanvragen</button></form></section>`));
    }
    if(url.pathname==='/bevestigen')return respond(200,page('Bevestig je keuze',`<p>Druk op de knop om je keuze op te slaan. Het openen van deze pagina alleen wijzigt niets.</p><form method="post" action="/bevestigen"><input type="hidden" name="token" value="${esc(url.searchParams.get('token')??'')}"><button>Keuze bevestigen</button></form>`));
    if(url.pathname==='/archief'){
      const archive=await chain.archive();return respond(200,page('Nieuwsbriefarchief',archive.length?archive.map(e=>`<article><h2>${esc(e.title)}</h2><p>${esc(e.subject)}</p><pre>${esc(e.body)}</pre></article>`).join(''):'<p>Nog geen nieuwsbrieven beschikbaar.</p>'));
    }
    if(url.pathname==='/beheer'){
      const s=await chain.inspect(author);
      const create=`<section><h2>Nieuwe nieuwsbrief</h2><form method="post" action="/beheer/opslaan">${hidden('')}<label>Titel<input name="title" required value="TESTFIXTURE — NIET PUBLICEREN"></label><label>Onderwerp<input name="subject" required></label><label>Inhoud<textarea name="body" required></textarea></label><label><input type="checkbox" name="publicArchive" value="yes">Deze inhoud mag na goedkeuring en nagebootste verzending in het openbare proefarchief.</label><button>Concept opslaan</button></form></section>`;
      const editions=s.editions.map(e=>`<article><h3>${esc(e.title)}</h3><p>${esc(statusNames[e.status])} · versie ${e.revision} · ${e.recipients.length} geselecteerde ontvangers</p><details><summary>Inhoud bekijken</summary><p>${esc(e.subject)}</p><pre>${esc(e.body)}</pre></details><div class="controls">${['draft','changes_requested'].includes(e.status)?action('indienen','Ter goedkeuring indienen',e.id,e.revision):''}${e.status==='pending_approval'?action('goedkeuren','Goedkeuren als fictieve tweede beoordelaar',e.id,e.revision)+action('wijzigingen','Wijzigingen vragen als fictieve tweede beoordelaar',e.id,e.revision):''}${e.status==='approved'?action('klaarzetten','Nagebootste verzending klaarzetten',e.id):''}</div>${['draft','changes_requested','approved','pending_approval'].includes(e.status)?`<details><summary>Concept wijzigen</summary><form method="post" action="/beheer/opslaan">${hidden(e.id,e.revision)}<label>Titel<input name="title" required value="${esc(e.title)}"></label><label>Onderwerp<input name="subject" required value="${esc(e.subject)}"></label><label>Inhoud<textarea name="body" required>${esc(e.body)}</textarea></label><label><input type="checkbox" name="publicArchive" value="yes" ${e.publicArchive?'checked':''}>Proefarchief toegestaan</label><button>Wijzigingen opslaan</button></form></details>`:''}</article>`).join('');
      const mails=s.outbox.map(m=>`<article><h3>${esc(m.subject)}</h3><p>${esc(m.to)} · ${esc(statusNames[m.status])}</p><details><summary>Proefmail lezen</summary><pre>${esc(m.text)}</pre>${m.kind==='confirmation'?`<a href="${esc(m.text.match(/http:\/\/\S+/)?.[0]??'/')}">Bevestigingspagina openen</a>`:''}</details></article>`).join('');
      return respond(200,page('Nieuwsbriefbeheer — lokale proef',`<p>Beheerder: fictieve auteur. Goedkeuringsknoppen gebruiken een aparte fictieve bestuursrol. Dit zijn geen echte BESC-accounts; een echte proef met een tweede beoordelaar is hiermee niet uitgevoerd.</p><p><strong>${s.subscribers.filter(x=>x.status==='subscribed').length} bevestigde inschrijvers</strong> · lijst ${s.list.paused?'gepauzeerd':'beschikbaar'}</p><section><h2>Proefbediening</h2><form method="post" action="/beheer/volgende">${hidden('')}<label>Nagebootste provideruitkomst<select name="outcome"><option value="accepted">Geaccepteerd</option><option value="rejected">Geweigerd</option><option value="unknown">Onzeker / onderbroken</option></select></label><button>Volgende proefmail verwerken</button></form><div class="controls">${action('herstel','Onderbroken taken veilig markeren','')}<form method="post" action="/beheer/pauze">${hidden('')}<input type="hidden" name="paused" value="${!s.list.paused}"><button>${s.list.paused?'Lijst hervatten':'Lijst pauzeren'}</button></form></div></section>${create}<section><h2>Nieuwsbrieven</h2>${editions||'<p>Nog geen concepten.</p>'}</section><section><h2>Afgeschermde proefmailbox</h2>${mails||'<p>Nog geen proefmails.</p>'}</section><section><h2>Historie</h2><ol>${s.audit.slice(-40).reverse().map(a=>`<li>${esc(a.event)} · ${esc(a.actor??'publieke proefactie')}</li>`).join('')}</ol></section>`));
    }
    return respond(404,page('Niet gevonden','<p>Deze pagina bestaat niet.</p>'));
  }
  const server=createServer((req,res)=>{handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('Lokale proefopslag niet beschikbaar.');});});
  await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(options.port??0,'127.0.0.1',done);});
  const bound=server.address();if(!bound||typeof bound==='string')throw Error('local_preview_bind');
  origin=`http://127.0.0.1:${bound.port}`;chain=new NewsletterChain(store.transaction,origin);
  return {origin,adminUrl:`${origin}/lokale-toegang?code=${capability}`,chain,close:()=>new Promise<void>((done,reject)=>server.close(e=>e?reject(e):done()))};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv[2]!=='--local-newsletter-fixture')throw Error('Explicit local fixture option required');
  const directory=process.env.BESC_NEWSLETTER_FIXTURE_DIRECTORY,key=process.env.BESC_NEWSLETTER_FIXTURE_KEY;
  if(!directory||!key||!/^[a-f0-9]{64}$/i.test(key))throw Error('Explicit local directory and 32-byte hex fixture key required');
  const preview=await startLocalNewsletterPreview({enabled:true,directory,key:Buffer.from(key,'hex'),port:21421});
  console.log(`Lokale nieuwsbriefproef: ${preview.origin}\nLokale beheerlink (alleen deze computer): ${preview.adminUrl}`);
}
