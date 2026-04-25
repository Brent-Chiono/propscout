import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const TAX_BASE = process.env.TAX_SEARCH_BASE_URL ?? 'https://taxsearch.polkcountyiowa.gov';

const HEADERS: Record<string, string> = {
  'accept': 'text/html',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'referer': `${TAX_BASE}/Search`,
};

function parseDollar(text: string): number {
  return parseFloat(text.replace(/[$,\s]/g, '')) || 0;
}

async function getHextAndSession(pin: string): Promise<{ hext: string; sessionToken: string } | null> {
  try {
    const searchRes = await fetch(`${TAX_BASE}/Search`, {
      method: 'POST', headers: { ...HEADERS, 'content-type': 'application/x-www-form-urlencoded' },
      body: `SearchModel.searchType=0&SearchModel.searchTerm=${encodeURIComponent(pin)}`, redirect: 'follow',
    });
    if (!searchRes.ok) return null;
    const html = await searchRes.text();
    const hextMatch = html.match(/"Hext"\s*:\s*"([^"]+)"/);
    if (!hextMatch) return null;
    const hext = hextMatch[1];

    const proxyRes = await fetch(`${TAX_BASE}/parcelinformation/proxy?PIN=${encodeURIComponent(pin)}&t=${encodeURIComponent(hext)}`, {
      method: 'GET', headers: HEADERS, redirect: 'manual',
    });
    const location = proxyRes.headers.get('location');
    let q: string | null = null;
    if (location) {
      const qMatch = location.match(/[?&]q=([^&]+)/);
      q = qMatch ? qMatch[1] : null;
    }
    if (!q) {
      const body = await proxyRes.text();
      const hrefMatch = body.match(/href="[^"]*\?q=([^"&]+)/);
      q = hrefMatch ? hrefMatch[1] : null;
    }
    return q ? { hext, sessionToken: q } : null;
  } catch { return null; }
}

export async function GET(_req: Request, { params }: { params: { pin: string } }) {
  const { pin } = params;
  if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });

  try {
    const session = await getHextAndSession(pin);
    if (!session) return NextResponse.json({ assessments: [], error: 'Could not get session' });

    const url = `${TAX_BASE}/SpecialAssessment?q=${session.sessionToken}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return NextResponse.json({ assessments: [] });

    const html = await res.text();
    const $ = cheerio.load(html);

    const assessments: any[] = [];
    let currentYear = 0;
    let currentProject = '';

    $('.alternating-rows .row, .parcel-container .row').each((_, row) => {
      const $row = $(row);
      if ($row.hasClass('blue')) {
        const yearText = $row.find('.orange-display').text().trim();
        const projText = $row.find('.text-warning').text().trim();
        currentYear = parseInt(yearText) || currentYear;
        currentProject = projText;
        return;
      }
      if ($row.hasClass('green')) {
        const firstCol = $row.find('.col-md-2').first().text().trim();
        if (firstCol === 'Total Due') {
          const cols = $row.find('.col-md-2');
          const amounts: number[] = [];
          cols.each((i, col) => { if (i > 0) amounts.push(parseDollar($(col).text())); });
          if (amounts[3] && amounts[3] > 0) {
            assessments.push({
              year: currentYear,
              project: currentProject,
              totalDue: amounts[3] || 0,
              tax: amounts[0] || 0,
              fee: amounts[1] || 0,
              interest: amounts[2] || 0,
            });
          }
        }
      }
    });

    // Also check for the model data
    const modelMatch = html.match(/var model\s*=\s*function\s*\(\)\s*\{\s*return\s*({[\s\S]*?})\s*\}\(\);/);
    if (modelMatch) {
      try {
        const model = JSON.parse(modelMatch[1]);
        if (model.SpecialAssessmentModel) {
          // Model has additional data
        }
      } catch {}
    }

    const totalDue = assessments.reduce((s, a) => s + a.totalDue, 0);

    return NextResponse.json({
      assessments,
      totalDue,
      count: assessments.length,
      sourceUrl: url,
    });
  } catch (err: any) {
    console.error('[special-assessments]', err);
    return NextResponse.json({ assessments: [], error: err.message });
  }
}
