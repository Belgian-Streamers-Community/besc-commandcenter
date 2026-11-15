import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {NewsletterChain,type NewsletterActor} from '../src/lib/newsletter-chain.ts';
import {LocalNewsletterStore} from '../src/lib/newsletter-local-store.ts';
import {mockNewsletterProvider} from '../src/lib/newsletter-mock-provider.ts';

const actor:NewsletterActor={id:'author',organizationId:'newsletter-fixture-org',membership:{role:'admin',finance_role:'none'}};
const second:NewsletterActor={...actor,id:'reviewer'};

test('echte procesonderbreking na duurzame claim veroorzaakt geen tweede verzending', {timeout:20000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'besc-newsletter-crash-')),key=randomBytes(32);
  const make=()=>new NewsletterChain(new LocalNewsletterStore(directory,key).transaction,'http://localhost:21421');
  const chain=make();
  await chain.request('subscribe',{email:'crash@example.invalid',consent:true},'ip');
  let state=await chain.inspect(actor);
  const token=new URL(state.outbox[0].text.match(/http:\/\/\S+/)![0]).searchParams.get('token')!;
  await chain.confirm(token);
  const id=await chain.save(actor,{title:'TESTFIXTURE — NIET PUBLICEREN',subject:'Onderbreking',body:'Alleen een procesproef.',publicArchive:true});
  await chain.submit(actor,id,1);await chain.review(second,id,1,'approve');await chain.queue(actor,id);
  // No secrets on the command line or disk: fixture key goes through child's stdin.
  const code=`
    import {NewsletterChain} from ${JSON.stringify(new URL('../src/lib/newsletter-chain.ts',import.meta.url).href)};
    import {LocalNewsletterStore} from ${JSON.stringify(new URL('../src/lib/newsletter-local-store.ts',import.meta.url).href)};
    let input='';for await(const chunk of process.stdin)input+=chunk;
    const config=JSON.parse(input),chain=new NewsletterChain(new LocalNewsletterStore(config.directory,Buffer.from(config.key,'hex')).transaction,'http://localhost:21421');
    const actor=${JSON.stringify(actor)};
    await chain.dispatch(actor,{mode:'mock',async send(){process.stdout.write('CLAIMED\\n');await new Promise(()=>{setInterval(()=>{},1000)});}});
  `;
  const child=spawn(process.execPath,['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON','--input-type=module','-e',code],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  child.stdin.end(JSON.stringify({directory,key:key.toString('hex')}));
  let stderr='';child.stderr.on('data',b=>{stderr+=b;});
  try{
    await new Promise<void>((done,reject)=>{
      let text='';child.stdout.on('data',b=>{text+=b;if(text.includes('CLAIMED'))done();});
      child.on('error',reject);child.on('exit',code=>reject(Error(`worker_stopped_${code}: ${stderr}`)));
    });
    const exited=new Promise<void>(done=>child.once('exit',()=>done()));child.kill();await exited;
    const restarted=make();state=await restarted.inspect(actor);assert.equal(state.outbox.find(m=>m.kind==='edition')?.status,'dispatching');
    await restarted.recover(actor);
    assert.equal((await restarted.dispatch(actor,mockNewsletterProvider())).processed,false);
    state=await restarted.inspect(actor);assert.equal(state.outbox.find(m=>m.kind==='edition')?.status,'unknown');assert.equal(state.editions[0].status,'attention');
    assert.equal((await restarted.archive()).length,0);
  }finally{child.kill();}
});

test('lokale uitvoering importeert geen echte maildienst, databaseclient of cloudconfiguratie',async()=>{
  for(const path of ['../src/lib/newsletter-chain.ts','../src/lib/newsletter-local-store.ts','../src/lib/newsletter-mock-provider.ts','../scripts/newsletter-local-preview.mts']){
    const source=await readFile(new URL(path,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\bfetch\s*\(|from\s+['"][^'"]*(?:google-gmail|google-workspace|supabase|crm-google-provider)|createAdminClient|sendGmailDraft\s*\(/);
  }
});
