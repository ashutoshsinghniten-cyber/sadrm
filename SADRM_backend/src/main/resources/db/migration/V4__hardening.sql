CREATE INDEX IF NOT EXISTS idx_batches_status_updated_at
  ON batches ((data->>'status'), updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_batches_updated_at_desc
  ON batches (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_archived_records_archived_at_desc
  ON archived_records (archived_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_batch_pages_batch_record_filename
  ON batch_pages (batch_id, record_id, filename);
