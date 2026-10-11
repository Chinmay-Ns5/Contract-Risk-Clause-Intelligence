import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getDb } from '@/app/lib/db';

export const SESSION_COOKIE = 'cri_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
let ephemeralDevelopmentSecret;

function getSessionSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (process.env.NODE_ENV !== 'production') {
    ephemeralDevelopmentSecret ||= randomBytes(32).toString('base64url');
    return ephemeralDevelopmentSecret;
  }

  throw new Error('AUTH_SECRET must be set to at least 32 characters.');
}

export function assertSessionConfiguration() {
  getSessionSecret();
}

export function createSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({
    user_id: Number(userId),
    expires_at: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  })).toString('base64url');
  const signature = createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function setSessionCookie(response, userId) {
  response.cookies.set(SESSION_COOKIE, createSessionToken(userId), {
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

export async function getSessionUser(request) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const cookie = cookieHeader.split(';').map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
    if (!cookie) return null;

    const token = decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1));
    const [payload, providedSignature, extra] = token.split('.');
    if (!payload || !providedSignature || extra !== undefined) return null;

    const expectedSignature = createHmac('sha256', getSessionSecret())
      .update(payload)
      .digest();
    const signature = Buffer.from(providedSignature, 'base64url');
    if (signature.length !== expectedSignature.length || !timingSafeEqual(signature, expectedSignature)) {
      return null;
    }

    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isInteger(session.user_id) || session.user_id <= 0 || session.expires_at <= Date.now() / 1000) {
      return null;
    }

    const db = getDb();
    const [[user]] = await db.execute(
      `SELECT u.user_id, u.name, u.email, r.role_id, r.role_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = ?`,
      [session.user_id]
    );
    return user || null;
  } catch {
    return null;
  }
}

export function hasRole(user, allowedRoles) {
  return Boolean(user?.role_name)
    && allowedRoles.includes(String(user.role_name).trim().toLowerCase());
}
