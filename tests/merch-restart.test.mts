import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {MerchChain,merchFixtureOrganization,type MerchActor} from '../src/lib/merch-chain.ts';
import {localMerchTransaction} from '../src/lib/merch-local-store.ts';
import {localMerchProviderTransaction,mockMerchProvider} from '../src/lib/merch-mock-provider.ts';

const manager:MerchActor={id:'fixture-manager',organizationId:merchFixtureOrganization,kind:'manager',membership:{role:'admin',finance_role:'none'}};
const buyer:MerchActor={id:'fixture-buyer',organizationId:merchFixtureOrganization,kind:'customer'};

test('echte procesonderbreking na provideracceptatie herstelt zonder dubbele betaling of voorraadaftrek',{timeout:20000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'besc-merch-crash-')),key=randomBytes(32);
  const make=()=>new MerchChain(localMerchTransaction(directory,key),key),chain=make(),cart=[{variant:'fixture-shirt-m',quantity:1}],q=await chain.quote(buyer,cart),id=await chain.checkout(buyer,cart,'crash-checkout',q.quoteHash),job=await chain.pay(buyer,id);
  const code=`
    import {MerchChain} from ${JSON.stringify(new URL('../src/lib/merch-chain.ts',import.meta.url).href)};
    import {localMerchTransaction} from ${JSON.stringify(new URL('../src/lib/merch-local-store.ts',import.meta.url).href)};
    import {localMerchProviderTransaction,mockMerchProvider} from ${JSON.stringify(new URL('../src/lib/merch-mock-provider.ts',import.meta.url).href)};
    let text='';for await(const chunk of process.stdin)text+=chunk;
    const input=JSON.parse(text),key=Buffer.from(input.key,'hex'),chain=new MerchChain(localMerchTransaction(input.directory,key),key);
    const provider=mockMerchProvider(localMerchProviderTransaction(input.directory,key),key);
    await chain.dispatch(${JSON.stringify(manager)},input.job,{...provider,async execute(j){await provider.execute(j);process.stdout.write('PROVIDER_RECORDED\\n');await new Promise(()=>{setInterval(()=>{},1000)});}});
  `;
  const child=spawn(process.execPath,['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON','--input-type=module','-e',code],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  child.stdin.end(JSON.stringify({directory,key:key.toString('hex'),job}));let stderr='';child.stderr.on('data',b=>{stderr+=b;});
  try{
    await new Promise<void>((done,reject)=>{let text='';child.stdout.on('data',b=>{text+=b;if(text.includes('PROVIDER_RECORDED'))done();});child.on('error',reject);child.on('exit',code=>reject(Error(`worker_stopped_${code}: ${stderr}`)));});
    const exited=new Promise<void>(done=>child.once('exit',()=>done()));child.kill();await exited;
    const restarted=make();assert.equal((await restarted.inspect(manager)).jobs[0].state,'dispatching');await restarted.recover(manager);assert.equal((await restarted.read(buyer,id)).state,'payment_unknown');
    const provider=mockMerchProvider(localMerchProviderTransaction(directory,key),key);assert.deepEqual(await restarted.dispatch(manager,job,provider),{processed:false});
    assert.deepEqual(await restarted.reconcile(manager,job,provider),{confirmed:true});assert.equal((await restarted.read(buyer,id)).state,'paid');assert.equal((await restarted.inspect(manager)).variants[0].stock,2);
    assert.equal(await localMerchProviderTransaction(directory,key)(s=>Object.keys(s.records).length),1);
  }finally{child.kill();}
});

test('merchproef heeft geen echte transactiedienst, netwerkfallback, cloudclient of automatische activatie',async()=>{
  for(const path of ['../src/lib/merch-chain.ts','../src/lib/merch-local-store.ts','../src/lib/merch-mock-provider.ts','../scripts/merch-local-preview.mts']){
    const source=await readFile(new URL(path,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\bfetch\s*\(|from\s+['"][^'"]*(?:stripe|mollie|paypal|fourthwall|supabase|google-workspace)|createAdminClient|SUPABASE_SECRET_KEY|STRIPE_SECRET_KEY/);
  }
});
