-- Additive link kinds. No Drive access, row backfill, table grants or RLS changes.
begin;
alter table public.record_links drop constraint record_links_link_type_check;
alter table public.record_links add constraint record_links_link_type_check check (
  link_type in ('reference','publication','briefing','document','website','other','image','folder','application')
);
-- Serialize new references with dossier changes. A browser observation does not
-- authorize attaching a link to a dossier that was archived in the meantime.
create function private.guard_active_extended_dossier_link() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare target_table text; available boolean;
begin
  if new.link_type not in ('image','folder','application') then return new; end if;
  target_table := case new.entity_type
    when 'project' then 'projects' when 'event' then 'events'
    when 'campaign' then 'campaigns' when 'content' then 'content_items'
    when 'partner' then 'partners' when 'community_person' then 'community_people'
    when 'task' then 'tasks' when 'meeting' then 'meetings'
    when 'social_post' then 'social_posts' when 'shop_product' then 'shop_products'
    when 'merch_launch' then 'merch_launches' end;
  if target_table is null then raise exception 'extended_link_dossier_unsupported' using errcode='23514'; end if;
  execute format('select true from public.%I where organization_id=$1 and id=$2 and deleted_at is null for share',target_table)
    into available using new.organization_id,new.entity_id;
  if not coalesce(available,false) then raise exception 'extended_link_dossier_unavailable' using errcode='23514'; end if;
  return new;
end;
$$;
revoke all on function private.guard_active_extended_dossier_link() from public,anon,authenticated;
create trigger a_guard_active_extended_dossier_link before insert or update on public.record_links
for each row execute function private.guard_active_extended_dossier_link();
commit;
