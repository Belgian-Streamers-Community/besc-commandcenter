import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const org = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000002";
const admin = "20000000-0000-4000-8000-000000000001", board = "20000000-0000-4000-8000-000000000002", volunteer = "20000000-0000-4000-8000-000000000003";
const hash = (n: number) => n.toString(16).padStart(64, "0");
const claim = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = readFileSync("supabase/migrations/20260731100000_add_email_templates_and_newsletters.sql", "utf8");
const pick = (name: string) => base.match(new RegExp(`create table public\\.${name} \\([\\s\\S]*?\\n\\);`))![0];

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create role service_role; create schema private;
    create table public.organizations(id uuid primary key, name text);
    create table public.profiles(id uuid primary key);
    create table public.organization_members(organization_id uuid, user_id uuid, role text, status text, primary key(organization_id,user_id));
    create table public.email_templates(id uuid primary key default gen_random_uuid());
    insert into public.organizations values ('${org}','BESC'),('${other}','Ander');
    insert into public.profiles values ('${admin}'),('${board}'),('${volunteer}');
    insert into public.organization_members values ('${org}','${admin}','admin','active'),('${org}','${board}','board','active'),('${org}','${volunteer}','volunteer','active');`);
  await db.exec(pick("mailing_lists") + pick("mailing_subscribers") + pick("newsletters"));
  await db.exec(readFileSync("supabase/migrations/20261122170000_newsletter_per_recipient_delivery.sql", "utf8"));
  const list = (await db.query<{ id: string }>(`insert into public.mailing_lists(organization_id,name,created_by) values($1,'DEV-proef',$2) returning id`, [org, admin])).rows[0].id;
  const sub = async (email: string, status = "subscribed") => (await db.query<{ id: string }>(
    `insert into public.mailing_subscribers(organization_id,mailing_list_id,email,status,consent_basis,consent_at,created_by) values($1,$2,$3,$4,'consent',now(),$5) returning id`,
    [org, list, email, status, admin])).rows[0].id;
  const a = await sub("een@example.invalid"), b = await sub("twee@example.invalid"), c = await sub("drie@example.invalid");
  const news = (await db.query<{ id: string }>(
    `insert into public.newsletters(organization_id,mailing_list_id,title,subject,body_text,status,recipient_count,recipient_snapshot,created_by,approved_by,approved_at)
     values($1,$2,'Titel','Onderwerp','Inhoud','approved',3,array['een@example.invalid','twee@example.invalid','drie@example.invalid'],$3,$4,now()) returning id`,
    [org, list, admin, board])).rows[0].id;
  const server = async (action: string, data: Record<string, unknown> = {}, actor = admin, organization = org) =>
    (await db.query<{ r: Record<string, unknown> }>(`select public.newsletter_delivery_server($1,$2,$3,$4,$5) as r`, [organization, news, actor, action, JSON.stringify(data)])).rows[0].r;
  const status = async () => (await db.query<{ status: string }>(`select status from public.newsletters where id=$1`, [news])).rows[0].status;
  return { db, list, news, a, b, c, server, status };
}

test("nieuwsbrief per ontvanger: voorbereiden, hercontrole, uitkomst en afsluiten", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.server("prepare", {}, volunteer), /newsletter_actor_denied/);
    await assert.rejects(f.server("prepare", {}, admin, other), /newsletter_actor_denied/);
    assert.deepEqual(await f.server("prepare"), { recipients: 3 });
    assert.deepEqual(await f.server("prepare"), { recipients: 3 }, "idempotent");
    assert.equal(await f.status(), "sending");
    // Ingeschreven na goedkeuring: komt niet in de snapshot.
    await f.db.query(`insert into public.mailing_subscribers(organization_id,mailing_list_id,email,status,consent_basis,consent_at,created_by) values($1,$2,'laat@example.invalid','subscribed','consent',now(),$3)`, [org, f.list, admin]);
    // Afgemeld na voorbereiden: wordt bij claim overgeslagen.
    await f.db.query(`update public.mailing_subscribers set status='unsubscribed',unsubscribed_at=now() where id=$1`, [f.c]);
    const sent: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const r = await f.server("claim", { claim: claim(i), token_hash: hash(i) }) as { delivery: { id: string; email: string } | null };
      if (!r.delivery) break;
      await assert.rejects(f.server("claim", { claim: claim(90 + i), token_hash: hash(90 + i) }), /newsletter_attention_required/, "geen tweede claim terwijl één open is");
      await assert.rejects(f.server("record", { delivery: r.delivery.id, claim: claim(99), state: "sent" }), /newsletter_claim_lost/, "andere claim mag niet afronden");
      await f.server("record", { delivery: r.delivery.id, claim: claim(i), state: "sent", provider_id: "msg" + i });
      sent.push(r.delivery.email);
    }
    assert.deepEqual(sent.sort(), ["een@example.invalid", "twee@example.invalid"]);
    const summary = (await f.server("summary")) as { summary: Record<string, number> };
    assert.deepEqual(summary.summary, { sent: 2, skipped: 1 });
    assert.deepEqual(await f.server("finish"), { status: "sent" });
    assert.equal(await f.status(), "sent");
  } finally { await f.db.close(); }
});

test("onzekere uitkomst blokkeert verdere verzending en wordt nooit automatisch herhaald", async () => {
  const f = await fixture();
  try {
    await f.server("prepare");
    const first = await f.server("claim", { claim: claim(1), token_hash: hash(1) }) as { delivery: { id: string } };
    await f.server("record", { delivery: first.delivery.id, claim: claim(1), state: "unknown", error: "timeout" });
    assert.equal(await f.status(), "attention");
    await assert.rejects(f.server("claim", { claim: claim(2), token_hash: hash(2) }), /newsletter_not_sending|newsletter_attention_required/);
    assert.deepEqual(await f.server("finish"), { status: "attention" });
  } finally { await f.db.close(); }
});

test("onderbroken claim wordt expliciet onzeker, niet opnieuw verzonden", async () => {
  const f = await fixture();
  try {
    await f.server("prepare");
    await f.server("claim", { claim: claim(1), token_hash: hash(1) });
    assert.deepEqual(await f.server("mark_stale"), { marked: 0 }, "verse claim blijft staan");
    await f.db.query(`update private.newsletter_deliveries set claimed_at = now() - interval '11 minutes' where state='claimed'`);
    assert.deepEqual(await f.server("mark_stale"), { marked: 1 });
    assert.equal(await f.status(), "attention");
    assert.equal((await f.db.query<{ n: number }>(`select count(*)::int n from private.newsletter_deliveries where state='claimed'`)).rows[0].n, 0);
  } finally { await f.db.close(); }
});

test("niet goedgekeurd of lege selectie wordt geweigerd", async () => {
  const f = await fixture();
  try {
    await f.db.query(`update public.newsletters set status='pending_approval' where id=$1`, [f.news]);
    await assert.rejects(f.server("prepare"), /newsletter_not_approved/);
    await f.db.query(`update public.newsletters set status='approved' where id=$1`, [f.news]);
    await f.db.query(`update public.mailing_subscribers set status='unsubscribed',unsubscribed_at=now()`);
    await assert.rejects(f.server("prepare"), /newsletter_no_recipients/);
    assert.equal(await f.status(), "approved", "transactie teruggedraaid");
  } finally { await f.db.close(); }
});

test("persoonlijke afmeldlink schrijft precies die ontvanger uit; onbekend token doet niets", async () => {
  const f = await fixture();
  try {
    await f.server("prepare");
    const r = await f.server("claim", { claim: claim(1), token_hash: hash(7) }) as { delivery: { id: string; email: string } };
    await f.server("record", { delivery: r.delivery.id, claim: claim(1), state: "sent", provider_id: "m" });
    await f.db.exec(`set role anon`);
    assert.equal((await f.db.query<{ ok: boolean }>(`select public.newsletter_one_click_unsubscribe($1) ok`, [hash(8)])).rows[0].ok, false);
    assert.equal((await f.db.query<{ ok: boolean }>(`select public.newsletter_one_click_unsubscribe($1) ok`, ["niet-hex"])).rows[0].ok, false);
    assert.equal((await f.db.query<{ ok: boolean }>(`select public.newsletter_one_click_unsubscribe($1) ok`, [hash(7)])).rows[0].ok, true);
    assert.equal((await f.db.query<{ ok: boolean }>(`select public.newsletter_one_click_unsubscribe($1) ok`, [hash(7)])).rows[0].ok, true, "herhaling veilig");
    await assert.rejects(f.db.query(`select * from private.newsletter_deliveries`), /permission denied/);
    await assert.rejects(f.db.query(`select public.newsletter_delivery_server($1,$2,$3,'summary','{}')`, [org, f.news, admin]), /permission denied/);
    await f.db.exec(`reset role`);
    const rows = (await f.db.query<{ email: string; status: string }>(`select email,status from public.mailing_subscribers order by email`)).rows;
    // Welke ontvanger eerst geclaimd wordt, hangt af van willekeurige id's: verwacht precies die ene afgemeld.
    assert.deepEqual(rows.map((x) => `${x.email}:${x.status}`), ["drie@example.invalid", "een@example.invalid", "twee@example.invalid"].map((email) => `${email}:${email === r.delivery.email ? "unsubscribed" : "subscribed"}`));
  } finally { await f.db.close(); }
});
