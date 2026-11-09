import { shopErrorMessage } from '../utils/shopErrorMessage';
import React, { useState, useMemo, useEffect } from 'react';
import { useCakeDialog } from './useCakeDialog';
import { X, Check, Plus, Minus, ShoppingBag, Sparkles, Zap, Star, Camera, Flame, SlidersHorizontal } from 'lucide-react';
import { Product, Flavor, ProductAddon, CartItem, Review } from '../types';
import { getProductDisplayStats, isProductNew } from '../services/productStats';
import { StorefrontPrice } from './StorefrontPrice';
import { cleanFreeGiftItems, formatFreeGiftList } from '../utils/freeGifts';

interface ProductDetailModalProps {
  product: Product | null;
  allFlavors: Flavor[];
  allAddons: ProductAddon[];
  currency: string;
  acceptingOrders?: boolean;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
  onOrderNow?: (item: CartItem) => void;
  reviews?: Review[];
  onAddReview?: (review: Omit<Review, 'id' | 'status' | 'created_at'>) => void | Promise<void>;
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
  onOrderNow,
  reviews,
  onAddReview,
}) => {
  const dialogRef = useCakeDialog(onClose);

  // Reviews and Images
  const [selectedImage, setSelectedImage] = useState(product.image_url);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newReviewerName, setNewReviewerName] = useState('');
  const [newReviewComment, setNewReviewComment] = useState('');
  const [newReviewImage, setNewReviewImage] = useState('');
  const [reviewSuccessFeedback, setReviewSuccessFeedback] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const stats = useMemo(() => getProductDisplayStats(product), [product]);

  const productReviews = useMemo(() => {
    const list = reviews || [];
    return list.filter((r) => r.product_id === product.id && r.status === 'approved');
  }, [reviews, product.id]);

  const allDisplayImages = useMemo(() => {
    const list: { url: string; caption?: string; isCustomer?: boolean }[] = [
      { url: product.image_url, caption: product.name }
    ];
    if (product.gallery_images) {
      product.gallery_images.forEach((img, idx) => {
        if (img && img !== product.image_url && !list.some(l => l.url === img)) {
          list.push({ url: img, caption: `${product.name} - view ${idx + 1}` });
        }
      });
    }
    productReviews.forEach((rev) => {
      if (rev.image_url && !list.some(l => l.url === rev.image_url)) {
        list.push({ url: rev.image_url, caption: `${rev.customer_name}-এর রিভিউ ছবি`, isCustomer: true });
      }
    });
    return list;
  }, [product, productReviews]);

  const handleLocalSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reviewBusy || !newReviewerName.trim() || !newReviewComment.trim()) return;
    setReviewBusy(true);setReviewError('');
    const reviewData = {
      product_id: product.id,
      product_name: product.name,
      customer_name: newReviewerName.trim(),
      rating: newRating,
      comment: newReviewComment.trim(),
      image_url: newReviewImage.trim() || undefined,
      verified_purchase: true,
    };
    try {
    if (!onAddReview) throw new Error('Review service is unavailable.');
    await onAddReview(reviewData);
    setReviewSuccessFeedback(true);
    setTimeout(() => {
      setShowReviewForm(false);
      setReviewSuccessFeedback(false);
      setNewReviewerName('');
      setNewReviewComment('');
      setNewReviewImage('');
    }, 1500);
    } catch(error) {setReviewError(shopErrorMessage(error, 'Review could not be saved.'));}
    finally {setReviewBusy(false);}
  };

  // Resolve the current catalog entry so changed or deactivated variants cannot be purchased.
  const activeVariants = product.variants.filter(variant => variant.is_active);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(activeVariants[0]?.id);
  const selectedVariant = activeVariants.find(variant => variant.id === selectedVariantId);
  const availableFlavors = useMemo(() => {
    const allowAll = product.allowed_flavor_ids?.some(x => x.toLowerCase() === 'all' || x === '*');
    return allFlavors.filter((f) => f.is_active && (allowAll || product.allowed_flavor_ids?.includes(f.id)));
  }, [allFlavors, product]);

  const [selectedFlavorId, setSelectedFlavorId] = useState<string | undefined>(availableFlavors[0]?.id);
  const selectedFlavor = availableFlavors.find(flavor => flavor.id === selectedFlavorId);
  const needsFlavorSelection = availableFlavors.length > 0 && !selectedFlavor;
  const removedFlavor = !!selectedFlavorId && !selectedFlavor;

  const availableAddons = useMemo(() => {
    const allowAll = product.allowed_addon_ids?.some(x => x.toLowerCase() === 'all' || x === '*');
    return allAddons.filter((a) => a.is_active && (allowAll || product.allowed_addon_ids?.includes(a.id)));
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
  const originalUnitPrice = (selectedVariant ? selectedVariant.price : 0) + addonsTotal;
  const originalTotalPrice = originalUnitPrice * quantity;
  const hasVariantDiscount = Boolean(selectedVariant && selectedVariant.sale_price !== undefined && selectedVariant.sale_price < selectedVariant.price);
  const totalSavings = hasVariantDiscount && selectedVariant ? (selectedVariant.price - selectedVariant.sale_price!) * quantity : 0;

  const toggleAddon = (addon: ProductAddon) => {
    setSelectedAddonIds(ids => ids.includes(addon.id) ? ids.filter(id => id !== addon.id) : [...ids, addon.id]);
  };
const handleOrderNow = () => {
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

    if (onOrderNow) {
      onOrderNow(item);
    } else {
      onAddToCart(item);
      onClose();
    }
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
            <div className="md:w-1/2 space-y-2.5">
              <div className="rounded-2xl overflow-hidden bg-rose-50 relative group">
                <img
                  src={selectedImage || product.image_url}
                  alt={product.name}
                  className="w-full h-56 md:h-72 object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10 items-start pointer-events-none">
                  {isProductNew(product) && (
                    <span className="bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> ✨ নতুন কেক কালেকশন
                    </span>
                  )}
                  {product.is_featured && (
                    <span className="bg-amber-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Signature cake
                    </span>
                  )}
                </div>
              </div>

              {/* Thumbnail Gallery (Product + Sold Cake Photos) */}
              {allDisplayImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {allDisplayImages.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedImage(img.url)}
                      className={`relative w-14 h-14 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                        (selectedImage || product.image_url) === img.url
                          ? 'border-rose-600 ring-2 ring-rose-200'
                          : 'border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img.url} alt={img.caption || product.name} className="w-full h-full object-cover" />
                      {img.isCustomer && (
                        <span className="absolute bottom-0 inset-x-0 bg-emerald-800/80 text-[8px] text-white text-center font-bold">
                          গ্রাহক ছবি
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="md:w-1/2 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md">
                {product.category_name || 'Artisan Cake'}
              </span>
              <h2 id="product-title" className="text-2xl font-bold text-slate-900 leading-tight">
                {product.name}
              </h2>

              {/* Product Rating & Sold Stats */}
              {(productReviews.length > 0 || stats.reviewCount > 0 || stats.soldCount > 0) && (
                <div className="flex items-center gap-2.5 flex-wrap pt-0.5 pb-1">
                  {(productReviews.length > 0 || stats.reviewCount > 0) && (
                    <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-900 shadow-xs">
                      <Star size={14} className="fill-amber-400 text-amber-400 shrink-0" />
                      <span>{stats.ratingFormatted}</span>
                      <span className="text-amber-700/80 font-medium">({productReviews.length || stats.reviewCount} রিভিউ)</span>
                    </span>
                  )}
                  {stats.soldCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-900 shadow-xs">
                      <Flame size={14} className="text-orange-500 fill-orange-500 shrink-0" />
                      <span>{stats.soldCount} টি কেক সফলভাবে ডেলিভারি ও বিক্রিত</span>
                    </span>
                  )}
                </div>
              )}

              <p className="text-sm text-slate-600 leading-relaxed">
                {product.description}
              </p>
              {cleanFreeGiftItems(product.free_gift_items).length > 0 && (
                <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2" data-testid="assigned-product-free-gifts">
                  🎁 এই কেকের সঙ্গে ফ্রি: {formatFreeGiftList(cleanFreeGiftItems(product.free_gift_items))}
                </div>
              )}

              {/* Price Preview */}
              <div className="pt-2">
                {selectedVariant
                  ? <StorefrontPrice regular={selectedVariant.price} current={currentVariantPrice}
                      currency={currency} size={selectedVariant.name}/>
                  : <span className="text-sm font-semibold text-slate-600">Unavailable</span>}
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Cake Customization Banner */}
          <div className="bg-linear-to-r from-rose-50 via-amber-50/70 to-pink-50 border border-rose-200/80 rounded-2xl p-3.5 flex items-center gap-3 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-white shadow-xs flex items-center justify-center text-rose-600 shrink-0 border border-rose-100">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">কেক কাস্টমাইজেশন (Customize Your Cake)</h3>
                <span className="text-[10px] font-bold bg-rose-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                  অর্ডার অপশন
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                সাইজ/ওজন, স্পঞ্জ ফ্লেভার, কেকের উপর লেখার বার্তা ও পার্টি আইটেম কাস্টমাইজ করে অর্ডার করুন।
              </p>
            </div>
          </div>

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
                    <div className="mt-1">
                      <StorefrontPrice regular={v.price} current={v.sale_price ?? v.price} currency={currency} compact/>
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
              <span className="text-xs text-slate-500 block">Total Item Price (মোট মূল্য)</span>
              <div className="flex items-center justify-end gap-2 flex-wrap">
                {hasVariantDiscount && (
                  <span className="text-sm text-slate-400 line-through font-semibold">
                    {currency}{originalTotalPrice}
                  </span>
                )}
                <span className="text-2xl font-black text-rose-600">
                  {selectedVariant ? currency + totalPrice : 'Unavailable'}
                </span>
                {hasVariantDiscount && (
                  <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2 py-0.5 rounded-full border border-rose-200">
                    {currency}{totalSavings} ছাড়
                  </span>
                )}
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 6. Customer Reviews & Sold Cake Photos */}
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span>Customer Reviews & Sold Photos (রিভিউ ও বাস্তব ছবি)</span>
                  <span className="text-xs font-semibold text-slate-500">
                    ({productReviews.length})
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Real photos of delivered cakes & customer experiences
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewForm(!showReviewForm)}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{showReviewForm ? 'Cancel' : 'Add Review & Photo'}</span>
              </button>
            </div>

            {/* Review Submission Form */}
            {showReviewForm && (
              <form onSubmit={handleLocalSubmitReview} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 text-xs animate-fade-in">
                {reviewError && <p role="alert" className="text-red-700">{reviewError}</p>}
                <h4 className="font-bold text-slate-900">
                  Share Your Experience for {product.name}
                </h4>

                {reviewSuccessFeedback && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-bold flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>রিভিউ সংরক্ষিত হয়েছে। Staff approval-এর পরে প্রকাশ হবে। ধন্যবাদ।</span>
                  </div>
                )}

                {/* Rating Stars */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Rating (রেটিং)</label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setNewRating(star)}
                        className="p-1 cursor-pointer transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            newRating >= star
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="ml-2 font-bold text-slate-700">{newRating} / 5</span>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Your Name (আপনার নাম)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. সাদিয়া জাহান"
                    value={newReviewerName}
                    onChange={(e) => setNewReviewerName(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 focus:outline-rose-500"
                  />
                </div>

                {/* Comment */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Review Comment (কেমন ছিল কেকটি?)</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="কেকের স্বাদ, ক্রিম ও সার্ভিসের অভিজ্ঞতা শেয়ার করুন..."
                    value={newReviewComment}
                    onChange={(e) => setNewReviewComment(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 focus:outline-rose-500"
                  />
                </div>

                {/* Image Upload for Sold Cake */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">
                    Cake photo — public HTTPS link (ঐচ্ছিক)
                  </label>
                  <input
                    type="text"
                    placeholder="https://example.com/my-cake.jpg"
                    value={newReviewImage}
                    onChange={(e) => setNewReviewImage(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 focus:outline-rose-500 text-xs"
                  />

                  {newReviewImage && (
                    <div className="relative inline-block mt-2">
                      <img
                        src={newReviewImage}
                        alt="Cake preview"
                        className="w-20 h-20 object-cover rounded-xl border-2 border-rose-300 shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setNewReviewImage('')}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 cursor-pointer"
                        title="Remove photo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReviewForm(false)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reviewBusy}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    Submit Review (রিভিউ জমা দিন)
                  </button>
                </div>
              </form>
            )}

            {/* Reviews List */}
            {productReviews.length === 0 ? (
              <div className="bg-slate-50 p-4 rounded-2xl text-center text-xs text-slate-500">
                এই কেকের জন্য এখনো কোনো রিভিউ দেওয়া হয়নি। প্রথম রিভিউ ও ডেলিভারিকৃত কেকের ছবি আপনিই শেয়ার করুন!
              </div>
            ) : (
              <div className="space-y-3">
                {productReviews.map((rev) => (
                  <div key={rev.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{rev.customer_name}</span>
                        {rev.verified_purchase !== false && (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Verified Buyer
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${
                              rev.rating >= s
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-300'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <p className="text-slate-700 leading-relaxed">{rev.comment}</p>

                    {/* Customer's Sold Cake Image */}
                    {rev.image_url && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setSelectedImage(rev.image_url!)}
                          className="group relative inline-block rounded-xl overflow-hidden border border-slate-200 shadow-xs hover:shadow-md transition-shadow cursor-pointer"
                          title="Click to view large photo"
                        >
                          <img
                            src={rev.image_url}
                            alt={`Photo of ${product.name} received by ${rev.customer_name}`}
                            className="w-24 h-24 object-cover group-hover:scale-105 transition-transform"
                          />
                          <span className="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-xs text-white text-[9px] py-0.5 text-center font-bold">
                            ডেলিভারিকৃত কেক
                          </span>
                        </button>
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 pt-0.5">
                      {rev.created_at}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
          {!canAddToCart ? (
            <button
              type="button"
              disabled
              className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm bg-slate-200 text-slate-500 cursor-not-allowed text-center"
            >
              {unavailableLabel}
            </button>
          ) : (
            <>
              {/* Add to Cart Button */}
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={isAddedFeedback}
                className={`flex-1 py-3.5 px-4 rounded-2xl font-bold text-sm border-2 border-rose-600 text-rose-700 bg-white hover:bg-rose-50 shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  isAddedFeedback ? 'border-emerald-600 text-emerald-700 bg-emerald-50' : 'active:scale-98'
                }`}
              >
                {isAddedFeedback ? (
                  <>
                    <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>Added to Bag</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>Add to Cart</span>
                  </>
                )}
              </button>

              {/* Order Now Button */}
              <button
                type="button"
                onClick={handleOrderNow}
                disabled={isAddedFeedback}
                className="flex-[1.2] py-3.5 px-5 rounded-2xl font-bold text-sm bg-rose-700 hover:bg-rose-800 text-white shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Zap className="w-4 h-4 shrink-0 fill-amber-300 text-amber-300" />
                <span className="flex items-center gap-1.5 flex-wrap justify-center">
                  <span>Order Now — {selectedVariant ? currency + totalPrice : 'Unavailable'}</span>
                  {hasVariantDiscount && (
                    <span className="text-xs text-amber-200 font-semibold">
                      (<span className="line-through opacity-80">{currency}{originalTotalPrice}</span> • {currency}{totalSavings} ছাড়)
                    </span>
                  )}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
