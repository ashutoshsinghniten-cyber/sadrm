ALTER TABLE archived_records
    ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_modified_by TEXT;

UPDATE archived_records
SET updated_at = archived_at
WHERE updated_at IS NULL;
