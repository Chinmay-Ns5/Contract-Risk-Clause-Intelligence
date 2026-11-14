import { getSessionUser } from '@/app/lib/auth';
import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  if (!await getSessionUser(request)) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const db = getDb();
  const { id } = await params;

  const [[contract]] = await db.execute('SELECT * FROM contracts WHERE contract_id = ?', [id]);
  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  const [clauses] = await db.execute('SELECT * FROM clauses WHERE contract_id = ? ORDER BY clause_order', [id]);

  // Stored procedures (database/advanced_sql/04_stored_procedures.sql).
  // Read-only; if the routines are not installed the page still loads without them.
  let riskSummary = null;
  let upcomingItems = [];
  try {
    const [summarySets] = await db.execute('CALL GetContractRiskSummary(?)', [Number(id)]);
    riskSummary = summarySets[0]?.[0] ?? null;
    const [upcomingSets] = await db.execute('CALL GetContractUpcomingItems(?)', [Number(id)]);
    upcomingItems = upcomingSets[0] ?? [];
  } catch (error) {
    console.error('Stored procedure call failed:', error.message);
  }

  return NextResponse.json({ ...contract, clauses, risk_summary: riskSummary, upcoming_items: upcomingItems });
}