import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PUBLIC_SITE_DATA } from '../src/content/defaultSiteData';
import {
  CATALOG_DOC_URL,decodePublicCatalogDocument,makePrivateCatalogDocument,
  validatePublicCatalog,firebasePrimaryCatalogHandler
} from '../cloudflare/firebasePrimaryCatalog.js';
import worker from '../cloudflare/worker.js';

const fixture=()=>structuredClone(DEFAULT_PUBLIC_SITE_DATA);
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,
  privateKeyEncoding:{type:'pkcs8',format:'pem'},
  publicKeyEncoding:{type:'spki',format:'pem'}});
const env={
  FIREBASE_MIRROR_ENABLED:'true',
  FIREBASE_PRIMARY_CATALOG_ENABLED:'true',
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',
    project_id:'aurorascake-213a0',
    client_email:'test-catalog@aurorascake-213a0.iam.gserviceaccount.com',
    private_key:privateKey}),
};
const req=(path='/api/firebase-primary/catalog',method='GET')=>
  new Request('https://aurora-s-cake.sagarmia583.workers.dev'+path,{method});

test('schema v1 public catalog can be encoded into Firestore and decoded',()=>{
  const catalog=fixture();
  catalog.order_submission_enabled=true;
  const record=makePrivateCatalogDocument({...catalog,staff_accounts:[{password:'SECRET'}]});
  assert.equal(record.fields.schema_version.integerValue,'1');
  const decoded=decodePublicCatalogDocument(record);
  assert.equal(decoded.order_submission_enabled,false);
  assert.equal(decoded.products.length,catalog.products.length);
  assert.equal(JSON.stringify(decoded).includes('SECRET'),false);
  assert.equal(JSON.stringify(decoded).includes('staff_accounts'),false);
});
test('invalid and empty public catalogs fail closed',()=>{
  const catalog=fixture();
  assert.throws(()=>validatePublicCatalog({...catalog,products:[]}),/catalog_has_no_products/);
  assert.throws(()=>validatePublicCatalog({...catalog,slots:undefined}),/missing_catalog_slots/);
  assert.throws(()=>validatePublicCatalog({...catalog,schema_version:2}),/invalid_catalog_schema/);
  assert.throws(()=>decodePublicCatalogDocument({fields:{}}),/invalid_firestore_catalog_record/);
  const broken=makePrivateCatalogDocument(catalog);
  broken.fields.catalog_json.stringValue='invalid';
  assert.throws(()=>decodePublicCatalogDocument(broken),/invalid_firestore_catalog_json/);
});
test('Firebase primary catalog route is read-only, disabled unless configured',async()=>{
  const disabled=await firebasePrimaryCatalogHandler({request:req(),env:{...env,FIREBASE_PRIMARY_CATALOG_ENABLED:'false'}});
  assert.equal(disabled.status,503);
  assert.equal((await disabled.json() as any).code,'firebase_primary_catalog_disabled');
  const method=await firebasePrimaryCatalogHandler({request:req(undefined,'POST'),env});
  assert.equal(method.status,405);
});
test('Firebase catalog returns 503 until seeded; never returns demo prices as real catalog',async()=>{
  const calls:string[]=[];
  const fetcher=async (url:RequestInfo|URL,options?:RequestInit)=>{
    const value=String(url);calls.push(value);
    if(value.includes('oauth2.googleapis.com/token'))
      return new Response(JSON.stringify({access_token:'test_token',expires_in:3600}),{status:200});
    assert.equal(value,CATALOG_DOC_URL);
    assert.equal(options?.method,'GET');
    return new Response('',{status:404});
  };
  const response=await firebasePrimaryCatalogHandler({request:req(),env},{fetcher:fetcher as typeof fetch});
  assert.equal(response.status,503);
  assert.equal((await response.json() as any).code,'catalog_not_seeded');
  assert.ok(calls.includes(CATALOG_DOC_URL));
});
test('Firebase primary reads a fixed authorized doc and strips private fields',async()=>{
  const record=makePrivateCatalogDocument({...fixture(),private_token:'NOT_FOR_CUSTOMERS'});
  const requested:string[]=[];
  const fetcher=async (url:RequestInfo|URL,options?:RequestInit)=>{
    const value=String(url);requested.push(value);
    if(value.includes('oauth2.googleapis.com/token'))
      return new Response(JSON.stringify({access_token:'test_token',expires_in:3600}),{status:200});
    assert.equal(value,CATALOG_DOC_URL);
    assert.equal(options?.method,'GET');
    assert.match(String((options?.headers as Record<string,string>)?.Authorization),/^Bearer /);
    return new Response(JSON.stringify({...record,updateTime:'2026-10-29T07:00:00Z'}),{status:200});
  };
  const response=await firebasePrimaryCatalogHandler({request:req(),env},{fetcher:fetcher as typeof fetch});
  assert.equal(response.status,200);
  const result=await response.json() as any;
  assert.equal(result.provider,'firestore');
  assert.equal(result.order_submission_enabled,false);
  assert.equal(result.data.order_submission_enabled,false);
  assert.equal(result.data.products.length,fixture().products.length);
  assert.equal(JSON.stringify(result).includes('NOT_FOR_CUSTOMERS'),false);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(requested.filter(x=>x===CATALOG_DOC_URL).length,1);
});
test('Worker dispatches primary catalog route without opening private arbitrary paths',async()=>{
  const r=await worker.fetch(req('/api/firebase-primary/catalog','POST'),{
    ...env,ASSETS:{fetch:async()=>new Response('asset')},
  });
  assert.equal(r.status,405);
  const unknown=await worker.fetch(req('/api/firebase-primary/private-orders'),{
    ...env,ASSETS:{fetch:async()=>new Response('asset')},
  });
  assert.equal(unknown.status,404);
});
