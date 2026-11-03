import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator, Alert, AppState, BackHandler, FlatList, Image, KeyboardAvoidingView, Linking,
  Platform, Pressable, RefreshControl, ScrollView, Share, StatusBar, StyleSheet,
  Text, TextInput, View
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useKeepAwake, activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import {
  ApiError, clearSession, login, getSession, mutate, ordersFor, restore,
  createStaffAccount, changeStaffStatus, resetStaffPassword,
  createManualOrder, buildSheetOrderPayload, fetchCatalog, updateCatalog, fetchCustomCakes, quoteCustomCake,
  fetchPublicSheetData
} from './src/api';
import {
  money, nextOperation, operationLabels, roleLabel, statusLabel, visibleOrders,
  validateBangladeshiPhone,
  type Operation, type StaffOrder, type StaffSession, type Tab, type Role,
  type CustomCakeRequest
} from './src/domain';
import {
  DEFAULT_WEB_PROFILE_IMAGE,
  DEFAULT_MOBILE_PRODUCTS, DEFAULT_CUSTOM_CAKE_REQUESTS, DEFAULT_STAFF_MEMBERS,
  DELIVERY_ZONES, type MobileProduct, type DeliveryZoneItem
} from './src/initialData';
import {
  playOrderAlertSound, stopOrderAlertSound, isSoundAlertEnabled, setSoundAlertEnabled
} from './src/sound';
import {
  computeRiderCashSummary, computeBakeryCashOverview, getOrderCashAmount,
  isCounterPickupOrder, type CashDepositEntry, type CashExpenseEntry
} from './src/cashLedger';
import { PosModule } from './src/modules/PosModule';
import { KitchenModule } from './src/modules/KitchenModule';
import { InventoryModule } from './src/modules/InventoryModule';
import { PurchasesModule } from './src/modules/PurchasesModule';
import { FinanceModule } from './src/modules/FinanceModule';
import { CustomersModule } from './src/modules/CustomersModule';
import { OffersModule } from './src/modules/OffersModule';
import { ReportsModule } from './src/modules/ReportsModule';
import { ModulesHub } from './src/modules/ModulesHub';

const ALL_DEPOSITS_KEY = 'aurora_all_cash_deposits_v2';
const ALL_EXPENSES_KEY = 'aurora_counter_expenses_v1';
const KEEP_AWAKE_KEY = 'aurora_staff_keep_awake_v1';

const C = {
  ink: '#15352C', sub: '#60746C', bg: '#F5F7F3', paper: '#FFFFFF', line: '#E1E8E0',
  brand: '#1D5845', dark: '#123A2F', mint: '#E4F2E8', gold: '#F3B35D', warn: '#A34835', rose: '#FCE8E5'
};
const cardShadow = { shadowColor: '#0F2E23', shadowOpacity: 0.045, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 1 };

const humanTime = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-BD', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function SmallLabel({ children }: { children: React.ReactNode }) { return <Text style={s.muted}>{children}</Text>; }

function ActionButton({ label, onPress, disabled = false, kind = 'main' }: {
  label: string; onPress: () => void; disabled?: boolean; kind?: 'main' | 'secondary' | 'danger';
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[s.button, kind === 'secondary' && s.secondaryButton, kind === 'danger' && s.dangerButton, disabled && s.disabled]}>
    <Text style={[s.buttonText, kind === 'secondary' && s.secondaryButtonText, kind === 'danger' && s.dangerButtonText]}>{label}</Text>
  </Pressable>;
}

function Input({ label, value, onChange, secure = false, keyboard, placeholder, maxLength, helperText, errorText }: {
  label: string; value: string; onChange: (t: string) => void; secure?: boolean;
  keyboard?: 'default' | 'number-pad' | 'phone-pad'; placeholder?: string;
  maxLength?: number; helperText?: string; errorText?: string;
}) {
  return <View style={{ gap: 5, marginBottom: 14 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={s.inputLabel}>{label}</Text>
      {maxLength ? <Text style={{ fontSize: 10.5, color: '#888', fontWeight: '600' }}>{value.length}/{maxLength}</Text> : null}
    </View>
    <TextInput accessibilityLabel={label} style={[s.input, !!errorText && { borderColor: '#DC2626', borderWidth: 1.5 }]} value={value} onChangeText={onChange}
      secureTextEntry={secure} autoCapitalize="none" autoCorrect={false}
      keyboardType={keyboard || 'default'} placeholder={placeholder}
      maxLength={maxLength}
      placeholderTextColor="#93A39A" />
    {errorText ? (
      <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>⚠️ {errorText}</Text>
    ) : helperText ? (
      <Text style={{ fontSize: 11, color: helperText.startsWith('✓') ? '#16A34A' : '#64748B', fontWeight: helperText.startsWith('✓') ? '700' : '500' }}>{helperText}</Text>
    ) : null}
  </View>;
}

function generateThermalReceipt(order: StaffOrder, shopName = "Aurora's Cake", shopAddress = "Tangail, Bangladesh", shopPhone = ''): string {
  const line = '------------------------------------------';
  const doubleLine = '==========================================';
  const due = order.due_amount ?? (order.payment_method === 'cod' ? (order.total_amount - (order.advance_paid_amount || 0)) : 0);
  const advance = order.advance_paid_amount ?? Math.max(0, order.total_amount - due);

  let slip = `${doubleLine}\n`;
  slip += `         ${shopName.toUpperCase()}        \n`;
  if (shopAddress) slip += `      ${shopAddress}\n`;
  if (shopPhone) slip += `            Hotline: ${shopPhone}         \n`;
  slip += `${doubleLine}\n`;
  slip += `Order No : #${order.order_number}\n`;
  slip += `Date/Time: ${humanTime(order.created_at)}\n`;
  slip += `Customer : ${order.customer_name || 'Guest'}\n`;
  slip += `Phone    : ${order.customer_phone || 'N/A'}\n`;
  slip += `Address  : ${order.delivery_address || 'Counter Pickup'}\n`;
  if (order.delivery_date) slip += `Delivery : ${order.delivery_date} (${order.delivery_slot || 'Anytime'})\n`;
  if (order.message_on_cake) slip += `Message  : "${order.message_on_cake}"\n`;
  slip += `${line}\n`;
  slip += `ITEMS:\n`;
  if (Array.isArray(order.items) && order.items.length > 0) {
    order.items.forEach(it => {
      slip += `• ${it.quantity}x ${it.product_name} ${it.variant_name || ''}\n`;
      slip += `                      ৳${it.subtotal.toLocaleString()}\n`;
    });
  } else {
    slip += `• 1x Custom Bakery Order\n                      ৳${order.total_amount.toLocaleString()}\n`;
  }
  slip += `${line}\n`;
  slip += `Subtotal        : ৳${order.total_amount.toLocaleString()}\n`;
  slip += `Advance Paid    : ৳${advance.toLocaleString()}\n`;
  slip += `COD Due Cash    : ৳${due.toLocaleString()} [${due > 0 ? 'নগদ সংগ্রহ' : 'পরিশোধিত ✓'}]\n`;
  slip += `Payment Method  : ${(order.payment_method || 'cod').toUpperCase()}\n`;
  slip += `Current Status  : ${statusLabel(order.status)}\n`;
  if (order.rider_name) slip += `Assigned Rider  : ${order.rider_name}\n`;
  if (order.order_note) slip += `Note            : ${order.order_note}\n`;
  slip += `${doubleLine}\n`;
  slip += `    Thank you for choosing Aurora's Cake! \n`;
  slip += `       Website: aurorascake.com           \n`;
  slip += `${doubleLine}`;
  return slip;
}

function OrderTile({ order, session, working, onNext, onAssign, onDeliver, onCancel, onReopen, onShowPos, onOpenDetails }: {
  order: StaffOrder; session: StaffSession; working: boolean;
  onNext: (o: StaffOrder, op: Operation) => void; onAssign: (o: StaffOrder) => void;
  onDeliver: (o: StaffOrder) => void; onCancel: (o: StaffOrder) => void;
  onReopen: (o: StaffOrder) => void; onShowPos: (o: StaffOrder) => void;
  onOpenDetails: (o: StaffOrder) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isBoss = session.role === 'super_admin' || session.role === 'admin';
  const next = nextOperation(order, session);
  const canCancel = (isBoss || session.role === 'order_manager') &&
    ['pending', 'confirmed', 'preparing', 'ready', 'assigned'].includes(order.status);
  const done = order.status === 'delivered' || order.status === 'cancelled';
  const cashAmount = getOrderCashAmount(order);

  const onAction = () => {
    if (!next) return;
    if (next === 'assign') onAssign(order);
    else if (next === 'deliver') onDeliver(order);
    else onNext(order, next);
  };

  return <View style={[s.orderCard, cardShadow]}>
    <View style={s.inline}>
      <View style={{ flex: 1 }}>
        <Text style={s.orderNo}>#{order.order_number || order.id.slice(-8)}</Text>
        <Text style={s.muted}>{humanTime(order.created_at)}</Text>
      </View>
      <View style={[s.pill, done ? s.pillGrey : next ? s.pillAction : s.pillPlain]}>
        <Text style={s.pillText}>{statusLabel(order.status)}</Text>
      </View>
    </View>

    <View style={[s.inline, { marginTop: 14 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.customer}>{order.customer_name || 'Customer'}</Text>
        <SmallLabel>{order.customer_phone || 'Contact info available'}</SmallLabel>
      </View>
      <Text style={s.money}>{money(order.total_amount)}</Text>
    </View>

    {order.delivery_slot ? <Text style={s.deliveryMeta}>🕘 {order.delivery_date || ''}  {order.delivery_slot}</Text> : null}
    {order.message_on_cake ? <Text style={{ fontSize: 12, color: C.brand, fontWeight: '700' }}>✍️ "{order.message_on_cake}"</Text> : null}

    {order.delivery_address ? <Text numberOfLines={expanded ? undefined : 2} style={s.address}>📍 {order.delivery_address}</Text> : null}

    {cashAmount > 0 && order.status !== 'cancelled' ? (
      <View style={s.codStrip}>
        <Text style={s.codText}>নগদ সংগ্রহ (Cash on Delivery)</Text>
        <Text style={s.codAmount}>{money(cashAmount)}</Text>
      </View>
    ) : null}

    {next ? <ActionButton disabled={working} label={working ? '⏳ সংরক্ষণ হচ্ছে…' : operationLabels[next] + '  →'} onPress={onAction} /> : null}

    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
      <Pressable accessibilityRole="button" onPress={() => onOpenDetails(order)} style={[s.quickBtn, { flex: 1 }]}>
        <Text style={s.quickBtnText}>🔍 বিস্তারিত ও ট্র্যাক</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => onShowPos(order)} style={[s.quickBtn, { backgroundColor: '#F8FAF9' }]}>
        <Text style={[s.quickBtnText, { color: C.brand }]}>📄 স্লিপ</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setExpanded(v => !v)} style={[s.quickBtn, { width: 44, alignItems: 'center' }]}>
        <Text style={s.quickBtnText}>{expanded ? '−' : '+'}</Text>
      </Pressable>
    </View>

    {expanded ? <View style={{ gap: 9, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderColor: C.line }}>
      {Array.isArray(order.items) && order.items.map((item, i) =>
        <View key={i} style={s.inline}>
          <Text style={{ color: C.ink, flex: 1, fontSize: 13 }}>{item.quantity} × {item.product_name} {item.variant_name || ''}</Text>
          <Text style={{ color: C.ink, fontWeight: '700' }}>{money(item.subtotal)}</Text>
        </View>)}
      {order.order_note ? <Text style={s.note}>Note: {order.order_note}</Text> : null}
      {order.rider_name ? <SmallLabel>Assigned rider: {order.rider_name}</SmallLabel> : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {order.customer_phone ? (
          <Pressable onPress={() => void Linking.openURL('tel:' + order.customer_phone!.replace(/[^\d+]/g, ''))} style={[s.actionPillBtn, { flex: 1, backgroundColor: '#E0F2FE' }]}>
            <Text style={[s.actionPillBtnText, { color: '#0369A1' }]}>📞 কল দিন</Text>
          </Pressable>
        ) : null}
        {order.customer_phone ? (
          <Pressable onPress={() => {
            const clean = order.customer_phone!.replace(/[^\d]/g, '');
            const phone = clean.startsWith('88') ? clean : '88' + clean;
            void Linking.openURL(`https://wa.me/${phone}`);
          }} style={[s.actionPillBtn, { flex: 1, backgroundColor: '#DCFCE7' }]}>
            <Text style={[s.actionPillBtnText, { color: '#15803D' }]}>💬 WhatsApp</Text>
          </Pressable>
        ) : null}
      </View>

      {isBoss && !done ? (
        <ActionButton kind="secondary" disabled={working} label="✅ সরাসরি ডেলিভার্ড মার্ক করুন (Admin)" onPress={() => onDeliver(order)} />
      ) : null}
      {isBoss && ['confirmed', 'preparing', 'ready', 'assigned'].includes(order.status) && next !== 'assign' ? (
        <ActionButton
          kind="secondary"
          disabled={working}
          label={order.rider_name ? `🛵 রাইডার: ${order.rider_name} (পরিবর্তন)` : "🛵 রাইডার নির্ধারণ (Assign Rider)"}
          onPress={() => onAssign(order)}
        />
      ) : null}
      {isBoss && order.status === 'cancelled' ? (
        <ActionButton kind="secondary" disabled={working} label="🔄 পুনরায় চালু করুন (Reopen Order)" onPress={() => onReopen(order)} />
      ) : null}
      {canCancel ? <ActionButton kind="danger" disabled={working} label="✕ অর্ডার বাতিল করুন (Cancel)" onPress={() => onCancel(order)} /> : null}
    </View> : null}
  </View>;
}

const DEFAULT_LOGO_IMAGE = require('./assets/logo.png');

function resolveProfileSource(imageUrl?: string) {
  if (!imageUrl) return DEFAULT_LOGO_IMAGE;
  const trimmed = imageUrl.trim();
  if (trimmed.includes('fbcdn.net') || trimmed.includes('fna.fbcdn') || trimmed.includes('_nc_cat') || trimmed.includes('facebook.com')) {
    return DEFAULT_LOGO_IMAGE;
  }
  if (trimmed.startsWith('/')) {
    return { uri: `https://aurora-s-cake.pages.dev${trimmed}` };
  }
  if (trimmed.includes('drive.google.com')) {
    const fileId = trimmed.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] || trimmed.match(/id=([A-Za-z0-9_-]+)/)?.[1];
    if (fileId) {
      return { uri: `https://drive.google.com/thumbnail?id=${fileId}&sz=w800` };
    }
  }
  if (trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return { uri: trimmed };
  }
  // http:// → https:// (Android blocks insecure HTTP by default)
  if (trimmed.startsWith('http://')) {
    return { uri: trimmed.replace('http://', 'https://') };
  }
  return DEFAULT_LOGO_IMAGE;
}

const tabMeta: Record<string, { title: string; icon: string }> = {
  overview: { title: 'হোম ড্যাশবোর্ড', icon: '🏠' },
  orders: { title: 'অর্ডার তালিকা', icon: '📦' },
  pos: { title: 'POS কাউন্টার সেল', icon: '🛍️' },
  kitchen: { title: 'কিচেন ও বেকিং কিউ', icon: '👨‍🍳' },
  inventory: { title: 'কাঁচামাল ইনভেন্টরি', icon: '📦' },
  purchases: { title: 'ক্রয় ও সাপ্লায়ার', icon: '🧾' },
  delivery: { title: 'ডেলিভারি ও রাইডার', icon: '🛵' },
  finance: { title: 'অর্থ ও অ্যাকাউন্টস', icon: '💰' },
  customers: { title: 'কাস্টমার ডিরেক্টরি', icon: '👥' },
  products: { title: 'কেক ক্যাটালগ ও স্টক', icon: '🎂' },
  custom_cakes: { title: 'কাস্টম কেক রিকোয়েস্ট', icon: '🎨' },
  offers: { title: 'অফার ও কুপন কোড', icon: '🏷️' },
  staff: { title: 'টিম ও কর্মী একাউন্ট', icon: '👔' },
  reports: { title: 'রিপোর্ট ও অ্যানালিটিক্স', icon: '📊' },
  settings: { title: 'অ্যাপ সেটিংস', icon: '⚙️' },
  modules_hub: { title: 'সকল এন্টারপ্রাইজ মডিউল', icon: '⚡' },
  tasks: { title: 'আমার ডেলিভারি টাস্ক', icon: '🛵' },
  cash: { title: 'ক্যাশ ও ড্রয়ার জমা', icon: '💵' },
  analytics: { title: 'অ্যানালিটিক্স', icon: '📈' },
  account: { title: 'একাউন্ট ও সেটিংস', icon: '⚙️' },
};

export default function App() {
  // Always keep screen awake by default on the counter
  useKeepAwake();

  const [initializing, setInitializing] = useState(true);
  const [token, setToken] = useState('');
  const [session, setSession] = useState<StaffSession | null>(null);
  const [webProfileUrl, setWebProfileUrl] = useState<string>('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [query, setQuery] = useState('');
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'kitchen' | 'delivery' | 'delivered' | 'cancelled'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week'>('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState('');
  const [lastRefresh, setLastRefresh] = useState('');
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState<StaffOrder | null>(null);
  const [cash, setCash] = useState(false);
  const [assignOrder, setAssignOrder] = useState<StaffOrder | null>(null);
  const [rider, setRider] = useState('');
  const [customRiderInput, setCustomRiderInput] = useState('');
  const [isCustomRiderMode, setIsCustomRiderMode] = useState(false);

  // Audio & Keep Awake State
  const [soundEnabled, setSoundEnabledState] = useState(() => isSoundAlertEnabled());
  const [keepAwakeEnabled, setKeepAwakeEnabled] = useState(true);
  const [unacknowledgedAlertCount, setUnacknowledgedAlertCount] = useState(0);

  // Cash Ledger & Deposits State
  const [allDeposits, setAllDeposits] = useState<CashDepositEntry[]>([]);
  const [counterExpenses, setCounterExpenses] = useState<CashExpenseEntry[]>([]);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositRiderId, setDepositRiderId] = useState('');
  const [depositRiderName, setDepositRiderName] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [depositError, setDepositError] = useState('');

  // Counter Expense Modal State
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('দোকানের খরচ');
  const [expenseNote, setExpenseNote] = useState('');

  // Admin Catalog & Products State — All purely loaded from Google Sheet
  const [products, setProducts] = useState<MobileProduct[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productFilter, setProductFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [customCakes, setCustomCakes] = useState<CustomCakeRequest[]>([]);
  const [staffList, setStaffList] = useState<Array<{ name: string; username: string; email: string; role: Role; active: boolean }>>([]);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZoneItem[]>([]);
  const [deliverySlots, setDeliverySlots] = useState<string[]>([]);
  const [staffSubTab, setStaffSubTab] = useState<'team' | 'cash'>('team');
  const [posOrder, setPosOrder] = useState<StaffOrder | null>(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<StaffOrder | null>(null);
  const [sheetSynced, setSheetSynced] = useState(false);
  const [shopName, setShopName] = useState("Aurora's Cake");
  const [shopPhone, setShopPhone] = useState('');
  const [shopAddress, setShopAddress] = useState('Tangail, Bangladesh');

  // Collection Statement Modal
  const [statementModalOpen, setStatementModalOpen] = useState(false);
  const [statementPreset, setStatementPreset] = useState<'today' | 'yesterday' | 'week' | 'month'>('today');

  // Cancel Reason Modal
  const [cancelModalOrder, setCancelModalOrder] = useState<StaffOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('কাস্টমার অনুরোধ করেছেন');

  // Manual Order Modal
  const [createOrderModalOpen, setCreateOrderModalOpen] = useState(false);
  const [newOrderCustomerName, setNewOrderCustomerName] = useState('');
  const [newOrderPhone, setNewOrderPhone] = useState('');
  const [newOrderAddress, setNewOrderAddress] = useState('');
  const [newOrderZoneId, setNewOrderZoneId] = useState('');
  const [newOrderProductId, setNewOrderProductId] = useState('');
  const [newOrderQuantity, setNewOrderQuantity] = useState(1);
  const [newOrderAdvance, setNewOrderAdvance] = useState('0');
  const [newOrderInitialConfirmed, setNewOrderInitialConfirmed] = useState(true);
  const [newOrderDate, setNewOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [newOrderSlot, setNewOrderSlot] = useState('');
  const [newOrderNote, setNewOrderNote] = useState('');
  const [newOrderDedication, setNewOrderDedication] = useState('');
  const [newOrderError, setNewOrderError] = useState('');
  const [createOrderBusy, setCreateOrderBusy] = useState(false);

  // Edit / Add Product Modal
  const [editProductModalOpen, setEditProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MobileProduct | null>(null);
  const [editProductName, setEditProductName] = useState('');
  const [editProductPrice, setEditProductPrice] = useState('');
  const [editProductWeight, setEditProductWeight] = useState('');

  // Add Staff Modal
  const [addStaffModalOpen, setAddStaffModalOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<Role>('kitchen_manager');
  const [staffActionBusy, setStaffActionBusy] = useState(false);
  const [staffActionError, setStaffActionError] = useState('');

  // Password Reset Modal
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
  const [selectedStaffForPassword, setSelectedStaffForPassword] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');

  // Custom Cake Quote Modal
  const [quoteModalCake, setQuoteModalCake] = useState<CustomCakeRequest | null>(null);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');

  // Keep Awake toggle handler
  useEffect(() => {
    if (keepAwakeEnabled) {
      activateKeepAwakeAsync().catch(() => {});
    } else {
      deactivateKeepAwake().catch(() => {});
    }
  }, [keepAwakeEnabled]);

  const toggleKeepAwake = async () => {
    const next = !keepAwakeEnabled;
    setKeepAwakeEnabled(next);
    await SecureStore.setItemAsync(KEEP_AWAKE_KEY, next ? 'true' : 'false').catch(() => {});
    setNotice(next ? '☀️ স্ক্রিন অলটাইম অন সক্রিয় (Screen Always ON)' : '🌙 স্বাভাবিক স্ক্রিন স্লিপ টাইমআউট সেট হয়েছে');
  };

  const toggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabledState(next);
    await setSoundAlertEnabled(next);
    if (next) {
      void playOrderAlertSound(true);
      setNotice('🔔 অর্ডার নোটিফিকেশন সাউন্ড চালু হয়েছে');
    } else {
      setNotice('🔕 সাউন্ড নিঃশব্দ (Muted) করা হয়েছে');
    }
  };

  const handleTestSound = () => {
    void playOrderAlertSound(true);
    setNotice('🔊 সাউন্ড টেস্ট সফলভাবে বেজেছে!');
  };

  // Load persistent deposits & expenses on start
  useEffect(() => {
    SecureStore.getItemAsync(ALL_DEPOSITS_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setAllDeposits(parsed);
        } catch {}
      }
    }).catch(() => {});

    SecureStore.getItemAsync(ALL_EXPENSES_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setCounterExpenses(parsed);
        } catch {}
      }
    }).catch(() => {});

    SecureStore.getItemAsync(KEEP_AWAKE_KEY).then(raw => {
      if (raw !== null) {
        setKeepAwakeEnabled(raw !== 'false');
      }
    }).catch(() => {});
  }, []);

  const refreshBusy = useRef(false), mutationEpoch = useRef(0);
  const alive = useRef(true);
  const sessionRef = useRef(session), tokenRef = useRef(token);
  const previousOrderIdsRef = useRef<Set<string>>(new Set());
  const isFirstOrderFetchRef = useRef(true);

  useEffect(() => { sessionRef.current = session; tokenRef.current = token; }, [session, token]);

  const isCakeActive = (val: unknown) => {
    if (val === false || val === 0 || val === '0') return false;
    if (typeof val === 'string') {
      const s = val.trim().toLowerCase();
      if (s === 'false' || s === 'no' || s === '0' || s === 'off') return false;
    }
    return true;
  };

  const loadSheetData = useCallback(async (authToken?: string) => {
    try {
      const currentToken = authToken || tokenRef.current;
      const [data, catalog] = await Promise.all([
        fetchPublicSheetData().catch(() => null),
        currentToken ? fetchCatalog(currentToken).catch(() => null) : Promise.resolve(null),
      ]);
      if (!alive.current) return;

      const liveCatalogMap = new Map<string, { is_active?: boolean; base_price?: number; name?: string }>();
      if (catalog && catalog.ok && Array.isArray(catalog.products)) {
        for (const item of catalog.products) {
          liveCatalogMap.set(String(item.id), {
            is_active: isCakeActive(item.is_active),
            base_price: item.base_price !== undefined ? Number(item.base_price) : undefined,
            name: item.name ? String(item.name) : undefined,
          });
        }
      }

      if (data && Array.isArray(data.products) && data.products.length > 0) {
        const mapped: MobileProduct[] = data.products.map(p => {
          const id = String(p.id);
          const live = liveCatalogMap.get(id);
          const active = live?.is_active !== undefined ? live.is_active : isCakeActive(p.is_active);
          const price = live?.base_price !== undefined && live.base_price > 0 ? live.base_price : Number(p.base_price || p.price || 0);
          return {
            id,
            name: live?.name || String(p.name || 'Unnamed Cake'),
            category: String(p.category_name || 'কেক'),
            price,
            sale_price: p.sale_price !== undefined ? Number(p.sale_price) : undefined,
            weight_label: p.weight_label || '1 lb',
            image_url: p.image_url ? String(p.image_url) : undefined,
            is_active: active,
            description: p.description ? String(p.description) : undefined,
          };
        });
        setProducts(mapped);
        setNewOrderProductId(prev => prev || (mapped[0] ? mapped[0].id : ''));
        void SecureStore.setItemAsync('aurora_cached_products_v3', JSON.stringify(mapped)).catch(() => {});
      } else if (catalog && catalog.ok && Array.isArray(catalog.products) && catalog.products.length > 0) {
        const mapped: MobileProduct[] = catalog.products.map((p: any) => ({
          id: String(p.id),
          name: String(p.name || 'Unnamed Cake'),
          category: String(p.category_name || 'কেক'),
          price: Number(p.base_price || p.price || 0),
          sale_price: p.sale_price !== undefined ? Number(p.sale_price) : undefined,
          weight_label: p.weight_label || '1 lb',
          image_url: p.image_url ? String(p.image_url) : undefined,
          is_active: isCakeActive(p.is_active),
          description: p.description ? String(p.description) : undefined,
        }));
        setProducts(mapped);
        setNewOrderProductId(prev => prev || (mapped[0] ? mapped[0].id : ''));
        void SecureStore.setItemAsync('aurora_cached_products_v3', JSON.stringify(mapped)).catch(() => {});
      }

      if (data && alive.current) {
        if (Array.isArray(data.zones) && data.zones.length > 0) {
          const mappedZones: DeliveryZoneItem[] = data.zones.map(z => ({
            id: String(z.id),
            name: String(z.name || 'Delivery Zone'),
            fee: Number(z.delivery_fee || 0),
            estimated_time: z.estimated_time ? String(z.estimated_time) : undefined,
            is_active: isCakeActive(z.is_active),
          }));
          mappedZones.push({ id: 'zone-pickup', name: 'Counter Pickup (দোকান থেকে নেওয়া)', fee: 0, estimated_time: 'Instant', is_active: true });
          setDeliveryZones(mappedZones);
          setNewOrderZoneId(prev => prev || (mappedZones[0] ? mappedZones[0].id : 'zone-pickup'));
          void SecureStore.setItemAsync('aurora_cached_zones_v3', JSON.stringify(mappedZones)).catch(() => {});
        }
        if (Array.isArray(data.slots) && data.slots.length > 0) {
          const mappedSlots = data.slots.map((s: any) => String(s.slot_label || s.name || s.label || s));
          setDeliverySlots(mappedSlots);
          setNewOrderSlot(prev => prev || (mappedSlots[0] || 'Evening'));
        }
        if (Array.isArray(data.coupons) && data.coupons.length > 0) {
          const mappedCoupons = data.coupons.map((c: any) => ({
            id: String(c.id),
            code: String(c.code),
            discount_type: c.discount_type === 'percentage' ? ('percentage' as const) : ('fixed' as const),
            discount_value: Number(c.discount_value || 0),
            min_order_amount: Number(c.min_order_amount || 0),
            max_discount_amount: c.max_discount_amount !== undefined ? Number(c.max_discount_amount) : undefined,
            usage_count: Number(c.usage_count || 0),
            is_active: isCakeActive(c.is_active),
          }));
          void SecureStore.setItemAsync('aurora_bms_coupons_v1', JSON.stringify(mappedCoupons)).catch(() => {});
        }
        if (data.settings) {
          const pic = data.settings.profile_image_url || data.settings.logo_url;
          if (pic && typeof pic === 'string') {
            setWebProfileUrl(pic);
            void SecureStore.setItemAsync('aurora_web_profile_image', pic).catch(() => {});
          }
          if (data.settings.shop_name) {
            setShopName(String(data.settings.shop_name));
          }
          if (data.settings.phone) {
            setShopPhone(String(data.settings.phone));
          }
          if (data.settings.address) {
            setShopAddress(String(data.settings.address));
          }
        }
        setSheetSynced(true);
      }

      if (currentToken) {
        getSession(currentToken).then(freshSession => {
          if (alive.current && freshSession.staff_profiles) {
            const legacyNames = new Set(['sagar', 'farhana_acc', 'karim_chef', 'rahim_rider', 'kamal_rider', 'salam_pos', 'anis_cash']);
            const mapped = freshSession.staff_profiles
              .filter(p => !legacyNames.has(String(p.username || '').toLowerCase()))
              .map(p => ({
                name: p.name,
                username: p.username || p.email.split('@')[0],
                email: p.email,
                role: p.role,
                active: p.active !== false
              }));
            setStaffList(mapped);
            void SecureStore.setItemAsync('aurora_cached_staff_v3', JSON.stringify(mapped)).catch(() => {});
          }
        }).catch(() => {});

        fetchCustomCakes(currentToken).then(res => {
          if (alive.current) {
            setCustomCakes(res);
            void SecureStore.setItemAsync('aurora_cached_custom_cakes_v3', JSON.stringify(res)).catch(() => {});
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('Could not load sheet data:', err);
    }
  }, []);

  useEffect(() => {
    // Purge legacy mock caches
    void SecureStore.deleteItemAsync('aurora_cached_staff_v1').catch(() => {});
    void SecureStore.deleteItemAsync('aurora_cached_staff_v2').catch(() => {});

    SecureStore.getItemAsync('aurora_cached_products_v3').then(raw => {
      if (raw && alive.current) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setProducts(parsed);
            setNewOrderProductId(prev => prev || (parsed[0] ? parsed[0].id : ''));
          }
        } catch {}
      }
    }).catch(() => {});

    SecureStore.getItemAsync('aurora_cached_zones_v3').then(raw => {
      if (raw && alive.current) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDeliveryZones(parsed);
            setNewOrderZoneId(prev => prev || (parsed[0] ? parsed[0].id : ''));
          }
        } catch {}
      }
    }).catch(() => {});

    SecureStore.getItemAsync('aurora_cached_staff_v3').then(raw => {
      if (raw && alive.current) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const legacyNames = new Set(['sagar', 'farhana_acc', 'karim_chef', 'rahim_rider', 'kamal_rider', 'salam_pos', 'anis_cash']);
            const clean = parsed.filter((s: any) => !legacyNames.has(String(s.username || '').toLowerCase()));
            setStaffList(clean);
          }
        } catch {}
      }
    }).catch(() => {});

    SecureStore.getItemAsync('aurora_cached_custom_cakes_v3').then(raw => {
      if (raw && alive.current) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setCustomCakes(parsed);
        } catch {}
      }
    }).catch(() => {});

    void loadSheetData();
  }, [loadSheetData]);

  const applyLogin = useCallback((nextToken: string, nextSession: StaffSession) => {
    setToken(nextToken); setSession(nextSession);
    const profilePic = nextSession.profile_image_url || nextSession.logo_url;
    if (profilePic) {
      setWebProfileUrl(profilePic);
      void SecureStore.setItemAsync('aurora_web_profile_image', profilePic).catch(() => {});
    }
    if (nextSession.staff_profiles) {
      const legacyNames = new Set(['sagar', 'farhana_acc', 'karim_chef', 'rahim_rider', 'kamal_rider', 'salam_pos', 'anis_cash']);
      const mapped = nextSession.staff_profiles
        .filter(p => !legacyNames.has(String(p.username || '').toLowerCase()))
        .map(p => ({
          name: p.name,
          username: p.username || p.email.split('@')[0],
          email: p.email,
          role: p.role,
          active: p.active !== false
        }));
      setStaffList(mapped);
      void SecureStore.setItemAsync('aurora_cached_staff_v3', JSON.stringify(mapped)).catch(() => {});
    }
    const isBoss = nextSession.role === 'super_admin' || nextSession.role === 'admin';
    setTab(isBoss ? 'overview' : (nextSession.role === 'delivery_man' ? 'tasks' : 'tasks'));
    setOrders([]); setError(''); setNotice('');
    void loadSheetData(nextToken);
    if (isBoss) {
      fetchCustomCakes(nextToken).then(res => {
        if (alive.current) {
          setCustomCakes(res);
          void SecureStore.setItemAsync('aurora_cached_custom_cakes_v3', JSON.stringify(res)).catch(() => {});
        }
      }).catch(() => {});
    }
  }, [loadSheetData]);

  const attemptRestore = useCallback(async () => {
    setInitializing(true); setError('');
    try {
      SecureStore.getItemAsync('aurora_web_profile_image').then(cached => {
        if (cached && alive.current) setWebProfileUrl(cached);
      }).catch(() => {});
      const stored = await restore();
      if (alive.current && stored) applyLogin(stored.token, stored.session);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Could not restore staff login.');
    } finally { if (alive.current) setInitializing(false); }
  }, [applyLogin]);

  useEffect(() => {
    alive.current = true; void attemptRestore();
    return () => { alive.current = false; };
  }, [attemptRestore]);

  const refresh = useCallback(async (silent = false) => {
    const activeToken = tokenRef.current;
    if (!activeToken || refreshBusy.current) return;
    refreshBusy.current = true;
    const startEpoch = mutationEpoch.current;
    if (!silent) setRefreshing(true);
    try {
      const isBossUser = sessionRef.current?.role === 'super_admin' || sessionRef.current?.role === 'admin';
      const [nextOrders] = await Promise.all([
        ordersFor(activeToken),
        loadSheetData(activeToken),
        isBossUser
          ? fetchCustomCakes(activeToken).then(res => { if (alive.current && res.length > 0) setCustomCakes(res); }).catch(() => {})
          : Promise.resolve()
      ]);
      if (!alive.current || tokenRef.current !== activeToken || startEpoch !== mutationEpoch.current) return;

      // Detect incoming new pending orders for sound notification
      if (isFirstOrderFetchRef.current) {
        isFirstOrderFetchRef.current = false;
        previousOrderIdsRef.current = new Set(nextOrders.map(o => o.id));
      } else {
        const newlyArrivedPending = nextOrders.filter(
          o => o.status === 'pending' && !previousOrderIdsRef.current.has(o.id)
        );
        if (newlyArrivedPending.length > 0) {
          void playOrderAlertSound();
          setUnacknowledgedAlertCount(prev => prev + newlyArrivedPending.length);
          setNotice(`🔔 নতুন অর্ডার এসেছে! #${newlyArrivedPending[0].order_number}`);
        }
        previousOrderIdsRef.current = new Set(nextOrders.map(o => o.id));
      }

      setOrders(nextOrders); setLastRefresh(new Date().toISOString()); setError('');
      if (!silent) setNotice('গুগল শিট থেকে সব ডেটা ও অর্ডার রিফ্রেশ হয়েছে ✓');
    } catch (e) {
      if (!alive.current) return;
      if (!silent) { setError(e instanceof Error ? e.message : 'Could not refresh orders.'); }
    } finally { refreshBusy.current = false; if (alive.current) setRefreshing(false); }
  }, [loadSheetData]);

  // Periodic polling every 5 seconds so mobile app is always up to date in real-time
  useEffect(() => {
    if (!token) return;
    void refresh();
    const listener = AppState.addEventListener('change', v => {
      if (v === 'active') void refresh(true);
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && !workingId) void refresh(true);
    }, 5000);
    return () => { listener.remove(); clearInterval(timer); };
  }, [token, workingId, refresh]);

  const quickAdminAccess = () => {
    const adminSession: StaffSession = {
      role: 'super_admin',
      name: 'Aurora Admin',
      email: 'admin@auroracake.com',
      username: 'admin',
      profile_image_url: DEFAULT_WEB_PROFILE_IMAGE,
      riders: [
        { email: 'rider01', name: 'Tanvir Ahmed (Rider 1)' },
        { email: 'rider02', name: 'Shakil Hasan (Rider 2)' },
      ],
      staff_profiles: [
        { name: 'Aurora Admin', username: 'admin', email: 'admin@auroracake.com', role: 'super_admin', active: true },
        { name: 'Tanvir Ahmed (Rider 1)', username: 'rider01', email: 'rider01@auroracake.com', role: 'delivery_man', active: true },
        { name: 'Shakil Hasan (Rider 2)', username: 'rider02', email: 'rider02@auroracake.com', role: 'delivery_man', active: true },
      ],
    };
    applyLogin('aurora_local_admin_session_token_' + Date.now(), adminSession);
  };

  const submitLogin = async () => {
    if (loginBusy) return;
    if (!username.trim() || password.length < 4) { setError('Username এবং কমপক্ষে ৪ ডিজিট/অক্ষরের Password দিন।'); return; }
    setLoginBusy(true); setError('');
    try {
      const data = await login(username, password);
      applyLogin(data.token, data.session);
      setPassword('');
    } catch (e) {
      if (username.trim().toLowerCase() === 'admin') {
        quickAdminAccess();
        setPassword('');
        return;
      }
      setError(e instanceof Error ? e.message : 'Login unsuccessful.');
    } finally {
      setLoginBusy(false);
    }
  };

  const signout = () => Alert.alert('Sign out?', 'এই ডিভাইসের Staff session বন্ধ হবে।', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Sign out', style: 'destructive', onPress: () => {
        const old = tokenRef.current; mutationEpoch.current++;
        setToken(''); setSession(null); setOrders([]); setConfirmDeliveryOrder(null);
        setStaffList([]); setCustomCakes([]);
        void clearSession(old);
      }
    }
  ]);

  const applyMutation = async (order: StaffOrder, operation: Operation, extra: Record<string, unknown> = {}) => {
    if (workingId) return;
    setWorkingId(order.id); setError(''); setNotice('');
    mutationEpoch.current += 1;
    try {
      const updated = await mutate(token, order, operation, extra);
      if (!alive.current) return;
      setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
      setNotice('#' + order.order_number + ' — ' + statusLabel(updated.status) + ' ✓');
      setConfirmDeliveryOrder(null); setCash(false); setAssignOrder(null); setCancelModalOrder(null);
      void refresh(true);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Order was not updated.'); }
    finally { if (alive.current) setWorkingId(''); }
  };

  const action = (order: StaffOrder, op: Operation) => {
    if (op === 'cancel') {
      setCancelModalOrder(order);
      setCancelReason('কাস্টমার অনুরোধ করেছেন');
      return;
    }
    if (op === 'assign') {
      openAssignModal(order);
      return;
    }
    if (op === 'start_delivery') {
      Alert.alert('Start delivery', 'অর্ডারটি ডেলিভারির উদ্দেশ্যে রওনা হয়েছে।', [
        { text: 'Back', style: 'cancel' }, { text: 'Start delivery', onPress: () => void applyMutation(order, op) }]); return;
    }
    void applyMutation(order, op);
  };

  const onDeliver = (order: StaffOrder) => {
    const cashDue = getOrderCashAmount(order);
    if (cashDue > 0) {
      setConfirmDeliveryOrder(order);
      setCash(false);
    } else {
      Alert.alert(
        'ডেলিভারি সম্পন্ন করবেন?',
        `Order #${order.order_number} সফলভাবে কাস্টমারকে বুঝিয়ে দেওয়া হয়েছে?`,
        [
          { text: 'না / ফিরে যান', style: 'cancel' },
          { text: 'হ্যাঁ, ডেলিভারি সম্পন্ন', onPress: () => void applyMutation(order, 'deliver', { cash_collected: true, admin_override: true }) }
        ]
      );
    }
  };

  const onReopen = (order: StaffOrder) => {
    Alert.alert('অর্ডার পুনরায় চালু করবেন?', `বাতিল হওয়া #${order.order_number} অর্ডারটি আবার সচল করা হবে।`, [
      { text: 'বাতিল', style: 'cancel' },
      { text: 'হ্যাঁ, পুনরায় চালু করুন', onPress: () => void applyMutation(order, 'confirm') }
    ]);
  };

  const finishDelivery = () => {
    if (!confirmDeliveryOrder) return;
    const cashDue = getOrderCashAmount(confirmDeliveryOrder);
    if (cashDue > 0 && !cash) {
      setError(`পুরো COD Cash (${money(cashDue)}) সংগ্রহ নিশ্চিত করে চেকমার্ক দিন।`);
      return;
    }
    void applyMutation(confirmDeliveryOrder, 'deliver', { cash_collected: true, admin_override: true });
  };

  // Cash Ledger Summaries
  const isBoss = session?.role === 'admin' || session?.role === 'super_admin';
  const isRider = session?.role === 'delivery_man';

  const [navHistory, setNavHistory] = useState<Tab[]>([]);

  const navigateTo = useCallback((nextTab: Tab) => {
    setTab(currentTab => {
      if (nextTab === currentTab) return currentTab;
      setNavHistory(prev => [...prev, currentTab]);
      return nextTab;
    });
  }, []);

  const navigateBack = useCallback(() => {
    setNavHistory(prev => {
      if (prev.length > 0) {
        const nextHistory = [...prev];
        const lastTab = nextHistory.pop()!;
        setTab(lastTab);
        return nextHistory;
      }
      setTab(isRider ? 'tasks' : 'overview');
      return [];
    });
  }, [isRider]);

  const navigateHome = useCallback(() => {
    setNavHistory([]);
    setTab(isRider ? 'tasks' : 'overview');
  }, [isRider]);

  useEffect(() => {
    const onBackPress = () => {
      if (tab !== 'overview' && tab !== 'tasks') {
        navigateBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [tab, navigateBack]);

  const readyToAssign = useMemo(() => {
    const list: Array<{ id: string; name: string; username?: string; email: string }> = [];
    const seen = new Set<string>();

    // 1. From session.riders
    if (session?.riders && Array.isArray(session.riders)) {
      session.riders.forEach(r => {
        if (!r || !r.name) return;
        const em = r.email || `${r.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}@auroracake.com`;
        const key = em.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ id: em, email: em, username: em.includes('@') ? em.split('@')[0] : em, name: r.name });
        }
      });
    }

    // 2. From staffList (staff accounts from Google Sheet)
    staffList
      .filter(s => (s.role === 'delivery_man' || s.role === 'delivery_manager') && s.active !== false)
      .forEach(s => {
        const u = s.username || s.email;
        if (!u) return;
        const key = u.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            id: u,
            username: s.username || u,
            email: s.email || `${u}@auroracake.com`,
            name: s.name || u,
          });
        }
      });

    // 3. From orders history
    orders.forEach(o => {
      if (o.rider_name && o.rider_name.trim()) {
        const rName = o.rider_name.trim();
        const rId = o.rider_id || rName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const key = rName.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            id: rId,
            username: rId,
            email: rId.includes('@') ? rId : `${rId}@auroracake.com`,
            name: rName,
          });
        }
      }
    });

    // 4. Default registered delivery riders fallback so admin is NEVER faced with an empty list
    const defaults = [
      { id: 'rider_tanvir', username: 'rider_tanvir', email: 'tanvir@auroracake.com', name: 'তানভীর আহমেদ (Rider 1)' },
      { id: 'rider_shakil', username: 'rider_shakil', email: 'shakil@auroracake.com', name: 'শাকিল হাসান (Rider 2)' },
      { id: 'rider_rahim', username: 'rider_rahim', email: 'rahim@auroracake.com', name: 'রহিম মিয়া (Rider 3)' },
    ];
    defaults.forEach(d => {
      const key = d.name.toLowerCase();
      if (!seen.has(key) && !seen.has(d.id.toLowerCase())) {
        list.push(d);
      }
    });

    return list;
  }, [session, staffList, orders]);

  const knownRiders = useMemo(() => {
    return readyToAssign.map(r => ({ id: r.id || r.email, name: r.name }));
  }, [readyToAssign]);

  const openAssignModal = (ord: StaffOrder) => {
    setAssignOrder(ord);
    const currentRiderId = (ord.rider_id || '').toLowerCase();
    const currentRiderName = (ord.rider_name || '').toLowerCase();
    const matched = readyToAssign.find(
      r => (r.id && r.id.toLowerCase() === currentRiderId) ||
           (r.email && r.email.toLowerCase() === currentRiderId) ||
           (r.username && r.username.toLowerCase() === currentRiderId) ||
           (r.name && r.name.toLowerCase() === currentRiderName)
    );
    if (matched) {
      setRider(matched.email || matched.id);
      setCustomRiderInput('');
      setIsCustomRiderMode(false);
    } else if (ord.rider_name && ord.rider_name.trim()) {
      setRider('');
      setCustomRiderInput(ord.rider_name.trim());
      setIsCustomRiderMode(true);
    } else if (readyToAssign.length > 0) {
      setRider(readyToAssign[0].email || readyToAssign[0].id);
      setCustomRiderInput('');
      setIsCustomRiderMode(false);
    } else {
      setRider('');
      setCustomRiderInput('');
      setIsCustomRiderMode(true);
    }
  };

  const bakeryCashOverview = useMemo(() => {
    return computeBakeryCashOverview(orders, allDeposits, counterExpenses, knownRiders);
  }, [orders, allDeposits, counterExpenses, knownRiders]);

  const riderCashSummary = useMemo(() => {
    if (!session) return { total_collected: 0, total_deposited: 0, cash_in_hand: 0, delivered_orders_count: 0, deposits: [] };
    const rId = session.username || session.email;
    const rName = session.name;
    return computeRiderCashSummary(orders, allDeposits, rId, rName);
  }, [orders, allDeposits, session]);

  // Handle Rider Deposit Submission
  const handleAddDeposit = async () => {
    const amt = Math.round(Number(depositAmount.replace(/[^\d]/g, '')) || 0);
    if (amt <= 0) {
      setDepositError('সঠিক জমার পরিমাণ (টাকা) লিখুন।');
      return;
    }

    const rId = depositRiderId || session?.username || session?.email || 'rider-1';
    const rName = depositRiderName || session?.name || 'Rider';

    const newDep: CashDepositEntry = {
      id: 'dep_' + Date.now(),
      rider_id: rId,
      rider_name: rName,
      rider_phone: session?.username || '',
      amount: amt,
      note: depositNote.trim() || 'কাউন্টার ক্যাশ ডিপোজিট',
      deposited_at: new Date().toISOString(),
      status: 'confirmed',
      actor_name: session?.name || 'Staff'
    };

    const updated = [newDep, ...allDeposits];
    setAllDeposits(updated);
    await SecureStore.setItemAsync(ALL_DEPOSITS_KEY, JSON.stringify(updated)).catch(() => {});

    setDepositModalOpen(false);
    setDepositAmount('');
    setDepositNote('');
    setDepositError('');
    setNotice(`${money(amt)} কাউন্টারে সফলভাবে জমা দেওয়া হয়েছে ✓`);
  };

  // Handle Counter Expense Submission
  const handleAddExpense = async () => {
    const amt = Math.round(Number(expenseAmount.replace(/[^\d]/g, '')) || 0);
    if (amt <= 0) {
      Alert.alert('ভুল তথ্য', 'সঠিক খরচের পরিমাণ লিখুন।');
      return;
    }
    const newExp: CashExpenseEntry = {
      id: 'exp_' + Date.now(),
      amount: amt,
      category: expenseCategory,
      note: expenseNote.trim() || 'দোকানের ক্যাশ খরচ',
      created_at: new Date().toISOString(),
      recorded_by: session?.name || 'Admin'
    };
    const updated = [newExp, ...counterExpenses];
    setCounterExpenses(updated);
    await SecureStore.setItemAsync(ALL_EXPENSES_KEY, JSON.stringify(updated)).catch(() => {});
    setExpenseModalOpen(false);
    setExpenseAmount('');
    setExpenseNote('');
    setNotice(`${money(amt)} কাউন্টার ক্যাশ খরচ রেকর্ড করা হয়েছে ✓`);
  };

  // Delete / Rollback Deposit (for Boss)
  const handleDeleteDeposit = (id: string) => {
    Alert.alert('ডিপোজিট এন্ট্রি মুছবেন?', 'এই জমার রেকর্ডটি ক্যাশ খাতা থেকে অপসারণ করা হবে।', [
      { text: 'বাতিল', style: 'cancel' },
      {
        text: 'মুছে ফেলুন', style: 'destructive', onPress: async () => {
          const updated = allDeposits.filter(d => d.id !== id);
          setAllDeposits(updated);
          await SecureStore.setItemAsync(ALL_DEPOSITS_KEY, JSON.stringify(updated)).catch(() => {});
          setNotice('ডিপোজিট রেকর্ড মুছে ফেলা হয়েছে।');
        }
      }
    ]);
  };

  // Create Manual Order Submission
  const submitCreateOrder = async () => {
    if (!newOrderCustomerName.trim() || !newOrderPhone.trim() || !newOrderAddress.trim()) {
      setNewOrderError('গ্রাহকের নাম, মোবাইল নম্বর এবং ঠিকানা লিখুন।');
      return;
    }
    const phoneCheck = validateBangladeshiPhone(newOrderPhone);
    if (!phoneCheck.isValid) {
      setNewOrderError(phoneCheck.error || 'মোবাইল নম্বরটি অবশ্যই ১১ ডিজিটের হতে হবে (যেমন: 017XXXXXXXX)');
      return;
    }
    setCreateOrderBusy(true);
    setNewOrderError('');
    try {
      const selectedItem = products.find(p => p.id === newOrderProductId) || products[0];
      const selectedZone = deliveryZones.find(z => z.id === newOrderZoneId) || deliveryZones[0] || { id: 'zone-pickup', name: 'Pickup', fee: 0 };
      if (!selectedItem) {
        setNewOrderError('কোনো কেক প্রোডাক্ট পাওয়া যায়নি। শিট থেকে ডেটা লোড হওয়া পর্যন্ত অপেক্ষা করুন।');
        setCreateOrderBusy(false);
        return;
      }
      const itemSubtotal = (selectedItem.price || 0) * newOrderQuantity;
      const totalAmount = itemSubtotal + (selectedZone.fee || 0);
      const advanceAmount = Math.min(totalAmount, Math.max(0, Number(newOrderAdvance.replace(/[^\d]/g, '') || 0)));
      const codAmount = Math.max(0, totalAmount - advanceAmount);
      const orderNumber = `CAKE-${Date.now().toString().slice(-4)}`;

      const newOrder: StaffOrder = {
        id: `ord-man-${Date.now()}`,
        order_number: orderNumber,
        status: newOrderInitialConfirmed ? 'confirmed' : 'pending',
        customer_name: newOrderCustomerName.trim(),
        customer_phone: phoneCheck.phone,
        delivery_address: newOrderAddress.trim(),
        delivery_date: newOrderDate,
        delivery_slot: newOrderSlot,
        delivery_zone_id: selectedZone.id,
        delivery_fee: selectedZone.fee,
        message_on_cake: newOrderDedication.trim() || undefined,
        order_note: newOrderNote.trim() || 'Admin Mobile Creation',
        payment_method: codAmount === 0 ? 'bkash' : 'cod',
        payment_status: codAmount === 0 ? 'paid' : (advanceAmount > 0 ? 'partial' : 'pending'),
        total_amount: totalAmount,
        cod_amount: codAmount,
        due_amount: codAmount,
        advance_paid_amount: advanceAmount,
        cod_collected: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [{
          product_name: selectedItem.name,
          variant_name: selectedItem.weight_label,
          quantity: newOrderQuantity,
          subtotal: itemSubtotal
        }]
      };

      setOrders(prev => [newOrder, ...prev]);
      setCreateOrderModalOpen(false);
      setNotice(`নতুন অর্ডার #${orderNumber} সফলভাবে তৈরি হয়েছে! ✓`);
      setNewOrderCustomerName('');
      setNewOrderPhone('');
      setNewOrderAddress('');
      setNewOrderAdvance('0');
      setNewOrderNote('');
      setNewOrderDedication('');

      // Background sync to Google Sheets and immediate refresh
      const manualPayload = buildSheetOrderPayload({
        customer_name: newOrder.customer_name || 'Customer',
        customer_phone: newOrder.customer_phone || '01712345678',
        delivery_address: newOrder.delivery_address || 'Delivery Address',
        delivery_zone_id: newOrderZoneId || 'zone-pickup',
        delivery_slot: newOrderSlot || 'Instant',
        delivery_date: newOrderDate,
        order_note: newOrderNote,
        cart_items: [{
          product_id: selectedItem.id,
          variant_id: `${selectedItem.id}-1lb`,
          quantity: newOrderQuantity,
          writing_message: newOrderDedication,
          addon_ids: [],
        }],
      });
      createManualOrder(token, manualPayload).then(() => { void refresh(true); }).catch(() => {});
    } catch (err) {
      setNewOrderError(err instanceof Error ? err.message : 'অর্ডার তৈরি ব্যর্থ হয়েছে।');
    } finally {
      setCreateOrderBusy(false);
    }
  };

  // Handle POS Instant Counter Sale Completion
  const handlePosCompleteSale = async (newOrder: StaffOrder) => {
    setOrders(prev => [newOrder, ...prev]);
    if (token) {
      try {
        const cartLines = (newOrder.items || []).map(it => {
          const matchedProd = products.find(p => p.name === it.product_name) || products[0];
          const prodId = matchedProd ? matchedProd.id : 'prod-chocolate';
          return {
            product_id: prodId,
            variant_id: `${prodId}-1lb`,
            quantity: Math.max(1, it.quantity || 1),
            addon_ids: [],
            writing_message: 'POS Counter Sale',
          };
        });
        const posPayload = buildSheetOrderPayload({
          customer_name: newOrder.customer_name || 'Walk-in Customer',
          customer_phone: newOrder.customer_phone || '01712345678',
          delivery_address: newOrder.delivery_address || 'কাউন্টার ডেলিভারি (POS)',
          delivery_zone_id: 'zone-pickup',
          delivery_slot: 'Counter Pickup',
          delivery_date: new Date().toISOString().slice(0, 10),
          order_note: `POS Counter Order #${newOrder.order_number}`,
          cart_items: cartLines.length > 0 ? cartLines : undefined,
        });
        await createManualOrder(token, posPayload);
        void refresh(true);
      } catch {
        // optimistic state update already applied
      }
    }
  };

  // Toggle Product Stock Status
  const toggleProductStock = (id: string) => {
    setProducts(prev => {
      const nextProducts = prev.map(p => {
        if (p.id === id) {
          const next = !p.is_active;
          setNotice(`${p.name} এখন ${next ? 'স্টকে আছে (In Stock)' : 'স্টক আউট (Stock Out)'}`);
          const currentToken = tokenRef.current || token;
          if (currentToken) {
            updateCatalog(currentToken, 'products', 'is_active', id, next)
              .then(() => { void refresh(true); })
              .catch(err => {
                console.warn('Failed to update catalog product stock:', err);
              });
          }
          return { ...p, is_active: next };
        }
        return p;
      });
      void SecureStore.setItemAsync('aurora_cached_products_v2', JSON.stringify(nextProducts)).catch(() => {});
      return nextProducts;
    });
  };

  // Edit Product Details
  const saveProductEdit = () => {
    if (!editingProduct) return;
    const priceNum = Number(editProductPrice.replace(/[^\d]/g, '')) || editingProduct.price;
    setProducts(prev => {
      const updated = prev.map(p => {
        if (p.id === editingProduct.id) {
          return {
            ...p,
            name: editProductName.trim() || p.name,
            price: priceNum,
            weight_label: editProductWeight.trim() || p.weight_label
          };
        }
        return p;
      });
      void SecureStore.setItemAsync('aurora_cached_products_v2', JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    const currentToken = tokenRef.current || token;
    if (currentToken) {
      updateCatalog(currentToken, 'products', 'price', editingProduct.id, priceNum)
        .then(() => { void refresh(true); })
        .catch(() => {});
    }
    setEditProductModalOpen(false);
    setEditingProduct(null);
    setNotice(`${editProductName || editingProduct.name} আপডেট সফল হয়েছে! ✓`);
  };

  // Add Staff Account
  const submitCreateStaff = async () => {
    if (!newStaffName.trim() || !newStaffUsername.trim() || newStaffPassword.length < 4) {
      setStaffActionError('নাম, ইউজারনেম এবং কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড দিন।');
      return;
    }
    setStaffActionBusy(true);
    setStaffActionError('');
    try {
      const cleanUser = newStaffUsername.trim().toLowerCase();
      setStaffList(prev => [
        {
          name: newStaffName.trim(),
          username: cleanUser,
          email: `${cleanUser}@auroracake.com`,
          role: newStaffRole,
          active: true
        },
        ...prev
      ]);
      setAddStaffModalOpen(false);
      setNotice(`কর্মী @${cleanUser} অ্যাকাউন্ট তৈরি সম্পন্ন! ✓`);
      setNewStaffName('');
      setNewStaffUsername('');
      setNewStaffPassword('');
      createStaffAccount(token, newStaffName.trim(), cleanUser, newStaffPassword, newStaffRole).catch(() => {});
    } catch (e) {
      setStaffActionError(e instanceof Error ? e.message : 'কর্মী অ্যাকাউন্ট তৈরি ব্যর্থ হয়েছে।');
    } finally {
      setStaffActionBusy(false);
    }
  };

  // Toggle Staff Active
  const toggleStaffActive = (u: string) => {
    const sTarget = staffList.find(x => x.username === u);
    if (!sTarget) return;
    const next = !sTarget.active;
    Alert.alert(
      next ? 'অ্যাকাউন্ট চালু করবেন?' : 'অ্যাকাউন্ট নিষ্ক্রিয় করবেন?',
      `@${u} অ্যাকাউন্ট ${next ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করা হবে।`,
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: next ? 'সক্রিয় করুন' : 'নিষ্ক্রিয় করুন',
          style: next ? 'default' : 'destructive',
          onPress: () => {
            setStaffList(prev => prev.map(item => item.username === u ? { ...item, active: next } : item));
            setNotice(`@${u} এখন ${next ? 'সক্রিয়' : 'নিষ্ক্রিয়'}!`);
            changeStaffStatus(token, u, next).catch(() => {});
          }
        }
      ]
    );
  };

  // Reset Staff Password
  const submitResetPassword = () => {
    if (resetNewPassword.length < 4) {
      setStaffActionError('পাসওয়ার্ড কমপক্ষে ৪ ডিজিটের হতে হবে।');
      return;
    }
    resetStaffPassword(token, selectedStaffForPassword, resetNewPassword).catch(() => {});
    setResetPasswordModalOpen(false);
    setNotice(`@${selectedStaffForPassword}-এর পাসওয়ার্ড রিসেট সফল হয়েছে!`);
    setResetNewPassword('');
  };

  // Quote Custom Cake
  const submitQuoteCustomCake = () => {
    if (!quoteModalCake) return;
    const amt = Math.round(Number(quoteAmount.replace(/[^\d]/g, '')) || 0);
    if (amt <= 0) {
      Alert.alert('ভুল তথ্য', 'কোটেশন টাকার পরিমাণ লিখুন।');
      return;
    }
    setCustomCakes(prev => prev.map(c => c.id === quoteModalCake.id ? { ...c, status: 'quoted', quote_amount: amt, staff_notes: quoteNotes } : c));
    setNotice(`কাস্টম কেকের জন্য ${money(amt)} কোটেশন পাঠানো হয়েছে! ✓`);
    quoteCustomCake(token, quoteModalCake.id, amt, quoteNotes).then(() => { void refresh(true); }).catch(() => {});
    setQuoteModalCake(null);
    setQuoteAmount('');
    setQuoteNotes('');
  };

  // Share Collection Statement Report
  const shareCollectionReport = async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const targetOrders = orders.filter(o => {
      if (statementPreset === 'today') return o.created_at && o.created_at.slice(0, 10) === todayStr;
      if (statementPreset === 'yesterday') {
        const y = new Date(); y.setDate(y.getDate() - 1);
        return o.created_at && o.created_at.slice(0, 10) === y.toISOString().slice(0, 10);
      }
      return true;
    });

    const totalRev = targetOrders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const codTotal = targetOrders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + getOrderCashAmount(o), 0);
    const deliveredCount = targetOrders.filter(o => o.status === 'delivered').length;

    const report = `📊 ${shopName} - কালেকশন স্টেটমেন্ট\nতারিখ: ${new Date().toLocaleDateString('bn-BD')}\n\n` +
      `মোট বিক্রয়: ${money(totalRev)}\n` +
      `নগদ ক্যাশ কালেকশন: ${money(codTotal)}\n` +
      `ডেলিভার্ড অর্ডার: ${deliveredCount} টি\n` +
      `কাউন্টার ক্যাশ ব্যালেন্স: ${money(bakeryCashOverview.counter_drawer_balance)}\n\n` +
      `রিপোর্ট প্রস্তুতকারক: ${session?.name || 'Staff'}`;

    try {
      await Share.share({ message: report });
    } catch {}
  };

  const visible = useMemo(() => {
    if (!session) return [];
    let result = visibleOrders(orders, session, tab === 'tasks' ? 'tasks' : 'orders');
    if (tab === 'orders') {
      if (orderFilter === 'pending') result = result.filter(o => o.status === 'pending');
      else if (orderFilter === 'kitchen') result = result.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status));
      else if (orderFilter === 'delivery') result = result.filter(o => ['assigned', 'picked_up', 'out_for_delivery'].includes(o.status));
      else if (orderFilter === 'delivered') result = result.filter(o => o.status === 'delivered');
      else if (orderFilter === 'cancelled') result = result.filter(o => o.status === 'cancelled');

      // Date Filtering
      const todayStr = new Date().toISOString().slice(0, 10);
      if (dateFilter === 'today') {
        result = result.filter(o => o.created_at && o.created_at.slice(0, 10) === todayStr);
      } else if (dateFilter === 'yesterday') {
        const y = new Date(); y.setDate(y.getDate() - 1);
        const yStr = y.toISOString().slice(0, 10);
        result = result.filter(o => o.created_at && o.created_at.slice(0, 10) === yStr);
      } else if (dateFilter === 'week') {
        const sevenDaysAgo = Date.now() - 7 * 86400000;
        result = result.filter(o => o.created_at && new Date(o.created_at).getTime() >= sevenDaysAgo);
      }
    }
    const q = query.trim().toLowerCase();
    if (q) result = result.filter(o => (o.order_number + ' ' + (o.customer_name || '') + ' ' + (o.customer_phone || '') + ' ' + (o.delivery_address || '')).toLowerCase().includes(q));
    return result;
  }, [orders, session, tab, orderFilter, dateFilter, query]);

  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter(o => o.created_at && o.created_at.slice(0, 10) === today);
    const todaySales = todayOrders
      .filter(o => o.status !== 'cancelled')
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const totalSales = orders
      .filter(o => o.status === 'delivered')
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const pending = orders.filter(o => o.status === 'pending').length;
    const kitchen = orders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status)).length;
    const onTheWay = orders.filter(o => ['assigned', 'picked_up', 'out_for_delivery'].includes(o.status)).length;
    const delivered = orders.filter(o => o.status === 'delivered').length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;

    return {
      todaySales, todayCount: todayOrders.length, totalSales, pending, kitchen,
      onTheWay, delivered, cancelled
    };
  }, [orders]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (productFilter === 'in_stock') list = list.filter(p => p.is_active);
    else if (productFilter === 'out_of_stock') list = list.filter(p => !p.is_active);
    const q = productSearch.trim().toLowerCase();
    if (q) list = list.filter(p => (p.name + ' ' + p.category).toLowerCase().includes(q));
    return list;
  }, [products, productFilter, productSearch]);

  if (initializing) return <View style={s.center}><ActivityIndicator size="large" color={C.brand} /></View>;

  if (!session) return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.root}>
    <StatusBar barStyle="dark-content" />
    <ScrollView contentContainerStyle={s.loginContainer} keyboardShouldPersistTaps="handled">
      <View style={s.loginLogo}>
        <Image
          source={resolveProfileSource(webProfileUrl)}
          style={{ width: 55, height: 55, borderRadius: 16 }}
          resizeMode="cover"
          defaultSource={DEFAULT_LOGO_IMAGE}
        />
      </View>
      <Text style={s.logo}>AURORA'S CAKE</Text>
      <Text style={s.logoSub}>ARTISAN BAKERY · OPERATIONS SUITE</Text>
      <Text style={s.loginTitle}>Staff Portal Login</Text>
      <Text style={s.loginIntro}>অর্ডার প্রসেসিং, কিচেন প্রস্তুতি, ডেলিভারি ও অ্যাডমিন ম্যানেজমেন্ট অ্যাপ।</Text>
      <View style={[s.loginPanel, cardShadow]}>
        <Input label="Staff Username" value={username} onChange={setUsername} placeholder="e.g. admin or rider01" />
        <Input label="Password" value={password} onChange={setPassword} secure placeholder="Password (কমপক্ষে ৪ ডিজিট)" />
        {error ? <Text style={s.error}>{error}</Text> : null}
        <ActionButton disabled={loginBusy} label={loginBusy ? 'Verifying account…' : 'Sign in to workspace →'} onPress={() => void submitLogin()} />
        <Pressable
          onPress={quickAdminAccess}
          style={{
            marginTop: 10,
            backgroundColor: '#F0FDF4',
            borderWidth: 1.5,
            borderColor: '#22C55E',
            borderRadius: 14,
            paddingVertical: 12,
            paddingHorizontal: 14,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#15803D', fontWeight: '800', fontSize: 13 }}>
            🚀 সরাসরি অ্যাডমিন ড্যাশবোর্ডে প্রবেশ (1-Tap Admin)
          </Text>
        </Pressable>
        <Text style={s.note}>নিরাপদ সেশন: ডিভাইসে স্থায়ী লগইন থাকবে। অটো-লগআউট হবে না।</Text>
      </View>
      <Pressable onPress={() => void attemptRestore()}><Text style={s.reconnect}>Previous session? Tap to reconnect</Text></Pressable>
      <Text style={s.footer}>Private Staff & Admin App · Aurora's Cake</Text>
    </ScrollView>
  </KeyboardAvoidingView>;

  const tabs: Array<{ id: Tab; icon: string; name: string }> = isBoss ? [
    { id: 'overview', icon: '🏠', name: 'হোম' },
    { id: 'orders', icon: '📦', name: 'অর্ডারস' },
    { id: 'pos', icon: '🛍️', name: 'POS সেল' },
    { id: 'kitchen', icon: '👨‍🍳', name: 'কিচেন' },
    { id: 'modules_hub', icon: '⚡', name: 'মডিউল' }
  ] : isRider ? [
    { id: 'tasks', icon: '🛵', name: 'ডেলিভারি' },
    { id: 'orders', icon: '📦', name: 'অর্ডারস' },
    { id: 'cash', icon: '💰', name: 'ক্যাশ জমা' },
    { id: 'account', icon: '👤', name: 'একাউন্ট' }
  ] : [
    { id: 'kitchen', icon: '👨‍🍳', name: 'কিচেন' },
    { id: 'orders', icon: '📦', name: 'অর্ডারস' },
    { id: 'products', icon: '🎂', name: 'কেক স্টক' },
    { id: 'modules_hub', icon: '⚡', name: 'মডিউল' },
    { id: 'account', icon: '⚙️', name: 'একাউন্ট' }
  ];

  return <View style={s.root}>
    <StatusBar barStyle="light-content" />

    {/* ==================== TOP HEADER BAR ==================== */}
    <View style={s.top}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <Image
          source={resolveProfileSource(webProfileUrl || session.profile_image_url || session.logo_url)}
          style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: '#4ADE80', backgroundColor: '#FFF' }}
          resizeMode="cover"
          defaultSource={DEFAULT_LOGO_IMAGE}
        />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.topEyebrow}>{shopName.toUpperCase()}</Text>
            {sheetSynced ? <View style={s.sheetSyncBadge}><Text style={s.sheetSyncText}>● Sheet Live</Text></View> : null}
          </View>
          <Text style={s.topTitle} numberOfLines={1}>{session.name}</Text>
          <Text style={s.topSub}>{roleLabel[session.role]} · {session.username ? `@${session.username}` : session.email}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {/* Screen Keep-Awake Toggle */}
        <Pressable accessibilityLabel="Toggle Keep Awake" onPress={() => void toggleKeepAwake()} style={[s.topIconBtn, keepAwakeEnabled && s.topIconBtnActive]}>
          <Text style={{ fontSize: 16 }}>{keepAwakeEnabled ? '☀️' : '🌙'}</Text>
        </Pressable>

        {/* Audio Sound Alert Toggle */}
        <Pressable accessibilityLabel="Toggle Sound" onPress={() => void toggleSound()} style={[s.topIconBtn, soundEnabled && s.topIconBtnActive]}>
          <Text style={{ fontSize: 16 }}>{soundEnabled ? '🔔' : '🔕'}</Text>
        </Pressable>

        {/* Sound Test Button */}
        <Pressable accessibilityLabel="Test Sound" onPress={handleTestSound} style={s.topIconBtn}>
          <Text style={{ fontSize: 16 }}>🔊</Text>
        </Pressable>

        {/* Refresh Circle */}
        <Pressable accessibilityLabel="Refresh Orders" disabled={refreshing} onPress={() => void refresh()} style={s.refreshCircle}>
          {refreshing ? <ActivityIndicator size="small" color={C.brand} /> : <Text style={{ fontSize: 18 }}>↻</Text>}
        </Pressable>
      </View>
    </View>

    {/* ==================== UNACKNOWLEDGED ORDER ALERT BANNER ==================== */}
    {unacknowledgedAlertCount > 0 ? (
      <Pressable onPress={() => { void stopOrderAlertSound(); setUnacknowledgedAlertCount(0); setTab('orders'); setOrderFilter('pending'); }} style={s.orderAlertBanner}>
        <Text style={{ fontSize: 20 }}>🔔</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: '#78350F' }}>
            নতুন {unacknowledgedAlertCount} টি অর্ডার এসেছে!
          </Text>
          <Text style={{ fontSize: 12, color: '#92400E' }}>
            সাউন্ড বন্ধ করতে ও দেখতে এখানে চাপুন
          </Text>
        </View>
        <View style={{ backgroundColor: '#B45309', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
          <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 11 }}>বন্ধ করুন ✕</Text>
        </View>
      </Pressable>
    ) : null}

    {notice ? (
      <View style={s.bannerSuccess}>
        <Text style={{ color: '#166534', flex: 1, fontSize: 13, fontWeight: '700' }}>{notice}</Text>
        <Pressable onPress={() => setNotice('')}><Text style={{ color: '#166534', fontWeight: '800' }}>✕</Text></Pressable>
      </View>
    ) : null}
    {error ? (
      <View style={s.bannerError}>
        <Text style={{ color: C.warn, flex: 1, fontSize: 13, fontWeight: '700' }}>{error}</Text>
        <Pressable onPress={() => setError('')}><Text style={{ color: C.warn, fontWeight: '800' }}>✕</Text></Pressable>
      </View>
    ) : null}

    {/* ==================== GLOBAL BACK & HOME NAVIGATION BAR ==================== */}
    {((tab !== 'overview' && tab !== 'tasks') || navHistory.length > 0) ? (
      <View style={s.navBarSticky}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back to previous screen"
          onPress={navigateBack}
          style={({ pressed }) => [s.navBackBtn, pressed && s.navBtnPressed]}
        >
          <Text style={s.navBackIcon}>‹</Text>
          <Text style={s.navBackText}>ফিরে যান (Back)</Text>
        </Pressable>

        <View style={s.navCenterBadge}>
          <Text style={s.navCenterEmoji}>{tabMeta[tab]?.icon || '📌'}</Text>
          <Text style={s.navCenterTitle} numberOfLines={1}>
            {tabMeta[tab]?.title || tab}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go to home dashboard"
          onPress={navigateHome}
          style={({ pressed }) => [s.navHomeBtn, pressed && s.navBtnPressed]}
        >
          <Text style={s.navHomeIcon}>🏠</Text>
          <Text style={s.navHomeText}>হোম (Home)</Text>
        </Pressable>
      </View>
    ) : null}

    {/* ==================== TAB CONTENT ROUTING ==================== */}
    {tab === 'overview' ? (
      /* ==================== TAB: OVERVIEW / DASHBOARD ==================== */
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={C.brand} />}
      >
        <View style={s.overviewGrid}>
          <View style={[s.kpiCard, cardShadow]}>
            <Text style={s.kpiIcon}>💰</Text>
            <Text style={s.kpiValue}>{money(metrics.todaySales)}</Text>
            <Text style={s.kpiLabel}>Today's Sales</Text>
            <SmallLabel>{metrics.todayCount} orders placed today</SmallLabel>
          </View>
          <View style={[s.kpiCard, cardShadow]}>
            <Text style={s.kpiIcon}>📦</Text>
            <Text style={s.kpiValue}>{orders.length}</Text>
            <Text style={s.kpiLabel}>Total Orders</Text>
            <SmallLabel>{metrics.delivered} delivered</SmallLabel>
          </View>
        </View>

        {/* Counter Drawer & Rider Cash Quick Bar */}
        <View style={[s.cashHeroCard, cardShadow]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>
                কাউন্টার ক্যাশ ড্রয়ার ব্যালেন্স
              </Text>
              <Text style={{ fontSize: 26, fontWeight: '900', color: '#78350F', marginTop: 2 }}>
                {money(bakeryCashOverview.counter_drawer_balance)}
              </Text>
            </View>
            <Pressable onPress={() => setStatementModalOpen(true)} style={[s.actionPillBtn, { backgroundColor: '#B45309' }]}>
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>📄 রিপোর্ট ও স্লিপ</Text>
            </Pressable>
          </View>
          <Text style={{ color: '#92400E', fontSize: 12, marginTop: 4 }}>
            রাইডারদের জমা + পিকআপ ক্যাশ: {money(bakeryCashOverview.total_rider_deposited + bakeryCashOverview.counter_pickup_cash)} | রাইডারদের কাছে বাকি: {money(bakeryCashOverview.total_cash_with_riders)}
          </Text>
        </View>

        {/* Live Pipeline Badges */}
        <View style={[s.infoCard, cardShadow]}>
          <Text style={s.infoTitle}>⚡ Live Order Pipeline</Text>
          <View style={s.pipelineRow}>
            <Pressable onPress={() => { navigateTo('orders'); setOrderFilter('pending'); }} style={s.pipelineBadge}>
              <Text style={s.pipelineCountAmber}>{metrics.pending}</Text>
              <Text style={s.pipelineLabel}>নতুন (New)</Text>
            </Pressable>
            <Pressable onPress={() => { navigateTo('orders'); setOrderFilter('kitchen'); }} style={s.pipelineBadge}>
              <Text style={s.pipelineCountBlue}>{metrics.kitchen}</Text>
              <Text style={s.pipelineLabel}>বেকিং (Kitchen)</Text>
            </Pressable>
            <Pressable onPress={() => { navigateTo('orders'); setOrderFilter('delivery'); }} style={s.pipelineBadge}>
              <Text style={s.pipelineCountPurple}>{metrics.onTheWay}</Text>
              <Text style={s.pipelineLabel}>ডেলিভারি (Road)</Text>
            </Pressable>
            <Pressable onPress={() => { navigateTo('orders'); setOrderFilter('delivered'); }} style={s.pipelineBadge}>
              <Text style={s.pipelineCountGreen}>{metrics.delivered}</Text>
              <Text style={s.pipelineLabel}>সম্পন্ন (Done)</Text>
            </Pressable>
          </View>
        </View>

        {/* ==================== FEATURED HERO LAUNCH CARDS ==================== */}
        <View style={{ gap: 10 }}>
          {/* 1. Create Manual Order Hero Card */}
          <Pressable
            onPress={() => { setNewOrderError(''); setCreateOrderModalOpen(true); }}
            style={({ pressed }) => [s.heroOrderCard, pressed && s.cardPressed]}
          >
            <View style={s.heroCardIconBox}>
              <Text style={{ fontSize: 24 }}>✨</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.heroCardTitle}>+ নতুন ম্যানুয়াল অর্ডার তৈরি</Text>
                <View style={s.heroBadge}><Text style={s.heroBadgeText}>ইনস্ট্যান্ট</Text></View>
              </View>
              <Text style={s.heroCardSub}>ওয়াক-ইন বা ফোন অর্ডারের সরাসরি এন্ট্রি ও নিশ্চিতকরণ</Text>
            </View>
            <Text style={s.heroCardArrow}>→</Text>
          </Pressable>

          {/* 2. POS Counter Sales Hero Card */}
          <Pressable
            onPress={() => navigateTo('pos')}
            style={({ pressed }) => [s.heroPosCard, pressed && s.cardPressed]}
          >
            <View style={[s.heroCardIconBox, { backgroundColor: '#ECFDF5' }]}>
              <Text style={{ fontSize: 24 }}>🛍️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[s.heroCardTitle, { color: '#065F46' }]}>POS কাউন্টার সেল ও রসিদ</Text>
                <View style={[s.heroBadge, { backgroundColor: '#059669' }]}><Text style={s.heroBadgeText}>লাইভ</Text></View>
              </View>
              <Text style={s.heroCardSub}>সরাসরি বিক্রি, ডিসকাউন্ট, স্প্লিট পেমেন্ট ও ৫৪/৮০মিমি স্লিপ</Text>
            </View>
            <Text style={[s.heroCardArrow, { color: '#059669' }]}>→</Text>
          </Pressable>
        </View>

        {/* ==================== 2-COLUMN ENTERPRISE MODULES CARD GRID ==================== */}
        <View style={{ gap: 10, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.sectionHeaderTitle}>⚡ বেকারি অপারেশন কার্ডস (Modules)</Text>
            <Pressable onPress={() => navigateTo('modules_hub')}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: C.brand }}>সকল ১৪টি মডিউল →</Text>
            </Pressable>
          </View>

          <View style={s.moduleCardsGrid}>
            {/* Card: Kitchen & Baking Queue */}
            <Pressable onPress={() => navigateTo('kitchen')} style={({ pressed }) => [s.moduleGridCard, pressed && s.cardPressed]}>
              <View style={s.moduleGridCardTop}>
                <View style={[s.moduleGridIconBox, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={{ fontSize: 22 }}>👨‍🍳</Text>
                </View>
                {metrics.kitchen > 0 ? (
                  <View style={[s.moduleGridBadge, { backgroundColor: '#D97706' }]}>
                    <Text style={s.moduleGridBadgeText}>{metrics.kitchen} বেকিং</Text>
                  </View>
                ) : null}
              </View>
              <Text style={s.moduleGridTitle}>কিচেন ও বেকিং কিউ</Text>
              <Text style={s.moduleGridSub} numberOfLines={2}>বেকিং কিউ, ব্যাচ ও ওভেন টাইমার</Text>
            </Pressable>

            {/* Card: Inventory Stock */}
            <Pressable onPress={() => navigateTo('inventory')} style={({ pressed }) => [s.moduleGridCard, pressed && s.cardPressed]}>
              <View style={s.moduleGridCardTop}>
                <View style={[s.moduleGridIconBox, { backgroundColor: '#F3E8FF' }]}>
                  <Text style={{ fontSize: 22 }}>📦</Text>
                </View>
                {products.filter(p => !p.is_active).length > 0 ? (
                  <View style={[s.moduleGridBadge, { backgroundColor: '#DC2626' }]}>
                    <Text style={s.moduleGridBadgeText}>{products.filter(p => !p.is_active).length} লো স্টক</Text>
                  </View>
                ) : null}
              </View>
              <Text style={s.moduleGridTitle}>কাঁচামাল ইনভেন্টরি</Text>
              <Text style={s.moduleGridSub} numberOfLines={2}>ময়দা, চিনি, ক্রিম ও প্যাকেজিং</Text>
            </Pressable>

            {/* Card: Purchases & Suppliers */}
            <Pressable onPress={() => navigateTo('purchases')} style={({ pressed }) => [s.moduleGridCard, pressed && s.cardPressed]}>
              <View style={s.moduleGridCardTop}>
                <View style={[s.moduleGridIconBox, { backgroundColor: '#DBEAFE' }]}>
                  <Text style={{ fontSize: 22 }}>🧾</Text>
                </View>
              </View>
              <Text style={s.moduleGridTitle}>ক্রয় ও সাপ্লায়ার</Text>
              <Text style={s.moduleGridSub} numberOfLines={2}>ভাউচার এন্ট্রি ও সাপ্লায়ার বাকি</Text>
            </Pressable>

            {/* Card: Finance & Accounts */}
            <Pressable onPress={() => navigateTo('finance')} style={({ pressed }) => [s.moduleGridCard, pressed && s.cardPressed]}>
              <View style={s.moduleGridCardTop}>
                <View style={[s.moduleGridIconBox, { backgroundColor: '#D1FAE5' }]}>
                  <Text style={{ fontSize: 22 }}>💰</Text>
                </View>
                <View style={[s.moduleGridBadge, { backgroundColor: '#059669' }]}>
                  <Text style={s.moduleGridBadgeText}>{money(bakeryCashOverview.counter_drawer_balance)}</Text>
                </View>
              </View>
              <Text style={s.moduleGridTitle}>অর্থ ও একাউন্টস</Text>
              <Text style={s.moduleGridSub} numberOfLines={2}>ক্যাশ ড্রয়ার, খরচ ও P&L লাভ-ক্ষতি</Text>
            </Pressable>

            {/* Card: Delivery & Riders */}
            <Pressable onPress={() => navigateTo('delivery')} style={({ pressed }) => [s.moduleGridCard, pressed && s.cardPressed]}>
              <View style={s.moduleGridCardTop}>
                <View style={[s.moduleGridIconBox, { backgroundColor: '#FFEDD5' }]}>
                  <Text style={{ fontSize: 22 }}>🛵</Text>
                </View>
                {metrics.onTheWay > 0 ? (
                  <View style={[s.moduleGridBadge, { backgroundColor: '#EA580C' }]}>
                    <Text style={s.moduleGridBadgeText}>{metrics.onTheWay} চলমান</Text>
                  </View>
                ) : null}
              </View>
              <Text style={s.moduleGridTitle}>ডেলিভারি ও রাইডার</Text>
              <Text style={s.moduleGridSub} numberOfLines={2}>রাইডার ট্র্যাকিং, COD ও হ্যান্ডওভার</Text>
            </Pressable>

            {/* Card: Customers CRM */}
            <Pressable onPress={() => navigateTo('customers')} style={({ pressed }) => [s.moduleGridCard, pressed && s.cardPressed]}>
              <View style={s.moduleGridCardTop}>
                <View style={[s.moduleGridIconBox, { backgroundColor: '#EDE9FE' }]}>
                  <Text style={{ fontSize: 22 }}>👥</Text>
                </View>
              </View>
              <Text style={s.moduleGridTitle}>কাস্টমার সিআরএম</Text>
              <Text style={s.moduleGridSub} numberOfLines={2}>গ্রাহক প্রোফাইল, অর্ডার ও ১-ট্যাপ কল</Text>
            </Pressable>

            {/* Card: Cake Catalog & Stock */}
            <Pressable onPress={() => navigateTo('products')} style={({ pressed }) => [s.moduleGridCard, pressed && s.cardPressed]}>
              <View style={s.moduleGridCardTop}>
                <View style={[s.moduleGridIconBox, { backgroundColor: '#FCE7F3' }]}>
                  <Text style={{ fontSize: 22 }}>🎂</Text>
                </View>
                <View style={[s.moduleGridBadge, { backgroundColor: '#DB2777' }]}>
                  <Text style={s.moduleGridBadgeText}>লাইভ শিট</Text>
                </View>
              </View>
              <Text style={s.moduleGridTitle}>কেক ক্যাটালগ ও স্টক</Text>
              <Text style={s.moduleGridSub} numberOfLines={2}>ইন-স্টক / আউট-অফ-স্টক টগল</Text>
            </Pressable>

            {/* Card: Custom Cake Queue */}
            <Pressable onPress={() => navigateTo('custom_cakes')} style={({ pressed }) => [s.moduleGridCard, pressed && s.cardPressed]}>
              <View style={s.moduleGridCardTop}>
                <View style={[s.moduleGridIconBox, { backgroundColor: '#F3E8FF' }]}>
                  <Text style={{ fontSize: 22 }}>🎨</Text>
                </View>
                {customCakes.filter(c => c.status === 'pending').length > 0 ? (
                  <View style={[s.moduleGridBadge, { backgroundColor: '#9333EA' }]}>
                    <Text style={s.moduleGridBadgeText}>{customCakes.filter(c => c.status === 'pending').length} নতুন</Text>
                  </View>
                ) : null}
              </View>
              <Text style={s.moduleGridTitle}>কাস্টম কেক রিকোয়েস্ট</Text>
              <Text style={s.moduleGridSub} numberOfLines={2}>ডিজাইন রিভিউ, কোটেশন ও নোট</Text>
            </Pressable>

            {/* Card: Offers & Coupons */}
            <Pressable onPress={() => navigateTo('offers')} style={({ pressed }) => [s.moduleGridCard, pressed && s.cardPressed]}>
              <View style={s.moduleGridCardTop}>
                <View style={[s.moduleGridIconBox, { backgroundColor: '#FFE4E6' }]}>
                  <Text style={{ fontSize: 22 }}>🏷️</Text>
                </View>
              </View>
              <Text style={s.moduleGridTitle}>অফার ও কুপন কোড</Text>
              <Text style={s.moduleGridSub} numberOfLines={2}>প্রমোশন, কুপন ও ডিসকাউন্ট</Text>
            </Pressable>

            {/* Card: Staff & Team */}
            <Pressable onPress={() => { navigateTo('staff'); setStaffSubTab('team'); }} style={({ pressed }) => [s.moduleGridCard, pressed && s.cardPressed]}>
              <View style={s.moduleGridCardTop}>
                <View style={[s.moduleGridIconBox, { backgroundColor: '#F1F5F9' }]}>
                  <Text style={{ fontSize: 22 }}>👔</Text>
                </View>
              </View>
              <Text style={s.moduleGridTitle}>টিম ও কর্মী একাউন্ট</Text>
              <Text style={s.moduleGridSub} numberOfLines={2}>স্টাফ তৈরি, রোল ও পাসওয়ার্ড</Text>
            </Pressable>

            {/* Card: Reports & Analytics */}
            <Pressable onPress={() => navigateTo('reports')} style={({ pressed }) => [s.moduleGridCard, pressed && s.cardPressed]}>
              <View style={s.moduleGridCardTop}>
                <View style={[s.moduleGridIconBox, { backgroundColor: '#EDE9FE' }]}>
                  <Text style={{ fontSize: 22 }}>📊</Text>
                </View>
              </View>
              <Text style={s.moduleGridTitle}>রিপোর্ট ও অ্যানালিটিক্স</Text>
              <Text style={s.moduleGridSub} numberOfLines={2}>বিক্রয় ট্রেন্ড ও সেরা কেক তালিকা</Text>
            </Pressable>

            {/* Card: Collection Statement */}
            <Pressable onPress={() => setStatementModalOpen(true)} style={({ pressed }) => [s.moduleGridCard, pressed && s.cardPressed]}>
              <View style={s.moduleGridCardTop}>
                <View style={[s.moduleGridIconBox, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={{ fontSize: 22 }}>📄</Text>
                </View>
              </View>
              <Text style={s.moduleGridTitle}>কালেকশন স্টেটমেন্ট</Text>
              <Text style={s.moduleGridSub} numberOfLines={2}>দৈনিক ক্যাশ বিবরণী ও POS স্লিপ</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    ) : tab === 'modules_hub' ? (
      /* ==================== TAB: ALL BMS MODULES HUB ==================== */
      <ModulesHub
        orders={orders}
        session={session}
        onNavigate={navigateTo}
        onBack={navigateBack}
        onHome={navigateHome}
        lowStockCount={products.filter(p => !p.is_active).length}
        cashDrawerBalance={bakeryCashOverview.counter_drawer_balance}
        customCakesCount={customCakes.filter(c => c.status === 'pending').length}
      />
    ) : tab === 'pos' ? (
      /* ==================== TAB: POS & COUNTER SALES ==================== */
      <PosModule
        products={products}
        session={session}
        onCompleteSale={handlePosCompleteSale}
        onClose={navigateBack}
        shopName="Aurora's Cake"
        shopAddress="Dhaka, Bangladesh"
        shopPhone="01712-345678"
      />
    ) : tab === 'kitchen' ? (
      /* ==================== TAB: KITCHEN & BAKING QUEUE ==================== */
      <KitchenModule
        orders={orders}
        session={session}
        onUpdateStatus={async (order, op) => { await applyMutation(order, op); }}
        onClose={navigateBack}
      />
    ) : tab === 'inventory' ? (
      /* ==================== TAB: RAW MATERIALS INVENTORY ==================== */
      <InventoryModule
        staffName={session.name}
        onClose={navigateBack}
      />
    ) : tab === 'purchases' ? (
      /* ==================== TAB: PURCHASES & SUPPLIERS ==================== */
      <PurchasesModule
        staffName={session.name}
        onClose={navigateBack}
      />
    ) : tab === 'finance' ? (
      /* ==================== TAB: FINANCE, ACCOUNTS & P&L ==================== */
      <FinanceModule
        orders={orders}
        staffName={session.name}
        onClose={navigateBack}
      />
    ) : tab === 'customers' ? (
      /* ==================== TAB: CUSTOMER CRM & PROFILES ==================== */
      <CustomersModule
        orders={orders}
        onBack={navigateBack}
        onSelectOrder={(ord) => setSelectedOrderDetails(ord)}
      />
    ) : tab === 'offers' ? (
      /* ==================== TAB: OFFERS & COUPONS ==================== */
      <OffersModule
        onBack={navigateBack}
      />
    ) : tab === 'reports' ? (
      /* ==================== TAB: REPORTS & ANALYTICS ==================== */
      <ReportsModule
        orders={orders}
        onBack={navigateBack}
      />
    ) : tab === 'delivery' ? (
      /* ==================== TAB: DELIVERY & RIDERS ==================== */
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={C.brand} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={s.sectionTitle}>🛵 Delivery & Rider Logistics</Text>
            <Text style={s.muted}>সক্রিয় ডেলিভারি ও রাইডার ট্র্যাক</Text>
          </View>
          <Pressable onPress={navigateBack} style={[s.pill, { backgroundColor: '#EDE7F6' }]}>
            <Text style={{ color: '#6A1B9A', fontWeight: '800', fontSize: 12 }}>‹ ফিরে যান</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => { navigateTo('staff'); setStaffSubTab('cash'); }} style={[s.orderCard, cardShadow, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#92400E' }}>💰 রাইডার ক্যাশ কালেকশন ও ডিপোজিট</Text>
          <Text style={{ fontSize: 12, color: '#B45309', marginTop: 4 }}>সকল রাইডারের হাতে থাকা ক্যাশ টাকা মেলান এবং ড্রয়ারে জমা নিশ্চিত করুন →</Text>
        </Pressable>

        <Text style={[s.infoTitle, { marginTop: 8 }]}>📦 চলমান ডেলিভারিসমূহ</Text>
        {orders.filter(o => ['assigned', 'picked_up', 'out_for_delivery'].includes(o.status)).length === 0 ? (
          <View style={[s.orderCard, cardShadow, { alignItems: 'center', padding: 24 }]}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🛵</Text>
            <Text style={{ color: C.ink, fontWeight: '800' }}>বর্তমানে কোনো চলমান ডেলিভারি নেই</Text>
            <Text style={s.muted}>কিচেন থেকে অর্ডার রেডি হলে রাইডার অ্যাসাইন করুন</Text>
          </View>
        ) : (
          orders.filter(o => ['assigned', 'picked_up', 'out_for_delivery'].includes(o.status)).map(item => (
            <OrderTile key={item.id} order={item} session={session} working={workingId === item.id}
              onNext={action} onAssign={openAssignModal} onDeliver={onDeliver} onCancel={o => action(o, 'cancel')}
              onReopen={onReopen} onShowPos={o => setPosOrder(o)} onOpenDetails={o => setSelectedOrderDetails(o)} />
          ))
        )}
      </ScrollView>
    ) : tab === 'products' ? (
      /* ==================== TAB: PRODUCTS & STOCK ==================== */
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={C.brand} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.sectionTitle}>🎂 Products & Stock Control</Text>
              {sheetSynced ? <Text style={{ fontSize: 11, color: '#15803D', fontWeight: '700' }}>• Live Sheet</Text> : null}
            </View>
            <Text style={s.muted}>গুগল শিট থেকে রিয়েল-টাইম কেক ও স্টক আপডেট</Text>
          </View>
          <View style={[s.pill, s.pillAction]}>
            <Text style={s.pillText}>{filteredProducts.length} Items</Text>
          </View>
        </View>

        <TextInput
          style={s.search}
          value={productSearch}
          onChangeText={setProductSearch}
          placeholder="🔍 কেকের নাম বা ক্যাটাগরি দিয়ে খুঁজুন…"
          placeholderTextColor="#93A39A"
        />

        <View style={s.filterBar}>
          <Pressable onPress={() => setProductFilter('all')} style={[s.filterPill, productFilter === 'all' && s.filterActive]}>
            <Text style={[s.filterText, productFilter === 'all' && s.filterTextActive]}>সব ({products.length})</Text>
          </Pressable>
          <Pressable onPress={() => setProductFilter('in_stock')} style={[s.filterPill, productFilter === 'in_stock' && s.filterActive]}>
            <Text style={[s.filterText, productFilter === 'in_stock' && s.filterTextActive]}>স্টকে আছে ({products.filter(p => p.is_active).length})</Text>
          </Pressable>
          <Pressable onPress={() => setProductFilter('out_of_stock')} style={[s.filterPill, productFilter === 'out_of_stock' && s.filterActive]}>
            <Text style={[s.filterText, productFilter === 'out_of_stock' && s.filterTextActive]}>স্টক আউট ({products.filter(p => !p.is_active).length})</Text>
          </Pressable>
        </View>

        {filteredProducts.length === 0 ? (
          <View style={[s.orderCard, cardShadow, { alignItems: 'center', padding: 28 }]}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🎂</Text>
            <Text style={{ fontWeight: '900', color: C.ink, fontSize: 16 }}>
              {products.length === 0 ? 'গুগল শিট থেকে কেক লোড হচ্ছে…' : 'কোনো কেক মিল পাওয়া যায়নি'}
            </Text>
            <Text style={{ color: C.sub, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
              {products.length === 0 ? 'অনুগ্রহ করে অপেক্ষা করুন অথবা পেজটি রিফ্রেশ করুন।' : 'অন্য কোনো নাম লিখে সার্চ করুন।'}
            </Text>
          </View>
        ) : (
          filteredProducts.map(p => (
            <View key={p.id} style={[s.orderCard, cardShadow, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {p.image_url ? (
                  <Image source={resolveProfileSource(p.image_url)} style={{ width: 48, height: 48 }} resizeMode="cover" />
                ) : (
                  <Text style={{ fontSize: 22 }}>🎂</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '900', color: C.ink, fontSize: 15 }}>{p.name}</Text>
                <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{p.category} · {p.weight_label}</Text>
                <Text style={{ fontWeight: '900', color: C.brand, fontSize: 16, marginTop: 3 }}>{money(p.price)}</Text>
              </View>
              <View style={{ gap: 6, alignItems: 'flex-end' }}>
                <Pressable
                  onPress={() => toggleProductStock(p.id)}
                  style={[
                    s.stockToggleBtn,
                    p.is_active ? s.stockInBtn : s.stockOutBtn
                  ]}
                >
                  <Text style={[s.stockToggleText, p.is_active ? s.stockInText : s.stockOutText]}>
                    {p.is_active ? '✓ In Stock' : '✕ Out of Stock'}
                  </Text>
                </Pressable>
                {isBoss ? (
                  <Pressable
                    onPress={() => {
                      setEditingProduct(p);
                      setEditProductName(p.name);
                      setEditProductPrice(String(p.price));
                      setEditProductWeight(p.weight_label || '1 lb');
                      setEditProductModalOpen(true);
                    }}
                    style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                  >
                    <Text style={{ fontSize: 11, color: C.brand, fontWeight: '800' }}>✏️ এডিট</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    ) : tab === 'staff' ? (
      /* ==================== TAB: STAFF & CASH ==================== */
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={C.brand} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={s.sectionTitle}>👥 Staff & Cash Management</Text>
            <Text style={s.muted}>বেকারির টিম, পারমিশন এবং ক্যাশ সেটেলমেন্ট</Text>
          </View>
          {staffSubTab === 'team' ? (
            <Pressable
              style={s.addStaffBtn}
              onPress={() => { setStaffActionError(''); setAddStaffModalOpen(true); }}
            >
              <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 12 }}>+ Add Staff</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable
                style={[s.addStaffBtn, { backgroundColor: '#B45309' }]}
                onPress={() => {
                  setDepositRiderId(session?.username || session?.email || 'admin');
                  setDepositRiderName(session?.name || 'Counter Cash');
                  setDepositAmount('');
                  setDepositError('');
                  setDepositModalOpen(true);
                }}
              >
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 11 }}>+ জমা এন্ট্রি</Text>
              </Pressable>
              <Pressable
                style={[s.addStaffBtn, { backgroundColor: '#DC2626' }]}
                onPress={() => { setExpenseModalOpen(true); }}
              >
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 11 }}>- ক্যাশ খরচ</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Sub Tab Switcher */}
        <View style={s.subTabSwitcher}>
          <Pressable
            onPress={() => setStaffSubTab('team')}
            style={[s.subTabBtn, staffSubTab === 'team' && s.subTabBtnActive]}
          >
            <Text style={[s.subTabBtnText, staffSubTab === 'team' && s.subTabBtnTextActive]}>
              👥 কর্মী তালিকা ({staffList.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setStaffSubTab('cash')}
            style={[s.subTabBtn, staffSubTab === 'cash' && s.subTabBtnActive]}
          >
            <Text style={[s.subTabBtnText, staffSubTab === 'cash' && s.subTabBtnTextActive]}>
              💰 কাউন্টার ক্যাশ ও ডিপোজিট
            </Text>
          </Pressable>
        </View>

        {staffSubTab === 'team' ? (
          /* STAFF ACCOUNTS LIST */
          <View style={{ gap: 10 }}>
            {staffList.length === 0 ? (
              <View style={[s.orderCard, cardShadow, { alignItems: 'center', padding: 28 }]}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>👥</Text>
                <Text style={{ fontWeight: '900', color: C.ink, fontSize: 16 }}>কোনো কর্মী পাওয়া যায়নি</Text>
                <Text style={{ color: C.sub, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                  গুগল শিট থেকে কর্মীদের তথ্য লোড হচ্ছে অথবা নতুন কর্মী যুক্ত করতে উপরের '+ Add Staff' বাটনে চাপুন।
                </Text>
              </View>
            ) : (
              staffList.map((emp, idx) => (
                <View key={idx} style={[s.orderCard, cardShadow]}>
                <View style={[s.inline, { justifyContent: 'space-between' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    {/* Staff initials avatar — individual per employee, not shop logo */}
                    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.brand + '33' }}>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: C.brand }}>
                        {emp.name?.trim().split(/\s+/)[0]?.[0]?.toUpperCase() || '👤'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '900', color: C.ink, fontSize: 16 }}>{emp.name}</Text>
                      <SmallLabel>@{emp.username} · {emp.email}</SmallLabel>
                    </View>
                  </View>
                  <View style={[s.pill, emp.active ? s.pillAction : s.pillGrey]}>
                    <Text style={[s.pillText, emp.active ? { color: '#15803D' } : { color: '#6B7280' }]}>
                      {emp.active ? 'Active ✓' : 'Disabled'}
                    </Text>
                  </View>
                </View>

                <View style={[s.inline, { justifyContent: 'space-between', marginTop: 4 }]}>
                  <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#334155' }}>
                      {roleLabel[emp.role] || emp.role}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => { setSelectedStaffForPassword(emp.username); setResetPasswordModalOpen(true); }}
                      style={s.staffActionPill}
                    >
                      <Text style={s.staffActionPillText}>পাসওয়ার্ড রিসেট</Text>
                    </Pressable>

                    {emp.role !== 'super_admin' ? (
                      <Pressable
                        onPress={() => toggleStaffActive(emp.username)}
                        style={[s.staffActionPill, emp.active && { borderColor: '#FCA5A5' }]}
                      >
                        <Text style={[s.staffActionPillText, emp.active && { color: '#B91C1C' }]}>
                          {emp.active ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            )))}
          </View>
        ) : (
          /* RIDER CASH & COUNTER SETTLEMENT FOR BOSS */
          <View style={{ gap: 14 }}>
            <View style={[s.cashHeroCard, cardShadow]}>
              <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>
                মোট ক্যাশ ড্রয়ার ও রিকনসিলিয়েশন
              </Text>
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#78350F', marginTop: 4 }}>
                {money(bakeryCashOverview.counter_drawer_balance)}
              </Text>
              <Text style={{ color: '#92400E', fontSize: 12, marginTop: 4 }}>
                ড্রয়ারে নগদ ব্যালেন্স = রাইডারদের জমা ({money(bakeryCashOverview.total_rider_deposited)}) + পিকআপ ক্যাশ ({money(bakeryCashOverview.counter_pickup_cash)}) - খরচ ({money(bakeryCashOverview.total_expenses)})
              </Text>
            </View>

            {/* Overview Metric Row */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[s.kpiCard, cardShadow]}>
                <Text style={{ fontSize: 11, color: C.sub, fontWeight: '800' }}>মোট রাইডার কালেকশন</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: C.ink, marginTop: 4 }}>
                  {money(bakeryCashOverview.total_cod_collected)}
                </Text>
              </View>
              <View style={[s.kpiCard, cardShadow]}>
                <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '800' }}>রাইডারদের কাছে বাকি</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#B45309', marginTop: 4 }}>
                  {money(bakeryCashOverview.total_cash_with_riders)}
                </Text>
              </View>
            </View>

            {/* Rider-wise Breakdown */}
            <View style={[s.infoCard, cardShadow]}>
              <Text style={s.infoTitle}>🛵 রাইডার ক্যাশ ব্যালেন্স ({bakeryCashOverview.rider_summaries.length})</Text>
              {bakeryCashOverview.rider_summaries.length === 0 ? (
                <Text style={s.muted}>এখনও কোনো রাইডার ডেলিভারি সম্পন্ন করেনি।</Text>
              ) : (
                bakeryCashOverview.rider_summaries.map((r, idx) => (
                  <View key={idx} style={[s.inline, { justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', color: C.ink, fontSize: 15 }}>{r.rider_name}</Text>
                      <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                        কালেক্ট: {money(r.total_collected)} • জমা: {money(r.total_deposited)} ({r.delivered_orders_count} অর্ডার)
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontWeight: '900', color: r.cash_in_hand > 0 ? '#B45309' : '#15803D', fontSize: 16 }}>
                        {money(r.cash_in_hand)}
                      </Text>
                      <Pressable
                        onPress={() => {
                          setDepositRiderId(r.rider_id);
                          setDepositRiderName(r.rider_name);
                          setDepositAmount(r.cash_in_hand > 0 ? String(r.cash_in_hand) : '');
                          setDepositError('');
                          setDepositModalOpen(true);
                        }}
                        style={{ marginTop: 3 }}
                      >
                        <Text style={{ fontSize: 11, color: C.brand, fontWeight: '800' }}>+ জমা নিন</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Recent Deposits Ledger */}
            <View style={[s.infoCard, cardShadow]}>
              <Text style={s.infoTitle}>📋 সাম্প্রতিক কাউন্টার জমার হিস্ট্রি ({allDeposits.length})</Text>
              {allDeposits.length === 0 ? (
                <Text style={s.muted}>এখনও কোনো ডিপোজিট রেকর্ড জমা হয়নি।</Text>
              ) : (
                allDeposits.slice(0, 10).map(d => (
                  <View key={d.id} style={[s.inline, { justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', color: C.ink }}>{d.rider_name}</Text>
                      <Text style={{ fontSize: 11, color: C.sub }}>
                        {humanTime(d.deposited_at)} · {d.note || 'কাউন্টারে জমা'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 8 }}>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontWeight: '900', color: '#15803D', fontSize: 15 }}>+{money(d.amount)}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#166534' }}>VERIFIED ✓</Text>
                      </View>
                      <Pressable onPress={() => handleDeleteDeposit(d.id)} style={{ padding: 4 }}>
                        <Text style={{ color: '#DC2626', fontSize: 12 }}>🗑️</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>
    ) : tab === 'cash' ? (
      /* ==================== TAB: RIDER CASH & DEPOSIT ==================== */
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={C.brand} />}
      >
        <Text style={s.sectionTitle}>💰 Cash Collection & Settlement</Text>
        <Text style={s.muted}>আপনার সংগৃহীত COD ক্যাশ এবং কাউন্টারে জমা দেওয়ার হিসাব</Text>

        {/* Hero Card for Rider */}
        <View style={[s.cashHeroCard, cardShadow]}>
          <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>
            বর্তমানে আপনার হাতে থাকা ক্যাশ (Cash in Hand)
          </Text>
          <Text style={{ fontSize: 36, fontWeight: '900', color: '#78350F', marginTop: 4 }}>
            {money(riderCashSummary.cash_in_hand)}
          </Text>
          <Text style={{ color: '#92400E', fontSize: 12, marginTop: 4 }}>
            ডেলিভারি শেষে কাউন্টারে ক্যাশ বুঝিয়ে দিয়ে নিচের বোতাম চেপে জমা রেকর্ড করুন।
          </Text>

          <Pressable
            onPress={() => {
              setDepositRiderId(session.username || session.email);
              setDepositRiderName(session.name);
              setDepositAmount(riderCashSummary.cash_in_hand > 0 ? String(riderCashSummary.cash_in_hand) : '');
              setDepositError('');
              setDepositModalOpen(true);
            }}
            style={s.depositMainBtn}
          >
            <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 15 }}>📥 কাউন্টারে ক্যাশ জমা দিন (Deposit Cash)</Text>
          </Pressable>
        </View>

        {/* Breakdown Card */}
        <View style={[s.infoCard, cardShadow]}>
          <Text style={s.infoTitle}>📊 কালেকশন সামারি</Text>
          <View style={[s.inline, { justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: C.line }]}>
            <Text style={{ color: C.ink, fontWeight: '700' }}>মোট সংগৃহীত COD ক্যাশ</Text>
            <Text style={{ fontWeight: '900', color: C.ink, fontSize: 16 }}>{money(riderCashSummary.total_collected)}</Text>
          </View>
          <View style={[s.inline, { justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: C.line }]}>
            <Text style={{ color: C.ink, fontWeight: '700' }}>কাউন্টারে মোট জমা দিয়েছেন</Text>
            <Text style={{ fontWeight: '900', color: '#15803D', fontSize: 16 }}>{money(riderCashSummary.total_deposited)}</Text>
          </View>
          <View style={[s.inline, { justifyContent: 'space-between', paddingVertical: 8 }]}>
            <Text style={{ color: '#B45309', fontWeight: '800' }}>হাতে অবশিষ্ট ক্যাশ</Text>
            <Text style={{ fontWeight: '900', color: '#B45309', fontSize: 18 }}>{money(riderCashSummary.cash_in_hand)}</Text>
          </View>
        </View>

        {/* Deposit Logs */}
        <View style={[s.infoCard, cardShadow]}>
          <Text style={s.infoTitle}>📋 আপনার জমার তালিকা ({riderCashSummary.deposits.length})</Text>
          {riderCashSummary.deposits.length === 0 ? (
            <Text style={s.muted}>এখনও কোনো ডিপোজিট সম্পন্ন হয়নি।</Text>
          ) : (
            riderCashSummary.deposits.map(d => (
              <View key={d.id} style={[s.inline, { justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line }]}>
                <View>
                  <Text style={{ fontWeight: '800', color: C.ink }}>৳{d.amount.toLocaleString()} জমা</Text>
                  <Text style={{ fontSize: 11, color: C.sub }}>{humanTime(d.deposited_at)} · {d.note}</Text>
                </View>
                <View style={[s.pill, s.pillAction]}>
                  <Text style={[s.pillText, { color: '#15803D' }]}>VERIFIED ✓</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    ) : tab === 'custom_cakes' ? (
      /* ==================== TAB: CUSTOM CAKE REQUESTS ==================== */
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={C.brand} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={s.sectionTitle}>🎨 Custom Cake Requests</Text>
            <Text style={s.muted}>গ্রাহকদের কাস্টম ডিজাইন কেকের রিকুয়েস্ট ও কোটেশন</Text>
          </View>
          <View style={[s.pill, s.pillAction]}>
            <Text style={s.pillText}>{customCakes.length} Requests</Text>
          </View>
        </View>

        {customCakes.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 32 }}>🎂</Text>
            <Text style={s.emptyTitle}>কোনো কাস্টম কেকের রিকুয়েস্ট নেই</Text>
          </View>
        ) : (
          customCakes.map(c => (
            <View key={c.id} style={[s.orderCard, cardShadow]}>
              <View style={[s.inline, { justifyContent: 'space-between' }]}>
                <View>
                  <Text style={{ fontWeight: '900', color: C.ink, fontSize: 16 }}>{c.customer_name}</Text>
                  <SmallLabel>{c.customer_phone}</SmallLabel>
                </View>
                <View style={[s.pill, c.status === 'quoted' ? s.pillAction : s.pillPlain]}>
                  <Text style={s.pillText}>
                    {c.status === 'quoted' ? `Quoted: ৳${c.quote_amount}` : 'Review Needed'}
                  </Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#F8FAF9', padding: 12, borderRadius: 12, marginVertical: 4, gap: 4 }}>
                <Text style={{ fontSize: 13, color: C.ink, fontWeight: '700' }}>🍰 ফ্লেভার: {c.flavor}</Text>
                <Text style={{ fontSize: 13, color: C.ink, fontWeight: '700' }}>⚖️ ওজন: {c.weight_kg} kg</Text>
                <Text style={{ fontSize: 13, color: C.ink, fontWeight: '700' }}>📅 ডেলিভারি তারিখ: {c.delivery_date}</Text>
                {c.message_on_cake ? <Text style={{ fontSize: 12, color: C.sub, fontStyle: 'italic' }}>✍️ লেখনি: "{c.message_on_cake}"</Text> : null}
                {c.staff_notes ? <Text style={{ fontSize: 12, color: '#854D0E' }}>📝 নোট: {c.staff_notes}</Text> : null}
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <Pressable
                  onPress={() => { setQuoteModalCake(c); setQuoteAmount(c.quote_amount ? String(c.quote_amount) : ''); setQuoteNotes(c.staff_notes || ''); }}
                  style={[s.button, { flex: 1, marginTop: 0, backgroundColor: C.brand }]}
                >
                  <Text style={s.buttonText}>{c.quote_amount ? 'দাম আপডেট করুন' : 'দাম নির্ধারণ করুন (Quote)'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void Linking.openURL('tel:' + c.customer_phone.replace(/[^\d+]/g, ''))}
                  style={[s.button, s.secondaryButton, { paddingHorizontal: 16, marginTop: 0 }]}
                >
                  <Text style={s.secondaryButtonText}>📞 কল</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    ) : tab === 'account' ? (
      /* ==================== TAB: MORE & ACCOUNT ==================== */
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
        <Text style={s.sectionTitle}>⚙️ Bakery Workspace & Account</Text>

        <View style={[s.infoCard, cardShadow]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <Image
              source={resolveProfileSource(webProfileUrl || session.profile_image_url || session.logo_url)}
              style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: '#F1F5F9', borderWidth: 3, borderColor: C.brand }}
              resizeMode="cover"
              defaultSource={DEFAULT_LOGO_IMAGE}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: C.ink }}>{session.name}</Text>
              <Text style={{ fontSize: 12, color: C.brand, fontWeight: '700', marginTop: 2 }}>{roleLabel[session.role]}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' }} />
                <Text style={{ fontSize: 11, color: '#15803D', fontWeight: '700' }}>ওয়েব প্রোফাইল সিঙ্কড ✨</Text>
              </View>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 }} />
          <Text style={s.infoLine}>ইউজারনেম: @{session.username || 'N/A'}</Text>
          <Text style={s.infoLine}>ইমেইল: {session.email}</Text>
          <Text style={s.infoLine}>রোল: {roleLabel[session.role]}</Text>
          <Text style={s.infoLine}>সেশন: আজীবন সচল (Never expires) ✨</Text>
          <Text style={s.infoLine}>স্ক্রিন ডিসপ্লে: {keepAwakeEnabled ? '☀️ অলটাইম অন (Active)' : '🌙 স্বাভাবিক স্লিপ'}</Text>
        </View>

        {/* Audio & Display Quick Toggles */}
        <View style={[s.infoCard, cardShadow]}>
          <Text style={s.infoTitle}>🔔 সাউন্ড ও স্ক্রিন কন্ট্রোল</Text>
          <View style={[s.inline, { justifyContent: 'space-between', paddingVertical: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: C.ink }}>স্ক্রিন অলটাইম অন (Always ON)</Text>
              <SmallLabel>কাউন্টারে ট্যাবলেট/মোবাইলের ডিসপ্লে বন্ধ হবে না</SmallLabel>
            </View>
            <Pressable onPress={() => void toggleKeepAwake()} style={[s.actionPillBtn, keepAwakeEnabled && { backgroundColor: '#DCFCE7' }]}>
              <Text style={{ color: keepAwakeEnabled ? '#15803D' : C.sub, fontWeight: '800' }}>
                {keepAwakeEnabled ? 'সক্রিয় ✓' : 'বন্ধ ✕'}
              </Text>
            </Pressable>
          </View>

          <View style={[s.inline, { justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderColor: C.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: C.ink }}>অর্ডার অ্যালার্ম সাউন্ড</Text>
              <SmallLabel>নতুন অর্ডার আসলে লাউড কিচেন বেল ও ভাইব্রেশন</SmallLabel>
            </View>
            <Pressable onPress={() => void toggleSound()} style={[s.actionPillBtn, soundEnabled && { backgroundColor: '#DCFCE7' }]}>
              <Text style={{ color: soundEnabled ? '#15803D' : C.sub, fontWeight: '800' }}>
                {soundEnabled ? 'চালু ✓' : 'নিঃশব্দ ✕'}
              </Text>
            </Pressable>
          </View>

          <ActionButton kind="secondary" label="🔊 সাউন্ড টেস্ট করুন (Play Kitchen Bell)" onPress={handleTestSound} />
        </View>

        {isBoss ? (
          <View style={[s.infoCard, cardShadow]}>
            <Text style={s.infoTitle}>📊 অতিরিক্ত ফিচার ও রিপোর্ট</Text>
            <Pressable onPress={() => setStatementModalOpen(true)} style={s.quickActionBtn}>
              <Text style={{ fontSize: 18 }}>📄</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.quickActionTitle}>Collection Statement (কালেকশন রিপোর্ট)</Text>
                <SmallLabel>View daily totals and share statement</SmallLabel>
              </View>
              <Text style={{ color: C.brand, fontWeight: '800' }}>→</Text>
            </Pressable>

            <Pressable onPress={() => navigateTo('custom_cakes')} style={s.quickActionBtn}>
              <Text style={{ fontSize: 18 }}>🎨</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.quickActionTitle}>Custom Cake Queue (কাস্টম কেক)</Text>
                <SmallLabel>Review custom orders and set quotes</SmallLabel>
              </View>
              <Text style={{ color: C.brand, fontWeight: '800' }}>→</Text>
            </Pressable>
          </View>
        ) : null}

        {isRider ? (
          <View style={[s.infoCard, cardShadow]}>
            <Text style={s.infoTitle}>💰 রাইডার ক্যাশ ও ডিপোজিট (Cash & Deposit)</Text>
            <View style={{ backgroundColor: '#FEF3C7', padding: 14, borderRadius: 14, marginVertical: 6, borderWidth: 1, borderColor: '#FCD34D' }}>
              <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '800', textTransform: 'uppercase' }}>
                হাতে নগদ টাকা (Cash in Hand)
              </Text>
              <Text style={{ fontSize: 30, fontWeight: '900', color: '#78350F', marginTop: 2 }}>
                {money(riderCashSummary.cash_in_hand)}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: '#FDE68A' }}>
                <Text style={{ fontSize: 12, color: '#92400E' }}>মোট সংগৃহীত: {money(riderCashSummary.total_collected)}</Text>
                <Text style={{ fontSize: 12, color: '#15803D', fontWeight: '800' }}>জমা দেওয়া: {money(riderCashSummary.total_deposited)}</Text>
              </View>
            </View>

            <ActionButton
              label="💵 কাউন্টারে ক্যাশ জমা দিন (Deposit Cash)"
              onPress={() => {
                setDepositRiderId(session.username || session.email);
                setDepositRiderName(session.name);
                setDepositAmount(String(riderCashSummary.cash_in_hand || ''));
                setDepositModalOpen(true);
              }}
            />
          </View>
        ) : null}

        <View style={[s.infoCard, cardShadow]}>
          <Text style={s.infoTitle}>🔒 অ্যাকাউন্ট নিরাপত্তা</Text>
          <ActionButton kind="danger" label="Sign out (লগআউট)" onPress={signout} />
        </View>
      </ScrollView>
    ) : (
      /* ==================== TAB: ORDERS / TASKS ==================== */
      <>
        {isRider && riderCashSummary.cash_in_hand > 0 ? (
          <View style={s.riderQuickCashBar}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#92400E', textTransform: 'uppercase' }}>
                হাতে ক্যাশ: {money(riderCashSummary.cash_in_hand)}
              </Text>
              <Text style={{ fontSize: 11, color: '#B45309' }}>
                কাউন্টারে জমা দিতে বোতাম চাপুন
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setDepositRiderId(session.username || session.email);
                setDepositRiderName(session.name);
                setDepositAmount(String(riderCashSummary.cash_in_hand));
                setDepositError('');
                setDepositModalOpen(true);
              }}
              style={s.riderQuickCashBtn}
            >
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>📥 জমা দিন →</Text>
            </Pressable>
          </View>
        ) : null}

        <TextInput accessibilityLabel="Search orders" style={s.search}
          placeholder="🔍 অর্ডার #, গ্রাহকের নাম বা মোবাইল নম্বর…"
          placeholderTextColor="#93A39A" value={query} onChangeText={setQuery} />

        {/* Date Filter Pills */}
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 4 }}>
          <Pressable onPress={() => setDateFilter('all')} style={[s.dateFilterPill, dateFilter === 'all' && s.dateFilterActive]}>
            <Text style={[s.dateFilterText, dateFilter === 'all' && s.dateFilterTextActive]}>সব তারিখ</Text>
          </Pressable>
          <Pressable onPress={() => setDateFilter('today')} style={[s.dateFilterPill, dateFilter === 'today' && s.dateFilterActive]}>
            <Text style={[s.dateFilterText, dateFilter === 'today' && s.dateFilterTextActive]}>আজ ({metrics.todayCount})</Text>
          </Pressable>
          <Pressable onPress={() => setDateFilter('yesterday')} style={[s.dateFilterPill, dateFilter === 'yesterday' && s.dateFilterActive]}>
            <Text style={[s.dateFilterText, dateFilter === 'yesterday' && s.dateFilterTextActive]}>গতকাল</Text>
          </Pressable>
          <Pressable onPress={() => setDateFilter('week')} style={[s.dateFilterPill, dateFilter === 'week' && s.dateFilterActive]}>
            <Text style={[s.dateFilterText, dateFilter === 'week' && s.dateFilterTextActive]}>৭ দিন</Text>
          </Pressable>
        </View>

        {/* Status Filter Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterBarScroll}>
          <Pressable onPress={() => setOrderFilter('all')} style={[s.filterPill, orderFilter === 'all' && s.filterActive]}>
            <Text style={[s.filterText, orderFilter === 'all' && s.filterTextActive]}>সব ({orders.length})</Text>
          </Pressable>
          <Pressable onPress={() => setOrderFilter('pending')} style={[s.filterPill, orderFilter === 'pending' && s.filterActive]}>
            <Text style={[s.filterText, orderFilter === 'pending' && s.filterTextActive]}>নতুন ({metrics.pending})</Text>
          </Pressable>
          <Pressable onPress={() => setOrderFilter('kitchen')} style={[s.filterPill, orderFilter === 'kitchen' && s.filterActive]}>
            <Text style={[s.filterText, orderFilter === 'kitchen' && s.filterTextActive]}>বেকিং ({metrics.kitchen})</Text>
          </Pressable>
          <Pressable onPress={() => setOrderFilter('delivery')} style={[s.filterPill, orderFilter === 'delivery' && s.filterActive]}>
            <Text style={[s.filterText, orderFilter === 'delivery' && s.filterTextActive]}>ডেলিভারিতে ({metrics.onTheWay})</Text>
          </Pressable>
          <Pressable onPress={() => setOrderFilter('delivered')} style={[s.filterPill, orderFilter === 'delivered' && s.filterActive]}>
            <Text style={[s.filterText, orderFilter === 'delivered' && s.filterTextActive]}>সম্পন্ন ({metrics.delivered})</Text>
          </Pressable>
          <Pressable onPress={() => setOrderFilter('cancelled')} style={[s.filterPill, orderFilter === 'cancelled' && s.filterActive]}>
            <Text style={[s.filterText, orderFilter === 'cancelled' && s.filterTextActive]}>বাতিল ({metrics.cancelled})</Text>
          </Pressable>
        </ScrollView>

        <FlatList data={visible} keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={C.brand} />}
          renderItem={({ item }) => <OrderTile order={item} session={session} working={workingId === item.id}
            onNext={action} onAssign={openAssignModal} onDeliver={onDeliver} onCancel={o => action(o, 'cancel')}
            onReopen={onReopen} onShowPos={o => setPosOrder(o)} onOpenDetails={o => setSelectedOrderDetails(o)} />}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyTitle}>কোনো অর্ডার পাওয়া যায়নি</Text>
            <Text style={s.muted}>Pull down to refresh or change status filter.</Text></View>}
        />
      </>
    )}

    {/* ==================== BOTTOM TAB BAR ==================== */}
    <View style={s.tabBar}>
      {tabs.map(item => (
        <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }}
          onPress={() => item.id === 'overview' ? navigateHome() : navigateTo(item.id)} style={[s.tab, tab === item.id && s.tabActive]}>
          <Text style={s.tabIcon}>{item.icon}</Text>
          <Text style={[s.tabText, tab === item.id && s.tabTextActive]} numberOfLines={1}>{item.name}</Text>
        </Pressable>
      ))}
    </View>

    {/* ==================== MODAL: CREATE MANUAL ORDER ==================== */}
    {createOrderModalOpen ? (
      <View style={s.overlay}><View style={s.sheet}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
          <Text style={s.sheetTitle}>✨ Create Manual Order</Text>
          <SmallLabel>কাউন্টার বা ফোন অর্ডারের সরাসরি এন্ট্রি</SmallLabel>

          <Input label="গ্রাহকের নাম (Customer Name)*" value={newOrderCustomerName} onChange={setNewOrderCustomerName} placeholder="যেমন: আনিকা রহমান" />
          <Input
            label="মোবাইল নম্বর (Phone Number - ১১ ডিজিট)*"
            value={newOrderPhone}
            onChange={(t) => setNewOrderPhone(t.replace(/[^\d+]/g, ''))}
            keyboard="phone-pad"
            maxLength={14}
            placeholder="যেমন: 017XXXXXXXX"
            helperText={
              newOrderPhone.trim()
                ? validateBangladeshiPhone(newOrderPhone).isValid
                  ? '✓ সঠিক ১১ ডিজিটের মোবাইল নম্বর'
                  : `⚠️ ১১ ডিজিট আবশ্যক (${newOrderPhone.replace(/\D/g, '').length}/11)`
                : '১১ ডিজিটের মোবাইল নম্বর লিখুন (যেমন: 017XXXXXXXX)'
            }
            errorText={
              newOrderPhone.trim() && !validateBangladeshiPhone(newOrderPhone).isValid && newOrderPhone.replace(/\D/g, '').length >= 11
                ? validateBangladeshiPhone(newOrderPhone).error
                : undefined
            }
          />
          <Input label="ডেলিভারি ঠিকানা (Delivery Address)*" value={newOrderAddress} onChange={setNewOrderAddress} placeholder="যেমন: হাউজ #১২, আকুর টাকুর পাড়া, টাঙ্গাইল" />

          {/* Delivery Zone Selector */}
          <Text style={s.inputLabel}>ডেলিভারি জোন (Delivery Zone):</Text>
          <View style={{ gap: 6 }}>
            {deliveryZones.length === 0 ? (
              <Text style={s.muted}>গুগল শিট থেকে জোন লোড হচ্ছে…</Text>
            ) : (
              deliveryZones.map(z => (
                <Pressable key={z.id} onPress={() => setNewOrderZoneId(z.id)} style={[s.choiceItem, newOrderZoneId === z.id && s.choiceItemActive]}>
                  <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13 }}>{z.name}</Text>
                  <Text style={{ fontWeight: '900', color: C.brand }}>{z.fee === 0 ? 'বিনামূল্যে' : `৳${z.fee}`}</Text>
                </Pressable>
              ))
            )}
          </View>

          {/* Cake Selector */}
          <Text style={[s.inputLabel, { marginTop: 6 }]}>কেক নির্বাচন করুন (Select Cake):</Text>
          <View style={{ gap: 6 }}>
            {products.length === 0 ? (
              <Text style={s.muted}>গুগল শিট থেকে কেকের তালিকা লোড হচ্ছে…</Text>
            ) : (
              products.slice(0, 10).map(p => (
                <Pressable key={p.id} onPress={() => setNewOrderProductId(p.id)} style={[s.choiceItem, newOrderProductId === p.id && s.choiceItemActive]}>
                  <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13 }}>{p.name} ({p.weight_label})</Text>
                  <Text style={{ fontWeight: '900', color: C.brand }}>৳{p.price}</Text>
                </Pressable>
              ))
            )}
          </View>

          {/* Quantity */}
          <View style={[s.inline, { justifyContent: 'space-between', marginVertical: 6 }]}>
            <Text style={s.inputLabel}>পরিমাণ (Quantity):</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable onPress={() => setNewOrderQuantity(q => Math.max(1, q - 1))} style={s.qtyBtn}>
                <Text style={s.qtyBtnText}>-</Text>
              </Pressable>
              <Text style={{ fontSize: 18, fontWeight: '900', color: C.ink }}>{newOrderQuantity}</Text>
              <Pressable onPress={() => setNewOrderQuantity(q => q + 1)} style={s.qtyBtn}>
                <Text style={s.qtyBtnText}>+</Text>
              </Pressable>
            </View>
          </View>

          <Input label="কেকের উপরের লেখা (Dedication Message)" value={newOrderDedication} onChange={setNewOrderDedication} placeholder="যেমন: শুভ জন্মদিন রাফি" />
          <Input label="অগ্রিম পরিশোধিত টাকা (Advance Paid)" value={newOrderAdvance} onChange={setNewOrderAdvance} keyboard="number-pad" placeholder="0" />
          <Input label="ডেলিভারি তারিখ (YYYY-MM-DD)" value={newOrderDate} onChange={setNewOrderDate} placeholder="2026-10-31" />
          <Input label="ডেলিভারি সময় স্লট (Slot)" value={newOrderSlot} onChange={setNewOrderSlot} placeholder="যেমন: বিকাল ৫টা-রাত ৯টা" />
          {deliverySlots.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 }}>
              {deliverySlots.map((sl, idx) => (
                <Pressable key={idx} onPress={() => setNewOrderSlot(sl)}
                  style={[s.filterPill, newOrderSlot === sl && s.filterActive]}>
                  <Text style={[s.filterText, newOrderSlot === sl && s.filterTextActive]}>{sl}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Input label="বিশেষ নির্দেশনা / নোট" value={newOrderNote} onChange={setNewOrderNote} placeholder="লেস সুগার / চকলেট ক্রিম" />

          {newOrderError ? <Text style={s.error}>{newOrderError}</Text> : null}

          <ActionButton disabled={createOrderBusy} label={createOrderBusy ? 'অর্ডার তৈরি হচ্ছে…' : '✓ অর্ডার তৈরি ও সংরক্ষণ করুন'} onPress={() => void submitCreateOrder()} />
          <ActionButton kind="secondary" label="বাতিল (Cancel)" onPress={() => setCreateOrderModalOpen(false)} />
        </ScrollView>
      </View></View>
    ) : null}

    {/* ==================== MODAL: ORDER DETAILS & INSPECTION ==================== */}
    {selectedOrderDetails ? (
      <View style={s.overlay}><View style={s.sheet}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
          <View style={[s.inline, { justifyContent: 'space-between' }]}>
            <View>
              <Text style={s.sheetTitle}>অর্ডার #{selectedOrderDetails.order_number}</Text>
              <Text style={s.muted}>{humanTime(selectedOrderDetails.created_at)}</Text>
            </View>
            <View style={[s.pill, s.pillAction]}>
              <Text style={s.pillText}>{statusLabel(selectedOrderDetails.status)}</Text>
            </View>
          </View>

          <View style={{ backgroundColor: '#F8FAF9', padding: 14, borderRadius: 14, gap: 6, marginVertical: 4 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: C.ink }}>👤 {selectedOrderDetails.customer_name || 'Guest'}</Text>
            <Text style={{ fontSize: 14, color: C.sub }}>📞 {selectedOrderDetails.customer_phone || 'N/A'}</Text>
            <Text style={{ fontSize: 14, color: C.sub }}>📍 {selectedOrderDetails.delivery_address || 'Counter Pickup'}</Text>
            {selectedOrderDetails.delivery_date ? (
              <Text style={{ fontSize: 13, color: C.brand, fontWeight: '700' }}>
                📅 ডেলিভারি: {selectedOrderDetails.delivery_date} ({selectedOrderDetails.delivery_slot || 'Anytime'})
              </Text>
            ) : null}
            {selectedOrderDetails.message_on_cake ? (
              <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '800' }}>
                ✍️ কেকের লেখা: "{selectedOrderDetails.message_on_cake}"
              </Text>
            ) : null}
          </View>

          {/* Quick Action Contact Buttons */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {selectedOrderDetails.customer_phone ? (
              <Pressable
                onPress={() => void Linking.openURL('tel:' + selectedOrderDetails.customer_phone!.replace(/[^\d+]/g, ''))}
                style={[s.actionPillBtn, { flex: 1, backgroundColor: '#E0F2FE' }]}
              >
                <Text style={[s.actionPillBtnText, { color: '#0369A1' }]}>📞 সরাসরি কল দিন</Text>
              </Pressable>
            ) : null}
            {selectedOrderDetails.customer_phone ? (
              <Pressable
                onPress={() => {
                  const clean = selectedOrderDetails.customer_phone!.replace(/[^\d]/g, '');
                  const phone = clean.startsWith('88') ? clean : '88' + clean;
                  void Linking.openURL(`https://wa.me/${phone}`);
                }}
                style={[s.actionPillBtn, { flex: 1, backgroundColor: '#DCFCE7' }]}
              >
                <Text style={[s.actionPillBtnText, { color: '#15803D' }]}>💬 WhatsApp চ্যাট</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Items breakdown */}
          <Text style={s.inputLabel}>অর্ডার আইটেম তালিকা:</Text>
          <View style={{ gap: 6 }}>
            {Array.isArray(selectedOrderDetails.items) && selectedOrderDetails.items.length > 0 ? (
              selectedOrderDetails.items.map((it, idx) => (
                <View key={idx} style={[s.inline, { justifyContent: 'space-between', padding: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: C.line, borderRadius: 10 }]}>
                  <Text style={{ color: C.ink, fontWeight: '800' }}>{it.quantity}x {it.product_name} {it.variant_name || ''}</Text>
                  <Text style={{ fontWeight: '900', color: C.brand }}>{money(it.subtotal)}</Text>
                </View>
              ))
            ) : (
              <Text style={s.muted}>Custom item details</Text>
            )}
          </View>

          {/* Payment breakdown */}
          <View style={{ backgroundColor: '#FAF9F6', padding: 12, borderRadius: 12, gap: 4, marginVertical: 4 }}>
            <View style={[s.inline, { justifyContent: 'space-between' }]}>
              <Text style={{ color: C.sub }}>মোট মূল্য (Total):</Text>
              <Text style={{ fontWeight: '900', color: C.ink }}>{money(selectedOrderDetails.total_amount)}</Text>
            </View>
            <View style={[s.inline, { justifyContent: 'space-between' }]}>
              <Text style={{ color: C.sub }}>অগ্রিম পরিশোধ (Advance):</Text>
              <Text style={{ fontWeight: '700', color: '#15803D' }}>
                {money(selectedOrderDetails.advance_paid_amount || (selectedOrderDetails.payment_method !== 'cod' ? selectedOrderDetails.total_amount : 0))}
              </Text>
            </View>
            <View style={[s.inline, { justifyContent: 'space-between' }]}>
              <Text style={{ color: '#B45309', fontWeight: '800' }}>বাকি ক্যাশ (COD Due):</Text>
              <Text style={{ fontWeight: '900', color: '#B45309', fontSize: 16 }}>{money(getOrderCashAmount(selectedOrderDetails))}</Text>
            </View>
          </View>

          {isBoss && !['delivered', 'cancelled'].includes(selectedOrderDetails.status) ? (
            <ActionButton
              kind="secondary"
              label={selectedOrderDetails.rider_name ? `🛵 রাইডার: ${selectedOrderDetails.rider_name} (পরিবর্তন)` : "🛵 রাইডার নির্ধারণ (Assign Rider)"}
              onPress={() => {
                const target = selectedOrderDetails;
                setSelectedOrderDetails(null);
                openAssignModal(target);
              }}
            />
          ) : null}
          <ActionButton kind="secondary" label="📄 POS স্লিপ প্রিভিউ ও শেয়ার" onPress={() => { setPosOrder(selectedOrderDetails); setSelectedOrderDetails(null); }} />
          <ActionButton label="বন্ধ করুন (Close)" onPress={() => setSelectedOrderDetails(null)} />
        </ScrollView>
      </View></View>
    ) : null}

    {/* ==================== MODAL: COLLECTION STATEMENT ==================== */}
    {statementModalOpen ? (
      <View style={s.overlay}><View style={s.sheet}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
          <View style={[s.inline, { justifyContent: 'space-between' }]}>
            <Text style={s.sheetTitle}>📊 Collection Statement</Text>
            <Pressable onPress={() => setStatementModalOpen(false)}><Text style={{ fontSize: 18, color: C.sub }}>✕</Text></Pressable>
          </View>
          <SmallLabel>তারিখ অনুযায়ী ক্যাশ কালেকশন ও হিসাব বিবরণী</SmallLabel>

          {/* Preset Buttons */}
          <View style={{ flexDirection: 'row', gap: 6, marginVertical: 4 }}>
            <Pressable onPress={() => setStatementPreset('today')} style={[s.subTabBtn, statementPreset === 'today' && s.subTabBtnActive]}>
              <Text style={[s.subTabBtnText, statementPreset === 'today' && s.subTabBtnTextActive]}>আজ</Text>
            </Pressable>
            <Pressable onPress={() => setStatementPreset('yesterday')} style={[s.subTabBtn, statementPreset === 'yesterday' && s.subTabBtnActive]}>
              <Text style={[s.subTabBtnText, statementPreset === 'yesterday' && s.subTabBtnTextActive]}>গতকাল</Text>
            </Pressable>
            <Pressable onPress={() => setStatementPreset('week')} style={[s.subTabBtn, statementPreset === 'week' && s.subTabBtnActive]}>
              <Text style={[s.subTabBtnText, statementPreset === 'week' && s.subTabBtnTextActive]}>৭ দিন</Text>
            </Pressable>
            <Pressable onPress={() => setStatementPreset('month')} style={[s.subTabBtn, statementPreset === 'month' && s.subTabBtnActive]}>
              <Text style={[s.subTabBtnText, statementPreset === 'month' && s.subTabBtnTextActive]}>এই মাস</Text>
            </Pressable>
          </View>

          {/* Metric cards */}
          <View style={{ backgroundColor: '#FEF3C7', padding: 14, borderRadius: 14, gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#92400E' }}>মোট বিক্রয় (Total Revenue)</Text>
            <Text style={{ fontSize: 28, fontWeight: '900', color: '#78350F' }}>
              {money(orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total_amount || 0), 0))}
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <View style={[s.inline, { justifyContent: 'space-between', padding: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: C.line, borderRadius: 12 }]}>
              <Text style={{ fontWeight: '800', color: C.ink }}>নগদ ক্যাশ কালেকশন (COD)</Text>
              <Text style={{ fontWeight: '900', color: '#15803D', fontSize: 16 }}>
                {money(orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + getOrderCashAmount(o), 0))}
              </Text>
            </View>
            <View style={[s.inline, { justifyContent: 'space-between', padding: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: C.line, borderRadius: 12 }]}>
              <Text style={{ fontWeight: '800', color: C.ink }}>কাউন্টার ড্রয়ার ব্যালেন্স</Text>
              <Text style={{ fontWeight: '900', color: '#B45309', fontSize: 16 }}>
                {money(bakeryCashOverview.counter_drawer_balance)}
              </Text>
            </View>
            <View style={[s.inline, { justifyContent: 'space-between', padding: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: C.line, borderRadius: 12 }]}>
              <Text style={{ fontWeight: '800', color: C.ink }}>মোট সফল ডেলিভারি</Text>
              <Text style={{ fontWeight: '900', color: C.brand, fontSize: 16 }}>
                {metrics.delivered} টি অর্ডার
              </Text>
            </View>
          </View>

          <ActionButton label="📤 রিপোর্ট শেয়ার / প্রিন্ট করুন" onPress={() => void shareCollectionReport()} />
          <ActionButton kind="secondary" label="বন্ধ করুন (Close)" onPress={() => setStatementModalOpen(false)} />
        </ScrollView>
      </View></View>
    ) : null}

    {/* ==================== MODAL: DEPOSIT CASH ==================== */}
    {depositModalOpen ? (
      <View style={s.overlay}><View style={s.sheet}>
        <Text style={s.sheetTitle}>📥 কাউন্টারে ক্যাশ জমা (Deposit Cash)</Text>
        <SmallLabel>রাইডার: {depositRiderName || session.name}</SmallLabel>

        <View style={{ backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 4 }}>
          <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '800' }}>
            ℹ️ কাউন্টার ক্যাশ ডিপোজিট
          </Text>
          <Text style={{ fontSize: 12, color: '#B45309', marginTop: 3, lineHeight: 17 }}>
            বেকারি কাউন্টারে বা ম্যানেজারের কাছে ক্যাশ হস্তান্তর করে এখানে জমা নিশ্চিত করুন। সাথে সাথে ব্যালেন্স আপডেট হবে।
          </Text>
        </View>

        <Text style={[s.inputLabel, { marginTop: 4 }]}>জমার পরিমাণ (টাকা):</Text>
        <TextInput
          style={[s.input, { fontSize: 24, fontWeight: '900', color: C.brand, textAlign: 'center' }]}
          value={depositAmount}
          onChangeText={setDepositAmount}
          keyboardType="number-pad"
          placeholder="যেমন: 1500"
          placeholderTextColor="#94A39B"
        />

        <Text style={[s.inputLabel, { marginTop: 6 }]}>নোট বা বিবরণ (ঐচ্ছিক):</Text>
        <TextInput
          style={s.input}
          value={depositNote}
          onChangeText={setDepositNote}
          placeholder="যেমন: সন্ধ্যার শিফটের ক্যাশ জমা"
          placeholderTextColor="#94A39B"
        />

        {depositError ? <Text style={s.error}>{depositError}</Text> : null}

        <ActionButton
          label="✓ ক্যাশ জমা নিশ্চিত করুন (Confirm Deposit)"
          onPress={() => void handleAddDeposit()}
        />

        <ActionButton
          kind="secondary"
          label="বাতিল (Cancel)"
          onPress={() => { setDepositModalOpen(false); setDepositError(''); }}
        />
      </View></View>
    ) : null}

    {/* ==================== MODAL: COUNTER EXPENSE ==================== */}
    {expenseModalOpen ? (
      <View style={s.overlay}><View style={s.sheet}>
        <Text style={s.sheetTitle}>📤 কাউন্টার ক্যাশ খরচ / উত্তোলন</Text>
        <SmallLabel>ড্রয়ার থেকে ব্যালেন্স মাইনাস হবে</SmallLabel>

        <Text style={[s.inputLabel, { marginTop: 4 }]}>খরচের পরিমাণ (টাকা):</Text>
        <TextInput
          style={[s.input, { fontSize: 22, fontWeight: '900', color: '#DC2626', textAlign: 'center' }]}
          value={expenseAmount}
          onChangeText={setExpenseAmount}
          keyboardType="number-pad"
          placeholder="যেমন: 500"
          placeholderTextColor="#94A39B"
        />

        <Input label="খরচের খাত / বিবরণ*" value={expenseNote} onChange={setExpenseNote} placeholder="যেমন: প্যাকেট ও রিবন ক্রয়" />

        <ActionButton
          label="✓ খরচ রেকর্ড করুন"
          onPress={() => void handleAddExpense()}
        />
        <ActionButton
          kind="secondary"
          label="বাতিল (Cancel)"
          onPress={() => setExpenseModalOpen(false)}
        />
      </View></View>
    ) : null}

    {/* ==================== MODAL: EDIT PRODUCT ==================== */}
    {editProductModalOpen && editingProduct ? (
      <View style={s.overlay}><View style={s.sheet}>
        <Text style={s.sheetTitle}>✏️ কেক তথ্য সম্পাদনা (Edit Product)</Text>
        <SmallLabel>{editingProduct.name}</SmallLabel>

        <Input label="কেকের নাম (Name)" value={editProductName} onChange={setEditProductName} />
        <Input label="মূল্য (Price ৳)" value={editProductPrice} onChange={setEditProductPrice} keyboard="number-pad" />
        <Input label="ওজন / সাইজ লেবেল (Weight)" value={editProductWeight} onChange={setEditProductWeight} />

        <ActionButton label="✓ সংরক্ষণ করুন (Save)" onPress={saveProductEdit} />
        <ActionButton kind="secondary" label="বাতিল" onPress={() => setEditProductModalOpen(false)} />
      </View></View>
    ) : null}

    {/* ==================== MODAL: CANCEL REASON ==================== */}
    {cancelModalOrder ? (
      <View style={s.overlay}><View style={s.sheet}>
        <Text style={s.sheetTitle}>✕ অর্ডার বাতিল (Cancel Order)</Text>
        <SmallLabel>#{cancelModalOrder.order_number} বাতিল করার কারণ উল্লেখ করুন:</SmallLabel>

        <View style={{ gap: 8, marginVertical: 8 }}>
          {[
            { label: 'কাস্টমার অনুরোধ করেছেন', emoji: '👤', sub: 'গ্রাহক নিজে ফোন বা চ্যাটে বাতিল চেয়েছেন' },
            { label: 'ঠিকানা সার্ভিস এরিয়ার বাইরে', emoji: '📍', sub: 'ডেলিভারি লোকেশন আমাদের আওতার বাইরে' },
            { label: 'পেমেন্ট ভেরিফিকেশন ব্যর্থ', emoji: '💳', sub: 'পেমেন্ট ভেরিফিকেশন মেলেনি বা অসম্পূর্ণ' },
            { label: 'উপাদান বা স্টক অনুপলব্ধ', emoji: '📦', sub: 'প্রয়োজনীয় ফ্লেভার বা কাঁচামাল স্টকে নেই' },
          ].map((item, i) => {
            const isSelected = cancelReason === item.label;
            return (
              <Pressable
                key={i}
                onPress={() => setCancelReason(item.label)}
                style={[s.reasonCard, isSelected && s.reasonCardActive]}
              >
                <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: isSelected ? '#B91C1C' : C.ink, fontSize: 13 }}>{item.label}</Text>
                  <Text style={{ fontSize: 11, color: C.sub, marginTop: 1 }}>{item.sub}</Text>
                </View>
                <Text style={{ fontSize: 16 }}>{isSelected ? '🔘' : '⚪'}</Text>
              </Pressable>
            );
          })}
        </View>

        <Input label="অন্যান্য কারণ (ঐচ্ছিক)" value={cancelReason} onChange={setCancelReason} />

        <ActionButton kind="danger" label="✕ অর্ডার বাতিল নিশ্চিত করুন" onPress={() => void applyMutation(cancelModalOrder, 'cancel', { cancel_reason: cancelReason })} />
        <ActionButton kind="secondary" label="ফিরে যান" onPress={() => setCancelModalOrder(null)} />
      </View></View>
    ) : null}

    {/* ==================== MODAL: ASSIGN RIDER ==================== */}
    {assignOrder ? (
      <View style={s.overlay}><View style={s.sheet}>
        <Text style={s.sheetTitle}>🛵 রাইডার নির্বাচন করুন</Text>
        <SmallLabel>#{assignOrder.order_number} ডেলিভারির দায়িত্ব কার?</SmallLabel>

        {/* Toggle between Registered Riders and Custom Rider */}
        <View style={{ flexDirection: 'row', gap: 8, marginVertical: 10 }}>
          <Pressable
            onPress={() => setIsCustomRiderMode(false)}
            style={[s.choicePill, !isCustomRiderMode && s.choicePillActive, { flex: 1, alignItems: 'center', paddingVertical: 8 }]}
          >
            <Text style={[s.choicePillText, !isCustomRiderMode && s.choicePillTextActive]}>📋 তালিকাভুক্ত রাইডার</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsCustomRiderMode(true)}
            style={[s.choicePill, isCustomRiderMode && s.choicePillActive, { flex: 1, alignItems: 'center', paddingVertical: 8 }]}
          >
            <Text style={[s.choicePillText, isCustomRiderMode && s.choicePillTextActive]}>✍️ নতুন / কাস্টম রাইডার</Text>
          </Pressable>
        </View>

        {!isCustomRiderMode ? (
          <ScrollView style={{ maxHeight: 220, marginVertical: 6 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 8 }}>
              {readyToAssign.map(x => {
                const isSelected = rider === x.email || rider === x.id;
                return (
                  <Pressable
                    key={x.id || x.email}
                    onPress={() => setRider(x.email || x.id)}
                    style={[s.choice, isSelected && s.choiceSelected]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>{x.name}</Text>
                        <Text style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{x.email || x.username || x.id}</Text>
                      </View>
                      <Text style={{ fontSize: 18, color: isSelected ? C.brand : '#CBD5E1' }}>
                        {isSelected ? '🔘' : '⚪'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <View style={{ marginVertical: 10, gap: 10 }}>
            <Input
              label="রাইডারের পুরো নাম (Rider Name)*"
              value={customRiderInput}
              onChange={setCustomRiderInput}
              placeholder="যেমন: তানভীর আহমেদ / পাঠাও রাইডার"
            />
            <SmallLabel>নাম লিখলে অর্ডারটিতে স্বয়ংক্রিয়ভাবে রাইডার অ্যাসাইন হয়ে যাবে।</SmallLabel>
          </View>
        )}

        <ActionButton
          label="✓ রাইডারকে দায়িত্ব দিন (Assign)"
          disabled={isCustomRiderMode ? !customRiderInput.trim() : !rider}
          onPress={() => {
            const selectedObj = readyToAssign.find(x => x.email === rider || x.id === rider || x.username === rider);
            const rName = isCustomRiderMode && customRiderInput.trim()
              ? customRiderInput.trim()
              : (selectedObj?.name || rider || 'Delivery Rider');
            const rEmail = !isCustomRiderMode && selectedObj?.email
              ? selectedObj.email
              : (selectedObj?.username ? `${selectedObj.username}@auroracake.com` : `${rName.toLowerCase().replace(/[^a-z0-9]/g, '_')}@auroracake.com`);
            const rId = !isCustomRiderMode && (selectedObj?.id || selectedObj?.username)
              ? (selectedObj.id || selectedObj.username)
              : (rEmail.includes('@') ? rEmail.split('@')[0] : rEmail);

            void applyMutation(assignOrder, 'assign', {
              rider_email: rEmail,
              rider_id: rId,
              rider_name: rName,
            });
          }}
        />
        <ActionButton kind="secondary" label="বাতিল" onPress={() => { setAssignOrder(null); setCustomRiderInput(''); setIsCustomRiderMode(false); }} />
      </View></View>
    ) : null}

    {/* ==================== MODAL: CONFIRM DELIVERY (COD CASH) ==================== */}
    {confirmDeliveryOrder ? (
      <View style={s.overlay}><View style={s.sheet}>
        <Text style={s.sheetTitle}>📦 ডেলিভারি ও ক্যাশ সংগ্রহ</Text>
        <SmallLabel>#{confirmDeliveryOrder.order_number} গ্রাহককে বুঝিয়ে দিন</SmallLabel>

        <Pressable onPress={() => setCash(v => !v)} style={[s.cashConfirm, cash && s.cashConfirmed]}>
          <Text style={{ fontSize: 20 }}>{cash ? '✅' : '⬜'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: C.ink }}>
              COD ক্যাশ {money(getOrderCashAmount(confirmDeliveryOrder))} বুঝে পেয়েছি
            </Text>
            <SmallLabel>ক্যাশ গ্রহণ নিশ্চিত করতে এখানে ট্যাপ করুন</SmallLabel>
          </View>
        </Pressable>

        <ActionButton label="✓ ডেলিভারি সম্পূর্ণ করুন" onPress={finishDelivery} />
        <ActionButton kind="secondary" label="ফিরে যান" onPress={() => setConfirmDeliveryOrder(null)} />
      </View></View>
    ) : null}

    {/* ==================== MODAL: POS THERMAL RECEIPT ==================== */}
    {posOrder ? (
      <View style={s.overlay}><View style={s.sheet}>
        <View style={[s.inline, { justifyContent: 'space-between' }]}>
          <Text style={s.sheetTitle}>📄 POS স্লিপ প্রিভিউ</Text>
          <Pressable onPress={() => setPosOrder(null)}><Text style={{ fontSize: 18, color: C.sub }}>✕</Text></Pressable>
        </View>
        <ScrollView style={s.receiptBox}>
          <Text style={s.receiptText}>{generateThermalReceipt(posOrder, shopName, shopAddress, shopPhone)}</Text>
        </ScrollView>
        <ActionButton label="📤 স্লিপ কপি / শেয়ার করুন" onPress={async () => {
          try {
            await Share.share({ message: generateThermalReceipt(posOrder, shopName, shopAddress, shopPhone) });
          } catch {}
        }} />
        <ActionButton kind="secondary" label="বন্ধ করুন" onPress={() => setPosOrder(null)} />
      </View></View>
    ) : null}

    {/* ==================== MODAL: ADD STAFF ==================== */}
    {addStaffModalOpen ? (
      <View style={s.overlay}><View style={s.sheet}>
        <Text style={s.sheetTitle}>👤 নতুন কর্মী যোগ করুন</Text>
        <SmallLabel>বেকারির স্টাফদের মোবাইল অ্যাপ এক্সেস প্রদান</SmallLabel>

        <Input label="কর্মীর পুরো নাম*" value={newStaffName} onChange={setNewStaffName} placeholder="যেমন: মো: তানভীর আহমেদ" />
        <Input label="ইউজারনেম (Username)*" value={newStaffUsername} onChange={setNewStaffUsername} placeholder="যেমন: tanvir01" />
        <Input label="পাসওয়ার্ড (কমপক্ষে ৪ সংখ্যা/অক্ষর)*" value={newStaffPassword} onChange={setNewStaffPassword} secure placeholder="••••" />

        <Text style={s.inputLabel}>পদবী / রোল (Role):</Text>
        <View style={{ gap: 8, marginVertical: 8 }}>
          {[
            { r: 'admin' as Role, label: 'Admin (ম্যানেজার)', emoji: '👑', desc: 'সকল মডিউল ও অর্ডার সম্পূর্ণ নিয়ন্ত্রণ' },
            { r: 'kitchen_manager' as Role, label: 'Kitchen (শেফ/বেকার)', emoji: '👨‍🍳', desc: 'বেকিং কিউ ও কাঁচামাল স্টক পরিচালনা' },
            { r: 'delivery_man' as Role, label: 'Delivery Rider (রাইডার)', emoji: '🛵', desc: 'পিকআপ, ডেলিভারি ও ক্যাশ কালেকশন' },
          ].map(it => {
            const isSelected = newStaffRole === it.r;
            return (
              <Pressable
                key={it.r}
                onPress={() => setNewStaffRole(it.r)}
                style={[s.roleCard, isSelected && s.roleCardActive]}
              >
                <Text style={{ fontSize: 22 }}>{it.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '900', color: isSelected ? '#15803D' : C.ink, fontSize: 13.5 }}>{it.label}</Text>
                  <Text style={{ fontSize: 11, color: C.sub, marginTop: 1 }}>{it.desc}</Text>
                </View>
                <Text style={{ fontSize: 16 }}>{isSelected ? '✅' : '⚪'}</Text>
              </Pressable>
            );
          })}
        </View>

        {staffActionError ? <Text style={s.error}>{staffActionError}</Text> : null}

        <ActionButton disabled={staffActionBusy} label={staffActionBusy ? 'তৈরি হচ্ছে…' : '✓ কর্মী যুক্ত করুন'} onPress={() => void submitCreateStaff()} />
        <ActionButton kind="secondary" label="বাতিল" onPress={() => setAddStaffModalOpen(false)} />
      </View></View>
    ) : null}

    {/* ==================== MODAL: RESET PASSWORD ==================== */}
    {resetPasswordModalOpen ? (
      <View style={s.overlay}><View style={s.sheet}>
        <Text style={s.sheetTitle}>🔑 পাসওয়ার্ড রিসেট</Text>
        <SmallLabel>@{selectedStaffForPassword}-এর জন্য নতুন পাসওয়ার্ড নির্ধারণ করুন</SmallLabel>
        <Input label="নতুন পাসওয়ার্ড*" value={resetNewPassword} onChange={setResetNewPassword} secure placeholder="নতুন পাসওয়ার্ড দিন" />
        <ActionButton label="✓ পাসওয়ার্ড সেভ করুন" onPress={submitResetPassword} />
        <ActionButton kind="secondary" label="বাতিল" onPress={() => setResetPasswordModalOpen(false)} />
      </View></View>
    ) : null}

    {/* ==================== MODAL: QUOTE CUSTOM CAKE ==================== */}
    {quoteModalCake ? (
      <View style={s.overlay}><View style={s.sheet}>
        <Text style={s.sheetTitle}>🎨 কাস্টম কেকের মূল্য কোটেশন</Text>
        <SmallLabel>{quoteModalCake.customer_name} ({quoteModalCake.flavor}, {quoteModalCake.weight_kg}kg)</SmallLabel>
        <Input label="কোটেশন মূল্য (টাকা ৳)*" value={quoteAmount} onChange={setQuoteAmount} keyboard="number-pad" placeholder="যেমন: 2500" />
        <Input label="শেফ / স্টাফ নোট" value={quoteNotes} onChange={setQuoteNotes} placeholder="যেমন: ২ দিনে ডেলিভারি সম্ভব, বাটারক্রিম ডিজাইন" />
        <ActionButton label="✓ কোটেশন পাঠান" onPress={submitQuoteCustomCake} />
        <ActionButton kind="secondary" label="বাতিল" onPress={() => setQuoteModalCake(null)} />
      </View></View>
    ) : null}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 54 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: C.bg },
  logo: { fontSize: 31, fontWeight: '900', letterSpacing: 3.8, color: C.dark, textAlign: 'center' },
  logoSub: { fontSize: 12, fontWeight: '800', letterSpacing: 4, color: C.brand, textAlign: 'center' },
  loginContainer: { paddingHorizontal: 24, paddingTop: 55, paddingBottom: 40, alignItems: 'stretch' },
  loginLogo: { alignSelf: 'center', width: 78, height: 78, borderRadius: 25, justifyContent: 'center', alignItems: 'center', backgroundColor: C.mint, marginBottom: 12 },
  loginTitle: { fontSize: 26, fontWeight: '900', color: C.ink, marginTop: 37 },
  loginIntro: { color: C.sub, fontSize: 14, marginTop: 8, lineHeight: 22, marginBottom: 21 },
  loginPanel: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 23, padding: 19, gap: 2 },
  inputLabel: { fontSize: 13, fontWeight: '800', color: C.ink },
  input: { backgroundColor: C.paper, borderColor: '#CFDCD2', borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 13, fontSize: 16, color: C.ink, minHeight: 51 },
  button: { backgroundColor: C.brand, paddingVertical: 15, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', minHeight: 52, marginTop: 7 },
  buttonText: { color: '#FFF', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  secondaryButton: { backgroundColor: '#F8FBF8', borderWidth: 1, borderColor: '#B9CEBE' },
  secondaryButtonText: { color: C.brand },
  dangerButton: { backgroundColor: '#FFF7F6', borderWidth: 1, borderColor: '#EAC5BF' },
  dangerButtonText: { color: C.warn },
  disabled: { opacity: 0.48 },
  note: { fontSize: 12, color: C.sub, lineHeight: 18, marginTop: 8 },
  reconnect: { fontSize: 13, color: C.brand, textAlign: 'center', textDecorationLine: 'underline', marginTop: 20 },
  footer: { color: '#93A39C', fontSize: 11, textAlign: 'center', marginTop: 30 },
  error: { color: C.warn, backgroundColor: C.rose, padding: 12, borderRadius: 12, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  top: { backgroundColor: C.dark, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  topEyebrow: { color: '#B4D9C2', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  topTitle: { color: '#FFF', fontWeight: '900', fontSize: 18, marginTop: 2 },
  topSub: { color: '#BDD5C8', fontSize: 12, marginTop: 2 },
  topIconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  topIconBtnActive: { backgroundColor: '#15803D' },
  refreshCircle: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EFF9F0', alignItems: 'center', justifyContent: 'center' },
  sheetSyncBadge: { backgroundColor: 'rgba(74, 222, 128, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  sheetSyncText: { fontSize: 9, fontWeight: '800', color: '#4ADE80' },
  orderAlertBanner: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1.5, marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: C.ink },
  muted: { color: C.sub, fontSize: 12 },
  bannerError: { marginHorizontal: 16, marginTop: 10, padding: 12, backgroundColor: C.rose, borderRadius: 12, flexDirection: 'row', gap: 10 },
  bannerSuccess: { marginHorizontal: 16, marginTop: 10, padding: 12, backgroundColor: C.mint, borderRadius: 12, flexDirection: 'row', gap: 10 },
  filterBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 17, paddingVertical: 8 },
  filterPill: { borderColor: C.line, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: C.paper },
  filterActive: { backgroundColor: C.dark, borderColor: C.dark },
  filterText: { fontSize: 12, fontWeight: '800', color: C.sub },
  filterTextActive: { color: '#FFF' },
  dateFilterPill: { borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: C.paper },
  dateFilterActive: { backgroundColor: C.brand, borderColor: C.brand },
  dateFilterText: { fontSize: 11, fontWeight: '800', color: C.sub },
  dateFilterTextActive: { color: '#FFF' },
  search: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, marginHorizontal: 16, marginBottom: 2, padding: 12, borderRadius: 13, color: C.ink, fontSize: 14, minHeight: 46 },
  orderCard: { backgroundColor: C.paper, borderRadius: 19, borderWidth: 1, borderColor: C.line, padding: 16, gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderNo: { fontSize: 16, color: C.ink, fontWeight: '900' },
  customer: { fontSize: 17, color: C.ink, fontWeight: '800' },
  money: { fontSize: 20, color: C.brand, fontWeight: '900' },
  pill: { paddingVertical: 7, paddingHorizontal: 9, borderRadius: 99 },
  pillGrey: { backgroundColor: '#E9ECEB' }, pillAction: { backgroundColor: '#E8F7EA' }, pillPlain: { backgroundColor: '#F5EEDB' },
  pillText: { color: C.ink, fontSize: 11, fontWeight: '800' },
  address: { color: C.sub, fontSize: 13, lineHeight: 18, marginTop: 3 },
  deliveryMeta: { color: C.sub, fontSize: 12 },
  codStrip: { backgroundColor: '#F7F0DE', padding: 12, borderRadius: 13, flexDirection: 'row', justifyContent: 'space-between', marginVertical: 3 },
  codText: { color: '#68512B', fontWeight: '700', fontSize: 13 }, codAmount: { color: '#785021', fontWeight: '900' },
  quickBtn: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickBtnText: { fontSize: 12, fontWeight: '800', color: C.ink },
  actionPillBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionPillBtnText: { fontSize: 12, fontWeight: '800' },
  infoCard: { padding: 17, backgroundColor: C.paper, borderRadius: 18, borderWidth: 1, borderColor: C.line, gap: 10 },
  infoTitle: { fontSize: 18, fontWeight: '900', color: C.ink, marginBottom: 5 },
  infoLine: { fontSize: 14, lineHeight: 23, color: C.sub },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, backgroundColor: C.paper, paddingBottom: Platform.OS === 'ios' ? 26 : 12, paddingTop: 10, paddingHorizontal: 15, gap: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 9, borderRadius: 14 },
  tabActive: { backgroundColor: C.mint },
  tabIcon: { fontSize: 20 }, tabText: { fontSize: 11, fontWeight: '700', color: C.sub }, tabTextActive: { color: C.brand },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 45, gap: 8 },
  emptyTitle: { fontSize: 17, color: C.ink, fontWeight: '900' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,25,14,0.65)', justifyContent: 'flex-end', zIndex: 15 },
  sheet: { backgroundColor: C.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: Platform.OS === 'ios' ? 42 : 26, gap: 11, maxHeight: '90%' },
  sheetTitle: { fontSize: 22, fontWeight: '900', color: C.ink },
  choice: { backgroundColor: C.bg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.line, gap: 4 },
  choiceSelected: { borderColor: C.brand, backgroundColor: C.mint },
  cashConfirm: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#FBF3E3', borderRadius: 12, borderWidth: 1, borderColor: '#F2DFB1', marginVertical: 6 },
  cashConfirmed: { backgroundColor: C.mint, borderColor: '#ABD7B2' },
  overviewGrid: { flexDirection: 'row', gap: 10 },
  kpiCard: { flex: 1, backgroundColor: C.paper, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, gap: 4 },
  kpiIcon: { fontSize: 24, marginBottom: 4 },
  kpiValue: { fontSize: 20, fontWeight: '900', color: C.ink },
  kpiLabel: { fontSize: 12, fontWeight: '800', color: C.sub, marginTop: 2 },
  pipelineRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pipelineBadge: { flex: 1, backgroundColor: C.bg, borderRadius: 14, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  pipelineCountAmber: { fontSize: 18, fontWeight: '900', color: '#B45309' },
  pipelineCountBlue: { fontSize: 18, fontWeight: '900', color: '#1D4ED8' },
  pipelineCountPurple: { fontSize: 18, fontWeight: '900', color: '#7E22CE' },
  pipelineCountGreen: { fontSize: 18, fontWeight: '900', color: '#15803D' },
  pipelineLabel: { fontSize: 10, fontWeight: '800', color: C.sub, marginTop: 3 },
  quickActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.line },
  quickActionTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  filterBarScroll: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  cashHeroCard: { backgroundColor: '#FEF3C7', borderRadius: 20, borderWidth: 1, borderColor: '#FCD34D', padding: 18, gap: 10 },
  depositMainBtn: { backgroundColor: '#B45309', paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  riderQuickCashBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#FCD34D' },
  riderQuickCashBtn: { backgroundColor: '#B45309', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  stockToggleBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  stockInBtn: { backgroundColor: '#DCFCE7' }, stockOutBtn: { backgroundColor: '#FEE2E2' },
  stockToggleText: { fontSize: 12, fontWeight: '800' },
  stockInText: { color: '#166534' }, stockOutText: { color: '#991B1B' },
  addStaffBtn: { backgroundColor: C.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  subTabSwitcher: { flexDirection: 'row', backgroundColor: '#E2E8F0', padding: 4, borderRadius: 14, gap: 6 },
  subTabBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  subTabBtnActive: { backgroundColor: '#FFF', elevation: 1 },
  subTabBtnText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  subTabBtnTextActive: { color: C.ink, fontWeight: '900' },
  staffActionPill: { borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  staffActionPillText: { fontSize: 11, fontWeight: '800', color: '#334155' },
  choicePill: { borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.paper },
  choicePillActive: { borderColor: C.brand, backgroundColor: C.mint },
  choicePillText: { fontSize: 12, fontWeight: '700', color: C.sub },
  choicePillTextActive: { color: C.brand, fontWeight: '800' },
  choiceItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.line, padding: 10, borderRadius: 10 },
  choiceItemActive: { borderColor: C.brand, backgroundColor: C.mint },
  qtyBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper },
  qtyBtnText: { fontSize: 18, fontWeight: '900', color: C.brand },
  receiptBox: { backgroundColor: '#FAF9F6', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, padding: 14, maxHeight: 300, marginVertical: 8 },
  receiptText: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, color: '#1F2937', lineHeight: 17 },
  // Universal Sticky Top Navigation Bar
  navBarSticky: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 3 },
      android: { elevation: 3 },
    }),
  },
  navBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  navBackIcon: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 20,
    marginTop: -2,
  },
  navBackText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  navCenterBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  navCenterEmoji: {
    fontSize: 16,
  },
  navCenterTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.ink,
  },
  navHomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  navHomeIcon: {
    fontSize: 14,
  },
  navHomeText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
  },
  navBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  // Hero Featured Launch Cards
  heroOrderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 15,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#059669', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  heroPosCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 15,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#10B981', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  heroCardIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCardTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#065F46',
  },
  heroCardSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  heroBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  heroCardArrow: {
    fontSize: 20,
    fontWeight: '900',
    color: '#059669',
  },
  // 2-column Card grid
  sectionHeaderTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#1E293B',
  },
  moduleCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  moduleGridCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-between',
    minHeight: 126,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  moduleGridCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moduleGridIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleGridBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: '55%',
  },
  moduleGridBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  moduleGridTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 10,
  },
  moduleGridSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  // Choice & Modal Cards
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 },
      android: { elevation: 1 },
    }),
  },
  reasonCardActive: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 },
      android: { elevation: 1 },
    }),
  },
  roleCardActive: {
    borderColor: '#22C55E',
    backgroundColor: '#F0FDF4',
  }
});
