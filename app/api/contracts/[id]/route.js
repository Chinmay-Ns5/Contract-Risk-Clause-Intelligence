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

  return NextResponse.json({ ...contract, clauses });
}