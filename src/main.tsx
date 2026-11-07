import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ORDER_TRACKING_PATH } from '../apps/staff-mobile/src/orderTrackingLink';
const PosDesignPreview=React.lazy(()=>import('./components/PosDesignPreview'));
const SharedOrderPage=React.lazy(()=>import('./components/SharedOrderPage'));
const showPosPreview=import.meta.env.DEV&&new URLSearchParams(window.location.search).get('pos-preview')==='1';
createRoot(document.getElementById('root')!).render(
 window.location.pathname===ORDER_TRACKING_PATH
 ? <Suspense fallback={null}><SharedOrderPage/></Suspense>
 : showPosPreview?<Suspense fallback={<p>POS preview লোড হচ্ছে…</p>}><PosDesignPreview/></Suspense>:<App/>
);
