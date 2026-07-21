-- Migration 004: 5,000-batch workflow hardening
-- Safe additive-only changes. No existing workflow data is modified.

-- Speeds active-workflow loading by status and recency.
CREATE INDEX IF NOT EXISTS idx_batches_status_updated_at
  ON batches ((data->>'status'), updated_at DESC);

-- Speeds summary/count queries that still need sorted batch results.
CREATE INDEX IF NOT EXISTS idx_batches_updated_at_desc
  ON batches (updated_at DESC);

-- The frontend polls newest archived records first, so this prevents full scans
-- when repository/archive volume grows into thousands of records.
CREATE INDEX IF NOT EXISTS idx_archived_records_archived_at_desc
  ON archived_records (archived_at DESC, id DESC);

-- Speeds page restore/upload checks for large batches.
CREATE INDEX IF NOT EXISTS idx_batch_pages_batch_record_filename
  ON batch_pages (batch_id, record_id, filename);
