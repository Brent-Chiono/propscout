import { NextResponse } from 'next/server';

/**
 * USFWS National Wetlands Inventory — checks if a property is on or near wetlands.
 * Free, no auth required.
 */

export async function GET(
  _req: Request,
  { params }: { params: { lat: string; lng: string } }
) {
  const lat = parseFloat(params.lat);
  const lng = parseFloat(params.lng);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }

  try {
    // Query NWI for wetlands at this point (small buffer around the point)
    const buffer = 0.002; // ~200m
    const bbox = `${lng - buffer},${lat - buffer},${lng + buffer},${lat + buffer}`;

    const res = await fetch(
      `https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query?` +
      `geometry=${bbox}&geometryType=esriGeometryEnvelope&inSR=4326` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&outFields=WETLAND_TYPE,ATTRIBUTE,ACRES,SHAPE_Area&returnGeometry=false&f=json`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) {
      // Fallback — service may be down
      return NextResponse.json({
        onWetland: false,
        nearWetland: false,
        wetlands: [],
        error: `NWI service returned ${res.status}`,
      });
    }

    const data = await res.json();
    const features = data.features || [];

    const wetlands = features.map((f: any) => ({
      type: f.attributes?.WETLAND_TYPE || '',
      code: f.attributes?.ATTRIBUTE || '',
      acres: f.attributes?.ACRES ? Math.round(f.attributes.ACRES * 100) / 100 : null,
    }));

    const onWetland = wetlands.length > 0;

    // Descriptions for common wetland types
    const typeDescriptions: Record<string, string> = {
      'Freshwater Emergent Wetland': 'Marshes, wet meadows — saturated soil with herbaceous plants',
      'Freshwater Forested/Shrub Wetland': 'Swamps, bogs — forested areas with saturated soil',
      'Freshwater Pond': 'Small standing water body',
      'Lake': 'Larger water body',
      'Riverine': 'Stream or river channel',
      'Other': 'Other wetland type',
    };

    return NextResponse.json({
      onWetland,
      nearWetland: onWetland,
      wetlandCount: wetlands.length,
      wetlands: wetlands.slice(0, 5),
      description: onWetland
        ? `Property is on or adjacent to ${wetlands.length} wetland area(s). ${wetlands[0]?.type || ''}`
        : 'No wetlands detected at this location.',
      typeDescriptions,
    });
  } catch (err: any) {
    console.error('[wetlands]', err);
    return NextResponse.json({
      onWetland: false,
      nearWetland: false,
      wetlands: [],
      error: err.message,
    });
  }
}
