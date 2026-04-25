import { NextResponse } from 'next/server';

/**
 * US Census Bureau - demographics and median income by lat/lng.
 * Uses the geocoder to find FIPS codes, then queries ACS 5-year data.
 * Free, no API key required (or use free key for higher limits).
 */
export async function GET(
  _req: Request,
  { params }: { params: { lat: string; lng: string } }
) {
  const { lat, lng } = params;

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  try {
    // Step 1: Get FIPS codes (state, county, tract) from lat/lng
    const geoUrl = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?` +
      `x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;

    const geoRes = await fetch(geoUrl, {
      headers: { 'accept': 'application/json' },
    });

    if (!geoRes.ok) {
      return NextResponse.json({ error: `Census geocoder returned ${geoRes.status}` }, { status: 502 });
    }

    const geoData = await geoRes.json();
    const geographies = geoData.result?.geographies?.['Census Tracts']?.[0];

    if (!geographies) {
      return NextResponse.json({ error: 'Could not determine census tract' }, { status: 404 });
    }

    const state = geographies.STATE;
    const county = geographies.COUNTY;
    const tract = geographies.TRACT;
    const tractName = geographies.BASENAME;

    // Step 2: Query ACS 5-year data for this tract
    // B19013_001E = Median household income
    // B25077_001E = Median home value
    // B01003_001E = Total population
    // B25003_001E = Total occupied housing units
    // B25003_002E = Owner-occupied
    // B25003_003E = Renter-occupied
    // B25064_001E = Median gross rent
    const variables = 'B19013_001E,B25077_001E,B01003_001E,B25003_001E,B25003_002E,B25003_003E,B25064_001E';
    const acsUrl = `https://api.census.gov/data/2022/acs/acs5?` +
      `get=${variables}&for=tract:${tract}&in=state:${state}%20county:${county}`;

    const acsRes = await fetch(acsUrl, {
      headers: { 'accept': 'application/json' },
    });

    if (!acsRes.ok) {
      // Try 2021 if 2022 not available
      const acsUrl2 = `https://api.census.gov/data/2021/acs/acs5?` +
        `get=${variables}&for=tract:${tract}&in=state:${state}%20county:${county}`;
      const acsRes2 = await fetch(acsUrl2, { headers: { 'accept': 'application/json' } });
      if (!acsRes2.ok) {
        return NextResponse.json({ error: 'Census ACS data not available' }, { status: 502 });
      }
      return processAcsResponse(await acsRes2.json(), tractName, state, county, tract);
    }

    return processAcsResponse(await acsRes.json(), tractName, state, county, tract);
  } catch (err: any) {
    console.error('[census]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function processAcsResponse(
  data: any[][],
  tractName: string,
  state: string,
  county: string,
  tract: string
) {
  if (!data || data.length < 2) {
    return NextResponse.json({ error: 'No ACS data returned' }, { status: 404 });
  }

  const headers = data[0];
  const values = data[1];

  function getVal(varName: string): number | null {
    const idx = headers.indexOf(varName);
    if (idx === -1) return null;
    const v = parseInt(values[idx]);
    return isNaN(v) || v < 0 ? null : v;
  }

  const totalOccupied = getVal('B25003_001E');
  const ownerOccupied = getVal('B25003_002E');
  const renterOccupied = getVal('B25003_003E');

  return NextResponse.json({
    tractName,
    fips: { state, county, tract },
    medianHouseholdIncome: getVal('B19013_001E'),
    medianHomeValue: getVal('B25077_001E'),
    population: getVal('B01003_001E'),
    medianGrossRent: getVal('B25064_001E'),
    ownerOccupiedPct: totalOccupied && ownerOccupied
      ? Math.round((ownerOccupied / totalOccupied) * 100)
      : null,
    renterOccupiedPct: totalOccupied && renterOccupied
      ? Math.round((renterOccupied / totalOccupied) * 100)
      : null,
  });
}
