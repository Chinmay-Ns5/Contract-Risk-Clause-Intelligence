import { getSessionUser } from '@/app/lib/auth';
import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
  if (!await getSessionUser(request)) {
    return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const category = searchParams.get('category');
    const contractIdParam = searchParams.get('contractId');

    let contractId = null;

    if (contractIdParam !== null) {
      contractId = Number(contractIdParam);

      if (!Number.isInteger(contractId) || contractId <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid contractId'
          },
          { status: 400 }
        );
      }
    }

    let query = `
      SELECT
        rf.flag_id,
        rf.clause_id,
        rf.pattern_id,
        rf.category_id,
        rf.similarity_score,
        rf.reviewed,
        rf.reviewer_id,
        reviewer.name AS reviewer_name,
        rf.flagged_at,

        cl.contract_id,
        cl.clause_order,
        cl.clause_text,

        ct.title AS contract_title,

        rc.category_name,
        rp.pattern_text

      FROM risk_flags rf

      JOIN clauses cl
        ON rf.clause_id = cl.clause_id

      JOIN contracts ct
        ON cl.contract_id = ct.contract_id

      LEFT JOIN risk_categories rc
        ON rf.category_id = rc.category_id

      LEFT JOIN risk_patterns rp
        ON rf.pattern_id = rp.pattern_id

      LEFT JOIN users reviewer
        ON rf.reviewer_id = reviewer.user_id
    `;

    const conditions = [];
    const args = [];

    if (contractId !== null) {
      conditions.push('cl.contract_id = ?');
      args.push(contractId);
    }

    if (category) {
      conditions.push('rc.category_name = ?');
      args.push(category);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
      ORDER BY rf.similarity_score DESC
    `;

    const [rows] = await db.execute(query, args);

    return NextResponse.json({
      success: true,
      count: rows.length,
      flags: rows
    });
  } catch (error) {
    console.error('Risk flags API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: `Failed to fetch risk flags: ${error.message || 'Unknown database error.'}`
      },
      { status: 500 }
    );
  }
}