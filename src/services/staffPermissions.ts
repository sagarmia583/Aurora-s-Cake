import { StaffPermissionCode, StaffPermissionDefinition, StaffRole, PermissionCategory } from '../types';

export const ALL_STAFF_PERMISSIONS: StaffPermissionDefinition[] = [
  // --- Orders ---
  {
    code: 'orders.view',
    label: 'অর্ডার তালিকা ও বিবরণ দেখা',
    englishLabel: 'View Orders',
    category: 'orders',
    categoryLabel: 'অর্ডার ব্যবস্থাপনা (Orders)',
    description: 'সকল কাস্টমার অর্ডারের তালিকা, পণ্যের বিবরণ এবং ডেলিভারি তথ্য দেখার অনুমতি।'
  },
  {
    code: 'orders.confirm',
    label: 'নতুন অর্ডার গ্রহণ ও কনফার্ম করা',
    englishLabel: 'Confirm Orders',
    category: 'orders',
    categoryLabel: 'অর্ডার ব্যবস্থাপনা (Orders)',
    description: 'নতুন আসা পেন্ডিং অর্ডার পর্যালোচনা করে নিশ্চিত (Confirm) করার অনুমতি।'
  },
  {
    code: 'orders.cancel',
    label: 'অর্ডার বাতিল (Cancel) করা',
    englishLabel: 'Cancel Orders',
    category: 'orders',
    categoryLabel: 'অর্ডার ব্যবস্থাপনা (Orders)',
    description: 'যেকোনো অনুপযুক্ত, ভুয়া বা বাতিলকৃত অর্ডার সিস্টেম থেকে বাতিল করার অনুমতি।'
  },
  {
    code: 'orders.status',
    label: 'অর্ডার স্ট্যাটাস আপডেট করা',
    englishLabel: 'Update Order Status',
    category: 'orders',
    categoryLabel: 'অর্ডার ব্যবস্থাপনা (Orders)',
    description: 'অর্ডারের চলমান প্রক্রিয়া যেমন নিশ্চিত, প্রস্তুতি বা ডেলিভারি স্ট্যাটাস পরিবর্তন করার অনুমতি।'
  },

  // --- Kitchen ---
  {
    code: 'kitchen.view',
    label: 'কিচেন ডিসপ্লে (KDS) দেখা',
    englishLabel: 'View Kitchen Display',
    category: 'kitchen',
    categoryLabel: 'কিচেন ও বেকিং (Kitchen)',
    description: 'শেফ এবং কিচেন স্টাফদের জন্য বেকিং টিকিট ও রিকোয়েস্ট মনিটর করার অনুমতি।'
  },
  {
    code: 'kitchen.bake',
    label: 'কেক বানানো শুরু (Start Baking) করা',
    englishLabel: 'Start Baking',
    category: 'kitchen',
    categoryLabel: 'কিচেন ও বেকিং (Kitchen)',
    description: 'কনফার্ম হওয়া অর্ডার ওভেনে বা কিচেনে বেকিং শুরু হয়েছে হিসেবে চিহ্নিত করার অনুমতি।'
  },
  {
    code: 'kitchen.ready',
    label: 'কেক প্রস্তুত (Mark Ready) করা',
    englishLabel: 'Mark Ready',
    category: 'kitchen',
    categoryLabel: 'কিচেন ও বেকিং (Kitchen)',
    description: 'কেক তৈরি ও প্যাকিং শেষ করে রাইডারের জন্য প্রস্তুত হিসেবে চিহ্নিত করার অনুমতি।'
  },

  // --- Delivery & Riders ---
  {
    code: 'delivery.assign',
    label: 'রাইডার নিয়োগ (Assign Rider) করা',
    englishLabel: 'Assign Delivery Rider',
    category: 'delivery',
    categoryLabel: 'ডেলিভারি ও লজিস্টিকস (Delivery)',
    description: 'প্রস্তুত কেক কাস্টমারের ঠিকানায় পৌঁছে দেওয়ার জন্য নির্দিষ্ট রাইডারকে অ্যাসাইন করার অনুমতি।'
  },
  {
    code: 'delivery.dispatch',
    label: 'কেক পিকআপ ও যাত্রা শুরু (Dispatch)',
    englishLabel: 'Dispatch & On The Way',
    category: 'delivery',
    categoryLabel: 'ডেলিভারি ও লজিস্টিকস (Delivery)',
    description: 'কেক ডেলিভারির জন্য নিয়ে বের হওয়া এবং যাত্রাপথ শুরু করার অনুমতি।'
  },
  {
    code: 'delivery.complete',
    label: 'ডেলিভারি সম্পন্ন ও ক্যাশ চেক',
    englishLabel: 'Complete Delivery & COD',
    category: 'delivery',
    categoryLabel: 'ডেলিভারি ও লজিস্টিকস (Delivery)',
    description: 'কাস্টমারকে কেক বুঝিয়ে দিয়ে ডেলিভারি ও ক্যাশ কালেকশন নিশ্চিত করার অনুমতি।'
  },
  {
    code: 'delivery.cash_settle',
    label: 'রাইডার ক্যাশ ডিপোজিট রিসিভ ও হিসাব',
    englishLabel: 'Rider Cash Settlement',
    category: 'delivery',
    categoryLabel: 'ডেলিভারি ও লজিস্টিকস (Delivery)',
    description: 'রাইডারের কাছে জমা হওয়া ক্যাশ কাউন্টারে জমা নেওয়া ও ব্যালেন্স মাইনাস করার অনুমতি।'
  },

  // --- Products & Menu ---
  {
    code: 'products.view',
    label: 'প্রোডাক্ট ও মেনু ক্যাটালগ দেখা',
    englishLabel: 'View Product Catalog',
    category: 'products',
    categoryLabel: 'প্রোডাক্ট ও মেনু (Products)',
    description: 'বেকারির সকল কেক, ভ্যারিয়েন্ট এবং ফ্লেভার ক্যাটালগ দেখার অনুমতি।'
  },
  {
    code: 'products.create',
    label: 'নতুন কেক বা আইটেম যোগ করা',
    englishLabel: 'Create Products',
    category: 'products',
    categoryLabel: 'প্রোডাক্ট ও মেনু (Products)',
    description: 'মেনুতে নতুন কেক, বিভিন্ন সাইজের ভ্যারিয়েন্ট ও ছবি যুক্ত করার অনুমতি।'
  },
  {
    code: 'products.edit',
    label: 'কেকের দাম, ডিসকাউন্ট ও ছবি এডিট',
    englishLabel: 'Edit Products & Prices',
    category: 'products',
    categoryLabel: 'প্রোডাক্ট ও মেনু (Products)',
    description: 'কেকের নাম, বেস প্রাইস, সেলস প্রাইস (ডিসকাউন্ট) ও ছবি পরিবর্তন করার অনুমতি।'
  },
  {
    code: 'products.delete',
    label: 'কেক মুছে ফেলা বা নিষ্ক্রিয় করা',
    englishLabel: 'Delete / Deactivate Products',
    category: 'products',
    categoryLabel: 'প্রোডাক্ট ও মেনু (Products)',
    description: 'স্টক শেষ বা অপ্রয়োজনীয় আইটেম মেনু থেকে সরানো বা বন্ধ করার অনুমতি।'
  },

  // --- Costing & Profit ---
  {
    code: 'costing.view',
    label: 'উপাদান খরচ ও লাভ মার্জিন দেখা',
    englishLabel: 'View Costing & Margins',
    category: 'costing',
    categoryLabel: 'কস্টিং ও লাভ (Costing & Profit)',
    description: 'প্রতিটি কেকের উপাদান খরচ, প্যাকেজিং ও বিক্রির লাভ/মার্জিন দেখার অনুমতি।'
  },
  {
    code: 'costing.edit',
    label: 'কেক কস্টিং ও খরচের হিসাব এডিট করা',
    englishLabel: 'Edit Item Costings',
    category: 'costing',
    categoryLabel: 'কস্টিং ও লাভ (Costing & Profit)',
    description: 'কাঁচামালের দাম, বক্স-প্যাকিং খরচ বা ডেলিভারি খরচের পরিমাণ পরিবর্তন করার অনুমতি।'
  },

  // --- Coupons ---
  {
    code: 'coupons.manage',
    label: 'কুপন ও ডিসকাউন্ট ভাউচার পরিচালনা',
    englishLabel: 'Manage Coupons & Offers',
    category: 'coupons',
    categoryLabel: 'কুপন ও অফার (Coupons)',
    description: 'প্রোমো কোড তৈরি, শতাংশ বা ফিক্সড ছাড় নির্ধারণ ও কুপন বন্ধ করার অনুমতি।'
  },

  // --- Custom Cakes ---
  {
    code: 'custom_cakes.manage',
    label: 'কাস্টম কেক রিকোয়েস্ট ও প্রাইজ কোট',
    englishLabel: 'Manage Custom Cake Requests',
    category: 'custom_cakes',
    categoryLabel: 'কাস্টম কেক (Custom Bakes)',
    description: 'কাস্টমারদের পাঠানো স্পেশাল ডিজাইন কেকের ছবি দেখে দাম নির্ধারণ ও অনুমোদনের অনুমতি।'
  },

  // --- Settings & CMS ---
  {
    code: 'settings.manage',
    label: 'শপ সেটিংস ও ওয়েবসাইট CMS পরিচালনা',
    englishLabel: 'Manage Shop Settings & CMS',
    category: 'settings',
    categoryLabel: 'শপ সেটিংস ও ওয়েবসাইট (Settings)',
    description: 'দোকান খোলা/বন্ধের সময়, ডেলিভারি চার্জ, নোটিশ ব্যানার ও ফোন নম্বর পরিবর্তন।'
  },

  // --- Analytics ---
  {
    code: 'analytics.view',
    label: 'সেলস ট্রেন্ড ও বিজনেস অ্যানালিটিক্স',
    englishLabel: 'View Analytics & Reports',
    category: 'analytics',
    categoryLabel: 'অ্যানালিটিক্স ও রিপোর্ট (Analytics)',
    description: 'মোট বিক্রি, দৈনিক আয়ের গ্রাফ, সর্বাধিক বিক্রিত কেক ও পারফরম্যান্স রিপোর্ট দেখা।'
  },

  // --- Audit Logs ---
  {
    code: 'audit.view',
    label: 'সিস্টেম ও স্টাফ অডিট লগ দেখা',
    englishLabel: 'View Audit Logs',
    category: 'audit',
    categoryLabel: 'অডিট হিস্ট্রি (Audit Logs)',
    description: 'কোন স্টাফ কখন অর্ডার কনফার্ম করেছেন বা প্রাইস এডিট করেছেন তার টাইমস্ট্যাম্পযুক্ত ইতিহাস দেখা।'
  },

  // --- Staff & Permissions Management ---
  {
    code: 'staff.manage',
    label: 'স্টাফ ও রোল পারমিশন নির্ধারণ (Super Admin)',
    englishLabel: 'Manage Staff & Roles',
    category: 'staff',
    categoryLabel: 'স্টাফ ও পারমিশন কন্ট্রোল (Staff & Roles)',
    description: 'অন্যান্য স্টাফদের দায়িত্ব বণ্টন করা, নতুন স্টাফ নিয়োগ ও কার কি ক্ষমতা থাকবে তা নির্ধারণের অনুমতি।'
  },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, StaffPermissionCode[]> = {
  super_admin: [
    'orders.view', 'orders.confirm', 'orders.cancel', 'orders.status',
    'kitchen.view', 'kitchen.bake', 'kitchen.ready',
    'delivery.assign', 'delivery.dispatch', 'delivery.complete', 'delivery.cash_settle',
    'products.view', 'products.create', 'products.edit', 'products.delete',
    'costing.view', 'costing.edit',
    'coupons.manage',
    'custom_cakes.manage',
    'settings.manage',
    'analytics.view',
    'audit.view',
    'staff.manage',
  ],
  admin: [
    'orders.view', 'orders.confirm', 'orders.cancel', 'orders.status',
    'kitchen.view', 'kitchen.bake', 'kitchen.ready',
    'delivery.assign', 'delivery.dispatch', 'delivery.complete', 'delivery.cash_settle',
    'products.view', 'products.create', 'products.edit', 'products.delete',
    'costing.view', 'costing.edit',
    'coupons.manage',
    'custom_cakes.manage',
    'settings.manage',
    'analytics.view',
    'audit.view',
    'staff.manage',
  ],
  order_manager: [
    'orders.view', 'orders.confirm', 'orders.cancel', 'orders.status',
    'custom_cakes.manage',
    'products.view',
  ],
  kitchen_manager: [
    'kitchen.view', 'kitchen.bake', 'kitchen.ready',
    'orders.view',
    'products.view',
  ],
  delivery_manager: [
    'delivery.assign', 'delivery.dispatch', 'delivery.complete', 'delivery.cash_settle',
    'orders.view',
  ],
  accountant: [
    'orders.view',
    'costing.view',
    'delivery.cash_settle',
    'analytics.view',
    'coupons.manage',
  ],
  delivery_man: [
    'delivery.dispatch',
    'delivery.complete',
  ],
};

export interface RoleMetadata {
  title: string;
  banglaTitle: string;
  badgeColor: string;
  description: string;
}

export const ROLE_METADATA: Record<StaffRole, RoleMetadata> = {
  super_admin: {
    title: 'Super Admin',
    banglaTitle: 'সুপার অ্যাডমিন (মালিক)',
    badgeColor: 'bg-purple-100 text-purple-900 border-purple-300',
    description: 'বেকারির সকল ক্ষমতা ও স্টাফদের পারমিশন নিয়ন্ত্রণের পূর্ণ এক্সেস।'
  },
  admin: {
    title: 'Admin / Store Manager',
    banglaTitle: 'স্টোর ম্যানেজার',
    badgeColor: 'bg-blue-100 text-blue-900 border-blue-300',
    description: 'প্রতিদিনের সকল অপারেশনাল ও ব্যবসায়িক কাজ পরিচালনার দায়িত্ব।'
  },
  order_manager: {
    title: 'Order Manager',
    banglaTitle: 'অর্ডার কন্ট্রোলার',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
    description: 'অর্ডার গ্রহণ, যাচাই, কনফার্ম ও কাস্টমার কোটেশন পরিচালনা।'
  },
  kitchen_manager: {
    title: 'Kitchen Chef',
    banglaTitle: 'কিচেন শেফ / হেড বেকার',
    badgeColor: 'bg-orange-100 text-orange-900 border-orange-300',
    description: 'কেক প্রস্তুতকরণ, বেকিং স্টেজ ও রেডিনেস নিয়ন্ত্রণ।'
  },
  delivery_manager: {
    title: 'Delivery Manager',
    banglaTitle: 'ডেলিভারি সুপারভাইজার',
    badgeColor: 'bg-cyan-100 text-cyan-900 border-cyan-300',
    description: 'ডেলিভারি লজিস্টিকস, রাইডার ডেসপ্যাচ ও ক্যাশ ডিপোজিট তত্ত্বাবধান।'
  },
  accountant: {
    title: 'Accountant',
    banglaTitle: 'হিসাবরক্ষক / ক্যাশিয়ার',
    badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    description: 'কেক কস্টিং, মোট বিক্রি, প্রফিট মার্জিন ও রাইডার ক্যাশ কালেকশন হিসেব।'
  },
  delivery_man: {
    title: 'Delivery Rider',
    banglaTitle: 'ডেলিভারি রাইডার',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
    description: 'কেক নিরাপদে পিকআপ, কাস্টমারকে ডেলিভারি ও ক্যাশ কালেকশন।'
  },
};

export const CATEGORY_LABELS: Record<PermissionCategory, string> = {
  orders: '📦 অর্ডার ব্যবস্থাপনা (Orders)',
  kitchen: '🍳 কিচেন ও বেকিং (Kitchen)',
  delivery: '🚚 ডেলিভারি ও লজিস্টিকস (Delivery)',
  products: '🎂 প্রোডাক্ট ও মেনু (Products)',
  costing: '💰 কস্টিং ও লাভ মার্জিন (Costing & Profit)',
  coupons: '🏷️ কুপন ও অফার (Coupons)',
  custom_cakes: '✨ কাস্টম কেক রিকোয়েস্ট (Custom Bakes)',
  settings: '⚙️ শপ সেটিংস ও ওয়েবসাইট (Settings)',
  analytics: '📊 অ্যানালিটিক্স ও রিপোর্ট (Analytics)',
  audit: '📜 অডিট হিস্ট্রি (Audit Logs)',
  staff: '🛡️ স্টাফ ও পারমিশন কন্ট্রোল (Staff & Roles)',
};

export function getPermissionsByCategory(): Record<PermissionCategory, StaffPermissionDefinition[]> {
  const grouped: Partial<Record<PermissionCategory, StaffPermissionDefinition[]>> = {};
  for (const perm of ALL_STAFF_PERMISSIONS) {
    if (!grouped[perm.category]) {
      grouped[perm.category] = [];
    }
    grouped[perm.category]!.push(perm);
  }
  return grouped as Record<PermissionCategory, StaffPermissionDefinition[]>;
}
