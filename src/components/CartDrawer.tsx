import React, { useState } from 'react';
import { X, Trash2, ArrowRight, ShoppingBag, ShieldCheck } from 'lucide-react';
import { CartItem } from '../types';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  currency: string;
  onUpdateQuantity: (cartItemId: string, newQty: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  currency,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
}) => {
  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.total_price, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-rose-100 flex items-center justify-between bg-rose-50/50">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-rose-600" />
              <h3 className="font-bold text-slate-900 text-lg">Your Celebration Bag</h3>
              <span className="text-xs bg-rose-200/80 text-rose-800 font-bold px-2 py-0.5 rounded-full">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-200/70 text-slate-500 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {items.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto text-2xl">
                  🎂
                </div>
                <h4 className="font-bold text-slate-800">Your cart is empty</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Explore our handcrafted artisan cakes, select your favorite flavors, and add custom writing!
                </p>
                <button
                  onClick={onClose}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-4 py-2 rounded-xl transition-colors cursor-pointer"
                >
                  Browse Cakes
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.cart_item_id}
                  className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 space-y-2.5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <img
                        src={item.product.image_url}
                        alt={item.product.name}
                        className="w-14 h-14 object-cover rounded-xl border border-slate-200 shrink-0"
                      />
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 leading-tight">
                          {item.product.name}
                        </h4>
                        <div className="text-xs text-rose-600 font-semibold mt-0.5">
                          {item.selected_variant.name}
                        </div>
                        {item.selected_flavor && (
                          <div className="text-[11px] text-slate-500">
                            Flavor: {item.selected_flavor.name}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveItem(item.cart_item_id)}
                      className="text-slate-400 hover:text-red-500 p-1 transition-colors cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Addons breakdown */}
                  {item.selected_addons.length > 0 && (
                    <div className="text-[11px] bg-white p-2 rounded-lg border border-slate-100 text-slate-600 space-y-0.5">
                      <span className="font-semibold text-slate-700 block">Add-ons:</span>
                      {item.selected_addons.map((addon) => (
                        <div key={addon.id} className="flex justify-between">
                          <span>• {addon.name}</span>
                          <span className="font-semibold text-rose-600">+{currency}{addon.price}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Writing message */}
                  {item.writing_message && (
                    <div className="text-[11px] bg-amber-50 text-amber-900 px-2.5 py-1 rounded-md border border-amber-200">
                      <strong>Cake Writing:</strong> "{item.writing_message}"
                    </div>
                  )}

                  {/* Quantity & Item Subtotal */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                    <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white text-xs">
                      <button
                        onClick={() => onUpdateQuantity(item.cart_item_id, item.quantity - 1)}
                        className="px-2 py-1 hover:bg-slate-100 text-slate-700 cursor-pointer"
                      >
                        -
                      </button>
                      <span className="px-2 font-bold text-slate-800">{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQuantity(item.cart_item_id, item.quantity + 1)}
                        className="px-2 py-1 hover:bg-slate-100 text-slate-700 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-sm font-black text-rose-600">
                      {currency}{item.total_price}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Subtotal & Checkout */}
          {items.length > 0 && (
            <div className="p-5 border-t border-slate-100 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 font-medium">Subtotal</span>
                <span className="font-bold text-slate-900 text-base">{currency}{subtotal}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Price verified directly via backend database catalog RPC</span>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onProceedToCheckout();
                }}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-md shadow-rose-200 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
