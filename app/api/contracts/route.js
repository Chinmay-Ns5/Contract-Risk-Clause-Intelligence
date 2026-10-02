import { getDb } from '@/app/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const db = getDb();
  const [rows] = await db.execute('SELECT * FROM contracts ORDER BY upload_date DESC');
  return NextResponse.json(rows);
}

export async function POST(request) {
  const db = getDb();
  const body = await request.json();
  const { title, uploaded_by, file_path } = body;

  if (!title || !uploaded_by) {
    return NextResponse.json({ error: 'title and uploaded_by are required' }, { status: 400 });
  }

  const [result] = await db.execute(
    'INSERT INTO contracts (title, uploaded_by, file_path, status) VALUES (?, ?, ?, "pending")',
    [title, uploaded_by, file_path || null]
  );

  return NextResponse.json({ contract_id: result.insertId, title, status: 'pending' }, { status: 201 });
}