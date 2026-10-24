import React, { useRef, useState } from 'react';
import { useCakeDialog } from './useCakeDialog';
import { X, Sparkles, Image, CheckCircle, AlertCircle, Send } from 'lucide-react';
import { mockDb } from '../services/mockDatabase';
import { prepareCustomCakeAttempt, submitCustomCake } from '../services/sheetCustomCake';
import type { CustomCakeAttempt } from '../services/sheetCustomCake';

interface CustomCakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: string;
  sheetOrderEndpoint?: string;
}

export const CustomCakeModal: React.FC<CustomCakeModalProps> = (props) =>
  props.isOpen ? <CustomCakeModalDialog {...props} /> : null;

const CustomCakeModalDialog: React.FC<CustomCakeModalProps> = ({
  isOpen,
  onClose,
  currency,
  sheetOrderEndpoint,
}) => {
  const dialogRef = useCakeDialog(onClose);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cakeType, setCakeType] = useState('Theme Birthday Cake');
  const [approxSize, setApproxSize] = useState('1.5kg (Two-Tier)');
  const [flavor, setFlavor] = useState('Belgian Chocolate & Vanilla Marble');
  const [colorTheme, setColorTheme] = useState('Pastel Rose & Gold');
  const [writingText, setWritingText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedReference, setSavedReference] = useState('');
  const attemptRef = useRef<CustomCakeAttempt | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Dynamic estimated price formula for instant customer preview
  const estimatedBase = approxSize.includes('1kg')
    ? 1500
    : approxSize.includes('1.5kg')
    ? 2200
    : approxSize.includes('2kg')
    ? 2900
    : 3800;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitted || isSubmitting) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      setErrorMessage('Please enter your name and contact number.');
      return;
    }
    const phoneDigits = customerPhone.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      setErrorMessage('Please enter a valid contact phone number.');
      return;
    }
    setErrorMessage('');

    if (sheetOrderEndpoint) {
      setIsSubmitting(true);
      try {
        const draft={customer_name:customerName.trim(),customer_phone:customerPhone.trim(),cake_type:cakeType,
          approx_size:approxSize,flavor,color_theme:colorTheme,writing_text:writingText,
          instructions,reference_image_url:imageUrl.trim()};
        const attempt=prepareCustomCakeAttempt(draft,attemptRef.current);
        attemptRef.current=attempt;
        const reference=await submitCustomCake(sheetOrderEndpoint,draft,attempt);
        setSavedReference(reference);
        setIsSubmitted(true);
      } catch(error) { setErrorMessage(error instanceof Error?error.message:'The bakery could not confirm your request. Retry the original form.'); }
      finally { setIsSubmitting(false); }
      return;
    }
    mockDb.addCustomCakeRequest({
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      cake_type: cakeType,
      approx_size: approxSize,
      flavor,
      color_theme: colorTheme,
      writing_text: writingText,
      instructions,
      reference_image_url: imageUrl.trim() || undefined,
      estimated_price: estimatedBase,
    });

    setIsSubmitted(true);

  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="custom-cake-title" data-cake-dialog tabIndex={-1}
        className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-rose-100 overflow-hidden my-6 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 bg-gradient-to-r from-amber-50 via-rose-50 to-pink-50 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 id="custom-cake-title" className="font-bold text-slate-900 text-lg">Your dream cake, imagined</h3>
              <p className="text-xs text-slate-500">Design your bespoke anniversary or birthday cake</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close custom cake studio"
            className="p-1.5 rounded-full hover:bg-white text-slate-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSubmitted ? (
          <div role="status" className="p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl">
              ✓
            </div>
            <h4 className="text-xl font-bold text-slate-900">Your design is saved</h4>
            <p className="text-xs text-slate-600 max-w-xs mx-auto">
              {savedReference ? 'Your request was saved privately to Aurora’s Cake. The bakery will need to review it and confirm a quote; no payment was taken.' : 'This demo request is saved only on this device; it was not sent to the bakery.'}
              {savedReference && <span className="block mt-2 font-mono break-all">Reference: {savedReference}</span>}
            </p>
            <button type="button" onClick={onClose} className="px-6 py-3 rounded-xl bg-rose-600 text-white text-sm font-semibold">Back to the cakes</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4 flex-1 text-xs">
            <p className="bg-rose-50 text-slate-600 p-3 rounded-xl">{sheetOrderEndpoint ? 'Request a real custom cake quotation. The bakery will confirm the design and final price; this is not an order or online payment.' : 'Preview mode: requests stay only on this device.'}</p>
            {errorMessage && <p role="alert" className="text-red-700 bg-red-50 p-3 rounded-xl">{errorMessage}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Your Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Farhana Sultana"
                  aria-label="Your full name" value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mobile Contact</label>
                <input
                  type="tel"
                  required
                  placeholder="017XX-XXXXXX"
                  aria-label="Mobile contact" value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Cake Occasion / Theme</label>
                <select
                  aria-label="Cake occasion" value={cakeType}
                  onChange={(e) => setCakeType(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800 cursor-pointer"
                >
                  <option value="Theme Birthday Cake">Theme Birthday Cake</option>
                  <option value="Multi-Tier Wedding Cake">Multi-Tier Wedding Cake</option>
                  <option value="Anniversary Floral Cake">Anniversary Floral Cake</option>
                  <option value="Baby Shower / Reveal">Baby Shower / Gender Reveal</option>
                  <option value="Corporate Celebration">Corporate Celebration</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Approximate Weight</label>
                <select
                  aria-label="Approximate weight" value={approxSize}
                  onChange={(e) => setApproxSize(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800 cursor-pointer"
                >
                  <option value="1kg (Single Tier)">1kg (Single Tier - Serves 8-10)</option>
                  <option value="1.5kg (Two-Tier)">1.5kg (Two-Tier - Serves 14-16)</option>
                  <option value="2kg (Two-Tier)">2kg (Two-Tier - Serves 20-22)</option>
                  <option value="3kg+ (Grand Three-Tier)">3kg+ (Grand Three-Tier - Serves 35+)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Flavor Preference</label>
                <input
                  type="text"
                  aria-label="Flavor preference" value={flavor}
                  onChange={(e) => setFlavor(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Color Palette & Mood</label>
                <input
                  type="text"
                  aria-label="Color palette" value={colorTheme}
                  onChange={(e) => setColorTheme(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Dedication Text on Cake</label>
              <input
                type="text"
                placeholder="e.g. Happy 1st Birthday Little Prince Aayan 👑"
                aria-label="Dedication text" value={writingText}
                onChange={(e) => setWritingText(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Reference image URL (optional)
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="url" placeholder="https://…" aria-label="Reference image URL"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800 font-mono text-[11px]"
                />
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="w-9 h-9 object-cover rounded-lg border border-slate-200"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Special Chef Instructions</label>
              <textarea
                rows={2}
                placeholder="Sugar flowers, less sweetness, specific topper request..."
                aria-label="Design instructions" value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800"
              />
            </div>

            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 flex items-center justify-between">
              <div>
                <span className="font-bold text-amber-900 block">Estimated Quote Starting At:</span>
                <span className="text-[11px] text-amber-800">Illustrative estimate; a bakery must confirm the price</span>
              </div>
              <div className="text-xl font-black text-amber-900">
                {currency}{estimatedBase}
              </div>
            </div>

            <button
              type="submit" disabled={isSubmitting}
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl shadow-lg shadow-rose-200 flex items-center justify-center gap-2 text-xs transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Sending request…' : sheetOrderEndpoint ? 'Request a custom cake quote' : 'Save my demo design'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
