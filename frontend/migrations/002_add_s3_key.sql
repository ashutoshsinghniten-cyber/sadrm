-- Migration: store S3 object key instead of base64 in batch_pages
-- Run AFTER uploading existing base64 data to S3 via scripts/migrate-to-s3.mjs

ALTER TABLE batch_pages ADD COLUMN IF NOT EXISTS s3_key TEXT;
