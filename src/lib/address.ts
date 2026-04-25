/**
 * Normalizes a property address for the Polk County tax search API.
 * Returns TWO variants to try - abbreviated and expanded directions -
 * because the tax search is inconsistent about which form it accepts.
 */
export function normalizeAddressForTaxSearch(address: string): string {
  return cleanAddress(address);
}

export function getAddressVariants(address: string): string[] {
  const base = cleanAddress(address);
  const expanded = expandDirections(base);
  // Return both - try abbreviated first, then expanded
  if (expanded !== base) {
    return [base, expanded];
  }
  return [base];
}

function cleanAddress(address: string): string {
  let a = address;

  // Strip city, state, zip after comma
  a = a.replace(/,.*$/, '').trim();

  // Strip city name + state if no comma (e.g. "123 Main St DES MOINES IA 50317")
  // Match common Iowa city names at the end
  a = a.replace(/\s+(DES MOINES|ANKENY|URBANDALE|WEST DES MOINES|CLIVE|JOHNSTON|WAUKEE|ALTOONA|PLEASANT HILL|BONDURANT|CARLISLE|PRAIRIE CITY|GRIMES|POLK CITY|NORWALK|MITCHELLVILLE|RUNNELLS|ELKHART)\s*(IA|IOWA)?\s*\d{0,5}.*$/i, '').trim();

  // Strip trailing zip if still present
  a = a.replace(/\s+\d{5}(-\d{4})?$/, '').trim();

  // Replace non-word chars with '+' for query string
  a = a.replace(/\W+/g, '+').replace(/\+$/, '');

  return a;
}

function expandDirections(normalized: string): string {
  let a = normalized;
  // Expand single-letter and two-letter directions to full words
  // Order matters: compound before single
  a = a.replace(/\+NW\+/g, '+Northwest+');
  a = a.replace(/\+NE\+/g, '+Northeast+');
  a = a.replace(/\+SW\+/g, '+Southwest+');
  a = a.replace(/\+SE\+/g, '+Southeast+');
  a = a.replace(/\+N\+/g, '+North+');
  a = a.replace(/\+S\+/g, '+South+');
  a = a.replace(/\+E\+/g, '+East+');
  a = a.replace(/\+W\+/g, '+West+');
  return a;
}

/**
 * Formats a date string to "Apr 7th, 2026"
 * Handles: "4/7/2026", "2022-12-13T00:00:00", "12/13/2022"
 */
export function formatSaleDate(dateStr: string): string {
  if (!dateStr) return '—';

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let month: number, day: number, year: number;

  if (dateStr.includes('/')) {
    // "M/D/YYYY" format
    const parts = dateStr.split('/');
    month = parseInt(parts[0], 10);
    day = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else if (dateStr.includes('-')) {
    // "YYYY-MM-DDT..." ISO format
    const [y, m, dayTime] = dateStr.split('-');
    year = parseInt(y, 10);
    month = parseInt(m, 10);
    day = parseInt(dayTime.split('T')[0], 10);
  } else {
    return dateStr; // unknown format, return as-is
  }

  if (isNaN(month) || isNaN(day)) return '—';
  const suffix = ordinalSuffix(day);
  return `${months[month - 1]} ${day}${suffix}`;
}

function ordinalSuffix(d: number): string {
  if (d > 3 && d < 21) return 'th';
  switch (d % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
