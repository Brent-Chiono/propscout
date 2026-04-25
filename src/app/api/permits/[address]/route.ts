import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

/**
 * City of Des Moines building permits and code violations lookup.
 * Scrapes the city's open data / permit portal.
 */

interface Permit {
  number: string;
  type: string;
  status: string;
  date: string;
  description: string;
}

interface Violation {
  caseNumber: string;
  type: string;
  status: string;
  date: string;
  description: string;
}

const BROWSER_HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

export async function GET(
  _req: Request,
  { params }: { params: { address: string } }
) {
  const { address } = params;
  if (!address) {
    return NextResponse.json({ error: 'address required' }, { status: 400 });
  }

  const decodedAddress = decodeURIComponent(address);
  const permits: Permit[] = [];
  const violations: Violation[] = [];

  try {
    // Des Moines uses Accela Citizen Access for permits
    // Try the open data portal (Socrata-based)
    const cleanAddr = decodedAddress.replace(/,.*$/, '').trim();

    // Try Des Moines open data portal (Socrata)
    // Building permits dataset
    const permitUrl = `https://data.dsm.city/resource/i3kp-8bkf.json?` +
      `$where=address%20like%20'%25${encodeURIComponent(cleanAddr.split(' ').slice(0, 3).join(' '))}%25'` +
      `&$limit=20&$order=date_issued%20DESC`;

    try {
      const permitRes = await fetch(permitUrl, {
        headers: { 'accept': 'application/json', 'user-agent': 'Mozilla/5.0' },
      });

      if (permitRes.ok) {
        const permitData = await permitRes.json();
        if (Array.isArray(permitData)) {
          for (const p of permitData) {
            permits.push({
              number: p.permit_number ?? p.permit_no ?? '',
              type: p.permit_type ?? p.type ?? '',
              status: p.status ?? '',
              date: p.date_issued ?? p.issue_date ?? '',
              description: p.description ?? p.work_description ?? '',
            });
          }
        }
      }
    } catch {}

    // Code violations / complaints dataset
    const violationUrl = `https://data.dsm.city/resource/985c-7btp.json?` +
      `$where=address%20like%20'%25${encodeURIComponent(cleanAddr.split(' ').slice(0, 3).join(' '))}%25'` +
      `&$limit=20&$order=date_filed%20DESC`;

    try {
      const violRes = await fetch(violationUrl, {
        headers: { 'accept': 'application/json', 'user-agent': 'Mozilla/5.0' },
      });

      if (violRes.ok) {
        const violData = await violRes.json();
        if (Array.isArray(violData)) {
          for (const v of violData) {
            violations.push({
              caseNumber: v.case_number ?? v.case_id ?? '',
              type: v.violation_type ?? v.type ?? v.category ?? '',
              status: v.status ?? v.case_status ?? '',
              date: v.date_filed ?? v.date ?? '',
              description: v.description ?? v.violation_description ?? '',
            });
          }
        }
      }
    } catch {}

    return NextResponse.json({
      address: decodedAddress,
      permits,
      violations,
      permitCount: permits.length,
      violationCount: violations.length,
      hasOpenViolations: violations.some(v =>
        v.status.toLowerCase().includes('open') ||
        v.status.toLowerCase().includes('active') ||
        v.status.toLowerCase().includes('pending')
      ),
      recentPermits: permits.filter(p => {
        if (!p.date) return false;
        const d = new Date(p.date);
        const yearAgo = new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 2);
        return d > yearAgo;
      }).length,
    });
  } catch (err: any) {
    console.error('[permits]', err);
    return NextResponse.json({
      address: decodedAddress,
      permits: [],
      violations: [],
      permitCount: 0,
      violationCount: 0,
      hasOpenViolations: false,
      recentPermits: 0,
      error: err.message,
    });
  }
}
