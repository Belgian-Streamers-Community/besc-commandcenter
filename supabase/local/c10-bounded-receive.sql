-- Local implementation proposal. NOT a migration; loaded only by isolated tests.
-- Provisioning is an operator action, not a right granted to the app or Admin UI.
create table private.crm_bounded_grants(
 id uuid primary key default gen_random_uuid(),run_id uuid not null unique references private.crm_runs(id),
 connection_id uuid not null unique references private.crm_connections(id),actor_id uuid not null references public.profiles(id),session_id uuid not null,
 selection jsonb not null,issued_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 revoked_at timestamptz,nonce uuid,state text not null default 'ready' check(state in('ready','claimed','done','attention','cancelled')),
 digest text,check(expires_at>issued_at and expires_at<=issued_at+interval '15 minutes')
);
alter table private.crm_bounded_grants enable row level security;
revoke all on private.crm_bounded_grants from public,anon,authenticated,service_role;

create function private.crm_bounded_issue(c_id uuid,u uuid,s uuid,target text,expires timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare c private.crm_connections;g uuid;r uuid;sel jsonb;t timestamptz:=clock_timestamp();
begin
 select * into c from private.crm_connections where id=c_id for update;
 if not found or c.enabled or expires<=t or expires>t+interval '15 minutes' or expires>c.valid_until or expires>c.retain_until
 or not private.cy_session(c.organization_id,u,s)
 or not exists(select 1 from auth.sessions ss where ss.id=s and ss.user_id=u and coalesce((to_jsonb(ss)->>'not_after')::timestamptz,'infinity')>t)
 or not exists(select 1 from public.profiles p where p.id=u and to_jsonb(p)->>'deleted_at' is null)
 or not exists(select 1 from auth.users au where au.id=u and lower(au.email)=lower(c.owner_email))
 or not exists(select 1 from public.organization_members m where m.organization_id=c.organization_id and m.user_id=u and m.status='active' and m.role in('admin','board'))
 or not exists(select 1 from private.crm_connection_access a where a.connection_id=c.id and a.user_id=u and a.can_read and not a.can_write and not a.can_approve)
 then raise exception 'bounded_access_denied';end if;
 if (c.kind='contacts' and target !~ '^people/[A-Za-z0-9_-]{1,128}$') or (c.kind='gmail' and target !~ '^[A-Za-z0-9_-]{1,128}$') or target is null then raise exception 'bounded_selection_required';end if;
 -- One fixed selection for this connection's acceptance, across retries/restarts.
 if exists(select 1 from private.crm_bounded_grants where connection_id=c.id)
 or exists(select 1 from private.crm_runs where connection_id=c.id and state in('ready','attention')) then raise exception 'bounded_existing_attempt';end if;
 sel:=jsonb_build_object('kind',c.kind,'external_id',target);
 insert into private.crm_runs(connection_id,requested_by,session_id,request_id,selection) values(c.id,u,s,gen_random_uuid(),jsonb_build_object('bounded',sel)) returning id into r;
 insert into private.crm_bounded_grants(run_id,connection_id,actor_id,session_id,selection,issued_at,expires_at)values(r,c.id,u,s,sel,t,expires)returning id into g;
 insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,g,'bounded_granted',u);return g;
end $$;
revoke all on function private.crm_bounded_issue(uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;

create function private.crm_bounded_access(g private.crm_bounded_grants,live boolean) returns boolean
language sql security definer set search_path='' as $$
 select private.cy_session(c.organization_id,g.actor_id,g.session_id)
 and exists(select 1 from auth.sessions ss where ss.id=g.session_id and ss.user_id=g.actor_id and coalesce((to_jsonb(ss)->>'not_after')::timestamptz,'infinity')>clock_timestamp())
 and exists(select 1 from public.profiles p where p.id=g.actor_id and to_jsonb(p)->>'deleted_at' is null)
 and exists(select 1 from auth.users au where au.id=g.actor_id and lower(au.email)=lower(c.owner_email))
 and exists(select 1 from public.organization_members m where m.organization_id=c.organization_id and m.user_id=g.actor_id and m.status='active' and m.role in('admin','board'))
 and exists(select 1 from private.crm_connection_access a where a.connection_id=c.id and a.user_id=g.actor_id and a.can_read and not a.can_write and not a.can_approve)
 and (not live or (g.revoked_at is null and g.expires_at>clock_timestamp() and c.enabled and c.valid_until>clock_timestamp() and c.retain_until>clock_timestamp()))
 from private.crm_connections c where c.id=g.connection_id
$$;
revoke all on function private.crm_bounded_access(private.crm_bounded_grants,boolean) from public,anon,authenticated,service_role;

create function private.crm_bounded_owner(o uuid,action text,g_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.crm_bounded_grants;c private.crm_connections;n uuid;u uuid:=auth.uid();s uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
 if action='list' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'state',x.state,'expires_at',x.expires_at,'kind',cx.kind,'can_receive',x.state='ready' and private.crm_bounded_access(x,true),'can_stop',x.revoked_at is null))
   from private.crm_bounded_grants x join private.crm_connections cx on cx.id=x.connection_id
   where cx.organization_id=o and x.actor_id=u and x.session_id=s and private.crm_bounded_access(x,false)),'[]');
 end if;
 select x.* into g from private.crm_bounded_grants x join private.crm_connections cx on cx.id=x.connection_id where x.id=g_id and cx.organization_id=o for update of x;
 if not found or g.actor_id is distinct from u or g.session_id is distinct from s or not private.crm_bounded_access(g,false) then raise exception 'bounded_access_denied' using errcode='42501';end if;
 if action='status' then return jsonb_build_object('state',g.state);end if;
 if action='stop' then
  if g.revoked_at is null then
   update private.crm_bounded_grants set state=case when g.state='done' then 'done' else 'cancelled' end,revoked_at=clock_timestamp() where id=g.id;
   update private.crm_runs set state='cancelled',revision=revision+1 where id=g.run_id and g.state<>'done';
   insert into private.crm_events(connection_id,object_id,operation,actor_id)values(g.connection_id,g.id,'bounded_stopped',u);
  end if;return jsonb_build_object('state',case when g.state='done' then 'done' else 'cancelled' end);
 end if;
 if action not in('claim','check') then raise exception 'bounded_action_denied';end if;
 if not private.crm_bounded_access(g,true) then raise exception 'bounded_expired_or_revoked' using errcode='42501';end if;
 if action='check' then
  if g.state<>'claimed' then raise exception 'bounded_not_claimed';end if;return jsonb_build_object('ok',true);
 end if;
 if g.state<>'ready' then return jsonb_build_object('state',g.state);end if;
 n:=gen_random_uuid();
 update private.crm_bounded_grants set state='claimed',nonce=n where id=g.id;
 update private.crm_runs set state='attention',revision=revision+1 where id=g.run_id;
 insert into private.crm_events(connection_id,object_id,operation,actor_id)values(g.connection_id,g.id,'bounded_claimed',u);
 select * into c from private.crm_connections where id=g.connection_id;
 return jsonb_build_object('state','claimed','nonce',n,'connection',to_jsonb(c)-array['created_at','created_by'],'selection',g.selection,'expires_at',g.expires_at);
end $$;
revoke all on function private.crm_bounded_owner(uuid,text,uuid) from public,anon,authenticated,service_role;
create function public.crm_bounded_owner(p_org uuid,p_action text,p_grant uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select private.crm_bounded_owner(p_org,p_action,p_grant)$$;
-- Wrapper owner is the only definer entry; private function remains inaccessible.
alter function public.crm_bounded_owner(uuid,text,uuid) security definer;
revoke all on function public.crm_bounded_owner(uuid,text,uuid) from public,anon,service_role;
grant execute on function public.crm_bounded_owner(uuid,text,uuid) to authenticated;

create function public.crm_bounded_commit(p_grant uuid,p_nonce uuid,p_item jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.crm_bounded_grants;c private.crm_connections;d text;v text;arr jsonb;k text;
begin
 select * into g from private.crm_bounded_grants where id=p_grant for update;
 if not found or g.nonce is distinct from p_nonce or not private.crm_bounded_access(g,true) then raise exception 'bounded_access_denied';end if;
 select * into c from private.crm_connections where id=g.connection_id for share;
 perform 1 from private.crm_connection_access where connection_id=c.id and user_id=g.actor_id for share;
 perform 1 from public.organization_members where organization_id=c.organization_id and user_id=g.actor_id for share;
 perform 1 from auth.sessions where id=g.session_id and user_id=g.actor_id for share;
 perform 1 from auth.users where id=g.actor_id for share;
 perform 1 from public.profiles where id=g.actor_id for share;
 if not private.crm_bounded_access(g,true) then raise exception 'bounded_access_denied';end if;
 d:=md5(p_item::text);
 if g.state='done' and g.digest=d then return jsonb_build_object('state','done','replayed',true);end if;
 if g.state<>'claimed' then raise exception 'bounded_not_claimed';end if;
 if p_item is null or jsonb_typeof(p_item)<>'object' or p_item->>'external_id' is distinct from g.selection->>'external_id' then raise exception 'bounded_invalid_item';end if;
 if c.kind='contacts' then
  if p_item-array['external_id','source_id','etag','deleted','names','emails','phones','organizations']<>'{}' or (select count(*) from jsonb_object_keys(p_item))<>8
   or p_item->'deleted'<>'false' or p_item->'phones'<>'[]' or p_item->'organizations'<>'[]'
   or jsonb_typeof(p_item->'source_id')<>'string' or length(p_item->>'source_id') not between 1 and 256
   or jsonb_typeof(p_item->'etag')<>'string' or length(p_item->>'etag') not between 1 and 512 then raise exception 'bounded_invalid_item';end if;
  foreach k in array array['names','emails'] loop
   arr:=p_item->k;if jsonb_typeof(arr)<>'array' or jsonb_array_length(arr)>10 then raise exception 'bounded_invalid_item';end if;
   for v in select value#>>'{}' from jsonb_array_elements(arr) loop
    if v is null or length(v)>(case when k='names' then 180 else 320 end) or (k='emails' and v !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'bounded_invalid_item';end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(arr) x where jsonb_typeof(x)<>'string') then raise exception 'bounded_invalid_item';end if;
  end loop;
 else
  if p_item-array['external_id','thread_id','message_id','subject','from','to','date','body','has_attachments','format']<>'{}' or (select count(*) from jsonb_object_keys(p_item))<>10
   or p_item->'body'<>'""' or p_item->'format'<>'"metadata"' or p_item->'has_attachments'<>'false'
   or p_item->>'thread_id' !~ '^[A-Za-z0-9_-]{1,128}$'
   or (p_item->'message_id'<>'null' and (jsonb_typeof(p_item->'message_id')<>'string' or p_item->>'message_id' !~ '^<[^<>\r\n[:space:]]{1,250}>$')) then raise exception 'bounded_invalid_item';end if;
  foreach k in array array['thread_id','subject','from','to','date'] loop
   if jsonb_typeof(p_item->k)<>'string' or length(p_item->>k)>(case k when 'subject' then 300 when 'from' then 500 when 'to' then 1000 when 'date' then 100 else 128 end) then raise exception 'bounded_invalid_item';end if;
  end loop;
 end if;
 if exists(select 1 from private.crm_incoming where connection_id=c.id and external_id=p_item->>'external_id') then raise exception 'bounded_existing_item';end if;
 insert into private.crm_incoming(connection_id,external_id,payload)values(c.id,p_item->>'external_id',p_item);
 insert into private.crm_receipts(run_id,revision,digest)select id,revision,d from private.crm_runs where id=g.run_id;
 update private.crm_runs set state='done',pages=1,revision=revision+1 where id=g.run_id;
 update private.crm_bounded_grants set state='done',digest=d where id=g.id;
 insert into private.crm_events(connection_id,object_id,operation,actor_id)values(c.id,g.id,'bounded_received',g.actor_id);
 return jsonb_build_object('state','done');
end $$;
revoke all on function public.crm_bounded_commit(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_bounded_commit(uuid,uuid,jsonb) to service_role;
