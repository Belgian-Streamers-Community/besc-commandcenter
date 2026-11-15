import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,lstat,open,rename,unlink,rmdir} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {emptyNewsletterState,type NewsletterState,type NewsletterTransaction} from './newsletter-chain.ts';

// Explicit local fixture storage only. The key is supplied by the caller and never written.
// A persistent lock is intentionally not broken after a process crash: inspect first.
export class LocalNewsletterStore {
  private tail:Promise<unknown>=Promise.resolve();
  private directory:string;
  private key:Buffer;
  constructor(directory:string,key:Buffer) {
    if(!isAbsolute(directory)||key.length!==32)throw Error('newsletter_local_storage_configuration');
    this.directory=directory;this.key=Buffer.from(key);
  }
  private async plainDirectory() {
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const info=await lstat(this.directory);
    if(!info.isDirectory()||info.isSymbolicLink())throw Error('newsletter_storage_directory_unsafe');
  }
  private async load():Promise<NewsletterState> {
    const file=join(this.directory,'newsletter.encrypted.json');
    let raw:string;
    try{
      const info=await lstat(file);
      if(!info.isFile()||info.isSymbolicLink()||info.size>10000000)throw Error('newsletter_storage_unsafe');
      raw=await readFile(file,'utf8');
    }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return emptyNewsletterState();throw error;}
    try{
      const e=JSON.parse(raw);
      if(e.format!==1)throw Error();
      const decipher=createDecipheriv('aes-256-gcm',this.key,Buffer.from(e.iv,'base64url'));
      decipher.setAAD(Buffer.from('besc-newsletter-local-v1'));
      decipher.setAuthTag(Buffer.from(e.tag,'base64url'));
      const s=JSON.parse(Buffer.concat([decipher.update(Buffer.from(e.data,'base64url')),decipher.final()]).toString('utf8'));
      if(s.version!==1||s.organizationId!=='newsletter-fixture-org'||!s.list||!['subscribers','confirmations','editions','outbox','audit'].every(k=>Array.isArray(s[k])))throw Error();
      return s;
    }catch{throw Error('newsletter_storage_unreadable');}
  }
  private async save(state:NewsletterState) {
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);
    cipher.setAAD(Buffer.from('besc-newsletter-local-v1'));
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(state),'utf8'),cipher.final()]);
    const envelope=JSON.stringify({format:1,iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),data:encrypted.toString('base64url')});
    const temporary=join(this.directory,`newsletter-${randomUUID()}.tmp`);
    try{
      const file=await open(temporary,'wx',0o600);
      try{await file.writeFile(envelope);await file.sync();}finally{await file.close();}
      await rename(temporary,join(this.directory,'newsletter.encrypted.json'));
    }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  transaction:NewsletterTransaction = async operation => {
    const run=async()=>{
      await this.plainDirectory();const lock=join(this.directory,'newsletter.lock');
      try{await mkdir(lock,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw Error('newsletter_storage_busy');throw error;}
      try{
        const state=await this.load(),result=operation(state);
        if(result instanceof Promise)throw Error('newsletter_transaction_must_be_synchronous');
        await this.save(state);return result;
      }finally{await rmdir(lock);}
    };
    const next=this.tail.then(run,run);this.tail=next.catch(()=>{});return next;
  };
}
