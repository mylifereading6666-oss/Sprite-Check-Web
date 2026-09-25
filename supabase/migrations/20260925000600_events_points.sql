-- Sprite Check: event participation paid with points
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  application_start_at timestamptz not null,
  application_end_at timestamptz not null,
  event_start_at timestamptz not null,
  event_end_at timestamptz,
  required_points integer not null check (required_points >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (application_end_at > application_start_at),
  check (event_end_at is null or event_end_at >= event_start_at)
);

create table if not exists public.event_participants (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  applied_at timestamptz not null default now(),
  points_paid integer not null check (points_paid >= 0),
  primary key (event_id,user_id)
);

alter table public.events enable row level security;
alter table public.event_participants enable row level security;

drop policy if exists "events_visible" on public.events;
create policy "events_visible" on public.events for select using (auth.uid() is not null);

drop policy if exists "event_participants_self_or_admin" on public.event_participants;
create policy "event_participants_self_or_admin" on public.event_participants
for select using (auth.uid() = user_id or public.is_admin());

create or replace function public.admin_create_event(
  p_name text,
  p_description text,
  p_application_start_at timestamptz,
  p_application_end_at timestamptz,
  p_event_start_at timestamptz,
  p_event_end_at timestamptz default null,
  p_required_points integer default 0
)
returns public.events
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  result public.events;
begin
  if actor is null or not public.is_superadmin() then raise exception 'superadmin only'; end if;
  if trim(coalesce(p_name,''))='' then raise exception 'event name is required'; end if;
  if p_required_points < 0 then raise exception 'invalid points'; end if;
  if p_application_end_at <= p_application_start_at then raise exception 'invalid application period'; end if;
  if p_event_start_at < p_application_end_at then raise exception 'event start must be after application end'; end if;
  if p_event_end_at is not null and p_event_end_at < p_event_start_at then raise exception 'invalid event end'; end if;

  insert into public.events(name,description,application_start_at,application_end_at,event_start_at,event_end_at,required_points,created_by)
  values(trim(p_name),coalesce(p_description,''),p_application_start_at,p_application_end_at,p_event_start_at,p_event_end_at,p_required_points,actor)
  returning * into result;
  return result;
end;
$$;

create or replace function public.admin_delete_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not public.is_superadmin() then raise exception 'superadmin only'; end if;
  delete from public.events where id=p_event_id;
  return found;
end;
$$;

create or replace function public.apply_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  e public.events;
  current_balance integer;
  now_jst timestamptz:=now();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'event not found'; end if;
  if now_jst < e.application_start_at or now_jst > e.application_end_at then
    return jsonb_build_object('ok',false,'reason','application_closed');
  end if;
  if exists(select 1 from public.event_participants where event_id=e.id and user_id=uid) then
    return jsonb_build_object('ok',false,'reason','already_applied');
  end if;

  insert into public.user_points(user_id,balance,total_earned,total_spent)
  values(uid,0,0,0) on conflict do nothing;

  select balance into current_balance from public.user_points where user_id=uid for update;
  if current_balance < e.required_points then
    return jsonb_build_object('ok',false,'reason','insufficient_points','balance',current_balance,'required_points',e.required_points);
  end if;

  update public.user_points
  set balance=balance-e.required_points,total_spent=total_spent+e.required_points,updated_at=now()
  where user_id=uid
  returning balance into current_balance;

  insert into public.point_transactions(user_id,amount,balance_after,reason,source)
  values(uid,-e.required_points,current_balance,'イベント参加申請: '||e.name,'event');

  insert into public.event_participants(event_id,user_id,points_paid)
  values(e.id,uid,e.required_points);

  return jsonb_build_object('ok',true,'balance',current_balance,'required_points',e.required_points);
end;
$$;

grant execute on function public.admin_create_event(text,text,timestamptz,timestamptz,timestamptz,timestamptz,integer) to authenticated;
grant execute on function public.admin_delete_event(uuid) to authenticated;
grant execute on function public.apply_event(uuid) to authenticated;
