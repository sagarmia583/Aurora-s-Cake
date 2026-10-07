import { supabaseService } from './supabaseClient';
import {
  ShopSettings,
  Category,
  Product,
  ProductVariant,
  Flavor,
  ProductAddon,
  Banner,
  DeliveryZone,
  DeliverySlot,
  Order,
  Coupon,
  Review,
  CustomCakeRequest,
  CartItem,
} from '../types';

export interface SupabaseSyncStatus {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt?: string;
  source: 'supabase_live' | 'local_reactive';
  tablesStatus: {
    shop_settings: number;
    categories: number;
    products: number;
    product_variants: number;
    flavors: number;
    product_addons: number;
    banners: number;
    delivery_zones: number;
    delivery_slots: number;
    coupons: number;
    reviews: number;
    orders: number;
    custom_cake_requests: number;
  };
  errorMessage?: string;
}

class SupabaseDataService {
  private status: SupabaseSyncStatus = {
    isConnected: false,
    isSyncing: false,
    source: 'local_reactive',
    tablesStatus: {
      shop_settings: 1,
      categories: 6,
      products: 6,
      product_variants: 14,
      flavors: 6,
      product_addons: 6,
      banners: 2,
      delivery_zones: 3,
      delivery_slots: 4,
      coupons: 3,
      reviews: 4,
      orders: 3,
      custom_cake_requests: 2,
    },
  };

  private listeners: Set<(status: SupabaseSyncStatus) => void> = new Set();
  private realtimeChannel: any = null;

  constructor() {
    this.checkConnection();
  }

  public subscribe(cb: (status: SupabaseSyncStatus) => void) {
    this.listeners.add(cb);
    cb(this.getStatus());
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.getStatus()));
  }

  public getStatus(): SupabaseSyncStatus {
    return { ...this.status, tablesStatus: { ...this.status.tablesStatus } };
  }

  public async checkConnection(): Promise<boolean> {
    const client = supabaseService.getClient();
    if (!client) {
      this.status.isConnected = false;
      this.status.source = 'local_reactive';
      this.notify();
      return false;
    }

    try {
      this.status.isSyncing = true;
      this.notify();

      const { data, error } = await client.from('shop_settings').select('id').limit(1);
      if (error && error.code !== 'PGRST116') {
        this.status.isConnected = false;
        this.status.source = 'local_reactive';
        this.status.errorMessage = error.message;
        this.status.isSyncing = false;
        this.notify();
        return false;
      }

      this.status.isConnected = true;
      this.status.source = 'supabase_live';
      this.status.lastSyncedAt = new Date().toLocaleTimeString();
      this.status.errorMessage = undefined;
      this.status.isSyncing = false;
      this.notify();

      this.setupRealtimeSubscriptions();
      return true;
    } catch (err: unknown) {
      this.status.isConnected = false;
      this.status.source = 'local_reactive';
      this.status.errorMessage = err instanceof Error ? err.message : 'Connection failed';
      this.status.isSyncing = false;
      this.notify();
      return false;
    }
  }

  private setupRealtimeSubscriptions() {
    const client = supabaseService.getClient();
    if (!client || this.realtimeChannel) return;

    try {
      this.realtimeChannel = client
        .channel('public_live_cakeshop')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shop_settings' },
          () => {
            this.status.lastSyncedAt = new Date().toLocaleTimeString();
            this.notify();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'products' },
          () => {
            this.status.lastSyncedAt = new Date().toLocaleTimeString();
            this.notify();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          () => {
            this.status.lastSyncedAt = new Date().toLocaleTimeString();
            this.notify();
          }
        )
        .subscribe();
    } catch {
      // Realtime subscription optional
    }
  }

  // --- FETCH FROM SUPABASE ---
  public async loadAllDataFromSupabase(): Promise<{
    settings?: ShopSettings;
    categories?: Category[];
    products?: Product[];
    flavors?: Flavor[];
    addons?: ProductAddon[];
    banners?: Banner[];
    zones?: DeliveryZone[];
    slots?: DeliverySlot[];
    orders?: Order[];
    coupons?: Coupon[];
    reviews?: Review[];
    customCakes?: CustomCakeRequest[];
  } | null> {
    const client = supabaseService.getClient();
    if (!client) return null;

    try {
      this.status.isSyncing = true;
      this.notify();

      const [
        settingsRes,
        categoriesRes,
        productsRes,
        variantsRes,
        flavorsRes,
        addonsRes,
        bannersRes,
        zonesRes,
        slotsRes,
        couponsRes,
        reviewsRes,
        ordersRes,
        customCakesRes,
      ] = await Promise.allSettled([
        client.from('shop_settings').select('*').limit(1).single(),
        client.from('categories').select('*').order('sort_order', { ascending: true }),
        client.from('products').select('*').order('sort_order', { ascending: true }),
        client.from('product_variants').select('*'),
        client.from('flavors').select('*'),
        client.from('product_addons').select('*'),
        client.from('banners').select('*').order('sort_order', { ascending: true }),
        client.from('delivery_zones').select('*'),
        client.from('delivery_slots').select('*'),
        client.from('coupons').select('*'),
        client.from('reviews').select('*').order('created_at', { ascending: false }),
        client.from('orders').select('*').order('created_at', { ascending: false }),
        client.from('custom_cake_requests').select('*').order('created_at', { ascending: false }),
      ]);

      const result: any = {};

      if (settingsRes.status === 'fulfilled' && settingsRes.value.data) {
        result.settings = settingsRes.value.data as ShopSettings;
        this.status.tablesStatus.shop_settings = 1;
      }

      if (categoriesRes.status === 'fulfilled' && categoriesRes.value.data) {
        result.categories = categoriesRes.value.data as Category[];
        this.status.tablesStatus.categories = result.categories.length;
      }

      const allVariants: ProductVariant[] =
        variantsRes.status === 'fulfilled' && variantsRes.value.data
          ? (variantsRes.value.data as ProductVariant[])
          : [];
      this.status.tablesStatus.product_variants = allVariants.length;

      if (productsRes.status === 'fulfilled' && productsRes.value.data) {
        const rawProducts = productsRes.value.data;
        result.products = rawProducts.map((p: any) => ({
          ...p,
          variants: allVariants.filter((v) => v.product_id === p.id),
          allowed_flavor_ids: p.allowed_flavor_ids || ['fl-1', 'fl-2', 'fl-3', 'fl-4'],
          allowed_addon_ids: p.allowed_addon_ids || ['addon-1', 'addon-2', 'addon-3', 'addon-4'],
          rating: p.rating || 5,
          review_count: p.review_count || 12,
        })) as Product[];
        this.status.tablesStatus.products = result.products.length;
      }

      if (flavorsRes.status === 'fulfilled' && flavorsRes.value.data) {
        result.flavors = flavorsRes.value.data as Flavor[];
        this.status.tablesStatus.flavors = result.flavors.length;
      }

      if (addonsRes.status === 'fulfilled' && addonsRes.value.data) {
        result.addons = addonsRes.value.data as ProductAddon[];
        this.status.tablesStatus.product_addons = result.addons.length;
      }

      if (bannersRes.status === 'fulfilled' && bannersRes.value.data) {
        result.banners = bannersRes.value.data as Banner[];
        this.status.tablesStatus.banners = result.banners.length;
      }

      if (zonesRes.status === 'fulfilled' && zonesRes.value.data) {
        result.zones = zonesRes.value.data as DeliveryZone[];
        this.status.tablesStatus.delivery_zones = result.zones.length;
      }

      if (slotsRes.status === 'fulfilled' && slotsRes.value.data) {
        result.slots = slotsRes.value.data as DeliverySlot[];
        this.status.tablesStatus.delivery_slots = result.slots.length;
      }

      if (couponsRes.status === 'fulfilled' && couponsRes.value.data) {
        result.coupons = couponsRes.value.data as Coupon[];
        this.status.tablesStatus.coupons = result.coupons.length;
      }

      if (reviewsRes.status === 'fulfilled' && reviewsRes.value.data) {
        result.reviews = reviewsRes.value.data as Review[];
        this.status.tablesStatus.reviews = result.reviews.length;
      }

      if (ordersRes.status === 'fulfilled' && ordersRes.value.data) {
        result.orders = ordersRes.value.data as Order[];
        this.status.tablesStatus.orders = result.orders.length;
      }

      if (customCakesRes.status === 'fulfilled' && customCakesRes.value.data) {
        result.customCakes = customCakesRes.value.data as CustomCakeRequest[];
        this.status.tablesStatus.custom_cake_requests = result.customCakes.length;
      }

      this.status.isConnected = true;
      this.status.source = 'supabase_live';
      this.status.lastSyncedAt = new Date().toLocaleTimeString();
      this.status.isSyncing = false;
      this.notify();

      return result;
    } catch (err: unknown) {
      this.status.isSyncing = false;
      this.status.errorMessage = err instanceof Error ? err.message : 'Fetch failed';
      this.notify();
      return null;
    }
  }

  // --- 1-CLICK PUSH / SEED ALL TO SUPABASE ---
  public async pushAllDataToSupabase(payload: {
    settings: ShopSettings;
    categories: Category[];
    products: Product[];
    flavors: Flavor[];
    addons: ProductAddon[];
    banners: Banner[];
    zones: DeliveryZone[];
    slots: DeliverySlot[];
    coupons: Coupon[];
    reviews: Review[];
  }): Promise<{ success: boolean; message: string }> {
    const client = supabaseService.getClient();
    if (!client) {
      return {
        success: false,
        message: 'Supabase client is not configured. Please enter your Supabase URL & Anon Key first.',
      };
    }

    try {
      this.status.isSyncing = true;
      this.notify();

      // 1. Settings
      await client.from('shop_settings').upsert({
        id: payload.settings.id,
        shop_name: payload.settings.shop_name,
        logo_url: payload.settings.logo_url,
        phone: payload.settings.phone,
        whatsapp: payload.settings.whatsapp,
        email: payload.settings.email,
        address: payload.settings.address,
        opening_time: payload.settings.opening_time,
        closing_time: payload.settings.closing_time,
        currency: payload.settings.currency,
        accepting_orders: payload.settings.accepting_orders,
        delivery_enabled: payload.settings.delivery_enabled,
        website_title: payload.settings.website_title,
        website_description: payload.settings.website_description,
        top_announcement_text: payload.settings.top_announcement_text,
        hero_tagline: payload.settings.hero_tagline,
        hero_title: payload.settings.hero_title,
        hero_subtitle: payload.settings.hero_subtitle,
        hero_cta_text: payload.settings.hero_cta_text,
        trust_badge_1_title: payload.settings.trust_badge_1_title,
        trust_badge_1_desc: payload.settings.trust_badge_1_desc,
        trust_badge_2_title: payload.settings.trust_badge_2_title,
        trust_badge_2_desc: payload.settings.trust_badge_2_desc,
        trust_badge_3_title: payload.settings.trust_badge_3_title,
        trust_badge_3_desc: payload.settings.trust_badge_3_desc,
        trust_badge_4_title: payload.settings.trust_badge_4_title,
        trust_badge_4_desc: payload.settings.trust_badge_4_desc,
        custom_cake_promo_tag: payload.settings.custom_cake_promo_tag,
        custom_cake_promo_title: payload.settings.custom_cake_promo_title,
        custom_cake_promo_desc: payload.settings.custom_cake_promo_desc,
        custom_cake_promo_btn: payload.settings.custom_cake_promo_btn,
        footer_about_text: payload.settings.footer_about_text,
      });

      // 2. Categories
      if (payload.categories.length > 0) {
        await client.from('categories').upsert(payload.categories);
      }

      // 3. Flavors
      if (payload.flavors.length > 0) {
        await client.from('flavors').upsert(payload.flavors);
      }

      // 4. Addons
      if (payload.addons.length > 0) {
        await client.from('product_addons').upsert(payload.addons);
      }

      // 5. Products & Variants
      if (payload.products.length > 0) {
        const cleanProducts = payload.products.map(({ variants, ...rest }) => rest);
        await client.from('products').upsert(cleanProducts);

        const allVariants = payload.products.flatMap((p) => p.variants || []);
        if (allVariants.length > 0) {
          await client.from('product_variants').upsert(allVariants);
        }
      }

      // 6. Banners
      if (payload.banners.length > 0) {
        await client.from('banners').upsert(payload.banners);
      }

      // 7. Zones & Slots
      if (payload.zones.length > 0) {
        await client.from('delivery_zones').upsert(payload.zones);
      }
      if (payload.slots.length > 0) {
        await client.from('delivery_slots').upsert(payload.slots);
      }

      // 8. Coupons
      if (payload.coupons.length > 0) {
        await client.from('coupons').upsert(payload.coupons);
      }

      this.status.isConnected = true;
      this.status.source = 'supabase_live';
      this.status.lastSyncedAt = new Date().toLocaleTimeString();
      this.status.isSyncing = false;
      this.notify();

      return {
        success: true,
        message: 'All shop settings, texts, categories, products, variants, and addons were successfully pushed to your live Supabase database!',
      };
    } catch (err: unknown) {
      this.status.isSyncing = false;
      const msg = err instanceof Error ? err.message : 'Failed to push to Supabase';
      this.status.errorMessage = msg;
      this.notify();
      return {
        success: false,
        message: msg,
      };
    }
  }

  // --- SAVE ORDER TO SUPABASE ---
  public async saveOrderToSupabase(order: Order): Promise<boolean> {
    const client = supabaseService.getClient();
    if (!client) return false;

    try {
      const { items, ...orderHeader } = order;
      await client.from('orders').insert(orderHeader);

      if (items && items.length > 0) {
        const dbItems = items.map((it) => ({
          id: it.id,
          order_id: order.id,
          product_id: it.product_id,
          product_name: it.product_name,
          variant_name: it.variant_name,
          flavor_name: it.flavor_name,
          writing_message: it.writing_message,
          quantity: it.quantity,
          unit_price: it.unit_price,
          subtotal: it.subtotal,
          addons: it.addons,
        }));
        await client.from('order_items').insert(dbItems);
      }

      this.status.lastSyncedAt = new Date().toLocaleTimeString();
      this.notify();
      return true;
    } catch {
      return false;
    }
  }
}

export const supabaseDataService = new SupabaseDataService();
