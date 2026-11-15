-- Local-first packages 14-15. No backfill, provider call, timer or activation.
create table private.crm_connections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 kind text not null check(kind in('gmail','contacts')),owner_email text not null check(owner_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 subject_id text not null check(length(subject_id) between 1 and 256),enabled boolean not null default false,
 valid_until timestamptz not null,retain_until timestamptz not null,created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),check(retain_until>=valid_until)
);
create table private.crm_connection_access(
 connection_id uuid not null references private.crm_connections(id),user_id uuid not null references public.profiles(id),
 can_read boolean not null default false,can_write boolean not null default false,can_approve boolean not null default false,
 primary key(connection_id,user_id)
);
create table private.crm_runs(
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references private.crm_connections(id),
 requested_by uuid not null references public.profiles(id),session_id uuid not null,request_id uuid not null,
 selection jsonb not null,revision bigint not null default 0,page_token text,finish_token text,
 state text not null default 'ready' check(state in('ready','done','cancelled','attention')),pages integer not null default 0,
 created_at timestamptz not null default clock_timestamp(),unique(connection_id,request_id)
);
create table private.crm_receipts(
 run_id uuid not null references private.crm_runs(id),revision bigint not null,digest text not null,primary key(run_id,revision)
);
create unique index crm_one_ready_run on private.crm_runs(connection_id) where state='ready';
create table private.crm_incoming(
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references private.crm_connections(id),
 external_id text not null check(length(external_id) between 1 and 256),payload jsonb not null check(pg_column_size(payload)<=150000),
 revision bigint not null default 0,created_at timestamptz not null default clock_timestamp(),unique(connection_id,external_id)
);
create table private.crm_contact_points(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 person_id uuid references public.community_people(id),partner_id uuid references public.partners(id),
 kind text not null check(kind in('email','phone')),value text not null check(length(value) between 1 and 320),
 origin_id uuid references private.crm_incoming(id),origin_revision bigint not null default 0,created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),check((person_id is null)<>(partner_id is null)),
 unique nulls not distinct(organization_id,person_id,partner_id,kind,value)
);
create table private.crm_contact_decisions(
 incoming_id uuid not null references private.crm_incoming(id),revision bigint not null,person_id uuid references public.community_people(id),partner_id uuid references public.partners(id),
 decision text not null check(decision in('linked','ignored')),base jsonb not null,created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),primary key(incoming_id,revision)
);
create table private.crm_thread_links(
 connection_id uuid not null references private.crm_connections(id),thread_id text not null,
 entity_type text not null,entity_id uuid not null,created_by uuid not null references public.profiles(id),
 primary key(connection_id,thread_id,entity_type,entity_id)
);
create table private.crm_outbox(
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references private.crm_connections(id),
 email_id uuid not null references public.email_communications(id),approval_id uuid unique references public.approval_requests(id),
 requested_by uuid not null references public.profiles(id),session_id uuid not null,snapshot jsonb not null,
 reply_to uuid references private.crm_incoming(id),state text not null default 'review' check(state in('review','approved','claimed','dispatched','confirmed','blocked','uncertain','cancelled')),
 nonce uuid,receipt jsonb,follow_up_task uuid references public.tasks(id),follow_up_payload jsonb,created_at timestamptz not null default clock_timestamp()
);
create table private.crm_email_bindings(
 email_id uuid primary key references public.email_communications(id),connection_id uuid not null references private.crm_connections(id)
);
create unique index crm_one_open_email on private.crm_outbox(email_id) where state<>'cancelled';
create table private.crm_events(
 id bigint generated always as identity primary key,connection_id uuid not null references private.crm_connections(id),
 object_id uuid not null,operation text not null,actor_id uuid,created_at timestamptz not null default clock_timestamp()
);
do $$ declare t text;begin
 foreach t in array array['crm_connections','crm_connection_access','crm_runs','crm_receipts','crm_incoming','crm_contact_points','crm_contact_decisions','crm_thread_links','crm_outbox','crm_email_bindings','crm_events'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on table private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function private.crm_access(c uuid,u uuid,s uuid,permission text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.cy_session(x.organization_id,u,s) and exists(select 1 from public.organization_members m where m.organization_id=x.organization_id and m.user_id=u and m.status='active' and m.role in('admin','board'))
 and x.enabled and x.valid_until>clock_timestamp() and x.retain_until>clock_timestamp()
 and exists(select 1 from private.crm_connection_access a where a.connection_id=x.id and a.user_id=u and a.can_read
 and case permission when 'read' then true when 'write' then a.can_write when 'approve' then a.can_approve else false end)
 from private.crm_connections x where x.id=c
$$;
revoke all on function private.crm_access(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;

-- Restrictive policies also protect existing mail/detail/search/approval screens.
-- A dossier grant never grants access to a bound mailbox's content or Bcc.
create function private.crm_email_visible(p uuid,o uuid,permission text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.crm_email_bindings where email_id=p)
 or exists(select 1 from private.crm_email_bindings b join private.crm_connections c on c.id=b.connection_id where b.email_id=p and c.organization_id=o and private.crm_access(c.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,permission))
$$;
revoke all on function private.crm_email_visible(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.crm_email_visible(uuid,uuid,text) to authenticated;
create policy crm_mail_read_boundary on public.email_communications as restrictive for select to authenticated using(private.crm_email_visible(id,organization_id,'read'));
create policy crm_mail_write_boundary on public.email_communications as restrictive for update to authenticated using(private.crm_email_visible(id,organization_id,'write')) with check(private.crm_email_visible(id,organization_id,'write'));
create policy crm_approval_boundary on public.approval_requests as restrictive for select to authenticated using(entity_type<>'email' or private.crm_email_visible(entity_id,organization_id,'read'));

create function private.crm_email_snapshot(p uuid,c uuid,reply uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('email',to_jsonb(e)-array['status','approved_by','approved_at','sent_by','sent_at','gmail_message_id','gmail_thread_id','last_error','updated_at'],
 'from',x.owner_email,'subject_id',x.subject_id,'connection_id',x.id,'reply',r.payload)
 from public.email_communications e join private.crm_connections x on x.id=c and x.organization_id=e.organization_id
 left join private.crm_incoming r on r.id=reply and r.connection_id=c
 where e.id=p and e.deleted_at is null and(reply is null or r.id is not null)
$$;
revoke all on function private.crm_email_snapshot(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.crm_entity(o uuid,t text,p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case t
 when 'community_person' then exists(select 1 from public.community_people where organization_id=o and id=p and deleted_at is null)
 when 'partner' then exists(select 1 from public.partners where organization_id=o and id=p and deleted_at is null)
 when 'project' then exists(select 1 from public.projects where organization_id=o and id=p and deleted_at is null)
 when 'event' then exists(select 1 from public.events where organization_id=o and id=p and deleted_at is null)
 when 'meeting' then exists(select 1 from public.meetings where organization_id=o and id=p and deleted_at is null)
 when 'campaign' then exists(select 1 from public.campaigns where organization_id=o and id=p and deleted_at is null)
 else false end
$$;
revoke all on function private.crm_entity(uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.crm_owner(o uuid,action text,object_id uuid,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s uuid:=nullif(auth.jwt()->>'session_id','')::uuid;c private.crm_connections;r private.crm_runs;
incoming private.crm_incoming;j private.crm_outbox;e public.email_communications;answer jsonb;v jsonb;target uuid;aid uuid;latest jsonb;created_person boolean:=false;
begin
 perform 1 from auth.users where id=u for share;perform 1 from auth.sessions where id=s and user_id=u for share;
 perform 1 from public.organization_members where organization_id=o and user_id=u for share;
 if not private.cy_session(o,u,s) or not private.is_org_manager(o) or jsonb_typeof(d) is distinct from 'object' or pg_column_size(d)>30000 then raise exception 'crm_access_denied' using errcode='42501';end if;
 if action='connections' then return coalesce((select jsonb_agg(to_jsonb(x)-'created_by') from private.crm_connections x where x.organization_id=o and private.crm_access(x.id,u,s,'read')),'[]');end if;
 if action='configure' then
  if not private.is_org_admin(o) or d->>'confirmed' is distinct from 'yes' or d->>'kind' not in('gmail','contacts') or (d->>'valid_until')::timestamptz<=clock_timestamp() then raise exception 'crm_configuration_required';end if;
  insert into private.crm_connections(organization_id,kind,owner_email,subject_id,valid_until,retain_until,enabled,created_by)
  values(o,d->>'kind',d->>'owner_email',d->>'subject_id',(d->>'valid_until')::timestamptz,(d->>'retain_until')::timestamptz,true,u) returning * into c;
  insert into private.crm_connection_access values(c.id,u,true,true,true);
  insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,c.id,'configured',u);return jsonb_build_object('id',c.id);
 end if;
 select * into c from private.crm_connections where id=object_id and organization_id=o;
 if not found then raise exception 'crm_unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:'||c.id::text,0));
 perform 1 from private.crm_connections where id=c.id for share;
 if action='disable' then
  if not private.is_org_admin(o) or d->>'confirmed' is distinct from 'yes' then raise exception 'crm_access_denied';end if;
  update private.crm_connections set enabled=false where id=c.id;
  insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,c.id,'disabled',u);return jsonb_build_object('ok',true);
 end if;
 if action='grant' then
  if not private.is_org_admin(o) or not exists(select 1 from public.organization_members where organization_id=o and user_id=(d->>'user_id')::uuid and status='active') then raise exception 'crm_access_denied';end if;
  insert into private.crm_connection_access values(c.id,(d->>'user_id')::uuid,(d->>'read')::boolean,(d->>'write')::boolean,(d->>'approve')::boolean)
  on conflict(connection_id,user_id)do update set can_read=excluded.can_read,can_write=excluded.can_write,can_approve=excluded.can_approve;
  insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,(d->>'user_id')::uuid,'access_changed',u);return jsonb_build_object('ok',true);
 end if;
 if not private.crm_access(c.id,u,s,case when action in('overview','run_read') then 'read' when action='approve' then 'approve' else 'write' end) then raise exception 'crm_access_denied' using errcode='42501';end if;
 if action='overview' then return jsonb_build_object('connection',to_jsonb(c),
 'access',jsonb_build_object('can_write',private.crm_access(c.id,u,s,'write'),'can_approve',private.crm_access(c.id,u,s,'approve') and private.can_review_approval(o,'email')),
 'runs',coalesce((select jsonb_agg(items)from(select id,state,revision,pages,selection,created_at from private.crm_runs where connection_id=c.id order by created_at desc limit 50)items),'[]'),
 'incoming',coalesce((select jsonb_agg(items)from(select i.id,i.external_id,i.payload,i.revision,(select to_jsonb(x) from private.crm_contact_decisions x where x.incoming_id=i.id and x.revision=i.revision) decision,
  (select to_jsonb(x) from private.crm_contact_decisions x where x.incoming_id=i.id and x.decision='linked' order by x.revision desc limit 1) previous_decision
  from private.crm_incoming i where i.connection_id=c.id order by i.created_at desc,i.id limit 100)items),'[]'),
 'outbox',coalesce((select jsonb_agg(to_jsonb(x)-array['nonce','session_id'])from private.crm_outbox x where x.connection_id=c.id),'[]'),
 'points',coalesce((select jsonb_agg(to_jsonb(x))from private.crm_contact_points x where x.organization_id=o),'[]'),
 'links',coalesce((select jsonb_agg(to_jsonb(x))from private.crm_thread_links x where x.connection_id=c.id),'[]'),
 'events',coalesce((select jsonb_agg(items)from(select ev.object_id,ev.operation,ev.actor_id,ev.created_at from private.crm_events ev where ev.connection_id=c.id order by ev.id desc limit 100)items),'[]'));
 end if;
 if action='resume_run' then
  select * into r from private.crm_runs where connection_id=c.id and id=(d->>'run_id')::uuid for update;
  if not found or r.state<>'attention' or r.revision is distinct from(d->>'revision')::bigint or d->>'confirmed' is distinct from 'yes' or r.pages>=100 then raise exception 'crm_cannot_resume';end if;
  update private.crm_runs set state='ready',revision=revision+1,selection=case when c.kind='contacts' then selection||jsonb_build_object('max_pages',least(100,r.pages+3)) else selection end where id=r.id;
  insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,r.id,'resumed',u);return jsonb_build_object('ok',true);
 end if;
 if action='start' then
  v:=d->'selection';
  if (c.kind='gmail' and (jsonb_typeof(v->'thread_ids') is distinct from 'array' or jsonb_array_length(v->'thread_ids') not between 1 and 5 or exists(select 1 from jsonb_array_elements_text(v->'thread_ids')x where x !~ '^[A-Za-z0-9_-]{1,128}$') or v->>'format' not in('metadata','full') or (v-array['thread_ids','format'])<>'{}'))
  or(c.kind='contacts' and(v->>'source' is distinct from 'CONTACT' or jsonb_typeof(v->'max_pages') is distinct from 'number' or (v->>'max_pages')::integer not between 1 and 100 or(v-array['source','max_pages'])<>'{}')) then raise exception 'crm_selection_required';end if;
  insert into private.crm_runs(connection_id,requested_by,session_id,request_id,selection,finish_token)values(c.id,u,s,(d->>'request_id')::uuid,v,
   case when c.kind='contacts' then(select finish_token from private.crm_runs where connection_id=c.id and state='done' and created_at>clock_timestamp()-interval '6 days' order by created_at desc limit 1)end)
  on conflict(connection_id,request_id)do nothing returning * into r;
  if r.id is null then select * into r from private.crm_runs where connection_id=c.id and request_id=(d->>'request_id')::uuid;
   if r.selection is distinct from v or r.requested_by<>u then raise exception 'crm_request_conflict';end if;end if;
  return jsonb_build_object('id',r.id,'revision',r.revision,'state',r.state);
 elsif action in('run_read','cancel_run') then
  select * into r from private.crm_runs where connection_id=c.id and id=(d->>'run_id')::uuid for update;
  if not found then raise exception 'crm_unavailable';end if;
  if action='cancel_run' then
   if r.revision is distinct from (d->>'revision')::bigint or r.state not in('ready','attention') then raise exception 'crm_revision_conflict';end if;
   update private.crm_runs set state='cancelled',revision=revision+1 where id=r.id;
   insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,r.id,'run_cancelled',u);
  end if;return to_jsonb(r)-array['session_id','page_token','finish_token'];
 elsif action in('contact_decide','contact_ignore') then
  if c.kind<>'contacts' then raise exception 'crm_wrong_kind';end if;
  select * into incoming from private.crm_incoming where id=(d->>'incoming_id')::uuid and connection_id=c.id for update;
  if not found or incoming.revision is distinct from (d->>'revision')::bigint then raise exception 'crm_revision_conflict';end if;
  if exists(select 1 from private.crm_contact_decisions where incoming_id=incoming.id and revision=incoming.revision) then raise exception 'crm_already_decided';end if;
  if action='contact_ignore' then
   insert into private.crm_contact_decisions(incoming_id,revision,decision,base,created_by)values(incoming.id,incoming.revision,'ignored',incoming.payload,u);
  else
   target:=nullif(d->>'entity_id','')::uuid;
   if target is null and d->>'create_person'='yes' and d->>'confirmed'='yes' and d->>'entity_type'='community_person' then
    if not exists(select 1 from jsonb_array_elements_text(incoming.payload->'names')x where x=d->>'name') then raise exception 'crm_contact_name_required';end if;
    target:=public.save_community_person_bundle(o,jsonb_build_object('display_name',d->>'name','person_type','external','status','candidate'),array['contact'],null);created_person:=true;
   end if;
   if d->>'confirmed' is distinct from 'yes' or d->>'entity_type' not in('community_person','partner') or not private.crm_entity(o,d->>'entity_type',target) or incoming.payload->>'deleted'='true' then raise exception 'crm_contact_selection_required';end if;
   if d->>'entity_type'='community_person' then select to_jsonb(p) into latest from public.community_people p where id=target and organization_id=o for update;
   else select to_jsonb(p) into latest from public.partners p where id=target and organization_id=o for update;end if;
   if not created_person and latest->>'updated_at' is distinct from d->>'expected_updated_at' then raise exception 'crm_revision_conflict' using errcode='40001';end if;
   if exists(select 1 from private.crm_contact_points p where p.organization_id=o and ((d->>'entity_type'='community_person' and p.person_id=target)or(d->>'entity_type'='partner' and p.partner_id=target)))
    and coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'value',p.value) order by p.id) from private.crm_contact_points p where p.organization_id=o and ((d->>'entity_type'='community_person' and p.person_id=target)or(d->>'entity_type'='partner' and p.partner_id=target))),'[]') is distinct from d->'expected_points' then raise exception 'crm_revision_conflict';end if;
   if jsonb_typeof(d->'points') is distinct from 'array' or jsonb_array_length(d->'points') not between 1 and 10 then raise exception 'crm_contact_selection_required';end if;
   for v in select value from jsonb_array_elements(d->'points')loop
    if v->>'kind' not in('email','phone') or not exists(select 1 from jsonb_array_elements_text(incoming.payload->(case when v->>'kind'='email' then 'emails' else 'phones' end))x where x=v->>'value') then raise exception 'crm_contact_value_required';end if;
    insert into private.crm_contact_points(organization_id,person_id,partner_id,kind,value,origin_id,origin_revision,created_by)
    values(o,case when d->>'entity_type'='community_person' then target end,case when d->>'entity_type'='partner' then target end,v->>'kind',v->>'value',incoming.id,incoming.revision,u)on conflict do nothing;
   end loop;
   insert into private.crm_contact_decisions(incoming_id,revision,person_id,partner_id,decision,base,created_by)
   values(incoming.id,incoming.revision,case when d->>'entity_type'='community_person' then target end,case when d->>'entity_type'='partner' then target end,'linked',incoming.payload,u);
  end if;
  insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,incoming.id,action,u);return jsonb_build_object('ok',true,'entity_id',target);
 elsif action='link_thread' then
  if c.kind<>'gmail' or not private.crm_entity(o,d->>'entity_type',(d->>'entity_id')::uuid) or not exists(select 1 from private.crm_incoming where connection_id=c.id and payload->>'thread_id'=d->>'thread_id') then raise exception 'crm_link_denied';end if;
  insert into private.crm_thread_links values(c.id,d->>'thread_id',d->>'entity_type',(d->>'entity_id')::uuid,u)on conflict do nothing;
  insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,(d->>'entity_id')::uuid,'thread_linked',u);return jsonb_build_object('ok',true);
 elsif action='compose' then
  if c.kind<>'gmail' or d->>'confirmed' is distinct from 'yes' or not private.crm_entity(o,d->>'entity_type',(d->>'entity_id')::uuid) or jsonb_typeof(d->'to') is distinct from 'array' or jsonb_array_length(d->'to') not between 1 and 25 then raise exception 'crm_email_selection_required';end if;
  if exists(select 1 from jsonb_array_elements_text(d->'to')x where x !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'crm_recipient_invalid';end if;
  if jsonb_typeof(coalesce(d->'cc','[]')) is distinct from 'array' or jsonb_typeof(coalesce(d->'bcc','[]')) is distinct from 'array' or jsonb_array_length(coalesce(d->'cc','[]'))>25 or jsonb_array_length(coalesce(d->'bcc','[]'))>25
   or exists(select 1 from jsonb_array_elements_text(coalesce(d->'cc','[]')||coalesce(d->'bcc','[]'))x where x !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'crm_recipient_invalid';end if;
  insert into public.email_communications(organization_id,entity_type,entity_id,communication_type,title,to_addresses,cc_addresses,bcc_addresses,subject,body_text,created_by)
  values(o,d->>'entity_type',(d->>'entity_id')::uuid,case d->>'entity_type' when 'project' then 'project_update' when 'campaign' then 'campaign_update' else 'invitation' end,
   d->>'subject',array(select jsonb_array_elements_text(d->'to')),array(select jsonb_array_elements_text(coalesce(d->'cc','[]'))),array(select jsonb_array_elements_text(coalesce(d->'bcc','[]'))),d->>'subject',d->>'body',u)returning id into target;
  insert into private.crm_email_bindings values(target,c.id);
  insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,target,'composed',u);return jsonb_build_object('id',target);
 elsif action='authorize' then
  if nullif(d->>'run_id','') is not null and not exists(select 1 from private.crm_runs where connection_id=c.id and id=(d->>'run_id')::uuid) then raise exception 'crm_unavailable';end if;
  if nullif(d->>'job_id','') is not null and not exists(select 1 from private.crm_outbox where connection_id=c.id and id=(d->>'job_id')::uuid) then raise exception 'crm_unavailable';end if;
  return jsonb_build_object('ok',true);
 elsif action='freeze' then
  if c.kind<>'gmail' or d->>'confirmed' is distinct from 'yes' then raise exception 'crm_confirmation_required';end if;
  select * into e from public.email_communications where id=(d->>'email_id')::uuid and organization_id=o and deleted_at is null for update;
  if not found or e.status not in('draft','changes_requested','failed') or not private.crm_entity(o,e.entity_type,e.entity_id) then raise exception 'crm_email_unavailable';end if;
  if exists(select 1 from private.crm_email_bindings where email_id=e.id and connection_id<>c.id) then raise exception 'crm_mailbox_mismatch';end if;
  insert into private.crm_email_bindings values(e.id,c.id)on conflict do nothing;
  if nullif(d->>'reply_to','') is not null and not exists(select 1 from private.crm_incoming where id=(d->>'reply_to')::uuid and connection_id=c.id and payload->>'message_id' is not null) then raise exception 'crm_reply_unavailable';end if;
  update public.email_communications set status='pending_approval',approved_by=null,approved_at=null where id=e.id;
  insert into private.crm_outbox(connection_id,email_id,requested_by,session_id,snapshot,reply_to)values(c.id,e.id,u,s,private.crm_email_snapshot(e.id,c.id,nullif(d->>'reply_to','')::uuid),nullif(d->>'reply_to','')::uuid)returning * into j;
  insert into public.approval_requests(organization_id,entity_type,entity_id,title,module,source_href,requested_by,source_snapshot)
  values(o,'email',e.id,e.title,'communication','/app/communicatie/werkruimte',u,j.snapshot)returning id into aid;
  update private.crm_outbox set approval_id=aid where id=j.id;
  insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,j.id,'submitted',u);return jsonb_build_object('id',j.id);
 elsif action='cancel_mail' then
  select * into j from private.crm_outbox where id=(d->>'job_id')::uuid and connection_id=c.id for update;
  if not found or j.requested_by<>u or j.state not in('review','approved','blocked') then raise exception 'crm_cannot_cancel';end if;
  update private.crm_outbox set state='cancelled' where id=j.id;
  update public.approval_requests set status='rejected',decided_by=u,decision_note='Ingetrokken door opsteller',decided_at=clock_timestamp() where id=j.approval_id and status='pending';
  update public.email_communications set status='draft' where id=j.email_id;
  insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,j.id,'cancelled',u);return jsonb_build_object('ok',true);
 elsif action='approve' then
  select * into j from private.crm_outbox where id=(d->>'job_id')::uuid and connection_id=c.id for update;
  if not found or j.state<>'review' or j.requested_by=u or not private.can_review_approval(o,'email') then raise exception 'crm_review_denied';end if;
  update public.approval_requests set status=case when d->>'decision'='approve' then 'approved' else 'rejected' end,decided_by=u,decision_note=coalesce(nullif(d->>'note',''),'Beoordeeld in communicatiewerkruimte'),decided_at=clock_timestamp() where id=j.approval_id and status='pending';
  return jsonb_build_object('ok',true);
 elsif action='follow_up' then
  select * into j from private.crm_outbox where id=(d->>'job_id')::uuid and connection_id=c.id for update;
  if not found or j.state<>'confirmed' or d->>'confirmed' is distinct from 'yes' or length(btrim(d->>'title')) not between 2 and 180 or not exists(select 1 from public.organization_members where organization_id=o and user_id=(d->>'assignee')::uuid and status='active') then raise exception 'crm_follow_up_denied';end if;
  if j.follow_up_task is null then
   insert into public.tasks(organization_id,title,due_at,created_by)values(o,d->>'title',nullif(d->>'due_at','')::timestamptz,u)returning id into target;
   insert into public.task_assignees values(target,(d->>'assignee')::uuid);
   update private.crm_outbox set follow_up_task=target,follow_up_payload=jsonb_build_object('title',d->>'title','assignee',d->>'assignee','due_at',d->>'due_at') where id=j.id;
   insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,j.id,'follow_up_created',u);
  else
   if j.follow_up_payload is distinct from jsonb_build_object('title',d->>'title','assignee',d->>'assignee','due_at',d->>'due_at') then raise exception 'crm_follow_up_conflict';end if;
   target:=j.follow_up_task;
  end if;return jsonb_build_object('id',target);
 end if;raise exception 'crm_operation_denied';
end $$;
revoke all on function private.crm_owner(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.crm_owner(uuid,text,uuid,jsonb) to authenticated;
create function public.crm_communication_owner(p_org uuid,p_action text,p_object uuid default null,p_data jsonb default '{}') returns jsonb language sql volatile security invoker set search_path='' as $$select private.crm_owner(p_org,p_action,p_object,p_data)$$;
revoke all on function public.crm_communication_owner(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_communication_owner(uuid,text,uuid,jsonb) to authenticated;

create function private.crm_review_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare j private.crm_outbox;c private.crm_connections;s uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
 select * into j from private.crm_outbox where approval_id=old.id;
 if not found then return new;end if;
 select * into c from private.crm_connections where id=j.connection_id;
 perform pg_advisory_xact_lock(hashtextextended('crm:'||c.id::text,0));
 if j.state='cancelled' and old.status='pending' and new.status='rejected' and new.decision_note='Ingetrokken door opsteller' and new.decided_by=auth.uid() and j.requested_by=auth.uid() and private.crm_access(c.id,auth.uid(),s,'write') then return new;end if;
 if old.status<>'pending' or j.state<>'review' or (to_jsonb(new)-array['status','decided_by','decision_note','decided_at','updated_at']) is distinct from(to_jsonb(old)-array['status','decided_by','decision_note','decided_at','updated_at'])
 or new.status not in('approved','rejected','changes_requested') or new.decided_by is distinct from auth.uid() or j.requested_by=auth.uid()
 or not private.crm_access(c.id,auth.uid(),s,'approve') or not private.can_review_approval(c.organization_id,'email')
 or j.snapshot is distinct from private.crm_email_snapshot(j.email_id,c.id,j.reply_to) then raise exception 'crm_review_denied';end if;
 update private.crm_outbox set state=case when new.status='approved' then 'approved' else 'cancelled' end where id=j.id;
 insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,j.id,new.status,auth.uid());
 return new;
end $$;
revoke all on function private.crm_review_guard() from public,anon,authenticated,service_role;
create trigger crm_review_guard before update on public.approval_requests for each row execute function private.crm_review_guard();
create function private.crm_email_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare j private.crm_outbox;
begin
 select * into j from private.crm_outbox where email_id=old.id and state<>'cancelled';
 if found then
  if j.state='confirmed' and tg_op='UPDATE' and new.status='sent' and
   (to_jsonb(new)-array['status','gmail_message_id','gmail_thread_id','sent_by','sent_at','last_error','updated_at'])=(to_jsonb(old)-array['status','gmail_message_id','gmail_thread_id','sent_by','sent_at','last_error','updated_at']) then return new;end if;
  if tg_op='DELETE' or (to_jsonb(new)-array['last_error','updated_at']) is distinct from(to_jsonb(old)-array['last_error','updated_at']) then raise exception 'crm_email_frozen';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.crm_email_guard() from public,anon,authenticated,service_role;
create trigger crm_email_guard before update or delete on public.email_communications for each row execute function private.crm_email_guard();

create function private.crm_server(action text,object_id uuid,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.crm_connections;r private.crm_runs;j private.crm_outbox;v jsonb;old_payload jsonb;page_digest text;current_revision bigint;
begin
 if jsonb_typeof(d) is distinct from 'object' or pg_column_size(d)>2000000 then raise exception 'crm_invalid_page';end if;
 if action like 'run_%' then
  select * into r from private.crm_runs where id=object_id;
  if not found then raise exception 'crm_unavailable';end if;
  select * into c from private.crm_connections where id=r.connection_id;
  perform pg_advisory_xact_lock(hashtextextended('crm:'||c.id::text,0));
  select * into r from private.crm_runs where id=object_id for update;
  if not private.crm_access(c.id,r.requested_by,r.session_id,'write') then raise exception 'crm_access_denied';end if;
  if action='run_read' then return jsonb_build_object('run',to_jsonb(r)-'session_id','connection',to_jsonb(c));end if;
  if action='run_attention' then update private.crm_runs set state='attention',revision=revision+1 where id=r.id and state='ready' and revision=(d->>'revision')::bigint;return jsonb_build_object('ok',found);end if;
  if action<>'run_commit' or jsonb_typeof(d->'items') is distinct from 'array' or jsonb_array_length(d->'items')>50 then raise exception 'crm_invalid_page';end if;
  page_digest:=md5(d::text);
  if exists(select 1 from private.crm_receipts where run_id=r.id and revision=(d->>'revision')::bigint and crm_receipts.digest=page_digest) then return jsonb_build_object('state',r.state,'revision',r.revision,'replayed',true);end if;
  if r.state<>'ready' or r.revision is distinct from(d->>'revision')::bigint or r.pages>=(case when c.kind='contacts' then(r.selection->>'max_pages')::integer else 5 end) then raise exception 'crm_revision_conflict' using errcode='40001';end if;
  for v in select value from jsonb_array_elements(d->'items')loop
   if jsonb_typeof(v) is distinct from 'object' or nullif(v->>'external_id','') is null or length(v->>'external_id')>256 or (c.kind='gmail' and (v->>'thread_id' is null or v->>'thread_id' not in(select jsonb_array_elements_text(r.selection->'thread_ids')))) then raise exception 'crm_invalid_item';end if;
   select payload into old_payload from private.crm_incoming where connection_id=c.id and external_id=v->>'external_id';
   if found and old_payload is distinct from v and c.kind='gmail' then
    if (old_payload-array['body','format','has_attachments']) is distinct from(v-array['body','format','has_attachments']) then raise exception 'crm_message_conflict';end if;
    if old_payload->>'format'='full' and v->>'format'='metadata' then v:=old_payload;
    elsif old_payload->>'format'='metadata' and v->>'format'='full' then null;
    else raise exception 'crm_message_conflict';end if;
   end if;
   insert into private.crm_incoming(connection_id,external_id,payload)values(c.id,v->>'external_id',v)
   on conflict(connection_id,external_id)do update set payload=excluded.payload,revision=crm_incoming.revision+1 where crm_incoming.payload is distinct from excluded.payload;
  end loop;
  insert into private.crm_receipts values(r.id,r.revision,page_digest);
  update private.crm_runs set revision=revision+1,pages=pages+1,page_token=nullif(d->>'next_page',''),finish_token=case when nullif(d->>'next_page','') is null then d->>'finish_token' else finish_token end,
   state=case when nullif(d->>'next_page','') is null then 'done' when c.kind='contacts' and pages+1>=(r.selection->>'max_pages')::integer then 'attention' else 'ready' end where id=r.id returning revision into current_revision;
  insert into private.crm_events(connection_id,object_id,operation)values(c.id,r.id,'page_committed');return jsonb_build_object('revision',current_revision);
 end if;
 select * into j from private.crm_outbox where id=object_id;
 if not found then raise exception 'crm_unavailable';end if;
 select * into c from private.crm_connections where id=j.connection_id;
 perform pg_advisory_xact_lock(hashtextextended('crm:'||c.id::text,0));
 select * into j from private.crm_outbox where id=object_id for update;
 if action='mail_status' then return jsonb_build_object('state',j.state,'receipt',j.receipt);end if;
 if not private.crm_access(c.id,j.requested_by,j.session_id,'write') then raise exception 'crm_access_denied';end if;
 if action='mail_read' then return jsonb_build_object('job',to_jsonb(j)-array['nonce','session_id'],'connection',to_jsonb(c));end if;
 if action='mail_claim' then
  if j.state<>'approved' then return jsonb_build_object('state',j.state);end if;
  if j.snapshot is distinct from private.crm_email_snapshot(j.email_id,c.id,j.reply_to) or not exists(select 1 from public.approval_requests a where a.id=j.approval_id and a.status='approved' and a.decided_by<>j.requested_by) then
   update private.crm_outbox set state='blocked' where id=j.id;return jsonb_build_object('state','blocked');end if;
  update private.crm_outbox set state='claimed',nonce=gen_random_uuid() where id=j.id returning * into j;
  insert into private.crm_events(connection_id,object_id,operation)values(c.id,j.id,'claimed');return jsonb_build_object('state',j.state,'nonce',j.nonce);
 end if;
 if j.nonce is null or j.nonce is distinct from nullif(d->>'nonce','')::uuid then raise exception 'crm_claim_required';end if;
 if action='mail_block' and j.state='claimed' then update private.crm_outbox set state='blocked' where id=j.id;
 elsif action='mail_dispatch' and j.state='claimed' then
  if j.snapshot is distinct from private.crm_email_snapshot(j.email_id,c.id,j.reply_to) then raise exception 'crm_source_changed';end if;
  update private.crm_outbox set state='dispatched' where id=j.id;
 elsif action='mail_uncertain' and j.state in('claimed','dispatched') then update private.crm_outbox set state='uncertain' where id=j.id;
 elsif action='mail_complete' and j.state='dispatched' and d->'receipt'->>'id' ~ '^[A-Za-z0-9_-]+$' and d->'receipt'->>'thread_id' ~ '^[A-Za-z0-9_-]+$' then
  update private.crm_outbox set state='confirmed',receipt=d->'receipt' where id=j.id;
  update public.email_communications set status='sent',gmail_message_id=d->'receipt'->>'id',gmail_thread_id=d->'receipt'->>'thread_id',sent_by=j.requested_by,sent_at=clock_timestamp() where id=j.email_id;
  if not found then raise exception 'crm_source_unavailable';end if;
 else raise exception 'crm_transition_denied';end if;
 insert into private.crm_events(connection_id,object_id,operation)values(c.id,j.id,action);return jsonb_build_object('state',(select state from private.crm_outbox where id=j.id));
end $$;
revoke all on function private.crm_server(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.crm_server(text,uuid,jsonb) to service_role;
create function public.crm_communication_server(p_action text,p_object uuid,p_data jsonb default '{}') returns jsonb language sql volatile security invoker set search_path='' as $$select private.crm_server(p_action,p_object,p_data)$$;
revoke all on function public.crm_communication_server(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.crm_communication_server(text,uuid,jsonb) to service_role;
