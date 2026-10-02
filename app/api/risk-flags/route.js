import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  let query = `
    SELECT rf.flag_id, rf.similarity_score, rf.reviewed, rf.flagged_at,
           cl.clause_text, ct.title AS contract_title,
           rc.category_name
    FROM risk_flags rf
    JOIN clauses cl ON rf.clause_id = cl.clause_id
    JOIN contracts ct ON cl.contract_id = ct.contract_id
    JOIN risk_categories rc ON rf.category_id = rc.category_id
  `;
  const args = [];

  if (category) {
    query += ' WHERE rc.category_name = ?';
    args.push(category);
  }

  query += ' ORDER BY rf.similarity_score DESC';

  const [rows] = await db.execute(query, args);
  return NextResponse.json(rows);
}