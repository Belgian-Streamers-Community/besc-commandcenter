import {createHash} from 'node:crypto';
import type {MockNewsletterProvider,NewsletterMail} from './newsletter-chain.ts';

// There is deliberately no fetch, Gmail import, token loader or SMTP fallback.
export function mockNewsletterProvider(outcome:'accepted'|'rejected'|'unknown'='accepted'):MockNewsletterProvider {
  return {mode:'mock',async send(mail:Readonly<NewsletterMail>){
    if(!mail.to.endsWith('@example.invalid'))throw Error('newsletter_fixture_address_required');
    if(outcome==='unknown')throw Error('Simulated interrupted provider response');
    if(outcome==='rejected')return {status:'rejected'};
    return {status:'accepted',receipt:`mock-${createHash('sha256').update(mail.id).digest('hex')}`};
  }};
}
