select cron.schedule(
  'sports-hub-ai-capture',
  '7,37 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sports_hub_project_url')
      || '/functions/v1/sports-hub-ai',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sports_hub_publishable_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'sports_hub_publishable_key')
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'scheduled_at', now()),
    timeout_milliseconds := 30000
  ) as request_id;
  $job$
);
