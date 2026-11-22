import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { newsletterHtml } from "../src/lib/newsletter-html.ts";
import {
  classifyNewsletterFailure, newsletterPerRecipientEnabled, newsletterPersonalUrls, newsletterRecipientHeaders,
  newsletterTokenHash, newsletterUnsubscribeToken, personalizeNewsletter,
} from "../src/lib/newsletter-delivery.ts";

const listUrl = "https://cc-dev.example.invalid/nieuwsbrief/uitschrijven/dev-proef";
const html = newsletterHtml({ title: "Titel", bodyText: "Hallo **iedereen**", organizationName: "BESC vzw", unsubscribeUrl: listUrl });

test("schakelaar staat standaard uit en vraagt exact 'true'", () => {
  assert.equal(newsletterPerRecipientEnabled({}), false);
  for (const v of ["1", "TRUE", " true"]) assert.equal(newsletterPerRecipientEnabled({ BESC_NEWSLETTER_PER_RECIPIENT_ENABLED: v }), false);
  assert.equal(newsletterPerRecipientEnabled({ BESC_NEWSLETTER_PER_RECIPIENT_ENABLED: "true" }), true);
});

test("token: 256 bit, alleen de hash verlaat de server, ongeldig formaat geweigerd", () => {
  const a = newsletterUnsubscribeToken(), b = newsletterUnsubscribeToken();
  assert.match(a.token, /^[0-9a-f]{64}$/); assert.notEqual(a.token, b.token);
  assert.equal(a.hash, newsletterTokenHash(a.token)); assert.notEqual(a.hash, a.token);
  for (const bad of ["", "abc", "G".repeat(64), a.token.toUpperCase()]) assert.throws(() => newsletterTokenHash(bad));
});

test("persoonlijke URL's: alleen https-site zonder pad", () => {
  const { token } = newsletterUnsubscribeToken();
  const urls = newsletterPersonalUrls("https://cc-dev.example.invalid/", token);
  assert.equal(urls.page, `https://cc-dev.example.invalid/nieuwsbrief/afmelden/${token}`);
  assert.equal(urls.oneClick, `${urls.page}/een-klik`);
  for (const bad of ["http://x.invalid", "https://x.invalid/pad", "", "https://x invalid"]) assert.throws(() => newsletterPersonalUrls(bad, token));
});

test("personaliseren wijzigt de goedgekeurde HTML alleen in de uitschrijflink", () => {
  const personal = "https://cc-dev.example.invalid/nieuwsbrief/afmelden/" + "a".repeat(64);
  const out = personalizeNewsletter({ html, text: "Tekst", listUrl, personalUrl: personal });
  assert.equal(out.html, html.replace(listUrl, personal));
  assert.ok(!out.html.includes(listUrl));
  assert.match(out.text, new RegExp(`Uitschrijven met één klik: ${personal}$`));
  assert.throws(() => personalizeNewsletter({ html, text: "", listUrl: "https://ander.invalid/x", personalUrl: personal }), /newsletter_snapshot_mismatch/);
  const noList = newsletterHtml({ title: "T", bodyText: "B" });
  assert.ok(personalizeNewsletter({ html: noList, text: "", listUrl: null, personalUrl: personal }).html.includes(personal));
  assert.throws(() => personalizeNewsletter({ html: html + html, text: "", listUrl, personalUrl: personal }), /newsletter_snapshot_mismatch/);
});

test("List-Unsubscribe volgens RFC 8058", () => {
  assert.deepEqual(newsletterRecipientHeaders("https://x.invalid/a/een-klik"), { "List-Unsubscribe": "<https://x.invalid/a/een-klik>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
});

test("alleen een expliciete Gmail-weigering is 'rejected'; al het andere is onzeker en stopt", () => {
  const err = (status: number) => Object.assign(new Error("x"), { status });
  assert.deepEqual(classifyNewsletterFailure(err(400)), { state: "rejected", code: "gmail_400", stop: false });
  for (const s of [401, 403, 429]) assert.equal(classifyNewsletterFailure(err(s)).stop, true);
  for (const s of [401, 403, 404, 429]) assert.equal(classifyNewsletterFailure(err(s)).state, "rejected");
  for (const failure of [err(500), err(503), new Error("netwerk"), new DOMException("t", "TimeoutError"), "x"]) {
    const r = classifyNewsletterFailure(failure); assert.equal(r.state, "unknown"); assert.equal(r.stop, true);
  }
});

test("koppelingen: BCC uit bij per ontvanger, oude verzendknop geweigerd, publieke route wijzigt niets bij GET", () => {
  const actions = readFileSync("src/app/app/nieuwsbrieven/actions.ts", "utf8");
  const page = readFileSync("src/app/app/nieuwsbrieven/[id]/page.tsx", "utf8");
  const route = readFileSync("src/app/nieuwsbrief/afmelden/[token]/een-klik/route.ts", "utf8");
  const runtime = readFileSync("src/lib/newsletter-delivery-runtime.ts", "utf8");
  assert.match(actions, /bcc: newsletterPerRecipientEnabled\(process\.env\) \? \[\] : recipients/);
  assert.match(actions, /if \(newsletterPerRecipientEnabled\(process\.env\)\) redirect\(`\$\{path\}\?fout=bcc-uitgeschakeld`\)/);
  assert.match(page, /const canSend = !perRecipient &&/);
  assert.ok(!/rpc\(/.test(route.slice(route.indexOf("export async function GET"))), "GET roept geen database aan");
  assert.ok(runtime.indexOf('server("claim"') > runtime.indexOf("personalizeNewsletter({ html: item.body_html, text: item.body_text, listUrl, personalUrl: urls.page })"), "personaliseren vóór claim");
  assert.ok(runtime.indexOf("sendGmailMessage(raw") > runtime.indexOf('server("claim"'), "claim vóór Gmail");
  assert.ok(!/retry|setTimeout\(/.test(runtime), "geen automatische herhaling");
});
