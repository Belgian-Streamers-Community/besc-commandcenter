-- Social-postfiche per kanaal (stap 3, bevinding B2, 25 november 2026).
-- Additief: per kanaalvariant een afbeeldingslink en één handmatig ingevulde stand van
-- de statistieken. Google Business wordt een toegelaten kanaal. Geen gegevens gewijzigd.

alter table public.social_post_variants drop constraint social_post_variants_platform_check;
alter table public.social_post_variants add constraint social_post_variants_platform_check
  check (platform in ('X','Facebook','Instagram','Threads','LinkedIn','Google Business','TikTok','YouTube','Discord','Twitch','Blogger','Website','Nieuwsbrief'));

alter table public.social_posts drop constraint social_posts_platform_check;
alter table public.social_posts add constraint social_posts_platform_check
  check (platform in ('X','Facebook','Instagram','Threads','LinkedIn','Google Business','TikTok','YouTube','Discord','Twitch','Blogger','Website','Nieuwsbrief'));

alter table public.social_post_variants
  add column image_url text check (image_url is null or (char_length(image_url) <= 2000 and image_url ~ '^https?://[^[:space:]]+$')),
  add column stat_reach integer check (stat_reach is null or stat_reach >= 0),
  add column stat_views integer check (stat_views is null or stat_views >= 0),
  add column stat_likes integer check (stat_likes is null or stat_likes >= 0),
  add column stat_comments integer check (stat_comments is null or stat_comments >= 0),
  add column stat_shares integer check (stat_shares is null or stat_shares >= 0),
  add column stat_saves integer check (stat_saves is null or stat_saves >= 0),
  add column stat_link_clicks integer check (stat_link_clicks is null or stat_link_clicks >= 0),
  add column stat_video_views integer check (stat_video_views is null or stat_video_views >= 0),
  add column stat_avg_watch_seconds numeric(10,1) check (stat_avg_watch_seconds is null or stat_avg_watch_seconds >= 0),
  add column stat_watch_minutes numeric(12,1) check (stat_watch_minutes is null or stat_watch_minutes >= 0),
  add column stats_measured_at timestamptz;

comment on column public.social_post_variants.image_url is 'Link naar de afbeelding of video voor dit kanaal (Canva, Drive, ...). Geen upload.';
comment on column public.social_post_variants.stats_measured_at is 'Moment waarop de handmatig ingevulde statistieken van dit kanaal zijn afgelezen.';

-- Resultaatvelden (link naar de gepubliceerde post, publicatiemoment, interne notities en
-- statistieken) zijn geen inhoud: invullen na publicatie mag geen nieuwe goedkeuring vragen.
-- Tekst, afbeelding, planning en kanaal blijven goedkeuringsplichtig zoals voorheen.
create or replace function private.guard_social_review_variant()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare parent public.social_posts; org uuid; post uuid; changed boolean;
  result_fields constant text[] := array['status','updated_at','publication_url','published_at','notes',
    'stat_reach','stat_views','stat_likes','stat_comments','stat_shares','stat_saves','stat_link_clicks',
    'stat_video_views','stat_avg_watch_seconds','stat_watch_minutes','stats_measured_at'];
begin
  org := case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  post := case when tg_op='DELETE' then old.social_post_id else new.social_post_id end;
  if tg_op='UPDATE' and (new.id<>old.id or new.organization_id<>old.organization_id or new.social_post_id<>old.social_post_id) then
    raise exception 'social_review_identity_immutable';
  end if;
  select * into parent from public.social_posts where id=post and organization_id=org for update;
  if not found then
    if tg_op='DELETE' then return old; end if;
    raise exception 'social_review_source_unavailable';
  end if;
  if exists(select 1 from public.approval_requests where entity_type='social' and entity_id=post
    and organization_id=org and status='pending') then raise exception 'social_review_pending'; end if;
  changed := true;
  if tg_op='UPDATE' then
    changed := (to_jsonb(new)-result_fields) is distinct from (to_jsonb(old)-result_fields);
    if changed and old.status in ('approved','scheduled','published') then new.status := 'review'; end if;
  end if;
  if tg_op<>'DELETE' and new.status in ('approved','scheduled','published') then
    if changed or parent.status not in ('approved','scheduled','published') then raise exception 'social_review_approval_required'; end if;
  end if;
  if changed then
    update public.social_posts set status=case when status in ('approved','scheduled','published') then 'review' else status end,
      review_version=review_version+1,updated_at=clock_timestamp() where id=post and organization_id=org;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $function$;
