-- Fix Supabase Edge Function cron authentication.
-- Secret-key authenticated functions expect the key in Authorization as well as apikey.

select cron.unschedule('sprite-sync-0800-jst');
select cron.unschedule('sprite-sync-1300-jst');
select cron.unschedule('sprite-sync-2000-jst');
select cron.unschedule('admin-code-weekly');

select cron.schedule(
  'sprite-sync-0800-jst',
  '0 23 * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
              || '/functions/v1/sprite-sync-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'sprite_check_cron_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sprite_check_cron_key')
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
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'sprite_check_cron_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sprite_check_cron_key')
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
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'sprite_check_cron_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sprite_check_cron_key')
      ),
      body := jsonb_build_object('slot', '20:00 JST', 'triggered_at', now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);

select cron.schedule(
  'admin-code-weekly',
  '0 23 * * 0',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
              || '/functions/v1/admin-code-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'sprite_check_cron_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sprite_check_cron_key')
      ),
      body := jsonb_build_object('triggered_at', now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);
