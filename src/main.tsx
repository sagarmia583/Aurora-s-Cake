import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {isFirebaseStaffPreviewRoute} from './services/firebasePreviewRouting';

// Load Firebase SDK on demand; ordinary visitors don't download it unless
// a future feature explicitly uses Firebase.
const FirebaseDiagnosticPanel = React.lazy(
  () => import('./components/FirebaseDiagnosticPanel').then(module => ({
    default: module.FirebaseDiagnosticPanel,
  }))
);
const showFirebaseDiagnostic =
  new URLSearchParams(window.location.search).get('firebase-check') === '1';
const PosDesignPreview=React.lazy(()=>import('./components/PosDesignPreview'));
const showPosPreview=import.meta.env.DEV&&new URLSearchParams(window.location.search).get('pos-preview')==='1';
const FirebaseStaffPreview = React.lazy(
  () => import('./components/FirebaseStaffPreview').then(module=>({
    default:module.FirebaseStaffPreview
  }))
);
const showFirebaseStaffPreview =
  isFirebaseStaffPreviewRoute(window.location.hostname,window.location.search,window.location.pathname);

createRoot(document.getElementById('root')!).render(
  showPosPreview?<Suspense fallback={<p>POS preview লোড হচ্ছে…</p>}><PosDesignPreview/></Suspense>:
  showFirebaseStaffPreview ? <Suspense fallback={<p>Loading secure Staff Preview…</p>}><FirebaseStaffPreview /></Suspense> :
  <>
    <App />
    {showFirebaseDiagnostic && (
      <Suspense fallback={null}>
        <FirebaseDiagnosticPanel />
      </Suspense>
    )}
  </>
);
