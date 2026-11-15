# Contacten en communicatie — pakketten 13–15

15 november 2026. Gezamenlijke lokale bouw boven op het [pakket-13-ontwerp](Pakket-13-gezamenlijk-ontwerp.md). Geen live inrichting, gegevenscontrole, synchronisatie, verzending, migratie of uitrol uitgevoerd. De uitbreiding is standaard uitgeschakeld. De status hieronder betreft lokale code en fictieve proeven; echte Google-acceptatie staat afzonderlijk open.

## Wat de uitbreiding biedt

De afgeschermde werkruimte `/app/communicatie/werkruimte` brengt geselecteerde Gmail-gesprekken, contactvoorstellen, beoordeling en opvolgtaken samen. Bestaande personen, externe organisaties, mailregistraties en dossiers worden hergebruikt. Er komt geen tweede personenbestand. Een contact- of dossierkoppeling geeft geen account-, portaal- of mailboxrecht.

### Contactgegevens en Google Contacts

- Een verbinding hoort bij één BESC-organisatie en één geverifieerde Google-accountidentiteit. Gmail en Contacts gebruiken afzonderlijke verbindingen, rechten en voortgang.
- Alleen de CONTACT-bron wordt gelezen. Directory, Other Contacts, foto's, verjaardagen, interne notities en marketinglijsten vallen buiten deze versie.
- Google-gegevens komen eerst in een vergelijklijst. De schermen onderscheiden bestaande waarden, voorstellen, veldconflicten en bronverwijderingen. Een naam of gelijk adres koppelt geen persoon automatisch.
- De beheerder kiest een bestaande persoon of organisatie en de afzonderlijke e-mail-/telefoonwaarden die als extra contactpunten mogen worden bewaard. Er is geen vervang-/verwijderactie: bestaande primaire velden blijven intact. Naam en organisatie uit Google zijn context; zij wijzigen bestaande personen of functies niet automatisch.
- Een nieuwe contactfiche kan alleen bewust vanuit een voorstel worden gemaakt, met een gekozen bronnaam en gekozen punten. De nieuwe fiche is een kandidaat zonder accountkoppeling. Er worden geen lidmaatschappen, portaalrechten, Bucks of nieuwsbriefinschrijvingen gemaakt.
- Google-tombstones worden eerlijk als verwijderd bij de bron getoond, ook wanneer de provider geen bron-ID/etag meer meestuurt. Er wordt daarvoor geen identiteit verzonnen en niets lokaal verwijderd.
- Dubbele ontvangst gebruikt dezelfde externe identiteit binnen dezelfde verbinding. Een nieuw bronantwoord krijgt een nieuwe revisie; een oude beslissing wordt niet automatisch opnieuw toegepast.
- De eerste ronde is begrensd op drie pagina's van maximaal 50 contacten. De laatste pagina bevestigt het nieuwe sync-token; daarna kan een nieuwe ronde binnen zes dagen op die basis wijzigingen lezen. Een gedeeltelijke ronde bevestigt geen eindtoken.
- Een gestopte ronde kan na expliciete hercontrole dezelfde cursor hervatten. De gebruiker verruimt de lokale paginagrens daarmee bewust met maximaal drie pagina's, tot maximaal 100 per ronde; dit is geen automatische achtergrondtaak. Stoppen wordt niet als volledig afgerond weergegeven.

De daadwerkelijke adresboekhouder, gewenste gegevens, bewaartermijn en OAuth-toestemming zijn nog niet live bevestigd. Een People API-adresboek is gebruikersgebonden; er wordt geen organisatiebreed gedeeld adresboek verondersteld.

### Gmail: lezen, antwoorden en beoordelen

- De eerste leesadapter verwerkt maximaal vijf expliciet gekozen Gmail-thread-ID's, één thread per bewuste pagina-actie, met maximaal 50 berichten per thread. Dit is een begrensde gespreksproef, geen mailboxbrede inboxdiscovery of archiefimport.
- Metadata en platte tekst zijn aparte keuzes. Metadata-opslag bevat geen body of Bcc. Bij volledige lezing worden alleen platte tekstonderdelen opgeslagen; HTML/scripts, externe afbeeldingen en bijlagen worden niet opgehaald of uitgevoerd. Een HTML-only mail toont dat geen platte tekst is opgehaald.
- Herhaald lezen van een thread voegt bestaande message-ID's niet opnieuw toe. Een onverwacht gewijzigd bestaand bericht stopt de pagina; de voortgang wordt niet stil doorgeschoven. Voor deze beperkte threadselectie wordt geen mailboxbrede Gmail history-cursor gebruikt. Een nieuwe threadronde is een bewuste herlezing van dezelfde selectie, geen impliciete uitbreiding naar het hele archief.
- Gesprekken kunnen bewust aan bestaande personen en dossiers worden gekoppeld. Een onderwerp, afzender of adresmatch doet dit niet automatisch. Verborgen mailboxgegevens worden daardoor niet breder zichtbaar.
- De werkruimte maakt lokale concepten met expliciet gekozen To/Cc/Bcc en dossier. De adreslijst gebruikt centrale gegevens en extra contactpunten. De bestaande mailopsteller toont bij een gekoppelde persoon ook de centrale naam en e-mail; een oud gekopieerd contactadres krijgt geen voorrang.
- Een bestaand Gmail-concept kan via de bestaande mailregistratie worden aangeleverd. De nieuwe werkruimte maakt bij het bewaren van een lokaal concept nog geen extern Gmail-concept. Dat beperkt muterende provideracties vóór beoordeling.
- De opsteller zet inhoud, ontvangers, verbinding en eventuele antwoordcontext vast. De gewone goedkeuringsregistratie blijft bestaan, maar een andere bevoegde persoon met expliciet mailboxrecht beoordeelt precies die versie. De database bewaakt dit ook buiten de knoppen om.
- Antwoorden gebruiken het geselecteerde bericht, een passend onderwerp, dezelfde thread-ID en correcte antwoordheaders. Ontvangers worden opnieuw bewust gekozen; 'allen antwoorden' of een Bcc-afleiding wordt niet automatisch uitgevoerd.

### Veilig verzenden en opvolgen

Een duurzame exclusieve claim verhindert dat twee klikken twee uitvoerders krijgen. De provideridentiteit, sessie, mailboxrechten, actuele bron en goedgekeurde momentopname worden opnieuw gecontroleerd. Een bestaand Gmail-concept dat buiten CC is veranderd blokkeert vóór verzending. De uiteindelijke POST verstuurt de vastgelegde MIME-snapshot, niet een ondertussen veranderbaar Gmail-concept; een parallelle Gmail-editor kan de goedgekeurde inhoud daardoor niet vervangen.

Na een verloren providerantwoord, time-out of opslagbevestiging volgt geen automatische nieuwe send. `claimed`, `dispatched` en `uncertain` blijven zichtbaar als opvolgpunt. Alleen een bevestigd Gmail message-/thread-ID maakt de job bevestigd. Een al opgeslagen ontvangstbewijs met verloren lokale bevestiging wordt teruggelezen. Dit is geen garantie op precies-één-externe-aflevering; provideracceptatie is bovendien geen bewijs dat de ontvanger de mail heeft gekregen of gelezen.

Vóór de claim, of na een aantoonbaar vóór verzending geblokkeerde controle, kan de eigen opsteller expliciet intrekken en opnieuw laten beoordelen. Na dispatch is er geen reset-/opnieuw-verstuurknop. Een onzekere uitkomst vraagt eerst onderzoek van dezelfde job en dezelfde mailbox. Verwijderen of handmatig als opgelost afboeken valt buiten deze versie.

Na bevestiging kan één expliciet benoemde opvolgtaak met gekozen verantwoordelijke en datum worden gemaakt. Een herhaalde gelijke opdracht geeft dezelfde taak; een gewijzigde opdracht is een conflict. Een taakfout leidt nooit tot een nieuwe e-mail. Er worden geen deadlines, verantwoordelijken of dossierstatussen uit een inkomende mail afgeleid.

## Beveiliging en compatibiliteit

Elf nieuwe private tabellen bewaren verbindingen/ACL, leesrondes, paginabewijzen, ontvangen gegevens, contactpunten/beslissingen, gesprekskoppelingen, outbox, mailbindingen en gebeurtenissen. Alle hebben RLS en geen directe tabelrechten voor `anon`, `authenticated` of `service_role`. Browser en server hebben afzonderlijke beperkte RPC-poorten met lege zoekroute. Elke handeling controleert organisatie en huidige bevoegdheid; de verwerking bewaakt ook de echte opgeslagen beginsessie.

Een permissie op een dossier volstaat niet voor een mailbox. Nieuwe restrictieve policies beschermen gekoppelde mailinhoud, Bcc en goedkeuringsmomentopnamen ook via de oude maildetail-, register- en goedkeuringsschermen. Oude ongebonden mails behouden hun bestaande beleid. Bij gebruik van de nieuwe functie leidt de oude verzendactie naar de werkruimte; zij verstuurt dan niet via het oude onbeschermde pad. Nieuwsbrieven en event-slotmails behouden hun afzonderlijke bestaande uitvoering.

Ruwe providerfouten, tokens en credentialwaarden worden niet naar schermen gekopieerd. Historie bevat vaste gebeurtenissen, actoren en tijden. Private configuratie staat buiten de applicatie, met op Linux uitsluitend eigenaarrechten; geen auto-initialisatie of terugval naar bestaande Workspace- of YouTube-credentials. De cache van de bestaande Workspace-helper wordt niet gebruikt.

`BESC_CRM_COMMUNICATION_ENABLED` is standaard afwezig/false. De werkruimte en acties openen dan geen auth-, database- of providerverbinding. Er zijn geen timer, watch, Pub/Sub-subscriptie, automatische synchronisatie, OAuth-start of consentwijzigingen toegevoegd. Verbindingen ontstaan niet door de migratie; configureren vereist afzonderlijk expliciet adminbeheer. Een admin kan een verbinding sluiten zonder gegevens of historie te verwijderen.

## Voorbereide migratie en controles

`20261115012546_crm_communication_local.sql` is lokaal gemaakt met de CLI. Het bestand voegt private opslag, beperkte RPC's, mail-/goedkeuringsbewaking en restrictieve policies toe. Geen historische SQL, bestaande contactgegevens of oude goedkeuringen zijn herschreven. Het releasemanifest bevat de LF-hash en afzonderlijke uitvoeringsgrenzen; het is geen actuele Cloud-inventaris of migratieakkoord.

De tests voeren de echte nieuwe SQL uit met fictieve sessies, rollen en dossiers. Providerantwoorden en transports zijn nagebootst. Gerichte tests dekken koppelen, contactaanmaak zonder account, conflicten, paginaherstel, gesloten toegang, inhoudsversies, eigen beoordeling, oude mailpolicies, onzeker verzenden, herstarten en één opvolgtaak. Een aparte PostgreSQL-17-proef toetst gelijktijdige claims, annulering, paginabewijzen, ingetrokken mailboxrechten en opvolgtaken. UI-tests toetsen waarschuwingen, expliciete keuzes, ontbrekend bewijs en veilige weergave. De runtimeproeven controleren de uitgeschakelde toestand en ontbreken van credentialterugval.

De precieze aantallen en logs staan bij het lokale uitvoeringsbewijs. De GitHub-workflow krijgt een afzonderlijke PostgreSQL-job voor deze keten; die is in deze opdracht nog niet op GitHub uitgevoerd. Een lokale build gebruikt, zoals eerdere lokale builds, webpack wegens de gedeelde dependency-map. Hiervoor wordt certificaatcontrole behouden en de systeemcertificaatopslag gebruikt.

## Wat nog afzonderlijk moet gebeuren

1. Review van deze lokale wijziging; daarna alleen op opdracht concept-PR, controles en merge/imagebouw. Er is nu niets gepusht of samengevoegd.
2. De actuele Cloud-historie en doelversie inventariseren vóór een apart toegestane migratie en DEV-uitrol. Houd de vlag uit en bewaar de vorige image. Nieuwe private gegevens worden bij image-terugval niet verwijderd; de nieuwe mailafscherming blijft van kracht.
3. De aparte Google-bindingen, werkelijke mailbox-/adresboekhouder, OAuth-subject, toepasselijke scopekeuze, beleid, concrete proefduur en bewaartermijn vastleggen. Gebruik alleen een expliciet toegestane account, geen persoonlijke account als vervanging.
4. Na apart akkoord private credentials provisioneren buiten `/app`; voorbeeld `ops/crm-google-credentials.example.json` bevat bewust lege, onbruikbare waarden. Vul geen secrets in het gedeelde voorbeeldbestand. Voor de eerste inrichting is een beheercontrole nodig; de werkruimte doet geen OAuth-aanmelding.
5. Dan pas de hieronder beschreven beperkte echte proeven, als afzonderlijke opdrachten. Lezen, gekozen contactpunten lokaal toepassen en werkelijk verzenden zijn verschillende effecten. Een ontbrekende tweede beoordelaar blijft een blokkade voor de verzendproef.

De pakketten zijn hiermee lokaal gebouwd voor de afgesproken eerste beperkte versie. Echte data, Google-inrichting en operationele acceptatie zijn niet afgetekend. Mailboxbrede discovery/archiefsync, automatische tweerichtingssynchronisatie, Google-contactwrites/deletes, contactmerge, bijlagebeheer en automatische 'allen antwoorden' vallen buiten deze eerste versie.

## Beperkte praktijkproeven: gereed voor latere afbakening

**Gmail lezen:** één aangewezen organisatie-mailbox, één gekozen thread, één pagina, maximaal 50 berichten, eerst metadata. Een aparte bodyproef vraagt expliciet toestemming voor de betreffende platte teksten. Geen antwoorden, labels wijzigen, archiefdiscovery, bijlagen of extra synchronisatie. Stop bij verkeerde identiteit, onduidelijke toegang, meer dan 50 berichten, ontbrekende velden of onbevestigde opslag. Noteer verbinding, selectie, release, job/revisie en aantallen zonder mailinhoud.

**Gmail verzenden:** één vooraf getoonde tekst, exacte ontvanger(s), gekozen mailbox en één bestaande dossierbinding. Eén andere bevoegde beoordelaar, één goedgekeurde momentopname en maximaal één bewuste send-actie. Geen storing injecteren, automatische retry of nieuw concept als herstel. Bij onzekerheid eerst dezelfde duurzame status onderzoeken; ook sluiten van de browser draait de POST niet terug. Bewaar het providerbewijs en sluit de tijdelijke uitvoering volgens het akkoord.

**Contacts lezen:** één aangewezen adresboekhouder, één pagina van maximaal 50 CONTACT-records met alleen de afgesproken velden. Geen Directory/Other Contacts en geen automatische toepassing. Een volledige pagina kan gegevens van meerdere personen bevatten: toestemming moet dit echte bereik dekken; er is geen aanname dat slechts één contact gelezen wordt. Niet meer pagina's ophalen zonder de afgesproken ruimte.

**Contacts toepassen:** als aparte stap maximaal één vooraf gekozen voorstel, één bestaande persoon/organisatie, concrete e-mail-/telefoonwaarden en actuele lokale revisie. Geen merge, vervanging, verwijdering, Google-write, account of rol. Een proef met een nieuwe contactfiche vereist dat expliciet extra effect. Noteer bron-ID/revisie, keuze en punt-ID, geen overbodige persoonsgegevens of credentialwaarden.

Alle proeven zijn voorstellen met nog in te vullen echte identiteit, bereik en termijn. De huidige lokale run heeft deze proeven niet uitgevoerd.

Bronnen: de officiële [Gmail threads-documentatie](https://developers.google.com/workspace/gmail/api/guides/threads), [messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send) en [People connections.list](https://developers.google.com/people/api/rest/v1/people.connections/list). De bestaande [pakket-13-referenties](Pakket-13-gezamenlijk-ontwerp.md#9-officiële-referenties-gecontroleerd-op-15-november-2026) blijven van toepassing; zij bevestigen geen BESC-consent of echte provideracceptatie.
