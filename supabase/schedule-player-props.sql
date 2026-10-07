-- Run after deploying the JWT-protected sports-hub-props function.
-- Discovery every 15 minutes; two isolated game workers each minute.
select cron.schedule('sports-hub-props-discover','*/15 * * * *',$$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='sports_hub_project_url') || '/functions/v1/sports-hub-props',
  headers := jsonb_build_object('Content-Type','application/json',
   'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='sports_hub_publishable_key'),
   'apikey',(select decrypted_secret from vault.decrypted_secrets where name='sports_hub_publishable_key')),
  body := '{"mode":"discover"}'::jsonb, timeout_milliseconds := 120000);
$$);
select cron.schedule('sports-hub-props-workers','* * * * *',$$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='sports_hub_project_url') || '/functions/v1/sports-hub-props',
  headers := jsonb_build_object('Content-Type','application/json',
   'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='sports_hub_publishable_key'),
   'apikey',(select decrypted_secret from vault.decrypted_secrets where name='sports_hub_publishable_key')),
  body := '{"mode":"worker"}'::jsonb, timeout_milliseconds := 120000)
 from generate_series(1,2);
$$);
