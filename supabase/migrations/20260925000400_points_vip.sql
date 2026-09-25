-- Sprite Check: free points + VIP management
create table if not exists public.user_points (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  total_earned integer not null default 0 check (total_earned >= 0),
  total_spent integer not null default 0 check (total_spent >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  source text not null default 'system',
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.vip_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default false,
  starts_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.point_daily_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_date date not null,
  amount integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, claim_date)
);

alter table public.user_points enable row level security;
alter table public.point_transactions enable row level security;
alter table public.vip_memberships enable row level security;
alter table public.point_daily_claims enable row level security;

drop policy if exists "user_points_self" on public.user_points;
create policy "user_points_self" on public.user_points
for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "point_transactions_self" on public.point_transactions;
create policy "point_transactions_self" on public.point_transactions
for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "vip_memberships_self" on public.vip_memberships;
create policy "vip_memberships_self" on public.vip_memberships
for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "point_daily_claims_self" on public.point_daily_claims;
create policy "point_daily_claims_self" on public.point_daily_claims
for select using (auth.uid() = user_id or public.is_admin());

create or replace function public.claim_daily_points()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Tokyo')::date;
  amount integer := 50;
  new_balance integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  insert into public.point_daily_claims(user_id, claim_date, amount)
  values(uid, today, amount)
  on conflict do nothing;

  if not found then
    select balance into new_balance from public.user_points where user_id=uid;
    return jsonb_build_object('ok',false,'reason','already_claimed','balance',coalesce(new_balance,0));
  end if;

  insert into public.user_points(user_id,balance,total_earned)
  values(uid,amount,amount)
  on conflict(user_id) do update set
    balance=public.user_points.balance+amount,
    total_earned=public.user_points.total_earned+amount,
    updated_at=now()
  returning balance into new_balance;

  insert into public.point_transactions(user_id,amount,balance_after,reason,source)
  values(uid,amount,new_balance,'毎日の無料ポイント','daily');

  return jsonb_build_object('ok',true,'amount',amount,'balance',new_balance);
end;
$$;

create or replace function public.admin_grant_points(
  p_user_id uuid,
  p_amount integer,
  p_reason text default '管理者によるポイント調整'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  new_balance integer;
begin
  if actor is null or not public.is_superadmin() then
    raise exception 'superadmin only';
  end if;
  if p_amount = 0 then raise exception 'amount cannot be zero'; end if;

  insert into public.user_points(user_id,balance,total_earned,total_spent)
  values(p_user_id,greatest(p_amount,0),greatest(p_amount,0),greatest(-p_amount,0))
  on conflict(user_id) do update set
    balance=greatest(0,public.user_points.balance+p_amount),
    total_earned=public.user_points.total_earned+greatest(p_amount,0),
    total_spent=public.user_points.total_spent+greatest(-p_amount,0),
    updated_at=now()
  returning balance into new_balance;

  insert into public.point_transactions(user_id,amount,balance_after,reason,source,actor_id)
  values(p_user_id,p_amount,new_balance,p_reason,'admin',actor);

  begin
    insert into public.audit_logs(actor_id,target_user_id,action,details)
    values(actor,p_user_id,'point_adjustment',jsonb_build_object('amount',p_amount,'reason',p_reason,'balance_after',new_balance));
  exception when others then null;
  end;

  return jsonb_build_object('ok',true,'balance',new_balance);
end;
$$;

create or replace function public.admin_set_vip(
  p_user_id uuid,
  p_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  start_time timestamptz := now();
  end_time timestamptz;
begin
  if actor is null or not public.is_superadmin() then raise exception 'superadmin only'; end if;
  if p_days < 0 or p_days > 3650 then raise exception 'invalid days'; end if;

  if p_days = 0 then
    update public.vip_memberships set active=false, expires_at=now(), updated_at=now() where user_id=p_user_id;
    return jsonb_build_object('ok',true,'active',false);
  end if;

  end_time := start_time + make_interval(days=>p_days);
  insert into public.vip_memberships(user_id,active,starts_at,expires_at)
  values(p_user_id,true,start_time,end_time)
  on conflict(user_id) do update set active=true,starts_at=start_time,expires_at=end_time,updated_at=now();

  begin
    insert into public.audit_logs(actor_id,target_user_id,action,details)
    values(actor,p_user_id,'vip_change',jsonb_build_object('days',p_days,'expires_at',end_time));
  exception when others then null;
  end;

  return jsonb_build_object('ok',true,'active',true,'expires_at',end_time);
end;
$$;

grant execute on function public.claim_daily_points() to authenticated;
grant execute on function public.admin_grant_points(uuid,integer,text) to authenticated;
grant execute on function public.admin_set_vip(uuid,integer) to authenticated;
