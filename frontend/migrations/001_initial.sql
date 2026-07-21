-- Run this file against your PostgreSQL database to create all required tables.
-- psql -U postgres -d sadrmp -f migrations/001_initial.sql

CREATE TABLE IF NOT EXISTS users (
  username    TEXT PRIMARY KEY,
  salt        TEXT        NOT NULL,
  hash        TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'user',
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_meta (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
  id          TEXT PRIMARY KEY,
  data        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS archived_records (
  id          TEXT PRIMARY KEY,
  data        JSONB       NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS batch_pages (
  batch_id    TEXT        NOT NULL,
  record_id   TEXT        NOT NULL,
  filename    TEXT        NOT NULL,
  file_base64 TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (batch_id, record_id, filename)
);
