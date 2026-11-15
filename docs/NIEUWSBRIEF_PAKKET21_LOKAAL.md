# Pakket 21 — nieuwsbrief: inventaris, verzendontwerp en lokale keten

Datum: 15 november 2026. Basis Command Center: `653eb9b6d48137b3fe22e79c477df9c939276468`.
Websiteplanning: pakket 21 na websitepakketten 18–20, websiteversie `f273784`.

## Status en afbakening

De nieuwsbriefketen is uitvoerbaar en getest in een **afzonderlijke lokale proefomgeving**, met fictieve rollen en uitsluitend adressen op `example.invalid`. Het bestaande Command Center blijft eigenaar van contacten, mailinglijsten, redactie en goedkeuring. Er wordt geen tweede echt CRM of abonnee-register geïntroduceerd: de nieuwe lokale opslag bevat uitsluitend proefgegevens en demonstreert het vereiste transactie-/verzendcontract.

De bestaande Next-pagina's, serveracties, Gmail-koppeling, database en website zijn niet op deze proef aangesloten of gewijzigd. Dit is dus **geen vervanging van het bestaande operationele verzendpad** en geen bewijs dat dat pad onderstaande waarborgen al heeft. Een latere productaansluiting moet de geteste kernel aan de bestaande organisatie-/sessiecontext en duurzame databaseopslag koppelen. De nieuwe code is niet te activeren door één DEV-vlag om te zetten.

Geen echte mails, Gmail-concepten, tokenvernieuwing, Google-/Supabase-accountcontrole, migratie, import, externe synchronisatie, PR, push, merge, activering of uitrol uitgevoerd. De browserproef met een fictieve tweede rol is geen live proef met een tweede BESC-beoordelaar.

## Inventaris van bestaande onderdelen

Dit is een broncode-inventaris; huidige Cloud-configuratie en gegevens zijn niet uitgelezen.

| Onderdeel | Bestaande bron | Bevinding / hergebruik |
| --- | --- | --- |
| Gmail-verzending | `src/lib/google-gmail.ts` | `gmailRawMessage`, `saveGmailDraft`, `sendGmailDraft`; tekst + HTML, BCC, Workspace-token, afzenderconfiguratie. Wordt niet geïmporteerd door de lokale proef. |
| Workspace-toegang | `src/lib/google-workspace.ts` | Bestaande serverkoppeling; geen nieuwe sleutels, scopes of mailbox ingesteld. |
| Lijsten en abonnees | `src/app/app/nieuwsbrieven/actions.ts`, `supabase/migrations/20260731100000_add_email_templates_and_newsletters.sql` | Mailinglijsten, status, toestemmingsgrond, datum, afmelding, nieuwsbriefregister, ontvangerssnapshot; bestaande grens van 100 ontvangers. |
| Inschrijving | `src/app/nieuwsbrief/actions.ts`, `supabase/migrations/20260803203000_add_public_newsletter_signup.sql`, `20260803204500_harden_public_newsletter_signup.sql` | Toestemming, willekeurige eenmalige token, hash, termijn van 24 uur, aanvraagbeperking, generieke respons en private aanvraagopslag aanwezig. |
| Uitschrijving | `src/app/nieuwsbrief/uitschrijven/`, `supabase/migrations/20260803210000_add_public_newsletter_unsubscribe.sql` | Afzonderlijke aanvraag en adresbevestiging aanwezig. |
| Bevestigingsroutes | `src/app/nieuwsbrief/bevestigen/route.ts`, `uitschrijven/bevestigen/route.ts` | Bestaande GET voert bevestiging direct uit. De lokale keten gebruikt eerst een landingspagina en pas daarna een expliciete POST, zodat linkscanners niet bevestigen. |
| Sjablonen en HTML | `src/lib/email-templates.ts`, `src/lib/newsletter-html.ts` | Bestaande BESC-, event-, partner- en compacte opmaak; escaping en tekstfallback. `newsletterHtml` wordt daadwerkelijk door de lokale keten hergebruikt. |
| Goedkeuring | `src/app/app/goedkeuringen/actions.ts`, `src/lib/permissions.ts` | Nieuwsbriefgoedkeuring en verbod op zelfgoedkeuring aanwezig; bestaande beheerder-/bestuursrollen worden hergebruikt in het rechtenmodel. |
| CRM/Gmail uit 13–15 | `src/lib/crm-communication.ts`, `crm-communication-runtime.ts`, `crm-google-provider.ts` | Sessies/ACL, afzonderlijke verbinding, duurzame mailtaak en gecontroleerde provideradapter zijn relevante aansluitpatronen. Geen contacten geïmporteerd; CRM-contact is niet automatisch nieuwsbriefabonnee. |
| Website | websitepakketten 18–20, `docs/website/Ontwikkelplanning-vanaf-pakket-9.md` | Nieuwsbrief blijft verborgen tot de volledige echte keten is ingericht en geaccepteerd. Geen websitebestanden gewijzigd. |

### Belangrijkste gaten in het bestaande verzendpad

- Bij opslaan worden Gmail-concepten en een BCC-ontvangerssnapshot gemaakt. De zichtbare verzendactie stuurt dat concept zonder ontvangers vlak vóór verzending opnieuw te controleren. Een latere afmelding kan daardoor buiten die controle vallen.
- `sendApprovedNewsletter` doet eerst de externe verzending en legt daarna `sent` vast. Een verloren providerrespons of databaseantwoord heeft daar geen eigen duurzame status voor onzekerheid. Een herhaalde klik mag niet als veilige herstart worden beschouwd.
- De broncode toont nog geen publiek, afzonderlijk goedgekeurd nieuwsbriefarchief.
- Bestaande tests van bovenstaande onderdelen zijn deels broncodecontroles. Pakket 21 voegt gedragstests, HTTP-proeven en een echte lokale procesonderbreking toe.

## Verzendoplossing

**Voorgesteld vertrekpunt: bestaande BESC-Gmail/Workspace-koppeling voor beperkt nieuwsbriefvolume**, met dezelfde redactie en goedkeuringsbron. Geen nieuwe betaalde leverancier of abonnement kiezen of instellen in deze stap. Deze technische ontwerpkeuze is geen toestemming om Gmail te activeren of mail te versturen.

De nieuwe keten werkt per individuele ontvanger, met één duurzame taak en één bevestigde provideruitkomst. De bestaande BCC-snapshot wordt niet overgenomen als verzendmechanisme. De bestaande productgrens van maximaal 100 ontvangers per editie blijft een expliciete ontwerpgrens; dit is **geen claim over het actuele Gmail-accountquotum**. Bij meer ontvangers weigeren, niet stil afkappen of automatisch in batches versturen.

Officiële technische bronnen, geraadpleegd op 15 november 2026:

- Gmail kan direct of via een concept verzenden: [Create and send email messages](https://developers.google.com/workspace/gmail/api/guides/sending).
- API-quota zijn project-/gebruikersgebonden: [Gmail API usage limits](https://developers.google.com/workspace/gmail/api/reference/quota). Werkelijke beschikbare quota zijn hier niet opgehaald.

Voor een latere praktijkproef moeten afzender, accountgrenzen, benodigde scopes en verzenddomein worden bevestigd. Een marketingmaildienst kan later nodig zijn bij groter volume of vereiste bounce-/klachtverwerking; er is nu geen leverancier geselecteerd. Er wordt geen automatische inboxmonitoring, openingsmeting of kliktracking toegevoegd.

### Toestemming en ontvangers

1. Inschrijven vraagt expliciete toestemming; de inschrijver is nog geen verzendbare abonnee.
2. Een bevestigingsmail krijgt een willekeurige eenmalige token, maximaal 24 uur geldig. De aanvraag bewaart alleen de tokenhash; mailinhoud met de link staat uitsluitend in de versleutelde lokale outbox.
3. Openen van de link verandert niets. Bevestiging volgt na een expliciete POST.
4. Bevestiging bewaart toestemmingsversie, tijdstip en abonneeversie. Oude links worden onbruikbaar.
5. Aanvragen blijven generiek; honeypot, herhaalde aanvragen en grenzen per adres/IP voorkomen extra proefmails. In- en uitschrijving hebben aparte aanvraagtellingen.
6. Uitschrijven vraagt ook adresbevestiging en blijft mogelijk als nieuwsbriefverzending gepauzeerd is. De uitschrijfbevestigingsmail wordt dan nog steeds verwerkt.
7. Uitschrijving verandert de abonneeversie. Een latere herinschrijving met nieuwe toestemming heractiveert nooit een oudere verzendtaak.

### Redactie, beoordeling, verzending en archief

1. Auteur maakt een concept; titel, onderwerp en inhoud worden gevalideerd. Onverwerkte sjabloonvariabelen worden geweigerd.
2. Indienen bevriest editie, archiefkeuze en selectie van bevestigde abonnees in een controlehash. Lege lijsten, gepauzeerde lijsten en meer dan 100 ontvangers blokkeren indienen.
3. Een andere bevoegde beoordelaar keurt goed of vraagt wijzigingen. Een auteur/indiener kan zichzelf niet goedkeuren. Organisatiegrens en beheerrechten gelden bij iedere beheeroperatie.
4. Wijzigingen trekken de goedkeuring in; oude versienummers worden geweigerd. Edities in verzending zijn niet bewerkbaar.
5. Herhaald klaarzetten maakt geen dubbele taken. Nieuwe inschrijvers komen niet ongemerkt in een reeds goedgekeurde selectie.
6. Vóór iedere dispatch worden huidige toestemming/status/abonneeversie en goedkeuring opnieuw gecontroleerd. Afmeldingen vóór die claim worden overgeslagen. Een reeds aan de provider aangeboden mail kan niet worden teruggehaald; dit wordt niet als garantie voorgesteld.
7. Een claim wordt opgeslagen vóór de nagebootste provideraanroep. Acceptatie krijgt een ontvangstbewijs, weigering een aparte status. Bij ontbrekende/ongeldige respons of onderbreking: `unknown`, aandacht nodig, geen automatische herhaling.
8. Na procesherstart markeert expliciet herstel achtergebleven `dispatching`-taken als onzeker. Er is geen knop die zulke taken blind opnieuw verzendt. Verificatie/herstel bij een echte provider blijft een aparte aansluittaak.
9. Alleen een succesvol afgeronde editie met **vooraf expliciet meegekeurde archiefkeuze** verschijnt in het openbare proefarchief. Geen adressen, interne historie, ontvangerssnapshot, tokens of goedkeurders worden daar getoond. Een editie zonder verzonden ontvangers verschijnt niet als succesvol.

## Lokale uitvoering

Bestanden:

- `src/lib/newsletter-chain.ts`: geteste toestemmings-/redactie-/beoordelings-/verzendketen.
- `src/lib/newsletter-local-store.ts`: versleutelde AES-256-GCM-proefopslag, atomaire transacties, exclusieve proceslock, stoppen bij onleesbare opslag.
- `src/lib/newsletter-mock-provider.ts`: uitsluitend nagebootste acceptatie/weigering/onzekerheid; geen netwerk of Gmail-/Supabase-import.
- `scripts/newsletter-local-preview.mts`: lokale inschrijving, bevestiging, uitschrijving, redactie, fictieve beoordelingsrol, afgeschermde proefmailbox, historie en archief.
- `tests/newsletter-*.test.mts`: gedrag, HTTP, rechten, onderbreking en opslagherstel.

`pnpm test:newsletter` voert de afgebakende tests uit. Er zijn geen nieuwe afhankelijkheden.

Voor een handmatige lokale proef: stel uitsluitend een **nieuwe lokale proefmap** in met `BESC_NEWSLETTER_FIXTURE_DIRECTORY` en een willekeurige 32-byte sleutel als 64 hextekens in `BESC_NEWSLETTER_FIXTURE_KEY`; voer daarna `pnpm newsletter:local` uit. Sleutel niet in Git, argumenten of output bewaren. Bij herstart is dezelfde sleutel nodig; verlies ervan geeft een fout en reset de gegevens niet. De tijdelijke browserproef gebruikt uitsluitend fictieve gegevens en een tijdelijke processleutel.

De server luistert alleen op `127.0.0.1:21421`, weigert `NODE_ENV=production`, onjuiste Host/Origin en te grote formulieren. Beheer vereist een willekeurige lokale toegangscode, HttpOnly/SameSite-cookie en CSRF-token. Dit is proefbeveiliging, geen vervanging van BESC Auth. Geen standaard open beheersessie, externe callbacks, echte adressen, providerfallback, cron of proxy-inrichting. Cache en indexering staan uit. `strict-origin` voorkomt dat tokens/toegangscodes via de verwijzer worden meegestuurd, met behoud van bruikbare Origin-controle op browserformulieren.

Op Linux worden proefmap/bestand met 0700/0600 aangelegd; op Windows zijn effectieve maprechten afhankelijk van de lokale ACL. De opslag is uitsluitend voor fixtures bestemd, niet goedgekeurd voor echte persoonsgegevens. Een achtergebleven lock wordt nooit automatisch verwijderd: controleer eerst dat geen proefproces meer draait. Bewaar bij onderzoek de versleutelde snapshot; nooit blind leegmaken. De opslag is geen geteste productieback-upoplossing.

## Volgende productaansluiting, apart uit te voeren

De echte nieuwsbriefmodule vraagt nog een adapter op de bestaande tabellen/organisatiecontext, databasegeborgde revisies/claims, echte BESC-sessies, aansluitende bestaande beheerpagina's en een provideradapter met uitkomstcontrole. Pas daarna volgen review van eventuele additieve migraties, afzonderlijke DEV-toestemming, beperkte adresproef, websiteaansluiting en eventuele activering. Geen abonnee-import uit CRM/Google Contacts zonder afzonderlijk toestemmingsbewijs. De bestaande automatische publicatie-, socialinbox- en YouTube-vlaggen blijven ongewijzigd.

De lokale proef maakt deze resterende aansluiting concreet en testbaar; zij bewijst geen live bezorgbaarheid, echte quotaruimte, bestaande Cloud-RLS of werkelijke onafhankelijke beoordeling.
