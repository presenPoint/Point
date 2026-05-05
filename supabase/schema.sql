-- Point — point-agents.md DB 스키마 (Supabase)

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id),
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  total_duration_sec INTEGER,
  composite_score  SMALLINT,
  status           TEXT NOT NULL DEFAULT 'IDLE',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS files (
  file_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id   UUID REFERENCES sessions(session_id),
  storage_path TEXT NOT NULL,
  filename     TEXT NOT NULL,
  size_bytes   INTEGER,
  summary      TEXT,
  keywords     TEXT[],
  uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES sessions(session_id),
  question    TEXT NOT NULL,
  user_answer TEXT,
  score       SMALLINT,
  feedback    TEXT,
  turn        SMALLINT
);

CREATE TABLE IF NOT EXISTS speech_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES sessions(session_id),
  timestamp   BIGINT NOT NULL,
  type        TEXT NOT NULL,
  value       JSONB
);

CREATE TABLE IF NOT EXISTS nonverbal_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES sessions(session_id),
  timestamp   BIGINT NOT NULL,
  type        TEXT NOT NULL,
  value       JSONB
);

CREATE TABLE IF NOT EXISTS qa_exchanges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES sessions(session_id),
  turn        SMALLINT NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT,
  score       SMALLINT,
  comment     TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  session_id       UUID PRIMARY KEY REFERENCES sessions(session_id),
  speech_score     SMALLINT,
  nonverbal_score  SMALLINT,
  qa_score         SMALLINT,
  composite_score  SMALLINT,
  strengths        TEXT[],
  improvements     TEXT[],
  generated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE speech_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nonverbal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Migration: extended session report columns
-- Run once against your Supabase project if upgrading from the initial schema.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS speech_score     SMALLINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS nonverbal_score  SMALLINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qa_score         SMALLINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS strengths        JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS improvements     JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS persona_style_coaching JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS transcript_log   JSONB;
