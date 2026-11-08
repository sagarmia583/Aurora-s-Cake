import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {execFileSync} from 'node:child_process';
import {defineConfig, loadEnv} from 'vite';
import {bakeryApi} from './scripts/vite-bakery-api.mjs';
import {orderReceiptPreview} from './scripts/vite-order-preview.mjs';

// GitHub Pages serves project sites below /<repo>/. Rebase only that build:
// Netlify, Cloudflare, dev and the Apps Script backend remain untouched.
const githubPagesBuild=process.env.AURORA_GITHUB_PAGES==='true';
const githubPagesBase='/Aurora-s-Cake/';
const githubPagesAssets=()=>({
  name:'aurora-github-pages-public-assets',
  enforce:'pre' as const,
  transform(code:string,id:string){
    if(!githubPagesBuild||!/[\\/]src[\\/].*\.[jt]sx?$/.test(id))return null;
    // Bundled/default catalogue URLs are public Vite assets, not API routes.
    const updated=code.replace(/(["'`])\/(images|fonts)\//g,(_match,quote:string,folder:string)=>
      quote+githubPagesBase+folder+'/');
    return updated===code?null:{code:updated,map:null};
  },
  transformIndexHtml(html:string){
    if(!githubPagesBuild)return html;
    return html.replace('https://aurorascake.netlify.app/','https://sagarmia583.github.io/Aurora-s-Cake/')
      .replace(/href="\/(favicon\.svg|fonts\/[^"]+)"/g,(_match,asset:string)=>'href="'+githubPagesBase+asset+'"');
  },
});

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
    base:githubPagesBuild?githubPagesBase:'/',
    plugins: [githubPagesAssets(),react(), tailwindcss(), bakeryApi(env.VITE_GOOGLE_SHEETS_URL), orderReceiptPreview()],
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
