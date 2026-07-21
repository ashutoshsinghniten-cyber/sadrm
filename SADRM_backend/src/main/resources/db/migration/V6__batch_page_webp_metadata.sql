-- Migration 006: Metadata required for S3/WebP preview pages.
-- Keep file_base64 for backward compatibility with older rows and existing fallback code.

ALTER TABLE batch_pages ADD COLUMN IF NOT EXISTS page_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE batch_pages ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE batch_pages ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE batch_pages ADD COLUMN IF NOT EXISTS original_s3_key TEXT;
ALTER TABLE batch_pages ADD COLUMN IF NOT EXISTS quality NUMERIC(4,2);
ALTER TABLE batch_pages ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE batch_pages ADD COLUMN IF NOT EXISTS height INTEGER;
ALTER TABLE batch_pages ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
ALTER TABLE batch_pages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'READY';

CREATE INDEX IF NOT EXISTS idx_batch_pages_batch_record_page
  ON batch_pages (batch_id, record_id, page_number);

CREATE INDEX IF NOT EXISTS idx_batch_pages_status
  ON batch_pages (status);

CREATE INDEX IF NOT EXISTS idx_batch_pages_original_filename
  ON batch_pages (batch_id, record_id, original_filename);
