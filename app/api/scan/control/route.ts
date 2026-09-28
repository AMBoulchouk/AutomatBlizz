import { NextRequest, NextResponse } from 'next/server';
import { getScraper } from '@/lib/blizzpaste';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    const scraper = getScraper();

    if (action === 'pause') {
      scraper.pause();
    } else if (action === 'resume') {
      scraper.resume();
    } else if (action === 'stop') {
      scraper.stop();
    } else {
      return NextResponse.json({ success: false, error: 'Acción inválida. Usa pause, resume o stop.' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      action,
      progress: scraper.getProgress()
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
