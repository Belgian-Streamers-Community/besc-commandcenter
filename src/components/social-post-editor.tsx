"use client";
import type { ReactNode } from "react";
import { defaultEditorValues, type DossierDraft, type DraftRow, type FieldSchema } from "@/lib/dossier-editor-draft";
import { channelHasStats, socialChannelFields, socialChannels, socialStatFields, socialTextLimits, socialVideoStatFields, SOCIAL_VARIANTS, toggleSocialChannel } from "@/lib/social-post-channels";

function safeHttpUrl(value: unknown) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Kanaalkeuze op het tabblad Algemeen: elk aangevinkt kanaal krijgt een eigen tabblad. */
export function SocialChannelPicker({ draft, disabled, onChange }: { draft: DossierDraft; disabled: boolean; onChange: (next: DossierDraft) => void }) {
  const rows = draft.parts[SOCIAL_VARIANTS] ?? [];
  const pendingRemoval = rows.filter((row) => row.deleted && row.base);
  return <section className="dossier-editor-basics social-channel-picker">
    <h3>Kanalen</h3>
    <p className="form-help">Vink de kanalen aan waarop deze post verschijnt. Elk kanaal krijgt een eigen tabblad met tekst, afbeelding en link, en een blok op het tabblad Statistieken.</p>
    <fieldset className="social-channel-options"><legend className="sr-only">Kanalen voor deze post</legend>
      {socialChannels.map((channel) => {
        const row = rows.find((item) => item.values.platform === channel);
        const checked = Boolean(row && !row.deleted);
        return <label className="inline-check" key={channel}><input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => onChange(toggleSocialChannel(draft, channel, event.target.checked, () => crypto.randomUUID(), defaultEditorValues("social", SOCIAL_VARIANTS)))}/>{channel}</label>;
      })}
    </fieldset>
    {rows.filter((row) => !row.deleted && !(socialChannels as readonly string[]).includes(String(row.values.platform))).map((row) => <p className="form-help" key={row.localId}>Bestaand kanaal {String(row.values.platform)} blijft behouden.</p>)}
    {pendingRemoval.length > 0 && <p role="status" className="form-help">Bij opslaan worden de tekst, links en statistieken van {pendingRemoval.map((row) => String(row.values.platform)).join(", ")} verwijderd. Vink opnieuw aan om dat te voorkomen.</p>}
  </section>;
}

/** Eén kanaal: tekst, afbeeldingslink, link naar de post en planning. */
export function SocialChannelPanel({ row, fields, render, onCopy, copyInvalid, disabled }: { row: DraftRow; fields: FieldSchema[]; render: (field: FieldSchema) => ReactNode; onCopy: (value: string | null) => void; copyInvalid: boolean; disabled: boolean }) {
  const platform = String(row.values.platform);
  const byName = new Map(fields.map((field) => [field.name, field]));
  const copy = String(row.values.copy ?? "");
  const limit = socialTextLimits[platform];
  const copyId = `copy-${row.localId}`;
  const image = safeHttpUrl(row.values.image_url), post = safeHttpUrl(row.values.publication_url);
  const pick = (names: readonly string[]) => names.map((name) => byName.get(name)).filter((field): field is FieldSchema => Boolean(field));
  return <section className="dossier-editor-basics social-channel-panel">
    <h3>{platform}</h3>
    <label htmlFor={copyId} className="social-copy-field">Tekst voor {platform}
      <textarea id={copyId} rows={9} disabled={disabled} aria-invalid={copyInvalid || undefined} value={copy} onChange={(event) => onCopy(event.target.value || null)}/>
      <small aria-live="polite">{copy.length} tekens{limit ? ` · richtlijn ${platform}: max. ${limit}` : ""}{limit && copy.length > limit ? " — te lang" : ""}</small>
    </label>
    <div className="dossier-editor-fields">{pick(socialChannelFields.filter((name) => name !== "copy" && name !== "notes")).map(render)}</div>
    {(image || post) && <p className="social-channel-links">{image && <a href={image} target="_blank" rel="noreferrer">Afbeelding openen</a>}{post && <a href={post} target="_blank" rel="noreferrer">Post openen</a>}</p>}
    <div className="dossier-editor-fields">{pick(["notes"]).map(render)}</div>
  </section>;
}

/** Statistieken: per kanaal één handmatig ingevulde stand met afleesmoment. */
export function SocialStatsPanel({ rows, fields, render }: { rows: DraftRow[]; fields: FieldSchema[]; render: (row: DraftRow, field: FieldSchema) => ReactNode }) {
  const byName = new Map(fields.map((field) => [field.name, field]));
  const basic = socialStatFields.filter((name) => !(socialVideoStatFields as readonly string[]).includes(name));
  const pick = (names: readonly string[]) => names.map((name) => byName.get(name)).filter((field): field is FieldSchema => Boolean(field));
  if (!rows.length) return <p className="form-help">Kies eerst de kanalen op het tabblad Algemeen. Daarna kun je hier per kanaal de statistieken invullen.</p>;
  return <>
    <p className="form-help">Vul per kanaal de cijfers in zoals je ze in de app van het kanaal of in Metricool afleest, met het moment van aflezen. Laat onbekende cijfers leeg: leeg is niet hetzelfde als 0.</p>
    {rows.map((row) => <section className="dossier-editor-basics social-stats-panel" key={row.localId}>
      <h3>{String(row.values.platform)}{channelHasStats(row.values) ? "" : " — nog geen cijfers"}</h3>
      <div className="dossier-editor-fields">{pick([...basic, "stats_measured_at"]).map((field) => render(row, field))}</div>
      <details><summary>Video</summary><div className="dossier-editor-fields">{pick(socialVideoStatFields).map((field) => render(row, field))}</div></details>
    </section>)}
  </>;
}

