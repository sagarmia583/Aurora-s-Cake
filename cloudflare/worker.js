/**
 * Aurora’s Cake on Cloudflare Workers + Static Assets.
 *
 * Cloudflare Pages Functions are not auto-discovered by a Workers project.
 * This entrypoint delegates the same audited API paths to their Pages
 * handlers, while Wrangler serves Vite's static assets without Worker CPU.
 */
import { onRequest as operations } from '../functions/api/operations.js';
import { onRequest as publicData } from '../functions/api/public.js';
import { onRequest as image } from '../functions/api/image.js';
import { onRequest as backendHealth } from '../functions/api/backend-health.js';
import { onRequest as firebaseStatus } from '../functions/api/firebase-sync-status.js';
import { json } from './shared.js';
import { firebasePrimaryCatalogHandler } from './firebasePrimaryCatalog.js';

const routes = new Map([
  ['/api/operations', operations],
  ['/api/public', publicData],
  ['/api/image', image],
  ['/api/backend-health', backendHealth],
  ['/api/firebase-sync-status', firebaseStatus],
  ['/api/firebase-primary/catalog', firebasePrimaryCatalogHandler],
]);

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const handler = routes.get(pathname);
    if (handler) return handler({request,env});
    // API requests must never receive the React index.html fallback.
    if (pathname.startsWith('/api/')) return json(404,{ok:false,error:'Unknown API route.'});
    // Wrangler handles normal assets before the Worker. This is a safe fallback.
    return env.ASSETS.fetch(request);
  },
};
