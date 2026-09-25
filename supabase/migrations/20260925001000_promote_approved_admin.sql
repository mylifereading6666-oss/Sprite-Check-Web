-- Superadmin one-click promotion for approved admin applications
create or replace function public.promote_approved_admin_application(p_application_id uuid)
returns public.admin_applications
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  app public.admin_applications;
begin
  if actor is null or not public.is_superadmin() then
    raise exception 'superadmin only';
  end if;

  select * into app
  from public.admin_applications
  where id=p_application_id
  for update;

  if not found then raise exception 'application not found'; end if;
  if app.status <> 'approved' then raise exception 'application must be approved first'; end if;

  update public.profiles
  set role='admin'
  where id=app.user_id
    and role='user';

  if not found then
    raise exception 'user is already an admin or profile is unavailable';
  end if;

  update public.admin_applications
  set updated_at=now()
  where id=app.id
  returning * into app;

  begin
    insert into public.audit_logs(actor_id,target_user_id,action,details)
    values(
      actor,
      app.user_id,
      'admin_application_promoted',
      jsonb_build_object('application_id',app.id,'role','admin')
    );
  exception when others then null;
  end;

  return app;
end;
$$;

grant execute on function public.promote_approved_admin_application(uuid) to authenticated;
