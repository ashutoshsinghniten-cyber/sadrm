-- Migration 015: Performance indexes.
-- Most tenant-scoped indexes were added in V3 and V8. This migration adds the
-- remaining missing indexes from the scalability audit plus GIN trigram indexes
-- required by the Phase 3 server-side ILIKE search added to ArchivedRecordService.
--
-- All indexes use IF NOT EXISTS so re-running the migration is safe.

-- ── pg_trgm: required for GIN trigram ILIKE indexes ──────────────────────────
-- Enables efficient ILIKE / ~ pattern matching at scale.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── archived_records: full-blob trigram index for ?q= free-text search ───────
-- Powers: data::text ILIKE '%query%' in ArchivedRecordService.getAll
-- Without this, every search does a full sequential scan of the JSONB column.
CREATE INDEX IF NOT EXISTS idx_archived_data_text_trgm
    ON archived_records USING gin ((data::text) gin_trgm_ops);

-- ── archived_records: bank field trigram index for ?bank= filter ──────────────
-- Powers: data->'fields'->>'bank' ILIKE '%bankname%' in ArchivedRecordService.getAll
CREATE INDEX IF NOT EXISTS idx_archived_bank_trgm
    ON archived_records USING gin ((data->'fields'->>'bank') gin_trgm_ops);

-- ── archived_records: donor name index for donor-asc sort ────────────────────
-- Powers: ORDER BY LOWER(COALESCE(data->'fields'->>'donorName', '')) ASC
CREATE INDEX IF NOT EXISTS idx_archived_donor_name
    ON archived_records (LOWER(COALESCE(data->'fields'->>'donorName', '')));

-- ── users: composite index for paginated listing sorted by username ───────────
-- Powers: findAllByTenantId(tenantId, PageRequest sorted by username ASC)
-- idx_users_tenant (V8) covers tenant_id alone; this composite eliminates the
-- sort step when listing users within a tenant.
CREATE INDEX IF NOT EXISTS idx_users_tenant_username
    ON users (tenant_id, username);

-- ── record_locks: expiry scan index ──────────────────────────────────────────
-- Powers: DELETE FROM record_locks WHERE expires_at < NOW() (stale lock cleanup)
-- Without this, every cleanup call does a full table scan.
CREATE INDEX IF NOT EXISTS idx_record_locks_expires_at
    ON record_locks (expires_at);
