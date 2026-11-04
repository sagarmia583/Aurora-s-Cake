import {formatOrderNumber} from '../orderNumber';
import React, { useRef, useState } from "react";
import { Linking, Share, Switch, View } from "react-native";
import { Text } from "./typography";
import {
  canOperate,
  money,
  nextOperation,
  operationLabels,
  statusLabel,
  type Operation,
  type StaffOrder,
  type StaffSession,
} from "../domain";
import { changeOrder } from "./client";
import { CustomerLink } from './CustomerLink';
import { isLive, richItems, zoneName, type Catalog, type Row } from "./model";
import { Button, C, Chip, Field, Sheet, T } from "./ui";
export {receiptHtml} from './posReceipt';
import {PosSheet} from './PosSheet';
export function OrderDetail({
  order: o,
  session,
  token,
  catalog,
  onClose,
  onChanged,
  preview = false,
}: {
  order: StaffOrder;
  session: StaffSession;
  token: string;
  catalog: Catalog;
  onClose: () => void;
  onChanged: (o: StaffOrder) => void;
  preview?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [rider, setRider] = useState(o.rider_id || ""),
    [cash, setCash] = useState(false),
    [reason, setReason] = useState(""),
    [cancel, setCancel] = useState(false),
    [override, setOverride] = useState(false);
  const [pos,setPos]=useState(false);
  const lock = useRef(false);
  const manager = ["admin", "super_admin", "delivery_manager"].includes(
    session.role,
  );
  const next =
    nextOperation(o, session) ||
    (override && manager
      ? (
          {
            assigned: "pick_up",
            picked_up: "start_delivery",
            out_for_delivery: "deliver",
          } as Record<string, Operation>
        )[o.status]
      : null);
  const action = async (operation: Operation) => {
    if (lock.current) return;
    if (preview) {
      setError("Design preview — live order পরিবর্তন হবে না।");
      return;
    }
    if (operation === "assign" && !rider) {
      setError("আগে rider বাছুন।");
      return;
    }
    if (operation === "cancel" && !reason.trim()) {
      setError("Cancel করার কারণ লিখুন।");
      return;
    }
    if (
      operation === "deliver" &&
      o.payment_method === "cod" && !cash
    ) {
      setError("কেক বুঝিয়ে দেওয়ার আগে COD cash collection নিশ্চিত করুন।");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await changeOrder(token, o, operation, {
        ...(rider ? { rider_email: rider } : {}),
        ...(operation === "deliver"
          ? { cash_collected: cash }
          : {}),
        ...(operation === "cancel" ? { reason: reason.trim() } : {}),
        ...(override||['super_admin','admin'].includes(session.role) ? { admin_override: true } : {}),
      });
      onChanged(updated);
      setCash(false);
      setCancel(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  const history = Array.isArray((o as unknown as Row).history)
    ? (o as unknown as { history: Row[] }).history
    : [];
  return (
    <Sheet
      title={formatOrderNumber(o.order_number)}
      subtitle={statusLabel(o.status)}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        next ? (
          <Button
            label={operationLabels[next]}
            onPress={() => void action(next)}
            busy={busy}
          />
        ) : undefined
      }
    >
      {!!error && (
        <Text accessibilityRole="alert" style={T.error}>
          {error}
        </Text>
      )}
      <View style={[T.card, { backgroundColor: C.dark, borderColor: C.dark }]}>
        <Text style={[T.eyebrow, { color: "#DDB6C5" }]}>CAKE PASSPORT</Text>
        <Text style={[T.title, { color: "#FFF" }]}>
          {o.customer_name || "Kitchen ticket"}
        </Text>
        <Text style={{ color: "#E5DAE6", fontSize: 14 }}>
          {o.delivery_date} · {o.delivery_slot}
        </Text>
        <View style={[T.row, { marginTop: 7 }]}>
          {[
            "pending",
            "preparing",
            "ready",
            "out_for_delivery",
            "delivered",
          ].map((stage, i) => {
            const steps = [
              "pending",
              "confirmed",
              "preparing",
              "ready",
              "assigned",
              "picked_up",
              "out_for_delivery",
              "delivered",
            ];
            return (
              <View
                key={stage}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 3,
                  backgroundColor:
                    steps.indexOf(o.status) >= steps.indexOf(stage)
                      ? "#EBAA8A"
                      : "#66546D",
                }}
              />
            );
          })}
        </View>
      </View>
      {['super_admin','admin','order_manager','delivery_manager'].includes(session.role)&&<CustomerLink token={token} orderId={o.id} orderNumber={formatOrderNumber(o.order_number)} initialUrl={o.customer_share_url} preview={preview}/>}
      <View style={T.card}>
        <Text style={T.eyebrow}>MAKE IT JUST RIGHT</Text>
        {richItems(o).map((i, index) => (
          <View key={index} style={{ gap: 7, paddingVertical: 7 }}>
            <View style={T.between}>
              <Text style={[T.h2, { flex: 1 }]}>
                {i.quantity} × {i.product_name}
              </Text>
              <Text style={T.h3}>{money(i.subtotal)}</Text>
            </View>
            <Text style={T.sub}>
              {[i.variant_name, i.flavor_name].filter(Boolean).join(" · ")}
            </Text>
            {!!i.writing_message && (
              <View
                style={{
                  backgroundColor: C.peach,
                  padding: 14,
                  borderRadius: 13,
                }}
              >
                <Text style={T.eyebrow}>কেকের লেখা</Text>
                <Text style={[T.body, { fontWeight: "700" }]}>
                  “{i.writing_message}”
                </Text>
              </View>
            )}
            {i.addons?.map((a, k) => (
              <Text key={k} style={T.sub}>
                + {a.addon_name} × {a.quantity}
              </Text>
            ))}
          </View>
        ))}
      </View>
      {o.is_gift && (
        <View style={[T.card, { backgroundColor: C.peach }]}>
          <Text style={T.h2}>🎁 সারপ্রাইজ গিফট ডেলিভারি</Text>
          <Text style={T.body}>প্রাপক: {o.recipient_name || o.customer_name || '—'}</Text>
          {!!o.recipient_phone && <Text style={T.body}>প্রাপকের ফোন: {o.recipient_phone}</Text>}
          {o.hide_price_on_box && <Text style={T.h3}>বক্স / গিফট কার্ডে মূল্য উল্লেখ করবেন না</Text>}
          {!!o.gift_card_message && <Text style={T.body}>💌 {o.gift_card_message}</Text>}
          {!!o.sender_name && <Text style={T.sub}>প্রেরক: {o.sender_name}</Text>}
        </View>
      )}
      {!!o.order_note && (
        <View style={[T.card, { backgroundColor: C.peach }]}>
          <Text style={T.eyebrow}>REMEMBER THIS</Text>
          <Text style={T.body}>{o.order_note}</Text>
        </View>
      )}
      {!!o.delivery_address && (
        <View style={T.card}>
          <Text style={T.eyebrow}>THE LAST MILE</Text>
          <Text style={T.body}>{o.delivery_address}</Text>
          <Text style={T.sub}>
            {zoneName(o)} · {o.rider_name || "Rider নির্ধারণ হয়নি"}
          </Text>
          <View style={T.row}>
            {(o.is_gift && o.recipient_phone || o.customer_phone) && (
              <Button
                kind="ghost"
                label={o.is_gift && o.recipient_phone ? "Call recipient" : "Call customer"}
                style={{ flex: 1 }}
                onPress={() =>
                  void Linking.openURL(
                    "tel:" + (o.is_gift && o.recipient_phone ? o.recipient_phone : o.customer_phone || '').replace(/[^+0-9]/g, ""),
                  )
                }
              />
            )}
            <Button
              kind="ghost"
              label="Directions ↗"
              style={{ flex: 1 }}
              onPress={() =>
                void Linking.openURL(
                  "https://www.google.com/maps/search/?api=1&query=" +
                    encodeURIComponent(o.delivery_address!),
                )
              }
            />
          </View>
        </View>
      )}
      {manager &&
        ["confirmed", "preparing", "ready", "assigned"].includes(o.status) && (
          <View style={T.card}>
            <Text style={T.h2}>Rider বাছুন</Text>
            <View style={T.wrap}>
              {session.riders.map((r) => (
                <Chip
                  key={r.email}
                  label={r.name}
                  selected={rider === r.email}
                  onPress={() => setRider(r.email)}
                />
              ))}
            </View>
            {!session.riders.length && (
              <Text style={T.sub}>
                Active rider account যোগ করলে এখানে পাওয়া যাবে।
              </Text>
            )}
            <Button
              label="Assign rider"
              kind="ghost"
              busy={busy}
              disabled={!rider}
              onPress={() => void action("assign")}
            />
          </View>
        )}
      {manager && !['super_admin','admin'].includes(session.role) &&
        ["assigned", "picked_up", "out_for_delivery"].includes(o.status) && (
          <View style={[T.card, T.between]}>
            <View style={{ flex: 1 }}>
              <Text style={T.h3}>Manager handover</Text>
              <Text style={T.sub}>নিজে delivery যাচাই ও দায়িত্ব নিচ্ছেন</Text>
            </View>
            <Switch
              accessibilityLabel="Manager handover override"
              value={override}
              onValueChange={setOverride}
              trackColor={{ true: C.brand }}
            />
          </View>
        )}
      {next === "deliver" && (
        <View style={T.card}>
          <Text style={T.h2}>শেষ ধাপ, যত্ন করে</Text>
          <Text style={T.body}>কেক বুঝিয়ে দিন ও প্রযোজ্য cash সংগ্রহ করুন।</Text>
          {o.payment_method === "cod" && (
            <View style={T.between}>
              <View style={{ flex: 1 }}>
                <Text style={T.h3}>
                  {money(o.cod_amount ?? o.total_amount)} cash পেয়েছি
                </Text>
                <Text style={T.sub}>Cash হাতে পাওয়ার পর চালু করুন</Text>
              </View>
              <Switch
                accessibilityLabel="COD cash collected"
                value={cash}
                onValueChange={setCash}
              />
            </View>
          )}
        </View>
      )}
      <View style={T.card}>
        <View style={T.between}>
          <Text style={T.h3}>Order total</Text>
          <Text style={T.h2}>{money(o.total_amount)}</Text>
        </View>
        <Text style={T.sub}>
          {o.payment_status || "pending"} ·{" "}
          {o.payment_method?.toUpperCase() || "COD"}
          {o.cod_collected ? " · Cash collected" : ""}
        </Text>
        <View style={T.row}>
          <Button
            label="POS print"
            kind="ghost"
            style={{ flex: 1 }}
            onPress={() =>setPos(true)}
          />
          <Button
            label="Share"
            kind="ghost"
            style={{ flex: 1 }}
            onPress={() =>
              void Share.share({
                message: [
                  String(catalog.settings.shop_name || "Aurora’s Cake"),
                  formatOrderNumber(o.order_number),
                  statusLabel(o.status),
                  o.delivery_date,
                  o.delivery_slot,
                  money(o.total_amount),
                ]
                  .filter(Boolean)
                  .join("\n"),
              })
            }
          />
        </View>
      </View>
      {!!history.length && (
        <View style={T.card}>
          <Text style={T.eyebrow}>ORDER JOURNEY</Text>
          {history
            .slice()
            .reverse()
            .map((h, i) => (
              <View key={i} style={{ gap: 3, paddingVertical: 6 }}>
                <Text style={T.h3}>
                  {statusLabel(h.status as StaffOrder["status"])}
                </Text>
                <Text style={T.sub}>
                  {String(h.notes || "")} · {String(h.actor_name || "")}
                </Text>
              </View>
            ))}
        </View>
      )}
      {isLive(o) && canOperate(session.role, "cancel") && (
        <View style={{ gap: 12 }}>
          <Button
            label={cancel ? "Cancel না করে ফিরে যান" : "Order cancel…"}
            kind="ghost"
            disabled={busy}
            onPress={() => setCancel((v) => !v)}
          />
          {cancel && (
            <>
              <Field
                label="Cancel করার কারণ"
                value={reason}
                onChangeText={setReason}
              />
              <Button
                label="কারণসহ order cancel করুন"
                kind="danger"
                busy={busy}
                onPress={() => void action("cancel")}
              />
            </>
          )}
        </View>
      )}
      {pos&&<PosSheet order={o} catalog={catalog} demo={preview} onClose={()=>setPos(false)}/>}
    </Sheet>
  );
}
