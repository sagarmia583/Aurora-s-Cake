import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, CakeSlice, Check, ChevronDown, Flower2, Heart, Leaf, Truck, Facebook, Phone, Mail, Plus, Star, Camera, Flame, ShoppingBag, Zap, Tag, Copy, Clock, Sparkles } from 'lucide-react';
import { Product, Category, ShopSettings, Flavor, Banner, Review, CartItem, Coupon } from '../types';
import type { PublicSiteData, SiteHighlight } from '../types/siteContent';
import { DEFAULT_PUBLIC_SITE_DATA } from '../content/defaultSiteData';
import { BrandImage } from './BrandImage';
import { StorefrontPrice } from './StorefrontPrice';
import { getProductDisplayStats, isProductNew } from '../services/productStats';
import { formatFreeGiftBadge, formatFreeGiftList, cleanFreeGiftItems } from '../utils/freeGifts';

interface CustomerStorefrontProps {
  settings: ShopSettings;
  products: Product[];
  categories: Category[];
  flavors: Flavor[];
  banners: Banner[];
  reviews: Review[];
  coupons?: Coupon[];
  currency: string;
  onSelectProduct: (product: Product) => void;
  onOpenTrackOrder: () => void;
  onOpenCustomCake: () => void;
  onOpenProfile?: () => void;
  searchQuery: string;
  publicData?: PublicSiteData;
  catalogState?: 'loading' | 'error' | 'ready';
  onAddToCart?: (item: CartItem) => void;
  onOpenCart?: () => void;
}

const preline: React.CSSProperties = { whiteSpace: 'pre-line' };
const ordered = <T extends { is_active: boolean; sort_order: number }>(rows: T[]) => rows.filter(row => row.is_active).sort((a, b) => a.sort_order - b.sort_order);
const safeLink = (value?: string) => value && /^(https?:\/\/|mailto:|tel:|#)/i.test(value.trim()) ? value.trim() : '';
const safeImage = (value?: string) => value && /^(https?:\/\/|\/[^/])/i.test(value.trim()) ? value.trim() : '';

/** Use locally hosted cake photos from the existing Sheet gallery when
 * an external CDN rejects hotlinking. Never repeat a failed image request.
 */
export function StorefrontProductPhoto({ product }: { product: Product }) {
  const candidates = useMemo(() => {
    const primary=safeImage(product.image_url);
    const gallery=(product.gallery_images||[]).map(safeImage);
    let lowResolution=false;
    try {
      const url=new URL(primary||'', 'https://aurorascake.netlify.app');
      const size=Number(url.searchParams.get('s'));
      lowResolution=/^encrypted-tbn[0-9]*\.gstatic\.com$/i.test(url.hostname) &&
        Number.isFinite(size) && size>0 && size<200;
    }catch { /* Invalid/unavailable primary goes through normal fallback. */ }
    // Existing Sheet product thumbnails often have s=10: prefer local full
    // gallery photos instead of displaying a blurry ten-pixel square.
    return [...new Set((lowResolution?[...gallery,primary]:[primary,...gallery])
      .filter((value):value is string=>Boolean(value)))];
  }, [product.image_url,product.gallery_images]);
  const [index,setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [product.id, product.image_url, product.gallery_images]);
  return candidates[index]
    ? <img src={candidates[index]} alt={product.name} loading="lazy"
        width="800" height="800" onError={() => setIndex(current => current + 1)} />
    : <span className="flex w-full h-full min-h-44 sm:min-h-56 items-center justify-center gap-2 bg-emerald-50 text-emerald-900/80 text-xs font-bold px-4 text-center">
        <CakeSlice size={22} aria-hidden="true" /> {product.name}
      </span>;
}

function startingPrice(product: Product) {
  const prices = product.variants.filter(v => v.is_active).map(v => v.sale_price ?? v.price);
  return prices.length ? Math.min(...prices) : product.sale_price ?? product.base_price;
}
function getProductPricing(product: Product) {
  const activeVariants = product.variants.filter(v => v.is_active);
  const sortedVariants = [...activeVariants].sort((a, b) => (a.sale_price ?? a.price) - (b.sale_price ?? b.price));
  const cheapestVariant = sortedVariants[0];

  const currentPrice = cheapestVariant ? (cheapestVariant.sale_price ?? cheapestVariant.price) : (product.sale_price ?? product.base_price);
  const originalPrice = cheapestVariant ? cheapestVariant.price : product.base_price;

  const savings = Math.max(0, originalPrice - currentPrice);

  return {
    currentPrice,
    regularPrice: originalPrice,
    hasDiscount: savings > 0,
    savings,
    cheapestVariant,
  };
}

function HighlightIcon({ name, size = 20 }: { name?: string; size?: number }) {
  const icons = { cake: CakeSlice, flower: Flower2, heart: Heart, leaf: Leaf, truck: Truck, check: Check };
  const Icon = icons[name as keyof typeof icons] ?? Heart;
  return <Icon size={size} strokeWidth={1.3} aria-hidden="true" />;
}

export const CustomerStorefront: React.FC<CustomerStorefrontProps> = React.memo(({
  settings: suppliedSettings, products, categories, flavors = [], currency, onSelectProduct, onOpenCustomCake, reviews: suppliedReviews,
  coupons: suppliedCoupons,
  onOpenTrackOrder, onOpenProfile, searchQuery, publicData,
  catalogState = 'ready', onAddToCart, onOpenCart,
}) => {
  const data: PublicSiteData = publicData ?? DEFAULT_PUBLIC_SITE_DATA;
  const settings = publicData?.settings ?? suppliedSettings;
  const text = (key: string) => data.content[key] ?? DEFAULT_PUBLIC_SITE_DATA.content[key] ?? '';
  const reviews = publicData ? publicData.reviews : suppliedReviews;
  const coupons = publicData ? publicData.coupons : (suppliedCoupons || []);
  // Gift badges are always computed separately from each product's assigned list.
  // Legacy shop-wide gift lists are choices, never automatic promises.
  const [copiedCouponCode, setCopiedCouponCode] = useState<string | null>(null);
  const [isCouponsExpanded, setIsCouponsExpanded] = useState<boolean>(true);

  const availableCoupons = useMemo(() => {
    const now = new Date();
    return (coupons || []).filter((c) => {
      if (!c.is_active) return false;
      if (c.valid_from) {
        const fromTime = new Date(c.valid_from.includes('T') ? c.valid_from : `${c.valid_from}T00:00:00`).getTime();
        if (!isNaN(fromTime) && now.getTime() < fromTime) return false;
      }
      if (c.valid_until) {
        const untilTime = new Date(c.valid_until.includes('T') ? c.valid_until : `${c.valid_until}T23:59:59.999`).getTime();
        if (!isNaN(untilTime) && now.getTime() > untilTime) return false;
      }
      if (c.usage_limit && c.usage_limit > 0 && (c.usage_count || 0) >= c.usage_limit) {
        return false;
      }
      return true;
    });
  }, [coupons]);

  const marqueeItems = useMemo(() => {
    if (!availableCoupons.length) return [];
    const minRepeats = Math.max(2, Math.ceil(8 / availableCoupons.length));
    const items: typeof availableCoupons = [];
    for (let i = 0; i < minRepeats * 2; i++) {
      items.push(...availableCoupons);
    }
    return items;
  }, [availableCoupons]);

  const handleCopyCoupon = (code: string) => {
    try {
      navigator.clipboard?.writeText(code);
      setCopiedCouponCode(code);
      setTimeout(() => setCopiedCouponCode(null), 2000);
    } catch {
      // ignore
    }
  };

  const [reviewFilter, setReviewFilter] = useState<'all' | 'facebook' | 'photos'>('all');
  const [category, setCategory] = useState('all');
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'eggless' | 'sugar_free' | 'halal'>('all');
  const [sort, setSort] = useState('featured');
  const [heroIndex, setHeroIndex] = useState(0);
  const slides = ordered(data.hero_slides);
  const slide = slides[heroIndex % (slides.length || 1)];
  const heroImage = safeImage(slide?.image_url);
  const highlights = (section: SiteHighlight['section']) => ordered(data.highlights.filter(row => row.section === section));
  const promises = highlights('promise');
  const occasions = highlights('occasion');
  const customSteps = highlights('custom_step');
  const socialPhotos = highlights('social_gallery').filter(row => safeImage(row.image_url));
  const orderFaq = DEFAULT_PUBLIC_SITE_DATA.faqs.find(item => item.id === 'faq-4');
  const faqs = ordered(data.faqs).map(faq => orderFaq && faq.id === orderFaq.id && faq.answer.includes('your order has reached our Google Sheet')
    ? { ...faq, answer: orderFaq.answer }
    : faq);
  const facebookUrl = safeLink(settings.facebook_url);
  const instagramUrl = safeLink(settings.instagram_url);
  const settingsSocialLinks = [{ id: 'instagram', label: 'Instagram', url: instagramUrl }, { id: 'youtube', label: 'YouTube', url: safeLink(settings.youtube_url) }, { id: 'tiktok', label: 'TikTok', url: safeLink(settings.tiktok_url) }, { id: 'website', label: 'Website', url: safeLink(settings.website_url) }].filter(link => link.url);
  const settingsSocialUrls = new Set([facebookUrl, ...settingsSocialLinks.map(link => link.url)]);
  const extraSocialLinks = ordered(data.links.filter(row => row.location === 'social')).filter(row => safeLink(row.url) && !settingsSocialUrls.has(row.url));
  const footerLinks = ordered(data.links.filter(row => row.location === 'footer')).filter(row => safeLink(row.url));
  const socialUrl = facebookUrl || instagramUrl || safeLink(settings.website_url) || safeLink(extraSocialLinks[0]?.url) || '';
  const profileImage = safeImage((settings as ShopSettings & { profile_image_url?: string }).profile_image_url);
  const customImage = safeImage(text('custom_image_url'));
  const storyImage = safeImage(text('story_image_url'));
  const logo = safeImage(settings.logo_url);
  const activeProducts = products.filter(product => product.is_active);
  const filtered = useMemo(() => products.filter(product => product.is_active)
    .filter(product => category === 'all' || product.category_id === category)
    .filter(product => {
      if (dietaryFilter === 'eggless') {
        return Boolean(product.is_eggless || product.dietary_tags?.includes('eggless') || product.name.toLowerCase().includes('eggless') || product.description.toLowerCase().includes('ডিম ছাড়া'));
      }
      if (dietaryFilter === 'sugar_free') {
        return Boolean(product.is_sugar_free || product.dietary_tags?.includes('sugar_free') || product.name.toLowerCase().includes('sugar free') || product.description.toLowerCase().includes('সুগার-ফ্রি'));
      }
      return true;
    })
    .filter(product => `${product.name} ${product.description} ${product.category_name ?? ''}`.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .sort((a, b) => sort === 'price-low' ? startingPrice(a) - startingPrice(b) : sort === 'price-high' ? startingPrice(b) - startingPrice(a) : Number(b.is_featured) - Number(a.is_featured)), [products, category, dietaryFilter, sort, searchQuery]);
  const displayedReviews = useMemo(() => {
    return reviews.filter(rev => {
      if (reviewFilter === 'facebook') return rev.source === 'facebook' || Boolean(rev.facebook_url);
      if (reviewFilter === 'photos') return Boolean(rev.image_url);
      return true;
    });
  }, [reviews, reviewFilter]);
  useEffect(() => {
    if (category !== 'all' && !categories.some(item => item.id === category && item.is_active)) setCategory('all');
  }, [category, categories]);

  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const handleQuickAddToCart = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    const activeVariants = product.variants.filter(v => v.is_active);
    const selectedVariant = [...activeVariants].sort((a,b)=>(a.sale_price??a.price)-(b.sale_price??b.price))[0];
    if (!selectedVariant || !settings.accepting_orders) {
      onSelectProduct(product);
      return;
    }
    const availableFlavors = (flavors || []).filter(f => f.is_active && product.allowed_flavor_ids?.includes(f.id));
    const selectedFlavor = availableFlavors[0];
    const unitPrice = selectedVariant.sale_price ?? selectedVariant.price;
    const cartItem: CartItem = {
      cart_item_id: `cart-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      product,
      selected_variant: selectedVariant,
      selected_flavor: selectedFlavor,
      selected_addons: [],
      writing_message: '',
      quantity: 1,
      unit_price: unitPrice,
      total_price: unitPrice,
    };
    if (onAddToCart) {
      onAddToCart(cartItem);
    }
    setJustAddedId(product.id);
    setTimeout(() => setJustAddedId(null), 1800);
  };

  const handleQuickOrder = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectProduct(product);
  };

  return (
    <div className="ac-storefront">
      <section className="ac-hero ac-container" aria-labelledby="hero-heading" style={!heroImage ? { gridTemplateColumns: '1fr' } : undefined}>
      <div className="ac-hero-copy">
        {text('hero_eyebrow') && <span className="ac-eyebrow"><span className="ac-tiny-line" />{text('hero_eyebrow')}</span>}
        <h1 id="hero-heading" style={preline}>{text('hero_title')}</h1>
        {text('hero_description') && <p style={preline}>{text('hero_description')}</p>}
        <div className="ac-hero-actions">
          {text('hero_cta') && <a href="#catalog" className="ac-button">{text('hero_cta')} <ArrowUpRight size={17} /></a>}
          {text('hero_secondary_cta') && <button onClick={onOpenCustomCake} className="ac-text-button">{text('hero_secondary_cta')} <ArrowRight size={16} /></button>}
        </div>
        {text('hero_note') && <div className="ac-hero-footnote"><Heart size={15} strokeWidth={1.5} />{text('hero_note')}</div>}
      </div>
      {heroImage && <div className="ac-hero-visual">
        <div className="ac-hero-backdrop" />
        <div className="ac-hero-image-wrap">
          <img className="ac-hero-image" src={heroImage} alt={slide.image_alt} fetchPriority="high" width="1000" height="1200" />
          <div className="ac-hero-image-shade" />
          {(text('hero_image_label') || text('hero_image_caption')) && <div className="ac-hero-image-caption"><span>{text('hero_image_label')}</span><span>{text('hero_image_caption')}</span></div>}
        </div>
        {(text('hero_stamp_top') || text('hero_stamp_bottom')) && <div className="ac-love-stamp" aria-hidden="true"><span>{text('hero_stamp_top')}</span><Heart size={30} strokeWidth={1.5} /><span>{text('hero_stamp_bottom')}</span></div>}
        <span className="ac-hero-sparkle ac-sparkle-one" aria-hidden="true">✧</span>
        <span className="ac-hero-sparkle ac-sparkle-two" aria-hidden="true">✧</span>
        <div className="ac-hero-card">
          <div><span className="ac-eyebrow">{text('hero_card_label')}</span><strong>{slide.title}</strong>{slide.subtitle && <span style={{ display: 'block', marginTop: 5, fontSize: 11 }}>{slide.subtitle}</span>}</div>
          {slides.length > 1 && <button aria-label="Show next celebration cake" onClick={() => setHeroIndex(index => (index + 1) % slides.length)}><ArrowRight size={20} /></button>}
        </div>
      </div>}
    </section>

    {/* Breaking News Style 1-Line Continuous Running Offers Strip Directly Under Banner */}
    {availableCoupons.length > 0 && (
      <section className="ac-container my-3 sm:my-4" aria-label="Available Offers Breaking News">
        <div className="bg-gradient-to-r from-red-500/10 via-amber-500/15 to-rose-500/10 border-2 border-rose-300/80 rounded-2xl shadow-[0_4px_20px_rgba(225,29,72,0.12)] p-2 sm:p-2.5 flex items-center gap-2.5 sm:gap-3.5 overflow-hidden backdrop-blur-xs relative group/ticker">
          {/* Left "Breaking News" Fixed Pill */}
          <div className="flex items-center gap-1.5 bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white font-black text-xs px-3 sm:px-3.5 py-1.5 rounded-xl shadow-sm whitespace-nowrap flex-shrink-0 z-10 select-none">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <span>ব্রেকিং অফার</span>
            <span className="bg-white/20 text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5">
              {availableCoupons.length}টি
            </span>
          </div>

          {/* Continuous Running Breaking News Marquee Track */}
          <div className="ac-breaking-viewport overflow-hidden relative w-full flex items-center">
            <div className="ac-breaking-marquee flex items-center gap-4 sm:gap-6 whitespace-nowrap">
              {marqueeItems.map((c, idx) => {
                const remaining = c.usage_limit ? Math.max(0, c.usage_limit - (c.usage_count || 0)) : null;
                const isCopied = copiedCouponCode === c.code;

                return (
                  <div key={`${c.id}-${idx}`} aria-hidden={idx >= availableCoupons.length || undefined} className="inline-flex items-center gap-3 sm:gap-4 flex-shrink-0">
                    <button
                      type="button"
                      tabIndex={idx >= availableCoupons.length ? -1 : undefined}
                      onClick={() => handleCopyCoupon(c.code)}
                      className="inline-flex items-center gap-2 bg-white/95 hover:bg-white border border-rose-200/90 hover:border-rose-400 hover:shadow-md rounded-xl px-3 py-1 shadow-2xs transition-all hover:scale-[1.02] active:scale-95 cursor-pointer group/btn"
                      title={`ক্লিক করে কোড কপি করুন: ${c.code}`}
                    >
                      {/* Code Badge */}
                      <span className="font-mono text-xs font-black tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-dashed border-rose-300 group-hover/btn:bg-rose-100 transition-colors">
                        {c.code}
                      </span>

                      {/* Discount Info */}
                      <span className="font-extrabold text-xs text-slate-800 whitespace-nowrap">
                        {c.discount_type === 'percentage'
                          ? `${c.discount_value}% ছাড় ${c.max_discount_amount ? `(সর্বোচ্চ ${currency}${c.max_discount_amount})` : ''}`
                          : `${currency}${c.discount_value} ফ্ল্যাট ছাড়`}
                      </span>

                      {/* Min Order Condition */}
                      {c.min_order_amount ? (
                        <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap hidden sm:inline">
                          • নূন্যতম {currency}{c.min_order_amount}
                        </span>
                      ) : null}

                      {/* Remaining Count */}
                      {c.usage_limit ? (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-200/50 whitespace-nowrap">
                          {remaining}টি বাকি
                        </span>
                      ) : null}

                      {/* Copy Button */}
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 transition-all whitespace-nowrap ${
                        isCopied
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 group-hover/btn:bg-rose-600 group-hover/btn:text-white text-slate-700'
                      }`}>
                        {isCopied ? (
                          <>
                            <Check size={11} className="text-white" />
                            <span>কপি!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11} />
                            <span>কপি</span>
                          </>
                        )}
                      </span>
                    </button>
                    <span className="text-amber-500 font-bold text-xs select-none">✦</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    )}

    {promises.length > 0 && <div className="ac-promise-strip"><div className="ac-container ac-promises">{promises.map((item, index) => <React.Fragment key={item.id}>{index > 0 && <i />}<span><HighlightIcon name={item.icon} /><span>{item.title}{item.description && <small style={{ display: 'block' }}>{item.description}</small>}</span></span></React.Fragment>)}</div></div>}

    {occasions.length > 0 && <section className="ac-occasions ac-container" aria-labelledby="occasion-heading">
      <div className="ac-occasion-heading"><h2 id="occasion-heading">{text('occasions_title')}</h2><span>{text('occasions_subtitle')}</span></div>
      <div className="ac-occasion-grid">{occasions.map(occasion => <a key={occasion.id} href="#catalog" className="ac-occasion-card" onClick={() => setCategory(categories.some(item => item.id === occasion.category_id && item.is_active) ? occasion.category_id! : 'all')} style={!safeImage(occasion.image_url) ? { gridTemplateColumns: '1fr' } : undefined}>
        {safeImage(occasion.image_url) && <div><img src={safeImage(occasion.image_url)} alt={occasion.image_alt ?? ''} loading="lazy" width="150" height="150" /></div>}
        <h3>{occasion.title}</h3><p>{occasion.description}</p><span><ArrowUpRight size={16} /></span>
      </a>)}</div>
    </section>}

    <section id="catalog" className="ac-catalog ac-container" aria-labelledby="catalog-heading">
      <div className="ac-section-heading"><div><span className="ac-eyebrow">{text('catalog_eyebrow')}</span><h2 id="catalog-heading" style={preline}>{text('catalog_title')}</h2></div><p style={preline}>{text('catalog_description')}</p></div>
      <div className="ac-catalog-toolbar">
        <div className="ac-filter-chips" role="group" aria-label="Filter cakes by category">
          <button aria-pressed={category === 'all'} className={category === 'all' ? 'is-active' : ''} onClick={() => setCategory('all')}>{text('catalog_all_label')} <span>{activeProducts.length}</span></button>
          {categories.filter(item => item.is_active).sort((a, b) => a.sort_order - b.sort_order).map(item => <button key={item.id} aria-pressed={category === item.id} className={category === item.id ? 'is-active' : ''} onClick={() => setCategory(item.id)}>{item.name}</button>)}
        </div>
        <label className="ac-sort"><span className="sr-only">Sort cakes</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="featured">{text('catalog_sort_featured')}</option><option value="price-low">{text('catalog_price_low')}</option><option value="price-high">{text('catalog_price_high')}</option></select><ChevronDown size={14} /></label>
      </div>

      {/* Dietary & Food Preference Filters */}
      <div className="flex flex-wrap items-center gap-1.5 py-2 px-1 text-xs">
        <span className="text-[11px] font-bold text-slate-500 mr-1">ফুড প্রিফারেন্স:</span>
        <button
          type="button"
          onClick={() => setDietaryFilter('all')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
            dietaryFilter === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          সব কেক ({activeProducts.length})
        </button>
        <button
          type="button"
          onClick={() => setDietaryFilter('eggless')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
            dietaryFilter === 'eggless'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
          }`}
        >
          🌱 ডিম ছাড়া (Eggless)
        </button>
        <button
          type="button"
          onClick={() => setDietaryFilter('sugar_free')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
            dietaryFilter === 'sugar_free'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-sky-50 border border-sky-200 text-sky-800 hover:bg-sky-100'
          }`}
        >
          🫐 ডায়াবেটিক / সুগার-ফ্রি
        </button>
        <button
          type="button"
          onClick={() => setDietaryFilter('halal')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
            dietaryFilter === 'halal'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100'
          }`}
        >
          ✨ ১০০% হালাল উপাদান
        </button>
      </div>

      {catalogState === 'ready' && <div className="ac-results-line" aria-live="polite">{searchQuery ? `“${searchQuery}” · ` : ''}{filtered.length} {text('catalog_results_label')}</div>}
      <div className="ac-product-grid">{filtered.map(product => {
        const pricing = getProductPricing(product);
        const firstVariant = pricing.cheapestVariant;
        const stats = getProductDisplayStats(product);
        const freeGiftItems = cleanFreeGiftItems(product.free_gift_items);
        const freeGiftBadge = formatFreeGiftBadge(freeGiftItems);
        const freeGiftList = formatFreeGiftList(freeGiftItems);
        return <article className="ac-product" key={product.id}>
          <button className="ac-product-image-button" onClick={() => onSelectProduct(product)} aria-label={`Choose ${product.name}`}>
            <StorefrontProductPhoto product={product} />
            <div className="ac-badge-stack">
              {isProductNew(product) && <span className="ac-new-tag">✨ নতুন</span>}
              {product.is_featured && text('catalog_featured_badge') && <span className="ac-product-tag">{text('catalog_featured_badge')}</span>}
            </div>
            {pricing.hasDiscount && <span className="ac-discount-tag">{currency}{pricing.savings} ছাড়</span>}
          </button>
          <div className="ac-product-info">
            <div>
              <span className="ac-product-category">{categories.find(item => item.id === product.category_id)?.name ?? product.category_name}</span>
              <h3><button onClick={() => onSelectProduct(product)}>{product.name}</button></h3>

              {/* Dietary Tags & Free Kit Badge */}
              <div className="flex flex-wrap items-center gap-1 my-1">
                {product.is_eggless && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                    🌱 Eggless
                  </span>
                )}
                {product.is_sugar_free && (
                  <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-1.5 py-0.5 rounded">
                    🫐 Sugar-Free
                  </span>
                )}
                <span className="text-[10px] bg-slate-100 text-slate-700 font-medium px-1.5 py-0.5 rounded">
                  ✓ হালাল
                </span>
                {freeGiftBadge && (
                  <span title={freeGiftList} className="text-[10px] bg-emerald-50 text-emerald-800 font-medium px-1.5 py-0.5 rounded border border-emerald-200/60 max-w-full break-words">
                    {freeGiftBadge}
                  </span>
                )}
              </div>

              {(stats.reviewCount > 0 || stats.soldCount > 0) && (
                <div className="ac-product-stats" aria-label={`Rating ${stats.ratingFormatted}, ${stats.soldCount} sold`}>
                  {stats.reviewCount > 0 && (
                    <span className="ac-rating-badge">
                      <Star size={12} className="text-amber-500 fill-amber-500" />
                      <strong>{stats.ratingFormatted}</strong>
                      <span className="ac-review-count">({stats.reviewCount})</span>
                    </span>
                  )}
                  {stats.soldCount > 0 && (
                    <span className="ac-sold-badge">
                      <Flame size={12} className="text-orange-500 fill-orange-500" />
                      <span>{stats.soldCount} টি বিক্রিত</span>
                    </span>
                  )}
                </div>
              )}
              <p className="ac-product-description">{product.description}</p>
              <StorefrontPrice regular={pricing.regularPrice} current={pricing.currentPrice}
                currency={currency} size={firstVariant && [text('catalog_from_label'), firstVariant.name.split(' (')[0]].filter(Boolean).join(' · ')}/>
            </div>
            <div className="ac-card-actions">
              <button
                type="button"
                className={`ac-card-btn ac-card-btn-cart ${justAddedId === product.id ? 'is-added' : ''}`}
                onClick={(e) => handleQuickAddToCart(product, e)}
                aria-label={`Add ${product.name} to cart`}
              >
                {justAddedId === product.id ? (
                  <>
                    <Check size={14} className="text-emerald-700" />
                    <span>যোগ হয়েছে</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag size={14} />
                    <span>কার্ট</span>
                  </>
                )}
              </button>
              <button
                type="button"
                className="ac-card-btn ac-card-btn-order"
                onClick={(e) => handleQuickOrder(product, e)}
                aria-label={`Order ${product.name} now`}
              >
                <Zap size={14} fill="currentColor" />
                <span>অর্ডার করুন</span>
              </button>
            </div>
          </div>
        </article>;
      })}</div>
      {!filtered.length && catalogState === 'error' && <p className="ac-empty" role="status">The cake menu is temporarily unavailable.</p>}
      {!filtered.length && catalogState === 'ready' && <div className="ac-empty"><CakeSlice size={42} strokeWidth={1} /><h3>{text('catalog_empty_title')}</h3><p>{text('catalog_empty_description')}</p><button className="ac-text-button" onClick={() => setCategory('all')}>{text('catalog_reset_label')} <ArrowRight size={15} /></button></div>}
      {text('catalog_note') && <div className="ac-catalog-note"><Leaf size={15} strokeWidth={1.2} />{text('catalog_note')}</div>}
    </section>

    <section className="ac-custom-section" aria-labelledby="custom-heading"><div className="ac-custom-inner ac-container" style={!customImage ? { gridTemplateColumns: '1fr' } : undefined}>
      {customImage && <div className="ac-custom-visual"><div className="ac-custom-image"><img src={customImage} alt={text('custom_image_alt')} loading="lazy" width="800" height="900" /></div>{(text('custom_image_label') || text('custom_image_caption')) && <div className="ac-custom-label"><span>{text('custom_image_label')}</span><span>{text('custom_image_caption')}</span></div>}<span className="ac-custom-doodle" aria-hidden="true">✳</span></div>}
      <div className="ac-custom-copy"><span className="ac-eyebrow">{text('custom_eyebrow')}</span><h2 id="custom-heading" style={preline}>{text('custom_title')}</h2><p style={preline}>{text('custom_description')}</p><div className="ac-custom-steps">{customSteps.map(step => <span key={step.id}><HighlightIcon name={step.icon ?? 'check'} size={14} />{step.title}</span>)}</div>{text('custom_cta') && <button onClick={onOpenCustomCake} className="ac-button">{text('custom_cta')} <ArrowUpRight size={17} /></button>}{socialUrl && text('custom_chat_label') && <a href={socialUrl} target="_blank" rel="noopener noreferrer" className="ac-custom-small">{text('custom_chat_label')} <ArrowUpRight size={13} /></a>}</div>
    </div></section>

    <section id="our-story" className="ac-story ac-container" aria-labelledby="story-heading" style={!storyImage ? { gridTemplateColumns: '1fr' } : undefined}>
      <div className="ac-story-words"><span className="ac-eyebrow">{text('story_eyebrow')}</span><h2 id="story-heading" style={preline}>{text('story_title')}</h2><p style={preline}>{text('story_description')}</p>{text('story_cta') && <a href="#catalog" className="ac-text-button">{text('story_cta')} <ArrowRight size={16} /></a>}<span className="ac-story-signature">{profileImage ? <BrandImage src={profileImage} alt={settings.shop_name} brandName={settings.shop_name} width="44" height="44" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} /> : <Heart size={16} />}{text('story_signature')}</span></div>
      {storyImage && <div className="ac-story-image"><img src={storyImage} alt={text('story_image_alt')} loading="lazy" width="800" height="800" />{text('story_image_note') && <div className="ac-story-image-note"><Heart size={16} strokeWidth={1.3} /><span style={preline}>{text('story_image_note')}</span></div>}</div>}
    </section>

    {/* Customer Reviews & Sold Cakes Showcase */}
    {reviews.length > 0 && products.length > 0 && (
      <section id="reviews" className="ac-container py-10 space-y-6" aria-labelledby="reviews-heading">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="ac-eyebrow flex items-center gap-1.5 text-rose-600 font-bold">
              <Camera size={14} /> গ্রাহকদের অভিজ্ঞতা ও ডেলিভারিকৃত কেকের ছবি
            </span>
            <h2 id="reviews-heading" className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              কাস্টমার রিভিউ ও বাস্তব কেকের ছবি
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
              আমাদের ডেলিভারি পাওয়া গ্রাহকদের বাস্তব ছবি ও অভিজ্ঞতা। প্রতিটি কেক ১০০% টাটকা ও ভালোবাসায় তৈরি।
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-rose-50/70 px-3.5 py-2 rounded-xl border border-rose-100 self-start sm:self-auto">
            <span className="text-amber-500 text-sm">★★★★★</span>
            <span>১০০% খাঁটি গ্রাহক রিভিউ ({reviews.length})</span>
          </div>
        </div>

        {/* Facebook Page Social Proof Banner */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-lg border border-blue-800/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#1877F2] text-white flex items-center justify-center shadow-md shrink-0">
              <Facebook size={26} fill="currentColor" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Facebook Verified Page
                </span>
                <span className="text-amber-400 text-xs font-bold">★★★★★ 5.0 Rating</span>
              </div>
              <h3 className="text-lg font-black text-white mt-0.5">
                ফেসবুকে আমাদের ২৫০+ কাস্টমার রিভিউ ও রেটিং
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                টাঙ্গাইলের সেরা ফ্রেশ বেকারি হিসেবে গ্রাহকদের সরাসরি ফেসবুক ফিডব্যাক ও ডেলিভারি ছবি।
              </p>
            </div>
          </div>

          <a
            href={facebookUrl ? `${facebookUrl}/reviews` : 'https://www.facebook.com/aurorascake26/reviews'}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 bg-[#1877F2] hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-all self-stretch md:self-auto justify-center"
          >
            <Facebook size={14} fill="currentColor" />
            <span>ফেসবুক পেজে সব রিভিউ পড়ুন</span>
            <ArrowUpRight size={14} />
          </a>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => setReviewFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              reviewFilter === 'all'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            সকল রিভিউ ({reviews.length})
          </button>
          <button
            onClick={() => setReviewFilter('facebook')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              reviewFilter === 'facebook'
                ? 'bg-[#1877F2] text-white shadow-xs'
                : 'bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100'
            }`}
          >
            <Facebook size={12} fill="currentColor" />
            <span>ফেসবুক রিভিউ ({reviews.filter(r => r.source === 'facebook' || Boolean(r.facebook_url)).length})</span>
          </button>
          <button
            onClick={() => setReviewFilter('photos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              reviewFilter === 'photos'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-purple-50 border border-purple-200 text-purple-800 hover:bg-purple-100'
            }`}
          >
            <Camera size={12} />
            <span>ছবিসহ রিভিউ ({reviews.filter(r => Boolean(r.image_url)).length})</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {displayedReviews.slice(0, 8).map((rev) => (
            <article key={rev.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between space-y-3">
              <div>
                {/* Sold Cake Image if available */}
                {rev.image_url && (
                  <div className="relative h-44 rounded-xl overflow-hidden bg-rose-50 mb-3 group">
                    <img
                      src={rev.image_url}
                      alt={rev.product_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                    <span className="absolute top-2 left-2 bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                      📸 ডেলিভারিকৃত কেকের ছবি
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <span key={s} className={`text-xs ${rev.rating >= s ? 'text-amber-400' : 'text-slate-200'}`}>
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-400">{rev.created_at}</span>
                </div>

                <h4 className="text-xs font-bold text-rose-700 line-clamp-1">{rev.product_name}</h4>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed line-clamp-3">"{rev.comment}"</p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">{rev.customer_name}</span>
                {rev.source === 'facebook' || rev.facebook_url ? (
                  <a
                    href={rev.facebook_url || facebookUrl || 'https://www.facebook.com/aurorascake26'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[#1877F2] bg-blue-50 hover:bg-blue-100 font-bold px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1 transition-colors"
                    title="ফেসবুক রিভিউ ভেরিফাইড"
                  >
                    <Facebook size={10} fill="currentColor" />
                    <span>Facebook Review</span>
                  </a>
                ) : (
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                    ✓ Verified Buyer
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    )}

    {(socialUrl || socialPhotos.length > 0) && <section className="ac-social-section" aria-labelledby="social-heading"><div className="ac-container ac-social-inner" style={!socialPhotos.length ? { gridTemplateColumns: '1fr' } : undefined}>
      <div className="ac-social-copy"><span className="ac-eyebrow"><Facebook size={16} />{text('social_eyebrow')}</span><h2 id="social-heading" style={preline}>{text('social_title')}</h2><p style={preline}>{text('social_description')}</p>{socialUrl && text('social_cta') && <a href={socialUrl} target="_blank" rel="noopener noreferrer" className="ac-button">{text('social_cta')} <ArrowUpRight size={17} /></a>}{text('social_handle') && <span className="ac-social-handle">{text('social_handle')}</span>}{extraSocialLinks.map(link => <a key={link.id} href={safeLink(link.url)} target="_blank" rel="noopener noreferrer" className="ac-custom-small">{link.label} <ArrowUpRight size={13} /></a>)}</div>
      {socialPhotos.length > 0 && <div className="ac-social-gallery" aria-label="Cake collection">{socialPhotos.map(photo => <img key={photo.id} src={safeImage(photo.image_url)} alt={photo.image_alt ?? photo.title} loading="lazy" width="500" height="500" />)}{text('social_image_note') && <span><Heart size={20} />{text('social_image_note')}</span>}</div>}
    </div></section>}

    {faqs.length > 0 && <section className="ac-faq ac-container" aria-labelledby="faq-heading"><div><span className="ac-eyebrow">{text('faq_eyebrow')}</span><h2 id="faq-heading" style={preline}>{text('faq_title')}</h2><p style={preline}>{text('faq_description')}</p></div><div className="ac-faq-list">{faqs.map(item => <details key={item.id}><summary>{item.question}<Plus size={18} strokeWidth={1.3} /></summary><p style={preline}>{item.answer}</p></details>)}</div></section>}

    {/* Cake Care & Storage Guide */}
    <section className="ac-container py-6">
      <div className="bg-gradient-to-r from-amber-50 via-rose-50 to-orange-50 border border-amber-200/80 rounded-3xl p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-700 flex items-center justify-center text-2xl shrink-0">
              ❄️
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Freshness Promise
                </span>
                <span className="text-xs font-bold text-amber-800">কেয়ার অ্যান্ড স্টোরেজ টিপস</span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                কেক ফ্রেশ রাখার ও পরিবেশনের নিয়ম (Cake Care Guide)
              </h3>
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                • <strong>ডেলিভারি পাওয়ার সাথে সাথে:</strong> কেক কাটার আগ পর্যন্ত বক্সসহ ফ্রিজে (৪°-৮° সে.) রাখুন।<br/>
                • <strong>সেরা স্বাদ পেতে:</strong> খাওয়ার ১৫ মিনিট আগে ফ্রিজ থেকে বের করুন, যাতে ক্রিম ও স্পঞ্জ রুম টেম্পারেচারে পারফেক্ট সফট হয়।
                {products.some(product => cleanFreeGiftItems(product.free_gift_items).length > 0) && <><br/>• <strong>ফ্রি উপহার:</strong> শুধু যেসব কেকের কার্ডে উপহার উল্লেখ আছে, সেগুলোর সঙ্গেই নির্দিষ্ট উপহার প্রযোজ্য।</>}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenCustomCake}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer"
          >
            কাস্টম কেকের রিকোয়েস্ট দিন →
          </button>
        </div>
      </div>
    </section>

    <footer className="ac-footer"><div className="ac-container">
      <div className="ac-footer-top"><div className="ac-footer-brand">{logo ? <BrandImage src={logo} alt="" brandName={settings.shop_name} width="42" height="42" style={{ width: 42, height: 42, objectFit: 'contain' }} /> : <Flower2 size={32} strokeWidth={1} />}<a href="#top">{settings.shop_name}<span>{text('footer_tagline')}</span></a></div><p style={preline}>{text('footer_about')}</p><a href="#catalog" className="ac-footer-round" aria-label={text('hero_cta')}><ArrowUpRight size={28} strokeWidth={1} /></a></div>
      <div className="ac-footer-links"><nav aria-label="Footer"><a href="#catalog">{text('nav_cakes')}</a><button onClick={onOpenCustomCake}>{text('nav_custom')}</button><a href="#our-story">{text('nav_story')}</a>{facebookUrl && <a href={facebookUrl} target="_blank" rel="noopener noreferrer">{text('nav_facebook')} <ArrowUpRight size={12} /></a>}{settingsSocialLinks.map(link => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} <ArrowUpRight size={12} /></a>)}{extraSocialLinks.map(link => <a key={link.id} href={safeLink(link.url)} target="_blank" rel="noopener noreferrer">{link.label} <ArrowUpRight size={12} /></a>)}{footerLinks.map(link => <a key={link.id} href={safeLink(link.url)} target={/^https?:/i.test(link.url) ? '_blank' : undefined} rel="noopener noreferrer">{link.label}</a>)}<button onClick={onOpenTrackOrder}>Track an order</button>{onOpenProfile && <button onClick={onOpenProfile}>My orders</button>}</nav>{settings.address && <span style={preline}>{settings.address}{(settings.opening_time || settings.closing_time) && <span style={{ display: 'block', marginTop: 6 }}>{settings.opening_time}{settings.opening_time && settings.closing_time ? ' – ' : ''}{settings.closing_time}</span>}</span>}</div>
      {(settings.phone || settings.whatsapp || settings.email) && <div className="ac-footer-links" style={{ paddingTop: 0 }}><nav aria-label={text('footer_contact_label') || 'Contact'}>{settings.phone && <a href={'tel:' + settings.phone.replace(/[^\d+]/g, '')}><Phone size={13} />{settings.phone}</a>}{facebookUrl && <a href={facebookUrl} target="_blank" rel="noopener noreferrer">Facebook page ↗</a>}{settings.email && <a href={'mailto:' + settings.email}><Mail size={13} />{settings.email}</a>}</nav></div>}
      <div className="ac-footer-bottom">
        <span>© {new Date().getFullYear()} {settings.shop_name}</span>
        <span>Orders sent to Aurora’s Cake · Cash on delivery</span>
        <span>{text('footer_copyright_note')}</span>
      </div>
    </div></footer>

    {facebookUrl && <aside aria-label="Customer support" className="fixed bottom-6 right-6 z-40 pointer-events-auto"><a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="ac-facebook-button" title="আমাদের Facebook page দেখুন"><span className="ac-facebook-mark">f</span><span>Facebook page</span><span aria-hidden="true">↗</span></a></aside>}
  </div>
  );
});
