-- Sprite Check: server-side background automation
-- Schedules are evaluated by Supabase Cron in UTC.
-- JST = UTC+9, so:
-- 08:00 JST -> 23:00 UTC (previous day)
-- 13:00 JST -> 04:00 UTC
-- 20:00 JST -> 11:00 UTC
--
-- The Edge Functions use auth:'secret'. The secret key is intentionally NOT
-- stored in Git. After this migration is applied, create the Vault secrets:
--   project_url = https://qhogmxiyghashlxeuikm.supabase.co
--   sprite_check_cron_key = a Supabase Secret Key
--
-- The same secret key can be used for the scheduled service-to-service calls.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- These jobs are intentionally named so re-running this migration updates
-- the existing schedule instead of creating duplicate jobs.

select cron.schedule(
  'sprite-sync-0800-jst',
  '0 23 * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
              || '/functions/v1/sprite-sync-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'sprite_check_cron_key')
      ),
      body := jsonb_build_object('slot', '08:00 JST', 'triggered_at', now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);

select cron.schedule(
  'sprite-sync-1300-jst',
  '0 4 * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
              || '/functions/v1/sprite-sync-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'sprite_check_cron_key')
      ),
      body := jsonb_build_object('slot', '13:00 JST', 'triggered_at', now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);

select cron.schedule(
  'sprite-sync-2000-jst',
  '0 11 * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
              || '/functions/v1/sprite-sync-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'sprite_check_cron_key')
      ),
      body := jsonb_build_object('slot', '20:00 JST', 'triggered_at', now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);

-- Generate the weekly general-admin registration code automatically.
-- Monday 08:00 JST = Sunday 23:00 UTC.
select cron.schedule(
  'admin-code-weekly',
  '0 23 * * 0',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
              || '/functions/v1/admin-code-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'sprite_check_cron_key')
      ),
      body := jsonb_build_object('triggered_at', now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);

-- Keep pg_cron history small.
select cron.schedule(
  'cron-history-cleanup',
  '30 0 * * *',
  $$
    delete from cron.job_run_details
    where end_time < now() - interval '14 days'
  $$
);
