-- Migration 013: Add audit columns and soft-delete support to tenants table.

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_by  TEXT,
    ADD COLUMN IF NOT EXISTS updated_by  TEXT,
    ADD COLUMN IF NOT EXISTS deleted     BOOLEAN NOT NULL DEFAULT FALSE;

-- Back-fill updated_at for existing rows
UPDATE tenants SET updated_at = created_at WHERE updated_at IS NULL;

-- Replace the column-level UNIQUE constraint on slug with a partial unique index
-- so that a deleted tenant's slug can be reused by a new tenant.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug_active
    ON tenants (slug)
    WHERE deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_tenants_deleted ON tenants (deleted);
