import React, { useState } from 'react';
import { X, RefreshCw, ExternalLink, Database, Download, Copy, Check } from 'lucide-react';
import { useCakeDialog } from './useCakeDialog';
import type { SheetContentStatus } from '../hooks/useGoogleSheetContent';
import backendCode from '../../apps-script/Code.gs?raw';
import seedCode from '../../apps-script/SeedData.gs?raw';
interface Props {
  isOpen: boolean; onClose: () => void; endpoint: string; status: SheetContentStatus;
  onRefresh: () => Promise<void>; onSaveEndpoint: (value: string) => void;
}
export const SheetContentPanel = (props: Props) => props.isOpen ? <SheetContentDialog {...props}/> : null;
function SheetContentDialog({ onClose, endpoint, status, onRefresh, onSaveEndpoint }: Props) {
  const ref = useCakeDialog(onClose);
  const [url, setUrl] = useState(endpoint);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const source = status.source === 'google_sheets' ? 'Live Google Sheets' : status.source === 'saved_snapshot' ? 'Last saved Sheet snapshot' : 'Built-in preview content';
  const setupCode = seedCode + '\n\n' + backendCode;
  const download = () => {
    const blob = new Blob([setupCode], { type:'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = href; link.download = 'Aurora-Sheets-Code.gs'; link.click(); URL.revokeObjectURL(href);
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
      <div className="flex items-start justify-between gap-4"><div><span className="text-xs font-semibold uppercase tracking-widest text-rose-700">Website content</span><h2 id="sheet-content-title" className="text-2xl font-bold mt-2 text-rose-900 flex items-center gap-2"><Database size={23}/> Google Sheets</h2></div><button onClick={onClose} aria-label="Close Google Sheets settings" className="p-2 rounded-full hover:bg-rose-50"><X size={20}/></button></div>
      <div className="my-6 rounded-2xl border border-rose-100 bg-rose-50 p-4" aria-live="polite">
        <strong className="text-sm text-rose-900">{status.state === 'connected' ? 'Connected' : status.state === 'loading' ? 'Checking connection…' : 'Setup needs attention'}</strong><p className="text-sm mt-1">{source}</p>
        {status.lastSyncedAt && <p className="text-xs mt-2 text-slate-500">Last loaded: {new Date(status.lastSyncedAt).toLocaleString('en-BD',{timeZone:'Asia/Dhaka'})}</p>}
        {status.error && <p role="status" className="text-xs mt-3 leading-relaxed text-amber-900">{status.error}</p>}
      </div>
      <form onSubmit={event => { event.preventDefault(); setError(''); try { onSaveEndpoint(url); } catch (e) { setError(e instanceof Error ? e.message : 'Invalid web app URL.'); } }} className="space-y-3">
        <label htmlFor="sheets-endpoint" className="block text-sm font-semibold">Apps Script web app URL</label><input id="sheets-endpoint" type="url" value={url} onChange={event => setUrl(event.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-3 text-xs" required/>
        <div className="flex flex-wrap gap-2"><button type="submit" className="bg-rose-700 text-white rounded-xl px-4 py-2.5 text-xs font-semibold">Save & connect</button><button type="button" onClick={() => void onRefresh()} className="border border-rose-200 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2" disabled={status.state === 'loading'}><RefreshCw size={14}/>Refresh now</button><a href="https://docs.google.com/spreadsheets/d/18B0chk742grOCG4Wdx3w8Cn_sZFBCxc3WHbCtZBshY4/edit" target="_blank" rel="noopener noreferrer" className="border border-slate-200 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">Open your Sheet<ExternalLink size={13}/></a></div>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-7 border-t border-slate-100 pt-6"><h3 className="font-bold text-sm text-rose-900">One-time setup</h3><ol className="list-decimal pl-5 mt-3 text-xs leading-7 space-y-2"><li>In your Sheet, open Extensions → Apps Script. Add the supplied setup code without overwriting unrelated project code.</li><li>Run <code>setupSheetDatabase</code> once. It creates missing public content tabs and preserves existing data.</li><li>Deploy a web app using this read-only code: Execute as yourself, access for Anyone. Paste its <code>/exec</code> URL above.</li></ol>
        <div className="flex flex-wrap gap-2 mt-4"><button onClick={download} className="border border-slate-200 rounded-xl px-4 py-2 text-xs flex items-center gap-2"><Download size={14}/>Download setup code</button><button onClick={() => void copy()} className="border border-slate-200 rounded-xl px-4 py-2 text-xs flex items-center gap-2">{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copied' : 'Copy setup code'}</button></div>
      </div>
      <p className="text-xs text-slate-500 mt-6 leading-relaxed">Edit public business details in settings, text and images in content, and catalogue rows in the related tabs. Visible pages refresh from the Sheet every minute. Orders and customer profiles remain local demos; this endpoint never exposes them.</p>
    </div>
  </div>;
}
