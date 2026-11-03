import { isOrder, type StaffOrder, type StaffSession } from "../domain";
import { canCreate, type Draft, type Row } from "./model";
import {
  readRecord,
  writeRecord,
  removeRecord,
  type SecureStoreAdapter,
} from "./secureRecords";
export type PendingOrder = {
  endpoint: string;
  actor: string;
  body: Row;
  receipt?: StaffOrder;
  complete?: boolean;
};
type Services = {
  store: SecureStoreAdapter;
  uuid: () => string;
  send: (action: string, body: Row) => Promise<Row>;
  session: () => Promise<StaffSession>;
  endpoint: string;
};
const key = (actor: string) =>
  "aurora_native_order_" +
  Array.from(actor.toLowerCase())
    .map((c) => c.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("");
export const loadPending = (s: Services, actor: string) =>
  readRecord<PendingOrder>(s.store, key(actor));
const locks = new Map<string, Promise<unknown>>();
export async function finishOrder(
  s: Services,
  actor: string,
  draft?: Draft,
): Promise<{ order: StaffOrder; warning: string }> {
  if (locks.has(actor))
    throw new Error("এই অর্ডারটি সংরক্ষণ হচ্ছে। একটু অপেক্ষা করুন।");
  const work = (async () => {
    const identity = await s.session();
    if (
      identity.email.toLowerCase() !== actor.toLowerCase() ||
      !canCreate(identity.role)
    )
      throw new Error("এই account থেকে order তৈরি করা যায় না।");
    let record = await loadPending(s, actor);
    if (record && (record.endpoint !== s.endpoint || record.actor !== actor))
      throw new Error(
        "আগের order reference অন্য connection-এর। আগে সেটি যাচাই করুন।",
      );
    if (!record) {
      if (!draft) throw new Error("কোনো saved order পাওয়া যায়নি।");
      record = {
        endpoint: s.endpoint,
        actor,
        body: {
          action: "create_order",
          request_id: s.uuid(),
          checkout_proof: s.uuid() + s.uuid(),
          ...draft,
        },
      };
      await writeRecord(s.store, key(actor), record, s.uuid());
    } else if (draft && !record.receipt) {
      const { action, request_id, checkout_proof, ...previous } = record.body;
      if (JSON.stringify(previous) !== JSON.stringify(draft))
        throw new Error(
          "আগের অর্ডারের ফলাফল অনিশ্চিত। Retry saved order চাপুন।",
        );
    }
    if (!record.receipt) {
      try {
        const result = await s.send("create_order", record.body),
          o = result.order as StaffOrder;
        if (
          result.success !== true ||
          result.persisted !== true ||
          !o ||
          o.id !== "ord_" + record.body.request_id ||
          !o.order_number ||
          !Array.isArray(o.items) ||
          o.items.length === 0 ||
          !Number.isFinite(o.total_amount)
        )
          throw new Error(
            "Order confirmation যাচাই হয়নি। একই reference retry করুন।",
          );
        // Staff UI and persisted staff receipt never retain the customer's bearer key/OTP.
        const safe = { ...o } as unknown as Row;
        delete safe.customer_access_token;
        delete safe.customer_share_token;
        delete safe.customer_share_created_at;
        delete safe.delivery_otp;
        if (
          !isOrder(safe) ||
          o.customer_name !== record.body.customer_name ||
          o.customer_phone !== record.body.customer_phone ||
          o.delivery_address !== record.body.delivery_address ||
          o.total_amount !== record.body.expected_total
        )
          throw new Error(
            "Receipt এই order-এর সঙ্গে মেলেনি। একই reference retry করে যাচাই করুন।",
          );
        record.receipt = safe as unknown as StaffOrder;
        await writeRecord(s.store, key(actor), record, s.uuid());
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (
          code &&
          [
            "invalid_request",
            "invalid_cart",
            "invalid_quantity",
            "invalid_phone",
            "invalid_date",
            "shop_closed",
            "delivery_unavailable",
            "unavailable_selection",
            "invalid_coupon",
            "coupon_expired",
            "coupon_limit",
            "price_changed",
            "quote_changed",
          ].includes(code)
        )
          await removeRecord(s.store, key(actor));
        throw error;
      }
    }
    let warning = "";
    if (record.receipt.status === "pending") {
      try {
        const result = await s.send("staff_mutate", {
          operation: "confirm",
          order_id: record.receipt.id,
        });
        const updated = result.order as StaffOrder;
        if (
          !isOrder(updated) ||
          updated.id !== record.receipt.id ||
          updated.status !== "confirmed"
        )
          throw new Error("Confirmation not verified");
        record.receipt = updated;
        record.complete = true;
        await writeRecord(s.store, key(actor), record, s.uuid());
      } catch {
        warning =
          "Order Sheet-এ save হয়েছে। Confirmation যাচাই হয়নি—live queue দেখুন।";
      }
    }
    return { order: record.receipt, warning };
  })();
  locks.set(actor, work);
  try {
    return await work;
  } finally {
    locks.delete(actor);
  }
}
export async function startAnotherOrder(s: Services, actor: string) {
  const record = await loadPending(s, actor);
  if (record && !record.receipt) throw new Error("আগের order আগে retry করুন।");
  await removeRecord(s.store, key(actor));
}
