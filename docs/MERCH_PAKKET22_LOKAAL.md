# Pakket 22 — merch: inventaris en lokale keten

Datum: 15 november 2026. Basis Command Center: `4addbec858b1fb1a00d1a2aed55598a1f00cf3cc`.

## Status en grens

Een afzonderlijke lokale acceptatieketen is gebouwd voor catalogus/varianten, proefprijzen, voorraadreservering, offerte, bestelling, betaling, annulering, fictieve levering, retour en terugbetaling. Producten, aantallen, bedragen en afspraken zijn nadrukkelijk **TESTFIXTURE — NIET PUBLICEREN**.

Deze proef wordt niet aangesloten op echte BESC-producten, klanten, accounts, leveranciers, betaalmiddelen, boekhouding of magazijngegevens. Het bestaande product- en lanceringsbeheer blijft behouden. De nieuwe bestanden voegen geen websitepagina's, echte checkout, providerconfiguratie, migratie, publicatie, automatische taak of activering toe. Een nieuwe lokale proefomgeving is geen tweede echt productregister.

## Broncode-inventaris

| Bestaand onderdeel | Bron | Vastgesteld |
| --- | --- | --- |
| Productcatalogus en lanceringen | `src/app/app/shop/`, `src/components/shop-forms.tsx` | Bestaande registers, formulieren en dossierpagina's; productfamilie Stream Graphics of Merchandise; typen/statussen, prijs, stijl, platformen, beschrijving, asset- en shoplink. |
| Gegevensmodel | `supabase/migrations/20260723160000_add_shop_meetings_and_finish_monday.sql` | `shop_products` en `merch_launches`, organisatiecontext, eigenaar, aanmaker, soft-delete en organisatie-RLS. Dit bestand is alleen gelezen, niet uitgevoerd. |
| Leveranciers en dossiers | `supabase/migrations/20260803163000_add_assets_and_shop_relations.sql` | Leverancier, producent, project en campagne bij producten; project/campagne/partner bij lanceringen. Materialen/resources zijn een afzonderlijke module. |
| Beheer en rechten | `src/app/app/shop/actions.ts`, `src/lib/access-matrix.ts`, `src/lib/permissions.ts` | Actieve leden kunnen de module zien; mutaties vereisen beheerder of bestuur. Bestaande generieke product-/lanceringseditor blijft behouden. |
| Financiële verwijzingen | `src/lib/dossier-editor-catalog.ts` | Budgetten, kosten en inkomsten kunnen naar `merch_launch_id` verwijzen. Geen proefomzet in die registers geboekt. |
| Bestaande werkwijze | `docs/wiki/handleidingen/RICHTLIJNEN_SHOP_EN_MERCHANDISE.md` | Product en lancering scheiden; bekende leveranciers/productieafspraken vastleggen; ontwerpen en feiten beoordelen voordat iets klaar/gepubliceerd wordt genoemd. |
| Tests | `tests/assets-shop.test.mts` | Bestaande schema-/relatie-/formuliercontroles; nog geen volledige order-/betalingsketen in deze shoponderdelen. |
| Nieuwe websiteplanning | website `docs/website/Sitemap-navigatie-en-homepage.md`, `Ontwikkelplanning-vanaf-pakket-9.md` | Merch, product/varianten, winkelmand, afrekenen, bevestiging, service/voorwaarden en eigen bestellingen zijn gereserveerd. De operationele shop blijft verborgen zolang de echte keten niet bruikbaar is. |

De bestaande shopcode is een beheer-/planningsmodule. Een productstatus `published` is geen bewijs dat voorraad, betaling of levering operationeel is. Er is in de geïnventariseerde shoponderdelen geen orderregister, betaalprovider, betaalwebhook, voorraadreservering of retourketen aangetroffen waarop deze nieuwe proef rechtstreeks kan worden aangesloten.

## Historische externe shop

Lokale referentie: `D:/CODING/besc-website/website-inhoud-2026-10-03/inventaris.md`, sectie **Shop en merchandise**, opnieuw gelezen tijdens dit pakket.

De momentopname van **3 oktober 2026** beschrijft een Fourthwall-shop op `shop.belgianstreamerscommunity.be` met 16 shoppagina's, waaronder 7 productpagina's en service-/beleidspagina's. Een jerseyverwijzing loopt afzonderlijk via Manatee; die externe productpagina was niet volledig uitgelezen. Dit is historische broninhoud, geen actuele controle van beschikbaarheid, prijzen, varianten, voorwaarden of toegang tot een leveranciersaccount.

Geen actuele winkel, beheeraccount, API, betaalpagina of supportformulier bezocht. Geen historische producten automatisch geïmporteerd. De drie proefvarianten zijn zelfbenoemde fixtures en geen verkoopclaims over die bestaande producten.

## Ontwerp voor de echte keten

- Command Center behoudt het product-/lanceringsdossier en koppelt later naar de gekozen leverancier. Het bestaande onderscheid tussen digitale Stream Graphics en fysieke merchandise blijft intact. Dit pakket simuleert alleen fysieke merchandise.
- Behoud van de bestaande externe shop is een te onderzoeken aansluitoptie. Er is **geen beslissing genomen om Fourthwall te vervangen of om zelf betalingen te gaan verwerken**. Eerst vaststellen welke leverancier voor welke collectie de bestelling, betaling, productie, verzending en service uitvoert.
- Een toekomstig orderregister moet bron/provider, externe order-ID, product-/variant-ID, organisatie, eigendom, bevroren bedragen, betaalstatus, levering, retour en historie afzonderlijk bewaren. Dezelfde providerorder mag niet als tweede BESC-verkoop worden aangemaakt.
- Catalogusgegevens zijn pas publiek bruikbaar na bevestiging van productafbeeldingen/rechten, varianten, prijs/valuta, beschikbaarheid en leverinformatie. Voorraad uit de materialen/resource-module wordt niet als verkoopvoorraad overgenomen.
- Een eigen betaaladapter wordt pas gekozen als die werkelijk nodig is. Deze stap maakt geen account aan, kiest geen betaald abonnement, maakt geen API-sleutel en kent geen betaaltoegang toe.
- De geteste lokale keten definieert het contract dat een toekomstige database-/sessie-/provideradapter moet volgen. De echte adapter en productaansluiting zijn nog niet gebouwd of geaccepteerd; de lokale proef mag niet als productieklare webshop worden gepresenteerd.

## Uitvoerbare lokale keten

### Catalogus, offerte en bestelling

De proefcatalogus bevat een fictief shirt in twee varianten en een fictieve mok. De server rekent uitsluitend met gehele eurocenten en EUR. De proefverzendkosten zijn vast 450 cent. Deze bedragen zijn geen echte prijzen, verzendtarieven, btw-berekening of factuur.

De klant vraagt een offerte, ziet de regels en het totaal en bevestigt expliciet een **fictieve** bestelling. De server accepteert geen meegestuurde productprijs, btw, korting of betaalstatus. De kern ondersteunt een winkelmand met meerdere varianten; de eenvoudige lokale UI laat één variant per offerte kiezen.

Een gewijzigde prijs/variantversie vereist een nieuwe offerte. Ontbrekende/niet-beschikbare varianten, dubbele regels, nul/fractionele/te grote aantallen en onvoldoende voorraad worden geweigerd. Een offerte op zichzelf reserveert niets. Plaatsen reserveert de aantallen atomair voor 15 minuten. Twee klanten kunnen dezelfde laatste voorraad niet allebei reserveren.

Een bestelcode is per klant uniek. Dezelfde knop met dezelfde inhoud geeft dezelfde order terug; gewijzigd hergebruik geeft een fout. Een oude knop na verlopen/annuleren creëert geen nieuwe order. Een order bewaart de bevestigde prijs, ook wanneer daarna de catalogusprijs verandert.

### Betaling en onzekerheid

Betaling heeft een eigen duurzame taak. Alleen de eigenaar of bevoegde proefbeheerder kan die klaarzetten. Herhaalde knoppen en workers maken geen tweede afschrijving. De taakclaim staat op schijf vóór de provideraanroep.

De nagebootste provider bewaart zijn resultaat in een **afzonderlijk versleuteld bestand**, buiten de ordertransactie. Een resultaat bevat een taak/order-ID, bedrag, valuta, type, ontvangstbewijs, tijdstip en unieke gebeurtenis-ID en is ondertekend met een lokale proefsleutel. Verkeerde handtekening, verkeerde order/bedrag/valuta/type, verouderde berichten, nog niet gestarte taken en conflicterende gebeurtenissen worden geweigerd. Het openen van een bevestigingspagina of een klantformulier kan niet `paid` zetten.

Acceptatie verwerkt de reservering één keer in de voorraad. Weigering geeft de reservering vrij. Ontbreekt een betrouwbare uitkomst, dan blijft de taak onzeker en de reservering behouden, ook na de normale termijn van 15 minuten. Er volgt geen automatische nieuwe afschrijving, annulering of voorraadvrijgave. De beheerder kan uitsluitend providerbewijs opvragen. Opvragen leest het bestaande nagebootste ontvangstbewijs; het voert geen nieuwe betaling uit. Geen bewijs betekent dat de taak onzeker blijft.

Een procesherstart verandert een onderbroken claim pas na expliciet herstel in onzeker. Een aparte test stopt daadwerkelijk een Node-proces ná het vastleggen van provideracceptatie en herstelt daarna met hetzelfde onafhankelijke bewijs, zonder tweede betaling of dubbele voorraadaftrek.

### Annulering, levering en retour

- Annuleren vóór betaling is idempotent en geeft voorraad vrij. Een lopende/onzekere betaling kan niet blind worden geannuleerd.
- Een betaalde, nog niet verzonden order annuleren leidt tot een terugbetalingsverzoek. Voorraad wordt pas teruggezet na bevestigd proefresultaat.
- Fictief verzenden/afleveren vereist een betaalde order en een beheerrol. Er worden geen transporteur, verzendlabel of echte e-mail aangeroepen. Tracking is herkenbaar `TESTFIXTURE-…`.
- Een retour kan alleen voor de eigen afgeleverde order worden gevraagd. Een beheerder beoordeelt de aanvraag en registreert de ontvangst afzonderlijk.
- De proef simuleert volledige-orderretouren en volledige terugbetaling, inclusief de fictieve verzending. Er zijn geen deelretouren, ruilingen, kortingscodes, maatwerk, btw/facturen of digitale levering geïmplementeerd.
- Alleen als de ontvangen goederen herbruikbaar zijn verklaard én de proefterugbetaling bevestigd is, keren zij terug in de beschikbare voorraad. Afgekeurde/beschadigde goederen worden niet opnieuw aangeboden.
- Ook terugbetalingen hebben duurzame taken en onzekerheid. Een onbekende uitkomst wordt niet opnieuw geprobeerd. Alleen een definitief geweigerde proefterugbetaling heeft een expliciete, eveneens idempotente nieuwe-pogingactie.
- Pauzeren blokkeert nieuwe bestellingen en nieuwe afschrijvingen, maar geen bewijsopvraag of terugbetaling. Historie blijft behouden.

Dit zijn **simulatieafspraken**, geen vastgestelde BESC-verkoopvoorwaarden, servicebelofte of juridische conformiteitsclaim. Voor echte gebruiksvoorwaarden/levering/retouren moeten verkoper, leverancier en werkwijze eerst vaststaan en apart worden beoordeeld.

## Lokale bediening en opslag

- `src/lib/merch-chain.ts`: order-/voorraad-/betaal-/leverings-/retourcontract en rechtencontrole.
- `src/lib/merch-local-store.ts`: gescheiden versleutelde fixturebestanden, atomaire transacties, exclusieve proceslock en stoppen bij beschadiging of verkeerde sleutel.
- `src/lib/merch-mock-provider.ts`: nagebootste acceptatie, weigering, onderbreking vóór/na resultaat en alleen-lezen bewijsopvraag. Geen echte provider-SDK, netwerk- of cloudclient.
- `scripts/merch-local-preview.mts`: catalogus, expliciete offerte, eigen proefbestellingen, service-informatie en afgeschermde lokale beheerbediening.
- `tests/merch-*.test.mts`: gedrag, rechten, HTTP-keten, herstart en procesonderbreking.

Tests: `pnpm test:merch`. Handmatige proef: stel `BESC_MERCH_FIXTURE_DIRECTORY` in op een **nieuwe lokale proefmap** en `BESC_MERCH_FIXTURE_KEY` op 32 willekeurige bytes als 64 hextekens; voer `pnpm merch:local` uit. Geen echte sleutels of adressen gebruiken. De proef luistert alleen op `127.0.0.1:21422`; productieomgeving en ontbrekende expliciete inschakeling worden geweigerd. Er zijn geen nieuwe afhankelijkheden.

De willekeurige lokale beheerlink geeft alleen toegang tot deze fixtureomgeving. De lokale klantcookie identificeert uitsluitend de fictieve klant; dit vervangt geen BESC Auth. Beheer vereist apart een HttpOnly/SameSite-cookie en formulieren vereisen Origin/CSRF-controle. Verkeerde Host, te grote formulieren, onbekende acties en inzage in andermans order worden geweigerd. De catalogus bevat geen order-/klantgegevens. Cache/indexering staan uit en verwijzers bevatten geen pad of toegangscode.

Beide bestanden zijn met AES-256-GCM versleuteld en gebruiken aparte bestandsnamen, locks en authenticatiecontext. Sleutel niet in Git, bestanden, argumenten of output opslaan. Herstart vereist dezelfde sleutel. Verlies/beschadiging geeft een fout, geen lege nieuwe administratie. Achtergebleven proceslocks worden nooit automatisch verwijderd; eerst bevestigen dat de eigenaar niet meer draait. Op Windows hangen effectieve maprechten van de lokale ACL af. Deze opslag is uitsluitend voor fixtures bestemd en is geen goedgekeurd productie-/back-upsysteem.

## Resterend vóór echte ingebruikname

1. Werkelijke collecties, leverancier(s), verkoper, orderverantwoordelijkheid en huidige externe-shopmogelijkheden vaststellen.
2. Bevestigde producten/afbeeldingen/varianten/bedragen en voorraadmodel of productie-op-bestelling vastleggen.
3. Beoordelen of externe checkout volstaat; pas zo nodig een betaal-/webhookadapter ontwerpen en lokaal testen volgens dit contract.
4. Bestaande organisatie-/sessiecontext, productdossiers, duurzame database en eventuele Mijn BESC-bestellingen aansluiten; eventuele additieve migraties apart voorbereiden en beoordelen.
5. Levering, retouren, financiële afhandeling en toepasselijke verkoopinformatie vaststellen. Geen proefbedragen of simulatieregels publiceren.
6. Daarna pas met aparte opdracht beperkte echte acceptatie, migratie/uitrol en eventuele activering. De huidige opdracht geeft die toestemming niet.
