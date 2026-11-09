import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ORDER_TRACKING_PATH } from '../apps/staff-mobile/src/orderTrackingLink';
const SharedOrderPage=React.lazy(()=>import('./components/SharedOrderPage'));
createRoot(document.getElementById('root')!).render(
 window.location.pathname.replace(/\/$/, '')===ORDER_TRACKING_PATH
 ? <Suspense fallback={null}><SharedOrderPage/></Suspense>
 : <App/>
);
