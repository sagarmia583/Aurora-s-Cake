/**
 * Aurora's Cake — Firebase PRIMARY public catalog, phase 1 (read only).
 *
 * Data source is private Firestore document storefront_public/catalog_current.
 * This endpoint never reads or contacts Google Sheets. It DOES NOT authorize
 * new checkouts; order_submission_enabled is forced false until a separately
 * audited Firestore checkout implementation is deployed.
 *
 * Admin SDK Google OAuth runs only inside Cloudflare Worker / local migration.
 */
import { getGoogleAccessToken, firebaseMirrorConfiguration } from '../api/lib/firestoreOrderMirror.js';
import { normalizePublicSiteData } from '../src/services/googleSheets.ts';

export const CATALOG_DOC_URL='https://firestore.googleapis.com/v1/projects/aurorascake-213a0/databases/(default)/documents/storefront_public/catalog_current';
export const CATALOG_MAX_BYTES=750000;
const REQUIRED_COLLECTIONS=['products','categories','flavors','addons','zones','slots','coupons','banners','reviews','hero_slides','highlights','faqs','links'];

const json=(status,value)=>new Response(JSON.stringify(value),{
  status,headers:{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'
  }
});
const isObject=(value)=>value!==null&&typeof value==='object'&&!Array.isArray(value);

/**
 * Existing storefront public schema, with a strict no-secrets boundary.
 * All canonical display fields are normalized through the existing allowlist.
 * This protects against accidentally publishing private staff/order fields.
 */
export function validatePublicCatalog(input) {
  const body=isObject(input)&&isObject(input.data)
    ? {...input.data,schema_version:input.data.schema_version??input.schema_version}
    : input;
  if(!isObject(body)||body.schema_version!==1) throw new Error('invalid_catalog_schema');
  if(!isObject(body.settings)||!isObject(body.content))throw new Error('invalid_catalog_shape');
  for(const field of REQUIRED_COLLECTIONS){
    if(!Array.isArray(body[field]))throw new Error('missing_catalog_'+field);
  }
  if(!Array.isArray(body.products)||body.products.length===0)
    throw new Error('catalog_has_no_products');
  const normalized=normalizePublicSiteData(body);
  if(!Array.isArray(normalized.products)||!normalized.products.length)
    throw new Error('invalid_catalog_products');
  // Never activate checkout merely because a catalog was imported; that
  // would silently route orders into a legacy or partially migrated backend.
  return { ...normalized,order_submission_enabled:false };
}

export function makePrivateCatalogDocument(input,{source='owner_import'}={}) {
  const clean=validatePublicCatalog(input);
  const catalogJson=JSON.stringify(clean);
  if(new TextEncoder().encode(catalogJson).byteLength>CATALOG_MAX_BYTES)
    throw new Error('catalog_too_large');
  return { fields:{
    schema_version:{integerValue:'1'},
    catalog_json:{stringValue:catalogJson},
    source:{stringValue:source},
    updated_at:{timestampValue:new Date().toISOString()},
  }};
}
export function decodePublicCatalogDocument(document){
  if(!isObject(document?.fields)||
      document.fields.schema_version?.integerValue!=='1'||
      typeof document.fields.catalog_json?.stringValue!=='string')
    throw new Error('invalid_firestore_catalog_record');
  const raw=document.fields.catalog_json.stringValue;
  if(new TextEncoder().encode(raw).byteLength>CATALOG_MAX_BYTES)
    throw new Error('catalog_too_large');
  let parsed;
  try{parsed=JSON.parse(raw);}catch{throw new Error('invalid_firestore_catalog_json');}
  return validatePublicCatalog(parsed);
}

/**
 * The Worker uses IAM service-account credentials; Firestore client rules
 * continue to deny all public writes and reads to private documents.
 */
export async function loadPrivateFirestoreCatalog({env=process.env,fetcher=globalThis.fetch}={}){
  const status=firebaseMirrorConfiguration({...env,FIREBASE_MIRROR_ENABLED:'true'});
  if(!status.configured)return {ok:false,code:status.reason};
  let token;
  try{token=await getGoogleAccessToken(fetcher,{...env,FIREBASE_MIRROR_ENABLED:'true'});}
  catch{return {ok:false,code:'firebase_auth_unavailable'};}
  let reply;
  try{reply=await fetcher(CATALOG_DOC_URL,{
    method:'GET',
    headers:{Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(6000),
  });}catch{return {ok:false,code:'firestore_unavailable'};}
  if(reply.status===404)return {ok:false,code:'catalog_not_seeded'};
  if(!reply.ok)return {ok:false,code:reply.status===403?'firestore_permission_denied':'firestore_unavailable'};
  try{
    const doc=await reply.json();
    return {ok:true,catalog:decodePublicCatalogDocument(doc),updated_at:doc.updateTime||null};
  }catch{return {ok:false,code:'catalog_invalid'};}
}

/** A separate route, not yet wired to the production storefront or checkout. */
export async function firebasePrimaryCatalogHandler({request,env},opts={}){
  if(request.method!=='GET'&&request.method!=='HEAD')
    return json(405,{ok:false,error:'GET or HEAD required'});
  const enabled=env?.FIREBASE_PRIMARY_CATALOG_ENABLED==='true';
  if(!enabled)return json(503,{ok:false,code:'firebase_primary_catalog_disabled'});
  const result=await loadPrivateFirestoreCatalog({env,fetcher:opts.fetcher||globalThis.fetch});
  if(!result.ok) return json(503,{ok:false,code:result.code});
  const data={ok:true,provider:'firestore',schema_version:1,
    order_submission_enabled:false,updated_at:result.updated_at,data:result.catalog};
  return request.method==='HEAD'
    ? new Response(null,{status:200,headers:{'Cache-Control':'no-store'}})
    :json(200,data);
}
