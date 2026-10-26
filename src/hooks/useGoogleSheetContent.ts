import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicSiteData } from '../types/siteContent';
import { DEFAULT_PUBLIC_SITE_DATA } from '../content/defaultSiteData';
import { DEFAULT_SHEETS_ENDPOINT, loadGoogleSheetData, normalizePublicSiteData, validateGoogleSheetsEndpoint } from '../services/googleSheets';

const CACHE_KEY = 'aurora_public_sheet_snapshot_v1';
const ENDPOINT_KEY = 'aurora_google_sheets_endpoint_v1';
export interface SheetContentStatus {
  state: 'loading' | 'connected' | 'error';
  source: 'google_sheets' | 'saved_snapshot' | 'bundled_preview';
  lastSyncedAt?: string;
  error?: string;
}
function savedEndpoint() {
  try { return localStorage.getItem(ENDPOINT_KEY) || DEFAULT_SHEETS_ENDPOINT; } catch { return DEFAULT_SHEETS_ENDPOINT; }
}
function bootstrap() {
  const endpoint = savedEndpoint();
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cache?.endpoint === endpoint && typeof cache?.savedAt === 'string') {
      return { endpoint, data: normalizePublicSiteData(cache.data), status: { state: 'loading', source: 'saved_snapshot', lastSyncedAt: cache.savedAt } as SheetContentStatus };
    }
  } catch { /* Invalid snapshots are never trusted. */ }
  return { endpoint, data: DEFAULT_PUBLIC_SITE_DATA, status: { state: 'loading', source: 'bundled_preview' } as SheetContentStatus };
}
export function useGoogleSheetContent() {
  const [initial] = useState(bootstrap);
  const [endpoint, setEndpoint] = useState(initial.endpoint);
  const [data, setData] = useState<PublicSiteData>(initial.data);
  const [status, setStatus] = useState<SheetContentStatus>(initial.status);
  const activeRequest = useRef<AbortController | null>(null);
  const lastPublicRefreshAt=useRef(0);
  const refresh = useCallback(async () => {
    lastPublicRefreshAt.current=Date.now();
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    // A background refresh must not make a connected storefront look
    // disconnected or replace its content with placeholders.
    setStatus(previous => ({ ...previous,
      state: previous.lastSyncedAt && previous.source==='google_sheets' ? 'connected' : 'loading',
      error: undefined,
    }));
    try {
      const next = await loadGoogleSheetData(endpoint, controller.signal);
      if (controller.signal.aborted) return;
      const savedAt = new Date().toISOString();
      // Avoid replacing the entire storefront model when nothing actually
      // changed. Stable references prevent the cart, banners and product
      // picker from remounting during an otherwise successful auto-refresh.
      setData(previous => JSON.stringify(previous)===JSON.stringify(next)?previous:next);
      setStatus({ state: 'connected', source: 'google_sheets', lastSyncedAt: savedAt });
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ endpoint, savedAt, data: next })); } catch { /* Content still renders when browser storage is unavailable. */ }
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus(previous => ({
        ...previous,
        // Keep the last valid storefront connected while reporting temporary
        // refresh problems; no destructive fallback to bundled demo data.
        state: previous.lastSyncedAt && previous.source==='google_sheets' ? 'connected' : 'error',
        source: previous.lastSyncedAt ? previous.source : 'bundled_preview',
        error: error instanceof Error ? error.message : 'The Google Sheets content could not be loaded.',
      }));
    }
  }, [endpoint]);
  useEffect(() => {
    void refresh();
    const updateWhenVisible = () => {
      // Returning from another tab shouldn't force repeated expensive Apps
      // Script reads when the visitor just refreshed their storefront.
      if (!document.hidden && Date.now()-lastPublicRefreshAt.current>=30000)
        void refresh();
    };
    const timer = window.setInterval(updateWhenVisible, 60000);
    window.addEventListener('online', updateWhenVisible);
    window.addEventListener('focus', updateWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', updateWhenVisible);
      window.removeEventListener('focus', updateWhenVisible);
      activeRequest.current?.abort();
    };
  }, [refresh]);
  const updateEndpoint = (value: string) => {
    const next = validateGoogleSheetsEndpoint(value.trim()).href;
    if (next === endpoint) { void refresh(); return; }
    activeRequest.current?.abort();
    try { localStorage.setItem(ENDPOINT_KEY, next); } catch { /* Use this session when storage is blocked. */ }
    setData(DEFAULT_PUBLIC_SITE_DATA);
    setStatus({ state: 'loading', source: 'bundled_preview' });
    setEndpoint(next);
  };
  return { data, status, endpoint, refresh, updateEndpoint };
}
