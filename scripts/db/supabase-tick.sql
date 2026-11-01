-- The minute tick (ADR-0014, docs/deploy.md). Run once in the Supabase SQL Editor after the first
-- deploy. Supabase Cron calls Gaff's /api/cron/tick every minute, so reminders, deadlines and
-- chasers run on time on any Vercel plan. (Vercel's own cron calls it once a day as a backstop.)
--
-- Replace APP-URL with the app's address (e.g. https://gaff-test.vercel.app) and CRON-SECRET with
-- the same value as CRON_SECRET in Vercel. The secret is kept encrypted in Supabase Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('CRON-SECRET', 'gaff_cron_secret', 'Bearer token for /api/cron/tick');
select vault.create_secret('APP-URL', 'gaff_app_url', 'Where Gaff runs');

select cron.schedule(
  'gaff-tick',
  '* * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'gaff_app_url')
      || '/api/cron/tick',
    headers := jsonb_build_object(
      'authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'gaff_cron_secret')
    ),
    -- Longer than a tick can take (45 seconds, plus running jobs finishing).
    timeout_milliseconds := 120000
  );
  $$
);

-- pg_cron keeps a row for every run; keep a week of them.
select cron.schedule(
  'gaff-tick-history',
  '15 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$
);
