import { operationalModules } from "../app/app/operations/config.ts";
import { formatDateTime } from "./format.ts";

/** Social posts die via het veld Event (social_posts.event_id) aan een event gekoppeld zijn. */
export type EventSocialPost = {
  id: string;
  title: string | null;
  platform: string | null;
  post_type: string | null;
  status: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  publication_url: string | null;
};

export const eventSocialPostColumns = "id,title,platform,post_type,status,scheduled_at,published_at,publication_url";

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
export function sortEventSocialPosts<T extends Pick<EventSocialPost, "scheduled_at" | "published_at" | "title">>(posts: readonly T[]): T[] {
  const moment = (post: T) => {
    const value = post.published_at ?? post.scheduled_at;
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
