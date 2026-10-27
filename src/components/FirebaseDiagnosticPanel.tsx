import React, { useEffect, useState } from 'react';
import { getFirebaseConfigurationStatus, getFirebaseServices } from '../services/firebaseClient';

type Diagnostic = { ok: boolean; message: string };

export function FirebaseDiagnosticPanel() {
  const [diagnostic, setDiagnostic] = useState<Diagnostic>({
    ok: false,
    message: 'Checking Firebase settings...',
  });

  useEffect(() => {
    let active = true;
    const status = getFirebaseConfigurationStatus();
    if (!status.enabled || !status.configured) {
      setDiagnostic({
        ok: false,
        message: !status.enabled
          ? 'Firebase disabled. Set VITE_FIREBASE_ENABLED=true and redeploy.'
          : 'Missing environment variables: ' + status.missing.join(', '),
      });
      return;
    }
    void getFirebaseServices()
      .then((firebase) => firebase.checkConnection())
      .then((result) => {
        if (active) setDiagnostic({ ok: result.ok, message: result.message });
      })
      .catch((error: unknown) => {
        if (active) setDiagnostic({
          ok: false,
          message: error instanceof Error ? error.message : 'Firebase SDK initialization failed.',
        });
      });
    return () => { active = false; };
  }, []);

  return (
    <aside role="status" aria-live="polite" style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 9999,
      background: '#ffffff', color: '#15291d',
      border: '1px solid #d9e1d9', borderRadius: 12,
      padding: 16, maxWidth: 360, boxShadow: '0 8px 28px #0002',
      fontFamily: 'system-ui, sans-serif', fontSize: 14,
    }}>
      <strong>Firebase connection check</strong>
      <p style={{ margin: '8px 0 0' }}>
        {diagnostic.ok ? 'Connected: ' : 'Not connected: '}{diagnostic.message}
      </p>
    </aside>
  );
}
