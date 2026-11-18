# C10 — bestaand contact bevestigen en gesprekskoppeling tonen

18 november 2026. Lokaal gebouwd en getest; geen live inrichting, migratie, provideractie, activering of uitrol. De SQL staat uitsluitend in `supabase/local/c10-review.sql`, buiten de migratiemap. Eerdere lokale migratievoorbereiding voor bounded receive is niet gewijzigd.

## Gebruikersgedrag

Een afzonderlijk vrijgegeven eenmalige beoordeling kan één ontvangen contact aan één bestaand community-contact bevestigen, zonder naam, primair adres, privé-adres, telefoon, organisatie, accountbinding, rol of contactpunten te wijzigen. De identiteit moet op een bestaand primair e-mailadres overeenkomen en mag niet dubbelzinnig zijn. Dubbele e-mailwaarden in dezelfde bron veroorzaken geen extra contactpunt. De private bronmomentopname en een nieuw linked-besluit bewaren de herkomst; er worden geen bronwaarden naar een centrale fiche gekopieerd.

Voor Gmail kan dezelfde beperkte route één reeds ontvangen gesprek aan één vooraf gekozen bestaand project koppelen. Er wordt geen bericht opnieuw gelezen. De werkruimte toont bestaande gesprekskoppelingen per mailbox/gesprek met een link naar het doel, ook voor lezers zonder schrijfrecht. Het doel moet in de via de bestaande ingelogde queries toegankelijke dossierlijst voorkomen. Ontbreekt het doel of is het verwijderd/onzichtbaar, dan verschijnt alleen een neutrale melding zonder titel, ID of URL. Een contactbesluit toont op dezelfde manier het bevestigde bestaande contact. Er is geen nieuwe algemene projectmailweergave of openbare record_link.

De koppeling is gesprekgebonden: latere ontvangst van hetzelfde gesprek valt onder dezelfde relatie. Deze verbetering ontvangt geen extra berichten en activeert geen synchronisatie. De bestaande gewone CRM-acties blijven behouden onder hun bestaande schrijfrechten; deze nieuwe route krijgt die rechten niet.

## Rechten en opslag

- Beide appvlaggen moeten true zijn: bestaande `BESC_CRM_COMMUNICATION_ENABLED` en nieuwe `BESC_CRM_REVIEW_ENABLED`. Nieuwe vlag staat in `.env.example` op false en is standaard effectief uit. Bounded receive heeft zijn eigen vlag en hoeft voor beoordeling niet aan.
- Geen algemeen `can_write` of `can_approve`: de nieuwe route vereist expliciet read=true/write=false/approve=false voor de eigen geverifieerde mailboxeigenaar, actieve Admin/Bestuur, actief profiel/lidmaatschap en een geldige vaste sessie.
- Alleen de operator kan `private.crm_review_issue` gebruiken. De app, anon, authenticated en service_role krijgen geen uitgifterecht of directe tabelrechten. De nieuwe private tabel heeft RLS. Openbare eigenaar-RPC is security invoker; de private definer controleert actor, sessie, organisatie en databaserijen.
- Grant vast op verbinding, ontvangst-ID/revisie/payloadmomentopname, type/ID/tijdstempel én volledige momentopname van het doel. Alleen community_person voor Contacts en project voor Gmail zijn in deze beperkte route ondersteund. Uitgifte terwijl de verbinding uit staat, maximaal vijftien minuten en niet na de bestaande verbindingstermijnen. Geen heruitgifte voor dezelfde combinatie na afronden/intrekken.
- Eigenaar kan alleen list/execute/stop uitvoeren; het formulier verstuurt geen bron- of doelkeuze. Bevestigingsvak vereist; onbekende gebruikersvelden geweigerd. Alleen React-transportvelden met `$ACTION_` worden vooraf verwijderd. Geen serviceclient, credentiallezer of providertransport in de actie.
- Bron-/doel-/ACL-/lidmaatschap-/account-/sessierijen worden vergrendeld. Na een wachtende doelvergrendeling worden verval en toegang opnieuw gecontroleerd. Een gewijzigd doel wordt ook zonder gewijzigde updated_at geweigerd.
- Uitvoering, besluit of link, audit en done-status zijn één transactie. Dubbele klik/een verloren antwoord geeft bij herlezing done/replayed zonder extra gegevens of audit. Stop bewaart een afgerond besluit/link en markeert het recht herroepen; onvoltooide beoordeling wordt cancelled. Verval blokkeert uitvoering maar schakelt geen verbinding of appvlag automatisch uit.

Per geslaagde contactbeoordeling: één `crm_contact_decisions`-rij en `contact_confirmed_existing`-event, nul contactpunten/personen. Per geslaagde koppeling: één `crm_thread_links`-rij en `thread_linked`-event, nul projectwijzigingen. Uitgifte/intrekking hebben aparte `review_granted`/`review_stopped`-events. Geen mail, taak, accounttoegang of Google-wijziging.

## Lokale verificatie

De CRM-suite gebruikt een geïsoleerde PGlite-database en fictieve providerantwoorden. De 32 nieuwe SQL-controles zijn daarnaast op een lege lokale PostgreSQL 17.11-fixture uitgevoerd. Acht echte meersessieraces bewijzen dubbele uitvoering, intrekking, ACL-/sessie-intrekking, gewijzigd doel, verval tijdens wachten en gelijktijdige uitgifte. Uitkomsten staan buiten Git in het pakket-25-dossier. De native fixture heeft geen echte mounts/gegevens, alleen een localhost-poort; geen Cloud- of providerverbinding. Alle voor deze ronde gestarte testcontainers zijn gestopt en behouden.

Gerichte schermtests renderen de werkelijke component-/paginabron en toetsen labels, bevestiging, rechten, veilige links, herhaalde weergave, foutafscherming, standaard uit en React-formuliermetadata. Dit is geen echte browseraanmelding, visuele thema-/mobielacceptatie of fysieke herstartproef. TypeScript, gerichte ESLint en diffcontrole behoren tot de oplevercontrole.

## Vervolg

Review en een afzonderlijke migratie-/uitrolvoorbereiding zijn nog nodig voor echte uitvoering. Er is in deze ronde geen nieuwe migratie gemaakt of toegepast en geen commit/push/PR gedaan. Het bestaande toepassingsvoorstel moet vóór een later akkoord opnieuw op bron-/doelrevisies worden gecontroleerd. Grants niet nu uitgeven en geen bredere schrijf-ACL als omweg gebruiken. Na een latere geautoriseerde proef rechten intrekken, verbindingen en vlaggen uit, bewijs behouden.

Technische referenties: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [Next.js forms en transportmetadata](https://nextjs.org/docs/app/guides/forms). Deze documentatie onderbouwt de gebruikte mechanismen; de testresultaten komen uit de lokale uitvoering.
