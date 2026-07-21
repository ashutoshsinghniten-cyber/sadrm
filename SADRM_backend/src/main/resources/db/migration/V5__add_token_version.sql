-- Migration 005: Token version column for session revocation
-- When a user's token_version is incremented, all previously issued JWTs become invalid.
-- Safe additive-only change — no existing data modified.

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
