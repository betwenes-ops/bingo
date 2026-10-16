import { database } from './db';
if (process.env.NODE_ENV === 'production')
  throw new Error('Local role provisioning is not a production installer');
const { pool } = database(process.env.DATABASE_URL!);
try {
  await pool.query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='bingo_app') THEN CREATE ROLE bingo_app LOGIN PASSWORD 'local-app-only'; END IF; END $$",
  );
  await pool.query(`GRANT USAGE ON SCHEMA public TO bingo_app;
GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA public TO bingo_app;
GRANT UPDATE ON users,user_sessions,wallets,responsible_gaming_limits,game_rounds,mfa_credentials,instant_commitments,email_outbox,outbox_events TO bingo_app;
GRANT DELETE ON user_sessions,identity_tokens TO bingo_app;
REVOKE ALL ON schema_migrations FROM bingo_app;`);
  console.log('Local least-privilege runtime role provisioned.');
} finally {
  await pool.end();
}
