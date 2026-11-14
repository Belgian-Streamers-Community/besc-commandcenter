# YouTube creators pakket 11 inrichting en beperkte proef

14 november 2026. Deze voorbereiding hergebruikt de bestaande persoonlijke YouTube-koppeling. De inrichting en proef zijn niet uitgevoerd; er zijn geen Google-instellingen, OAuth-clients, sleutels, mounts, flags of serverconfiguraties gewijzigd. De gewone organisatie-YouTube-koppeling blijft afzonderlijk.

## 1 Uitkomst van de controle

De applicatiecode en databasepoorten zijn aanwezig, maar de persoonlijke creatorproef kan nog niet beginnen. Op DEV ontbreken de configuratie, wrapping key, opslagmappen en mounts. De selectie bevat nog geen aangewezen eigen proefvideo en er zijn geen concrete proef-/bewaartermijnen vastgelegd. Een werkende verwijderprocedure en herstelkopie moeten vóór echte opslag worden bewezen.

De actuele Google OAuth-inrichting is **onbevestigd**: bij de alleen-lezen poging om de clientlijst te openen vroeg Google opnieuw om identiteitsverificatie. Er is niet verder aangemeld en er zijn geen instellingen gewijzigd. Het ontbreken van een nieuwe Google-controle bewijst niet dat de gebruiker intussen geen client heeft aangemaakt.

| Onderdeel | Bevinding op 14 november | Nog nodig |
| --- | --- | --- |
| BESC-proefaccount | Eén actief, bevestigd passend account gevonden | Bij uitvoering opnieuw controleren; echte owner-ID alleen in de private configuratie |
| DEV-code | `44159b2`, container gezond, creatorflag uit | Code hoeft voor deze voorbereiding niet opnieuw uitgerold te worden |
| Routes | Creator-API en callback geven 503 `unavailable`, zonder cookie | Pas na afzonderlijke vrijgave als werkende OAuth-route beoordelen |
| Database | Owner-, server- en account-RPC aanwezig; zes creatortabellen leeg | Geen nieuwe migratie nodig voor deze documentatievoorbereiding; uiteindelijke verwijderafhandeling apart beoordelen |
| Google-project | Op 8 november aangemaakt als `besc-creator-youtube-dev`; facturatie toen aantoonbaar uitgeschakeld | Na heraanmelding actuele project-, facturatie- en clientstatus opnieuw lezen |
| OAuth-client en APIs | Op 8 november nog niet ingericht; nu niet opnieuw te verifiëren | Webclient, consentinstellingen en benodigde APIs controleren en zo nodig afzonderlijk inrichten |
| Configuratie en wrapping key | Geen configuratiepointer, hostbestanden of mounts aanwezig | Private bestanden, eigenaar/rechten, keyring en alleen-lezen mounts provisioneren na akkoord |
| Duurzame opslag | De drie voorgestelde hostmappen ontbreken | `attempts`, `receipts`, `keys` buiten `/app`, plus herstelbewijs |
| Proefkanaal | @missrinam80 eerder aangewezen; publiek kanaal-ID eerder uit eigen beheerlinks afgeleid | OAuth moet het daadwerkelijke kanaaleigenaarschap opnieuw bevestigen |
| Proefvideo | Nog geen eigen video voor deze proef aangewezen; op 8 november meldde de gebruiker dat die ontbrak | Eén bestaande eigen video aanwijzen en eigendom/geschiktheid bevestigen; geen video voor deze proef aanmaken of publiceren |
| Doel, meetvenster en termijnen | Nog geen concrete waarden voor deze uitvoering | Expliciete toestemming, start/einde proef, meetvenster, `valid_until` en `retain_until` vastleggen |
| Privacy en verwijderen | Toegangsverval en intrekken bestaan; volledige gegevensverwijdering is niet als operationele keten bewezen | Informatie, verzoekroute, verwijderprocedure, rolverdeling en termijnen vóór echt gebruik bevestigen |
| Herstel en logging | Lokale hersteltests aanwezig; huidige proxyconfiguratie heeft geen expliciete access-logdirective | Werkelijke app/proxy/hostlogs en veilige herstelkopie inclusief Vault/bestandssleutels controleren |

De server draait als UID/GID 1001. De specifieke voorgestelde bestanden `/opt/besc-secrets/creator-youtube/config.json`, `/opt/besc-secrets/creator-youtube/wrapping.key` en de mappen onder `/var/lib/besc-creator-youtube/` waren tijdens de controle niet aanwezig. Dit zijn aanwezigheid-/mountcontroles; er zijn geen sleutel- of credentialinhouden gelezen.

## 2 Wat al bestaat

- Eigenaar- en echte sessiecontrole, met één aangewezen pilotgebruiker, één kanaal en een expliciet proefeinde.
- Toestemming, weigering en annulering; state/PKCE en binding aan browser en sessie.
- Afgeschermde tokenopslag, versleutelde ontvangsten en herstel na onderbroken providerantwoorden.
- Lokale sleutelring, rotatie en heropenen; geen automatische sleutelinitialisatie.
- Google-adapter voor codewisseling, kanaalcontrole, geselecteerde Analytics-meting, tokenvernieuwing en intrekking.
- Mijn-accountweergave voor de eigenaar, met metingen, ontbrekende waarden en herstel-/intrekkingsstatus.
- Standaard uitgeschakelde API-/callbackroutes, een onbruikbaar voorbeeldconfiguratiebestand en een niet-ingeschakelde Compose-override.

Deze technische aanwezigheid is geen Google-liveacceptatie. Het bestaande `isolatedProject=true` is een aansluitvoorwaarde; het bewijst niet dat de ingevulde client werkelijk bij het aparte project hoort.

De bestaande consentinvoer vereist minimaal één video. Zonder geselecteerde video past een ‘alleen even koppelen’-proef dus niet in de huidige flow. Gebruik geen organisatievideo, verzonnen video-ID of bredere kanaalcollectie als vervanging.

## 3 Exacte Google inrichting voorbereiden

De doelinrichting hieronder is een voorstel voor de latere afzonderlijk goedgekeurde uitvoering.

| Instelling | Doelwaarde of keuze |
| --- | --- |
| Project | Bestaand `besc-creator-youtube-dev`; eerst identiteit en facturatiestatus hercontroleren |
| Naam van de app | BESC Creator YouTube DEV |
| OAuth-clienttype | Web application, uitsluitend in het aparte creator-DEV-project |
| Doelgroep | External met Testing-status, omdat de aangewezen persoonlijke Google-account geen Workspace-account van het BESC-domein is |
| Testgebruikers | Alleen de door de gebruiker aangewezen persoonlijke Google-account van @missrinam80; geen brede uitnodiging |
| APIs | YouTube Data API v3 en YouTube Analytics API; geen Reporting-, Drive-, Gmail- of betaalde uitbreiding |
| Redirect URI | Exact `https://cc-dev.belgianstreamerscommunity.be/auth/creator-youtube/callback` |
| JavaScript origins | Voor deze serverflow geen extra oorsprong toevoegen zonder aangetoonde noodzaak |
| Scopes | Alleen `https://www.googleapis.com/auth/youtube.readonly` en `https://www.googleapis.com/auth/yt-analytics.readonly` |
| Identiteit en ondersteuning | Gecontroleerde BESC-naam, bereikbaar supportadres en toepasselijke informatie; geen verzonnen privacy- of verwijderlink |
| Productiestatus | Niet publiceren als productie-app en niet hergebruiken voor organisatiekanalen |

De OAuth-client-ID en de projectbinding moeten in de console worden bevestigd. Een overeenkomstig nummer of een boolean in JSON is geen projectbewijs. Het clientgeheim wordt uitsluitend via een afgeschermde serverprocedure opgeslagen; niet in chat, Git, screenshots, publieke variabelen of een image.

Het aanmaken van het aparte project en uitschakelen van zijn facturatie zijn historische uitgevoerde stappen van 8 november. De twee bestaande andere projecten zijn geen doel van dit pakket. Er wordt geen nieuw project aangemaakt, geen facturatie geactiveerd en geen organisatieclient overgenomen.

Google beschrijft de scheiding tussen test-/productieprojecten en passende OAuth-identiteit in de [OAuth-policyvoorbereiding](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance). De [serverflow](https://developers.google.com/identity/protocols/oauth2/web-server) beschrijft redirectcontrole, offline toegang en intrekking. Deze bronnen bevestigen geen concrete BESC-consoleconfiguratie.

## 4 Serverinrichting zonder activering voorbereiden

De bestaande bestanden `ops/creator-youtube-pilot.config.example.json` en `ops/creator-youtube-pilot.compose.example.yml` blijven de voorbeelden. Ze zijn bewust niet direct bruikbaar: placeholders en `isolatedProject=false`; de override laat `BESC_CREATOR_YOUTUBE_ENABLED=false` staan. Er wordt geen tweede configuratieschema of automatisch installatiepad toegevoegd.

Na een afzonderlijke inrichtingsopdracht:

1. Vul één private configuratie met echte organisatie- en eigenaar-ID, exacte origin, geverifieerd kanaal, proefeinde, eigen OAuth-client en een vooraf geïnitialiseerde keyring-ID. Houd de Google- en BESC-identiteit apart: de Cloud-projectbeheerder is niet automatisch de creator die toestemming geeft.
2. Maak alleen de aangewezen private hostpaden aan. Geen opslag onder `/app` en geen netwerkshare. Configuratie en wrapping key blijven buiten de writable ontvangstboom.
3. Maak een cryptografisch willekeurige wrapping key van 32 bytes, gecodeerd als base64url zoals de bestaande runtime verwacht. Gebruik de bestaande geteste `CreatorYouTubeKeyring.initialize` voor de eenmalige initialisatie; `open` mag een ontbrekende keyring niet automatisch vervangen.
4. Geef bestanden 0600 en opslagmappen 0700, passend lees-/schrijfrecht voor containergebruiker 1001. Geen brede groep-/wereldrechten, symlinks of opname van secrets in de repository.
5. Mount configuratie en wrapping key alleen-lezen; mount alleen de drie eigen opslagmappen writable. De voorbereide override maakt ontbrekende hostpaden niet automatisch aan.
6. Controleer de resulterende Compose-configuratie en secretredactie zonder waarden uit te printen. Verander geen andere service of bestaande organisatiecredential.
7. Bewijs herstel met passende database/Vault-opslag en private bestandsopslag; bewaar de benodigde wrapping key afzonderlijk. Een image-terugval alleen herstelt geen verloren tokens of sleutelring.
8. Test eerst met de creatorflag uit. Een eventuele noodzakelijke mountinstallatie en containerherstart horen bij een afzonderlijk goedgekeurde serverinrichting, niet bij deze voorbereiding.

Er is nog geen veilig operatorpakket voor echte provisioning vrijgegeven. De stappen zijn een uitvoeringsontwerp, geen instructie om nu het voorbeeldbestand op de server te kopiëren. In deze opdracht zijn geen echte sleutels aangemaakt of herstelkopieën van secrets gemaakt.

## 5 Af te spreken gegevens en herstelvoorwaarden

| Beslissing | Voorstel voor de kleine proef | Nog door BESC/eigenaar vast te leggen |
| --- | --- | --- |
| Persoon en kanaal | Eén BESC-eigenaar, alleen @missrinam80 | Actuele binding via eigen Google-toestemming en exacte kanaalcontrole |
| Video | Eén bestaande eigen video | Eén echte video-URL en bevestigd eigendom; geen nieuwe publicatie |
| Meetvenster | Eén aaneengesloten venster van maximaal zeven dagen | Exacte datums die niet in de toekomst liggen; datavertraging accepteren |
| Doel | Technisch controleren dat persoonlijke kanaalstatistieken correct aan de eigen account verschijnen | Echte doeltekst vóór consent; geen campagnes of publieke statistieken |
| Proefduur | Eén begeleide sessie, voorstel maximaal 60 minuten | Exact `pilot.expiresAt`; `valid_until` niet later dan dit einde |
| Bewaren | Alleen voor het vastgestelde doel en afgesproken termijn | Exact `retain_until`, ten minste `valid_until`, plus werkelijke verwijderafhandeling |
| Delen | Alleen zichtbaar voor de betrokken eigenaar via de bestaande toegangsgrens | Geen sponsorrapportage, openbare creatorpagina of teamdeling in deze proef |
| Herstel | Afzonderlijke private sleutelbewaring en herstelbewijs | Wie herstel kan uitvoeren en hoe onzeker ontvangen credentials worden opgevolgd |

De API vraagt drie metrics: weergaven (`views`, aantal), kijktijd (`estimatedMinutesWatched`, minuten) en gemiddelde kijkduur (`averageViewDuration`, seconden). Geen omzet, abonnees, unieke kijkers of demografische gegevens toevoegen.

Een ontbrekende Analytics-rij is geen gemeten nul. Google kan een rapport slechts tot de laatst beschikbare dag voor alle gekozen metrics leveren. Vergelijk met Studio voor dezelfde video en periode, zonder gelijke actualiteit of volledige dekking te veronderstellen. Zie [reports.query](https://developers.google.com/youtube/analytics/reference/reports/query).

`retain_until`, proefeinde en lokale intrekking beperken toegang; zij zijn geen bewijs van daadwerkelijke verwijdering. Vóór echte opslag moeten de meetgegevens, gekoppelde Vault-credentials en versleutelde lokale aanvragen/ontvangsten in een concrete verwijderprocedure zijn opgenomen. Behoud van noodzakelijke auditvelden vraagt eigen afspraken; verwijder niet automatisch alle historie of gedeelde Vault-/sleutelgegevens. Dit pakket voegt geen juridische beslissing of verwijdertaak toe. De [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies) blijven een bron voor de nog te bevestigen gegevensbehandeling.

## 6 Beperkte proef na afzonderlijke vrijgave

Vul eerst `ops/creator-youtube-package11-pilot.example.json` in als bewijsformulier. Het bestand is niet de runtimeconfiguratie en kan niets activeren.

De primaire proef bevat maximaal één autorisatiepoging, één Analytics-collectie voor één video en één intrekkingspoging. Geen automatische of geplande synchronisatie, geen kunstmatige storing, geen extra tokenvernieuwing en geen upload/publicatie. De geteste refresh-/onderbrekingsgevallen blijven voor deze eerste ronde lokale bewijzen.

Deze aantallen en de voorgestelde duur worden door de begeleidende operator bewaakt. Het bewijsformulier voegt geen nieuwe technische teller of limiet aan de runtime toe. De bestaande technische pilotgrens beperkt eigenaar, kanaal en proefeinde; de bestaande collectie ondersteunt maximaal 25 door de eigenaar geselecteerde video’s. Voor deze proef wordt de consentselectie bewust op één video gehouden.

1. Controleer vooraf actuele versie, migrations, lege of eerder verklaarde eigen proefgegevens, flags, configrechten, herstelbewijs, logredactie en verwijderprocedure. Leg de exacte scope en termijnen ter goedkeuring voor. Alleen een ingevuld formulier is geen toestemming.
2. Laat uitsluitend de afgebakende creatorproef tijdelijk vrijgeven. Socialinbox, inboxontvangst en Instagram-publicatie blijven uit. Er wordt geen algemene creatoruitrol of periodieke collectie gestart.
3. Meld aan met het aangewezen BESC-account. De eigenaar gebruikt zelf de juiste persoonlijke Google-account en geeft zelf toestemming; geen wachtwoord, code, OAuth-link of token in chat delen.
4. Controleer op het toestemmingsscherm doel, exact kanaal, één video, datums en geldigheid. Een adminrol is geen vervanging voor persoonlijke toestemming. Bij een weigering of verkeerde account stopt de ronde; niet automatisch opnieuw autoriseren.
5. Na terugkeer: controleer de eigen persistente status en precies het verwachte kanaal. Alleen de callback ontvangen is geen bewijs van gekoppeld zijn. Verkeerde/meerdere kanalen blijven geblokkeerd.
6. Haal één rapport op. Bevestig de drie waarden en eenheden, meetperiode en het verschil tussen nul en ontbrekend. Rapporteer geen datadekking die Google niet bevestigt.
7. Herlaad de accountpagina en controleer dezelfde opgeslagen status/metingen. Dit is geen opdracht om de container te stoppen of credentials te roteren.
8. Trek de toestemming via de bestaande eigen route in. Leg lokale blokkering en Google-bevestiging afzonderlijk vast. Bij een onbekend of mislukt providerantwoord blijft opvolging open; geen gefingeerde succesvolle intrekking of automatische tweede poging.
9. Sluit de tijdelijke activering volgens de vooraf afgesproken werkwijze. Controleer dat metingen niet meer worden uitgeleverd en voer alleen de afzonderlijk goedgekeurde gegevens-/secretopruiming uit. Een flag op false is geen Google-intrekking of verwijdering.
10. Leg bewijs vast zonder bericht-/tokeninhoud: versie, eigen job-/linkreferentie, venster, aantallen operaties, bekende/ontbrekende metrics, intrekkingsstatus en eventuele open herstelactie. Behoud normale organisatie-YouTube-/Twitch-processen.

De proef stopt direct bij een onjuiste account, ontbrekende eigen video, projectonzekerheid, ontbrekende gegevensafspraken, sleutel-/opslagfout, onbevestigd providerantwoord of onverwachte scope. Geen brede scopes aanvragen, geen andere creator kiezen en geen SQL-status handmatig ‘repareren’ om verder te gaan.

## 7 Resultaat en eerstvolgende inrichtingstap

Deze voorbereidingsstap is klaar als de ontbrekende inrichting en beslissingen concreet beschreven zijn, de huidige uitgeschakelde toestand is gecontroleerd en de beperkte proef een duidelijke scope en stopvoorwaarden heeft. Dat is geen vrijgave voor live acceptatie.

De eerstvolgende afhankelijkheid is heraanmelden in Google Cloud en daarna uitsluitend de client-/API-/consentstatus van `besc-creator-youtube-dev` lezen. Pas op basis daarvan kan een exact inrichtingspakket ter afzonderlijke goedkeuring worden opgesteld. Daarnaast moeten één eigen video, de werkelijke proefdatums en de bewaar-/verwijderafspraken worden aangewezen.

Bewijs van deze ronde staat afgeschermd onder `work/youtube-creators-package11-20261114/`: actieve BESC-kandidaat, servermetadata, databasefuncties/-tellingen, twee uitgeschakelde HTTP-routes en de actuele lokale regressieproeven. Persoonlijke Google-adressen en echte account-UUID’s worden niet in gedeelde voorbeelden gekopieerd.

### Bestaande referenties

- [Historische voorbereiding van pakket 3](ca03-youtube-pilot-readiness.md), 8 november. De oude versie-/uitrolclaims daarin zijn een historische momentopname.
- [Gebruikersflow en Google-adapter](ca03-youtube-user-flow-provider.md).
- [Eigen sessie en bediening](ca03-youtube-session-ui.md).
- [Lokale sleutelring](ca03-youtube-local-keyring.md).
- [Duurzaam herstel](ca03-youtube-local-recovery.md).
- [Tokenvernieuwing en ontvangst](ca03-youtube-refresh-inbox.md).
