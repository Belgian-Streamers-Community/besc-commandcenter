import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('Meta-leesadapter: bestaande OAuth, statistiekensynchronisatie, inbox, activeringsroutes en migratie blijven exact behouden',()=>{
 const root=new URL('../',import.meta.url),m=JSON.parse(readFileSync(new URL('ops/meta-inbox-reader-local-release.json',root),'utf8'));
 assert.equal(m.base_commit,'8453b0ef161e08b25ff2482c27495b81b697fb6c');assert.equal(m.runtime_default,'off');assert.equal(m.provider_factory_included,true);
 for(const field of ['database_changes_required','migration_added','runtime_factory_included','ambient_fetch','automatic_retry','webhook_added','scheduler_added','oauth_scopes_changed','cloud_apply_authorized','server_deploy_authorized','live_provider_authorized','live_message_read_authorized','activation_authorized','reply_authorized','moderation_authorized','live_contract_verified'])assert.equal(m[field],false,field);
 const controls=JSON.parse(readFileSync(new URL('ops/social-inbox-controls-local-release.json',root),'utf8'));
 assert.deepEqual(controls.superseded_files.map((f:{file:string})=>f.file).sort(),['src/lib/social-inbox.ts','src/app/app/social/inbox/page.tsx','src/app/app/social/inbox/actions.ts'].sort());
 // Later, explicitly recorded opt-in changes keep their own before/after hashes.
 const consent=JSON.parse(readFileSync(new URL('ops/meta-inbox-consent-local-release.json',root),'utf8'));
 assert.equal(consent.runtime_default,'off');assert.equal(consent.default_oauth_scopes_changed,false);
 for(const field of ['comment_or_publication_scopes_added','migration_added','receive_activation_changed','reader_invoked_by_new_code','cloud_apply_authorized','server_deploy_authorized','activation_authorized','meta_consent_authorized','live_message_read_authorized'])assert.equal(consent[field],false,field);
 assert.deepEqual(consent.superseded_files.map((f:{file:string})=>f.file).sort(),['src/lib/meta-integration.ts','src/app/app/integraties/social/meta/start/route.ts','src/app/app/integraties/social/meta/callback/route.ts'].sort());
 const superseded=[...controls.superseded_files,...consent.superseded_files];
 for(const file of m.preserved_files){
  const updated=superseded.find((f:{file:string})=>f.file===file.file);
  if(updated)assert.equal(updated.before_sha256_lf,file.sha256_lf);
  assert.equal(createHash('sha256').update(readFileSync(new URL(file.file,root),'utf8').replaceAll('\r\n','\n')).digest('hex'),updated?.sha256_lf??file.sha256_lf,file.file);
 }
 const used:string[]=[];
 function scan(dir:URL){for(const entry of readdirSync(dir,{withFileTypes:true})){const url=new URL(entry.name+(entry.isDirectory()?'/':''),dir);if(entry.isDirectory())scan(url);else if(/\.[tj]sx?$/.test(entry.name)&&!['meta-inbox-reader.ts','meta-inbox-receive.ts'].includes(entry.name)&&/meta-inbox-(reader|receive)/.test(readFileSync(url,'utf8')))used.push(url.pathname);}}
 scan(new URL('src/',root));assert.deepEqual(used,[],'No application route, timer or runtime may invoke the new reader in this package');
});
