import fs from 'fs';
import path from 'path';
import { CachedData, SherifffListing } from '@/types';

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'listings.json');

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/** Load cached listings from disk. Returns null if no cache or expired. */
export function loadCache(): CachedData | null {
  try {
    ensureDir();
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const data: CachedData = JSON.parse(raw);
    return data;
  } catch (err) {
    console.error('[cache] Failed to load:', err);
    return null;
  }
}

/** Save listings to disk cache. */
export function saveCache(listings: SherifffListing[]): void {
  try {
    ensureDir();
    const data: CachedData = {
      listings,
      fetchedAt: new Date().toISOString(),
      version: 1,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log('[cache] Saved', listings.length, 'listings to disk');
  } catch (err) {
    console.error('[cache] Failed to save:', err);
  }
}

/** Delete the cache file to force a full resync. */
export function clearCache(): void {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
      console.log('[cache] Cleared');
    }
  } catch (err) {
    console.error('[cache] Failed to clear:', err);
  }
}
