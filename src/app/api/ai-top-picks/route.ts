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
          'content-type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: provider.model, max_tokens: 2048, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}`);
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
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      const data = await res.json();
      return data.message?.content || '';
    }
    case 'gemini': {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${provider.apiKey}` },
        body: JSON.stringify({
          model: provider.model, max_tokens: 2048,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
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
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
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
    const { listings } = await req.json();
    if (!Array.isArray(listings) || listings.length === 0) {
      return NextResponse.json({ error: 'listings required' }, { status: 400 });
    }

    const provider = getActiveProvider();
    if (!provider) {
      return NextResponse.json({ error: 'No AI provider configured.' }, { status: 400 });
    }

    const systemPrompt = `You are a real estate investment analyst specializing in Iowa sheriff sale foreclosures. You identify the best investment opportunities from a list of properties. Be specific, use numbers, and explain your reasoning concisely.

Iowa context: 6-12 month redemption period, properties sold AS-IS, first mortgage foreclosures are cleanest, assessed value is close to market value. Tax sale certificates are a NEGATIVE — they add cost (cert amount + 2%/month interest) that the buyer must pay on top of their bid.

IMPORTANT — be realistic about costs:
- Total acquisition cost = bid + back taxes/tax cert payoff + title search (~$1.5K) + recording fees + repairs
- Always assume SOME repairs needed (minimum $10-20K for older homes)
- ROI must use NET rent (gross rent minus property taxes, insurance ~$1,200/yr, management 8-10%, vacancy 8%, maintenance 1% of value/yr), not gross rent
- A $1,005/mo gross rent is roughly $600-700/mo net after all expenses
- Factor in 6-12 month redemption period with zero income but ongoing costs (taxes, insurance, securing property)
- The lender may credit bid and take property back — winning is not guaranteed
- No interior access before sale — condition is unknown
- "Equity spread" (assessed value minus judgment) is NOT profit — it's a rough indicator only. Assessed value can differ significantly from actual market value. Always clarify this when mentioning equity spread. A better metric is estimated NET profit after all costs (bid + repairs + closing + holding costs subtracted from realistic resale value or capitalized rental income).

FEMA Flood Zone guidance — do NOT flag flood zone as a risk unless it is actually high risk:
- Zone X = MINIMAL flood risk (the LOWEST possible). This is NOT a risk factor.
- Zones A, AE, AH, AO, V, VE = HIGH RISK — these are real risk factors requiring mandatory flood insurance.
- Only mention flood zone in risk factors if the zone is A, AE, AH, AO, V, VE, or D.`;

    // Summarize each enriched listing
    const summaries = listings
      .filter((l: any) => l.assessedValue && l.approxJudgment)
      .map((l: any, i: number) => {
        const judgNum = parseFloat((l.approxJudgment || '0').replace(/[$,\s]/g, ''));
        const equity = l.assessedValue && judgNum ? l.assessedValue - judgNum : null;
        return `${i + 1}. ${l.propertyAddress}
   Judgment: ${l.approxJudgment} | Assessed: ${fmt$(l.assessedValue)} | Equity: ${fmt$(equity)}
   ${l.bedrooms || '?'}bd/${l.bathrooms || '?'}ba | ${l.sqft || '?'} sqft | Built ${l.yearBuilt || '?'}
   Plaintiff: ${l.plaintiff} | Taxes: ${fmt$(l.outstandingTaxes)} | Tax Sale: ${l.hasUnredeemedTaxSale ? 'YES' : 'No'}
   Flood: ${l.floodZone || '?'} | FMR Rent: ${fmt$(l.hudRent2Bed)}/mo (2bd)
   Last Sale: ${fmt$(l.lastSaleAmount)} (${l.lastSaleDate || '?'}) | Status: ${l.isDelayed ? 'DELAYED' : 'ACTIVE'}`;
      })
      .join('\n\n');

    const userMessage = `Here are ${listings.length} sheriff sale properties in Polk County, Iowa. Pick the TOP 5 best investment opportunities and explain why.

${summaries}

For each of your top 5 picks, provide:
1. **Property address** and why you picked it
2. **Quick cost breakdown**: suggested max bid + estimated repairs + taxes/closing costs + redemption holding costs = total all-in cost
3. **Rental numbers**: gross rent -> net monthly cash flow (after taxes, insurance, management 10%, vacancy 8%, maintenance). Show the math briefly.
4. **Cash-on-cash return** using net income and total all-in cost
5. **Risk level** (LOW/MEDIUM/HIGH) and the #1 risk factor
6. **Strategy**: is this better as a flip or a rental hold, and why?

Then provide a brief **PROPERTIES TO AVOID** section listing any with clear red flags (negative equity, 2nd mortgage, high-risk flood zone, tax sale certs, etc.).

Be specific with dollar amounts. Show your math. Keep it actionable.`;

    const response = await callProvider(provider, systemPrompt, userMessage);
    return NextResponse.json({ analysis: response, provider: provider.label });
  } catch (err: any) {
    console.error('[ai-top-picks]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
