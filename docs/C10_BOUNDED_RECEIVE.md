# C10 — lokaal begrensde ontvangst

Status: lokaal gebouwd en getest; geen live Google-, database- of serveractie. De gewone CRM-verwerking blijft behouden. Dit is een aparte, standaard uitgeschakelde proefroute voor één contact of één Gmail-bericht. Volledige C10- en ecosysteemacceptatie zijn niet afgetekend.

## Grens en verwerking

- `crm-bounded-receive.ts` vraagt uitsluitend één vooraf vast contact op via `people.get` met CONTACT-bron en alleen bronmetadata, namen en e-mailadressen. Geen lijst, pagina, telefoon of organisatie.
- Gmail gebruikt één vooraf vast message-ID via `messages.get`, `format=metadata` en From/To/Subject/Date/Message-ID. Geen thread, snippet, mailtekst of bijlage. Een partiële respons wordt expliciet gevraagd; afwijkende/multiple responses, onbekende of dubbele headers en verkeerde IDs worden geweigerd.
- Het antwoord wordt geprojecteerd op de bestaande private ontvangstschema's. `body` blijft leeg, `phones` en `organizations` blijven leeg. Bestaande werkruimte en lees-ACL tonen het ontvangen voorstel. Geen automatische toepassing, dossierkoppeling, concept of verzending.
- De provider is geïnjecteerd voor tests. Alleen de aparte serverruntime kan na een bevestigde claim de expliciete credentialbinding lezen en een tijdelijk token vernieuwen. Geen ambient provider, timer, paginering of automatische retry in de kern.

## Tijdelijk recht

`supabase/local/c10-bounded-receive.sql` is de lokale database-implementatie. Het is **geen migratiebestand** en wordt alleen in de geïsoleerde testdatabase geladen. Een latere versie/migratie moet afzonderlijk worden voorbereid, beoordeeld en toegestaan.

De operator kan met `private.crm_bounded_issue` een grant en run vastleggen terwijl de verbinding disabled is. Uitgifte is niet beschikbaar voor authenticated, anon of service_role. Vereist: eigen geverifieerde mailboxidentiteit, actieve sessie/lidmaatschap, Admin/Bestuur, expliciet leesrecht en geen write/approve. De eindtijd ligt maximaal 15 minuten na uitgifte en nooit na de bestaande verbindings-/bewaartermijn. Alleen de operator kan de verbinding vervolgens volgens een apart goedgekeurd plan inschakelen; uitgifte doet dat niet.

De grant is gebonden aan organisatie, account, sessie, verbinding, vaste selectie en run. De geselecteerde resource kan niet door het browserformulier worden veranderd. Een unieke connection-grant en vergrendelde uitgifte voorkomen een tweede selectieronde via een nieuw verzoek-ID; het is bewust een eenmalige acceptatiegrant per verbinding, geen algemene synchronisatiedienst. Ook na annulering komt er niet stilzwijgend een vervangende grant. Een herproef vraagt afzonderlijk ontwerp/besluit, geen verwijdering van de eerste grant.

De gewone read/write/approve-ACL blijft read-only. De eigenaar kan alleen lijst/status lezen, de eigen poging claimen/controleren of het proefrecht intrekken. Toepassen, koppelen, compose, approve, send en grant worden door deze RPC geweigerd. De bestaande algemene Adminbeheerbevoegdheden verdwijnen daardoor niet.

De openbare eigenaar-RPC controleert expliciet JWT-account, sessie, organisatie en databaserijen; hij geeft geen private-tabelrechten. Commit is uitsluitend toegankelijk voor service_role en vereist de opgeslagen eenmalige nonce. Zowel de start als commit controleren geldigheid, eigenaar, verbinding, sessie, profiel en ACL. Relevante rijen zijn tijdens commit vergrendeld; de grant-row serializeert claims/commits/intrekking. JSON-veldnamen, typen, identiteit en veldlengten worden opnieuw in SQL gecontroleerd.

## Onderbreking, opslag en terugval

De claim wordt duurzaam verbruikt vóór credentiallezing/providerwerk. De run staat dan op `attention` totdat opslag wordt bevestigd. Een tweede klik of nieuw proces ziet `claimed` zonder nonce en doet geen netwerkwerk. Bij een onzekere uitkomst wordt alleen status gelezen; geen nieuwe fetch, vervangend item of automatische retry. Zelfs een storing vóór de eerste provideractie maakt deze poging niet opnieuw beschikbaar.

Ontvangstrecord, receipt, run-checkpoint en audit worden in één SQL-transactie vastgelegd. Een identieke commit met dezelfde nonce/payload is idempotent; een ander payload, ander geselecteerd ID of bestaand ontvangstrecord wordt geweigerd. Een bestaande uitgebreidere mail wordt dus niet gewijzigd of overschreven. Ontvangst en gewone synchronisatie gebruiken geen gedeelde selectie-/sync-cursor.

Intrekken markeert de grant revoked en stopt een onvoltooide run. Een voltooide run en ontvangstbewijs blijven voltooid en behouden. Intrekken kan ook na verlopen recht of uitgeschakelde verbinding met de nog geldige eigen sessie/leesbinding; na sessieverlies verzorgt de operator de afscherming. Verlopen rechten blokkeren nieuw werk zonder browser/timer, maar zetten niet zelfstandig de appvlag of verbinding uit.

De latere live terugval blijft: recht intrekken, verbindingen disabled, hoofdschakelaar false, uitsluitend CC-web met de vooraf vastgelegde image heraanmaken, afscherming en gezondheid teruglezen. Geen database-restore of verwijdering als ‘opruiming’. In-flight ontvangen bytes kunnen niet worden teruggedraaid; daarom zijn de vaste aanvraagselectie en de hercontrole vóór opslag beide nodig.

## Schakelaars en schermen

Beide vlaggen moeten expliciet `true` zijn: `BESC_CRM_COMMUNICATION_ENABLED` én `BESC_CRM_BOUNDED_RECEIVE_ENABLED`. `.env.example` bevat uitsluitend false-voorbeelden; geen werkelijke omgeving is aangepast. Met de nieuwe vlag uit doet de bestaande pagina geen nieuwe grant-RPC.

De werkruimte toont alleen grants voor de eigen sessie en het geselecteerde verbindingstype. Alleen een door de database als geldig gemarkeerde ready-grant toont ‘Geselecteerd item eenmaal ontvangen’. Na claim/done/expiry/revoke verdwijnt die knop. Intrekken roept geen provider aan. Als de database-uitbreiding ontbreekt, faalt het paneel gesloten met een veilige melding; het valt niet terug op de brede route.

## Lokaal verifiëren

```powershell
$env:F1_NATIVE_TEST='0'
$testFiles=Get-ChildItem tests/crm-*.test.mts | ForEach-Object { $_.FullName }
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test @testFiles
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

De tests gebruiken een in-memory PGlite-database, echte lokale SQL-functies en uitsluitend fictieve providerantwoorden. Ze controleren beide complete ontvangstketens, bestaande leesweergave, afscherming, tokenruntime, verval/intrekking, misbruik, idempotentie en onderbrekingen. Een bewaarde claimed-row wordt met een nieuwe aanroep gelezen; dit is geen fysieke hostrebootproef. Er is geen native PostgreSQL-meersessierace of echte Google-proef uitgevoerd. Een native concurrency-proef blijft een afzonderlijke latere controle vóór live uitvoering.

## Nog nodig vóór echte acceptatie

Review van code en lokale SQL, omzetting naar een apart toegestane migratie, eventuele toegestane DEV-uitrol, twee veilig gekozen echte IDs en het exact begrensde proefakkoord. Geen grant op DEV aanmaken of functie activeren op basis van dit document. De bestaande grant-/bewaartermijnen worden bij uitvoering opnieuw gecontroleerd, niet verlengd. Herprovisionering van de vluchtige credentialmount na serverreboot blijft een apart beheerpunt. Volledige ecosysteemacceptatie blijft het gekozen vervolg, met afzonderlijke scopes voor de overige echte ketens.
