CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id SMALLSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category_id SMALLINT REFERENCES categories(id),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'hard')),
  description_md TEXT NOT NULL,
  requires_network BOOLEAN NOT NULL DEFAULT false,
  requires_systemd BOOLEAN NOT NULL DEFAULT false,
  resource_limits JSONB,
  time_limit_minutes SMALLINT,
  content_version INT NOT NULL DEFAULT 1,
  solution_md TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  order_index SMALLINT NOT NULL,
  text TEXT NOT NULL,
  UNIQUE (challenge_id, order_index)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES challenges(id),
  container_id TEXT,
  container_name TEXT,
  status TEXT NOT NULL DEFAULT 'starting'
    CHECK (status IN ('starting', 'running', 'checking', 'solved', 'abandoned', 'error', 'expired')),
  hints_used SMALLINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  solved_at TIMESTAMPTZ
);
CREATE INDEX sessions_user_status_idx ON sessions (user_id, status);
CREATE INDEX sessions_challenge_idx ON sessions (challenge_id);

CREATE TABLE check_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  passed BOOLEAN NOT NULL,
  output TEXT
);
CREATE INDEX check_attempts_session_idx ON check_attempts (session_id);

CREATE TABLE progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  best_status TEXT NOT NULL DEFAULT 'unsolved' CHECK (best_status IN ('unsolved', 'solved')),
  attempts_count INT NOT NULL DEFAULT 0,
  hints_used_max SMALLINT NOT NULL DEFAULT 0,
  first_solved_at TIMESTAMPTZ,
  last_attempted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, challenge_id)
);
CREATE INDEX progress_user_idx ON progress (user_id);
