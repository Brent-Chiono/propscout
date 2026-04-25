import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const TAX_BASE = process.env.TAX_SEARCH_BASE_URL ?? 'https://taxsearch.polkcountyiowa.gov';

const HEADERS: Record<string, string> = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'referer': `${TAX_BASE}/Search`,
};

const XHR_HEADERS: Record<string, string> = {
  ...HEADERS,
  'accept': '*/*',
  'x-requested-with': 'XMLHttpRequest',
};

interface TaxSaleEntry {
  taxYear: number;
  certNumber: string;
  saleType: string;
  status: string;
  isRedeemed: boolean;
  taxSaleDate: string | null;
  taxSaleAmount: number;
  bidPercent: number;
  redemptionAmount: number;
  deedIssuedDate: string | null;
  deedEligibleDate: string | null;
}

interface TaxInstallment {
  year: number;
  billNumber: string;
  installmentNum: number;
  tax: number;
  fee: number;
  interest: number;
  total: number;
  dueDate: string;
  paidTax: number;
  paidFee: number;
  paidInterest: number;
  paidTotal: number;
  totalDueTax: number;
  totalDueFee: number;
  totalDueInterest: number;
  totalDueTotal: number;
  soldAtTaxSale: boolean;
}

export interface TaxDetailsResponse {
  totalDue: number;
  totalDueByYear: Record<string, number>;
  delinquentYears: string[];
  taxSales: TaxSaleEntry[];
  installments: TaxInstallment[];
  hasUnredeemedTaxSale: boolean;
  payOnlineUrl: string;
}

/** Convert .NET date string like /Date(1750050000000)/ to ISO string */
function parseDotNetDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/\/Date\((\d+)\)\//);
  if (!match) return null;
  return new Date(parseInt(match[1])).toISOString();
}

function parseDollar(text: string): number {
  const cleaned = text.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Step 1: POST search to get Hext token
 */
async function getHextToken(pin: string): Promise<string | null> {
  try {
    const url = `${TAX_BASE}/Search`;
    const body = `SearchModel.searchType=0&SearchModel.searchTerm=${encodeURIComponent(pin)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...HEADERS, 'content-type': 'application/x-www-form-urlencoded' },
      redirect: 'follow',
      body,
    });
    if (!res.ok) {
      console.error('[tax-details] Search POST failed:', res.status, res.statusText);
      return null;
    }
    const html = await res.text();
    const match = html.match(/"Hext"\s*:\s*"([^"]+)"/);
    if (!match) {
      console.error('[tax-details] No Hext found in response, length:', html.length);
    }
    return match ? match[1] : null;
  } catch (err) {
    console.error('[tax-details] getHextToken error:', err);
    return null;
  }
}

/**
 * Step 2: Hit proxy to get session token `q` from redirect URL
 */
async function getSessionToken(pin: string, hext: string): Promise<string | null> {
  try {
    const url = `${TAX_BASE}/parcelinformation/proxy?PIN=${encodeURIComponent(pin)}&t=${encodeURIComponent(hext)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: HEADERS,
      redirect: 'manual', // Don't follow — we need the redirect URL
    });

    // The redirect Location header contains the q= parameter
    const location = res.headers.get('location');
    if (location) {
      const qMatch = location.match(/[?&]q=([^&]+)/);
      return qMatch ? qMatch[1] : null;
    }

    // If no redirect, try parsing from body
    const html = await res.text();
    const hrefMatch = html.match(/href="[^"]*\?q=([^"&]+)/);
    return hrefMatch ? hrefMatch[1] : null;
  } catch {
    return null;
  }
}

/**
 * Step 3: Fetch Tax Sale Information (structured JSON in page model)
 */
async function fetchTaxSaleInfo(sessionToken: string): Promise<TaxSaleEntry[]> {
  try {
    const url = `${TAX_BASE}/TaxSaleInformation?q=${sessionToken}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return [];
    const html = await res.text();

    const modelMatch = html.match(/var model\s*=\s*function\s*\(\)\s*\{\s*return\s*({[\s\S]*?})\s*\}\(\);/);
    if (!modelMatch) return [];

    const model = JSON.parse(modelMatch[1]);
    const taxSaleModel = model?.TaxSaleModel;
    if (!taxSaleModel?.TaxSale) return [];

    return taxSaleModel.TaxSale.map((ts: any) => ({
      taxYear: ts.TaxYear,
      certNumber: ts.TaxSaleCertNumber,
      saleType: ts.typeofsale || '',
      status: ts.Status || '',
      isRedeemed: ts.isredeemed === '1' || ts.isredeemed === 1,
      taxSaleDate: parseDotNetDate(ts.taxsaledate),
      taxSaleAmount: ts.taxsaleamount || 0,
      bidPercent: ts.bidpercent || 0,
      redemptionAmount: ts.redemptionamount || 0,
      deedIssuedDate: parseDotNetDate(ts.DeedIssuedDate),
      deedEligibleDate: parseDotNetDate(ts.DeedEligibleDate),
    }));
  } catch {
    return [];
  }
}

/**
 * Step 4: Fetch tax installments (HTML parsing)
 */
async function fetchTaxInstallments(sessionToken: string): Promise<TaxInstallment[]> {
  try {
    const url = `${TAX_BASE}/RealEstate/AllRealEstateInstallments?q=${sessionToken}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);

    const installments: TaxInstallment[] = [];
    let currentYear = 0;
    let currentBill = '';

    // Iterate through rows in the alternating-rows container
    const container = $('.alternating-rows');
    const rows = container.children('.row');

    rows.each((_, row) => {
      const $row = $(row);

      // Blue row = new year/bill section header
      if ($row.hasClass('blue')) {
        const yearText = $row.find('.orange-display').text().trim();
        const billText = $row.find('.text-warning').text().trim();
        currentYear = parseInt(yearText) || 0;
        currentBill = billText.replace('Bill Number ', '');
        return;
      }

      // Green header rows are just column headers — skip
      if ($row.hasClass('green')) {
        // Check if this is a "Total Due" row
        const firstCol = $row.find('.col-md-2').first().text().trim();
        if (firstCol === 'Total Due') {
          // Parse the total due amounts
          const cols = $row.find('.col-md-2');
          const amounts: number[] = [];
          cols.each((i, col) => {
            if (i === 0) return; // skip "Total Due" label
            amounts.push(parseDollar($(col).text()));
          });

          // Attach to the last installment
          if (installments.length > 0) {
            const last = installments[installments.length - 1];
            last.totalDueTax = amounts[0] || 0;
            last.totalDueFee = amounts[1] || 0;
            last.totalDueInterest = amounts[2] || 0;
            last.totalDueTotal = amounts[3] || 0;
          }
        }
        return;
      }

      // Clear rows = data rows (Original or Payments)
      if ($row.hasClass('clear')) {
        const label = $row.find('.col-md-2').first().text().trim();

        // Get dollar amounts from col-md-2 elements (skip first which is label)
        const cols = $row.find('.col-md-2');
        const amounts: number[] = [];
        cols.each((i, col) => {
          if (i === 0) return; // skip label col
          const text = $(col).text().trim();
          if (text.startsWith('$') || text === '') {
            amounts.push(parseDollar(text));
          }
        });

        // Check for date in last col
        const lastColText = cols.last().text().trim();
        const dateMatch = lastColText.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
        const soldAtTaxSale = $row.find('.flag-warning').text().includes('Tax Sale');

        const installMatch = label.match(/\((\d+)\)\s*(Original|Payments)/);
        if (!installMatch) return;

        const instNum = parseInt(installMatch[1]);
        const isOriginal = installMatch[2] === 'Original';

        if (isOriginal) {
          installments.push({
            year: currentYear,
            billNumber: currentBill,
            installmentNum: instNum,
            tax: amounts[0] || 0,
            fee: amounts[1] || 0,
            interest: amounts[2] || 0,
            total: amounts[3] || 0,
            dueDate: dateMatch ? dateMatch[0] : '',
            paidTax: 0,
            paidFee: 0,
            paidInterest: 0,
            paidTotal: 0,
            totalDueTax: 0,
            totalDueFee: 0,
            totalDueInterest: 0,
            totalDueTotal: 0,
            soldAtTaxSale,
          });
        } else {
          // Payments row — update the last installment
          const last = installments.find(
            i => i.year === currentYear && i.installmentNum === instNum
          );
          if (last) {
            last.paidTax = amounts[0] || 0;
            last.paidFee = amounts[1] || 0;
            last.paidInterest = amounts[2] || 0;
            last.paidTotal = amounts[3] || 0;
            if (soldAtTaxSale) last.soldAtTaxSale = true;
          }
        }
      }
    });

    return installments;
  } catch {
    return [];
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { pin: string } }
) {
  const { pin } = params;
  if (!pin) {
    return NextResponse.json({ error: 'PIN is required' }, { status: 400 });
  }

  try {
    // Step 1: Get Hext token
    const hext = await getHextToken(pin);
    if (!hext) {
      return NextResponse.json({ error: 'Could not get session token from tax search' }, { status: 502 });
    }

    // Step 2: Get session q token
    const sessionToken = await getSessionToken(pin, hext);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Could not get parcel session' }, { status: 502 });
    }

    // Step 3 & 4: Fetch tax sale info and installments in parallel
    const [taxSales, installments] = await Promise.all([
      fetchTaxSaleInfo(sessionToken),
      fetchTaxInstallments(sessionToken),
    ]);

    // Calculate totals
    const hasUnredeemedTaxSale = taxSales.some(ts => !ts.isRedeemed && ts.status === 'Open');

    // Sum up total due across all installments
    const totalDueByYear: Record<string, number> = {};
    let totalDue = 0;
    const delinquentYears: string[] = [];

    for (const inst of installments) {
      const yearKey = String(inst.year);
      if (inst.totalDueTotal > 0) {
        totalDueByYear[yearKey] = (totalDueByYear[yearKey] || 0) + inst.totalDueTotal;
        totalDue += inst.totalDueTotal;
      }
    }

    for (const [year, amount] of Object.entries(totalDueByYear)) {
      if (amount > 0) delinquentYears.push(year);
    }
    delinquentYears.sort();

    // Add unredeemed tax sale amounts — these represent debt that must
    // be paid off (to the cert holder) at closing, even if the installment
    // "Total Due" shows $0 (because the investor already paid the county).
    let taxSaleLienTotal = 0;
    for (const ts of taxSales) {
      if (!ts.isRedeemed && ts.status === 'Open') {
        taxSaleLienTotal += ts.taxSaleAmount;
      }
    }
    // If installment totalDue is 0 but there's a tax sale lien, use that
    if (totalDue === 0 && taxSaleLienTotal > 0) {
      totalDue = taxSaleLienTotal;
    }

    const payOnlineUrl = `https://pay.IowaTaxandTags.org/Taxes/Step2/SelectParcels?SelectedCounty=77&Name=&ParcelNumbers=${encodeURIComponent(pin)}`;

    // Only return recent installments (last 5 years) or those with amounts due / sold at tax sale
    const currentYear = new Date().getFullYear();
    const recentInstallments = installments.filter(
      i => i.year >= currentYear - 5 || i.totalDueTotal > 0 || i.soldAtTaxSale
    );

    const result: TaxDetailsResponse = {
      totalDue,
      totalDueByYear,
      delinquentYears,
      taxSales,
      installments: recentInstallments,
      hasUnredeemedTaxSale,
      payOnlineUrl,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[tax-details]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
