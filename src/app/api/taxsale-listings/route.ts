import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const FILE = join(process.cwd(), 'data', 'taxsale-listings.json');

export async function GET() {
  if (!existsSync(FILE)) {
    return NextResponse.json({ listings: [], fromCache: false });
  }
  try {
    const raw = readFileSync(FILE, 'utf-8');
    const data = JSON.parse(raw);
    return NextResponse.json({ ...data, fromCache: true });
  } catch {
    return NextResponse.json({ listings: [], fromCache: false });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    writeFileSync(FILE, JSON.stringify({
      listings: body.listings || [],
      counts: body.counts || {},
      totalDelinquent: body.totalDelinquent || 0,
      fetchedAt: body.fetchedAt || new Date().toISOString(),
    }, null, 2));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
