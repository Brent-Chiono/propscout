import { NextResponse } from 'next/server';
import { clearCache } from '@/lib/cache';

/** POST - clear cache to force a full resync on next page load */
export async function POST() {
  clearCache();
  return NextResponse.json({ cleared: true });
}
