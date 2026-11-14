import { getSessionUser } from '@/app/lib/auth';
import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // Ask MySQL which account this session's pool is really connected as.
  let database = null;
  try {
    const [[row]] = await getDb(user).query(
      'SELECT CURRENT_USER() AS current_user_account, CURRENT_ROLE() AS current_role'
    );
    database = row;
  } catch (error) {
    console.error('Session identity query failed:', error.message);
  }

  return NextResponse.json({ user, database });
}
