import { clearSessionCookie } from '@/app/lib/auth';
import { NextResponse } from 'next/server';

export async function POST() {
  return clearSessionCookie(NextResponse.json({ success: true }));
}
