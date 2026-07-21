// ─── Enterprise Axios instance ────────────────────────────────────────────────
//
// Single, pre-configured Axios client shared across the entire app.
//
// Features:
//   • JWT injected on every request via request interceptor
//   • 30-second timeout — prevents hung requests under bad network
//   • Automatic 401 → redirect to /login (token expired or revoked)
//   • 403 → "Access Denied" toast; error propagates so callers can branch
//   • 409 → normalized error propagates (record lock conflict handled by caller)
//   • Response envelope unwrapping: consumers receive `response.data` directly
//   • Named exports for domain-specific clients (authClient, dataClient, runtimeClient)
//     that prepend their base path so call sites don't repeat /api/auth/... everywhere
//
// Usage:
//   import axiosInstance from './lib/axiosInstance';
//   const data = await axiosInstance.get('/data/batches', { params: { limit: 50 } });
//
// Domain clients:
//   import { authClient, dataClient } from './lib/axiosInstance';
//   const { token } = await authClient.post('/login', { username, password });
//   const batches  = await dataClient.get('/batches', { params: { limit: 50 } });

import axios from 'axios';
import { toastBus } from './toastBridge.js';

const JWT_KEY = 'idi.playground.jwt.v1';

const getToken = () => {
  try { return sessionStorage.getItem(JWT_KEY); } catch { return null; }
};

// ─── Base instance ────────────────────────────────────────────────────────────

const axiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ─── Request interceptor — inject JWT ────────────────────────────────────────

axiosInstance.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Response interceptor — error normalisation + status-specific handling ───

axiosInstance.interceptors.response.use(
  // Success: return the data payload directly so call sites skip `.data` chaining
  (response) => response.data,

  (error) => {
    const status  = error.response?.status;
    const message = error.response?.data?.error
      ?? error.response?.data?.message
      ?? error.message
      ?? 'Network error';

    // 401 Unauthorized — token expired or revoked; force logout
    if (status === 401) {
      try { sessionStorage.removeItem(JWT_KEY); } catch {}
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    // 403 Forbidden — insufficient permissions.
    // Only show the toast for state-changing requests (POST/PATCH/PUT/DELETE) where
    // the user explicitly triggered the action. Background GET polls (archived-record
    // sync, batch loading, etc.) are already handled gracefully by their call sites and
    // should NOT fire a toast — the route guard shows AccessDenied when relevant.
    if (status === 403) {
      const method = (error.config?.method || '').toLowerCase();
      if (method !== 'get') {
        toastBus.emit('error', 'Access Denied', message);
      }
    }

    // 409 Conflict — record lock or stale-update; propagate for caller to handle
    // (no automatic toast — callers like HITLScreen show contextual UI)

    const normalised = new Error(message);
    normalised.status = status;
    normalised.response = error.response;
    return Promise.reject(normalised);
  },
);

export default axiosInstance;

// ─── Domain clients ───────────────────────────────────────────────────────────
// Each wraps the base instance but prepends its path segment.
// Consumers import the specific client they need; no magic strings at call site.

const makeClient = (prefix) => ({
  get:    (path, config)       => axiosInstance.get(`${prefix}${path}`, config),
  post:   (path, data, config) => axiosInstance.post(`${prefix}${path}`, data, config),
  patch:  (path, data, config) => axiosInstance.patch(`${prefix}${path}`, data, config),
  put:    (path, data, config) => axiosInstance.put(`${prefix}${path}`, data, config),
  delete: (path, config)       => axiosInstance.delete(`${prefix}${path}`, config),
});

// /api/auth/...
export const authClient = makeClient('/auth');

// /api/data/...
export const dataClient = makeClient('/data');

// /api/runtime/...
export const runtimeClient = makeClient('/runtime');

// /api/admin/...
export const adminClient = makeClient('/admin');
