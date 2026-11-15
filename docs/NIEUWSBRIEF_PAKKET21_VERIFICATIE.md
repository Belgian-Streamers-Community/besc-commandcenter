# Verificatie pakket 21 — uitsluitend lokaal

15 november 2026. Geen echte abonnees, mail, provideractivering of Cloud-wijzigingen.

## Uitgevoerd

| Controle | Resultaat |
| --- | --- |
| Volledige bestaande en nieuwe Command Center-suite | **1.999 / 1.999 geslaagd**, niets overgeslagen. Deze run bevatte 29 nieuwsbriefcontroles. |
| Laatste reviewaanpassing: een laatste redacteur mag zijn eigen wijziging niet goedkeuren | Extra gedragstest toegevoegd; samen met bestaande mail-/sjabloon-/rechtencontroles **74 / 74 geslaagd**, waaronder nu **30 nieuwsbriefcontroles**. |
| TypeScript | `tsc --noEmit` zonder fouten. |
| Next-productiebouw | `next build --webpack` geslaagd met uitsluitend loopback-/fixture-Supabasewaarden; geen echte databaseverbinding of migratie. |
| Eerste bouwpoging | Google Fonts-certificaat niet vertrouwd door de standaard Node-certificaatset. Herhaald met `NODE_OPTIONS=--use-system-ca`; geslaagd, certificaatcontrole bleef aan. Geen fontmock en geen wijziging aan bestaande fonts. |
| Browserproef | Inschrijven → nagebootste bevestigingsmail → expliciete bevestiging → concept → indienen → fictieve tweede beoordelaar → nagebootst verzenden → archief. Zichtbaar gecontroleerd in de lokale browser. |
| Browsergevonden fout | `no-referrer` verhinderde de echte Origin-controle van het formulier. Hersteld naar `strict-origin` en de hele browserketen opnieuw met succes uitgevoerd. Tokens/toegangscodes blijven buiten verwijzers. |
| Procesonderbreking | Afzonderlijk Node-proces gestopt ná duurzaam opslaan van een verzendclaim. Nieuwe instantie leest de claim, herstel maakt hem onzeker, geen tweede verzending en geen openbaar archiefitem. |
| Opslag | Herstart met dezelfde sleutel; verkeerde sleutel, beschadigd bestand en achtergebleven lock stoppen zonder reset. Transactiefout laat vorige staat intact. |
| Afgeschermde bediening | Ontbrekende beheer-cookie, onjuiste Host, vreemde Origin en onjuiste CSRF-token geweigerd. Publiek archief bevat geen adressen, tokens of interne beoordelaars. |
| Codegrenzen | Nieuwe uitvoerbare keten importeert geen Gmail-/Workspace-/Supabase-runtime; geen netwerkfallback. `example.invalid`, loopback en mockprovider verplicht. |

Tijdens de laatste review is ook expliciet getest dat pauzeren van editie-verzending het verwerken van uitschrijfbevestigingsmails niet blokkeert. Een gewijzigde abonneeversie sluit eerdere taken uit, ook na herinschrijving.

## Bewijs buiten Git

Onder de bovenliggende `work/`-map:

- `newsletter-package21-regression-final.log`: volledige suite van 1.999 controles.
- `newsletter-package21-final-targeted.log`: laatste 74 gerichte controles, inclusief de extra redacteurtest.
- `newsletter-package21-typecheck-final.log`: definitieve typecontrole.
- `newsletter-package21-build-systemca.log`: geslaagde Next-bouw.
- `newsletter-package21-evidence/browser-archive.jpg`: zichtbaar eindresultaat van de browserketen, uitsluitend fictieve inhoud.

De twee lokale voorbeeldmappen bevatten alleen versleutelde fixtures. De tijdelijke browserproefserver is na controle gestopt. Toegangscode, sleutel en beheer-cookie worden niet in Git vastgelegd.

## Geen live acceptatie

Deze controles bewijzen het lokale contract. Nog niet bewezen: huidige Cloud-schema/RLS, echte sessies/rollen in deze nieuwe keten, echte Gmail-bezorging of quota, echte tweede beoordelaar en aansluiting van de productiepagina's. Het operationele nieuwsbriefpad is niet vervangen. Zie `NIEUWSBRIEF_PAKKET21_LOKAAL.md` voor de resterende productaansluiting.
