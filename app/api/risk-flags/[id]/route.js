import { getSessionUser, hasRole } from '@/app/lib/auth';
import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }
    if (!hasRole(user, ['admin', 'reviewer'])) {
      return NextResponse.json({ success: false, error: 'Admin or Reviewer role required.' }, { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'A review-status update is required.' }, { status: 400 });
    }
    if (
      !body
      || typeof body !== 'object'
      || Array.isArray(body)
      || Object.keys(body).length !== 1
      || body.reviewed !== true
    ) {
      return NextResponse.json(
        { success: false, error: 'Only setting reviewed to true is permitted.' },
        { status: 400 }
      );
    }

    const { id } = await params;
    const flagId = Number(id);
    if (!Number.isInteger(flagId) || flagId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid risk flag ID.' }, { status: 400 });
    }

    const db = getDb();
    const [[existingFlag]] = await db.execute(
      'SELECT flag_id FROM risk_flags WHERE flag_id = ?',
      [flagId]
    );
    if (!existingFlag) {
      return NextResponse.json({ success: false, error: 'Risk flag not found.' }, { status: 404 });
    }

    await db.execute(
      'UPDATE risk_flags SET reviewed = TRUE, reviewer_id = ? WHERE flag_id = ?',
      [user.user_id, flagId]
    );

    return NextResponse.json({
      success: true,
      flag_id: flagId,
      reviewed: true,
      reviewer_id: user.user_id,
      reviewer_name: user.name,
    });
  } catch (error) {
    console.error('Risk flag review update failed:', error);
    return NextResponse.json(
      { success: false, error: `Unable to update risk flag: ${error.message || 'Unknown database error.'}` },
      { status: 500 }
    );
  }
}