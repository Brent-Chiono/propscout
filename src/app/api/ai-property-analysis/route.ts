import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { decrypt } from '@/lib/crypto';

const SETTINGS_FILE = join(process.cwd(), 'data', 'ai-settings.json');

interface ProviderConfig {
  provider: string;
  label: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  enabled: boolean;
}

function getActiveProvider(): ProviderConfig | null {
  if (!existsSync(SETTINGS_FILE)) return null;
  try {
    const raw = readFileSync(SETTINGS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const providers = (data.providers || []).map((p: any) => {
      let apiKey = '';
      if (p.apiKey) {
        try { apiKey = decrypt(p.apiKey); } catch { apiKey = p.apiKey; }
      }
      return { ...p, apiKey };
    });
    return providers.find((p: ProviderConfig) => p.enabled && (p.apiKey || p.provider === 'ollama')) || null;
  } catch {
    return null;
  }
}

async function callProvider(provider: ProviderConfig, systemPrompt: string, userMessage: string): Promise<string> {
  switch (provider.provider) {
    case 'anthropic': {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': provider.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: provider.model, max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.content?.[0]?.text || '';
    }
    case 'ollama': {
      const base = provider.baseUrl || 'http://localhost:11434';
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: provider.model, stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.message?.content || '';
    }
    case 'gemini': {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${provider.apiKey}` },
        body: JSON.stringify({
          model: provider.model, max_tokens: 2048,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }
    default: {
      const base = provider.baseUrl || 'https://api.openai.com/v1';
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${provider.apiKey}` },
        body: JSON.stringify({
          model: provider.model, max_tokens: 2048,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }
  }
}

function fmt$(val?: number | null): string {
  if (val == null) return 'N/A';
  return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export async function POST(req: Request) {
  try {
    const { listing, notes } = await req.json();
    if (!listing) return NextResponse.json({ error: 'listing required' }, { status: 400 });

    const provider = getActiveProvider();
    if (!provider) {
      return NextResponse.json({ error: 'No AI provider configured. Go to Settings to add one.' }, { status: 400 });
    }

    const judgmentNum = listing.approxJudgment
      ? parseFloat(listing.approxJudgment.replace(/[$,\s]/g, ''))
      : null;

    const systemPrompt = `You are a real estate investment analyst specializing in Iowa sheriff sale foreclosures. You provide direct, actionable analysis for investors. Be specific with numbers and recommendations. Use plain language. Structure your response with clear sections using ** for headers.

Key Iowa-specific context:
- Iowa has a 6-12 month redemption period after sheriff sale
- Properties are sold AS-IS with no inspections allowed
- First mortgage foreclosures are cleanest; second mortgage/HELOC/HOA foreclosures mean the first mortgage survives
- Tax sale certificates are a NEGATIVE factor — they mean an investor already paid the delinquent taxes and holds a lien. The buyer at sheriff sale must pay off the tax cert (amount + 2%/month interest in Iowa) on top of their bid. Always factor tax sale cert amounts into total acquisition cost.
- Assessed value in Iowa is typically close to market value but can lag
- Bidding typically starts at or near the judgment amount

TOTAL ACQUISITION COST must include ALL of the following (not just the bid):
1. Winning bid amount
2. Outstanding property taxes / tax sale cert payoff (+ 2%/month interest)
3. Title search and title insurance (~$1,000-2,000)
4. Recording fees, sheriff's deed fees (~$200-500)
5. Property insurance during redemption period
6. Property taxes during redemption period (6-12 months)
7. Utilities / winterization / securing the property during redemption
8. Estimated repairs (always assume SOME repairs — these are distressed properties)
9. Holding costs if flipping (financing, insurance, taxes during rehab)
10. Property management fees if renting (typically 8-10% of gross rent)
11. Vacancy allowance (budget 1-2 months/year empty)
12. Maintenance reserve (~1% of property value/year)

ROI calculations should use NET income (rent minus taxes, insurance, management, maintenance, vacancy) not gross rent. A property renting at $1,005/mo does NOT yield $12,060/year — after expenses it's closer to $7,000-8,000/year net.

Also consider:
- The lender may credit bid (bid their own debt) and take the property back — you may not win
- Condition is unknown — no interior access before the sale
- Occupancy status — the owner or tenants may still be living there during redemption
- Iowa is a judicial foreclosure state — the process is slower but more transparent
- "Equity spread" (assessed value minus judgment) is NOT profit and can be misleading. Assessed value often differs from actual market value. When discussing equity, always clarify it's a rough indicator and calculate realistic net profit after ALL costs instead.

FEMA Flood Zone guidance — do NOT flag flood zone as a risk unless it is actually high risk:
- Zone X = MINIMAL flood risk (the LOWEST possible). This is NOT a risk factor. Most properties in Des Moines are zone X.
- Zone X with "REDUCED RISK DUE TO LEVEE" = still minimal, protected by levee. Not a risk factor.
- Zone B or C = moderate risk. Worth mentioning but not a major red flag.
- Zones A, AE, AH, AO, V, VE = HIGH RISK. These ARE significant risk factors requiring mandatory flood insurance.
- Zone D = undetermined. Worth noting as unknown.
Only flag flood zone as a risk or red flag if the zone is A, AE, AH, AO, V, VE, or D.`;

    const propertyData = `
PROPERTY: ${listing.propertyAddress || 'Unknown'}
PARCEL PIN: ${listing.parcelPin || 'N/A'}
SALE DATE: ${listing.salesDate || 'N/A'}
STATUS: ${listing.isDelayed ? 'DELAYED/POSTPONED' : 'ACTIVE'}

PLAINTIFF (Foreclosing Party): ${listing.plaintiff || 'N/A'}
DEFENDANT (Owner): ${listing.defendant || 'N/A'}

FINANCIALS:
- Judgment Amount: ${listing.approxJudgment || 'N/A'}
- Assessed Value: ${fmt$(listing.assessedValue)}
- Land Value: ${fmt$(listing.landValue)}
- Building Value: ${fmt$(listing.buildingValue)}
- Last Sale Price: ${fmt$(listing.lastSaleAmount)} ${listing.lastSaleDate ? `(${listing.lastSaleDate})` : ''}
- Outstanding Taxes: ${fmt$(listing.outstandingTaxes)}
- Equity Estimate: ${fmt$(listing.equity)}

PROPERTY DETAILS:
- Class: ${listing.propertyClass || 'N/A'}
- Year Built: ${listing.yearBuilt || 'N/A'}
- Sqft: ${listing.sqft || 'N/A'}
- Bedrooms: ${listing.bedrooms || 'N/A'}
- Bathrooms: ${listing.bathrooms || 'N/A'}

TAX STATUS:
- Has Unredeemed Tax Sale: ${listing.hasUnredeemedTaxSale ? 'YES' : 'No'}
- Tax Sale Cert #: ${listing.taxSaleCertNumber || 'None'}
- Tax Sale Amount: ${fmt$(listing.taxSaleAmount)}
- Delinquent Years: ${listing.taxDelinquentYears?.join(', ') || 'None'}

FLOOD ZONE: ${listing.floodZone || 'N/A'} (${listing.isFloodZone ? 'HIGH RISK' : 'Minimal risk'})

NEIGHBORHOOD:
- Median Household Income: ${fmt$(listing.medianHouseholdIncome)}
- Median Home Value: ${fmt$(listing.medianHomeValue)}
- Median Rent: ${fmt$(listing.medianGrossRent)}
- Owner Occupied: ${listing.ownerOccupiedPct != null ? listing.ownerOccupiedPct + '%' : 'N/A'}
- HUD FMR 2-Bed: ${fmt$(listing.hudRent2Bed)}
- HUD FMR 3-Bed: ${fmt$(listing.hudRent3Bed)}

SALE HISTORY:
${listing.saleHistory?.map((s: any) => `- ${s.date}: ${fmt$(s.price)} (${s.seller} -> ${s.buyer}, ${s.instrument})`).join('\n') || 'No history available'}

USER NOTES: ${notes || 'None'}`;

    const userMessage = `Analyze this sheriff sale property and provide:

${propertyData}

Please provide your analysis in these sections:

**RISK ASSESSMENT** - What are the specific risks? Consider lien position, tax status, flood zone, condition indicators, and market factors. Rate overall risk as LOW / MEDIUM / HIGH.

**OPPORTUNITIES** - What makes this property potentially attractive? Consider rental potential, neighborhood strength, and value-add potential.

**RED FLAGS** - List any specific warnings (2nd mortgage, tax sale certs, high-risk flood zone, negative equity, frequent flips, etc.)

**TOTAL COST BREAKDOWN** — Show a DETAILED table/list of every dollar needed to acquire this property. Include ALL of these line items with estimated amounts:
- Starting bid (judgment amount)
- Suggested max bid
- Outstanding taxes / tax sale cert payoff (use actual data if available)
- Title search & title insurance (~$1,000-2,000)
- Sheriff's deed recording fees (~$200-500)
- Property insurance during redemption (6-12 months @ ~$100-150/mo)
- Property taxes during redemption period
- Winterization / securing / utilities during redemption (~$50-100/mo)
- Repair estimate — LOW scenario (cosmetic: paint, carpet, appliances, ~$5-15K)
- Repair estimate — HIGH scenario (major: roof, HVAC, plumbing, foundation, ~$25-50K based on age/sqft)
- TOTAL ALL-IN COST for both scenarios
Show this as a clear itemized breakdown so the investor knows exactly how much cash they need.

**MAX BID GUIDANCE** - Based on the total cost breakdown above, what's the maximum bid that makes financial sense?
- For a FLIP (buy, repair, resell): target 70% of after-repair value minus repair costs
- For a RENTAL (buy, repair, hold): target a price where cash-on-cash return exceeds 8% using net rent
Show the math for both strategies.

**RENTAL ANALYSIS** - Estimated monthly rent, then subtract ALL expenses to show net:
- Gross monthly rent (use HUD FMR or neighborhood data)
- Property taxes (~monthly)
- Property insurance (~$100-125/mo)
- Property management (10% of gross rent)
- Vacancy allowance (8% = ~1 month/year)
- Maintenance reserve (1% of property value / 12)
- NET monthly cash flow
- Annual net income
- Cash-on-cash return at suggested bid level

**ACTION ITEMS** - What should the investor verify before bidding? (title search, drive-by, specific concerns to research)`;

    const response = await callProvider(provider, systemPrompt, userMessage);
    return NextResponse.json({ analysis: response, provider: provider.label });
  } catch (err: any) {
    console.error('[ai-property-analysis]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
