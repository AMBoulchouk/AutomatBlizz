'use client';

import React, { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import { BlizzItem, OverallStats, ScanProgress } from '@/lib/types';

export default function BlizzPasteDashboard() {
  const [activeTab, setActiveTab] = useState<'scanner' | 'catalog' | 'batch'>('scanner');

  // Scanner Form State
  const [startId, setStartId] = useState<number>(1470);
  const [endId, setEndId] = useState<number>(1480);
  const [concurrency, setConcurrency] = useState<number>(2);
  const [delayMs, setDelayMs] = useState<number>(250);
  const [maxErrors, setMaxErrors] = useState<number>(30);
  const [skipExisting, setSkipExisting] = useState<boolean>(true);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Batch paste state
  const [batchText, setBatchText] = useState<string>(
    'https://blizzpaste.com/?v=1474\nhttps://blizzpaste.com/?v=1475\nhttps://blizzpaste.com/?v=1476'
  );

  // Scan progress state
  const [progress, setProgress] = useState<ScanProgress>({
    active: false,
    status: 'idle',
    currentId: null,
    startId: 1470,
    endId: 1480,
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
  });

  const [liveLogs, setLiveLogs] = useState<string[]>([
    'Sistema listo. Ingrese un rango o lista de enlaces para comenzar el escaneo recursivo.'
  ]);

  // Catalog State
  const [items, setItems] = useState<BlizzItem[]>([]);
  const [stats, setStats] = useState<OverallStats>({
    totalItems: 0,
    foundCount: 0,
    notFoundCount: 0,
    errorCount: 0,
    favoriteCount: 0,
    minId: null,
    maxId: null,
    lastScannedAt: null
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [favoriteOnly, setFavoriteOnly] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [, startTransition] = useTransition();

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Fetch Items from Database
  const fetchItems = async (targetPage = page) => {
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (favoriteOnly) params.set('favorite', 'true');
      params.set('page', targetPage.toString());
      params.set('limit', '25');

      const res = await fetch(`/api/items?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.items);
        setTotalPages(data.totalPages);
        if (data.stats) setStats(data.stats);
      }
    } catch (e) {
      console.error('Error fetching items:', e);
    }
  };

  // Connect to SSE stream on mount
  useEffect(() => {
    fetchItems(1);

    const sse = new EventSource('/api/scan/stream');

    sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'progress' || payload.type === 'initial') {
          setProgress(payload.progress);
          if (payload.progress.lastMessage) {
            setLiveLogs((prev) => [
              `[${new Date().toLocaleTimeString()}] ${payload.progress.lastMessage}`,
              ...prev.slice(0, 40)
            ]);
          }
        } else if (payload.type === 'item') {
          const item: BlizzItem = payload.item;
          if (item.status === 'found') {
            setLiveLogs((prev) => [
              `[${new Date().toLocaleTimeString()}] ✅ Encontrado: "${item.title}" (#${item.id})`,
              ...prev.slice(0, 40)
            ]);
          }
          startTransition(() => {
            fetchItems();
          });
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    return () => {
      sse.close();
    };
  }, []);

  // Trigger search on filter changes
  useEffect(() => {
    fetchItems(1);
    setPage(1);
  }, [searchQuery, statusFilter, favoriteOnly]);

  // Detected IDs from batch input
  const detectedBatchIds = useMemo(() => {
    const matches = batchText.match(/[?&]v=(\d+)/gi);
    const directNums = batchText.match(/\b\d{2,7}\b/g);
    const set = new Set<number>();

    if (matches) {
      for (const m of matches) {
        const id = parseInt(m.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(id)) set.add(id);
      }
    }
    if (directNums) {
      for (const d of directNums) {
        const id = parseInt(d, 10);
        if (!isNaN(id) && id > 10) set.add(id);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [batchText]);

  // Actions
  const handleStartScan = async (isBatch = false) => {
    try {
      const payload: Record<string, unknown> = {
        concurrency,
        delayMs,
        maxConsecutiveErrors: maxErrors,
        skipExisting
      };

      if (isBatch) {
        if (detectedBatchIds.length === 0) {
          showToast('No se detectaron IDs válidos en el texto');
          return;
        }
        payload.customInput = batchText;
      } else {
        payload.startId = Number(startId);
        payload.endId = Number(endId);
      }

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) {
        showToast(`Error: ${data.error}`);
      } else {
        showToast('🚀 Escaneo iniciado exitosamente');
        setActiveTab('scanner');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`Error: ${msg}`);
    }
  };

  const handleControlScan = async (action: 'pause' | 'resume' | 'stop') => {
    try {
      const res = await fetch('/api/scan/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          action === 'pause'
            ? 'Escaneo pausado'
            : action === 'resume'
            ? 'Escaneo reanudado'
            : 'Escaneo detenido'
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`Error: ${msg}`);
    }
  };

  const handleToggleFavorite = async (id: number) => {
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_favorite' })
      });
      const data = await res.json();
      if (data.success) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, isFavorite: data.isFavorite } : item
          )
        );
        fetchItems();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm(`¿Eliminar el registro #${id} de la base de datos?`)) return;
    try {
      const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(`Registro #${id} eliminado`);
        fetchItems();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = (text: string, label = 'Copiado al portapapeles') => {
    navigator.clipboard.writeText(text);
    showToast(label);
  };

  const handleCopySelectedLinks = () => {
    if (selectedIds.size === 0) {
      showToast('No hay items seleccionados');
      return;
    }
    const links = Array.from(selectedIds)
      .map((id) => `https://blizzpaste.com/?v=${id}`)
      .join('\n');
    copyToClipboard(links, `📋 ${selectedIds.size} enlaces copiados para JDownloader`);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = new Set(items.map((i) => i.id));
      setSelectedIds(allIds);
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelectId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#f8fafc',
            border: '1px solid var(--border-glow)',
            boxShadow: '0 10px 30px rgba(0, 242, 254, 0.25)',
            padding: '12px 20px',
            borderRadius: '12px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backdropFilter: 'blur(12px)'
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>✨</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Navbar */}
      <header
        style={{
          borderBottom: '1px solid var(--border-glass)',
          background: 'rgba(7, 9, 14, 0.8)',
          backdropFilter: 'blur(20px)',
          position: 'sticky',
          top: 0,
          zIndex: 50
        }}
      >
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '0.9rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          {/* Logo & Branding */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#07090e',
                fontWeight: 900,
                fontSize: '1.25rem',
                boxShadow: '0 0 20px rgba(0, 242, 254, 0.4)'
              }}
            >
              BP
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2
                  }}
                >
                  Automat<span className="gradient-text-cyan">Blizz</span>
                </h1>
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: 'rgba(0, 242, 254, 0.1)',
                    color: 'var(--accent-cyan)',
                    border: '1px solid rgba(0, 242, 254, 0.25)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}
                >
                  Next.js App
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>
                Indexador recursivo & archivador de BlizzPaste
              </p>
            </div>
          </div>

          {/* Scraper Status Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '6px 14px',
              borderRadius: '30px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-glass)'
            }}
          >
            <div className={progress.active ? 'led-active' : 'led-idle'} />
            <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>
              {progress.status === 'running'
                ? `Escaneando ID #${progress.currentId ?? '...'} (${progress.itemsPerSecond} req/s)`
                : progress.status === 'paused'
                ? 'Escaneo Pausado'
                : 'Scraper en Espera'}
            </span>
            {progress.active && (
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--accent-cyan)',
                  fontFamily: 'monospace'
                }}
              >
                {progress.percent}%
              </span>
            )}
          </div>

          {/* Quick Export Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <a
              href="/api/export?format=csv"
              className="btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.9rem', textDecoration: 'none' }}
              title="Descargar base de datos completa en CSV"
            >
              📊 Exportar CSV
            </a>
            <a
              href="/api/export?format=txt"
              className="btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.9rem', textDecoration: 'none' }}
              title="Descargar lista de enlaces en TXT"
            >
              🔗 Links TXT
            </a>
            <a
              href="/api/export?format=json"
              className="btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.9rem', textDecoration: 'none' }}
              title="Descargar JSON estructurado"
            >
              {'{}'} JSON
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
          padding: '1.75rem 1.5rem',
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem'
        }}
      >
        {/* Metric Cards Banner */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem'
          }}
        >
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>
                  Total Escaneados
                </p>
                <h3 style={{ fontSize: '1.85rem', fontWeight: 800, fontFamily: 'monospace' }}>
                  {stats.totalItems.toLocaleString()}
                </h3>
              </div>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(79, 172, 254, 0.1)',
                  color: 'var(--accent-blue)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem'
                }}
              >
                📁
              </div>
            </div>
            <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--text-dark)' }}>
              Rango IDs: {stats.minId ? `#${stats.minId}` : '---'} al {stats.maxId ? `#${stats.maxId}` : '---'}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>
                  Títulos Encontrados
                </p>
                <h3
                  style={{
                    fontSize: '1.85rem',
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    color: '#34d399'
                  }}
                >
                  {stats.foundCount.toLocaleString()}
                </h3>
              </div>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: '#34d399',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem'
                }}
              >
                🎮
              </div>
            </div>
            <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--text-dark)' }}>
              {stats.totalItems > 0
                ? `${((stats.foundCount / stats.totalItems) * 100).toFixed(1)}% tasa de éxito`
                : 'Sin registros'}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>
                  No Existen / 404
                </p>
                <h3
                  style={{
                    fontSize: '1.85rem',
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    color: '#94a3b8'
                  }}
                >
                  {stats.notFoundCount.toLocaleString()}
                </h3>
              </div>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(148, 163, 184, 0.1)',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem'
                }}
              >
                🔍
              </div>
            </div>
            <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--text-dark)' }}>
              IDs vacíos omitidos
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>
                  Favoritos Guardados
                </p>
                <h3
                  style={{
                    fontSize: '1.85rem',
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    color: '#f59e0b'
                  }}
                >
                  {stats.favoriteCount.toLocaleString()}
                </h3>
              </div>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem'
                }}
              >
                ★
              </div>
            </div>
            <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--text-dark)' }}>
              Marcados para descarga
            </div>
          </div>
        </section>

        {/* Tab Selection */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-glass)',
            paddingBottom: '0.75rem',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('scanner')}
              style={{
                background:
                  activeTab === 'scanner' ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
                color: activeTab === 'scanner' ? 'var(--accent-cyan)' : 'var(--text-dim)',
                border:
                  activeTab === 'scanner'
                    ? '1px solid rgba(0, 242, 254, 0.3)'
                    : '1px solid transparent',
                borderRadius: '8px',
                padding: '0.55rem 1.1rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>⚡</span> Consola de Escaneo
              {progress.active && <span className="led-active" />}
            </button>

            <button
              onClick={() => setActiveTab('catalog')}
              style={{
                background:
                  activeTab === 'catalog' ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
                color: activeTab === 'catalog' ? 'var(--accent-cyan)' : 'var(--text-dim)',
                border:
                  activeTab === 'catalog'
                    ? '1px solid rgba(0, 242, 254, 0.3)'
                    : '1px solid transparent',
                borderRadius: '8px',
                padding: '0.55rem 1.1rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>📚</span> Catálogo & Búsqueda
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace'
                }}
              >
                {stats.foundCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('batch')}
              style={{
                background:
                  activeTab === 'batch' ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
                color: activeTab === 'batch' ? 'var(--accent-cyan)' : 'var(--text-dim)',
                border:
                  activeTab === 'batch'
                    ? '1px solid rgba(0, 242, 254, 0.3)'
                    : '1px solid transparent',
                borderRadius: '8px',
                padding: '0.55rem 1.1rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>📋</span> Importar Enlaces
            </button>
          </div>
        </div>

        {/* TAB 1: SCANNER */}
        {activeTab === 'scanner' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(320px, 420px) 1fr',
              gap: '1.5rem',
              alignItems: 'start'
            }}
          >
            {/* Form */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Configuración del Escáner
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                  Define el rango recursivo de items de BlizzPaste
                </p>
              </div>

              {/* Presets */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-dark)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Preajustes rápidos:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setStartId(1470);
                      setEndId(1480);
                    }}
                    style={{
                      background: 'rgba(0, 242, 254, 0.08)',
                      border: '1px solid rgba(0, 242, 254, 0.2)',
                      color: 'var(--accent-cyan)',
                      fontSize: '0.75rem',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Starbound (1470 - 1480)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartId(1400);
                      setEndId(1500);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-glass)',
                      color: 'var(--text-dim)',
                      fontSize: '0.75rem',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Lote 1400 - 1500
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextStart = stats.maxId ? stats.maxId + 1 : 1480;
                      setStartId(nextStart);
                      setEndId(nextStart + 30);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-glass)',
                      color: 'var(--text-dim)',
                      fontSize: '0.75rem',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    +30 Siguientes
                  </button>
                </div>
              </div>

              {/* Range Inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.35rem' }}>
                    ID Inicial (?v=)
                  </label>
                  <input
                    type="number"
                    value={startId}
                    onChange={(e) => setStartId(parseInt(e.target.value, 10) || 1)}
                    disabled={progress.active}
                    style={{
                      width: '100%',
                      background: 'rgba(7, 9, 14, 0.6)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px',
                      padding: '0.65rem 0.85rem',
                      color: '#fff',
                      fontFamily: 'monospace',
                      fontSize: '0.95rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.35rem' }}>
                    ID Final (?v=)
                  </label>
                  <input
                    type="number"
                    value={endId}
                    onChange={(e) => setEndId(parseInt(e.target.value, 10) || 1)}
                    disabled={progress.active}
                    style={{
                      width: '100%',
                      background: 'rgba(7, 9, 14, 0.6)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px',
                      padding: '0.65rem 0.85rem',
                      color: '#fff',
                      fontFamily: 'monospace',
                      fontSize: '0.95rem'
                    }}
                  />
                </div>
              </div>

              {/* Skip Existing Option */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '1.25rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-glass)',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px'
                }}
              >
                <input
                  type="checkbox"
                  id="skipExisting"
                  checked={skipExisting}
                  onChange={(e) => setSkipExisting(e.target.checked)}
                  disabled={progress.active}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <label
                  htmlFor="skipExisting"
                  style={{ fontSize: '0.8rem', color: '#f8fafc', cursor: 'pointer', userSelect: 'none' }}
                >
                  ⚡ Omitir IDs ya indexados en la BD (evita re-escanear)
                </label>
              </div>

              {/* Advanced Network Options */}
              <div style={{ marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-blue)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>{showAdvanced ? '▼' : '▶'}</span> Opciones de red y concurrencia
                </button>

                {showAdvanced && (
                  <div
                    style={{
                      marginTop: '0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem',
                      padding: '0.85rem',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid var(--border-glass)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Concurrencia:</span>
                        <span style={{ fontFamily: 'monospace' }}>{concurrency} hilos</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={concurrency}
                        onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
                        disabled={progress.active}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Delay entre peticiones:</span>
                        <span style={{ fontFamily: 'monospace' }}>{delayMs} ms</span>
                      </div>
                      <input
                        type="range"
                        min="100"
                        max="1000"
                        step="50"
                        value={delayMs}
                        onChange={(e) => setDelayMs(parseInt(e.target.value, 10))}
                        disabled={progress.active}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Límite de errores seguidos:</span>
                        <span style={{ fontFamily: 'monospace' }}>{maxErrors}</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        step="5"
                        value={maxErrors}
                        onChange={(e) => setMaxErrors(parseInt(e.target.value, 10))}
                        disabled={progress.active}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {!progress.active ? (
                  <button
                    onClick={() => handleStartScan(false)}
                    className="btn-primary"
                    style={{ justifyContent: 'center', width: '100%', padding: '0.85rem' }}
                  >
                    <span>🚀</span> Iniciar Escaneo Recursivo
                  </button>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    {progress.status === 'running' ? (
                      <button
                        onClick={() => handleControlScan('pause')}
                        className="btn-secondary"
                        style={{ justifyContent: 'center' }}
                      >
                        ⏸ Pausar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleControlScan('resume')}
                        className="btn-primary"
                        style={{ justifyContent: 'center' }}
                      >
                        ▶ Reanudar
                      </button>
                    )}
                    <button
                      onClick={() => handleControlScan('stop')}
                      className="btn-danger"
                      style={{ justifyContent: 'center' }}
                    >
                      ⏹ Detener
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Telemetry & Log */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                      Telemetría en Tiempo Real
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                      Conexión activa vía Server-Sent Events (SSE)
                    </p>
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '1.5rem',
                      fontWeight: 800,
                      color: 'var(--accent-cyan)'
                    }}
                  >
                    {progress.percent}%
                  </div>
                </div>

                {/* Progress Bar */}
                <div
                  style={{
                    width: '100%',
                    height: '14px',
                    borderRadius: '20px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    overflow: 'hidden',
                    border: '1px solid var(--border-glass)',
                    marginBottom: '1rem'
                  }}
                >
                  <div
                    style={{
                      width: `${progress.percent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #00f2fe 0%, #4facfe 50%, #8b5cf6 100%)',
                      borderRadius: '20px',
                      transition: 'width 0.3s ease',
                      boxShadow: '0 0 15px rgba(0, 242, 254, 0.5)'
                    }}
                  />
                </div>

                {/* Stats Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '0.75rem',
                    textAlign: 'center',
                    marginBottom: '1rem'
                  }}
                >
                  <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '0.65rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Procesados</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem' }}>
                      {progress.processedCount} / {progress.totalPlanned}
                    </div>
                    {progress.skippedCount > 0 && (
                      <div style={{ fontSize: '0.68rem', color: '#f59e0b' }}>
                        ({progress.skippedCount} omitidos)
                      </div>
                    )}
                  </div>
                  <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '0.65rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#34d399' }}>Encontrados</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem', color: '#34d399' }}>
                      {progress.foundCount}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '0.65rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dark)' }}>No existen</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem', color: '#94a3b8' }}>
                      {progress.notFoundCount}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '0.65rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)' }}>Velocidad</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-cyan)' }}>
                      {progress.itemsPerSecond} <span style={{ fontSize: '0.75rem' }}>req/s</span>
                    </div>
                  </div>
                </div>

                {/* Last Found Item */}
                {progress.lastFoundItem && (
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      borderRadius: '8px',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span className="id-tag">#{progress.lastFoundItem.id}</span>
                      <strong style={{ fontSize: '0.9rem', color: '#f8fafc' }}>
                        {progress.lastFoundItem.title}
                      </strong>
                    </div>
                    <a
                      href={progress.lastFoundItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--accent-cyan)',
                        fontSize: '0.8rem',
                        textDecoration: 'none'
                      }}
                    >
                      Abrir en BlizzPaste ↗
                    </a>
                  </div>
                )}
              </div>

              {/* Console Logs */}
              <div
                className="glass-panel"
                style={{
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  background: 'rgba(5, 7, 12, 0.9)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem' }}>📟</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-dim)' }}>
                      Consola de Eventos
                    </span>
                  </div>
                  <button
                    onClick={() => setLiveLogs(['Consola limpiada.'])}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dark)',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    Limpiar
                  </button>
                </div>

                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.78rem',
                    color: '#94a3b8',
                    height: '220px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '0.5rem',
                    background: '#04060a',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}
                >
                  {liveLogs.map((log, idx) => (
                    <div
                      key={idx}
                      style={{
                        color: log.includes('✅')
                          ? '#34d399'
                          : log.includes('Error')
                          ? '#fda4af'
                          : '#94a3b8',
                        lineHeight: 1.4
                      }}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CATALOG */}
        {activeTab === 'catalog' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div
              className="glass-panel"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Buscar por título (ej. Starbound) o ID numérico..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(7, 9, 14, 0.7)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '10px',
                      padding: '0.7rem 1rem 0.7rem 2.4rem',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-dark)',
                      fontSize: '0.9rem'
                    }}
                  >
                    🔍
                  </span>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-dark)',
                        cursor: 'pointer'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {[
                    { key: 'all', label: 'Todos' },
                    { key: 'found', label: 'Encontrados' },
                    { key: 'not_found', label: 'No existen' },
                    { key: 'error', label: 'Errores' }
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setStatusFilter(f.key)}
                      style={{
                        background:
                          statusFilter === f.key
                            ? 'rgba(0, 242, 254, 0.15)'
                            : 'rgba(255, 255, 255, 0.04)',
                        color:
                          statusFilter === f.key ? 'var(--accent-cyan)' : 'var(--text-dim)',
                        border:
                          statusFilter === f.key
                            ? '1px solid rgba(0, 242, 254, 0.35)'
                            : '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        padding: '0.5rem 0.85rem',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      {f.label}
                    </button>
                  ))}

                  <button
                    onClick={() => setFavoriteOnly(!favoriteOnly)}
                    style={{
                      background: favoriteOnly
                        ? 'rgba(245, 158, 11, 0.2)'
                        : 'rgba(255, 255, 255, 0.04)',
                      color: favoriteOnly ? '#f59e0b' : 'var(--text-dim)',
                      border: favoriteOnly
                        ? '1px solid rgba(245, 158, 11, 0.4)'
                        : '1px solid var(--border-glass)',
                      borderRadius: '8px',
                      padding: '0.5rem 0.85rem',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    ★ Favoritos
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '2px'
                  }}
                >
                  <button
                    onClick={() => setViewMode('table')}
                    style={{
                      background: viewMode === 'table' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                      border: 'none',
                      color: viewMode === 'table' ? '#fff' : 'var(--text-dark)',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    ☰ Tabla
                  </button>
                  <button
                    onClick={() => setViewMode('cards')}
                    style={{
                      background: viewMode === 'cards' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                      border: 'none',
                      color: viewMode === 'cards' ? '#fff' : 'var(--text-dark)',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    ⊞ Tarjetas
                  </button>
                </div>
              </div>

              {selectedIds.size > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(0, 242, 254, 0.08)',
                    border: '1px solid rgba(0, 242, 254, 0.25)',
                    padding: '0.65rem 1rem',
                    borderRadius: '8px',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                    ✓ {selectedIds.size} items seleccionados
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handleCopySelectedLinks}
                      className="btn-primary"
                      style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }}
                    >
                      📋 Copiar Enlaces para JDownloader
                    </button>
                    <a
                      href={`/api/export?format=csv&ids=${Array.from(selectedIds).join(',')}`}
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem', textDecoration: 'none' }}
                    >
                      Exportar Selección (CSV)
                    </a>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-dim)',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        padding: '0.4rem'
                      }}
                    >
                      Deseleccionar todos
                    </button>
                  </div>
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div
                className="glass-panel"
                style={{
                  padding: '3.5rem',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div style={{ fontSize: '3rem' }}>🔍</div>
                <h4 style={{ fontSize: '1.2rem', fontWeight: 600 }}>No se encontraron items</h4>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-dim)', maxWidth: '450px' }}>
                  No hay registros coincidentes. Puedes iniciar un escaneo desde la pestaña de Consola o importar enlaces.
                </p>
                <button
                  onClick={() => setActiveTab('scanner')}
                  className="btn-primary"
                  style={{ marginTop: '0.5rem' }}
                >
                  Ir al Escáner
                </button>
              </div>
            ) : viewMode === 'table' ? (
              <div className="glass-panel" style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderBottom: '1px solid var(--border-glass)',
                          fontSize: '0.78rem',
                          color: 'var(--text-dim)',
                          textTransform: 'uppercase'
                        }}
                      >
                        <th style={{ padding: '0.85rem 1rem', width: '40px' }}>
                          <input
                            type="checkbox"
                            checked={items.length > 0 && selectedIds.size === items.length}
                            onChange={handleSelectAll}
                            style={{ cursor: 'pointer' }}
                          />
                        </th>
                        <th style={{ padding: '0.85rem 1rem', width: '90px' }}>ID</th>
                        <th style={{ padding: '0.85rem 1rem' }}>Título / Juego</th>
                        <th style={{ padding: '0.85rem 1rem', width: '130px' }}>Estado</th>
                        <th style={{ padding: '0.85rem 1rem', width: '140px' }}>Fecha</th>
                        <th style={{ padding: '0.85rem 1rem', width: '150px', textAlign: 'right' }}>
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const isSelected = selectedIds.has(item.id);
                        return (
                          <tr
                            key={item.id}
                            style={{
                              borderBottom: '1px solid var(--border-glass)',
                              background: isSelected
                                ? 'rgba(0, 242, 254, 0.04)'
                                : 'transparent'
                            }}
                          >
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectId(item.id)}
                                style={{ cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <span className="id-tag">#{item.id}</span>
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <button
                                  onClick={() => handleToggleFavorite(item.id)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: item.isFavorite ? '#f59e0b' : 'var(--text-dark)',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    padding: '2px'
                                  }}
                                  title={item.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                                >
                                  ★
                                </button>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#f8fafc' }}>
                                    {item.title || (
                                      <span style={{ color: 'var(--text-dark)', fontStyle: 'italic' }}>
                                        (Sin título o no existe)
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dark)' }}>
                                    {item.url}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              {item.status === 'found' ? (
                                <span className="badge-ok">Disponible</span>
                              ) : item.status === 'not_found' ? (
                                <span className="badge-missing">No existe</span>
                              ) : (
                                <span className="badge-error">Error</span>
                              )}
                            </td>
                            <td
                              style={{
                                padding: '0.85rem 1rem',
                                fontSize: '0.8rem',
                                color: 'var(--text-dim)',
                                fontFamily: 'monospace'
                              }}
                            >
                              {new Date(item.scannedAt).toLocaleDateString()}
                            </td>
                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                <button
                                  onClick={() => copyToClipboard(item.url, `Link #${item.id} copiado`)}
                                  title="Copiar URL"
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid var(--border-glass)',
                                    color: 'var(--text-dim)',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem'
                                  }}
                                >
                                  📋 Copiar
                                </button>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Abrir en BlizzPaste"
                                  style={{
                                    background: 'rgba(0, 242, 254, 0.1)',
                                    border: '1px solid rgba(0, 242, 254, 0.25)',
                                    color: 'var(--accent-cyan)',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    textDecoration: 'none'
                                  }}
                                >
                                  Abrir ↗
                                </a>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  title="Eliminar registro"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#f43f5e',
                                    cursor: 'pointer',
                                    padding: '4px 6px',
                                    fontSize: '0.8rem'
                                  }}
                                >
                                  🗑
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '1rem'
                }}
              >
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="glass-card"
                    style={{
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.75rem'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span className="id-tag">#{item.id}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            onClick={() => handleToggleFavorite(item.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: item.isFavorite ? '#f59e0b' : 'var(--text-dark)',
                              cursor: 'pointer',
                              fontSize: '1.1rem'
                            }}
                          >
                            ★
                          </button>
                          {item.status === 'found' ? (
                            <span className="badge-ok">OK</span>
                          ) : (
                            <span className="badge-missing">404</span>
                          )}
                        </div>
                      </div>
                      <h4
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          lineHeight: 1.3,
                          marginBottom: '0.35rem',
                          color: '#fff'
                        }}
                      >
                        {item.title || 'ID no existe o vacío'}
                      </h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-dark)', wordBreak: 'break-all' }}>
                        {item.url}
                      </p>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '1px solid var(--border-glass)',
                        paddingTop: '0.65rem',
                        marginTop: '0.5rem'
                      }}
                    >
                      <button
                        onClick={() => copyToClipboard(item.url, `Link #${item.id} copiado`)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          fontSize: '0.78rem',
                          cursor: 'pointer'
                        }}
                      >
                        📋 Copiar URL
                      </button>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--accent-cyan)',
                          fontSize: '0.78rem',
                          textDecoration: 'none',
                          fontWeight: 600
                        }}
                      >
                        Abrir BlizzPaste ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '0.5rem'
                }}
              >
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    const newPage = page - 1;
                    setPage(newPage);
                    fetchItems(newPage);
                  }}
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                >
                  ◀ Anterior
                </button>
                <span
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--text-dim)',
                    fontFamily: 'monospace',
                    padding: '0 0.5rem'
                  }}
                >
                  Página {page} de {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => {
                    const newPage = page + 1;
                    setPage(newPage);
                    fetchItems(newPage);
                  }}
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                >
                  Siguiente ▶
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: BATCH */}
        {activeTab === 'batch' && (
          <div className="glass-panel" style={{ padding: '1.75rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Importación Masiva de Enlaces BlizzPaste
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                Pega directamente un listado de URLs (como <code style={{ color: 'var(--accent-cyan)' }}>https://blizzpaste.com/?v=1474</code>) o números de ID.
              </p>
            </div>

            <textarea
              rows={8}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder="https://blizzpaste.com/?v=1474&#10;https://blizzpaste.com/?v=1475&#10;https://blizzpaste.com/?v=1476"
              style={{
                width: '100%',
                background: 'rgba(7, 9, 14, 0.7)',
                border: '1px solid var(--border-glass)',
                borderRadius: '10px',
                padding: '1rem',
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: '0.88rem',
                lineHeight: 1.5,
                resize: 'vertical',
                marginBottom: '1rem'
              }}
            />

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span className="badge-ok">
                  {detectedBatchIds.length} IDs únicos detectados
                </span>
                {detectedBatchIds.length > 0 && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-dark)', fontFamily: 'monospace' }}>
                    [{detectedBatchIds.slice(0, 5).join(', ')}
                    {detectedBatchIds.length > 5 ? '...' : ''}]
                  </span>
                )}
              </div>

              <button
                disabled={detectedBatchIds.length === 0 || progress.active}
                onClick={() => handleStartScan(true)}
                className="btn-primary"
              >
                <span>⚡</span> Escanear Estos {detectedBatchIds.length} IDs Ahora
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-glass)',
          background: 'rgba(7, 9, 14, 0.85)',
          padding: '1.25rem 1.5rem',
          marginTop: 'auto'
        }}
      >
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            fontSize: '0.8rem',
            color: 'var(--text-dark)'
          }}
        >
          <div>
            AutomatBlizz — Next.js 16 App Router & BlizzPaste Archivist
          </div>
          <div>
            Indexación y referencia directa a <span style={{ color: 'var(--text-dim)' }}>blizzpaste.com</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
