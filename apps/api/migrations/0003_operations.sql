ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('player','superadmin','operator','auditor','finance','support'));
ALTER TABLE users ADD COLUMN anonymized_at timestamptz;
ALTER TABLE ledger_transactions ADD CONSTRAINT ledger_operation_unique UNIQUE(kind,reference);
CREATE TABLE games (key text PRIMARY KEY, name text NOT NULL, enabled boolean NOT NULL DEFAULT true);
CREATE TABLE game_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),game_key text NOT NULL REFERENCES games(key),version text NOT NULL,config jsonb NOT NULL,config_hash text NOT NULL, published_by uuid REFERENCES users(id),published_at timestamptz NOT NULL DEFAULT now(),UNIQUE(game_key,version));
CREATE TRIGGER game_versions_immutable BEFORE UPDATE OR DELETE ON game_versions FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE game_math_models(version_id uuid PRIMARY KEY REFERENCES game_versions(id),report jsonb NOT NULL,report_hash text NOT NULL);
CREATE TRIGGER math_models_immutable BEFORE UPDATE OR DELETE ON game_math_models FOR EACH ROW EXECUTE FUNCTION immutable_record();
ALTER TABLE game_rounds ADD COLUMN version_id uuid REFERENCES game_versions(id);
ALTER TABLE game_rounds ADD COLUMN opens_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE game_rounds ADD COLUMN sales_paused boolean NOT NULL DEFAULT false;
ALTER TABLE game_rounds DROP CONSTRAINT game_rounds_state_check;
ALTER TABLE game_rounds ADD CONSTRAINT game_rounds_state_check CHECK(state IN ('CREATED','SCHEDULED','OPEN_FOR_SALES','SALES_CLOSED','READY','DRAWING','VERIFYING','SETTLING','COMPLETED','CANCELLED','FAILED'));
ALTER TABLE instant_commitments ADD COLUMN version_id uuid REFERENCES game_versions(id);
CREATE TABLE round_state_changes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid NOT NULL REFERENCES game_rounds(id),from_state text NOT NULL,to_state text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER state_changes_immutable BEFORE UPDATE OR DELETE ON round_state_changes FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE round_snapshots(round_id uuid NOT NULL REFERENCES game_rounds(id),seq integer NOT NULL,public_state jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(round_id,seq));
CREATE TRIGGER snapshots_immutable BEFORE UPDATE OR DELETE ON round_snapshots FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE wallet_reservations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid UNIQUE REFERENCES game_rounds(id),source_account_id uuid NOT NULL REFERENCES ledger_accounts(id),held_account_id uuid NOT NULL REFERENCES ledger_accounts(id),amount bigint NOT NULL CHECK(amount>0),status text NOT NULL CHECK(status IN ('HELD','CONSUMED','RELEASED')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE admin_adjustments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),kind text NOT NULL CHECK(kind IN ('USER_ADJUSTMENT','TREASURY_FUND')),amount bigint NOT NULL CHECK(amount<>0),reason text NOT NULL CHECK(length(reason)>=5),requested_by uuid NOT NULL REFERENCES users(id),approved_by uuid REFERENCES users(id),status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),decision_reason text,transaction_id uuid REFERENCES ledger_transactions(id),created_at timestamptz NOT NULL DEFAULT now(),decided_at timestamptz,CHECK(approved_by IS NULL OR approved_by<>requested_by),CHECK((kind='TREASURY_FUND' AND user_id IS NULL AND amount>0) OR (kind='USER_ADJUSTMENT' AND user_id IS NOT NULL)));
CREATE TABLE support_cases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),subject text NOT NULL,message text NOT NULL,status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ANSWERED','CLOSED')),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX support_user ON support_cases(user_id,created_at);
CREATE TABLE support_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES support_cases(id),author_id uuid NOT NULL REFERENCES users(id),message text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER support_messages_immutable BEFORE UPDATE OR DELETE ON support_messages FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),type text NOT NULL,message text NOT NULL,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX notifications_user ON notifications(user_id,created_at);
CREATE TABLE room_schedules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),config jsonb NOT NULL,interval_seconds integer NOT NULL CHECK(interval_seconds BETWEEN 60 AND 604800),next_open_at timestamptz NOT NULL,enabled boolean NOT NULL DEFAULT true,created_by uuid NOT NULL REFERENCES users(id));
CREATE INDEX schedules_due ON room_schedules(next_open_at) WHERE enabled;
CREATE OR REPLACE FUNCTION round_rules_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.name,NEW.variant,NEW.price,NEW.max_cards,NEW.prize_bps,NEW.min_players,NEW.sales_close_at,NEW.ball_interval_ms,NEW.commitment,NEW.seed_encrypted,NEW.prize_account_id,NEW.rules,NEW.version_id,NEW.opens_at) IS DISTINCT FROM ROW(OLD.name,OLD.variant,OLD.price,OLD.max_cards,OLD.prize_bps,OLD.min_players,OLD.sales_close_at,OLD.ball_interval_ms,OLD.commitment,OLD.seed_encrypted,OLD.prize_account_id,OLD.rules,OLD.version_id,OLD.opens_at) THEN RAISE EXCEPTION 'RULES_IMMUTABLE'; END IF;
 IF OLD.state IN ('COMPLETED','CANCELLED','FAILED') THEN RAISE EXCEPTION 'ROUND_TERMINAL'; END IF;
 IF NEW.state<>OLD.state AND NOT (
 (OLD.state='CREATED' AND NEW.state IN ('SCHEDULED','CANCELLED')) OR
 (OLD.state='SCHEDULED' AND NEW.state IN ('OPEN_FOR_SALES','CANCELLED')) OR
 (OLD.state='OPEN_FOR_SALES' AND NEW.state IN ('SALES_CLOSED','CANCELLED')) OR
 (OLD.state='SALES_CLOSED' AND NEW.state IN ('READY','CANCELLED')) OR
 (OLD.state='READY' AND NEW.state IN ('DRAWING','CANCELLED')) OR
 (OLD.state='DRAWING' AND NEW.state IN ('VERIFYING','FAILED')) OR
 (OLD.state='VERIFYING' AND NEW.state IN ('SETTLING','FAILED')) OR
 (OLD.state='SETTLING' AND NEW.state IN ('COMPLETED','FAILED'))) THEN RAISE EXCEPTION 'INVALID_STATE_TRANSITION'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION protect_decided_adjustment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status<>'PENDING' THEN RAISE EXCEPTION 'ADJUSTMENT_TERMINAL'; END IF;
 IF ROW(NEW.user_id,NEW.kind,NEW.amount,NEW.reason,NEW.requested_by) IS DISTINCT FROM ROW(OLD.user_id,OLD.kind,OLD.amount,OLD.reason,OLD.requested_by) THEN RAISE EXCEPTION 'REQUEST_IMMUTABLE'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER adjustment_guard BEFORE UPDATE ON admin_adjustments FOR EACH ROW EXECUTE FUNCTION protect_decided_adjustment();
CREATE TRIGGER adjustment_no_delete BEFORE DELETE ON admin_adjustments FOR EACH ROW EXECUTE FUNCTION immutable_record();
