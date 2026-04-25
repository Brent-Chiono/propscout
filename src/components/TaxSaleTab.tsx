'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useGoogleMaps } from '@/lib/useGoogleMaps';
import { useTheme } from '@/components/ThemeProvider';
import { getPropertyColorHex } from '@/lib/property-colors';
import TaxSaleDetail from './TaxSaleDetail';
import styles from './TaxSaleTab.module.css';

interface TaxSaleParcel {
  itemNumber: string;
  parcelPin: string;
  titleHolder: string;
  propertyAddress: string;
  mailingAddress: string;
  legalDescription: string;
  taxInterest: number;
  lateInterest: number;
  totalFee: number;
  totalDue: number;
  saleType: string;
  saleTypeLabel: string;
  area: string;
  propertyType: string;
  sourceUrl?: string;
  taxSearchUrl?: string;
  // Enrichment
  lat?: number;
  lng?: number;
  assessedValue?: number;
  landValue?: number;
  buildingValue?: number;
  lastSaleAmount?: number;
  lastSaleDate?: string;
  saleHistory?: { seller: string; buyer: string; date: string; price: number; instrument: string }[];
  propertyClass?: string;
  yearBuilt?: string;
  sqft?: number;
  bedrooms?: number;
  bathrooms?: number;
  floodZone?: string;
  isFloodZone?: boolean;
  floodDescription?: string;
  medianHouseholdIncome?: number;
  medianHomeValue?: number;
  medianGrossRent?: number;
  ownerOccupiedPct?: number;
  hudRent2Bed?: number;
  hudRent3Bed?: number;
  specialAssessments?: { year: number; project: string; totalDue: number }[];
  specialAssessmentTotal?: number;
  envRiskLevel?: string;
  envSummary?: string;
  envEchoCount?: number;
  envHasViolations?: boolean;
  envSuperfundNearby?: boolean;
  envSuperfundCount?: number;
  envTriCount?: number;
  onWetland?: boolean;
  wetlandCount?: number;
  wetlandDescription?: string;
  enrichedAt?: string;
}

function fmt$(val?: number | null): string {
  if (val == null) return '—';
  return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function getPropertyLabel(p: TaxSaleParcel): { label: string; color: string } {
  if (p.propertyType === 'mobile-home') return { label: 'Mobile Home', color: 'var(--purple)' };
  const cls = (p.propertyClass || '').toLowerCase();
  const isLandOnly = p.assessedValue && !p.buildingValue && !p.yearBuilt && !p.sqft;
  if (isLandOnly) return { label: 'Land Only', color: 'var(--accent)' };
  if (cls.includes('commercial')) return { label: 'Commercial', color: 'var(--blue)' };
  if (cls.includes('industrial')) return { label: 'Industrial', color: 'var(--red)' };
  if (cls.includes('multi') || (p.bedrooms && p.bedrooms > 6)) return { label: 'Multi-Family', color: 'var(--purple)' };
  if (cls.includes('residential') || cls.includes('single')) return { label: 'Single Family', color: 'var(--green)' };
  if (p.propertyType === 'real-estate') return { label: 'Real Estate', color: 'var(--blue)' };
  return { label: p.propertyType || '?', color: 'var(--text-muted)' };
}

type SortKey = 'totalDue' | 'parcelPin' | 'titleHolder' | 'propertyAddress' | 'assessedValue';

interface TabProps {
  onOpenDocs?: () => void;
  auctionListings?: any[];
}

export default function TaxSaleTab({ onOpenDocs, auctionListings = [] }: TabProps) {
  const [listings, setListings] = useState<TaxSaleParcel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [propFilter, setPropFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('totalDue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'table' | 'grid' | 'map'>('table');
  const [showImages, setShowImages] = useState(false);
  const [counts, setCounts] = useState<any>({});
  const [totalDelinquent, setTotalDelinquent] = useState(0);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });
  const [selectedParcel, setSelectedParcel] = useState<TaxSaleParcel | null>(null);
  const [selectedAiChat, setSelectedAiChat] = useState<{ role: 'user' | 'assistant'; content: string }[] | undefined>(undefined);
  const [aiPicks, setAiPicks] = useState<string | null>(null);
  const [aiPicksLoading, setAiPicksLoading] = useState(false);
  const [aiPicksError, setAiPicksError] = useState<string | null>(null);
  const [aiPicksOpen, setAiPicksOpen] = useState(false);
  const enrichRunningRef = useRef(false);
  const listingsRef = useRef<TaxSaleParcel[]>([]);

  useEffect(() => { listingsRef.current = listings; }, [listings]);

  // Load cached data on mount
  useEffect(() => {
    fetch('/api/taxsale-listings')
      .then(r => r.json())
      .then(data => {
        if (data.fromCache && data.listings?.length) {
          setListings(data.listings);
          setCounts(data.counts || {});
          setTotalDelinquent(data.totalDelinquent || 0);
          setCacheInfo(`Cached ${new Date(data.fetchedAt).toLocaleString()}`);
        }
      })
      .catch(() => {});
  }, []);

  async function fetchFresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fetch-taxsale');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setListings(data.parcels);
      setCounts(data.counts);
      setTotalDelinquent(data.totalDelinquent);
      setCacheInfo(null);

      // Save to cache
      fetch('/api/taxsale-listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          listings: data.parcels,
          counts: data.counts,
          totalDelinquent: data.totalDelinquent,
          fetchedAt: data.fetchedAt,
        }),
      }).catch(() => {});

      // Start enrichment for parcels with addresses
      enrichParcels(data.parcels);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function enrichParcels(parcels: TaxSaleParcel[]) {
    if (enrichRunningRef.current) return;
    enrichRunningRef.current = true;

    // Enrich all parcels — even without address, we can get assessor data via PIN
    const needsEnrich = parcels.filter(p => !p.enrichedAt && (p.parcelPin || p.propertyAddress));
    setEnrichProgress({ done: 0, total: needsEnrich.length });

    for (let i = 0; i < needsEnrich.length; i += 3) {
      const batch = needsEnrich.slice(i, i + 3);
      await Promise.allSettled(batch.map(async (parcel) => {
        try {
          const fetches: Promise<{ key: string; data: any }>[] = [];

          // Assessor data (works with PIN even without address)
          if (parcel.parcelPin) {
            const cleanPin = parcel.parcelPin.replace(/\./g, '');
            fetches.push(
              fetch(`/api/assessor/${encodeURIComponent(cleanPin)}`)
                .then(r => r.ok ? r.json() : {})
                .then(data => ({ key: 'assessor', data }))
                .catch(() => ({ key: 'assessor', data: {} }))
            );
          }

          // Geocode (only if we have an address)
          if (parcel.propertyAddress?.trim()) {
            fetches.push(
              fetch(`/api/geocode?address=${encodeURIComponent(parcel.propertyAddress.trim())}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => ({ key: 'geo', data }))
                .catch(() => ({ key: 'geo', data: null }))
            );
          }

          const results = await Promise.all(fetches);
          for (const { key, data } of results) {
            if (!data) continue;
            if (key === 'assessor') {
              Object.assign(parcel, {
                assessedValue: data.assessedValue,
                landValue: data.landValue,
                buildingValue: data.buildingValue,
                lastSaleAmount: data.lastSaleAmount,
                lastSaleDate: data.lastSaleDate,
                saleHistory: data.saleHistory,
                propertyClass: data.propertyClass,
                yearBuilt: data.yearBuilt,
                sqft: data.sqft,
                bedrooms: data.bedrooms,
                bathrooms: data.bathrooms,
              });
            }
            if (key === 'geo') {
              parcel.lat = data.lat;
              parcel.lng = data.lng;
            }
          }

          // Second pass — needs lat/lng
          const fetches2: Promise<{ key: string; data: any }>[] = [];

          if (parcel.lat && parcel.lng) {
            fetches2.push(
              fetch(`/api/flood/${parcel.lat}/${parcel.lng}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => ({ key: 'flood', data }))
                .catch(() => ({ key: 'flood', data: null }))
            );
            fetches2.push(
              fetch(`/api/census/${parcel.lat}/${parcel.lng}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => ({ key: 'census', data }))
                .catch(() => ({ key: 'census', data: null }))
            );
          }

          // HUD rent
          const zipMatch = parcel.propertyAddress?.match(/\b(\d{5})\b/);
          if (zipMatch) {
            fetches2.push(
              fetch(`/api/rent/${zipMatch[1]}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => ({ key: 'rent', data }))
                .catch(() => ({ key: 'rent', data: null }))
            );
          }

          if (fetches2.length) {
            const results2 = await Promise.all(fetches2);
            for (const { key, data } of results2) {
              if (!data) continue;
              if (key === 'flood') {
                parcel.floodZone = data.floodZone;
                parcel.isFloodZone = data.isFloodZone;
                parcel.floodDescription = data.description;
              }
              if (key === 'census') {
                parcel.medianHouseholdIncome = data.medianHouseholdIncome;
                parcel.medianHomeValue = data.medianHomeValue;
                parcel.medianGrossRent = data.medianGrossRent;
                parcel.ownerOccupiedPct = data.ownerOccupiedPct;
              }
              if (key === 'rent') {
                parcel.hudRent2Bed = data.twoBedroom;
                parcel.hudRent3Bed = data.threeBedroom;
              }
            }
          }

          parcel.enrichedAt = new Date().toISOString();
        } catch {}

        setEnrichProgress(p => ({ ...p, done: p.done + 1 }));
      }));

      // Update listings state
      setListings([...listingsRef.current]);
    }

    enrichRunningRef.current = false;

    // Save enriched data
    const current = listingsRef.current;
    fetch('/api/taxsale-listings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        listings: current,
        counts,
        totalDelinquent,
        fetchedAt: new Date().toISOString(),
      }),
    }).catch(() => {});
  }

  async function fetchAiPicks() {
    setAiPicksLoading(true);
    setAiPicksError(null);
    setAiPicks(null);
    setAiPicksOpen(true);
    try {
      const enriched = listings.filter(l => l.assessedValue);
      if (enriched.length === 0) {
        setAiPicksError('No enriched parcels yet. Wait for data to load or click Refresh.');
        return;
      }
      const summaries = enriched.map((p, i) =>
        `${i + 1}. Parcel: ${p.parcelPin} | Owner: ${p.titleHolder} | Addr: ${p.propertyAddress || p.legalDescription || 'N/A'}
   Total Due: ${fmt$(p.totalDue)} | Assessed: ${fmt$(p.assessedValue)} | Ratio: ${p.assessedValue ? ((p.totalDue / p.assessedValue) * 100).toFixed(1) + '%' : '?'}
   Type: ${p.propertyType} | Sale: ${p.saleTypeLabel} | Area: ${p.area}
   ${p.bedrooms || '?'}bd/${p.bathrooms || '?'}ba | ${p.sqft || '?'}sf | Built ${p.yearBuilt || '?'} | Flood: ${p.floodZone || '?'}
   Last Sale: ${fmt$(p.lastSaleAmount)} (${p.lastSaleDate || '?'})`
      ).join('\n\n');

      const res = await fetch('/api/ai-property-analysis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          listing: { propertyAddress: 'TAX SALE PORTFOLIO ANALYSIS', parcelPin: 'ALL' },
          notes: `ANALYZE THESE TAX SALE CERTIFICATES — NOT sheriff auctions.

Iowa tax sale context:
- Investor pays delinquent taxes, earns 2%/month (24%/yr) statutory interest
- Owner has ~2 years to redeem (pay back investor + interest)
- If not redeemed, investor can get Treasurer's Deed
- "Bid-down" system: always target 100% undivided interest, never go below 95%
- Safety margin = assessed value / tax amount (higher = safer, 10x+ is excellent)
- Real estate is safer than mobile homes
- Public Bidder parcels have shorter deed timeline (9 months vs 21)
- Flood zone X is minimal risk (not a concern)

Here are ${enriched.length} delinquent parcels:

${summaries}

Rank the TOP 5 most attractive tax sale certificates and explain why. For each:
1. Property and why it's attractive
2. Safety margin (assessed value vs tax amount)
3. Investment amount and projected return if redeemed at 1yr and 2yr
4. Risk level (LOW/MED/HIGH) and primary risk
5. Whether to target 100% bid or expect competition

Then list PARCELS TO AVOID with specific reasons (low safety margin, mobile home, environmental risk, flood zone, etc).

Be specific with dollar amounts. Focus on risk-adjusted returns.`,
        }),
      });
      const data = await res.json();
      if (data.error) setAiPicksError(data.error);
      else setAiPicks(data.analysis);
    } catch (err: any) {
      setAiPicksError(err.message);
    } finally {
      setAiPicksLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return listings.filter(l => {
      if (typeFilter !== 'all' && l.saleType !== typeFilter) return false;
      if (areaFilter !== 'all' && l.area !== areaFilter) return false;
      if (propFilter !== 'all' && l.propertyType !== propFilter) return false;
      if (q) {
        return (
          l.parcelPin?.toLowerCase().includes(q) ||
          l.titleHolder?.toLowerCase().includes(q) ||
          l.propertyAddress?.toLowerCase().includes(q) ||
          l.legalDescription?.toLowerCase().includes(q)
        );
      }
      return true;
    }).sort((a, b) => {
      let av: any = (a as any)[sortKey] ?? '';
      let bv: any = (b as any)[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [listings, search, typeFilter, areaFilter, propFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const enrichPercent = enrichProgress.total > 0 ? Math.round((enrichProgress.done / enrichProgress.total) * 100) : 0;

  return (
    <div className={styles.wrap}>
      {/* Stats bar */}
      <div className={styles.statsBar}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{listings.length}</span>
          <span className={styles.statLabel}>Total Parcels</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statNum}>{counts.realEstate || 0}</span>
          <span className={styles.statLabel}>Real Estate</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statNum}>{counts.mobileHome || 0}</span>
          <span className={styles.statLabel}>Mobile Home</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statNum}>{fmt$(totalDelinquent)}</span>
          <span className={styles.statLabel}>Total Owed</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {cacheInfo && <span className={styles.cacheLabel}>{cacheInfo}</span>}
          <button className={styles.fetchBtn} onClick={fetchFresh} disabled={loading}>
            {loading ? 'Fetching...' : listings.length ? 'Refresh' : 'Fetch Delinquent List'}
          </button>
          {listings.length > 0 && (
            <button className={styles.fetchBtn} onClick={() => {
              const blob = new Blob([JSON.stringify({ listings, counts, totalDelinquent, fetchedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
              a.download = `taxsales-${new Date().toISOString().split('T')[0]}.json`; a.click();
            }} title="Download all tax sale data as JSON">
              Download
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {enrichProgress.total > 0 && enrichPercent < 100 && (
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${enrichPercent}%` }} />
          <span className={styles.progressLabel}>Enriching {enrichProgress.done}/{enrichProgress.total}</span>
        </div>
      )}

      {/* Filters */}
      {listings.length > 0 && (
        <div className={styles.filterBar}>
          <input
            className={styles.search}
            placeholder="Search parcel, owner, address..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className={styles.select} value={propFilter} onChange={e => setPropFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="real-estate">Real Estate</option>
            <option value="mobile-home">Mobile Home</option>
          </select>
          <select className={styles.select} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All Sale Types</option>
            <option value="regular">Regular Sale</option>
            <option value="public-bidder">Public Bidder</option>
            <option value="public-nuisance">Public Nuisance</option>
          </select>
          <select className={styles.select} value={areaFilter} onChange={e => setAreaFilter(e.target.value)}>
            <option value="all">All Areas</option>
            <option value="city">City</option>
            <option value="township">Township</option>
          </select>
          <div className={styles.viewToggle}>
            {(['table', 'grid', 'map'] as const).map(mode => (
              <button
                key={mode}
                className={`${styles.viewBtn} ${viewMode === mode ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode(mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          {viewMode === 'grid' && (
            <button
              className={`${styles.viewBtn} ${showImages ? styles.viewBtnActive : ''}`}
              style={{ border: '1px solid var(--border-hover)', borderRadius: 8, marginLeft: 4 }}
              onClick={() => setShowImages(!showImages)}
            >
              {showImages ? 'Hide Images' : 'Show Images'}
            </button>
          )}
          <span className={styles.resultCount}>{filtered.length} of {listings.length}</span>
        </div>
      )}

      {/* AI Top Picks */}
      {listings.length > 0 && (
        <div className={styles.aiPicksWrap}>
          <div className={styles.aiPicksHeader}>
            <button
              className={styles.aiPicksBtn}
              onClick={() => aiPicks ? setAiPicksOpen(!aiPicksOpen) : fetchAiPicks()}
              disabled={aiPicksLoading}
            >
              {aiPicksLoading ? 'AI Analyzing...' : aiPicks ? (aiPicksOpen ? 'Hide AI Picks' : 'Show AI Picks') : 'AI: Best Tax Sale Opportunities'}
            </button>
            {aiPicks && (
              <button className={styles.aiPicksRefresh} onClick={fetchAiPicks} disabled={aiPicksLoading}>
                Refresh
              </button>
            )}
          </div>
          {aiPicksOpen && aiPicksLoading && (
            <div className={styles.aiPicksLoading}>
              <div className={styles.aiPicksSpinner} />
              Analyzing {listings.filter(l => l.assessedValue).length} parcels for best opportunities...
            </div>
          )}
          {aiPicksOpen && aiPicksError && (
            <div className={styles.error}>{aiPicksError}</div>
          )}
          {aiPicksOpen && aiPicks && (
            <div className={styles.aiPicksContent}>
              {aiPicks.split('\n').map((line, i) => {
                // Check if line contains a parcel PIN from our listings
                const renderWithLinks = (html: string) => {
                  // Match dotted PIN patterns like 7925.35.101.020
                  for (const p of listings) {
                    if (p.parcelPin && html.includes(p.parcelPin)) {
                      const parts = html.split(p.parcelPin);
                      return <span key={i}>
                        <span dangerouslySetInnerHTML={{ __html: parts[0] }} />
                        <span
                          className={styles.aiParcelLink}
                          onClick={() => {
                            // Extract AI section for this parcel
                            const lines = aiPicks!.split('\n');
                            let capturing = false;
                            let section: string[] = [];
                            for (const l of lines) {
                              if (l.includes(p.parcelPin)) { capturing = true; }
                              else if (capturing && l.match(/^\d+\.\s/) && section.length > 2) { break; }
                              else if (capturing && l.match(/^##?\s/) && section.length > 2) { break; }
                              if (capturing) section.push(l);
                            }
                            setSelectedAiChat(section.length > 0 ? [
                              { role: 'user', content: 'What did you find about this parcel in your analysis?' },
                              { role: 'assistant', content: section.join('\n') },
                            ] : undefined);
                            setSelectedParcel(p);
                          }}
                        >{p.parcelPin}</span>
                        {parts[1] && <span dangerouslySetInnerHTML={{ __html: parts[1] }} />}
                      </span>;
                    }
                  }
                  return <span dangerouslySetInnerHTML={{ __html: html }} />;
                };

                const formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

                if (line.match(/^\*\*.*\*\*$/) || line.match(/^#+\s/)) {
                  return <h4 key={i} className={styles.aiPicksHeading}>{renderWithLinks(line.replace(/\*\*/g, '').replace(/^#+\s*/, ''))}</h4>;
                }
                if (line.startsWith('- ') || line.startsWith('* ')) {
                  return <div key={i} className={styles.aiPicksBullet}>{renderWithLinks(formatted.replace(/^[-*]\s*/, ''))}</div>;
                }
                if (line.match(/^\d+\./)) {
                  return <div key={i} className={styles.aiPicksNumbered}>{renderWithLinks(formatted)}</div>;
                }
                if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
                return <p key={i} className={styles.aiPicksPara}>{renderWithLinks(formatted)}</p>;
              })}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && <div className={styles.error}>{error}</div>}

      {/* Empty state */}
      {!loading && listings.length === 0 && !error && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>$</div>
          <h3>Tax Sale Certificates</h3>
          <p>Browse Polk County delinquent tax parcels. Earn 2%/month interest with potential path to ownership.</p>
          <button className={styles.fetchBtnLg} onClick={fetchFresh}>
            Fetch Delinquent Parcel List
          </button>
          <div className={styles.emptyLinks}>
            <a href="https://taxsale.polkcountyiowa.gov/" target="_blank" rel="noopener">Polk County Tax Sale</a>
            <a href="https://www.polkcountyiowa.gov/treasurer/information-for-tax-sale-buyers/" target="_blank" rel="noopener">Buyer Info</a>
            <a href="https://www.govease.com" target="_blank" rel="noopener">GovEase Bidding</a>
          </div>
        </div>
      )}

      {/* Map View */}
      {filtered.length > 0 && viewMode === 'map' && (
        <TaxSaleMap parcels={filtered} onMarkerClick={(p) => { setSelectedAiChat(undefined); setSelectedParcel(p); }} />
      )}

      {/* Grid View */}
      {filtered.length > 0 && viewMode === 'grid' && (
        <div className={styles.grid}>
          {filtered.map((p, idx) => (
            <div key={`${p.parcelPin}-${idx}`} className={styles.card} onClick={() => { setSelectedAiChat(undefined); setSelectedParcel(p); }} style={{ cursor: 'pointer' }}>
              {showImages && p.lat && p.lng && (
                <img
                  src={`https://maps.googleapis.com/maps/api/streetview?size=400x160&location=${p.lat},${p.lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
                  alt="Street view"
                  className={styles.cardImage}
                />
              )}
              {showImages && (!p.lat || !p.lng) && (
                <div className={styles.cardImagePlaceholder}>No street view</div>
              )}
              <div className={styles.cardHeader}>
                <span className={styles.cardDot} style={{ background: getPropertyColorHex(p.parcelPin) }} />
                <span className={styles.cardPin}>{p.parcelPin}</span>
                <span className={styles.badge} style={{ borderColor: getPropertyLabel(p).color + '40', color: getPropertyLabel(p).color, background: getPropertyLabel(p).color + '14' }}>
                  {getPropertyLabel(p).label}
                </span>
              </div>
              <div className={styles.cardOwner}>{p.titleHolder}</div>
              {p.propertyAddress?.trim() && (
                <div className={styles.cardAddr}>{p.propertyAddress}</div>
              )}
              {!p.propertyAddress?.trim() && p.legalDescription && (
                <div className={styles.cardLegal}>{p.legalDescription.slice(0, 60)}</div>
              )}
              <div className={styles.cardStats}>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>Total Due</span>
                  <span className={`${styles.cardStatValue} ${styles.amount}`}>{fmt$(p.totalDue)}</span>
                </div>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>Assessed</span>
                  <span className={styles.cardStatValue}>{fmt$(p.assessedValue)}</span>
                </div>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>Interest</span>
                  <span className={styles.cardStatValue}>2%/mo</span>
                </div>
                <div className={styles.cardStat}>
                  <span className={styles.cardStatLabel}>Year Built</span>
                  <span className={styles.cardStatValue}>{p.yearBuilt || '—'}</span>
                </div>
              </div>
              <div className={styles.cardTags}>
                <span className={`${styles.tag} ${
                  p.saleType === 'regular' ? styles.tagGreen :
                  p.saleType === 'public-bidder' ? styles.tagYellow : styles.tagRed
                }`}>{p.saleTypeLabel}</span>
                <span className={`${styles.tag} ${p.area === 'city' ? styles.tagBlue : styles.tagPurple}`}>{p.area}</span>
              </div>
              <div className={styles.cardLinks}>
                {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noopener" className={styles.sourceLink}>Source</a>}
                <a href={p.taxSearchUrl || 'https://taxsearch.polkcountyiowa.gov/Search'} target="_blank" rel="noopener" className={styles.sourceLink}>Tax Search</a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table View (also shown below map) */}
      {filtered.length > 0 && (viewMode === 'table' || viewMode === 'map') && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.sortable} onClick={() => toggleSort('parcelPin')}>
                  Parcel {sortKey === 'parcelPin' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className={styles.sortable} onClick={() => toggleSort('titleHolder')}>
                  Owner {sortKey === 'titleHolder' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className={styles.sortable} onClick={() => toggleSort('propertyAddress')}>
                  Address {sortKey === 'propertyAddress' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>Type</th>
                <th>Tags</th>
                <th className={styles.sortable} onClick={() => toggleSort('assessedValue')}>
                  Assessed {sortKey === 'assessedValue' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className={styles.sortable} onClick={() => toggleSort('totalDue')}>
                  Total Due {sortKey === 'totalDue' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>Interest Rate</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => (
                <tr key={`${p.parcelPin}-${p.saleType}-${idx}`} className={styles.row} onClick={() => { setSelectedAiChat(undefined); setSelectedParcel(p); }} style={{ cursor: 'pointer' }}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: getPropertyColorHex(p.parcelPin),
                        border: '1px solid var(--border-hover)',
                        display: 'inline-block',
                      }} />
                      <span className={styles.mono}>{p.parcelPin}</span>
                    </span>
                  </td>
                  <td>{p.titleHolder}</td>
                  <td>{p.propertyAddress || <span className={styles.muted}>{p.legalDescription?.slice(0, 40)}</span>}</td>
                  <td>
                    <span className={styles.badge} style={{ borderColor: getPropertyLabel(p).color + '40', color: getPropertyLabel(p).color, background: getPropertyLabel(p).color + '14' }}>
                      {getPropertyLabel(p).label}
                    </span>
                  </td>
                  <td>
                    <div className={styles.tags}>
                      <span className={`${styles.tag} ${
                        p.saleType === 'regular' ? styles.tagGreen :
                        p.saleType === 'public-bidder' ? styles.tagYellow : styles.tagRed
                      }`}>{p.saleTypeLabel}</span>
                      <span className={`${styles.tag} ${p.area === 'city' ? styles.tagBlue : styles.tagPurple}`}>
                        {p.area}
                      </span>
                    </div>
                  </td>
                  <td className={styles.mono}>{fmt$(p.assessedValue)}</td>
                  <td className={`${styles.mono} ${styles.amount}`}>{fmt$(p.totalDue)}</td>
                  <td className={styles.mono}>2%/mo</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {p.sourceUrl && (
                        <a href={p.sourceUrl} target="_blank" rel="noopener" className={styles.sourceLink}>Source</a>
                      )}
                      <a href={p.taxSearchUrl || 'https://taxsearch.polkcountyiowa.gov/Search'} target="_blank" rel="noopener" className={styles.sourceLink}>Tax</a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedParcel && (() => {
        const cleanPin = selectedParcel.parcelPin?.replace(/\./g, '') || '';
        const auction = auctionListings.find((l: any) => l.parcelPin?.replace(/\./g, '') === cleanPin);
        const linkedAuction = auction ? {
          propertyId: auction.propertyId,
          propertyAddress: auction.propertyAddress,
          approxJudgment: auction.approxJudgment || '',
          salesDate: auction.salesDate || '',
        } : null;
        return (
        <TaxSaleDetail
          parcel={selectedParcel}
          onClose={() => { setSelectedParcel(null); setSelectedAiChat(undefined); }}
          onOpenDocs={onOpenDocs}
          initialAiChat={selectedAiChat}
          linkedAuction={linkedAuction}
          onRefresh={async (parcel) => {
            const cleanPin = parcel.parcelPin?.replace(/\./g, '');
            const updates: any = {};
            // Assessor
            if (cleanPin) {
              try {
                const r = await fetch(`/api/assessor/${encodeURIComponent(cleanPin)}`);
                if (r.ok) {
                  const d = await r.json();
                  Object.assign(updates, {
                    assessedValue: d.assessedValue, landValue: d.landValue, buildingValue: d.buildingValue,
                    lastSaleAmount: d.lastSaleAmount, lastSaleDate: d.lastSaleDate, saleHistory: d.saleHistory,
                    propertyClass: d.propertyClass, yearBuilt: d.yearBuilt, sqft: d.sqft,
                    bedrooms: d.bedrooms, bathrooms: d.bathrooms,
                  });
                }
              } catch {}
            }
            // Geocode
            if (parcel.propertyAddress?.trim()) {
              try {
                const r = await fetch(`/api/geocode?address=${encodeURIComponent(parcel.propertyAddress.trim())}`);
                if (r.ok) { const d = await r.json(); updates.lat = d.lat; updates.lng = d.lng; }
              } catch {}
            }
            // Flood + Census (needs lat/lng)
            const lat = updates.lat || parcel.lat;
            const lng = updates.lng || parcel.lng;
            if (lat && lng) {
              const [floodR, censusR, envR, wetR] = await Promise.allSettled([
                fetch(`/api/flood/${lat}/${lng}`).then(r => r.ok ? r.json() : null),
                fetch(`/api/census/${lat}/${lng}`).then(r => r.ok ? r.json() : null),
                fetch(`/api/environmental/${lat}/${lng}`).then(r => r.ok ? r.json() : null),
                fetch(`/api/wetlands/${lat}/${lng}`).then(r => r.ok ? r.json() : null),
              ]);
              if (floodR.status === 'fulfilled' && floodR.value) {
                updates.floodZone = floodR.value.floodZone; updates.isFloodZone = floodR.value.isFloodZone;
                updates.floodDescription = floodR.value.description;
              }
              if (censusR.status === 'fulfilled' && censusR.value) {
                updates.medianHouseholdIncome = censusR.value.medianHouseholdIncome;
                updates.medianHomeValue = censusR.value.medianHomeValue;
                updates.medianGrossRent = censusR.value.medianGrossRent;
                updates.ownerOccupiedPct = censusR.value.ownerOccupiedPct;
              }
              if (envR.status === 'fulfilled' && envR.value) {
                updates.envRiskLevel = envR.value.riskLevel; updates.envSummary = envR.value.summary;
                updates.envEchoCount = envR.value.echo?.nearbyCount; updates.envHasViolations = envR.value.echo?.hasViolations;
                updates.envSuperfundNearby = envR.value.superfund?.onSuperfund; updates.envSuperfundCount = envR.value.superfund?.nearbyCount;
                updates.envTriCount = envR.value.tri?.nearbyCount;
              }
              if (wetR.status === 'fulfilled' && wetR.value) {
                updates.onWetland = wetR.value.onWetland; updates.wetlandCount = wetR.value.wetlandCount;
                updates.wetlandDescription = wetR.value.description;
              }
            }
            // Special assessments
            if (cleanPin) {
              try {
                const saR = await fetch(`/api/special-assessments/${encodeURIComponent(cleanPin)}`);
                if (saR.ok) { const sa = await saR.json(); updates.specialAssessments = sa.assessments; updates.specialAssessmentTotal = sa.totalDue; }
              } catch {}
            }
            // HUD rent
            const zip = parcel.propertyAddress?.match(/\b(\d{5})\b/);
            if (zip) {
              try {
                const r = await fetch(`/api/rent/${zip[1]}`);
                if (r.ok) { const d = await r.json(); updates.hudRent2Bed = d.twoBedroom; updates.hudRent3Bed = d.threeBedroom; }
              } catch {}
            }
            updates.enrichedAt = new Date().toISOString();
            // Update listings state and selected parcel
            const updated = { ...parcel, ...updates };
            setListings(prev => prev.map(l => l.parcelPin === parcel.parcelPin && l.saleType === parcel.saleType ? updated : l));
            setSelectedParcel(updated);
            // Save to cache
            fetch('/api/taxsale-listings', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ listings: listingsRef.current.map(l => l.parcelPin === parcel.parcelPin && l.saleType === parcel.saleType ? updated : l), counts, totalDelinquent, fetchedAt: new Date().toISOString() }),
            }).catch(() => {});
          }}
        />
        );
      })()}
    </div>
  );
}

/* ===== Inline Map Component for Tax Sale Parcels ===== */
const POLK_CENTER = { lat: 41.64, lng: -93.6242 };

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'water', stylers: [{ color: '#0f3460' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a0aec0' }] },
  { featureType: 'landscape', stylers: [{ color: '#16213e' }] },
];

const LIGHT_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#e0e0e0' }] },
  { featureType: 'water', stylers: [{ color: '#aadaff' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#444444' }] },
  { featureType: 'landscape', stylers: [{ color: '#f5f5f5' }] },
];

function TaxSaleMap({ parcels, onMarkerClick }: { parcels: any[]; onMarkerClick?: (p: any) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const mapsLoaded = useGoogleMaps();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || mapInstanceRef.current) return;
    mapInstanceRef.current = new google.maps.Map(mapRef.current, {
      center: POLK_CENTER, zoom: 11, mapTypeId: 'roadmap',
      maxZoom: 18, minZoom: 8, disableDefaultUI: false,
      styles: isDark ? DARK_MAP_STYLES : LIGHT_MAP_STYLES,
    });
    infoWindowRef.current = new google.maps.InfoWindow();
  }, [mapsLoaded, isDark]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setOptions({ styles: isDark ? DARK_MAP_STYLES : LIGHT_MAP_STYLES });
  }, [isDark]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const withGeo = parcels.filter(p => p.lat && p.lng);
    withGeo.forEach(p => {
      const color = getPropertyColorHex(p.parcelPin);
      const marker = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map: mapInstanceRef.current!,
        title: p.propertyAddress || p.parcelPin,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8, fillColor: color, fillOpacity: 0.9,
          strokeColor: isDark ? '#ffffff' : '#333333', strokeWeight: 1.5,
        },
      });

      marker.addListener('click', () => {
        onMarkerClick?.(p);
        const content = `
          <div style="font-family:'DM Sans',sans-serif;font-size:13px;max-width:280px;color:var(--text,#333)">
            <div style="font-weight:600;margin-bottom:4px">${p.propertyAddress || p.legalDescription || p.parcelPin}</div>
            <div style="font-size:12px;color:#666">
              <div>Owner: ${p.titleHolder}</div>
              <div>Parcel: ${p.parcelPin}</div>
              <div>Total Due: <strong style="color:${color}">${'$' + p.totalDue.toLocaleString()}</strong></div>
              <div>Assessed: ${p.assessedValue ? '$' + p.assessedValue.toLocaleString() : '—'}</div>
              <div>Type: ${p.propertyType === 'real-estate' ? 'Real Estate' : 'Mobile Home'} · ${p.saleTypeLabel} · ${p.area}</div>
            </div>
          </div>
        `;
        infoWindowRef.current!.setContent(content);
        infoWindowRef.current!.open(mapInstanceRef.current!, marker);
      });

      markersRef.current.push(marker);
    });
  }, [parcels, isDark, mapsLoaded]);

  if (!mapsLoaded) {
    return <div className={styles.mapPlaceholder}>Loading map...</div>;
  }

  const geoCount = parcels.filter(p => p.lat && p.lng).length;

  return (
    <div className={styles.mapWrap}>
      <div ref={mapRef} className={styles.map} />
      <div className={styles.mapLegend}>
        {geoCount} of {parcels.length} parcels mapped · Each has a unique color
      </div>
    </div>
  );
}
