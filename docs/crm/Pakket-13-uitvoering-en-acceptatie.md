# Pakket 13 — uitvoering, keuzes en acceptatie

Aanvulling: de [gezamenlijke lokale bouw van pakketten 13–15](Contacten-en-communicatie-pakketten-13-15.md) beschrijft de inmiddels uitgevoerde lokale implementatie en controles. Dit document bewaart de oorspronkelijke bouwvolgorde en voorgestelde acceptatiegevallen; echte inrichting en praktijkproeven blijven afzonderlijk open.

15 november 2026. Dit document maakt het [gezamenlijke ontwerp](Pakket-13-gezamenlijk-ontwerp.md) uitvoerbaar voor latere opdrachten. De [inventaris](Pakket-13-inventaris.md) beschrijft wat nu werkelijk aanwezig is. Het passieve [overdrachtsformulier](../../ops/crm-gmail-contacts-design.example.json) is geen runtimeconfiguratie.

## Opgeleverd in pakket 13

- Lokale inventaris van bestaande personen, organisaties, contacten, dossierrelaties, mailopsteller, goedkeuring en Gmail-adapter.
- Voorstel voor één centrale contactfiche, contactpunten met herkomst en gescheiden mailbox-/adresboekbinding.
- Concrete regels voor ontvangerkeuze, dubbele contacten, veldconflicten, mailrechten, versiegebonden beoordeling en onderbroken verwerking.
- Afgebakende bouwvolgorde voor pakketten 14 en 15 en toetsbare acceptatiegevallen hieronder.
- 37 bestaande lokale componenttests geslaagd. Dit zijn deels broncodecontroles en deels uitgevoerde fictieve SQL-/adapterproeven; geen test van een nog niet gebouwde synchronisatie.

Er is geen nieuwe runtime, databasewijziging, Google-client, consent, credential, import, synchronisatie, concept of mail gemaakt. De functionele acceptatiegevallen hieronder zijn **nog uit te voeren** bij de betreffende bouw; de beschrijving ervan telt niet als een geslaagde test.

## Bouwvolgorde

| Volgorde | Afgebakend werk | Klaar wanneer |
| --- | --- | --- |
| 14A — fundament | Contact-/adresresolutie, expliciete mailboxbinding, versiegebonden e-mailgoedkeuring en duurzame verzendjob ontwerpen en lokaal bouwen; bestaande mailfiche hergebruiken | Centrale en relatiegebonden adressen worden bewust gekozen; buiten CC gewijzigd concept en dubbele dispatch blokkeren; bestaande mailprocessen blijven werken |
| 14B — gesprekken | Lokale Gmail-leesadapter met nagebootste antwoorden, bericht-/gespreksopslag, beperkte mailboxselectie en koppeling naar personen/dossiers | Dubbele ontvangst, paginaonderbreking en mailboxwissel slaan niets over en verruimen geen toegang; body/metadata zijn aantoonbaar onderscheiden |
| 14C — antwoorden en opvolging | Antwoordconcept met correcte threadcontext, gescheiden beoordeling/verzending, zichtbare historie en idempotente vervolgtaak | Eén goedgekeurde inhoudsversie leidt tot maximaal één bewuste sendpoging; verloren antwoord blijft onzeker; een vervolgtaak veroorzaakt geen herverzending |
| 14D — voorbereiding echte proef | Exacte mailbox-/alias-/scopekeuze, privacy-/bewaarafspraken en concrete lees-/schrijfproef voorbereiden | Geen open identiteits-/toegangsblokkades; live toestemming noemt selectie, acties, ontvangers, aantallen en termijn. Geen uitvoering op grond van de lokale bouwopdracht |
| 15A — Contacts lezen | Afzonderlijk gebonden People API-adapter, CONTACT-bron en minimale velden, alleen nagebootste antwoorden | Eén adresboek wordt gelezen, providerbindingsfouten stoppen vóór gegevensopslag, cursor en voorstellen zijn duurzaam |
| 15B — vergelijken | Driewegvergelijking, ambiguïteit, multivaluecontactpunten en tombstones; gekozen verschillen lokaal toepassen via bestaande CRM-intake of beperkte nieuwe serverpoort | Per rij zichtbaar voor/na, bron, versie en actie; lokale wijzigingen sinds het voorstel blokkeren toepassing; geen account- of roltoekenning |
| 15C — voorbereiding echte proef | Klein expliciet leesbereik en eventueel apart toegestane lokale toepassing voorbereiden | Echte bron, toestemming en aantallen ingevuld. Geen terugschrijven, verwijderen of automatische tweerichtingssynchronisatie |

Pakket 15 kan op het CRM-/bindingsfundament voortbouwen zonder eerst echte Gmail-berichten te lezen. De ontwerpkeuzes zijn gezamenlijk; de credentials, jobs, quota en operationele foutstatussen blijven afzonderlijk. Drive/documentbeheer en dossierlinkpreviews horen bij pakketten 16–17. Nieuwsbrieven, grootschalige mailarchiefimport, gedeeld Workspace-directorybeheer, contactmerge en Google-write/delete vallen buiten deze eerste uitvoering.

## Nog te bevestigen vóór echte inrichting of data

Deze keuzes blokkeren de lokale documentatie niet. De genoemde voorkeur is een voorstel, geen besluit van de gebruiker.

| Keuze | Voorgestelde eerste afbakening | Te bevestigen bewijs |
| --- | --- | --- |
| Mailbox | Eén organisatie-mailbox; geen persoonlijk Gmail-account | Werkelijk OAuth-account, toegestane From/alias, beheerder en bevoegde gebruikers; een eerdere testmail is geen actuele consentinventaris |
| Adresboek | Eén expliciet Google-account dat de gekozen organisatiecontacten beheert | Eigenaarschap en bereik; niet aannemen dat Contacts voor alle Workspace-gebruikers gedeeld is |
| Contacts-richting | Google lezen → verschillen tonen → gekozen wijziging in CC; bestaand lokaal gegeven standaard behouden | Exacte veldset en bevoegdheid voor toepassing. Geen Google-write of bulkoverschrijving |
| Gmail-bereik | Beperkte geselecteerde gesprekken/periode; eerst klein lezen | Wel/geen body, bijlagen en gevoelige inhoud; noodzakelijke scopes en bewaartermijn. Een label is geen OAuth-toegangsgrens |
| Wie mag wat | Bestaande rollen behouden, extra mailbox-/communicatiebinding beperken | Benoemde verantwoordelijken voor lezen, beoordelen, verzenden en opvolgen. Geen eigen goedkeuring |
| Echte ontvangers | Nog geen proefmail of ontvanger gekozen | Exact adres, inhoud en verzendopdracht pas bij een aparte proef |
| Opslag en verwijderen | Minimaal noodzakelijke kopieën; geen permanent mailarchief als standaard | Concrete termijnen, betrokkenen, verwijderverzoek, herstelkopieën en veilige afhandeling van ingetrokken verbindingen |
| Herstelverantwoordelijke | Eén aangewezen beheerder; vervanging nog te regelen | Wie een onzekere send, cursorfout of verkeerd gekoppeld contact onderzoekt; geen automatische doorschuiving van rechten |

Er wordt niet alvast aan een persoonlijke mailbox gekoppeld om verder te kunnen. De bestaande organisatie-Workspacekoppeling en persoonlijke YouTube-creatorkoppeling worden niet samengevoegd.

## Acceptatiematrix voor de latere lokale bouw

Alle gegevens fictief, alle providerantwoorden nagebootst, geen echte OAuth of HTTP-verzoeken. IDs hieronder zijn bewijs-/scenariolabels, geen testresultaten van bestaande runtime.

| ID | Geval | Vereist resultaat |
| --- | --- | --- |
| CRM01 | Eén persoon bij twee organisaties met verschillende functies | Eén centrale persoon, twee relatiegebonden functies; geen dubbele persoon of globale functiewijziging |
| CRM02 | Centrale persoonsmail en oud gekopieerd contactadres verschillen | Herkomst en keuze zichtbaar; geen stille verzending naar de oude kopie; ontvanger wordt als snapshot vastgelegd |
| CRM03 | `info@fixture.invalid` hoort bij een organisatie en twee contactpersonen gebruiken dat adres | Geen persoon automatisch herkennen of samenvoegen; expliciete organisatie-/adresbinding kiezen |
| CRM04 | Zelfde naam, ander adres; of twee personen met exact hetzelfde adres | Alleen matchvoorstellen; geen account- of persoonidentiteit uit naam/adres afleiden |
| CRM05 | Geïmporteerd contact heeft hetzelfde adres als een bestaand BESC-account | Geen login, lidmaatschap, portaalrecht, accountkoppeling, Bucks-mutatie of nieuwsbriefinschrijving |
| CRM06 | Contact in andere tenant of dossier zonder toegang | Geen gegevens, tellingen, suggesties of mutaties buiten de eigen bevoegdheid |
| MAIL01 | Gebruiker mag het project zien maar niet de mailbox | Mailinhoud, Bcc, zoekresultaat en preview blijven afgeschermd; dossierkoppeling geeft geen toegang |
| MAIL02 | Dubbele pagina of opnieuw aangeboden message-ID | Eén bericht per mailbox + message-ID, dezelfde tijdlijn; geen tweede taak of contactmoment |
| MAIL03 | Zelfde thread-ID/onderwerp in twee mailboxen | Verschillende gesprekken; geen samenvoeging op onderwerp of ID buiten de mailboxbinding |
| MAIL04 | Antwoord op bestaande mail met gewijzigde ontvangers | Correcte replyheaders en thread-ID, nieuwe expliciete ontvangerkeuze en nieuwe goedkeuring |
| MAIL05 | Maker probeert eigen mail goed te keuren | Geweigerd, ook via directe server-/databasepoort; geen verborgen vrijgave |
| MAIL06 | Gmail-concept is na beoordeling elders aangepast | Goedkeuring dekt die versie niet; geen send; nieuwe beoordeling of duidelijk conflict |
| MAIL07 | Twee gelijktijdige verzendklikken of ingetrokken sessie vóór dispatch | Eén exclusieve winnaar respectievelijk nul providerverzoeken; actuele databasebevoegdheid leidend |
| MAIL08 | Send is mogelijk uitgevoerd maar antwoord of opslagbevestiging is kwijt | Zelfde job blijft controleerbaar; geen tweede send; bevestigde opgeslagen uitkomst alleen-lezen terugvinden |
| MAIL09 | Mail bevestigd, maar taak/contactmomentregistratie mislukt | Alleen lokale vervolgstap idempotent hervatten; geen dubbele taak en geen nieuwe mail |
| MAIL10 | Gmail history-cursor verlopen of de selectie gewijzigd | Nieuwe begrensde basisronde voorbereiden, bestaande berichten behouden; geen onzichtbare archiefimport |
| MAIL11 | HTML bevat script, externe trackingpixel of bijlage-URL | Veilige weergave zonder script/automatische externe download; bijlagen buiten scope niet stil ophalen |
| GC01 | Google verandert een telefoon, CC verandert een andere waarde | Per veld vergelijken met bevestigde basis; alleen expliciete voorstellen, CC-wijziging behouden |
| GC02 | Google en CC veranderen dezelfde waarde anders | Conflict; geen 'laatste tijdstempel wint' |
| GC03 | Leeg Google-veld, meer adressen of deleted-tombstone | Geen onbedoeld leegmaken, arrayverlies of verwijderen van persoon/dossier/historie |
| GC04 | Accountwissel, verkeerde resourcebinding of verlopen sync-token | Stoppen/nieuwe ronde; geen cursor/binding overnemen en geen nieuwe brede sync zonder afbakening |
| GC05 | Opslagantwoord valt weg na een gelezen pagina | Bevestigde pagina en cursor samen terugvinden; geen overgeslagen rij en geen dubbele toepassing |
| GC06 | Een lokaal voorstel is verouderd door gelijktijdige CRM-edit | Revisiecontrole weigert toepassing; actuele waarde opnieuw vergelijken |
| GC07 | Latere Google-write met oude bron-etag, wanneer ooit afzonderlijk gebouwd | Nieuwe bron lezen en conflict tonen; geen blinde retry of overschrijving van niet-geselecteerde arraywaarden |

## Fictieve doorloop van het ontwerp

Dit is een handmatige ontwerpdoorloop, geen uitgevoerde integratietest:

1. `TESTFIXTURE - NIET PUBLICEREN - P13`: persoon Noor Voorbeeld werkt bij organisatie Demo A en Demo B. Beide relaties verwijzen naar dezelfde bestaande centrale persoonsidentiteit; de functie blijft per organisatie verschillend (CRM01).
2. Noor heeft lokaal een adres en Google stelt een tweede voor. De vergelijklijst toont twee afzonderlijke waarden. De beheerder kan een extra contactpunt kiezen zonder het bestaande primaire adres te vervangen (CRM02, GC03).
3. Een mail van het gedeelde adres `info@fixture.invalid` wordt als nog te koppelen getoond. Het systeem kiest niet tussen Noor en een andere medewerker. De beheerder bindt het gesprek bewust aan Demo A en het juiste dossier (CRM03, CRM04).
4. De beheerder maakt een antwoordconcept voor het gekozen adres. De beoordeling ziet precies die ontvangers en inhoud. Zonder tweede beoordelaar stopt de flow; het ontwerp verlaagt de bestaande regel niet (MAIL04, MAIL05).
5. Na een nagebootst verloren sendantwoord blijft de job onzeker. Er wordt geen nieuwe mail gemaakt. Een later teruggevonden ontvangstbewijs kan de lokale registratie afronden zonder de provideractie te herhalen (MAIL08, MAIL09).

Alle genoemde personen, organisaties en adressen zijn fictief. Er zijn geen testrecords of Google-contacten aangemaakt.

## Scheiding van uitvoering

Lokale bouw en tests worden pas in een volgende opdracht uitgevoerd. Daarna afzonderlijk: reviewbranch/concept-PR, controles, merge/imagebouw, eventuele migratie, uitrol en operationele activering. Een merge activeert geen OAuth-rechten of synchronisatie. Een live leesproef en een echte verzending zijn verschillende opdrachten; toestemming voor het ene dekt het andere niet.

Een eindrapport vermeldt telkens apart: lokaal gebouwd, lokaal getest, echte accountconfiguratie bevestigd, echte leesproef uitgevoerd, gekozen verschillen toegepast en echte verzending uitgevoerd. Niet-uitgevoerde stappen blijven herkenbaar open.
