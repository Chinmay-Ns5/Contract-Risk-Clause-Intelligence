import { getSessionUser, hasRole } from '@/app/lib/auth';
import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  if (!hasRole(user, ['admin', 'reviewer'])) {
    return NextResponse.json({ error: 'Admin or Reviewer role required.' }, { status: 403 });
  }

  const db = getDb();
  const { id } = await params;
  const flagId = Number(id);
  if (!Number.isInteger(flagId) || flagId <= 0) {
    return NextResponse.json({ error: 'Invalid risk flag ID.' }, { status: 400 });
  }

  await db.execute(
    'UPDATE risk_flags SET reviewed = TRUE, reviewer_id = ? WHERE flag_id = ?',
    [user.user_id, flagId]
  );

  const [[flag]] = await db.execute(
    'SELECT flag_id FROM risk_flags WHERE flag_id = ?',
    [flagId]
  );
  if (!flag) {
    return NextResponse.json({ error: 'Risk flag not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}