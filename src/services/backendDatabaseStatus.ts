import { getPagesApiOrigin } from './pagesApi';
export type DatabaseBackend='google_sheets'|'unknown';
export const databaseBackendLabel=(backend:DatabaseBackend):string=>backend==='google_sheets'?'Google Sheets':'Status unknown';
export interface BackendDatabaseStatus{available:boolean;backend:DatabaseBackend;installedRelease:string|null;upToDate:boolean|null;scheduledChecks:{available:boolean;enabled:boolean|null;configured:boolean|null};}
export function unknownBackendDatabaseStatus():BackendDatabaseStatus{return {available:false,backend:'unknown',installedRelease:null,upToDate:null,scheduledChecks:{available:false,enabled:null,configured:null}};}
export function parseBackendDatabaseStatus(value:unknown):BackendDatabaseStatus{
 const status=unknownBackendDatabaseStatus();if(!value||typeof value!=='object'||Array.isArray(value))return status;
 const r=value as Record<string,unknown>;if(r.ok!==true)return status;status.available=true;
 if(r.database_backend==='google_sheets')status.backend='google_sheets';
 if(typeof r.installed_release==='string'&&/^[A-Za-z0-9._-]{1,120}$/.test(r.installed_release))status.installedRelease=r.installed_release;
 if(typeof r.up_to_date==='boolean')status.upToDate=r.up_to_date;
 return status;
}
/** Netlify + Sheets only: no unused SQL health probes. */
export async function loadBackendDatabaseStatus(options:{fetcher?:typeof fetch;signal?:AbortSignal}={}):Promise<BackendDatabaseStatus>{
 const controller=new AbortController();const abort=()=>controller.abort();const timer=setTimeout(abort,15000);
 if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
 try{if(controller.signal.aborted)return unknownBackendDatabaseStatus();
 const response=await (options.fetcher||fetch)((getPagesApiOrigin()||'')+'/api/backend-health',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:controller.signal});
 return response.ok?parseBackendDatabaseStatus(await response.json()):unknownBackendDatabaseStatus();
 }catch{return unknownBackendDatabaseStatus();}finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
