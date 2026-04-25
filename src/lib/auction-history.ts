import fs from 'fs';
import path from 'path';
import { SherifffListing } from '@/types';

const HISTORY_DIR = path.join(process.cwd(), 'data');
const HISTORY_FILE = path.join(HISTORY_DIR, 'auction-history.json');

export interface HistorySnapshot {
  date: string;   // ISO date
  propertyIds: string[];
  saleDates: Record<string, string>;  // propertyId -> salesDate
}

export interface AuctionHistoryEntry {
  propertyId: string;
  firstSeen: string;
  timesSeen: number;
  saleDateChanges: { from: string; to: string; detectedOn: string }[];
  wasPostponed: boolean;
}

function ensureDir() {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

function loadHistory(): HistorySnapshot[] {
  try {
    ensureDir();
    if (!fs.existsSync(HISTORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveHistory(snapshots: HistorySnapshot[]) {
  try {
    ensureDir();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(snapshots, null, 2), 'utf-8');
  } catch (err) {
    console.error('[auction-history] Failed to save:', err);
  }
}

/**
 * Record a new snapshot of current listings.
 * Call this whenever we fetch fresh data from the sheriff site.
 */
export function recordSnapshot(listings: SherifffListing[]): void {
  const snapshots = loadHistory();
  const today = new Date().toISOString().split('T')[0];

  // Don't record more than once per day
  if (snapshots.length > 0 && snapshots[snapshots.length - 1].date === today) {
    return;
  }

  const saleDates: Record<string, string> = {};
  for (const l of listings) {
    saleDates[l.propertyId] = l.salesDate ?? '';
  }

  snapshots.push({
    date: today,
    propertyIds: listings.map((l) => l.propertyId),
    saleDates,
  });

  // Keep last 90 snapshots max
  if (snapshots.length > 90) {
    snapshots.splice(0, snapshots.length - 90);
  }

  saveHistory(snapshots);
}

/**
 * Get auction history analysis for a specific property.
 */
export function getPropertyHistory(propertyId: string): AuctionHistoryEntry | null {
  const snapshots = loadHistory();
  if (snapshots.length === 0) return null;

  let firstSeen: string | null = null;
  let timesSeen = 0;
  const saleDateChanges: AuctionHistoryEntry['saleDateChanges'] = [];
  let lastKnownSaleDate = '';

  for (const snap of snapshots) {
    if (snap.propertyIds.includes(propertyId)) {
      timesSeen++;
      if (!firstSeen) firstSeen = snap.date;

      const currentSaleDate = snap.saleDates[propertyId] ?? '';
      if (lastKnownSaleDate && currentSaleDate && currentSaleDate !== lastKnownSaleDate) {
        saleDateChanges.push({
          from: lastKnownSaleDate,
          to: currentSaleDate,
          detectedOn: snap.date,
        });
      }
      lastKnownSaleDate = currentSaleDate;
    }
  }

  if (!firstSeen) return null;

  return {
    propertyId,
    firstSeen,
    timesSeen,
    saleDateChanges,
    wasPostponed: saleDateChanges.length > 0,
  };
}

/**
 * Get history for all properties currently listed.
 */
export function getAllHistory(): Record<string, AuctionHistoryEntry> {
  const snapshots = loadHistory();
  if (snapshots.length === 0) return {};

  // Get all unique property IDs across all snapshots
  const allIds = new Set<string>();
  for (const snap of snapshots) {
    for (const id of snap.propertyIds) allIds.add(id);
  }

  const result: Record<string, AuctionHistoryEntry> = {};
  for (const id of allIds) {
    const entry = getPropertyHistory(id);
    if (entry) result[id] = entry;
  }

  return result;
}
