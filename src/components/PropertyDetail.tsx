'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { SherifffListing } from '@/types';
import { analyzeLienPosition, LienAnalysis } from '@/lib/lien-analysis';
import { calculateRedemption, RedemptionInfo } from '@/lib/redemption';
import ROICalculator from './ROICalculator';
import PdfModal from './PdfModal';
import styles from './PropertyDetail.module.css';

interface Props {
  listing: SherifffListing;
  onClose: () => void;
  onNoteChange?: (propertyId: string, note: string, favorite: boolean, skip: boolean) => void;
  onListingUpdate?: (propertyId: string, updates: Partial<SherifffListing>) => void;
  onOpenDocs?: () => void;
  onRefresh?: (listing: SherifffListing) => Promise<void>;
  onViewTaxSale?: (pin: string) => void;
  initialNote?: { note: string; favorite: boolean; skip: boolean };
  initialAiChat?: { role: 'user' | 'assistant'; content: string }[];
  linkedTaxSale?: { parcelPin: string; totalDue: number; saleTypeLabel: string } | null;
}

function fmt$(val?: number): string {
  if (val == null) return '—';
  return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

interface ExtraData {
  flood?: { floodZone: string; isFloodZone: boolean; description: string; detail?: string };
  census?: {
    medianHouseholdIncome: number | null;
    medianHomeValue: number | null;
    medianGrossRent: number | null;
    population: number | null;
    ownerOccupiedPct: number | null;
  };
  rent?: {
    twoBedroom: number; threeBedroom: number;
    source: string;
  };
  history?: {
    firstSeen: string; timesSeen: number; wasPostponed: boolean;
    saleDateChanges: { from: string; to: string; detectedOn: string }[];
  };
}

export default function PropertyDetail({ listing, onClose, onNoteChange, onListingUpdate, onOpenDocs, onRefresh, onViewTaxSale, initialNote, initialAiChat, linkedTaxSale }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [imageTab, setImageTab] = useState<'street' | 'map'>('street');
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [extra, setExtra] = useState<ExtraData>({});
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState(initialNote?.note ?? '');
  const [favorite, setFavorite] = useState(initialNote?.favorite ?? false);
  const [skip, setSkip] = useState(initialNote?.skip ?? false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>(initialAiChat || []);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [rcLoading, setRcLoading] = useState(false);
  const [rcError, setRcError] = useState<string | null>(null);
  const [rcData, setRcData] = useState<any>(listing.rentcastFetchedAt ? {
    rentEstimate: listing.rentcastRentEstimate,
    rentRangeLow: listing.rentcastRentLow,
    rentRangeHigh: listing.rentcastRentHigh,
    valueEstimate: listing.rentcastValueEstimate,
    valueRangeLow: listing.rentcastValueLow,
    valueRangeHigh: listing.rentcastValueHigh,
    rentComps: listing.rentcastRentComps || [],
    valueComps: listing.rentcastValueComps || [],
    fromCache: true,
  } : null);

  const lien: LienAnalysis = analyzeLienPosition(listing.plaintiff);
  const redemption: RedemptionInfo | null = calculateRedemption(listing.salesDate);

  // Use cached data from listing where available, only fetch what's missing
  useEffect(() => {
    // Populate from cached listing data immediately
    const initial: ExtraData = {};

    if (listing.floodZone != null) {
      initial.flood = {
        floodZone: listing.floodZone,
        isFloodZone: listing.isFloodZone ?? false,
        description: listing.floodDescription ?? '',
      };
    }

    if (listing.medianHouseholdIncome != null) {
      initial.census = {
        medianHouseholdIncome: listing.medianHouseholdIncome,
        medianHomeValue: listing.medianHomeValue ?? null,
        medianGrossRent: listing.medianGrossRent ?? null,
        population: null,
        ownerOccupiedPct: listing.ownerOccupiedPct ?? null,
      };
    }

    if (listing.hudRent2Bed != null) {
      initial.rent = {
        twoBedroom: listing.hudRent2Bed,
        threeBedroom: listing.hudRent3Bed ?? 0,
        source: 'cached',
      };
    }

    setExtra(initial);

    // Only fetch data that isn't cached on the listing
    setLoading(true);
    const fetches: Promise<void>[] = [];

    if (!initial.flood && listing.lat && listing.lng) {
      fetches.push(
        fetch(`/api/flood/${listing.lat}/${listing.lng}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => d && setExtra(prev => ({ ...prev, flood: d })))
          .catch(() => {})
      );
    }

    if (!initial.census && listing.lat && listing.lng) {
      fetches.push(
        fetch(`/api/census/${listing.lat}/${listing.lng}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => d && setExtra(prev => ({ ...prev, census: d })))
          .catch(() => {})
      );
    }

    if (!initial.rent) {
      const zipMatch = listing.propertyAddress?.match(/\b(\d{5})\b/);
      const zip = zipMatch ? zipMatch[1] : '50309';
      fetches.push(
        fetch(`/api/rent/${zip}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => d && setExtra(prev => ({ ...prev, rent: d })))
          .catch(() => {})
      );
    }


    if (fetches.length === 0) {
      setLoading(false);
    } else {
      Promise.allSettled(fetches).then(() => setLoading(false));
    }
  }, [listing]);

  // Save notes with debounce
  const saveNote = useCallback(() => {
    onNoteChange?.(listing.propertyId, noteText, favorite, skip);
  }, [listing.propertyId, noteText, favorite, skip, onNoteChange]);

  useEffect(() => {
    const timer = setTimeout(saveNote, 500);
    return () => clearTimeout(timer);
  }, [noteText, favorite, skip, saveNote]);

  const chatInitRef = useRef(true);
  useEffect(() => {
    if (chatInitRef.current) { chatInitRef.current = false; return; }
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  async function sendPropertyChat(message: string) {
    if (!message.trim() || chatLoading) return;
    const newMessages = [...chatMessages, { role: 'user' as const, content: message.trim() }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/ai-chat-property', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, propertyContext: { ...listing, notes: noteText } }),
      });
      const data = await res.json();
      setChatMessages([...newMessages, {
        role: 'assistant' as const,
        content: data.error ? `Error: ${data.error}` : data.response,
      }]);
    } catch (err: any) {
      setChatMessages([...newMessages, { role: 'assistant' as const, content: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  function startAnalysis() {
    sendPropertyChat('Give me a full investment analysis of this sheriff sale property. Cover: risk assessment, total cost breakdown (bid + taxes + closing + repairs + holding), max bid guidance for flip vs rental, rental cash flow analysis with net numbers, and action items before bidding. Be specific with dollar amounts.');
  }

  async function fetchRentcast() {
    if (!listing.parcelPin || !listing.propertyAddress) return;
    setRcLoading(true);
    setRcError(null);
    try {
      const params = new URLSearchParams({
        address: listing.propertyAddress,
      });
      if (listing.bedrooms) params.set('bedrooms', String(listing.bedrooms));
      if (listing.bathrooms) params.set('bathrooms', String(listing.bathrooms));
      if (listing.sqft) params.set('sqft', String(listing.sqft));
      if (listing.propertyClass) params.set('propertyType', listing.propertyClass);

      const res = await fetch(`/api/rentcast/${encodeURIComponent(listing.parcelPin)}?${params}`);
      const data = await res.json();
      if (data.error) {
        setRcError(data.error);
      } else {
        setRcData(data);
        // Save to listing so it persists
        onListingUpdate?.(listing.propertyId, {
          rentcastRentEstimate: data.rentEstimate,
          rentcastRentLow: data.rentRangeLow,
          rentcastRentHigh: data.rentRangeHigh,
          rentcastValueEstimate: data.valueEstimate,
          rentcastValueLow: data.valueRangeLow,
          rentcastValueHigh: data.valueRangeHigh,
          rentcastRentComps: data.rentComps,
          rentcastValueComps: data.valueComps,
          rentcastFetchedAt: data.fetchedAt,
        });
      }
    } catch (err: any) {
      setRcError(err.message);
    } finally {
      setRcLoading(false);
    }
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const streetviewUrl = listing.lat && listing.lng && apiKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=520x200&location=${listing.lat},${listing.lng}&key=${apiKey}`
    : null;

  const riskClass = lien.risk === 'low' ? styles.riskLow : lien.risk === 'high' ? styles.riskHigh : styles.riskMedium;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()} ref={el => { if (el) el.scrollTop = 0; }}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.address}>{listing.propertyAddress || 'Unknown Address'}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={styles.helpBtn} onClick={() => setPdfModalOpen(true)} title="Print/Save PDF" style={{ fontSize: 10 }}>PDF</button>
            {onRefresh && (
              <button
                className={styles.helpBtn}
                onClick={async () => { setRefreshing(true); await onRefresh(listing); setRefreshing(false); }}
                disabled={refreshing}
                title="Re-enrich this property"
                style={{ fontSize: 12 }}
              >{refreshing ? '...' : '\u21BB'}</button>
            )}
            {onOpenDocs && <button className={styles.helpBtn} onClick={onOpenDocs} title="Documentation & AI Help">?</button>}
            <button className={styles.closeBtn} onClick={onClose}>x</button>
          </div>
        </div>

        {/* Cross-link banner */}
        {linkedTaxSale && (
          <div className={styles.crossLink} onClick={() => onViewTaxSale?.(linkedTaxSale.parcelPin)}>
            <span className={styles.crossLinkIcon}>!</span>
            <div>
              <div className={styles.crossLinkTitle}>Also in Tax Sales</div>
              <div className={styles.crossLinkDesc}>
                This property has a delinquent tax record — {fmt$(linkedTaxSale.totalDue)} owed ({linkedTaxSale.saleTypeLabel}). Click to view.
              </div>
            </div>
          </div>
        )}

        {/* Street view */}
        {listing.lat && listing.lng && apiKey && (
          <div>
            <div className={styles.imageTabs}>
              <button className={`${styles.imageTab} ${imageTab === 'street' ? styles.imageTabActive : ''}`} onClick={() => setImageTab('street')}>Street View</button>
              <button className={`${styles.imageTab} ${imageTab === 'map' ? styles.imageTabActive : ''}`} onClick={() => setImageTab('map')}>Map</button>
            </div>
            {imageTab === 'street' && streetviewUrl && (
              <img src={streetviewUrl} alt="Street view" className={styles.streetview} />
            )}
            {imageTab === 'map' && (
              <img src={`https://maps.googleapis.com/maps/api/staticmap?center=${listing.lat},${listing.lng}&zoom=15&size=520x200&maptype=roadmap&markers=color:red%7C${listing.lat},${listing.lng}&key=${apiKey}`} alt="Map" className={styles.streetview} />
            )}
          </div>
        )}

        {/* Links */}
        <div className={styles.linkRow}>
          <a
            href={`https://sheriffsaleviewer.polkcountyiowa.gov/Home/Detail/${listing.propertyId}`}
            target="_blank" rel="noopener" className={styles.link}
          >Sheriff Sale Page</a>
          {listing.lat && listing.lng && (
            <a
              href={`https://maps.google.com/maps?q=&layer=c&cbll=${listing.lat},${listing.lng}`}
              target="_blank" rel="noopener" className={styles.link}
            >Google Street View</a>
          )}
          {listing.parcelPin && (
            <a
              href={`https://taxsearch.polkcountyiowa.gov/Search`}
              target="_blank" rel="noopener" className={styles.link}
            >Tax Search</a>
          )}
        </div>

        {/* Favorites / Skip / Notes */}
        <div className={styles.actions}>
          <button
            className={`${styles.actionBtn} ${favorite ? styles.actionBtnActive : ''}`}
            onClick={() => setFavorite(!favorite)}
          >
            {favorite ? 'Favorited' : 'Favorite'}
          </button>
          <button
            className={`${styles.actionBtn} ${skip ? styles.skipBtnActive : ''}`}
            onClick={() => setSkip(!skip)}
          >
            {skip ? 'Skipped' : 'Skip'}
          </button>
        </div>

        <textarea
          className={styles.noteArea}
          placeholder="Add personal notes about this property..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
        />

        {/* Lien Position Analysis */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Lien Position Analysis</div>
          <div className={styles.dataGrid}>
            <div className={`${styles.dataItem} ${styles.fullWidth}`}>
              <span className={styles.dataLabel}>Plaintiff</span>
              <span className={styles.dataValue}>{listing.plaintiff || '—'}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Est. Position</span>
              <span className={`${styles.dataValue} ${riskClass}`}>
                {lien.position === 'first' ? '1st Mortgage' : lien.position === 'second' ? '2nd Mortgage' : 'Unknown'}
              </span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Risk Level</span>
              <span className={`${styles.badge} ${lien.risk === 'low' ? styles.badgeGreen : lien.risk === 'high' ? styles.badgeRed : styles.badgeYellow}`}>
                {lien.risk.toUpperCase()}
              </span>
            </div>
            <div className={`${styles.dataItem} ${styles.fullWidth}`}>
              <span className={styles.dataLabel}>Analysis</span>
              <span className={styles.dataValue} style={{ fontSize: 11 }}>{lien.reason}</span>
            </div>
          </div>
        </div>

        {/* Financial Summary */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Financial Summary</div>
          <div className={styles.dataGrid}>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Judgment</span>
              <span className={styles.dataValue}>{listing.approxJudgment || '—'}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Assessed Value</span>
              <span className={styles.dataValue}>{fmt$(listing.assessedValue)}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Outstanding Taxes</span>
              <span className={`${styles.dataValue} ${
                listing.outstandingTaxes && listing.outstandingTaxes > 0 ? styles.riskHigh : ''
              }`}>
                {fmt$(listing.outstandingTaxes)}
              </span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Last Sale</span>
              <span className={styles.dataValue}>
                {fmt$(listing.lastSaleAmount)}
                {listing.lastSaleDate ? ` (${listing.lastSaleDate})` : ''}
              </span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Equity Estimate</span>
              <span className={`${styles.dataValue} ${
                listing.equity != null ? (listing.equity > 0 ? styles.riskLow : styles.riskHigh) : ''
              }`}>
                {listing.equity != null ? fmt$(listing.equity) : '—'}
              </span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Parcel PIN</span>
              <span className={styles.dataValue}>{listing.parcelPin || '—'}</span>
            </div>
          </div>
        </div>

        {/* Tax Details */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Tax Details (Polk County Treasurer)
            {listing.hasUnredeemedTaxSale && (
              <span className={`${styles.badge} ${styles.badgeRed}`} style={{ marginLeft: 8, fontSize: 10 }}>
                UNREDEEMED TAX SALE
              </span>
            )}
          </div>
          <div className={styles.dataGrid}>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Total Taxes Due</span>
              <span className={`${styles.dataValue} ${
                listing.outstandingTaxes && listing.outstandingTaxes > 0 ? styles.riskHigh : styles.riskLow
              }`}>
                {fmt$(listing.outstandingTaxes)}
              </span>
            </div>
            {listing.taxDelinquentYears && listing.taxDelinquentYears.length > 0 && (
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Delinquent Years</span>
                <span className={`${styles.dataValue} ${styles.riskHigh}`}>
                  {listing.taxDelinquentYears.join(', ')}
                </span>
              </div>
            )}
            {listing.taxSaleCertNumber && (
              <>
                <div className={styles.dataItem}>
                  <span className={styles.dataLabel}>Tax Sale Cert #</span>
                  <span className={styles.dataValue}>{listing.taxSaleCertNumber}</span>
                </div>
                <div className={styles.dataItem}>
                  <span className={styles.dataLabel}>Tax Sale Amount</span>
                  <span className={styles.dataValue}>{fmt$(listing.taxSaleAmount)}</span>
                </div>
                <div className={styles.dataItem}>
                  <span className={styles.dataLabel}>Tax Sale Year</span>
                  <span className={styles.dataValue}>{listing.taxSaleYear || '—'}</span>
                </div>
              </>
            )}
            {listing.taxInstallments && listing.taxInstallments.length > 0 && (
              <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                <span className={styles.dataLabel}>Unpaid Installments</span>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  {listing.taxInstallments.map((inst, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>
                        {inst.year} - Installment #{inst.installmentNum}
                        {inst.soldAtTaxSale && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>(Sold at Tax Sale)</span>}
                      </span>
                      <span style={{ fontWeight: 600 }}>{fmt$(inst.totalDue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {listing.payOnlineUrl && (
              <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                <a
                  href={listing.payOnlineUrl}
                  target="_blank"
                  rel="noopener"
                  className={styles.link}
                  style={{ fontSize: 12 }}
                >
                  Pay Taxes Online (IowaTaxandTags.org)
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Flood Zone */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Flood Zone</div>
          {extra.flood ? (
            <div className={styles.dataGrid}>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Zone</span>
                <span className={`${styles.dataValue} ${extra.flood.isFloodZone ? styles.floodDanger : styles.floodSafe}`}>
                  {extra.flood.floodZone}
                </span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Flood Risk</span>
                <span className={`${styles.badge} ${extra.flood.isFloodZone ? styles.badgeRed : styles.badgeGreen}`}>
                  {extra.flood.isFloodZone ? 'HIGH RISK' : 'MINIMAL'}
                </span>
              </div>
              <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                <span className={styles.dataLabel}>Description</span>
                <span className={styles.dataValue} style={{ fontSize: 11 }}>
                  {extra.flood.description}
                  {extra.flood.detail && extra.flood.detail !== extra.flood.description && (
                    <span style={{ display: 'block', marginTop: 2, opacity: 0.7 }}>
                      FEMA: {extra.flood.detail}
                    </span>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <span className={styles.loadingDot}>{loading ? 'Loading...' : 'No data'}</span>
          )}
        </div>

        {/* Environmental */}
        {listing.envRiskLevel && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              Environmental
              {listing.envRiskLevel === 'high' && <span className={styles.badge} style={{ marginLeft: 8, background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.25)', color: 'var(--red)' }}>HIGH RISK</span>}
              {listing.envRiskLevel === 'medium' && <span className={styles.badge} style={{ marginLeft: 8, background: 'rgba(232,168,56,0.08)', borderColor: 'rgba(232,168,56,0.25)', color: 'var(--accent)' }}>MEDIUM</span>}
            </div>
            <div className={styles.dataGrid}>
              <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                <span className={styles.dataLabel}>Summary</span>
                <span className={styles.dataValue} style={{ fontSize: 11 }}>{listing.envSummary}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>EPA Facilities (1mi)</span>
                <span className={styles.dataValue}>{listing.envEchoCount ?? '—'}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Active Violations</span>
                <span className={`${styles.dataValue} ${listing.envHasViolations ? styles.riskHigh : ''}`}>
                  {listing.envHasViolations ? 'YES' : 'None'}
                </span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Superfund Sites (2mi)</span>
                <span className={`${styles.dataValue} ${listing.envSuperfundNearby ? styles.riskHigh : ''}`}>
                  {listing.envSuperfundCount ?? 0}
                </span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>TRI Facilities (2mi)</span>
                <span className={styles.dataValue}>{listing.envTriCount ?? 0}</span>
              </div>
            </div>
          </div>
        )}

        {/* Wetlands */}
        {listing.onWetland != null && listing.onWetland && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              Wetlands
              <span className={styles.badge} style={{ marginLeft: 8, background: 'rgba(96,165,250,0.08)', borderColor: 'rgba(96,165,250,0.25)', color: 'var(--blue)' }}>WETLAND AREA</span>
            </div>
            <div className={styles.dataGrid}>
              <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                <span className={styles.dataLabel}>Status</span>
                <span className={styles.dataValue} style={{ fontSize: 11 }}>{listing.wetlandDescription}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Wetland Areas</span>
                <span className={styles.dataValue}>{listing.wetlandCount}</span>
              </div>
            </div>
          </div>
        )}

        {/* Special Assessments */}
        {listing.specialAssessments && listing.specialAssessments.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              Special Assessments
              <span className={styles.badge} style={{ marginLeft: 8, background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.25)', color: 'var(--red)' }}>
                {fmt$(listing.specialAssessmentTotal)} OWED
              </span>
            </div>
            <div style={{ fontSize: 11 }}>
              {listing.specialAssessments.map((sa, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{sa.year}</span>
                    <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>{sa.project}</span>
                  </div>
                  <span style={{ fontWeight: 600, color: 'var(--red)' }}>{fmt$(sa.totalDue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Liens & Records — Manual Lookup Links */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Liens & Records (Manual Lookup)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11 }}>
            <a href="https://iowalandrecords.org/search-records/" target="_blank" rel="noopener" className={styles.link}>
              Iowa Land Records (Mechanic&apos;s/Judgment Liens)
            </a>
            <a href={`https://www.iowacourts.state.ia.us/ESAWebApp/SelectFrame`} target="_blank" rel="noopener" className={styles.link}>
              Iowa Courts (Judgment Liens)
            </a>
            <a href={`https://echodata.epa.gov/echo/facility_search?p_fn=&p_sa=${encodeURIComponent(listing.propertyAddress?.split(',')[0] || '')}&p_st=IA`} target="_blank" rel="noopener" className={styles.link}>
              EPA ECHO Facility Search
            </a>
          </div>
        </div>

        {/* Neighborhood / Census */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Neighborhood</div>
          {extra.census ? (
            <div className={styles.dataGrid}>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Median Income</span>
                <span className={styles.dataValue}>{fmt$(extra.census.medianHouseholdIncome ?? undefined)}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Median Home Value</span>
                <span className={styles.dataValue}>{fmt$(extra.census.medianHomeValue ?? undefined)}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Median Rent</span>
                <span className={styles.dataValue}>{fmt$(extra.census.medianGrossRent ?? undefined)}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Owner Occupied</span>
                <span className={styles.dataValue}>{extra.census.ownerOccupiedPct ?? '—'}%</span>
              </div>
            </div>
          ) : (
            <span className={styles.loadingDot}>{loading ? 'Loading...' : 'No data'}</span>
          )}
        </div>

        {/* HUD Rent */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Fair Market Rent (HUD)</div>
          {extra.rent ? (
            <div className={styles.dataGrid}>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>2 Bedroom</span>
                <span className={styles.dataValue}>{fmt$(extra.rent.twoBedroom)}/mo</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>3 Bedroom</span>
                <span className={styles.dataValue}>{fmt$(extra.rent.threeBedroom)}/mo</span>
              </div>
            </div>
          ) : (
            <span className={styles.loadingDot}>{loading ? 'Loading...' : 'No data'}</span>
          )}
        </div>

        {/* Rentcast Market Data */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Market Data (Rentcast)
            {!rcData && !rcLoading && (
              <button className={styles.aiBtn} onClick={fetchRentcast}>
                Get Estimates
              </button>
            )}
            {rcData?.fromCache && (
              <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 8 }}>cached</span>
            )}
          </div>
          {rcLoading && (
            <div className={styles.aiLoading}>
              <div className={styles.aiSpinner} />
              <span>Fetching rent & value estimates...</span>
            </div>
          )}
          {rcError && (
            <div className={styles.aiError}>
              {rcError}
              <button className={styles.aiRetry} onClick={fetchRentcast}>Retry</button>
            </div>
          )}
          {rcData && (
            <>
              <div className={styles.dataGrid}>
                {rcData.rentEstimate != null && (
                  <>
                    <div className={styles.dataItem}>
                      <span className={styles.dataLabel}>Rent Estimate</span>
                      <span className={styles.dataValue} style={{ fontWeight: 700, color: 'var(--accent)' }}>
                        {fmt$(rcData.rentEstimate)}/mo
                      </span>
                    </div>
                    <div className={styles.dataItem}>
                      <span className={styles.dataLabel}>Rent Range</span>
                      <span className={styles.dataValue}>
                        {fmt$(rcData.rentRangeLow)} - {fmt$(rcData.rentRangeHigh)}/mo
                      </span>
                    </div>
                  </>
                )}
                {rcData.valueEstimate != null && (
                  <>
                    <div className={styles.dataItem}>
                      <span className={styles.dataLabel}>Value Estimate</span>
                      <span className={styles.dataValue} style={{ fontWeight: 700, color: 'var(--accent)' }}>
                        {fmt$(rcData.valueEstimate)}
                      </span>
                    </div>
                    <div className={styles.dataItem}>
                      <span className={styles.dataLabel}>Value Range</span>
                      <span className={styles.dataValue}>
                        {fmt$(rcData.valueRangeLow)} - {fmt$(rcData.valueRangeHigh)}
                      </span>
                    </div>
                  </>
                )}
                {rcData.rentError && (
                  <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                    <span className={styles.dataLabel}>Rent Estimate</span>
                    <span className={styles.dataValue} style={{ color: '#e94560', fontSize: 11 }}>
                      Unavailable ({rcData.rentError})
                    </span>
                  </div>
                )}
                {rcData.valueError && (
                  <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                    <span className={styles.dataLabel}>Value Estimate</span>
                    <span className={styles.dataValue} style={{ color: '#e94560', fontSize: 11 }}>
                      Unavailable ({rcData.valueError})
                    </span>
                  </div>
                )}
              </div>

              {/* Rental Comps */}
              {rcData.rentComps?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className={styles.dataLabel} style={{ marginBottom: 6 }}>Rental Comps ({rcData.rentComps.length})</div>
                  <div style={{ fontSize: 11 }}>
                    {rcData.rentComps.slice(0, 5).map((c: any, idx: number) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <span style={{ opacity: 0.7 }}>{c.address}</span>
                          <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.5 }}>
                            {c.bedrooms}bd/{c.bathrooms}ba {c.sqft ? `${c.sqft}sf` : ''} {c.distance ? `${c.distance.toFixed(1)}mi` : ''}
                          </span>
                        </div>
                        <span style={{ fontWeight: 600 }}>{fmt$(c.rent)}/mo</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Value Comps */}
              {rcData.valueComps?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className={styles.dataLabel} style={{ marginBottom: 6 }}>Sales Comps ({rcData.valueComps.length})</div>
                  <div style={{ fontSize: 11 }}>
                    {rcData.valueComps.slice(0, 5).map((c: any, idx: number) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <span style={{ opacity: 0.7 }}>{c.address}</span>
                          <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.5 }}>
                            {c.bedrooms}bd/{c.bathrooms}ba {c.sqft ? `${c.sqft}sf` : ''} {c.distance ? `${c.distance.toFixed(1)}mi` : ''} {c.saleDate || ''}
                          </span>
                        </div>
                        <span style={{ fontWeight: 600 }}>{fmt$(c.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rcData.fetchedAt && (
                <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-muted)' }}>
                  Data from Rentcast {new Date(rcData.fetchedAt).toLocaleDateString()}
                  <button className={styles.aiRefresh} onClick={fetchRentcast} style={{ marginLeft: 8 }}>Refresh</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sale History (from Assessor) */}
        {listing.saleHistory && listing.saleHistory.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Sale History ({listing.saleHistory.length} Records)</div>
            <div style={{ fontSize: 11 }}>
              {listing.saleHistory.slice(0, 15).map((sale, idx) => (
                <div key={idx} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600 }}>{sale.date}</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmt$(sale.price)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    <span>{sale.seller}</span>
                    <span style={{ margin: '0 4px', opacity: 0.5 }}>{'\u2192'}</span>
                    <span>{sale.buyer}</span>
                    <span style={{ marginLeft: 8, opacity: 0.6 }}>{sale.instrument}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Redemption Period */}
        {redemption && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Redemption Period (Iowa)</div>
            <div className={styles.dataGrid}>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Standard (1 Year)</span>
                <span className={styles.dataValue}>{redemption.daysRemaining} days remaining</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>If Reduced (6 Mo)</span>
                <span className={styles.dataValue}>{redemption.daysRemainingReduced} days remaining</span>
              </div>
              <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                <span className={styles.dataLabel}>Details</span>
                <span className={styles.dataValue} style={{ fontSize: 11 }}>{redemption.explanation}</span>
              </div>
            </div>
          </div>
        )}

        {/* Auction History */}
        {extra.history && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Auction History</div>
            <div className={styles.dataGrid}>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>First Seen</span>
                <span className={styles.dataValue}>{extra.history.firstSeen}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Postponed</span>
                <span className={`${styles.dataValue} ${extra.history.wasPostponed ? styles.riskHigh : ''}`}>
                  {extra.history.wasPostponed ? `YES (${extra.history.saleDateChanges.length}x)` : 'No'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* AI Chat */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            AI Property Chat
            {chatMessages.length === 0 && (
              <button className={styles.aiBtn} onClick={startAnalysis}>Analyze Property</button>
            )}
          </div>
          <div className={styles.aiChat}>
            {chatMessages.length === 0 && !chatLoading && (
              <div className={styles.aiChatEmpty}>Click Analyze for a full assessment, or ask any question about this property below.</div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`${styles.aiChatMsg} ${m.role === 'user' ? styles.aiChatUser : styles.aiChatAssistant}`}>
                <div className={styles.aiChatRole}>{m.role === 'user' ? 'You' : 'AI'}</div>
                <div className={styles.aiChatContent}>
                  {m.role === 'assistant' ? m.content.split('\n').map((line, j) => {
                    if (line.match(/^\*\*.*\*\*/)) return <h4 key={j} className={styles.aiHeading}>{line.replace(/\*\*/g, '')}</h4>;
                    if (line.startsWith('- ') || line.startsWith('* ')) return <div key={j} className={styles.aiBullet} dangerouslySetInnerHTML={{ __html: line.replace(/^[-*]\s*/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />;
                    if (line.trim() === '') return <div key={j} style={{ height: 6 }} />;
                    return <p key={j} className={styles.aiPara} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />;
                  }) : m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className={`${styles.aiChatMsg} ${styles.aiChatAssistant}`}>
                <div className={styles.aiChatRole}>AI</div>
                <div className={styles.aiChatContent}><div className={styles.aiLoading}><div className={styles.aiSpinner} /> Thinking...</div></div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form className={styles.aiChatForm} onSubmit={e => { e.preventDefault(); sendPropertyChat(chatInput); }}>
            <input
              className={styles.aiChatInput}
              placeholder="Ask about this property..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={chatLoading}
            />
            <button className={styles.aiChatSend} type="submit" disabled={chatLoading || !chatInput.trim()}>
              Send
            </button>
          </form>
        </div>

        {/* ROI Calculator */}
        <div className={styles.section}>
          <ROICalculator listing={listing} />
        </div>
      </div>
      {pdfModalOpen && <PdfModal property={listing} type="auction" onClose={() => setPdfModalOpen(false)} />}
    </div>
  );
}
