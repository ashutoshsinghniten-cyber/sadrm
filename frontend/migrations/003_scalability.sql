-- Migration 003: Scalability improvements
-- Safe additive-only changes — no DROP, no ALTER TYPE, no existing data modified.
-- Run against the live database:
--   psql $DATABASE_URL -f migrations/003_scalability.sql
-- The run-migrations.mjs startup script applies this automatically.

-- Fast status filtering without a full JSONB scan
CREATE INDEX IF NOT EXISTS idx_batches_status  ON batches ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_batches_updated ON batches (updated_at DESC);

-- Fast page lookups (used by lazy-fetch and AI extraction)
CREATE INDEX IF NOT EXISTS idx_batch_pages_lookup ON batch_pages (batch_id, record_id);

-- Record-level soft locks: prevents two HITL/QC operators editing the same record simultaneously.
-- Rows expire automatically (expires_at); the app deletes them on approve/hold/navigate-away.
CREATE TABLE IF NOT EXISTS record_locks (
  batch_id    TEXT        NOT NULL,
  record_id   TEXT        NOT NULL,
  locked_by   TEXT        NOT NULL,
  locked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  PRIMARY KEY (batch_id, record_id)
);
