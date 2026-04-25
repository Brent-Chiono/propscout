import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { encrypt, decrypt } from '@/lib/crypto';

const FILE = join(process.cwd(), 'data', 'ai-settings.json');

export interface AIProviderSettings {
  provider: string;
  label: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  enabled: boolean;
}

function readSettings(): AIProviderSettings[] {
  if (!existsSync(FILE)) return [];
  try {
    const raw = readFileSync(FILE, 'utf-8');
    const data = JSON.parse(raw);
    return (data.providers || []).map((p: any) => {
      let apiKey = '';
      if (p.apiKey) {
        try { apiKey = decrypt(p.apiKey); } catch { apiKey = p.apiKey; }
      }
      return { ...p, apiKey };
    });
  } catch {
    return [];
  }
}

function writeSettings(providers: AIProviderSettings[]) {
  const encrypted = providers.map(p => {
    // Don't encrypt empty keys or the Ollama placeholder
    const needsEncrypt = p.apiKey && p.apiKey !== 'not-needed' && p.provider !== 'ollama';
    return {
      ...p,
      apiKey: needsEncrypt ? encrypt(p.apiKey) : (p.apiKey || ''),
    };
  });
  writeFileSync(FILE, JSON.stringify({ providers: encrypted }, null, 2));
}

export async function GET() {
  try {
    const providers = readSettings();
    // Mask API keys for client — only show last 4 chars
    const masked = providers.map(p => ({
      ...p,
      apiKey: p.apiKey ? `${'*'.repeat(Math.max(0, p.apiKey.length - 4))}${p.apiKey.slice(-4)}` : '',
      hasKey: !!p.apiKey,
    }));
    return NextResponse.json({ providers: masked });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, providers: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { providers } = body;

    if (!Array.isArray(providers)) {
      return NextResponse.json({ error: 'providers must be an array' }, { status: 400 });
    }

    // If a provider's apiKey is all *'s or empty, preserve the existing key
    const existing = readSettings();
    const merged = providers.map((p: AIProviderSettings) => {
      const old = existing.find(e => e.provider === p.provider);
      const apiKey = (!p.apiKey || /^\*+.{0,4}$/.test(p.apiKey))
        ? (old?.apiKey || '')
        : p.apiKey;
      return { ...p, apiKey };
    });

    writeSettings(merged);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
