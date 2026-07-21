-- Migration 009: Dynamic permissions table for RBAC system.

CREATE TABLE permissions (
    id          TEXT        PRIMARY KEY,
    code        TEXT        NOT NULL UNIQUE,
    description TEXT        NOT NULL,
    category    TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── User permissions ──────────────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_user_read',   'USER_READ',   'View users list and details',  'USER'),
('perm_user_create', 'USER_CREATE', 'Create new users',             'USER'),
('perm_user_update', 'USER_UPDATE', 'Update, activate, revoke users', 'USER'),
('perm_user_delete', 'USER_DELETE', 'Delete users permanently',     'USER');

-- ── Role permissions ──────────────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_role_read',   'ROLE_READ',   'View roles and their permissions', 'ROLE'),
('perm_role_create', 'ROLE_CREATE', 'Create custom roles',              'ROLE'),
('perm_role_update', 'ROLE_UPDATE', 'Update roles and assign permissions', 'ROLE'),
('perm_role_delete', 'ROLE_DELETE', 'Delete custom roles',              'ROLE');

-- ── Permission permissions ────────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_permission_read',   'PERMISSION_READ',   'View permissions list',    'PERMISSION'),
('perm_permission_create', 'PERMISSION_CREATE', 'Create new permissions (superadmin)', 'PERMISSION');

-- ── Tenant permissions ────────────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_tenant_read',   'TENANT_READ',   'View tenants',                    'TENANT'),
('perm_tenant_create', 'TENANT_CREATE', 'Create new tenants',              'TENANT'),
('perm_tenant_update', 'TENANT_UPDATE', 'Activate or deactivate tenants',  'TENANT'),
('perm_tenant_delete', 'TENANT_DELETE', 'Delete tenants permanently',      'TENANT');

-- ── Batch permissions ─────────────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_batch_read',   'BATCH_READ',   'View batches',             'BATCH'),
('perm_batch_create', 'BATCH_CREATE', 'Create and upsert batches','BATCH'),
('perm_batch_update', 'BATCH_UPDATE', 'Update batch status/data', 'BATCH'),
('perm_batch_delete', 'BATCH_DELETE', 'Bulk replace (delete all) batches', 'BATCH');

-- ── Archived record permissions ───────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_ar_read',   'ARCHIVED_RECORD_READ',   'View archived records',       'ARCHIVED_RECORD'),
('perm_ar_create', 'ARCHIVED_RECORD_CREATE', 'Create/upsert archived records', 'ARCHIVED_RECORD'),
('perm_ar_update', 'ARCHIVED_RECORD_UPDATE', 'Update archived record fields', 'ARCHIVED_RECORD');

-- ── Batch page permissions ────────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_bp_read',   'BATCH_PAGE_READ',   'View batch page previews and S3 URLs', 'BATCH_PAGE'),
('perm_bp_create', 'BATCH_PAGE_CREATE', 'Upload batch page files (PDF/image)',   'BATCH_PAGE');

-- ── Record lock permissions ───────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_rl_read',   'RECORD_LOCK_READ',   'View active record locks',  'RECORD_LOCK'),
('perm_rl_create', 'RECORD_LOCK_CREATE', 'Acquire a record lock',     'RECORD_LOCK'),
('perm_rl_delete', 'RECORD_LOCK_DELETE', 'Release a record lock',     'RECORD_LOCK');

-- ── SSE permission ────────────────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_sse_connect', 'SSE_CONNECT', 'Connect to real-time event stream', 'SSE');

-- ── AI permission ─────────────────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_ai_extract', 'AI_EXTRACT', 'Use AI extraction endpoint', 'AI');

-- ── Dashboard permission ──────────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_dashboard_view', 'DASHBOARD_VIEW', 'Access the main dashboard', 'DASHBOARD');

-- ── Report permissions ────────────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_report_view',   'REPORT_VIEW',   'View reports',         'REPORT'),
('perm_report_export', 'REPORT_EXPORT', 'Export report data',   'REPORT');

-- ── Attendance permissions ────────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_attendance_view',   'ATTENDANCE_VIEW',   'View attendance records',   'ATTENDANCE'),
('perm_attendance_create', 'ATTENDANCE_CREATE', 'Create attendance entries', 'ATTENDANCE');

-- ── Page access permissions ───────────────────────────────────────────────────
INSERT INTO permissions (id, code, description, category) VALUES
('perm_page_dashboard',   'PAGE_DASHBOARD',   'Access /dashboard page',    'PAGE'),
('perm_page_users',       'PAGE_USERS',       'Access /users page',        'PAGE'),
('perm_page_roles',       'PAGE_ROLES',       'Access /roles page',        'PAGE'),
('perm_page_permissions', 'PAGE_PERMISSIONS', 'Access /permissions page',  'PAGE'),
('perm_page_reports',     'PAGE_REPORTS',     'Access /reports page',      'PAGE'),
('perm_page_settings',    'PAGE_SETTINGS',    'Access /settings page',     'PAGE'),
('perm_page_attendance',  'PAGE_ATTENDANCE',  'Access /attendance page',   'PAGE');
