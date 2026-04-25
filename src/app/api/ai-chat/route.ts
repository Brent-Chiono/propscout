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
  } catch (err) {
    console.error('[ai-chat] getActiveProvider error:', err);
    return null;
  }
}

async function callAnthropic(apiKey: string, model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || 'No response';
}

async function callOpenAICompatible(apiKey: string, model: string, baseUrl: string, systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'No response';
}

async function callOllama(model: string, baseUrl: string, systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.message?.content || 'No response';
}

// Load documentation content for the system prompt
function getDocsContent(context?: string): string {
  const docsPath = join(process.cwd(), 'src', 'lib', 'docs-content.ts');
  if (!existsSync(docsPath)) return '';
  try {
    const raw = readFileSync(docsPath, 'utf-8');
    // Use context-specific docs if available
    const varName = context === 'taxsales' ? 'TAXSALE_DOCS_TEXT' :
                    context === 'auctions' ? 'AUCTION_DOCS_TEXT' : 'DOCS_TEXT';
    const match = raw.match(new RegExp(`export const ${varName}\\s*=\\s*\`([\\s\\S]*?)\`;`));
    if (match) return match[1];
    // Fallback to full docs
    const fallback = raw.match(/export const DOCS_TEXT\s*=\s*`([\s\S]*?)`;/);
    return fallback ? fallback[1] : '';
  } catch {
    return '';
  }
}

export async function POST(req: Request) {
  try {
    const { message, context } = await req.json();
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const provider = getActiveProvider();
    if (!provider) {
      return NextResponse.json({
        error: 'No AI provider configured. Go to Settings to add an API key.',
      }, { status: 400 });
    }

    const docsContent = getDocsContent(context);
    const systemPrompt = `You are a helpful assistant for the Polk County Sheriff Sale Viewer application. Answer questions about the app, its features, data fields, and how to use it. Be concise and practical.

Here is the complete documentation for the application:

${docsContent}

Answer the user's question based on this documentation. If the question is not covered by the documentation, say so honestly. Keep answers focused and helpful for real estate investors.`;

    let response: string;

    switch (provider.provider) {
      case 'anthropic':
        response = await callAnthropic(provider.apiKey, provider.model, systemPrompt, message);
        break;
      case 'gemini':
        response = await callOpenAICompatible(
          provider.apiKey,
          provider.model,
          'https://generativelanguage.googleapis.com/v1beta/openai',
          systemPrompt,
          message,
        );
        break;
      case 'ollama':
        response = await callOllama(
          provider.model,
          provider.baseUrl || 'http://localhost:11434',
          systemPrompt,
          message,
        );
        break;
      default:
        // Generic OpenAI-compatible (custom)
        response = await callOpenAICompatible(
          provider.apiKey,
          provider.model,
          provider.baseUrl || 'https://api.openai.com/v1',
          systemPrompt,
          message,
        );
    }

    return NextResponse.json({ response, provider: provider.label });
  } catch (err: any) {
    console.error('[ai-chat]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
