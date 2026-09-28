import { NextRequest } from 'next/server';
import { getScraper } from '@/lib/blizzpaste';
import { ScanProgress, BlizzItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const scraper = getScraper();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial progress state
      const initialData = JSON.stringify({
        type: 'initial',
        progress: scraper.getProgress()
      });
      controller.enqueue(encoder.encode(`data: ${initialData}\n\n`));

      const onProgress = (prog: ScanProgress) => {
        try {
          const payload = JSON.stringify({ type: 'progress', progress: prog });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // ignore
        }
      };

      const onItem = (item: BlizzItem) => {
        try {
          const payload = JSON.stringify({ type: 'item', item });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // ignore
        }
      };

      scraper.on('progress', onProgress);
      scraper.on('item', onItem);

      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(pingInterval);
        }
      }, 10000);

      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        scraper.off('progress', onProgress);
        scraper.off('item', onItem);
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
