-- The scheduled Edge Function call itself is configured after deployment so
-- its project URL and authorization token can live in Vault, not in git.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
