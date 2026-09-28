import { NextRequest, NextResponse } from 'next/server';
import { getScraper, extractIdsFromInput } from '@/lib/blizzpaste';

export async function GET() {
  const scraper = getScraper();
  return NextResponse.json({
    success: true,
    progress: scraper.getProgress()
  });
}

export async function POST(req: NextRequest) {
  try {
    const scraper = getScraper();
    if (scraper.isBusy()) {
      return NextResponse.json(
        { success: false, error: 'Ya hay un escaneo en curso. Espera o detenlo antes de iniciar otro.' },
        { status: 409 }
      );
    }

    const body = await req.json();
    const {
      startId,
      endId,
      concurrency = 2,
      delayMs = 250,
      customInput,
      maxConsecutiveErrors = 25,
      skipExisting = true
    } = body;

    let targetIds: number[] | undefined;

    if (customInput && typeof customInput === 'string' && customInput.trim()) {
      targetIds = extractIdsFromInput(customInput);
      if (targetIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No se encontraron IDs o URLs válidas de BlizzPaste en el texto' },
          { status: 400 }
        );
      }
    } else {
      if (typeof startId !== 'number' || typeof endId !== 'number') {
        return NextResponse.json(
          { success: false, error: 'startId y endId deben ser números' },
          { status: 400 }
        );
      }
    }

    scraper.startScan({
      startId: startId || (targetIds ? targetIds[0] : 1),
      endId: endId || (targetIds ? targetIds[targetIds.length - 1] : 1),
      customIds: targetIds,
      concurrency: Math.min(6, Math.max(1, concurrency)),
      delayMs: Math.max(100, delayMs),
      maxConsecutiveErrors,
      skipExisting
    }).catch((err) => {
      console.error('Scan error:', err);
    });

    return NextResponse.json({
      success: true,
      message: 'Escaneo iniciado exitosamente',
      progress: scraper.getProgress()
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
