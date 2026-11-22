import {MarkdownContent} from "@/components/markdown-field";
import { dossierEditorGate } from "@/components/dossier-editor-gate";
import Link from "next/link";
import { Send } from "lucide-react";
import { notFound } from "next/navigation";
import { ApprovalPanel } from "@/components/approval-panel";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { isManager } from "@/lib/permissions";
import { markStaleNewsletterDeliveriesAction, prepareNewsletterDeliveryAction, saveNewsletter, sendApprovedNewsletter, sendNewsletterBatchAction } from "../actions";
import { newsletterPerRecipientEnabled } from "@/lib/newsletter-delivery";

const labels: Record<string,string> = {
  draft: "Concept", pending_approval: "Wacht op goedkeuring", changes_requested: "Wijzigingen gevraagd",
  approved: "Goedgekeurd voor verzending", sending: "Bezig met verzenden", attention: "Aandacht nodig", sent: "Verzonden", rejected: "Geweigerd", failed: "Gmail-fout",
};

export default async function NewsletterDetail({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<Record<string,string|undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const unifiedEditor = await dossierEditorGate({kind:"newsletter",id,query:query});
  if (unifiedEditor) return unifiedEditor;

  const { supabase, user, membership } = await requireActiveMembership();
  const [newsletterResult] = await Promise.all([
    supabase.from("newsletters").select("*,list:mailing_lists(name)").eq("organization_id", membership.organization_id).eq("id", id).maybeSingle(),
  ]);
  if (!newsletterResult.data) notFound();
  const item = newsletterResult.data;
  const canEdit = isManager(membership) && (item.created_by === user.id || isManager(membership)) && ["draft","changes_requested","failed"].includes(item.status);
  const perRecipient = newsletterPerRecipientEnabled(process.env);
  const canSend = !perRecipient && isManager(membership) && item.status === "approved" && Boolean(item.gmail_draft_id);
  const deliveryPanel = perRecipient && isManager(membership) && ["approved", "sending", "attention", "sent"].includes(item.status);
  let deliverySummary: Record<string, number> = {};
  if (deliveryPanel && item.status !== "approved") {
    try {
      const { newsletterDeliverySummary } = await import("@/lib/newsletter-delivery-runtime");
      deliverySummary = await newsletterDeliverySummary(membership.organization_id, item.id, user.id);
    } catch { deliverySummary = {}; }
  }
  const count = (state: string) => deliverySummary[state] ?? 0;
  return <AppShell active="Nieuwsbrieven">
    <header className="project-detail-head"><div><Link href="/app/nieuwsbrieven">← Terug naar nieuwsbrieven</Link><span className="eyebrow">NIEUWSBRIEF</span><h1>{item.title}</h1><p>{labels[item.status]} · {item.recipient_count} ontvangers</p></div><div className="project-actions">{item.body_html && <Link href={`/app/nieuwsbrieven/${item.id}/voorbeeld`}>HTML-voorbeeld</Link>}</div></header>
    <div className="project-detail-body">
      {query.succes === "concept" && <div className="success">Het Gmail-concept is bijgewerkt. Leg het nu ter goedkeuring voor.</div>}
      {query.succes === "verzonden" && <div className="success">De nieuwsbrief is via Gmail verzonden en geregistreerd.</div>}
      {query.succes === "goedkeuring-aangevraagd" && <div className="success">De nieuwsbrief wacht op een tweede bestuurder.</div>}
      {query.succes === "beslissing" && <div className="success">De beslissing is geregistreerd.</div>}
      {query.fout && <div className="error-note">De actie is mislukt ({query.fout}). {item.last_error || ""}</div>}
      <section className="project-summary"><article><span>Status</span><strong>{labels[item.status]}</strong></article><article><span>Mailinglijst</span><strong>{item.list?.name || "Onbekend"}</strong></article><article><span>Ontvangersnapshot</span><strong>{item.recipient_count}</strong></article><article><span>Verzonden</span><strong>{item.sent_at ? new Date(item.sent_at).toLocaleString("nl-BE") : "Nog niet"}</strong></article></section>
      <section className="form-card email-preview"><div className="form-heading"><h2>{item.subject}</h2>{canEdit&&<Link className="primary" href="?bewerken=1">Bewerken</Link>}</div><MarkdownContent>{item.body_text}</MarkdownContent>{canEdit&&<form action={saveNewsletter}><input type="hidden" name="id" value={item.id}/>{["mailing_list_id","email_template_id","title","subject","body_text","template_variant","preheader","hero_image_url","hero_image_alt"].map(field=><input key={field} type="hidden" name={field} value={String(item[field]??"")}/>)}<button>Gmail-concept bijwerken</button></form>}</section>
      {item.body_html && !["sent", "failed", "sending", "attention"].includes(item.status) && <ApprovalPanel entityType="newsletter" entityId={item.id} sourceHref={`/app/nieuwsbrieven/${item.id}`} title="Nieuwsbrief goedkeuren"/>}
      {query.succes === "voorbereid" && <div className="success">{Number(query.ontvangers) || 0} ontvangers voorbereid. Elke ontvanger wordt vlak vóór verzending opnieuw gecontroleerd.</div>}
      {query.succes === "reeks" && <div className="success">Reeks verwerkt: {Number(query.verzonden) || 0} verzonden, {Number(query.geweigerd) || 0} geweigerd, {Number(query.onzeker) || 0} onzeker.</div>}
      {query.succes === "hersteld" && <div className="success">{Number(query.gemarkeerd) || 0} onderbroken verzending(en) als onzeker gemarkeerd. Er is niets opnieuw verzonden.</div>}
      {deliveryPanel && <section className="form-card email-send-card"><div><span className="eyebrow">VERZENDING PER ONTVANGER</span><h2>{labels[item.status]}</h2>
        <p>Elke ontvanger krijgt een eigen mail met een persoonlijke uitschrijflink. Per klik worden maximaal 10 ontvangers verwerkt. Een onzekere uitkomst stopt de verzending en wordt nooit automatisch herhaald.</p>
        {item.status !== "approved" && <p>Wachtend {count("pending")} · Verzonden {count("sent")} · Overgeslagen (afgemeld) {count("skipped")} · Geweigerd {count("rejected")} · Onzeker {count("unknown")} · Bezig {count("claimed")}</p>}</div>
        {item.status === "approved" && <form action={prepareNewsletterDeliveryAction}><input type="hidden" name="id" value={item.id}/><button className="primary"><Send size={16}/>Verzending voorbereiden</button></form>}
        {item.status === "sending" && count("pending") > 0 && count("claimed") === 0 && <form action={sendNewsletterBatchAction}><input type="hidden" name="id" value={item.id}/><button className="primary"><Send size={16}/>Volgende ontvangers verzenden</button></form>}
        {["sending", "attention"].includes(item.status) && count("claimed") > 0 && <form action={markStaleNewsletterDeliveriesAction}><input type="hidden" name="id" value={item.id}/><button>Onderbroken verzending controleren</button></form>}
        {item.status === "attention" && <p className="error-note">Minstens één verzending heeft een onzekere uitkomst. Controleer in Gmail (Verzonden) wat er werkelijk vertrok. Er wordt niets automatisch opnieuw verzonden.</p>}
      </section>}
      {canSend && <section className="form-card email-send-card"><div><span className="eyebrow">VERZENDING</span><h2>Klaar voor Gmail</h2><p>De nieuwsbrief is door een andere bestuurder goedgekeurd. De vastgelegde ontvangers staan uitsluitend in BCC.</p></div><form action={sendApprovedNewsletter}><input type="hidden" name="id" value={item.id}/><button className="primary"><Send size={16}/>Nieuwsbrief verzenden</button></form></section>}
    </div>
  </AppShell>;
}
