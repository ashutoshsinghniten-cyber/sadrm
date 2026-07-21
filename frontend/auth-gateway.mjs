import crypto from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { pool } from './db.mjs';

const pbkdf2 = promisify(crypto.pbkdf2);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    ...corsHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    try { resolve(raw ? JSON.parse(raw) : {}); }
    catch { reject(new Error('Invalid JSON body.')); }
  });
  req.on('error', () => reject(new Error('Failed to read request body.')));
});

const hashPassword = async (password, salt) => {
  const key = await pbkdf2(password, salt, 100_000, 32, 'sha256');
  return key.toString('base64url');
};

const verifyAdmin = (req) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw Object.assign(new Error('No token provided.'), { status: 401 });
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.role !== 'admin' && payload.role !== 'superadmin')
    throw Object.assign(new Error('Admin access required.'), { status: 403 });
  return payload;
};

export const createAuthGatewayMiddleware = ({ basePath = '/api/auth' } = {}) => {
  return async (req, res) => {
    if (!req.url?.startsWith(basePath)) return false;

    const method = req.method || 'GET';
    const url = new URL(req.url, `https://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;

    if (method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return true;
    }

    // POST /api/auth/register — public, only used when no users exist or by admin flow
    if (method === 'POST' && pathname === `${basePath}/register`) {
      try {
        const { username, password } = await readBody(req);
        const user = String(username || '').trim();
        if (!user || user.length < 3) { sendJson(res, 400, { error: 'Username must be at least 3 characters.' }); return true; }
        if (!password || password.length < 6) { sendJson(res, 400, { error: 'Password must be at least 6 characters.' }); return true; }

        const existing = await pool.query('SELECT username FROM users WHERE username = $1', [user]);
        if (existing.rows.length > 0) { sendJson(res, 409, { error: 'A user with that name already exists.' }); return true; }

        const countResult = await pool.query('SELECT COUNT(*) FROM users');
        const role = parseInt(countResult.rows[0].count, 10) === 0 ? 'admin' : 'user';

        const salt = crypto.randomBytes(16).toString('base64url');
        const hash = await hashPassword(password, salt);

        await pool.query(
          'INSERT INTO users (username, salt, hash, role) VALUES ($1, $2, $3, $4)',
          [user, salt, hash, role]
        );
        sendJson(res, 201, { username: user, role });
      } catch (err) {
        console.error('Register error:', err.message);
        sendJson(res, 500, { error: 'Registration failed.' });
      }
      return true;
    }

    // POST /api/auth/login
    if (method === 'POST' && pathname === `${basePath}/login`) {
      try {
        const { username, password } = await readBody(req);
        const user = String(username || '').trim();
        if (!user || !password) { sendJson(res, 400, { error: 'Enter both username and password.' }); return true; }

        const result = await pool.query('SELECT * FROM users WHERE username = $1', [user]);
        if (result.rows.length === 0) { sendJson(res, 401, { error: 'Invalid credentials.' }); return true; }

        const record = result.rows[0];

        if (record.active === false) {
          sendJson(res, 403, { error: 'Account has been revoked. Contact your administrator.' });
          return true;
        }

        const presented = await hashPassword(password, record.salt);
        if (presented !== record.hash) { sendJson(res, 401, { error: 'Invalid credentials.' }); return true; }

        const secret = process.env.JWT_SECRET;
        if (!secret) { sendJson(res, 500, { error: 'JWT_SECRET not configured on server.' }); return true; }

        const token = jwt.sign({ sub: user, role: record.role }, secret, { expiresIn: '8h' });
        sendJson(res, 200, { token, username: user, role: record.role });
      } catch (err) {
        console.error('Login error:', err.message);
        sendJson(res, 500, { error: 'Login failed.' });
      }
      return true;
    }

    // GET /api/auth/users — public list of usernames (used by legacy register flow)
    if (method === 'GET' && pathname === `${basePath}/users`) {
      try {
        const result = await pool.query('SELECT username FROM users ORDER BY created_at');
        sendJson(res, 200, { usernames: result.rows.map((r) => r.username) });
      } catch (err) {
        console.error('List users error:', err.message);
        sendJson(res, 500, { error: 'Could not list users.' });
      }
      return true;
    }

    // GET /api/auth/me — verify JWT and return username + role
    if (method === 'GET' && pathname === `${basePath}/me`) {
      try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) { sendJson(res, 401, { error: 'No token provided.' }); return true; }
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        sendJson(res, 200, { username: payload.sub, role: payload.role });
      } catch {
        sendJson(res, 401, { error: 'Invalid or expired token.' });
      }
      return true;
    }

    // ── Admin-only routes ────────────────────────────────────────────────────

    // GET /api/auth/admin/users — list all users with full details
    if (method === 'GET' && pathname === `${basePath}/admin/users`) {
      try {
        const requester = verifyAdmin(req);
        const result = await pool.query(
          'SELECT username, role, active, created_at FROM users ORDER BY created_at'
        );
        sendJson(res, 200, { users: result.rows });
      } catch (err) {
        sendJson(res, err.status || 500, { error: err.message || 'Could not list users.' });
      }
      return true;
    }

    // POST /api/auth/admin/users — create user with explicit role
    if (method === 'POST' && pathname === `${basePath}/admin/users`) {
      try {
        const requester = verifyAdmin(req);
        const { username, password, role } = await readBody(req);
        const user = String(username || '').trim();

        // superadmin role requires superadmin privileges; client can be created by admin or superadmin
        let assignedRole = 'user';
        if (role === 'admin') {
          assignedRole = 'admin';
        } else if (role === 'client') {
          assignedRole = 'client';
        } else if (role === 'superadmin') {
          if (requester.role !== 'superadmin') {
            sendJson(res, 403, { error: 'Only superadmin can create superadmin accounts.' });
            return true;
          }
          assignedRole = role;
        }

        if (!user || user.length < 3) { sendJson(res, 400, { error: 'Username must be at least 3 characters.' }); return true; }
        if (!password || password.length < 6) { sendJson(res, 400, { error: 'Password must be at least 6 characters.' }); return true; }

        const existing = await pool.query('SELECT username FROM users WHERE username = $1', [user]);
        if (existing.rows.length > 0) { sendJson(res, 409, { error: 'A user with that name already exists.' }); return true; }

        const salt = crypto.randomBytes(16).toString('base64url');
        const hash = await hashPassword(password, salt);

        await pool.query(
          'INSERT INTO users (username, salt, hash, role, active) VALUES ($1, $2, $3, $4, TRUE)',
          [user, salt, hash, assignedRole]
        );
        sendJson(res, 201, { username: user, role: assignedRole });
      } catch (err) {
        console.error('Admin create user error:', err.message);
        sendJson(res, err.status || 500, { error: err.message || 'Failed to create user.' });
      }
      return true;
    }

    // PATCH /api/auth/admin/users/:username/revoke
    const revokeMatch = pathname.match(new RegExp(`^${basePath}/admin/users/([^/]+)/revoke$`));
    if (method === 'PATCH' && revokeMatch) {
      try {
        const requester = verifyAdmin(req);
        const target = decodeURIComponent(revokeMatch[1]);
        if (target === requester.sub) { sendJson(res, 400, { error: 'You cannot revoke your own account.' }); return true; }
        const r = await pool.query('UPDATE users SET active = FALSE WHERE username = $1 RETURNING username', [target]);
        if (r.rows.length === 0) { sendJson(res, 404, { error: 'User not found.' }); return true; }
        sendJson(res, 200, { ok: true, username: target, active: false });
      } catch (err) {
        sendJson(res, err.status || 500, { error: err.message || 'Failed to revoke user.' });
      }
      return true;
    }

    // PATCH /api/auth/admin/users/:username/activate
    const activateMatch = pathname.match(new RegExp(`^${basePath}/admin/users/([^/]+)/activate$`));
    if (method === 'PATCH' && activateMatch) {
      try {
        verifyAdmin(req);
        const target = decodeURIComponent(activateMatch[1]);
        const r = await pool.query('UPDATE users SET active = TRUE WHERE username = $1 RETURNING username', [target]);
        if (r.rows.length === 0) { sendJson(res, 404, { error: 'User not found.' }); return true; }
        sendJson(res, 200, { ok: true, username: target, active: true });
      } catch (err) {
        sendJson(res, err.status || 500, { error: err.message || 'Failed to activate user.' });
      }
      return true;
    }

    // PATCH /api/auth/admin/users/:username/role
    const roleMatch = pathname.match(new RegExp(`^${basePath}/admin/users/([^/]+)/role$`));
    if (method === 'PATCH' && roleMatch) {
      try {
        const requester = verifyAdmin(req);
        const target = decodeURIComponent(roleMatch[1]);
        if (target === requester.sub) { sendJson(res, 400, { error: 'You cannot change your own role.' }); return true; }
        const { role } = await readBody(req);
        const isSuperAdmin = requester.role === 'superadmin';
        const validRoles = isSuperAdmin ? ['user', 'admin', 'client', 'superadmin'] : ['user', 'admin', 'client'];
        if (!validRoles.includes(role)) {
          sendJson(res, 400, { error: isSuperAdmin ? 'Role must be "user", "admin", "client", or "superadmin".' : 'Role must be "admin" or "user".' });
          return true;
        }
        const r = await pool.query('UPDATE users SET role = $1 WHERE username = $2 RETURNING username', [role, target]);
        if (r.rows.length === 0) { sendJson(res, 404, { error: 'User not found.' }); return true; }
        sendJson(res, 200, { ok: true, username: target, role });
      } catch (err) {
        sendJson(res, err.status || 500, { error: err.message || 'Failed to change role.' });
      }
      return true;
    }

    sendJson(res, 404, { error: 'Auth route not found.' });
    return true;
  };
};
