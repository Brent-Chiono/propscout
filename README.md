# Polk County Sheriff Sale Viewer

A Next.js rewrite of the Angular sheriff sale viewer for Polk County, Iowa.  
Displays active foreclosure properties on a Google Map with parcel and judgment data.

## What it does

- Fetches active listings from the Polk County Sheriff Sale Viewer
- Geocodes each property address via Google Maps Geocoding API
- Drops markers on an interactive map (red = active, yellow = delayed)
- Clicking a marker shows a street view photo, address link, and approximate judgment amount
- Pulls parcel PIN data from the Polk County tax search
- Clean searchable/sortable table with pagination — no jQuery or DataTables

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── fetch-sheriff/route.ts       # Proxies POST to sheriff site
│   │   ├── sheriff-details/[id]/route.ts # Scrapes judgment amount (Cheerio)
│   │   ├── parcel-details/[addr]/route.ts# Polk County tax parcel lookup
│   │   └── geocode/route.ts             # Server-side geocoding (keeps key off client)
│   ├── layout.tsx
│   ├── page.tsx                         # Main orchestration page
│   └── globals.css
├── components/
│   ├── PropertyMap.tsx                  # Google Maps with markers & info windows
│   └── PropertyTable.tsx                # Custom React table (no deps)
├── lib/
│   ├── address.ts                       # Address normalization + date formatting
│   ├── geocode.ts                       # Server-side geocoding utility
│   └── useGoogleMaps.ts                 # Hook: loads Maps JS API once
└── types/index.ts
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Required — used client-side for the map widget and server-side for geocoding
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here

# Optional — use a separate restricted server-side key for geocoding API calls
# If not set, falls back to NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
GOOGLE_MAPS_SERVER_API_KEY=your_server_key_here

# Base URLs (defaults work, but override if the county changes them)
SHERIFF_BASE_URL=https://sheriffsaleviewer.polkcountyiowa.gov
TAX_SEARCH_BASE_URL=https://taxsearch.polkcountyiowa.gov

# Antiforgery cookie for the sheriff site
# Get this by opening DevTools on the sheriff site and copying the cookie header
SHERIFF_COOKIE=.AspNetCore.Antiforgery.9r3Ldye5ReY=your_value_here
```

### 3. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Production build

```bash
npm run build
npm start
```

## Notes on the sheriff site cookie

The sheriff sale viewer uses an ASP.NET antiforgery cookie. This value rotates
occasionally. If listings stop loading, grab a fresh cookie value:

1. Open [https://sheriffsaleviewer.polkcountyiowa.gov](https://sheriffsaleviewer.polkcountyiowa.gov) in your browser
2. Open DevTools → Network tab → click any request to the site
3. Copy the `cookie:` header value
4. Paste it into `SHERIFF_COOKIE` in your `.env.local`

## Google Maps API key

Your key needs these APIs enabled in Google Cloud Console:
- **Maps JavaScript API** (for the map widget)
- **Geocoding API** (for address → coordinates)
- **Street View Static API** (for the street view thumbnail in info windows)

For best security, create two keys:
- One with HTTP referrer restrictions for `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- One with IP restrictions (your server IP) for `GOOGLE_MAPS_SERVER_API_KEY`
