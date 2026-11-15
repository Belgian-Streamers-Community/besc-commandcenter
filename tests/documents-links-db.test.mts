import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {f1Database,q} from './helpers/f1-database.mts';
let f:Awaited<ReturnType<typeof f1Database>>;
before(async()=>{f=await f1Database();});after(async()=>{await f?.db.close();});
beforeEach(async()=>{await f.owner();await f.db.exec('begin');});afterEach(async()=>{await f.owner();await f.db.exec('rollback');});
function insert(kind:string,url='https://images.example.org/'+randomUUID(),org=f.ids.org,entity=f.ids.partner){return `insert into public.record_links(organization_id,entity_type,entity_id,label,url,link_type,created_by)values(${q(org)},'partner',${q(entity)},'TESTFIXTURE — NIET PUBLICEREN',${q(url)},${q(kind)},${q(f.ids.admin)})`;}
async function denied(sql:string){await f.db.exec('savepoint denied');try{await assert.rejects(f.db.exec(sql));}finally{await f.db.exec('rollback to savepoint denied;release savepoint denied');}}
test('Documents DB: all six old kinds and three new kinds save and receive canonical document identity',async()=>{
  await f.actor(f.ids.admin);
  for(const kind of ['reference','publication','briefing','document','website','other','image','folder','application'])await f.db.exec(insert(kind));
  const result=await f.db.query<{link_type:string;document_id:string}>(`select link_type,document_id from public.record_links where organization_id=${q(f.ids.org)} and entity_id=${q(f.ids.partner)}`);assert.equal(result.rows.length,9);assert.ok(result.rows.every(r=>r.document_id));
  await f.db.exec(insert('image','https://images.example.org/meeting',f.ids.org,f.ids.meeting).replace("'partner'","'meeting'"));
});
test('Documents DB: canonical dedup rejects same dossier URL, permits shared document across dossiers',async()=>{
  await f.actor(f.ids.admin);const url='https://drive.google.com/drive/folders/folder123';await f.db.exec(insert('folder',url));await denied(insert('folder',url));
  const other=randomUUID();await f.owner();await f.db.exec(`insert into public.partners(id,organization_id,name,created_by)values(${q(other)},${q(f.ids.org)},'TESTFIXTURE B',${q(f.ids.admin)})`);await f.actor(f.ids.admin);await f.db.exec(insert('folder',url,f.ids.org,other));
  const result=await f.db.query<{n:number}>(`select count(distinct document_id)::int n from public.record_links where url=${q(url)}`);assert.equal(result.rows[0].n,1);
});
test('Documents DB: rejects unknown kind and another organization write',async()=>{await f.actor(f.ids.admin);await denied(insert('executable'));await denied(insert('image','https://example.org/a',f.ids.otherOrg));});
test('Documents DB: ordinary member cannot add or edit image/folder/application links',async()=>{
  await f.actor(f.ids.admin);await f.db.exec(insert('image'));
  await f.actor(f.ids.volunteer);for(const kind of ['image','folder','application'])await denied(insert(kind));
  const changed=await f.db.query<{id:string}>(`update public.record_links set label='forbidden' where organization_id=${q(f.ids.org)} returning id`);assert.equal(changed.rows.length,0);
});
test('Documents DB: other organization cannot read dossier links and unlink does not delete the canonical document',async()=>{
  await f.actor(f.ids.admin);await f.db.exec(insert('folder'));const before=await f.db.query<{id:string;document_id:string}>(`select id,document_id from public.record_links where entity_id=${q(f.ids.partner)}`);const link=before.rows[0];
  // Fixture "other" is also initially a member of the first org. Remove that
  // membership inside this rolled-back test before checking organization isolation.
  await f.owner();await f.db.exec(`delete from public.organization_members where organization_id=${q(f.ids.org)} and user_id=${q(f.ids.other)}`);await f.actor(f.ids.other);assert.equal((await f.db.query(`select id from public.record_links where id=${q(link.id)}`)).rows.length,0);
  await f.actor(f.ids.admin);await f.db.exec(`delete from public.record_links where id=${q(link.id)}`);assert.equal((await f.db.query(`select id from public.document_registry where id=${q(link.document_id)}`)).rows.length,1);
});
test('Documents DB: deleted dossier cannot receive a new link',async()=>{await f.owner();await f.db.exec(`update public.partners set deleted_at=clock_timestamp() where id=${q(f.ids.partner)}`);await f.actor(f.ids.admin);await denied(insert('image'));});
