-- Dedicated private schema only. Never alter Supabase service permissions.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='bingo_runtime') THEN
    CREATE ROLE bingo_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA bingo TO bingo_runtime;
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='bingo' LOOP
    EXECUTE format('ALTER TABLE bingo.%I ENABLE ROW LEVEL SECURITY',t.tablename);
    IF t.tablename = 'schema_migrations' THEN
      EXECUTE 'CREATE POLICY migration_history_denied ON bingo.schema_migrations TO bingo_runtime USING (false) WITH CHECK (false)';
    ELSE
      EXECUTE format('GRANT SELECT,INSERT ON bingo.%I TO bingo_runtime',t.tablename);
      EXECUTE format('CREATE POLICY backend_only ON bingo.%I TO bingo_runtime USING (true) WITH CHECK (true)',t.tablename);
    END IF;
  END LOOP;
END $$;
GRANT UPDATE ON bingo.users,bingo.user_sessions,bingo.wallets,bingo.responsible_gaming_limits,bingo.game_rounds,bingo.mfa_credentials,bingo.instant_commitments,bingo.email_outbox,bingo.outbox_events,bingo.games,bingo.admin_adjustments,bingo.support_cases,bingo.notifications,bingo.room_schedules,bingo.wallet_reservations,bingo.worker_heartbeats TO bingo_runtime;
GRANT DELETE ON bingo.user_sessions,bingo.identity_tokens,bingo.mfa_credentials TO bingo_runtime;
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='bingo' LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = bingo, pg_temp',f.signature);
  END LOOP;
END $$;
