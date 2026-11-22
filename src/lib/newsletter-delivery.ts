import { createHash, randomBytes } from "node:crypto";
import { newsletterUnsubscribeFragment } from "./newsletter-html.ts";

// Pure hulpfuncties voor nieuwsbriefverzending per ontvanger. Geen netwerk of database.

export const newsletterPerRecipientEnabled = (env: Record<string, string | undefined>) =>
  env.BESC_NEWSLETTER_PER_RECIPIENT_ENABLED === "true";

export const NEWSLETTER_BATCH_MAX = 10;

export function newsletterUnsubscribeToken() {
  const token = randomBytes(32).toString("hex");
  return { token, hash: newsletterTokenHash(token) };
}

export function newsletterTokenHash(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("newsletter_token_invalid");
  return createHash("sha256").update(token).digest("hex");
}

export function newsletterPersonalUrls(siteUrl: string, token: string) {
  const site = siteUrl.replace(/\/$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(site)) throw new Error("newsletter_site_url_invalid");
  newsletterTokenHash(token);
  return { page: `${site}/nieuwsbrief/afmelden/${token}`, oneClick: `${site}/nieuwsbrief/afmelden/${token}/een-klik` };
}

// De goedgekeurde HTML blijft ongewijzigd, op exact één plek na: de uitschrijflink in de voettekst.
export function personalizeNewsletter(input: { html: string; text: string; listUrl: string | null; personalUrl: string }) {
  const fragment = newsletterUnsubscribeFragment(input.listUrl);
  const parts = input.html.split(fragment);
  if (parts.length !== 2) throw new Error("newsletter_snapshot_mismatch");
  return {
    html: parts.join(newsletterUnsubscribeFragment(input.personalUrl)),
    text: `${input.text.trimEnd()}\n\nUitschrijven met één klik: ${input.personalUrl}`,
  };
}

export function newsletterRecipientHeaders(oneClickUrl: string) {
  return { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

export type NewsletterFailure = { state: "rejected" | "unknown"; code: string; stop: boolean };

// Alleen een expliciete weigering door Gmail is 'rejected'. Alles waarvan niet vaststaat
// dat Gmail niets verstuurde, is 'unknown' en blokkeert verdere verzending.
export function classifyNewsletterFailure(error: unknown): NewsletterFailure {
  const status = typeof error === "object" && error !== null && "status" in error && typeof (error as { status: unknown }).status === "number"
    ? (error as { status: number }).status : null;
  if (status === 400) return { state: "rejected", code: "gmail_400", stop: false };
  if (status === 401 || status === 403) return { state: "rejected", code: `gmail_${status}`, stop: true };
  if (status === 429) return { state: "rejected", code: "gmail_rate_limited", stop: true };
  if (status !== null && status >= 400 && status < 500) return { state: "rejected", code: `gmail_${status}`, stop: true };
  return { state: "unknown", code: status ? `gmail_${status}` : "gmail_no_response", stop: true };
}
