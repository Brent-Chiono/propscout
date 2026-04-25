import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { getSheriffSession } from '@/lib/sheriff-cookie';

const SHERIFF_BASE = process.env.SHERIFF_BASE_URL ?? 'https://sheriffsaleviewer.polkcountyiowa.gov';

export async function GET(
  _req: Request,
  { params }: { params: { propertyId: string } }
) {
  const { propertyId } = params;

  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
  }

  try {
    const session = await getSheriffSession();

    const response = await fetch(`${SHERIFF_BASE}/Home/Detail/${encodeURIComponent(propertyId)}`, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'x-requested-with': 'XMLHttpRequest',
        cookie: session.cookie,
        referer: `${SHERIFF_BASE}/`,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Sheriff site returned ${response.status}` },
        { status: 502 }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Find the "Approximate Judgment" th and get the adjacent td value
    let judgmentAmount: string | null = null;
    $('th').each((_, el) => {
      if ($(el).text().trim().match(/Approximate\s+Judgment/i)) {
        judgmentAmount = $(el).next('td').text().trim() || null;
      }
    });

    return NextResponse.json({ judgmentAmount: judgmentAmount || null });
  } catch (err: any) {
    console.error('[sheriff-details]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
