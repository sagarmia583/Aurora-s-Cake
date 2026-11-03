import type { Order } from '../types';

export type PosPaperSize = '80mm' | '58mm' | 'sticker_3x4';
export type PosReceiptType = 'customer_memo' | 'kitchen_ticket' | 'box_sticker';

export interface PosPrinterSettings {
  paperSize: PosPaperSize;
  defaultReceiptType: PosReceiptType;
  showShopLogo: boolean;
  showShopAddress: boolean;
  showShopPhone: boolean;
  showCakeMessage: boolean;
  showBaseSalePrice?: boolean;
  showQrCode: boolean;
  showWebQr: boolean;
  showFacebookQr: boolean;
  websiteUrl?: string;
  facebookUrl?: string;
  showComplimentaryKit: boolean;
  complimentaryKitTitle?: string;
  complimentaryItems?: string[];
  copiesCount: number; // 1 or 2
  fontSize: 'small' | 'medium' | 'large';
  autoPrintOnConfirm: boolean;
}

export const POS_SETTINGS_KEY = 'aurora_pos_printer_settings_v1';

export const DEFAULT_COMPLIMENTARY_ITEMS: string[] = [
  'Free Cake Knife',
  'Free Birthday Candles',
  'Premium Cake Box & Ribbon Handle',
];

export const DEFAULT_POS_SETTINGS: PosPrinterSettings = {
  paperSize: '80mm',
  defaultReceiptType: 'customer_memo',
  showShopLogo: true,
  showShopAddress: true,
  showShopPhone: true,
  showCakeMessage: true,
  showBaseSalePrice: true,
  showQrCode: true,
  showWebQr: true,
  showFacebookQr: true,
  websiteUrl: 'https://aurora-s-cake.sagarmia583.workers.dev/',
  facebookUrl: 'https://www.facebook.com/aurorascake26',
  showComplimentaryKit: true,
  complimentaryKitTitle: 'Complimentary Kit Inside Box:',
  complimentaryItems: [...DEFAULT_COMPLIMENTARY_ITEMS],
  copiesCount: 1,
  fontSize: 'medium',
  autoPrintOnConfirm: false,
};

export function getPosPrinterSettings(): PosPrinterSettings {
  try {
    const raw = localStorage.getItem(POS_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_POS_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_POS_SETTINGS,
      ...parsed,
      showBaseSalePrice: parsed.showBaseSalePrice !== undefined ? parsed.showBaseSalePrice : true,
      showWebQr: parsed.showWebQr !== undefined ? parsed.showWebQr : true,
      showFacebookQr: parsed.showFacebookQr !== undefined ? parsed.showFacebookQr : true,
      websiteUrl:
        parsed.websiteUrl && !/localhost|127\.0\.0\.1/i.test(parsed.websiteUrl)
          ? parsed.websiteUrl
          : DEFAULT_POS_SETTINGS.websiteUrl,
      facebookUrl: parsed.facebookUrl || DEFAULT_POS_SETTINGS.facebookUrl,
      complimentaryKitTitle: parsed.complimentaryKitTitle || DEFAULT_POS_SETTINGS.complimentaryKitTitle,
      complimentaryItems:
        Array.isArray(parsed.complimentaryItems) && parsed.complimentaryItems.length > 0
          ? parsed.complimentaryItems
          : [...DEFAULT_COMPLIMENTARY_ITEMS],
    };
  } catch {
    return { ...DEFAULT_POS_SETTINGS };
  }
}

export function savePosPrinterSettings(settings: Partial<PosPrinterSettings>): PosPrinterSettings {
  try {
    const current = getPosPrinterSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(POS_SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return { ...DEFAULT_POS_SETTINGS, ...settings };
  }
}

export function createDemoReceiptOrder(currency: string = '৳'): Order {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  return {
    id: 'ord-pos-demo',
    order_number: '0088',
    customer_name: 'Tanvir Ahmed (Demo Customer)',
    customer_phone: '01712-345678',
    delivery_address: 'House 12, Road 3, Akur Takur Para, Tangail Sadar',
    delivery_zone: {
      id: 'zone-1',
      name: 'Tangail Sadar',
      delivery_fee: 60,
      estimated_time: '1-2 Hours',
      is_active: true,
    },
    delivery_date: dateStr,
    delivery_slot: 'Afternoon (3 PM - 6 PM)',
    status: 'confirmed',
    subtotal: 1000,
    delivery_fee: 60,
    discount_amount: 100,
    total_amount: 960,
    payment_method: 'cod',
    payment_status: 'pending',
    delivery_otp: '',
    cod_amount: 960,
    cod_collected: false,
    coupon_code: 'AURORA10',
    order_note: 'কেকটি সাবধানে ডেলিভারি করবেন, যেন ক্রিম বা ফিনিশিং নষ্ট না হয়।',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    is_gift: false,
    history: [],
    items: [
      {
        id: 'item-1',
        order_id: 'ord-pos-demo',
        product_id: 'prod-vanilla',
        product_name: 'Vanilla Delight Celebration Cake',
        variant_name: '1.0 Pound (Regular)',
        flavor_name: 'Fresh Vanilla Cream',
        writing_message: 'Happy Birthday Ayan!',
        unit_price: 1000,
        base_price: 1150,
        sale_price: 1000,
        quantity: 1,
        subtotal: 1000,
        addons: [],
      },
    ],
  };
}
