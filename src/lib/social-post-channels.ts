import type { DossierDraft, DraftRow, EditorRecord } from "./dossier-editor-draft.ts";

// Gedeeld met de editorcatalogus; dit bestand importeert zelf geen catalogus (geen kringverwijzing).
export const socialChannels = ["X", "Facebook", "Instagram", "Threads", "LinkedIn", "Google Business", "TikTok", "YouTube", "Discord", "Twitch"] as const;
export const socialStatFields = ["stat_reach", "stat_views", "stat_likes", "stat_comments", "stat_shares", "stat_saves", "stat_link_clicks", "stat_video_views", "stat_avg_watch_seconds", "stat_watch_minutes"] as const;

export const SOCIAL_VARIANTS = "social_post_variants";
export type SocialChannel = typeof socialChannels[number];

/** Velden die op het kanaaltabblad staan; statistieken hebben een eigen tabblad. */
export const socialChannelFields = ["status", "scheduled_at", "copy", "image_url", "publication_url", "notes"] as const;
export const socialVideoStatFields = ["stat_video_views", "stat_avg_watch_seconds", "stat_watch_minutes"] as const;

/** Indicatieve tekstlimieten per kanaal, alleen als hulp bij het schrijven. */
export const socialTextLimits: Partial<Record<string, number>> = { X: 280, Threads: 500, Instagram: 2200, TikTok: 2200, LinkedIn: 3000, Facebook: 63206, "Google Business": 1500, YouTube: 5000, Discord: 2000, Twitch: 500 };

const order = (platform: unknown) => {
  const index = (socialChannels as readonly string[]).indexOf(String(platform));
  return index < 0 ? socialChannels.length : index;
};

/** Actieve (niet te verwijderen) kanaalrijen in vaste kanaalvolgorde. */
export function activeChannelRows(draft: Pick<DossierDraft, "parts">): DraftRow[] {
  return (draft.parts[SOCIAL_VARIANTS] ?? []).filter((row) => !row.deleted).sort((a, b) => order(a.values.platform) - order(b.values.platform));
}

export function channelTabId(row: Pick<DraftRow, "localId">) {
  return `kanaal-${row.localId}`;
}

/**
 * Zet een kanaal aan of uit. Uitzetten markeert de rij voor verwijdering (een nog niet
 * opgeslagen rij verdwijnt bij opslaan vanzelf); opnieuw aanzetten herstelt dezelfde rij,
 * zodat tekst en statistieken niet verloren gaan zolang er niet is opgeslagen.
 */
export function toggleSocialChannel(draft: DossierDraft, platform: string, enabled: boolean, newId: () => string, defaults: EditorRecord = {}): DossierDraft {
  const rows = draft.parts[SOCIAL_VARIANTS] ?? [];
  const existing = rows.find((row) => row.values.platform === platform);
  let next: DraftRow[];
  if (existing) next = rows.map((row) => (row === existing ? { ...row, deleted: !enabled } : row));
  else if (enabled) {
    const id = newId();
    next = [...rows, { localId: id, id, values: { ...defaults, platform, status: draft.values.status ?? defaults.status ?? "idea" }, base: null, deleted: false }];
  } else next = rows;
  return { ...draft, parts: { ...draft.parts, [SOCIAL_VARIANTS]: next } };
}

export function channelHasStats(values: EditorRecord) {
  return socialStatFields.some((field) => values[field] !== null && values[field] !== undefined && values[field] !== "");
}

export function isSocialCustomTab(tabId: string) {
  return tabId === "statistieken" || tabId.startsWith("kanaal-");
}
