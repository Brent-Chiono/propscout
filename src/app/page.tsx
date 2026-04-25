'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { SherifffListing } from '@/types';
import DocsHUD from '@/components/DocsHUD';
import TaxSaleTab from '@/components/TaxSaleTab';
import { normalizeAddressForTaxSearch } from '@/lib/address';
import { analyzeLienPosition } from '@/lib/lien-analysis';
import { useTheme } from '@/components/ThemeProvider';
import PropertyTable from '@/components/PropertyTable';
import PropertyGrid from '@/components/PropertyGrid';
import PropertyDetail from '@/components/PropertyDetail';
import Filters, { FilterState, DEFAULT_FILTERS } from '@/components/Filters';
import styles from './page.module.css';

const PropertyMap = dynamic(() => import('@/components/PropertyMap'), { ssr: false });

type ViewMode = 'map' | 'table' | 'grid';

interface NoteData {
  note: string;
  favorite: boolean;
  skip: boolean;
}

export default function Home() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [listings, setListings] = useState<SherifffListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<SherifffListing | null>(null);
  const [geocodeProgress, setGeocodeProgress] = useState({ done: 0, total: 0 });
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [cacheInfo, setCacheInfo] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notes, setNotes] = useState<Record<string, NoteData>>({});
  const [initialAiChat, setInitialAiChat] = useState<{ role: 'user' | 'assistant'; content: string }[] | undefined>(undefined);
  const [aiTopPicks, setAiTopPicks] = useState<string | null>(null);
  const [aiTopPicksLoading, setAiTopPicksLoading] = useState(false);
  const [aiTopPicksError, setAiTopPicksError] = useState<string | null>(null);
  const [aiTopPicksOpen, setAiTopPicksOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [appTab, setAppTab] = useState<'auctions' | 'taxsales'>('auctions');
  const [taxSaleListings, setTaxSaleListings] = useState<any[]>([]);

  const listingsRef = useRef<SherifffListing[]>([]);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const enrichedSetRef = useRef<Set<string>>(new Set());
  const enrichQueueRef = useRef<SherifffListing[]>([]);
  const enrichRunningRef = useRef(false);
  const initRef = useRef(false);
  const geocodingRef = useRef(false);

  useEffect(() => { listingsRef.current = listings; }, [listings]);

  // Load tax sale listings for cross-linking
  useEffect(() => {
    fetch('/api/taxsale-listings').then(r => r.json()).then(data => {
      if (data.listings?.length) setTaxSaleListings(data.listings);
    }).catch(() => {});
  }, []);

  // Load notes and settings on mount
  useEffect(() => {
    fetch('/api/notes').then(r => r.json()).then(data => {
      const mapped: Record<string, NoteData> = {};
      for (const [id, n] of Object.entries(data)) {
        const note = n as any;
        mapped[id] = { note: note.note, favorite: note.favorite, skip: note.skip };
      }
      setNotes(mapped);
    }).catch(() => {});

    fetch('/api/settings').then(r => r.json()).then(data => {
      if (data.viewMode) setViewMode(data.viewMode);
      if (data.filters) setFilters(prev => ({ ...prev, ...data.filters }));
    }).catch(() => {});
  }, []);

  // Save settings when viewMode or filters change
  const settingsSaveRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (settingsSaveRef.current) clearTimeout(settingsSaveRef.current);
    settingsSaveRef.current = setTimeout(() => {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ viewMode, filters }),
      }).catch(() => {});
    }, 500);
  }, [viewMode, filters]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const current = listingsRef.current;
      if (current.length > 0) {
        fetch('/api/listings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ listings: current }),
        }).catch(() => {});
      }
    }, 3000);
  }, []);

  // --- Enrichment queue processor ---
  const processEnrichQueue = useCallback(async () => {
    if (enrichRunningRef.current) return;
    enrichRunningRef.current = true;

    while (enrichQueueRef.current.length > 0) {
      const batch = enrichQueueRef.current.splice(0, 3);
      await Promise.allSettled(batch.map(async (listing) => {
        try {
          // Get the latest version of this listing (may have lat/lng now)
          const current = listingsRef.current.find(l => l.propertyId === listing.propertyId) ?? listing;

          // Build all fetches in parallel
          const fetches: Promise<{ key: string; data: any }>[] = [];

          // Assessor data
          fetches.push(
            fetch(`/api/assessor/${encodeURIComponent(listing.parcelPin!)}`)
              .then(r => r.ok ? r.json() : {})
              .then(data => ({ key: 'assessor', data }))
              .catch(() => ({ key: 'assessor', data: {} }))
          );

          // Tax details (treasurer site)
          if (current.outstandingTaxes == null) {
            fetches.push(
              fetch(`/api/tax-details/${encodeURIComponent(listing.parcelPin!)}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => ({ key: 'tax', data }))
                .catch(() => ({ key: 'tax', data: null }))
            );
          }

          // Judgment
          if (!current.approxJudgment) {
            fetches.push(
              fetch(`/api/sheriff-details/${listing.propertyId}`)
                .then(r => r.ok ? r.json() : {})
                .then(data => ({ key: 'judgment', data }))
                .catch(() => ({ key: 'judgment', data: {} }))
            );
          }

          // Flood zone (if we have coordinates)
          if (current.lat && current.lng && current.floodZone == null) {
            fetches.push(
              fetch(`/api/flood/${current.lat}/${current.lng}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => ({ key: 'flood', data }))
                .catch(() => ({ key: 'flood', data: null }))
            );
          }

          // Census data (if we have coordinates)
          if (current.lat && current.lng && current.medianHouseholdIncome == null) {
            fetches.push(
              fetch(`/api/census/${current.lat}/${current.lng}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => ({ key: 'census', data }))
                .catch(() => ({ key: 'census', data: null }))
            );
          }

          // HUD rent (extract ZIP from address)
          if (current.hudRent2Bed == null) {
            const zipMatch = current.propertyAddress?.match(/\b(\d{5})\b/);
            const zip = zipMatch ? zipMatch[1] : null;
            if (zip) {
              fetches.push(
                fetch(`/api/rent/${zip}`)
                  .then(r => r.ok ? r.json() : null)
                  .then(data => ({ key: 'rent', data }))
                  .catch(() => ({ key: 'rent', data: null }))
              );
            }
          }

          const results = await Promise.all(fetches);

          setListings(prev => prev.map(l => {
            if (l.propertyId !== listing.propertyId) return l;

            const updates: any = { enrichedAt: new Date().toISOString() };

            for (const { key, data } of results) {
              if (!data) continue;
              if (key === 'assessor') Object.assign(updates, data);
              if (key === 'judgment' && data.judgmentAmount) updates.approxJudgment = data.judgmentAmount;
              if (key === 'flood') {
                updates.floodZone = data.floodZone;
                updates.isFloodZone = data.isFloodZone;
                updates.floodDescription = data.description;
              }
              if (key === 'census') {
                updates.medianHouseholdIncome = data.medianHouseholdIncome;
                updates.medianHomeValue = data.medianHomeValue;
                updates.medianGrossRent = data.medianGrossRent;
                updates.ownerOccupiedPct = data.ownerOccupiedPct;
              }
              if (key === 'rent') {
                updates.hudRent2Bed = data.twoBedroom;
                updates.hudRent3Bed = data.threeBedroom;
              }
              if (key === 'tax') {
                updates.outstandingTaxes = data.totalDue;
                updates.taxDelinquentYears = data.delinquentYears;
                updates.hasUnredeemedTaxSale = data.hasUnredeemedTaxSale;
                updates.payOnlineUrl = data.payOnlineUrl;
                if (data.taxSales?.length > 0) {
                  const openSale = data.taxSales.find((s: any) => s.status === 'Open');
                  if (openSale) {
                    updates.taxSaleAmount = openSale.taxSaleAmount;
                    updates.taxSaleCertNumber = openSale.certNumber;
                    updates.taxSaleYear = openSale.taxYear;
                  }
                }
                if (data.installments?.length > 0) {
                  updates.taxInstallments = data.installments
                    .filter((i: any) => i.totalDueTotal > 0)
                    .map((i: any) => ({
                      year: i.year,
                      installmentNum: i.installmentNum,
                      totalDue: i.totalDueTotal,
                      originalTotal: i.total,
                      soldAtTaxSale: i.soldAtTaxSale,
                    }));
                  // Set taxYear to most recent delinquent year
                  if (data.delinquentYears?.length > 0) {
                    updates.taxYear = data.delinquentYears[data.delinquentYears.length - 1];
                  }
                }
              }
            }

            const judgment = updates.approxJudgment || l.approxJudgment;
            const judgmentNum = parseJudgment(judgment);
            const assessed = updates.assessedValue ?? l.assessedValue;
            const equity = assessed && judgmentNum ? assessed - judgmentNum : undefined;

            return { ...l, ...updates, approxJudgment: judgment || l.approxJudgment, equity };
          }));
        } catch {}
        setEnrichProgress(p => ({ ...p, done: p.done + 1 }));
      }));
    }

    enrichRunningRef.current = false;
    scheduleSave();
  }, [scheduleSave]);

  // Queue a listing for enrichment when it gets a parcel PIN
  const queueEnrich = useCallback((listing: SherifffListing) => {
    if (!listing.parcelPin || enrichedSetRef.current.has(listing.propertyId) || listing.enrichedAt) return;
    enrichedSetRef.current.add(listing.propertyId);
    enrichQueueRef.current.push(listing);
    setEnrichProgress(p => ({ ...p, total: p.total + 1 }));
    processEnrichQueue();
  }, [processEnrichQueue]);

  // Load data (guard against React strict mode double-fire)
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function loadData() {
      try {
        const cacheRes = await fetch('/api/listings');
        const cacheData = await cacheRes.json();

        if (cacheData.fromCache && cacheData.listings?.length > 0) {
          const cached: SherifffListing[] = cacheData.listings;
          setListings(cached);
          setCacheInfo(`Cached ${new Date(cacheData.fetchedAt).toLocaleString()}`);
          setLoading(false);

          // Mark already-enriched listings so we don't re-fetch
          for (const l of cached) {
            if (l.enrichedAt) enrichedSetRef.current.add(l.propertyId);
          }

          // Queue geocoding for listings that still need it
          const needsGeocode = cached.filter(l => !l.lat && l.propertyAddress);
          if (needsGeocode.length > 0) {
            startGeocoding(needsGeocode);
          }

          // Queue enrichment for listings that have PIN but no assessor data
          const needsEnrich = cached.filter(l => l.parcelPin && l.assessedValue == null);
          for (const l of needsEnrich) queueEnrich(l);

          return;
        }

        await fetchFresh();
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function fetchFresh() {
    setLoading(true);
    setError(null);
    setCacheInfo(null);
    enrichedSetRef.current.clear();
    enrichQueueRef.current = [];
    setEnrichProgress({ done: 0, total: 0 });
    geocodingRef.current = false;
    enrichRunningRef.current = false;

    try {
      const res = await fetch('/api/fetch-sheriff');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data: SherifffListing[] = await res.json();
      setListings(data);
      startGeocoding(data);

      // Record snapshot for auction history
      fetch('/api/history', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ listings: data }),
      }).catch(() => {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startGeocoding(queue: SherifffListing[]) {
    if (geocodingRef.current) return;
    geocodingRef.current = true;
    setGeocodeProgress({ done: 0, total: queue.length });

    async function geocodeOne(listing: SherifffListing) {
      if (!listing.propertyAddress) {
        setGeocodeProgress(p => ({ ...p, done: p.done + 1 }));
        return;
      }
      try {
        const res = await fetch(`/api/geocode?address=${encodeURIComponent(listing.propertyAddress)}`);
        if (!res.ok) {
          setGeocodeProgress(p => ({ ...p, done: p.done + 1 }));
          return;
        }
        const { lat, lng } = await res.json();
        setListings(prev => prev.map(l =>
          l.propertyId === listing.propertyId ? { ...l, lat, lng } : l
        ));
        setGeocodeProgress(p => ({ ...p, done: p.done + 1 }));

        // Fetch parcel PIN, then queue enrichment
        fetchParcel(listing);
      } catch {
        setGeocodeProgress(p => ({ ...p, done: p.done + 1 }));
      }
    }

    async function fetchParcel(listing: SherifffListing) {
      try {
        const normalized = normalizeAddressForTaxSearch(listing.propertyAddress);
        const res = await fetch(`/api/parcel-details/${normalized}`);
        if (!res.ok) return;
        const parcels = await res.json();
        if (parcels?.length) {
          const pin = parcels[0].PIN;
          setListings(prev => prev.map(l =>
            l.propertyId === listing.propertyId ? { ...l, parcelPin: pin } : l
          ));
          // Immediately queue for enrichment
          queueEnrich({ ...listing, parcelPin: pin });
        }
      } catch {}
    }

    async function run() {
      const CONCURRENCY = 5;
      let i = 0;
      while (i < queue.length) {
        const batch = queue.slice(i, i + CONCURRENCY);
        await Promise.allSettled(batch.map(geocodeOne));
        i += CONCURRENCY;
      }
      scheduleSave();
    }

    run();
  }

  // Click handlers
  const handleListingClick = useCallback((listing: SherifffListing) => {
    setHighlightedId(listing.propertyId);
    setInitialAiChat(undefined);
    setSelectedListing(listing);

    if (!listing.approxJudgment) {
      fetch(`/api/sheriff-details/${listing.propertyId}`)
        .then(r => r.json())
        .then(({ judgmentAmount }) => {
          if (judgmentAmount) {
            setListings(prev => prev.map(l =>
              l.propertyId === listing.propertyId ? { ...l, approxJudgment: judgmentAmount } : l
            ));
            setSelectedListing(prev =>
              prev?.propertyId === listing.propertyId ? { ...prev, approxJudgment: judgmentAmount } : prev
            );
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleRowClick = useCallback((listing: SherifffListing) => {
    setHighlightedId(listing.propertyId);
    setInitialAiChat(undefined);
    setSelectedListing(listing);
  }, []);

  const handleNoteChange = useCallback((propertyId: string, note: string, favorite: boolean, skip: boolean) => {
    setNotes(prev => ({ ...prev, [propertyId]: { note, favorite, skip } }));
    fetch('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ propertyId, note, favorite, skip }),
    }).catch(() => {});
  }, []);

  async function handleResync() {
    setSyncing(true);
    try {
      await fetch('/api/sync', { method: 'POST' });
      enrichRunningRef.current = false;
      await fetchFresh();
    } finally {
      setSyncing(false);
    }
  }

  async function fetchAiTopPicks() {
    setAiTopPicksLoading(true);
    setAiTopPicksError(null);
    setAiTopPicks(null);
    setAiTopPicksOpen(true);
    try {
      const enriched = listings.filter(l => l.assessedValue && l.approxJudgment);
      if (enriched.length === 0) {
        setAiTopPicksError('No enriched listings available yet. Wait for data to load.');
        return;
      }
      const res = await fetch('/api/ai-top-picks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ listings: enriched }),
      });
      const data = await res.json();
      if (data.error) {
        setAiTopPicksError(data.error);
      } else {
        setAiTopPicks(data.analysis);
      }
    } catch (err: any) {
      setAiTopPicksError(err.message);
    } finally {
      setAiTopPicksLoading(false);
    }
  }

  // Apply filters
  const filteredListings = useMemo(() => {
    return listings.filter(l => {
      if (filters.status === 'active' && l.isDelayed) return false;
      if (filters.status === 'delayed' && !l.isDelayed) return false;
      if (filters.equityOnly && (l.equity == null || l.equity <= 0)) return false;
      if (filters.hasData && l.assessedValue == null) return false;
      if (filters.minAssessed) {
        const min = parseInt(filters.minAssessed);
        if (l.assessedValue == null || l.assessedValue < min) return false;
      }
      if (filters.maxAssessed) {
        const max = parseInt(filters.maxAssessed);
        if (l.assessedValue == null || l.assessedValue > max) return false;
      }
      if (filters.riskLevel !== 'all') {
        const lien = analyzeLienPosition(l.plaintiff);
        if (lien.risk !== filters.riskLevel) return false;
      }
      if (filters.minBeds) {
        const min = parseInt(filters.minBeds);
        if (l.bedrooms == null || l.bedrooms < min) return false;
      }
      if (filters.minBaths) {
        const min = parseInt(filters.minBaths);
        if (l.bathrooms == null || l.bathrooms < min) return false;
      }
      if (filters.minJudgment || filters.maxJudgment) {
        const judgmentNum = parseJudgment(l.approxJudgment);
        if (filters.minJudgment) {
          const min = parseInt(filters.minJudgment);
          if (judgmentNum == null || judgmentNum < min) return false;
        }
        if (filters.maxJudgment) {
          const max = parseInt(filters.maxJudgment);
          if (judgmentNum == null || judgmentNum > max) return false;
        }
      }
      return true;
    });
  }, [listings, filters]);

  const geocodePercent = geocodeProgress.total > 0 ? Math.round((geocodeProgress.done / geocodeProgress.total) * 100) : 0;
  const enrichPercent = enrichProgress.total > 0 ? Math.round((enrichProgress.done / enrichProgress.total) * 100) : 0;

  const currentSelected = selectedListing
    ? listings.find(l => l.propertyId === selectedListing.propertyId) ?? selectedListing
    : null;

  // Find cross-linked tax sale for the selected auction property
  const linkedTaxSale = useMemo(() => {
    if (!currentSelected?.parcelPin || !taxSaleListings.length) return null;
    const pin = currentSelected.parcelPin.replace(/\./g, '');
    return taxSaleListings.find((ts: any) => ts.parcelPin.replace(/\./g, '') === pin) || null;
  }, [currentSelected, taxSaleListings]);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>Polk County Investor</h1>
            <div className={styles.appTabs}>
              <button
                className={`${styles.appTab} ${appTab === 'auctions' ? styles.appTabActive : ''}`}
                onClick={() => setAppTab('auctions')}
              >
                Sheriff Auctions
              </button>
              <button
                className={`${styles.appTab} ${appTab === 'taxsales' ? styles.appTabActive : ''}`}
                onClick={() => setAppTab('taxsales')}
              >
                Tax Sales
              </button>
            </div>
          </div>
          <div className={styles.headerRight}>
            {appTab === 'auctions' && (
              <div className={styles.stats}>
                {!loading && !error && (
                  <>
                    <div className={styles.stat}>
                      <span className={styles.statNum}>{listings.length}</span>
                      <span className={styles.statLabel}>Listings</span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statNum}>{listings.filter(l => l.isDelayed).length}</span>
                      <span className={styles.statLabel}>Delayed</span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statNum}>{listings.filter(l => l.lat).length}</span>
                      <span className={styles.statLabel}>Mapped</span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statNum}>{listings.filter(l => l.assessedValue).length}</span>
                      <span className={styles.statLabel}>Assessed</span>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className={styles.actions}>
              {appTab === 'auctions' && cacheInfo && <span className={styles.cacheLabel}>{cacheInfo}</span>}
              {appTab === 'auctions' && (
                <button className={styles.resyncBtn} onClick={handleResync} disabled={syncing || loading}>
                  {syncing ? 'Syncing...' : 'Resync'}
                </button>
              )}
              <div className={styles.downloadWrap}>
                <button className={styles.resyncBtn} onClick={() => setDownloadOpen(!downloadOpen)}>
                  Download {downloadOpen ? '\u25B2' : '\u25BC'}
                </button>
                {downloadOpen && (
                  <div className={styles.downloadMenu}>
                    <button onClick={() => { downloadJson(listings, 'auction-listings'); setDownloadOpen(false); }}>Auction Listings</button>
                    <button onClick={() => { downloadJson(notes, 'notes'); setDownloadOpen(false); }}>Notes</button>
                    <button onClick={() => {
                      fetch('/api/taxsale-listings').then(r => r.json()).then(d => downloadJson(d.listings || [], 'taxsale-listings'));
                      setDownloadOpen(false);
                    }}>Tax Sale Listings</button>
                    <button onClick={() => {
                      fetch('/api/history').then(r => r.json()).then(d => downloadJson(d, 'auction-history'));
                      setDownloadOpen(false);
                    }}>Auction History</button>
                    <button onClick={() => {
                      Promise.all([
                        fetch('/api/listings').then(r => r.json()),
                        fetch('/api/taxsale-listings').then(r => r.json()),
                        fetch('/api/history').then(r => r.json()),
                      ]).then(([l, t, h]) => {
                        downloadJson({ auctionListings: l.listings, taxSaleListings: t.listings, notes, auctionHistory: h }, 'all-data');
                      });
                      setDownloadOpen(false);
                    }}>All Data (Combined)</button>
                  </div>
                )}
              </div>
              <button className={styles.themeBtn} onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                {theme === 'dark' ? '\u2600' : '\u263E'}
              </button>
              <button className={styles.iconBtn} onClick={() => setDocsOpen(true)} title="Documentation & AI Help">?</button>
              <Link href="/settings" className={styles.iconBtn} title="Settings">{'\u2699'}</Link>
            </div>
          </div>
        </div>

        {appTab === 'auctions' && geocodeProgress.total > 0 && geocodePercent < 100 && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${geocodePercent}%` }} />
            <span className={styles.progressLabel}>Geocoding {geocodeProgress.done}/{geocodeProgress.total}</span>
          </div>
        )}
        {appTab === 'auctions' && enrichProgress.total > 0 && enrichPercent < 100 && (
          <div className={styles.progressBar}>
            <div className={styles.progressFillAlt} style={{ width: `${enrichPercent}%` }} />
            <span className={styles.progressLabel}>Fetching assessor data {enrichProgress.done}/{enrichProgress.total}</span>
          </div>
        )}
      </header>

      {/* ===== TAX SALES TAB ===== */}
      {appTab === 'taxsales' && <TaxSaleTab onOpenDocs={() => setDocsOpen(true)} auctionListings={listings} />}

      {/* ===== AUCTIONS TAB ===== */}
      {appTab === 'auctions' && <div className={styles.content}>
        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Fetching sheriff sale listings...</p>
          </div>
        )}

        {error && (
          <div className={styles.errorState}>
            <span className={styles.errorIcon}>!</span>
            <p>{error}</p>
            <button className={styles.retryBtn} onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className={styles.controlBar}>
              <div className={styles.viewToggle}>
                {(['map', 'grid', 'table'] as ViewMode[]).map(mode => (
                  <button
                    key={mode}
                    className={`${styles.viewBtn} ${viewMode === mode ? styles.viewBtnActive : ''}`}
                    onClick={() => setViewMode(mode)}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <Filters filters={filters} onChange={setFilters} />

            {/* AI Top Picks */}
            <div className={styles.aiTopPicks}>
              <div className={styles.aiTopPicksHeader}>
                <button
                  className={styles.aiTopPicksBtn}
                  onClick={() => aiTopPicks ? setAiTopPicksOpen(!aiTopPicksOpen) : fetchAiTopPicks()}
                  disabled={aiTopPicksLoading}
                >
                  {aiTopPicksLoading ? 'AI Analyzing...' : aiTopPicks ? (aiTopPicksOpen ? 'Hide AI Top Picks' : 'Show AI Top Picks') : 'Get AI Top Picks'}
                </button>
                {aiTopPicks && (
                  <button className={styles.aiTopPicksRefresh} onClick={fetchAiTopPicks} disabled={aiTopPicksLoading}>
                    Refresh
                  </button>
                )}
              </div>
              {aiTopPicksOpen && aiTopPicksLoading && (
                <div className={styles.aiTopPicksLoading}>
                  <div className={styles.aiTopPicksSpinner} />
                  Analyzing {listings.filter(l => l.assessedValue && l.approxJudgment).length} properties...
                </div>
              )}
              {aiTopPicksOpen && aiTopPicksError && (
                <div className={styles.aiTopPicksError}>{aiTopPicksError}</div>
              )}
              {aiTopPicksOpen && aiTopPicks && (
                <div className={styles.aiTopPicksContent}>
                  {aiTopPicks.split('\n').map((line, i) => {
                    const renderLine = (html: string) => {
                      // Find addresses in the text and make them clickable
                      const addrRegex = /(\d+\s+[A-Z0-9\s.]+(?:ST|AVE|DR|CT|PL|LN|BLVD|RD|WAY|CIR|LANE|TRL|PKWY)[^,]*,\s*[A-Z\s]+,\s*IA\s+\d{5})/gi;
                      const parts = html.split(addrRegex);
                      if (parts.length <= 1) return <span dangerouslySetInnerHTML={{ __html: html }} />;
                      return <>{parts.map((part, j) => {
                        const match = listings.find(l =>
                          l.propertyAddress && part.trim().toUpperCase().includes(
                            l.propertyAddress.replace(/,\s*/g, ', ').toUpperCase().split(',')[0]
                          )
                        );
                        if (match) {
                          return <span key={j}
                            className={styles.aiAddress}
                            onClick={() => {
                              setHighlightedId(match.propertyId);
                              // Extract AI analysis section for this property
                              if (aiTopPicks) {
                                const addr = match.propertyAddress?.split(',')[0] || '';
                                const lines = aiTopPicks.split('\n');
                                let capturing = false;
                                let section: string[] = [];
                                for (const l of lines) {
                                  if (l.toUpperCase().includes(addr.toUpperCase())) { capturing = true; }
                                  else if (capturing && l.match(/^\d+\.\s+\*\*/) && section.length > 3) { break; }
                                  else if (capturing && l.match(/^##?\s/) && section.length > 3) { break; }
                                  if (capturing) section.push(l);
                                }
                                if (section.length > 0) {
                                  setInitialAiChat([
                                    { role: 'user', content: 'What did you find about this property in your top picks analysis?' },
                                    { role: 'assistant', content: section.join('\n') },
                                  ]);
                                } else {
                                  setInitialAiChat(undefined);
                                }
                              }
                              setSelectedListing(match);
                            }}
                            dangerouslySetInnerHTML={{ __html: part.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }}
                          />;
                        }
                        return <span key={j} dangerouslySetInnerHTML={{ __html: part }} />;
                      })}</>;
                    };

                    const formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

                    if (line.match(/^\*\*.*\*\*$/) || line.match(/^#+\s/)) {
                      const text = line.replace(/\*\*/g, '').replace(/^#+\s*/, '');
                      return <h4 key={i} className={styles.aiTopPicksHeading}>{renderLine(text)}</h4>;
                    }
                    if (line.startsWith('- ') || line.startsWith('* ')) {
                      return <div key={i} className={styles.aiTopPicksBullet}>
                        {renderLine(line.replace(/^[-*]\s*/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'))}
                      </div>;
                    }
                    if (line.match(/^\d+\./)) {
                      return <div key={i} className={styles.aiTopPicksNumbered}>{renderLine(formatted)}</div>;
                    }
                    if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
                    return <p key={i} className={styles.aiTopPicksPara}>{renderLine(formatted)}</p>;
                  })}
                </div>
              )}
            </div>

            {viewMode === 'map' && (
              <>
                <section className={styles.mapSection}>
                  <PropertyMap listings={filteredListings} onMarkerClick={handleListingClick} />
                </section>
                <section className={styles.tableSection}>
                  <PropertyTable listings={filteredListings} onRowClick={handleRowClick} highlightedId={highlightedId} />
                </section>
              </>
            )}

            {viewMode === 'grid' && (
              <section className={styles.gridSection}>
                <PropertyGrid listings={filteredListings} onCardClick={handleListingClick} highlightedId={highlightedId} />
              </section>
            )}

            {viewMode === 'table' && (
              <section className={styles.tableSection}>
                <PropertyTable listings={filteredListings} onRowClick={handleRowClick} highlightedId={highlightedId} />
              </section>
            )}
          </>
        )}
      </div>}

      {currentSelected && (
        <PropertyDetail
          listing={currentSelected}
          onClose={() => setSelectedListing(null)}
          onNoteChange={handleNoteChange}
          onOpenDocs={() => setDocsOpen(true)}
          onRefresh={async (listing) => {
            // Re-enrich single property: assessor, tax, flood, census, rent, judgment
            const updates: any = {};
            const pin = listing.parcelPin;
            if (pin) {
              const [assRes, taxRes, judgRes] = await Promise.allSettled([
                fetch(`/api/assessor/${encodeURIComponent(pin)}`).then(r => r.ok ? r.json() : {}),
                fetch(`/api/tax-details/${encodeURIComponent(pin)}`).then(r => r.ok ? r.json() : null),
                fetch(`/api/sheriff-details/${listing.propertyId}`).then(r => r.ok ? r.json() : {}),
              ]);
              if (assRes.status === 'fulfilled') Object.assign(updates, assRes.value);
              if (taxRes.status === 'fulfilled' && taxRes.value) {
                updates.outstandingTaxes = taxRes.value.totalDue;
                updates.hasUnredeemedTaxSale = taxRes.value.hasUnredeemedTaxSale;
                updates.taxDelinquentYears = taxRes.value.delinquentYears;
                updates.payOnlineUrl = taxRes.value.payOnlineUrl;
                if (taxRes.value.taxSales?.length) {
                  const open = taxRes.value.taxSales.find((s: any) => s.status === 'Open');
                  if (open) { updates.taxSaleAmount = open.taxSaleAmount; updates.taxSaleCertNumber = open.certNumber; updates.taxSaleYear = open.taxYear; }
                }
              }
              if (judgRes.status === 'fulfilled' && (judgRes.value as any).judgmentAmount) updates.approxJudgment = (judgRes.value as any).judgmentAmount;
            }
            if (listing.lat && listing.lng) {
              const [floodRes, censusRes, envRes, wetRes] = await Promise.allSettled([
                fetch(`/api/flood/${listing.lat}/${listing.lng}`).then(r => r.ok ? r.json() : null),
                fetch(`/api/census/${listing.lat}/${listing.lng}`).then(r => r.ok ? r.json() : null),
                fetch(`/api/environmental/${listing.lat}/${listing.lng}`).then(r => r.ok ? r.json() : null),
                fetch(`/api/wetlands/${listing.lat}/${listing.lng}`).then(r => r.ok ? r.json() : null),
              ]);
              if (floodRes.status === 'fulfilled' && floodRes.value) {
                updates.floodZone = floodRes.value.floodZone; updates.isFloodZone = floodRes.value.isFloodZone; updates.floodDescription = floodRes.value.description;
              }
              if (censusRes.status === 'fulfilled' && censusRes.value) {
                updates.medianHouseholdIncome = censusRes.value.medianHouseholdIncome; updates.medianHomeValue = censusRes.value.medianHomeValue;
                updates.medianGrossRent = censusRes.value.medianGrossRent; updates.ownerOccupiedPct = censusRes.value.ownerOccupiedPct;
              }
              if (envRes.status === 'fulfilled' && envRes.value) {
                updates.envRiskLevel = envRes.value.riskLevel; updates.envSummary = envRes.value.summary;
                updates.envEchoCount = envRes.value.echo?.nearbyCount; updates.envHasViolations = envRes.value.echo?.hasViolations;
                updates.envTotalPenalties = envRes.value.echo?.totalPenalties;
                updates.envSuperfundNearby = envRes.value.superfund?.onSuperfund; updates.envSuperfundCount = envRes.value.superfund?.nearbyCount;
                updates.envTriCount = envRes.value.tri?.nearbyCount;
              }
              if (wetRes.status === 'fulfilled' && wetRes.value) {
                updates.onWetland = wetRes.value.onWetland; updates.wetlandCount = wetRes.value.wetlandCount;
                updates.wetlandDescription = wetRes.value.description;
              }
            }
            // Special assessments
            if (pin) {
              try {
                const saRes = await fetch(`/api/special-assessments/${encodeURIComponent(pin)}`);
                if (saRes.ok) {
                  const sa = await saRes.json();
                  updates.specialAssessments = sa.assessments; updates.specialAssessmentTotal = sa.totalDue;
                }
              } catch {}
            }
            updates.enrichedAt = new Date().toISOString();
            setListings(prev => prev.map(l => l.propertyId === listing.propertyId ? { ...l, ...updates } : l));
            setSelectedListing(prev => prev?.propertyId === listing.propertyId ? { ...prev, ...updates } : prev);
            scheduleSave();
          }}
          onListingUpdate={(propertyId, updates) => {
            setListings(prev => prev.map(l =>
              l.propertyId === propertyId ? { ...l, ...updates } : l
            ));
            scheduleSave();
          }}
          onViewTaxSale={() => { setSelectedListing(null); setAppTab('taxsales'); }}
          linkedTaxSale={linkedTaxSale ? { parcelPin: linkedTaxSale.parcelPin, totalDue: linkedTaxSale.totalDue, saleTypeLabel: linkedTaxSale.saleTypeLabel } : null}
          initialNote={notes[currentSelected.propertyId]}
          initialAiChat={initialAiChat}
        />
      )}

      <DocsHUD open={docsOpen} onClose={() => setDocsOpen(false)} context={appTab} />
    </main>
  );
}

function downloadJson(data: any, name: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
}

function parseJudgment(str?: string): number | undefined {
  if (!str) return undefined;
  const cleaned = str.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}
