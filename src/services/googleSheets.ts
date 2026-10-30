import type { PublicSiteData } from '../types/siteContent';
import type { ShopSettings, ProductVariant } from '../types';
import { DEFAULT_PUBLIC_SITE_DATA } from '../content/defaultSiteData';

const configuredEndpoint = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_GOOGLE_SHEETS_URL;
export const DEFAULT_SHEETS_ENDPOINT = configuredEndpoint || 'https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec';

export class GoogleSheetsError extends Error {
  constructor(public readonly code: 'permission_required' | 'invalid_response' | 'invalid_data' | 'invalid_endpoint' | 'network' | 'timeout', message: string) {
    super(message);
    this.name = 'GoogleSheetsError';
  }
}
type Row = Record<string, unknown>;
const SETTINGS_FIELDS = [
  'id','shop_name','logo_url','profile_image_url','phone','whatsapp','email','address','opening_time','closing_time','currency',
  'accepting_orders','delivery_enabled','website_title','website_description','top_announcement_text',
  'hero_tagline','hero_title','hero_subtitle','hero_cta_text',
  'trust_badge_1_title','trust_badge_1_desc','trust_badge_2_title','trust_badge_2_desc',
  'trust_badge_3_title','trust_badge_3_desc','trust_badge_4_title','trust_badge_4_desc',
  'custom_cake_promo_tag','custom_cake_promo_title','custom_cake_promo_desc','custom_cake_promo_btn','footer_about_text',
  'facebook_url','instagram_url','youtube_url','tiktok_url','website_url','whatsapp_url','maps_url',
  'brand_tagline','facebook_handle','logo_alt','mobile_subtitle','locale',
] as const;
const own = (object: Row, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const object = (value: unknown, path: string): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(path, 'must be an object');
  return value as Row;
};
const invalid = (path: string, detail: string) => new GoogleSheetsError('invalid_data', `${path} ${detail}.`);
const text = (value: unknown, fallback = '') => value === undefined || value === null ? fallback : String(value);
const bool = (value: unknown, fallback = true): boolean => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 0) return value === 1;
  const normalized = String(value).trim().toLowerCase();
  if (['true','yes','1','on'].includes(normalized)) return true;
  if (['false','no','0','off'].includes(normalized)) return false;
  throw invalid('Boolean value', 'must be TRUE or FALSE');
};
const number = (value: unknown, path: string, fallback?: number): number => {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw invalid(path, 'is required');
  }
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(parsed) || parsed < 0) throw invalid(path, 'must be a non-negative number');
  return parsed;
};
const optionalNumber = (value: unknown, path: string) => value === '' || value === undefined || value === null ? undefined : number(value, path);
const list = (value: unknown, path: string, separator = /[,\n]/): string[] => {
  if (value === undefined || value === null || value === '') return [];
  let array: unknown;
  if (Array.isArray(value)) array = value;
  else if (String(value).trim().startsWith('[')) {
    try { array = JSON.parse(String(value)); } catch { throw invalid(path, 'must contain a valid JSON list'); }
  } else array = String(value).split(separator);
  if (!Array.isArray(array)) throw invalid(path, 'must be a list');
  return [...new Set(array.map(v => text(v).trim()).filter(Boolean))];
};

/** Only public web links, mail/phone contact links and local asset paths are rendered. */
export function normalizePublicUrl(value: unknown, path = 'URL', image = false): string {
  const raw = text(value).trim();
  if (!raw) return '';
  if (/[\u0000-\u001f\u007f]/.test(raw)) throw invalid(path, 'contains an invalid character');
  if (/^\/(?!\/)/.test(raw) || (!image && /^#[A-Za-z0-9_-]+$/.test(raw))) return raw;
  if (!image && /^mailto:[^\s@]+@[^\s@]+/i.test(raw)) return raw;
  if (!image && /^tel:[+\d(). -]{3,}$/i.test(raw)) return raw;
  let url: URL;
  try { url = new URL(raw); } catch { throw invalid(path, 'must be an absolute HTTPS/HTTP URL or a local asset path'); }
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw invalid(path, 'uses an unsupported URL scheme');
  if (image && url.hostname === 'drive.google.com') {
    const fileId = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] || url.searchParams.get('id');
    if (fileId && /^[A-Za-z0-9_-]+$/.test(fileId)) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;
  }
  return url.href;
}
function records(value: unknown, path: string): Row[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw invalid(path, 'must be an array');
  if (value.length > 5000) throw invalid(path, 'has too many rows');
  return value.map((row, i) => object(row, `${path} row ${i + 2}`)).filter(row => Object.values(row).some(v => v !== '' && v !== null && v !== undefined));
}
function unique(rows: Row[], path: string): Row[] {
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    const id = text(row.id).trim();
    if (!id) throw invalid(`${path} row ${index + 2}`, 'needs an id');
    if (ids.has(id)) throw invalid(path, `contains duplicate id "${id}"`);
    ids.add(id);
  });
  return rows;
}
function keyValues(value: unknown, path: string): Row {
  if (value === undefined) return {};
  if (!Array.isArray(value)) return object(value, path);
  const rows = records(value, path);
  if (rows.length === 1 && !own(rows[0], 'key')) return rows[0];
  const result = Object.create(null) as Row;
  rows.forEach(row => {
    if (own(row, 'is_active') && !bool(row.is_active)) return;
    const baseKey = text(row.key).trim();
    const section = text(row.section).trim();
    const key = section && !baseKey.startsWith(section + '_') ? section + '_' + baseKey : baseKey;
    if (!/^[a-z][a-z0-9_]{0,100}$/.test(key)) throw invalid(path, 'contains an invalid or blank key');
    if (own(result, key)) throw invalid(path, `contains duplicate key "${key}"`);
    result[key] = row.value;
  });
  return result;
}
function parsePayload(input: unknown): Row {
  let parsed = input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('<')) {
      if (/accounts\.google\.com|sign.?in|ServiceLogin|Google Accounts/i.test(trimmed)) throw new GoogleSheetsError('permission_required', 'The Apps Script link requires Google sign-in. Deploy the read-only public-content web app before connecting it.');
      throw new GoogleSheetsError('invalid_response', 'Apps Script returned an HTML page instead of public website JSON. Install and deploy the supplied Code.gs.');
    }
    try { parsed = JSON.parse(trimmed); } catch { throw new GoogleSheetsError('invalid_response', 'The Apps Script response is not valid JSON.'); }
  }
  let payload = object(parsed, 'Sheet response');
  if (payload.schema_version !== undefined && Number(payload.schema_version) !== 1) throw new GoogleSheetsError('invalid_response', 'This website requires public data schema version 1.');
  if (payload.ok === false || payload.success === false) throw new GoogleSheetsError('invalid_response', text(payload.error || payload.message, 'The Sheet endpoint reported an error.'));
  if (payload.data !== undefined) payload = object(payload.data, 'Sheet response data');
  if (payload.tables !== undefined) payload = object(payload.tables, 'Sheet tables');
  if (!Object.keys(payload).some(key => ['settings','shop_settings','products','content'].includes(key.toLowerCase()))) throw new GoogleSheetsError('invalid_response', 'No public website tables were found in the Apps Script response.');
  if (payload.schema_version !== undefined && Number(payload.schema_version) !== 1) throw new GoogleSheetsError('invalid_response', 'This website requires public data schema version 1.');
  return payload;
}

/** Parse only allowlisted public fields; private Sheet columns are never copied into the website snapshot. */
export function normalizePublicSiteData(input: unknown, defaults: PublicSiteData = DEFAULT_PUBLIC_SITE_DATA): PublicSiteData {
  const payload = parsePayload(input);
  const lower = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key.toLowerCase(), value])) as Row;
  const lookup = (...keys: string[]) => {
    for (const key of keys) if (own(lower, key) && lower[key] !== undefined) return lower[key];
    return undefined;
  };
  const table = (keys: string[], fallback: unknown[]): Row[] => {
    const value = lookup(...keys);
    return value === undefined ? fallback as Row[] : unique(records(value, keys[0]), keys[0]);
  };
  const settingsSource = keyValues(lookup('settings', 'shop_settings'), 'settings');
  const settings: Row = { ...defaults.settings };
  const settingsFields = new Set<string>([...SETTINGS_FIELDS, ...Object.keys(defaults.settings)]);
  settingsFields.forEach(key => {
    if (!own(settingsSource, key)) return;
    if (/password|secret|token|api_key|anon_key|supabase/i.test(key)) return;
    const value = settingsSource[key];
    settings[key] = ['accepting_orders','delivery_enabled'].includes(key) ? bool(value, false)
      : /(?:url)$/.test(key) ? normalizePublicUrl(value, `settings.${key}`, /logo|image/.test(key))
      : text(value);
  });
  const contentSource = keyValues(lookup('content'), 'content');
  const content: Record<string,string> = { ...defaults.content };
  const contentFields = new Set(Object.keys(defaults.content));
  Object.entries(contentSource).forEach(([key, value]) => {
    if (!contentFields.has(key)) return;
    if (!/^[a-z][a-z0-9_]{0,100}$/.test(key) || /password|secret|token|api_key|anon_key|supabase/i.test(key)) return;
    content[key] = /_url$/.test(key) ? normalizePublicUrl(value, `content.${key}`, /image/.test(key)) : text(value);
  });
  const rows = (name: string, value: unknown[]) => table([name], value as Row[]).filter(row => bool(row.is_active));
  const categories = rows('categories', defaults.categories).map(row => ({
    id:text(row.id).trim(),name:text(row.name),slug:text(row.slug),description:text(row.description),
    image_url:normalizePublicUrl(row.image_url, 'categories.image_url', true),sort_order:number(row.sort_order,'categories.sort_order',0),is_active:true,
  })).sort((a,b) => a.sort_order-b.sort_order);
  const flavors = rows('flavors', defaults.flavors).map(row => ({
    id:text(row.id).trim(),name:text(row.name),color_hex:/^#[a-f0-9]{3,8}$/i.test(text(row.color_hex))?text(row.color_hex):'#f1e8db',is_active:true,
  }));
  const addonRows = table(['addons','product_addons'], defaults.addons);
  const addons = addonRows.filter(row=>bool(row.is_active)).map(row=>({
    id:text(row.id).trim(),name:text(row.name),price:number(row.price,'product_addons.price'),
    image_url:normalizePublicUrl(row.image_url,'product_addons.image_url',true)||undefined,is_active:true,
  }));
  const globalVariants = lookup('product_variants', 'productvariants');
  const flatVariants = globalVariants === undefined ? undefined : unique(records(globalVariants, 'product_variants'), 'product_variants');
  const variant = (row: Row, productId: string): ProductVariant => ({
    id:text(row.id).trim(),product_id:text(row.product_id,productId).trim(),name:text(row.name),weight_grams:number(row.weight_grams,'product_variants.weight_grams',0),
    price:number(row.price,'product_variants.price'),sale_price:optionalNumber(row.sale_price,'product_variants.sale_price'),is_active:bool(row.is_active),
  });
  const products = rows('products', defaults.products).map(row => {
    const id=text(row.id).trim();
    const variantRows = flatVariants ? flatVariants.filter(v=>text(v.product_id).trim()===id) : unique(records(row.variants,'products.variants'),'products.variants');
    const variants = variantRows.filter(v=>bool(v.is_active)).map(v=>variant(v,id));
    const base = row.base_price === '' || row.base_price === undefined || row.base_price === null ? (variants.length?Math.min(...variants.map(v=>v.sale_price??v.price)):undefined) : row.base_price;
    const categoryId=text(row.category_id).trim();
    const rating=number(row.rating,'products.rating',0);
    if(rating>5)throw invalid('products.rating','must be at most 5');
    return {
      id,category_id:categoryId,category_name:categories.find(c=>c.id===categoryId)?.name||text(row.category_name),name:text(row.name),slug:text(row.slug),
      description:text(row.description),base_price:number(base,'products.base_price'),sale_price:optionalNumber(row.sale_price,'products.sale_price'),
      image_url:normalizePublicUrl(row.image_url,'products.image_url',true),
      gallery_images:list(row.gallery_images,'products.gallery_images',/\n/).map(url=>normalizePublicUrl(url,'products.gallery_images',true)),
      is_featured:bool(row.is_featured,false),is_active:true,rating,review_count:number(row.review_count,'products.review_count',0),variants,
      allowed_flavor_ids:list(row.allowed_flavor_ids,'products.allowed_flavor_ids').filter(id=>flavors.some(f=>f.id===id)),
      allowed_addon_ids:list(row.allowed_addon_ids,'products.allowed_addon_ids').filter(id=>addons.some(a=>a.id===id)),
    };
  });
  const hero_slides = rows('hero_slides', defaults.hero_slides).map(row=>({
    id:text(row.id).trim(),product_id:text(row.product_id)||undefined,title:text(row.title),subtitle:text(row.subtitle),
    image_url:normalizePublicUrl(row.image_url,'hero_slides.image_url',true),image_alt:text(row.image_alt),
    sort_order:number(row.sort_order,'hero_slides.sort_order',0),is_active:true,
  })).sort((a,b)=>a.sort_order-b.sort_order);
  const highlights = rows('highlights',defaults.highlights).map(row=>{
    const section=text(row.section) as PublicSiteData['highlights'][number]['section'];
    if(!['promise','occasion','custom_step','social_gallery'].includes(section))throw invalid('highlights.section','must be promise, occasion, custom_step or social_gallery');
    return {
      id:text(row.id).trim(),section,title:text(row.title),description:text(row.description),
      image_url:normalizePublicUrl(row.image_url,'highlights.image_url',true)||undefined,image_alt:text(row.image_alt)||undefined,
      icon:text(row.icon)||undefined,category_id:text(row.category_id)||undefined,sort_order:number(row.sort_order,'highlights.sort_order',0),is_active:true,
    };
  }).sort((a,b)=>a.sort_order-b.sort_order);
  const faqs = rows('faqs',defaults.faqs).map(row=>({id:text(row.id).trim(),question:text(row.question),answer:text(row.answer),sort_order:number(row.sort_order,'faqs.sort_order',0),is_active:true})).sort((a,b)=>a.sort_order-b.sort_order);
  const links = rows('links',defaults.links).map(row=>{
    const location=text(row.location) as PublicSiteData['links'][number]['location'];
    if(!['social','footer','navigation'].includes(location))throw invalid('links.location','must be social, footer or navigation');
    return {id:text(row.id).trim(),label:text(row.label),url:normalizePublicUrl(row.url,'links.url'),location,sort_order:number(row.sort_order,'links.sort_order',0),is_active:true};
  }).sort((a,b)=>a.sort_order-b.sort_order);
  const banners = rows('banners',defaults.banners).map(row=>({id:text(row.id).trim(),title:text(row.title),subtitle:text(row.subtitle),image_url:normalizePublicUrl(row.image_url,'banners.image_url',true),button_text:text(row.button_text),button_link:normalizePublicUrl(row.button_link,'banners.button_link'),is_active:true}));
  const zones = table(['zones','delivery_zones'],defaults.zones).filter(row=>bool(row.is_active)).map(row=>({id:text(row.id).trim(),name:text(row.name),delivery_fee:number(row.delivery_fee,'delivery_zones.delivery_fee'),estimated_time:text(row.estimated_time),is_active:true}));
  const slots = table(['slots','delivery_slots'],defaults.slots).filter(row=>bool(row.is_active)).map(row=>({id:text(row.id).trim(),slot_label:text(row.slot_label),is_active:true}));
  const coupons = rows('coupons',defaults.coupons).map(row=>{
    const discount_type=text(row.discount_type) as 'percentage'|'fixed';
    if(!['percentage','fixed'].includes(discount_type))throw invalid('coupons.discount_type','must be percentage or fixed');
    const discount_value=number(row.discount_value,'coupons.discount_value');
    if(discount_type==='percentage'&&discount_value>100)throw invalid('coupons.discount_value','must be at most 100 for percentage discounts');
    return {id:text(row.id).trim(),code:text(row.code),discount_type,discount_value,min_order_amount:number(row.min_order_amount,'coupons.min_order_amount',0),max_discount_amount:optionalNumber(row.max_discount_amount,'coupons.max_discount_amount'),is_active:true,usage_count:number(row.usage_count,'coupons.usage_count',0)};
  });
  const reviews = table(['reviews'],defaults.reviews).filter(row=>text(row.status)==='approved').map(row=>({
    id:text(row.id).trim(),product_id:text(row.product_id),product_name:text(row.product_name),customer_name:text(row.customer_name),
    rating:Math.min(5,number(row.rating,'reviews.rating',0)),comment:text(row.comment),status:'approved' as const,created_at:text(row.created_at),
  }));
  return {schema_version:1,order_submission_enabled:lookup('order_submission_enabled') === true,customer_order_profile_sync_enabled:lookup('customer_order_profile_sync_enabled') === true,settings:settings as unknown as ShopSettings,content,hero_slides,highlights,faqs,links,products,categories,flavors,addons,banners,zones,slots,coupons,reviews};
}

/** Optional same-origin free Netlify relay; only one fixed path is accepted.
 * Backend URL stays pinned to the validated Google Apps Script deployment.
 */
/** Same-origin Vercel Preview requests need the site's access cookie, if protected.
 * Direct requests to Google Apps Script must never carry browser credentials.
 * The Vercel relay does NOT forward browser cookies to Google.
 */
export function sheetsPostCredentials(resolvedUrl: string): RequestCredentials {
  return resolvedUrl === '/api/operations' ? 'same-origin' : 'omit';
}

export function usesSameOriginBakeryApi(): boolean {
  const configured=(import.meta.env?.VITE_SHEETS_POST_PROXY as string|undefined)?.trim()==='/api/operations';
  // Workers Builds does not set CF_PAGES; the actual Cloudflare application
  // hostname is a reliable way to keep checkout behind its secure API relay.
  const cloudflareHost=typeof window!=='undefined' &&
    /(?:^|\.)(?:workers|pages)\.dev$/i.test(window.location.hostname);
  return configured || cloudflareHost;
}

export function resolveSheetsPostEndpoint(endpoint: string): string {
  const direct=validateGoogleSheetsEndpoint(endpoint).href;
  return usesSameOriginBakeryApi()?'/api/operations':direct;
}
export function validateGoogleSheetsEndpoint(endpoint: string): URL {
  let url: URL;
  try { url=new URL(endpoint); } catch { throw new GoogleSheetsError('invalid_endpoint','Enter the Apps Script web app /exec URL.'); }
  if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)||url.username||url.password) throw new GoogleSheetsError('invalid_endpoint','Use an HTTPS script.google.com/macros/s/.../exec web app URL.');
  url.hash='';
  url.search='';
  return url;
}

let callbackCounter=0;
function loadJsonp(endpoint: URL, signal?: AbortSignal): Promise<unknown> {
  if(typeof document==='undefined'||typeof window==='undefined')throw new GoogleSheetsError('network','Google Sheets could not be reached. Check the deployment access and try again.');
  return new Promise((resolve,reject)=>{
    const name=`auroraSheets_${Date.now().toString(36)}_${++callbackCounter}`;
    const script=document.createElement('script');
    const callbacks=window as unknown as Record<string,unknown>;
    let settled=false;
    const finish=(error?:unknown,data?:unknown)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);script.remove();delete callbacks[name];error?reject(error):resolve(data);
    };
    const onAbort=()=>finish(new DOMException('The request was cancelled.','AbortError'));
    const timer=setTimeout(()=>finish(new GoogleSheetsError('timeout','Google Sheets did not respond. Check that the read-only web app is deployed for site visitors.')),12000);
    callbacks[name]=(data:unknown)=>finish(undefined,data);
    script.onerror=()=>finish(new GoogleSheetsError('permission_required','Google Sheets could not load public content. The Apps Script deployment may require sign-in or its Code.gs needs updating.'));
    script.referrerPolicy='no-referrer';script.async=true;
    endpoint.searchParams.set('action','public');endpoint.searchParams.set('callback',name);
    script.src=endpoint.href;
    signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted){onAbort();return;}
    document.head.appendChild(script);
  });
}

/** No credentials, writes or private-data requests are made by this public content loader. */
export async function loadGoogleSheetData(endpoint=DEFAULT_SHEETS_ENDPOINT, signal?: AbortSignal): Promise<PublicSiteData> {
  const url=validateGoogleSheetsEndpoint(endpoint);
  url.searchParams.set('action','public');
  // Same-origin Vercel or Cloudflare proxy avoids browser CORS redirects.
  // Local Vite development continues to use the public Apps Script endpoint.
  const viaVercel=usesSameOriginBakeryApi() &&
    typeof window!=='undefined' && window.location.protocol==='https:';
  const readUrl=viaVercel?'/api/public':url.href;
  const controller=new AbortController();
  const onAbort=()=>controller.abort();
  signal?.addEventListener('abort',onAbort,{once:true});
  if(signal?.aborted){signal.removeEventListener('abort',onAbort);throw new DOMException('The request was cancelled.','AbortError');}
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},12000);
  try{
    const response=await fetch(readUrl,{credentials:viaVercel?'same-origin':'omit',redirect:'follow',cache:viaVercel?'default':'no-store',signal:controller.signal});
    if(/accounts\.google\.com/.test(response.url))throw new GoogleSheetsError('permission_required','The Apps Script link requires Google sign-in. Deploy the read-only public-content web app for site visitors.');
    if(!response.ok)throw new GoogleSheetsError('network',`Google Sheets returned HTTP ${response.status}. Try again after checking its deployment.`);
    return normalizePublicSiteData(await response.text());
  }catch(error){
    if(signal?.aborted)throw new DOMException('The request was cancelled.','AbortError');
    if(error instanceof GoogleSheetsError)throw error;
    if(timedOut)throw new GoogleSheetsError('timeout','Google Sheets took too long to respond. Try again.');
    // ContentService redirects sometimes fail CORS. Its strictly named, public-only JSONP route is a compatibility fallback.
    return normalizePublicSiteData(await loadJsonp(new URL(url.href),signal));
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',onAbort);
  }
}

