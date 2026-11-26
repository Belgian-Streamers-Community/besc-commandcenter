import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { f1Database, q, j } from './helpers/f1-database.mts';

let f: Awaited<ReturnType<typeof f1Database>>;
before(async () => { f = await f1Database(); });
after(async () => { await f?.db.close(); });
beforeEach(async () => { await f.owner(); await f.db.exec('begin'); });
afterEach(async () => { await f.db.exec('rollback'); await f.owner(); });

const posts = (event?: string) => [
  { ref: 'metricool:fixture-1', title: 'TESTFIXTURE COASTLAN, wat was je geweldig', status: 'published', post_type: 'recap', published_at: '2026-11-01T23:40:00+01:00', scheduled_at: '2026-11-01T23:40:00+01:00', event_id: event ?? null, notes: 'Geïmporteerd uit Metricool',
    channels: [
      { platform: 'Facebook', status: 'published', copy: 'Tekst FB', publication_url: 'https://facebook.example.invalid/1', image_url: 'https://static.example.invalid/a.png', published_at: '2026-11-01T23:40:00+01:00', stats: { views: 34, reach: 15, likes: 2, comments: 1, shares: 0 }, stats_measured_at: '2026-11-25T12:00:00+01:00' },
      { platform: 'Instagram', status: 'published', copy: 'Tekst IG', publication_url: 'https://instagram.example.invalid/p/1', stats: { views: 279, reach: 125, likes: 10, comments: 2, saves: 0 } },
    ] },
  { ref: 'pdf:instagram:2024-10-13T17:49', title: 'TESTFIXTURE Lach@ton reel', status: 'published', post_type: 'clip', channels: [{ platform: 'Instagram', status: 'published', copy: 'Ingekort...', stats: { views: 472 } }] },
  { ref: 'metricool:fixture-bad', title: 'TESTFIXTURE foutieve post', status: 'published', channels: [{ platform: 'MySpace', status: 'published' }] },
];
async function run(actor: string, payload: unknown) {
  return (await f.db.query<{ r: { total: number; created: number; channels: number; skipped: number; failed: { ref: string; error: string }[] } }>(`select private.social_history_import(${q(f.ids.org)},${q(actor)},${j(payload)}) as r`)).rows[0].r;
}

test('import maakt gepubliceerde historiek met kanalen en cijfers, slaat foute posts apart over en is idempotent', async () => {
  const r = await run(f.ids.admin, posts(f.ids.event));
  assert.equal(r.total, 3); assert.equal(r.created, 2); assert.equal(r.channels, 3); assert.equal(r.skipped, 0);
  assert.equal(r.failed.length, 1); assert.equal(r.failed[0].ref, 'metricool:fixture-bad');
  const row = (await f.db.query<{ status: string; review_version: number; event_id: string; imported_at: string | null; platform: string; n: number; likes: number; saves: number }>(
    `select p.status,p.review_version,p.event_id,p.imported_at,p.platform,(select count(*)::int from public.social_post_variants v where v.social_post_id=p.id) n,
      (select stat_likes from public.social_post_variants v where v.social_post_id=p.id and platform='Facebook') likes,
      (select stat_saves from public.social_post_variants v where v.social_post_id=p.id and platform='Instagram') saves
     from public.social_posts p where p.import_ref='metricool:fixture-1'`)).rows[0];
  assert.equal(row.status, 'published'); assert.equal(row.review_version, 0); assert.equal(row.event_id, f.ids.event);
  assert.ok(row.imported_at); assert.equal(row.platform, 'Facebook'); assert.equal(row.n, 2); assert.equal(row.likes, 2); assert.equal(row.saves, 0);
  const again = await run(f.ids.admin, posts(f.ids.event));
  assert.equal(again.created, 0); assert.equal(again.skipped, 2);
  assert.equal((await f.db.query<{ n: number }>(`select count(*)::int n from public.social_posts where import_ref like 'metricool:fixture%' or import_ref like 'pdf:%'`)).rows[0].n, 2);
});

test('alleen actieve admin/bestuur mag importeren; onbekend event wordt niet gekoppeld', async () => {
  await f.db.exec('savepoint s0');
  await assert.rejects(() => run(f.ids.member, posts()), /social_import_actor_denied/);
  await f.db.exec('rollback to savepoint s0');
  const r = await run(f.ids.chair, [{ ...posts()[1], ref: 'pdf:x:other-event', event_id: '00000000-0000-4000-8000-000000000000' }]);
  assert.equal(r.created, 1);
  assert.equal((await f.db.query<{ e: string | null }>(`select event_id e from public.social_posts where import_ref='pdf:x:other-event'`)).rows[0].e, null);
});

test('buiten de import om kan niemand historiek of import_ref zetten; gewone posts blijven goedkeuring vragen', async () => {
  await f.actor(f.ids.admin);
  await f.db.exec('savepoint s1');
  await assert.rejects(() => f.db.exec(`insert into public.social_posts(organization_id,title,status,created_by,import_ref) values(${q(f.ids.org)},'TESTFIXTURE vervalst','published',${q(f.ids.admin)},'metricool:vals')`), /social_import_only_via_import|social_review_approval_required|row-level security/);
  await f.db.exec('rollback to savepoint s1');
  await assert.rejects(() => f.db.exec(`select set_config('besc.social_history_import','on',true); insert into public.social_posts(organization_id,title,status,created_by,import_ref) values(${q(f.ids.org)},'TESTFIXTURE vervalst','published',${q(f.ids.admin)},'metricool:vals')`), /social_import_only_via_import|social_review_approval_required|row-level security/);
  await f.db.exec('rollback to savepoint s1');
  await f.owner();
});

test('geïmporteerde post: cijfers bijwerken mag, inhoud wijzigen zet hem terug in review', async () => {
  await run(f.ids.admin, posts());
  const id = (await f.db.query<{ id: string }>(`select id from public.social_posts where import_ref='metricool:fixture-1'`)).rows[0].id;
  await f.actor(f.ids.admin);
  await f.db.exec(`update public.social_post_variants set stat_likes=12, stats_measured_at=now(), publication_url='https://facebook.example.invalid/2' where social_post_id=${q(id)} and platform='Facebook'`);
  assert.equal((await f.db.query<{ s: string }>(`select status s from public.social_posts where id=${q(id)}`)).rows[0].s, 'published');
  await f.db.exec(`update public.social_posts set status='published' where id=${q(id)}`);
  assert.equal((await f.db.query<{ s: string }>(`select status s from public.social_posts where id=${q(id)}`)).rows[0].s, 'published');
  await f.db.exec(`update public.social_post_variants set copy='Nieuwe tekst' where social_post_id=${q(id)} and platform='Facebook'`);
  assert.equal((await f.db.query<{ s: string }>(`select status s from public.social_posts where id=${q(id)}`)).rows[0].s, 'review');
  await f.db.exec('savepoint s2');
  await assert.rejects(() => f.db.exec(`update public.social_posts set import_ref='metricool:anders' where id=${q(id)}`), /social_import_ref_immutable|row-level security/);
  await f.db.exec('rollback to savepoint s2');
  await f.owner();
});
