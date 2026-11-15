# Pakket 13 — inventaris CRM, Gmail en Google Contacts

15 november 2026. Alleen lokale broncontrole op basis van `acc2f85` en bestaande tests met fictieve gegevens. Er zijn geen mailboxen, contacten, credentials, Cloud-databases of servers benaderd. De aanwezigheid van code en voorbeeldinstellingen bevestigt geen actuele Google-inrichting, verleende OAuth-rechten of live werking.

Het [gezamenlijke ontwerp](Pakket-13-gezamenlijk-ontwerp.md) en de [uitvoerings- en acceptatievolgorde](Pakket-13-uitvoering-en-acceptatie.md) bouwen hierop verder. Alle nieuwe modelnamen en functies in die documenten zijn voorstellen, geen bestaande tabellen of gerealiseerde mogelijkheden.

## Bestaande onderdelen

| Onderdeel | Aanwezig in de applicatie | Bron |
| --- | --- | --- |
| Centrale persoon | `community_people`, contactrollen, intake, profiel, accountkoppeling en dossierverbanden; de contactfiche kan ook zonder account bestaan | `src/lib/community-people.ts`, `src/components/contact-dossier-panels.tsx`, migraties `20261008065014_account_community_contacts.sql` en `20261008070508_contact_account_intake.sql` |
| Externe organisatie | `partners` met onder meer naam, algemeen e-mailadres en opvolging; de route heet nu `/app/sponsors` | `supabase/migrations/20260722100000_add_operational_modules.sql`, `src/app/app/operations/config.ts` |
| Persoon bij organisatie | `partner_contacts`: eigen ID, naam, functie, e-mail, telefoon, primair aanspreekpunt; optionele koppeling naar centrale persoon of bestaand account | `supabase/migrations/20260723100000_deepen_operational_modules.sql`, `20261008070508_contact_account_intake.sql` |
| Koppelen zonder toegang | Intake bewaakt organisatie/person/accountbinding; koppeling naar een centrale persoon beheert de accountidentiteit niet opnieuw. UI vermeldt dat koppelen geen toegang geeft | `src/components/partner-contacts-panel.tsx`, `src/app/app/operations/relation-actions.ts` |
| Contactmomenten | `partner_interactions`: contacttype, samenvatting, volgende actie en opvolgdatum; daarnaast `partners.last_contact` en `next_follow_up` | Bovenstaande verdiepingmigratie, `src/components/operational-sections.tsx` |
| Dossierverbanden | `record_relationships` en bestaande relatie-/documentpanelen voor onder meer persoon, partner, project, event, campagne en taak | `src/lib/dossier-relations.ts`, `supabase/migrations/20260803103432_add_record_links_and_relationships.sql` |
| Opvolgtaken | Bestaande taken en verantwoordelijken; geen nieuwe taakmodule nodig om CRM-opvolging te ontwerpen | `src/lib/dossier-relations.ts`, bestaande project- en taakschermen |
| Mailregister en opsteller | `/app/communicatie`, To/Cc/Bcc, sjablonen, dossierkeuze, opvolgdatum en soft-delete | `src/app/app/communicatie/page.tsx`, `actions.ts`, `src/components/communication-composer.tsx` |
| E-mailopslag | `email_communications` bewaart inhoud, ontvangers, dossier, status, auteur, goedkeurder, verzender en Gmail draft/message/thread-ID's | `supabase/migrations/20260730200000_add_email_communications.sql`, `20260803150000_add_email_bcc_addresses.sql`, `20260927100000_allow_project_campaign_email_communications.sql`, `20261001100000_add_email_communication_soft_delete.sql` |
| Bestaande maildossiers | Opsteller ondersteunt partner, event, vergadering, project en campagne; het herbruikbare `EmailCommunicationPanel` accepteert alleen partner/event/vergadering | `src/app/app/communicatie/actions.ts`, `src/components/email-communication-panel.tsx` |
| Gmail schrijven | `saveGmailDraft` maakt of vervangt een concept; `sendGmailDraft` verstuurt een bestaand concept; MIME ondersteunt tekst/HTML en To/Cc/Bcc | `src/lib/google-gmail.ts` |
| Mailgoedkeuring | Aanvragen, goedkeuren, wijzigingen vragen en weigeren bestaan; serveractie verbiedt eigen e-mailgoedkeuring | `src/app/app/goedkeuringen/actions.ts`, `src/lib/approvals.ts` |
| Huidige bevoegdheden | Verzenden gebruikt `isManager` (admin/board); beoordelen gebruikt admin of board met passende finance-approverrol. Maker kan eigen concepten beheren volgens bestaande policies | `src/lib/permissions.ts`, `src/lib/approvals.ts`, oorspronkelijke e-mailmigratie |
| Na verzending | Verzendactie slaat provider-ID's op en voegt bij een partner een contactmoment toe; geen algemene gesprekstijdlijn voor alle dossier-/persoonstypen | `src/app/app/communicatie/actions.ts` |
| Google Workspace | Bestaande OAuth refresh-tokenflow, token-cache, Drive/Docs/Calendar-voorzieningen; Gmail vraagt `gmail.compose` | `src/lib/google-workspace.ts`, `src/lib/google-gmail.ts` |
| Andere mailprocessen | Nieuwsbrieven en event-slotmails gebruiken bestaande Gmail-hulpfuncties. Dat zijn aparte processen; geen aanleiding om die aan een nieuwe CRM-synchronisatie te koppelen | `src/app/app/nieuwsbrieven/actions.ts`, `tests/event-slot-gmail.test.mts` |
| Websitecontact | F4 heeft een afgeschermde algemene contactaanvraag met eigen behandelaars, beleidsversie en ontvangstnummer; geen automatische mail of nieuwsbriefinschrijving | `docs/f4/Implementatie-contact.md`, `supabase/migrations/20261024063924_f4_general_contact.sql` |
| Doel en toestemming | Bestaande `processing_purposes`, `consent_records` en intrekkingen voor specifieke doelen. De Gmail-verzendactie koppelt hier niet automatisch aan | `supabase/migrations/20261021124318_f1_purpose_consent.sql`, `src/app/app/communicatie/actions.ts` |

`public.organizations` is de BESC-tenant-/beheerorganisatie. Een externe sponsor of andere relatie hoort bij `partners`, niet als nieuwe tenant in `organizations`. Een contactrol zoals vrijwilliger of contact is geen applicatierecht.

## Wat ontbreekt of nog niet bewezen is

| Bevinding | Gevolg voor vervolgwerk |
| --- | --- |
| Geen People API-/Google Contacts-adapter, contactbinding, sync-tokenopslag of vergelijkvenster gevonden in `src`, migraties en documentatie | Pakket 15 is nieuwe integratiebouw, geen activeren van een al aanwezige synchronisatie |
| Geen algemene Gmail `messages.list/get`, `threads.get` of `history.list`-ontvangstketen aangetroffen | Bestaande verzending is geen inbox, archiefimport of beheer van inkomende gesprekken |
| `googleGmailConfiguration().configured` controleert alleen de vorm van het afzenderadres | Dit bewijst geen geldige credential, verzendalias of mailboxidentiteit |
| Gmail gebruikt de bestaande Workspace-refresh-tokenflow; de hulpfunctienaam `delegatedGmailToken` voert geen Workspace domain-wide delegation of impersonatie in | Afzenderconfiguratie bepaalt niet welke mailbox `users/me` werkelijk is |
| Tokenaanvraag met extra scopes verleent op zichzelf geen nieuwe toestemming | Werkelijk consent en eigenaarschap apart bevestigen; geen scopes stil uitbreiden |
| Centrale e-mail (`community_people.email`) en kopieën (`partner_contacts.email`, `partners.email`) kunnen verschillende doelen of waarden hebben | Herkomst en adressoort onderscheiden; geen automatische bulkoverschrijving |
| Mailopsteller vraagt `partner_contacts.name/email` rechtstreeks op, terwijl contactpanelen bij een gekoppelde persoon centrale waarden kunnen tonen | Ontvangerkeuze kan verouderde kopieën gebruiken; pakket 14 moet één resolutieregel toepassen en de gekozen ontvanger vastleggen |
| E-mail bevat één primair dossier en geen expliciete centrale persoons-/contactpuntbinding of mailboxbinding | Nieuwe gesprekskoppelingen ontwerpen naast de bestaande mailfiche; niet op onderwerp of e-mailadres alleen |
| MIME-/draftinvoer heeft geen reply-threadId of `In-Reply-To`/`References` | Antwoorden in hetzelfde Gmail-gesprek zijn nog geen bewezen functie |
| `sendApprovedEmail` leest `approved` en verstuurt vervolgens; geen duurzame exclusieve verzendclaim of inhoudsfingerprint van het actuele Gmail-concept in deze actie | Gelijktijdige verzending en wijzigingen rechtstreeks in Gmail vereisen gerichte reparatie/tests vóór nieuwe verzendbediening |
| Opslag van providerbevestiging, mailstatus en partneropvolging gebeurt in afzonderlijke opdrachten; niet elk teruggegeven opslagresultaat wordt gecontroleerd | Geen garantie op atomaire lokale registratie of veilige hervatting bij verloren antwoorden; pakket 14 krijgt een outbox/ontvangstbewijs |
| Bestaande e-mailtests zijn grotendeels broncodecontroles; contactintaketests voeren ook lokale SQL uit | Groene oude tests bewijzen geen end-to-end veilige verzending of werkende echte Google Contacts-koppeling |

Dit pakket repareert die runtimepunten nog niet. Het brengt ze onder in de afgebakende vervolgbouw. Bestaande gegevens, statussen, rechten, contactrollen, opvolgdatums en goedkeuringen blijven intact.

## Lokale verificatie

37 bestaande tests voor contactintake, account-/persoonbinding, contactpanelen, mailregister, sjablonen, Gmail-annulering en Workspace-hulpfuncties zijn geslaagd. Testbestanden: `contact-intake-db`, `account-community-contacts-db`, `partner-contact-panel`, `partner-contact-intake-action`, `account-contact-action`, `contact-dossier-panels`, `contact-dossier-tabs`, `email-communications`, `email-templates-newsletters`, `event-slot-gmail` en `google-workspace` onder `tests/`.

Geen nieuwe runtimecode, migratie, OAuth-aanmelding, tokenvernieuwing, contactimport of verzending uitgevoerd. Live gegevenskwaliteit en accountconfiguratie zijn in dit pakket niet beoordeeld.
