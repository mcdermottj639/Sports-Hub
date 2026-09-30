-- Operational setup after deploying sports-hub-odds and verifying the schema.
-- Reuses existing Vault references; no credential values belong in this file.
select cron.schedule('sports-hub-odds-capture','*/5 * * * *',$$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='sports_hub_project_url') || '/functions/v1/sports-hub-odds',
   headers := jsonb_build_object('Content-Type','application/json',
     'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='sports_hub_publishable_key'),
     'apikey',(select decrypted_secret from vault.decrypted_secrets where name='sports_hub_publishable_key')),
   body := jsonb_build_object('source','supabase-cron'), timeout_milliseconds := 60000);
$$);
-- Enable capture first, verify its real run and permissions, then enable UI.
-- update public.betting_signals_config set capture_enabled=true where id=1;
-- update public.betting_signals_config set ui_enabled=true where id=1;
