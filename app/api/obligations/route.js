import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const db = getDb();

    const [rows] = await db.execute(`
      SELECT
        o.obligation_id,
        o.contract_id,
        c.title AS contract_title,
        o.description,
        o.due_date,
        o.status
      FROM obligations o
      JOIN contracts c
        ON o.contract_id = c.contract_id
      ORDER BY o.due_date ASC
    `);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Obligations GET error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch obligations' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const db = getDb();
    const body = await request.json();

    const { contract_id, description, due_date } = body;

    if (!contract_id || !description) {
      return NextResponse.json(
        { error: 'contract_id and description are required' },
        { status: 400 }
      );
    }

    const [result] = await db.execute(
      `
      INSERT INTO obligations
        (contract_id, description, due_date, status)
      VALUES (?, ?, ?, 'pending')
      `,
      [contract_id, description, due_date || null]
    );

    return NextResponse.json(
      {
        obligation_id: result.insertId,
        contract_id,
        description,
        due_date: due_date || null,
        status: 'pending'
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Obligations POST error:', error);

    return NextResponse.json(
      { error: 'Failed to create obligation' },
      { status: 500 }
    );
  }
}