-- LOCAL ONLY: no hosted migration or activation. One fixed review action per grant.
create table private.crm_review_grants(
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references private.crm_connections(id),
 incoming_id uuid not null references private.crm_incoming(id),incoming_revision bigint not null,payload_digest text not null,
 actor_id uuid not null references public.profiles(id),session_id uuid not null,
 entity_type text not null check(entity_type in('community_person','project')),entity_id uuid not null,target_updated_at timestamptz not null,target_digest text not null,
 issued_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,revoked_at timestamptz,
 state text not null default 'ready' check(state in('ready','done','cancelled')),
 check(expires_at>issued_at and expires_at<=issued_at+interval '15 minutes'),
 unique(connection_id,incoming_id,entity_type,entity_id)
);
alter table private.crm_review_grants enable row level security;
revoke all on private.crm_review_grants from public,anon,authenticated,service_role;

create function private.crm_review_binding(c uuid,u uuid,s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.cy_session(x.organization_id,u,s)
 and exists(select 1 from auth.sessions ss where ss.id=s and ss.user_id=u and coalesce((to_jsonb(ss)->>'not_after')::timestamptz,'infinity')>clock_timestamp())
 and exists(select 1 from auth.users au where au.id=u and lower(au.email)=lower(x.owner_email))
 and exists(select 1 from public.profiles p where p.id=u and to_jsonb(p)->>'deleted_at' is null)
 and exists(select 1 from public.organization_members m where m.organization_id=x.organization_id and m.user_id=u and m.status='active' and m.role in('admin','board'))
 and exists(select 1 from private.crm_connection_access a where a.connection_id=x.id and a.user_id=u and a.can_read and not a.can_write and not a.can_approve)
 from private.crm_connections x where x.id=c
$$;
revoke all on function private.crm_review_binding(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.crm_review_validate(g private.crm_review_grants,live boolean) returns void
language plpgsql security definer set search_path='' as $$
declare c private.crm_connections;i private.crm_incoming;t jsonb;email text;
begin
 select * into i from private.crm_incoming where id=g.incoming_id for share;
 select * into c from private.crm_connections where id=g.connection_id for share;
 perform 1 from private.crm_connection_access where connection_id=c.id and user_id=g.actor_id for share;
 perform 1 from public.organization_members where organization_id=c.organization_id and user_id=g.actor_id for share;
 perform 1 from auth.sessions where id=g.session_id and user_id=g.actor_id for share;
 perform 1 from auth.users where id=g.actor_id for share;
 perform 1 from public.profiles where id=g.actor_id for share;
 if not coalesce(private.crm_review_binding(c.id,g.actor_id,g.session_id),false) or g.expires_at<=clock_timestamp() or g.revoked_at is not null
 or c.valid_until<=clock_timestamp() or c.retain_until<=clock_timestamp() or (live and not c.enabled)
 or i.connection_id is distinct from c.id or i.revision is distinct from g.incoming_revision or md5(i.payload::text) is distinct from g.payload_digest
 then raise exception 'review_access_or_revision_denied' using errcode='42501';end if;
 if c.kind='contacts' and g.entity_type='community_person' then
  select to_jsonb(p) into t from public.community_people p where id=g.entity_id and organization_id=c.organization_id and deleted_at is null for update;
  if t is null or (t->>'updated_at')::timestamptz is distinct from g.target_updated_at or md5(t::text) is distinct from g.target_digest then raise exception 'review_target_changed';end if;
  email:=lower(btrim(t->>'email'));
  if i.payload->>'deleted' is distinct from 'false' or email is null or email=''
   or not exists(select 1 from jsonb_array_elements_text(i.payload->'emails') e where lower(btrim(e))=email)
   or exists(select 1 from public.community_people p where p.organization_id=c.organization_id and p.id<>g.entity_id and p.deleted_at is null
     and lower(btrim(p.email)) in(select lower(btrim(e)) from jsonb_array_elements_text(i.payload->'emails') e))
   or exists(select 1 from public.partners p where p.organization_id=c.organization_id and p.deleted_at is null
     and lower(btrim(p.email)) in(select lower(btrim(e)) from jsonb_array_elements_text(i.payload->'emails') e))
   or exists(select 1 from private.crm_contact_points p where p.organization_id=c.organization_id and p.kind='email' and p.person_id is distinct from g.entity_id
     and lower(btrim(p.value)) in(select lower(btrim(e)) from jsonb_array_elements_text(i.payload->'emails') e))
  then raise exception 'review_identity_ambiguous';end if;
  if exists(select 1 from private.crm_contact_decisions where incoming_id=i.id and revision=i.revision) then raise exception 'review_already_decided';end if;
 elsif c.kind='gmail' and g.entity_type='project' then
  select to_jsonb(p) into t from public.projects p where id=g.entity_id and organization_id=c.organization_id and deleted_at is null for update;
  if t is null or (t->>'updated_at')::timestamptz is distinct from g.target_updated_at or md5(t::text) is distinct from g.target_digest then raise exception 'review_target_changed';end if;
  if i.payload->>'thread_id' is null or i.payload->>'thread_id' !~ '^[A-Za-z0-9_-]{1,128}$'
   or exists(select 1 from private.crm_thread_links where connection_id=c.id and thread_id=i.payload->>'thread_id' and entity_type=g.entity_type and entity_id=g.entity_id)
   then raise exception 'review_link_conflict';end if;
 else raise exception 'review_fixed_target_required';end if;
 if g.expires_at<=clock_timestamp() or c.valid_until<=clock_timestamp() or c.retain_until<=clock_timestamp()
 or not coalesce(private.crm_review_binding(c.id,g.actor_id,g.session_id),false) then raise exception 'review_expired_or_revoked';end if;
end $$;
revoke all on function private.crm_review_validate(private.crm_review_grants,boolean) from public,anon,authenticated,service_role;

create function private.crm_review_issue(c_id uuid,u uuid,s uuid,item uuid,rev bigint,target_type text,target uuid,updated timestamptz,expires timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare c private.crm_connections;i private.crm_incoming;g private.crm_review_grants;t timestamptz:=clock_timestamp();target_row jsonb;
begin
 select * into c from private.crm_connections where id=c_id for update;
 select * into i from private.crm_incoming where id=item and connection_id=c_id;
 if c.id is null or i.id is null or c.enabled or not coalesce(private.crm_review_binding(c_id,u,s),false)
 or expires is null or expires<=t or expires>t+interval '15 minutes' or expires>c.valid_until or expires>c.retain_until
 or rev is null or i.revision<>rev or updated is null then raise exception 'review_issue_denied';end if;
 g.connection_id:=c_id;g.incoming_id:=item;g.incoming_revision:=rev;g.payload_digest:=md5(i.payload::text);
 g.actor_id:=u;g.session_id:=s;g.entity_type:=target_type;g.entity_id:=target;g.target_updated_at:=updated;g.expires_at:=expires;
 if target_type='community_person' then select to_jsonb(p) into target_row from public.community_people p where id=target and organization_id=c.organization_id for update;
 elsif target_type='project' then select to_jsonb(p) into target_row from public.projects p where id=target and organization_id=c.organization_id for update;
 else raise exception 'review_fixed_target_required';end if;
 g.target_digest:=md5(target_row::text);
 perform private.crm_review_validate(g,false);
 insert into private.crm_review_grants(connection_id,incoming_id,incoming_revision,payload_digest,actor_id,session_id,entity_type,entity_id,target_updated_at,target_digest,issued_at,expires_at)
 values(c_id,item,rev,g.payload_digest,u,s,target_type,target,updated,g.target_digest,t,expires) returning id into g.id;
 insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c_id,g.id,'review_granted',u);return g.id;
end $$;
revoke all on function private.crm_review_issue(uuid,uuid,uuid,uuid,bigint,text,uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;

create function private.crm_review_owner(o uuid,action text,c_id uuid,g_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s uuid:=nullif(auth.jwt()->>'session_id','')::uuid;g private.crm_review_grants;c private.crm_connections;i private.crm_incoming;
begin
 select * into c from private.crm_connections where id=c_id and organization_id=o;
 if c.id is null or not coalesce(private.crm_review_binding(c_id,u,s),false) then raise exception 'review_access_denied' using errcode='42501';end if;
 if action='list' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'incoming_id',x.incoming_id,'entity_type',x.entity_type,'entity_id',x.entity_id,'state',x.state,'expires_at',x.expires_at,'can_execute',x.state='ready' and x.revoked_at is null and x.expires_at>clock_timestamp() and c.enabled and c.valid_until>clock_timestamp() and c.retain_until>clock_timestamp(),'can_stop',x.revoked_at is null))
   from private.crm_review_grants x where x.connection_id=c.id and x.actor_id=u and x.session_id=s),'[]');
 end if;
 select * into g from private.crm_review_grants where id=g_id and connection_id=c_id and actor_id=u and session_id=s for update;
 if not found then raise exception 'review_access_denied' using errcode='42501';end if;
 if action='stop' then
  if g.revoked_at is null then
   update private.crm_review_grants set revoked_at=clock_timestamp(),state=case when state='done' then 'done' else 'cancelled' end where id=g.id;
   insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c_id,g.id,'review_stopped',u);
  end if;return jsonb_build_object('state',case when g.state='done' then 'done' else 'cancelled' end);
 end if;
 if action<>'execute' then raise exception 'review_action_denied';end if;
 -- A lost success answer is resolved without writing a second decision/link/audit.
 if g.state='done' then return jsonb_build_object('state','done','replayed',true);end if;
 if g.state<>'ready' or not c.enabled then raise exception 'review_not_ready';end if;
 perform private.crm_review_validate(g,true);
 select * into i from private.crm_incoming where id=g.incoming_id;
 if c.kind='contacts' then
  insert into private.crm_contact_decisions(incoming_id,revision,person_id,decision,base,created_by)values(i.id,i.revision,g.entity_id,'linked',i.payload,u);
  insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c_id,i.id,'contact_confirmed_existing',u);
 else
  insert into private.crm_thread_links values(c_id,i.payload->>'thread_id',g.entity_type,g.entity_id,u);
  insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c_id,g.entity_id,'thread_linked',u);
 end if;
 update private.crm_review_grants set state='done' where id=g.id;
 return jsonb_build_object('state','done');
end $$;
revoke all on function private.crm_review_owner(uuid,text,uuid,uuid) from public,anon,service_role;
grant execute on function private.crm_review_owner(uuid,text,uuid,uuid) to authenticated;
create function public.crm_review_owner(p_org uuid,p_action text,p_connection uuid,p_grant uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.crm_review_owner(p_org,p_action,p_connection,p_grant) $$;
revoke all on function public.crm_review_owner(uuid,text,uuid,uuid) from public,anon,service_role;
grant execute on function public.crm_review_owner(uuid,text,uuid,uuid) to authenticated;
