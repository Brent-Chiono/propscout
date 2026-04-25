import { NextResponse } from 'next/server';

/**
 * EPA Environmental Check — queries multiple EPA databases for a lat/lng:
 * 1. ECHO (Enforcement & Compliance History) — violations, penalties, inspections
 * 2. Superfund/CERCLA (National Priorities List) — contaminated sites
 * 3. Toxic Release Inventory (TRI) — facilities releasing toxic chemicals
 * All free, no auth required.
 */

interface EchoFacility {
  name: string;
  address: string;
  distance?: number;
  violations: boolean;
  penalties: number;
  programs: string[];
  registryId: string;
}

interface SuperfundSite {
  name: string;
  status: string;
  epaId: string;
  distance?: number;
  nplStatus?: string;
}

interface TriFacility {
  name: string;
  address: string;
  industry: string;
  distance?: number;
  chemicals?: string[];
}

export async function GET(
  _req: Request,
  { params }: { params: { lat: string; lng: string } }
) {
  const lat = parseFloat(params.lat);
  const lng = parseFloat(params.lng);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }

  const results: any = {
    echo: { facilities: [] as EchoFacility[], nearbyCount: 0, hasViolations: false, totalPenalties: 0 },
    superfund: { sites: [] as SuperfundSite[], nearbyCount: 0, onSuperfund: false },
    tri: { facilities: [] as TriFacility[], nearbyCount: 0 },
    riskLevel: 'low' as 'low' | 'medium' | 'high',
    summary: '',
  };

  try {
    // 1. ECHO — facilities within ~1 mile radius
    const echoPromise = fetch(
      `https://echodata.epa.gov/echo/echo_rest_services.get_facilities?output=JSON&p_lat=${lat}&p_long=${lng}&p_radius=1&p_radunits=MILES`,
      { signal: AbortSignal.timeout(10000) }
    ).then(async r => {
      if (!r.ok) return;
      const data = await r.json();
      const facilities = data.Results?.Facilities || [];
      results.echo.nearbyCount = facilities.length;
      results.echo.facilities = facilities.slice(0, 10).map((f: any) => ({
        name: f.FacName || '',
        address: `${f.FacStreet || ''}, ${f.FacCity || ''} ${f.FacState || ''} ${f.FacZip || ''}`.trim(),
        violations: f.CurrVioFlag === 'Y' || f.QtrsWithNC > 0,
        penalties: parseFloat(f.TotalPenalties || '0') || 0,
        programs: [
          f.CAAFlag === 'Y' ? 'Clean Air' : '',
          f.CWAFlag === 'Y' ? 'Clean Water' : '',
          f.RCRAFlag === 'Y' ? 'RCRA' : '',
          f.TRIFlag === 'Y' ? 'TRI' : '',
        ].filter(Boolean),
        registryId: f.RegistryID || '',
      }));
      results.echo.hasViolations = results.echo.facilities.some((f: EchoFacility) => f.violations);
      results.echo.totalPenalties = results.echo.facilities.reduce((s: number, f: EchoFacility) => s + f.penalties, 0);
    }).catch(() => {});

    // 2. Superfund — NPL sites within ~2 miles
    const sfPromise = fetch(
      `https://geodata.epa.gov/arcgis/rest/services/OEI/FRS_INTERESTS/MapServer/22/query?` +
      `geometry=${lng - 0.03},${lat - 0.03},${lng + 0.03},${lat + 0.03}` +
      `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&outFields=PRIMARY_NAME,NPL_STATUS,REGISTRY_ID,CITY_NAME,STATE_CODE&returnGeometry=false&f=json`,
      { signal: AbortSignal.timeout(10000) }
    ).then(async r => {
      if (!r.ok) return;
      const data = await r.json();
      const features = data.features || [];
      results.superfund.nearbyCount = features.length;
      results.superfund.sites = features.map((f: any) => ({
        name: f.attributes?.PRIMARY_NAME || '',
        status: f.attributes?.NPL_STATUS || '',
        epaId: f.attributes?.REGISTRY_ID || '',
        nplStatus: f.attributes?.NPL_STATUS || '',
      }));
      results.superfund.onSuperfund = features.length > 0;
    }).catch(() => {});

    // 3. TRI — toxic release facilities within ~2 miles (using SEMS layer which includes TRI)
    const triPromise = fetch(
      `https://geodata.epa.gov/arcgis/rest/services/OEI/FRS_INTERESTS/MapServer/14/query?` +
      `geometry=${lng - 0.03},${lat - 0.03},${lng + 0.03},${lat + 0.03}` +
      `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&where=INTEREST_TYPE='TRI REPORTER'` +
      `&outFields=PRIMARY_NAME,ADDR_LINE1,CITY_NAME,STATE_CODE,REGISTRY_ID,SIC_CODES&returnGeometry=false&f=json`,
      { signal: AbortSignal.timeout(10000) }
    ).then(async r => {
      if (!r.ok) return;
      const data = await r.json();
      const features = data.features || [];
      results.tri.nearbyCount = features.length;
      results.tri.facilities = features.slice(0, 10).map((f: any) => ({
        name: f.attributes?.PRIMARY_NAME || '',
        address: `${f.attributes?.ADDR_LINE1 || ''}, ${f.attributes?.CITY_NAME || ''}`,
        industry: f.attributes?.SIC_CODES || '',
      }));
    }).catch(() => {});

    await Promise.allSettled([echoPromise, sfPromise, triPromise]);

    // Calculate overall risk
    if (results.superfund.onSuperfund) {
      results.riskLevel = 'high';
      results.summary = `SUPERFUND SITE NEARBY — ${results.superfund.nearbyCount} NPL site(s) within ~2 miles. Major environmental contamination risk.`;
    } else if (results.echo.hasViolations || results.echo.totalPenalties > 10000) {
      results.riskLevel = 'medium';
      results.summary = `EPA violations nearby — ${results.echo.nearbyCount} facilities within 1 mile, ${results.echo.facilities.filter((f: EchoFacility) => f.violations).length} with active violations. $${results.echo.totalPenalties.toLocaleString()} in penalties.`;
    } else if (results.tri.nearbyCount > 3) {
      results.riskLevel = 'medium';
      results.summary = `${results.tri.nearbyCount} toxic release facilities within ~2 miles. Check specific chemicals.`;
    } else {
      results.riskLevel = 'low';
      results.summary = `No significant environmental concerns found nearby. ${results.echo.nearbyCount} EPA-regulated facilities within 1 mile.`;
    }

    return NextResponse.json(results);
  } catch (err: any) {
    console.error('[environmental]', err);
    return NextResponse.json({ error: err.message, ...results }, { status: 500 });
  }
}
