'use client';

import { useState } from 'react';
import { generatePropertyReport } from '@/lib/generate-pdf';
import styles from './PdfModal.module.css';

interface Props {
  property: any;
  type: 'auction' | 'taxsale';
  onClose: () => void;
}

export default function PdfModal({ property, type, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  async function handleWithAi() {
    setLoading(true);
    setStatus('Generating AI analysis...');
    try {
      const res = await fetch('/api/ai-property-analysis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          listing: {
            ...property,
            ...(type === 'taxsale' ? {
              approxJudgment: null,
              outstandingTaxes: property.totalDue,
              plaintiff: `Tax Sale - ${property.saleTypeLabel || ''}`,
              defendant: property.titleHolder,
            } : {}),
          },
          notes: type === 'taxsale'
            ? `Generate a concise PDF summary for a TAX SALE CERTIFICATE. Focus on: safety margin (assessed value vs tax amount), likelihood of redemption, environmental/wetland risks, and whether to target 100% bid. Keep it under 300 words.`
            : `Generate a concise PDF summary for a SHERIFF AUCTION property. Focus on: risk assessment, recommended max bid (conservative and optimistic), total acquisition cost breakdown, key red flags, and rental potential. Keep it under 300 words.`,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setStatus('AI unavailable — generating without insights...');
        setTimeout(() => { generatePropertyReport(property, type); onClose(); }, 1000);
      } else {
        setStatus('Generating PDF...');
        generatePropertyReport(property, type, data.analysis);
        onClose();
      }
    } catch {
      setStatus('AI unavailable — generating without insights...');
      setTimeout(() => { generatePropertyReport(property, type); onClose(); }, 1000);
    }
  }

  function handleWithoutAi() {
    generatePropertyReport(property, type);
    onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.title}>Generate Property Report</div>
        <div className={styles.body}>
          <p>Would you like to include AI insights in the PDF report?</p>
          {type === 'auction' ? (
            <ul className={styles.list}>
              <li>Risk assessment and level</li>
              <li>Recommended max bid (conservative + optimistic)</li>
              <li>Total acquisition cost breakdown</li>
              <li>Rental analysis and ROI estimate</li>
              <li>Red flags and action items</li>
            </ul>
          ) : (
            <ul className={styles.list}>
              <li>Risk assessment and level</li>
              <li>Safety margin analysis</li>
              <li>Redemption likelihood</li>
              <li>Environmental and wetland concerns</li>
              <li>Investment return projection</li>
            </ul>
          )}
          {loading && <div className={styles.loading}>{status}</div>}
        </div>
        <div className={styles.buttons}>
          <button className={styles.btnCancel} onClick={onClose} disabled={loading}>Cancel</button>
          <button className={styles.btnNo} onClick={handleWithoutAi} disabled={loading}>No, just data</button>
          <button className={styles.btnYes} onClick={handleWithAi} disabled={loading}>
            {loading ? 'Analyzing...' : 'Yes, include AI'}
          </button>
        </div>
      </div>
    </div>
  );
}
