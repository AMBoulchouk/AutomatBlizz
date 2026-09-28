import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'csv';
    const favoriteOnly = searchParams.get('favorite') === 'true';
    const specificIdsStr = searchParams.get('ids');

    const storage = getStorage();
    let items = storage.getAllFound();

    if (favoriteOnly) {
      items = items.filter((item) => item.isFavorite);
    }

    if (specificIdsStr) {
      const idSet = new Set(
        specificIdsStr
          .split(',')
          .map((id) => parseInt(id.trim(), 10))
          .filter((n) => !isNaN(n))
      );
      if (idSet.size > 0) {
        items = items.filter((item) => idSet.has(item.id));
      }
    }

    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'json') {
      return new NextResponse(JSON.stringify(items, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="blizzpaste-items-${timestamp}.json"`
        }
      });
    }

    if (format === 'txt') {
      const txtContent = items.map((i) => i.url).join('\n');
      return new NextResponse(txtContent, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="blizzpaste-links-${timestamp}.txt"`
        }
      });
    }

    // Default CSV
    const csvRows = [
      ['ID', 'Title', 'URL', 'Status', 'Favorite', 'ScannedAt'].join(',')
    ];

    for (const item of items) {
      const safeTitle = `"${(item.title || '').replace(/"/g, '""')}"`;
      csvRows.push([
        item.id,
        safeTitle,
        item.url,
        item.status,
        item.isFavorite ? 'Yes' : 'No',
        item.scannedAt
      ].join(','));
    }

    return new NextResponse(csvRows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="blizzpaste-archive-${timestamp}.csv"`
      }
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
