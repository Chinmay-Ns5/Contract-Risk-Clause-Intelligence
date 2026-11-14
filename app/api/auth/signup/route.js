import { NextResponse } from 'next/server';

// Public self-registration is disabled. Application accounts are real MySQL
// accounts, created and granted roles by the database administrator
// (MySQL Workbench → Administration → Users and Privileges).
export async function POST() {
  return NextResponse.json(
    { error: 'Self-registration is disabled. Ask the database administrator for a MySQL account.' },
    { status: 410 }
  );
}
