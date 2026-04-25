/**
 * Geocodes an address using the Google Maps Geocoding API.
 * Runs server-side (in API routes or server components) — never exposes the key client-side.
 * Falls back to NEXT_PUBLIC key only if server key not set (key is already public in that case).
 */
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey =
    process.env.GOOGLE_MAPS_SERVER_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn('No Google Maps API key configured for geocoding');
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.results?.length) {
      return data.results[0].geometry.location as { lat: number; lng: number };
    }
    console.warn('[geocode] status:', data.status, data.error_message);
    return null;
  } catch (err) {
    console.error('[geocode]', err);
    return null;
  }
}
