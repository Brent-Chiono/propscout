import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const baseUrl = searchParams.get('baseUrl') || 'http://localhost:11434';

  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      headers: { 'accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Ollama returned ${res.status}`, models: [] }, { status: 502 });
    }

    const data = await res.json();
    console.log('[ollama-models] Raw response keys:', Object.keys(data), 'model count:', (data.models || []).length);

    const models = (data.models || []).map((m: any) => ({
      name: m.name || m.model || '',
      size: m.size ? Math.round(m.size / 1_000_000_000 * 10) / 10 : null,
      modified: m.modified_at,
      family: m.details?.family || null,
      parameters: m.details?.parameter_size || null,
    }));

    return NextResponse.json({ models });
  } catch (err: any) {
    console.error('[ollama-models] Error:', err.message);
    return NextResponse.json({ error: err.message, models: [] }, { status: 502 });
  }
}
