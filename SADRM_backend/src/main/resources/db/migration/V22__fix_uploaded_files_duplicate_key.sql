-- Migration 022: Fix false-positive duplicate-file detection.
--
-- uploaded_files previously deduplicated on (tenant_id, file_content_hash) alone.
-- That flags two genuinely different documents as duplicates whenever any single
-- page happens to be byte-identical (e.g. a shared blank/boilerplate page reused
-- across unrelated donation records), even though their filenames differ. A file
-- should only be treated as an already-uploaded duplicate when BOTH the filename
-- and the content hash match for the tenant.

ALTER TABLE uploaded_files
    DROP CONSTRAINT IF EXISTS uq_uploaded_files_tenant_hash;

ALTER TABLE uploaded_files
    ADD CONSTRAINT uq_uploaded_files_tenant_hash_name UNIQUE (tenant_id, file_content_hash, file_name);

DROP INDEX IF EXISTS idx_uploaded_files_tenant_hash;

CREATE INDEX IF NOT EXISTS idx_uploaded_files_tenant_hash_name
    ON uploaded_files (tenant_id, file_content_hash, file_name);
