'use client';

import { useState, useMemo } from 'react';
import { SherifffListing } from '@/types';
import styles from './ROICalculator.module.css';

interface Props {
  listing: SherifffListing;
}

function fmt$(val: number): string {
  return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default function ROICalculator({ listing }: Props) {
  const judgmentNum = useMemo(() => {
    if (!listing.approxJudgment) return 0;
    return parseFloat(listing.approxJudgment.replace(/[$,\s]/g, '')) || 0;
  }, [listing.approxJudgment]);

  const [maxBid, setMaxBid] = useState(judgmentNum > 0 ? Math.round(judgmentNum * 0.7).toString() : '');
  const [rehabCost, setRehabCost] = useState('15000');
  const [arvOverride, setArvOverride] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');

  const arv = arvOverride ? parseInt(arvOverride) : (listing.assessedValue ?? 0);
  const bid = parseInt(maxBid) || 0;
  const rehab = parseInt(rehabCost) || 0;
  const rent = parseInt(monthlyRent) || 0;
  const taxes = listing.outstandingTaxes ?? 0;

  const totalInvestment = bid + rehab + taxes;
  const flipProfit = arv - totalInvestment;
  const flipROI = totalInvestment > 0 ? (flipProfit / totalInvestment) * 100 : 0;
  const annualRent = rent * 12;
  const cashOnCash = totalInvestment > 0 && rent > 0 ? (annualRent / totalInvestment) * 100 : 0;
  const rule70 = arv > 0 ? Math.round(arv * 0.7 - rehab) : 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.title}>ROI Calculator</div>
      <div className={styles.grid}>
        <div className={styles.field}>
          <label>Max Bid ($)</label>
          <input
            type="text"
            value={maxBid}
            onChange={(e) => setMaxBid(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={judgmentNum > 0 ? Math.round(judgmentNum * 0.7).toString() : '0'}
          />
        </div>
        <div className={styles.field}>
          <label>Est. Rehab Cost ($)</label>
          <input
            type="text"
            value={rehabCost}
            onChange={(e) => setRehabCost(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="15000"
          />
        </div>
        <div className={styles.field}>
          <label>ARV Override ($)</label>
          <input
            type="text"
            value={arvOverride}
            onChange={(e) => setArvOverride(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={listing.assessedValue ? listing.assessedValue.toString() : 'Assessed value'}
          />
        </div>
        <div className={styles.field}>
          <label>Monthly Rent ($)</label>
          <input
            type="text"
            value={monthlyRent}
            onChange={(e) => setMonthlyRent(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="1000"
          />
        </div>
      </div>

      <div className={styles.results}>
        <div className={styles.resultItem}>
          <span className={styles.resultLabel}>Total Investment</span>
          <span className={`${styles.resultValue} ${styles.neutral}`}>{fmt$(totalInvestment)}</span>
        </div>
        <div className={styles.resultItem}>
          <span className={styles.resultLabel}>70% Rule Max Bid</span>
          <span className={`${styles.resultValue} ${styles.neutral}`}>{fmt$(rule70)}</span>
        </div>
        <div className={styles.resultItem}>
          <span className={styles.resultLabel}>Flip Profit</span>
          <span className={`${styles.resultValue} ${flipProfit >= 0 ? styles.positive : styles.negative}`}>
            {fmt$(flipProfit)}
          </span>
        </div>
        <div className={styles.resultItem}>
          <span className={styles.resultLabel}>Flip ROI</span>
          <span className={`${styles.resultValue} ${flipROI >= 0 ? styles.positive : styles.negative}`}>
            {flipROI.toFixed(1)}%
          </span>
        </div>
        {rent > 0 && (
          <>
            <div className={styles.resultItem}>
              <span className={styles.resultLabel}>Annual Rent</span>
              <span className={`${styles.resultValue} ${styles.positive}`}>{fmt$(annualRent)}</span>
            </div>
            <div className={styles.resultItem}>
              <span className={styles.resultLabel}>Cash-on-Cash</span>
              <span className={`${styles.resultValue} ${cashOnCash >= 8 ? styles.positive : styles.negative}`}>
                {cashOnCash.toFixed(1)}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
