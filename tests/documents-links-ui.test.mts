import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React,{act} from 'react';
import * as jsx from 'react/jsx-runtime';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import * as drive from '../src/lib/drive-browser.ts';
function component(path:string,deps:Record<string,unknown>) {
  const exports:Record<string,unknown>={};const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','exports',code)((name:string)=>{if(name.endsWith('.css'))return {};if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;assert.ok(name in deps,name);return deps[name];},exports);return exports;
}
async function mount(type:React.ElementType,props:Record<string,unknown>) {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://localhost/'});
  const saved=new Map<string,PropertyDescriptor|undefined>();for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,KeyboardEvent:dom.window.KeyboardEvent,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
  const root=createRoot(dom.window.document.getElementById('root')!);await act(async()=>root.render(React.createElement(type,props)));
  return {dom,doc:dom.window.document,async click(text:string){const button=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent?.includes(text));assert.ok(button,text);await act(async()=>button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));},async close(){await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}};
}
const rootFolder={id:'root',name:'TESTFIXTURE — NIET PUBLICEREN',mimeType:'application/vnd.google-apps.folder',driveId:'shared',parents:[],trashed:false};
const child={...rootFolder,id:'child',name:'Eventmappen',parents:['root']};
test('Drive UI: lazy expansion, nested folders, deduplicated more pages, stale error and retry',async()=>{
  const calls:unknown[][]=[];let fail=false;
  const read=async(id:string,token?:string)=>{calls.push([id,token]);if(fail)throw Error('denied');return {folder:id==='root'?rootFolder:child,files:id==='root'?[child]:[],nextPageToken:id==='root'&&!token?'next':null,incomplete:false,checkedAt:'2026-11-15T00:00:00Z'};};
  const api=component('src/components/drive-browser-panel.tsx',{'@/lib/drive-browser':drive,'@/app/app/documenten/drive-actions':{readDriveBrowserPage:()=>{throw Error('no live');},linkDriveBrowserFile:()=>{}},'@/components/image-link-preview':{ImageLinkPreview:()=>null}});
  const ui=await mount(api.DriveBrowserPanel as React.ElementType,{rootId:'root',options:[],linksEnabled:false,previewEnabled:false,readPage:read});
  try{
    assert.equal(calls.length,0);await ui.click('BESC-documenten');assert.equal(calls.length,1);assert.match(ui.doc.body.textContent!,/Eventmappen/);
    await ui.click('Meer laden');assert.deepEqual(calls[1],['root','next']);assert.equal([...ui.doc.querySelectorAll('button')].filter(b=>b.textContent?.includes('Eventmappen')).length,1);
    await ui.click('Eventmappen');assert.deepEqual(calls[2],['child',undefined]);assert.match(ui.doc.body.textContent!,/Deze map is leeg/);
    fail=true;await ui.click('Vernieuwen');assert.match(ui.doc.body.textContent!,/verouderd/);assert.match(ui.doc.body.textContent!,/Eventmappen/);fail=false;await ui.click('Opnieuw proberen');assert.equal(ui.doc.querySelector('[role=alert]'),null);
  } finally {await ui.close();}
});
test('Drive UI: incomplete empty reply is labeled incomplete and never presented as empty map',async()=>{
  const api=component('src/components/drive-browser-panel.tsx',{'@/lib/drive-browser':drive,'@/app/app/documenten/drive-actions':{},'@/components/image-link-preview':{ImageLinkPreview:()=>null}});
  const ui=await mount(api.DriveBrowserPanel as React.ElementType,{rootId:'root',options:[],linksEnabled:false,previewEnabled:false,readPage:async()=>({folder:rootFolder,files:[],nextPageToken:null,incomplete:true,checkedAt:'2026-11-15T00:00:00Z'})});
  try{await ui.click('BESC-documenten');assert.match(ui.doc.body.textContent!,/onvolledige resultaten/);assert.doesNotMatch(ui.doc.body.textContent!,/Deze map is leeg/);await ui.click('Deze map kiezen');assert.match(ui.doc.body.textContent!,/Dossierkoppelingen zijn nog niet ingeschakeld/);}finally{await ui.close();}
});
test('Image UI: hover, focus and touch click lazily load; Escape, blur and close release object URLs',async()=>{
  let calls=0,revoked=0;const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;URL.createObjectURL=()=> 'blob:test';URL.revokeObjectURL=()=>{revoked++;};
  const api=component('src/components/image-link-preview.tsx',{'@/lib/image-link-preview':{loadImageLinkPreview:async()=>{calls++;return new Blob(['image'],{type:'image/png'});}}});
  const ui=await mount(api.ImageLinkPreview as React.ElementType,{url:'https://images.example.org/test.png',label:'Testbeeld'});
  try{
    assert.equal(calls,0);const button=ui.doc.querySelector('button')!;
    await act(async()=>button.dispatchEvent(new ui.dom.window.MouseEvent('mouseover',{bubbles:true})));assert.equal(calls,1);assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(ui.doc.querySelector('img')?.alt,'Testbeeld');
    await act(async()=>ui.doc.dispatchEvent(new ui.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(revoked,1);
    await act(async()=>button.dispatchEvent(new ui.dom.window.FocusEvent('focusin',{bubbles:true})));assert.equal(calls,2);
    await act(async()=>button.dispatchEvent(new ui.dom.window.FocusEvent('focusout',{bubbles:true,relatedTarget:ui.doc.body})));assert.equal(button.getAttribute('aria-expanded'),'false');
    await ui.click('Bekijk afbeelding');assert.equal(calls,3);await ui.click('Sluiten');assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(revoked,3);
  }finally{await ui.close();URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;}
});
