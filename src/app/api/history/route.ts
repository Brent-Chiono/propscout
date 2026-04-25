import { NextResponse } from 'next/server';
import { getAllHistory, recordSnapshot } from '@/lib/auction-history';
import { SherifffListing } from '@/types';

/** GET - retrieve all auction history */
export async function GET() {
  const history = getAllHistory();
  return NextResponse.json(history);
}

/** POST - record a snapshot of current listings */
export async function POST(req: Request) {
  try {
    const { listings } = await req.json() as { listings: SherifffListing[] };
    if (!Array.isArray(listings)) {
      return NextResponse.json({ error: 'listings array required' }, { status: 400 });
    }
    recordSnapshot(listings);
    return NextResponse.json({ recorded: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
