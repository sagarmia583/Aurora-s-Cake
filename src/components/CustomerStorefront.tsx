import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, CakeSlice, Check, ChevronDown, Flower2, Heart, Leaf, Truck, Facebook, Phone, Mail, Plus } from 'lucide-react';
import { Product, Category, ShopSettings, Flavor, Banner, Review } from '../types';
import type { PublicSiteData, SiteHighlight } from '../types/siteContent';
import { DEFAULT_PUBLIC_SITE_DATA } from '../content/defaultSiteData';
import { BrandImage } from './BrandImage';

interface CustomerStorefrontProps {
  settings: ShopSettings;
  products: Product[];
  categories: Category[];
  flavors: Flavor[];
  banners: Banner[];
  reviews: Review[];
  currency: string;
  onSelectProduct: (product: Product) => void;
  onOpenTrackOrder: () => void;
  onOpenCustomCake: () => void;
  onOpenProfile?: () => void;
  searchQuery: string;
  publicData?: PublicSiteData;
}

const preline: React.CSSProperties = { whiteSpace: 'pre-line' };
const ordered = <T extends { is_active: boolean; sort_order: number }>(rows: T[]) => rows.filter(row => row.is_active).sort((a, b) => a.sort_order - b.sort_order);
const safeLink = (value?: string) => value && /^(https?:\/\/|mailto:|tel:|#)/i.test(value.trim()) ? value.trim() : '';
const safeImage = (value?: string) => value && /^(https?:\/\/|\/[^/])/i.test(value.trim()) ? value.trim() : '';

function startingPrice(product: Product) {
  const prices = product.variants.filter(v => v.is_active).map(v => v.sale_price ?? v.price);
  return prices.length ? Math.min(...prices) : product.sale_price ?? product.base_price;
}

function HighlightIcon({ name, size = 20 }: { name?: string; size?: number }) {
  const icons = { cake: CakeSlice, flower: Flower2, heart: Heart, leaf: Leaf, truck: Truck, check: Check };
  const Icon = icons[name as keyof typeof icons] ?? Heart;
  return <Icon size={size} strokeWidth={1.3} aria-hidden="true" />;
}

export const CustomerStorefront: React.FC<CustomerStorefrontProps> = ({
  settings: suppliedSettings, products, categories, currency, onSelectProduct, onOpenCustomCake,
  onOpenTrackOrder, onOpenProfile, searchQuery, publicData,
}) => {
  const data: PublicSiteData = publicData ?? DEFAULT_PUBLIC_SITE_DATA;
  const settings = publicData?.settings ?? suppliedSettings;
  const text = (key: string) => data.content[key] ?? DEFAULT_PUBLIC_SITE_DATA.content[key] ?? '';
  const [category, setCategory] = useState('all');
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
  const faqs = ordered(data.faqs);
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
    .filter(product => `${product.name} ${product.description} ${product.category_name ?? ''}`.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .sort((a, b) => sort === 'price-low' ? startingPrice(a) - startingPrice(b) : sort === 'price-high' ? startingPrice(b) - startingPrice(a) : Number(b.is_featured) - Number(a.is_featured)), [products, category, sort, searchQuery]);
  useEffect(() => {
    if (category !== 'all' && !categories.some(item => item.id === category && item.is_active)) setCategory('all');
  }, [category, categories]);
  const money = (amount: number) => `${currency}${amount.toLocaleString('en-BD')}`;

  return <div className="ac-storefront">
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
      <div className="ac-results-line" aria-live="polite">{searchQuery ? `“${searchQuery}” · ` : ''}{filtered.length} {text('catalog_results_label')}</div>
      <div className="ac-product-grid">{filtered.map(product => {
        const firstVariant = product.variants.filter(variant => variant.is_active).sort((a, b) => (a.sale_price ?? a.price) - (b.sale_price ?? b.price))[0];
        return <article className="ac-product" key={product.id}>
          <button className="ac-product-image-button" onClick={() => onSelectProduct(product)} aria-label={`Choose ${product.name}`}>
            {safeImage(product.image_url) && <img src={safeImage(product.image_url)} alt={product.name} loading="lazy" width="800" height="800" />}
            {product.is_featured && text('catalog_featured_badge') && <span className="ac-product-tag">{text('catalog_featured_badge')}</span>}
            <span className="ac-product-hover">{text('catalog_customize_label')} <ArrowUpRight size={15} /></span>
          </button>
          <div className="ac-product-info"><div><span className="ac-product-category">{categories.find(item => item.id === product.category_id)?.name ?? product.category_name}</span><h3><button onClick={() => onSelectProduct(product)}>{product.name}</button></h3><p className="ac-product-description">{product.description}</p><p>{text('catalog_from_label')} <strong>{money(startingPrice(product))}</strong>{firstVariant && <span> / {firstVariant.name.split(' (')[0]}</span>}</p></div><button className="ac-add-cake" onClick={() => onSelectProduct(product)} aria-label={`${text('catalog_customize_label')} ${product.name}`}><span>{text('catalog_customize_label')}</span><ArrowUpRight size={16} strokeWidth={1.8} /></button></div>
        </article>;
      })}</div>
      {!filtered.length && <div className="ac-empty"><CakeSlice size={42} strokeWidth={1} /><h3>{text('catalog_empty_title')}</h3><p>{text('catalog_empty_description')}</p><button className="ac-text-button" onClick={() => setCategory('all')}>{text('catalog_reset_label')} <ArrowRight size={15} /></button></div>}
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

    {(socialUrl || socialPhotos.length > 0) && <section className="ac-social-section" aria-labelledby="social-heading"><div className="ac-container ac-social-inner" style={!socialPhotos.length ? { gridTemplateColumns: '1fr' } : undefined}>
      <div className="ac-social-copy"><span className="ac-eyebrow"><Facebook size={16} />{text('social_eyebrow')}</span><h2 id="social-heading" style={preline}>{text('social_title')}</h2><p style={preline}>{text('social_description')}</p>{socialUrl && text('social_cta') && <a href={socialUrl} target="_blank" rel="noopener noreferrer" className="ac-button">{text('social_cta')} <ArrowUpRight size={17} /></a>}{text('social_handle') && <span className="ac-social-handle">{text('social_handle')}</span>}{extraSocialLinks.map(link => <a key={link.id} href={safeLink(link.url)} target="_blank" rel="noopener noreferrer" className="ac-custom-small">{link.label} <ArrowUpRight size={13} /></a>)}</div>
      {socialPhotos.length > 0 && <div className="ac-social-gallery" aria-label="Cake collection">{socialPhotos.map(photo => <img key={photo.id} src={safeImage(photo.image_url)} alt={photo.image_alt ?? photo.title} loading="lazy" width="500" height="500" />)}{text('social_image_note') && <span><Heart size={20} />{text('social_image_note')}</span>}</div>}
    </div></section>}

    {faqs.length > 0 && <section className="ac-faq ac-container" aria-labelledby="faq-heading"><div><span className="ac-eyebrow">{text('faq_eyebrow')}</span><h2 id="faq-heading" style={preline}>{text('faq_title')}</h2><p style={preline}>{text('faq_description')}</p></div><div className="ac-faq-list">{faqs.map(item => <details key={item.id}><summary>{item.question}<Plus size={18} strokeWidth={1.3} /></summary><p style={preline}>{item.answer}</p></details>)}</div></section>}

    <footer className="ac-footer"><div className="ac-container">
      <div className="ac-footer-top"><div className="ac-footer-brand">{logo ? <BrandImage src={logo} alt="" brandName={settings.shop_name} width="42" height="42" style={{ width: 42, height: 42, objectFit: 'contain' }} /> : <Flower2 size={32} strokeWidth={1} />}<a href="#top">{settings.shop_name}<span>{text('footer_tagline')}</span></a></div><p style={preline}>{text('footer_about')}</p><a href="#catalog" className="ac-footer-round" aria-label={text('hero_cta')}><ArrowUpRight size={28} strokeWidth={1} /></a></div>
      <div className="ac-footer-links"><nav aria-label="Footer"><a href="#catalog">{text('nav_cakes')}</a><button onClick={onOpenCustomCake}>{text('nav_custom')}</button><a href="#our-story">{text('nav_story')}</a>{facebookUrl && <a href={facebookUrl} target="_blank" rel="noopener noreferrer">{text('nav_facebook')} <ArrowUpRight size={12} /></a>}{settingsSocialLinks.map(link => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} <ArrowUpRight size={12} /></a>)}{extraSocialLinks.map(link => <a key={link.id} href={safeLink(link.url)} target="_blank" rel="noopener noreferrer">{link.label} <ArrowUpRight size={12} /></a>)}{footerLinks.map(link => <a key={link.id} href={safeLink(link.url)} target={/^https?:/i.test(link.url) ? '_blank' : undefined} rel="noopener noreferrer">{link.label}</a>)}<button onClick={onOpenTrackOrder}>Track an order</button>{onOpenProfile && <button onClick={onOpenProfile}>My orders</button>}</nav>{settings.address && <span style={preline}>{settings.address}{(settings.opening_time || settings.closing_time) && <span style={{ display: 'block', marginTop: 6 }}>{settings.opening_time}{settings.opening_time && settings.closing_time ? ' – ' : ''}{settings.closing_time}</span>}</span>}</div>
      {(settings.phone || settings.whatsapp || settings.email) && <div className="ac-footer-links" style={{ paddingTop: 0 }}><nav aria-label={text('footer_contact_label') || 'Contact'}>{settings.phone && <a href={'tel:' + settings.phone.replace(/[^\d+]/g, '')}><Phone size={13} />{settings.phone}</a>}{settings.whatsapp && <a href={'https://wa.me/' + settings.whatsapp.replace(/\D/g, '')} target="_blank" rel="noopener noreferrer">WhatsApp {settings.whatsapp}</a>}{settings.email && <a href={'mailto:' + settings.email}><Mail size={13} />{settings.email}</a>}</nav></div>}
      <div className="ac-footer-bottom"><span>© {new Date().getFullYear()} {settings.shop_name}</span><span>{data.order_submission_enabled ? 'Orders sent to Aurora’s Cake · Cash on delivery' : text('footer_preview_note')}</span><span>{text('footer_copyright_note')}</span></div>
    </div></footer>
  </div>;
};
