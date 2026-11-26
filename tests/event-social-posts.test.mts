import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { safePublicationUrl, socialPostMomentLabel, socialPostStatusLabel, socialPostTypeLabel, sortEventSocialPosts, eventSocialPostColumns, eventSocialPostChannels, eventSocialPostMoment } from "../src/lib/event-social-posts.ts";
import { activeChannelRows, channelTabId, toggleSocialChannel, channelHasStats, isSocialCustomTab, socialChannels } from "../src/lib/social-post-channels.ts";

const panel = readFileSync("src/components/event-social-posts-panel.tsx", "utf8");
const eventPage = readFileSync("src/app/app/events/[id]/page.tsx", "utf8");
const report = readFileSync("src/app/app/rapportage/events/[id]/page.tsx", "utf8");
const exportRoute = readFileSync("src/app/app/rapportage/events/[id]/export/route.ts", "utf8");

test("statussen en posttypes gebruiken de Nederlandse labels van Social planning", () => {
  assert.equal(socialPostStatusLabel("scheduled"), "Gepland");
  assert.equal(socialPostStatusLabel("published"), "Gepubliceerd");
  assert.equal(socialPostStatusLabel(null), "Onbekend");
  assert.equal(socialPostStatusLabel("onbekend_type"), "onbekend_type");
  assert.equal(socialPostTypeLabel("recap"), "Recap");
  assert.equal(socialPostTypeLabel(null), "");
});

test("moment toont publicatie vóór planning en meldt een ontbrekend moment", () => {
  assert.match(socialPostMomentLabel({ scheduled_at: "2026-10-28T18:00:00Z", published_at: null }), /^Gepland /);
  assert.match(socialPostMomentLabel({ scheduled_at: "2026-10-28T18:00:00Z", published_at: "2026-10-28T18:05:00Z" }), /^Gepubliceerd /);
  assert.equal(socialPostMomentLabel({ scheduled_at: null, published_at: null }), "Geen publicatiemoment");
});

test("posts staan chronologisch, zonder moment achteraan, zonder de invoer te wijzigen", () => {
  const input = [
    { title: "Zonder moment", scheduled_at: null, published_at: null },
    { title: "Recap", scheduled_at: "2026-11-02T10:00:00Z", published_at: null },
    { title: "Teaser", scheduled_at: "2026-10-20T10:00:00Z", published_at: "2026-10-20T10:01:00Z" },
    { title: "Ongeldige datum", scheduled_at: "geen-datum", published_at: null },
  ];
  const sorted = sortEventSocialPosts(input).map((post) => post.title);
  assert.deepEqual(sorted, ["Teaser", "Recap", "Ongeldige datum", "Zonder moment"]);
  assert.equal(input[0].title, "Zonder moment");
});

test("publicatielinks worden alleen als http(s) getoond", () => {
  assert.equal(safePublicationUrl("https://www.instagram.com/p/abc/"), "https://www.instagram.com/p/abc/");
  assert.equal(safePublicationUrl("javascript:alert(1)"), null);
  assert.equal(safePublicationUrl("geen url"), null);
  assert.equal(safePublicationUrl(null), null);
});

test("eventdossier toont gekoppelde social posts in Communicatie met een voorgevulde toevoegknop", () => {
  assert.match(eventPage, /import \{ EventSocialPostsPanel \} from "@\/components\/event-social-posts-panel"/);
  assert.match(eventPage, /activeTab === "communicatie"[\s\S]*<EventSocialPostsPanel eventId=\{id\}\/>/);
  assert.match(panel, /\.from\("social_posts"\)[\s\S]*\.eq\("organization_id", membership\.organization_id\)[\s\S]*\.eq\("event_id", eventId\)[\s\S]*\.is\("deleted_at", null\)/);
  assert.match(panel, /hasPermission\(membership, "manageOrganization"\)/);
  assert.match(panel, /canCreate && <Link className="row-action" href=\{`\/app\/events\/\$\{eventId\}\?nieuw=social`\}>/);
  assert.match(panel, /href=\{`\/app\/social\/\$\{post\.id\}`\}/);
});

test("eventrapport en export nemen de gekoppelde, niet-gearchiveerde social posts op", () => {
  for (const source of [report, exportRoute]) {
    assert.match(source, /\.from\("social_posts"\)\.select\(eventSocialPostColumns\)\.eq\("organization_id",org\)\.eq\("event_id",id\)\.is\("deleted_at",null\)\.neq\("status","archived"\)/);
  }
  assert.match(report, /Social posts rond dit event/);
  assert.match(report, /safePublicationUrl\(channel\.publication_url\)/);
  assert.match(exportRoute, /\["Social posts"\]/);
  assert.equal(eventSocialPostColumns.includes("copy"), false, "geen posttekst in overzichten of export");
  assert.match(eventSocialPostColumns, /social_post_variants\(platform,status,scheduled_at,published_at,publication_url\)/);
});

test("kanalen komen uit de varianten, in vaste volgorde, en het vroegste moment telt", () => {
  const post = { scheduled_at: null, published_at: null, social_post_variants: [
    { platform: "Discord", status: "scheduled", scheduled_at: "2026-11-03T10:00:00Z", published_at: null, publication_url: null },
    { platform: "Instagram", status: "published", scheduled_at: "2026-11-02T10:00:00Z", published_at: "2026-11-02T10:05:00Z", publication_url: "https://www.instagram.com/p/x/" },
  ] };
  assert.deepEqual(eventSocialPostChannels(post).map((c) => c.platform), ["Instagram", "Discord"]);
  assert.deepEqual(eventSocialPostMoment(post), { published_at: "2026-11-02T10:05:00Z", scheduled_at: "2026-11-02T10:00:00Z" });
  assert.deepEqual(eventSocialPostChannels({ social_post_variants: null }), []);
});

function draft(rows: { platform: string; base?: boolean; deleted?: boolean }[] = []) {
  return { kind: "social", id: "post", base: null, values: { status: "review" }, parts: { social_post_variants: rows.map((row, index) => ({ localId: `l${index}`, id: `i${index}`, values: { platform: row.platform, copy: "tekst" }, base: row.base ? { platform: row.platform } : null, deleted: Boolean(row.deleted) })) } };
}

test("kanaal aanzetten maakt een rij met de poststatus; uit- en weer aanzetten behoudt de ingevulde tekst", () => {
  let d = toggleSocialChannel(draft(), "LinkedIn", true, () => "nieuw", { status: "idea" });
  assert.equal(d.parts.social_post_variants.length, 1);
  assert.deepEqual(d.parts.social_post_variants[0].values, { status: "review", platform: "LinkedIn" });
  d = toggleSocialChannel(draft([{ platform: "X", base: true }]), "X", false, () => "x");
  assert.equal(d.parts.social_post_variants[0].deleted, true);
  assert.equal(activeChannelRows(d).length, 0);
  d = toggleSocialChannel(d, "X", true, () => "x");
  assert.equal(d.parts.social_post_variants[0].deleted, false);
  assert.equal(d.parts.social_post_variants[0].values.copy, "tekst");
  assert.equal(d.parts.social_post_variants.length, 1);
});

test("kanaaltabbladen volgen de vaste kanaalvolgorde en Google Business is beschikbaar", () => {
  const rows = activeChannelRows(draft([{ platform: "Twitch" }, { platform: "X" }, { platform: "Instagram", deleted: true }, { platform: "Google Business" }]));
  assert.deepEqual(rows.map((row) => row.values.platform), ["X", "Google Business", "Twitch"]);
  assert.equal(channelTabId(rows[0]), "kanaal-l1");
  assert.ok(isSocialCustomTab("kanaal-l1") && isSocialCustomTab("statistieken") && !isSocialCustomTab("algemeen"));
  assert.deepEqual([...socialChannels], ["X", "Facebook", "Instagram", "Threads", "LinkedIn", "Google Business", "TikTok", "YouTube", "Discord", "Twitch"]);
  assert.equal(channelHasStats({ stat_likes: 0 }), true, "0 is een ingevuld cijfer");
  assert.equal(channelHasStats({ stat_likes: null, stat_reach: "" }), false);
});
