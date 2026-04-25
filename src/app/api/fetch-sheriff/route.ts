import { NextResponse } from 'next/server';
import { getSheriffSession, clearSheriffSession } from '@/lib/sheriff-cookie';

const SHERIFF_BASE = process.env.SHERIFF_BASE_URL ?? 'https://sheriffsaleviewer.polkcountyiowa.gov';

const QUERY_BODY =
  'draw=1' +
  '&columns%5B0%5D%5Bdata%5D=propertyId&columns%5B0%5D%5Bname%5D=&columns%5B0%5D%5Bsearchable%5D=true&columns%5B0%5D%5Borderable%5D=false&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false' +
  '&columns%5B1%5D%5Bdata%5D=referenceNumber&columns%5B1%5D%5Bname%5D=&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=false&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false' +
  '&columns%5B2%5D%5Bdata%5D=salesDate&columns%5B2%5D%5Bname%5D=&columns%5B2%5D%5Bsearchable%5D=true&columns%5B2%5D%5Borderable%5D=false&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false' +
  '&columns%5B3%5D%5Bdata%5D=plaintiff&columns%5B3%5D%5Bname%5D=&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=false&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false' +
  '&columns%5B4%5D%5Bdata%5D=defendant&columns%5B4%5D%5Bname%5D=&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=false&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false' +
  '&columns%5B5%5D%5Bdata%5D=propertyAddress&columns%5B5%5D%5Bname%5D=&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=false&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false' +
  '&start=0&length=500&search%5Bvalue%5D=&search%5Bregex%5D=false&isOpenStatus=true&sheriffNumber=&plaintiff=&defendant=&address=&saleStartDate=&saleEndDate=';

export async function GET() {
  try {
    const session = await getSheriffSession();

    // Build the body, prepending the verification token if we have one
    let body = QUERY_BODY;
    if (session.verificationToken) {
      body = `__RequestVerificationToken=${encodeURIComponent(session.verificationToken)}&${body}`;
    }

    const response = await fetch(`${SHERIFF_BASE}/Home/PropertyListJson`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        cookie: session.cookie,
        referer: `${SHERIFF_BASE}/`,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body,
    });

    console.log('[fetch-sheriff] Status:', response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error('[fetch-sheriff] Error body:', text.substring(0, 500));
      // Clear session so next request gets a fresh one
      clearSheriffSession();
      return NextResponse.json(
        { error: `Sheriff site returned ${response.status}` },
        { status: 502 }
      );
    }

    const json = await response.json();
    const raw = json.data ?? [];

    // Normalize the sheriff API response to our expected field names
    const items = raw.map((item: any) => ({
      propertyId: String(item.propertyId ?? ''),
      referenceNumber: String(item.referenceNumber ?? ''),
      salesDate: item.salesDate ?? item.salesDateDisplay ?? '',
      plaintiff: item.plaintiff ?? '',
      defendant: item.defendant ?? '',
      propertyAddress: item.propertyAddress ?? '',
      isDelayed: item.isDelayed ?? false,
    }));

    return NextResponse.json(items);
  } catch (err: any) {
    console.error('[fetch-sheriff]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
