import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const db = getDb();

    const [rows] = await db.execute(`
      SELECT
        d.deadline_id,
        d.contract_id,
        c.title AS contract_title,
        d.deadline_type,
        d.deadline_date,
        d.notified
      FROM deadlines d
      JOIN contracts c
        ON d.contract_id = c.contract_id
      ORDER BY d.deadline_date ASC
    `);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Deadlines GET error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch deadlines' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const db = getDb();
    const body = await request.json();

    const { contract_id, deadline_type, deadline_date } = body;

    if (!contract_id || !deadline_type || !deadline_date) {
      return NextResponse.json(
        {
          error:
            'contract_id, deadline_type and deadline_date are required'
        },
        { status: 400 }
      );
    }

    const [result] = await db.execute(
      `
      INSERT INTO deadlines
        (contract_id, deadline_type, deadline_date, notified)
      VALUES (?, ?, ?, FALSE)
      `,
      [contract_id, deadline_type, deadline_date]
    );

    return NextResponse.json(
      {
        deadline_id: result.insertId,
        contract_id,
        deadline_type,
        deadline_date,
        notified: false
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Deadlines POST error:', error);

    return NextResponse.json(
      { error: 'Failed to create deadline' },
      { status: 500 }
    );
  }
}