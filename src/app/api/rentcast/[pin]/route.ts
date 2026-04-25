import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CACHE_FILE = join(process.cwd(), 'data', 'rentcast-cache.json');

interface RentcastCache {
  [pin: string]: {
    data: any;
    fetchedAt: string;
  };
}

function readCache(): RentcastCache {
  if (!existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeCache(cache: RentcastCache) {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function getApiKey(): string | null {
  // Check env first
  if (process.env.RENTCAST_API_KEY) return process.env.RENTCAST_API_KEY;

  // Check ai-settings for rentcast key
  const settingsFile = join(process.cwd(), 'data', 'ai-settings.json');
  if (!existsSync(settingsFile)) return null;
  try {
    const raw = readFileSync(settingsFile, 'utf-8');
    const data = JSON.parse(raw);
    const rentcast = (data.providers || []).find((p: any) => p.provider === 'rentcast');
    if (rentcast?.apiKey) {
      // Try to decrypt, fall back to raw
      try {
        const { decrypt } = require('@/lib/crypto');
        return decrypt(rentcast.apiKey);
      } catch {
        return rentcast.apiKey;
      }
    }
  } catch {}
  return null;
}

export async function GET(
  req: Request,
  { params }: { params: { pin: string } }
) {
  const { pin } = params;
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address');
  const bedrooms = searchParams.get('bedrooms');
  const bathrooms = searchParams.get('bathrooms');
  const sqft = searchParams.get('sqft');
  const propertyType = searchParams.get('propertyType') || 'Single Family';

  if (!pin) {
    return NextResponse.json({ error: 'PIN required' }, { status: 400 });
  }

  // Check cache first
  const cache = readCache();
  if (cache[pin]) {
    const age = Date.now() - new Date(cache[pin].fetchedAt).getTime();
    // Cache for 30 days
    if (age < 30 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ ...cache[pin].data, fromCache: true });
    }
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({
      error: 'Rentcast API key not configured. Add RENTCAST_API_KEY to .env.local or add Rentcast in Settings.',
    }, { status: 400 });
  }

  if (!address) {
    return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
  }

  const headers = {
    'accept': 'application/json',
    'X-Api-Key': apiKey,
  };

  try {
    // Build query params
    const baseParams = new URLSearchParams();
    baseParams.set('address', address);
    if (propertyType) baseParams.set('propertyType', propertyType);
    if (bedrooms) baseParams.set('bedrooms', bedrooms);
    if (bathrooms) baseParams.set('bathrooms', bathrooms);
    if (sqft) baseParams.set('squareFootage', sqft);
    baseParams.set('compCount', '10');

    // Fetch rent estimate and value estimate in parallel
    const [rentRes, valueRes] = await Promise.allSettled([
      fetch(`https://api.rentcast.io/v1/avm/rent/long-term?${baseParams}`, { headers }),
      fetch(`https://api.rentcast.io/v1/avm/value?${baseParams}`, { headers }),
    ]);

    const result: any = { pin, address, fetchedAt: new Date().toISOString() };

    // Parse rent estimate
    if (rentRes.status === 'fulfilled' && rentRes.value.ok) {
      const rentData = await rentRes.value.json();
      result.rentEstimate = rentData.rent ?? null;
      result.rentRangeLow = rentData.rentRangeLow ?? null;
      result.rentRangeHigh = rentData.rentRangeHigh ?? null;
      result.rentComps = (rentData.comparables || []).map((c: any) => ({
        address: c.formattedAddress || c.addressLine1,
        rent: c.price || c.rent,
        bedrooms: c.bedrooms,
        bathrooms: c.bathrooms,
        sqft: c.squareFootage,
        distance: c.distance,
        propertyType: c.propertyType,
      }));
    } else {
      const errText = rentRes.status === 'fulfilled' ? await rentRes.value.text() : 'fetch failed';
      console.error('[rentcast] Rent estimate error:', errText);
      result.rentError = rentRes.status === 'fulfilled' ? `API ${rentRes.value.status}` : 'Network error';
    }

    // Parse value estimate
    if (valueRes.status === 'fulfilled' && valueRes.value.ok) {
      const valData = await valueRes.value.json();
      result.valueEstimate = valData.price ?? null;
      result.valueRangeLow = valData.priceRangeLow ?? null;
      result.valueRangeHigh = valData.priceRangeHigh ?? null;
      result.valueComps = (valData.comparables || []).map((c: any) => ({
        address: c.formattedAddress || c.addressLine1,
        price: c.price,
        bedrooms: c.bedrooms,
        bathrooms: c.bathrooms,
        sqft: c.squareFootage,
        distance: c.distance,
        saleDate: c.lastSaleDate || c.listedDate,
        propertyType: c.propertyType,
      }));
    } else {
      const errText = valueRes.status === 'fulfilled' ? await valueRes.value.text() : 'fetch failed';
      console.error('[rentcast] Value estimate error:', errText);
      result.valueError = valueRes.status === 'fulfilled' ? `API ${valueRes.value.status}` : 'Network error';
    }

    // Cache the result
    cache[pin] = { data: result, fetchedAt: result.fetchedAt };
    writeCache(cache);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[rentcast]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
