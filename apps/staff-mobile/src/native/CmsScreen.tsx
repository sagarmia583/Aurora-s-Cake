import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Switch, View } from "react-native";
import { Text } from "./typography";
import * as Picker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { cmsList, request } from "./client";
import { active, available, type Catalog, type Row } from "./model";
import { Button, C, Chip, Empty, Field, Photo, Sheet, T, pressFeedback } from "./ui";
export const cmsSections = [
  {
    title: "Menu & offers",
    items: [
      ["products", "কেক"],
      ["product_variants", "সাইজ ও দাম"],
      ["categories", "Categories"],
      ["flavors", "Flavors"],
      ["product_addons", "Extras"],
      ["coupons", "Offers"],
      ["reviews", "Customer reviews"],
    ],
  },
  {
    title: "Shop & delivery",
    items: [
      ["settings", "দোকানের তথ্য"],
      ["delivery_zones", "Delivery areas"],
      ["delivery_slots", "Delivery times"],
    ],
  },
  {
    title: "Website studio",
    items: [
      ["content", "লেখা ও headings"],
      ["hero_slides", "Home slides"],
      ["banners", "Banners"],
      ["highlights", "Highlights"],
      ["faqs", "FAQ"],
      ["links", "Social links"],
    ],
  },
];
const labels: Record<string, string> = {
  name: "নাম",
  base_price: "Regular price",
  sale_price: "Sale price (ঐচ্ছিক)",
  price: "দাম",
  description: "বিস্তারিত",
  image_url: "ছবি",
  logo_url: "Logo",
  profile_image_url: "Profile photo",
  is_active: "Available",
  is_featured: "Featured",
  category_id: "Category",
  product_id: "কেক",
  delivery_fee: "Delivery fee",
  estimated_time: "আনুমানিক সময়",
  slot_label: "Time slot",
  max_orders_per_day: "Daily slot capacity (0 = unlimited)",
  code: "Offer code",
  discount_type: "Discount type",
  discount_value: "Discount",
  min_order_amount: "Minimum spend",
  max_discount_amount: "Maximum discount (ঐচ্ছিক)",
  usage_limit: "Usage limit",
  start_date: "Start date",
  end_date: "End date",
  status: "Review status",
  comment: "Review",
  customer_name: "Customer name",
  rating: "Rating",
  key: "Setting",
  value: "Value",
  allowed_flavor_ids: "Allowed flavors",
  allowed_addon_ids: "Allowed extras",
  gallery_images: "Gallery image links",
};
const numberFields = new Set([
  "sort_order",
  "base_price",
  "sale_price",
  "price",
  "weight_grams",
  "rating",
  "review_count",
  "delivery_fee",
  "discount_value",
  "min_order_amount",
  "max_discount_amount",
  "max_orders_per_day",
  "usage_count",
  "usage_limit",
]);
const boolFields = new Set([
  "is_active",
  "is_featured",
  "accepting_orders",
  "delivery_enabled",
]);
const optionalNumbers = new Set([
  "sale_price",
  "max_discount_amount",
  "max_orders_per_day",
  "rating",
  "usage_limit",
]);
const protectedField = (table: string, field: string) =>
  ["id", "key", "created_at", "usage_count"].includes(field) ||
  (table === "products" &&
    ["rating", "review_count", "sold_count"].includes(field));
const nameOf = (r: Row) =>
  String(
    r.name ||
      r.code ||
      r.customer_name ||
      r.slot_label ||
      r.key ||
      r.question ||
      r.title ||
      r.id ||
      "Record",
  );
export function CmsScreen({
  table,
  title,
  token,
  catalog,
  onClose,
  onChanged,
  preview = false,
}: {
  table: string;
  title: string;
  token: string;
  catalog: Catalog;
  onClose: () => void;
  onChanged: () => void;
  preview?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<{ columns: string[]; rows: Row[] }>({
      columns: [],
      rows: [],
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null),
    [values, setValues] = useState<Row>({}),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [categories, setCategories] = useState<Row[]>([]);
  const alive = useRef(true),
    saving = useRef(false);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (preview) {
        setSnapshot({ columns: [], rows: [] });
        return;
      }
      const d = await cmsList(token, table);
      if (alive.current) setSnapshot(d);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setLoading(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    if (table === "products" && !preview)
      void cmsList(token, "categories")
        .then((d) => {
          if (alive.current) setCategories(d.rows);
        })
        .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, [table, token]);
  const choose = (row: Row) => {
    setEditing(row);
    setNotice("");
    setError("");
    setValues(
      Object.fromEntries(
        snapshot.columns
          .filter((f) => !protectedField(table, f))
          .map((f) => [
            f,
            boolFields.has(f)
              ? f === "is_active"
                ? available(row[f])
                : active(row[f])
              : (row[f] ?? ""),
          ]),
      ),
    );
  };
  const save = async (archive = false) => {
    if (saving.current || !editing) return;
    if (preview) {
      setError("Design preview — live পরিবর্তন বন্ধ।");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const submitted: Row = {};
      for (const [field, value] of Object.entries(values)) {
        if (protectedField(table, field)) continue;
        if (numberFields.has(field)) {
          if (value === "" && optionalNumbers.has(field)) submitted[field] = "";
          else {
            const n = Number(value);
            if (!Number.isFinite(n) || n < 0)
              throw new Error((labels[field] || field) + " সঠিকভাবে লিখুন।");
            submitted[field] = n;
          }
        } else if (boolFields.has(field))
          submitted[field] = typeof value === "boolean" ? value : active(value);
        else
          submitted[field] =
            typeof value === "boolean" ? value : String(value ?? "");
      }
      const recordId = editing.id || editing.key;
      await request(
        "staff_cms_" + (archive ? "delete" : recordId ? "update" : "create"),
        {
          table,
          values: archive ? {} : submitted,
          ...(recordId ? { record_id: String(recordId) } : {}),
        },
        token,
      );
      const d = await cmsList(token, table);
      if (!alive.current) return;
      setSnapshot(d);
      setEditing(null);
      setNotice(archive ? "Record hide হয়েছে।" : "Sheet-এ সংরক্ষিত হয়েছে।");
      onChanged();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const upload = async (field: string) => {
    if (saving.current || preview) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const picked = await Picker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0],
        context = ImageManipulator.manipulate(asset.uri);
      context.resize({ width: Math.min(asset.width || 1000, 1000) });
      const image = await context.renderAsync(),
        jpeg = await image.saveAsync({
          format: SaveFormat.JPEG,
          compress: 0.65,
          base64: true,
        });
      if (!jpeg.base64 || jpeg.base64.length > 850000)
        throw new Error("ছবিটি বড় হয়েছে। ছোট ছবি বাছুন।");
      const d = await request(
        "staff_image_upload",
        { mime_type: "image/jpeg", base64: jpeg.base64 },
        token,
      );
      if (
        typeof d.url !== "string" ||
        !/^\/api\/image\?id=[\w-]{12,150}$/.test(d.url)
      )
        throw new Error("ছবির link যাচাই হয়নি।");
      if (alive.current) {
        setValues((v) => ({ ...v, [field]: d.url }));
        setNotice("ছবি ready। প্রকাশ করতে Save চাপুন।");
      }
      image.release();
      context.release();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const editable = snapshot.columns.filter((f) => !protectedField(table, f));
  return (
    <Sheet
      title={title}
      subtitle="Website ও app-এর একই Sheet"
      onClose={onClose}
      footer={
        !editing && !["settings", "content"].includes(table) ? (
          <Button
            label="+ নতুন record"
            disabled={loading || preview}
            onPress={() => choose({})}
          />
        ) : undefined
      }
    >
      {!!error && !editing && <Text style={T.error}>{error}</Text>}
      {!!notice && !editing && (
        <Text style={[T.sub, { color: C.green }]}>{notice}</Text>
      )}
      <Field
        label="খুঁজুন"
        value={search}
        onChangeText={setSearch}
        placeholder="নাম লিখুন…"
      />
      <Button
        label={loading ? "লোড হচ্ছে…" : "Refresh records"}
        kind="ghost"
        busy={loading}
        onPress={() => void load()}
      />
      {snapshot.rows
        .filter((r) =>
          JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
        )
        .map((r, i) => (
          <Pressable
            key={String(r.id || r.key || i)}
            accessibilityRole="button"
            onPress={() => choose(r)}
            style={({pressed}) => [T.card,T.row,pressed&&pressFeedback]}
          >
            {r.image_url ? (
              <Photo label={nameOf(r)} uri={String(r.image_url)} size={54} />
            ) : null}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={T.h3}>{nameOf(r)}</Text>
              <Text style={T.sub}>
                {String(
                  r.comment ||
                    r.value ||
                    r.description ||
                    r.product_name ||
                    r.status ||
                    "সম্পাদনা করুন",
                )}
              </Text>
              {r.is_active !== undefined && (
                <Text
                  style={[
                    T.tiny,
                    { color: available(r.is_active) ? C.green : C.red },
                  ]}
                >
                  {available(r.is_active) ? "Available" : "Hidden"}
                </Text>
              )}
            </View>
            <Text style={T.link}>↗</Text>
          </Pressable>
        ))}
      {!loading && !snapshot.rows.length && (
        <Empty
          title={preview ? "Design preview" : "এখনও কোনো record নেই"}
          detail={
            preview
              ? "এই preview থেকে real Sheet পরিবর্তন করা যায় না।"
              : "Sheet-এ নতুন record যোগ করুন বা refresh করুন।"
          }
        />
      )}
      {editing && (
        <Sheet
          title={editing.id || editing.key ? nameOf(editing) : "নতুন " + title}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
          footer={
            <Button
              label="Save to Sheet"
              busy={busy}
              onPress={() => void save()}
            />
          }
        >
          {!!error && (
            <Text accessibilityRole="alert" style={T.error}>
              {error}
            </Text>
          )}
          {!!notice && (
            <Text style={[T.sub, { color: C.green }]}>{notice}</Text>
          )}
          {editable.map((field) => {
            const v = values[field],
              label =
                field === "value" && editing.key
                  ? labels[String(editing.key)] ||
                    String(editing.key).replace(/_/g, " ")
                  : labels[field] || field.replace(/_/g, " ");
            const set = (value: unknown) =>
              setValues((s) => ({ ...s, [field]: value }));
            if (
              boolFields.has(field) ||
              (field === "value" &&
                ["accepting_orders", "delivery_enabled"].includes(
                  String(editing.key),
                ))
            )
              return (
                <View key={field} style={[T.card, T.between]}>
                  <Text style={T.h3}>{label}</Text>
                  <Switch
                    accessibilityLabel={label}
                    disabled={busy}
                    value={typeof v === "boolean" ? v : active(v)}
                    onValueChange={set}
                  />
                </View>
              );
            const options =
              field === "product_id"
                ? catalog.products.map((p) => ({ id: p.id, name: p.name }))
                : field === "category_id"
                  ? categories.map((r) => ({
                      id: String(r.id),
                      name: String(r.name),
                    }))
                  : null;
            if (options)
              return (
                <View key={field} style={{ gap: 9 }}>
                  <Text style={T.h3}>{label}</Text>
                  <View style={T.wrap}>
                    {options.map((o) => (
                      <Chip
                        key={o.id}
                        label={o.name}
                        selected={v === o.id}
                        onPress={() => {
                          if (!busy) set(o.id);
                        }}
                      />
                    ))}
                  </View>
                </View>
              );
            if (
              field === "allowed_flavor_ids" ||
              field === "allowed_addon_ids"
            ) {
              const opts =
                field === "allowed_flavor_ids"
                  ? catalog.flavors
                  : catalog.addons;
              let selected: string[] = [];
              try {
                selected = JSON.parse(String(v || "[]"));
              } catch {
                selected = String(v).split(",");
              }
              return (
                <View key={field} style={{ gap: 9 }}>
                  <Text style={T.h3}>{label}</Text>
                  <View style={T.wrap}>
                    {opts.map((o) => (
                      <Chip
                        key={o.id}
                        label={o.name}
                        selected={selected.includes(o.id)}
                        onPress={() => {
                          if (!busy)
                            set(
                              JSON.stringify(
                                selected.includes(o.id)
                                  ? selected.filter((id) => id !== o.id)
                                  : [...selected, o.id],
                              ),
                            );
                        }}
                      />
                    ))}
                  </View>
                </View>
              );
            }
            if (
              (field === "status" && table === "reviews") ||
              field === "discount_type"
            )
              return (
                <View key={field} style={{ gap: 9 }}>
                  <Text style={T.h3}>{label}</Text>
                  <View style={T.wrap}>
                    {(field === "status"
                      ? ["pending", "approved", "hidden", "rejected"]
                      : ["percentage", "fixed"]
                    ).map((o) => (
                      <Chip
                        key={o}
                        label={o}
                        selected={v === o}
                        onPress={() => set(o)}
                      />
                    ))}
                  </View>
                </View>
              );
            const isImage =
              ["image_url", "logo_url", "profile_image_url"].includes(field) ||
              (field === "value" &&
                ["logo_url", "profile_image_url"].includes(
                  String(editing.key),
                ));
            return (
              <View key={field} style={{ gap: 9 }}>
                <Field
                  label={label}
                  value={String(v ?? "")}
                  editable={!busy}
                  onChangeText={set}
                  autoCapitalize="none"
                  keyboardType={
                    numberFields.has(field) ? "decimal-pad" : "default"
                  }
                  multiline={[
                    "description",
                    "comment",
                    "value",
                    "gallery_images",
                  ].includes(field)}
                />
                {isImage && (
                  <>
                    <Photo label={label} uri={String(v || "")} size={85} />
                    <Button
                      label="ফোন থেকে ছবি বাছুন"
                      busy={busy}
                      disabled={preview}
                      kind="ghost"
                      onPress={() => void upload(field)}
                    />
                  </>
                )}
              </View>
            );
          })}
          {!!editing.id && !["settings", "content"].includes(table) && (
            <Button
              kind="danger"
              label="Record hide করুন…"
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  "Record hide করবেন?",
                  "Website ও app-এ এই পরিবর্তন দেখা যাবে।",
                  [
                    { text: "ফিরে যান", style: "cancel" },
                    {
                      text: "Hide করুন",
                      style: "destructive",
                      onPress: () => void save(true),
                    },
                  ],
                )
              }
            />
          )}
        </Sheet>
      )}
    </Sheet>
  );
}
