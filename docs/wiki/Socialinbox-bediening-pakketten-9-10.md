# Socialinbox bediening en voorbereiding van de Meta leesproef

14 november 2026. Pakketten 9–10 zijn lokaal samengebracht: de bediening gebruikt de hervatbare opslag uit pakket 8 en de bestaande inbox uit pakket 6. De Meta-inrichting en beperkte echte leesproef zijn voorbereid, niet uitgevoerd. Cloud DEV, serverinstellingen, OAuth-toestemmingen en de echte inbox zijn niet benaderd of gewijzigd.

## Wat de bediening doet

Bij ingeschakelde inbox én afzonderlijk ingeschakelde ontvangst toont de bestaande inboxpagina een ontvangstpaneel. Beide keuzes staan standaard uit. Alleen een gebruiker met actuele `manageInbox`-toegang en echte sessie kan het paneel gebruiken.

1. Kies een door de server vooraf toegelaten account-/berichtselectie. De browser kiest alleen de sleutel, geen organisatie, account-ID, token of cursor.
2. ‘Leesronde voorbereiden’ maakt een herhaalveilige aanvraag. Deze stap haalt geen berichten op.
3. ‘Volgende pagina ophalen’ verwerkt één pagina van maximaal 25 inkomende teksten. Een ontdekkingspagina kan nul teksten opleveren en toch een geldige volgende stap vastleggen.
4. Na een onderbreking blijft de laatste bevestigde pagina bewaard. Na het verlopen van de claimtermijn kan de pagina worden hervat. Een nog levende claim heeft geen tweede ophaalknop.
5. ‘Leesronde annuleren’ stopt de verdere verwerking met een actuele revisiecontrole.
6. ‘Opnieuw beginnen voorbereiden’ vraagt een expliciete bevestiging en gebruikt de oorspronkelijke selectie en API-versie. Bestaande berichten en ontvangstbewijzen blijven behouden.

Leesrondes en ontvangsthistorie zijn door te bladeren. De weergave onderscheidt geen gegevens, niet beschikbaar, wachten, actief verwerken, geblokkeerd, opvolging nodig en afgerond. Er is geen automatische vervolgklik, timer, cron, webhook of browserpolling die nieuwe providerpagina’s ophaalt. Status vernieuwen is alleen een leesactie.

## Veilige uitvoerketen

De serveractie controleert beide flags vóór autorisatie of databasegebruik. Daarna gebruikt zij de actuele accountcontext uit `requirePermission` en de bestaande owner-RPC. De runtime is server-only en leest dezelfde ownerstatus opnieuw vóór server-RPC’s en het ophalen van credentials. Het doel wordt vergeleken met een vaste serverselectie en de opgeslagen taak; een afwijkende organisatie, accountbinding, API-versie of selectie stopt de uitvoering.

De service-RPC is aan één job-ID gebonden. De provider krijgt uitsluitend de bestaande accountcredential na een geldige claim en hercontrole. `usableMetaCredentials` leest de bestaande afgeschermde opslag en wijzigt/vernieuwt geen token. De gewone Meta-statistiekensynchronisatie, OAuth-start/callback en Instagram-publicatie blijven ongewijzigd.

De worker uit pakket 8 bewaart berichten, checkpoint, historie en ontvangstbewijs atomair. Een verloren commitantwoord wordt met het ontvangstbewijs gecontroleerd; er volgt geen tweede provideroproep. Gewijzigde rechten en sessie-intrekking blokkeren opslag. Onzekere uitkomsten tonen geen succes en worden niet automatisch opnieuw gestart.

## Voorbereide databasewijziging

`20261114174946_social_inbox_controls_local.sql` is uitsluitend lokaal toegepast en getest. Deze migratie:

- verruimt `private.rs_owner` met een afgeschermde accountlijst, gepagineerde leesrondes en veilige selectie-/API-/claimtermijnmetadata voor bediening;
- toont geen providercursor, checkpoint, token of secret in ownerstatus;
- scherpt `private.rs_access` aan: ook de Instagram-gespreksroute vereist `pages_messaging`;
- voegt geen tabellen, rollen, grants, transport of automatische uitvoering toe;
- behoudt de bestaande zeven inboxfuncties, de drie RLS-voortgangstabellen en hun afgeschermde rechten.

De historische migraties blijven exact behouden. Bij een ongewijzigde toekomstige Cloud-baseline gaat de migratiehistorie van 156 naar 157; dit moet vóór een apart goedgekeurde toepassing opnieuw worden gecontroleerd. Het lokale replaytotaal is 158 omdat de historische uitgesloten seed daarin wel wordt getoetst. De tabellen/functies blijven 212/400.

## Configuratie voor later gebruik

Het voorbeeld in `ops/social-inbox-receive.env.example` bevat uitsluitend uitgeschakelde keuzes en een lege selectielijst. Een serverselectie bevat een unieke sleutel, een korte begrijpelijke naam en een gebonden organisatie, account, platform, Page-ID, soort (`direct` of `comment`) en expliciete bronobjecten voor reacties. Een ongeldige of dubbelzinnige selectie wordt geweigerd.

Beide flags moeten bewust worden vrijgegeven; de bestaande inboxflag alleen start de nieuwe ontvangst niet. Zonder geldige selectie en accountbinding is er geen provideruitlezing. Een configuratiefout verhindert nieuwe ontvangst; bestaande leesrondes blijven zo mogelijk leesbaar en annuleerbaar. Annuleren vraagt geen geldige nieuwe selectieconfiguratie.

Het Page-token en de app-secret blijven in de bestaande serveropslag/configuratie. Zij staan niet in selectie-JSON, formulier, querystring, UI-status, foutmelding of documentatievoorbeeld. De begrensde Graph-client kan voor `debug_token` het vereiste tokenargument aan Meta sturen; verzoek-URL’s en ruwe providerfouten worden niet gelogd.

## Voorbereiding van pakket 10

Het aparte [Meta-inrichtings- en proefplan](../meta/Inbox-inrichting-en-beperkte-leesproef.md) beschrijft wat nog moet worden ingevuld en gecontroleerd. De lege template `ops/meta-inbox-read-pilot.template.json` is een bewijsformulier en geen uitvoerbaar script of vrijgave.

Een echte proef vereist eerst bevestigde Page-/Instagram-binding, toegangsrechten, appniveau, privacy-/bewaarafspraken en toestemming voor één concrete selectie. Het huidige pakket heeft geen live accountmetadata of credentials uitgelezen en kan die dus niet als gecontroleerd aanmerken.

De officiële Meta-referentie vermeldt voor Instagram een beperking voor detailgegevens buiten de twintig recentste berichten van een gesprek. Een lokaal geslaagde 70-tekstenfixture bewijst daarom geen volledig live Instagram-archief. De bestaande conservatieve adapter stopt bij ontbrekende, verwijderde of niet-ondersteunde inhoud in plaats van haar stil over te slaan.

Bron voor deze beperking en de aanvullende berichtrechten: [Meta Conversation reference](https://developers.facebook.com/docs/graph-api/reference/conversation/), geraadpleegd 14 november 2026. De bron toont v27.0; de exacte geconfigureerde serverversie moet vóór de proef afzonderlijk worden gecontroleerd. Dit pakket verhoogt de API-versie niet.

## Lokale verificatie

De gerichte proeven voeren owner-RPC, echte lokale SQL, de runtime, de paginalezer en nagebootste GET-antwoorden samen uit. Zij controleren onder meer 70 teksten, dubbele starts, verloren bevestiging, annulering, opnieuw beginnen, oude revisies, sessie-intrekking, afwijkende claims, ontbrekende berichtrechten en 55 oudere leesrondes. Scherm- en serveractieproeven controleren uitgeschakeld gedrag, organisatiebinding, invoercontrole, wachttijd, claimtermijn en paginering. Een GET van de inboxpagina haalt nooit Meta-berichten op.

Native PostgreSQL herhaalt de nieuwe keten en de bestaande acht gelijktijdigheids-/crashscenario’s. De volledige lege schemaherbouw bewaakt alle bestaande tabellen en functiegrants. De oude inbox-, Meta-lezer-, publicatie- en authproeven blijven in de volledige testreeks staan. CI krijgt een aanvullende lokale PostgreSQL-taak; er is geen GitHub-run gestart in deze opdracht.

De actuele resultaatbestanden staan buiten de repository onder `work/social-inbox-packages9-10-20261114/`. Lokale schermvoorbeelden gebruiken alleen fictieve gegevens; zij zijn geen aangemelde DEV-proef. Een concept-PR, merge, Cloud-migratie, serveruitrol, echte uitlezing en activering vragen een volgende opdracht.
