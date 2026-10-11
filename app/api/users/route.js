import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
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