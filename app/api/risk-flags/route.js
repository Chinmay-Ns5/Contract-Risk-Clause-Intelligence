import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const db = getDb();

    const { searchParams } = new URL(request.url);

    const category = searchParams.get('category');
    const contractIdParam = searchParams.get('contractId');

    // -----------------------------------------
    // Validate contractId if provided
    // -----------------------------------------
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

    // -----------------------------------------
    // Base query
    // -----------------------------------------
    let query = `
      SELECT
        rf.flag_id,
        rf.clause_id,
        rf.pattern_id,
        rf.category_id,
        rf.similarity_score,
        rf.reviewed,
        rf.reviewer_id,
        rf.flagged_at,

        cl.contract_id,
        cl.clause_order,
        cl.clause_text,

        ct.title AS contract_title,

        rc.category_name

      FROM risk_flags rf

      JOIN clauses cl
        ON rf.clause_id = cl.clause_id

      JOIN contracts ct
        ON cl.contract_id = ct.contract_id

      JOIN risk_categories rc
        ON rf.category_id = rc.category_id
    `;

    // -----------------------------------------
    // Dynamic filters
    // -----------------------------------------
    const conditions = [];
    const args = [];

    // Filter by specific contract
    if (contractId !== null) {
      conditions.push('cl.contract_id = ?');
      args.push(contractId);
    }

    // Filter by category
    if (category) {
      conditions.push('rc.category_name = ?');
      args.push(category);
    }

    // -----------------------------------------
    // Add WHERE only when filters exist
    // -----------------------------------------
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // -----------------------------------------
    // Highest-risk flags first
    // -----------------------------------------
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
        error: 'Failed to fetch risk flags'
      },
      { status: 500 }
    );
  }
}