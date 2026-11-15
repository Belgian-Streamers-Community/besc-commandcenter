# Pakket 12 — Instagram-publicatie: inrichting en beperkte praktijkproef

15 november 2026. Lokale controle op basis van `a9a56d9` (PR #160). Deze voorbereiding activeert niets en verleent geen toestemming voor een echte publicatie. Geen Meta-account, token, scope, server, Cloud-database of bestaand dossier is benaderd of gewijzigd tijdens dit pakket. Alleen publieke documentatie is geraadpleegd. Echte inrichting en provideracceptatie blijven onbevestigd.

## Uitkomst en ontbrekende inrichting

De bestaande keten voor één feedbericht met één JPEG is aanwezig. Pakket 12 breidt de lokale onderbrekings-, rechten- en grensproeven uit; het voegt geen runtime, migratie, timer of OAuth-rechten toe. De [oorspronkelijke ketenbeschrijving](../wiki/Instagram-publicatie-pakket-5.md) blijft van toepassing. Het oude releasemanifest beschrijft de voorbereiding van pakket 5; de daarin genoemde migratietellingen zijn geen actuele Cloud-inventaris.

| Onderdeel | Lokaal vastgesteld | Vóór een praktijkproef nog bevestigen |
| --- | --- | --- |
| Inlogvariant | Bestaande Facebook Login, Page-credential, `graph.facebook.com` | Exacte app, Page, professioneel Instagram-account en bevoegde Page-taken; niet wisselen naar Instagram Login |
| OAuth-aanvraag | `metaScopes('instagram')` vraagt statistiekrechten, waaronder `instagram_manage_insights`; geen `instagram_content_publish` | Afzonderlijk goedgekeurde uitbreiding van de aanmeldflow en hernieuwde toestemming als publicatierechten ontbreken. Opnieuw aanmelden met dezelfde huidige scopes lost dit niet op |
| Publicatiebevoegdheid | Queue en provider controleren `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` | Werkelijk toegekende rechten, appbinding, accounttoegang, appmodus en eventuele App Review/Advanced Access; scopes alleen bewijzen geen Page-taak of volledige appgeschiktheid |
| Meta-client en versie | Server verwacht `META_APP_ID`, `META_APP_SECRET`, expliciete `META_GRAPH_API_VERSION` | Aanwezigheid, veilige opslag en ondersteunde versie; geen secret/token in dit document of proefbewijs |
| Callback | Bestaande route `/app/integraties/social/meta/callback` | Exacte DEV-origin, geregistreerde redirect en juiste bestaande app controleren; geen nieuwe app stilzwijgend aanmaken |
| Accountbinding | Bron bewaart account-ID en accountnaam/externe identiteit; database hercontroleert ze | Eén exact bestaand BESC-account, organisatie en gekoppelde Page/Instagram-identiteit aanwijzen |
| Afbeelding | Hash, echte JPEG-bytes, grootte, afmetingen en exact beheerd HTTPS-pad worden gecontroleerd | BESC-media-origin, openbare bereikbaarheid voor Meta, niet-overschrijfbare hashpaden, beeldrechten en concrete bewaartermijn; een willekeurige URL of Canva-link volstaat niet |
| Beoordeling | Afzonderlijke goedkeurder; wijziging van tekst, beeld, account of planning maakt de oude versie ongeldig | Eigen bevoegde tweede beoordelaar. De eerder overgeslagen live proef is geen ontheffing van deze applicatieregel |
| Vrijgave en selectie | Expliciete checkbox; organisatiegebonden uitvoerder verwerkt maximaal één verschuldigde job per verzoek | Geen andere verschuldigde job in de selectie; geen actieve uitvoerder of parallelle vrijgave tijdens de proef |
| Opslag en historie | Private job/gebeurtenistabellen, sessiecontrole, beperkte RPC's en exclusieve claim | Actuele DEV-release, migratie-aanwezigheid en rechten opnieuw vaststellen; niet opnieuw een oude migratie toepassen op basis van dit document |
| Activering | Flag standaard uit; route vereist servergeheim; geen timer toegevoegd | Huidige flags/configuratie zijn in dit pakket niet op de server uitgelezen. Tijdelijke activering vereist een eigen opdracht |
| Opvolging | Bevestigde ontvangst, mislukte controle en onzekere uitkomst onderscheiden | Benoemde beheerder met accounttoegang en afgesproken opvolging; geen automatische herhaal- of herstelpublicatie |

`ops/instagram-publication-pilot.template.json` is een passief bewijsformulier. Lege waarden blijven onbekend. Het bestand wordt niet door de runtime gelezen en kan geen publicatie vrijgeven.

## Gecontroleerde keten

1. De beheerder kiest een verbonden Instagram-account en een gecontroleerde JPEG. Accountbeheer blijft admin-only; de bestaande databankrechten blijven leidend.
2. Tekst, hashtags, oproep, account, beeldhash en tijdstip komen in dezelfde beoordelingsmomentopname. Zelfgoedkeuring wordt geweigerd.
3. Een bevoegde beheerder geeft de goedgekeurde versie apart vrij. Herhaalde vrijgave voor dezelfde beoordelingsronde levert dezelfde job op. Een tijdstip in het verleden betekent direct verschuldigd, zonder aparte proefmodus.
4. De uitvoerder leest en claimt de job via de serverpoort. Bron, echte sessie, beheerdersrol, accountstatus, identiteit en opgeslagen rechten worden gecontroleerd. Een ongeschikte afbeelding stopt vóór het lezen van de credential.
5. De providercontrole verifieert token/app, vereiste scopes en account-ID; daarna de publicatiequota. De adapter maakt één container, controleert de status maximaal vijf keer met maximaal vier wachttijden van één minuut en controleert quota opnieuw.
6. Vlak vóór `media_publish` controleert de database de bron en toegang opnieuw. Alleen een bevestigde media-ID, juiste eigenaar en verwachte permalink leveren een opgeslagen publicatiebewijs op.
7. Verloren antwoorden na een muterende stap worden onzeker behandeld; er volgt geen tweede POST. Een verloren opslagbevestiging na opgeslagen succes wordt alleen-lezen teruggevonden.

De lokale beeldgrenzen zijn JPEG, maximaal 8.000.000 bytes, breedte 320–1440 pixels, verhouding 0,8–1,91, één beeld en een volledige decodering. Het bijschrift bevat maximaal 2200 Unicode-codepunten, inclusief samengevoegde tekst/hashtags/oproep. Deze lokale controles bewijzen niet dat Meta het gekozen echte bestand accepteert. Stories, reels, carrousels, tags, locaties, advertenties, inbox en andere platformen vallen buiten de proef.

## Grenzen van herstel en bediening

- Annuleren kan alleen vóór de claim. Na een claim blokkeren lopende en onzekere jobs inhoudelijke wijzigingen; die blokkade mag niet met SQL of een nieuwe bron worden omzeild.
- Een herstart hervat geen reeds geclaimde verzending. `preparing`, `container_ready` en `publishing` kunnen bij een echte processtop blijven staan. De lokale proeven tonen dat er geen tweede verzending volgt, niet dat deze gevallen automatisch opgelost worden.
- Ook een verlopen/foutieve container, een onverwachte `PUBLISHED`-status, een volle tweede quotacontrole, een ongeldig publicatieantwoord of een ontbrekend ontvangstbewijs kan opvolging vereisen. Een onzekere status betekent niet dat er niets gepubliceerd is.
- De code heeft geen handmatige herstelknop om onzekerheid na externe verificatie af te boeken. Na zo'n uitkomst eindigt de proef; eventuele reparatie krijgt een eigen concrete opdracht.
- De route verwerkt de eerstvolgende verschuldigde job van de organisatie, niet een in het proefbestand gekozen job-ID. De limiet van één proefpublicatie wordt door de operator en de gecontroleerde wachtrij afgedwongen; er bestaat geen blijvende runtimeproefteller.
- Dezelfde beoordelingsronde wordt niet automatisch opnieuw vrijgegeven na een mislukking. Geen tweede ronde of nieuw dossier aanmaken om een onduidelijke uitkomst te herhalen.
- De proef vereist een tweede bevoegde beoordelaar. Zolang die niet beschikbaar is, kan een publicatieproef niet doorlopen. Er wordt geen account gemaakt, rol toegekend of zelfgoedkeuring toegestaan als vervanging.

## Praktijkproef: voorstel, nog niet uitvoeren

**Omvang:** één vooraf aangewezen BESC-organisatie, één professioneel Instagram-account, één eigen JPEG, één beoordeeld feedbericht, één vrijgave, maximaal één handmatige dispatch. Maximaal één container-POST en één publicatie-POST; status- en ontvangstcontroles kunnen meerdere GET-verzoeken gebruiken. Geen scheduler, discovery van andere accounts, storingsinjectie, inboxontvangst, YouTube-activering, herpublicatie of verwijdering.

De proef kan een voor echte volgers zichtbaar bericht opleveren. Er is geen sandboxaanname. De definitieve tekst, afbeelding, doelaccount en tijdstip moeten vooraf zichtbaar worden beoordeeld en expliciet voor publicatie worden toegestaan. `TESTFIXTURE - NIET PUBLICEREN - IG12` is nu alleen een lokale markering, geen geautoriseerd publiek bericht. Een testbeeld wordt nu niet openbaar gemaakt.

### A — inrichting en alleen-lezen controle na afzonderlijke opdracht

1. Vul de niet-geheime app-, Page-, account-, organisatie- en operatorbinding in. Bevestig Page-taken en de juiste appmodus/toegang aan de hand van de actuele officiële documentatie voor de gekozen API-versie. Vraag alleen de noodzakelijke aanvullende rechten aan na een aparte opdracht; houd statistiekensynchronisatie behouden.
2. Bevestig dat de mediaopslag het exacte hashpad onveranderbaar en zonder aanmelding/redirect kan aanbieden. Leg eigenaar, beeldtoestemming en bewaareinde vast. Publiceer of upload nog niets op grond van deze voorbereiding.
3. Controleer de exacte DEV-release en bestaande migratiehistorie, de uitgeschakelde flags, de serverconfiguratie en beschikbare rollback. Eventuele code-uitrol of OAuth-inrichting valt onder een afzonderlijk akkoord.
4. Voer pas na aparte toestemming een token-/account-/quotacontrole met GET uit. Zelfs een alleen-lezen preflight benadert een echte credential en Meta en is in dit pakket niet gedaan. Een container aanmaken is al een externe wijziging en hoort niet bij deze fase.

### B — één daadwerkelijke publicatie na expliciete publicatieopdracht

1. Controleer opnieuw de exacte geselecteerde tekst, JPEG, identiteit en planning, het proefvenster en de uitvoerende beheerder. Laat de bestaande tweede beoordelaar de momentopname goedkeuren. Zonder die persoon stoppen.
2. Controleer alleen-lezen dat geen andere job in de organisatie verschuldigd is of tijdens het venster verschuldigd zal worden en dat geen reeds begonnen/onzekere job voor het proefbericht bestaat. Spreek een venster zonder parallelle bediening af. Bij een afwijking stoppen; geen bestaande jobs annuleren of aanpassen om ruimte te maken.
3. Laat uitsluitend de nodige tijdelijke Instagram-functie vrijgeven na de afgesproken afzonderlijke opdracht. Socialinbox, inboxontvangst en YouTube-creatorkoppeling blijven uit. Geen timer toevoegen.
4. Geef precies de beoordeelde versie eenmaal vrij. Leg de job-ID vast en controleer dat de volgende dispatch alleen deze job kan kiezen. Voer maximaal één handmatige dispatch uit. Geen automatische HTTP-retry, ook niet wanneer de route een 503 teruggeeft of een proxy de verbinding verbreekt.
5. Controleer dezelfde job, historie en het providerbewijs. Alleen `published` met passende media-ID, eigenaar en permalink is bevestigd succes. Een gewone socialdossierstatus is geen publicatiebewijs.
6. Bij time-out, ontbrekend bewijs, gewijzigde toegang, quotaprobleem, accountafwijking of andere onzekerheid: stoppen en eerst dezelfde duurzame job/status teruglezen. Een geannuleerde browseraanvraag is geen bewijs dat de serveruitvoering gestopt is. Geen tweede container, geen tweede dispatch, geen nieuw bericht als herstel.
7. Na afgeronde uitvoering of bevestigde stop de tijdelijke functie sluiten zoals afgesproken. De applicatie heeft geen knop die een al lopende externe POST kan terugdraaien; bij een onderbroken HTTP-antwoord eerst de serveruitkomst vaststellen. Controleer normale statistiekensynchronisatie en de uitgeschakelde andere functies zonder extra synchronisatie te starten.
8. Bewaar het beperkte resultaat en historie. Geen automatische verwijdering van de publicatie, afbeelding, job of auditgegevens. Terugzetten van de flag of image verwijdert geen al gepubliceerd Instagram-bericht.

### Eindbewijs

Noteer exacte release, organisatie/accountbinding, toegepaste bestaande migratie, werkelijk gecontroleerde rechten, bron-/goedkeurings-ID, andere beoordelaar, job-ID, aantal bewuste dispatches, eindstatus, beperkte gebeurtenisreeks en eventueel media-ID/permalink. Geen token, app-secret, autorisatieheader, debug-token-URL, beeldbytes of overbodige persoonsgegevens opnemen. Leg tijdelijke sluiting en alle open punten apart vast; een lokaal testresultaat is geen live aftekening.

## Bronnen en actualiteit

De broncode in `src/lib/instagram-publication*.ts`, `src/app/app/social/instagram-actions.ts`, `src/components/instagram-publication-panel.tsx`, `src/lib/meta-integration.ts` en de bestaande migratie `20261108113531_instagram_publication_local.sql` onderbouwen de beschreven lokale controles.

Meta's officiële [Page-tokenaanvraag](https://www.postman.com/meta/instagram/request/0vuw3vk/get-access-tokens-of-pages-you-manage) toont de Facebook Login-variant met Page-taken en een gekoppeld Instagram-account. Op 15 november 2026 was die referentie leesbaar. De [officiële Instagram-collectie](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) gaf hoofdzakelijk een applicatieschil en de [directe Content Publishing-documentatie](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing/) was niet bereikbaar via de documentatiecontrole. Daarom zijn de actuele volledige endpointvoorwaarden, API-versieondersteuning, aanvullende businessrechten en appgeschiktheid **niet live bevestigd**. Er wordt geen nieuw vast quotagetal of automatische API-upgrade aangenomen; de adapter leest de gerapporteerde quota.

De echte Meta-dashboardinstellingen, tokens, beheerders, accounts en mediaopslag zijn in dit pakket niet uitgelezen. 'Nog bevestigen' betekent niet automatisch dat iets ontbreekt. De ontbrekende publicatiescope in de huidige OAuth-aanvraag is wel rechtstreeks in de code vastgesteld.
