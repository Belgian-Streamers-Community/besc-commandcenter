-- Historiek van social posts importeren (stap 3, 26 november 2026).
-- Eenmalige, afgebakende uitzondering op de goedkeuringsbewaking: alleen rijen die via
-- private.social_history_import worden aangemaakt (eigenaar postgres + sessievlag + import_ref)
-- mogen als gepubliceerde historiek binnenkomen. Een geïmporteerde post die nadien inhoudelijk
-- wijzigt, valt terug naar 'review' en vraagt zoals elke post een goedkeuring.

alter table public.social_posts
  add column import_ref text check (import_ref is null or import_ref ~ '^[a-z]+:[A-Za-z0-9:._-]{1,190}$'),
  add column imported_at timestamptz;
create unique index social_posts_import_ref_idx on public.social_posts(organization_id, import_ref) where import_ref is not null;
comment on column public.social_posts.import_ref is 'Bronverwijzing van een geïmporteerde historische post (bv. metricool:<uuid>). Voorkomt dubbele import.';

create or replace function private.guard_social_review_source()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare changed boolean; snapshot jsonb; importing boolean;
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.approval_requests where entity_type='social' and entity_id=old.id
      and organization_id=old.organization_id and status='pending') then raise exception 'social_review_pending'; end if;
    return old;
  end if;
  importing := tg_op='INSERT' and current_user='postgres' and new.import_ref is not null
    and coalesce(current_setting('besc.social_history_import',true),'')='on';
  if importing then
    new.review_version := 0; new.imported_at := coalesce(new.imported_at, clock_timestamp());
    return new;
  end if;
  if tg_op='INSERT' and (new.import_ref is not null or new.imported_at is not null) then raise exception 'social_import_only_via_import'; end if;
  changed := tg_op='INSERT';
  if tg_op='INSERT' then new.review_version := 0; end if;
  if tg_op='UPDATE' then
    if new.id<>old.id or new.organization_id<>old.organization_id then raise exception 'social_review_identity_immutable'; end if;
    if new.import_ref is distinct from old.import_ref or new.imported_at is distinct from old.imported_at then raise exception 'social_import_ref_immutable'; end if;
    changed := (to_jsonb(new)-array['status','updated_at','review_version']) is distinct from (to_jsonb(old)-array['status','updated_at','review_version']);
    if new.review_version<>old.review_version then
      -- Only the nested variant trigger may explicitly advance the version.
      if pg_trigger_depth()<>2 or new.review_version<>old.review_version+1 or changed then
        raise exception 'social_review_version_immutable';
      end if;
      changed := true;
    end if;
    if changed then new.review_version := old.review_version+1; end if;
    if exists(select 1 from public.approval_requests where entity_type='social' and entity_id=old.id
      and organization_id=old.organization_id and status='pending')
      and (changed or new.status<>'review') then raise exception 'social_review_pending'; end if;
    -- A formerly approved version is historical after an edit.
    if changed and old.status in ('approved','scheduled','published') then new.status := 'review'; end if;
  end if;
  -- Ongewijzigde geïmporteerde historiek blijft gepubliceerd zonder goedkeuringsdossier.
  if tg_op='UPDATE' and new.imported_at is not null and not changed and new.status=old.status then return new; end if;
  if new.status in ('approved','scheduled','published') then
    snapshot := private.social_review_snapshot(new.organization_id,new.id);
    if changed or not exists(select 1 from public.approval_requests a where a.entity_type='social'
      and a.entity_id=new.id and a.organization_id=new.organization_id and a.status='approved'
      and a.source_snapshot=snapshot and a.decided_by is not null and a.decided_by<>a.requested_by
      and not exists(select 1 from public.approval_requests newer where newer.entity_type='social'
        and newer.entity_id=a.entity_id and newer.organization_id=a.organization_id and newer.requested_at>a.requested_at)) then
      raise exception 'social_review_approval_required';
    end if;
  end if;
  return new;
end $function$;

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
  if tg_op='INSERT' and current_user='postgres' and parent.import_ref is not null
    and coalesce(current_setting('besc.social_history_import',true),'')='on' then
    return new;
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

-- Importeert historische posts met hun kanalen. Idempotent op import_ref; elke post in een eigen
-- subtransactie, zodat één foute post de rest niet tegenhoudt. Alleen actieve admin/bestuur.
create function private.social_history_import(p_org uuid, p_actor uuid, p_posts jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; ch jsonb; v_post uuid; v_ref text; v_event uuid; v_created int := 0; v_channels int := 0; v_skipped int := 0;
  v_failed jsonb := '[]'::jsonb; v_total int; v_first text;
begin
  if not exists (select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=p_actor
                 and m.status='active' and m.role in ('admin','board')) then
    raise exception 'social_import_actor_denied';
  end if;
  if jsonb_typeof(p_posts) is distinct from 'array' then raise exception 'social_import_payload_invalid'; end if;
  v_total := jsonb_array_length(p_posts);
  if v_total > 2000 then raise exception 'social_import_too_large'; end if;
  perform set_config('besc.social_history_import','on',true);
  for item in select value from jsonb_array_elements(p_posts) loop
    v_ref := item->>'ref';
    if v_ref is null or v_ref !~ '^[a-z]+:[A-Za-z0-9:._-]{1,190}$' then
      v_failed := v_failed || jsonb_build_object('ref',v_ref,'error','ref_invalid'); continue;
    end if;
    if exists (select 1 from public.social_posts where organization_id=p_org and import_ref=v_ref) then
      v_skipped := v_skipped + 1; continue;
    end if;
    begin
      v_event := null;
      if item ? 'event_id' and nullif(item->>'event_id','') is not null then
        select e.id into v_event from public.events e where e.id=(item->>'event_id')::uuid and e.organization_id=p_org and e.deleted_at is null;
      end if;
      select c->>'platform' into v_first from jsonb_array_elements(coalesce(item->'channels','[]'::jsonb)) c limit 1;
      insert into public.social_posts(organization_id,title,platform,post_type,status,scheduled_at,published_at,event_id,notes,
        owner_id,created_by,import_ref,imported_at)
      values (p_org, left(item->>'title',180), coalesce(v_first,'Discord'), coalesce(item->>'post_type','publication'),
        coalesce(item->>'status','published'), (item->>'scheduled_at')::timestamptz, (item->>'published_at')::timestamptz,
        v_event, item->>'notes', p_actor, p_actor, v_ref, clock_timestamp())
      returning id into v_post;
      for ch in select value from jsonb_array_elements(coalesce(item->'channels','[]'::jsonb)) loop
        insert into public.social_post_variants(organization_id,social_post_id,platform,status,copy,image_url,publication_url,
          scheduled_at,published_at,notes,stat_reach,stat_views,stat_likes,stat_comments,stat_shares,stat_saves,stat_link_clicks,
          stat_video_views,stat_avg_watch_seconds,stat_watch_minutes,stats_measured_at,created_by)
        values (p_org, v_post, ch->>'platform', coalesce(ch->>'status','published'), ch->>'copy', ch->>'image_url', ch->>'publication_url',
          (ch->>'scheduled_at')::timestamptz, (ch->>'published_at')::timestamptz, ch->>'notes',
          (ch->'stats'->>'reach')::integer, (ch->'stats'->>'views')::integer, (ch->'stats'->>'likes')::integer,
          (ch->'stats'->>'comments')::integer, (ch->'stats'->>'shares')::integer, (ch->'stats'->>'saves')::integer,
          (ch->'stats'->>'link_clicks')::integer, (ch->'stats'->>'video_views')::integer,
          (ch->'stats'->>'avg_watch_seconds')::numeric, (ch->'stats'->>'watch_minutes')::numeric,
          (ch->>'stats_measured_at')::timestamptz, p_actor);
        v_channels := v_channels + 1;
      end loop;
      v_created := v_created + 1;
    exception when others then
      v_failed := v_failed || jsonb_build_object('ref',v_ref,'error',left(sqlerrm,200));
    end;
  end loop;
  perform set_config('besc.social_history_import','off',true);
  return jsonb_build_object('total',v_total,'created',v_created,'channels',v_channels,'skipped',v_skipped,'failed',v_failed);
end $$;

create function public.social_history_import(p_org uuid, p_actor uuid, p_posts jsonb)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.social_history_import(p_org, p_actor, p_posts)
$$;

revoke all on function private.social_history_import(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function private.social_history_import(uuid, uuid, jsonb) to service_role;
revoke all on function public.social_history_import(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.social_history_import(uuid, uuid, jsonb) to service_role;
