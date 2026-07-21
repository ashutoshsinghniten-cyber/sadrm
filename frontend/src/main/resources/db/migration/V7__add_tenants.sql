-- Migration 007: Tenants table for multitenancy support.

CREATE TABLE tenants (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default tenant for all pre-existing data
INSERT INTO tenants (id, name, slug, active)
VALUES ('tenant_default', 'Default', 'default', true);
