import { NextResponse } from 'next/server';
import { getAddressVariants } from '@/lib/address';

const TAX_BASE = process.env.TAX_SEARCH_BASE_URL ?? 'https://taxsearch.polkcountyiowa.gov';

const HEADERS = {
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'x-requested-with': 'XMLHttpRequest',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  referer: `${TAX_BASE}/Search`,
};

export async function GET(
  _req: Request,
  { params }: { params: { address: string } }
) {
  const { address } = params;

  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 });
  }

  const decoded = decodeURIComponent(address);

  // Get address variants (abbreviated + expanded directions)
  const variants = getAddressVariants(decoded);

  try {
    for (const variant of variants) {
      const url = `${TAX_BASE}/Search/getParcels?term=${variant}&type=2`;
      const response = await fetch(url, { method: 'GET', headers: HEADERS });

      if (!response.ok) continue;

      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return NextResponse.json(data);
      }
    }

    // No results from any variant
    return NextResponse.json([]);
  } catch (err: any) {
    console.error('[parcel-details]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
