import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseSocialImport, summarizeSocialImport } from "../src/lib/social-history-import.ts";

const ok = { format: "besc-social-history-v1", source: "test", posts: [
  { ref: "metricool:1", title: "TESTFIXTURE post", status: "published", channels: [{ platform: "Facebook", copy: "x", stats: { likes: 0 } }, { platform: "Google Business" }] },
] };

test("geldig bestand wordt aanvaard en samengevat", () => {
  const r = parseSocialImport(JSON.stringify(ok));
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(summarizeSocialImport(r.file), { posts: 1, channels: { Facebook: 1, "Google Business": 1 }, withStats: 1, linkedToEvent: 0 });
});

test("ongeldige bestanden worden met een Nederlandse melding geweigerd", () => {
  assert.match((parseSocialImport("{niet json") as { error: string }).error, /geen geldige JSON/);
  assert.equal(parseSocialImport(JSON.stringify({ ...ok, format: "iets" })).ok, false);
  assert.equal(parseSocialImport(JSON.stringify({ ...ok, posts: [{ ...ok.posts[0], ref: "Hoofdletter:1" }] })).ok, false);
  assert.equal(parseSocialImport(JSON.stringify({ ...ok, posts: [{ ...ok.posts[0], channels: [{ platform: "MySpace" }] }] })).ok, false);
  assert.equal(parseSocialImport(JSON.stringify({ ...ok, posts: [{ ...ok.posts[0], channels: [{ platform: "X" }, { platform: "X" }] }] })).ok, false);
  assert.equal(parseSocialImport(JSON.stringify({ ...ok, posts: [{ ...ok.posts[0], channels: [{ platform: "X", publication_url: "javascript:alert(1)" }] }] })).ok, false);
  assert.equal(parseSocialImport(JSON.stringify({ ...ok, posts: [{ ...ok.posts[0], channels: [{ platform: "X", stats: { likes: -1 } }] }] })).ok, false);
  assert.match((parseSocialImport(JSON.stringify({ ...ok, posts: [ok.posts[0], ok.posts[0]] })) as { error: string }).error, /Dubbele verwijzing/);
});

test("importpagina en actie zijn alleen voor admin/bestuur en gebruiken de servertoegang", () => {
  const page = readFileSync("src/app/app/social/importeren/page.tsx", "utf8");
  const action = readFileSync("src/app/app/social/importeren/actions.ts", "utf8");
  for (const source of [page, action]) assert.match(source, /membership\.role !== "admin" && membership\.role !== "board"/);
  assert.match(action, /createAdminClient\(\)\.rpc\("social_history_import", \{ p_org: membership\.organization_id, p_actor: user\.id, p_posts: check\.file\.posts \}\)/);
  assert.match(action, /file\.size > SOCIAL_IMPORT_MAX_BYTES/);
  const social = readFileSync("src/app/app/social/page.tsx", "utf8");
  assert.match(social, /href:'\/app\/social\/importeren',label:'Historiek importeren'/);
  assert.match(social, /<OperationalModulePage module="social" searchParams=\{searchParams\} headerLinks=\{headerLinks\}\/>/);
  assert.doesNotMatch(social, /<nav/, "extra koppelingen staan in de paginakop, niet los boven de app");
});

test("socialkalender en kanaalkaarten volgen het thema (leesbaar in donkere modus)", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /\.social-calendar>a\{background:var\(--theme-surface,#fff\)/);
  assert.doesNotMatch(css, /\.social-calendar>a\{background:#fff/);
  assert.match(readFileSync("src/components/operational-module-page.tsx", "utf8"), /headerLinks\.map\(\(link\) =>/);
});
