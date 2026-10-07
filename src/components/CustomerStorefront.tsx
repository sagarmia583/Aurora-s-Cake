import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  Star, 
  ArrowRight, 
  ShieldCheck, 
  Truck, 
  Heart, 
  Clock, 
  ChevronRight,
  Filter,
  Check,
  Phone,
  MessageCircle,
  HelpCircle,
  Cake
} from 'lucide-react';
import { 
  Product, 
  Category, 
  ShopSettings, 
  Flavor, 
  Banner, 
  Review, 
  CustomCakeRequest 
} from '../types';
import { mockDb } from '../services/mockDatabase';

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
}

export const CustomerStorefront: React.FC<CustomerStorefrontProps> = ({
  settings,
  products,
  categories,
  flavors,
  banners,
  reviews,
  currency,
  onSelectProduct,
  onOpenTrackOrder,
  onOpenCustomCake,
  onOpenProfile,
  searchQuery,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedFlavorId, setSelectedFlavorId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'featured' | 'price_low' | 'price_high' | 'rating'>('featured');

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => p.is_active)
      .filter((p) => {
        if (selectedCategoryId !== 'all' && p.category_id !== selectedCategoryId) {
          return false;
        }
        if (selectedFlavorId !== 'all' && !p.allowed_flavor_ids?.includes(selectedFlavorId)) {
          return false;
        }
        if (searchQuery.trim() !== '') {
          const query = searchQuery.toLowerCase();
          const matchName = p.name.toLowerCase().includes(query);
          const matchDesc = p.description.toLowerCase().includes(query);
          const matchCat = p.category_name?.toLowerCase().includes(query);
          if (!matchName && !matchDesc && !matchCat) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'price_low') return a.base_price - b.base_price;
        if (sortBy === 'price_high') return b.base_price - a.base_price;
        if (sortBy === 'rating') return b.rating - a.rating;
        return (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0);
      });
  }, [products, selectedCategoryId, selectedFlavorId, searchQuery, sortBy]);

  const activeBanner = banners[0];

  return (
    <div className="space-y-12 pb-16">
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-r from-rose-950 via-slate-900 to-rose-900 text-white shadow-2xl">
        <div className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-overlay" style={{ backgroundImage: `url(${activeBanner?.image_url})` }} />
        <div className="relative max-w-5xl mx-auto px-6 py-16 md:py-20 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-5 text-center md:text-left md:max-w-xl">
            <div className="inline-flex items-center gap-2 bg-rose-500/30 text-rose-200 border border-rose-400/30 px-3.5 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Tangail's Bespoke Luxury Patisserie</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight">
              {activeBanner?.title || 'Handcrafted Celebration Cakes Made with Passion'}
            </h1>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              {activeBanner?.subtitle || settings.website_description}
            </p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
              <a
                href="#catalog"
                className="bg-linear-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold px-6 py-3.5 rounded-2xl text-sm shadow-lg shadow-rose-900/50 flex items-center gap-2 transition-all cursor-pointer active:scale-98"
              >
                <span>{activeBanner?.button_text || 'Order Fresh Cakes'}</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <button
                onClick={onOpenCustomCake}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold px-5 py-3.5 rounded-2xl text-sm backdrop-blur-md transition-colors cursor-pointer"
              >
                Custom Design Cake 🎨
              </button>
            </div>
          </div>

          <div className="relative group">
            <div className="w-64 h-64 md:w-80 md:h-80 rounded-3xl overflow-hidden shadow-2xl border-4 border-white/10 relative transform group-hover:scale-102 transition-transform duration-500">
              <img
                src={activeBanner?.image_url || 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&auto=format&fit=crop&q=80'}
                alt="Celebration Cake"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Signature Specialty
                </span>
                <h4 className="font-bold text-sm">Triple Belgian Chocolate Truffle</h4>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: '🎂', title: '100% Fresh Daily', desc: 'Baked from scratch upon order' },
          { icon: '🚀', title: '3-Hour Express Dispatch', desc: 'Temperature-safe van & bike delivery' },
          { icon: '✍️', title: 'Free Cake Dedication', desc: 'Piped name & wishes included' },
          { icon: '🛡️', title: 'Hygienic Halal Standards', desc: 'Pure dairy cream & imported cocoa' },
        ].map((item, idx) => (
          <div
            key={idx}
            className="p-4 rounded-2xl bg-white border border-rose-100/80 shadow-xs flex items-center gap-3.5 hover:shadow-md transition-shadow"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-xl flex items-center justify-center shrink-0">
              {item.icon}
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
              <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Catalog & Filter Section */}
      <section id="catalog" className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full">
                Fresh From the Oven
              </span>
              <span className="text-xs text-slate-400">({filteredProducts.length} items)</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 mt-1">
              Explore Our Cake Collections
            </h2>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-800 cursor-pointer shadow-xs focus:ring-2 focus:ring-rose-200"
            >
              <option value="featured">🌟 Featured & Popular</option>
              <option value="price_low">💵 Price: Low to High</option>
              <option value="price_high">💎 Price: High to Low</option>
              <option value="rating">⭐ Customer Ratings</option>
            </select>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setSelectedCategoryId('all')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedCategoryId === 'all'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-200 scale-102'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            All Cakes & Desserts
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedCategoryId === cat.id
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-200 scale-102'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Cards Grid */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 space-y-3">
            <div className="text-4xl">🎂</div>
            <h3 className="font-bold text-slate-800 text-base">No cakes found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              We couldn't find any cakes matching your current filter. Try clearing filters or searching for something else.
            </p>
            <button
              onClick={() => {
                setSelectedCategoryId('all');
                setSelectedFlavorId('all');
              }}
              className="text-xs text-rose-600 font-bold hover:underline cursor-pointer"
            >
              Reset all filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((cake) => {
              const defaultVariant = cake.variants[0];
              const displayPrice = defaultVariant ? (defaultVariant.sale_price ?? defaultVariant.price) : cake.base_price;
              const hasSale = defaultVariant?.sale_price && defaultVariant.sale_price < defaultVariant.price;

              return (
                <div
                  key={cake.id}
                  onClick={() => onSelectProduct(cake)}
                  className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-md hover:shadow-xl hover:border-rose-200 transition-all duration-300 flex flex-col group cursor-pointer"
                >
                  {/* Cake Image */}
                  <div className="h-56 overflow-hidden bg-rose-50 relative">
                    <img
                      src={cake.image_url}
                      alt={cake.name}
                      className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500"
                    />
                    {cake.is_featured && (
                      <span className="absolute top-3 left-3 bg-amber-500/95 backdrop-blur-xs text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Best Seller
                      </span>
                    )}

                    {/* Weight options badge */}
                    <div className="absolute bottom-3 left-3 flex gap-1">
                      {cake.variants.slice(0, 3).map((v) => (
                        <span
                          key={v.id}
                          className="text-[10px] bg-slate-900/75 backdrop-blur-xs text-white px-2 py-0.5 rounded-md font-semibold"
                        >
                          {v.name.split(' ')[0]}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-rose-600 font-bold uppercase tracking-wider text-[10px]">
                          {cake.category_name}
                        </span>
                        <div className="flex items-center gap-1 text-amber-500 font-bold">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          <span>{cake.rating}</span>
                          <span className="text-slate-400 font-normal">({cake.review_count})</span>
                        </div>
                      </div>

                      <h3 className="font-bold text-slate-900 text-base leading-snug group-hover:text-rose-600 transition-colors">
                        {cake.name}
                      </h3>

                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {cake.description}
                      </p>
                    </div>

                    {/* Price & CTA */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Starts from</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xl font-black text-rose-600">
                            {currency}{displayPrice}
                          </span>
                          {hasSale && (
                            <span className="text-xs text-slate-400 line-through">
                              {currency}{defaultVariant.price}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="bg-rose-50 group-hover:bg-rose-600 text-rose-600 group-hover:text-white font-bold text-xs py-2 px-3.5 rounded-xl transition-all flex items-center gap-1 shadow-xs"
                      >
                        <span>Customize</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Custom Cake Banner Promo */}
      <section className="bg-gradient-to-r from-amber-500 via-rose-500 to-pink-600 rounded-3xl p-8 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left">
          <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
            Custom Cake Studio
          </span>
          <h3 className="text-2xl md:text-3xl font-black">
            Have a Dream Cake Design in Mind?
          </h3>
          <p className="text-white/90 text-xs md:text-sm max-w-xl">
            Upload your reference photo, pick custom tiers, flavors, colors, and dedicated text. Our pastry chef team will provide an instant custom quote!
          </p>
        </div>
        <button
          onClick={onOpenCustomCake}
          className="bg-white text-slate-900 hover:bg-slate-100 font-bold px-6 py-3.5 rounded-2xl text-xs uppercase tracking-wider shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer whitespace-nowrap"
        >
          Submit Custom Cake Request
        </button>
      </section>

      {/* Customer Reviews Section */}
      <section className="space-y-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full">
            Real Sweet Moments
          </span>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 mt-1">
            What Tangail Celebrators Say
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reviews.map((rev) => (
            <div
              key={rev.id}
              className="bg-white rounded-3xl p-6 border border-slate-100 shadow-md space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{rev.customer_name}</h4>
                  <span className="text-[11px] text-rose-600 font-semibold">{rev.product_name}</span>
                </div>
                <div className="flex text-amber-400">
                  {Array.from({ length: rev.rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400" />
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed italic">
                "{rev.comment}"
              </p>
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-500" /> Verified Tangail Customer Delivery • {rev.created_at}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-rose-100 pt-10 text-slate-600 text-xs space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <span>🍰</span> {settings.shop_name}
            </h4>
            <p className="text-slate-500 leading-relaxed">
              Tangail's premier boutique for fresh birthday cakes, wedding tiers, cheesecakes, and custom pastries. Baked fresh with love and 100% natural ingredients.
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 text-sm">Store Location & Hours</h4>
            <p className="text-slate-500">{settings.address}</p>
            <p className="text-slate-500 font-semibold">
              Open Daily: {settings.opening_time} — {settings.closing_time}
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 text-sm">Customer Care</h4>
            <p className="text-slate-500">Phone Hotline: <strong>{settings.phone}</strong></p>
            <p className="text-slate-500">WhatsApp Support: <strong>{settings.whatsapp}</strong></p>
            <p className="text-slate-500">Email: {settings.email}</p>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
          <p>© {new Date().getFullYear()} {settings.shop_name}. All rights reserved.</p>
          <div className="flex flex-wrap gap-4 font-semibold text-rose-600">
            {onOpenProfile && (
              <button onClick={onOpenProfile} className="hover:underline cursor-pointer">
                Recent Orders &amp; Profile
              </button>
            )}
            <button onClick={onOpenTrackOrder} className="hover:underline cursor-pointer">
              Live Order Tracker
            </button>
            <button onClick={onOpenCustomCake} className="hover:underline cursor-pointer">
              Custom Cake Inquiries
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
