import * as cheerio from 'cheerio';

export interface SaleRecord {
  seller: string;
  buyer: string;
  date: string;
  price: number;
  instrument: string;
}

export interface AssessorData {
  assessedValue?: number;
  landValue?: number;
  buildingValue?: number;
  lastSaleAmount?: number;
  lastSaleDate?: string;
  saleHistory?: SaleRecord[];
  outstandingTaxes?: number;
  taxYear?: string;
  propertyClass?: string;
  yearBuilt?: string;
  sqft?: number;
  acres?: number;
  bedrooms?: number;
  bathrooms?: number;
}

const BASE = 'https://www.assess.co.polk.ia.us';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getSession(): Promise<string> {
  try {
    const res = await fetch(BASE + '/', {
      headers: { 'user-agent': UA, 'accept': 'text/html' },
      redirect: 'follow',
    });
    return res.headers.getSetCookie?.()?.map(c => c.split(';')[0]).join('; ') ?? '';
  } catch {
    return '';
  }
}

async function searchByPin(pin: string, cookie: string): Promise<string | null> {
  try {
    const params = new URLSearchParams();
    params.set('info', '1');
    params.set('tt', 'simplegeneralform');
    params.set('form_state', '1');
    params.set('popup_state', '0');
    params.set('help_state', '1');
    params.set('pid__value.dp,dptogp.gp', pin);
    params.set('fields_result__values_class', 'values_class');
    params.set('fields_result__values_total_full', 'values_total_full');
    params.set('fields_routine__p_address', 'p_address');
    params.set('fields_routine__owner', 'owner');
    params.set('results_max', '10');
    params.set('submit_form', 'Perform Search');

    const res = await fetch(BASE + '/cgi-bin/web/tt/form.cgi?tt=simplegeneralform', {
      method: 'POST',
      headers: {
        'user-agent': UA, 'accept': 'text/html',
        'content-type': 'application/x-www-form-urlencoded',
        'cookie': cookie,
        'referer': BASE + '/cgi-bin/web/tt/form.cgi?tt=simplegeneralform',
      },
      body: params.toString(),
      redirect: 'follow',
    });

    if (!res.ok) return null;
    const html = await res.text();
    const dpMatch = html.match(/dp=(\d+)/);
    return dpMatch ? dpMatch[1] : null;
  } catch (err) {
    console.error('[assessor] Search error:', err);
    return null;
  }
}

async function fetchPropertyCard(dp: string, cookie: string): Promise<AssessorData> {
  try {
    const url = `${BASE}/cgi-bin/web/tt/infoqry.cgi?tt=card/card&dp=${dp}`;
    const res = await fetch(url, {
      headers: { 'user-agent': UA, 'accept': 'text/html', 'cookie': cookie },
      redirect: 'follow',
    });

    if (!res.ok) return {};

    const html = await res.text();
    const $ = cheerio.load(html);
    const data: AssessorData = {};

    // Parse tables
    $('table').each((_, tbl) => {
      const rows = $(tbl).find('tr');
      rows.each((_, row) => {
        const cells: string[] = [];
        $(row).find('td,th').each((_, cell) => { cells.push($(cell).text().trim()); });
        const rowText = cells.join(' | ');

        // Value row: "2025 Value | Residential | Full | $36,800 | $130,800 | $167,600"
        // Or: "2025 | Assessment Roll | Residential | Full | $36,800 | $130,800 | $167,600"
        if ((rowText.match(/^\d{4}\s+Value/) || rowText.includes('Assessment Roll')) && !data.assessedValue) {
          // Only pick cells that contain a $ sign - these are dollar amounts
          const dollarCells = cells.filter(c => c.includes('$'));
          if (dollarCells.length >= 3) {
            data.landValue = parseDollar(dollarCells[0]);
            data.buildingValue = parseDollar(dollarCells[1]);
            data.assessedValue = parseDollar(dollarCells[2]);
          } else if (dollarCells.length === 2) {
            data.landValue = parseDollar(dollarCells[0]);
            data.assessedValue = parseDollar(dollarCells[1]);
          } else if (dollarCells.length === 1) {
            data.assessedValue = parseDollar(dollarCells[0]);
          }

          // Property class
          const classCell = cells.find(c => c.match(/^(Residential|Commercial|Industrial|Agricultural)$/i));
          if (classCell) data.propertyClass = classCell;
        }

        // Property details rows - these come as label|value pairs in cells
        for (let i = 0; i < cells.length - 1; i++) {
          const label = cells[i];
          const value = cells[i + 1];

          if (label.match(/^Year Built$/i) && value.match(/^\d{4}$/)) {
            data.yearBuilt = value;
          }
          if (label.match(/Total Square Foot Living Area/i) && value.match(/^\d/)) {
            data.sqft = parseInt(value.replace(/,/g, ''));
          }
          if (label.match(/^Number Bathrooms$/i) && value.match(/^[\d.]+$/)) {
            data.bathrooms = parseFloat(value);
          }
          if (label.match(/^Bedrooms$/i) && value.match(/^\d+$/)) {
            data.bedrooms = parseInt(value);
          }
        }

        // Sale history row: "Seller | Buyer | Sale Date | Sale Price | Instrument | Book/Page"
        // Dates are YYYY-MM-DD format (e.g. "2024-04-23")
        if (rowText.match(/\d{4}-\d{2}-\d{2}/) && rowText.includes('$')) {
          const dollarCells = cells.filter(c => c.includes('$'));
          const dateCells = cells.filter(c => c.match(/\d{4}-\d{2}-\d{2}/));
          const salePrice = dollarCells.length > 0 ? parseDollar(dollarCells[0]) : undefined;
          const dateMatch = dateCells.length > 0 ? dateCells[0].match(/(\d{4}-\d{2}-\d{2})/) : null;
          const saleDate = dateMatch ? dateMatch[1] : '';

          // First sale found = most recent (lastSale)
          if (!data.lastSaleAmount && salePrice) {
            data.lastSaleAmount = salePrice;
            data.lastSaleDate = saleDate;
          }

          // Build full sale history
          if (!data.saleHistory) data.saleHistory = [];
          if (saleDate || salePrice) {
            data.saleHistory.push({
              seller: cells[0] || '',
              buyer: cells[1] || '',
              date: saleDate,
              price: salePrice || 0,
              instrument: cells[4] || '',
            });
          }
        }
      });
    });

    // Fallback regex extraction
    const allText = $.text();
    if (!data.yearBuilt) {
      const m = allText.match(/Year\s+Built\s+(\d{4})/i);
      if (m) data.yearBuilt = m[1];
    }
    if (!data.sqft) {
      const m = allText.match(/Total\s+Square\s+Foot\s+Living\s+Area\s+([\d,]+)/i);
      if (m) data.sqft = parseInt(m[1].replace(/,/g, ''));
    }
    if (!data.bedrooms) {
      const m = allText.match(/Bedrooms\s+(\d+)/i);
      if (m) data.bedrooms = parseInt(m[1]);
    }
    if (!data.bathrooms) {
      const m = allText.match(/Number\s+Bathrooms\s+([\d.]+)/i);
      if (m) data.bathrooms = parseFloat(m[1]);
    }

    return data;
  } catch (err) {
    console.error('[assessor] Card fetch error:', err);
    return {};
  }
}

export async function fetchAssessorData(pin: string): Promise<AssessorData> {
  try {
    const cookie = await getSession();
    const dp = await searchByPin(pin, cookie);

    if (!dp) {
      console.log('[assessor] No dp code found for PIN:', pin);
      return {};
    }

    const data = await fetchPropertyCard(dp, cookie);
    console.log('[assessor] Data for', pin, ':', JSON.stringify(data));
    return data;
  } catch (err) {
    console.error('[assessor] Error:', err);
    return {};
  }
}

function parseDollar(text: string): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) || num === 0 ? undefined : num;
}
