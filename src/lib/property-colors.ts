/**
 * Generate a distinct, vibrant color for each property based on its ID.
 * Uses MurmurHash3-like mixing for better distribution, then golden angle.
 */

const GOLDEN_ANGLE = 137.508;

function mixHash(h: number): number {
  // MurmurHash3 finalizer — much better avalanche than djb2
  h = ((h ^ (h >>> 16)) * 0x85ebca6b) | 0;
  h = ((h ^ (h >>> 13)) * 0xc2b2ae35) | 0;
  h = (h ^ (h >>> 16)) | 0;
  return Math.abs(h);
}

export function getPropertyColor(propertyId: string): string {
  let hash = 0;
  for (let i = 0; i < propertyId.length; i++) {
    hash = ((hash << 5) - hash + propertyId.charCodeAt(i)) | 0;
  }
  const mixed = mixHash(hash);
  const hue = (mixed * GOLDEN_ANGLE) % 360;
  // Vary saturation and lightness slightly for more uniqueness
  const sat = 65 + (mixed % 20); // 65-84%
  const lit = 48 + (mixed % 15); // 48-62%
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

export function getPropertyColorHex(propertyId: string): string {
  const hsl = getPropertyColor(propertyId);
  const match = hsl.match(/hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
  if (!match) return '#e8a838';
  const h = parseFloat(match[1]) / 360;
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
