import React, { useState, useMemo } from 'react';
import { X, Check, Star, Plus, Minus, ShoppingBag, Sparkles, Heart } from 'lucide-react';
import { Product, ProductVariant, Flavor, ProductAddon, CartItem } from '../types';

interface ProductDetailModalProps {
  product: Product | null;
  allFlavors: Flavor[];
  allAddons: ProductAddon[];
  currency: string;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  allFlavors,
  allAddons,
  currency,
  onClose,
  onAddToCart,
}) => {
  if (!product) return null;

  // Selected state
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant>(
    product.variants[0] || {
      id: 'default',
      product_id: product.id,
      name: '1kg',
      weight_grams: 1000,
      price: product.base_price,
      is_active: true,
    }
  );

  const availableFlavors = useMemo(() => {
    return allFlavors.filter((f) => product.allowed_flavor_ids?.includes(f.id));
  }, [allFlavors, product]);

  const [selectedFlavor, setSelectedFlavor] = useState<Flavor | undefined>(
    availableFlavors[0]
  );

  const availableAddons = useMemo(() => {
    return allAddons.filter((a) => product.allowed_addon_ids?.includes(a.id));
  }, [allAddons, product]);

  const [selectedAddons, setSelectedAddons] = useState<ProductAddon[]>([]);
  const [writingMessage, setWritingMessage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isAddedFeedback, setIsAddedFeedback] = useState(false);

  // Calculate live price
  const currentVariantPrice = selectedVariant.sale_price ?? selectedVariant.price;
  const addonsTotal = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const unitPrice = currentVariantPrice + addonsTotal;
  const totalPrice = unitPrice * quantity;

  const toggleAddon = (addon: ProductAddon) => {
    if (selectedAddons.some((a) => a.id === addon.id)) {
      setSelectedAddons(selectedAddons.filter((a) => a.id !== addon.id));
    } else {
      setSelectedAddons([...selectedAddons, addon]);
    }
  };

  const handleAddToCart = () => {
    const item: CartItem = {
      cart_item_id: `cart-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      product,
      selected_variant: selectedVariant,
      selected_flavor: selectedFlavor,
      selected_addons: selectedAddons,
      writing_message: writingMessage.trim(),
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
    };

    onAddToCart(item);
    setIsAddedFeedback(true);
    setTimeout(() => {
      setIsAddedFeedback(false);
      onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div 
        className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-rose-100 my-8 relative max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 bg-white/80 hover:bg-white text-slate-700 p-2 rounded-full shadow-md transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Scroll Content */}
        <div className="overflow-y-auto p-6 md:p-8 space-y-6 flex-1">
          {/* Top Product Hero */}
          <div className="flex flex-col md:flex-row gap-6">
            <div className="md:w-1/2 rounded-2xl overflow-hidden bg-rose-50 relative group">
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-56 md:h-72 object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {product.is_featured && (
                <span className="absolute top-3 left-3 bg-amber-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Chef's Bestseller
                </span>
              )}
            </div>

            <div className="md:w-1/2 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md">
                {product.category_name || 'Artisan Cake'}
              </span>
              <h2 className="text-2xl font-bold text-slate-900 leading-tight">
                {product.name}
              </h2>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <div className="flex items-center text-amber-500">
                  <Star className="w-4 h-4 fill-amber-400" />
                  <span className="ml-1 font-bold">{product.rating}</span>
                </div>
                <span className="text-slate-300">•</span>
                <span>({product.review_count} happy customers)</span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                {product.description}
              </p>

              {/* Price Preview */}
              <div className="pt-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-rose-600">
                    {currency}{currentVariantPrice}
                  </span>
                  {selectedVariant.sale_price && (
                    <span className="text-base text-slate-400 line-through">
                      {currency}{selectedVariant.price}
                    </span>
                  )}
                  <span className="text-xs text-slate-500 font-medium">
                    (Base variant price)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 1. Weight / Variant Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>1. Select Weight / Size</span>
                <span className="text-xs font-normal text-rose-600 font-semibold">*Required</span>
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {product.variants.map((v) => {
                const isSelected = selectedVariant.id === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariant(v)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-rose-600 bg-rose-50/70 text-rose-950 ring-2 ring-rose-200'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-sm">{v.name}</div>
                    <div className="text-xs text-rose-600 font-semibold mt-1">
                      {currency}{v.sale_price ?? v.price}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Flavor Selection */}
          {availableFlavors.length > 0 && (
            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>2. Select Frosting / Sponge Flavor</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableFlavors.map((flavor) => {
                  const isSelected = selectedFlavor?.id === flavor.id;
                  return (
                    <button
                      key={flavor.id}
                      type="button"
                      onClick={() => setSelectedFlavor(flavor)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-rose-600 bg-rose-50/50 text-rose-900 ring-1 ring-rose-400'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <div
                        className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                        style={{ backgroundColor: flavor.color_hex }}
                      />
                      <span className="text-xs font-semibold flex-1">{flavor.name}</span>
                      {isSelected && <Check className="w-4 h-4 text-rose-600" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Add-ons Selection */}
          {availableAddons.length > 0 && (
            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-900">
                3. Party & Celebration Add-ons (Optional)
              </label>
              <div className="space-y-2">
                {availableAddons.map((addon) => {
                  const isSelected = selectedAddons.some((a) => a.id === addon.id);
                  return (
                    <div
                      key={addon.id}
                      onClick={() => toggleAddon(addon)}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-rose-500 bg-rose-50/60 text-slate-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border text-xs ${
                            isSelected
                              ? 'bg-rose-600 border-rose-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-xs font-semibold">{addon.name}</span>
                      </div>
                      <span className="text-xs font-bold text-rose-600">
                        +{currency}{addon.price}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Custom Cake Dedication Writing Text */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-900">
                4. Custom Message to Write on Cake
              </label>
              <span className="text-xs text-slate-400">Max 40 chars</span>
            </div>
            <input
              type="text"
              maxLength={40}
              placeholder="e.g., Happy 25th Birthday Sarah! 🎂"
              value={writingMessage}
              onChange={(e) => setWritingMessage(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-rose-600 focus:ring-2 focus:ring-rose-100 text-sm text-slate-800 placeholder-slate-400"
            />
            <p className="text-[11px] text-slate-500">
              Our pastry chefs pipe this message with premium chocolate ganache or royal icing at no extra charge.
            </p>
          </div>

          {/* 5. Quantity & Tally */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-800">Quantity:</span>
              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3 py-1.5 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-3 text-sm font-bold text-slate-900 min-w-8 text-center">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="px-3 py-1.5 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-500 block">Total Item Price</span>
              <span className="text-2xl font-black text-rose-600">
                {currency}{totalPrice}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-4">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isAddedFeedback}
            className={`w-full py-3.5 px-6 rounded-2xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
              isAddedFeedback
                ? 'bg-emerald-600 text-white shadow-emerald-200'
                : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200 active:scale-98'
            }`}
          >
            {isAddedFeedback ? (
              <>
                <Check className="w-5 h-5 animate-bounce" /> Added to Cart!
              </>
            ) : (
              <>
                <ShoppingBag className="w-5 h-5" /> Add to Cart — {currency}{totalPrice}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
