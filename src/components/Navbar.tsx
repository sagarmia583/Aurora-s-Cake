import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronDown, Clock, Database, Menu, Search, ShoppingBag, UserRound, X, Zap } from 'lucide-react';
import { ShopSettings, StaffRole } from '../types';
import type { PublicSiteData } from '../types/siteContent';
import { DEFAULT_PUBLIC_SITE_DATA } from '../content/defaultSiteData';

export type ViewMode = 'web' | 'mobile_app';

interface NavbarProps {
  settings: ShopSettings;
  publicData?: PublicSiteData;
  onOpenSheetSettings?: () => void;
  onOpenStaffPortal?: () => void;
  onOpenCustomerAccount?: () => void;
  isSheetConnected?: boolean;
  activeRole: StaffRole | 'customer';
  onRoleChange: (role: StaffRole | 'customer') => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  cartCount: number;
  onOpenCart: () => void;
  onOpenProfile: () => void;
  onOpenCacheHub: () => void;
  onOpenDbViewer: () => void;
  onOpenSupabaseSync: () => void;
  isSupabaseConnected: boolean;
  onOpenTrackOrder: () => void;
  onOpenCustomCake: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const staffRoles: { value: StaffRole | 'customer'; label: string }[] = [
  { value: 'customer', label: 'Customer storefront' },
  { value: 'super_admin', label: 'Super admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'order_manager', label: 'Order manager' },
  { value: 'kitchen_manager', label: 'Kitchen display' },
  { value: 'delivery_manager', label: 'Delivery manager' },
  { value: 'delivery_man', label: 'Delivery rider' },
  { value: 'accountant', label: 'Accountant' },
];

export const Navbar: React.FC<NavbarProps> = ({
  settings: suppliedSettings, activeRole, onRoleChange, viewMode, onViewModeChange, cartCount,
  onOpenCart, onOpenProfile, onOpenCacheHub, onOpenDbViewer, onOpenSupabaseSync,
  isSupabaseConnected, onOpenTrackOrder, onOpenCustomCake, searchQuery, onSearchChange,
  publicData, onOpenSheetSettings, isSheetConnected, onOpenStaffPortal, onOpenCustomerAccount,
}) => {
  const data: PublicSiteData = publicData ?? DEFAULT_PUBLIC_SITE_DATA;
  const settings = publicData?.settings ?? suppliedSettings;
  const text = (key: string) => data.content[key] ?? DEFAULT_PUBLIC_SITE_DATA.content[key] ?? '';
  const safeUrl = (value?: string) => value && /^(https?:\/\/|mailto:|tel:|#)/i.test(value.trim()) ? value.trim() : '';
  const facebookUrl = safeUrl(settings.facebook_url);
  const logoUrl = settings.logo_url && /^(https?:\/\/|\/[^/])/i.test(settings.logo_url.trim()) ? settings.logo_url.trim() : '';
  const navigationLinks = data.links.filter(link => link.is_active && link.location === 'navigation' && safeUrl(link.url)).sort((a, b) => a.sort_order - b.sort_order);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        setSearchOpen(false);
        setStudioOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setMobileOpen(false);
        setStudioOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const openStorefront = () => {
    onRoleChange('customer');
    onViewModeChange('web');
    setMobileOpen(false);
    setStudioOpen(false);
  };
  const customerAction = (action: () => void) => {
    setMobileOpen(false);
    setStudioOpen(false);
    action();
  };

  return (
    <header ref={headerRef} className="ac-nav">
      <style>{`
        .ac-nav{position:relative;z-index:40;background:#FFF9EE;color:#24352E;font-family:'Roboto',sans-serif}
        .ac-nav button,.ac-nav a,.ac-nav input,.ac-nav select{font:inherit}
        .ac-nav button,.ac-nav a{-webkit-tap-highlight-color:transparent}
        .ac-nav button{cursor:pointer}
        .ac-nav a{text-decoration:none;color:inherit}
        .ac-nav button:focus-visible,.ac-nav a:focus-visible,.ac-nav input:focus-visible,.ac-nav select:focus-visible{outline:2px solid #174B3B;outline-offset:5px}
        .ac-nav-top{height:32px;background:#174B3B;color:#FFF9EE;display:flex;align-items:center;justify-content:center;font-size:11px;letter-spacing:.08em;text-align:center;padding:0 50px;position:relative}
        .ac-nav-top span{opacity:.95}
        .ac-nav-studio-toggle{position:absolute;right:max(28px,calc((100vw - 1220px)/2));top:0;height:32px;display:flex;align-items:center;gap:4px;border:0;background:none;color:#E4EFCF;font-size:10px!important;letter-spacing:.04em}
        .ac-nav-main{width:min(1220px,calc(100% - 80px));margin:auto;min-height:96px;padding:18px 0;display:flex;align-items:center;justify-content:space-between;gap:32px;border-bottom:1px solid #174b3b24}
        .ac-nav-brand{display:flex;align-items:center;gap:12px;flex-shrink:0}
        .ac-nav-brand-symbol{width:39px;height:45px;color:#174B3B}
        .ac-nav-wordmark{display:block;font-family:'Roboto',sans-serif;font-size:29px;font-weight:800;line-height:1.05;letter-spacing:-1.1px}
        .ac-nav-brand-sub{display:block;margin-top:6px;font-size:8px;letter-spacing:.17em;text-transform:uppercase;color:#174B3B}
        .ac-nav-links{display:flex;align-items:center;gap:27px;font-size:14px;font-weight:500}
        .ac-nav-social{display:inline-flex;align-items:center;gap:4px}.ac-nav-links a,.ac-nav-link{position:relative;padding:11px 0;white-space:nowrap}
        .ac-nav-link{border:0;background:none;color:inherit}
        .ac-nav-links a:after,.ac-nav-link:after{content:'';height:1px;position:absolute;bottom:5px;left:0;width:0;background:#174B3B;transition:width .2s}
        .ac-nav-links a:hover:after,.ac-nav-link:hover:after{width:100%}
        .ac-nav-actions{display:flex;align-items:center;gap:13px}
        .ac-nav-staff-link{border:1px solid #174B3B;border-radius:20px;background:transparent;color:#174B3B;font-size:11px!important;font-weight:700;padding:8px 12px;white-space:nowrap}
        @media(max-width:600px){.ac-nav-staff-link{display:none}}
        .ac-nav-icon{width:39px;height:42px;display:grid;place-items:center;border:0;background:transparent;color:#174B3B;position:relative}
        .ac-nav-icon:hover{color:#24352E}
        .ac-nav-bag{display:flex;align-items:center;gap:9px;height:42px;background:none;border:0;color:#174B3B;padding:0 0 0 8px;font-size:13px!important;white-space:nowrap}
        .ac-nav-count{width:21px;height:21px;background:#E4EFCF;border-radius:50%;display:grid;place-items:center;font-size:10px;margin-left:1px}
        .ac-nav-search-dot{width:5px;height:5px;position:absolute;right:7px;top:7px;background:#174B3B;border-radius:50%}
        .ac-nav-mobile-toggle{display:none}
        .ac-nav-search{border-bottom:1px solid #174b3b24;padding:17px 24px;background:#E4EFCF}
        .ac-nav-search-form{max-width:750px;margin:auto;display:flex;align-items:center;gap:14px}
        .ac-nav-search-input{flex:1;min-width:0;border:0;background:transparent;outline:none;color:#24352E;font-size:14px!important;padding:8px 0}
        .ac-nav-search-input::placeholder{color:#174B3B}
        .ac-nav-search-submit{border:0;background:none;color:#174B3B;display:flex;align-items:center;gap:7px;font-size:11px!important;white-space:nowrap}
        .ac-nav-studio{position:absolute;top:38px;right:max(24px,calc((100vw - 1220px)/2));width:282px;border:1px solid #174b3b24;background:#FFF9EE;padding:22px;box-shadow:0 16px 40px #174b3b1c;z-index:51}
        .ac-nav-studio-title{font-family:'Roboto',sans-serif;font-size:21px;font-weight:700;letter-spacing:-.5px;margin:0 0 17px}
        .ac-nav-studio label{font-size:9px;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:7px;color:#174B3B}
        .ac-nav-studio select{width:100%;padding:10px 8px;border:1px solid #174b3b24;background:#FFF9EE;color:#24352E;font-size:12px;margin-bottom:18px}
        .ac-nav-view-switch{display:flex;border:1px solid #174b3b24;margin-bottom:17px}
        .ac-nav-view-switch button{flex:1;background:none;border:0;padding:9px 3px;font-size:11px;color:#174B3B}
        .ac-nav-view-switch button[aria-pressed=true]{background:#E4EFCF;color:#174B3B}
        .ac-nav-studio-action{width:100%;display:flex;align-items:center;gap:9px;background:none;border:0;border-top:1px solid #174b3b24;color:#24352E;font-size:11px!important;padding:12px 0;text-align:left}
        .ac-nav-status{width:6px;height:6px;border-radius:50%;background:#F2B691;margin-left:auto}
        .ac-nav-status[data-connected=true]{background:#174B3B}
        .ac-nav-staff-notice{display:flex;align-items:center;justify-content:center;gap:14px;background:#E4EFCF;padding:9px 20px;font-size:11px;color:#24352E}
        .ac-nav-staff-notice button{background:none;border:0;border-bottom:1px solid #174B3B;color:#174B3B;padding:1px 0}
        .ac-nav-mobile{display:none}
        @media(min-width:1100px){.ac-nav-main{padding-top:20px;padding-bottom:20px}}
        @media(max-width:1099px){.ac-nav-main{width:calc(100% - 56px);padding:18px 0;gap:20px}.ac-nav-links{gap:20px;font-size:13px}.ac-nav-wordmark{font-size:27px}.ac-nav-actions{gap:5px}.ac-nav-brand{gap:8px}.ac-nav-brand-symbol{width:32px}}
        @media(max-width:980px){.ac-nav-main{width:calc(100% - 44px);min-height:82px;padding:15px 0;gap:10px}.ac-nav-top{font-size:10px;letter-spacing:.05em;padding:0 65px 0 14px;justify-content:flex-start}.ac-nav-studio-toggle{right:18px;font-size:9px!important}.ac-nav-links,.ac-nav-desktop-profile,.ac-nav-bag-label{display:none}.ac-nav-wordmark{font-size:26px}.ac-nav-brand-sub{font-size:7px;letter-spacing:.14em;margin-top:6px}.ac-nav-brand-symbol{width:30px;height:38px}.ac-nav-actions{gap:0}.ac-nav-icon{width:35px}.ac-nav-bag{padding:0 7px;gap:5px}.ac-nav-count{width:17px;height:17px;font-size:9px}.ac-nav-mobile-toggle{display:grid}.ac-nav-mobile{display:flex;flex-direction:column;padding:12px 24px 22px;background:#FFF9EE;border-bottom:1px solid #174b3b24;box-shadow:0 15px 20px #24352E08}.ac-nav-mobile a,.ac-nav-mobile button{display:flex;align-items:center;justify-content:space-between;min-height:47px;padding:10px 0;font-size:13px;text-align:left;border:0;border-bottom:1px solid #174b3b24;background:none;color:#174B3B}.ac-nav-mobile-small{font-size:12px!important;color:#174B3B!important}.ac-nav-search-form{gap:10px}.ac-nav-search-submit span{display:none}}
        @media(max-width:380px){.ac-nav-main{width:calc(100% - 28px)}.ac-nav-brand-symbol{display:none}.ac-nav-wordmark{font-size:25px}.ac-nav-top{font-size:9px}.ac-nav-icon{width:31px}}
      `}</style>
      <div className="ac-nav-top">
        <span>{settings.top_announcement_text ?? ''}</span>
        {import.meta.env?.DEV && <button type="button" className="ac-nav-studio-toggle" aria-expanded={studioOpen} aria-controls="ac-studio-menu" onClick={() => setStudioOpen(!studioOpen)}>Studio <ChevronDown size={10} strokeWidth={1.5} /></button>}
      </div>
      <div className="ac-nav-main">
        <a className="ac-nav-brand" href="#top" onClick={openStorefront} aria-label={settings.shop_name + ' home'}>
          {logoUrl ? <img className="ac-nav-brand-symbol" src={logoUrl} alt="" width="42" height="45" style={{ objectFit: 'contain' }} /> : <svg className="ac-nav-brand-symbol" viewBox="0 0 42 48" fill="none" aria-hidden="true">
            <path d="M5 39h32M8 36V23c4 0 4 5 8 5s4-5 8-5 4 5 10 5v8H8Zm0-13v-4h26v4M12 19v-6h18v6M21 12V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 6c-4-3 0-6 0-6s4 3 0 6Z" fill="currentColor" transform="translate(0 2)" />
            <path d="M4 44c8-2 26-2 34 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>}
          <span><span className="ac-nav-wordmark">{settings.shop_name}</span>{text('brand_tagline') && <span className="ac-nav-brand-sub">{text('brand_tagline')}</span>}</span>
        </a>
        <nav className="ac-nav-links" aria-label="Main navigation">
          {text('nav_cakes') && <a href="#catalog" onClick={openStorefront}>{text('nav_cakes')}</a>}
          {text('nav_custom') && <button type="button" className="ac-nav-link" onClick={() => customerAction(onOpenCustomCake)}>{text('nav_custom')}</button>}
          {text('nav_story') && <a href="#our-story" onClick={openStorefront}>{text('nav_story')}</a>}
          {facebookUrl && text('nav_facebook') && <a className="ac-nav-social" href={facebookUrl} target="_blank" rel="noopener noreferrer" aria-label={settings.shop_name + ' on Facebook (opens in a new tab)'}>{text('nav_facebook')} <ArrowUpRight size={13} strokeWidth={1.5} /></a>}
          {navigationLinks.map(link => <a key={link.id} className="ac-nav-social" href={safeUrl(link.url)} target={/^https?:/i.test(link.url) ? '_blank' : undefined} rel="noopener noreferrer">{link.label}{/^https?:/i.test(link.url) && <ArrowUpRight size={13} />}</a>)}
        </nav>
        <div className="ac-nav-actions">
          <button type="button" className="ac-nav-icon" aria-label={searchOpen ? 'Close cake search' : 'Search cakes'} aria-expanded={searchOpen} aria-controls="ac-cake-search" onClick={() => setSearchOpen(!searchOpen)}>
            {searchOpen ? <X size={19} strokeWidth={1.5} /> : <Search size={19} strokeWidth={1.5} />}
            {searchQuery && !searchOpen && <span className="ac-nav-search-dot" />}
          </button>
          {onOpenCustomerAccount && <button type="button" onClick={onOpenCustomerAccount} className="ac-nav-staff-link" title="Phone signup, persistent Google Sheets profile and order history">Customer details / My orders</button>}
          {onOpenStaffPortal && <button type="button" onClick={onOpenStaffPortal} className="ac-nav-staff-link" title="Verified bakery staff sign in">Staff login</button>}
          <button type="button" className="ac-nav-icon ac-nav-desktop-profile" aria-label="My account and orders" onClick={() => customerAction(onOpenProfile)}><UserRound size={19} strokeWidth={1.5} /></button>
          <button type="button" className="ac-nav-bag" onClick={() => customerAction(onOpenCart)} aria-label={`Open shopping bag, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}>
            <ShoppingBag size={19} strokeWidth={1.5} /><span className="ac-nav-bag-label">Bag</span><span className="ac-nav-count">{cartCount}</span>
          </button>
          <button type="button" className="ac-nav-icon ac-nav-mobile-toggle" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen} aria-controls="ac-mobile-navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={21} strokeWidth={1.5} /> : <Menu size={21} strokeWidth={1.5} />}</button>
        </div>
      </div>
      {searchOpen && <div className="ac-nav-search" id="ac-cake-search">
        <form className="ac-nav-search-form" role="search" onSubmit={(event) => { event.preventDefault(); openStorefront(); window.setTimeout(() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' }), 0); }}>
          <Search size={19} strokeWidth={1.5} aria-hidden="true" />
          <input ref={searchRef} className="ac-nav-search-input" type="search" aria-label="Search cake collection" placeholder={text('nav_search_placeholder')} value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} />
          <button type="submit" className="ac-nav-search-submit"><span>{text('hero_cta')}</span><ArrowRight size={17} strokeWidth={1.5} /></button>
        </form>
      </div>}
      {mobileOpen && <nav id="ac-mobile-navigation" className="ac-nav-mobile" aria-label="Mobile navigation">
        {text('nav_cakes') && <a href="#catalog" onClick={openStorefront}>{text('nav_cakes')} <ArrowRight size={16} strokeWidth={1.5} /></a>}
        {text('nav_custom') && <button type="button" onClick={() => customerAction(onOpenCustomCake)}>{text('nav_custom')} <ArrowRight size={16} strokeWidth={1.5} /></button>}
        {text('nav_story') && <a href="#our-story" onClick={openStorefront}>{text('nav_story')} <ArrowRight size={16} strokeWidth={1.5} /></a>}
        {facebookUrl && text('nav_facebook') && <a href={facebookUrl} target="_blank" rel="noopener noreferrer" aria-label={settings.shop_name + ' on Facebook (opens in a new tab)'} onClick={() => setMobileOpen(false)}>{text('nav_facebook')} <ArrowUpRight size={16} strokeWidth={1.5} /></a>}
        {navigationLinks.map(link => <a key={link.id} href={safeUrl(link.url)} target={/^https?:/i.test(link.url) ? '_blank' : undefined} rel="noopener noreferrer" onClick={() => setMobileOpen(false)}>{link.label}<ArrowUpRight size={16} /></a>)}
        {onOpenCustomerAccount && <button type="button" className="ac-nav-mobile-small" onClick={() => customerAction(onOpenCustomerAccount)}>Customer details / My orders</button>}
        {onOpenStaffPortal && <button type="button" className="ac-nav-mobile-small" onClick={() => customerAction(onOpenStaffPortal)}>Staff login</button>}
        <button type="button" className="ac-nav-mobile-small" onClick={() => customerAction(onOpenProfile)}>My account &amp; orders</button>
        <button type="button" className="ac-nav-mobile-small" onClick={() => customerAction(onOpenTrackOrder)}>Track an order</button>
      </nav>}
      {import.meta.env?.DEV && studioOpen && <div id="ac-studio-menu" className="ac-nav-studio">
        <h2 className="ac-nav-studio-title">Behind the bakery</h2>
        <label htmlFor="ac-staff-role">Staff workspace</label>
        <select id="ac-staff-role" value={activeRole} onChange={(event) => { onRoleChange(event.target.value as StaffRole | 'customer'); onViewModeChange('web'); setStudioOpen(false); }}>
          {staffRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
        </select>
        <label>Experience</label>
        <div className="ac-nav-view-switch">
          <button type="button" aria-pressed={viewMode === 'web'} onClick={() => onViewModeChange('web')}>Website</button>
          <button type="button" aria-pressed={viewMode === 'mobile_app'} onClick={() => onViewModeChange('mobile_app')}>Mobile app</button>
        </div>
        <button type="button" className="ac-nav-studio-action" onClick={() => customerAction(onOpenTrackOrder)}><Clock size={14} /> Track an order</button>
        {onOpenSheetSettings && <button type="button" className="ac-nav-studio-action" onClick={() => customerAction(onOpenSheetSettings)}><Database size={14} /> Google Sheets content <span className="ac-nav-status" data-connected={isSheetConnected} title={isSheetConnected ? 'Connected to Google Sheets' : 'Google Sheets is not connected'} /></button>}
        <button type="button" className="ac-nav-studio-action" onClick={() => customerAction(onOpenSupabaseSync)}><Database size={14} /> Database connection <span className="ac-nav-status" data-connected={isSupabaseConnected} title={isSupabaseConnected ? 'Connected' : 'Local preview'} /></button>
        <button type="button" className="ac-nav-studio-action" onClick={() => customerAction(onOpenCacheHub)}><Zap size={14} /> Cache performance</button>
        <button type="button" className="ac-nav-studio-action" onClick={() => customerAction(onOpenDbViewer)}><Database size={14} /> Database schema</button>
      </div>}
      {viewMode === 'web' && activeRole !== 'customer' && <div className="ac-nav-staff-notice">
        <span>{staffRoles.find((role) => role.value === activeRole)?.label} workspace</span>
        <button type="button" onClick={openStorefront}>Return to storefront</button>
      </div>}
    </header>
  );
};
