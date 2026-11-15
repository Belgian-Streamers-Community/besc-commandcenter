import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,lstat,open,rename,unlink,rmdir} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {emptyMerchState,merchFixtureOrganization,type MerchState,type MerchTransaction} from './merch-chain.ts';

export type FixtureTransaction<T>=<R>(operation:(state:T)=>R)=>Promise<R>;
// Local fixture implementation, separate from business data and the real provider.
// An abandoned lock is never removed automatically. No migration or DB client.
export class MerchFixtureFile<T> {
  private directory:string;private key:Buffer;private name:'orders'|'provider';private initial:()=>T;private validate:(input:unknown)=>T;
  private tail:Promise<unknown>=Promise.resolve();
  constructor(directory:string,key:Buffer,name:'orders'|'provider',initial:()=>T,validate:(input:unknown)=>T){
    if(!isAbsolute(directory)||key.length!==32)throw Error('merch_local_storage_configuration');
    this.directory=directory;this.key=Buffer.from(key);this.name=name;this.initial=initial;this.validate=validate;
  }
  private async load(){
    const file=join(this.directory,`merch-${this.name}.encrypted.json`);let raw:string;
    try{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>10000000)throw Error('merch_storage_unsafe');raw=await readFile(file,'utf8');}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return this.initial();throw error;}
    try{const e=JSON.parse(raw);if(e.format!==1)throw Error();
      const decipher=createDecipheriv('aes-256-gcm',this.key,Buffer.from(e.iv,'base64url'));
      decipher.setAAD(Buffer.from(`besc-merch-${this.name}-local-v1`));decipher.setAuthTag(Buffer.from(e.tag,'base64url'));
      return this.validate(JSON.parse(Buffer.concat([decipher.update(Buffer.from(e.data,'base64url')),decipher.final()]).toString('utf8')));
    }catch{throw Error('merch_storage_unreadable');}
  }
  private async save(state:T){
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(`besc-merch-${this.name}-local-v1`));
    const data=Buffer.concat([cipher.update(JSON.stringify(state),'utf8'),cipher.final()]);
    const envelope=JSON.stringify({format:1,iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),data:data.toString('base64url')});
    const temporary=join(this.directory,`merch-${this.name}-${randomUUID()}.tmp`);
    try{const f=await open(temporary,'wx',0o600);try{await f.writeFile(envelope);await f.sync();}finally{await f.close();}await rename(temporary,join(this.directory,`merch-${this.name}.encrypted.json`));}
    finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  transaction:FixtureTransaction<T>=async operation=>{
    const run=async()=>{
      await mkdir(this.directory,{recursive:true,mode:0o700});const info=await lstat(this.directory);if(!info.isDirectory()||info.isSymbolicLink())throw Error('merch_storage_directory_unsafe');
      const lock=join(this.directory,`merch-${this.name}.lock`);
      try{await mkdir(lock,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw Error('merch_storage_busy');throw error;}
      try{const state=await this.load(),result=operation(state);if(result instanceof Promise)throw Error('merch_transaction_must_be_synchronous');await this.save(state);return result;}
      finally{await rmdir(lock);}
    };
    const next=this.tail.then(run,run);this.tail=next.catch(()=>{});return next;
  };
}
export function localMerchTransaction(directory:string,key:Buffer):MerchTransaction {
  return new MerchFixtureFile(directory,key,'orders',emptyMerchState,input=>{
    if(!input||typeof input!=='object')throw Error();const s=input as MerchState;
    if(s.version!==1||s.organizationId!==merchFixtureOrganization||typeof s.paused!=='boolean'||!s.events||!Array.isArray(s.orders)||!Array.isArray(s.jobs)||!Array.isArray(s.variants)||!Array.isArray(s.audit))throw Error();return s;
  }).transaction;
}
