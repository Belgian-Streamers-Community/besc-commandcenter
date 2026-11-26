import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { requireActiveMembership } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";
import { eventSocialPostChannels, eventSocialPostColumns, eventSocialPostMoment, socialPostMomentLabel, socialPostStatusLabel, socialPostTypeLabel, sortEventSocialPosts, type EventSocialPost } from "@/lib/event-social-posts";

/** Social posts die via Social planning → veld Event aan dit event gekoppeld zijn. */
export async function EventSocialPostsPanel({ eventId }: { eventId: string }) {
  const { supabase, membership } = await requireActiveMembership();
  const canCreate = hasPermission(membership, "manageOrganization");
  const { data, error } = await supabase.from("social_posts")
    .select(eventSocialPostColumns)
    .eq("organization_id", membership.organization_id)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .limit(100);
  const posts = sortEventSocialPosts((data ?? []) as EventSocialPost[]);
  return <section className="form-card" aria-labelledby="event-social-posts-title">
    <div className="form-heading"><div><span className="eyebrow">SOCIAL</span><h2 id="event-social-posts-title">Social posts ({posts.length})</h2></div>{canCreate && <Link className="row-action" href={`/app/events/${eventId}?nieuw=social`}><Plus size={14}/>Social post toevoegen</Link>}</div>
    <div className="dossier-email-list">
      {posts.map((post) => <Link href={`/app/social/${post.id}`} key={post.id}><Megaphone size={15}/><div><strong>{post.title || "Social post zonder titel"}</strong><span>{[eventSocialPostChannels(post).map((channel) => channel.platform).join(", ") || "Nog geen kanalen", socialPostTypeLabel(post.post_type), socialPostMomentLabel(eventSocialPostMoment(post))].filter(Boolean).join(" · ")}</span></div><b className={`email-status ${post.status ?? ""}`}>{socialPostStatusLabel(post.status)}</b></Link>)}
      {error && <p className="error-note">De social posts van dit event konden niet worden geladen. Vernieuw de pagina.</p>}
      {!error && !posts.length && <p className="empty-inline">Nog geen social posts gekoppeld. Koppel een post via het veld Event in Social planning{canCreate ? " of gebruik Social post toevoegen" : ""}.</p>}
    </div>
  </section>;
}
