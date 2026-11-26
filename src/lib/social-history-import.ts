import { z } from "zod";

/** Bestandsformaat voor het importeren van historische social posts (bv. uit Metricool). */
export const SOCIAL_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const SOCIAL_IMPORT_MAX_POSTS = 2000;

const platforms = ["X", "Facebook", "Instagram", "Threads", "LinkedIn", "Google Business", "TikTok", "YouTube", "Discord", "Twitch", "Blogger", "Website", "Nieuwsbrief"] as const;
const statuses = ["idea", "copy_needed", "visual_needed", "review", "approved", "scheduled", "published", "repurpose", "archived"] as const;
const postTypes = ["teaser", "publication", "reminder", "follow_up", "recap", "clip", "story", "carousel", "community", "partner"] as const;
const httpUrl = z.string().max(2000).regex(/^https?:\/\/\S+$/);
const when = z.string().datetime({ offset: true });
const count = z.number().int().min(0).max(2_000_000_000);
const amount = z.number().min(0).max(1e9);

export const socialImportChannelSchema = z.object({
  platform: z.enum(platforms),
  status: z.enum(statuses).default("published"),
  copy: z.string().max(20000).nullish(),
  image_url: httpUrl.nullish(),
  publication_url: httpUrl.nullish(),
  scheduled_at: when.nullish(),
  published_at: when.nullish(),
  notes: z.string().max(4000).nullish(),
  stats: z.object({
    reach: count.nullish(), views: count.nullish(), likes: count.nullish(), comments: count.nullish(), shares: count.nullish(),
    saves: count.nullish(), link_clicks: count.nullish(), video_views: count.nullish(), avg_watch_seconds: amount.nullish(), watch_minutes: amount.nullish(),
  }).strict().nullish(),
  stats_measured_at: when.nullish(),
}).strict();

export const socialImportPostSchema = z.object({
  ref: z.string().regex(/^[a-z]+:[A-Za-z0-9:._-]{1,190}$/),
  title: z.string().trim().min(3).max(180),
  post_type: z.enum(postTypes).default("publication"),
  status: z.enum(statuses).default("published"),
  scheduled_at: when.nullish(),
  published_at: when.nullish(),
  event_id: z.string().uuid().nullish(),
  notes: z.string().max(4000).nullish(),
  channels: z.array(socialImportChannelSchema).max(13).refine((items) => new Set(items.map((item) => item.platform)).size === items.length, "Elk kanaal maar één keer per post"),
}).strict();

export const socialImportFileSchema = z.object({
  format: z.literal("besc-social-history-v1"),
  source: z.string().max(200).optional(),
  posts: z.array(socialImportPostSchema).min(1).max(SOCIAL_IMPORT_MAX_POSTS),
}).passthrough();

export type SocialImportFile = z.infer<typeof socialImportFileSchema>;

export type SocialImportCheck = { ok: true; file: SocialImportFile } | { ok: false; error: string };

/** Leest en controleert het importbestand zonder iets weg te schrijven. */
export function parseSocialImport(text: string): SocialImportCheck {
  if (text.length > SOCIAL_IMPORT_MAX_BYTES) return { ok: false, error: "Het bestand is groter dan 5 MB." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Het bestand is geen geldige JSON." };
  }
  const parsed = socialImportFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Ongeldig importbestand bij ${issue.path.join(".") || "bestand"}: ${issue.message}` };
  }
  const refs = new Set<string>();
  for (const post of parsed.data.posts) {
    if (refs.has(post.ref)) return { ok: false, error: `Dubbele verwijzing in het bestand: ${post.ref}` };
    refs.add(post.ref);
  }
  return { ok: true, file: parsed.data };
}

export function summarizeSocialImport(file: SocialImportFile) {
  const channels: Record<string, number> = {};
  let withStats = 0;
  for (const post of file.posts) for (const channel of post.channels) {
    channels[channel.platform] = (channels[channel.platform] ?? 0) + 1;
    if (channel.stats && Object.values(channel.stats).some((value) => value !== null && value !== undefined)) withStats += 1;
  }
  return { posts: file.posts.length, channels, withStats, linkedToEvent: file.posts.filter((post) => post.event_id).length };
}
