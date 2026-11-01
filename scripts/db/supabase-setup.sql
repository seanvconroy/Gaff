-- Supabase set-up for Gaff (docs/deploy.md, ADR-0014). Run once, in the project's SQL Editor.
--
-- Gaff connects as its own role, gaff. It owns Gaff's tables and can't bypass row-level
-- security, so one organisation can never see another's data (ADR-0004). Supabase's own
-- postgres role bypasses row-level security, so the app never uses it.
--
-- Before running: replace CHANGE-ME with a new password of 32 or more letters and digits
-- (no symbols, so it can go straight into the connection address). Keep it for DATABASE_URL.

create role gaff with login password 'CHANGE-ME' nobypassrls;

-- Lets gaff create its tables, its migration record (schema "drizzle") and its job queue
-- (schema "graphile_worker"). Migrations run as gaff during each production deploy.
grant create on database postgres to gaff;
grant usage, create on schema public to gaff;

-- Lets the dashboard's Table Editor show Gaff's tables (the dashboard runs as postgres).
grant gaff to postgres;
