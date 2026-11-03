import { CatalogProduct, CustomCakeRequest, Role } from './domain';

export const DEFAULT_WEB_PROFILE_IMAGE = '';

export interface MobileProduct extends CatalogProduct {
  category: string;
  price: number;
  weight_label: string;
  image_url?: string;
  sale_price?: number;
}

export interface DeliveryZoneItem {
  id: string;
  name: string;
  fee: number;
  estimated_time?: string;
  is_active?: boolean;
}

/** 14 Real Cake Products from the live Google Sheet */
export const DEFAULT_MOBILE_PRODUCTS: MobileProduct[] = [
  {
    id: 'prod-vanilla',
    name: 'ভ্যানিলা কেক',
    category: 'কেক (হাফ ও এক পাউন্ড)',
    price: 400,
    weight_label: '1 lb',
    is_active: true,
    description: 'ফ্রেশ স্পঞ্জ ভ্যানিলা ক্রিম কেক',
    image_url: '/images/vanilla-cake.jpg',
  },
  {
    id: 'prod-orange',
    name: 'অরেঞ্জ কেক',
    category: 'কেক (হাফ ও এক পাউন্ড)',
    price: 400,
    weight_label: '1 lb',
    is_active: true,
    description: 'ফ্রুট জুসি অরেঞ্জ ফ্লেভার কেক',
    image_url: '/images/orange-cake.jpg',
  },
  {
    id: 'prod-chocolate',
    name: 'চকলেট কেক',
    category: 'কেক (হাফ ও এক পাউন্ড)',
    price: 450,
    weight_label: '1 lb',
    is_active: true,
    description: 'প্রিমিয়াম রিচ চকোলেট কেক',
    image_url: '/images/chocolate-cake.jpg',
  },
  {
    id: 'prod-lemon',
    name: 'লেমন কেক',
    category: 'কেক (হাফ ও এক পাউন্ড)',
    price: 350,
    weight_label: '1 lb',
    is_active: true,
    description: 'রিফ্রেশিং ট্যাঙ্গি লেমন স্পঞ্জ কেক',
    image_url: '/images/lemon-cake.jpg',
  },
  {
    id: 'prod-rasmalai',
    name: 'রসমলাই কেক',
    category: 'কেক (হাফ ও এক পাউন্ড)',
    price: 450,
    weight_label: '1 lb',
    is_active: true,
    description: 'রসমলাই ভরা স্পেশাল ডেজার্ট কেক',
    image_url: '/images/rasmalai-cake.jpg',
  },
  {
    id: 'prod-red-velvet',
    name: 'রেড ভেলভেট কেক',
    category: 'কেক (হাফ ও এক পাউন্ড)',
    price: 450,
    weight_label: '1 lb',
    is_active: true,
    description: 'সিগনেচার রেড ভেলভেট ক্রিম চিজ কেক',
    image_url: '/images/red-velvet-cake.jpg',
  },
  {
    id: 'prod-strawberry',
    name: 'স্ট্রবেরি কেক',
    category: 'কেক (হাফ ও এক পাউন্ড)',
    price: 450,
    weight_label: '1 lb',
    is_active: true,
    description: 'সুইট স্ট্রবেরি গ্লেজড কেক',
    image_url: '/images/strawberry-cake.jpg',
  },
  {
    id: 'prod-blueberry',
    name: 'ব্লুবেরি কেক',
    category: 'কেক (হাফ ও এক পাউন্ড)',
    price: 450,
    weight_label: '1 lb',
    is_active: true,
    description: 'ওয়াইল্ড ব্লুবেরি ফ্রস্টেড স্পেশাল কেক',
    image_url: '/images/blueberry-cake.jpg',
  },
  {
    id: 'prod-chocolate-overload',
    name: 'চকলেট ওভারলোড কেক',
    category: 'কেক (হাফ ও এক পাউন্ড)',
    price: 500,
    weight_label: '1 lb',
    is_active: true,
    description: 'এক্সট্রা চকলেট চিপস ও ড্রিপ চকলেট কেক',
    image_url: '/images/chocolate-overload-cake.jpg',
  },
  {
    id: 'prod-bento-vanilla',
    name: 'বেন্টো কেক (ভ্যানিলা)',
    category: 'মিনি আইটেম',
    price: 200,
    weight_label: '350g',
    is_active: true,
    description: 'কিউট মিনি লাঞ্চবক্স ভ্যানিলা কেক',
    image_url: '/images/bento-cake-vanilla.jpg',
  },
  {
    id: 'prod-bento-flavors',
    name: 'বেন্টো কেক (অন্যান্য ফ্লেভার)',
    category: 'মিনি আইটেম',
    price: 250,
    weight_label: '350g',
    is_active: true,
    description: 'কাস্টম ফ্লেভার মিনি বেন্টো কেক',
    image_url: '/images/bento-cake-flavors.jpg',
  },
  {
    id: 'prod-cupcake-vanilla',
    name: 'কাপ কেক (ভ্যানিলা)',
    category: 'মিনি আইটেম',
    price: 50,
    weight_label: '1 pc',
    is_active: true,
    description: 'নরম তুলতুলে ভ্যানিলা কাপকেক',
    image_url: '/images/cupcakes.jpg',
  },
  {
    id: 'prod-cupcake-choclate',
    name: 'কাপ কেক (চকলেট)',
    category: 'মিনি আইটেম',
    price: 60,
    weight_label: '1 pc',
    is_active: true,
    description: 'চকোলেট স্বাদের কাপকেক',
    image_url: '/images/cupcakes.webp',
  },
  {
    id: 'prod-muffin',
    name: 'মাফিন',
    category: 'মিনি আইটেম',
    price: 30,
    weight_label: '1 pc',
    is_active: true,
    description: 'বেকড মাফিন ও কুকিজ',
    image_url: '/images/muffins.jpg',
  },
];

/** Completely empty by default: Loaded 100% from Google Sheets */
export const DEFAULT_CUSTOM_CAKE_REQUESTS: CustomCakeRequest[] = [];

/** Completely empty by default: Loaded 100% from Google Sheets */
export const DEFAULT_STAFF_MEMBERS: Array<{
  name: string;
  username: string;
  email: string;
  role: Role;
  active: boolean;
}> = [];

/** Real Delivery Zones from Google Sheet */
export const DELIVERY_ZONES: DeliveryZoneItem[] = [
  { id: 'zone-1', name: 'Tangail Town (Main City Area)', fee: 60, estimated_time: '1-2 Hours Express', is_active: true },
  { id: 'zone-2', name: 'Akur Takur Para and Bot tola', fee: 60, estimated_time: '1-2 Hours Express', is_active: true },
  { id: 'zone-3', name: 'Bajitpur, Mirerbetka, Saha para', fee: 20, estimated_time: '1-2 Hours Express', is_active: true },
  { id: 'zone-pickup', name: 'Counter Pickup (দোকান থেকে নেওয়া)', fee: 0, estimated_time: 'Instant', is_active: true },
];
