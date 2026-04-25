import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const BASE = 'https://taxsale.polkcountyiowa.gov';

const HEADERS = {
  'accept': 'text/html',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'referer': `${BASE}/Reports/DelinquentTaxLists`,
};

interface TaxSaleParcel {
  itemNumber: string;
  parcelPin: string;
  titleHolder: string;
  propertyAddress: string;
  mailingAddress: string;
  legalDescription: string;
  taxInterest: number;
  lateInterest: number;
  totalFee: number;
  totalDue: number;
  // Tags
  saleType: 'regular' | 'public-bidder' | 'public-nuisance';
  saleTypeLabel: string;
  area: 'city' | 'township';
  propertyType: 'real-estate' | 'mobile-home';
  sourceUrl: string;
  taxSearchUrl: string;
}

const SALE_TYPES: { id: number; key: TaxSaleParcel['saleType']; label: string }[] = [
  { id: 1, key: 'regular', label: 'Regular Sale' },
  { id: 2, key: 'public-bidder', label: 'Public Bidder' },
  { id: 3, key: 'public-nuisance', label: 'Public Nuisance' },
];

const AREAS: { id: number; key: TaxSaleParcel['area']; label: string }[] = [
  { id: 1, key: 'township', label: 'Township' },
  { id: 2, key: 'city', label: 'City' },
];

const PROP_TYPES: { id: number; key: TaxSaleParcel['propertyType']; label: string }[] = [
  { id: 1, key: 'real-estate', label: 'Real Estate' },
  { id: 2, key: 'mobile-home', label: 'Mobile Home' },
];

function parseDollar(text: string): number {
  const cleaned = text.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

async function fetchCategory(
  saleType: typeof SALE_TYPES[0],
  area: typeof AREAS[0],
  propType: typeof PROP_TYPES[0],
): Promise<TaxSaleParcel[]> {
  try {
    const url = `${BASE}/Reports/DelinquentTaxListDetail?SaleType=${saleType.id}&CityTownship=${area.id}&PropertyType=${propType.id}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const parcels: TaxSaleParcel[] = [];

    $('#records-table tbody tr').each((_, row) => {
      const cells: string[] = [];
      $(row).find('td').each((_, td) => { cells.push($(td).text().trim()); });

      if (cells.length < 10) return;

      const pin = cells[1];
      parcels.push({
        itemNumber: cells[0],
        parcelPin: pin,
        titleHolder: cells[2],
        propertyAddress: cells[3],
        mailingAddress: cells[4],
        legalDescription: cells[5],
        taxInterest: parseDollar(cells[6]),
        lateInterest: parseDollar(cells[7]),
        totalFee: parseDollar(cells[8]),
        totalDue: parseDollar(cells[9]),
        saleType: saleType.key,
        saleTypeLabel: saleType.label,
        area: area.key,
        propertyType: propType.key,
        sourceUrl: `${BASE}/Reports/DelinquentTaxListDetail?SaleType=${saleType.id}&CityTownship=${area.id}&PropertyType=${propType.id}`,
        taxSearchUrl: `https://taxsearch.polkcountyiowa.gov/Search`,
      });
    });

    return parcels;
  } catch (err) {
    console.error(`[fetch-taxsale] Error fetching ${saleType.label}/${area.label}/${propType.label}:`, err);
    return [];
  }
}

export async function GET() {
  try {
    // Fetch all 12 combinations in parallel
    const fetches: Promise<TaxSaleParcel[]>[] = [];
    for (const st of SALE_TYPES) {
      for (const area of AREAS) {
        for (const pt of PROP_TYPES) {
          fetches.push(fetchCategory(st, area, pt));
        }
      }
    }

    const results = await Promise.all(fetches);
    const allParcels = results.flat();

    // Deduplicate by parcelPin + saleType (same parcel can appear with multiple installments)
    // Group by parcel and sum amounts
    const grouped = new Map<string, TaxSaleParcel>();
    for (const p of allParcels) {
      const key = `${p.parcelPin}-${p.saleType}-${p.area}-${p.propertyType}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.taxInterest += p.taxInterest;
        existing.lateInterest += p.lateInterest;
        existing.totalFee += p.totalFee;
        existing.totalDue += p.totalDue;
      } else {
        grouped.set(key, { ...p });
      }
    }

    const parcels = Array.from(grouped.values());

    return NextResponse.json({
      parcels,
      counts: {
        total: parcels.length,
        realEstate: parcels.filter(p => p.propertyType === 'real-estate').length,
        mobileHome: parcels.filter(p => p.propertyType === 'mobile-home').length,
        regular: parcels.filter(p => p.saleType === 'regular').length,
        publicBidder: parcels.filter(p => p.saleType === 'public-bidder').length,
        publicNuisance: parcels.filter(p => p.saleType === 'public-nuisance').length,
        city: parcels.filter(p => p.area === 'city').length,
        township: parcels.filter(p => p.area === 'township').length,
      },
      totalDelinquent: parcels.reduce((s, p) => s + p.totalDue, 0),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[fetch-taxsale]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
