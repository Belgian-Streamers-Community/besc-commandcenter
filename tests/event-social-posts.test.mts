import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { safePublicationUrl, socialPostMomentLabel, socialPostStatusLabel, socialPostTypeLabel, sortEventSocialPosts, eventSocialPostColumns } from "../src/lib/event-social-posts.ts";

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
  assert.match(report, /safePublicationUrl\(item\.publication_url\)/);
  assert.match(exportRoute, /\["Social posts"\]/);
  assert.equal(eventSocialPostColumns.includes("copy"), false, "geen posttekst in overzichten of export");
});
