'use client';

import { useState, useRef, useEffect } from 'react';
import PdfModal from './PdfModal';
import styles from './PropertyDetail.module.css';

interface TaxSaleParcel {
  [key: string]: any;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  parcel: TaxSaleParcel;
  onClose: () => void;
  onOpenDocs?: () => void;
  onRefresh?: (parcel: TaxSaleParcel) => Promise<void>;
  onViewAuction?: (propertyId: string) => void;
  initialAiChat?: ChatMsg[];
  linkedAuction?: { propertyId: string; propertyAddress: string; approxJudgment: string; salesDate: string } | null;
}

function fmt$(val?: number | null): string {
  if (val == null) return '—';
  return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default function TaxSaleDetail({ parcel, onClose, onOpenDocs, onRefresh, onViewAuction, initialAiChat, linkedAuction }: Props) {
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(initialAiChat || []);
  const [refreshing, setRefreshing] = useState(false);
  const [imgTab, setImgTab] = useState<'street' | 'map'>('street');
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const chatInitRef = useRef(true);
  useEffect(() => {
    if (chatInitRef.current) { chatInitRef.current = false; return; }
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  async function sendChat(message: string) {
    if (!message.trim() || chatLoading) return;
    const newMessages: ChatMsg[] = [...chatMessages, { role: 'user', content: message.trim() }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/ai-chat-property', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, propertyContext: parcel }),
      });
      const data = await res.json();
      setChatMessages([...newMessages, {
        role: 'assistant',
        content: data.error ? `Error: ${data.error}` : data.response,
      }]);
    } catch (err: any) {
      setChatMessages([...newMessages, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  function startAnalysis() {
    sendChat('Analyze this tax sale certificate as an investment. Cover: risk assessment, safety margin, projected returns if redeemed at 1yr and 2yr, red flags, and whether to target 100% bid. Show specific numbers.');
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const streetviewUrl = parcel.lat && parcel.lng && apiKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=520x200&location=${parcel.lat},${parcel.lng}&key=${apiKey}`
    : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()} ref={el => { if (el) el.scrollTop = 0; }}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.address}>
            {parcel.propertyAddress || parcel.legalDescription || parcel.parcelPin}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className={styles.helpBtn} onClick={() => setPdfModalOpen(true)} title="Print/Save PDF" style={{ fontSize: 10 }}>PDF</button>
            {onRefresh && (
              <button
                className={styles.helpBtn}
                onClick={async () => { setRefreshing(true); await onRefresh(parcel); setRefreshing(false); }}
                disabled={refreshing}
                title="Re-enrich this property"
                style={{ fontSize: 12 }}
              >{refreshing ? '...' : '\u21BB'}</button>
            )}
            {onOpenDocs && <button className={styles.helpBtn} onClick={onOpenDocs} title="Documentation">?</button>}
            <button className={styles.closeBtn} onClick={onClose}>x</button>
          </div>
        </div>

        {/* Cross-link banner */}
        {linkedAuction && (
          <div className={styles.crossLink} onClick={() => onViewAuction?.(linkedAuction.propertyId)}>
            <span className={styles.crossLinkIcon}>!</span>
            <div>
              <div className={styles.crossLinkTitle}>Also in Sheriff Auctions</div>
              <div className={styles.crossLinkDesc}>
                This property is scheduled for sheriff sale on {linkedAuction.salesDate}. Judgment: {linkedAuction.approxJudgment || 'pending'}. Click to view.
              </div>
            </div>
          </div>
        )}

        {/* Street view */}
        {parcel.lat && parcel.lng && apiKey && (
          <div>
            <div className={styles.imageTabs}>
              <button className={`${styles.imageTab} ${imgTab === 'street' ? styles.imageTabActive : ''}`} onClick={() => setImgTab('street')}>Street View</button>
              <button className={`${styles.imageTab} ${imgTab === 'map' ? styles.imageTabActive : ''}`} onClick={() => setImgTab('map')}>Map</button>
            </div>
            {imgTab === 'street' && streetviewUrl && (
              <img src={streetviewUrl} alt="Street view" className={styles.streetview} />
            )}
            {imgTab === 'map' && (
              <img src={`https://maps.googleapis.com/maps/api/staticmap?center=${parcel.lat},${parcel.lng}&zoom=15&size=520x200&maptype=roadmap&markers=color:red%7C${parcel.lat},${parcel.lng}&key=${apiKey}`} alt="Map" className={styles.streetview} />
            )}
          </div>
        )}

        {/* Links */}
        <div className={styles.linkRow}>
          {parcel.sourceUrl && (
            <a href={parcel.sourceUrl} target="_blank" rel="noopener" className={styles.link}>Delinquent List</a>
          )}
          <a href={parcel.taxSearchUrl || 'https://taxsearch.polkcountyiowa.gov/Search'} target="_blank" rel="noopener" className={styles.link}>
            Tax Search
          </a>
          {parcel.lat && parcel.lng && (
            <a href={`https://maps.google.com/maps?q=&layer=c&cbll=${parcel.lat},${parcel.lng}`} target="_blank" rel="noopener" className={styles.link}>
              Street View
            </a>
          )}
          <a href="https://www.polkcountyiowa.gov/treasurer/information-for-tax-sale-buyers/" target="_blank" rel="noopener" className={styles.link}>
            Buyer Info
          </a>
        </div>

        {/* Tax Sale Details */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Tax Sale Certificate Details</div>
          <div className={styles.dataGrid}>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Total Due</span>
              <span className={`${styles.dataValue} ${styles.riskHigh}`} style={{ fontSize: 16, fontWeight: 700 }}>
                {fmt$(parcel.totalDue)}
              </span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Interest Rate</span>
              <span className={`${styles.dataValue} ${styles.riskLow}`}>2% / month (24%/yr)</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Tax + Interest</span>
              <span className={styles.dataValue}>{fmt$(parcel.taxInterest)}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Late Interest</span>
              <span className={styles.dataValue}>{fmt$(parcel.lateInterest)}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Fees</span>
              <span className={styles.dataValue}>{fmt$(parcel.totalFee)}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Parcel PIN</span>
              <span className={styles.dataValue}>{parcel.parcelPin}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Sale Type</span>
              <span className={styles.dataValue}>{parcel.saleTypeLabel}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Area</span>
              <span className={styles.dataValue}>{parcel.area}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Property Type</span>
              <span className={styles.dataValue}>{parcel.propertyType === 'real-estate' ? 'Real Estate' : 'Mobile Home'}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Owner</span>
              <span className={styles.dataValue}>{parcel.titleHolder}</span>
            </div>
            {parcel.mailingAddress && (
              <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                <span className={styles.dataLabel}>Mailing Address</span>
                <span className={styles.dataValue}>{parcel.mailingAddress}</span>
              </div>
            )}
            {parcel.legalDescription && (
              <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                <span className={styles.dataLabel}>Legal Description</span>
                <span className={styles.dataValue} style={{ fontSize: 11 }}>{parcel.legalDescription}</span>
              </div>
            )}
          </div>
        </div>

        {/* Investment Analysis */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Investment Quick Math</div>
          <div className={styles.dataGrid}>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Your Investment</span>
              <span className={styles.dataValue}>{fmt$(parcel.totalDue)}</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Monthly Return (2%)</span>
              <span className={`${styles.dataValue} ${styles.riskLow}`}>{fmt$(parcel.totalDue * 0.02)}/mo</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>Annual Return (24%)</span>
              <span className={`${styles.dataValue} ${styles.riskLow}`}>{fmt$(parcel.totalDue * 0.24)}/yr</span>
            </div>
            <div className={styles.dataItem}>
              <span className={styles.dataLabel}>If Redeemed at 2yr</span>
              <span className={`${styles.dataValue} ${styles.riskLow}`}>{fmt$(parcel.totalDue + parcel.totalDue * 0.02 * 24)}</span>
            </div>
            {parcel.assessedValue != null && (
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Tax/Value Ratio</span>
                <span className={styles.dataValue}>{((parcel.totalDue / parcel.assessedValue) * 100).toFixed(1)}%</span>
              </div>
            )}
            {parcel.assessedValue != null && (
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Safety Margin</span>
                <span className={`${styles.dataValue} ${parcel.assessedValue > parcel.totalDue * 5 ? styles.riskLow : styles.riskMedium}`}>
                  {(parcel.assessedValue / parcel.totalDue).toFixed(1)}x
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Property Details (from Assessor) */}
        {parcel.assessedValue != null && (() => {
          const isLandOnly = parcel.assessedValue && !parcel.buildingValue && !parcel.yearBuilt && !parcel.sqft;
          const isMobileHome = parcel.propertyType === 'mobile-home';
          return (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              Property Details (Assessor)
              {isLandOnly && <span className={styles.badge} style={{ marginLeft: 8, background: 'rgba(232,168,56,0.12)', borderColor: 'rgba(232,168,56,0.35)', color: 'var(--accent)' }}>Land Only</span>}
              {isMobileHome && <span className={styles.badge} style={{ marginLeft: 8, background: 'rgba(167,139,250,0.08)', borderColor: 'rgba(167,139,250,0.25)', color: 'var(--purple)' }}>Mobile Home</span>}
            </div>
            <div className={styles.dataGrid}>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Assessed Value</span>
                <span className={styles.dataValue}>{fmt$(parcel.assessedValue)}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Land Value</span>
                <span className={styles.dataValue}>{fmt$(parcel.landValue)}</span>
              </div>
              {!isLandOnly && (
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Building Value</span>
                <span className={styles.dataValue}>{fmt$(parcel.buildingValue)}</span>
              </div>
              )}
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Class</span>
                <span className={styles.dataValue}>{parcel.propertyClass || '—'}</span>
              </div>
              {!isLandOnly && (<>
                <div className={styles.dataItem}>
                  <span className={styles.dataLabel}>Year Built</span>
                  <span className={styles.dataValue}>{parcel.yearBuilt || '—'}</span>
                </div>
                <div className={styles.dataItem}>
                  <span className={styles.dataLabel}>Sqft</span>
                  <span className={styles.dataValue}>{parcel.sqft ? parcel.sqft.toLocaleString() : '—'}</span>
                </div>
                <div className={styles.dataItem}>
                  <span className={styles.dataLabel}>Bedrooms</span>
                  <span className={styles.dataValue}>{parcel.bedrooms || '—'}</span>
                </div>
                <div className={styles.dataItem}>
                  <span className={styles.dataLabel}>Bathrooms</span>
                  <span className={styles.dataValue}>{parcel.bathrooms || '—'}</span>
                </div>
              </>)}
              {isLandOnly && (
                <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                  <span className={styles.dataLabel}>Note</span>
                  <span className={styles.dataValue} style={{ fontSize: 11 }}>This parcel appears to be vacant land (no building value, no structure data from assessor).</span>
                </div>
              )}
              {parcel.lastSaleAmount && (
                <div className={styles.dataItem}>
                  <span className={styles.dataLabel}>Last Sale</span>
                  <span className={styles.dataValue}>{fmt$(parcel.lastSaleAmount)} {parcel.lastSaleDate ? `(${parcel.lastSaleDate})` : ''}</span>
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* Sale History */}
        {parcel.saleHistory?.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Sale History ({parcel.saleHistory.length} Records)</div>
            <div style={{ fontSize: 11 }}>
              {parcel.saleHistory.slice(0, 15).map((sale: any, idx: number) => (
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

        {/* Flood Zone */}
        {parcel.floodZone && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Flood Zone</div>
            <div className={styles.dataGrid}>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Zone</span>
                <span className={`${styles.dataValue} ${parcel.isFloodZone ? styles.floodDanger : styles.floodSafe}`}>
                  {parcel.floodZone}
                </span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Risk</span>
                <span className={`${styles.badge} ${parcel.isFloodZone ? styles.badgeRed : styles.badgeGreen}`}>
                  {parcel.isFloodZone ? 'HIGH RISK' : 'MINIMAL'}
                </span>
              </div>
              {parcel.floodDescription && (
                <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                  <span className={styles.dataLabel}>Description</span>
                  <span className={styles.dataValue} style={{ fontSize: 11 }}>{parcel.floodDescription}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Environmental */}
        {parcel.envRiskLevel && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              Environmental
              {parcel.envRiskLevel === 'high' && <span className={styles.badge} style={{ marginLeft: 8, background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.25)', color: 'var(--red)' }}>HIGH RISK</span>}
              {parcel.envRiskLevel === 'medium' && <span className={styles.badge} style={{ marginLeft: 8, background: 'rgba(232,168,56,0.08)', borderColor: 'rgba(232,168,56,0.25)', color: 'var(--accent)' }}>MEDIUM</span>}
            </div>
            <div className={styles.dataGrid}>
              <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                <span className={styles.dataLabel}>Summary</span>
                <span className={styles.dataValue} style={{ fontSize: 11 }}>{parcel.envSummary}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>EPA Facilities (1mi)</span>
                <span className={styles.dataValue}>{parcel.envEchoCount ?? '—'}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Active Violations</span>
                <span className={`${styles.dataValue} ${parcel.envHasViolations ? styles.riskHigh : ''}`}>
                  {parcel.envHasViolations ? 'YES' : 'None'}
                </span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Superfund (2mi)</span>
                <span className={`${styles.dataValue} ${parcel.envSuperfundNearby ? styles.riskHigh : ''}`}>
                  {parcel.envSuperfundCount ?? 0}
                </span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>TRI Facilities (2mi)</span>
                <span className={styles.dataValue}>{parcel.envTriCount ?? 0}</span>
              </div>
            </div>
          </div>
        )}

        {/* Wetlands */}
        {parcel.onWetland && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              Wetlands
              <span className={styles.badge} style={{ marginLeft: 8, background: 'rgba(96,165,250,0.08)', borderColor: 'rgba(96,165,250,0.25)', color: 'var(--blue)' }}>WETLAND AREA</span>
            </div>
            <div className={styles.dataGrid}>
              <div className={`${styles.dataItem} ${styles.fullWidth}`}>
                <span className={styles.dataLabel}>Status</span>
                <span className={styles.dataValue} style={{ fontSize: 11 }}>{parcel.wetlandDescription}</span>
              </div>
            </div>
          </div>
        )}

        {/* Special Assessments */}
        {parcel.specialAssessments?.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              Special Assessments
              <span className={styles.badge} style={{ marginLeft: 8, background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.25)', color: 'var(--red)' }}>
                {fmt$(parcel.specialAssessmentTotal)} OWED
              </span>
            </div>
            <div style={{ fontSize: 11 }}>
              {parcel.specialAssessments.map((sa: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <div><span style={{ fontWeight: 500 }}>{sa.year}</span> <span style={{ color: 'var(--text-muted)' }}>{sa.project}</span></div>
                  <span style={{ fontWeight: 600, color: 'var(--red)' }}>{fmt$(sa.totalDue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Liens & Records — Manual Links */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Liens & Records (Manual Lookup)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11 }}>
            <a href="https://iowalandrecords.org/search-records/" target="_blank" rel="noopener" className={styles.link}>
              Iowa Land Records (Mechanic&apos;s/Judgment Liens)
            </a>
            <a href="https://www.iowacourts.state.ia.us/ESAWebApp/SelectFrame" target="_blank" rel="noopener" className={styles.link}>
              Iowa Courts (Judgment Liens)
            </a>
            <a href={`https://echodata.epa.gov/echo/facility_search?p_fn=&p_sa=${encodeURIComponent((parcel.propertyAddress || '').split(',')[0])}&p_st=IA`} target="_blank" rel="noopener" className={styles.link}>
              EPA ECHO Search
            </a>
          </div>
        </div>

        {/* Neighborhood */}
        {parcel.medianHouseholdIncome != null && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Neighborhood</div>
            <div className={styles.dataGrid}>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Median Income</span>
                <span className={styles.dataValue}>{fmt$(parcel.medianHouseholdIncome)}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Median Home Value</span>
                <span className={styles.dataValue}>{fmt$(parcel.medianHomeValue)}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Median Rent</span>
                <span className={styles.dataValue}>{fmt$(parcel.medianGrossRent)}</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>Owner Occupied</span>
                <span className={styles.dataValue}>{parcel.ownerOccupiedPct ?? '—'}%</span>
              </div>
            </div>
          </div>
        )}

        {/* HUD Rent */}
        {parcel.hudRent2Bed != null && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Fair Market Rent (HUD)</div>
            <div className={styles.dataGrid}>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>2 Bedroom</span>
                <span className={styles.dataValue}>{fmt$(parcel.hudRent2Bed)}/mo</span>
              </div>
              <div className={styles.dataItem}>
                <span className={styles.dataLabel}>3 Bedroom</span>
                <span className={styles.dataValue}>{fmt$(parcel.hudRent3Bed)}/mo</span>
              </div>
            </div>
          </div>
        )}

        {/* AI Chat */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            AI Property Chat
            {chatMessages.length === 0 && (
              <button className={styles.aiBtn} onClick={startAnalysis}>Analyze</button>
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
          <form className={styles.aiChatForm} onSubmit={e => { e.preventDefault(); sendChat(chatInput); }}>
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
      </div>
      {pdfModalOpen && <PdfModal property={parcel} type="taxsale" onClose={() => setPdfModalOpen(false)} />}
    </div>
  );
}
