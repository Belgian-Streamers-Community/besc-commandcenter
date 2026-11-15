import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {request} from 'node:http';
import {startLocalMerchPreview} from '../scripts/merch-local-preview.mts';

const decode=(s:string)=>s.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
function fields(html:string,action:string){const start=html.indexOf(`action="${action}"`);assert.ok(start>=0,`missing_form_${action}`);const fragment=html.slice(start,html.indexOf('</form>',start));return Object.fromEntries(Array.from(fragment.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g),m=>[m[1],decode(m[2])]));}

test('lokale HTTP-keten: variant → offerte → bestelling → betaling → levering → retour → terugbetaling',{timeout:20000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'besc-merch-http-')),app=await startLocalMerchPreview({enabled:true,directory,key:randomBytes(32)});
  const originalFetch=globalThis.fetch;
  globalThis.fetch=((input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{assert.ok(String(input).startsWith(app.origin+'/'),'external_network_forbidden');return originalFetch(input,init);}) as typeof fetch;
  const client=()=>{
    const cookies=new Map<string,string>();
    return async(path:string,body?:Record<string,string>,origin=app.origin)=>{
      const res=await fetch(path.startsWith(app.origin)?path:app.origin+path,{method:body?'POST':'GET',headers:{cookie:Array.from(cookies,([k,v])=>`${k}=${v}`).join('; '),...(body?{'Content-Type':'application/x-www-form-urlencoded',Origin:origin}:{})},body:body?new URLSearchParams(body):undefined,redirect:'manual'});
      for(const c of res.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');cookies.set(k,v);}return {res,html:await res.text()};
    };
  };
  try{
    const buyer=client(),other=client(),admin=client();
    assert.equal((await other('/beheer')).res.status,403);
    const home=await buyer('/');assert.match(home.html,/TESTFIXTURE/);assert.match(home.html,/fixture-shirt-m/);assert.equal(home.res.headers.get('referrer-policy'),'strict-origin');assert.match(home.res.headers.get('x-robots-tag')!,/noindex/);
    const csrf=fields(home.html,'/offerte').csrf;
    assert.equal((await buyer('/offerte',{csrf,variant:'fixture-shirt-m',quantity:'1'},'https://evil.example')).res.status,403);
    const quote=await buyer('/offerte',{csrf,variant:'fixture-shirt-m',quantity:'1'});assert.match(quote.html,/Controleer je proefbestelling/);assert.match(quote.html,/29,50/);
    const checkout=fields(quote.html,'/bestellen');checkout.fixture='yes';const placed=await buyer('/bestellen',checkout);assert.equal(placed.res.status,303);
    const path=placed.res.headers.get('location')!,id=path.split('/')[2];
    assert.equal((await buyer('/bestellen',checkout)).res.headers.get('location'),path);
    assert.equal((await other(path)).res.status,404);
    const own=await buyer(path);assert.match(own.html,/Wacht op proefbetaling/);assert.doesNotMatch(own.html,/receipt|signature|fixture-manager/);
    assert.equal((await buyer('/betalen',{csrf:'bad',id})).res.status,403);
    assert.equal((await buyer('/betalen',{csrf,id})).res.status,303);
    await admin(app.adminUrl);let control=await admin('/beheer');let job=fields(control.html,'/beheer/verwerken');
    assert.equal((await admin('/beheer/verwerken',{...job,outcome:'unknown_after'})).res.status,303);
    assert.match((await buyer(path)).html,/Betaaluitkomst onzeker/);
    control=await admin('/beheer');assert.equal((await admin('/beheer/bewijs',fields(control.html,'/beheer/bewijs'))).res.status,303);
    assert.match((await buyer(path)).html,/Nagebootst betaald/);
    control=await admin('/beheer');await admin('/beheer/verzenden',fields(control.html,'/beheer/verzenden'));
    control=await admin('/beheer');await admin('/beheer/afleveren',fields(control.html,'/beheer/afleveren'));
    const delivered=await buyer(path);assert.match(delivered.html,/Fictief afgeleverd/);
    await buyer('/retour',fields(delivered.html,'/retour'));
    control=await admin('/beheer');await admin('/beheer/retour-goedkeuren',fields(control.html,'/beheer/retour-goedkeuren'));
    control=await admin('/beheer');await admin('/beheer/retour-ontvangen',{...fields(control.html,'/beheer/retour-ontvangen'),restock:'yes'});
    control=await admin('/beheer');await admin('/beheer/terugbetalen',fields(control.html,'/beheer/terugbetalen'));
    control=await admin('/beheer');job=fields(control.html,'/beheer/verwerken');await admin('/beheer/verwerken',{...job,outcome:'accepted'});
    const returned=await buyer(path);assert.match(returned.html,/Nagebootst terugbetaald/);assert.match(returned.html,/Retour ontvangen/);
    assert.match((await buyer('/')).html,/3 beschikbaar/);assert.doesNotMatch((await other('/bestellingen')).html,new RegExp(id));
    const mismatchedHost=await new Promise<number|undefined>((done,reject)=>{const r=request(app.origin+'/',{headers:{Host:'evil.example'}},response=>{response.resume();done(response.statusCode);});r.on('error',reject);r.end();});assert.equal(mismatchedHost,403);
  }finally{globalThis.fetch=originalFetch;await app.close();}
});

test('lokale proefserver is standaard uit en weigert productieomgeving',async()=>{
  await assert.rejects(startLocalMerchPreview({enabled:false,directory:tmpdir(),key:randomBytes(32)}),/preview_disabled/);
  const previous=process.env.NODE_ENV;Object.assign(process.env,{NODE_ENV:'production'});try{await assert.rejects(startLocalMerchPreview({enabled:true,directory:tmpdir(),key:randomBytes(32)}),/preview_disabled/);}finally{if(previous===undefined)Reflect.deleteProperty(process.env,'NODE_ENV');else Object.assign(process.env,{NODE_ENV:previous});}
});
