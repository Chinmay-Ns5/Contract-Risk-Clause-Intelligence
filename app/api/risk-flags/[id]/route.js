import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  const db = getDb();
  const { id } = await params;
  const { reviewer_id } = await request.json();

  await db.execute(
    'UPDATE risk_flags SET reviewed = TRUE, reviewer_id = ? WHERE flag_id = ?',
    [reviewer_id, id]
  );

  return NextResponse.json({ success: true });
}