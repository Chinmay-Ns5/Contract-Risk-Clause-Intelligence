import { getDb } from '@/app/lib/db';
import { assertSessionConfiguration, setSessionCookie } from '@/app/lib/auth';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    assertSessionConfiguration();
    const db = getDb();
    const { email, password } = await request.json();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    // Validate input
    if (!normalizedEmail || typeof password !== 'string' || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user
    const [rows] = await db.execute(
      `SELECT
        u.user_id,
        u.name,
        u.email,
        u.password_hash,
        r.role_id,
        r.role_name
       FROM users u
      JOIN roles r ON u.role_id = r.role_id
       WHERE u.email = ?`,
          [normalizedEmail]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const user = rows[0];

    // Check password
    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Return user information
    const response = NextResponse.json({
      success: true,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name
      }
    });
    return setSessionCookie(response, user.user_id);

  } catch (error) {
    console.error('Login error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
