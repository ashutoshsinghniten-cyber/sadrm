-- Migration 012: Link users to dynamic roles table.
-- The role TEXT column is kept as a denormalized display field.
-- role_id is the authoritative FK used for permission loading.

ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id TEXT REFERENCES roles(id);

-- Migrate existing users to their corresponding system roles
UPDATE users SET role_id = 'role_superadmin' WHERE role = 'superadmin';
UPDATE users SET role_id = 'role_admin'      WHERE role = 'admin';
UPDATE users SET role_id = 'role_client'     WHERE role = 'client';
UPDATE users SET role_id = 'role_user'       WHERE role IN ('user', 'USER') OR (role IS NULL);

-- Index for permission lookups by role_id
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users (role_id);
