-- Migration 021: Cross-stage "flag" support on archived_records.
-- Replaces the old send-back-for-rework flow. Any stage (PrePrep/HITL/QC/Repository)
-- can flag an archived record for later review/deletion instead of routing it
-- backward through the pipeline.

ALTER TABLE archived_records
    ADD COLUMN IF NOT EXISTS flagged     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS flag_reason TEXT,
    ADD COLUMN IF NOT EXISTS flagged_by  TEXT,
    ADD COLUMN IF NOT EXISTS flagged_at  TIMESTAMPTZ;

-- Partial index — only indexes the (small) flagged subset, not the whole table.
CREATE INDEX IF NOT EXISTS idx_archived_records_flagged
    ON archived_records (flagged)
    WHERE flagged = TRUE;
