import { NextResponse } from 'next/server';

/**
 * FEMA National Flood Hazard Layer API
 * Returns flood zone designation for a lat/lng coordinate.
 * Free, no API key required.
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
    // FEMA NFHL MapServer - identify flood zones at a point
    const url = `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?` +
      `geometry=${lng},${lat}` +
      `&geometryType=esriGeometryPoint` +
      `&inSR=4326` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE` +
      `&returnGeometry=false` +
      `&f=json`;

    const res = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'user-agent': 'Mozilla/5.0',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `FEMA returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const features = data.features ?? [];

    if (features.length === 0) {
      return NextResponse.json({
        floodZone: 'X',
        isFloodZone: false,
        description: 'Minimal flood risk (not in a mapped flood zone)',
        detail: null,
      });
    }

    const attrs = features[0].attributes;
    const zone = attrs.FLD_ZONE ?? 'Unknown';
    const subtype = attrs.ZONE_SUBTY ?? '';
    const sfha = attrs.SFHA_TF === 'T'; // Special Flood Hazard Area

    const descriptions: Record<string, string> = {
      'A': 'High risk - 1% annual flood chance (100-year)',
      'AE': 'High risk - 1% annual flood chance with base elevations',
      'AH': 'High risk - shallow flooding (1-3 ft)',
      'AO': 'High risk - sheet flow flooding (1-3 ft)',
      'V': 'High risk - coastal flooding with wave action',
      'VE': 'High risk - coastal with base flood elevations',
      'X': 'Minimal flood risk',
      'B': 'Moderate flood risk (500-year)',
      'C': 'Minimal flood risk',
      'D': 'Undetermined risk - possible flooding',
    };

    return NextResponse.json({
      floodZone: zone,
      isFloodZone: sfha,
      description: descriptions[zone] ?? `Zone ${zone}`,
      detail: subtype || null,
      baseFloodElevation: attrs.STATIC_BFE ?? null,
    });
  } catch (err: any) {
    console.error('[flood]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
