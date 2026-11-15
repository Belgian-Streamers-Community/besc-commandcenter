import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {request} from 'node:http';
import {startLocalNewsletterPreview} from '../scripts/newsletter-local-preview.mts';

test('lokale HTTP-keten: inschrijven, expliciete bevestiging, redactie, beoordeling, proefverzending en archief',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'besc-newsletter-http-'));
  const app=await startLocalNewsletterPreview({enabled:true,directory,key:randomBytes(32)});
  const originalFetch=globalThis.fetch;
  // Fail the test if any code tries a non-loopback endpoint (including Google or Supabase).
  globalThis.fetch=((input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
    const url=String(input);assert.ok(url.startsWith(app.origin+'/'),'external_network_forbidden');return originalFetch(input,init);
  }) as typeof fetch;
  try{
    const response=await fetch(app.adminUrl,{redirect:'manual'}),cookie=response.headers.get('set-cookie')!.split(';')[0];
    assert.equal(response.status,303);
    const get=async(path:string,admin=false)=>{const r=await fetch(app.origin+path,{headers:admin?{cookie}:{}});return{response:r,html:await r.text()};};
    const post=async(path:string,fields:Record<string,string>,admin=false,origin=app.origin)=>{
      const r=await fetch(app.origin+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:origin,...(admin?{cookie}:{})},body:new URLSearchParams(fields),redirect:'manual'});return{response:r,html:await r.text()};
    };
    assert.equal((await get('/beheer')).response.status,403);
    assert.equal((await post('/aanvragen',{kind:'subscribe',email:'creator@example.invalid',consent:'yes'},false,'https://evil.example')).response.status,403);
    const homepage=await get('/');assert.match(homepage.html,/name="consent"/);assert.match(homepage.html,/TESTFIXTURE/);
    assert.equal(homepage.response.headers.get('referrer-policy'),'strict-origin');assert.match(homepage.response.headers.get('x-robots-tag')!,/noindex/);
    await post('/aanvragen',{kind:'subscribe',email:'creator@example.invalid',consent:'yes'});
    const admin=await get('/beheer',true);const token=admin.html.match(/\/bevestigen\?token=([\w-]+)/)![1],csrf=admin.html.match(/name="csrf" value="(\w+)"/)![1];
    assert.match(admin.html,/0 bevestigde inschrijvers/);
    const confirm=await get(`/bevestigen?token=${token}`);assert.match(confirm.html,/Keuze bevestigen/);
    assert.match((await get('/beheer',true)).html,/0 bevestigde inschrijvers/);
    assert.match((await post('/bevestigen',{token})).html,/Inschrijving bevestigd/);
    assert.match((await get('/beheer',true)).html,/1 bevestigde inschrijvers/);
    assert.equal((await post('/beheer/opslaan',{csrf:'wrong'},true)).response.status,403);
    assert.equal((await post('/beheer/opslaan',{csrf,title:'TESTFIXTURE — NIET PUBLICEREN',subject:'Lokale ketentest',body:'Alleen lokale proefinhoud.',publicArchive:'yes'},true)).response.status,303);
    const current=await get('/beheer',true),id=current.html.match(/name="id" value="([a-f0-9-]{36})"/)![1];
    assert.equal((await post('/beheer/indienen',{csrf,id,revision:'1'},true)).response.status,303);
    assert.match((await get('/beheer',true)).html,/Wacht op goedkeuring/);
    assert.equal((await post('/beheer/goedkeuren',{csrf,id,revision:'1'},true)).response.status,303);
    assert.match((await get('/archief')).html,/Nog geen nieuwsbrieven beschikbaar/);
    await post('/beheer/klaarzetten',{csrf,id},true);
    // The used confirmation mail is skipped; the edition is the next sendable job.
    await post('/beheer/volgende',{csrf,outcome:'accepted'},true);
    const archive=await get('/archief');assert.match(archive.html,/Alleen lokale proefinhoud/);assert.doesNotMatch(archive.html,/creator@example.invalid|fixture-reviewer|name="csrf"|token=/);
    await post('/aanvragen',{kind:'unsubscribe',email:'creator@example.invalid'});
    const updated=await get('/beheer',true),tokens=Array.from(updated.html.matchAll(/\/bevestigen\?token=([\w-]+)/g),m=>m[1]);
    assert.match((await post('/bevestigen',{token:tokens.at(-1)!})).html,/Je bent uitgeschreven/);
    assert.match((await get('/beheer',true)).html,/0 bevestigde inschrijvers/);
    const mismatch=await new Promise<number|undefined>((done,reject)=>{const r=request(app.origin+'/',{headers:{Host:'evil.example'}},response=>{response.resume();done(response.statusCode);});r.on('error',reject);r.end();});assert.equal(mismatch,403);
  }finally{globalThis.fetch=originalFetch;await app.close();}
});

test('de proefserver vereist expliciet lokaal inschakelen',async()=>{
  await assert.rejects(startLocalNewsletterPreview({enabled:false,directory:tmpdir(),key:randomBytes(32)}),/preview_disabled/);
});
