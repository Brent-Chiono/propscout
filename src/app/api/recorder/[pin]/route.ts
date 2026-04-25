import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

/**
 * Polk County Recorder scraper.
 * Fetches deed transfers (sale history) and mortgage/lien records for a parcel PIN.
 * Source: https://recorder.polkcountyiowa.gov
 */

const RECORDER_BASE = 'https://recorder.polkcountyiowa.gov';

const BROWSER_HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

interface DeedTransfer {
  date: string;
  amount: number | null;
  grantor: string;
  grantee: string;
  docType: string;
  book?: string;
  page?: string;
}

interface LienRecord {
  date: string;
  type: string;
  amount: number | null;
  holder: string;
  docNumber?: string;
}

export async function GET(
  _req: Request,
  { params }: { params: { pin: string } }
) {
  const { pin } = params;
  if (!pin) {
    return NextResponse.json({ error: 'pin required' }, { status: 400 });
  }

  const cleanPin = decodeURIComponent(pin).replace(/[\s]/g, '');
  const deeds: DeedTransfer[] = [];
  const liens: LienRecord[] = [];

  try {
    // Try the Polk County Recorder search
    // Common URL patterns for Iowa county recorders
    const searchUrls = [
      `${RECORDER_BASE}/Search/SearchResults?SearchType=parcel&SearchString=${encodeURIComponent(cleanPin)}`,
      `${RECORDER_BASE}/Search?q=${encodeURIComponent(cleanPin)}&type=parcel`,
      `https://recorder.polkcountyiowa.gov/PublicAccess/SearchResults.aspx?parcel=${encodeURIComponent(cleanPin)}`,
    ];

    let html = '';
    for (const url of searchUrls) {
      try {
        const res = await fetch(url, {
          headers: { ...BROWSER_HEADERS, referer: RECORDER_BASE + '/' },
          redirect: 'follow',
        });
        if (res.ok) {
          html = await res.text();
          if (html.length > 500) break;
        }
      } catch {}
    }

    if (html) {
      const $ = cheerio.load(html);

      // Parse deed/transfer records from result tables
      $('table tr, .result-row, .document-row').each((_, row) => {
        const text = $(row).text().toLowerCase();
        const cells = $(row).find('td');

        // Look for deed-related documents
        if (text.includes('deed') || text.includes('warranty') || text.includes('quit claim') || text.includes('transfer')) {
          const deed: DeedTransfer = {
            date: '',
            amount: null,
            grantor: '',
            grantee: '',
            docType: '',
          };

          cells.each((i, cell) => {
            const cellText = $(cell).text().trim();

            // Try to identify what each cell contains
            const dateMatch = cellText.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/);
            if (dateMatch && !deed.date) deed.date = dateMatch[0];

            const amountMatch = cellText.match(/\$?([\d,]+(?:\.\d{2})?)/);
            if (amountMatch && !deed.amount) {
              const num = parseFloat(amountMatch[1].replace(/,/g, ''));
              if (num > 1000) deed.amount = num;
            }

            if (text.includes('deed') || text.includes('warranty') || text.includes('quit claim')) {
              if (!deed.docType) {
                if (cellText.toLowerCase().includes('warranty')) deed.docType = 'Warranty Deed';
                else if (cellText.toLowerCase().includes('quit claim')) deed.docType = 'Quit Claim Deed';
                else if (cellText.toLowerCase().includes('deed')) deed.docType = 'Deed';
              }
            }
          });

          if (deed.date || deed.amount) {
            deeds.push(deed);
          }
        }

        // Look for mortgage/lien documents
        if (text.includes('mortgage') || text.includes('lien') || text.includes('judgment') || text.includes('lis pendens')) {
          const lien: LienRecord = {
            date: '',
            type: '',
            amount: null,
            holder: '',
          };

          cells.each((_, cell) => {
            const cellText = $(cell).text().trim();
            const dateMatch = cellText.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/);
            if (dateMatch && !lien.date) lien.date = dateMatch[0];

            const amountMatch = cellText.match(/\$?([\d,]+(?:\.\d{2})?)/);
            if (amountMatch && !lien.amount) {
              const num = parseFloat(amountMatch[1].replace(/,/g, ''));
              if (num > 100) lien.amount = num;
            }
          });

          if (text.includes('mortgage')) lien.type = 'Mortgage';
          else if (text.includes('tax lien')) lien.type = 'Tax Lien';
          else if (text.includes('lien')) lien.type = 'Lien';
          else if (text.includes('judgment')) lien.type = 'Judgment';
          else if (text.includes('lis pendens')) lien.type = 'Lis Pendens';

          if (lien.type && (lien.date || lien.amount)) {
            liens.push(lien);
          }
        }
      });
    }

    // Sort deeds by date descending (most recent first)
    deeds.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    // Sort liens by date descending
    liens.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return NextResponse.json({
      pin: cleanPin,
      deeds,
      liens,
      deedCount: deeds.length,
      lienCount: liens.length,
      lastSalePrice: deeds[0]?.amount ?? null,
      lastSaleDate: deeds[0]?.date ?? null,
      mortgageCount: liens.filter(l => l.type === 'Mortgage').length,
      hasMultipleMortgages: liens.filter(l => l.type === 'Mortgage').length > 1,
    });
  } catch (err: any) {
    console.error('[recorder]', err);
    return NextResponse.json({
      pin: cleanPin,
      deeds: [],
      liens: [],
      deedCount: 0,
      lienCount: 0,
      lastSalePrice: null,
      lastSaleDate: null,
      mortgageCount: 0,
      hasMultipleMortgages: false,
      error: err.message,
    });
  }
}
