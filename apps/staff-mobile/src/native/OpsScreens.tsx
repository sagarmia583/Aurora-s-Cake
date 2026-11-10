import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Text } from "./typography";
import * as Print from "expo-print";
import {
  money,
  roles,
  roleLabel,
  validateBangladeshiPhone,
  type StaffOrder,
  type StaffSession,
} from "../domain";
import { request, sessionFor } from "./client";
import { dhakaDate, richItems, type Catalog, type Row } from "./model";
import { Button, C, Chip, Empty, Field, Photo, Sheet, T, pressFeedback } from "./ui";
export function Reports({
  orders,
  onClose,
}: {
  orders: StaffOrder[];
  onClose: () => void;
}) {
  const [days, setDays] = useState(1);
  const cutoff = dhakaDate(new Date(Date.now() - (days - 1) * 86400000));
  const selected = orders.filter(
      (o) => dhakaDate(new Date(o.created_at)) >= cutoff,
    ),
    delivered = selected.filter((o) => o.status === "delivered");
  const deliveredValue = delivered.reduce((s, o) => s + o.total_amount, 0),
    cash = delivered
      .filter((o) => o.cod_collected)
      .reduce((s, o) => s + (o.cod_amount ?? o.total_amount), 0);
  const groups = new Map<string, { count: number; cash: number }>();
  for (const o of delivered.filter((o) => o.cod_collected)) {
    const key = o.rider_name || "Counter / unassigned";
    const g = groups.get(key) || { count: 0, cash: 0 };
    g.count++;
    g.cash += o.cod_amount ?? o.total_amount;
    groups.set(key, g);
  }
  const print = () =>
    void Print.printAsync({
      html:
        '<html><body style="font-family:sans-serif;padding:30px"><h1>Aurora’s Cake · Collection statement</h1><p>' +
        cutoff +
        " — " +
        dhakaDate() +
        "</p><p>Loaded orders: " +
        selected.length +
        "</p><p>Delivered: " +
        delivered.length +
        "</p><h2>Delivered value: " +
        money(deliveredValue) +
        "</h2><h2>Collected COD: " +
        money(cash) +
        "</h2><p>Based on the current loaded order snapshot; not a cash-deposit/bank reconciliation.</p></body></html>",
    });
  return (
    <Sheet
      title="দোকানের পালস"
      subtitle="Sales ও cash, আলাদা করে"
      onClose={onClose}
      footer={<Button label="Print collection statement" onPress={print} />}
    >
      <View style={T.wrap}>
        {[
          [1, "আজ"],
          [7, "৭ দিন"],
          [30, "৩০ দিন"],
        ].map(([n, l]) => (
          <Chip
            key={n}
            label={String(l)}
            selected={days === n}
            onPress={() => setDays(Number(n))}
          />
        ))}
      </View>
      <View style={[T.card, { backgroundColor: C.dark }]}>
        <Text style={[T.eyebrow, { color: "#D6B4C2" }]}>DELIVERED VALUE</Text>
        <Text style={[T.title, { color: "#FFF", fontSize: 38 }]}>
          {money(deliveredValue)}
        </Text>
        <Text style={{ color: "#DCD2E0" }}>
          {delivered.length}টি delivered order
        </Text>
      </View>
      <View style={T.row}>
        <View style={[T.card, { flex: 1 }]}>
          <Text style={T.sub}>মোট order</Text>
          <Text style={T.title}>{selected.length}</Text>
        </View>
        <View style={[T.card, { flex: 1, backgroundColor: C.mint }]}>
          <Text style={T.sub}>হাতে পাওয়া COD</Text>
          <Text style={T.h2}>{money(cash)}</Text>
        </View>
      </View>
      <Text style={T.h2}>Collection by rider</Text>
      {[...groups].map(([name, g]) => (
        <View key={name} style={[T.card, T.between]}>
          <View style={{ flex: 1 }}>
            <Text style={T.h3}>{name}</Text>
            <Text style={T.sub}>{g.count}টি cash handover</Text>
          </View>
          <Text style={T.h2}>{money(g.cash)}</Text>
        </View>
      ))}
      {!groups.size && (
        <Empty
          title="COD collection নেই"
          detail="Delivered ও cash-collected order এখানে গণনা হবে।"
        />
      )}
      <Text style={T.sub}>
        বর্তমানে লোড হওয়া {orders.length}টি order-এর snapshot থেকে হিসাব। Bank
        deposit, expense বা সব সময়ের হিসাব হিসেবে দেখানো হচ্ছে না।
      </Text>
    </Sheet>
  );
}
export function Customers({
  orders,
  token,
  onClose,
}: {
  orders: StaffOrder[];
  token: string;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState(""),
    [found, setFound] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const known = [
    ...new Map(
      orders.filter((o) => o.customer_phone).map((o) => [o.customer_phone, o]),
    ).values(),
  ];
  const find = async () => {
    const v = validateBangladeshiPhone(phone);
    if (!v.isValid) {
      setError(v.error || "সঠিক phone দিন।");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const d = await request(
        "staff_customer_lookup",
        { phone: v.phone },
        token,
      );
      if (d.found && d.customer) setFound(d.customer as Row);
      else {
        setFound(null);
        setError("এই নম্বরে customer পাওয়া যায়নি।");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="চেনা মুখ" subtitle="Customer directory" onClose={onClose}>
      <Field
        label="মোবাইল নম্বর দিয়ে খুঁজুন"
        placeholder="017XXXXXXXX"
        value={phone}
        keyboardType="phone-pad"
        onChangeText={setPhone}
      />
      <Button
        label="Sheet directory-তে খুঁজুন"
        busy={busy}
        onPress={() => void find()}
      />
      {!!error && <Text style={T.error}>{error}</Text>}
      {found && (
        <View style={[T.card, { backgroundColor: C.peach }]}>
          <Text style={T.h2}>{String(found.name)}</Text>
          <Text style={T.body}>{String(found.phone)}</Text>
          <Text style={T.body}>{String(found.delivery_address)}</Text>
          <Text style={T.sub}>Orders: {String(found.order_count || 0)}</Text>
        </View>
      )}
      <Text style={T.h2}>সাম্প্রতিক customers</Text>
      {known.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => setPhone(o.customer_phone || "")}
          style={({pressed}) => [T.card,T.row,pressed&&pressFeedback]}
        >
          <Photo label={o.customer_name || "Guest"} size={43} />
          <View style={{ flex: 1 }}>
            <Text style={T.h3}>{o.customer_name}</Text>
            <Text style={T.sub}>{o.customer_phone}</Text>
          </View>
          <Text style={T.link}>খুঁজুন ↗</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}
export function Team({
  session,
  token,
  onClose,
  onSession,
}: {
  session: StaffSession;
  token: string;
  onClose: () => void;
  onSession: (s: StaffSession) => void;
}) {
  const [newUser, setNewUser] = useState(false),
    [target, setTarget] = useState(""),
    [name, setName] = useState(""),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState("order_manager"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const perform = async (action: string, values: Row) => {
    setBusy(true);
    setError("");
    try {
      await request(action, values, token);
      onSession(await sessionFor(token));
      setNewUser(false);
      setTarget("");
      setPassword("");
      setUsername("");
      setName("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title="আপনার টিম"
      subtitle="সবার কাজ, সবার access"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <Button label="+ Staff account" onPress={() => setNewUser(true)} />
      }
    >
      {!!error && <Text style={T.error}>{error}</Text>}
      {session.staff_profiles?.map((p) => (
        <View key={p.email} style={T.card}>
          <View style={T.row}>
            <Photo label={p.name} size={45} />
            <View style={{ flex: 1 }}>
              <Text style={T.h3}>{p.name}</Text>
              <Text style={T.sub}>
                {roleLabel[p.role]} · {p.username || p.email}
              </Text>
            </View>
          </View>
          {p.email.endsWith("@auroracake.com") && (
            <View style={T.row}>
              <Button
                label={p.active === false ? "Enable" : "Disable"}
                kind="ghost"
                disabled={
                  busy ||
                  p.email === session.email ||
                  p.username === session.username
                }
                style={{ flex: 1 }}
                onPress={() =>
                  Alert.alert(
                    "Staff access পরিবর্তন?",
                    "এই account-এর access বদলাবে।",
                    [
                      { text: "ফিরে যান", style: "cancel" },
                      {
                        text: "নিশ্চিত",
                        onPress: () =>
                          void perform("staff_account_set_active", {
                            username: p.username || p.email.split("@")[0],
                            active: p.active === false,
                          }),
                      },
                    ],
                  )
                }
              />
              <Button
                label="Reset password"
                kind="ghost"
                style={{ flex: 1 }}
                disabled={busy}
                onPress={() => setTarget(p.username || p.email.split("@")[0])}
              />
            </View>
          )}
        </View>
      ))}
      {(newUser || target) && (
        <Sheet
          title={target ? "Password reset" : "নতুন teammate"}
          onClose={() => {
            if (!busy) {
              setNewUser(false);
              setTarget("");
              setPassword("");
            }
          }}
          footer={
            <Button
              label={target ? "Save new password" : "Create staff account"}
              busy={busy}
              disabled={
                password.length < 8 ||
                (!target && (!name.trim() || !username.trim()))
              }
              onPress={() =>
                void perform(
                  target
                    ? "staff_account_reset_password"
                    : "staff_account_create",
                  target
                    ? { username: target, password }
                    : { name, username, password, role },
                )
              }
            />
          }
        >
          {!!error && <Text style={T.error}>{error}</Text>}
          {!target && (
            <>
              <Field label="নাম" value={name} onChangeText={setName} />
              <Field
                label="Username"
                value={username}
                autoCapitalize="none"
                onChangeText={setUsername}
              />
              <Text style={T.h3}>Role</Text>
              <View style={T.wrap}>
                {roles
                  .filter(
                    (r) =>
                      session.role === "super_admin" || r !== "super_admin",
                  )
                  .map((r) => (
                    <Chip
                      key={r}
                      label={roleLabel[r]}
                      selected={role === r}
                      onPress={() => setRole(r)}
                    />
                  ))}
              </View>
            </>
          )}
          <Field
            label="নতুন password · অন্তত 8 অক্ষর"
            secureTextEntry
            value={password}
            autoCapitalize="none"
            onChangeText={setPassword}
          />
        </Sheet>
      )}
    </Sheet>
  );
}
export function CustomRequests({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row | null>(null),
    [price, setPrice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const alive = useRef(true);
  const load = async () => {
    try {
      const d = await request("staff_custom_cakes", {}, token);
      if (!Array.isArray(d.requests))
        throw new Error("Requests response যাচাই হয়নি।");
      if (alive.current) setRows(d.requests as Row[]);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setLoading(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [token]);
  const save = async (status: string) => {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await request(
        "staff_custom_quote",
        {
          request_id: selected.request_id,
          status,
          quoted_price: Number(price),
        },
        token,
      );
      await load();
      setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title="স্বপ্নের কেক"
      subtitle="Custom cake requests"
      onClose={onClose}
    >
      <Button
        label="Refresh requests"
        busy={loading}
        kind="ghost"
        onPress={() => void load()}
      />
      {!!error && !selected && <Text style={T.error}>{error}</Text>}
      {rows.map((r, i) => (
        <Pressable
          key={String(r.id || i)}
          style={({pressed}) => [T.card,pressed&&pressFeedback]}
          onPress={() => {
            setSelected(r);
            setPrice(String(r.quoted_price || ""));
          }}
        >
          <View style={T.row}>
            <Photo
              label={String(r.customer_name)}
              uri={String(r.reference_image_url || "")}
              size={57}
            />
            <View style={{ flex: 1 }}>
              <Text style={T.h3}>{String(r.customer_name)}</Text>
              <Text style={T.sub}>
                {String(r.cake_type || "Custom cake")} ·{" "}
                {String(r.delivery_date || "")}
              </Text>
            </View>
            <Text style={T.link}>{String(r.status)}</Text>
          </View>
        </Pressable>
      ))}
      {!loading && !rows.length && (
        <Empty
          title="নতুন স্বপ্নের অপেক্ষা"
          detail="Customer custom cake request পাঠালে এখানে পাবেন।"
        />
      )}
      {selected && (
        <Sheet
          title={String(selected.customer_name)}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
          footer={
            <Button
              label="Quote পাঠান"
              busy={busy}
              disabled={
                Number(price) <= 0 ||
                !["pending", "quoted"].includes(String(selected.status))
              }
              onPress={() => void save("quoted")}
            />
          }
        >
          {!!error && <Text style={T.error}>{error}</Text>}
          <Photo
            label="Reference cake"
            uri={String(selected.reference_image_url || "")}
            size={200}
          />
          {[
            "customer_phone",
            "delivery_date",
            "cake_type",
            "approx_size",
            "flavor",
            "color_theme",
            "writing_text",
            "instructions",
          ].map((f) =>
            selected[f] ? (
              <View key={f} style={{ gap: 4 }}>
                <Text style={T.eyebrow}>
                  {f.replace(/_/g, " ").toUpperCase()}
                </Text>
                <Text style={T.body}>{String(selected[f])}</Text>
              </View>
            ) : null,
          )}
          <Field
            label="আপনার quote (৳)"
            keyboardType="decimal-pad"
            value={price}
            onChangeText={setPrice}
          />
          <Button
            label="Request decline…"
            kind="ghost"
            disabled={
              busy || !["pending", "quoted"].includes(String(selected.status))
            }
            onPress={() =>
              Alert.alert("Decline করবেন?", "Request-এ declined status যাবে।", [
                { text: "ফিরে যান", style: "cancel" },
                {
                  text: "Decline",
                  style: "destructive",
                  onPress: () => void save("declined"),
                },
              ])
            }
          />
        </Sheet>
      )}
    </Sheet>
  );
}
export function Costings({
  token,
  catalog: c,
  onClose,
}: {
  token: string;
  catalog: Catalog;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [selected, setSelected] = useState(""),
    [values, setValues] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const alive = useRef(true);
  const fields = [
    ["cost_ingredients", "উপকরণ"],
    ["cost_packaging", "Packaging"],
    ["cost_delivery", "Delivery overhead"],
    ["cost_other", "অন্যান্য খরচ"],
  ];
  const load = async () => {
    try {
      const d = await request(
        "staff_item_costings",
        { operation: "read" },
        token,
      );
      if (!Array.isArray(d.costings))
        throw new Error("Costing data যাচাই হয়নি।");
      if (alive.current) setRows(d.costings as Row[]);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setLoading(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [token]);
  const product = c.products.find((p) => p.id === selected),
    sale = Number(
      rows.find((r) => r.product_id === selected)?.selling_price ??
        product?.sale_price ??
        product?.base_price ??
        0,
    ),
    total = Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0);
  const save = async () => {
    if (busy || !product) return;
    setBusy(true);
    setError("");
    try {
      if (
        Object.values(values).some(
          (v) => !Number.isFinite(Number(v)) || Number(v) < 0,
        )
      )
        throw new Error("প্রতিটি খরচ সঠিকভাবে লিখুন।");
      await request(
        "staff_item_costings",
        {
          operation: "save",
          costings: [
            {
              product_id: product.id,
              product_name: product.name,
              category_name: product.category,
              selling_price: sale,
              ...Object.fromEntries(
                Object.entries(values).map(([k, v]) => [k, Number(v)]),
              ),
            },
          ],
        },
        token,
      );
      await load();
      setSelected("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title="কেকের খরচ ও লাভ"
      subtitle="Sheet-এ সংরক্ষিত costing"
      onClose={onClose}
    >
      <Button
        kind="ghost"
        label="Refresh costings"
        busy={loading}
        onPress={() => void load()}
      />
      {!!error && !selected && <Text style={T.error}>{error}</Text>}
      {c.products.map((p) => {
        const r = rows.find((r) => r.product_id === p.id);
        return (
          <Pressable
            key={p.id}
            style={({pressed}) => [T.card,T.between,pressed&&pressFeedback]}
            disabled={loading || !!error}
            onPress={() => {
              setSelected(p.id);
              setValues(
                Object.fromEntries(
                  fields.map(([f]) => [f, String(r?.[f] ?? 0)]),
                ),
              );
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={T.h3}>{p.name}</Text>
              <Text style={T.sub}>
                {r
                  ? "Cost " + money(Number(r.total_cost))
                  : "Cost data এখনও নেই"}
              </Text>
            </View>
            <Text
              style={[
                T.link,
                r && Number(r.net_profit) < 0 && { color: C.red },
              ]}
            >
              {r
                ? (Number(r.net_profit) < 0 ? "−" : "") +
                  money(Math.abs(Number(r.net_profit)))
                : "যোগ করুন"}
            </Text>
          </Pressable>
        );
      })}
      {product && (
        <Sheet
          title={product.name}
          onClose={() => {
            if (!busy) setSelected("");
          }}
          footer={
            <Button
              label="Save costing to Sheet"
              busy={busy}
              onPress={() => void save()}
            />
          }
        >
          {!!error && <Text style={T.error}>{error}</Text>}
          {fields.map(([f, l]) => (
            <Field
              key={f}
              label={l + " (৳)"}
              keyboardType="decimal-pad"
              value={values[f]}
              onChangeText={(value) => setValues((v) => ({ ...v, [f]: value }))}
            />
          ))}
          <View style={T.card}>
            <Text style={T.sub}>Selling price · {money(sale)}</Text>
            <Text style={T.h2}>মোট খরচ {money(total)}</Text>
            <Text
              style={[T.h3, { color: sale - total >= 0 ? C.green : C.red }]}
            >
              প্রতি কেকে {sale - total < 0 ? "লোকসান" : "লাভ"}{" "}
              {money(Math.abs(sale - total))}
            </Text>
          </View>
        </Sheet>
      )}
    </Sheet>
  );
}
