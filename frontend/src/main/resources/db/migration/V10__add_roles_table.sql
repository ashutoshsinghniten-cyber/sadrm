-- Migration 010: Dynamic roles table.
-- is_system = TRUE means the role is a platform/template role that cannot be modified or deleted by tenant admins.
-- tenant_id = NULL means the role is a system-level template available to all tenants.

CREATE TABLE roles (
    id          TEXT        PRIMARY KEY,
    name        TEXT        NOT NULL,
    description TEXT,
    tenant_id   TEXT        REFERENCES tenants(id),
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
    deleted     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by  TEXT,
    updated_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique role name per tenant (NULL tenant = system scope)
CREATE UNIQUE INDEX idx_roles_name_tenant
    ON roles (name, COALESCE(tenant_id, '')) WHERE deleted = FALSE;

CREATE INDEX idx_roles_tenant ON roles (tenant_id) WHERE deleted = FALSE;

-- ── System roles (template roles available platform-wide) ─────────────────────
INSERT INTO roles (id, name, description, tenant_id, active, is_system, created_by) VALUES
('role_superadmin', 'Super Admin', 'Platform-level administrator with unrestricted access', NULL, TRUE, TRUE, 'system'),
('role_admin',      'Admin',       'Tenant administrator — manages users, roles, and all tenant data', NULL, TRUE, TRUE, 'system'),
('role_client',     'Client',      'Tenant client — manages records and batch pages',                   NULL, TRUE, TRUE, 'system'),
('role_user',       'User',        'Basic tenant user — read-only access to own tenant data',           NULL, TRUE, TRUE, 'system');
