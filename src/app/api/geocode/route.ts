import { NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/geocode';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'address param required' }, { status: 400 });
  }

  const coords = await geocodeAddress(address);
  if (!coords) {
    return NextResponse.json({ error: 'Geocoding failed or returned no results' }, { status: 404 });
  }

  return NextResponse.json(coords);
}
