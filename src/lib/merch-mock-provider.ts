import {createHmac,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {MerchFixtureFile,type FixtureTransaction} from './merch-local-store.ts';
import {mockMerchEvent,merchHash,type MerchJob,type MerchEvent,type MerchEnvelope,type MerchMockProvider} from './merch-chain.ts';

const ledgerSchema=z.object({version:z.literal(1),records:z.record(z.string().uuid(),z.object({jobHash:z.string(),event:mockMerchEvent}).strict())}).strict();
export type MerchMockLedger=z.infer<typeof ledgerSchema>;
export const emptyMerchMockLedger=():MerchMockLedger=>({version:1,records:{}});
export type MerchMockOutcome='accepted'|'rejected'|'unknown_before'|'unknown_after';
export function localMerchProviderTransaction(directory:string,key:Buffer){return new MerchFixtureFile(directory,key,'provider',emptyMerchMockLedger,input=>ledgerSchema.parse(input)).transaction;}
export function signMockMerchEvent(event:MerchEvent,key:Buffer):MerchEnvelope {
  if(key.length!==32)throw Error('merch_fixture_key_required');const body=JSON.stringify(mockMerchEvent.parse(event));return {body,signature:createHmac('sha256',key).update(body).digest('hex')};
}
// Durable, independent mock ledger. Never imports a real payment SDK or endpoint.
export function mockMerchProvider(tx:FixtureTransaction<MerchMockLedger>,key:Buffer,outcome:MerchMockOutcome='accepted',now=()=>Date.now()):MerchMockProvider{
  return {mode:'mock',async execute(job:Readonly<MerchJob>){
    if(outcome==='unknown_before')throw Error('fixture_interrupted_before_result');
    const event=await tx(s=>{
      const jobHash=merchHash(JSON.stringify([job.id,job.order,job.kind,job.amountCents,job.currency]));
      const previous=s.records[job.id];if(previous){if(previous.jobHash!==jobHash)throw Error('fixture_attempt_conflict');return previous.event;}
      const event:MerchEvent={mode:'mock',provider:'fixture',event:randomUUID(),attempt:job.id,order:job.order,kind:job.kind,amountCents:job.amountCents,currency:job.currency,outcome:outcome==='rejected'?'rejected':'accepted',receipt:`mock-${randomUUID()}`,at:now()};
      s.records[job.id]={jobHash,event};return event;
    });
    if(outcome==='unknown_after')throw Error('fixture_interrupted_after_result');
    return signMockMerchEvent(event,key);
  },async lookup(attempt:string){
    const event=await tx(s=>s.records[attempt]?.event);if(!event)return undefined;
    // A fresh signed attestation from the stored receipt, never a new charge/refund.
    return signMockMerchEvent({...event,event:randomUUID(),at:now()},key);
  }};
}
