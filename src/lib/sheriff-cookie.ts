import * as cheerio from 'cheerio';

const SHERIFF_BASE = process.env.SHERIFF_BASE_URL ?? 'https://sheriffsaleviewer.polkcountyiowa.gov';

interface SheriffSession {
  cookie: string;
  verificationToken: string | null;
}

let cached: SheriffSession | null = null;
let cachedAt = 0;
const MAX_AGE_MS = 10 * 60 * 1000; // refresh every 10 minutes

/**
 * Visits the sheriff site homepage, grabs the Set-Cookie header and
 * any antiforgery/verification token from the HTML. Caches for 10 min.
 */
export async function getSheriffSession(): Promise<SheriffSession> {
  if (cached && Date.now() - cachedAt < MAX_AGE_MS) {
    return cached;
  }

  try {
    const res = await fetch(`${SHERIFF_BASE}/`, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    });

    // Extract cookies from Set-Cookie headers
    const setCookieHeader = res.headers.getSetCookie?.() ?? [];
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    const cookieParts: string[] = [];
    for (const raw of cookies) {
      if (raw) {
        const nameValue = raw.split(';')[0].trim();
        if (nameValue) cookieParts.push(nameValue);
      }
    }

    // Parse HTML for verification token
    const html = await res.text();
    const $ = cheerio.load(html);
    const verificationToken =
      $('input[name="__RequestVerificationToken"]').val() as string | undefined ?? null;

    const session: SheriffSession = {
      cookie: cookieParts.length > 0 ? cookieParts.join('; ') : (process.env.SHERIFF_COOKIE ?? ''),
      verificationToken,
    };

    cached = session;
    cachedAt = Date.now();
    console.log('[sheriff-session] Fresh session obtained, cookie parts:', cookieParts.length, 'token:', !!verificationToken);
    console.log('[sheriff-session] Cookies:', session.cookie.substring(0, 80) + '...');
    return session;
  } catch (err) {
    console.error('[sheriff-session] Failed to fetch session:', err);
    return {
      cookie: process.env.SHERIFF_COOKIE ?? '',
      verificationToken: null,
    };
  }
}

/** Invalidate the cache so the next call fetches fresh */
export function clearSheriffSession() {
  cached = null;
  cachedAt = 0;
}
