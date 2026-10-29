import type { PublicSiteData } from '../types/siteContent';
import { normalizePublicSiteData } from './googleSheets';

/** Explicit public catalog preview for migration verification. No checkout. */
export function isFirebaseCatalogPreviewRequested(): boolean {
  if(typeof window==='undefined')return false;
  return /(?:^|\.)(?:workers|pages)\.dev$/i.test(window.location.hostname)
    && new URLSearchParams(window.location.search).get('firebase_catalog_preview')==='1';
}

export async function loadFirebaseCatalogPreview(signal?:AbortSignal):Promise<PublicSiteData>{
  const response=await fetch('/api/firebase-primary/catalog',{
    method:'GET',credentials:'same-origin',cache:'no-store',signal
  });
  const data:unknown=await response.json().catch(()=>null);
  const record=typeof data==='object'&&data!==null&&!Array.isArray(data)
    ?data as Record<string,unknown>:null;
  if(!response.ok||!record||record.ok!==true||record.provider!=='firestore')
    throw new Error('Firestore catalog is not ready: '+(
      typeof record?.code==='string'?record.code:'catalog_unavailable'));
  const validated=normalizePublicSiteData(record.data);
  // A preview must never submit orders into an unfinished Firebase backend.
  return {...validated,order_submission_enabled:false};
}
