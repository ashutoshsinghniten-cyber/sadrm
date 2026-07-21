// ─── Centralized API client ────────────────────────────────────────────────
//
// All fetch calls in the app should go through this module so that:
//   • Auth headers are injected from a single place
//   • Retry + exponential backoff is applied consistently
//   • AbortController integration works without per-call boilerplate
//   • Errors are typed and contain HTTP status codes for UX branching
//   • Pagination helpers are co-located with the API definitions
//
// Java backend migration note: when the backend switches to Spring Boot, only
// the base path constants and any endpoint paths need updating — all call-site
// code stays the same because it uses this API layer, not raw fetch().

const JWT_KEY = 'idi.playground.jwt.v1'

const getToken = () => {
  try { return sessionStorage.getItem(JWT_KEY) } catch { return null }
}

// ─── Typed error ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Retry on network errors and 429/5xx responses with exponential back-off.
// 401/403/404 are not retried — they are permanent failures.
const RETRYABLE = (status) => status === 429 || (status >= 500 && status < 600)

async function fetchWithRetry(url, options = {}, maxAttempts = 3) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, options)
      if (RETRYABLE(res.status) && attempt < maxAttempts - 1) {
        await delay(Math.min(500 * 2 ** attempt, 16_000))
        continue
      }
      return res
    } catch (err) {
      if (options.signal?.aborted) throw err
      if (attempt < maxAttempts - 1) {
        await delay(Math.min(500 * 2 ** attempt, 8_000))
        continue
      }
      throw err
    }
  }
}

function buildHeaders(extra = {}) {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function parseResponse(res) {
  const ct = res.headers.get('content-type') ?? ''
  const body = ct.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) {
    const message =
      typeof body === 'object' && body?.error
        ? body.error
        : String(body).slice(0, 300)
    throw new ApiError(res.status, message, body)
  }
  return body
}

// ─── Public API surface ─────────────────────────────────────────────────────

export const api = {
  get(path, { signal, params } = {}) {
    const url = params
      ? `${path}?${new URLSearchParams(filterEmpty(params))}`
      : path
    return fetchWithRetry(url, { method: 'GET', headers: buildHeaders(), signal })
      .then(parseResponse)
  },

  post(path, body, { signal } = {}) {
    return fetchWithRetry(path, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal,
    }).then(parseResponse)
  },

  patch(path, body, { signal } = {}) {
    return fetchWithRetry(path, {
      method: 'PATCH',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal,
    }).then(parseResponse)
  },

  put(path, body, { signal } = {}) {
    return fetchWithRetry(path, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal,
    }).then(parseResponse)
  },

  delete(path, { signal } = {}) {
    return fetchWithRetry(path, {
      method: 'DELETE',
      headers: buildHeaders(),
      signal,
    }).then(parseResponse)
  },
}

// ─── Pagination helpers ──────────────────────────────────────────────────────

// Remove undefined/null params so URLSearchParams doesn't stringify them.
function filterEmpty(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ''))
}

// Offset-based page params compatible with both the current Node.js gateway
// and the future Java/Spring Boot REST layer (Spring uses page/size or
// offset/limit conventions — adjust here without touching call sites).
export function pageParams({ page = 0, limit = 50 } = {}) {
  return { offset: page * limit, limit }
}

// ─── Domain API modules ──────────────────────────────────────────────────────

export const authApi = {
  login: (username, password, tenantKey) =>
    api.post('/api/auth/login', { username, password, ...(tenantKey ? { tenantKey } : {}) }),

  me: ({ signal } = {}) =>
    api.get('/api/auth/me', { signal }),

  users: {
    list: ({ signal } = {}) =>
      api.get('/api/auth/admin/users', { signal }),

    create: (data, { signal } = {}) =>
      api.post('/api/auth/admin/users', data, { signal }),

    revoke: (username, { signal } = {}) =>
      api.patch(`/api/auth/admin/users/${encodeURIComponent(username)}/revoke`, {}, { signal }),

    activate: (username, { signal } = {}) =>
      api.patch(`/api/auth/admin/users/${encodeURIComponent(username)}/activate`, {}, { signal }),

    setRole: (username, role, { signal } = {}) =>
      api.patch(`/api/auth/admin/users/${encodeURIComponent(username)}/role`, { role }, { signal }),
  },
}

export const archiveApi = {
  // Server-side paginated list with optional full-text search and filters.
  // Java backend should index `fields` JSONB columns for fast search.
  list: ({ page = 0, limit = 50, search, filters, signal } = {}) =>
    api.get('/api/data/archived-records', {
      signal,
      params: {
        ...pageParams({ page, limit }),
        ...(search ? { q: search } : {}),
        ...(filters ? filters : {}),
      },
    }),

  getById: (id, { signal } = {}) =>
    api.get(`/api/data/archived-records/${encodeURIComponent(id)}`, { signal }),

  history: (id, { signal } = {}) =>
    api.get(`/api/data/archived-records/${encodeURIComponent(id)}/history`, { signal }),

  patch: (id, data, { signal } = {}) =>
    api.patch(`/api/data/archived-records/${encodeURIComponent(id)}`, data, { signal }),
}

export const batchApi = {
  list: ({ page = 0, limit = 50, status, signal } = {}) =>
    api.get('/api/data/batches', {
      signal,
      params: { ...pageParams({ page, limit }), ...(status ? { status } : {}) },
    }),

  get: (id, { signal } = {}) =>
    api.get(`/api/data/batches/${encodeURIComponent(id)}`, { signal }),

  update: (id, data, { signal } = {}) =>
    api.patch(`/api/data/batches/${encodeURIComponent(id)}`, data, { signal }),
}

export const tenantsApi = {
  list: () => api.get('/api/admin/tenants'),
  get: (id) => api.get(`/api/admin/tenants/${id}`),
  create: (data) => api.post('/api/admin/tenants', data),
  update: (id, data) => api.put(`/api/admin/tenants/${id}`, data),
  delete: (id) => api.delete(`/api/admin/tenants/${id}`),
  activate: (id) => api.patch(`/api/admin/tenants/${id}/activate`, {}),
  deactivate: (id) => api.patch(`/api/admin/tenants/${id}/deactivate`, {}),
}

export const rolesApi = {
  list: () => api.get('/api/roles'),
  get: (id) => api.get(`/api/roles/${id}`),
  create: (data) => api.post('/api/roles', data),
  update: (id, data) => api.put(`/api/roles/${id}`, data),
  delete: (id) => api.delete(`/api/roles/${id}`),
  assignPermissions: (id, permissionIds) => api.post(`/api/roles/${id}/permissions`, { permissionIds }),
  patchPermissions: (id, { add, revoke }) => api.patch(`/api/roles/${id}/permissions`, { add, revoke }),
}

export const permissionsApi = {
  list: () => api.get('/api/permissions'),
  create: (data) => api.post('/api/permissions', data),
}

export const recordLocksApi = {
  list: (batchId) => api.get(`/api/data/record-locks/${batchId}`),
  acquire: (batchId, recordId, username) => api.post(`/api/data/record-locks/${batchId}/${recordId}`, { username }),
  release: (batchId, recordId) => api.delete(`/api/data/record-locks/${batchId}/${recordId}`),
}

export const batchPagesApi = {
  upload: (batchId, recordId, filename, file) => {
    const form = new FormData()
    form.append('batchId', batchId)
    form.append('recordId', recordId)
    if (filename) form.append('filename', filename)
    form.append('file', file)
    const token = getToken()
    return fetch('/api/data/batch-pages', {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
    }).then(parseResponse)
  },
  getPages: (batchId, recordId) => api.get(`/api/data/batch-pages/${batchId}/${recordId}`),
  getPage: (batchId, recordId, filename) => api.get(`/api/data/batch-pages/${batchId}/${recordId}/${encodeURIComponent(filename)}`),
}
