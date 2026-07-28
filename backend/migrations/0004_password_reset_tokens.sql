-- Password-reset tokens. Only the SHA-256 hash of the reset token is ever stored (never the
-- plaintext) — if this table leaks, the hashed values are useless to an attacker without also
-- breaking SHA-256. `used_at` makes a token single-use (set once consumed by
-- resetPasswordWithToken); `expires_at` gives it a short (1 hour) lifetime regardless. See
-- decisions/00NN-*.md for the full reasoning.
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_token_hash_idx ON password_reset_tokens (token_hash);
