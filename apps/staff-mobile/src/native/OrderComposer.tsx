import {formatOrderNumber} from '../orderNumber';
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./typography";
import {
  money,
  validateBangladeshiPhone,
  type StaffOrder,
  type StaffSession,
} from "../domain";
import { orderServices, request } from "./client";
import { CustomerLink } from './CustomerLink';
import {
  finishOrder,
  loadPending,
  startAnotherOrder,
  type PendingOrder,
} from "./orders";
import {
  active,
  canManage,
  CUSTOM_CAKE_ID,
  dhakaDate,
  linePrice,
  quote,
  unitPrice,
  type CartLine,
  type Catalog,
  type Product,
  type Variant,
  type Draft,
} from "./model";
import { Button, C, Chip, Empty, Field, Photo, Sheet, T, pressFeedback } from "./ui";
import { CmsScreen } from "./CmsScreen";
import { deliverySlotOpen } from "../deliverySlot";
export function OrderComposer({
  catalog: c,
  session,
  token,
  onClose,
  onSaved,
  onCatalogChanged,
  preview = false,
}: {
  catalog: Catalog;
  session: StaffSession;
  token: string;
  onClose: () => void;
  onSaved: (o: StaffOrder) => void;
  onCatalogChanged: () => void;
  preview?: boolean;
}) {
  const [zoneEditor, setZoneEditor] = useState(false);
  const [customEditor, setCustomEditor] = useState(false);
  const [step, setStep] = useState(0),
    [lines, setLines] = useState<CartLine[]>([]),
    [productId, setProductId] = useState<string | null>(null),
    [search, setSearch] = useState("");
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [address, setAddress] = useState(""),
    [zone, setZone] = useState(c.zones[0]?.id || ""),
    [slot, setSlot] = useState("");
  const [date, setDate] = useState(dhakaDate()),
    [code, setCode] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [lookupBusy, setLookupBusy] = useState(false);
  const [pending, setPending] = useState<PendingOrder | null>(null),
    [restoring, setRestoring] = useState(!preview),
    [result, setResult] = useState<{
      order: StaffOrder;
      warning: string;
    } | null>(null);
  const inFlight = useRef(false),
    alive = useRef(true);
  const product = c.products.find((entry) => entry.id === productId && entry.is_active && entry.variants.length);
  const services = useMemo(() => orderServices(token), [token]);
  useEffect(() => {
    alive.current = true;
    if (!preview)
      void loadPending(services, session.email)
        .then((p) => {
          if (!alive.current) return;
          setPending(p);
          if (p?.receipt)
            setResult({
              order: p.receipt,
              warning:
                p.receipt.status === "pending"
                  ? "Confirmation live queue থেকে যাচাই করুন।"
                  : "",
            });
        })
        .catch((e) => {
          if (alive.current) setError(e.message);
        })
        .finally(() => {
          if (alive.current) setRestoring(false);
        });
    return () => {
      alive.current = false;
    };
  }, [services, session.email, preview]);
  const totals = useMemo(() => {
    try {
      return { ...quote(c, lines, zone, code), selectionError: "" };
    } catch (e) {
      return {
        subtotal: 0,
        discount: 0,
        delivery: 0,
        total: 0,
        error: "",
        selectionError: (e as Error).message,
      };
    }
  }, [c, lines, zone, code]);
  const locked = !!pending && !pending.receipt;
  const availableSlots = c.slots.filter(label => deliverySlotOpen(label, date));
  const selectedSlot = slot ? availableSlots.find(label => label === slot) || "" : availableSlots[0] || "";
  const changeDate = (value: string) => { setDate(value); setSlot(""); };
  const close = () => {
    if (!busy) onClose();
  };
  const submit = async (retry = false) => {
    if (preview) {
      setError("Design preview — live Sheet-এ কোনো order পাঠানো হবে না।");
      return;
    }
    if (inFlight.current || restoring) return;
    setError("");
    let draft: Draft | undefined;
    if (!retry) {
      const valid = validateBangladeshiPhone(phone);
      if (!name.trim() || !valid.isValid || !address.trim()) {
        setError(valid.error || "নাম ও সম্পূর্ণ delivery address দিন।");
        setStep(1);
        return;
      }
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date < dhakaDate() ||
        !c.zones.some((z) => z.id === zone) ||
        !selectedSlot || !deliverySlotOpen(selectedSlot, date)
      ) {
        setError("সঠিক date, delivery area ও time বাছুন।");
        setStep(1);
        return;
      }
      if (
        !active(c.settings.accepting_orders) ||
        !active(c.settings.delivery_enabled) ||
        !lines.length ||
        totals.error ||
        totals.selectionError
      ) {
        setError(
          totals.error ||
            totals.selectionError ||
            "দোকান এখন order নিচ্ছে না অথবা bag খালি।",
        );
        return;
      }
      draft = {
        customer_name: name.trim(),
        customer_phone: valid.phone,
        delivery_address: address.trim(),
        delivery_zone_id: zone,
        delivery_date: date,
        delivery_slot: selectedSlot,
        coupon_code: code.trim().toUpperCase(),
        order_note: note.trim(),
        cart_items: lines.map(({ key, ...line }) => line),
        payment_method: "cod",
        expected_total: totals.total,
      };
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const saved = await finishOrder(services, session.email, draft);
      if (alive.current) setResult(saved);
      onSaved(saved.order);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) {
        try {
          setPending(await loadPending(services, session.email));
        } catch {}
        setBusy(false);
      }
      inFlight.current = false;
    }
  };
  const lookup = async () => {
    if (preview) return;
    const valid = validateBangladeshiPhone(phone);
    if (!valid.isValid) {
      setError(valid.error || "Phone number দিন।");
      return;
    }
    setLookupBusy(true);
    setError("");
    try {
      const d = await request(
          "staff_customer_lookup",
          { phone: valid.phone },
          token,
        ),
        customer = d.customer as Record<string, unknown> | undefined;
      if (customer) {
        setName(String(customer.name || ""));
        setAddress(String(customer.delivery_address || ""));
      } else
        setError(
          "এই নম্বরে আগের customer পাওয়া যায়নি। নতুন customer-এর তথ্য দিন।",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLookupBusy(false);
    }
  };
  if (result)
    return (
      <Sheet
        title="Order saved"
        subtitle="Sheet থেকে নিশ্চিত receipt"
        onClose={close}
        footer={
          <Button
            label="আরেকটি নতুন order"
            onPress={() => {
              void startAnotherOrder(services, session.email)
                .then(() => {
                  setResult(null);
                  setPending(null);
                  setLines([]);
                  setName("");
                  setPhone("");
                  setAddress("");
                  setCode("");
                  setNote("");
                  setStep(0);
                })
                .catch((e) => setError(e.message));
            }}
          />
        }
      >
        <View style={[T.card, { backgroundColor: C.mint, padding: 25 }]}>
          <Text style={T.eyebrow}>ALL SET</Text>
          <Text style={T.title}>{formatOrderNumber(result.order.order_number)}</Text>
          <Text style={T.body}>{result.order.customer_name}</Text>
          <Text style={T.title}>{money(result.order.total_amount)}</Text>
          <Text style={T.sub}>
            Status: {result.order.status} · Cash on delivery
          </Text>
        </View>
        {!!result.warning && <Text style={T.error}>{result.warning}</Text>}
        {!!error && <Text style={T.error}>{error}</Text>}
        <CustomerLink token={token} orderId={result.order.id} orderNumber={formatOrderNumber(result.order.order_number)} initialUrl={result.order.customer_share_url} preview={preview} autoCreate/>
        <Text style={T.sub}>
          একই order নতুন করে তৈরি হয়নি। Order queue থেকে পরের কাজটি করতে পারবেন।
        </Text>
      </Sheet>
    );
  const next = () => {
    setError("");
    if (!lines.length) {
      setError("আগে অন্তত একটি কেক বাছুন।");
      return;
    }
    setStep((s) => Math.min(2, s + 1));
  };
  return (
    <Sheet
      title="একটি মিষ্টি শুরু"
      subtitle="নতুন customer order"
      onClose={close}
      footer={
        <View style={{ gap: 11 }}>
          <View style={T.between}>
            <Text style={T.sub}>
              {lines.reduce((s, l) => s + l.quantity, 0)}টি কেক ·{" "}
              {step === 2 ? "COD total" : "Bag total"}
            </Text>
            <Text style={T.h2}>
              {money(step === 2 ? totals.total : totals.subtotal)}
            </Text>
          </View>
          <Button
            label={
              locked
                ? "Retry saved order"
                : step === 2
                  ? "Sheet-এ order confirm করুন"
                  : "পরের ধাপ →"
            }
            busy={busy || restoring}
            onPress={() =>
              locked ? void submit(true) : step === 2 ? void submit() : next()
            }
          />
        </View>
      }
    >
      <View style={T.row}>
        {["কেক", "Delivery", "Review"].map((label, i) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityState={{selected:i===step}}
            onPress={() => {
              if (!busy && !locked && (i <= step || lines.length)) setStep(i);
            }}
            style={({pressed}) => [{flex:1,gap:7,minHeight:44,justifyContent:'center'},pressed&&pressFeedback]}
          >
            <View
              style={{
                height: 4,
                borderRadius: 3,
                backgroundColor: i <= step ? C.brand : C.line,
              }}
            />
            <Text
              style={[
                T.sub,
                i === step && { fontWeight: "800", color: C.brand },
              ]}
            >
              {i + 1} · {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={T.error}>
          {error}
        </Text>
      )}
      {locked && (
        <Text style={T.error}>
          আগের order-এর reply নিশ্চিত হয়নি। নিচের Retry দিয়ে একই reference যাচাই
          করুন।
        </Text>
      )}
      {step === 0 && (
        <>
          <Field
            label="আপনার কেক খুঁজুন"
            placeholder="কেকের নাম…"
            value={search}
            onChangeText={setSearch}
          />
          <Button label="Add custom cake" kind="ghost" disabled={locked} onPress={() => setCustomEditor(true)} />
          {lines.length > 0 && (
            <View style={T.card}>
              <Text style={T.eyebrow}>YOUR CAKE BOX</Text>
              {lines.map((line) => {
                const p = c.products.find((p) => p.id === line.product_id);
                return (
                  <View key={line.key} style={T.between}>
                    <View style={{ flex: 1 }}>
                      <Text style={T.h3}>
                        {line.quantity} × {line.custom?.name || p?.name || "Unavailable cake"}
                      </Text>
                      <Text style={T.sub}>
                        {
                          line.custom?.size || p?.variants.find((v) => v.id === line.variant_id)
                            ?.name
                        }{" "}
                        · {line.writing_message}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityLabel="Remove cake"
                      accessibilityRole="button"
                      disabled={locked}
                      onPress={() =>
                        setLines((v) => v.filter((l) => l.key !== line.key))
                      }
                      style={({pressed}) => [{padding:12},pressed&&pressFeedback]}
                    >
                      <Text style={T.link}>বাদ</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
          {c.products
            .filter(
              (p) =>
                p.is_active &&
                p.variants.length &&
                p.name.toLowerCase().includes(search.toLowerCase()),
            )
            .map((p) => {
              const entry = p.variants.reduce((lowest, v) => unitPrice(p, v) < unitPrice(p, lowest) ? v : lowest);
              return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                disabled={locked}
                onPress={() => setProductId(p.id)}
                style={({pressed}) => [T.card,T.row,pressed&&pressFeedback]}
              >
                <Photo uri={p.image_url} label={p.name} size={67} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={T.h3}>{p.name}</Text>
                  <Text style={T.sub}>{p.category}</Text>
                  <Text style={T.link}>
                    {p.variants.length > 1 ? "From · " : ""}{cakePriceLabel(p, entry)}
                  </Text>
                </View>
                <View style={[T.close, { backgroundColor: C.pink }]}>
                  <Text style={{ fontSize: 24, color: C.brand }}>+</Text>
                </View>
              </Pressable>
              );
            })}
          {!c.products.some((p) => p.is_active && p.variants.length) && (
            <Empty
              title="Catalogue এখন খালি"
              detail="Sheet-এর live active cake ও size লোড হলে এখানে দেখাবে।"
            />
          )}
        </>
      )}
      {step === 1 && (
        <>
          <View style={T.card}>
            <Text style={T.eyebrow}>CUSTOMER</Text>
            <Field
              label="মোবাইল নম্বর"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              placeholder="017XXXXXXXX"
              editable={!locked}
            />
            <Button
              kind="ghost"
              label="আগের customer-এর তথ্য খুঁজুন"
              busy={lookupBusy}
              disabled={locked || preview}
              onPress={() => void lookup()}
            />
            <Field
              label="Customer-এর নাম"
              value={name}
              onChangeText={setName}
              editable={!locked}
            />
            <Field
              label="সম্পূর্ণ delivery address"
              value={address}
              onChangeText={setAddress}
              multiline
              editable={!locked}
            />
          </View>
          <Text style={T.h2}>কোথায়, কখন?</Text>
          <View style={T.wrap}>
            {c.zones.map((z) => (
              <Chip
                key={z.id}
                label={z.name + " · " + money(z.delivery_fee)}
                selected={zone === z.id}
                onPress={() => {
                  if (!locked) setZone(z.id);
                }}
              />
            ))}
          </View>
          {canManage(session.role) && (
            <Button
              kind="ghost"
              label="+ Delivery area যোগ করুন"
              disabled={locked || preview}
              onPress={() => setZoneEditor(true)}
            />
          )}
          <View style={T.wrap}>
            {[0, 1, 2].map((n) => (
              <Chip
                key={n}
                label={n === 0 ? "আজ" : n === 1 ? "আগামীকাল" : "পরশু"}
                selected={
                  date === dhakaDate(new Date(Date.now() + n * 86400000))
                }
                onPress={() =>
                  changeDate(dhakaDate(new Date(Date.now() + n * 86400000)))
                }
              />
            ))}
          </View>
          <Field
            label="Delivery date · YYYY-MM-DD"
            value={date}
            onChangeText={changeDate}
            editable={!locked}
          />
          <View style={T.wrap}>
            {!availableSlots.length && <Text style={T.sub}>এই দিনে আর slot নেই। অন্য date বাছুন।</Text>}
            {availableSlots.map((s) => (
              <Chip
                key={s}
                label={s}
                selected={selectedSlot === s}
                onPress={() => {
                  if (!locked) setSlot(s);
                }}
              />
            ))}
          </View>
        </>
      )}
      {step === 2 && (
        <>
          <View style={T.card}>
            <Text style={T.eyebrow}>CHECK BEFORE SENDING</Text>
            <Text style={T.h2}>{name || "Customer name"}</Text>
            <Text style={T.body}>
              {phone} · {address}
            </Text>
            <Text style={T.sub}>
              {c.zones.find((z) => z.id === zone)?.name} · {date} · {selectedSlot}
            </Text>
            <View style={T.divider} />
            {lines.map((l) => (
              <View key={l.key} style={T.between}>
                <Text style={[T.body, { flex: 1 }]}>
                  {l.quantity} ×{" "}
                  {l.custom?.name || c.products.find((p) => p.id === l.product_id)?.name}
                </Text>
                <Text style={T.h3}>
                  {totals.selectionError ? "—" : money(linePrice(c, l))}
                </Text>
              </View>
            ))}
          </View>
          <Text style={T.h2}>একটু বেশি মিষ্টি</Text>
          <Text style={T.sub}>Sheet-এর available offer</Text>
          <View style={T.wrap}>
            {c.coupons
              .filter((o) => o.is_active)
              .map((o) => (
                <Chip
                  key={o.id}
                  label={
                    o.code +
                    " · " +
                    (o.discount_type === "percentage"
                      ? o.discount_value + "%"
                      : money(o.discount_value))
                  }
                  selected={code === o.code}
                  onPress={() => setCode(code === o.code ? "" : o.code)}
                />
              ))}
          </View>
          <Field
            label="Offer code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
          />
          {!!totals.error && <Text style={T.error}>{totals.error}</Text>}
          <Field
            label="Gift message / kitchen note (ঐচ্ছিক)"
            value={note}
            onChangeText={setNote}
            multiline
          />
          <View style={T.card}>
            {[
              ["কেক", totals.subtotal],
              ["Offer discount", -totals.discount],
              ["Delivery", totals.delivery],
              ["মোট COD", totals.total],
            ].map(([l, a]) => (
              <View key={String(l)} style={T.between}>
                <Text style={T.body}>{l}</Text>
                <Text style={T.h3}>
                  {Number(a) < 0 ? "−" + money(-Number(a)) : money(Number(a))}
                </Text>
              </View>
            ))}
          </View>
          <Text style={T.sub}>
            Final price server যাচাই করবে। Live queue-তে সংরক্ষিত order-ই দেখা
            যাবে।
          </Text>
        </>
      )}
      {product && (
        <ConfigureCake
          product={product}
          catalog={c}
          onClose={() => setProductId(null)}
          onAdd={(line) => {
            setLines((v) => [
              ...v,
              { ...line, key: Date.now() + "_" + v.length },
            ]);
            setProductId(null);
          }}
        />
      )}
      {customEditor && (
        <ConfigureCustomCake
          onClose={() => setCustomEditor(false)}
          onAdd={(line) => {
            setLines((current) => [...current, { ...line, key: Date.now() + "_" + current.length }]);
            setCustomEditor(false);
          }}
        />
      )}
      {zoneEditor && (
        <CmsScreen
          table="delivery_zones"
          title="Delivery areas"
          token={token}
          catalog={c}
          onClose={() => setZoneEditor(false)}
          onChanged={onCatalogChanged}
          preview={preview}
        />
      )}
    </Sheet>
  );
}

function cakePriceLabel(product: Product, variant: Variant) {
  const price = unitPrice(product, variant);
  return price < variant.price
    ? `Regular ${money(variant.price)} · Offer ${money(price)}`
    : price !== variant.price
      ? `Regular ${money(variant.price)} · Current ${money(price)}`
      : `Regular ${money(variant.price)}`;
}

function ConfigureCustomCake({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (line: Omit<CartLine, "key">) => void;
}) {
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [flavor, setFlavor] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [writing, setWriting] = useState("");
  const count = Number(quantity);
  const amount = Number(price);
  const valid = name.trim().length >= 2 && !!size.trim() &&
    /^\d+(\.\d{1,2})?$/.test(price.trim()) && amount >= 0.01 && amount <= 10000000 &&
    Number.isInteger(count) && count >= 1 && count <= 50;
  const add = () => {
    if (!valid) return;
    onAdd({
      product_id: CUSTOM_CAKE_ID, variant_id: CUSTOM_CAKE_ID,
      flavor_id: "", addon_ids: [], writing_message: writing.trim(), quantity: count,
      custom: { name: name.trim(), size: size.trim(), flavor: flavor.trim(), unit_price: amount },
    });
  };
  return (
    <Sheet title="Custom cake" subtitle="Add a cake with its agreed price" onClose={onClose}
      footer={<Button label="Add to order" disabled={!valid} onPress={add} />}>
      <Field label="Cake name" value={name} onChangeText={setName} maxLength={120} />
      <Field label="Size or weight" value={size} onChangeText={setSize} maxLength={100} />
      <Field label="Flavor (optional)" value={flavor} onChangeText={setFlavor} maxLength={150} />
      <Field label="Agreed price per cake (৳)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" maxLength={2} />
      <Field label="Cake message (optional)" value={writing} onChangeText={setWriting} maxLength={200} multiline />
    </Sheet>
  );
}

function ConfigureCake({
  product: p,
  catalog: c,
  onClose,
  onAdd,
}: {
  product: Product;
  catalog: Catalog;
  onClose: () => void;
  onAdd: (l: Omit<CartLine, "key">) => void;
}) {
  const [variant, setVariant] = useState(p.variants[0].id),
    [flavor, setFlavor] = useState(p.flavors[0] || ""),
    [addons, setAddons] = useState<string[]>([]),
    [quantity, setQuantity] = useState(1),
    [writing, setWriting] = useState("");
  const line = {
    product_id: p.id,
    variant_id: variant,
    flavor_id: flavor,
    addon_ids: addons,
    quantity,
    writing_message: writing,
  };
  let price = 0,
    selectionError = "";
  try {
    price = linePrice(c, line);
  } catch (e) {
    selectionError = (e as Error).message;
  }
  return (
    <Sheet
      title={p.name}
      subtitle="আপনার মতো করে সাজান"
      onClose={onClose}
      footer={
        <Button
          label={"Bag-এ রাখুন · " + money(price)}
          disabled={!!selectionError}
          onPress={() => onAdd(line)}
        />
      }
    >
      {!!selectionError && <Text style={T.error}>{selectionError}</Text>}
      <View style={T.row}>
        <Photo uri={p.image_url} label={p.name} size={92} />
        <Text style={[T.body, { flex: 1 }]}>{p.description}</Text>
      </View>
      <Text style={T.h2}>সাইজ</Text>
      <View style={T.wrap}>
        {p.variants.map((v) => (
          <Chip
            key={v.id}
            label={v.name + " · " + cakePriceLabel(p, v)}
            selected={variant === v.id}
            onPress={() => setVariant(v.id)}
          />
        ))}
      </View>
      {!!p.flavors.length && (
        <>
          <Text style={T.h2}>Flavor</Text>
          <View style={T.wrap}>
            {c.flavors
              .filter((f) => p.flavors.includes(f.id))
              .map((f) => (
                <Chip
                  key={f.id}
                  label={f.name}
                  selected={flavor === f.id}
                  onPress={() => setFlavor(f.id)}
                />
              ))}
          </View>
        </>
      )}
      {!!p.addons.length && (
        <>
          <Text style={T.h2}>ছোট্ট কিছু extra</Text>
          <View style={T.wrap}>
            {c.addons
              .filter((a) => p.addons.includes(a.id))
              .map((a) => (
                <Chip
                  key={a.id}
                  label={
                    (addons.includes(a.id) ? "✓ " : "") +
                    a.name +
                    " +" +
                    money(a.price)
                  }
                  selected={addons.includes(a.id)}
                  onPress={() =>
                    setAddons((v) =>
                      v.includes(a.id)
                        ? v.filter((id) => id !== a.id)
                        : [...v, a.id],
                    )
                  }
                />
              ))}
          </View>
        </>
      )}
      <Field
        label="কেকের ওপর কী লেখা হবে?"
        placeholder="Happy birthday…"
        value={writing}
        maxLength={150}
        onChangeText={setWriting}
      />
      <View style={T.between}>
        <Text style={T.h2}>কতটি?</Text>
        <View style={T.row}>
          <Button
            label="−"
            kind="ghost"
            disabled={quantity <= 1}
            onPress={() => setQuantity((q) => q - 1)}
          />
          <Text style={T.h2}>{quantity}</Text>
          <Button
            label="+"
            kind="ghost"
            disabled={quantity >= 50}
            onPress={() => setQuantity((q) => q + 1)}
          />
        </View>
      </View>
    </Sheet>
  );
}
