import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';

export async function GET() {
  try {
    const storage = getStorage();
    const stats = storage.getStats();
    return NextResponse.json({ success: true, stats });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
