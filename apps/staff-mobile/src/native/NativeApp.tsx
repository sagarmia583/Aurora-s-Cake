import {formatOrderNumber} from '../orderNumber';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Alert, AppState, BackHandler, Platform, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Switch, View } from "react-native";
import { Text } from "./typography";
import * as SecureStore from "expo-secure-store";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import {
  money,
  nextOperation,
  operationLabels,
  roleLabel,
  statusLabel,
  type StaffOrder,
  type StaffSession,
} from "../domain";
import {
  playNativeOrderSound,
  releaseNativeOrderSound,
  stopNativeOrderSound,
} from "../nativeOrderSound";
import {
  ClientError,
  getCatalog,
  getOrders,
  request,
  restoreSession,
  signOut,
} from "./client";
import {
  active,
  batchPlan,
  canCreate,
  canManage,
  dhakaDate,
  emptyCatalog,
  isLive,
  mergeOrderSnapshot,
  priorityOrders,
  richItems,
  sameSnapshot,
  type Catalog,
  type Screen,
} from "./model";
import { Button, BrandLogo, C, Chip, Empty, Field, Photo, T, pressFeedback } from "./ui";
import LoginScreen from "./LoginScreen";
import { OrderComposer } from "./OrderComposer";
import { OrderDetail } from "./OrderDetail";
import { CmsScreen, cmsSections } from "./CmsScreen";
import {
  Costings,
  CustomRequests,
  Customers,
  Reports,
  Team,
} from "./OpsScreens";
import {enableBackgroundRefresh,stopBackgroundRefresh,rememberBackgroundOrders,relevantOrder,registerOrderPush,notifyOrderStages} from './background';
import {orderStages,orderStageUpdates,type StageUpdate} from './orderStageUpdates';
import {FONT_NOTICES} from './fontNotices';
import {Sheet} from './ui';
import * as Notifications from 'expo-notifications';
type Auth = { token: string; session: StaffSession };
const relevant = relevantOrder;
export default function NativeApp() {
  const [auth, setAuth] = useState<Auth | null>(null),
    [restoring, setRestoring] = useState(true),
    [restoreError, setRestoreError] = useState("");
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog),
    [orders, setOrders] = useState<StaffOrder[]>([]),
    [syncing, setSyncing] = useState(false),
    [syncError, setSyncError] = useState(""),
    [syncUnavailable, setSyncUnavailable] = useState(false),
    [lastSync, setLastSync] = useState<Date | null>(null);
  const [screen, setScreen] = useState<Screen>("today"),
    [composer, setComposer] = useState(false),
    [selected, setSelected] = useState(""),
    [cms, setCms] = useState<[string, string] | null>(null),
    [tool, setTool] = useState("");
  const [beep, setBeep] = useState(true),
    [awake, setAwake] = useState(true),
    [alertIds, setAlertIds] = useState<string[]>([]),
    [notice, setNotice] = useState(""),
    [logoutBusy, setLogoutBusy] = useState(false);
  const [stageNotices,setStageNotices]=useState<StageUpdate[]>([]);
  const stageOwner=useRef('');
  const soundEnabled=useRef(beep);
  soundEnabled.current=beep;
  const announceStages=useCallback((updates:StageUpdate[])=>{
    if(!updates.length)return;
    setStageNotices(updates.slice(-4).reverse());
    // The persistent new-order chime already covers pending orders.
    void notifyOrderStages(updates.filter(update=>update.status!=='pending'),soundEnabled.current)
      .catch(()=>{});
  },[]);
  const [backgroundStatus,setBackgroundStatus]=useState('Background refresh প্রস্তুত হচ্ছে…'),[licenses,setLicenses]=useState(false);
  const authRef = useRef(auth),
    readVersion = useRef(0),
    alive = useRef(true),
    foreground = useRef(AppState.currentState === "active"),
    ordersRef = useRef(orders),
    catalogRef = useRef(catalog),
    ordersOwner = useRef(""),
    syncedOwner = useRef(""),
    mutationVersion = useRef(0),
    refreshing = useRef(false);
  authRef.current = auth;
  ordersRef.current = orders;
  catalogRef.current = catalog;
  const restore = useCallback(async () => {
    if(Platform.OS==='web'){setRestoring(false);return;}
    setRestoring(true);
    setRestoreError("");
    try {
      const a = await restoreSession();
      if (alive.current) setAuth(a);
    } catch (e) {
      if (alive.current) setRestoreError((e as Error).message);
    } finally {
      if (alive.current) setRestoring(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void getCatalog().then(c=>{if(alive.current)setCatalog(c)}).catch(()=>{});
    void restore();
    void SecureStore.getItemAsync("aurora_native_sound_v2").then((v) => {
      if (alive.current) setBeep(v !== "false");
    }).catch(()=>{});
    return () => {
      alive.current = false;
      releaseNativeOrderSound();
    };
  }, [restore]);
  const refresh = useCallback(async (manual = false) => {
    if (!authRef.current || refreshing.current) return;
    const owner = authRef.current,
      version = ++readVersion.current,
      writes = mutationVersion.current;
    refreshing.current = true;
    if (manual) setSyncing(true);
    const results = await Promise.allSettled([
      getOrders(owner.token),
      getCatalog(),
    ]);
    if (
      alive.current &&
      authRef.current?.token === owner.token &&
      version === readVersion.current
    ) {
      const errors: string[] = [];
      let changed = false;
      if (
        results[0].status === "fulfilled" &&
        writes === mutationVersion.current
      ) {
        try {
          const previous = ordersRef.current;
          const incoming = results[0].value;
          const next = mergeOrderSnapshot(previous,incoming,incoming.snapshotComplete);
          if (!incoming.snapshotComplete)
            errors.push("একটি পুরোনো Sheet row ক্ষতিগ্রস্ত। নতুন বৈধ অর্ডার দেখানো হচ্ছে, আগের অর্ডার মুছিনি।");
          if(stageOwner.current===owner.token&&next!==previous)
            announceStages(orderStageUpdates(orderStages(previous),next));
          stageOwner.current=owner.token;
          if (next !== previous) {
            const before = new Set(previous.filter((o) => relevant(o, owner.session)).map((o) => o.id));
            const actionable = new Set(next.filter((o) => relevant(o, owner.session)).map((o) => o.id));
            const arrived = [...actionable].filter((id) => !before.has(id));
            ordersRef.current = next;
            setOrders(next);
            setAlertIds((old) => {
              const updated = [...new Set([...old.filter((id) => actionable.has(id)), ...arrived])];
              return sameSnapshot(old, updated) ? old : updated;
            });
            changed = true;
          }
          if (changed || ordersOwner.current !== owner.token) {
            ordersOwner.current = owner.token;
            void rememberBackgroundOrders(next, owner.session).catch(() => {
              if (ordersOwner.current === owner.token) ordersOwner.current = "";
            });
          }
        } catch (error) {
          errors.push((error as Error).message || "Order sync ব্যর্থ হয়েছে।");
        }
      } else if (results[0].status === "rejected") {
        errors.push(results[0].reason.message || "Order sync ব্যর্থ হয়েছে।");
        if (
          results[0].reason instanceof ClientError &&
          ["unauthorized", "session_expired", "forbidden"].includes(
            results[0].reason.code,
          )
        ) {
          authRef.current = null;
          setAuth(null);
          setOrders([]);
          setAlertIds([]);
        }
      }
      if (results[1].status === "fulfilled") {
        if (!sameSnapshot(catalogRef.current, results[1].value)) {
          catalogRef.current = results[1].value;
          setCatalog(results[1].value);
          changed = true;
        }
      } else errors.push(results[1].reason.message || "Catalogue লোড হয়নি।");
      setSyncUnavailable(errors.length > 0);
      if (manual || !errors.length) setSyncError(errors.join("\n"));
      if (changed || (!errors.length && (manual || syncedOwner.current !== owner.token))) {
        setLastSync(new Date());
      }
      if (!errors.length) syncedOwner.current = owner.token;
      if (manual) setSyncing(false);
    }
    refreshing.current = false;
    if (
      authRef.current &&
      (authRef.current.token !== owner.token ||
        mutationVersion.current !== writes)
    )
      setTimeout(() => void refresh(), 0);
  }, [announceStages]);
  useEffect(() => {
    if (!auth) {
      setOrders([]);
      ordersOwner.current = "";
      syncedOwner.current = "";
      setLastSync(null);
      setSyncError("");
      setSyncUnavailable(false);
      setAlertIds([]);
      setStageNotices([]);
      stageOwner.current='';
      setSelected("");
      setComposer(false);
      setCms(null);
      setTool("");
      setScreen("today");
      setSyncing(false);
      return;
    }
    void refresh();
    const timer = setInterval(
      () => {
        if (foreground.current) void refresh();
      },
      auth.session.role === "delivery_man" ? 8000 : 12000,
    );
    return () => clearInterval(timer);
  }, [auth?.token, refresh]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      foreground.current = state === "active";
      if (foreground.current) void refresh();
      else stopNativeOrderSound();
    });
    return () => sub.remove();
  }, [refresh]);
  useEffect(() => {
    if (!beep || !alertIds.length) return;
    const sound = () => {
      if (foreground.current)
        void playNativeOrderSound().catch(() =>
          setNotice("Sound বাজেনি। More → Test sound দিয়ে যাচাই করুন।"),
        );
    };
    sound();
    const timer = setInterval(sound, 10000);
    return () => {
      clearInterval(timer);
      stopNativeOrderSound();
    };
  }, [beep, alertIds.join(",")]);
  useEffect(() => {
    if(!awake||!auth)return;
    const tag='aurora-native-shift-'+Math.random().toString(36).slice(2);
    const activation=activateKeepAwakeAsync(tag);
    void activation.catch(()=>{if(alive.current)setNotice('Kitchen mode চালু হয়নি। আবার চেষ্টা করুন।');});
    return () => {
      void activation.then(()=>deactivateKeepAwake(tag)).catch(()=>{});
    };
  }, [awake,auth?.token]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen !== "today") {
        setScreen("today");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);
  useEffect(()=>{
    let current=true;
    if(auth)void enableBackgroundRefresh().then(async v=>{
      if(!current)return;
      setBackgroundStatus(v);
      try{
        const push=await registerOrderPush(auth,beep);
        if(current&&push)setBackgroundStatus(push+' '+v);
      }catch{if(current)setBackgroundStatus('Push চালু হয়নি। '+v);}
    }).catch(()=>{if(current)setBackgroundStatus('Background sync চালু হয়নি। More থেকে আবার চেষ্টা করুন।')});
    else void stopBackgroundRefresh().catch(()=>{});
    return()=>{current=false};
  },[auth?.token,beep]);
  useEffect(()=>{
    if(Platform.OS==='web')return;
    const subscription=Notifications.addNotificationResponseReceivedListener(response=>{
      if(!authRef.current)return;
      setScreen('orders');
      const id=response.notification.request.content.data?.orderId;
      if(typeof id==='string'&&ordersRef.current.some(order=>order.id===id))setSelected(id);
    });
    return()=>subscription.remove();
  },[]);
  const changed = (o: StaffOrder) => {
    if (authRef.current?.token !== auth?.token) return;
    mutationVersion.current++;
    const old = ordersRef.current;
    announceStages(orderStageUpdates(orderStages(old),[o]));
    const next = old.some((x) => x.id === o.id)
      ? old.map((x) => (x.id === o.id ? o : x))
      : [o, ...old];
    ordersRef.current = next;
    ordersOwner.current = "";
    setOrders(next);
    setLastSync(new Date());
    setAlertIds((ids) => ids.filter((id) => id !== o.id));
    stopNativeOrderSound();
    void refresh();
  };
  const openOrder = (id: string) => {
    setSelected(id);
    setAlertIds((ids) => ids.filter((x) => x !== id));
    stopNativeOrderSound();
  };
  const logout = async () => {

    if (!auth) return;
    setLogoutBusy(true);
    try {
      await signOut(auth.token);
      authRef.current = null;
      setAuth(null);
      setOrders([]);
      setScreen("today");
      setCatalog(emptyCatalog);
      setTool("");
      readVersion.current++;
      setNotice("");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setLogoutBusy(false);
    }
  };
  if (restoring)
    return (
      <View style={[T.page, S.center]}>
        <BrandLogo uri={String(catalog.settings.logo_url||"")} size={83}/>
        <ActivityIndicator color={C.brand} />
        <Text style={T.sub}>আপনার workspace প্রস্তুত হচ্ছে…</Text>
      </View>
    );
  if (!auth)
    return (
      <LoginScreen
        logoUrl={String(catalog.settings.logo_url||"")}
        error={restoreError}
        onRetry={() => void restore()}
        onSignedIn={(a) => {
          authRef.current = a;
          setAuth(a);
          setSyncError("");
        }}
      />
    );
  const s = auth.session,
    live = priorityOrders(orders, s),
    today = dhakaDate(),
    due = live.filter((o) => o.delivery_date === today),
    actionable = live.filter((o) => nextOperation(o, s)),
    focus = actionable[0],
    delivered = orders.filter(
      (o) => o.status === "delivered" && o.delivery_date === today,
    );
  const selectedOrder = orders.find((o) => o.id === selected);
  const openCms = (table: string, title: string) => setCms([table, title]);
  const tabs: [Screen, string, string][] = [
    ["today", "আজ", "◷"],
    ["orders", "Orders", "▤"],
    [
      "bake",
      s.role === "delivery_man"
        ? "My run"
        : s.role === "delivery_manager"
          ? "Dispatch"
          : s.role === "accountant"
            ? "Pulse"
            : "Bake",
      "◴",
    ],
    ["more", "More", "▦"],
  ];
  return (
    <View
      style={[
        T.page,
        Platform.OS === "web" && {
          width: "100%",
          maxWidth: 480,
          alignSelf: "center",
        },
      ]}
    >
      <StatusBar barStyle="dark-content" />
      <View style={S.safeTop} />
      <View style={S.header}>
        <View style={[T.row,{flex:1,minWidth:0,flexWrap:"nowrap"}]}>
          <BrandLogo uri={String(catalog.settings.logo_url||"")} size={42}/>
          <View style={{flex:1,minWidth:0}}>
            <Text style={T.h3}>
              {String(catalog.settings.shop_name || "Aurora’s Cake")}
            </Text>
            <Text style={T.tiny}>{roleLabel[s.role]}</Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel="Refresh live data"
          accessibilityRole="button"
          onPress={() => void refresh(true)}
          style={({pressed}) => [{minHeight:44,justifyContent:'center',paddingHorizontal:10,borderRadius:12,backgroundColor:C.paper},pressed&&pressFeedback]}
        >
          <View style={[T.row, { gap: 6 }]}>
            {syncing ? (
              <ActivityIndicator color={C.brand} size="small" />
            ) : (
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 4,
                  backgroundColor: syncUnavailable ? C.gold : C.green,
                }}
              />
            )}
            <Text style={T.tiny}>
              {syncUnavailable
                ? "Sync paused"
                : lastSync
                  ? lastSync.toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Dhaka",
                    })
                  : "Connecting"}
            </Text>
          </View>
        </Pressable>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={T.content}
        refreshControl={
          <RefreshControl
            refreshing={syncing}
            onRefresh={() => void refresh(true)}
            tintColor={C.brand}
          />
        }
      >
        {!!syncError && (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="alert" style={T.error}>
              {syncError}
            </Text>
            <Text style={T.sub}>
              শেষ পাওয়া তথ্য দেখছেন। Refresh করে আবার যাচাই করুন।
            </Text>
          </View>
        )}
        {!!notice && (
          <Pressable onPress={() => setNotice("")}>
            <Text accessibilityRole="alert" style={T.error}>
              {notice} ×
            </Text>
          </Pressable>
        )}
        {!!stageNotices.length&&<View style={[T.card,{backgroundColor:C.mint,gap:4}]}>
          <View style={T.between}>
            <Text accessibilityLiveRegion="polite" style={T.eyebrow}>অর্ডারের নতুন ধাপ</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss order updates" hitSlop={8}
              style={({pressed})=>[pressed&&pressFeedback]} onPress={()=>setStageNotices([])}>
              <Text style={T.link}>বন্ধ ×</Text>
            </Pressable>
          </View>
          {stageNotices.map((update,index)=><Pressable key={update.id+':'+index} accessibilityRole="button"
            style={({pressed})=>[{minHeight:38,justifyContent:'center'},pressed&&pressFeedback]}
            onPress={()=>{setStageNotices([]);setScreen('orders');if(ordersRef.current.some(o=>o.id===update.id))openOrder(update.id);}}>
            <Text style={T.h3}>#{update.number} · {statusLabel(update.status)} ↗</Text>
          </Pressable>)}
        </View>}
        {!!alertIds.length && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setAlertIds([]);
              stopNativeOrderSound();
              setScreen("orders");
            }}
            style={[
              T.card,
              T.between,
              { backgroundColor: C.peach, borderColor: "#EDC6A9" },
            ]}
          >
            <View>
              <Text style={T.h3}>{alertIds.length}টি নতুন কাজ এসেছে</Text>
              <Text style={T.sub}>দেখুন ও sound acknowledge করুন</Text>
            </View>
            <Text style={T.h2}>↗</Text>
          </Pressable>
        )}
        {screen === "today" && (
          <>
            <View style={{ gap: 5 }}>
              <Text style={T.eyebrow}>A LITTLE CARE. EVERY ORDER.</Text>
              <Text style={T.title}>আজকের ছন্দ</Text>
              <Text style={T.sub}>
                স্বাগতম, {s.name.split(" ")[0]}। আপনার পরের কাজটা এখানেই।
              </Text>
            </View>
            <View
              style={[
                T.card,
                {
                  backgroundColor: C.dark,
                  borderColor: C.dark,
                  padding: 23,
                  gap: 16,
                },
              ]}
            >
              <View style={T.between}>
                <Text style={[T.eyebrow, { color: "#EBC1D0" }]}>
                  YOUR NEXT MOVE
                </Text>
                <Text style={{ fontSize: 20, color: "#E7B391" }}>✦</Text>
              </View>
              {focus ? (
                <>
                  <Text style={[T.title, { color: "#FFF", fontSize: 25 }]}>
                    {operationLabels[nextOperation(focus, s)!]}
                  </Text>
                  <Text
                    style={{ color: "#E5D8E7", fontSize: 14, lineHeight: 22 }}
                  >
                    {formatOrderNumber(focus.order_number)} ·{" "}
                    {focus.customer_name || "Kitchen ticket"}
                    {focus.delivery_slot ? "\n" + focus.delivery_slot : ""}
                  </Text>
                  <Button
                    label="এই order খুলুন →"
                    kind="ghost"
                    style={{ backgroundColor: "#EDB496" }}
                    onPress={() => openOrder(focus.id)}
                  />
                </>
              ) : (
                <>
                  <Text style={[T.title, { color: "#FFF", fontSize: 25 }]}>
                    {live.length ? "সবকিছু ঠিক ছন্দে" : "একটু শান্ত সময়"}
                  </Text>
                  <Text
                    style={{ color: "#E5D8E7", fontSize: 14, lineHeight: 22 }}
                  >
                    আপনার জন্য এখন কোনো pending action নেই। নতুন order এলে এখানে
                    দেখা যাবে।
                  </Text>
                  <Button
                    label="সব order দেখুন →"
                    kind="ghost"
                    onPress={() => setScreen("orders")}
                  />
                </>
              )}
            </View>
            <View style={T.row}>
              {[
                [String(due.length), "আজ delivery", C.peach],
                [String(live.length), "Active orders", C.pink],
                [String(delivered.length), "Delivered", C.mint],
              ].map(([n, l, b]) => (
                <Pressable
                  key={l}
                  accessibilityRole="button"
                  onPress={() =>
                    setScreen(l === "Delivered" ? "orders" : "delivery")
                  }
                  style={[S.stat, { backgroundColor: b }]}
                >
                  <Text style={[T.title, { fontSize: 29 }]}>{n}</Text>
                  <Text style={[T.tiny, { color: C.ink }]}>{l}</Text>
                </Pressable>
              ))}
            </View>
            <View style={T.between}>
              <Text style={T.h2}>হাতের কাছে</Text>
              <Text style={T.sub}>Less taps, more care</Text>
            </View>
            <View style={T.row}>
              {canCreate(s.role) && (
                <Quick
                  label="নতুন order"
                  detail="কেক থেকে confirmation"
                  glyph="+"
                  onPress={() => setComposer(true)}
                />
              )}
              <Quick
                label={
                  s.role === "delivery_man"
                    ? "আমার delivery"
                    : s.role === "delivery_manager"
                      ? "Handoff"
                      : s.role === "accountant"
                        ? "দোকানের পালস"
                        : "Batch plan"
                }
                detail={
                  s.role === "delivery_man"
                    ? "পরের ঠিকানা"
                    : s.role === "delivery_manager"
                      ? "Ready থেকে doorstep"
                      : s.role === "accountant"
                        ? "Sales & collections"
                        : "কোন কেক, কতটি"
                }
                glyph="◴"
                onPress={() =>
                  s.role === "accountant"
                    ? setTool("reports")
                    : setScreen(
                        ["delivery_man", "delivery_manager"].includes(s.role)
                          ? "delivery"
                          : "bake",
                      )
                }
              />
            </View>
            <View style={T.between}>
              <Text style={T.h2}>আজকের handoff</Text>
              <Pressable
                onPress={() => setScreen("delivery")}
                style={{ padding: 8 }}
              >
                <Text style={T.link}>সব দেখুন ↗</Text>
              </Pressable>
            </View>
            {due.slice(0, 3).map((o) => (
              <OrderCard key={o.id} order={o} onPress={() => openOrder(o.id)} />
            ))}
            {!due.length && (
              <Empty
                title="আজকের বাক্সগুলো প্রস্তুত"
                detail="আজ delivery আছে এমন active order এখানে দেখাবে।"
              />
            )}
          </>
        )}
        {screen === "orders" && (
          <OrdersScreen
            orders={orders}
            session={s}
            onOpen={openOrder}
            onCreate={() => setComposer(true)}
          />
        )}
        {(screen === "bake" || screen === "delivery") &&
          (s.role === "delivery_man" || screen === "delivery" ? (
            <DeliveryScreen orders={live} onOpen={openOrder} />
          ) : (
            <BakeScreen orders={orders} onOpen={openOrder} />
          ))}
        {screen === "more" && (
          <>
            <Text style={T.eyebrow}>THE REST OF YOUR WORKSPACE</Text>
            <Text style={T.title}>আরও একটু নিয়ন্ত্রণ</Text>
            <View style={[T.card, T.row]}>
              <Photo
                label={s.name}
                uri={
                  s.profile_image_url ||
                  String(catalog.settings.profile_image_url || "")
                }
                size={48}
              />
              <View style={{ flex: 1 }}>
                <Text style={T.h3}>{s.name}</Text>
                <Text style={T.sub}>{roleLabel[s.role]}</Text>
              </View>
            </View>
            <View style={T.wrap}>
              {["super_admin", "admin", "order_manager", "accountant"].includes(
                s.role,
              ) && (
                <>
                  <Tool
                    label="দোকানের পালস"
                    detail="Sales & collections"
                    onPress={() => setTool("reports")}
                  />
                  <Tool
                    label="কেকের খরচ"
                    detail="Costing & profit"
                    onPress={() => setTool("costings")}
                  />
                </>
              )}
              {[
                "super_admin",
                "admin",
                "order_manager",
                "delivery_manager",
              ].includes(s.role) && (
                <Tool
                  label="চেনা মুখ"
                  detail="Customer directory"
                  onPress={() => setTool("customers")}
                />
              )}
              {canCreate(s.role) && (
                <Tool
                  label="স্বপ্নের কেক"
                  detail="Custom requests"
                  onPress={() => setTool("custom")}
                />
              )}
              {canManage(s.role) && (
                <Tool
                  label="আপনার টিম"
                  detail="Roles & access"
                  onPress={() => setTool("team")}
                />
              )}
            </View>
            {canManage(s.role) &&
              cmsSections.map((section) => (
                <View key={section.title} style={{ gap: 12 }}>
                  <Text style={T.h2}>{section.title}</Text>
                  <View style={T.card}>
                    {section.items.map(([table, label], i) => (
                      <Pressable
                        key={table}
                          accessibilityRole="button"
                        onPress={() => openCms(table, label)}
                        style={[
                          T.between,
                          {
                            minHeight: 48,
                            borderTopWidth: i ? 1 : 0,
                            borderTopColor: C.line,
                            paddingVertical: 11,
                          },
                        ]}
                      >
                        <Text style={T.body}>{label}</Text>
                        <Text style={T.link}>↗</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            <Text style={T.h2}>নিজের মতো কাজ করুন</Text>
            <View style={T.card}>
              <View style={T.between}>
                <View style={{ flex: 1 }}>
                  <Text style={T.h3}>Order sound</Text>
                  <Text style={T.sub}>অ্যাপ খোলা থাকলে নতুন কাজের alert</Text>
                </View>
                <Switch
                  accessibilityLabel="Order notification sound"
                  value={beep}
                  onValueChange={(v) => {
                    setBeep(v);
                    if (!v) stopNativeOrderSound();
                      void SecureStore.setItemAsync(
                        "aurora_native_sound_v2",
                        String(v),
                      ).catch(()=>setNotice('Sound preference ফোনে সংরক্ষণ হয়নি।'));
                  }}
                />
              </View>
              <Button
                kind="ghost"
                label="Test sound"
                onPress={() => {

                  void playNativeOrderSound().catch((e) =>
                    setNotice(e.message),
                  );
                }}
              />
              <View style={T.divider} />
              <View style={T.between}>
                <View style={{ flex: 1 }}>
                  <Text style={T.h3}>Stay awake</Text>
                  <Text style={T.sub}>কাজের সময় ফোনের screen জেগে রাখুন</Text>
                </View>
                <Switch
                  accessibilityLabel="Keep screen awake"
                  value={awake}
                  onValueChange={setAwake}
                />
              </View>
            </View>
            <Text style={T.sub}>
              অ্যাপ খোলা থাকলে ৮–১২ সেকেন্ড পরপর নীরবে Sheet দেখে। নতুন তথ্য এলে সেটুকু দেখায়। অ্যাপ আড়ালে থাকলে ফোনের সময়সূচিতে sync হয়।
            </Text>
            <View style={T.card}><Text style={T.h3}>Background refresh</Text><Text style={T.sub}>{backgroundStatus}</Text><Button label="Background sync যাচাই করুন" kind="ghost" onPress={()=>{void enableBackgroundRefresh().then(setBackgroundStatus).catch(()=>setBackgroundStatus('ফোনের settings যাচাই করুন।'))}}/></View>
            <Button label="Fonts & licenses" kind="ghost" onPress={()=>setLicenses(true)}/>
            <Button
              label="Sign out"
              kind="ghost"
              busy={logoutBusy}
              onPress={() => void logout()}
            />
          </>
        )}
      </ScrollView>
      {licenses&&<Sheet title="Fonts & licenses" onClose={()=>setLicenses(false)}><Text style={T.sub}>{FONT_NOTICES}</Text></Sheet>}
      <View style={S.nav}>
        {tabs.slice(0, 2).map(([id, label, icon]) => (
          <NavItem
            key={id}
            active={screen === id}
            label={label}
            icon={icon}
            onPress={() => setScreen(id)}
          />
        ))}
        {canCreate(s.role) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create new order"
            onPress={() => setComposer(true)}
            style={({pressed}) => [S.newOrder, pressed && pressFeedback]}
          >
            <Text
              style={{
                color: "#FFF",
                fontSize: 32,
                fontWeight: "400",
                lineHeight: 35,
              }}
            >
              +
            </Text>
          </Pressable>
        )}
        {tabs.slice(2).map(([id, label, icon]) => (
          <NavItem
            key={id}
            active={screen === id || (id === "bake" && screen === "delivery")}
            label={label}
            icon={icon}
            onPress={() =>
              id === "bake" && s.role === "accountant"
                ? setTool("reports")
                : setScreen(
                    id === "bake" &&
                      ["delivery_man", "delivery_manager"].includes(s.role)
                      ? "delivery"
                      : id,
                  )
            }
          />
        ))}
      </View>
      {composer && (
        <OrderComposer
          catalog={catalog}
          token={auth.token}
          session={s}
          onClose={() => setComposer(false)}
          onSaved={changed}
          onCatalogChanged={() => void refresh()}
        />
      )}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          session={s}
          token={auth.token}
          catalog={catalog}
          onClose={() => setSelected("")}
          onChanged={changed}
        />
      )}
      {cms && (
        <CmsScreen
          table={cms[0]}
          title={cms[1]}
          token={auth.token}
          catalog={catalog}
          onClose={() => setCms(null)}
          onChanged={() => void refresh()}
        />
      )}
      {tool === "reports" && (
        <Reports orders={orders} onClose={() => setTool("")} />
      )}
      {tool === "customers" && (
        <Customers
          orders={orders}
          token={auth.token}
          onClose={() => setTool("")}
        />
      )}
      {tool === "team" && (
        <Team
          session={s}
          token={auth.token}
          onSession={(session) => setAuth((a) => (a ? { ...a, session } : a))}
          onClose={() => setTool("")}
        />
      )}
      {tool === "custom" && (
        <CustomRequests
          token={auth.token}
          onClose={() => setTool("")}
        />
      )}
      {tool === "costings" && (
        <Costings
          token={auth.token}
          catalog={catalog}
          onClose={() => setTool("")}
        />
      )}
    </View>
  );
}
function NavItem({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({pressed}) => [S.navItem, active && {backgroundColor: C.pink, borderRadius: 13}, pressed && pressFeedback]}
    >
      <Text style={{ fontSize: 24, color: active ? C.brand : "#A49AA4" }}>
        {icon}
      </Text>
      <Text
        style={{
          fontSize: 10,
          fontWeight: active ? "800" : "500",
          color: active ? C.brand : C.sub,
        }}
      >
        {label}
      </Text>
      {active && (
        <View
          style={{
            position: "absolute",
            bottom: -8,
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: C.brand,
          }}
        />
      )}
    </Pressable>
  );
}
function Quick({
  label,
  detail,
  glyph,
  onPress,
}: {
  label: string;
  detail: string;
  glyph: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [T.card, { flex: 1, gap: 9 }, pressed && pressFeedback]}
    >
      <Text style={{ fontSize: 27, color: C.brand }}>{glyph}</Text>
      <Text style={T.h3}>{label}</Text>
      <Text style={T.tiny}>{detail}</Text>
    </Pressable>
  );
}
function Tool({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [T.card, { width: "48%", flexGrow: 1, minHeight: 90 }, pressed && pressFeedback]}
    >
      <Text style={T.h3}>{label} ↗</Text>
      <Text style={T.sub}>{detail}</Text>
    </Pressable>
  );
}
export function OrderCard({
  order: o,
  onPress,
}: {
  order: StaffOrder;
  onPress: () => void;
}) {
  const statusColor =
    o.status === "pending" ? C.gold : o.status === "ready" ? C.green : C.brand;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={formatOrderNumber(o.order_number) + " " + statusLabel(o.status)}
      onPress={onPress}
      style={({pressed}) => [T.card, pressed && pressFeedback]}
    >
      <View style={T.between}>
        <Text style={T.eyebrow}>{formatOrderNumber(o.order_number)}</Text>
        <View
          style={[
            T.pill,
            {
              backgroundColor:
                o.status === "ready"
                  ? C.mint
                  : o.status === "pending"
                    ? C.peach
                    : C.pink,
            },
          ]}
        >
          <Text style={{ fontSize: 10, fontWeight: "800", color: statusColor }}>
            {statusLabel(o.status)}
          </Text>
        </View>
      </View>
      <Text style={T.h2}>
        {o.customer_name || richItems(o)[0]?.product_name || "Kitchen ticket"}
      </Text>
      <Text style={T.sub}>
        {richItems(o)
          .map((i) => i.quantity + " × " + i.product_name)
          .join(" · ")}
      </Text>
      <View style={T.divider} />
      <View style={T.between}>
        <Text style={T.sub}>
          {o.delivery_date === dhakaDate() ? "আজ" : o.delivery_date} ·{" "}
          {o.delivery_slot || "Delivery time"}
        </Text>
        <Text style={T.h3}>{money(o.total_amount)}</Text>
      </View>
    </Pressable>
  );
}
function OrdersScreen({
  orders,
  session,
  onOpen,
  onCreate,
}: {
  orders: StaffOrder[];
  session: StaffSession;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const [filter, setFilter] = useState("active"),
    [query, setQuery] = useState("");
  const groups = [
    ["active", "Active"],
    ["pending", "নতুন"],
    ["preparing", "Baking"],
    ["ready", "Ready"],
    ["delivered", "Delivered"],
    ["all", "সব"],
  ];
  const shown = orders.filter(
    (o) =>
      (filter === "all" ||
        (filter === "active" && isLive(o)) ||
        o.status === filter) &&
      JSON.stringify([o.order_number,formatOrderNumber(o.order_number), o.customer_name, o.customer_phone])
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <View style={T.between}>
        <View>
          <Text style={T.eyebrow}>EVERY BOX HAS A STORY</Text>
          <Text style={T.title}>Order book</Text>
        </View>
        {canCreate(session.role) && (
          <Pressable
            accessibilityLabel="Add order"
            onPress={onCreate}
            style={S.add}
          >
            <Text style={{ fontSize: 28, color: C.brand }}>+</Text>
          </Pressable>
        )}
      </View>
      <Field
        label="খুঁজে নিন"
        placeholder="নাম, ফোন বা order number…"
        value={query}
        onChangeText={setQuery}
      />
      <View style={T.wrap}>
        {groups.map(([id, l]) => (
          <Chip
            key={id}
            label={l}
            selected={filter === id}
            onPress={() => setFilter(id)}
          />
        ))}
      </View>
      <Text style={T.sub}>{shown.length}টি order · সর্বশেষ পাওয়া তালিকা</Text>
      {shown.map((o) => (
        <OrderCard key={o.id} order={o} onPress={() => onOpen(o.id)} />
      ))}
      {!shown.length && (
        <Empty
          title="এই পাতায় কোনো order নেই"
          detail="অন্য filter বাছুন বা নতুন order এলে এখানে দেখুন।"
        />
      )}
    </>
  );
}
function BakeScreen({
  orders,
  onOpen,
}: {
  orders: StaffOrder[];
  onOpen: (id: string) => void;
}) {
  const [day, setDay] = useState(dhakaDate()),
    plan = batchPlan(orders, day),
    tickets = orders.filter(
      (o) =>
        o.delivery_date === day &&
        ["confirmed", "preparing"].includes(o.status),
    );
  return (
    <>
      <Text style={T.eyebrow}>BAKE TOGETHER. FINISH BETTER.</Text>
      <Text style={T.title}>একসাথে, যত্ন করে</Text>
      <Text style={T.sub}>
        একই size ও flavor-এর কেক একসাথে দেখুন। কেকের আলাদা message order-এর
        ভেতরে আছে।
      </Text>
      <View style={T.wrap}>
        {[0, 1, 2].map((n) => (
          <Chip
            key={n}
            label={n === 0 ? "আজ" : n === 1 ? "আগামীকাল" : "পরশু"}
            selected={day === dhakaDate(new Date(Date.now() + n * 86400000))}
            onPress={() =>
              setDay(dhakaDate(new Date(Date.now() + n * 86400000)))
            }
          />
        ))}
      </View>
      <View style={[T.card, { backgroundColor: C.peach }]}>
        <Text style={T.eyebrow}>BATCH PLAN</Text>
        <Text style={T.title}>
          {plan.reduce((s, p) => s + p.quantity, 0)}টি কেক
        </Text>
        <Text style={T.sub}>
          {tickets.length}টি confirmed/baking order · {plan.length} ধরনের batch
        </Text>
      </View>
      {plan.map((p, i) => (
        <View key={i} style={T.card}>
          <View style={T.between}>
            <View style={{ flex: 1 }}>
              <Text style={T.h2}>{p.name}</Text>
              <Text style={T.sub}>
                {[p.variant, p.flavor].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Text style={[T.title, { color: C.brand }]}>×{p.quantity}</Text>
          </View>
          {!!p.messages.length && (
            <Text style={T.sub}>
              {p.messages.length}টি আলাদা cake writing আছে
            </Text>
          )}
          <View style={T.wrap}>
            {[...p.orders].map((id) => (
              <Chip
                key={id}
                label={formatOrderNumber(orders.find((o) => o.id === id)?.order_number)}
                onPress={() => onOpen(id)}
              />
            ))}
          </View>
        </View>
      ))}
      {!plan.length && (
        <Empty
          title="এই দিনের batch খালি"
          detail="Confirmed ও baking order থেকে স্বয়ংক্রিয়ভাবে তৈরি হবে।"
        />
      )}
      <Text style={T.h2}>Kitchen tickets</Text>
      {tickets.map((o) => (
        <OrderCard key={o.id} order={o} onPress={() => onOpen(o.id)} />
      ))}
    </>
  );
}
function DeliveryScreen({
  orders,
  onOpen,
}: {
  orders: StaffOrder[];
  onOpen: (id: string) => void;
}) {
  const list = orders.filter((o) =>
    ["ready", "assigned", "picked_up", "out_for_delivery"].includes(o.status),
  );
  return (
    <>
      <Text style={T.eyebrow}>THE LAST MILE MATTERS</Text>
      <Text style={T.title}>যত্ন পৌঁছে দিন</Text>
      <Text style={T.sub}>
        Delivery date অনুযায়ী সাজানো। Order খুলে call, directions ও handover
        করুন।
      </Text>
      {list.map((o) => (
        <OrderCard key={o.id} order={o} onPress={() => onOpen(o.id)} />
      ))}
      {!list.length && (
        <Empty
          title="এই মুহূর্তে handoff নেই"
          detail="Ready বা পথে থাকা order এখানে দেখা যাবে।"
        />
      )}
    </>
  );
}
const S = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: 24 },
  safeTop: {
    height:
      Platform.OS === "android"
        ? StatusBar.currentHeight || 24
        : Platform.OS === "ios"
          ? 52
          : 12,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  smallMark: {
    height: 42,
    width: 42,
    borderRadius: 14,
    backgroundColor: C.peach,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMark: {
    height: 83,
    width: 83,
    borderRadius: 27,
    backgroundColor: C.peach,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-6deg" }],
  },
  brandLetter: {
    fontSize: 54,
    color: C.brand,
    fontWeight: "800",
    letterSpacing: -5,
  },
  stat: { flex: 1, padding: 16, borderRadius: 21, gap: 6, minHeight: 100 },
  nav: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 32 : 19,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.paper,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    gap: 14,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    minHeight: 47,
    justifyContent: "center",
  },
  newOrder: {
    width: 57,
    height: 57,
    borderRadius: 21,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -26,
    borderWidth: 5,
    borderColor: C.bg,
  },
  add: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: C.pink,
    alignItems: "center",
    justifyContent: "center",
  },
});
