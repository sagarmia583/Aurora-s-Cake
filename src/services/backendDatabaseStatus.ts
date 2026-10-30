export type DatabaseBackend = 'google_sheets' | 'supabase' | 'unknown';

export function databaseBackendLabel(backend: DatabaseBackend): string {
  return backend === 'google_sheets' ? 'Google Sheets' : backend === 'supabase' ? 'Supabase' : 'Status unknown';
}

export interface BackendDatabaseStatus {
  available: boolean;
  backend: DatabaseBackend;
  installedRelease: string | null;
  upToDate: boolean | null;
  scheduledChecks: {
    available: boolean;
    enabled: boolean | null;
    configured: boolean | null;
  };
}

export function unknownBackendDatabaseStatus(): BackendDatabaseStatus {
  return {
    available: false, backend: 'unknown', installedRelease: null, upToDate: null,
    scheduledChecks: { available: false, enabled: null, configured: null },
  };
}

/** Only production backend health can identify the active database mode. */
export function parseBackendDatabaseStatus(backend: unknown, health: unknown): BackendDatabaseStatus {
  const status = unknownBackendDatabaseStatus();
  if (backend && typeof backend === 'object' && !Array.isArray(backend)) {
    const record = backend as Record<string, unknown>;
    if (record.ok === true) {
      status.available = true;
      if (record.database_backend === 'google_sheets' || record.database_backend === 'supabase') {
        status.backend = record.database_backend;
      }
      if (typeof record.installed_release === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(record.installed_release)) {
        status.installedRelease = record.installed_release;
      }
      if (typeof record.up_to_date === 'boolean') status.upToDate = record.up_to_date;
    }
  }
  if (health && typeof health === 'object' && !Array.isArray(health)) {
    const record = health as Record<string, unknown>;
    if (record.ok === true && record.provider === 'supabase' &&
        typeof record.enabled === 'boolean' && typeof record.configured === 'boolean') {
      status.scheduledChecks = { available: true, enabled: record.enabled, configured: record.configured };
    }
  }
  return status;
}

async function fetchStatus(path: string, fetcher: typeof fetch, signal: AbortSignal): Promise<unknown> {
  const response = await fetcher(path, {
    method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error',
    headers: { Accept: 'application/json' }, signal,
  });
  if (!response.ok) return null;
  return response.json();
}

/** Same-origin read-only diagnostics. No browser database client or credentials. */
export async function loadBackendDatabaseStatus(options: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<BackendDatabaseStatus> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 15000);
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  try {
    if (controller.signal.aborted) return unknownBackendDatabaseStatus();
    const results = await Promise.allSettled([
      fetchStatus('/api/backend-health', options.fetcher || fetch, controller.signal),
      fetchStatus('/api/supabase-health', options.fetcher || fetch, controller.signal),
    ]);
    if (controller.signal.aborted) return unknownBackendDatabaseStatus();
    return parseBackendDatabaseStatus(
      results[0].status === 'fulfilled' ? results[0].value : null,
      results[1].status === 'fulfilled' ? results[1].value : null,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
