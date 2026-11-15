# Pakket 23 — echte BESC-data en beperkte praktijkproef

Voorbereid op **15 november 2026**, op Command Center-bronversie `b28813a2aa607126247595dd7b5279d8ea8b95ad`. Alleen lokale broncontrole en voorbereiding; geen operationele gegevens gewijzigd.

## Uitkomst

Er is een controleerbare **historische bron** voor BESC Lach@ton 2024 en een oudere uitlezing van het eigen BESC-account. De gecontroleerde invoertemplates bevatten voorbeelden en de eerdere CC01–CC04-ketenproeven gebruiken synthetische dossiers. Die zijn geen echte project-, crew-, voorraad- of financiële administratie.

Actuele gegevens in Cloud DEV, Drive en Monday zijn **niet vastgesteld**: de drie connectors konden bij twee begrensde pogingen niet starten, voordat een bron werd uitgelezen. Dit bewijst geen storing of ontbrekende gegevens in die systemen. Er is geen alternatieve route met geheime sleutels, bestaande wachtwoorden of tokenvernieuwing gebruikt.

Een kleine **alleen-lezen bron-/dossierproef** is concreet voorbereid. Uitvoering daarvan vereist eerst herstelde leestoegang, actuele identiteit/rechten, de actuele applicatie-/schemaversie en één eenduidig bestaand dossier. Er is nog geen schrijfproef op echte gegevens startklaar of goedgekeurd. Dit document verklaart pakket 23 als geheel niet geaccepteerd.

## Wat beschikbaar en bruikbaar is

| Bron | Datering / omvang van deze controle | Wat dit wel bewijst | Grenzen |
| --- | --- | --- | --- |
| Lokale publieke website-inventaris | Momentopname 3 oktober 2026, `D:/CODING/besc-website/website-inhoud-2026-10-03/` | Herleidbare oude teksten, URL's en verwijzingen. De tekst van het event uit 2024 is opnieuw gelezen en de titel-/datumankers zijn gecontroleerd. | Geen actuele partnerstatus, planning, beschikbaarheid, prijzen of publicatietoestemming. |
| BESC Lach@ton-brontekst | Historisch event van 1–3 november 2024; bron vastgelegd op 3 oktober 2026 | Titel, genoemde start/eindtijd en historische begunstigde zijn als bronclaims beschikbaar. | Geen huidige dossier-ID, eigenaar, status, crewafspraken, voorraad of bedragen. |
| Contacten-uitlezing uit eerdere CC03-voorcontrole | 6 november 2026, `work/CC03-20261106/contacts-readonly.txt` | Het eigen profiel `missrinam80` was zichtbaar en accountgekoppeld. | Geen bevestiging van huidige sessie, bevoegdheid of inzetbaarheid. Andere personen zijn niet in dit pakket overgenomen. |
| Invoertemplates | 8 CSV-bestanden, 12 voorbeeldregels exclusief headers, gecontroleerd op voorbeeldmarkeringen | Beschikbare invulstructuur voor gebruikers, creators, sponsors, projecten, events, campagnes, materialen en kennis. | **Geen echte bedrijfsdata**. Een bestaande bedrijfsnaam of productnaam in een voorbeeld is geen bewijs van een afspraak of bezit. |
| CC01–CC04-bewijzen | Vier lokale bewijzensets van 6 november 2026 | Eerder uitgevoerde afgebakende technische proeven: project/taak, event/crew/materiaal, organisatie/contact en financiële totalen. | Alle vier bewust uitgesloten als echt praktijkdossier; geen nieuwe live acceptatie afgeleid. |
| Monday-exportcode | Export-/importscripts aanwezig onder de gecontroleerde `monday-export/build`-mappen | Er bestaat technische exportvoorbereiding. | Scripts zijn geen exportdata en zijn niet uitgevoerd. Geen exportbestand gevonden op de specifiek gecontroleerde outputlocatie; geen uitspraak over alle lokale mappen of het hele Monday-account. |
| Gesynchroniseerd projectarchief | `sources/BESC command center.zip`, alleen bestandsmetadata gecontroleerd | Er is een lokaal projectarchief beschikbaar. | Inhoud niet geopend, uitgepakt of als echte administratie gebruikt. `sources/` is ongewijzigd. |

De broncontrole en SHA-256-vingerafdrukken staan buiten Git in `work/real-data-package23-evidence/LOCAL-SOURCE-INSPECTION.json`. Geen volledige brondumps, persoonsgegevenslijsten, ZIP, back-ups of credentials zijn aan deze branch toegevoegd.

## Inventaris per werkstroom

| Werkstroom | Beschikbare onderbouwing | Wat nog nodig is voor een echte dagelijkse proef |
| --- | --- | --- |
| Projecten/taken | Voorbeeldtemplate en synthetische CC01-proef. | Eén werkelijk lopend project, bestaand dossier-ID, geverifieerde eigenaar, doel/opleveringen en concrete taak. Geen projectnaam of deadline uitvinden. |
| Events/planning | Historische Lach@ton-bron; synthetische CC02-proef is apart herkenbaar. | Actueel bestaand eventdossier en bevestigde gegevens; historische tijden niet als nieuwe planning toepassen. |
| Organisaties/CRM | Historische vermelding van Bring-a-smile als begunstigde; CC03 bewijst een fictieve koppeling. | Bestaand CRM-ID en actuele relatiegrond/rol. Niet automatisch als actieve sponsor, prospect of contractpartij aanmerken. |
| Contacten/accounts | Historische uitlezing van het eigen profiel. | Actuele sessie en profielkoppeling; externe zakelijke contactgegevens uit een geverifieerde bron. Geen account, uitnodiging of portaalrecht toekennen. |
| Crew | Eerdere eigen-accountkoppeling en een expliciet fictieve CC02-shift. | Actuele beschikbaarheid en afgesproken inzet. Een crewlabel of account is geen bevestigde eventafspraak. |
| Materialen | Materialentemplate en fictief CC02-materiaal zonder echt asset-ID. | Gecontroleerd werkelijk object, voorraad/locatie, verantwoordelijke en gebruiksafspraak. De voorbeeldregel “Streamdeck” bewijst geen bezit. |
| Kosten/budgetten/inkomsten | Alleen synthetische CC04-bedragen in de gecontroleerde bewijzenset. | Werkelijk brondossier en bevoegd toegankelijke bewijsstukken. Eerder bewijs noemt Assist Online als boekhoudbron; die bron is nu niet geopend of actueel bevestigd. Onbekend blijft onbekend, niet € 0. |
| Documenten/Drive | Lokale bronverwijzingen; Drive niet uitleesbaar via connector. | Werkelijk bereikbaar document met datum/versie, dossiercontext en passende rechten. Geen automatische kopie of sync. |
| Rapportage | Historische synthetische totalen zijn aantoonbaar; geen actuele volledige bedrijfsmeting. | Overeengekomen selectie echte dossiers, uitsluiting van fixtures/archief, juiste datum/valuta en aansluiting op bronbedragen. Geen globale DEV-totalen als echte BESC-resultaten presenteren. |

## Belangrijke kwaliteitsbevindingen

1. **Actualiteit niet bevestigd.** De connectors faalden vóór bronuitlezing. Er zijn dus geen actuele aantallen echte records, geen actuele volledigheidspercentages en geen recente database-/runtimecontrole. Ontbrekende toegang is niet hetzelfde als een lege administratie.
2. **Voorbeelden lijken soms op echte data.** De sponsor-/campagnetemplates noemen bijvoorbeeld GameGear, maar bevatten voorbeeldcontacten en test-/voorbeeldmarkeringen. Dat is geen sponsorcontract. De 12 regels zijn als voorbeelden uitgesloten; niet geïmporteerd of aan echte relaties gekoppeld.
3. **Technische acceptatie is geen dagelijkse praktijk.** De CC01–CC04-proeven zijn expliciet synthetisch. Hun project/event/contact/bedragen blijven buiten deze selectie; niets is opgeschoond of gearchiveerd.
4. **Een historische vermelding is geen huidige verplichting.** Een benefietevent uit 2024 levert geen nieuwe budgetgoedkeuring, actieve sponsorrelatie of crewtoezegging op. Een verstreken datum bewijst niet welke huidige dossierstatus gekozen moet worden.
5. **Opslaan kan externe gevolgen hebben.** `src/app/app/events/actions.ts` roept bij wijziging van een bestaand event `syncLinkedEvent` aan. `src/lib/linked-calendar-sync.ts` kan een reeds gekoppeld agenda-item bijwerken als de benodigde tijden aanwezig zijn. Deze proef gebruikt geen opslaan-/annuleren-/synchronisatieactie.
6. **Bronversie is geen serverversie.** Dat `main` versie `b28813a` en een geslaagde image bevat, bewijst geen uitrol van die versie. De actuele DEV-runtime en Cloud-migratiehistorie zijn in dit pakket niet uitgelezen. Nieuwsbrief en merch blijven lokale proeven; zij zijn geen onderdeel van deze echte-data-acceptatie.

## Voorstel P23-R01 — één historisch dossier alleen lezen en vergelijken

**Waarom dit dossier:** de historische Lach@ton-tekst is daadwerkelijk beschikbaar en herleidbaar. Er is geen voldoende gecontroleerd actueel project-/eventpakket gevonden om nu een lopende uitvoering of financiële proef te concretiseren. Het historische dossier is een voorstel, geen door de gebruiker aangewezen lopend project.

**Doel:** controleren of één bestaand echt eventdossier, de bronverwijzing en het eigen account in Command Center herleidbaar en consistent te lezen zijn. Geen nieuwe invoer. Dit bewijst niet dat operationele uitvoering, financiële afhandeling of andere rollen geaccepteerd zijn.

### Bronfeiten en open velden

Publieke historische bron: [BESC Lach@ton 2024](https://www.belgianstreamerscommunity.be/evenementen/eventkalender/2024/BESC-Lachaton), gebruikt via de lokale momentopname, niet opnieuw live opgehaald.

| Veld | Wat de momentopname zegt | Behandeling |
| --- | --- | --- |
| Titel | “BESC Lach@ton tvv Bring-a-smile” | Vergelijken; geen bestaande titel overschrijven. |
| Begin | 1 november 2024, 20h | Bronwaarde bewaren als lokale tekst/datum/tijd; geen UTC-conversie zolang de bron-tijdzone niet bevestigd is. |
| Einde | 3 november 2024, 23h | Idem; niet als nieuwe deadline of huidige planning gebruiken. |
| Begunstigde | Bring-a-smile | Alleen historische rolvermelding; geen CRM-relatie creëren. |
| Bestaand event-/project-/CRM-ID | Niet vastgesteld | `null`; eerst zoeken en identiteit bevestigen. |
| Status, prioriteit, eigenaar, BESC-rol | Niet vastgesteld als huidige invoerwaarde | Niet invullen met formulierdefaults of automatisch “afgerond”. |
| Actuele contactpersoon, crew, materiaal en financiële bedragen | Niet vastgesteld | Buiten mutatiescope; geen namen, saldi of nulbedragen verzinnen. |

### Exacte afbakening

- Maximaal **één bestaand eventdossier**, **één eigen profiel** en **één reeds gekoppelde historische organisatieverwijzing** bekijken; alleen wat voor deze vergelijking nodig is.
- Geen nieuwe projecten, events, taken, contacten, organisaties, accounts, links, checklistitems, planningsregels of financiële regels.
- Geen wijzigingen van status, eigenaar, termijn, relatie, budget, bewijs of archiefstand. Geen materiaalreservering of crewtoewijzing.
- Geen mail, uitnodiging, agenda-/Drive-/socialactie, provider-/tokenvernieuwing, export van volledige tabellen, migratie, uitrol of activering.
- Bestaande audit-/testgegevens, rechten en saldi blijven behouden. Geen terugvalactie nodig voor bronrecords, want er worden geen mutaties voorbereid of uitgevoerd.

### Stappen en verwacht bewijs — nog niet uitgevoerd

| Stap | Handeling bij later herstelde leestoegang | Verwacht resultaat / stopregel |
| --- | --- | --- |
| 0 | Controleer bronbereikbaarheid, juiste BESC-DEV-organisatie, actuele sessie en toegestane leesrechten; stel runtime-/schemaversie vast. | Identiteit/omgeving aantoonbaar. Bij onbekende context stoppen; geen service-role-uitweg of nieuwe rechten. |
| 1 | Zoek het bestaande event op historische titel en periode, met uitsluiting van `TESTFIXTURE`, demo/voorbeeld- en expliciet als test geregistreerde dossiers. | Exact één passende kandidaat. Nul of meerdere kandidaten: verschilrapport maken, niets aanmaken, samenvoegen of herlabelen. |
| 2 | Lees alleen het gekozen dossier en relevante bestaande bron-/relatieverwijzingen. | Vastgelegde dossier-ID, huidige status/versie, bron en leesdatum. Geen formulier opslaan om gegevens “even te proberen”. |
| 3 | Vergelijk titel, datums/tijden en historische begunstigde met de lokale bron. | Per veld: overeenkomend, afwijkend of onbekend; geen stil herstel. Onbekende tijdzone blijft expliciet. |
| 4 | Controleer uitsluitend het eigen profiel en dat het account gekoppeld is. | Eigen identiteit herleidbaar; geen personeelslijst, rolwissel, andere beoordelaar of nieuwe toegang. Crewlabel telt niet als eventinzet. |
| 5 | Controleer of bron-/dossierverwijzing via de gewone bestaande leesweergave bruikbaar is, zonder de niet-aangesloten nieuwe integraties te activeren. | Eenduidige context of concreet foutbewijs. Geen mail/Drive-/agenda-opdracht starten. |
| 6 | Leg de vergelijking en ontbrekende gegevens lokaal vast. | Nul nieuwe/gewijzigde bedrijfsrecords en nul aangevraagde externe acties. Onuitgevoerde onderdelen blijven onuitgevoerd. |

Succes betekent uitsluitend **één echte historische bron en één bestaand dossier zorgvuldig vergeleken**. Een rol-/rechtenproef met een tweede account blijft zoals afgesproken overgeslagen en wordt niet als geslaagd geboekt.

## Vervolg voor een schrijfproef met actuele BESC-data

Eerst moeten de leestoegang en het actuele dossier worden bevestigd. Voor echte dagelijkse project-/eventuitvoering is daarnaast een daadwerkelijk lopend dossier met bron, eigenaar en afgesproken taak nodig. Daarna pas een apart mutatievoorstel maken met exacte dossier-ID's, velden, oude/nieuwe waarden, aantallen, toegestane bijwerkingen, verwachte rapportage en herstelwijze. Geen generieke toestemming voor invoer afleiden uit deze voorbereiding.

Financiële proef pas met werkelijk bewijs, valuta/status en toegang tot de juiste financiële bron. Geen boeking, betaling of goedkeuring als technische controlemethode. Publicatie, externe communicatie, provideractivering en nieuwe accounttoegang blijven apart.

De bijbehorende niet-uitvoerbare selectie staat in `ops/package23-readonly-practice-plan.json`. Deze branch bevat uitsluitend documentatie en een voorbereidingsmanifest; geen migratie, importbestand, uitvoerbare mutatie of applicatiewijziging.
