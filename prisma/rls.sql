-- Row Level Security for Doorlink on Supabase.
--
-- Doorlink reads and writes its database only from the server, through
-- Prisma, as the table owner, and every permission check (business
-- separation, customer-only quotes, admin powers) runs there. Supabase
-- also exposes the public schema through its REST API to anyone holding
-- the public anon key. This turns RLS on for every table with NO policies,
-- so that API returns nothing to anon or authenticated users, while the
-- owner connection Prisma uses is unaffected (owners bypass RLS unless it
-- is forced).
--
-- Safe to run repeatedly; run it again after `prisma db push` adds tables:
--   psql "$DIRECT_URL" -f prisma/rls.sql
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
