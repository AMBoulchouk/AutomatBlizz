import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || undefined;
    const status = searchParams.get('status') || undefined;
    const favoriteOnly = searchParams.get('favorite') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const sortBy = (searchParams.get('sortBy') as 'id' | 'title' | 'scannedAt') || 'id';
    const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc';

    const storage = getStorage();
    const result = storage.queryItems({
      q,
      status,
      favoriteOnly,
      page,
      limit,
      sortBy,
      sortOrder
    });
    const stats = storage.getStats();

    return NextResponse.json({
      success: true,
      ...result,
      stats
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
