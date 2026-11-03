import {onRequest as publicCatalog} from '../functions/api/public.js';

export const storefrontOrigin = 'https://aurora-s-cake.sagarmia583.workers.dev';
const cakePath = /^\/cake\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function offer(product, settings, url) {
  const prices = (product.variants || []).map(variant => {
    const price = Number(variant.price);
    if (variant.price == null || variant.price === '' || !Number.isFinite(price) || price < 0) return NaN;
    const sale = Number(variant.sale_price);
    return variant.sale_price != null && variant.sale_price !== '' && sale >= 0 && sale < price ? sale : price;
  }).filter(Number.isFinite);
  if (!prices.length) return undefined;
  const priceCurrency = /^[A-Z]{3}$/.test(settings.currency || '') ? settings.currency : 'BDT';
  const availability = settings.accepting_orders && settings.delivery_enabled ? 'InStock' : 'OutOfStock';
  const common = {url, priceCurrency, availability:'https://schema.org/'+availability};
  const lowPrice = Math.min(...prices), highPrice = Math.max(...prices);
  return lowPrice === highPrice ? {'@type':'Offer', ...common, price:lowPrice} :
    {'@type':'AggregateOffer', ...common, lowPrice, highPrice, offerCount:prices.length};
}

export async function storefrontSeo({request, env, asset}) {
  const path = new URL(request.url).pathname;
  const slug = path.match(cakePath)?.[1];
  if (!['GET','HEAD'].includes(request.method) || (!slug && path !== '/sitemap.xml')) return null;
  const apiRequest = new Request(new URL('/api/public', request.url));
  const response = await publicCatalog({request:apiRequest, env});
  if (!response.ok) return asset(path === '/sitemap.xml' ? path : '/');
  const {data} = await response.json();
  const products = Array.isArray(data.products) ? data.products.filter(product =>
    product?.is_active === true && slugPattern.test(product.slug || '') && product.name) : [];
  const urls = [...new Set(products.map(product => storefrontOrigin+'/cake/'+product.slug))];
  if (path === '/sitemap.xml') {
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
      [storefrontOrigin+'/', ...urls].map(url=>'<url><loc>'+escape(url)+'</loc></url>').join('\n')+'\n</urlset>';
    return new Response(request.method === 'HEAD' ? null : xml,{headers:{
      'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=120'
    }});
  }
  const shell = await asset('/');
  const product = products.find(item => item.slug === slug);
  if (!product) return new Response(request.method === 'HEAD' ? null : shell.body,{
    status:404,headers:{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex'}
  });
  const url = storefrontOrigin+'/cake/'+slug;
  const description = String(product.description || product.name).slice(0, 250);
  let image;
  try {
    const parsed = new URL(product.image_url || '', storefrontOrigin);
    if (product.image_url && parsed.protocol === 'https:' && !parsed.username && !parsed.password) image = parsed.href;
  } catch { /* Bad optional image URL does not break the cake page. */ }
  const structured = {'@context':'https://schema.org','@type':'Product',name:product.name,description,image,
    offers:offer(product,data.settings || {},url)};
  const title = product.name+' · Aurora’s Cake';
  const head = '<title>'+escape(title)+'</title><meta name="description" content="'+escape(description)+'">'+
    '<link rel="canonical" href="'+escape(url)+'"><meta property="og:url" content="'+escape(url)+'">'+
    '<meta property="og:title" content="'+escape(title)+'"><meta property="og:description" content="'+escape(description)+'">'+
    (image?'<meta property="og:image" content="'+escape(image)+'">':'')+
    '<script type="application/ld+json">'+JSON.stringify(structured).replace(/</g,'\\u003c')+'</script>';
  const html = (await shell.text())
    .replace(/<title>[^<]*<\/title>|<link rel="canonical"[^>]*>|<meta (?:name="description"|property="og:(?:title|description)") [^>]*>/g,'')
    .replace('</head>',()=>head+'</head>');
  return new Response(request.method === 'HEAD' ? null : html,{headers:{
    'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60'
  }});
}
