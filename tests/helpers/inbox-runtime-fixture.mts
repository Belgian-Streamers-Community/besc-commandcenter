import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as control from '../../src/lib/inbox-control.ts';
import * as pages from '../../src/lib/resumable-inbox-page.ts';
import * as worker from '../../src/lib/resumable-inbox-worker.ts';
import * as protocol from '../../src/lib/meta-inbox-protocol.ts';
const native=createRequire(import.meta.url);
export function loadInboxModule<T>(file:string,mocks:Record<string,unknown>,env:Record<string,string|undefined>={},transport:typeof fetch=async()=>{throw Error('Ambient provider forbidden');}){
 const compiled={exports:{}};
 const defaults={'server-only':{},'./inbox-control':control,'./resumable-inbox-page':pages,'./resumable-inbox-worker':worker,'./meta-inbox-protocol':protocol,'@/lib/inbox-control':control};
 runInNewContext(ts.transpileModule(readFileSync(new URL('../../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:compiled,exports:compiled.exports,require:(name:string)=>name in mocks?mocks[name]:name in defaults?defaults[name as keyof typeof defaults]:native(name),process:{env},fetch:transport,URL,Request,Response,Headers,AbortSignal,AbortController,TextDecoder,Uint8Array,setTimeout,clearTimeout,Date,console,FormData,Error});
 return compiled.exports as T;
}
