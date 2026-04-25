import { NextResponse } from 'next/server';
import { loadCache, saveCache } from '@/lib/cache';
import { SherifffListing } from '@/types';

/** GET - return cached listings if available */
export async function GET() {
  const cached = loadCache();
  if (cached) {
    return NextResponse.json({
      listings: cached.listings,
      fetchedAt: cached.fetchedAt,
      fromCache: true,
    });
  }
  return NextResponse.json({ listings: [], fetchedAt: null, fromCache: false });
}

/** POST - save enriched listings to cache */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const listings: SherifffListing[] = body.listings;
    if (!Array.isArray(listings)) {
      return NextResponse.json({ error: 'listings array required' }, { status: 400 });
    }
    saveCache(listings);
    return NextResponse.json({ saved: listings.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
