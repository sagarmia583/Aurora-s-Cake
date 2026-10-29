import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {execFileSync} from 'node:child_process';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  // Include the exact Git build revision in the Firebase migration preview.
  // This is PUBLIC metadata, not a credential; useful when browser caches
  // or Cloudflare rollouts serve a prior JavaScript asset.
  let buildId=process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '';
  if(!buildId){
    try{buildId=execFileSync('git',['rev-parse','--short=8','HEAD'],{
      encoding:'utf8',stdio:['ignore','pipe','ignore']
    }).trim();}catch{buildId='local';}
  }
  // Cloudflare Pages must route *all* order/staff POSTs through its same-origin
  // API so the server can mirror backend-verified commits to Firestore.
  // Without this default a missing build variable would silently send orders
  // straight to Apps Script and bypass the Firebase mirror.
  if (process.env.CF_PAGES === '1') {
    process.env.VITE_SHEETS_POST_PROXY = '/api/operations';
  }
  return {
    plugins: [react(), tailwindcss()],
    define: { __AURORA_BUILD_ID__: JSON.stringify(buildId.slice(0,12)) },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
