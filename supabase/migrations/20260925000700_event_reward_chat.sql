-- Event reward chat: private conversation between event winner and superadmin
create table if not exists public.event_reward_chats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  winner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create unique index if not exists event_reward_chats_event_winner_idx
on public.event_reward_chats(event_id,winner_user_id);

create table if not exists public.event_reward_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.event_reward_chats(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.event_reward_chats enable row level security;
alter table public.event_reward_messages enable row level security;

drop policy if exists "event_reward_chats_participants" on public.event_reward_chats;
create policy "event_reward_chats_participants" on public.event_reward_chats
for select using (
  auth.uid() = winner_user_id or public.is_superadmin()
);

drop policy if exists "event_reward_messages_participants" on public.event_reward_messages;
create policy "event_reward_messages_participants" on public.event_reward_messages
for select using (
  exists (
    select 1 from public.event_reward_chats c
    where c.id=chat_id and (c.winner_user_id=auth.uid() or public.is_superadmin())
  )
);

drop policy if exists "event_reward_messages_insert" on public.event_reward_messages;
create policy "event_reward_messages_insert" on public.event_reward_messages
for insert with check (
  sender_user_id=auth.uid()
  and exists (
    select 1 from public.event_reward_chats c
    where c.id=chat_id and (c.winner_user_id=auth.uid() or public.is_superadmin())
  )
);

create or replace function public.create_event_reward_chat(
  p_event_id uuid,
  p_winner_user_id uuid
)
returns public.event_reward_chats
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  result public.event_reward_chats;
begin
  if actor is null or not public.is_superadmin() then raise exception 'superadmin only'; end if;
  if not exists(select 1 from public.events where id=p_event_id) then raise exception 'event not found'; end if;
  if not exists(select 1 from public.event_participants where event_id=p_event_id and user_id=p_winner_user_id) then
    raise exception 'user is not an event participant';
  end if;

  insert into public.event_reward_chats(event_id,winner_user_id)
  values(p_event_id,p_winner_user_id)
  on conflict(event_id,winner_user_id) do update set closed_at=null
  returning * into result;
  return result;
end;
$$;

grant execute on function public.create_event_reward_chat(uuid,uuid) to authenticated;
