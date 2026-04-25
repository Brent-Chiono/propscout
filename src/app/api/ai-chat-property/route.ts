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
      if (p.apiKey) { try { apiKey = decrypt(p.apiKey); } catch { apiKey = p.apiKey; } }
      return { ...p, apiKey };
    });
    return providers.find((p: ProviderConfig) => p.enabled && (p.apiKey || p.provider === 'ollama')) || null;
  } catch { return null; }
}

async function callProvider(provider: ProviderConfig, systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const allMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  switch (provider.provider) {
    case 'anthropic': {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: provider.model, max_tokens: 2048, system: systemPrompt,
          messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
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
        body: JSON.stringify({ model: provider.model, stream: false, messages: allMessages }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.message?.content || '';
    }
    case 'gemini': {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${provider.apiKey}` },
        body: JSON.stringify({ model: provider.model, max_tokens: 2048, messages: allMessages }),
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
        body: JSON.stringify({ model: provider.model, max_tokens: 2048, messages: allMessages }),
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
    const { messages, propertyContext } = await req.json();
    if (!messages?.length) return NextResponse.json({ error: 'messages required' }, { status: 400 });

    const provider = getActiveProvider();
    if (!provider) return NextResponse.json({ error: 'No AI provider configured.' }, { status: 400 });

    const p = propertyContext || {};
    const systemPrompt = `You are a real estate investment analyst having a conversation about a specific property. Be concise, specific with numbers, and practical.

PROPERTY CONTEXT:
Address: ${p.propertyAddress || p.legalDescription || p.parcelPin || 'Unknown'}
Parcel PIN: ${p.parcelPin || 'N/A'}
Owner: ${p.titleHolder || p.defendant || 'N/A'}
${p.totalDue != null ? `Total Taxes Due: ${fmt$(p.totalDue)} (this is a TAX SALE certificate, not a sheriff auction)` : ''}
${p.approxJudgment ? `Judgment: ${p.approxJudgment} (this is a SHERIFF AUCTION)` : ''}
Assessed Value: ${fmt$(p.assessedValue)}
Land: ${fmt$(p.landValue)} | Building: ${fmt$(p.buildingValue)}
Last Sale: ${fmt$(p.lastSaleAmount)} ${p.lastSaleDate ? `(${p.lastSaleDate})` : ''}
Class: ${p.propertyClass || 'N/A'} | Year Built: ${p.yearBuilt || 'N/A'} | Sqft: ${p.sqft || 'N/A'}
Beds: ${p.bedrooms || 'N/A'} | Baths: ${p.bathrooms || 'N/A'}
Flood: ${p.floodZone || 'N/A'} ${p.isFloodZone ? '(HIGH RISK)' : p.floodZone === 'X' ? '(minimal - not a risk)' : ''}
${p.medianHouseholdIncome ? `Neighborhood: Income ${fmt$(p.medianHouseholdIncome)}, Home Value ${fmt$(p.medianHomeValue)}, Rent ${fmt$(p.medianGrossRent)}` : ''}
${p.hudRent2Bed ? `HUD FMR: 2bd ${fmt$(p.hudRent2Bed)}/mo, 3bd ${fmt$(p.hudRent3Bed)}/mo` : ''}
${p.saleTypeLabel ? `Sale Type: ${p.saleTypeLabel} | Area: ${p.area} | Type: ${p.propertyType}` : ''}
${p.hasUnredeemedTaxSale ? 'WARNING: Has unredeemed tax sale certificate' : ''}
${p.taxSaleAmount ? `Tax Sale Cert: ${fmt$(p.taxSaleAmount)} (cert #${p.taxSaleCertNumber})` : ''}
${p.plaintiff ? `Plaintiff: ${p.plaintiff}` : ''}

Iowa context: Zone X flood = minimal (not a risk). Tax certs earn 2%/month. Sheriff sales have 6-12 month redemption. Always target 100% bid on tax sales.

Answer questions about THIS specific property. Use the data above. Be direct and practical.`;

    const response = await callProvider(provider, systemPrompt, messages);
    return NextResponse.json({ response, provider: provider.label });
  } catch (err: any) {
    console.error('[ai-chat-property]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
