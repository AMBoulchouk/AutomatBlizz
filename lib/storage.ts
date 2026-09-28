import * as fs from 'node:fs';
import * as path from 'node:path';
import { BlizzItem, SearchQuery, PaginatedResult, OverallStats } from './types';

export class BlizzStorage {
  private filePath: string;
  private itemsMap: Map<number, BlizzItem> = new Map();
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      const dataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.filePath = path.join(dataDir, 'database.json');
    }
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item && typeof item.id === 'number') {
              this.itemsMap.set(item.id, item);
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to load database from disk, starting empty:', e);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.saveToDisk();
    }, 200);
  }

  public saveToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.itemsMap.values());
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (e) {
      console.error('Failed to persist database to disk:', e);
    }
  }

  public upsertItem(item: BlizzItem): void {
    const existing = this.itemsMap.get(item.id);
    if (existing) {
      this.itemsMap.set(item.id, {
        ...existing,
        ...item,
        isFavorite: existing.isFavorite ?? item.isFavorite
      });
    } else {
      this.itemsMap.set(item.id, item);
    }
    this.scheduleSave();
  }

  public getItem(id: number): BlizzItem | null {
    return this.itemsMap.get(id) || null;
  }

  public queryItems(params: SearchQuery = {}): PaginatedResult<BlizzItem> {
    let list = Array.from(this.itemsMap.values());

    // Filter by text search query
    if (params.q && params.q.trim()) {
      const qLower = params.q.trim().toLowerCase();
      const numQuery = parseInt(params.q.trim(), 10);

      list = list.filter((item) => {
        if (!isNaN(numQuery) && item.id === numQuery) return true;
        return item.title && item.title.toLowerCase().includes(qLower);
      });
    }

    // Filter by status
    if (params.status && params.status !== 'all') {
      list = list.filter((item) => item.status === params.status);
    }

    // Filter by favorite
    if (params.favoriteOnly) {
      list = list.filter((item) => item.isFavorite);
    }

    // Sorting
    const sortBy = params.sortBy || 'id';
    const isDesc = params.sortOrder === 'desc';

    list.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'title') {
        comparison = (a.title || '').localeCompare(b.title || '');
      } else if (sortBy === 'scannedAt') {
        comparison = new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime();
      } else {
        comparison = a.id - b.id;
      }
      return isDesc ? -comparison : comparison;
    });

    const total = list.length;
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 25));
    const offset = (page - 1) * limit;
    const paginated = list.slice(offset, offset + limit);

    return {
      items: paginated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    };
  }

  public getAllFound(): BlizzItem[] {
    return Array.from(this.itemsMap.values())
      .filter((i) => i.status === 'found')
      .sort((a, b) => a.id - b.id);
  }

  public toggleFavorite(id: number): boolean {
    const item = this.itemsMap.get(id);
    if (!item) return false;
    item.isFavorite = !item.isFavorite;
    this.scheduleSave();
    return item.isFavorite;
  }

  public deleteItem(id: number): boolean {
    const deleted = this.itemsMap.delete(id);
    if (deleted) this.scheduleSave();
    return deleted;
  }

  public clearAll(): void {
    this.itemsMap.clear();
    this.saveToDisk();
  }

  public getStats(): OverallStats {
    const all = Array.from(this.itemsMap.values());
    let foundCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;
    let favoriteCount = 0;
    let minId: number | null = null;
    let maxId: number | null = null;
    let lastScannedAt: string | null = null;

    for (const item of all) {
      if (item.status === 'found') foundCount++;
      else if (item.status === 'not_found') notFoundCount++;
      else if (item.status === 'error') errorCount++;

      if (item.isFavorite) favoriteCount++;

      if (minId === null || item.id < minId) minId = item.id;
      if (maxId === null || item.id > maxId) maxId = item.id;

      if (!lastScannedAt || item.scannedAt > lastScannedAt) {
        lastScannedAt = item.scannedAt;
      }
    }

    return {
      totalItems: all.length,
      foundCount,
      notFoundCount,
      errorCount,
      favoriteCount,
      minId,
      maxId,
      lastScannedAt
    };
  }
}

// Global singleton instance
let defaultStorageInstance: BlizzStorage | null = null;

export function getStorage(): BlizzStorage {
  if (!defaultStorageInstance) {
    defaultStorageInstance = new BlizzStorage();
  }
  return defaultStorageInstance;
}
