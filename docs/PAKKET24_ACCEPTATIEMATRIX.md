# Pakket 24 — acceptatiematrix en lokale systeemcontrole

Peildatum: **15 november 2026**. Deze matrix maakt onderscheid tussen opnieuw uitgevoerd lokaal bewijs, gedateerd live bewijs, niet uitgevoerde acceptatie en bewust overgeslagen proeven. Een geslaagde lokale controle is geen bewijs van ingebruikname, volledige dagelijkse acceptatie of productiegeschiktheid.

## Uitkomst

De geselecteerde lokale systeem- en beheercontroles zijn geslaagd. De drie repositories blijven gescheiden; uitsluitend deze matrix en het bijbehorende voorbereidingsmanifest worden als nieuwe bronwijziging vastgelegd. Geen appcode, migratie, live configuratie, account, bedrijfsgegeven, publicatie of uitrol gewijzigd.

Het ecosysteem wordt **niet volledig geaccepteerd** verklaard. Belangrijke open punten zijn echte provider-/gebruikersketens, actuele BESC-data, daadwerkelijke nieuwsbrief-/merchaansluitingen, huidige runtime-/schema-/terugvalcontrole, volledig herstel, onafhankelijke bewaking en een afgesproken beheer-/mailboxvervanger. De door de gebruiker overgeslagen tweede-beoordelaarproeven blijven **niet uitgevoerd**.

## Bronversies

| Repository | Exact geteste bron | Afbakening |
| --- | --- | --- |
| Command Center | `72f35874dc62593b1bf049a19c8bf941702b3092` | Aparte lokale checkout, synthetische opslag-/API-/PostgreSQL-fixtures; geen Cloud-databaseverbinding. |
| Website | `f273784674b0db7b31eacee420d290c44351b234` | Aparte lokale checkout en headless testbrowser, fictieve Auth en CC, geen echte gebruikers of publicatiebron. |
| Discordbot | `f71f0ea2f5b7507c16c030439802c021b22c16c2` | Aparte lokale checkout; alleen tests, typecontrole en compilatie. Bot niet gestart, geen commands geregistreerd en geen Discordverbinding. |

De bestaande [CC-controle op main](https://github.com/missrinam80-besc/besc-commandcenter/actions/runs/43730753307) en [websitecontrole op main](https://github.com/missrinam80-besc/besc-website/actions/runs/43718914078) zijn opnieuw als geslaagd bevestigd voor deze exacte bronversies. Dit zijn afzonderlijke GitHub-bewijzen; de onderstaande nieuwe lokale controles staan daar los van. Git-/imageversie is geen bewijs van de huidige serverversie.

## Opnieuw uitgevoerde lokale controles

| Bewijs-ID | Controle | Resultaat en praktische grens |
| --- | --- | --- |
| L01 | Volledige Command Center-suite | **2.033 geslaagd, 0 fouten, 0 overgeslagen**. Bevat rechten, tenants, sessies, documenten, contacten, planning, financiële regels, socialketens, retries en de nieuwe lokale nieuwsbrief-/merchproeven. Gegevens/providerantwoorden zijn synthetisch. |
| L02 | Operationele sensoren | **8 geslaagd**: schijf/inodes/geheugen, ontbrekende engine, HTTP-fouten, begrensde logs, tijd en injectie/ongeoorloofde paden. Geen echte server gemeten. |
| L03 | DEV-tokenbewaking | **6 geslaagd** met mocks: instellingen behouden, bestaande/dubbele token en onbeveiligde/niet-genegeerde opslag weigeren. Geen echte sleutel gelezen of gewijzigd. |
| L04 | Operationele status op native PostgreSQL | **7 geslaagd** op tijdelijke PostgreSQL **17.11**: admin/sessie/tenantcontrole, verlopen bronstatus, geweigerde snapshots/ruwe logs, updatevolgorde en maximaal 20 statusovergangen. De volledige bestaande schemastructuur is uitsluitend in de lege lokale fixture opgebouwd. |
| L05 | Gegenereerde dossierbestanden | Schema- en migratiegenerator in `--check`-modus akkoord voor **22 dossiermodellen**, met de canonieke LF-inhoud. Geen SQL uitgevoerd door deze generatorcontroles. |
| L06 | Werkelijke lokale Next API-routes | **5 suites geslaagd**: bot-API, Bucks-API, rewards-intake, ticket-API en Discordconfiguratie/typed intake. Inclusief respectievelijk 9 botroutechecks en 10 ticketroutechecks, scope-/authweigering, idempotentie en werkelijk afbreken van vastlopende upstreamantwoorden. Alle upstreams zijn lokaal/fictief. |
| L07 | CC-codekwaliteit, typen en bouw | ESLint met **0 toegestane waarschuwingen**, TypeScript en Next/webpack-bouw geslaagd. Bouw met uitsluitend loopback-/fixture-Supabasewaarden; systeemcertificaten gebruikt, certificaatcontrole bleef aan. |
| L08 | Website contract-/modelcontroles | **61 geslaagd**; geen fouten of overgeslagen proeven. |
| L09 | Bestaande websitebrowserproeven | **5 geslaagd**: afscherming, robots/health, nieuws/events, beide thema's, mobiel, intrekking, bronfouten en bescherming zonder JavaScript of ontbrekende scripts. |
| L10 | Websitepakketten 18–20 in browser | **8 geslaagd**: zeven rubrieken, homepage/subpagina's, meerdere schermbreedtes, licht/donker, toetsenbord/Escape, kalender/archief/creatorfilters, Mijn BESC, intrekking en bronuitval. Geen volledige WCAG- of ingelogde CC-acceptatie afgeleid. |
| L11 | Website typen/bouw/beeld | TypeScript en Next/webpack-bouw geslaagd. Nieuwe desktop-donker- en mobiel-lichtbeelden met alleen fixtures bekeken; geen zichtbare horizontale overloop in de gecontroleerde schermen. |
| L12 | Bot | **323 geslaagd**, TypeScript en bouw geslaagd. Onder andere API-contract, accountbinding, tickets, events/slots, rewards, idempotentie, fout-/timeoutafhandeling en duurzame state met fixtures. Geen bewijs van huidige Discordrechten of live afleveringen. |
| L13 | Synthetische databasekopie/herstel | Eigen PostgreSQL-fixture, netwerk vóór dump en herstel losgekoppeld. `pg_dump`/`pg_restore` geslaagd; geselecteerde aantallen en hashes van event-/lidmaatschapsrijen gelijk. Beide databases bevatten 228 gecontroleerde tabellen en 336 beleidsregels; dat is een telling, geen checksum van iedere rij/policy. Beschadigd archief geweigerd; leeg doel bleef leeg. Geen echte back-up of persoonsgegevens ingelezen. |
| L14 | Opruimen proefomgeving | Alleen de eigen gelabelde testcontainer en het eigen lege netwerk verwijderd. Geen bestaande container, volume, back-up of Docker-service gewijzigd. API-/browsertestservers beëindigd. |

De aantallen hierboven worden niet opgeteld tot een percentage ecosysteemacceptatie: sommige suites overlappen en een technische fixture dekt geen echte provider-/gebruikersproef.

## Acceptatiematrix per onderdeel

**Lokaal groen** betekent alleen dat de genoemde lokale controle slaagde. **Historisch** betekent bewijs op de genoemde datum, zonder actuele hertest. **Open** is niet geaccepteerd. **Overgeslagen** blijft niet uitgevoerd.

| ID | Onderdeel | Actueel bewijs | Wat nog open staat |
| --- | --- | --- | --- |
| A01 | Repositories, API-grens en bronbinding | L01, L06–L12; exacte versies hierboven. Website, CC en bot fysiek gescheiden. | Werkelijke server-/databaseversies en echte koppelingen niet gecontroleerd. Geen repository- of credentialvermenging. |
| A02 | Rechten, sessies en tenantgrenzen | L01, L04, L08–L12 lokaal groen; intrekking, ontbrekende/gewijzigde bevoegdheid en andere organisatie getest. | Actuele live sessies en afzonderlijke echte rollen niet opnieuw doorlopen. Een fixturesessie is geen echte BESC-login. |
| A03 | Aanmelden en herstelmail | Historisch bewijs 5/6 november: eigen aanmeldlink ontvangen en callback bevestigd; gebruiker bevestigde nieuw wachtwoord en opnieuw aanmelden. | Geen nieuwe mail aangevraagd, wachtwoord gewijzigd of actuele bezorgbaarheid gecontroleerd. Dat oude bewijs sluit de huidige keten niet volledig af. |
| A04 | Projecten, taken en eventplanning | L01; gedateerde CC01/CC02-proeven van 6 november, expliciet synthetisch. | Actueel werkelijk lopend dossier, afgesproken eigenaar/crew en dagelijkse uitvoering. Geen fixture als echt project aangemerkt. |
| A05 | Kosten, budgetten, inkomsten en materiaal | L01; oude CC04-synthetische totalen blijven herkenbaar. | Echte bewijsstukken, financiële bron/status, voorraad en gebruiksafspraken. Geen bedragen of boekingen gemaakt. |
| A06 | CRM, Gmail en Google Contacts (13–15) | L01 lokaal met nagebootste provider; bestaande mailverbinding historisch beperkt getest. | Nieuwe gezamenlijke koppeling, werkelijke scopes, conflicten/duplicaten en praktijkacceptatie niet bewezen. Geen contactsync of mails uitgevoerd. |
| A07 | Drive-mappenboom en dossierlinks (16–17) | L01 met fictieve Drive-antwoorden; linksoorten/afscherming/previewgedrag technisch getest. | Nieuwe boom-/syncadapter tegen de echte Drive, toegangsrechten en echte beeld-/documentbronnen nog niet geaccepteerd. Geen bestanden gekopieerd of gewijzigd. |
| A08 | Automatische kanaalmetingen en foutmeldingen | L01 lokale planner-, melding-, error-/retrycontroles. Eerdere echte kanaalproeven zijn gedateerd bewijs. | Geen nieuwe synchronisatie of actuele scheduler-/quotametingen gestart. Huidige dagelijkse werking niet opnieuw vastgesteld. |
| A09 | Meta-socialinbox (6–10) | L01 met nagebootste berichten/paginering en duurzame ontvangst. | Echte Meta-inrichting en beperkte leesproef blijven open; geen berichten opgehaald of beantwoord, geen activering. |
| A10 | YouTube-creators (11 en eerdere lokale pakketten) | L01, inclusief lokale opslag, sleutel-/herstart-/onderbrekingsketen en mocks. | Echte OAuth-clientinrichting, eigen proefkanaal/video en beperkte statistiekproef niet bewezen. Koppeling niet geactiveerd. |
| A11 | Instagram-publicatie (12) en socialgoedkeuring | L01 lokaal en rechten-/historiecontroles met mocks. | Werkelijke providerinrichting/praktijkproef open; niets gepubliceerd. Tweede-beoordelaarproef blijft overgeslagen. |
| A12 | Website 18–20, Nieuws & BESC-blog, Mijn BESC | L08–L11 lokaal groen, inclusief beschermde eigen samenvatting en intrekking. | Werkelijke portal-/accountacceptatie, definitieve content/media, bronrechten en gereserveerde routeconflicten. Oude blogimport/redirects niet uitgevoerd. |
| A13 | Mobiel, licht/donker en toegankelijkheid | L09–L11 voor de geselecteerde websitepagina's met fixtures; bestaande UI-tests in L01. | Volledige ingelogde CC-schermen op mobiel, volledige WCAG-toets en echte portal-/providerflows niet afgevinkt. Geen algemene toegankelijkheidsclaim. |
| A14 | Nieuwsbrief (21) | L01 omvat de 30 lokale nieuwsbriefproeven; mockverzending en onafhankelijke fictieve rol. | Werkelijke database-/sessie-/beheer-/websiteaansluiting en provideruitkomstcontrole blijven open. Geen echte nieuwsbrieven verstuurd. |
| A15 | Merch (22) | L01 omvat 33 lokale merchproeven; reservering, betaling, retour, herstel met onafhankelijke mockprovider. | Leverancier/verkoper, echte checkout/provider, serviceafspraken en productaansluiting blijven open. Geen echte transactie. |
| A16 | Echte data en praktijkproef (23) | Inventaris en alleen-lezen voorstel opgeslagen; templates en synthetische bewijzen uitgesloten. | Laatste bronpoging kon connectors niet starten. Actuele bron-/dossierbinding en echte praktijkproef niet uitgevoerd; geen huidige storing van de bronsystemen afgeleid. |
| A17 | Monitoring, foutopvolging en logbegrenzing | L02–L04 lokaal groen; historische OP01-werkende web/bot/databasebewaking op 5 november. | Geen actuele statuscache, servercapaciteit of beleid op de servers uitgelezen. Een draaiende container bewijst geen Discordfunctie. |
| A18 | Onafhankelijke bewaking en vervanging | Historische OP01-begrenzing opnieuw gelezen. | Bewaking buiten de eigen webserver en benoemde vervanger voor technisch beheer/mailbox blijven niet bevestigd. Geen automatisering of toegang toegekend. |
| A19 | Back-up/herstel | L13 synthetisch mechanisme opnieuw getest. Historisch 5 november: afgebakende componentkopie/herstel en 35 lokale app/Auth/mailcapturecontroles. | Geen echte huidige back-up gelezen, hashes opnieuw gecontroleerd of nieuwe kopie gemaakt. Volledig herstel van huidige app/Auth/Storage/bot plus echte SMTP/OAuth en gecoördineerde heraansluiting blijft open. |
| A20 | Release, migratievolgorde en terugval | L07/L11/L12 bouwen; bestaande CC- en website-main-CI groen. Releaseketen blijft gescheiden. | Actuele Cloud-historie, exacte runtime-image en terugval op de server niet gecontroleerd. Geen migratie of imagewissel uitgevoerd. |
| A21 | Tweede beoordelaar / aparte beperkte accounts | Lokale synthetische rollen en weigering van zelfgoedkeuring technisch getest. | **Overgeslagen op gebruikerskeuze; niet uitgevoerd.** Geen nieuwe persoon, account of rechten gemaakt om dit alsnog te omzeilen. |
| A22 | Publieke opening en productie | Geen vrijgave. | Pakket 25 kan open punten en DEV-acceptatie voorbereiden, maar geeft geen toestemming voor opening, indexering, DNS, betaling, productie of activering. |

## Onderzochte afwijkingen tijdens deze lokale ronde

- **Windows-regelafbreking:** de gegenereerde schema-check zag de uitgecheckte CRLF-versie als verouderd. Dezelfde Git-inhoud met LF doorstond beide generatorchecks (22 modellen). Inhoudshash en Git-diff waren gelijk; daarna de oorspronkelijke checkoutweergave teruggezet. Geen schema-/appwijziging of migratie nodig.
- **Docker-testnetwerk:** Docker publiceerde de PostgreSQL-poort niet naar de host vanaf een volledig intern netwerk. Die eerste fixtureverbinding is geweigerd vóór de native tests konden draaien. Alleen de eigen lege container vervangen door een localhost-gepubliceerde fixture, waarna alle 7 tests slaagden. Voor dump/herstel is de netwerkverbinding weer verwijderd. Geen live database gebruikt.
- **Eerste browserpoging:** de eerste runner met Chromium 1234 rondde niet af en is afgebroken; niet als geslaagd geboekt. De gecontroleerde herhaling met reeds geïnstalleerde Chromium 1223, aparte browsercontext/toegang en een harde globale tijdgrens slaagde: 5 bestaande plus 8 aanvullende proeven. De oorspronkelijke oorzaak is niet als productdefect vastgesteld. Geen browser- of websitecode aangepast.

## Bewijs en vervolg

Ruwe logs, synthetische screenshots en herstel-/opruimresultaten staan buiten Git onder `work/system-package24-evidence/` en `work/package24-*.log`. Screenshots bevatten uitsluitend gemarkeerde fixtures. Geen volledige brondumps, providercredentials, sessies van echte accounts, back-ups of testdatabases worden in Git opgenomen.

Historische bronnen zijn de aanwezige `work/OP01-20261105/RESULTAAT.json`, `work/AC01-20261105/recovery/RESULTAAT.json`, `work/AC01-20261106/auth-mail-live/RESULTAAT.json` en CC01–CC04-bewijzensets. De oorspronkelijke OP01-tekst noemt nog een niet aangesloten bot; het latere gedateerde OP01-resultaat bevestigt juist de afgebakende botprobe op 5 november. Die latere bevestiging wordt als historisch bewijs gebruikt, zonder actuele bereikbaarheid te veronderstellen.

Eerstvolgende mijlpaal voor pakket 25: een vrijgavevoorstel opstellen met de exacte ontbrekende aansluitingen, bron-/contentbeoordeling en afgebakende DEV-acceptatie. Voor elke gewenste live handeling eerst actuele omgeving, gegevens, gevolgen en herstelwijze concretiseren. Het afronden van deze lokale controles sluit de open live punten niet af en geeft geen extra uitvoeringsbevoegdheid.
