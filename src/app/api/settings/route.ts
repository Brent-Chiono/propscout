import { NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/settings';

export async function GET() {
  return NextResponse.json(loadSettings());
}

export async function POST(req: Request) {
  try {
    const partial = await req.json();
    const merged = saveSettings(partial);
    return NextResponse.json(merged);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
