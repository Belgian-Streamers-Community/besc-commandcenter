-- Nieuwsbrief: verzending per ontvanger met duurzame claim en uitkomst (stap 2, 22 november 2026).
-- Additief: bestaande BCC-verzending blijft werken zolang de applicatievlag
-- BESC_NEWSLETTER_PER_RECIPIENT_ENABLED uit staat. Geen gegevens gewijzigd of verwijderd.

alter table public.newsletters drop constraint newsletters_status_check;
alter table public.newsletters add constraint newsletters_status_check
  check (status in ('draft','pending_approval','changes_requested','approved','sending','attention','sent','rejected','failed'));

create table private.newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  newsletter_id uuid not null references public.newsletters(id) on delete cascade,
  subscriber_id uuid not null references public.mailing_subscribers(id) on delete cascade,
  email text not null check (char_length(email) between 5 and 320),
  state text not null default 'pending'
    check (state in ('pending','claimed','sent','rejected','unknown','skipped')),
  claim_id uuid,
  claimed_at timestamptz,
  outcome_at timestamptz,
  unsubscribe_token_hash text unique check (unsubscribe_token_hash is null or unsubscribe_token_hash ~ '^[0-9a-f]{64}$'),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  created_at timestamptz not null default now(),
  unique (newsletter_id, subscriber_id),
  check (state <> 'claimed' or (claim_id is not null and claimed_at is not null and unsubscribe_token_hash is not null))
);
create unique index newsletter_deliveries_email_idx on private.newsletter_deliveries(newsletter_id, lower(email));
create index newsletter_deliveries_pending_idx on private.newsletter_deliveries(newsletter_id, state, created_at, id);
alter table private.newsletter_deliveries enable row level security;
revoke all on private.newsletter_deliveries from public, anon, authenticated, service_role;

comment on table private.newsletter_deliveries is
  'Eén duurzame verzendtaak per ontvanger. Claim vóór de providerroep; onzekere uitkomst wordt nooit automatisch herhaald.';

-- Bereidt ontvangers voor uit de goedgekeurde snapshot. Alleen ontvangers die nu nog ingeschreven zijn.
-- Idempotent: een tweede oproep voegt niets toe.
create function private.newsletter_delivery_prepare(p_org uuid, p_newsletter uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n public.newsletters; v_count integer;
begin
  select * into n from public.newsletters where id = p_newsletter and organization_id = p_org for update;
  if not found then raise exception 'newsletter_not_found'; end if;
  if n.status = 'sending' then
    select count(*) into v_count from private.newsletter_deliveries where newsletter_id = p_newsletter;
    return v_count;
  end if;
  if n.status <> 'approved' or n.approved_by is null then raise exception 'newsletter_not_approved'; end if;
  if not exists (select 1 from public.mailing_lists l where l.id = n.mailing_list_id and l.organization_id = p_org and l.status = 'active')
    then raise exception 'newsletter_list_inactive'; end if;
  insert into private.newsletter_deliveries(organization_id, newsletter_id, subscriber_id, email)
  select distinct on (lower(s.email)) p_org, p_newsletter, s.id, lower(s.email)
  from public.mailing_subscribers s
  where s.organization_id = p_org and s.mailing_list_id = n.mailing_list_id
    and s.status = 'subscribed' and lower(s.email) = any (n.recipient_snapshot)
  order by lower(s.email), s.created_at, s.id
  on conflict do nothing;
  select count(*) into v_count from private.newsletter_deliveries where newsletter_id = p_newsletter;
  if v_count = 0 then raise exception 'newsletter_no_recipients'; end if;
  if v_count > 100 then raise exception 'newsletter_too_many_recipients'; end if;
  update public.newsletters set status = 'sending', last_error = null, updated_at = now() where id = p_newsletter;
  return v_count;
end $$;

-- Claimt de volgende ontvanger. Controleert vlak vóór verzending opnieuw inschrijving en lijststatus.
-- Weigert zolang er een geclaimde of onzekere taak bestaat (geen parallelle of blinde herhaling).
create function private.newsletter_delivery_claim(p_org uuid, p_newsletter uuid, p_claim uuid, p_token_hash text)
returns table(delivery_id uuid, email text, display_name text)
language plpgsql security definer set search_path = '' as $$
declare d private.newsletter_deliveries; s public.mailing_subscribers; n public.newsletters;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'newsletter_token_invalid'; end if;
  select * into n from public.newsletters where id = p_newsletter and organization_id = p_org for update;
  if not found then raise exception 'newsletter_not_found'; end if;
  if n.status <> 'sending' then raise exception 'newsletter_not_sending'; end if;
  if exists (select 1 from private.newsletter_deliveries x where x.newsletter_id = p_newsletter and x.state in ('claimed','unknown'))
    then raise exception 'newsletter_attention_required'; end if;
  loop
    select * into d from private.newsletter_deliveries x
      where x.newsletter_id = p_newsletter and x.organization_id = p_org and x.state = 'pending'
      order by x.created_at, x.id limit 1 for update;
    if not found then return; end if;
    select * into s from public.mailing_subscribers where id = d.subscriber_id;
    if not found or s.status <> 'subscribed' or lower(s.email) <> d.email
       or not exists (select 1 from public.mailing_lists l where l.id = s.mailing_list_id and l.status = 'active') then
      update private.newsletter_deliveries set state = 'skipped', outcome_at = now(), error_code = 'no_longer_subscribed' where id = d.id;
      continue;
    end if;
    update private.newsletter_deliveries
      set state = 'claimed', claim_id = p_claim, claimed_at = now(), unsubscribe_token_hash = p_token_hash
      where id = d.id;
    delivery_id := d.id; email := d.email; display_name := s.display_name;
    return next; return;
  end loop;
end $$;

-- Legt de provideruitkomst vast voor precies de eigen claim.
create function private.newsletter_delivery_record(p_org uuid, p_delivery uuid, p_claim uuid, p_state text, p_provider_id text, p_error text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_newsletter uuid;
begin
  if p_state not in ('sent','rejected','unknown') then raise exception 'newsletter_state_invalid'; end if;
  update private.newsletter_deliveries
    set state = p_state, outcome_at = now(),
        provider_message_id = case when p_state = 'sent' then left(p_provider_id, 200) else null end,
        error_code = case when p_state = 'sent' then null else left(coalesce(p_error, p_state), 120) end
    where id = p_delivery and organization_id = p_org and state = 'claimed' and claim_id = p_claim
    returning newsletter_id into v_newsletter;
  if v_newsletter is null then raise exception 'newsletter_claim_lost'; end if;
  if p_state = 'unknown' then
    update public.newsletters set status = 'attention', last_error = 'Onzekere verzenduitkomst; niet automatisch herhaald.', updated_at = now()
      where id = v_newsletter;
  end if;
  return p_state;
end $$;

-- Sluit af wanneer er geen open taken meer zijn.
create function private.newsletter_delivery_finish(p_org uuid, p_newsletter uuid, p_actor uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare n public.newsletters;
begin
  select * into n from public.newsletters where id = p_newsletter and organization_id = p_org for update;
  if not found then raise exception 'newsletter_not_found'; end if;
  if exists (select 1 from private.newsletter_deliveries where newsletter_id = p_newsletter and state in ('pending','claimed')) then return n.status; end if;
  if exists (select 1 from private.newsletter_deliveries where newsletter_id = p_newsletter and state = 'unknown') then
    update public.newsletters set status = 'attention', updated_at = now() where id = p_newsletter;
    return 'attention';
  end if;
  if exists (select 1 from private.newsletter_deliveries where newsletter_id = p_newsletter and state = 'sent') then
    update public.newsletters set status = 'sent', sent_by = p_actor, sent_at = coalesce(sent_at, now()), last_error = null, updated_at = now()
      where id = p_newsletter;
    return 'sent';
  end if;
  update public.newsletters set status = 'failed', last_error = 'Geen enkele ontvanger verzonden (afgemeld of geweigerd).', updated_at = now()
    where id = p_newsletter;
  return 'failed';
end $$;

-- Na een onderbreking: achtergebleven claims worden expliciet onzeker, nooit opnieuw verzonden.
create function private.newsletter_delivery_mark_stale(p_org uuid, p_newsletter uuid, p_older_than interval)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update private.newsletter_deliveries set state = 'unknown', outcome_at = now(), error_code = 'interrupted_claim'
    where newsletter_id = p_newsletter and organization_id = p_org and state = 'claimed' and claimed_at < now() - p_older_than;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    update public.newsletters set status = 'attention', last_error = 'Onderbroken verzending; uitkomst onzeker, niet automatisch herhaald.', updated_at = now()
      where id = p_newsletter and organization_id = p_org;
  end if;
  return v_count;
end $$;

-- Overzicht zonder adressen.
create function private.newsletter_delivery_summary(p_org uuid, p_newsletter uuid)
returns table(state text, total bigint)
language sql security definer set search_path = '' stable as $$
  select d.state, count(*) from private.newsletter_deliveries d
  where d.organization_id = p_org and d.newsletter_id = p_newsletter group by d.state
$$;

-- Publieke uitschrijving via de persoonlijke link (RFC 8058 one-click of bevestigingsformulier).
create function public.newsletter_one_click_unsubscribe(p_token_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_subscriber uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  select subscriber_id into v_subscriber from private.newsletter_deliveries
    where unsubscribe_token_hash = p_token_hash and state in ('claimed','sent','unknown');
  if v_subscriber is null then return false; end if;
  update public.mailing_subscribers set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
    where id = v_subscriber and status = 'subscribed';
  return true;
end $$;


-- Eén servertoegang (alleen service_role) met eigen controle dat de actor actief bestuurder/beheerder is.
create function private.newsletter_delivery_server(p_org uuid, p_newsletter uuid, p_actor uuid, p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v jsonb;
begin
  if not exists (select 1 from public.organization_members m where m.organization_id = p_org and m.user_id = p_actor
                 and m.status = 'active' and m.role in ('admin','board')) then
    raise exception 'newsletter_actor_denied';
  end if;
  if p_action = 'prepare' then
    return jsonb_build_object('recipients', private.newsletter_delivery_prepare(p_org, p_newsletter));
  elsif p_action = 'claim' then
    select * into r from private.newsletter_delivery_claim(p_org, p_newsletter, (p_data->>'claim')::uuid, p_data->>'token_hash');
    if not found then return jsonb_build_object('delivery', null); end if;
    return jsonb_build_object('delivery', jsonb_build_object('id', r.delivery_id, 'email', r.email, 'display_name', r.display_name));
  elsif p_action = 'record' then
    return jsonb_build_object('state', private.newsletter_delivery_record(p_org, (p_data->>'delivery')::uuid, (p_data->>'claim')::uuid,
      p_data->>'state', p_data->>'provider_id', p_data->>'error'));
  elsif p_action = 'finish' then
    return jsonb_build_object('status', private.newsletter_delivery_finish(p_org, p_newsletter, p_actor));
  elsif p_action = 'mark_stale' then
    return jsonb_build_object('marked', private.newsletter_delivery_mark_stale(p_org, p_newsletter, interval '10 minutes'));
  elsif p_action = 'summary' then
    select coalesce(jsonb_object_agg(s.state, s.total), '{}'::jsonb) into v from private.newsletter_delivery_summary(p_org, p_newsletter) s;
    return jsonb_build_object('summary', v);
  end if;
  raise exception 'newsletter_action_invalid';
end $$;

create function public.newsletter_delivery_server(p_org uuid, p_newsletter uuid, p_actor uuid, p_action text, p_data jsonb default '{}')
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.newsletter_delivery_server(p_org, p_newsletter, p_actor, p_action, p_data)
$$;

revoke all on function private.newsletter_delivery_prepare(uuid, uuid) from public, anon, authenticated;
revoke all on function private.newsletter_delivery_claim(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.newsletter_delivery_record(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.newsletter_delivery_finish(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.newsletter_delivery_mark_stale(uuid, uuid, interval) from public, anon, authenticated;
revoke all on function private.newsletter_delivery_summary(uuid, uuid) from public, anon, authenticated;
revoke all on function public.newsletter_one_click_unsubscribe(text) from public;
grant execute on function private.newsletter_delivery_prepare(uuid, uuid) to service_role;
grant execute on function private.newsletter_delivery_claim(uuid, uuid, uuid, text) to service_role;
grant execute on function private.newsletter_delivery_record(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function private.newsletter_delivery_finish(uuid, uuid, uuid) to service_role;
grant execute on function private.newsletter_delivery_mark_stale(uuid, uuid, interval) to service_role;
grant execute on function private.newsletter_delivery_summary(uuid, uuid) to service_role;
grant execute on function public.newsletter_one_click_unsubscribe(text) to anon, authenticated, service_role;
revoke all on function private.newsletter_delivery_server(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function private.newsletter_delivery_server(uuid, uuid, uuid, text, jsonb) to service_role;
revoke all on function public.newsletter_delivery_server(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.newsletter_delivery_server(uuid, uuid, uuid, text, jsonb) to service_role;
