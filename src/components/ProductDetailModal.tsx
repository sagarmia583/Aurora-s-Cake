import React, { useState, useMemo, useEffect } from 'react';
import { useCakeDialog } from './useCakeDialog';
import { X, Check, Plus, Minus, ShoppingBag, Sparkles } from 'lucide-react';
import { Product, Flavor, ProductAddon, CartItem } from '../types';

interface ProductDetailModalProps {
  product: Product | null;
  allFlavors: Flavor[];
  allAddons: ProductAddon[];
  currency: string;
  acceptingOrders?: boolean;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = (props) =>
  props.product ? <ProductDetailDialog key={props.product.id} {...props} product={props.product} /> : null;

const ProductDetailDialog: React.FC<Omit<ProductDetailModalProps, 'product'> & { product: Product }> = ({
  product,
  allFlavors,
  allAddons,
  currency,
  acceptingOrders = true,
  onClose,
  onAddToCart,
}) => {
  const dialogRef = useCakeDialog(onClose);

  // Resolve the current catalog entry so changed or deactivated variants cannot be purchased.
  const activeVariants = product.variants.filter(variant => variant.is_active);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(activeVariants[0]?.id);
  const selectedVariant = activeVariants.find(variant => variant.id === selectedVariantId);
  const availableFlavors = useMemo(() => {
    return allFlavors.filter((f) => f.is_active && product.allowed_flavor_ids?.includes(f.id));
  }, [allFlavors, product]);

  const [selectedFlavorId, setSelectedFlavorId] = useState<string | undefined>(availableFlavors[0]?.id);
  const selectedFlavor = availableFlavors.find(flavor => flavor.id === selectedFlavorId);
  const needsFlavorSelection = availableFlavors.length > 0 && !selectedFlavor;
  const removedFlavor = !!selectedFlavorId && !selectedFlavor;

  const availableAddons = useMemo(() => {
    return allAddons.filter((a) => a.is_active && product.allowed_addon_ids?.includes(a.id));
  }, [allAddons, product]);

  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const selectedAddons = selectedAddonIds.flatMap(id => {
    const addon = availableAddons.find(item => item.id === id);
    return addon ? [addon] : [];
  });
  const unavailableAddonIds = selectedAddonIds.filter(id => !availableAddons.some(addon => addon.id === id));
  const canAddToCart = acceptingOrders && product.is_active && !!selectedVariant && !needsFlavorSelection && !unavailableAddonIds.length;
  const unavailableLabel = !acceptingOrders ? 'Orders currently closed' : !product.is_active || !selectedVariant ? 'Unavailable' : needsFlavorSelection ? 'Please choose a flavor' : 'Review unavailable extras';
  const [writingMessage, setWritingMessage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isAddedFeedback, setIsAddedFeedback] = useState(false);
  useEffect(() => {
    if (!isAddedFeedback) return;
    const timeout = window.setTimeout(onClose, 650);
    return () => window.clearTimeout(timeout);
  }, [isAddedFeedback, onClose]);

  // Calculate live price
  const currentVariantPrice = selectedVariant ? selectedVariant.sale_price ?? selectedVariant.price : 0;
  const addonsTotal = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const unitPrice = currentVariantPrice + addonsTotal;
  const totalPrice = unitPrice * quantity;

  const toggleAddon = (addon: ProductAddon) => {
    setSelectedAddonIds(ids => ids.includes(addon.id) ? ids.filter(id => id !== addon.id) : [...ids, addon.id]);
  };
  const handleAddToCart = () => {
    if (isAddedFeedback || !canAddToCart || !selectedVariant) return;
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

  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="product-title" data-cake-dialog tabIndex={-1}
        className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-rose-100 my-8 relative max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Close */}
        <button
          onClick={onClose}
          aria-label="Close cake details"
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
                  <Sparkles className="w-3 h-3" /> Signature cake
                </span>
              )}
            </div>

            <div className="md:w-1/2 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md">
                {product.category_name || 'Artisan Cake'}
              </span>
              <h2 id="product-title" className="text-2xl font-bold text-slate-900 leading-tight">
                {product.name}
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {product.description}
              </p>

              {/* Price Preview */}
              <div className="pt-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-rose-600">
                    {selectedVariant ? currency + currentVariantPrice : 'Unavailable'}
                  </span>
                  {selectedVariant && selectedVariant.sale_price !== undefined && selectedVariant.sale_price < selectedVariant.price && (
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
              {activeVariants.map((v) => {
                const isSelected = selectedVariant?.id === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedVariantId(v.id)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
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

          {!selectedVariant && <p role="status" className="text-xs font-semibold text-slate-600">No selected size is currently available. Choose an available size to continue.</p>}

          {needsFlavorSelection && <p role="alert" className="text-xs font-semibold text-amber-800 bg-amber-50 rounded-xl p-3">Please choose a currently available flavor before adding this cake.</p>}
          {removedFlavor && !availableFlavors.length && <p role="status" className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3">Your previous flavor option is no longer available. This cake currently has no flavor options, so no flavor will be added.</p>}

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
                      aria-pressed={isSelected}
                      onClick={() => setSelectedFlavorId(flavor.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
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

          {unavailableAddonIds.length > 0 && <div role="alert" className="text-xs text-amber-800 bg-amber-50 rounded-xl p-3 space-y-2"><p>Some selected extras are no longer available for this cake. They are excluded from the displayed total. Remove them to continue.</p><button type="button" className="font-semibold underline underline-offset-4" onClick={() => setSelectedAddonIds(ids => ids.filter(id => availableAddons.some(addon => addon.id === id)))}>Remove unavailable extras</button></div>}

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
                    <button type="button" aria-pressed={isSelected}
                      key={addon.id}
                      onClick={() => toggleAddon(addon)}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
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
                    </button>
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
              aria-label="Message to write on your cake" value={writingMessage}
              onChange={(e) => setWritingMessage(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-rose-600 focus:ring-2 focus:ring-rose-100 text-sm text-slate-800 placeholder-slate-400"
            />
            <p className="text-[11px] text-slate-500">
              Add a short dedication to make your cake personal.
            </p>
          </div>

          {/* 5. Quantity & Tally */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-800">Quantity:</span>
              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <button
                  type="button"
                  aria-label="Decrease cake quantity" disabled={quantity <= 1}
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
                  aria-label="Increase cake quantity"
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
                {selectedVariant ? currency + totalPrice : 'Unavailable'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-4">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isAddedFeedback || !canAddToCart}
            className={`w-full py-3.5 px-6 rounded-2xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
              isAddedFeedback
                ? 'bg-emerald-600 text-white shadow-emerald-200'
                : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200 active:scale-98'
            }`}
          >
            {isAddedFeedback ? (
              <>
                <Check className="w-5 h-5" /> <span role="status">Added to your bag</span>
              </>
            ) : !canAddToCart ? (
              <span>{unavailableLabel}</span>
            ) : (
              <>
                <ShoppingBag className="w-5 h-5" /> Add to Cart — {selectedVariant ? currency + totalPrice : 'Unavailable'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
