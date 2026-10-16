CREATE TABLE worker_heartbeats (instance_id uuid PRIMARY KEY, updated_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz NOT NULL DEFAULT now(), rounds_advanced bigint NOT NULL DEFAULT 0);
ALTER TABLE email_outbox ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE email_outbox ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE email_outbox ADD COLUMN last_error text;
CREATE INDEX email_pending_retry ON email_outbox(next_attempt_at,created_at) WHERE delivered_at IS NULL;
