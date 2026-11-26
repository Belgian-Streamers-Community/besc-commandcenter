import { operationalModules } from "../app/app/operations/config.ts";
import { formatDateTime } from "./format.ts";

/** Social posts die via het veld Event (social_posts.event_id) aan een event gekoppeld zijn. */
export type EventSocialPostChannel = { platform: string; status: string | null; scheduled_at: string | null; published_at: string | null; publication_url: string | null };
export type EventSocialPost = {
  id: string;
  title: string | null;
  post_type: string | null;
  status: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  social_post_variants?: EventSocialPostChannel[] | null;
};

// Kanalen komen uit de kanaalvarianten; het oude enkelvoudige platformveld wordt niet meer getoond.
export const eventSocialPostColumns = "id,title,post_type,status,scheduled_at,published_at,social_post_variants(platform,status,scheduled_at,published_at,publication_url)";

const channelOrder = ["X", "Facebook", "Instagram", "Threads", "LinkedIn", "Google Business", "TikTok", "YouTube", "Discord", "Twitch"];
export function eventSocialPostChannels(post: Pick<EventSocialPost, "social_post_variants">): EventSocialPostChannel[] {
  const rank = (platform: string) => { const index = channelOrder.indexOf(platform); return index < 0 ? channelOrder.length : index; };
  return [...(post.social_post_variants ?? [])].sort((a, b) => rank(a.platform) - rank(b.platform));
}

/** Vroegste gepubliceerd- of gepland-moment over post en kanalen heen. */
export function eventSocialPostMoment(post: Pick<EventSocialPost, "scheduled_at" | "published_at" | "social_post_variants">): Pick<EventSocialPost, "scheduled_at" | "published_at"> {
  const earliest = (values: (string | null | undefined)[]) => values.filter((value): value is string => Boolean(value) && !Number.isNaN(new Date(String(value)).getTime())).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
  const channels = post.social_post_variants ?? [];
  return { published_at: earliest([post.published_at, ...channels.map((channel) => channel.published_at)]), scheduled_at: earliest([post.scheduled_at, ...channels.map((channel) => channel.scheduled_at)]) };
}

const socialConfig = operationalModules.social as { statuses: Record<string, string>; types: Record<string, string> };

export function socialPostStatusLabel(status?: string | null) {
  return status ? socialConfig.statuses[status] ?? status : "Onbekend";
}

export function socialPostTypeLabel(type?: string | null) {
  return type ? socialConfig.types[type] ?? type : "";
}

export function socialPostMomentLabel(post: Pick<EventSocialPost, "scheduled_at" | "published_at">) {
  if (post.published_at) return `Gepubliceerd ${formatDateTime(post.published_at, "")}`.trim();
  if (post.scheduled_at) return `Gepland ${formatDateTime(post.scheduled_at, "")}`.trim();
  return "Geen publicatiemoment";
}

/** Gepubliceerde en geplande posts chronologisch; posts zonder moment achteraan. */
export function sortEventSocialPosts<T extends Pick<EventSocialPost, "scheduled_at" | "published_at" | "title"> & { social_post_variants?: EventSocialPostChannel[] | null }>(posts: readonly T[]): T[] {
  const moment = (post: T) => {
    const when = eventSocialPostMoment(post);
    const value = when.published_at ?? when.scheduled_at;
    const time = value ? new Date(value).getTime() : Number.NaN;
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
  };
  return [...posts].sort((a, b) => moment(a) - moment(b) || String(a.title ?? "").localeCompare(String(b.title ?? ""), "nl-BE"));
}

export function safePublicationUrl(url?: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
