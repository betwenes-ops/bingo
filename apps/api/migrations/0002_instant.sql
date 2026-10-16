CREATE TABLE instant_commitments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),commitment text NOT NULL,seed_encrypted text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',used_at timestamptz);
CREATE INDEX instant_commitments_user ON instant_commitments(user_id,expires_at);
CREATE TABLE instant_plays(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),commitment_id uuid UNIQUE NOT NULL REFERENCES instant_commitments(id),stake bigint NOT NULL CHECK(stake>0),payout bigint NOT NULL CHECK(payout>=0),game_version text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX instant_plays_user ON instant_plays(user_id,created_at,id);
CREATE TRIGGER instant_plays_immutable BEFORE UPDATE OR DELETE ON instant_plays FOR EACH ROW EXECUTE FUNCTION immutable_record();
