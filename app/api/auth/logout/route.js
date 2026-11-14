import { clearSessionCookie, destroyRequestSession } from '@/app/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
  // Removes the server-side session and closes its MySQL pool.
  destroyRequestSession(request);
  return clearSessionCookie(NextResponse.json({ success: true }));
}
