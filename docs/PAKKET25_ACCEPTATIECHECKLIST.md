# Pakket 25 — acceptatiechecklist en resterende praktijkproeven

Peildatum: **15 november 2026**. Alle onderstaande praktijkpunten zijn **open**, behalve C20 dat **overgeslagen op gebruikerskeuze** blijft. Deze checklist registreert geen uitgevoerde proeven of acceptatie. Zie het [vrijgavevoorstel](PAKKET25_VRIJGAVEVOORSTEL.md) en de [bewijsgrenzen uit pakket 24](PAKKET24_ACCEPTATIEMATRIX.md).

Per punt later invullen: status, exact doel/versie, uitvoeringsakkoord, afgesproken eigenaar, uitvoerdatum, geredigeerde bewijsverwijzing, afwijking, eventuele herstelhandeling en acceptatiebesluit. Eigenaren/deadlines zijn nu niet toegewezen. Een checkbox wordt pas aangevinkt na daadwerkelijk bewijs; een uitgesteld punt blijft open met een expliciet besluit.

## 25A — actuele basis, eerst alleen lezen

| ID / bron | Resterende controle | Voorwaarde en afgebakende proef | Verwacht bewijs / stopregel |
| --- | --- | --- | --- |
| C01 / A01, A20 | [ ] Runtime en repositorybinding | Later alleen huidige CC-/website-/botversies, image-digests en componentgrenzen lezen; CC-webserver en botserver gescheiden houden. Geen container starten/herstarten. | Versiematrix: bron, gebouwde image, werkelijk draaiende image, meetdatum. Verschil benoemen; geen automatische uitrol. |
| C02 / A20 | [ ] Cloud-schema en terugval | Na exacte leesafbakening toegepaste migratie-ID's vergelijken met de doelbron; beschikbare herstel-/terugvalidentiteit en compatibiliteit inventariseren. Geen rijen/export/secrets nodig voor deze vergelijking. | Verschillenlijst met volgorde en risico's, of geen verschil. Onbekende historie = niet vrijgeven; geen migratie uitvoeren als controlemethode. |
| C03 / A02, A03 | [ ] Eigen toegang en herstelvoorwaarden | Gewone bestaande eigen sessie, organisatiebinding, admin-/previewtoegang en uitloggen/intrekking plannen. Aanmeld-/herstelmails of sessiewijzigingen alleen na afzonderlijke afspraak; historische mailtest is geen actuele hertest. | Alleen eigen account herleidbaar; geen toegang tot vreemde gegevens. Onjuiste binding/ontbrekende rechten = stoppen, geen service-role of nieuw account gebruiken. |
| C04 / A06–A11, A14–A16 | [ ] Bronnen en beschikbaarheidsregister | Na gerichte toestemming uitsluitend noodzakelijke metadata/instellingen van bestaande aansluitingen lezen. Per onderdeel werkelijke adapter, storage, sessie, beheer-UI, website-ingang en providervereisten vastleggen; geheimwaarden niet lezen. | Per keten: bestaand, lokaal voorbereid, ontbrekend of onbekend; plus activeringsstatus. Connectorstartfout bewijst geen lege data of bronsysteemstoring. Geen provider-/tokenvernieuwing starten. |
| C05 / A08, A17 | [ ] Bestaande bewaking en socialplanner | Bestaande status, tijdstempels, begrensde fout-/logmetadata, capaciteit en laatste geplande resultaten lezen binnen afgesproken scope. Geen extra sync, kunstmatige storing of plannerwijziging. | Actuele bronstatus/freshness, foutopvolging en quotagebruik waar beschikbaar. Oude groene status niet als huidige gezondheid tellen; afwijking alleen rapporteren. |

## 25B — echte dossiers en dagelijks gebruik

| ID / bron | Resterende controle | Voorwaarde en afgebakende proef | Verwacht bewijs / stopregel |
| --- | --- | --- | --- |
| C06 / A04, A16 | [ ] Pakket-23-leesproef | Na C01–C04 maximaal één bestaand event, het eigen profiel en één bestaande organisatieverwijzing vergelijken met de historische bron volgens pakket 23. Geen opslaan; geen nieuw dossier. | Dossierbinding en veldvergelijking inclusief onbekende tijdzone. Nul/meerdere kandidaten = verschilrapport. Dit bewijst geen huidige dagelijkse bedrijfsvoering. |
| C07 / A04, A16 | [ ] Actueel project/event, taken en crew | Na C06 een werkelijk lopend dossier met bevestigde bron, eigenaar en bevoegdheid selecteren. Een latere schrijfproef noemt exacte velden, aantallen en bijwerkingen, waaronder mogelijke agenda-updates bij opslaan. | Taak/planning/crew en voortgang na herladen, juiste rechten/historie en rapportage. Geen fictieve crew als echte inzet; onverwachte agenda-/mailactie = stoppen. |
| C08 / A05, A16 | [ ] Materiaal, kosten, budget en inkomsten | Alleen echte goedgekeurde bronstukken, voorraad, valuta en financiële status gebruiken. Voor reservatie/invoer apart exacte records, waarden en herstelwijze afspreken; geen betaling of boeking als technische proef. | Vergelijkbare bron→dossier→rapportage, herleidbare voorraad-/reserverings- en totaalverschillen. Ontbrekend bedrag blijft onbekend, geen nulbedrag of omzet verzinnen. |
| C09 / A02, A12, A13 | [ ] Mijn BESC en dagelijkse schermen | Eigen werkelijk gekoppeld account en toegestane dossiers; geselecteerde kernschermen desktop/mobiel, beide thema's, toetsenbord, focus, labels, fout/lege toestand en toegang na intrekking controleren. Muterende deelname-/aanvraagproeven afzonderlijk afbakenen. | Scherm-/apparaatlijst en geredigeerde bevindingen. Geen persoonlijke gegevens in Git; steekproef niet als volledige WCAG-conformiteit of alle rollen aanmerken. |

## 25C — integraties afzonderlijk accepteren

Alle proeven hieronder zijn **voorbereid als vervolg**, niet gestart. Een functionele leesadapter kan lokale opslag, audit, quota of tokenvernieuwing wijzigen; die gevolgen moeten in het latere proefvoorstel staan. “Alleen lezen bij de provider” betekent dus niet automatisch “geen mutaties”.

| ID / bron | Resterende controle | Voorwaarde en afgebakende proef | Verwacht bewijs / stopregel |
| --- | --- | --- | --- |
| C10 / A06 | [ ] CRM, Gmail en Google Contacts | Eerst C04 en de werkelijke gezamenlijke database-/sessie-/beheerverbinding. Daarna één expliciet gekozen contact/dossier en begrensd gesprek/contactverschil beoordelen. Concept, echte mail en contactsync elk apart met exact adres/inhoud/velden/richting goedkeuren. | Gelijke contactidentiteit, geen duplicaten of stille overschrijving, juiste rechten/historie. Conflicten eerst tonen. Geen eigen mail goedkeuren; tweede-beoordelaarproef blijft C20. |
| C11 / A07 | [ ] Drive-boom, dossierlinks en previews | Bestaande afgebakende Drive-hoofdmap en één toegelaten dossier kiezen. Eerst map-/bestandsmetadata en leesrechten; nieuwe sync/opslag apart afspreken. Linksoorten afbeelding/map/document/toepassing/website en preview met hover, focus en aanraken toetsen. | Boom en verwijzing kloppen, onbevoegde afbeelding niet zichtbaar, bronfout wordt getoond. Geen bulkimport, wijzigingen in Drive of openbaar maken om preview werkend te krijgen. |
| C12 / A09 | [ ] Meta-inbox | Werkelijke Meta-app/accountbinding, benodigde rechten en veilige opslag bevestigen. Daarna een aparte beperkte leesproef met exact account, periode, paginalimiet en opslagomvang; hervatten/deduplicatie aan bestaand bewijs toetsen. | Ontvangst compleet binnen afgesproken bereik, geen dubbelen, controleerbare cursor/foutstatus. Geen antwoorden, moderatie of automatische planneractivering. |
| C13 / A10 | [ ] YouTube-creators | Eigen creator-OAuth-inrichting en veilige sleutels/redirects bevestigen, los van organisatiekoppeling. Eigen BESC-account missrinam80 en kanaal @missrinam80 bevestigen. Voor videostatistieken ontbreekt nog een geschikte eigen proefvideo; niets uploaden. | Later apart toegestane koppeling, account-/kanaalbinding, beperkte statistieklezing en intrekking aantoonbaar. Zonder video geen videostatistiekclaim; geen activering of tokenvernieuwing in deze voorbereiding. |
| C14 / A11 | [ ] Instagram-publicatie | Werkelijke Meta-inrichting, account, beeldrechten, verplichte afbeelding en goedkeuringsstatus aantonen; exact later proefbericht en mogelijke providerbijwerkingen benoemen. | Eerst gereedheidsrapport; echte publicatie alleen met aparte opdracht. Geen omzeiling van goedkeuring of claim dat mockpublicatie live geslaagd is. C20 blijft zichtbaar. |
| C15 / A14, A15 | [ ] Nieuwsbrief en merch: twee afzonderlijke besluiten | Nieuwsbrief: verzendoplossing kiezen en echte database/sessie/beheer/website/provider aansluiten; toestemming, bevestigen, uitschrijven en archief testen in begrensde proef. Merch: verkoper/leverancier, catalogus/prijzen/voorraad, betaling, levering/retour en echte aansluitingen bevestigen. | Twee aparte bewijs-/effectregisters. Geen echte mail, bestelling, reservering, transactie of productpublicatie zonder exact akkoord. Ontbrekende aansluiting = niet bruikbaar verklaren; checkout niet activeren om te testen. |

## 25B vervolg — beheer en bedrijfszekerheid

| ID / bron | Resterende controle | Voorwaarde en afgebakende proef | Verwacht bewijs / stopregel |
| --- | --- | --- | --- |
| C16 / A19, A20 | [ ] Actueel herstel en terugval | Eerst actuele herstelpunten en componentbereik inventariseren; echte kopie/herstelproef vraagt aparte locatie-, data-, sleutel-, onderbrekings- en opruimscope. Daarna geïsoleerd herstel voor app/Auth/Storage/bot en gecontroleerde heraansluiting van SMTP/OAuth/provider voorbereiden. | Hersteltijd, integriteit, accounts/toegang en componentversies aantoonbaar. Synthetische SQL-restore of vorige image is geen volledig ecosysteemherstel. Geen echte geheimen/back-ups in Git. |
| C17 / A17, A18 | [ ] Onafhankelijke bewaking | Eerst bestaande externe bewaking en meldbestemming inventariseren; bij ontbreken ontwerp voor waarneming buiten de eigen webserver en opvolging in Command Center. Nieuwe monitor/waarschuwing apart goedkeuren. | Uitval van webserver verbergt de bewaking niet; eigenaarschap en opvolging bevestigd. Geen echte storing veroorzaken of nieuwe automatisering installeren. |
| C18 / A18 | [ ] Vervanger techniek en mailbox | Gebruiker kiest later wie kan overnemen en welke taken/toegang nodig zijn; nog niemand bevestigd. Overdracht en veilige toegang pas afzonderlijk uitvoeren. | Benoemde geaccepteerde vervanger en bereikbare handleiding, zonder gedeelde wachtwoorden in Git. Geen persoon of beheerrol verzinnen/toekennen. |
| C19 / A13 | [ ] Volledigheid bruikbaarheid/toegankelijkheid | Na C09 route-/schermregister uitbreiden naar alle functies in de voorgestelde vrijgavescope, inclusief formulieren, validatie, dialogen, tabellen, zoom, foutmeldingen en beide thema's. | Afwijkingen per ernst en scope, herstel of expliciet besluit. Geselecteerde 5 + 8 websitetests sluiten volledige CC-/portalacceptatie niet af. |
| C20 / A21 | Overgeslagen: tweede beoordelaar / aparte beperkte accounts | Op gebruikerskeuze geen nieuwe live proef. Bestaande lokale synthetische rol-/zelfgoedkeuringsweigering als technisch bewijs bewaren. | **Niet uitgevoerd**, geen groene checkbox. Beperking expliciet opnemen in later acceptatiebesluit; geen account/rechten maken of veiligheidsregel verzwakken. |

## 25D–25E — website en vrijgavebesluit

| ID / bron | Resterende controle | Voorwaarde en afgebakende proef | Verwacht bewijs / stopregel |
| --- | --- | --- | --- |
| C21 / A12 | [ ] Inhoud, homepage en Nieuws & BESC-blog | Per pagina/artikel: bron, definitieve tekst, auteur/datum/categorie waar bevestigd, media-/portretrechten, eigenaar nog af te spreken en publicatiebesluit inventariseren. Zeven rubrieken en homepage tegen sitemap vergelijken; oude blogartikelen/bijlagen volledig inventariseren vóór importvoorstel. | Contentregister met behouden/herzien/ontbrekend/uitgesloten; vaste naam Nieuws & BESC-blog. Geen sponsor/impact/live-status/programma zonder bewijs; niets importeren of publiceren. |
| C22 / A12, A20 | [ ] Routes, import en redirects | Per oude URL bestemming/besluit vastleggen; `/nieuws` en `/nieuws/{slug}` behouden. Gereserveerde `/media/{public_media_id}`, `/media-en-impact` en statische/dynamische slugs controleren. Import aantallen, bronrechten, duplicaten en terugval later exact bepalen. | Route-/redirectregister zonder lussen, verlies of algemene Home-redirect. Onbevestigde bestemming blijft open. Geen redirect/configuratie/DNS wijzigen. |
| C23 / A12–A15 | [ ] Zichtbare functies en beperkte scope | Mijn BESC en beschikbare ingangen vergelijken met echte geaccepteerde ketens. Voor nog niet bruikbare inbox/provider/nieuwsbrief/merchfuncties expliciet uitstel en bezoekersgedrag voorstellen. | Geen actieve doodlopende of misleidende CTA. Gebruiker beslist scope; deze checklist schakelt niets uit/in en wijzigt geen site. |
| C24 / A01–A22 | [ ] DEV-acceptatiedossier | Alle resultaten verzamelen met versie/datum, open afwijkingen, C20-beperking, afgesproken scope/eigenaren en resterend risico. Uitsluitingen alleen na expliciet besluit verwerken. | Besluitklaar dossier; geen volledige acceptatie zolang noodzakelijke punten onbewezen blijven. Elke appwijziging na bewijs vraagt gerichte hercontrole. |
| C25 / A20, A22 | [ ] Afzonderlijke vrijgavebesluiten | Exacte kandidaatversies, actuele schemasituatie, terugval, inhoud en toegestane effecten voorleggen. Onderscheid DEV-acceptatie, migratie, uitrol, provideractivering, publieke opening, indexering/DNS en productie. | Ieder besluit met eigen akkoord en bewijs; groen GitHub is geen vrijgave. Geen actie automatisch laten volgen op document-/PR-goedkeuring. |

## Resultaatformulier voor een later uitgevoerde proef

| Veld | Nu |
| --- | --- |
| Checklist-ID / gekozen deelproef | Nog te kiezen |
| Doelomgeving, organisatie, componentversies | Nog actueel vast te stellen |
| Afgesproken eigenaar / datum | Nog af te spreken |
| Exact akkoord en toegestane effecten | Nog niet verleend voor deze checklistproeven |
| Bron-/recordbinding en uitgangssituatie | Nog te bevestigen; geen geheimen opnemen |
| Handelingen en werkelijk resultaat | Niet uitgevoerd |
| Geredigeerde bewijsverwijzing / waargenomen afwijkingen | Nog geen nieuw praktijkbewijs |
| Herstel nodig / afzonderlijke toegestane herstelactie | Nog niet van toepassing |
| Acceptatie of uitstel met resterend risico | Geen besluit genomen |

Dit formulier is een sjabloon, geen automatisch uitvoerplan. Opslaan van dit document verandert geen dossierstatus, planning, toegangsrecht of vrijgavestatus.
