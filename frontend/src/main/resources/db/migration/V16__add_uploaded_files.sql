-- Phase 2: SHA-256 file content hash duplicate prevention
-- Creates uploaded_files table and adds file_content_hash column to batch_pages.

CREATE TABLE IF NOT EXISTS uploaded_files (
    id                  TEXT        NOT NULL,
    tenant_id           TEXT        NOT NULL,
    file_content_hash   TEXT        NOT NULL,
    hash_algorithm      TEXT        NOT NULL DEFAULT 'SHA-256',
    file_name           TEXT        NOT NULL,
    file_size_bytes     BIGINT      NOT NULL,
    batch_id            TEXT,
    record_id           TEXT,
    s3_key              TEXT,
    upload_status       TEXT        NOT NULL DEFAULT 'UPLOADED',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_record_id  TEXT,
    CONSTRAINT pk_uploaded_files PRIMARY KEY (id),
    CONSTRAINT uq_uploaded_files_tenant_hash UNIQUE (tenant_id, file_content_hash)
);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_tenant_hash
    ON uploaded_files (tenant_id, file_content_hash);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_batch_id
    ON uploaded_files (batch_id)
    WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_uploaded_files_tenant_batch
    ON uploaded_files (tenant_id, batch_id)
    WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_uploaded_files_upload_status
    ON uploaded_files (upload_status);

-- Add nullable file_content_hash column to batch_pages for audit trail.
-- Existing rows remain NULL; new uploads will populate this field.
ALTER TABLE batch_pages
    ADD COLUMN IF NOT EXISTS file_content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_batch_pages_content_hash
    ON batch_pages (tenant_id, file_content_hash)
    WHERE file_content_hash IS NOT NULL;
