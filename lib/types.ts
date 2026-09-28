export type ItemStatus = 'found' | 'not_found' | 'error';

export interface BlizzItem {
  id: number;
  title: string;
  url: string;
  status: ItemStatus;
  httpStatus: number;
  scannedAt: string;
  isFavorite?: boolean;
  notes?: string;
}

export interface ScanProgress {
  active: boolean;
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'completed';
  currentId: number | null;
  startId: number;
  endId: number;
  totalPlanned: number;
  processedCount: number;
  foundCount: number;
  notFoundCount: number;
  errorCount: number;
  skippedCount: number;
  percent: number;
  itemsPerSecond: number;
  startedAt: string | null;
  lastFoundItem: BlizzItem | null;
  lastMessage: string | null;
}

export interface ScanConfig {
  startId: number;
  endId: number;
  concurrency?: number;
  delayMs?: number;
  maxConsecutiveErrors?: number;
  customIds?: number[];
  skipExisting?: boolean;
}

export interface SearchQuery {
  q?: string;
  status?: string;
  favoriteOnly?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'id' | 'title' | 'scannedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface OverallStats {
  totalItems: number;
  foundCount: number;
  notFoundCount: number;
  errorCount: number;
  favoriteCount: number;
  minId: number | null;
  maxId: number | null;
  lastScannedAt: string | null;
}
