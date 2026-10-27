import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Load Firebase SDK on demand; ordinary visitors don't download it unless
// a future feature explicitly uses Firebase.
const FirebaseDiagnosticPanel = React.lazy(
  () => import('./components/FirebaseDiagnosticPanel').then(module => ({
    default: module.FirebaseDiagnosticPanel,
  }))
);
const showFirebaseDiagnostic =
  new URLSearchParams(window.location.search).get('firebase-check') === '1';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    {showFirebaseDiagnostic && (
      <Suspense fallback={null}>
        <FirebaseDiagnosticPanel />
      </Suspense>
    )}
  </>
);
