'use client';

import { useEffect, useRef } from 'react';
import { useGoogleMaps } from '@/lib/useGoogleMaps';
import { useTheme } from '@/components/ThemeProvider';
import { SherifffListing } from '@/types';
import { getPropertyColorHex } from '@/lib/property-colors';
import styles from './PropertyMap.module.css';

interface Props {
  listings: SherifffListing[];
  onMarkerClick?: (listing: SherifffListing) => void;
}

const POLK_COUNTY_CENTER = { lat: 41.64, lng: -93.6242 };

const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'water', stylers: [{ color: '#0f3460' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a0aec0' }] },
  { featureType: 'landscape', stylers: [{ color: '#16213e' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a9a' }] },
];

const LIGHT_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#e0e0e0' }] },
  { featureType: 'water', stylers: [{ color: '#aadaff' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#444444' }] },
  { featureType: 'landscape', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#666666' }] },
];

export default function PropertyMap({ listings, onMarkerClick }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const mapsLoaded = useGoogleMaps();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Initialize map once Maps API is ready
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || mapInstanceRef.current) return;

    mapInstanceRef.current = new google.maps.Map(mapRef.current, {
      center: POLK_COUNTY_CENTER,
      zoom: 11,
      mapTypeId: 'roadmap',
      maxZoom: 18,
      minZoom: 8,
      disableDefaultUI: false,
      styles: isDark ? DARK_STYLES : LIGHT_STYLES,
    });

    infoWindowRef.current = new google.maps.InfoWindow();
  }, [mapsLoaded, isDark]);

  // Toggle map styles when isDark changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setOptions({ styles: isDark ? DARK_STYLES : LIGHT_STYLES });
  }, [isDark]);

  // Drop/update markers whenever listings change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const geocodedListings = listings.filter((l) => l.lat && l.lng);

    geocodedListings.forEach((listing) => {
      const marker = new google.maps.Marker({
        position: { lat: listing.lat!, lng: listing.lng! },
        map: mapInstanceRef.current!,
        title: listing.propertyAddress,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: getPropertyColorHex(listing.propertyId),
          fillOpacity: 0.9,
          strokeColor: isDark ? '#ffffff' : '#333333',
          strokeWeight: 1.5,
        },
      });

      marker.addListener('click', () => {
        onMarkerClick?.(listing);

        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        const streetviewUrl = `https://maps.googleapis.com/maps/api/streetview?size=280x180&location=${listing.lat},${listing.lng}&key=${apiKey}`;
        const streetviewLink = `http://maps.google.com/maps?q=&layer=c&cbll=${listing.lat},${listing.lng}`;
        const sheriffUrl = `https://sheriffsaleviewer.polkcountyiowa.gov/Home/Detail/${listing.propertyId}`;

        const content = `
          <div class="iw-root">
            <a href="${streetviewLink}" target="_blank" rel="noopener">
              <img src="${streetviewUrl}" alt="Street view" style="width:280px;height:180px;border-radius:6px;display:block;" />
            </a>
            <div style="margin-top:10px;">
              <a href="${sheriffUrl}" target="_blank" rel="noopener" style="font-weight:600;color:#e94560;text-decoration:none;">
                ${listing.propertyAddress}
              </a>
            </div>
            ${listing.approxJudgment
              ? `<div style="margin-top:4px;font-size:12px;color:#666;">Approx. Judgment: <strong>${listing.approxJudgment}</strong></div>`
              : `<div style="margin-top:4px;font-size:12px;color:#999;">Loading judgment amount…</div>`
            }
            ${listing.parcelPin
              ? `<div style="font-size:12px;color:#666;">Parcel PIN: <strong>${listing.parcelPin}</strong></div>`
              : ''
            }
          </div>
        `;

        infoWindowRef.current!.setContent(content);
        infoWindowRef.current!.open(mapInstanceRef.current!, marker);
      });

      markersRef.current.push(marker);
    });
  }, [listings, onMarkerClick, isDark, mapsLoaded]);

  if (!mapsLoaded) {
    return (
      <div className={styles.mapPlaceholder}>
        <div className={styles.mapLoader}>
          <div className={styles.pulse} />
          <span>Loading map…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mapWrapper}>
      <div ref={mapRef} className={styles.map} />
      <div className={styles.legend}>
        Each property has a unique color — match dots to the grid/table
      </div>
    </div>
  );
}
