# Meta inrichting en beperkte inboxleesproef

Voorbereiding van pakket 10, 14 november 2026. Dit is het uitvoeringsplan voor een latere afzonderlijk toegestane proef. Er zijn nu geen appinstellingen, scopes, tokens, accounts, webhooks of servers gewijzigd en geen echte berichten uitgelezen.

## Doel en afbakening

Eén vooraf aangewezen Facebook- of Instagram-account controleren en één leesronde uitvoeren met één berichtsoort. Geen brede discovery van alle accounts en geen andere dossiers of organisatiekanalen verwerken. De tweede platformvariant wordt pas een aparte proef nadat de eerste is beoordeeld.

De toekomstige proef is handmatig begrensd tot maximaal drie pagina-uitvoeringen en maximaal 50 nieuw opgeslagen inkomende teksten, wat het eerst bereikt wordt. Elke uitvoering verwerkt maximaal één pagina van 25 teksten; ontdekkingspagina’s tellen mee. De operator telt de uitvoeringen en het aantal ingevoegde teksten na elke stap en stopt op de grens. De runtime heeft geen automatische proeflimiet over meerdere bewuste klikken; dit is dus een operatorgrens en geen automatische schedulerinstelling.

Alle providerverzoeken van de lezer zijn GET. Deze proef omvat geen antwoord, publicatie, like, moderatie, verwijderen, tokenvernieuwing of webhookregistratie. Het ophalen van een bestaande Page-credential uit de serveropslag is alleen in de afzonderlijk toegestane toekomstige uitvoering nodig.

## In te vullen vóór inrichting

Gebruik `ops/meta-inbox-read-pilot.template.json` als afgeschermd bewijsformulier. Laat onbekende waarden leeg; maak er geen fictieve bevestiging van.

| Gegeven | Vereiste bevestiging |
| --- | --- |
| BESC-account | Wie de proef bedient en op grond van welke actuele inboxbevoegdheid |
| Organisatie en social_account-ID | Exacte bestaande eigenaarbinding in Command Center |
| Platform en berichtsoort | Eén van Facebook/Instagram en direct/reactie |
| Page-ID en externe account-ID | Facebook Page zelf, of de Instagram-account die daadwerkelijk aan die Page is gekoppeld |
| Bronnen voor reacties | Maximaal vijf expliciete eigen media-/post-ID’s; geen vrije URL’s |
| Meta-app | Eigen app-ID, appmodus, passende toegangsstatus en bevoegde Page-taken; geen secret opnemen |
| API-versie | Exacte huidige serverversie en gecontroleerde documentatie voor die versie |
| Datatoegang | Toegestane teksten, betrokkenen, verantwoordelijke en passende privacy-/bewaarafspraken |
| Proefscope | Eerste selectie, maxima, stopvoorwaarden en afzonderlijke toestemming |

Een bibliotheekpagina of een aanwezige OAuth-token is geen bewijs dat de echte app toegang heeft tot de bedoelde gesprekken. Een profiel- of Insights-koppeling bewijst geen inboxbevoegdheid.

## Meta inrichting voorbereiden

1. Bevestig de bestaande Facebook Login-variant. Dit pakket gebruikt geen Instagram Login-token op `graph.instagram.com` en wisselt niet stil van inlogvariant.
2. Controleer in Meta dat de uitvoerende persoon de vereiste Page-taak kan uitvoeren en dat de Page/Instagram-koppeling correct is. De serverlezer hercontroleert accountbinding en tokengegevens bij elke pagina.
3. Vergelijk toegekende scopes met de lokale capabilitycontrole. Voor Facebook-gesprekken controleert de code `pages_messaging`, `pages_manage_metadata` en conservatief `pages_read_engagement`. Voor Instagram-gesprekken controleert zij `instagram_basic`, `instagram_manage_messages`, `pages_messaging` en `pages_manage_metadata`.
4. Voor reacties zijn de lokale controles afzonderlijk: Facebook `pages_read_engagement` en `pages_read_user_content`; Instagram `instagram_basic`, `instagram_manage_comments` en `pages_read_engagement`. Bevestig vóór een reactieproef ook de actuele endpointvoorwaarden voor de gekozen versie.
5. Controleer appmodus, Page-taken, scopes en eventuele vereiste App Review/Advanced Access voor de werkelijke doelgroep. De beperkte Page-token-diagnostiek in de code vervangt geen beoordeling van deze appinstellingen.
6. Ontbrekende rechten worden alleen aangevraagd na een aparte, afgebakende opdracht. Het bestaande OAuth-scopeverzoek voor statistieken blijft in dit pakket exact behouden; opnieuw aanmelden met alleen die statistiekscopes geeft niet automatisch inboxrechten.
7. Leg alleen de geverifieerde niet-geheime binding vast als serverselectie. Sla token en app-secret nooit op in selectie-JSON, screenshots, proefrapport of chat.

De Meta [Conversation reference](https://developers.facebook.com/docs/graph-api/reference/conversation/) beschrijft Page-token, Page-taak en gespreksrechten. De officiële [Instagram-tokenaanvraag via Facebook Login](https://www.postman.com/meta/instagram/request/0vuw3vk/get-access-tokens-of-pages-you-manage) toont de relatie met Page-taken en de gekoppelde Instagram-account. Dit zijn publieke referenties; ze bevestigen geen BESC-accounttoegang.

## Providergrenzen

- De huidige Meta-referentie toont v27.0; neem die versie niet automatisch over in BESC. Controleer de documentatie van de daadwerkelijk ingestelde versie.
- De reference noemt bij Instagram detailtoegang tot de twintig recentste berichten per gesprek. Oudere details kunnen als verwijderd worden geweigerd. Geef dus geen garantie op volledig archiefherstel.
- Berichtvelden, eigenaarschap van reacties, scoped gebruikers-ID’s, Page-tokenstatus en beschikbare data moeten op de echte gekozen variant worden bevestigd. Een ontbrekend veld veroorzaakt een opvolgpunt; geen alternatieve brede route proberen.
- Bijlagen, verborgen/verwijderde of niet-ondersteunde inhoud vragen aparte behandeling. De huidige adapter stopt de betrokken pagina zonder voortgang te bevestigen.
- Platformdata kunnen tijdens het pagineren veranderen. De proef controleert herhaalveilige opslag, niet een onveranderlijke momentopname van de gehele Meta-inbox.

## Uitvoeringsvolgorde na afzonderlijke toestemming

1. Controleer opnieuw de groene controles en exacte release; bereid terugval naar de vorige image voor. Controleer of de aanvullende migratie en code op DEV staan. Zij worden in deze opdracht niet toegepast of uitgerold.
2. Leg de precieze account-/berichtselectie en de proefmaxima vast. Bevestig de scope met de gebruiker voordat echte data worden gelezen.
3. Geef uitsluitend de noodzakelijke tijdelijke DEV-ontvangst vrij volgens dat akkoord. Instagram-publicatie en YouTube-creatorkoppeling blijven uit. Er is geen timer of webhook te activeren.
4. Meld aan met het eigen bevoegde BESC-account. Controleer dat alleen de bedoelde selectie beschikbaar is.
5. Bereid één leesronde voor. Controleer de opgeslagen leesronde; het aantal provideroproepen is in deze stap nul.
6. Verwerk één pagina. Noteer het job-ID, de nieuwe revisie, het aantal ingevoegde teksten en de zichtbare status. Kopieer geen berichtinhoud of tokens naar het proefrapport.
7. Vernieuw de pagina of sluit de sessieweergave en open opnieuw. Controleer dat de duurzame status en dezelfde leesronde terugkomen. Start geen tweede leesronde.
8. Verwerk een volgende pagina alleen als minder dan drie uitvoeringen zijn gedaan en er binnen de tekstgrens nog ruimte is voor de volledige maximumomvang van 25 nieuwe teksten. Bij minder dan 25 resterende plaatsen stopt de proef vóór een nieuwe provideroproep. Controleer dat eerdere bericht-ID’s niet opnieuw als nieuwe ontvangst zijn opgeslagen. Is er geen toegestane natuurlijke herhaling beschikbaar, dan blijft de crash-/duplicaatproef lokaal bewezen; maak geen echte storing.
9. Stop uiterlijk na drie pagina-uitvoeringen of 50 nieuwe inkomende teksten. Annuleer een nog onvoltooide leesronde als dat binnen de proefscope is toegestaan; markeer een begrensd gestopte ronde niet als volledig archief.
10. Sluit de tijdelijke ontvangst na de proef volgens de overeengekomen terugval. Controleer de drie flags, toegangen, normale statistiekensynchronisatie en gewijzigde rijtellingen.

Een lege inbox is alleen een geslaagde lege uitkomst na een geldig volledig antwoord voor de toegestane selectie. Als er geen geschikte echte tekst aanwezig is, leg dat vast; verstuur niet op eigen initiatief een testbericht.

## Direct stoppen

Stop bij account- of organisatieafwijking, ontbrekende rechten, onduidelijke toestemming, onverwachte scope-/API-wijziging, quota, verlopen token, onveilige/verlopen cursor, ontbrekende oudere details, bijlagen of onbevestigde opslag. Gebruik de vaste UI-status en bewaarde historie. Ga niet handmatig de cursor aanpassen, records verwijderen, privileges verbreden of oude tekst overschrijven.

Bij een verloren opslagantwoord: eerst dezelfde jobstatus en het duurzame ontvangstbewijs laten controleren. Niet meteen opnieuw beginnen. Code- of image-terugval verwijdert geen opgeslagen berichten; gegevens verwijderen is een afzonderlijke handeling met concrete scope.

## Eindbewijs

Noteer per geselecteerd account: exacte release en migratie, toegangscontrole, API-versie, één job-ID, aantal uitvoeringen, revisies, ingevoegde teksten, ontvangen vaste foutcodes, gebruikte wachttijd en het stoppen op de proefgrens. Geen berichttekst, persoonsspecifieke sendergegevens of geheimen in dit rapport opnemen.

Een eindresultaat vermeldt afzonderlijk: Meta-inrichting bevestigd, beperkte leesproef uitgevoerd, herhaalveilige ontvangst bewezen, historie gecontroleerd en tijdelijke activering beëindigd. Wat niet werkelijk kon worden gecontroleerd blijft open. De huidige template heeft deze onderdelen daarom nog niet afgetekend.
