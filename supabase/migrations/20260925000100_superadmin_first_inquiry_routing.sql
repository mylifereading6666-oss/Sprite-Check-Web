-- Superadmin-first inquiry routing with general-admin support limited to Sprite manual correction.

alter table public.inquiries
  add column if not exists support_state text not null default 'superadmin_queue',
  add column if not exists assigned_admin_id uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists passed_by uuid references public.profiles(id) on delete set null,
  add column if not exists passed_at timestamptz,
  add column if not exists inquiry_type text not null default 'other';

alter table public.inquiries drop constraint if exists inquiries_support_state_check;
alter table public.inquiries add constraint inquiries_support_state_check
  check (support_state in ('superadmin_queue','superadmin_handling','general_queue','general_handling','answered','closed'));

alter table public.inquiries drop constraint if exists inquiries_inquiry_type_check;
alter table public.inquiries add constraint inquiries_inquiry_type_check
  check (inquiry_type in ('sprite_manual_fix','other'));

create index if not exists inquiries_support_state_idx on public.inquiries(support_state,created_at desc);
create index if not exists inquiries_assigned_admin_idx on public.inquiries(assigned_admin_id,created_at desc);
create index if not exists inquiries_type_idx on public.inquiries(inquiry_type);

create table if not exists public.admin_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.admin_presence enable row level security;
drop policy if exists admin_presence_admin_read on public.admin_presence;
create policy admin_presence_admin_read on public.admin_presence for select using (public.is_admin());
grant select on public.admin_presence to authenticated;

create or replace function public.admin_heartbeat()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id=(select auth.uid()) and role in ('admin','superadmin')
  ) then raise exception 'Admin only'; end if;
  insert into public.admin_presence(user_id,last_seen_at)
  values ((select auth.uid()),now())
  on conflict (user_id) do update set last_seen_at=excluded.last_seen_at;
end;
$$;
revoke execute on function public.admin_heartbeat() from public, anon;
grant execute on function public.admin_heartbeat() to authenticated;

create or replace function public.notify_new_inquiry()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.inquiries set support_state='superadmin_queue' where id=new.id;
  insert into public.notifications(user_id,title,body)
  select p.id,'新しい問い合わせがあります',new.subject
  from public.profiles p where p.role='superadmin';
  return new;
end;
$$;

drop trigger if exists inquiry_superadmin_route on public.inquiries;
create trigger inquiry_superadmin_route
after insert on public.inquiries
for each row execute function public.notify_new_inquiry();

create or replace function public.claim_inquiry(p_inquiry_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare me_role text; q public.inquiries%rowtype; new_state text;
begin
  select role into me_role from public.profiles where id=(select auth.uid());
  if me_role is null or me_role not in ('admin','superadmin') then raise exception 'Admin only'; end if;
  select * into q from public.inquiries where id=p_inquiry_id for update;
  if not found then raise exception 'Inquiry not found'; end if;
  if q.status in ('answered','closed') then raise exception 'Inquiry is already closed'; end if;
  if me_role='superadmin' then
    new_state='superadmin_handling';
  else
    if q.inquiry_type <> 'sprite_manual_fix' then raise exception 'General administrators may handle only Sprite manual-correction inquiries'; end if;
    if q.assigned_admin_id is not null and q.assigned_admin_id <> (select auth.uid()) then raise exception 'Inquiry is assigned to another administrator'; end if;
    if q.support_state not in ('general_queue','general_handling') then raise exception 'This inquiry is waiting for the superadmin'; end if;
    new_state='general_handling';
  end if;
  update public.inquiries set assigned_admin_id=(select auth.uid()),assigned_at=now(),support_state=new_state where id=p_inquiry_id;
  insert into public.audit_logs(actor_id,target_user_id,action,details)
  values((select auth.uid()),q.user_id,'inquiry_claim',jsonb_build_object('inquiry_id',p_inquiry_id,'state',new_state,'inquiry_type',q.inquiry_type));
  return jsonb_build_object('ok',true,'assigned_admin_id',(select auth.uid()),'support_state',new_state);
end;
$$;
revoke execute on function public.claim_inquiry(uuid) from public, anon;
grant execute on function public.claim_inquiry(uuid) to authenticated;

create or replace function public.pass_inquiry_to_admin(p_inquiry_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare me_role text; q public.inquiries%rowtype; target_id uuid;
begin
  select role into me_role from public.profiles where id=(select auth.uid());
  if me_role <> 'superadmin' then raise exception 'Superadmin only'; end if;
  select * into q from public.inquiries where id=p_inquiry_id for update;
  if not found then raise exception 'Inquiry not found'; end if;
  if q.status in ('answered','closed') then raise exception 'Inquiry is already closed'; end if;
  if q.inquiry_type <> 'sprite_manual_fix' then raise exception 'Only Sprite manual-correction inquiries can be passed to a general administrator'; end if;

  select p.id into target_id
  from public.profiles p join public.admin_presence ap on ap.user_id=p.id
  where p.role='admin' and ap.last_seen_at >= now()-interval '2 minutes'
  order by ap.last_seen_at desc limit 1;

  update public.inquiries
  set assigned_admin_id=target_id,assigned_at=case when target_id is null then null else now() end,
      passed_by=(select auth.uid()),passed_at=now(),
      support_state=case when target_id is null then 'general_queue' else 'general_handling' end
  where id=p_inquiry_id;

  if target_id is not null then
    insert into public.notifications(user_id,title,body)
    values(target_id,'精霊の手動修正問い合わせが割り当てられました',q.subject);
  else
    insert into public.notifications(user_id,title,body)
    select p.id,'精霊の手動修正問い合わせが待機しています',q.subject
    from public.profiles p where p.role='admin';
  end if;

  insert into public.audit_logs(actor_id,target_user_id,action,details)
  values((select auth.uid()),q.user_id,'inquiry_pass',jsonb_build_object('inquiry_id',p_inquiry_id,'assigned_admin_id',target_id,'inquiry_type',q.inquiry_type));
  return jsonb_build_object('ok',true,'assigned_admin_id',target_id,'queued',target_id is null);
end;
$$;
revoke execute on function public.pass_inquiry_to_admin(uuid) from public, anon;
grant execute on function public.pass_inquiry_to_admin(uuid) to authenticated;

create or replace function public.admin_correct_sprite_state(
  p_inquiry_id uuid,p_user_id uuid,p_sprite_id text,p_owned boolean,p_master boolean,p_level integer
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare me_role text; q public.inquiries%rowtype;
begin
  select role into me_role from public.profiles where id=(select auth.uid());
  if me_role is null or me_role not in ('admin','superadmin') then raise exception 'Admin only'; end if;
  if p_level < 1 or p_level > 5 then raise exception 'Level must be 1-5'; end if;
  select * into q from public.inquiries where id=p_inquiry_id;
  if not found then raise exception 'Inquiry not found'; end if;
  if q.inquiry_type <> 'sprite_manual_fix' then raise exception 'This inquiry is not a Sprite manual-correction inquiry'; end if;
  if me_role='admin' and (q.assigned_admin_id <> (select auth.uid()) or q.support_state <> 'general_handling') then raise exception 'This inquiry is not assigned to you'; end if;
  if q.user_id <> p_user_id then raise exception 'Target user does not match inquiry'; end if;

  insert into public.sprite_state(user_id,sprite_id,owned,master,level,manual,updated_at)
  values(p_user_id,p_sprite_id,p_owned,p_master,p_level,true,now())
  on conflict(user_id,sprite_id) do update set owned=excluded.owned,master=excluded.master,level=excluded.level,manual=true,updated_at=now();

  insert into public.audit_logs(actor_id,target_user_id,action,details)
  values((select auth.uid()),p_user_id,'sprite_manual_correction',
    jsonb_build_object('inquiry_id',p_inquiry_id,'sprite_id',p_sprite_id,'owned',p_owned,'master',p_master,'level',p_level));
  return jsonb_build_object('ok',true);
end;
$$;
revoke execute on function public.admin_correct_sprite_state(uuid,uuid,text,boolean,boolean,integer) from public, anon;
grant execute on function public.admin_correct_sprite_state(uuid,uuid,text,boolean,boolean,integer) to authenticated;

drop policy if exists sprite_state_self on public.sprite_state;
create policy sprite_state_self on public.sprite_state for select using (
  user_id=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='superadmin')
);
drop policy if exists sprite_state_update_self on public.sprite_state;
create policy sprite_state_update_self on public.sprite_state for update using (
  user_id=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='superadmin')
) with check (
  user_id=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='superadmin')
);
drop policy if exists sprite_state_insert_self on public.sprite_state;
create policy sprite_state_insert_self on public.sprite_state for insert with check (
  user_id=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='superadmin')
);
drop policy if exists sprite_state_delete_self on public.sprite_state;
create policy sprite_state_delete_self on public.sprite_state for delete using (
  user_id=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='superadmin')
);

drop policy if exists inquiries_read on public.inquiries;
create policy inquiries_read on public.inquiries for select using (
  user_id=(select auth.uid())
  or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='superadmin')
  or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'
      and inquiry_type='sprite_manual_fix'
      and (assigned_admin_id=(select auth.uid()) or support_state='general_queue'))
);
drop policy if exists inquiries_update on public.inquiries;
create policy inquiries_update on public.inquiries for update using (
  user_id=(select auth.uid())
  or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='superadmin')
  or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'
      and inquiry_type='sprite_manual_fix' and assigned_admin_id=(select auth.uid()))
);
