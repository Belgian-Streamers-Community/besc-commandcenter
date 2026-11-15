# Pakket 25 — voorstel voor DEV-acceptatie en websitevrijgave

Peildatum: **15 november 2026**. Status: **lokaal voorbereid voorstel; geen vrijgavebesluit**. Dit document benoemt voorwaarden en resterende proeven. Het voert geen daarvan uit en kent geen eigenaren, termijnen, rechten of formele acceptatie toe.

## Advies en situering

Ga eerst verder met een afgebakende, alleen-lezen DEV-voorcontrole en daarna met afzonderlijk afgesproken praktijkproeven. De lokale bouw en systeemcontroles zijn groen; het volledige ecosysteem is nog niet in de praktijk geaccepteerd. Publieke opening is daarom nog niet onderbouwd. Er wordt geen acceptatiepercentage of einddatum afgeleid uit testaantallen.

Pakket 25 levert nu het vrijgavevoorstel, de [acceptatiechecklist](PAKKET25_ACCEPTATIECHECKLIST.md) en een niet-uitvoerbaar [voorbereidingsmanifest](../ops/package25-release-preparation.json). De uitvoering van de open punten is vervolgwerk. Een documentatie-PR of groene imagebouw sluit die punten niet.

### Betrouwbare uitgangspunten

| Onderdeel | Vastgelegd bewijs | Grens |
| --- | --- | --- |
| Command Center | PR #168 is samengevoegd als `b70fde54d793e5de0f360fe608fd499194a4d87e`; alle 17 aanvullende main-controles en de DEV-imagebouw geslaagd. | Geen bevestiging van de huidige serverimage of Cloud-schemahistorie. Deze documentatie gebruikt het opgeslagen resultaat van de controle in deze chat. |
| Gebouwde CC-image | `ghcr.io/missrinam80-besc/besc-commandcenter:b70fde54d793e5de0f360fe608fd499194a4d87e`, digest `sha256:37d920085fd1e12674cd7c3facc2efe6280bd4d99e77894212d47e4601380559`. | Gebouwd en opgeslagen betekent niet uitgerold. |
| Lokale systeemacceptatie | [Pakket 24](PAKKET24_ACCEPTATIEMATRIX.md): CC 2.033 tests, website 61 contracttests en 5 + 8 browserproeven, bot 323 tests, plus beheer-/API-/herstelcontroles. | Fixtures en mocks; geen nieuwe echte gebruikers-, provider- of bedrijfsacceptatie. Geen overlappende suites optellen. |
| Website | Lokaal getest op `f273784674b0db7b31eacee420d290c44351b234`. | Geen actuele runtime-, content- of publieke vrijgave bevestigd. |
| Bot | Lokaal getest op `f71f0ea2f5b7507c16c030439802c021b22c16c2`. | Niet gestart in deze ronde; geen huidige Discordwerking afgeleid. |
| Historische praktijkbewijzen | Pakket 24 verwijst naar beperkte bewaking/herstel op 5 november en eigen aanmeld-/herstelmail op 5/6 november. | Gedateerd bewijs; geen actuele volledige heracceptatie. CC01–CC04 waren synthetische dossiers. |

GitHub-bewijs: [PR #168](https://github.com/missrinam80-besc/besc-commandcenter/pull/168), [main-controles](https://github.com/missrinam80-besc/besc-commandcenter/actions/runs/43734892566), [DEV-imagebouw](https://github.com/missrinam80-besc/besc-commandcenter/actions/runs/43734892627). Geen nieuwe live broncontrole uitgevoerd voor dit voorstel.

## Voorgestelde volgorde en beslismomenten

De indeling hieronder is een voorstel, geen goedgekeurde versmalling van de afgesproken scope. De gebruiker beslist later of een onderdeel buiten een eerste vrijgave mag blijven. Een uitgesteld onderdeel blijft zichtbaar als open; het wordt niet als voltooid geboekt.

| Fase | Werk en afhankelijkheden | Voorwaarde om verder te gaan |
| --- | --- | --- |
| 25A — actuele DEV-basis | C01–C05: exacte repositories/runtime/schema/terugval, eigen toegang, bronbeschikbaarheid en huidige bewaking vaststellen; geen formulier opslaan of provideractie starten. | Omgeving en toegestane toegang eenduidig. Afwijkingen en eventuele ontbrekende migraties eerst als apart voorstel, niet direct herstellen. |
| 25B — beperkte praktijkacceptatie | C06–C09 en C16–C20: eerst maximaal één bestaand dossier vergelijken; daarna alleen afgesproken gegevens/proeven voor dagelijkse workflows, mobiel, herstel en beheer. | Bron, eigenaar, gegevens en bijwerkingen per proef vooraf concreet. Zonder actuele bron geen echte bedragen, crew, voorraad of status invullen. |
| 25C — afzonderlijke integraties | C10–C15: CRM/Gmail/Contacts, Drive, Meta, YouTube, Instagram, nieuwsbrief en merch ieder apart inrichten en accepteren. | Per integratie juiste accountbinding/scopes, gegevensomvang, stop- en herstelwijze en afzonderlijk akkoord op eventuele externe effecten. Geen automatische activering. |
| 25D — websitevoorbereiding | C21–C23: definitieve inhoud, Nieuws & BESC-blog, routes/redirects, mediarechten, Mijn BESC en de zichtbare navigatie afstemmen op werkelijk beschikbare functies. | Content- en functieregister compleet; geen onbewezen claims of doodlopende actieve knoppen. Open functies expliciet uitstellen of eerst afronden. |
| 25E — besluitdossier | C24–C25: bevindingen, resterende risico's, uitgesloten functies en herstelvoorwaarden bundelen. | Gebruiker neemt afzonderlijke besluiten over DEV-acceptatie, eventuele migratie/uitrol, activering en publieke opening. Productie, DNS en indexering blijven aparte besluiten. |

## Wat een eerste vrijgave nog verhindert

Voor **beperkte DEV-acceptatie** ontbreken onder meer actuele runtime-/schemabinding, eigen echte gebruikersflow, echte dossiervergelijking, relevante mobiele schermen en actuele beheer-/herstelonderbouwing. Het is niet vastgesteld hoeveel migraties nog ontbreken of welke image op de server draait.

Voor **publieke websitevrijgave** ontbreken daarnaast definitieve beoordeelde inhoud, media-/portretrechten, oude bloginventaris en routekeuzes, echte portal-/accountacceptatie en een beproefde terugval. Een website met uitgestelde integraties kan alleen een afzonderlijk voorgestelde beperkte scope krijgen; de gebruiker moet die scope nog bevestigen.

Voor **volledige ecosysteemacceptatie** blijven de echte providerketens, nieuwsbrief-/merchaansluiting, dagelijkse echte BESC-workflows, onafhankelijke bewaking, volledige herstelketen en een benoemde vervanger voor techniek/mailbox open. Een lokaal model met mocks bewijst de werkelijke database-, sessie-, beheer-, website- of providerverbinding niet.

De proeven met een tweede beoordelaar zijn op gebruikerskeuze **overgeslagen en niet uitgevoerd**. Er worden geen accounts gemaakt, rechten toegekend of zelfgoedkeuringsregels omzeild om dit te compenseren. Dit blijft een expliciete beperking in het latere acceptatiebesluit; lokale rechtencontroles blijven afzonderlijk bewijs.

## Website: inhoud en bezoekerservaring

Behoud de herkenbare BESC-stijl en het oorspronkelijke logo; controleer licht/donker, mobiel, toetsenbord en begrijpelijke fout-/lege toestanden. De vaste navigatie is **Over BESC · Creators · Esports & Gaming · Events · Community · Samenwerkingen · Media & Impact**, met Mijn BESC apart. Home is bereikbaar via het logo. Merch is alleen een bruikbare ingang wanneer catalogus en afhandeling daadwerkelijk beschikbaar zijn.

**Nieuws & BESC-blog** blijft onder Media & Impact, met een herkenbare homepage-ingang en hetzelfde label in footer en broodkruimels. Behoud `/nieuws` en `/nieuws/{slug}`. Inventariseer de bestaande blogartikelen, afbeeldingen, auteurs, datums, categorieën en bijlagen; leg per item vast wat behouden, herzien, uitgesloten of nog onbekend is. Publicatie en import worden hier niet uitgevoerd.

Controleer de homepage tegen de vastgelegde sitemap, inclusief de ingangen naar creators, events, community, samenwerkingen en Nieuws & BESC-blog. Live-status, sponsors, impactcijfers, producten en actieve programma's vragen bevestigde bronnen. Academy, NEXT UP, Originals, Cares en toernooien worden niet door deze voorbereiding actieve programma's.

Gebruik voor routecontrole een register met oude URL, huidige bestemming, voorgestelde nieuwe bestemming, reden, bewijs en besluit. Geen algemene redirect naar Home. Controleer gereserveerde routes zoals `/media/{public_media_id}`, `/media-en-impact` en statische ingangen tegenover dynamische slugs. Een redirectbestand of routewijziging is vervolgwerk, niet deze oplevering.

Websitebronnen op exact geteste versie: [sitemap, navigatie en homepage](https://github.com/missrinam80-besc/besc-website/blob/f273784674b0db7b31eacee420d290c44351b234/docs/website/Sitemap-navigatie-en-homepage.md) en [pakketplanning](https://github.com/missrinam80-besc/besc-website/blob/f273784674b0db7b31eacee420d290c44351b234/docs/website/Ontwikkelplanning-vanaf-pakket-9.md). De websitebron wordt hier niet gewijzigd.

## Regels voor latere praktijkproeven

Per proef bevat het latere uitvoeringsvoorstel: exacte DEV-omgeving en componentversies; doelaccount en organisatie zonder geheimen; bestaande dossier-/provider-ID's of exact aantal nieuwe testitems; toegestane leesvelden; eventuele oude/nieuwe waarden; mogelijke neveneffecten; akkoord; stopregel en herstelwijze. Een verwachte uitkomst is geen behaald resultaat. Eigenaar en datum blijven **nog af te spreken**.

Gebruik voor nieuwe synthetische items `TESTFIXTURE — NIET PUBLICEREN`. Geef bestaande echte records nooit dit label om ze als test te gebruiken. Een alleen-lezen proef opent geen bewerkformulier met autosave en vraagt geen synchronisatie/tokenvernieuwing aan. Als een scherm of route toch een extern effect kan veroorzaken, stop dan en kies een bewezen alleen-lezen route of werk het voorstel bij vóór uitvoering.

Bewaar per resultaat alleen noodzakelijke versie-/tijd-/bewijsverwijzingen en geredigeerde bevindingen; geen tokens, sessielinks, wachtwoorden, volledige postvakken, persoonsgegevenslijsten of echte back-ups in Git. Een contact- of mailproef is geen toestemming om mail te versturen of Contacts te synchroniseren.

## Terugval en stopvoorwaarden

- Stop bij onduidelijke omgeving, accountbinding, bronidentiteit, bevoegdheid, onverwachte gegevensmutatie of provideractie. Leg de waarneming vast; geen aanvullende live diagnose buiten de afgesproken scope.
- Voor een latere uitrol: bevestig eerst huidige image/digest, doelimage, configuratie, schemahistorie en compatibiliteit met terugval. De vorige image terugzetten herstelt geen databasewijziging of extern effect.
- Voor een latere migratie: beschrijf exacte migraties, herstelpunt, controle en compatibiliteit. Geen automatische downmigratie of verwijdering van historie/gegevens. Uitvoering en een eventuele herstelactie vragen hun eigen concrete scope.
- Voor imports en muterende proeven: bewaar een begrensde uitgangssituatie en herleidbare resultaat-ID's. Nieuwe testitems niet automatisch verwijderen; bewaar of ruim alleen op volgens apart afgesproken aantallen en scope.
- Voor publicatie, mail, betaling of providerintrekking: ga niet uit van technische omkeerbaarheid. Deze effecten vragen een afzonderlijke opdracht en passend herstel-/opvolgvoorstel.

## Eerstvolgende uitvoerbare opdracht — voorstel, nog niet uitgevoerd

Begin met **25A: uitsluitend de actuele DEV-basis inventariseren**, met C01–C05 als controlelijst. Doel is een afwijkingsrapport met werkelijke runtimeversies, toegepaste migratie-ID's, herstel-/terugvalidentiteit, eigen leestoegang en bestaande bewakingsstatus. Geen secrets tonen, volledige tabellen exporteren, formulier opslaan, sync starten of instellingen wijzigen. Vooraf moet de toegestane leesomvang van servers, Cloud en het eigen account concreet worden bevestigd; dit document is dat akkoord niet.

Pas daarna kan C06, de reeds voorbereide [pakket-23-leesproef](PAKKET23_DATA_INVENTARIS_EN_PRAKTIJKPROEF.md), worden uitgevoerd met bevestigde bron-/dossierbinding. Bij geen of meerdere passende dossiers volgt een verschilrapport, geen nieuwe invoer. Verdere schrijf- of providerproeven worden daarna per onderdeel afgebakend.
