# Nieuwsbrief: verzending per ontvanger

22 november 2026. Stap 2 van het DEV-plan. Dit sluit de verzendkern van pakket 21 aan op het bestaande Command Center. De lokale proefkernel (`newsletter-chain.ts`) blijft als referentie behouden.

## Waarom

Het bestaande pad verstuurt één Gmail-concept met alle ontvangers in BCC. Dat heeft drie gevolgen:

- **Uitschrijvingen vallen buiten de controle:** wie zich na de goedkeuring uitschrijft, krijgt de nieuwsbrief toch nog.
- **Onzekere uitkomst:** een verloren antwoord van Gmail heeft geen eigen status, dus een herhaalde klik kan dubbel versturen.
- **Geen persoonlijke uitschrijflink:** er is geen `List-Unsubscribe`, die Gmail en Yahoo van nieuwsbrieven verwachten.

## Werking (schakelaar `BESC_NEWSLETTER_PER_RECIPIENT_ENABLED=true`)

1. **Redactie en goedkeuring:** ongewijzigd. Het Gmail-concept wordt alleen een voorbeeld voor de afzender, zonder BCC-lijst.
2. **Verzending voorbereiden:** uit de goedgekeurde snapshot worden alleen de ontvangers die nu nog ingeschreven zijn één duurzame taak (`private.newsletter_deliveries`). Wie zich na de goedkeuring inschreef, komt er niet bij. De nieuwsbrief krijgt de status `sending`.
3. **Volgende ontvangers verzenden:** maximaal 10 per klik, één voor één.
   - **Vóór de claim:** de goedgekeurde HTML wordt gepersonaliseerd. Alleen de uitschrijflink in de voettekst verandert; past dat niet exact, dan volgt een weigering.
   - **De claim:** wordt duurzaam vastgelegd. Inschrijving en lijststatus worden opnieuw gecontroleerd; wie zich intussen uitschreef, wordt overgeslagen (`skipped`).
   - **De mail:** gaat via `messages/send` met `List-Unsubscribe` en `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058).
   - **Uitkomsten:**
     - `sent`: Gmail aanvaardt de mail.
     - `rejected`: Gmail weigert expliciet (400; 401/403/429 stoppen de reeks).
     - `unknown`: alle andere gevallen. De nieuwsbrief gaat dan naar `attention`; er volgt geen automatische herhaling en geen nieuwe claim.
4. **Afsluiten:** zijn alle taken verwerkt, dan wordt de status `sent` (minstens één verzonden), `attention` (een onzekere uitkomst) of `failed` (niemand verzonden).
5. **Onderbroken claim:** een claim die ouder is dan 10 minuten wordt via de knop "Onderbroken verzending controleren" als `unknown` gemarkeerd. Er wordt nooit iets opnieuw verzonden. Wat werkelijk vertrok, controleer je in Gmail (Verzonden).

## Uitschrijven met de persoonlijke link

- **Link en token:** de link is `/nieuwsbrief/afmelden/<token>`. Het token is 256 bit; in de database staat alleen de SHA-256-hash.
- **De link openen:** wijzigt niets, zodat linkscanners niemand uitschrijven. Het formulier stuurt een POST naar `/een-klik`.
- **Mailprogramma's:** sturen een POST met `List-Unsubscribe=One-Click` naar dezelfde route.
- **Gevolg:** de abonnee wordt `unsubscribed`. Een herhaling is veilig. Een onbekend token wijzigt niets.

## Rechten

- **Tabel:** `private.newsletter_deliveries` heeft RLS en geen directe rechten voor anon, authenticated of service_role.
- **Servertoegang:** verloopt via `public.newsletter_delivery_server`, alleen voor service_role. Die controleert zelf dat de actor een actieve admin of board-gebruiker van de organisatie is.
- **Publieke uitschrijving:** `public.newsletter_one_click_unsubscribe(token_hash)` is uitvoerbaar door anon.

## Invoering

- **Migratie:** `20261122170000_newsletter_per_recipient_delivery.sql`, additief, met een uitgebreide statuscontrole op `newsletters`.
- **Schakelaar uit:** het bestaande BCC-pad blijft ongewijzigd werken.
- **Schakelaar aan:** de BCC-verzendknop wordt geweigerd.
- **Voorwaarden vóór een echte verzending:** SPF, DKIM en DMARC voor het afzenderdomein, `GOOGLE_GMAIL_SENDER` (afzender), `NEXT_PUBLIC_SITE_URL` (https) en een afzonderlijk akkoord voor de praktijkproef.
