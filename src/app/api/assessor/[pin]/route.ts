import { NextResponse } from 'next/server';
import { fetchAssessorData } from '@/lib/assessor';

export async function GET(
  _req: Request,
  { params }: { params: { pin: string } }
) {
  const { pin } = params;

  if (!pin) {
    return NextResponse.json({ error: 'pin is required' }, { status: 400 });
  }

  const data = await fetchAssessorData(decodeURIComponent(pin));
  return NextResponse.json(data);
}
