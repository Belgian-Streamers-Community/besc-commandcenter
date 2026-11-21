import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { metaConsentCapability, metaConsentScopes, metaPublishConsentEnabled, metaPublishConsentScopes } from "../src/lib/meta-inbox-consent.ts";
import { instagramPublicationScopes } from "../src/lib/instagram-publication.ts";

const igStats = ["business_management", "pages_show_list", "pages_read_engagement", "instagram_basic", "instagram_manage_insights"];
const page = readFileSync("src/app/app/integraties/social-accounts.tsx", "utf8");
const example = readFileSync("ops/instagram-publication.env.example", "utf8");

test("publicatietoestemming staat standaard uit en vraagt exact 'true'", () => {
  assert.equal(metaPublishConsentEnabled({}), false);
  for (const value of ["1", "TRUE", "yes"]) assert.equal(metaPublishConsentEnabled({ BESC_META_PUBLISH_CONSENT_ENABLED: value }), false);
  assert.equal(metaPublishConsentEnabled({ BESC_META_PUBLISH_CONSENT_ENABLED: "true" }), true);
  assert.match(example, /BESC_META_PUBLISH_CONSENT_ENABLED=false/);
});

test("publish wordt geweigerd zonder eigen schakelaar, ook als de inboxschakelaar aan staat", () => {
  assert.throws(() => metaConsentCapability("publish", {}), /meta_consent_capability_denied/);
  assert.throws(() => metaConsentCapability("publish", { BESC_META_INBOX_CONSENT_ENABLED: "true" }), /meta_consent_capability_denied/);
  assert.throws(() => metaConsentCapability("inbox", { BESC_META_PUBLISH_CONSENT_ENABLED: "true" }), /meta_consent_capability_denied/);
  assert.equal(metaConsentCapability("publish", { BESC_META_PUBLISH_CONSENT_ENABLED: "true" }), "publish");
});

test("publish voegt voor Instagram exact de rechten van de publicatieketen toe en niets anders", () => {
  const scopes = metaConsentScopes("instagram", igStats, "publish");
  assert.deepEqual(scopes.filter((s) => !igStats.includes(s)), ["instagram_content_publish"]);
  for (const required of instagramPublicationScopes) assert.ok(scopes.includes(required), required);
  for (const forbidden of ["instagram_manage_messages", "pages_messaging", "instagram_manage_comments", "pages_manage_posts", "ads_management"]) assert.ok(!scopes.includes(forbidden), forbidden);
  assert.deepEqual(metaConsentScopes("instagram", igStats, "stats"), igStats);
});

test("publish is uitsluitend voor Instagram", () => {
  assert.throws(() => metaPublishConsentScopes("facebook"), /meta_publish_consent_instagram_only/);
  assert.throws(() => metaConsentScopes("facebook", ["pages_read_engagement"], "publish"), /meta_publish_consent_instagram_only/);
});

test("de publicatielink verschijnt alleen bij Instagram, aan-schakelaar en verbonden account", () => {
  assert.match(page, /account\.platform === "instagram" && metaConfig\.configured && publishConsent && account\.status === "connected" \? <Link href=\{`\/app\/integraties\/social\/meta\/start\?account=\$\{account\.id\}&rechten=publish`\}>Publicatierechten aanvragen via Meta<\/Link>/);
  assert.match(page, /metaPublishConsentEnabled\(process\.env\)/);
});
