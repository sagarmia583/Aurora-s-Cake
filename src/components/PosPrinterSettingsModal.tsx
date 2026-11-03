import React, { useState } from 'react';
import { 
  X, 
  Printer, 
  Settings2, 
  Check, 
  Sparkles, 
  FileText, 
  Tag, 
  ChefHat, 
  QrCode, 
  Layers, 
  SlidersHorizontal,
  Plus,
  Trash2
} from 'lucide-react';
import { 
  PosPaperSize, 
  PosReceiptType, 
  PosPrinterSettings, 
  getPosPrinterSettings, 
  savePosPrinterSettings,
  DEFAULT_COMPLIMENTARY_ITEMS
} from '../services/posPrinterService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onTestPrint?: (settings: PosPrinterSettings) => void;
}

export const PosPrinterSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onTestPrint,
}) => {
  const [settings, setSettings] = useState<PosPrinterSettings>(() => getPosPrinterSettings());
  const [savedFeedback, setSavedFeedback] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    savePosPrinterSettings(settings);
    setSavedFeedback(true);
    setTimeout(() => {
      setSavedFeedback(false);
      onClose();
    }, 1000);
  };

  const handleTest = () => {
    const saved = savePosPrinterSettings(settings);
    if (onTestPrint) {
      onTestPrint(saved);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>POS প্রিন্টার কনফিগারেশন ও সেটআপ</span>
                <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">
                  Hardware Ready
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                থার্মাল রসিদ (80mm / 58mm) ও কেক বক্স স্টিকার প্রিন্টার সেটিংস
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {savedFeedback && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-pulse">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>প্রিন্টার সেটিংস সফলভাবে সংরক্ষিত হয়েছে!</span>
          </div>
        )}

        {/* Settings Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto pr-1 space-y-5 text-xs">
          {/* 1. Paper Size Selector */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-rose-600" />
              <span>প্রিন্টার কাগজের সাইজ ও মডেল (Thermal Paper Size)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* 80mm */}
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, paperSize: '80mm' }))}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  settings.paperSize === '80mm'
                    ? 'border-rose-600 bg-rose-50/70 text-rose-950 ring-2 ring-rose-500/20'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between font-black text-xs mb-1">
                    <span>80mm (৩-১/৮")</span>
                    {settings.paperSize === '80mm' && <Check className="w-4 h-4 text-rose-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    স্ট্যান্ডার্ড পিওএস রসিদ (Epson, Sunmi, Xprinter, POS-80)
                  </p>
                </div>
                <span className="text-[9px] mt-2 inline-block font-bold text-rose-700">ডিফল্ট সুপারিশকৃত</span>
              </button>

              {/* 58mm */}
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, paperSize: '58mm' }))}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  settings.paperSize === '58mm'
                    ? 'border-rose-600 bg-rose-50/70 text-rose-950 ring-2 ring-rose-500/20'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between font-black text-xs mb-1">
                    <span>58mm (২-১/৪")</span>
                    {settings.paperSize === '58mm' && <Check className="w-4 h-4 text-rose-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    পোর্টেবল বা মিনি ব্লুটুথ থার্মাল প্রিন্টার (POS-58)
                  </p>
                </div>
                <span className="text-[9px] mt-2 inline-block font-medium text-slate-400">কমপ্যাক্ট স্লিপ</span>
              </button>

              {/* 3x4 Sticker */}
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, paperSize: 'sticker_3x4' }))}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  settings.paperSize === 'sticker_3x4'
                    ? 'border-rose-600 bg-rose-50/70 text-rose-950 ring-2 ring-rose-500/20'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between font-black text-xs mb-1">
                    <span>৩" x ৪" স্টিকার</span>
                    {settings.paperSize === 'sticker_3x4' && <Check className="w-4 h-4 text-rose-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    কেকের বাক্সের গায়ে লাগানোর থার্মাল লেবেল স্টিকার
                  </p>
                </div>
                <span className="text-[9px] mt-2 inline-block font-medium text-purple-700">বক্স লেবেল</span>
              </button>
            </div>
          </div>

          {/* 2. Default Receipt Template */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-rose-600" />
              <span>ডিফল্ট প্রিন্ট ফরম্যাট (Default Template)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label
                onClick={() => setSettings((s) => ({ ...s, defaultReceiptType: 'customer_memo' }))}
                className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer ${
                  settings.defaultReceiptType === 'customer_memo'
                    ? 'border-rose-600 bg-rose-50 text-rose-900 font-bold'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0 text-rose-600" />
                <span className="text-xs">ক্যাশ মেমো (Cash Memo)</span>
              </label>

              <label
                onClick={() => setSettings((s) => ({ ...s, defaultReceiptType: 'box_sticker' }))}
                className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer ${
                  settings.defaultReceiptType === 'box_sticker'
                    ? 'border-rose-600 bg-rose-50 text-rose-900 font-bold'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Tag className="w-4 h-4 shrink-0 text-purple-600" />
                <span className="text-xs">কেক বক্স স্টিকার (Box Label)</span>
              </label>

              <label
                onClick={() => setSettings((s) => ({ ...s, defaultReceiptType: 'kitchen_ticket' }))}
                className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer ${
                  settings.defaultReceiptType === 'kitchen_ticket'
                    ? 'border-rose-600 bg-rose-50 text-rose-900 font-bold'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <ChefHat className="w-4 h-4 shrink-0 text-amber-600" />
                <span className="text-xs">কিচেন টোকেন (Kitchen)</span>
              </label>
            </div>
          </div>

          {/* 3. Toggles & Content Customizations */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <span className="font-bold text-slate-800 block text-xs">
              রসিদে যা যা প্রিন্ট হবে (Print Content Options)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.showShopLogo}
                  onChange={(e) => setSettings((s) => ({ ...s, showShopLogo: e.target.checked }))}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span className="text-slate-700">বেকারি হেডার ও লোগো</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.showShopPhone}
                  onChange={(e) => setSettings((s) => ({ ...s, showShopPhone: e.target.checked }))}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span className="text-slate-700">দোকানের ফোন নম্বর ও ঠিকানা</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.showCakeMessage}
                  onChange={(e) => setSettings((s) => ({ ...s, showCakeMessage: e.target.checked }))}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span className="text-slate-700">কেকের লেখার লেখা (Cake Dedication)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.showBaseSalePrice !== false}
                  onChange={(e) => setSettings((s) => ({ ...s, showBaseSalePrice: e.target.checked }))}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span className="text-slate-700">আইটেমের বেইজ ও সেল প্রাইস (Base + Sale Price)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.showComplimentaryKit}
                  onChange={(e) => setSettings((s) => ({ ...s, showComplimentaryKit: e.target.checked }))}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span className="text-slate-700">ফ্রি ছুরি ও মোমবাতি চেকলিস্ট</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.showWebQr}
                  onChange={(e) => setSettings((s) => ({ ...s, showWebQr: e.target.checked }))}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span className="text-slate-700">🌐 ওয়েবসাইট QR কোড (Online Order & Menu)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.showFacebookQr}
                  onChange={(e) => setSettings((s) => ({ ...s, showFacebookQr: e.target.checked }))}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span className="text-slate-700">📘 ফেসবুক পেজ QR কোড (Review & Chat)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.copiesCount === 2}
                  onChange={(e) => setSettings((s) => ({ ...s, copiesCount: e.target.checked ? 2 : 1 }))}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span className="text-slate-700">এক ক্লিকে ডাবল কপি (শপ + কাস্টমার কপি)</span>
              </label>
            </div>

            {/* Complimentary Kit Editor */}
            {settings.showComplimentaryKit && (
              <div className="pt-3 border-t border-slate-200 space-y-2 text-xs bg-emerald-50/50 p-3 rounded-2xl border border-emerald-200">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950 flex items-center gap-1.5 text-[11px]">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>কমপ্লিমেন্টারি ফ্রি কিট আইটেম এডিট করুন:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        complimentaryKitTitle: 'Complimentary Kit Inside Box:',
                        complimentaryItems: [...DEFAULT_COMPLIMENTARY_ITEMS],
                      }))
                    }
                    className="text-[10px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    ডিফল্ট সেট করুন
                  </button>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium text-[10px] mb-0.5">
                    রিসিট হেডিং টাইটেল:
                  </label>
                  <input
                    type="text"
                    value={settings.complimentaryKitTitle || ''}
                    placeholder="Complimentary Kit Inside Box:"
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, complimentaryKitTitle: e.target.value }))
                    }
                    className="w-full text-xs p-1.5 border border-slate-300 rounded-lg bg-white"
                  />
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="block text-slate-600 font-medium text-[10px]">
                    আইটেমসমূহ (রিসিট ও স্টিকারে আসবে):
                  </label>
                  {(settings.complimentaryItems || DEFAULT_COMPLIMENTARY_ITEMS).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono text-emerald-700">[✓]</span>
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => {
                          const next = [...(settings.complimentaryItems || DEFAULT_COMPLIMENTARY_ITEMS)];
                          next[idx] = e.target.value;
                          setSettings((s) => ({ ...s, complimentaryItems: next }));
                        }}
                        className="flex-1 text-xs p-1.5 border border-slate-300 rounded-lg bg-white"
                        placeholder="যেমন: Free Cake Knife (ছুরি)"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = (settings.complimentaryItems || DEFAULT_COMPLIMENTARY_ITEMS).filter(
                            (_, i) => i !== idx
                          );
                          setSettings((s) => ({ ...s, complimentaryItems: next }));
                        }}
                        className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                        title="মুছুন"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      const current = settings.complimentaryItems || DEFAULT_COMPLIMENTARY_ITEMS;
                      setSettings((s) => ({
                        ...s,
                        complimentaryItems: [...current, ''],
                      }));
                    }}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg flex items-center gap-1 cursor-pointer mt-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>নতুন আইটেম যোগ করুন</span>
                  </button>
                </div>
              </div>
            )}

            {/* Custom URL Links for QR */}
            {(settings.showWebQr || settings.showFacebookQr) && (
              <div className="pt-3 border-t border-slate-200 space-y-2 text-xs">
                <span className="font-bold text-slate-800 block text-[11px]">QR কোড লিংক কনফিগারেশন:</span>
                {settings.showWebQr && (
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">ওয়েবসাইট লিংক (Website URL):</label>
                    <input
                      type="url"
                      value={settings.websiteUrl || ''}
                      placeholder="https://aurorascake.com (ফাঁকা রাখলে বর্তমান ডোমেইন)"
                      onChange={(e) => setSettings((s) => ({ ...s, websiteUrl: e.target.value }))}
                      className="w-full text-xs p-2 border border-slate-300 rounded-xl focus:ring-1 focus:ring-rose-500 outline-none"
                    />
                  </div>
                )}
                {settings.showFacebookQr && (
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">ফেসবুক পেজ লিংক (Facebook URL):</label>
                    <input
                      type="url"
                      value={settings.facebookUrl || 'https://www.facebook.com/aurorascake26'}
                      placeholder="https://www.facebook.com/aurorascake26"
                      onChange={(e) => setSettings((s) => ({ ...s, facebookUrl: e.target.value }))}
                      className="w-full text-xs p-2 border border-slate-300 rounded-xl focus:ring-1 focus:ring-rose-500 outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Hardware Guide */}
          <div className="p-3.5 bg-rose-50/60 rounded-2xl border border-rose-200/80 text-[11px] text-slate-700 space-y-1">
            <strong className="text-rose-900 block font-bold">💡 প্রিন্টার কানেকশন টিপস:</strong>
            <p className="text-slate-600">
              যেকোনো ইউএসবি (USB), ব্লুটুথ (Bluetooth), অথবা নেটওয়ার্ক থার্মাল প্রিন্টারে সরাসরি কাজ করবে।
              প্রিন্ট ডায়ালগে <strong>Margins: None</strong> এবং <strong>Headers and Footers: Unchecked</strong> রাখবেন।
            </p>
          </div>

          {/* Modal Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleTest}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>🖨️ টেস্ট প্রিন্ট করুন (Test Print)</span>
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-4 py-2.5 text-slate-600 hover:bg-slate-100 font-bold rounded-xl cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="submit"
                className="flex-1 sm:flex-initial px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>সেটিংস সেভ করুন (Save)</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
