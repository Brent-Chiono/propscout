'use client';

import styles from './Filters.module.css';

export interface FilterState {
  status: 'all' | 'active' | 'delayed';
  equityOnly: boolean;
  minAssessed: string;
  maxAssessed: string;
  hasData: boolean;
  riskLevel: 'all' | 'low' | 'medium' | 'high';
  minBeds: string;
  minBaths: string;
  minJudgment: string;
  maxJudgment: string;
}

export const DEFAULT_FILTERS: FilterState = {
  status: 'all',
  equityOnly: false,
  minAssessed: '',
  maxAssessed: '',
  hasData: false,
  riskLevel: 'all',
  minBeds: '',
  minBaths: '',
  minJudgment: '',
  maxJudgment: '',
};

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export default function Filters({ filters, onChange }: Props) {
  function update(partial: Partial<FilterState>) {
    onChange({ ...filters, ...partial });
  }

  const isDefault =
    filters.status === 'all' &&
    !filters.equityOnly &&
    !filters.minAssessed &&
    !filters.maxAssessed &&
    !filters.hasData &&
    filters.riskLevel === 'all' &&
    !filters.minBeds &&
    !filters.minBaths &&
    !filters.minJudgment &&
    !filters.maxJudgment;

  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <div className={styles.group}>
          <span className={styles.label}>Status</span>
          <select
            className={styles.select}
            value={filters.status}
            onChange={(e) => update({ status: e.target.value as FilterState['status'] })}
          >
            <option value="all">All</option>
            <option value="active">Active Only</option>
            <option value="delayed">Delayed Only</option>
          </select>
        </div>

        <div className={styles.spacer} />

        <div className={styles.group}>
          <span className={styles.label}>Risk</span>
          <select
            className={styles.select}
            value={filters.riskLevel}
            onChange={(e) => update({ riskLevel: e.target.value as FilterState['riskLevel'] })}
          >
            <option value="all">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className={styles.spacer} />

        <div className={styles.group}>
          <span className={styles.label}>Beds</span>
          <input
            className={styles.inputSmall}
            type="text"
            placeholder="Min"
            value={filters.minBeds}
            onChange={(e) => update({ minBeds: e.target.value.replace(/[^0-9]/g, '') })}
          />
          <span className={styles.label}>Baths</span>
          <input
            className={styles.inputSmall}
            type="text"
            placeholder="Min"
            value={filters.minBaths}
            onChange={(e) => update({ minBaths: e.target.value.replace(/[^0-9]/g, '') })}
          />
        </div>

        <div className={styles.spacer} />

        <div className={styles.group}>
          <span className={styles.label}>Assessed</span>
          <input
            className={styles.input}
            type="text"
            placeholder="Min $"
            value={filters.minAssessed}
            onChange={(e) => update({ minAssessed: e.target.value.replace(/[^0-9]/g, '') })}
          />
          <span className={styles.label}>to</span>
          <input
            className={styles.input}
            type="text"
            placeholder="Max $"
            value={filters.maxAssessed}
            onChange={(e) => update({ maxAssessed: e.target.value.replace(/[^0-9]/g, '') })}
          />
        </div>

        <div className={styles.spacer} />

        <div className={styles.group}>
          <span className={styles.label}>Judgment</span>
          <input
            className={styles.input}
            type="text"
            placeholder="Min $"
            value={filters.minJudgment}
            onChange={(e) => update({ minJudgment: e.target.value.replace(/[^0-9]/g, '') })}
          />
          <span className={styles.label}>to</span>
          <input
            className={styles.input}
            type="text"
            placeholder="Max $"
            value={filters.maxJudgment}
            onChange={(e) => update({ maxJudgment: e.target.value.replace(/[^0-9]/g, '') })}
          />
        </div>

        <div className={styles.spacer} />

        <button
          className={`${styles.toggle} ${filters.equityOnly ? styles.toggleActive : ''}`}
          onClick={() => update({ equityOnly: !filters.equityOnly })}
        >
          Positive Equity
        </button>

        <button
          className={`${styles.toggle} ${filters.hasData ? styles.toggleActive : ''}`}
          onClick={() => update({ hasData: !filters.hasData })}
        >
          Has Data
        </button>

        {!isDefault && (
          <button
            className={styles.clearBtn}
            onClick={() => onChange(DEFAULT_FILTERS)}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
