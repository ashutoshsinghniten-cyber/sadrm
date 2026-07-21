-- Migration 018: Grant AI_EXTRACT permission to role_client.
--
-- AI_EXTRACT was defined in V9 but never added to role_client in V11.
-- Without this, any user with the client role gets a 403 on
-- POST /api/runtime/extraction and AI extraction silently fails.

INSERT INTO role_permissions (role_id, permission_id)
VALUES ('role_client', 'perm_ai_extract')
ON CONFLICT DO NOTHING;
