import React, { useState } from 'react';
import { X, RefreshCw, ExternalLink, Database, Download, Copy, Check } from 'lucide-react';
import { useCakeDialog } from './useCakeDialog';
import type { SheetContentStatus } from '../hooks/useGoogleSheetContent';
import { databaseBackendLabel, type DatabaseBackend } from '../services/backendDatabaseStatus';
import setupCode from '../../apps-script/Code.AllInOne.gs?raw';

interface Props {
  isOpen: boolean; onClose: () => void; endpoint: string; status: SheetContentStatus;
  orderSubmissionEnabled?: boolean; onRefresh: () => Promise<void>; onSaveEndpoint: (value: string) => void;
  databaseBackend?: DatabaseBackend; onOpenStaffPortal?: () => void;
}
export const SheetContentPanel = (props: Props) => props.isOpen ? <SheetContentDialog {...props}/> : null;
function SheetContentDialog({ onClose, endpoint, status, orderSubmissionEnabled, onRefresh, onSaveEndpoint,
  databaseBackend = 'unknown', onOpenStaffPortal }: Props) {
  const ref = useCakeDialog(onClose);
  const [url, setUrl] = useState(endpoint);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const source = status.source === 'google_sheets' ? 'Live website data'
    : status.source === 'firebase' ? 'Firebase catalogue preview'
    : status.source === 'saved_snapshot' ? 'Last saved website snapshot' : 'Built-in preview content';
  const download = () => {
    const blob = new Blob([setupCode], { type:'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = href; link.download = 'Aurora-Backend-Code.gs'; link.click(); URL.revokeObjectURL(href);
  };
  const copy = async () => {
    setError('');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(setupCode);
      } else {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const area = document.createElement('textarea');
        area.value = setupCode;
        area.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;';
        document.body.appendChild(area);
        area.select();
        const success = document.execCommand('copy');
        area.remove();
        previous?.focus();
        if (!success) throw new Error('Clipboard unavailable');
      }
      setCopied(true);
    } catch { setError('Copy is unavailable in this browser. Use Download setup code.'); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={event => { if(event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} tabIndex={-1} data-cake-dialog role="dialog" aria-modal="true" aria-labelledby="sheet-content-title" className="bg-white w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl shadow-xl p-6 md:p-8 text-slate-700">
      <div className="flex items-start justify-between gap-4"><div><span className="text-xs font-semibold uppercase tracking-widest text-rose-700">Website content</span><h2 id="sheet-content-title" className="text-2xl font-bold mt-2 text-rose-900 flex items-center gap-2"><Database size={23}/> Website data</h2></div><button onClick={onClose} aria-label="Close website data settings" className="p-2 rounded-full hover:bg-rose-50"><X size={20}/></button></div>
      <div className="my-6 rounded-2xl border border-rose-100 bg-rose-50 p-4" aria-live="polite">
        <strong className="text-sm text-rose-900">{status.state === 'connected' ? 'Connected' : status.state === 'loading' ? 'Checking connection…' : 'Connection needs attention'}</strong>
        <p className="text-sm mt-1">{source}</p>
        <p className="text-sm mt-2">Active database: {databaseBackendLabel(databaseBackend)}</p>
        {status.lastSyncedAt && <p className="text-xs mt-2 text-slate-500">Last loaded: {new Date(status.lastSyncedAt).toLocaleString('en-BD',{timeZone:'Asia/Dhaka'})}</p>}
        {status.error && <p role="status" className="text-xs mt-3 leading-relaxed text-amber-900">{status.error}</p>}
      </div>
      <div className="mb-6 rounded-xl border border-slate-200 p-4 text-xs leading-relaxed">
        <strong>{orderSubmissionEnabled ? 'Live order submission is enabled' : 'Live order submission is unavailable'}</strong>
        <p className="mt-1">{orderSubmissionEnabled ? 'Checkout saves cash-on-delivery orders in the active server database. Customer details stay private.' : 'Check Database connection and the deployed backend version before enabling orders.'}</p>
      </div>
      <div className="mb-6 rounded-xl border border-slate-200 p-4 text-sm leading-relaxed">
        <strong>Manage your website</strong>
        <p className="mt-1">Use Staff login → Website manager to edit business details, text, products and images.</p>
        {databaseBackend === 'supabase' && <p className="mt-2">The active database is Supabase. Editing the old Google Sheet does not update these website records.</p>}
        {databaseBackend === 'unknown' && <p className="mt-2">Confirm the active database in Database connection before any initial database setup.</p>}
        {onOpenStaffPortal && <button type="button" onClick={onOpenStaffPortal} className="mt-3 rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-semibold text-white">Open Staff login</button>}
      </div>
      <form onSubmit={event => { event.preventDefault(); setError(''); try { onSaveEndpoint(url); } catch (e) { setError(e instanceof Error ? e.message : 'Invalid web app URL.'); } }} className="space-y-3">
        <label htmlFor="sheets-endpoint" className="block text-sm font-semibold">Apps Script web app URL</label><input id="sheets-endpoint" type="url" value={url} onChange={event => setUrl(event.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-3 text-xs" required/>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="bg-rose-700 text-white rounded-xl px-4 py-2.5 text-xs font-semibold">Save & connect</button>
          <button type="button" onClick={() => void onRefresh()} className="border border-rose-200 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2" disabled={status.state === 'loading'}><RefreshCw size={14}/>Refresh now</button>
          {databaseBackend === 'supabase' && <a href="https://supabase.com/dashboard/project/dtvefwpaxwffxglqbfoo" target="_blank" rel="noopener noreferrer" className="border border-rose-200 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">Open Supabase project<ExternalLink size={13}/></a>}
          {databaseBackend === 'google_sheets' && <a href="https://docs.google.com/spreadsheets/d/18B0chk742grOCG4Wdx3w8Cn_sZFBCxc3WHbCtZBshY4/edit" target="_blank" rel="noopener noreferrer" className="border border-rose-200 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">Open source Sheet<ExternalLink size={13}/></a>}
        </div>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-7 border-t border-slate-100 pt-6">
        <h3 className="font-bold text-sm text-rose-900">Update the existing backend</h3>
        <ol className="list-decimal pl-5 mt-3 text-xs leading-7 space-y-2">
          <li>Back up the existing Apps Script code. Replace it with the complete backend below, keeping existing Script Properties and avoiding duplicate modules.</li>
          <li>Deploy a new version of the existing web app: Execute as yourself, access for Anyone. Keep the current <code>/exec</code> URL.</li>
        </ol>
        <p className="mt-3 text-xs leading-relaxed">Routine updates preserve the current database. Database initialization is not part of a routine update.</p>
        {databaseBackend === 'google_sheets' && <details className="mt-3 text-xs leading-relaxed"><summary>Initial Google Sheets setup only</summary><p className="mt-2">For a new, backed-up Sheet database, the owner can run <code>setupSheetDatabase</code> before the first deployment. Follow the migration guide separately when transferring existing data.</p></details>}
        <div className="flex flex-wrap gap-2 mt-4"><button onClick={download} className="border border-slate-200 rounded-xl px-4 py-2 text-xs flex items-center gap-2"><Download size={14}/>Download setup code</button><button onClick={() => void copy()} className="border border-slate-200 rounded-xl px-4 py-2 text-xs flex items-center gap-2">{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copied' : 'Copy setup code'}</button></div>
      </div>
      <p className="text-xs text-slate-500 mt-6 leading-relaxed">Visible pages refresh from the live backend every minute. Use verified Staff login to manage website content and orders. Public catalogue responses keep customer details private.</p>
    </div>
  </div>;
}
