export interface Ingredient {
  id: string;
  name: string;
  category: 'flour' | 'sugar' | 'dairy' | 'eggs' | 'flavoring' | 'packaging' | 'other';
  unit: 'kg' | 'g' | 'liter' | 'ml' | 'pcs' | 'pack' | 'box';
  current_stock: number;
  minimum_stock: number;
  cost_per_unit: number;
  supplier_name: string;
}

export interface StockMovement {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  movement_type: 'purchase' | 'usage' | 'damage' | 'adjustment';
  quantity: number;
  unit: string;
  unit_cost?: number;
  total_cost?: number;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface RecipeItem {
  id: string;
  product_id: string;
  product_name: string;
  serves: number;
  prep_time_minutes: number;
  bake_time_minutes: number;
  ingredients: Array<{ name: string; quantity: string }>;
  description: string;
}

export interface SupplierItem {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  category: string;
  due_amount: number;
  total_purchases: number;
}

export interface PurchaseRecord {
  id: string;
  invoice_number: string;
  supplier_id: string;
  supplier_name: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  items_summary: string;
  purchase_date: string;
  status: 'paid' | 'partial' | 'due';
}

export interface CashAccountItem {
  id: string;
  account_name: string;
  account_type: 'cash' | 'bank' | 'bkash' | 'nagad';
  account_number?: string;
  current_balance: number;
  is_active: boolean;
}

export interface CouponItem {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount: number;
  max_discount_amount?: number;
  usage_count: number;
  is_active: boolean;
}

export const INITIAL_INGREDIENTS: Ingredient[] = [
  { id: 'ing-1', name: 'প্রিমিয়াম ময়দা (All-Purpose Flour)', category: 'flour', unit: 'kg', current_stock: 45, minimum_stock: 20, cost_per_unit: 75, supplier_name: 'ফ্রেশ মিলস' },
  { id: 'ing-2', name: 'সাদা চিনি (Refined Sugar)', category: 'sugar', unit: 'kg', current_stock: 12, minimum_stock: 25, cost_per_unit: 140, supplier_name: 'দেশ এন্টারপ্রাইজ' },
  { id: 'ing-3', name: 'হুইপিং ক্রিম (Ever-Whip Cream)', category: 'dairy', unit: 'liter', current_stock: 8, minimum_stock: 15, cost_per_unit: 450, supplier_name: 'গাজী অ্যান্ড ব্রাদার্স' },
  { id: 'ing-4', name: 'ডিম (Fresh Farm Eggs)', category: 'eggs', unit: 'pcs', current_stock: 120, minimum_stock: 60, cost_per_unit: 13, supplier_name: 'লোকাল পোল্ট্রি ফার্ম' },
  { id: 'ing-5', name: 'ডার্ক চকলেট কম্পাউন্ড (Van Houten)', category: 'flavoring', unit: 'kg', current_stock: 15, minimum_stock: 10, cost_per_unit: 850, supplier_name: 'চকলেট হাউস' },
  { id: 'ing-6', name: 'কেক বক্স (1kg Window Box)', category: 'packaging', unit: 'pcs', current_stock: 85, minimum_stock: 50, cost_per_unit: 35, supplier_name: 'প্যাকেজিং সলিউশন্স' },
  { id: 'ing-7', name: 'কেক বেস বোর্ড (10 inch Silver)', category: 'packaging', unit: 'pcs', current_stock: 40, minimum_stock: 50, cost_per_unit: 25, supplier_name: 'প্যাকেজিং সলিউশন্স' },
  { id: 'ing-8', name: 'বাটার (Aarong Unsalted Butter)', category: 'dairy', unit: 'kg', current_stock: 14, minimum_stock: 10, cost_per_unit: 920, supplier_name: 'আড়ং ডেইরি' },
];

export const INITIAL_RECIPES: RecipeItem[] = [
  {
    id: 'rec-1',
    product_id: 'prod-vanilla',
    product_name: 'ভ্যানিলা স্পঞ্জ কেক (১ পাউন্ড)',
    serves: 6,
    prep_time_minutes: 20,
    bake_time_minutes: 35,
    ingredients: [
      { name: 'ময়দা', quantity: '২০০ গ্রাম' },
      { name: 'চিনি', quantity: '১৮০ গ্রাম' },
      { name: 'ডিম', quantity: '৩ টি' },
      { name: 'ভ্যানিলা এসেন্স', quantity: '১ চা চামচ' },
      { name: 'বাটার/তেল', quantity: '১০০ গ্রাম' },
    ],
    description: 'নরম স্পঞ্জি ভ্যানিলা বেইজ কেক, ওভেন প্রি-হিট ১৭০° সে.',
  },
  {
    id: 'rec-2',
    product_id: 'prod-chocolate',
    product_name: 'রিচ চকলেট ফাজ কেক (১ পাউন্ড)',
    serves: 6,
    prep_time_minutes: 25,
    bake_time_minutes: 40,
    ingredients: [
      { name: 'ময়দা', quantity: '১৮০ গ্রাম' },
      { name: 'কোকো পাউডার', quantity: '৫০ গ্রাম' },
      { name: 'ডার্ক চকলেট', quantity: '১০০ গ্রাম' },
      { name: 'চিনি', quantity: '২০০ গ্রাম' },
      { name: 'ডিম', quantity: '৪ টি' },
    ],
    description: 'ঘন বেলজিয়ান চকলেট ড্রিপ ও ক্রিম ফ্রস্টিং',
  },
  {
    id: 'rec-3',
    product_id: 'prod-red-velvet',
    product_name: 'সিগনেচার রেড ভেলভেট (১ পাউন্ড)',
    serves: 6,
    prep_time_minutes: 25,
    bake_time_minutes: 35,
    ingredients: [
      { name: 'ময়দা', quantity: '২২০ গ্রাম' },
      { name: 'বাটার মিল্ক', quantity: '১২০ মিলি' },
      { name: 'ক্রিম চিজ', quantity: '১৫০ গ্রাম' },
      { name: 'চিনি', quantity: '১৯০ গ্রাম' },
    ],
    description: 'ক্রিম চিজ ফ্রস্টিং সমৃদ্ধ ঐতিহ্যবাহী রেড ভেলভেট',
  },
];

export const INITIAL_SUPPLIERS: SupplierItem[] = [
  { id: 'sup-1', name: 'ফ্রেশ মিলস লিমিটেড', contact_person: 'কামাল উদ্দিন', phone: '01712-345678', category: 'ময়দা ও বেকিং পাউডার', due_amount: 3500, total_purchases: 45000 },
  { id: 'sup-2', name: 'দেশ এন্টারপ্রাইজ', contact_person: 'রফিকুল ইসলাম', phone: '01819-234567', category: 'চিনি ও বেকিং উপকরণ', due_amount: 0, total_purchases: 32000 },
  { id: 'sup-3', name: 'গাজী অ্যান্ড ব্রাদার্স', contact_person: 'ফারুক গাজী', phone: '01911-889900', category: 'হুইপিং ক্রিম ও ডেইরি', due_amount: 8500, total_purchases: 78000 },
  { id: 'sup-4', name: 'প্যাকেজিং সলিউশন্স', contact_person: 'মেহেদী হাসান', phone: '01670-112233', category: 'কেক বক্স ও বেস বোর্ড', due_amount: 1800, total_purchases: 26000 },
];

export const INITIAL_CASH_ACCOUNTS: CashAccountItem[] = [
  { id: 'acc-drawer', account_name: 'কাউন্টার ক্যাশ ড্রয়ার (Bakery Cash)', account_type: 'cash', current_balance: 14500, is_active: true },
  { id: 'acc-dbbl', account_name: 'DBBL ব্যাংক অ্যাকাউন্ট', account_type: 'bank', account_number: '171.120.XXXX', current_balance: 52000, is_active: true },
  { id: 'acc-bkash', account_name: 'bKash মার্চেন্ট অ্যাকাউন্ট', account_type: 'bkash', account_number: '01711-XXXXXX', current_balance: 18450, is_active: true },
  { id: 'acc-nagad', account_name: 'Nagad মার্চেন্ট অ্যাকাউন্ট', account_type: 'nagad', account_number: '01812-XXXXXX', current_balance: 9200, is_active: true },
];

export const INITIAL_COUPONS: CouponItem[] = [
  { id: 'coup-1', code: 'AURORA10', discount_type: 'percentage', discount_value: 10, min_order_amount: 1000, max_discount_amount: 250, usage_count: 42, is_active: true },
  { id: 'coup-2', code: 'SWEET50', discount_type: 'fixed', discount_value: 50, min_order_amount: 500, usage_count: 88, is_active: true },
  { id: 'coup-3', code: 'BIRTHDAY100', discount_type: 'fixed', discount_value: 100, min_order_amount: 1500, usage_count: 19, is_active: true },
  { id: 'coup-4', code: 'FESTIVE15', discount_type: 'percentage', discount_value: 15, min_order_amount: 2000, max_discount_amount: 500, usage_count: 12, is_active: false },
];

