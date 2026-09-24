-- Sprite Check / Supabase one-time setup
-- No custom server/Worker code is required. Run this once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'user' check (role in ('user','admin','superadmin')),
  created_at timestamptz not null default now()
);

create table if not exists public.sprite_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sprite_id text not null,
  owned boolean not null default false,
  master boolean not null default false,
  level integer not null default 1 check (level between 1 and 5),
  manual boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id,sprite_id)
);

create table if not exists public.exchange_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  sprite_id text not null,
  type text not null check (type in ('offer','want')),
  status text not null default 'open' check (status in ('open','matched','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.exchange_requests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.exchange_posts(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '',
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  status text not null default 'open' check (status in ('open','answered','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','superadmin')
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.sprite_state enable row level security;
alter table public.exchange_posts enable row level security;
alter table public.exchange_requests enable row level security;
alter table public.direct_messages enable row level security;
alter table public.inquiries enable row level security;
alter table public.inquiry_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles for select using (id=auth.uid() or public.is_admin());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert with check (id=auth.uid() and role='user');

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update using (public.is_admin()) with check (
  public.is_superadmin() or role = 'user'
);

drop policy if exists sprite_state_self on public.sprite_state;
create policy sprite_state_self on public.sprite_state for all using (user_id=auth.uid() or public.is_admin()) with check (user_id=auth.uid() or public.is_admin());

drop policy if exists exchange_posts_read on public.exchange_posts;
create policy exchange_posts_read on public.exchange_posts for select using (auth.uid() is not null);
drop policy if exists exchange_posts_write on public.exchange_posts;
create policy exchange_posts_write on public.exchange_posts for insert with check (owner_id=auth.uid());
drop policy if exists exchange_posts_update on public.exchange_posts;
create policy exchange_posts_update on public.exchange_posts for update using (owner_id=auth.uid() or public.is_admin());
drop policy if exists exchange_posts_delete on public.exchange_posts;
create policy exchange_posts_delete on public.exchange_posts for delete using (owner_id=auth.uid() or public.is_admin());

drop policy if exists exchange_requests_read on public.exchange_requests;
create policy exchange_requests_read on public.exchange_requests for select using (
  requester_id=auth.uid() or exists(select 1 from public.exchange_posts p where p.id=post_id and p.owner_id=auth.uid()) or public.is_admin()
);
drop policy if exists exchange_requests_insert on public.exchange_requests;
create policy exchange_requests_insert on public.exchange_requests for insert with check (requester_id=auth.uid());
drop policy if exists exchange_requests_update on public.exchange_requests;
create policy exchange_requests_update on public.exchange_requests for update using (
  requester_id=auth.uid() or exists(select 1 from public.exchange_posts p where p.id=post_id and p.owner_id=auth.uid()) or public.is_admin()
);

drop policy if exists direct_messages_read on public.direct_messages;
create policy direct_messages_read on public.direct_messages for select using (sender_id=auth.uid() or recipient_id=auth.uid() or public.is_admin());
drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages for insert with check (sender_id=auth.uid());

drop policy if exists inquiries_read on public.inquiries;
create policy inquiries_read on public.inquiries for select using (user_id=auth.uid() or public.is_admin());
drop policy if exists inquiries_insert on public.inquiries;
create policy inquiries_insert on public.inquiries for insert with check (user_id=auth.uid());
drop policy if exists inquiries_update on public.inquiries;
create policy inquiries_update on public.inquiries for update using (user_id=auth.uid() or public.is_admin());

drop policy if exists inquiry_messages_read on public.inquiry_messages;
create policy inquiry_messages_read on public.inquiry_messages for select using (
  exists(select 1 from public.inquiries i where i.id=inquiry_id and (i.user_id=auth.uid() or public.is_admin()))
);
drop policy if exists inquiry_messages_insert on public.inquiry_messages;
create policy inquiry_messages_insert on public.inquiry_messages for insert with check (
  sender_id=auth.uid() and exists(select 1 from public.inquiries i where i.id=inquiry_id and (i.user_id=auth.uid() or public.is_admin()))
);

drop policy if exists notifications_self on public.notifications;
create policy notifications_self on public.notifications for all using (user_id=auth.uid() or public.is_admin()) with check (user_id=auth.uid() or public.is_admin());

drop policy if exists audit_read_admin on public.audit_logs;
create policy audit_read_admin on public.audit_logs for select using (public.is_admin());
drop policy if exists audit_insert_self_or_admin on public.audit_logs;
create policy audit_insert_self_or_admin on public.audit_logs for insert with check (actor_id=auth.uid() or public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.profiles,public.sprite_state,public.exchange_posts,public.exchange_requests,public.direct_messages,public.inquiries,public.inquiry_messages,public.notifications,public.audit_logs to authenticated;
grant insert,update,delete on public.sprite_state,public.exchange_posts,public.exchange_requests,public.direct_messages,public.inquiries,public.inquiry_messages,public.notifications,public.profiles to authenticated;
grant insert on public.audit_logs to authenticated;


-- System notification destination.
-- This is a configuration value, not a public Web URL.
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists app_settings_read_admin on public.app_settings;
create policy app_settings_read_admin on public.app_settings for select using (public.is_admin());
drop policy if exists app_settings_write_superadmin on public.app_settings;
create policy app_settings_write_superadmin on public.app_settings for all using (public.is_superadmin()) with check (public.is_superadmin());
insert into public.app_settings(key,value)
values ('admin_notification_email','mylife.reading6666@gmail.com')
on conflict (key) do update set value=excluded.value,updated_at=now();

grant select on public.app_settings to authenticated;
grant insert,update,delete on public.app_settings to authenticated;
