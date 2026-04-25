export interface DocSection {
  id: string;
  title: string;
  tags: string[];
  category: 'auctions' | 'taxsales' | 'both';
  content: string;
}

export const DOCS: DocSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    tags: ['basics', 'overview'],
    category: 'both',
    content: `The Polk County Investor is a real estate analytics platform with two investment strategies: **Sheriff Auctions** (foreclosure properties) and **Tax Sales** (delinquent tax certificates). Switch between them using the tabs at the top.

**How it works:**
1. The app fetches listings from Polk County public sources
2. Each property is geocoded (mapped) using Google Maps
3. Properties are enriched with data from the County Assessor, Treasurer, FEMA, Census, HUD, EPA, and NWI
4. All data is cached locally and displayed in three view modes: Map, Grid, and Table

**First load:** On your first visit, the app will fetch all current listings and begin enriching them in the background. This can take a few minutes. You'll see progress bars showing progress.

**Resync / Refresh:** Click the Resync button to clear cache and re-fetch everything. Or click the refresh button (↻) on any individual property to re-fetch just that one.

**Downloads:** Click the Download button to export data as JSON — individual datasets or all combined. Click PDF on any property for a printable report.

**AI Features:** Click "Analyze" on any property for AI investment analysis with follow-up chat. Click "AI Top Picks" for AI-ranked recommendations. Configure AI providers in Settings.`,
  },
  {
    id: 'views',
    title: 'View Modes',
    tags: ['basics', 'navigation', 'map', 'grid', 'table'],
    category: 'both',
    content: `The app offers three ways to browse properties:

**Map View**
- Interactive Google Map centered on Polk County
- Red dots = Active sales, Yellow dots = Delayed/postponed sales
- Click any dot to see a popup with street view, address, judgment amount, and parcel PIN
- The map follows the site's light/dark theme setting

**Grid View**
- Card-based layout with a street view photo for each property
- Each card shows: Judgment, Assessed Value, Last Sale, Taxes Owed, Equity, Sqft, Year Built
- Active/Delayed badge on each card
- Click any card to open the detail panel

**Table View**
- Spreadsheet-style sortable table with all properties
- Columns: Ref #, Sale Date, Address, Assessed Value, Last Sale, Taxes, Equity, Delayed status
- Click any column header to sort ascending/descending
- Built-in search box to filter by address, reference number, or property ID
- Paginated at 15 rows per page`,
  },
  {
    id: 'filters',
    title: 'Filters',
    tags: ['navigation', 'search', 'filters'],
    category: 'both',
    content: `The filter bar at the top of the page lets you narrow down which properties are displayed across all views.

**Status** — Filter by sale status:
- All: Show everything
- Active Only: Properties with a confirmed upcoming sale date
- Delayed Only: Properties whose sale has been postponed

**Risk Level** — Filter by lien position risk (based on plaintiff analysis):
- Low: First mortgage holder (bank, mortgage company) — typical foreclosure
- Medium: Unknown or unclassifiable plaintiff
- High: Second mortgage, HELOC, HOA, tax lien, or other junior lien — more complexity

**Beds / Baths** — Set minimum bedroom or bathroom count. Properties without assessor data will be hidden when these filters are active.

**Assessed Value** — Set a min and/or max assessed value range. Useful for targeting a specific price range.

**Judgment Amount** — Set a min and/or max for the approximate judgment (the amount owed by the borrower). This is the starting point for bidding at the sheriff sale.

**Positive Equity** — Toggle to only show properties where assessed value exceeds the judgment amount. Properties with negative equity may still be good deals but carry more risk.

**Has Data** — Toggle to only show properties that have been fully enriched with assessor data. Hides any listings that haven't been processed yet.

**Clear** — Reset all filters to defaults.`,
  },
  {
    id: 'property-detail',
    title: 'Property Detail Panel',
    tags: ['property', 'detail', 'analysis'],
    category: 'auctions',
    content: `Click any property (on the map, in the grid, or in the table) to open the detail panel.

**Image Tabs** — Toggle between Street View and Map at the top.

**Header Buttons:**
- PDF: Generate a printable report with all property data, images, and map
- ↻: Refresh all data for this specific property (re-fetches assessor, taxes, environmental, flood, census, etc.)
- ?: Open documentation
- x: Close panel

**Cross-Links** — If this property also appears in Tax Sales (or vice versa), a red banner shows at the top linking to the other record.

**Quick Links:**
- Sheriff Sale Page, Google Street View, Tax Search

**Favorites & Notes:**
- Favorite: Star properties you're interested in
- Skip: Mark properties you've evaluated and decided to pass on
- Notes: Free-text area for personal notes about the property (auto-saved)

**AI Property Chat** — Click Analyze for a full investment analysis, then ask follow-up questions. AI has full context of all property data including your notes.`,
  },
  {
    id: 'lien-analysis',
    title: 'Lien Position Analysis',
    tags: ['property', 'analysis', 'risk', 'lien'],
    category: 'auctions',
    content: `The Lien Position Analysis section estimates the foreclosing party's lien position based on the plaintiff's name.

**Plaintiff** — The entity filing the foreclosure (shown on the sheriff sale listing).

**Estimated Position:**
- 1st Mortgage: The plaintiff is likely the primary mortgage holder (bank, mortgage servicer). This is the most common and cleanest type of foreclosure for investors.
- 2nd Mortgage: The plaintiff appears to be a junior lienholder (HELOC, home equity loan, credit union). These are riskier because the first mortgage still needs to be paid.

**Risk Level:**
- LOW: Major banks and known first-mortgage lenders (Wells Fargo, Chase, PennyMac, Nationstar, etc.)
- MEDIUM: Unrecognized or ambiguous plaintiff names
- HIGH: Credit unions, HOAs, tax authorities, HELOC lenders, or other junior lienholders

**Why this matters:** If a 2nd mortgage holder forecloses, the winning bidder at the sheriff sale takes the property SUBJECT TO the 1st mortgage. This means you'd owe the remaining balance of the first mortgage on top of your winning bid. Always verify lien position through a title search before bidding.`,
  },
  {
    id: 'financial-summary',
    title: 'Financial Summary',
    tags: ['property', 'financials', 'judgment', 'equity', 'assessed'],
    category: 'auctions',
    content: `**Judgment** — The approximate judgment amount from the court case. This is typically the total amount owed by the borrower (principal + interest + fees). At a sheriff sale, bidding generally starts at or around the judgment amount.

**Assessed Value** — The county assessor's estimated total property value (land + building). This is NOT market value — it's typically 80-100% of estimated market value in Iowa. Use as a rough guideline, not a precise appraisal.

**Outstanding Taxes** — Total property taxes owed, including any unredeemed tax sale certificates. This amount must be resolved at or after closing.

**Last Sale** — The most recent recorded sale price and date from the county assessor's records. Useful for understanding the property's price trajectory.

**Equity Estimate** — Calculated as: Assessed Value - Judgment Amount. Positive equity suggests the property may be worth more than what's owed. Negative equity means the judgment exceeds the assessed value.

**Parcel PIN** — The unique parcel identification number used by Polk County. This is used to look up the property across county systems (assessor, treasurer, recorder).`,
  },
  {
    id: 'tax-details',
    title: 'Tax Details',
    tags: ['property', 'taxes', 'tax-sale', 'treasurer'],
    category: 'auctions',
    content: `Tax data is scraped from the Polk County Treasurer's website (taxsearch.polkcountyiowa.gov).

**Total Taxes Due** — The total amount of unpaid property taxes across all years.

**Delinquent Years** — Which tax years have outstanding balances.

**UNREDEEMED TAX SALE badge** — If present, this property has a tax sale certificate that hasn't been redeemed. This means:
1. The property owner fell behind on taxes
2. An investor bought the tax debt at the county's annual tax sale
3. The owner has NOT paid back the investor
4. The certificate holder can eventually get a treasurer's deed (transferring ownership)

**Tax Sale Certificate #** — The certificate number assigned at the tax sale.

**Tax Sale Amount** — The amount the investor paid for the tax certificate. This must be paid off (with interest) at closing.

**Tax Sale Year** — The tax year the certificate covers.

**Unpaid Installments** — Breakdown of individual tax installments that remain unpaid, showing year, installment number, amount due, and whether they were sold at tax sale.

**Pay Taxes Online** — Direct link to IowaTaxandTags.org where you can see exact amounts owed including late interest and fees.

**Double-Distressed Properties:** A property showing both a sheriff sale AND an unredeemed tax sale certificate is double-distressed. This means more complexity at closing (tax cert must be paid off) but also indicates a more motivated/desperate situation and potentially higher discounts.`,
  },
  {
    id: 'sale-history',
    title: 'Sale History',
    tags: ['property', 'sales', 'assessor'],
    category: 'auctions',
    content: `The Sale History section shows all recorded property transfers from the Polk County Assessor's records.

Each entry shows:
- **Date** — When the transfer was recorded
- **Price** — The recorded sale price
- **Instrument** — The type of document (Deed, Warranty Deed, Quit Claim, etc.)
- **Seller/Buyer** — Who sold and who bought

**Why this matters:**
- Track price trajectory over time (is the property appreciating or depreciating?)
- Identify frequent flips (multiple sales in short periods may indicate investor activity)
- Spot quit claim deeds (may indicate transfers between family members, which often don't reflect market value)
- Compare last sale price to current judgment amount to understand the equity picture`,
  },
  {
    id: 'flood-zone',
    title: 'Flood Zone',
    tags: ['property', 'flood', 'risk', 'fema'],
    category: 'both',
    content: `Flood zone data comes from FEMA's National Flood Hazard Layer (NFHL).

**Zone** — The FEMA flood zone designation:
- X: Minimal flood risk (most properties in Des Moines)
- B/C: Moderate flood risk
- A, AE, AH: High flood risk (Special Flood Hazard Area)
- D: Undetermined risk

**Flood Risk** — MINIMAL or HIGH RISK badge based on whether the property is in a Special Flood Hazard Area (SFHA).

**Why this matters:**
- Properties in flood zones (A, AE, AH) require mandatory flood insurance if financed
- Flood insurance can cost $1,000-$5,000+ per year, significantly impacting investment returns
- Flood zone properties may have lower resale values and longer days-on-market
- Des Moines has significant flood plains along the Des Moines River and Raccoon River`,
  },
  {
    id: 'neighborhood',
    title: 'Neighborhood / Census Data',
    tags: ['property', 'neighborhood', 'census', 'demographics'],
    category: 'both',
    content: `Census data comes from the US Census Bureau's American Community Survey (ACS) 5-year estimates, matched to the property's census tract.

**Median Income** — Median household income in the surrounding census tract. Higher incomes generally correlate with more stable rental demand and higher property values.

**Median Home Value** — Median owner-occupied home value in the census tract. Compare this to the property's assessed value and judgment amount to gauge relative pricing.

**Median Rent** — Median gross rent (including utilities) in the area. Useful for estimating rental income potential.

**Owner Occupied** — Percentage of housing units that are owner-occupied vs renter-occupied. Higher owner-occupancy often indicates a more stable neighborhood, while higher renter rates suggest stronger rental demand.`,
  },
  {
    id: 'hud-rent',
    title: 'Fair Market Rent (HUD)',
    tags: ['property', 'rent', 'hud', 'investment'],
    category: 'both',
    content: `HUD Fair Market Rent (FMR) data provides the Department of Housing and Urban Development's estimate of what a reasonably-priced rental should cost in the area.

**2 Bedroom / 3 Bedroom** — The FMR for the property's ZIP code. These are the maximum amounts that Section 8 vouchers will cover.

**Why this matters:**
- FMR is a reliable baseline for estimating rental income
- If you plan to accept Section 8 tenants, FMR is the maximum rent HUD will subsidize
- Compare FMR to the Census median rent — if FMR is higher, the area may have strong rental demand
- Use these numbers in the ROI Calculator to estimate cash-on-cash returns`,
  },
  {
    id: 'redemption',
    title: 'Redemption Period (Iowa)',
    tags: ['property', 'legal', 'redemption', 'iowa-law'],
    category: 'auctions',
    content: `Iowa law gives property owners a right of redemption after a sheriff sale. During this period, the original owner can pay the full amount to reclaim the property.

**Standard (1 Year)** — The default redemption period is 12 months from the date of the sheriff sale. The owner can redeem by paying the sale price plus interest and costs.

**Reduced (6 Months)** — The redemption period can be reduced to 6 months if the property was abandoned or if the plaintiff requested a shortened period in the court order.

**What this means for investors:**
- You do NOT get immediate possession after winning a sheriff sale
- During the redemption period, the owner can still live in the property
- You cannot start renovations or rent the property until the redemption period expires
- If the owner redeems, you get your money back (plus interest) but lose the property
- Factor the redemption period into your investment timeline and carrying costs`,
  },
  {
    id: 'roi-calculator',
    title: 'ROI Calculator',
    tags: ['property', 'investment', 'roi', 'calculator'],
    category: 'auctions',
    content: `The ROI Calculator helps estimate your potential return on a sheriff sale property.

**Inputs:**
- Offer Price: What you plan to bid (start with the judgment amount)
- Days to Close: Estimated time to close, renovate, and either rent or resell
- Closing Costs: Estimated closing costs (title search, recording fees, etc.)

**Outputs:**
- Total Investment: Offer price + closing costs + outstanding taxes
- Estimated monthly rental income (based on HUD FMR data)
- Cash-on-cash return projection

**Tips:**
- Always budget for repairs — sheriff sale properties are sold AS-IS with no inspections
- Factor in the redemption period (6-12 months) as carrying costs
- Include property taxes, insurance, and property management fees in your analysis
- Be conservative with rental estimates — use 80% of FMR to account for vacancies`,
  },
  {
    id: 'environmental',
    title: 'Environmental & Contamination',
    tags: ['property', 'environmental', 'epa', 'superfund', 'risk'],
    category: 'both',
    content: `Environmental data comes from three EPA databases, queried by the property's coordinates.

**EPA ECHO (Enforcement & Compliance History)** — Searches for EPA-regulated facilities within 1 mile. Shows:
- Number of regulated facilities nearby
- Active violation flags (Clean Air, Clean Water, RCRA, TRI)
- Total penalties assessed

**Superfund/NPL (National Priorities List)** — Searches for the most contaminated sites in the US within ~2 miles. If a Superfund site is nearby, this is a HIGH environmental risk — potential cleanup liability if you acquire the property.

**TRI (Toxic Release Inventory)** — Facilities that release toxic chemicals, within ~2 miles.

**Risk Levels:**
- LOW — No significant concerns. A few regulated facilities nearby is normal.
- MEDIUM — Active EPA violations or significant penalties nearby, or many TRI facilities.
- HIGH — Superfund site nearby. Major contamination risk. Avoid unless deeply discounted.

**Why this matters for investors:** If you acquire a contaminated property (especially via tax deed), you may inherit cleanup liability under CERCLA/Superfund law. This can cost hundreds of thousands of dollars. Always check environmental status before buying.`,
  },
  {
    id: 'wetlands',
    title: 'Wetlands',
    tags: ['property', 'wetlands', 'environmental', 'nwi'],
    category: 'both',
    content: `Wetlands data comes from the USFWS National Wetlands Inventory (NWI).

If a property is on or adjacent to a wetland area, a blue "WETLAND AREA" badge appears. Wetland types include:
- Freshwater Emergent Wetland (marshes, wet meadows)
- Freshwater Forested/Shrub Wetland (swamps)
- Freshwater Pond, Riverine (streams), Lake

**Why this matters:** Properties on wetlands have:
- Severe building restrictions (federal and state permits required)
- Potential flooding/drainage issues
- Lower development value
- Environmental protection regulations

Not all wetland-adjacent properties are unbuildable, but it significantly complicates development and should be factored into your valuation.`,
  },
  {
    id: 'special-assessments',
    title: 'Special Assessments',
    tags: ['property', 'taxes', 'assessments', 'liens'],
    category: 'both',
    content: `Special assessments are taxes levied for specific improvements (sewer, road, sidewalk, etc.) that benefit a property. They're separate from regular property taxes.

Data comes from the Polk County Treasurer's Special Assessment section.

**What's shown:**
- Year and project name
- Amount due per assessment
- Total special assessments owed

**Why this matters:** Special assessments are additional costs on top of regular taxes and the purchase price. They must be paid by the property owner and survive most ownership transfers. Factor these into your total acquisition cost.`,
  },
  {
    id: 'liens-records',
    title: 'Liens & Records Lookup',
    tags: ['property', 'liens', 'records', 'manual'],
    category: 'both',
    content: `Some lien data requires manual lookup through external systems:

**Iowa Land Records** (iowalandrecords.org) — Free account required.
- Mechanic's liens (contractor unpaid work)
- Judgment liens
- Mortgage documents
- HOA liens (not specifically categorized — search by HOA name)

**Iowa Courts** (iowacourts.state.ia.us) — Free, no account needed.
- Judgment liens from court cases
- Pending litigation (lis pendens)

**EPA ECHO Facility Search** — Pre-filled link to search EPA facility records by address.

Each property detail panel includes direct links to these services. For serious investment targets, always do a manual title search through these resources before bidding.`,
  },
  {
    id: 'pdf-reports',
    title: 'PDF Reports & Downloads',
    tags: ['tools', 'pdf', 'download', 'export'],
    category: 'both',
    content: `**PDF Reports:** Click the PDF button in any property's detail panel header to generate a printable report. The report includes:
- Street view and map images
- All financial data (judgment/tax amount, assessed value, equity)
- Property details (year built, sqft, beds/baths)
- Sale history (up to 15 records with seller, buyer, date, price)
- Risk factors (flood zone, environmental, wetlands, special assessments, tax sale certs)
- Neighborhood demographics
- HUD Fair Market Rent

The report opens in a new window — use your browser's print dialog to save as PDF or print.

**JSON Downloads:** Click the Download button in the header for:
- Auction Listings — all enriched sheriff sale data
- Tax Sale Listings — all enriched tax sale data
- Notes — your personal notes, favorites, and skips
- Auction History — sale date change tracking
- All Data (Combined) — everything in one file

All downloads are dated JSON files (e.g., auction-listings-2026-04-07.json).`,
  },
  {
    id: 'data-sources',
    title: 'Data Sources',
    tags: ['technical', 'data', 'sources'],
    category: 'both',
    content: `The app aggregates data from these public sources:

**Polk County Sheriff's Office** — sheriffsaleviewer.polkcountyiowa.gov
- Property listings, sale dates, plaintiffs, defendants, judgment amounts
- Updated when new sales are posted or existing ones are postponed

**Polk County Assessor** — assess.co.polk.ia.us
- Assessed values (land + building), property class, year built, sqft, bedrooms, bathrooms
- Complete sale history (all recorded transfers with dates, prices, buyer/seller)

**Polk County Treasurer** — taxsearch.polkcountyiowa.gov
- Outstanding property taxes, payment history, tax installment details
- Tax sale certificate information (unredeemed tax sales)

**FEMA National Flood Hazard Layer** — hazards.fema.gov
- Flood zone designations, Special Flood Hazard Area status

**US Census Bureau (ACS 5-Year)** — census.gov
- Median household income, median home value, median rent, owner-occupancy rates

**HUD Fair Market Rent** — huduser.gov
- Fair Market Rent by ZIP code (2-bedroom and 3-bedroom rates)

**Google Maps** — maps.googleapis.com
- Geocoding (address to lat/lng), Street View imagery, Static Maps

**EPA ECHO** — echodata.epa.gov
- Enforcement & compliance history, violations, penalties for nearby facilities

**EPA Superfund/NPL** — geodata.epa.gov
- National Priorities List contaminated sites

**EPA TRI** — geodata.epa.gov
- Toxic Release Inventory facilities

**USFWS Wetlands** — fws.gov/wetlandsmapservice
- National Wetlands Inventory (NWI) spatial data

**Polk County Tax Sale** — taxsale.polkcountyiowa.gov
- Delinquent tax parcel lists (Regular Sale, Public Bidder, Public Nuisance)

**Rentcast** — api.rentcast.io (optional, requires API key)
- Property-specific rent and value estimates with comparable properties`,
  },
  {
    id: 'settings',
    title: 'Settings & AI Configuration',
    tags: ['settings', 'ai', 'configuration'],
    category: 'both',
    content: `**Theme** — Toggle between light and dark mode using the sun/moon button in the header. Your preference is saved automatically.

**AI Provider Settings** (Settings page)
The Settings page allows you to configure AI providers for the documentation Q&A assistant. Supported providers:

- **Anthropic (Claude)** — Uses the Anthropic Messages API. Requires an API key from console.anthropic.com
- **Ollama (Local)** — Runs locally on your machine. No API key needed, just set the base URL (default: http://localhost:11434) and model name
- **Gemini** — Google's Gemini models via the OpenAI-compatible API. Requires an API key from ai.google.dev
- **Custom (OpenAI-compatible)** — Any OpenAI-compatible API endpoint. Set your API key, model, and base URL

**Security:** All API keys are encrypted using AES-256-GCM before being stored on disk. The encryption key is set in your .env file (SETTINGS_ENCRYPTION_KEY). Keys are never sent to the client — only masked versions (last 4 characters) are shown in the UI.`,
  },
  {
    id: 'tips',
    title: 'Tips for Sheriff Sale Investors',
    tags: ['investment', 'tips', 'strategy'],
    category: 'auctions',
    content: `**Before the sale:**
- Always do a title search to verify lien position and find any other encumbrances
- Drive by the property (or use Street View) to assess condition
- Check for code violations, open permits, and HOA liens
- Review the tax status — unredeemed tax sale certificates add complexity and cost
- Understand the redemption period and factor it into your budget

**At the sale:**
- Bidding starts at or near the judgment amount
- You typically need cash or certified funds — no financing contingencies
- Properties are sold AS-IS with no warranties or inspections
- The highest bidder wins, but the lender may credit bid (bid their own debt)

**After the sale:**
- The 6-12 month redemption period begins
- You cannot take possession until the redemption period expires (unless abandoned)
- File the sheriff's deed promptly
- Start your title insurance process
- Budget for repairs, back taxes, and carrying costs

**Red flags to watch for:**
- 2nd mortgage foreclosures (plaintiff is a credit union, HELOC lender, or HOA)
- Unredeemed tax sale certificates (adds cost and complexity)
- Flood zone properties (mandatory insurance, lower values)
- Properties with multiple postponements (may indicate legal complications)
- Negative equity (judgment exceeds assessed value)`,
  },
  {
    id: 'glossary',
    title: 'Glossary',
    tags: ['reference', 'glossary', 'definitions'],
    category: 'both',
    content: `**Assessed Value** — The county's estimated value of a property for tax purposes. In Iowa, this is typically close to market value but may lag behind rapid price changes.

**Credit Bid** — When the foreclosing lender bids their own debt at the sheriff sale instead of cash. If no one outbids them, they take the property back (REO).

**Defendant** — The property owner being foreclosed on.

**Equity** — The difference between a property's value and the total debt against it. Positive equity means the property is worth more than what's owed.

**Geoparcel Number** — A unique identifier for a parcel of land in Polk County's GIS system.

**Judgment** — The court order establishing the amount owed by the borrower and authorizing the sheriff sale.

**Lis Pendens** — A public notice that a lawsuit has been filed affecting a property's title.

**Parcel PIN** — The Property Identification Number used by the county to track parcels across assessor, treasurer, and recorder systems.

**Plaintiff** — The entity that filed the foreclosure lawsuit (usually the mortgage lender or servicer).

**Redemption Period** — The time after a sheriff sale during which the original owner can reclaim the property by paying the sale price plus interest and costs.

**REO (Real Estate Owned)** — Property owned by a lender after an unsuccessful sheriff sale or after the borrower surrendered the property.

**Sheriff Sale** — A public auction of property ordered by a court to satisfy a judgment (usually a mortgage foreclosure).

**Tax Sale Certificate** — A certificate purchased by an investor at the county's annual tax sale, representing the delinquent taxes paid on behalf of the property owner.

**Title Search** — A review of public records to determine the ownership history and any liens, encumbrances, or claims against a property.

**Unredeemed Tax Sale** — A tax sale certificate where the property owner has not yet paid back the investor who purchased it. The investor may eventually apply for a treasurer's deed.`,
  },

  // ===== TAX SALE DOCUMENTATION =====
  {
    id: 'ts-overview',
    title: 'Tax Sale Overview',
    tags: ['basics', 'tax-sale', 'overview'],
    category: 'taxsales',
    content: `Tax sale certificates are a different investment strategy from sheriff auctions. Instead of buying the property itself, you're buying the **tax debt** owed on a property.

**How it works:**
1. Property owner falls behind on property taxes
2. Polk County holds an annual tax sale (3rd Monday in June)
3. Investors bid to pay the delinquent taxes
4. You receive a tax sale certificate earning **2% per month** (24%/year) interest
5. The owner has ~2 years to "redeem" (pay you back + interest)
6. If they don't redeem, you can apply for a Treasurer's Deed to take ownership

**The appeal:** Statutory 24% annual return backed by real property. Most certificates ARE redeemed, giving you a reliable return. If not redeemed, you may acquire the property for just the tax amount.

**Data source:** Delinquent parcel lists from taxsale.polkcountyiowa.gov`,
  },
  {
    id: 'ts-bid-system',
    title: 'Iowa Bid-Down System',
    tags: ['tax-sale', 'bidding', 'critical'],
    category: 'taxsales',
    content: `Iowa uses a unique "bid-down" auction system. This is the most important concept to understand.

**How bidding works:**
- Each parcel starts at **100% undivided interest**
- Bidders compete by accepting a **smaller percentage** of ownership
- The bidder who accepts the **smallest percentage** wins and pays the full delinquent amount
- All bidding is online via GovEase.com

**Why this matters:**
- If you win at **100%** and the owner doesn't redeem, your tax deed conveys FULL ownership
- If you win at **80%**, you'd only get 80% ownership — making you a co-owner with the delinquent owner
- Anything below 100% creates a nightmare scenario requiring a partition action in court

**Strategy:** Always target 100%. If competition drives it below 95%, walk away. The 2%/month interest is the same regardless of your bid percentage — there's zero upside to bidding lower.

**Below 100% problems:**
- Can't sell without other owner's agreement
- Can't rent exclusively
- Need expensive partition action ($3-5K+ legal fees)
- The delinquent co-owner gets their percentage of any forced sale proceeds — for free`,
  },
  {
    id: 'ts-returns',
    title: 'Interest & Returns',
    tags: ['tax-sale', 'returns', 'interest'],
    category: 'taxsales',
    content: `**Statutory Rate:** 2% per month on the amount paid at sale — set by Iowa law, not by auction.

**Annual Return:** 24% simple interest (not compounded)

**What earns interest:**
- Your original purchase amount at the tax sale
- Any subsequent years' taxes you pay on the property (you can do this starting 1 month + 14 days after a subsequent installment becomes delinquent)

**Fees:** $20 certificate fee + $20 redemption fee

**When you get paid:** The owner redeems by paying the county treasurer in a single lump sum:
- Your original purchase price
- 2% monthly interest
- Any subsequent taxes you paid (+ their 2% monthly interest)
- Your out-of-pocket costs for record searches and certified mail
- No partial payments allowed — must be full redemption

**Investment Quick Math shown in the detail panel:**
- Monthly Return: your investment × 2%
- Annual Return: your investment × 24%
- If Redeemed at 2 years: your investment + (investment × 2% × 24 months)
- Safety Margin: assessed value ÷ tax amount (higher = safer)`,
  },
  {
    id: 'ts-redemption',
    title: 'Redemption & Deed Timeline',
    tags: ['tax-sale', 'redemption', 'deed', 'timeline'],
    category: 'taxsales',
    content: `**Standard Timeline:**
- **21 months** after sale: You can serve a Notice of Right of Redemption
- **90 days** after notice: Owner's final chance to redeem
- **Total: ~2 years** before you can get a Treasurer's Deed

**Shortened Timelines:**
- **Public Bidder parcels** (unsold at auction): Notice after 9 months, deed possible at ~12 months
- **Municipal Abandoned Property:** Notice after 3 months, deed at ~6 months

**Notice Requirements (Iowa Code 447.9):**
Must serve via BOTH regular and certified mail to:
- Property owner
- Mortgage holders of record
- Contract sellers of record
- Lessees of record
- Any other recorded interest holders

If unreachable by mail, publication in a county newspaper is required.

**After the deed:** The Treasurer's Tax Deed transfers ownership of your bid percentage. A 100% bid = full ownership. Title may need to be "quieted" through a quiet title action for full marketability.`,
  },
  {
    id: 'ts-risks',
    title: 'Tax Sale Risks',
    tags: ['tax-sale', 'risk', 'due-diligence'],
    category: 'taxsales',
    content: `**Bid-Down Risk (Most Critical):**
Competition can drive your winning bid below 100%, leaving you with fractional ownership. A co-ownership situation with a delinquent taxpayer is expensive and messy to resolve.

**Federal Tax Liens:**
The IRS has a 120-day right of redemption after a tax sale. Federal tax liens may survive a tax deed unless proper notice was given. Always check PACER for federal liens.

**Bankruptcy:**
If the owner files bankruptcy, the automatic stay halts your proceedings. The court can extend the redemption period. Your capital could be locked up for years.

**Worthless Property:**
You're buying debt secured by property. If the property is contaminated, condemned, or worth less than the taxes, you may never recover your investment.

**Environmental Liability:**
If you get a tax deed on a contaminated commercial/industrial property, YOU may inherit cleanup liability under CERCLA.

**Capital Lockup:**
Your money is tied up for potentially 2+ years with no liquidity. Plan accordingly.

**Subsequent Tax Payments:**
To protect your certificate, you may need to pay the next year's delinquent taxes too — increasing your capital at risk.`,
  },
  {
    id: 'ts-due-diligence',
    title: 'Due Diligence Checklist',
    tags: ['tax-sale', 'due-diligence', 'checklist'],
    category: 'taxsales',
    content: `Before buying ANY tax sale certificate, check:

1. **Drive by the property** — Is it occupied? Vacant? Demolished? What condition?
2. **Assessed value vs tax amount** — The ratio is your safety margin. Higher = safer. A $200K property with $2K in delinquent taxes = 100x safety margin (excellent). A $5K property with $3K in taxes = 1.7x (dangerous).
3. **Title search** — Check for federal tax liens (IRS), state liens, mortgages, mechanic's liens, HOA liens
4. **Bankruptcy search** — Check PACER for owner bankruptcy filings
5. **Environmental records** — For commercial/industrial: Iowa DNR + EPA databases
6. **Zoning & code violations** — Open violations = cost if you get the deed
7. **Flood zone** — Properties in A/AE zones have limited value and require flood insurance
8. **Property type** — Real estate is safer than mobile homes (mobile homes depreciate)
9. **Sale type** — Regular Sale = most competition. Public Bidder = less competition, shorter timeline. Public Nuisance = highest risk, fastest deed.
10. **Ownership history** — Multiple quit claims or recent transfers can signal problems`,
  },
  {
    id: 'ts-sale-types',
    title: 'Sale Types Explained',
    tags: ['tax-sale', 'sale-types'],
    category: 'taxsales',
    content: `Each parcel is categorized by sale type, area, and property type:

**Sale Types:**
- **Regular Sale** (green tag) — Standard tax sale. Most parcels. Competitive bidding with other investors. 21-month wait before deed notice.
- **Public Bidder** (yellow tag) — Parcels that did NOT sell to private bidders at the regular sale. Less competition. County buys these as "public bidder." Shorter timeline — deed notice after 9 months.
- **Public Nuisance** (red tag) — Parcels declared public nuisances. Fastest path to deed (as short as 3-6 months). Usually the worst properties — condemned, abandoned, or hazardous.

**Areas:**
- **City** — Within incorporated city limits (Des Moines, Ankeny, etc.)
- **Township** — Unincorporated rural/suburban areas

**Property Types:**
- **Real Estate (RE)** — Land and buildings. Safer investment. Assessor data available.
- **Mobile Home (MH)** — Personal property, not real estate. Depreciating asset. Assessor data often unavailable. Higher risk.`,
  },
  {
    id: 'ts-resources',
    title: 'Tax Sale Resources & Links',
    tags: ['tax-sale', 'resources', 'links'],
    category: 'taxsales',
    content: `**Polk County Resources:**
- Delinquent Parcel List: taxsale.polkcountyiowa.gov
- Buyer Information: polkcountyiowa.gov/treasurer/information-for-tax-sale-buyers/
- Tax Search (property lookup): taxsearch.polkcountyiowa.gov
- GovEase (online bidding): govease.com

**Iowa Legal References:**
- Iowa Code Chapter 446 — Tax Sales
- Iowa Code Chapter 447 — Tax Redemption
- Iowa Code Chapter 448 — Tax Deeds

**Key Dates:**
- **Annual Sale:** 3rd Monday in June
- **Owner Deadline:** Friday before the sale (5pm) to pay and remove parcel
- **Registration:** Via GovEase.com, ~$37-40 fee, allow 24-48hr for approval
- **Payment:** Within 24 hours of winning via eCheck/ACH

**Contact:** Polk County Treasurer, 111 Court Ave, Des Moines. Phone: 515-286-3060`,
  },
];

// Plain text version for AI context — filtered by category
export const DOCS_TEXT = `${DOCS.map(d => `## ${d.title}\n\n${d.content}`).join('\n\n---\n\n')}`;
export const AUCTION_DOCS_TEXT = `${DOCS.filter(d => d.category === 'auctions' || d.category === 'both').map(d => `## ${d.title}\n\n${d.content}`).join('\n\n---\n\n')}`;
export const TAXSALE_DOCS_TEXT = `${DOCS.filter(d => d.category === 'taxsales' || d.category === 'both').map(d => `## ${d.title}\n\n${d.content}`).join('\n\n---\n\n')}`;
