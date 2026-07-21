CREATE INDEX IF NOT EXISTS idx_batches_status  ON batches ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_batches_updated ON batches (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_batch_pages_lookup ON batch_pages (batch_id, record_id);

CREATE TABLE IF NOT EXISTS record_locks (
  batch_id    TEXT        NOT NULL,
  record_id   TEXT        NOT NULL,
  locked_by   TEXT        NOT NULL,
  locked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  PRIMARY KEY (batch_id, record_id)
);
