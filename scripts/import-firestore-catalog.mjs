#!/usr/bin/env node
/**
 * One-time, LOCAL, reviewed import of Aurora's Cake public catalog into
 * private Cloud Firestore. Does not call Google Sheets or write to GitHub.
 *
 * Prerequisite: owner-exported PublicSiteData v1 JSON file.
 * Do NOT commit the service-account JSON or a copy containing customer data.
 *
 * npx tsx scripts/import-firestore-catalog.mjs --input ./catalog-export.json --key /outside/repo/firebase-key.json
 * npx tsx scripts/import-firestore-catalog.mjs --input ./catalog-export.json --key /outside/repo/firebase-key.json --write
 */
import {readFile} from 'node:fs/promises';
import {makePrivateCatalogDocument,CATALOG_DOC_URL} from '../cloudflare/firebasePrimaryCatalog.js';
import {getGoogleAccessToken} from '../api/lib/firestoreOrderMirror.js';

function argument(flag){
  const index=process.argv.indexOf(flag);
  return index>=0?process.argv[index+1]||'':null;
}
async function main(){
  const input=argument('--input');
  const keyPath=argument('--key')||process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const write=process.argv.includes('--write');
  const replace=process.argv.includes('--replace');
  if(!input||!keyPath)throw new Error('Usage: --input PUBLIC_CATALOG.json --key PRIVATE_SERVICE_ACCOUNT.json [--write] [--replace]');
  const data=JSON.parse(await readFile(input,'utf8'));
  const catalogDoc=makePrivateCatalogDocument(data,{source:'manual_owner_import'});
  const productCount=JSON.parse(catalogDoc.fields.catalog_json.stringValue).products.length;
  // No customer or staff records are contained in this validated public payload.
  console.log('Validated public catalog:',productCount,'products. No private orders were imported.');
  if(!write){console.log('Dry run only. Add --write to create Firestore storefront_public/catalog_current.');return;}
  const credentials=await readFile(keyPath,'utf8');
  const env={FIREBASE_MIRROR_ENABLED:'true',FIREBASE_SERVICE_ACCOUNT_JSON:credentials};
  const accessToken=await getGoogleAccessToken(fetch,env);
  const headers={Authorization:'Bearer '+accessToken,'Content-Type':'application/json'};
  const existing=await fetch(CATALOG_DOC_URL,{headers:{Authorization:headers.Authorization}});
  if(!existing.ok && existing.status!==404)throw new Error('Firestore preflight failed: HTTP '+existing.status);
  if(existing.ok&&!replace)throw new Error('Catalog already exists. Refusing to overwrite. Use --replace after reviewing the new public prices.');
  let condition='currentDocument.exists=false';
  if(existing.ok){
    const record=await existing.json();
    if(!record.updateTime)throw new Error('Firestore missing updateTime precondition.');
    condition='currentDocument.updateTime='+encodeURIComponent(record.updateTime);
  }
  const written=await fetch(CATALOG_DOC_URL+'?'+condition,{
    method:'PATCH',headers,body:JSON.stringify(catalogDoc),
  });
  if(!written.ok)throw new Error('Catalog write rejected: HTTP '+written.status);
  console.log('Firestore catalog saved. This does NOT activate checkout.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Catalog import failed.');process.exitCode=1;});
