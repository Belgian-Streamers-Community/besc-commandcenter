# Documenten en dossierlinks — pakketten 16–17

## Lokale oplevering

De bestaande pagina Documenten & Drive behoudt het centrale documentregister,
archiveren, dossierdekking, documentgeneratie en goedkeuringsprocessen. De nieuwe
mappenboom is een aanvullend overzicht onder de ingestelde gedeelde Drive-hoofdmap.

- Mappen worden pas bij openen gelezen, maximaal 50 bestanden per pagina.
  Submappen zijn uitklapbaar; meer resultaten worden uitsluitend op verzoek geladen.
- Het overzicht toont de controletijd, lege mappen, vervolgpagina's, onvolledige
  zoekresultaten en fouten met opnieuw proberen. Een mislukte vernieuwing houdt het
  vorige overzicht zichtbaar met een waarschuwing dat het verouderd kan zijn.
- Elke pagina en bestandskeuze controleert opnieuw de gedeelde Drive, hoofdmap en
  voorouders. Verwijderde, verplaatste of onbereikbare bestanden worden geweigerd.
  Snelkoppelingen worden niet gevolgd. Kringverwijzingen en paden dieper dan 40
  bestanden/mappen worden geweigerd.
- Een gekozen bestand of map kan als bronlink gekoppeld worden aan een actief
  project, event, campagne, contentdossier, sponsor/partner, communitycontact of taak.
  De keuze toont maximaal 200 recente dossiers per soort en controleert opnieuw de
  organisatie, dossierbevoegdheid en actuele bronmetadata bij opslaan.
- De koppeling gebruikt `record_links` en de bestaande centrale documentidentiteit.
  Er komt geen tweede documentregister. Een dubbele URL in hetzelfde dossier wordt
  geweigerd; één bron kan aan meerdere dossiers verbonden zijn.
- Afbeelding, Map en Toepassing vullen de zes bestaande linksoorten aan, ook in de
  gezamenlijke dossiereditor. Een toepassing is een gewone webapp-link, geen lokale
  uitvoerbare toepassing. De extra soorten werken in de elf bestaande rubrieken met
  `record_links`; materiaalbewijsstukken behouden hun afzonderlijke bestaande soorten.
- Nieuwe linksoorten worden ook in de database geweigerd voor een niet beschikbaar
  dossier. De controle vergrendelt de dossierregel tijdens het koppelen, zodat
  gelijktijdig archiveren de controle niet kan passeren. Ontkoppelen verwijdert alleen
  de verwijzing; het centrale document en Google-bestand blijven bestaan.

## Afbeeldingspreviews

De preview opent bij aanwijzen, toetsenbordfocus of de knop op een telefoon. Escape,
focus verlaten, buiten de preview klikken en Sluiten sluiten de preview. Afbeeldingen
worden niet vooraf geladen; tijdelijke afbeeldingsadressen worden opgeruimd.

Voor Drive-bestanden controleert de afgeschermde previewroute opnieuw de actuele
beheerrechten en hoofdmap. Alleen JPEG, PNG, WebP en GIF zijn toegestaan. Maximaal
5 MB brondata en 20 miljoen pixels worden verwerkt, opnieuw naar PNG omgezet en
verkleind tot maximaal 640 × 640 pixels. Metadata, Google-tokens en tijdelijke
Google-thumbnailadressen worden niet doorgestuurd. Antwoorden zijn privé en niet
cachebaar. SVG, HTML, shortcuts, redirects en onbekende bestandstypen worden geweigerd.

Externe afbeeldingslinks worden uitsluitend rechtstreeks door de browser geladen,
zonder cookies of verwijzende pagina, met CORS, HTTPS en maximaal 5 MB. Er is geen
serverproxy voor willekeurige externe adressen. Letterlijke lokale/private IP-adressen,
lokale hostnamen en afwijkende poorten worden geweigerd. De externe aanbieder ontvangt
bij openen wel een normale afbeeldingsaanvraag. Zonder CORS-toestemming, bij een te
groot bestand of een fout verschijnt een uitleg om de bron te openen. Een algemene
Drive-deellink wordt niet als publiek afbeeldingsadres gebruikt.

## Rechten en standaardinstelling

Beide nieuwe onderdelen staan standaard uit:

```text
BESC_DRIVE_BROWSER_ENABLED=false
BESC_DOSSIER_LINKS_ENABLED=false
BESC_DRIVE_BROWSER_ORGANIZATION_ID=
```

De centrale Drive-hoofdmap kan financiële en bestuursdocumenten bevatten. Daarom
vereist de mappenboom zowel `manageOrganization` als `manageFinance`, plus een exacte
overeenkomst met de expliciet ingestelde organisatie. De bestaande Google Workspace-
koppeling en ingestelde `GOOGLE_SHARED_DRIVE_ID` / `GOOGLE_DRIVE_ROOT_FOLDER_ID` worden
gebruikt. Er zijn geen scopes of credentials gewijzigd. De adapter voert alleen GET-
verzoeken naar vaste Google Drive API-endpoints uit. Bestaande OAuth-rechten kunnen
ruimer zijn; de applicatie krijgt via deze adapter geen schrijfbewerkingen aangeboden.

Dit is gerichte, handmatige leesverversing van metadata. Er is geen permanente
inventariscache, achtergrondtaak, tweerichtingssynchronisatie of automatische
verwijdering. Tijdens wijzigingen in Drive kan een gepagineerde lijst verschuiven;
de controletijd is geen garantie van een onveranderlijke volledige inventaris.

## Lokale verificatie

- Nagebootste Drive-antwoorden: pagina's, duplicaten, herhaalde cursors, onvolledige
  resultaten, ontbrekende rechten, 404/429/500, oversize en ongeldige antwoorden.
- Runtime en dossieractie: standaard uit zonder token- of provideractie,
  organisatie-/bevoegdheidscontrole, actuele dossier- en broncontrole en opslagfouten.
- Echte React-componenten in een lokale DOM: luie mapuitbreiding, submappen,
  vervolgpagina's, fout/herstel, toetsenbord, aanwijzen, aanraken en URL-opruiming.
- Tijdelijke PostgreSQL 17.11: oude en nieuwe soorten, centrale identiteit,
  dubbele verwijzingen, organisatie-isolatie, beperkte rollen, ontkoppelen en archief.
- Twee databaseverbindingen: koppelen wacht op gelijktijdig archiveren; bevestigde
  archivering weigert de koppeling, teruggedraaide archivering laat die toe.
- Volledige regressietests, TypeScript, lint, productiebouw en de twee controles
  voor gegenereerde dossiermetadata. Alle historische migraties blijven ongewijzigd.

Bewijs staat lokaal naast de checkout in
`work/documents-dossier-links-16-17-20261115/`.

## Later afzonderlijk te besluiten

De voorbereidende migratie staat in
`20261115102517_documents_dossier_links_local.sql`. Ze voegt drie toegestane soorten
en één beveiligingstrigger toe, zonder bestaande rijen te wijzigen of tabelrechten
uit te breiden. Ze is uitsluitend op wegwerpdatabases getest.

Een toekomstige beperkte praktijkproef vereist eerst beoordeling/merge, controle van
de Cloud-migratievolgorde, expliciet akkoord op migratie/uitrol en daarna afzonderlijk
akkoord op activering en het lezen van een exact afgesproken Drive-hoofdmap. Controleer
de beoogde beheerders en vertrouwelijkheid van die map vóór activering. Beperk de proef
tot één map met één bestaand dossier en één toegestaan rasterbestand, controleer
herladen/dubbele link/toegang en ontkoppel alleen de tijdens de proef gemaakte verwijzing.
Geen bestanden aanmaken, verplaatsen, hernoemen, delen of verwijderen.

Er is tijdens deze uitvoering geen echte Drive-inhoud opgehaald, geen Cloud-migratie
toegepast, geen koppeling geactiveerd en geen serveruitrol uitgevoerd.

Referenties voor het leescontract:
[Drive files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list)
en [Drive File-resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).
