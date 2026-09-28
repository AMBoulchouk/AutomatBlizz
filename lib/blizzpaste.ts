import { EventEmitter } from 'node:events';
import { BlizzItem, ItemStatus, ScanConfig, ScanProgress } from './types';
import { getStorage, BlizzStorage } from './storage';

/**
 * Decodes standard HTML entities commonly found in web scraping.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/&Aacute;/g, 'Á')
    .replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&Ntilde;/g, 'Ñ')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    });
}

export interface ParseResult {
  title: string;
  status: ItemStatus;
}

/**
 * Parses BlizzPaste HTML to extract the title inside <div class="content">...<h3>{Title}</h3>.
 * Detects missing IDs: <b>Error: El id "..." no existe</b>
 */
export function parseBlizzPasteHtml(id: number, html: string): ParseResult {
  if (html.includes('no existe') && html.toLowerCase().includes('error:')) {
    return { title: '', status: 'not_found' };
  }

  const contentMatch = html.match(/<div class="content">([\s\S]*?)<\/div>/i);
  const searchArea = contentMatch ? contentMatch[1] : html;

  const h3Regex = /<h3>([\s\S]*?)<\/h3>/gi;
  let match: RegExpExecArray | null;

  while ((match = h3Regex.exec(searchArea)) !== null) {
    const rawInner = match[1];
    if (
      rawInner.includes('¿Como Descargar?') ||
      rawInner.includes('¿Error CRC') ||
      rawInner.includes('wp-pagenavi')
    ) {
      continue;
    }

    const cleanText = rawInner.replace(/<[^>]*>/g, '').trim();
    if (cleanText.length > 0) {
      return {
        title: decodeHtmlEntities(cleanText),
        status: 'found'
      };
    }
  }

  const fallbackH3 = html.match(/<h3>([^<]+)<\/h3>/i);
  if (fallbackH3) {
    const cleanText = fallbackH3[1].trim();
    if (
      !cleanText.includes('¿Como Descargar?') &&
      !cleanText.includes('¿Error CRC') &&
      cleanText.length > 0
    ) {
      return {
        title: decodeHtmlEntities(cleanText),
        status: 'found'
      };
    }
  }

  return { title: '', status: 'not_found' };
}

/**
 * Extracts numeric IDs from strings, lines, or URLs.
 */
export function extractIdsFromInput(input: string): number[] {
  const ids: Set<number> = new Set();
  const lines = input.split(/[\r\n,;\s]+/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const urlMatch = trimmed.match(/[?&]v=(\d+)/i);
    if (urlMatch) {
      const num = parseInt(urlMatch[1], 10);
      if (!isNaN(num) && num > 0) ids.add(num);
      continue;
    }

    const directNum = parseInt(trimmed, 10);
    if (!isNaN(directNum) && directNum > 0 && /^\d+$/.test(trimmed)) {
      ids.add(directNum);
    }
  }

  return Array.from(ids).sort((a, b) => a - b);
}

export class BlizzScraper extends EventEmitter {
  private isScanning = false;
  private isPaused = false;
  private shouldStop = false;
  private storage: BlizzStorage;
  private progress: ScanProgress;
  private startTime = 0;
  private queue: number[] = [];

  constructor(storage?: BlizzStorage) {
    super();
    this.storage = storage || getStorage();
    this.progress = this.createInitialProgress();
  }

  private createInitialProgress(): ScanProgress {
    return {
      active: false,
      status: 'idle',
      currentId: null,
      startId: 0,
      endId: 0,
      totalPlanned: 0,
      processedCount: 0,
      foundCount: 0,
      notFoundCount: 0,
      errorCount: 0,
      skippedCount: 0,
      percent: 0,
      itemsPerSecond: 0,
      startedAt: null,
      lastFoundItem: null,
      lastMessage: null
    };
  }

  public getProgress(): ScanProgress {
    if (this.isScanning && this.startTime > 0) {
      const elapsedSec = (Date.now() - this.startTime) / 1000;
      if (elapsedSec > 0) {
        this.progress.itemsPerSecond = +(
          this.progress.processedCount / elapsedSec
        ).toFixed(2);
      }
    }
    return { ...this.progress };
  }

  public isBusy(): boolean {
    return this.isScanning;
  }

  public async fetchSingle(id: number): Promise<BlizzItem> {
    const url = `https://blizzpaste.com/?v=${id}`;
    const scannedAt = new Date().toISOString();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const html = await res.text();
      const parsed = parseBlizzPasteHtml(id, html);

      const item: BlizzItem = {
        id,
        title: parsed.title,
        url,
        status: parsed.status,
        httpStatus: res.status,
        scannedAt
      };

      this.storage.upsertItem(item);
      return item;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const errorItem: BlizzItem = {
        id,
        title: '',
        url,
        status: 'error',
        httpStatus: 0,
        notes: `Network error: ${message}`,
        scannedAt
      };

      this.storage.upsertItem(errorItem);
      return errorItem;
    }
  }

  public async startScan(config: ScanConfig): Promise<void> {
    if (this.isScanning) {
      throw new Error('A scan is already in progress');
    }

    this.isScanning = true;
    this.isPaused = false;
    this.shouldStop = false;
    this.startTime = Date.now();

    if (config.customIds && config.customIds.length > 0) {
      this.queue = [...config.customIds];
      this.progress.startId = this.queue[0];
      this.progress.endId = this.queue[this.queue.length - 1];
    } else {
      const start = Math.min(config.startId, config.endId);
      const end = Math.max(config.startId, config.endId);
      this.queue = [];
      for (let i = start; i <= end; i++) {
        this.queue.push(i);
      }
      this.progress.startId = start;
      this.progress.endId = end;
    }

    this.progress.totalPlanned = this.queue.length;
    this.progress.processedCount = 0;
    this.progress.foundCount = 0;
    this.progress.notFoundCount = 0;
    this.progress.errorCount = 0;
    this.progress.skippedCount = 0;
    this.progress.percent = 0;
    this.progress.active = true;
    this.progress.status = 'running';
    this.progress.startedAt = new Date().toISOString();
    this.progress.lastMessage = `Iniciando escaneo de ${this.queue.length} items...`;

    this.emit('progress', this.getProgress());

    const concurrency = Math.max(1, Math.min(6, config.concurrency || 2));
    const delayMs = Math.max(100, config.delayMs ?? 250);
    const maxConsecutiveErrors = config.maxConsecutiveErrors || 30;
    const skipExisting = config.skipExisting ?? true;

    let consecutiveErrors = 0;

    const worker = async () => {
      while (this.queue.length > 0 && !this.shouldStop) {
        while (this.isPaused && !this.shouldStop) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        if (this.shouldStop) break;

        const id = this.queue.shift();
        if (id === undefined) break;

        this.progress.currentId = id;

        // Skip if already in database and found
        if (skipExisting) {
          const existing = this.storage.getItem(id);
          if (existing && existing.status === 'found') {
            this.progress.processedCount++;
            this.progress.skippedCount++;
            this.progress.lastMessage = `Omitido ID #${id} (ya en BD: "${existing.title}")`;
            this.progress.percent = +(
              (this.progress.processedCount / this.progress.totalPlanned) *
              100
            ).toFixed(1);
            this.emit('progress', this.getProgress());
            continue;
          }
        }

        this.progress.lastMessage = `Consultando ID ${id}...`;
        this.emit('progress', this.getProgress());

        const item = await this.fetchSingle(id);

        this.progress.processedCount++;
        if (item.status === 'found') {
          this.progress.foundCount++;
          this.progress.lastFoundItem = item;
          this.progress.lastMessage = `Encontrado: "${item.title}" (#${id})`;
          consecutiveErrors = 0;
          this.emit('item', item);
        } else if (item.status === 'not_found') {
          this.progress.notFoundCount++;
          consecutiveErrors++;
        } else {
          this.progress.errorCount++;
          consecutiveErrors++;
        }

        if (maxConsecutiveErrors > 0 && consecutiveErrors >= maxConsecutiveErrors) {
          this.progress.lastMessage = `Se alcanzaron ${consecutiveErrors} IDs vacíos consecutivos. Deteniendo.`;
          this.shouldStop = true;
          break;
        }

        this.progress.percent = +(
          (this.progress.processedCount / this.progress.totalPlanned) *
          100
        ).toFixed(1);

        this.emit('progress', this.getProgress());

        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    };

    const workers: Promise<void>[] = [];
    for (let w = 0; w < concurrency; w++) {
      workers.push(worker());
    }

    try {
      await Promise.all(workers);
    } finally {
      this.isScanning = false;
      this.progress.active = false;
      this.progress.currentId = null;

      if (this.shouldStop) {
        this.progress.status = 'stopped';
        this.progress.lastMessage = 'Escaneo detenido.';
        this.emit('stopped');
      } else {
        this.progress.status = 'completed';
        this.progress.percent = 100;
        this.progress.lastMessage = `Escaneo finalizado. Encontrados: ${this.progress.foundCount} de ${this.progress.processedCount}.`;
        this.emit('completed', this.getProgress());
      }
      this.emit('progress', this.getProgress());
    }
  }

  public pause(): void {
    if (this.isScanning && !this.isPaused) {
      this.isPaused = true;
      this.progress.status = 'paused';
      this.progress.lastMessage = 'Escaneo pausado';
      this.emit('progress', this.getProgress());
    }
  }

  public resume(): void {
    if (this.isScanning && this.isPaused) {
      this.isPaused = false;
      this.progress.status = 'running';
      this.progress.lastMessage = 'Escaneo reanudado';
      this.emit('progress', this.getProgress());
    }
  }

  public stop(): void {
    if (this.isScanning) {
      this.shouldStop = true;
      this.isPaused = false;
      this.progress.status = 'stopped';
      this.progress.lastMessage = 'Deteniendo escaneo...';
      this.emit('progress', this.getProgress());
    }
  }
}

// Global scraper instance singleton
let defaultScraperInstance: BlizzScraper | null = null;

export function getScraper(): BlizzScraper {
  if (!defaultScraperInstance) {
    defaultScraperInstance = new BlizzScraper();
  }
  return defaultScraperInstance;
}
