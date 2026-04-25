'use client';

import { useEffect, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

let loaderPromise: Promise<unknown> | null = null;

export function useGoogleMaps(): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set');
      return;
    }

    if (!loaderPromise) {
      const loader = new Loader({
        apiKey,
        version: 'weekly',
        libraries: ['maps', 'marker'],
      });
      loaderPromise = loader.load();
    }

    loaderPromise.then(() => setLoaded(true)).catch(console.error);
  }, []);

  return loaded;
}
