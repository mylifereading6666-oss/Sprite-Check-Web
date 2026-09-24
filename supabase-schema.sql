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
drop policy if exists profiles_update_superadmin on public.profiles;
drop policy if exists profiles_update_self_admin on public.profiles;
create policy profiles_update_superadmin on public.profiles for update using (public.is_superadmin()) with check (true);
create policy profiles_update_self_admin on public.profiles for update using (id=auth.uid() and role='admin') with check (id=auth.uid() and role='admin');

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


-- Server-authoritative profile creation.
-- The designated top-level admin is assigned by the database, not by browser code.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,''),'@',1)),
    case when lower(coalesce(new.email,'')) = 'mylife.reading6666@gmail.com' then 'superadmin' else 'user' end
  )
  on conflict (id) do update set
    display_name = excluded.display_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();


-- Admin notification posts with optional image.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  image_url text not null default '',
  source_url text not null default '',
  source_name text not null default '',
  kind text not null default 'admin' check (kind in ('admin','sprite_auto')),
  sprite_id text,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists announcements_read_authenticated on public.announcements;
create policy announcements_read_authenticated on public.announcements for select using (auth.uid() is not null);
drop policy if exists announcements_insert_admin on public.announcements;
create policy announcements_insert_admin on public.announcements for insert with check (public.is_admin() and author_id=auth.uid());
drop policy if exists announcements_update_admin on public.announcements;
create policy announcements_update_admin on public.announcements for update using (public.is_admin());
drop policy if exists announcements_delete_admin on public.announcements;
create policy announcements_delete_admin on public.announcements for delete using (public.is_admin());
grant select on public.announcements to authenticated;
grant insert,update,delete on public.announcements to authenticated;

-- Public read-only source snapshot for automatic Sprite announcements.
create table if not exists public.sprite_source_seen (
  source_key text primary key,
  sprite_id text not null,
  source_url text not null default '',
  source_name text not null default '',
  first_seen_at timestamptz not null default now()
);
alter table public.sprite_source_seen enable row level security;
drop policy if exists sprite_source_seen_admin on public.sprite_source_seen;
create policy sprite_source_seen_admin on public.sprite_source_seen for all using (public.is_admin()) with check (public.is_admin());
grant select,insert,update,delete on public.sprite_source_seen to authenticated;



-- ============================================================
-- Sprite Check FINAL APPLICATION LAYER
-- Canonical Sprite catalog, background sync, exchanges, support,
-- multilingual content, conflict tracking, device exceptions,
-- backups and secure administrator registration.
-- ============================================================

-- Canonical Sprite catalog. The unique source_key is the primary
-- duplicate-prevention boundary for scheduled/manual imports.
create table if not exists public.sprites (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  external_id text,
  parent text not null,
  variant text not null default 'base',
  name text not null,
  season text not null default '',
  image_url text not null default '',
  release_date date,
  status text not null default 'unconfirmed'
    check (status in ('released','upcoming','unconfirmed')),
  rarity text not null default '',
  is_new boolean not null default false,
  source_url text not null default '',
  source_name text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sprites_season_idx on public.sprites(season);
create index if not exists sprites_status_idx on public.sprites(status);
create index if not exists sprites_external_idx on public.sprites(external_id);

alter table public.sprite_state
  add constraint sprite_state_sprite_fk
  foreign key (sprite_id) references public.sprites(source_key) on delete cascade
  not valid;
-- The constraint above is intentionally NOT VALID so existing local IDs can
-- migrate safely. The sync layer treats source_key as the stable Sprite ID.

alter table public.announcements
  add column if not exists title_en text not null default '',
  add column if not exists body_en text not null default '';

alter table public.notifications
  add column if not exists title_en text not null default '',
  add column if not exists body_en text not null default '';

create table if not exists public.sprite_sync_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('scheduled','manual')),
  triggered_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running','success','failed')),
  new_count integer not null default 0,
  updated_count integer not null default 0,
  unchanged_count integer not null default 0,
  error_text text not null default '',
  details jsonb not null default '{}'::jsonb
);
create index if not exists sprite_sync_runs_started_idx
  on public.sprite_sync_runs(started_at desc);

create table if not exists public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sprite_id text not null,
  local_state jsonb not null,
  server_state jsonb not null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution text not null default ''
);
create index if not exists sync_conflicts_user_idx on public.sync_conflicts(user_id,detected_at desc);

-- Exchange lifecycle.
create table if not exists public.exchange_chats (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.exchange_posts(id) on delete set null,
  request_id uuid references public.exchange_requests(id) on delete set null,
  status text not null default 'open'
    check (status in ('open','completed','cancelled','paused','under_review')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create table if not exists public.exchange_chat_members (
  chat_id uuid not null references public.exchange_chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'user'
    check (member_role in ('user','admin')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key(chat_id,user_id)
);
create table if not exists public.exchange_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.exchange_chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  source_language text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists exchange_chat_messages_idx
  on public.exchange_chat_messages(chat_id,created_at);

create table if not exists public.message_translations (
  id uuid primary key default gen_random_uuid(),
  message_kind text not null
    check (message_kind in ('direct','inquiry','exchange')),
  message_id uuid not null,
  target_language text not null check (target_language in ('ja','en')),
  translated_body text not null,
  provider text not null default '',
  created_at timestamptz not null default now(),
  unique(message_kind,message_id,target_language)
);

create table if not exists public.exchange_issues (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.exchange_chats(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  details text not null,
  status text not null default 'open'
    check (status in ('open','investigating','resolved','closed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Inquiry attachments and chat-style support.
create table if not exists public.inquiry_attachments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  message_id uuid references public.inquiry_messages(id) on delete cascade,
  storage_path text not null,
  file_name text not null default '',
  mime_type text not null default '',
  created_at timestamptz not null default now()
);
alter table public.inquiry_messages
  add column if not exists source_language text not null default '';

-- Admin registration code. Only a SHA-256 digest is stored.
create table if not exists public.admin_registration_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists admin_registration_codes_valid_idx
  on public.admin_registration_codes(valid_from,valid_until);

create table if not exists public.admin_role_changes (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  old_role text not null,
  new_role text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.account_suspensions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  suspended boolean not null default false,
  reason text not null default '',
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create table if not exists public.app_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_identifier text not null,
  reason text not null default '',
  granted_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id,app_identifier)
);

create table if not exists public.backup_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  backup_kind text not null default 'user'
    check (backup_kind in ('user','migration','admin')),
  created_at timestamptz not null default now()
);

-- Store the currently generated weekly code's delivery metadata without
-- storing the plaintext code.
insert into public.app_settings(key,value)
values
  ('admin_registration_email','mylife.reading6666@gmail.com'),
  ('admin_registration_code_period','weekly'),
  ('sprite_sync_schedule','08:00,13:00,20:00 Asia/Tokyo'),
  ('sprite_sync_source','https://raw.githubusercontent.com/valincius/fn-sprites/main/src/sprites.json')
on conflict (key) do update set value=excluded.value,updated_at=now();

-- Make ordinary users able to update their own display name, but never role.
drop policy if exists profiles_update_self_user on public.profiles;
create policy profiles_update_self_user on public.profiles
for update using (id=auth.uid() and role='user')
with check (id=auth.uid() and role='user');

-- Server-side role registration using the current weekly code.
create or replace function public.register_as_admin(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_ok boolean;
begin
  if auth.uid() is null then
    return false;
  end if;
  if exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','superadmin')) then
    return true;
  end if;

  v_hash := encode(digest(coalesce(p_code,''),'sha256'),'hex');
  select exists(
    select 1 from public.admin_registration_codes
    where code_hash=v_hash
      and revoked_at is null
      and now() >= valid_from
      and now() < valid_until
  ) into v_ok;

  if not v_ok then return false; end if;

  update public.profiles set role='admin' where id=auth.uid() and role='user';
  insert into public.admin_role_changes(actor_id,target_user_id,old_role,new_role,reason)
  values(auth.uid(),auth.uid(),'user','admin','weekly registration code');
  insert into public.audit_logs(actor_id,target_user_id,action,details)
  values(auth.uid(),auth.uid(),'admin_registration',jsonb_build_object('method','weekly_code'));
  return true;
end;
$$;
revoke all on function public.register_as_admin(text) from public;
grant execute on function public.register_as_admin(text) to authenticated;

-- Never allow a superadmin role to be created by ordinary profile updates.
create or replace function public.protect_superadmin_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role='superadmin' and new.role<>'superadmin' then
    raise exception 'The designated superadmin cannot be demoted';
  end if;
  if new.role='superadmin'
     and lower(coalesce((select email from auth.users where id=new.id),'')) <> 'mylife.reading6666@gmail.com' then
    raise exception 'Only the designated superadmin account may use this role';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_superadmin_role_trigger on public.profiles;
create trigger protect_superadmin_role_trigger
before update on public.profiles
for each row execute function public.protect_superadmin_role();

-- Canonical Sprite RLS.
alter table public.sprites enable row level security;
drop policy if exists sprites_read_authenticated on public.sprites;
create policy sprites_read_authenticated on public.sprites
for select using (auth.uid() is not null);
drop policy if exists sprites_write_admin on public.sprites;
create policy sprites_write_admin on public.sprites
for all using (public.is_admin()) with check (public.is_admin());

-- Sync runs are visible to admins only.
alter table public.sprite_sync_runs enable row level security;
drop policy if exists sprite_sync_runs_admin_read on public.sprite_sync_runs;
create policy sprite_sync_runs_admin_read on public.sprite_sync_runs
for select using (public.is_admin());

alter table public.sync_conflicts enable row level security;
drop policy if exists sync_conflicts_self_or_admin on public.sync_conflicts;
create policy sync_conflicts_self_or_admin on public.sync_conflicts
for select using (user_id=auth.uid() or public.is_admin());
drop policy if exists sync_conflicts_self_insert on public.sync_conflicts;
create policy sync_conflicts_self_insert on public.sync_conflicts
for insert with check (user_id=auth.uid() or public.is_admin());
drop policy if exists sync_conflicts_resolve on public.sync_conflicts;
create policy sync_conflicts_resolve on public.sync_conflicts
for update using (user_id=auth.uid() or public.is_admin())
with check (user_id=auth.uid() or public.is_admin());

alter table public.exchange_chats enable row level security;
alter table public.exchange_chat_members enable row level security;
alter table public.exchange_chat_messages enable row level security;
alter table public.message_translations enable row level security;
alter table public.exchange_issues enable row level security;

drop policy if exists exchange_chats_members_read on public.exchange_chats;
create policy exchange_chats_members_read on public.exchange_chats
for select using (
  public.is_admin()
  or exists(select 1 from public.exchange_chat_members m where m.chat_id=id and m.user_id=auth.uid())
);
drop policy if exists exchange_chats_member_write on public.exchange_chats;
create policy exchange_chats_member_write on public.exchange_chats
for update using (public.is_admin() or exists(select 1 from public.exchange_chat_members m where m.chat_id=id and m.user_id=auth.uid()))
with check (public.is_admin() or exists(select 1 from public.exchange_chat_members m where m.chat_id=id and m.user_id=auth.uid()));

drop policy if exists exchange_chat_members_read on public.exchange_chat_members;
create policy exchange_chat_members_read on public.exchange_chat_members
for select using (user_id=auth.uid() or public.is_admin());
drop policy if exists exchange_chat_members_admin_write on public.exchange_chat_members;
create policy exchange_chat_members_admin_write on public.exchange_chat_members
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists exchange_chat_messages_read on public.exchange_chat_messages;
create policy exchange_chat_messages_read on public.exchange_chat_messages
for select using (public.is_admin() or exists(select 1 from public.exchange_chat_members m where m.chat_id=exchange_chat_messages.chat_id and m.user_id=auth.uid()));
drop policy if exists exchange_chat_messages_insert on public.exchange_chat_messages;
create policy exchange_chat_messages_insert on public.exchange_chat_messages
for insert with check (sender_id=auth.uid() and exists(select 1 from public.exchange_chat_members m where m.chat_id=exchange_chat_messages.chat_id and m.user_id=auth.uid()));

drop policy if exists message_translations_read on public.message_translations;
create policy message_translations_read on public.message_translations
for select using (auth.uid() is not null);
drop policy if exists message_translations_insert on public.message_translations;
create policy message_translations_insert on public.message_translations
for insert with check (auth.uid() is not null);

drop policy if exists exchange_issues_read on public.exchange_issues;
create policy exchange_issues_read on public.exchange_issues
for select using (public.is_admin() or reporter_id=auth.uid() or exists(select 1 from public.exchange_chat_members m where m.chat_id=exchange_issues.chat_id and m.user_id=auth.uid()));
drop policy if exists exchange_issues_insert on public.exchange_issues;
create policy exchange_issues_insert on public.exchange_issues
for insert with check (reporter_id=auth.uid());
drop policy if exists exchange_issues_update on public.exchange_issues;
create policy exchange_issues_update on public.exchange_issues
for update using (public.is_admin() or reporter_id=auth.uid())
with check (public.is_admin() or reporter_id=auth.uid());

alter table public.inquiry_attachments enable row level security;
drop policy if exists inquiry_attachments_read on public.inquiry_attachments;
create policy inquiry_attachments_read on public.inquiry_attachments
for select using (
  public.is_admin()
  or exists(select 1 from public.inquiries i where i.id=inquiry_id and i.user_id=auth.uid())
);
drop policy if exists inquiry_attachments_insert on public.inquiry_attachments;
create policy inquiry_attachments_insert on public.inquiry_attachments
for insert with check (
  exists(select 1 from public.inquiries i where i.id=inquiry_id and (i.user_id=auth.uid() or public.is_admin()))
);

alter table public.admin_registration_codes enable row level security;
drop policy if exists admin_registration_codes_superadmin on public.admin_registration_codes;
create policy admin_registration_codes_superadmin on public.admin_registration_codes
for all using (public.is_superadmin()) with check (public.is_superadmin());

alter table public.admin_role_changes enable row level security;
drop policy if exists admin_role_changes_superadmin_read on public.admin_role_changes;
create policy admin_role_changes_superadmin_read on public.admin_role_changes
for select using (public.is_superadmin());

alter table public.account_suspensions enable row level security;
drop policy if exists account_suspensions_admin on public.account_suspensions;
create policy account_suspensions_admin on public.account_suspensions
for all using (public.is_admin()) with check (public.is_admin());

alter table public.app_exceptions enable row level security;
drop policy if exists app_exceptions_self_or_admin on public.app_exceptions;
create policy app_exceptions_self_or_admin on public.app_exceptions
for select using (user_id=auth.uid() or public.is_admin());
drop policy if exists app_exceptions_superadmin_write on public.app_exceptions;
create policy app_exceptions_superadmin_write on public.app_exceptions
for all using (public.is_superadmin()) with check (public.is_superadmin());

alter table public.backup_records enable row level security;
drop policy if exists backup_records_self_or_admin on public.backup_records;
create policy backup_records_self_or_admin on public.backup_records
for select using (user_id=auth.uid() or public.is_admin());
drop policy if exists backup_records_self_insert on public.backup_records;
create policy backup_records_self_insert on public.backup_records
for insert with check (user_id=auth.uid() or public.is_admin());

grant select on public.sprites,public.sprite_sync_runs,public.sync_conflicts,
  public.exchange_chats,public.exchange_chat_members,public.exchange_chat_messages,
  public.message_translations,public.exchange_issues,public.inquiry_attachments,
  public.admin_role_changes,public.account_suspensions,public.app_exceptions,public.backup_records
  to authenticated;
grant insert,update,delete on public.sprites,public.sync_conflicts,
  public.exchange_chats,public.exchange_chat_members,public.exchange_chat_messages,
  public.message_translations,public.exchange_issues,public.inquiry_attachments,
  public.account_suspensions,public.app_exceptions,public.backup_records
  to authenticated;

-- Public announcement media bucket. Upload/delete remains restricted by Storage RLS.
insert into storage.buckets(id,name,public,allowed_mime_types,file_size_limit)
values('announcements','announcements',true,array['image/*'],5242880)
on conflict(id) do update set public=true,allowed_mime_types=array['image/*'],file_size_limit=5242880;

drop policy if exists announcements_storage_read on storage.objects;
create policy announcements_storage_read on storage.objects
for select using (bucket_id='announcements');

drop policy if exists announcements_storage_admin_insert on storage.objects;
create policy announcements_storage_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id='announcements' and public.is_admin());

drop policy if exists announcements_storage_admin_update on storage.objects;
create policy announcements_storage_admin_update on storage.objects
for update to authenticated
using (bucket_id='announcements' and public.is_admin())
with check (bucket_id='announcements' and public.is_admin());

drop policy if exists announcements_storage_admin_delete on storage.objects;
create policy announcements_storage_admin_delete on storage.objects
for delete to authenticated
using (bucket_id='announcements' and public.is_admin());

-- Realtime for live exchange/inquiry chat and notifications.
do $$
begin
  begin
    alter publication supabase_realtime add table public.exchange_chat_messages;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.inquiry_messages;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;

-- Background scheduler. Supabase Cron uses UTC unless configured otherwise,
-- so these correspond to 08:00 / 13:00 / 20:00 JST.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('sprite-check-sync-0800-jst');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('sprite-check-sync-1300-jst');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('sprite-check-sync-2000-jst');
exception when others then null;
end $$;

-- IMPORTANT: replace the placeholder key below in the Dashboard/SQL editor
-- with a server-only secret key before enabling these jobs. Never put a
-- secret key in the GitHub Pages frontend.
-- The schedules are included here so the final deployment has exactly
-- three daily execution points.
-- 08:00 JST = 23:00 UTC (previous day)
-- 13:00 JST = 04:00 UTC
-- 20:00 JST = 11:00 UTC

-- select cron.schedule(
--   'sprite-check-sync-0800-jst','0 23 * * *',
--   $$select net.http_post(
--      url:='https://qhogmxiyghashlxeuikm.supabase.co/functions/v1/sprite-sync',
--      headers:=jsonb_build_object('Content-Type','application/json','apikey','SERVER_ONLY_SECRET'),
--      body:='{"type":"scheduled","slot":"08:00 JST"}'::jsonb
--   )$$
-- );
-- select cron.schedule(
--   'sprite-check-sync-1300-jst','0 4 * * *',
--   $$select net.http_post(
--      url:='https://qhogmxiyghashlxeuikm.supabase.co/functions/v1/sprite-sync',
--      headers:=jsonb_build_object('Content-Type','application/json','apikey','SERVER_ONLY_SECRET'),
--      body:='{"type":"scheduled","slot":"13:00 JST"}'::jsonb
--   )$$
-- );
-- select cron.schedule(
--   'sprite-check-sync-2000-jst','0 11 * * *',
--   $$select net.http_post(
--      url:='https://qhogmxiyghashlxeuikm.supabase.co/functions/v1/sprite-sync',
--      headers:=jsonb_build_object('Content-Type','application/json','apikey','SERVER_ONLY_SECRET'),
--      body:='{"type":"scheduled","slot":"20:00 JST"}'::jsonb
--   )$$
-- );



-- Final schema corrections and lifecycle triggers.
alter table public.direct_messages
  add column if not exists source_language text not null default '';

create or replace function public.create_exchange_chat_after_accept()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat uuid;
  v_owner uuid;
begin
  if new.status='accepted' and old.status is distinct from 'accepted' then
    select owner_id into v_owner from public.exchange_posts where id=new.post_id;
    if v_owner is null then return new; end if;

    select id into v_chat from public.exchange_chats
      where request_id=new.id limit 1;

    if v_chat is null then
      insert into public.exchange_chats(post_id,request_id,status)
      values(new.post_id,new.id,'open')
      returning id into v_chat;

      insert into public.exchange_chat_members(chat_id,user_id,member_role)
      values(v_chat,v_owner,'user')
      on conflict do nothing;

      insert into public.exchange_chat_members(chat_id,user_id,member_role)
      values(v_chat,new.requester_id,'user')
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists exchange_request_accepted_chat on public.exchange_requests;
create trigger exchange_request_accepted_chat
after update of status on public.exchange_requests
for each row execute function public.create_exchange_chat_after_accept();

revoke all on function public.create_exchange_chat_after_accept() from public;

-- Superadmin-only role changes with mandatory reason and audit trail.
create or replace function public.set_admin_role(
  p_target uuid,
  p_new_role text,
  p_reason text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if not public.is_superadmin() then raise exception 'Superadmin only'; end if;
  if p_target=(select auth.uid()) then raise exception 'Cannot change own role'; end if;
  if p_new_role not in ('user','admin') then raise exception 'Invalid target role'; end if;

  select role into v_old from public.profiles where id=p_target;
  if v_old is null then raise exception 'Target user not found'; end if;

  update public.profiles set role=p_new_role where id=p_target;
  insert into public.admin_role_changes(actor_id,target_user_id,old_role,new_role,reason)
  values((select auth.uid()),p_target,v_old,p_new_role,coalesce(p_reason,''));

  insert into public.audit_logs(actor_id,target_user_id,action,details)
  values((select auth.uid()),p_target,'admin_role_change',
    jsonb_build_object('old_role',v_old,'new_role',p_new_role,'reason',coalesce(p_reason,'')));

  return true;
end;
$$;
revoke all on function public.set_admin_role(uuid,text,text) from public;
grant execute on function public.set_admin_role(uuid,text,text) to authenticated;

-- User suspension is an admin support action; role hierarchy is unchanged.
create or replace function public.set_account_suspension(
  p_target uuid,
  p_suspended boolean,
  p_reason text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  insert into public.account_suspensions(user_id,suspended,reason,changed_by)
  values(p_target,p_suspended,coalesce(p_reason,''),(select auth.uid()))
  on conflict(user_id) do update set
    suspended=excluded.suspended,reason=excluded.reason,
    changed_by=excluded.changed_by,changed_at=now();

  insert into public.audit_logs(actor_id,target_user_id,action,details)
  values((select auth.uid()),p_target,'account_suspension',
    jsonb_build_object('suspended',p_suspended,'reason',coalesce(p_reason,'')));
  return true;
end;
$$;
revoke all on function public.set_account_suspension(uuid,boolean,text) from public;
grant execute on function public.set_account_suspension(uuid,boolean,text) to authenticated;

grant select on public.direct_messages to authenticated;
grant insert,update on public.direct_messages to authenticated;



-- Support attachment bucket.
insert into storage.buckets(id,name,public,allowed_mime_types,file_size_limit)
values('support','support',false,array['image/*'],5242880)
on conflict(id) do update set public=false,allowed_mime_types=array['image/*'],file_size_limit=5242880;

drop policy if exists support_storage_read on storage.objects;
create policy support_storage_read on storage.objects
for select to authenticated
using (
  bucket_id='support' and (
    public.is_admin()
    or (name like (select auth.uid()::text)||'/%')
  )
);
drop policy if exists support_storage_insert on storage.objects;
create policy support_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='support' and (
    public.is_admin() or name like (select auth.uid()::text)||'/%'
  )
);
drop policy if exists support_storage_delete on storage.objects;
create policy support_storage_delete on storage.objects
for delete to authenticated
using (bucket_id='support' and (public.is_admin() or owner_id=(select auth.uid()::text)));

-- Weekly admin-code job: Monday 00:00 JST = Sunday 15:00 UTC.
-- The Edge Function must be deployed and the server-only secret key supplied
-- in the cron request. The plaintext code is never stored in Postgres.
-- select cron.schedule(
--   'sprite-check-weekly-admin-code','0 15 * * 0',
--   $$select net.http_post(
--      url:='https://qhogmxiyghashlxeuikm.supabase.co/functions/v1/admin-code-cron',
--      headers:=jsonb_build_object('Content-Type','application/json','apikey','SERVER_ONLY_SECRET'),
--      body:='{"type":"weekly"}'::jsonb
--   )$$
-- );

-- Keep historical user ownership data even if an administrator removes a catalog row.
alter table public.sprite_state drop constraint if exists sprite_state_sprite_fk;
