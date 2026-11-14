import { randomBytes } from 'node:crypto';
import { bindSessionPool, createAccountPool, verifyMySqlAccount } from '@/app/lib/db';

export const SESSION_COOKIE = 'cri_session';
export const SESSION_MAX_AGE_SECONDS = Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS) > 0
  ? Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS)
  : 60 * 60 * 8;
const MAX_ACTIVE_SESSIONS = 100;

// MySQL roles (created by database/security/setup_mysql_accounts.js) -> application role.
// Checked in priority order; the application role only drives UI/UX checks,
// MySQL enforces the real privileges of the logged-in account.
const MYSQL_ROLE_TO_APP_ROLE = [
  ['cri_admin_role', 'admin'],
  ['cri_reviewer_role', 'reviewer'],
  ['cri_viewer_role', 'viewer'],
];

// Server-side session store: token -> { user, pool, expiresAt }.
// Kept on globalThis so it survives module reloads in `next dev`.
// The MySQL password lives only inside the session's pool configuration in
// server memory; it is never placed in the cookie, the response or the browser.
const sessions = globalThis.__criMySqlSessions ||= new Map();

export class LoginError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function destroySession(token) {
  const session = sessions.get(token);
  if (!session) return;
  sessions.delete(token);
  session.pool.end().catch(() => {});
}

function sweepExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) destroySession(token);
  }
}

function appRoleFromMySqlRoles(mysqlRoles) {
  const active = String(mysqlRoles || '').toLowerCase();
  const match = MYSQL_ROLE_TO_APP_ROLE.find(([mysqlRole]) => active.includes(`\`${mysqlRole}\``));
  return match?.[1] || null;
}

// Verifies the credentials directly against MySQL, then opens a pool for the
// account. Returns the new session token and the public user object.
export async function createMySqlSession(username, password) {
  if (username.toLowerCase() === 'root' || username.toLowerCase().startsWith('mysql.')) {
    throw new LoginError('This MySQL account cannot be used to sign in to the application.', 403);
  }

  let verified;
  try {
    verified = await verifyMySqlAccount(username, password);
  } catch (error) {
    if (['ER_ACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR'].includes(error.code)) {
      throw new LoginError('Invalid MySQL username or password.', 401);
    }
    if (error.code === 'ER_DBACCESS_DENIED_ERROR') {
      throw new LoginError('This MySQL account has no access to the application database.', 403);
    }
    if (['ER_ACCOUNT_HAS_BEEN_LOCKED', 'ER_USER_ACCESS_DENIED_FOR_USER_ACCOUNT_BLOCKED_BY_PASSWORD_LOCK'].includes(error.code)
      || error.errno === 3118 || error.errno === 3955) {
      throw new LoginError('This MySQL account is locked. Contact the database administrator.', 423);
    }
    throw error;
  }

  const { connection, identity } = verified;
  let appUser;
  const roleName = appRoleFromMySqlRoles(identity.mysql_roles);
  try {
    if (!roleName) {
      throw new LoginError('This MySQL account has no application role (cri_admin_role, cri_reviewer_role or cri_viewer_role).', 403);
    }

    // Shared-role identity model: contracts.uploaded_by and risk_flags.reviewer_id
    // reference users.user_id, so a MySQL account is attributed to the application
    // user of its role - but only when that role has exactly ONE application user.
    // If the role has zero or several users no one is guessed: user_id stays NULL
    // (uploads record uploaded_by = NULL; the review trigger rejects reviews without
    // a reviewer_id). The users table is no longer used for passwords.
    const [roleUsers] = await connection.execute(
      `SELECT u.user_id, u.name, r.role_id, r.role_name
       FROM roles r
       LEFT JOIN users u ON u.role_id = r.role_id
       WHERE LOWER(r.role_name) = ?
       ORDER BY u.user_id`,
      [roleName]
    );
    const roleRow = roleUsers[0];
    const linkedUser = roleUsers.length === 1 && roleRow?.user_id != null ? roleRow : null;
    appUser = {
      user_id: linkedUser?.user_id ?? null,
      name: linkedUser?.name || username,
      role_id: roleRow?.role_id ?? null,
      role_name: roleRow?.role_name || roleName,
      mysql_user: username,
      mysql_account: identity.mysql_account,
    };
  } finally {
    await connection.end().catch(() => {});
  }

  sweepExpiredSessions();
  while (sessions.size >= MAX_ACTIVE_SESSIONS) {
    destroySession(sessions.keys().next().value);
  }

  const pool = createAccountPool(username, password);
  bindSessionPool(appUser, pool);
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, { user: appUser, pool, expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 });
  return { token, user: appUser };
}

function readSessionToken(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookie = cookieHeader.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : null;
}

export function destroyRequestSession(request) {
  const token = readSessionToken(request);
  if (token) destroySession(token);
}

export function setSessionCookie(response, token) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export function clearSessionCookie(response) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

// Returns the logged-in user (with its MySQL pool bound; use getDb(user)) or null.
export async function getSessionUser(request) {
  sweepExpiredSessions();
  const token = readSessionToken(request);
  return (token && sessions.get(token)?.user) || null;
}

export function hasRole(user, allowedRoles) {
  return Boolean(user?.role_name)
    && allowedRoles.includes(String(user.role_name).trim().toLowerCase());
}
