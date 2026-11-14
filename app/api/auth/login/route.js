import { createMySqlSession, LoginError, setSessionCookie } from '@/app/lib/auth';
import { NextResponse } from 'next/server';

// Authenticates against real MySQL accounts (managed in MySQL Workbench →
// Administration → Users and Privileges). The users table is not used for passwords.
export async function POST(request) {
  try {
    const { username, password } = await request.json();
    const normalizedUsername = String(username || '').trim();

    if (!/^[A-Za-z0-9_.-]{1,32}$/.test(normalizedUsername) || typeof password !== 'string' || !password) {
      return NextResponse.json(
        { error: 'MySQL username and password are required' },
        { status: 400 }
      );
    }

    const { token, user } = await createMySqlSession(normalizedUsername, password);
    const response = NextResponse.json({ success: true, user });
    return setSessionCookie(response, token);
  } catch (error) {
    if (error instanceof LoginError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Login error:', error.code || error.message);
    return NextResponse.json(
      { error: 'Unable to reach the MySQL server.' },
      { status: 503 }
    );
  }
}
