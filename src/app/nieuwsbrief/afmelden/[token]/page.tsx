import type { Metadata } from "next";

export const metadata: Metadata = { title: "Uitschrijven", robots: { index: false, follow: false } };

// Openen van de link wijzigt niets (linkscanners); uitschrijven gebeurt pas na de POST.
export default async function NewsletterOneClickPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[0-9a-f]{64}$/.test(token);
  return <main className="public-newsletter-page"><section className="public-newsletter-card">
    <span className="eyebrow">BESC-NIEUWSBRIEF</span>
    <h1>Uitschrijven</h1>
    {valid ? <>
      <p>Wil je deze nieuwsbrief niet meer ontvangen? Bevestig hieronder. Je hoeft niets anders in te vullen.</p>
      <form method="post" action={`/nieuwsbrief/afmelden/${token}/een-klik`}><button type="submit">Uitschrijven</button></form>
    </> : <p>Deze uitschrijflink is ongeldig.</p>}
  </section></main>;
}
