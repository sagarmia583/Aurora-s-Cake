import type { ShopSettings, Product, Category, Flavor, ProductAddon, Banner, DeliveryZone, DeliverySlot, Coupon, Review } from './index';

export interface HeroSlide {
  id: string; product_id?: string; title: string; subtitle?: string; image_url: string; image_alt: string;
  sort_order: number; is_active: boolean;
}
export interface SiteHighlight {
  id: string; section: 'promise' | 'occasion' | 'custom_step' | 'social_gallery';
  title: string; description: string; image_url?: string; image_alt?: string; icon?: string; category_id?: string;
  sort_order: number; is_active: boolean;
}
export interface SiteFaq { id: string; question: string; answer: string; sort_order: number; is_active: boolean; }
export interface SiteLink {
  id: string; label: string; url: string; location: 'social' | 'footer' | 'navigation';
  sort_order: number; is_active: boolean;
}
export interface PublicSiteData {
  schema_version: 1;
  order_submission_enabled: boolean;
  settings: ShopSettings;
  content: Record<string, string>;
  hero_slides: HeroSlide[];
  highlights: SiteHighlight[];
  faqs: SiteFaq[];
  links: SiteLink[];
  products: Product[]; categories: Category[]; flavors: Flavor[]; addons: ProductAddon[];
  banners: Banner[]; zones: DeliveryZone[]; slots: DeliverySlot[]; coupons: Coupon[]; reviews: Review[];
}

