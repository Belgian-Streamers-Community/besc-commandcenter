-- Local-only owner display metadata and paginated history. No new tables, grants, transport or activation.
create or replace function private.rs_owner(o uuid,action text,job uuid,data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row private.rs_jobs;account public.social_accounts;target jsonb;c jsonb;session uuid;request uuid;
begin
 session:=nullif(auth.jwt()->>'session_id','')::uuid;
 perform 1 from auth.users where id=auth.uid() for share;
 perform 1 from auth.sessions where id=session and user_id=auth.uid() for share;
 perform 1 from public.organization_members where organization_id=o and user_id=auth.uid() for share;
 perform 1 from public.organization_access_roles where organization_id=o and id=(select access_role_id from public.organization_members where organization_id=o and user_id=auth.uid()) for share;
 if not private.cy_session(o,auth.uid(),session) or not private.si_manager(o,auth.uid()) then raise exception 'inbox_sync_access_denied' using errcode='42501'; end if;
 if action='accounts' then return coalesce((select jsonb_agg(v order by account_name,id) from(
  select id,account_name,platform,external_account_id from public.social_accounts
  where organization_id=o and deleted_at is null and status='connected' and platform in('facebook','instagram') order by account_name,id limit 201)v),'[]');end if;
 if action='list' then
  if nullif(data->>'before','') is not null and not exists(select 1 from private.rs_jobs where id=(data->>'before')::uuid and organization_id=o) then raise exception 'inbox_sync_unavailable';end if;
  return coalesce((select jsonb_agg(v order by created_at desc,id desc) from(
   select id,account_id,kind,state,revision,pages_committed,attempts,reason,available_at,created_at from private.rs_jobs
   where organization_id=o and(nullif(data->>'before','') is null or (created_at,id)<(select created_at,id from private.rs_jobs where id=(data->>'before')::uuid and organization_id=o))
   order by created_at desc,id desc limit 51)v),'[]');
 end if;
 if action='create' then
  target:=data->'target';c:=data->'checkpoint';request:=(data->>'request_id')::uuid;
  if request is null or not private.rs_checkpoint_valid(c) or jsonb_array_length(c->'queue')=0 or jsonb_typeof(target) is distinct from 'object'
   or target->>'organization_id' is distinct from o::text or target->>'kind' not in('direct','comment')
   or target->>'page_id' !~ '^[0-9]{1,64}$' or jsonb_typeof(target->'resources') is distinct from 'array' or jsonb_array_length(target->'resources')>5
   or exists(select 1 from jsonb_array_elements(target->'resources') r where jsonb_typeof(r)<>'string' or r#>>'{}' !~ '^[A-Za-z0-9_.:-]+$' or length(r#>>'{}')>256 or r#>>'{}' in('.','..'))
   or c is distinct from private.rs_initial(target,c->>'api_version')
   or (target-array['organization_id','account_id','platform','external_account_id','page_id','kind','resources'])<>'{}'::jsonb then raise exception 'inbox_sync_invalid_start';end if;
  select * into account from public.social_accounts where id=(target->>'account_id')::uuid and organization_id=o and deleted_at is null and status='connected' for update;
  if not found or account.platform is distinct from target->>'platform' or account.external_account_id is distinct from target->>'external_account_id'
   or account.platform not in('facebook','instagram') or account.platform='facebook' and target->>'page_id'<>account.external_account_id then raise exception 'inbox_sync_account_denied';end if;
  select * into row from private.rs_jobs where organization_id=o and request_id=request;
  if found then if row.target<>target or row.checkpoint->>'api_version'<>c->>'api_version' or row.requested_by<>auth.uid() then raise exception 'inbox_sync_request_conflict';end if;return jsonb_build_object('id',row.id,'state',row.state);end if;
  insert into private.rs_jobs(organization_id,account_id,requested_by,session_id,request_id,target,checkpoint,kind)values(o,account.id,auth.uid(),session,request,target,c,target->>'kind') returning * into row;
  if not private.rs_access(row) then raise exception 'inbox_sync_access_denied';end if;
  insert into private.rs_events(job_id,operation,actor_id)values(row.id,'created',auth.uid());return jsonb_build_object('id',row.id,'state',row.state);
 end if;
 select * into row from private.rs_jobs where id=job and organization_id=o;
 if not found then raise exception 'inbox_sync_unavailable';end if;
 perform 1 from public.social_accounts where id=row.account_id for update;
 select * into row from private.rs_jobs where id=job and organization_id=o for update;
 if action='read' then return jsonb_build_object('id',row.id,'account_id',row.account_id,'selection',row.target,'api_version',row.checkpoint->>'api_version','lease_until',row.lease_until,'observed_at',clock_timestamp(),'state',row.state,'revision',row.revision,'pages_committed',row.pages_committed,'attempts',row.attempts,'reason',row.reason,'available_at',row.available_at,
  'events',coalesce((select jsonb_agg(v order by id) from(select id,operation,reason,actor_id,created_at from private.rs_events where job_id=row.id and (nullif(data->>'events_before','') is null or id<(data->>'events_before')::bigint) order by id desc limit 51)v),'[]'));end if;
 if data->>'revision' is null or (data->>'revision')::bigint<>row.revision then raise exception 'inbox_sync_conflict' using errcode='40001';end if;
 if action='cancel' then
  update private.rs_jobs set state='cancelled',nonce=null,lease_until=null,revision=revision+1,updated_at=clock_timestamp() where id=job;
  insert into private.rs_events(job_id,operation,actor_id)values(job,'cancelled',auth.uid());
 elsif action='restart' then
  if row.state='processing' and row.lease_until>clock_timestamp() then raise exception 'inbox_sync_busy';end if;
  c:=data->'checkpoint';if not private.rs_checkpoint_valid(c) or c is distinct from private.rs_initial(row.target,row.checkpoint->>'api_version') then raise exception 'inbox_sync_invalid_start';end if;
  update private.rs_jobs set checkpoint=c,state='pending',nonce=null,lease_until=null,revision=revision+1,epoch=epoch+1,requested_by=auth.uid(),session_id=session,reason=null,available_at=clock_timestamp(),updated_at=clock_timestamp() where id=job;
  select * into row from private.rs_jobs where id=job;if not private.rs_access(row) then raise exception 'inbox_sync_access_denied';end if;
  insert into private.rs_events(job_id,operation,actor_id)values(job,'restarted',auth.uid());
 else raise exception 'inbox_sync_invalid_action';end if;
 return jsonb_build_object('id',job,'state',(select state from private.rs_jobs where id=job));
end $$;

-- Require the Page messaging permission for Instagram conversations too.
create or replace function private.rs_access(j private.rs_jobs)
returns boolean language sql volatile security definer set search_path='' as $$
 select private.cy_session(j.organization_id,j.requested_by,j.session_id) and private.si_manager(j.organization_id,j.requested_by)
 and exists(select 1 from public.social_accounts a where a.id=j.account_id and a.organization_id=j.organization_id and a.deleted_at is null and a.status='connected'
 and a.platform=j.target->>'platform' and a.external_account_id=j.target->>'external_account_id'
 and a.granted_scopes @> case when j.kind='direct' then case when a.platform='instagram' then array['instagram_basic','instagram_manage_messages','pages_messaging','pages_manage_metadata'] else array['pages_messaging','pages_manage_metadata','pages_read_engagement'] end
 else case when a.platform='instagram' then array['instagram_basic','instagram_manage_comments','pages_read_engagement'] else array['pages_read_engagement','pages_read_user_content'] end end)
$$;
