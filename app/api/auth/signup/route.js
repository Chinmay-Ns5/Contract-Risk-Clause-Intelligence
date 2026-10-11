import { getDb } from '@/app/lib/db';
import { assertSessionConfiguration, setSessionCookie } from '@/app/lib/auth';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

const BCRYPT_MAX_BYTES = 72;

export async function POST(request) {
  try {
    assertSessionConfiguration();
    const { name, email, password } = await request.json();
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedName || normalizedName.length > 100 || !normalizedEmail || normalizedEmail.length > 150) {
      return NextResponse.json({ error: 'Enter a valid name and email.' }, { status: 400 });
    }

    if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters and no more than 72 UTF-8 bytes.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      `INSERT INTO users (name, email, password_hash, role_id)
       SELECT ?, ?, ?, role_id FROM roles WHERE LOWER(role_name) = 'viewer'`,
      [normalizedName, normalizedEmail, passwordHash]
    );

    if (result.affectedRows !== 1) {
      return NextResponse.json({ error: 'Viewer role is not configured.' }, { status: 500 });
    }

    const [[user]] = await db.execute(
      `SELECT u.user_id, u.name, u.email, r.role_id, r.role_name
       FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = ?`,
      [result.insertId]
    );
    const response = NextResponse.json({ success: true, user }, { status: 201 });
    return setSessionCookie(response, user.user_id);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Unable to create account.' }, { status: 500 });
  }
}
