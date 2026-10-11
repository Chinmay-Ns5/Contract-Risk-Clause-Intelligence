import { getSessionUser } from '@/app/lib/auth';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  return NextResponse.json({ user });
}
