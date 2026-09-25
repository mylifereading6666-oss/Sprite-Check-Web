-- Admin application: submitting never grants admin role automatically
create table if not exists public.admin_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_applications_one_pending
on public.admin_applications(user_id) where status='pending';

alter table public.admin_applications enable row level security;

drop policy if exists "admin_applications_self_or_superadmin" on public.admin_applications;
create policy "admin_applications_self_or_superadmin" on public.admin_applications
for select using (auth.uid()=user_id or public.is_superadmin());

drop policy if exists "admin_applications_insert_self" on public.admin_applications;
create policy "admin_applications_insert_self" on public.admin_applications
for insert with check (auth.uid()=user_id);

create or replace function public.submit_admin_application(p_reason text)
returns public.admin_applications
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  result public.admin_applications;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if exists(select 1 from public.profiles where id=uid and role in ('admin','superadmin')) then
    raise exception 'already admin';
  end if;
  if exists(select 1 from public.admin_applications where user_id=uid and status='pending') then
    raise exception 'pending application already exists';
  end if;
  insert into public.admin_applications(user_id,reason)
  values(uid,coalesce(p_reason,''))
  returning * into result;
  return result;
end;
$$;

create or replace function public.admin_review_application(
  p_application_id uuid,
  p_status text,
  p_note text default ''
)
returns public.admin_applications
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  result public.admin_applications;
begin
  if actor is null or not public.is_superadmin() then raise exception 'superadmin only'; end if;
  if p_status not in ('approved','rejected') then raise exception 'invalid review status'; end if;

  update public.admin_applications
  set status=p_status,reviewed_by=actor,reviewed_at=now(),review_note=coalesce(p_note,''),updated_at=now()
  where id=p_application_id and status='pending'
  returning * into result;

  if not found then raise exception 'application not found or already reviewed'; end if;

  -- Approval only records approval. It NEVER grants admin privileges.
  return result;
end;
$$;

grant execute on function public.submit_admin_application(text) to authenticated;
grant execute on function public.admin_review_application(uuid,text,text) to authenticated;
