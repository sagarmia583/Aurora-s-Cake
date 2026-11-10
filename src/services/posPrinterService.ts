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
  copiesCount: number; // 1 or 2
  fontSize: 'small' | 'medium' | 'large';
  autoPrintOnConfirm: boolean;
}

export const POS_SETTINGS_KEY = 'aurora_pos_printer_settings_v1';

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
  websiteUrl: 'https://aurorascake.netlify.app/',
  facebookUrl: 'https://www.facebook.com/aurorascake26',
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
