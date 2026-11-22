import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "./supabase/admin";
import { googleGmailConfiguration, gmailRawMessage, sendGmailMessage } from "./google-gmail";
import {
  NEWSLETTER_BATCH_MAX, classifyNewsletterFailure, newsletterPerRecipientEnabled, newsletterPersonalUrls,
  newsletterRecipientHeaders, newsletterUnsubscribeToken, personalizeNewsletter,
} from "./newsletter-delivery";

type Server = (action: string, data?: Record<string, unknown>) => Promise<Record<string, unknown>>;

function serverPort(org: string, newsletter: string, actor: string): Server {
  const admin = createAdminClient();
  return async (action, data = {}) => {
    const r = await admin.rpc("newsletter_delivery_server", { p_org: org, p_newsletter: newsletter, p_actor: actor, p_action: action, p_data: data });
    if (r.error) throw new Error(r.error.message.slice(0, 200));
    return r.data as Record<string, unknown>;
  };
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

function listUnsubscribeUrl(publicSlug: string | null) {
  const site = siteUrl();
  return publicSlug && site ? `${site}/nieuwsbrief/uitschrijven/${publicSlug}` : null;
}

function enabled() {
  if (!newsletterPerRecipientEnabled(process.env)) throw new Error("newsletter_per_recipient_disabled");
}

export async function prepareNewsletterDelivery(org: string, newsletter: string, actor: string) {
  enabled();
  return serverPort(org, newsletter, actor)("prepare");
}

export async function newsletterDeliverySummary(org: string, newsletter: string, actor: string) {
  enabled();
  const r = await serverPort(org, newsletter, actor)("summary");
  return z.record(z.string(), z.number()).parse(r.summary ?? {});
}

export async function markStaleNewsletterDeliveries(org: string, newsletter: string, actor: string) {
  enabled();
  const server = serverPort(org, newsletter, actor);
  const r = await server("mark_stale");
  await server("finish");
  return r;
}

// Verstuurt maximaal NEWSLETTER_BATCH_MAX ontvangers, één voor één, met duurzame claim vóór elke Gmail-aanroep.
export async function sendNewsletterBatch(org: string, newsletter: string, actor: string) {
  enabled();
  const gmail = googleGmailConfiguration();
  if (!gmail.configured) throw new Error("gmail_not_configured");
  const admin = createAdminClient();
  const { data: item, error } = await admin.from("newsletters")
    .select("id,subject,body_text,body_html,status,list:mailing_lists(public_slug)")
    .eq("organization_id", org).eq("id", newsletter).maybeSingle();
  if (error || !item || !item.body_html) throw new Error("newsletter_not_found");
  const listRow = (Array.isArray(item.list) ? item.list[0] : item.list) as { public_slug: string | null } | null;
  const listUrl = listUnsubscribeUrl(listRow?.public_slug ?? null);
  // Controle vóór de eerste claim: de snapshot moet exact personaliseerbaar zijn.
  personalizeNewsletter({ html: item.body_html, text: item.body_text, listUrl, personalUrl: "https://controle.invalid/x" });
  const server = serverPort(org, newsletter, actor);
  let sent = 0, rejected = 0, unknown = 0, stopped = false;
  for (let i = 0; i < NEWSLETTER_BATCH_MAX && !stopped; i++) {
    const claim = randomUUID();
    const { token, hash } = newsletterUnsubscribeToken();
    // Alles wat lokaal kan falen gebeurt vóór de claim, zodat een claim alleen nog de Gmail-aanroep afwacht.
    const urls = newsletterPersonalUrls(siteUrl(), token);
    const personal = personalizeNewsletter({ html: item.body_html, text: item.body_text, listUrl, personalUrl: urls.page });
    const answer = await server("claim", { claim, token_hash: hash });
    const delivery = answer.delivery as { id: string; email: string } | null;
    if (!delivery) break;
    let state: "sent" | "rejected" | "unknown", providerId: string | null = null, code: string | null = null;
    try {
      const raw = gmailRawMessage({
        sender: gmail.sender, to: [delivery.email], subject: item.subject, body: personal.text, html: personal.html,
        extraHeaders: newsletterRecipientHeaders(urls.oneClick),
      });
      const result = await sendGmailMessage(raw, AbortSignal.timeout(20000));
      if (!result?.id) throw new Error("gmail_no_message_id");
      state = "sent"; providerId = result.id;
    } catch (failure) {
      const outcome = classifyNewsletterFailure(failure);
      state = outcome.state; code = outcome.code; stopped = outcome.stop;
    }
    await server("record", { delivery: delivery.id, claim, state, provider_id: providerId, error: code });
    if (state === "sent") sent++; else if (state === "rejected") rejected++; else unknown++;
  }
  const finish = await server("finish");
  return { sent, rejected, unknown, stopped, status: String(finish.status ?? "") };
}
