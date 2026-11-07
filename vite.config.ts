import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {execFileSync} from 'node:child_process';
import {defineConfig, loadEnv} from 'vite';
import {bakeryApi} from './scripts/vite-bakery-api.mjs';
import {orderReceiptPreview} from './scripts/vite-order-preview.mjs';

export default defineConfig(({mode}) => {
  const env=loadEnv(mode,process.cwd(),'');
  // Stamp the Git revision on Netlify builds for debugging cached assets.
  let buildId=process.env.GITHUB_SHA || '';
  if(!buildId){
    try{buildId=execFileSync('git',['rev-parse','--short=8','HEAD'],{
      encoding:'utf8',stdio:['ignore','pipe','ignore']
    }).trim();}catch{buildId='local';}
  }
  // Only Netlify receives the same-origin Google Sheets write relay.
  if (process.env.NETLIFY === 'true') {
    process.env.VITE_SHEETS_POST_PROXY = '/api/operations';
  }
  return {
    // Shared order helpers live under staff-mobile, but the web build uses the root TypeScript config.
    tsconfig: './tsconfig.json',
    plugins: [react(), tailwindcss(), bakeryApi(env.VITE_GOOGLE_SHEETS_URL), orderReceiptPreview()],
    define: { __AURORA_BUILD_ID__: JSON.stringify(buildId.slice(0,12)) },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      cors: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
