import React, { useEffect, useRef } from 'react';
import { X, Database, RefreshCw, Server, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { databaseBackendLabel, type BackendDatabaseStatus } from '../services/backendDatabaseStatus';

interface SupabaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: BackendDatabaseStatus;
  loading: boolean;
  onRefresh: () => void;
}

export const SupabaseSyncModal: React.FC<SupabaseSyncModalProps> = ({ isOpen, onClose, status, loading, onRefresh }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previousFocus?.focus();
  }, [isOpen]);

  if (!isOpen) return null;
  const modeKnown = status.available && status.backend !== 'unknown';
  const mode = databaseBackendLabel(status.backend);
  const checks = status.scheduledChecks;
  const releaseLabel = status.upToDate === true ? 'Up to date' : status.upToDate === false ? 'Update required' : 'Status unknown';

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    if (!buttons?.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="database-status-title" onKeyDown={onDialogKeyDown}
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Database className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="database-status-title" className="font-black text-base">Production database status</h2>
              <p className="text-xs text-slate-400">Current server mode and scheduled check configuration.</p>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close database status"
            className="w-8 h-8 shrink-0 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-slate-800" aria-busy={loading}>
          <div className={`rounded-2xl border p-4 ${modeKnown ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center gap-2 font-bold">
              {modeKnown ? <CheckCircle className="w-5 h-5 text-emerald-600" aria-hidden="true" /> : <AlertCircle className="w-5 h-5 text-amber-600" aria-hidden="true" />}
              <h3>Active database: {mode}</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {status.backend === 'google_sheets' ? 'The production backend is using Google Sheets.' :
                status.backend === 'supabase' ? 'The production backend is using Supabase.' :
                'The production server has not confirmed its current database mode.'}
            </p>
          </div>

          <section className="rounded-2xl border border-slate-200 p-4" aria-labelledby="backend-release-title">
            <h3 id="backend-release-title" className="font-bold flex items-center gap-2"><Server className="w-4 h-4" aria-hidden="true" />Backend release</h3>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
              <dt className="text-slate-500">Installed version</dt><dd className="break-all">{status.installedRelease || 'Unavailable'}</dd>
              <dt className="text-slate-500">Release status</dt><dd>{releaseLabel}</dd>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4" aria-labelledby="scheduled-checks-title">
            <h3 id="scheduled-checks-title" className="font-bold flex items-center gap-2"><Clock className="w-4 h-4" aria-hidden="true" />Scheduled operational checks</h3>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
              <dt className="text-slate-500">Schedule</dt><dd>{checks.available ? checks.enabled ? 'Enabled' : 'Disabled' : 'Status unavailable'}</dd>
              <dt className="text-slate-500">Server configuration</dt><dd>{checks.available ? checks.configured ? 'Configured' : 'Incomplete' : 'Status unavailable'}</dd>
            </dl>
            <p className="mt-3 text-xs text-slate-500">Configuration is shown separately from the active database mode. Database settings are managed on the server.</p>
          </section>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500" role="status" aria-live="polite">{loading ? 'Checking production status…' : 'Status supplied by the production server.'}</p>
            <button type="button" onClick={onRefresh} disabled={loading}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 cursor-pointer disabled:cursor-default">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh status
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
