-- Sprite Check: server-side points roulette
create table if not exists public.point_roulette_spins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_code text not null,
  reward_label text not null,
  reward_points integer not null default 0 check (reward_points >= 0),
  cost_points integer not null default 10 check (cost_points >= 0),
  spin_date date not null,
  created_at timestamptz not null default now()
);

alter table public.point_roulette_spins enable row level security;
drop policy if exists "point_roulette_self" on public.point_roulette_spins;
create policy "point_roulette_self" on public.point_roulette_spins
for select using (auth.uid() = user_id or public.is_admin());

create or replace function public.spin_point_roulette()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Tokyo')::date;
  vip_ok boolean := false;
  daily_limit integer := 1;
  used_count integer := 0;
  cost integer := 10;
  roll integer;
  reward_code text;
  reward_label text;
  reward_points integer;
  new_balance integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select exists(
    select 1 from public.vip_memberships
    where user_id=uid and active=true and expires_at>now()
  ) into vip_ok;

  if vip_ok then daily_limit := 3; end if;

  select count(*) into used_count
  from public.point_roulette_spins
  where user_id=uid and spin_date=today;

  if used_count >= daily_limit then
    return jsonb_build_object('ok',false,'reason','daily_limit','limit',daily_limit,'used',used_count);
  end if;

  insert into public.user_points(user_id,balance,total_earned,total_spent)
  values(uid,0,0,0)
  on conflict do nothing;

  select balance into new_balance
  from public.user_points
  where user_id=uid
  for update;

  if new_balance < cost then
    return jsonb_build_object('ok',false,'reason','insufficient_points','balance',new_balance,'cost',cost);
  end if;

  roll := floor(random()*100)::integer + 1;

  if roll <= 35 then
    reward_code := 'nothing';
    reward_label := 'はずれ';
    reward_points := 0;
  elsif roll <= 65 then
    reward_code := 'small';
    reward_label := '5ポイント';
    reward_points := 5;
  elsif roll <= 85 then
    reward_code := 'normal';
    reward_label := '10ポイント';
    reward_points := 10;
  elsif roll <= 97 then
    reward_code := 'big';
    reward_label := '25ポイント';
    reward_points := 25;
  else
    reward_code := 'jackpot';
    reward_label := '100ポイント';
    reward_points := 100;
  end if;

  new_balance := new_balance - cost + reward_points;

  update public.user_points
  set balance=new_balance,
      total_spent=total_spent+cost,
      total_earned=total_earned+reward_points,
      updated_at=now()
  where user_id=uid;

  insert into public.point_transactions(user_id,amount,balance_after,reason,source)
  values(uid,-cost,new_balance,'ポイントルーレット参加','roulette');

  if reward_points > 0 then
    insert into public.point_transactions(user_id,amount,balance_after,reason,source)
    values(uid,reward_points,new_balance,'ポイントルーレット報酬: '||reward_label,'roulette');
  end if;

  insert into public.point_roulette_spins(
    user_id,reward_code,reward_label,reward_points,cost_points,spin_date
  ) values(uid,reward_code,reward_label,reward_points,cost,today);

  return jsonb_build_object(
    'ok',true,
    'reward_code',reward_code,
    'reward_label',reward_label,
    'reward_points',reward_points,
    'cost',cost,
    'balance',new_balance,
    'daily_limit',daily_limit,
    'used',used_count+1
  );
end;
$$;

grant execute on function public.spin_point_roulette() to authenticated;
