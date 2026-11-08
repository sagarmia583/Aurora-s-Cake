import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicSiteData } from '../types/siteContent';
import { DEFAULT_PUBLIC_SITE_DATA } from '../content/defaultSiteData';
import { DEFAULT_SHEETS_ENDPOINT, isPinnedProductionSheetEndpoint, loadGoogleSheetData, normalizePublicSiteData, validateGoogleSheetsEndpoint } from '../services/googleSheets';

const CACHE_KEY = 'aurora_public_sheet_snapshot_v2';
// A disconnected shop must not offer bundled demonstration products for sale.
const EMPTY_SHEET_DATA: PublicSiteData = {
  ...DEFAULT_PUBLIC_SITE_DATA,
  order_submission_enabled: false,
  customer_order_profile_sync_enabled: false,
  settings: {...DEFAULT_PUBLIC_SITE_DATA.settings, logo_url:'',profile_image_url:'',phone:'',email:'',
    address:'',accepting_orders:false,delivery_enabled:false},
  products:[],categories:[],flavors:[],addons:[],banners:[],zones:[],slots:[],coupons:[],reviews:[],
  hero_slides:[],highlights:[],faqs:[],links:[],
};
const ENDPOINT_KEY = 'aurora_google_sheets_endpoint_v1';
export interface SheetContentStatus {
  state: 'loading' | 'connected' | 'error';
  source: 'google_sheets' | 'saved_snapshot' | 'bundled_preview';
  lastSyncedAt?: string;
  error?: string;
}
function savedEndpoint() {
  // Never let another device's old localStorage setting choose the backend
  // on a production Netlify site. The owner configures the Netlify environment.
  if(isPinnedProductionSheetEndpoint())return DEFAULT_SHEETS_ENDPOINT;
  try { return localStorage.getItem(ENDPOINT_KEY) || DEFAULT_SHEETS_ENDPOINT; } catch { return DEFAULT_SHEETS_ENDPOINT; }
}
function bootstrap() {
  const endpoint = savedEndpoint();
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cache?.endpoint === endpoint && typeof cache?.savedAt === 'string') {
      const preview=normalizePublicSiteData(cache.data);
      // Old/local cached data remains visible but cannot initiate new COD
      // orders or profile changes until a fresh server snapshot is confirmed.
      const data={...preview,order_submission_enabled:false,customer_order_profile_sync_enabled:false};
      return { endpoint, data, status: { state: 'loading', source: 'saved_snapshot', lastSyncedAt: cache.savedAt } as SheetContentStatus };
    }
  } catch { /* Invalid snapshots are never trusted. */ }
  return { endpoint, data: EMPTY_SHEET_DATA, status: { state: 'loading', source: 'bundled_preview' } as SheetContentStatus };
}
export function useGoogleSheetContent() {
  const [initial] = useState(bootstrap);
  const [endpoint, setEndpoint] = useState(initial.endpoint);
  const [data, setData] = useState<PublicSiteData>(initial.data);
  const [status, setStatus] = useState<SheetContentStatus>(initial.status);
  const activeRequest = useRef<AbortController | null>(null);
  const lastPublicRefreshAt=useRef(0);
  // Avoid repeatedly stringifying old snapshots and writing identical content
  // to synchronous localStorage during the twelve-second live refresh cycle.
  const lastAppliedSnapshot=useRef<string | null>(null);
  const lastStatusPublishedAt=useRef(0);
  const refresh = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && activeRequest.current && !activeRequest.current.signal.aborted) return;
    if (forceRefresh) {
      lastAppliedSnapshot.current = null;
    }
    lastPublicRefreshAt.current=Date.now();
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    // A background refresh must not make a connected storefront look
    // disconnected or replace its content with placeholders.
    setStatus(previous => {
      if (previous.state === 'connected' && previous.source === 'google_sheets' && !previous.error)
        return previous;
      return {...previous,
        state: previous.lastSyncedAt && previous.source === 'google_sheets' ? 'connected' : 'loading',
        error: undefined,
      };
    });
    try {
      const next = await loadGoogleSheetData(endpoint, controller.signal);
      if (controller.signal.aborted) return;
      const savedAt = new Date().toISOString();
      // One serialization per public response. Unchanged content must not
      // trigger a storefront render or synchronously rewrite browser storage.
      const serialized = JSON.stringify(next);
      if (lastAppliedSnapshot.current !== serialized) {
        lastAppliedSnapshot.current = serialized;
        setData(next);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ endpoint, savedAt, data: next })); }
        catch { /* Content still renders when browser storage is unavailable. */ }
      }
      // Publish a heartbeat at most once per minute. Every successful poll
      // still occurs on the existing 12-second cadence; no backend changes.
      const now = Date.now();
      const publishHeartbeat = now - lastStatusPublishedAt.current >= 60_000;
      if (publishHeartbeat) lastStatusPublishedAt.current = now;
      setStatus(previous => previous.state === 'connected' && previous.source === 'google_sheets' &&
        !previous.error && !publishHeartbeat
        ? previous : { state: 'connected', source: 'google_sheets', lastSyncedAt: savedAt });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.warn("[GoogleSheets] Content sync warning:", error);
      setStatus(previous => ({
        ...previous,
        // Keep the last valid storefront connected while reporting temporary
        // refresh problems; no destructive fallback to bundled demo data.
        state: previous.lastSyncedAt && previous.source==='google_sheets' ? 'connected' : 'error',
        source: previous.lastSyncedAt ? previous.source : 'bundled_preview',
        error: error instanceof Error ? error.message : 'The Google Sheets content could not be loaded.',
      }));
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, [endpoint]);
  useEffect(() => {
    void refresh();
    const updateWhenVisible = () => {
      // Fast real-time storefront synchronization when visible
      if (!document.hidden && Date.now()-lastPublicRefreshAt.current>=6000)
        void refresh();
    };
    const timer = window.setInterval(updateWhenVisible, 12000);
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
    if(isPinnedProductionSheetEndpoint() && next!==DEFAULT_SHEETS_ENDPOINT)
      throw new Error('Production backend is managed by Netlify. Change the server configuration, not this browser.');
    if (next === endpoint) { void refresh(); return; }
    activeRequest.current?.abort();
    try { localStorage.setItem(ENDPOINT_KEY, next); } catch { /* Use this session when storage is blocked. */ }
    lastAppliedSnapshot.current = null;
    setData(EMPTY_SHEET_DATA);
    setStatus({ state: 'loading', source: 'bundled_preview' });
    setEndpoint(next);
  };
  return { data, status, endpoint, refresh, updateEndpoint };
}
