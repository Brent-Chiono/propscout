import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export interface AppSettings {
  theme: 'dark' | 'light';
  viewMode: 'map' | 'table' | 'grid';
  filters?: {
    status: 'all' | 'active' | 'delayed';
    equityOnly: boolean;
    minAssessed: string;
    maxAssessed: string;
    hasData: boolean;
  };
}

const DEFAULTS: AppSettings = {
  theme: 'dark',
  viewMode: 'map',
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadSettings(): AppSettings {
  try {
    ensureDir();
    if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULTS };
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  try {
    ensureDir();
    const current = loadSettings();
    const merged = { ...current, ...settings };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  } catch (err) {
    console.error('[settings] Failed to save:', err);
    return loadSettings();
  }
}
