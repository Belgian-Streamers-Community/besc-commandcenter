import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { importSocialHistoryAction } from "./actions";

const errors: Record<string, string> = {
  "geen-bestand": "Kies eerst een importbestand.",
  "te-groot": "Het bestand is groter dan 5 MB.",
  ongeldig: "Het bestand heeft niet het verwachte formaat.",
  social_import_actor_denied: "Alleen actieve beheerders of bestuursleden kunnen historiek importeren.",
  social_import_too_large: "Er staan meer dan 2000 posts in het bestand. Splits het op.",
};

export default async function SocialImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { membership } = await requireActiveMembership();
  if (membership.role !== "admin" && membership.role !== "board") redirect("/app/social?fout=geen-toegang");
  const q = await searchParams;
  return <AppShell active="Social planning">
    <header className="topbar module-top"><div><p>SOCIAL PLANNING</p><h1>Historiek importeren</h1></div><Link className="row-action" href="/app/social">Terug naar Social planning</Link></header>
    <div className="module-body">
      <section className="form-card">
        <div className="form-heading"><h2>Importbestand</h2></div>
        <p className="form-help">Importeer eerder gepubliceerde posts (bijvoorbeeld uit Metricool) in het formaat <code>besc-social-history-v1</code>. Elke post krijgt zijn kanalen, teksten, links en, waar bekend, statistieken. Geïmporteerde posts staan als gepubliceerde historiek in het CC. Wie nadien de tekst of afbeelding wijzigt, moet ze zoals elke post opnieuw laten goedkeuren.</p>
        <p className="form-help">Opnieuw hetzelfde bestand importeren is veilig: posts die al bestaan, worden overgeslagen.</p>
        {q.succes && <p role="status" className="success">Import klaar: {q.nieuw} nieuwe posts met {q.kanalen} kanalen, {q.overgeslagen} al aanwezig, {q.mislukt} mislukt (van {q.totaal}).{q.eerste_fout ? ` Eerste fout: ${q.eerste_fout}` : ""}</p>}
        {q.fout && <p role="alert" className="error-note">{errors[q.fout] ?? "De import is niet gelukt."}{q.detail ? ` ${q.detail}` : ""}</p>}
        <form action={importSocialHistoryAction} className="dossier-editor-fields">
          <label>Bestand (.json, max. 5 MB)<input type="file" name="bestand" accept="application/json,.json" required/></label>
          <button className="primary" type="submit">Importeren</button>
        </form>
      </section>
    </div>
  </AppShell>;
}
