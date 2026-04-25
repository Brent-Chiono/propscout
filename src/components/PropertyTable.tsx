'use client';

import { useState, useMemo } from 'react';
import { SherifffListing } from '@/types';
import { formatSaleDate } from '@/lib/address';
import { getPropertyColorHex } from '@/lib/property-colors';
import styles from './PropertyTable.module.css';

interface Props {
  listings: SherifffListing[];
  onRowClick?: (listing: SherifffListing) => void;
  highlightedId?: string | null;
}

type SortKey = 'salesDate' | 'propertyAddress' | 'referenceNumber' | 'assessedValue' | 'outstandingTaxes' | 'lastSaleAmount' | 'equity';
type SortDir = 'asc' | 'desc';

function fmt$(val?: number): string {
  if (val == null) return '—';
  return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default function PropertyTable({ listings, onRowClick, highlightedId }: Props) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('salesDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const pageSize = 15;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return listings.filter(
      (l) =>
        l.propertyAddress?.toLowerCase().includes(q) ||
        l.referenceNumber?.toLowerCase().includes(q) ||
        l.propertyId?.toLowerCase().includes(q)
    );
  }, [listings, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: any = (a as any)[sortKey] ?? '';
      let bv: any = (b as any)[sortKey] ?? '';
      // For numeric sorts, treat undefined as -Infinity so they sort last
      if (['assessedValue', 'outstandingTaxes', 'lastSaleAmount', 'equity'].includes(sortKey)) {
        av = av === '' ? (sortDir === 'asc' ? Infinity : -Infinity) : av;
        bv = bv === '' ? (sortDir === 'asc' ? Infinity : -Infinity) : bv;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const paginated = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className={styles.sortNeutral}>↕</span>;
    return <span className={styles.sortActive}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search address, reference…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <span className={styles.count}>
          {filtered.length} propert{filtered.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th onClick={() => toggleSort('referenceNumber')} className={styles.sortable}>
                Ref # <SortIcon col="referenceNumber" />
              </th>
              <th onClick={() => toggleSort('salesDate')} className={styles.sortable}>
                Sale Date <SortIcon col="salesDate" />
              </th>
              <th onClick={() => toggleSort('propertyAddress')} className={styles.sortable}>
                Address <SortIcon col="propertyAddress" />
              </th>
              <th onClick={() => toggleSort('assessedValue')} className={styles.sortable}>
                Assessed <SortIcon col="assessedValue" />
              </th>
              <th onClick={() => toggleSort('lastSaleAmount')} className={styles.sortable}>
                Last Sale <SortIcon col="lastSaleAmount" />
              </th>
              <th onClick={() => toggleSort('outstandingTaxes')} className={styles.sortable}>
                Taxes <SortIcon col="outstandingTaxes" />
              </th>
              <th onClick={() => toggleSort('equity')} className={styles.sortable}>
                Equity <SortIcon col="equity" />
              </th>
              <th>Delayed</th>
              <th>Map</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  {listings.length === 0 ? 'Loading listings…' : 'No results match your search.'}
                </td>
              </tr>
            )}
            {paginated.map((l) => {
              const equityVal = l.equity;
              const equityClass = equityVal != null
                ? (equityVal > 0 ? styles.positive : equityVal < 0 ? styles.negative : '')
                : '';

              return (
                <tr
                  key={l.propertyId}
                  className={[
                    styles.row,
                    highlightedId === l.propertyId ? styles.highlighted : '',
                    l.lat ? styles.geocoded : '',
                  ].join(' ')}
                  onClick={() => onRowClick?.(l)}
                >
                  <td>
                    <a
                      href={`https://sheriffsaleviewer.polkcountyiowa.gov/Home/Detail/${l.propertyId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className={styles.idLink}
                    >
                      {l.referenceNumber}
                    </a>
                  </td>
                  <td className={styles.mono}>{formatSaleDate(l.salesDate)}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: getPropertyColorHex(l.propertyId),
                        border: '1px solid var(--border-hover)',
                        display: 'inline-block',
                      }} />
                      {l.propertyAddress}
                    </span>
                  </td>
                  <td className={styles.mono}>{fmt$(l.assessedValue)}</td>
                  <td className={styles.mono}>{fmt$(l.lastSaleAmount)}</td>
                  <td className={`${styles.mono} ${l.outstandingTaxes && l.outstandingTaxes > 0 ? styles.negative : ''}`}>
                    {fmt$(l.outstandingTaxes)}
                    {l.hasUnredeemedTaxSale && <span title="Unredeemed tax sale cert"> !</span>}
                  </td>
                  <td className={`${styles.mono} ${equityClass}`}>
                    {equityVal != null ? fmt$(equityVal) : '—'}
                  </td>
                  <td>
                    <span className={l.isDelayed ? styles.badgeYellow : styles.badgeGreen}>
                      {l.isDelayed ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td>
                    {l.lat ? (
                      <span className={styles.mapDot} style={{ background: getPropertyColorHex(l.propertyId) }} title="On map" />
                    ) : (
                      <span className={styles.mapDotPending} title="Geocoding…" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <span className={styles.pageInfo}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            className={styles.pageBtn}
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
