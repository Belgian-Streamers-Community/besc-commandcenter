import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { metaConsentCapability, metaConsentScopes, metaConsentRequiredScopes, metaInboxConsentEnabled, metaInboxConsentScopes } from "../src/lib/meta-inbox-consent.ts";
import { socialInboxCapability } from "../src/lib/social-inbox.ts";

const stats = {
  facebook: ["business_management", "pages_show_list", "pages_read_engagement", "read_insights"],
  instagram: ["business_management", "pages_show_list", "pages_read_engagement", "instagram_basic", "instagram_manage_insights"],
};
const start = readFileSync("src/app/app/integraties/social/meta/start/route.ts", "utf8");
const callback = readFileSync("src/app/app/integraties/social/meta/callback/route.ts", "utf8");
const meta = readFileSync("src/lib/meta-integration.ts", "utf8");
const page = readFileSync("src/app/app/integraties/social-accounts.tsx", "utf8");
const example = readFileSync("ops/social-inbox-receive.env.example", "utf8");

test("inboxtoestemming staat standaard uit en vraagt alleen expliciet 'true'", () => {
  assert.equal(metaInboxConsentEnabled({}), false);
  for (const value of ["1", "TRUE", "yes", " true"]) assert.equal(metaInboxConsentEnabled({ BESC_META_INBOX_CONSENT_ENABLED: value }), false);
  assert.equal(metaInboxConsentEnabled({ BESC_META_INBOX_CONSENT_ENABLED: "true" }), true);
  assert.match(example, /BESC_META_INBOX_CONSENT_ENABLED=false/);
});

test("zonder rechtenparameter blijft de bestaande statistiekkoppeling exact gelijk", () => {
  for (const platform of ["facebook", "instagram"] as const) {
    assert.equal(metaConsentCapability(null, {}), "stats");
    assert.equal(metaConsentCapability("", { BESC_META_INBOX_CONSENT_ENABLED: "true" }), "stats");
    assert.deepEqual(metaConsentScopes(platform, stats[platform], "stats"), stats[platform]);
  }
  assert.match(meta, /const facebookScopes = \["business_management", "pages_show_list", "pages_read_engagement"\];/);
  assert.match(meta, /const instagramScopes = \[\.\.\.facebookScopes, "instagram_basic", "instagram_manage_insights"\];/);
});

test("inboxrechten worden geweigerd als de schakelaar uit staat of de waarde onbekend is", () => {
  assert.throws(() => metaConsentCapability("inbox", {}), /meta_consent_capability_denied/);
  assert.throws(() => metaConsentCapability("inbox", { BESC_META_INBOX_CONSENT_ENABLED: "false" }), /meta_consent_capability_denied/);
  for (const raw of ["comment", "INBOX", "inbox,publish", "stats"]) assert.throws(() => metaConsentCapability(raw, { BESC_META_INBOX_CONSENT_ENABLED: "true" }), /meta_consent_capability_denied/);
  assert.equal(metaConsentCapability("inbox", { BESC_META_INBOX_CONSENT_ENABLED: "true" }), "inbox");
});

test("inboxtoestemming voegt exact de leesrechten voor directe berichten toe, geen reactie- of publicatierechten", () => {
  const fb = metaConsentScopes("facebook", stats.facebook, "inbox");
  const ig = metaConsentScopes("instagram", stats.instagram, "inbox");
  assert.deepEqual(fb.filter((s) => !stats.facebook.includes(s)).sort(), ["pages_manage_metadata", "pages_messaging"]);
  assert.deepEqual(ig.filter((s) => !stats.instagram.includes(s)).sort(), ["instagram_manage_messages", "pages_manage_metadata", "pages_messaging"]);
  for (const scopes of [fb, ig]) {
    assert.equal(new Set(scopes).size, scopes.length);
    for (const forbidden of ["instagram_content_publish", "instagram_manage_comments", "pages_read_user_content", "pages_manage_posts", "instagram_business_manage_messages"]) assert.ok(!scopes.includes(forbidden), forbidden);
    for (const kept of stats.facebook.slice(0, 3)) assert.ok(scopes.includes(kept), kept);
  }
});

test("aangevraagde inboxscopes dekken precies de controle van de bestaande inboxlezer", () => {
  for (const platform of ["facebook", "instagram"] as const) {
    const granted = metaConsentScopes(platform, stats[platform], "inbox");
    assert.deepEqual(socialInboxCapability(platform, "direct", granted).missing, []);
    assert.deepEqual(socialInboxCapability(platform, "direct", stats[platform]).missing.length > 0, true);
    assert.deepEqual(metaInboxConsentScopes(platform).every((s) => granted.includes(s)), true);
    assert.deepEqual(metaConsentRequiredScopes(platform, ["pages_read_engagement"], "inbox").includes("pages_messaging"), true);
  }
});

test("start en callback binden de rechtenkeuze aan dezelfde kortlevende httpOnly-cookie en hercontroleren de schakelaar", () => {
  assert.match(start, /metaConsentCapability\(requestUrl\.searchParams\.get\("rechten"\), process\.env\)/);
  assert.match(start, /cookieStore\.set\("besc_meta_oauth_capability", capability, options\)/);
  assert.match(start, /scope: metaScopes\(platform, capability\)\.join\(","\)/);
  assert.match(start, /fout=inboxrechten-uit/);
  assert.match(callback, /cookieStore\.delete\("besc_meta_oauth_capability"\)/);
  assert.match(callback, /capability = metaConsentCapability\(rawCapability, process\.env\)/);
  assert.match(callback, /verifyMetaToken\(asset\.accessToken, platform, capability\)/);
  assert.ok(callback.indexOf("metaConsentCapability(rawCapability") < callback.indexOf("exchangeMetaCode(code)"), "schakelaar vóór tokenuitwisseling controleren");
});

test("de knop voor inboxrechten verschijnt alleen bij aan-schakelaar en verbonden Meta-account", () => {
  assert.match(page, /metaInboxConsentEnabled\(process\.env\)/);
  assert.match(page, /metaConfig\.configured && inboxConsent && account\.status === "connected" \? <Link href=\{`\/app\/integraties\/social\/meta\/start\?account=\$\{account\.id\}&rechten=inbox`\}>Inboxrechten aanvragen via Meta<\/Link>/);
});
