import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicSiteData } from '../types/siteContent';
import { DEFAULT_PUBLIC_SITE_DATA } from '../content/defaultSiteData';
import { isFirebaseCatalogPreviewRequested, loadFirebaseCatalogPreview } from '../services/firebasePrimaryCatalog';
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
  source: 'google_sheets' | 'firebase' | 'saved_snapshot' | 'bundled_preview';
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
  // Never display a cached Sheets snapshot as a live Firebase-only preview.
  if(isFirebaseCatalogPreviewRequested())return {endpoint,data:DEFAULT_PUBLIC_SITE_DATA,
    status:{state:'loading',source:'bundled_preview'} as SheetContentStatus};
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
  const refresh = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      try { localStorage.removeItem(CACHE_KEY); } catch {} 
    }
    lastPublicRefreshAt.current=Date.now();
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    // A background refresh must not make a connected storefront look
    // disconnected or replace its content with placeholders.
    setStatus(previous => ({ ...previous,
      state: previous.lastSyncedAt && ['google_sheets','firebase'].includes(previous.source) ? 'connected' : 'loading',
      error: undefined,
    }));
    try {
      const firebasePreview=isFirebaseCatalogPreviewRequested();
      const next = firebasePreview
        ? await loadFirebaseCatalogPreview(controller.signal)
        : await loadGoogleSheetData(endpoint, controller.signal);
      if (controller.signal.aborted) return;
      const savedAt = new Date().toISOString();
      // Avoid replacing the entire storefront model when nothing actually
      // changed. Stable references prevent the cart, banners and product
      // picker from remounting during an otherwise successful auto-refresh.
      console.info("[GoogleSheets] Live data synced:", next.products.length, "products,", next.categories.length, "categories");
      setData(previous => JSON.stringify(previous)===JSON.stringify(next)?previous:next);
      setStatus({ state: 'connected', source: firebasePreview?'firebase':'google_sheets', lastSyncedAt: savedAt });
      if(!firebasePreview)try { localStorage.setItem(CACHE_KEY, JSON.stringify({ endpoint, savedAt, data: next })); } catch { /* Content still renders when browser storage is unavailable. */ }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.warn("[GoogleSheets] Content sync warning:", error);
      setStatus(previous => ({
        ...previous,
        // Keep the last valid storefront connected while reporting temporary
        // refresh problems; no destructive fallback to bundled demo data.
        state: previous.lastSyncedAt && ['google_sheets','firebase'].includes(previous.source) ? 'connected' : 'error',
        source: previous.lastSyncedAt ? previous.source : 'bundled_preview',
        error: error instanceof Error ? error.message : 'The Google Sheets content could not be loaded.',
      }));
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
    setData(EMPTY_SHEET_DATA);
    setStatus({ state: 'loading', source: 'bundled_preview' });
    setEndpoint(next);
  };
  return { data, status, endpoint, refresh, updateEndpoint };
}
