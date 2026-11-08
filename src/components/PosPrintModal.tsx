import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Printer, 
  Settings2, 
  FileText, 
  Tag, 
  ChefHat, 
  Gift, 
  Check, 
  SlidersHorizontal 
} from 'lucide-react';
import type { Order } from '../types';
import { 
  PosPaperSize, 
  PosReceiptType, 
  PosPrinterSettings, 
  getPosPrinterSettings, 
  savePosPrinterSettings,
  DEFAULT_COMPLIMENTARY_ITEMS
} from '../services/posPrinterService';
import { PosPrinterSettingsModal } from './PosPrinterSettingsModal';
import { formatShortOrderNumber } from '../utils/orderUtils';
import { PosDualQrCodes, resolvePublicWebUrl } from './PosQrCodes';
import { mockDb } from '../services/mockDatabase';

export interface PosReceiptSlipProps {
  order: Order;
  activeType: PosReceiptType;
  activePaper: PosPaperSize;
  settings: PosPrinterSettings;
  currency?: string;
  shopName?: string;
  shopPhone?: string;
  shopAddress?: string;
  shopLogoUrl?: string;
  resolvedWebUrl: string;
  resolvedFacebookUrl: string;
  copyTitle?: string;
}
export function PosPaperStyle({paper}:{paper:PosPaperSize}){
  const width=paper==='58mm'?58:80;
  return <style>{`@media print{@page{size:auto;margin:0}body:has(.ac-print-portal){width:${width}mm!important;max-width:${width}mm!important}body:has(.ac-print-portal) .ac-print-portal{width:${width}mm!important;max-width:${width}mm!important;padding:2mm!important;box-sizing:border-box} .ac-pos-slip{box-shadow:none!important;border:0!important;max-width:100%!important;margin:0!important} .ac-pos-slip *{overflow-wrap:anywhere;max-width:100%}}`}</style>;
}

export const PosReceiptSlip: React.FC<PosReceiptSlipProps> = ({
  order,
  activeType,
  activePaper,
  settings,
  currency = '৳',
  shopName = "Aurora's Cake Artisan Bakery",
  shopPhone = '+880 1700-000000',
  shopAddress = 'Tangail, Bangladesh',
  shopLogoUrl,
  resolvedWebUrl,
  resolvedFacebookUrl,
  copyTitle,
}) => {
  const isNarrow = activePaper === '58mm';
  const effectiveLogoUrl = shopLogoUrl || (typeof mockDb !== 'undefined' ? mockDb.getShopSettingsSync()?.logo_url : '') || '/images/aurora-logo.png';
  const customerName = order.customer_name || (order as any).name || 'Customer';
  const customerPhone = order.customer_phone || (order as any).phone || '';
  const recipientName = order.recipient_name || customerName;
  const recipientPhone = order.recipient_phone || customerPhone;
  const orderNum = formatShortOrderNumber(order.order_number || order.id || '0000');
  const shortOrderNum = formatShortOrderNumber(orderNum);
  const orderIdSuffix = orderNum.length >= 8 ? orderNum.slice(-8) : orderNum;
  const zoneName = order.delivery_zone?.name || (typeof order.delivery_zone === 'string' ? order.delivery_zone : '') || (order as any).zone || 'Tangail City';
  const deliveryAddress = order.delivery_address || (order as any).address || 'Address not provided';
  const deliverySlot = order.delivery_slot || (order as any).slot || 'Standard Slot';
  const deliveryDate = order.delivery_date || (order as any).date || '';
  
  const rawItems: any[] = Array.isArray(order.items) 
    ? order.items 
    : Array.isArray((order as any).cart_items) 
    ? (order as any).cart_items 
    : Array.isArray((order as any).order_items) 
    ? (order as any).order_items 
    : [];

  const items = rawItems.map((it) => {
    const quantity = Number(it.quantity || 1);
    const productName = it.product_name || it.name || it.product?.name || it.title || 'Cake';
    const variantName = it.variant_name || it.selected_variant?.name || it.variant || 'Regular';
    const flavorName = it.flavor_name || it.selected_flavor?.name || it.flavor || '';
    const writingMessage = it.writing_message || it.cake_message || it.message || '';
    const unitPrice = Number(it.unit_price ?? it.product?.price ?? it.price ?? 0);
    const subtotal = Number(it.subtotal ?? (unitPrice * quantity));
    const addons = Array.isArray(it.addons)
      ? it.addons
      : Array.isArray(it.selected_addons)
      ? it.selected_addons.map((a: any) => ({
          addon_name: a.addon_name || a.name || 'Addon',
          quantity: Number(a.quantity || 1),
          subtotal: Number(a.subtotal || a.price || 0),
        }))
      : [];

    let basePrice: number | undefined =
      it.base_price ?? it.regular_price ?? it.original_price ?? it.product?.base_price ?? it.selected_variant?.price;
    let salePrice: number | undefined =
      it.sale_price ?? it.product?.sale_price ?? it.selected_variant?.sale_price;

    if (basePrice === undefined || salePrice === undefined) {
      try {
        const prods = mockDb.getProductsSync();
        const prod = prods.find((p) =>
          (it.product_id && p.id === it.product_id) ||
          (p.name && productName && p.name.trim().toLowerCase() === String(productName).trim().toLowerCase())
        );
        if (prod) {
          const variant = prod.variants?.find((v) =>
            (it.variant_id && v.id === it.variant_id) ||
            (v.name && variantName && v.name.trim().toLowerCase() === String(variantName).trim().toLowerCase())
          );
          if (variant) {
            if (basePrice === undefined) basePrice = variant.price;
            if (salePrice === undefined) salePrice = variant.sale_price;
          }
          if (basePrice === undefined) basePrice = prod.base_price;
          if (salePrice === undefined) salePrice = prod.sale_price;
        }
      } catch {}
    }

    const finalBasePrice = Number(basePrice ?? unitPrice);
    const finalSalePrice = typeof salePrice === 'number' && !isNaN(salePrice) ? Number(salePrice) : undefined;

    return {
      ...it,
      quantity,
      product_name: productName,
      variant_name: variantName,
      flavor_name: flavorName,
      writing_message: writingMessage,
      free_gift_items: Array.isArray(it.free_gift_items) ? it.free_gift_items.filter((gift: unknown): gift is string => typeof gift === "string") : [],
      unit_price: unitPrice,
      base_price: finalBasePrice,
      sale_price: finalSalePrice,
      subtotal,
      addons,
    };
  });

  const dueCOD = order.due_amount !== undefined 
    ? Number(order.due_amount) 
    : (order.payment_method === 'cod' ? (Number(order.total_amount || 0) - Number(order.advance_paid_amount || 0)) : 0);
  const subtotal = Number(order.subtotal ?? (order.total_amount || 0));
  const deliveryFee = Number(order.delivery_fee ?? 0);
  const discountAmount = Number(order.discount_amount ?? 0);
  const totalAmount = Number(order.total_amount ?? 0);
  const advancePaid = Number(order.advance_paid_amount ?? 0);
  const paymentMethod = String(order.payment_method || 'cod').toUpperCase();
  const paymentStatus = String(order.payment_status || 'unpaid');
  const createdDateStr = order.created_at
    ? `${new Date(order.created_at).toLocaleDateString('en-GB')} ${new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : new Date().toLocaleDateString('en-GB');

  if (activeType === 'box_sticker') {
    return (
      <div className="ac-pos-slip bg-white text-black p-4 border-2 border-dashed border-slate-600 font-sans text-xs space-y-3 shadow-inner max-w-sm mx-auto my-2">
        {/* Brand Header */}
        <div className="text-center border-b-2 border-black pb-2 space-y-0.5">
          {effectiveLogoUrl ? (
            <img 
              src={effectiveLogoUrl} 
              alt={shopName} 
              className="w-14 h-14 object-contain mx-auto mb-1" 
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/images/aurora-logo.png';
              }}
            />
          ) : (
            <div className="w-8 h-8 mx-auto mb-1 flex items-center justify-center">
              <svg className="w-7 h-7 text-black" viewBox="0 0 42 48" fill="none" aria-hidden="true">
                <path d="M5 39h32M8 36V23c4 0 4 5 8 5s4-5 8-5 4 5 10 5v8H8Zm0-13v-4h26v4M12 19v-6h18v6M21 12V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 6c-4-3 0-6 0-6s4 3 0 6Z" fill="currentColor" transform="translate(0 2)" />
                <path d="M4 44c8-2 26-2 34 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
          )}
          <h2 className="font-black text-sm uppercase tracking-wider text-black">
            {shopName}
          </h2>
          <p className="text-[10px] text-slate-700 font-medium">
            Freshly Baked with Love • Tangail, Bangladesh
          </p>
        </div>

        {/* Order & Slot */}
        <div className="flex items-center justify-between border-b border-black pb-1.5">
          <div>
            <span className="text-[9px] uppercase font-bold text-slate-600 block">Order Token</span>
            <span className="font-mono text-base font-black text-black">
              #{shortOrderNum}
            </span>
            <span className="text-[9px] font-mono text-slate-500 block">
              
            </span>
          </div>
          <div className="text-right">
            <span className="text-[9px] uppercase font-bold text-slate-600 block">Delivery Slot</span>
            <span className="font-bold text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-400">
              {deliverySlot}
            </span>
          </div>
        </div>

        {/* Gift Order Banner */}
        {order.is_gift && (
          <div className="bg-purple-50 text-purple-950 p-2 rounded-xl border border-purple-300 space-y-1">
            <div className="flex items-center gap-1.5 font-black text-xs text-purple-900">
              <Gift className="w-4 h-4 text-purple-700" />
              <span>🎁 SURPRISE GIFT ORDER!</span>
            </div>
            {order.hide_price_on_box && (
              <div className="text-[10px] font-bold bg-purple-200 text-purple-900 px-1.5 py-0.5 rounded">
                🚫 DO NOT MENTION BILL / NO INVOICE INSIDE BOX
              </div>
            )}
            {order.sender_name && (
              <div className="text-[10px] text-purple-900">
                From: <strong>{order.sender_name}</strong> ({order.sender_phone || 'Confidential'})
              </div>
            )}
            {order.gift_card_message && (
              <div className="text-[10px] italic bg-white/80 p-1.5 rounded border border-purple-200 font-serif">
                💌 "{order.gift_card_message}"
              </div>
            )}
          </div>
        )}

        {/* Recipient Details */}
        <div className="space-y-0.5 bg-slate-50 p-2 rounded-xl border border-slate-300">
          <span className="text-[9px] text-slate-600 uppercase font-bold block">
            {order.is_gift ? 'Recipient' : 'Customer'}
          </span>
          <div className="font-black text-black text-sm">{recipientName}</div>
          <div className="font-mono text-xs text-black font-bold">{recipientPhone}</div>
          <div className="text-slate-800 text-[11px] leading-tight pt-0.5">
            <strong>Address:</strong> {deliveryAddress}
          </div>
          <div className="text-[10px] text-slate-600">
            Zone: {zoneName}
          </div>
        </div>

        {/* Items & Dedication */}
        <div className="space-y-1.5 border-t border-b border-slate-400 py-2">
          <span className="text-[9px] text-slate-600 uppercase font-bold block">
            Cake Specs
          </span>
          {items.length === 0 ? (
            <div className="text-center py-2 text-slate-500 italic text-[11px]">
              No items available
            </div>
          ) : (
            items.map((it, idx) => (
              <div key={idx} className="space-y-1 bg-slate-50 p-1.5 rounded-lg border border-slate-300">
                <div className="flex justify-between items-start font-black text-black text-xs">
                  <span>{it.quantity || 1}x {it.product_name || 'Cake'}</span>
                  <span className="text-[10px] bg-slate-200 px-1 rounded">{it.variant_name || 'Regular'}</span>
                </div>
                {it.flavor_name && (
                  <div className="text-[10px] text-slate-800 font-semibold">
                    Flavor: <span className="font-bold">{it.flavor_name}</span>
                  </div>
                )}
                {/* Base & Sale Price */}
                {(!order.is_gift || !order.hide_price_on_box) && (
                  <div className="text-[10px] text-slate-800 font-mono font-bold flex justify-between">
                    <span>
                      Base: {currency}{it.base_price}
                      {it.sale_price !== undefined && it.sale_price < it.base_price ? (
                        <> | Sale: {currency}{it.sale_price}</>
                      ) : (
                        <> | Sale: {currency}{it.base_price}</>
                      )}
                    </span>
                    <span>{currency}{it.subtotal}</span>
                  </div>
                )}
                {!!it.free_gift_items.length && <div className="text-xs">Complimentary: {it.free_gift_items.join(", ")}</div>}
                {it.writing_message && (
                  <div className="bg-amber-50 border border-amber-300 p-1.5 rounded text-amber-950 font-black text-xs">
                    ✍️ Cake Dedication:<br />
                    <span className="text-sm font-black font-serif">"{it.writing_message}"</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Free Checklist */}
        {order.id === 'ord-pos-demo' && settings.showComplimentaryKit && (
          <div className="bg-emerald-50 text-emerald-950 p-1.5 rounded-xl border border-emerald-300 text-[10px] font-semibold space-y-0.5">
            <div className="font-bold uppercase">✓ {settings.complimentaryKitTitle || 'Complimentary Kit Inside Box:'}</div>
            {(settings.complimentaryItems && settings.complimentaryItems.length > 0
              ? settings.complimentaryItems
              : DEFAULT_COMPLIMENTARY_ITEMS
            ).map((item, idx) => (
              <div key={idx}>[✓] {item}</div>
            ))}
          </div>
        )}

        {/* COD Notice */}
        <div className="border-t-2 border-black pt-2 flex justify-between items-center">
          <div>
            <span className="text-[9px] text-slate-600 uppercase font-bold block">Payment</span>
            {order.is_gift && order.hide_price_on_box ? (
              <span className="font-bold text-purple-800 text-xs">GIFT (NO PRICE)</span>
            ) : (
              <span className="font-bold text-xs uppercase text-black">{paymentMethod}</span>
            )}
          </div>
          <div className="text-right">
            <span className="text-[9px] text-slate-600 uppercase font-bold block">Due to Collect</span>
            <span className={`font-mono text-base font-black ${dueCOD > 0 ? 'text-black' : 'text-emerald-800'}`}>
              {dueCOD > 0 ? `${currency}${dueCOD}` : 'PAID (৳0)'}
            </span>
          </div>
        </div>

        {/* Caution */}
        <div className="text-center text-[9px] text-slate-600 pt-1 font-semibold border-t border-slate-300">
          ⚠️ KEEP LEVEL & COOL • DO NOT TILT • REFRIGERATE UPON RECEIPT
        </div>

        {/* Web & Facebook QR on Box Sticker */}
        {(settings.showWebQr || settings.showFacebookQr) && (
          <PosDualQrCodes
            websiteUrl={resolvedWebUrl}
            facebookUrl={resolvedFacebookUrl}
            showWeb={settings.showWebQr}
            showFacebook={settings.showFacebookQr}
            isNarrow={true}
            headingText="SCAN TO RE-ORDER OR REVIEW"
          />
        )}
      </div>
    );
  }

  if (activeType === 'kitchen_ticket') {
    return (
      <div className="ac-pos-slip bg-white text-black p-4 border-2 border-black font-mono text-xs space-y-3 max-w-sm mx-auto my-2">
        <div className="text-center border-b-2 border-black pb-2">
          <h2 className="font-black text-base uppercase">👨‍🍳 KITCHEN BAKE TICKET</h2>
          <div className="text-base font-black mt-1">ORDER TOKEN #{shortOrderNum}</div>
          
          <div className="text-[11px] font-semibold mt-0.5">Delivery Slot: {deliverySlot}</div>
          <div className="text-[10px] text-slate-600">Date: {deliveryDate || 'Today'}</div>
        </div>

        <div className="border-b border-black pb-2 space-y-2">
          <div className="font-bold uppercase text-[10px]">ITEMS TO PREPARE:</div>
          {items.length === 0 ? (
            <div className="text-center py-2 text-slate-500 italic text-[11px]">
              No items available
            </div>
          ) : (
            items.map((it, idx) => (
              <div key={idx} className="bg-slate-100 p-2 rounded border border-black space-y-1">
                <div className="text-sm font-black flex justify-between">
                  <span>{it.quantity || 1}x {it.product_name || 'Cake'}</span>
                  <span>[{it.variant_name || 'Regular'}]</span>
                </div>
                {it.flavor_name && (
                  <div className="text-xs font-bold">FLAVOR: {it.flavor_name}</div>
                )}
                <div className="text-[10px] text-slate-700 font-mono">
                  Base: {currency}{it.base_price} | Sale: {currency}{it.sale_price ?? it.base_price}
                </div>
                {!!it.free_gift_items.length && <div className="text-xs">Complimentary: {it.free_gift_items.join(", ")}</div>}
                {it.writing_message && (
                  <div className="bg-white p-1.5 border-2 border-black font-black text-sm">
                    ✍️ WRITING ON CAKE:<br />
                    "{it.writing_message}"
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {order.order_note && (
          <div className="border-b border-black pb-2">
            <span className="font-bold text-[10px] block uppercase">SPECIAL INSTRUCTIONS:</span>
            <p className="text-xs font-semibold">{order.order_note}</p>
          </div>
        )}

        <div className="pt-2 text-[10px] space-y-1">
          <div className="flex justify-between">
            <span>Baker / Chef Sign: ________________</span>
            <span>Packed: [  ]</span>
          </div>
          <div className="flex justify-between pt-1">
            <span>Knife & Candles checked: [  ]</span>
            <span>QC Approved: [  ]</span>
          </div>
        </div>
      </div>
    );
  }

  // Default: Customer Cash Memo (কাস্টমার ক্যাশ মেমো)
  return (
    <div 
      className={`ac-pos-slip bg-white text-black p-4 font-mono text-xs space-y-2.5 shadow-sm mx-auto my-2 border border-slate-300 ${
        isNarrow ? 'max-w-[260px]' : 'max-w-[340px]'
      }`}
    >
      {/* Copy Badge */}
      {copyTitle && (
        <div className="text-center pb-1 text-[10px] font-bold border-b border-dashed border-slate-400">
          --- {copyTitle} ---
        </div>
      )}

      {/* Brand Header */}
      {settings.showShopLogo && (
        <div className="text-center space-y-0.5 border-b border-black pb-2">
          {effectiveLogoUrl ? (
            <img 
              src={effectiveLogoUrl} 
              alt={shopName} 
              className="w-16 h-16 object-contain mx-auto mb-1" 
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/images/aurora-logo.png';
              }}
            />
          ) : (
            <div className="w-10 h-10 mx-auto mb-1 flex items-center justify-center">
              <svg className="w-8 h-8 text-black" viewBox="0 0 42 48" fill="none" aria-hidden="true">
                <path d="M5 39h32M8 36V23c4 0 4 5 8 5s4-5 8-5 4 5 10 5v8H8Zm0-13v-4h26v4M12 19v-6h18v6M21 12V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 6c-4-3 0-6 0-6s4 3 0 6Z" fill="currentColor" transform="translate(0 2)" />
                <path d="M4 44c8-2 26-2 34 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
          )}
          <h1 className="font-black text-sm uppercase tracking-wide text-black">
            {shopName}
          </h1>
          {settings.showShopAddress && (
            <p className="text-[10px] text-slate-700 leading-tight">
              Freshly Baked with Love • {shopAddress}
            </p>
          )}
          {settings.showShopPhone && (
            <p className="text-[10px] font-bold text-black font-mono">
              Phone: {shopPhone}
            </p>
          )}
        </div>
      )}

      {/* Receipt Meta */}
      <div className="border-b border-dashed border-slate-500 pb-2 text-[11px] space-y-0.5">
        <div className="font-black text-center text-xs uppercase tracking-wider mb-1">
          RETAIL CASH MEMO / INVOICE
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Order Token:</span>
          <span className="font-mono font-black text-sm">#{shortOrderNum} <span className="font-normal text-slate-500 text-[10px] font-sans"></span></span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Date & Time:</span>
          <span>{createdDateStr}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Delivery Slot:</span>
          <span className="font-bold">{deliverySlot}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Customer:</span>
          <span className="font-bold">{customerName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Phone:</span>
          <span className="font-bold">{customerPhone}</span>
        </div>
        {deliveryAddress && (
          <div className="pt-0.5 text-[10px] text-slate-700 leading-tight">
            <strong>Address:</strong> {deliveryAddress}
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="border-b border-dashed border-slate-500 pb-2 space-y-1.5">
        <div className="flex justify-between font-bold text-[10px] border-b border-slate-300 pb-1 text-slate-700 uppercase">
          <span>Item / Description</span>
          <span>Total</span>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-2 text-slate-500 italic text-[11px]">
            No items available
          </div>
        ) : (
          items.map((it, idx) => (
            <div key={idx} className="space-y-0.5">
              <div className="flex justify-between font-bold text-[11px]">
                <span>{it.quantity || 1}x {it.product_name || 'Cake'}</span>
                <span>{currency}{it.subtotal ?? 0}</span>
              </div>
              <div className="text-[10px] text-slate-600 pl-2">
                • Size: {it.variant_name || 'Regular'}
                {it.flavor_name && ` | Flavor: ${it.flavor_name}`}
              </div>
              {/* Base & Sale Price Breakdown */}
              <div className="text-[10px] text-slate-800 pl-2 font-mono flex items-center justify-between">
                <span>
                  Base: {currency}{it.base_price}
                  {it.sale_price !== undefined && it.sale_price < it.base_price ? (
                    <> | Sale: <strong className="font-bold text-black">{currency}{it.sale_price}</strong></>
                  ) : (
                    <> | Sale: {currency}{it.base_price}</>
                  )}
                </span>
                {it.quantity > 1 && (
                  <span className="text-[9px] text-slate-500 font-sans">
                    (@{currency}{it.unit_price})
                  </span>
                )}
              </div>
              {it.addons && it.addons.length > 0 && (
                <div className="pl-2 text-[9px] text-slate-600 space-y-0.5">
                  {it.addons.map((add: any, aIdx: number) => (
                    <div key={aIdx} className="flex justify-between">
                      <span>+ {add.quantity}x {add.addon_name}</span>
                      <span>{currency}{add.subtotal}</span>
                    </div>
                  ))}
                </div>
              )}
              {settings.showCakeMessage && it.writing_message && (
                <div className="text-[10px] font-serif italic text-slate-800 pl-2 bg-slate-50 p-1 rounded border border-slate-200">
                  ✍️ Dedication: "{it.writing_message}"
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Financial Calculation */}
      <div className="border-b-2 border-black pb-2 text-[11px] space-y-1">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{currency}{subtotal}</span>
        </div>
        <div className="flex justify-between">
          <span>Delivery Fee:</span>
          <span>{currency}{deliveryFee}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-rose-800 font-bold">
            <span>Discount {order.coupon_code ? `(${order.coupon_code})` : ''}:</span>
            <span>-{currency}{discountAmount}</span>
          </div>
        )}
        <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-300">
          <span>GRAND TOTAL:</span>
          <span>{currency}{totalAmount}</span>
        </div>
        <div className="flex justify-between pt-0.5">
          <span className="text-slate-600">Payment Method:</span>
          <span className="font-bold uppercase">{paymentMethod}</span>
        </div>
        {advancePaid > 0 ? (
          <div className="flex justify-between text-emerald-800">
            <span>Advance Paid:</span>
            <span>{currency}{advancePaid}</span>
          </div>
        ) : null}
        <div className="flex justify-between items-center bg-slate-100 p-1.5 rounded font-black text-sm border border-slate-300">
          <span>DUE AMOUNT:</span>
          <span>{currency}{dueCOD}</span>
        </div>
      </div>

      {/* Complimentary Kit */}
      {order.id === 'ord-pos-demo' && settings.showComplimentaryKit && (
        <div className="text-[9px] text-slate-600 border-b border-dashed border-slate-400 pb-1.5 space-y-0.5">
          <div className="font-bold text-slate-800 uppercase">✓ {settings.complimentaryKitTitle || 'Included with cake:'}</div>
          {(settings.complimentaryItems && settings.complimentaryItems.length > 0
            ? settings.complimentaryItems
            : DEFAULT_COMPLIMENTARY_ITEMS
          ).map((item, idx) => (
            <div key={idx}>[✓] {item}</div>
          ))}
        </div>
      )}

      {/* Web & Facebook QR Codes */}
      {(settings.showWebQr || settings.showFacebookQr) && (
        <PosDualQrCodes
          websiteUrl={resolvedWebUrl}
          facebookUrl={resolvedFacebookUrl}
          showWeb={settings.showWebQr}
          showFacebook={settings.showFacebookQr}
          isNarrow={isNarrow}
        />
      )}

      {/* Footer & QR */}
      <div className="text-center pt-1 text-[10px] space-y-1">
        {settings.showQrCode && (
          <div className="font-mono text-[9px] text-slate-600">
            [ Tracking reference: #{shortOrderNum} ]
          </div>
        )}
        <p className="font-medium text-slate-800">
          We appreciate your order.
        </p>
        <p className="text-[9px] text-slate-500">
          Thank you for choosing Aurora's Cake!
        </p>
        <div className="text-slate-400 text-[9px] pt-1">
          - - - - - - - - - - - - - - - - - - - - - - - -
        </div>
      </div>
    </div>
  );
};

interface Props {
  order: Order | null;
  demo?: boolean;
  onClose: () => void;
  currency?: string;
  initialType?: PosReceiptType;
  shopName?: string;
  shopPhone?: string;
  shopAddress?: string;
  shopLogoUrl?: string;
  websiteUrl?: string;
  facebookUrl?: string;
}

export const PosPrintModal: React.FC<Props> = ({
  order,
  demo = false,
  onClose,
  currency = '৳',
  initialType,
  shopName = "Aurora's Cake Artisan Bakery",
  shopPhone = '+880 1700-000000',
  shopAddress = 'Tangail, Bangladesh',
  shopLogoUrl,
  websiteUrl,
  facebookUrl,
}) => {
  const [settings, setSettings] = useState<PosPrinterSettings>(() => getPosPrinterSettings());
  const [activeType, setActiveType] = useState<PosReceiptType>(() => initialType || settings.defaultReceiptType || 'customer_memo');
  const [activePaper, setActivePaper] = useState<PosPaperSize>(() => settings.paperSize || '80mm');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const resolvedWebUrl = resolvePublicWebUrl(websiteUrl || settings.websiteUrl);
  const resolvedFacebookUrl = facebookUrl || settings.facebookUrl || 'https://www.facebook.com/aurorascake26';

  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  const renderSingleSlip = (copyTitle?: string) => (
    <PosReceiptSlip
      order={order}
      activeType={activeType}
      activePaper={activePaper}
      settings={settings}
      currency={currency}
      shopName={shopName}
      shopPhone={shopPhone}
      shopAddress={shopAddress}
      shopLogoUrl={shopLogoUrl}
      resolvedWebUrl={resolvedWebUrl}
      resolvedFacebookUrl={resolvedFacebookUrl}
      copyTitle={copyTitle}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-3.5 sm:p-6 shadow-2xl border border-slate-200 space-y-3 sm:space-y-4 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span>POS প্রিন্ট প্রিভিউ</span>
                <span className="text-[11px] sm:text-xs bg-slate-900 text-amber-300 font-mono px-2 sm:px-2.5 py-0.5 rounded-lg font-black tracking-wider" title={`পুরো অর্ডার নম্বর: #${formatShortOrderNumber(order.order_number)}`}>
                  #{formatShortOrderNumber(order.order_number)}
                </span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 break-words">
                গ্রাহক: <strong>{order.customer_name}</strong> • বিল: <strong>{currency}{order.total_amount}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              title="প্রিন্টার সাইজ ও সেটিংস পরিবর্তন করুন"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-600">80mm USB / Wi-Fi: installed printer বাছুন, paper 80mm, scale 100%, margin None ও headers/footers Off রাখুন।</p>
        {/* Toolbar: Template Switcher & Paper Switcher */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-slate-50 p-2 sm:p-2.5 rounded-2xl border border-slate-200 text-xs shrink-0">
          {/* Format Tabs */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap min-w-0 pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setActiveType('customer_memo')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                activeType === 'customer_memo'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>ক্যাশ মেমো</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveType('box_sticker')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                activeType === 'box_sticker'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>বক্স স্টিকার</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveType('kitchen_ticket')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                activeType === 'kitchen_ticket'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5" />
              <span>কিচেন স্লিপ</span>
            </button>
          </div>

          {/* Paper Size Quick Toggles */}
          <div className="flex items-center gap-1 justify-end shrink-0">
            <span className="text-[10px] text-slate-500 font-medium mr-1 hidden sm:inline">কাগজ:</span>
            {(['80mm', '58mm', 'sticker_3x4'] as PosPaperSize[]).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setActivePaper(size)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activePaper === size
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {size === '80mm' ? '80mm' : size === '58mm' ? '58mm' : '3"x4"'}
              </button>
            ))}
          </div>
        </div>

        {/* Printable Thermal Receipt Container */}
        <div className="flex-1 overflow-y-auto pr-1 bg-slate-100/60 p-2 sm:p-3 rounded-2xl border border-slate-200 flex justify-center">
          <div id="printable-pos-slip" className="w-full">
            {renderSingleSlip(settings.copiesCount === 2 ? 'Customer Copy' : undefined)}
            {settings.copiesCount === 2 && activeType === 'customer_memo' && (
              <>
                <div className="my-3 text-center text-xs font-mono text-slate-400">
                  - - - - - - - - - - - [ TEAR HERE ] - - - - - - - - - - -
                </div>
                {renderSingleSlip('Shop Copy')}
              </>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 pt-2 border-t border-slate-100 shrink-0">
          <div className="text-[11px] text-slate-500 items-center gap-1.5 hidden sm:flex">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span>{demo ? 'নমুনা রসিদ · Print dialog খুলুন' : 'Print dialog থেকে printer বাছুন'}</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-center border border-slate-200"
            >
              বন্ধ করুন
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex-[2] sm:flex-none px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-rose-200 transition-all cursor-pointer active:scale-95 text-center"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>🖨️ প্রিন্ট করুন</span>
            </button>
          </div>
        </div>
      </div>

      {/* POS Printer Settings Nested Modal */}
      {isSettingsOpen && (
        <PosPrinterSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => {
            setIsSettingsOpen(false);
            setSettings(getPosPrinterSettings());
          }}
          onTestPrint={(newSettings) => {
            setSettings(newSettings);
            setActivePaper(newSettings.paperSize);
            setActiveType(newSettings.defaultReceiptType);
            setIsSettingsOpen(false);
            setTimeout(() => window.print(), 300);
          }}
        />
      )}

      {/* POS Print Portal for flawless physical printing */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="ac-print-portal">
            <PosPaperStyle paper={activePaper}/>
            <div id="printable-pos-slip" className="w-full">
              {demo && <p className="text-center text-xs font-bold">DEMO · SAMPLE RECEIPT</p>}
              {renderSingleSlip(settings.copiesCount === 2 ? 'Customer Copy' : undefined)}
              {settings.copiesCount === 2 && activeType === 'customer_memo' && (
                <>
                  <div className="my-3 text-center text-xs font-mono text-slate-400">
                    - - - - - - - - - - - [ TEAR HERE ] - - - - - - - - - - -
                  </div>
                  {renderSingleSlip('Shop Copy')}
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
