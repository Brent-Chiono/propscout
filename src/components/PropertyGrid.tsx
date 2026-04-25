'use client';

import { SherifffListing } from '@/types';
import { formatSaleDate } from '@/lib/address';
import { getPropertyColorHex } from '@/lib/property-colors';
import styles from './PropertyGrid.module.css';

interface Props {
  listings: SherifffListing[];
  onCardClick?: (listing: SherifffListing) => void;
  highlightedId?: string | null;
}

function fmt$(val?: number): string {
  if (val == null) return '—';
  return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default function PropertyGrid({ listings, onCardClick, highlightedId }: Props) {
  if (listings.length === 0) {
    return <div className={styles.empty}>No listings to display.</div>;
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  return (
    <div className={styles.grid}>
      {listings.map((l) => {
        const equityClass = l.equity != null
          ? (l.equity > 0 ? styles.equityPositive : l.equity < 0 ? styles.equityNegative : '')
          : '';

        const streetviewUrl = l.lat && l.lng && apiKey
          ? `https://maps.googleapis.com/maps/api/streetview?size=400x180&location=${l.lat},${l.lng}&key=${apiKey}`
          : null;

        return (
          <div
            key={l.propertyId}
            className={`${styles.card} ${highlightedId === l.propertyId ? styles.cardHighlighted : ''}`}
            onClick={() => onCardClick?.(l)}
          >
            {streetviewUrl ? (
              <img src={streetviewUrl} alt="Street view" className={styles.streetview} />
            ) : (
              <div className={styles.streetviewPlaceholder}>No street view</div>
            )}

            <div className={styles.cardBody}>
              <div className={styles.cardAddress}>
                <span className={styles.colorDot} style={{ background: getPropertyColorHex(l.propertyId) }} />
                {l.propertyAddress || 'Unknown address'}
              </div>
              <div className={styles.cardRef}>{l.referenceNumber}</div>

              <div className={styles.cardStats}>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>Judgment</span>
                  <span className={styles.cardStatValue}>{l.approxJudgment || '—'}</span>
                </div>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>Assessed</span>
                  <span className={styles.cardStatValue}>{fmt$(l.assessedValue)}</span>
                </div>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>Last Sale</span>
                  <span className={styles.cardStatValue}>{fmt$(l.lastSaleAmount)}</span>
                </div>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>Taxes Owed</span>
                  <span className={`${styles.cardStatValue} ${l.outstandingTaxes && l.outstandingTaxes > 0 ? styles.equityNegative : ''}`}>
                    {fmt$(l.outstandingTaxes)}
                    {l.hasUnredeemedTaxSale && ' *'}
                  </span>
                </div>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>Equity</span>
                  <span className={`${styles.cardStatValue} ${equityClass}`}>
                    {l.equity != null ? fmt$(l.equity) : '—'}
                  </span>
                </div>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>Sqft</span>
                  <span className={styles.cardStatValue}>{l.sqft ? l.sqft.toLocaleString() : '—'}</span>
                </div>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>Year Built</span>
                  <span className={styles.cardStatValue}>{l.yearBuilt || '—'}</span>
                </div>
              </div>
            </div>

            <div className={styles.cardFooter}>
              <span className={styles.cardDate}>
                Sale: {formatSaleDate(l.salesDate)}
              </span>
              <span className={`${styles.cardBadge} ${l.isDelayed ? styles.badgeDelayed : styles.badgeActive}`}>
                {l.isDelayed ? 'DELAYED' : 'ACTIVE'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
