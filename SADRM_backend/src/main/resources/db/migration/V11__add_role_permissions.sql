-- Migration 011: Role-permission junction table + initial permission assignments.

CREATE TABLE role_permissions (
    role_id       TEXT NOT NULL REFERENCES roles(id),
    permission_id TEXT NOT NULL REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

-- ── SUPERADMIN: all permissions ───────────────────────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_superadmin', id FROM permissions;

-- ── ADMIN: everything except TENANT_* management and PERMISSION_CREATE / PAGE_PERMISSIONS ──
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_admin', id FROM permissions
WHERE code NOT IN (
    'TENANT_READ', 'TENANT_CREATE', 'TENANT_UPDATE', 'TENANT_DELETE',
    'PERMISSION_CREATE',
    'PAGE_PERMISSIONS'
);

-- ── CLIENT: record operations, reporting, attendance ─────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_client', id FROM permissions
WHERE code IN (
    'BATCH_READ', 'BATCH_UPDATE',
    'ARCHIVED_RECORD_READ', 'ARCHIVED_RECORD_UPDATE',
    'BATCH_PAGE_READ', 'BATCH_PAGE_CREATE',
    'RECORD_LOCK_READ', 'RECORD_LOCK_CREATE', 'RECORD_LOCK_DELETE',
    'SSE_CONNECT',
    'DASHBOARD_VIEW',
    'REPORT_VIEW', 'REPORT_EXPORT',
    'ATTENDANCE_VIEW', 'ATTENDANCE_CREATE',
    'PAGE_DASHBOARD', 'PAGE_REPORTS', 'PAGE_ATTENDANCE'
);

-- ── USER: basic read-only access ──────────────────────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_user', id FROM permissions
WHERE code IN (
    'BATCH_READ',
    'ARCHIVED_RECORD_READ',
    'BATCH_PAGE_READ',
    'RECORD_LOCK_READ', 'RECORD_LOCK_CREATE', 'RECORD_LOCK_DELETE',
    'SSE_CONNECT',
    'DASHBOARD_VIEW',
    'PAGE_DASHBOARD'
);
