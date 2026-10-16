CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 password_hash text NOT NULL, email_verified boolean NOT NULL DEFAULT false,
 role text NOT NULL DEFAULT 'player' CHECK(role IN ('player','superadmin','operator','auditor')),
 blocked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE user_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text UNIQUE NOT NULL, csrf_token text NOT NULL, mfa_verified boolean NOT NULL DEFAULT false, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE identity_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text UNIQUE NOT NULL, purpose text NOT NULL CHECK(purpose IN ('verify','reset')), expires_at timestamptz NOT NULL);
CREATE TABLE mfa_credentials (user_id uuid PRIMARY KEY REFERENCES users(id), secret_encrypted text NOT NULL, enabled boolean NOT NULL DEFAULT false, last_counter bigint NOT NULL DEFAULT -1);
CREATE TABLE responsible_gaming_limits (user_id uuid PRIMARY KEY REFERENCES users(id), daily_limit bigint NOT NULL DEFAULT 100000 CHECK(daily_limit>=0), paused_until timestamptz, self_excluded boolean NOT NULL DEFAULT false);
CREATE TABLE ledger_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid UNIQUE REFERENCES users(id), kind text NOT NULL CHECK(kind IN ('user','promotional','house','prize')), reference text UNIQUE);
INSERT INTO ledger_accounts(kind,reference) VALUES ('promotional','demo-source'),('house','house');
CREATE TABLE wallets (user_id uuid PRIMARY KEY REFERENCES users(id), account_id uuid NOT NULL UNIQUE REFERENCES ledger_accounts(id), balance bigint NOT NULL DEFAULT 0 CHECK(balance>=0), version bigint NOT NULL DEFAULT 0);
CREATE TABLE ledger_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, reference text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ledger_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL REFERENCES ledger_transactions(id), account_id uuid NOT NULL REFERENCES ledger_accounts(id), amount bigint NOT NULL CHECK(amount<>0), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ledger_entries_account ON ledger_entries(account_id,created_at,id);
CREATE INDEX ledger_entries_transaction ON ledger_entries(transaction_id);
CREATE FUNCTION immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'APPEND_ONLY'; END $$;
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER ledger_transactions_immutable BEFORE UPDATE OR DELETE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE FUNCTION balanced_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total numeric; count_entries integer; BEGIN
 SELECT COALESCE(sum(amount),0),count(*) INTO total,count_entries FROM ledger_entries WHERE transaction_id=NEW.id;
 IF total<>0 OR count_entries<2 THEN RAISE EXCEPTION 'UNBALANCED_TRANSACTION'; END IF; RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER balanced_ledger AFTER INSERT ON ledger_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION balanced_transaction();
-- A posted transaction cannot receive extra lines in a later transaction.
CREATE FUNCTION entries_same_transaction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM ledger_transactions WHERE id=NEW.transaction_id AND xmin::text=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'TRANSACTION_ALREADY_POSTED'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER entries_posting_guard BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION entries_same_transaction();
CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id), action text NOT NULL, subject text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE idempotency_keys (user_id uuid NOT NULL REFERENCES users(id), operation text NOT NULL, key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL, PRIMARY KEY(user_id,operation,key), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE game_rounds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, variant integer NOT NULL CHECK(variant IN (75,80,90)), state text NOT NULL CHECK(state IN ('OPEN_FOR_SALES','DRAWING','SETTLING','COMPLETED','CANCELLED')),
 price bigint NOT NULL CHECK(price>0), max_cards integer NOT NULL CHECK(max_cards BETWEEN 1 AND 24), prize_bps integer NOT NULL CHECK(prize_bps BETWEEN 1 AND 10000), min_players integer NOT NULL CHECK(min_players>0),
 sales_close_at timestamptz NOT NULL, ball_interval_ms integer NOT NULL CHECK(ball_interval_ms BETWEEN 1000 AND 10000), next_ball_at timestamptz,
 commitment text NOT NULL, seed_encrypted text NOT NULL, seed_revealed text, manifest_hash text, context text,
 sequence_encrypted text, current_position integer NOT NULL DEFAULT 0, event_seq integer NOT NULL DEFAULT 0, prize_account_id uuid NOT NULL REFERENCES ledger_accounts(id),
 rules jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rounds_due ON game_rounds(state,next_ball_at,sales_close_at);
CREATE TABLE card_purchases (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), round_id uuid NOT NULL REFERENCES game_rounds(id), quantity integer NOT NULL CHECK(quantity>0), total bigint NOT NULL CHECK(total>0), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX purchases_round_user ON card_purchases(round_id,user_id);
CREATE TABLE bingo_cards (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_id uuid NOT NULL REFERENCES card_purchases(id), user_id uuid NOT NULL REFERENCES users(id), round_id uuid NOT NULL REFERENCES game_rounds(id), card jsonb NOT NULL);
CREATE INDEX cards_round ON bingo_cards(round_id,id);
CREATE INDEX cards_user_round ON bingo_cards(user_id,round_id);
CREATE TRIGGER card_immutable BEFORE UPDATE OR DELETE ON bingo_cards FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE drawn_balls (round_id uuid NOT NULL REFERENCES game_rounds(id), position integer NOT NULL CHECK(position>0), number integer NOT NULL CHECK(number BETWEEN 1 AND 90), PRIMARY KEY(round_id,position), UNIQUE(round_id,number));
CREATE TRIGGER drawn_immutable BEFORE UPDATE OR DELETE ON drawn_balls FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE prize_awards (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL REFERENCES game_rounds(id), card_id uuid NOT NULL REFERENCES bingo_cards(id), user_id uuid NOT NULL REFERENCES users(id), pattern text NOT NULL, amount bigint NOT NULL CHECK(amount>=0), UNIQUE(round_id,card_id,pattern));
CREATE TRIGGER awards_immutable BEFORE UPDATE OR DELETE ON prize_awards FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE game_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid NOT NULL REFERENCES game_rounds(id), seq integer NOT NULL, type text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(round_id,seq));
CREATE TRIGGER events_immutable BEFORE UPDATE OR DELETE ON game_events FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TABLE outbox_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL UNIQUE REFERENCES game_events(id), published_at timestamptz, attempts integer NOT NULL DEFAULT 0);
CREATE INDEX outbox_pending ON outbox_events(id) WHERE published_at IS NULL;
CREATE TABLE reconciliation_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), discrepancies jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE email_outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient text NOT NULL, subject text NOT NULL, body text NOT NULL, delivered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION round_rules_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.name,NEW.variant,NEW.price,NEW.max_cards,NEW.prize_bps,NEW.min_players,NEW.sales_close_at,NEW.ball_interval_ms,NEW.commitment,NEW.seed_encrypted,NEW.prize_account_id,NEW.rules) IS DISTINCT FROM ROW(OLD.name,OLD.variant,OLD.price,OLD.max_cards,OLD.prize_bps,OLD.min_players,OLD.sales_close_at,OLD.ball_interval_ms,OLD.commitment,OLD.seed_encrypted,OLD.prize_account_id,OLD.rules) THEN RAISE EXCEPTION 'RULES_IMMUTABLE'; END IF;
 IF OLD.state IN ('COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'ROUND_TERMINAL'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER round_rules_guard BEFORE UPDATE ON game_rounds FOR EACH ROW EXECUTE FUNCTION round_rules_immutable();
