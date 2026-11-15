import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createDriveBrowser, googleDriveBrowserPort, driveBrowserKind, driveBrowserUrl, type DriveBrowserFile} from '../src/lib/drive-browser.ts';
import {dossierLinkTypes, imagePreviewUrl, safeDossierLink, dossierImagePreviewSource} from '../src/lib/dossier-link-types.ts';
import {loadImageLinkPreview} from '../src/lib/image-link-preview.ts';
import {readDriveImagePreview} from '../src/lib/drive-image-preview.ts';
const folder = 'application/vnd.google-apps.folder';
const root: DriveBrowserFile = {id:'root',name:'TESTFIXTURE — NIET PUBLICEREN',mimeType:folder,driveId:'shared',parents:[],trashed:false};
const child: DriveBrowserFile = {...root,id:'child',name:'Projecten',parents:['root']};
const image: DriveBrowserFile = {...child,id:'image',name:'Proef.png',mimeType:'image/png',parents:['child']};
function fixture(patch: Record<string,unknown> = {}, result: unknown = {files:[child],incompleteSearch:false}) {
  const rows:Record<string,unknown>={root,child,image,...patch}; const calls:unknown[][]=[];
  const browser=createDriveBrowser({get:async id=>{calls.push(['get',id]);return rows[id];},list:async(id,token)=>{calls.push(['list',id,token]);return result;}},{rootId:'root',driveId:'shared'});
  return {browser,calls};
}
test('Drive browser: reads only selected folder and returns explicit complete empty state',async()=>{
  const f=fixture();assert.equal(f.calls.length,0);const p=await f.browser.page('root');assert.deepEqual(p.files,[child]);assert.equal(p.nextPageToken,null);assert.equal(p.incomplete,false);assert.ok(Date.parse(p.checkedAt));assert.deepEqual(f.calls,[['get','root'],['list','root',undefined]]);
  const empty=await fixture({}, {files:[],incompleteSearch:false}).browser.page('child');assert.equal(empty.files.length,0);assert.equal(empty.incomplete,false);
});
test('Drive browser: checks ancestry again on every file selection',async()=>{
  const f=fixture();assert.equal((await f.browser.file('image')).id,'image');assert.deepEqual(f.calls,[['get','image'],['get','child'],['get','root']]);await f.browser.file('image');assert.equal(f.calls.length,6);
});
for(const [name,patch]of Object.entries({outside:{child:{...child,parents:[]}},foreign:{child:{...child,driveId:'other'}},trashed:{child:{...child,trashed:true}},cycle:{child:{...child,parents:['child']}},wrongId:{child:{...child,id:'wrong'}},invalidParent:{root:{...root,mimeType:'text/plain'}}})) {
  test(`Drive browser: rejects ${name} before listing children`,async()=>{const f=fixture(patch);await assert.rejects(f.browser.page('child'));assert.ok(!f.calls.some(call=>call[0]==='list'));});
}
test('Drive browser: rejects too deep paths and unsafe ids without transport',async()=>{
  let calls=0;const b=createDriveBrowser({get:async id=>{calls++;return {...child,id,parents:[id+'x']};},list:async()=>{throw Error('no');}},{rootId:'root',driveId:'shared'});await assert.rejects(b.file('deep'),/diep/);assert.equal(calls,40);
  for(const id of ['../root',"x' or trashed = true",'https://evil.test',''])await assert.rejects(b.file(id));assert.equal(calls,40);
});
test('Drive browser: incomplete pages retain cursor and never pretend to be empty complete inventory',async()=>{
  const result:{files:unknown[];incompleteSearch:boolean;nextPageToken?:string}={files:[],incompleteSearch:true,nextPageToken:'opaque token/+'};const f=fixture({}, result);const p=await f.browser.page('root');assert.equal(p.incomplete,true);assert.equal(p.nextPageToken,'opaque token/+');delete result.nextPageToken;await f.browser.page('root',p.nextPageToken!);assert.deepEqual(f.calls.at(-1),['list','root','opaque token/+']);
});
test('Drive browser: handles duplicates, rejects contradictory rows and repeated page cursor',async()=>{
  assert.equal((await fixture({}, {files:[child,child],incompleteSearch:false}).browser.page('root')).files.length,1);
  for(const files of [[child,{...child,name:'Different'}],[{...child,driveId:'other'}],[{...child,parents:['other']}],[{...child,trashed:true}]])await assert.rejects(fixture({}, {files,incompleteSearch:false}).browser.page('root'));
  await assert.rejects(fixture({}, {files:[],incompleteSearch:false,nextPageToken:'same'}).browser.page('root','same'),/herhaalt/);
});
test('Drive browser: shortcuts remain files and are never followed as folders',async()=>{
  const shortcut={...child,mimeType:'application/vnd.google-apps.shortcut'};assert.equal(driveBrowserKind(shortcut),'document');await assert.rejects(fixture({child:shortcut}).browser.page('child'),/mappen/);assert.equal(driveBrowserUrl(child),'https://drive.google.com/drive/folders/child');
});
test('Drive provider: fixed Google GET endpoint, explicit drive corpus and no thumbnail tokens',async()=>{
  const calls:{url:URL;options:RequestInit}[]=[];const port=googleDriveBrowserPort(async()=> 'secret','shared',async(url,options)=>{calls.push({url:new URL(String(url)),options:options!});return Response.json({files:[],incompleteSearch:false});});
  await port.list('child','opaque/+');await port.get('image');
  for(const call of calls){assert.equal(call.url.origin,'https://www.googleapis.com');assert.equal(call.options.method,'GET');assert.equal(call.options.redirect,'error');assert.equal(call.options.cache,'no-store');assert.equal((call.options.headers as Record<string,string>).Authorization,'Bearer secret');assert.doesNotMatch(call.url.href,/secret|thumbnail|permission|alt=media/);}
  assert.equal(calls[0].url.searchParams.get('q'),"'child' in parents and trashed = false");assert.equal(calls[0].url.searchParams.get('corpora'),'drive');assert.equal(calls[0].url.searchParams.get('driveId'),'shared');assert.equal(calls[0].url.searchParams.get('pageSize'),'50');assert.equal(calls[0].url.searchParams.get('pageToken'),'opaque/+');
});
for(const status of [401,403,404,429,500])test(`Drive provider: ${status} never becomes empty success or leaks provider body`,async()=>{
  const port=googleDriveBrowserPort(async()=> 'secret','shared',async()=>new Response('confidential provider payload',{status}));await assert.rejects(port.list('root'),error=>{assert.doesNotMatch(String(error),/confidential|secret/);return true;});
});
test('Drive provider: rejects oversized and malformed replies',async()=>{
  await assert.rejects(googleDriveBrowserPort(async()=> 'secret','shared',async()=>new Response('x'.repeat(256001))).get('root'),/groot/);
  await assert.rejects(googleDriveBrowserPort(async()=> 'secret','shared',async()=>new Response('bad json')).get('root'));
});
test('Dossier links: preserves six old kinds and adds image, folder and application with web URLs only',()=>{
  assert.deepEqual(dossierLinkTypes,['reference','publication','briefing','document','website','other','image','folder','application']);
  for(const url of ['https://example.org/a','http://example.org'])assert.equal(safeDossierLink(url),true);
  for(const url of ['javascript:alert(1)','data:image/png,x','file:///etc/passwd','https://u:p@example.org'])assert.equal(safeDossierLink(url),false);
});
test('Image previews: blocks unsafe/private literal URLs, Google document URLs and custom ports',()=>{
  for(const value of ['http://example.org/a.png','https://localhost/a','https://127.0.0.1/a','https://[::1]/a','https://intranet.local/a','https://drive.google.com/file/d/id/view','https://example.org:8080/a','data:image/png,test'])assert.equal(imagePreviewUrl(value),null,value);
  assert.equal(imagePreviewUrl('https://images.example.org/a.png'),'https://images.example.org/a.png');assert.equal(dossierImagePreviewSource('https://drive.google.com/file/d/test123/view'),'/app/documenten/drive-preview/test123');
});
test('External image previews: only explicit load uses CORS without credentials/referrer and rejects redirects',async()=>{
  let calls=0;const blob=await loadImageLinkPreview('https://images.example.org/a',new AbortController().signal,async(url,options)=>{calls++;assert.equal(options?.credentials,'omit');assert.equal(options?.referrerPolicy,'no-referrer');assert.equal(options?.redirect,'error');assert.equal(options?.mode,'cors');return new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}});});assert.equal(calls,1);assert.equal(blob.type,'image/png');
  await assert.rejects(loadImageLinkPreview('https://127.0.0.1/a',new AbortController().signal,async()=>{throw Error('must not fetch');}),/veilige/);
});
test('Image previews: rejects HTML/SVG, oversized content and provider failures; internal requests stay same-origin',async()=>{
  for(const type of ['image/svg+xml','text/html'])await assert.rejects(loadImageLinkPreview('https://images.example.org/a',new AbortController().signal,async()=>new Response('<svg/>',{headers:{'content-type':type}})));
  await assert.rejects(loadImageLinkPreview('https://images.example.org/a',new AbortController().signal,async()=>new Response(new Uint8Array(5_000_001),{headers:{'content-type':'image/png'}})),/groot/);
  await loadImageLinkPreview('/app/documenten/drive-preview/image',new AbortController().signal,async(_url,options)=>{assert.equal(options?.credentials,'same-origin');return new Response(new Uint8Array([1]),{headers:{'content-type':'image/png'}});});
});
test('Drive image: rechecks root and re-encodes bounded raster bytes; never exposes Google URL/token or metadata',async()=>{
  const png=await sharp({create:{width:2,height:2,channels:3,background:'#ff0000'}}).png().toBuffer();const f=fixture();
  const bytes=await readDriveImagePreview('image',f.browser,async()=> 'secret',async(url,options)=>{assert.equal(String(url),'https://www.googleapis.com/drive/v3/files/image?alt=media&supportsAllDrives=true');assert.equal(options?.redirect,'error');return new Response(new Uint8Array(png),{headers:{'content-type':'image/png'}});});
  await assert.rejects(readDriveImagePreview('image',fixture().browser,async()=> 'secret',async()=>new Response('<svg xmlns="http://www.w3.org/2000/svg"/>',{headers:{'content-type':'image/png'}})),/bestandstype/);
  const meta=await sharp(bytes).metadata();assert.equal(meta.format,'png');assert.equal(meta.width,2);assert.equal(meta.exif,undefined);assert.deepEqual(f.calls,[['get','image'],['get','child'],['get','root']]);
});
test('Drive image: denies deleted/outside/moved/unsupported files before fetching bytes',async()=>{
  for(const patch of [{image:{...image,trashed:true}},{child:{...child,parents:[]}},{image:{...image,mimeType:'image/svg+xml'}}])await assert.rejects(readDriveImagePreview('image',fixture(patch).browser,async()=>{throw Error('must not get token');},async()=>{throw Error('must not fetch');}));
});
