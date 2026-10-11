import { getSessionUser, hasRole } from '@/app/lib/auth';
import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  if (!hasRole(user, ['admin'])) {
    return NextResponse.json({ error: 'Admin role required to access user management.' }, { status: 403 });
  }

  try {
    const db = getDb();
    const [rows] = await db.execute(
      'SELECT user_id, name FROM users ORDER BY name ASC, user_id ASC'
    );

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Users API error:', error);
    return NextResponse.json(
      { error: 'Unable to load users.' },
      { status: 500 }
    );
  }
}