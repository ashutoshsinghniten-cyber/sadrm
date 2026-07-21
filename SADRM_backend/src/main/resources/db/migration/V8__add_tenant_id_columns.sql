-- Migration 008: Add tenant_id to all data tables.
-- Existing data is assigned to 'tenant_default'.
-- superadmin user stays with tenant_id = NULL (platform-level, no tenant boundary).

-- ── users ────────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id);
UPDATE users SET tenant_id = 'tenant_default' WHERE tenant_id IS NULL AND role != 'superadmin';

-- ── batches ──────────────────────────────────────────────────────────────────
ALTER TABLE batches ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id);
UPDATE batches SET tenant_id = 'tenant_default' WHERE tenant_id IS NULL;
ALTER TABLE batches ALTER COLUMN tenant_id SET NOT NULL;

-- ── archived_records ─────────────────────────────────────────────────────────
ALTER TABLE archived_records ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id);
UPDATE archived_records SET tenant_id = 'tenant_default' WHERE tenant_id IS NULL;
ALTER TABLE archived_records ALTER COLUMN tenant_id SET NOT NULL;

-- ── batch_pages — rebuild PK to include tenant_id ────────────────────────────
ALTER TABLE batch_pages DROP CONSTRAINT IF EXISTS batch_pages_pkey;
ALTER TABLE batch_pages ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id);
UPDATE batch_pages SET tenant_id = 'tenant_default' WHERE tenant_id IS NULL;
ALTER TABLE batch_pages ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE batch_pages ADD PRIMARY KEY (tenant_id, batch_id, record_id, filename);

-- ── record_locks — rebuild PK to include tenant_id ───────────────────────────
ALTER TABLE record_locks DROP CONSTRAINT IF EXISTS record_locks_pkey;
ALTER TABLE record_locks ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id);
UPDATE record_locks SET tenant_id = 'tenant_default' WHERE tenant_id IS NULL;
ALTER TABLE record_locks ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE record_locks ADD PRIMARY KEY (tenant_id, batch_id, record_id);

-- ── Performance indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_batches_tenant_updated
    ON batches (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_archived_tenant
    ON archived_records (tenant_id, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_batch_pages_tenant
    ON batch_pages (tenant_id, batch_id, record_id);

CREATE INDEX IF NOT EXISTS idx_record_locks_tenant
    ON record_locks (tenant_id, batch_id);

CREATE INDEX IF NOT EXISTS idx_users_tenant
    ON users (tenant_id);
