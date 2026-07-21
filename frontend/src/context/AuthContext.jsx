import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authClient } from '../lib/axiosInstance.js';

const AuthContext = createContext(null);

const JWT_KEY = 'idi.playground.jwt.v1';

function parseJwtPayload(token) {
  try {
    const [, payload] = token.split('.');
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function readStoredToken() {
  try { return sessionStorage.getItem(JWT_KEY); } catch { return null; }
}

// Merges login response + /me response into the full auth state shape.
// Falls back to JWT claims for role/roleId since /me doesn't return them.
// auth: { username, role, token, tenantId, roleId, authorities: Set<string> }
function buildAuth(token, data) {
  const claims = parseJwtPayload(token) ?? {};
  return {
    username: data.username,
    role: data.role ?? claims.role ?? null,
    token,
    tenantId: data.tenantId ?? claims.tenantId ?? null,
    roleId: data.roleId ?? claims.roleId ?? null,
    authorities: new Set(Array.isArray(data.authorities) ? data.authorities : []),
  };
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const token = readStoredToken();
    if (!token) { setLoading(false); return () => controller.abort(); }
    const payload = parseJwtPayload(token);
    if (!payload || payload.exp * 1000 < Date.now()) {
      sessionStorage.removeItem(JWT_KEY);
      setLoading(false);
      return () => controller.abort();
    }
    // Fetch full profile on page reload — needed to validate the stored token
    // and get the current authorities (roles may have changed since last login).
    authClient.get('/me', { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data?.username) setAuth(buildAuth(token, data));
        else sessionStorage.removeItem(JWT_KEY);
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.code === 'ERR_CANCELED') return;
        sessionStorage.removeItem(JWT_KEY);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const login = useCallback(async (username, password, tenantKey) => {
    // Login returns { token, username, role, tenantId, tenantKey, roleId, authorities }
    // tenantKey is required for non-superadmin users; superadmin may omit it.
    const body = { username, password };
    if (tenantKey) body.tenantKey = tenantKey;
    const data = await authClient.post('/login', body);
    sessionStorage.setItem(JWT_KEY, data.token);
    // Login response now includes authorities — skip the extra GET /me round-trip.
    // Fall back to /me only for older backend versions that omit the field.
    let profile = data;
    if (!Array.isArray(data.authorities) || data.authorities.length === 0) {
      try {
        const me = await authClient.get('/me');
        profile = { ...data, ...me };
      } catch {}
    }
    setAuth(buildAuth(data.token, profile));
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(JWT_KEY);
    setAuth(null);
  }, []);

  const hasPermission = useCallback((code) => auth?.authorities?.has(code) ?? false, [auth]);

  // Re-fetches /me and updates the in-memory auth snapshot.
  // Call this after any role-permission change so the frontend stays in sync
  // with what the backend's DynamicPermissionService now returns.
  const refreshAuth = useCallback(async () => {
    const token = readStoredToken();
    if (!token) return;
    try {
      const data = await authClient.get('/me');
      if (data?.username) setAuth(buildAuth(token, data));
    } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ auth, loading, login, logout, hasPermission, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// Convenience helper for permission checks; usable outside components.
// Prefer usePermission() hook (Phase 4B) inside components.
export function hasPermission(auth, code) {
  return auth?.authorities?.has(code) ?? false;
}
