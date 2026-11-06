import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import {
  roles,
  isOrder,
  validateStaffOperationsUrl,
  type StaffSession,
  type StaffOrder,
  type Operation,
} from "../domain";
import { isStaffCredential, NATIVE_SESSION_KEY } from "../workspace";
import { normalizeCatalog, type Row } from "./model";
declare const __DEV__: boolean;
const SESSION = "aurora_native_session_v2";
export function endpoint() {
  const production = validateStaffOperationsUrl(
    process.env.EXPO_PUBLIC_OPERATIONS_URL || "",
  );
  const dev =
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    process.env.EXPO_PUBLIC_STAFF_WEB_URL;
  if (dev) {
    const u = new URL(dev);
    if (
      u.protocol === "http:" &&
      u.port === "3000" &&
      u.pathname === "/" &&
      !u.username &&
      !u.password &&
      /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
        u.hostname,
      )
    )
      return u.origin + "/api/operations";
  }
  return production;
}
export const imageUrl = (value: unknown) => {
  const v = String(value || "");
  if (!v) return "";
  try{
    const url=new URL(v);
    if(url.protocol==='https:'&&url.hostname==='drive.google.com'&&!url.username&&!url.password){
      const id=url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)/)?.[1]||url.searchParams.get('id');
      if(id&&/^[A-Za-z0-9_-]+$/.test(id))return 'https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w1600';
    }
  }catch{/* Local public assets are resolved below. */}
  if (v.startsWith("/images/") || v.startsWith("/api/image?"))
    return new URL(v, endpoint()).href;
  return /^https:\/\//.test(v) ? v : "";
};
export class ClientError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}
const credential = (token: string) =>
  /^[0-9a-f-]{72}$/i.test(token) ? { auth_token: token } : { id_token: token };
export async function request(
  action: string,
  values: Row = {},
  token?: string,
): Promise<Row> {
  if (token && !isStaffCredential(token))
    throw new ClientError("আবার sign in করুন।", "unauthorized");
  const controller = new AbortController(),
    timer = setTimeout(
      () => controller.abort(),
      action === "staff_image_upload" ? 35000 : 30000,
    );
  try {
    const options: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      credentials: "omit",
      body: JSON.stringify({
        ...values,
        action,
        ...(token ? credential(token) : {}),
      }),
      signal: controller.signal,
    };
    let r = await fetch(endpoint(), options);
    let d = await r.json().catch(() => null);
    // Older shop gateways do not know this newly authenticated action yet.
    // The only compatibility destination is this same shop's pinned Apps Script.
    if (
      ['staff_item_costings','staff_order_link'].includes(action) &&
      r.status === 400 &&
      d?.code === "proxy_error" &&
      d?.error === "Unknown action."
    ) {
      r = await fetch(
        "https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec",
        options,
      );
      d = await r.json().catch(() => null);
    }
    if (!r.ok)
      throw new ClientError(
        "সংযোগ পাওয়া যায়নি (HTTP " + r.status + ")।",
        "network",
      );
    if (!d || typeof d !== "object" || Array.isArray(d))
      throw new ClientError("Server response যাচাই হয়নি।", "invalid_response");
    if (
      d.ok !== true &&
      !(action === "create_order" && d.success === true && d.persisted === true)
    )
      throw new ClientError(
        d.error || "কাজটি সম্পন্ন হয়নি।",
        d.code || "server_error",
      );
    return d;
  } catch (error) {
    if (error instanceof ClientError) throw error;
    throw new ClientError(
      error instanceof Error && error.name === "AbortError"
        ? "সময় বেশি লাগছে। একই কাজ আবার যাচাই করুন।"
        : "ইন্টারনেট সংযোগ পরীক্ষা করে refresh করুন।",
      "network",
    );
  } finally {
    clearTimeout(timer);
  }
}
export async function sessionFor(token: string): Promise<StaffSession> {
  const d = await request("staff_session", {}, token);
  if (
    !roles.includes(d.role as StaffSession["role"]) ||
    typeof d.email !== "string" ||
    typeof d.name !== "string"
  )
    throw new ClientError("Staff session সঠিক নয়।", "invalid_response");
  return {
    ...d,
    riders: Array.isArray(d.riders) ? d.riders : [],
    staff_profiles: Array.isArray(d.staff_profiles) ? d.staff_profiles : [],
  } as unknown as StaffSession;
}
async function saveSession(token: string) {
  const raw = JSON.stringify({ origin: new URL(endpoint()).origin, token });
  await SecureStore.setItemAsync(SESSION, raw);
  if ((await SecureStore.getItemAsync(SESSION)) !== raw)
    throw new Error("ফোনে sign-in সংরক্ষণ করা যায়নি।");
}
export async function signIn(username: string, password: string) {
  const d = await request("staff_password_login", {
    username: username.trim().toLowerCase(),
    password,
  });
  if (!isStaffCredential(d.auth_token)) throw new Error("Session যাচাই হয়নি।");
  const token = d.auth_token,
    session = await sessionFor(token);
  await saveSession(token);
  return { token, session };
}
export async function restoreSession() {
  const origin = new URL(endpoint()).origin;
  for (const key of [SESSION, NATIVE_SESSION_KEY, "aurora_staff_session_v1"]) {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) continue;
    let token = "";
    try {
      const saved = JSON.parse(raw);
      if (saved.origin === origin && isStaffCredential(saved.token))
        token = saved.token;
    } catch {
      if (key === "aurora_staff_session_v1" && isStaffCredential(raw))
        token = raw;
    }
    if (!token) continue;
    const session = await sessionFor(token);
    await saveSession(token);
    return { token, session };
  }
  return null;
}
/** Background reads must never restore a credential that foreground logout removed. */
export async function readBackgroundSession(){
  const raw=await SecureStore.getItemAsync(SESSION);
  if(!raw)return null;
  let saved:{origin?:string;token?:string};
  try{saved=JSON.parse(raw);}catch{return null;}
  if(saved.origin!==new URL(endpoint()).origin||!isStaffCredential(saved.token))return null;
  const token=saved.token as string,session=await sessionFor(token);
  if(await SecureStore.getItemAsync(SESSION)!==raw)return null;
  return {token,session};
}
export async function signOut(token: string) {
  if (/^[0-9a-f-]{72}$/i.test(token)) {
    const d = await request("staff_password_logout", {}, token);
    if (d.revoked !== true)
      throw new Error("Sign out যাচাই হয়নি। আবার চেষ্টা করুন।");
  }
  for (const key of [SESSION, NATIVE_SESSION_KEY, "aurora_staff_session_v1"])
    await SecureStore.deleteItemAsync(key);
}
export async function getOrders(token: string) {
  const d = await request("staff_orders", {}, token);
  if (!Array.isArray(d.orders) || typeof d.snapshot_complete!=='boolean' ||
      !d.orders.every(isOrder))
    throw new Error("Live order list অবৈধ। আগের তথ্য দেখানো হচ্ছে।");
  // A partly corrupt Sheet may still contain important NEW valid orders.
  // The UI merges them into the last verified snapshot without deleting old rows.
  const result=d.orders as (StaffOrder[] & {snapshotComplete:boolean});
  result.snapshotComplete=d.snapshot_complete===true;
  return result;
}
export async function changeOrder(
  token: string,
  order: StaffOrder,
  operation: Operation,
  extra: Row = {},
) {
  const d = await request(
    "staff_mutate",
    { order_id: order.id, operation, ...extra },
    token,
  );
  if (!isOrder(d.order) || d.order.id !== order.id)
    throw new Error("Update যাচাই হয়নি। Refresh করে দেখুন।");
  return d.order;
}
export async function getCatalog() {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(new URL("/api/public", endpoint()).href, {
      signal: controller.signal,
    });
    if (!r.ok) throw new Error("Catalogue connection failed.");
    const d = await r.json();
    if (d.ok !== true) throw new Error("Live catalogue পাওয়া যায়নি।");
    return normalizeCatalog(d);
  } finally {
    clearTimeout(timer);
  }
}
export async function cmsList(token: string, table: string) {
  const d = await request("staff_cms_list", { table }, token);
  if (
    d.table !== table ||
    !Array.isArray(d.rows) ||
    !Array.isArray(d.columns) ||
    d.rows.length > 500
  )
    throw new Error("Editor response অসম্পূর্ণ।");
  return d as Row & { rows: Row[]; columns: string[] };
}
export const orderServices = (token: string) => ({
  store: SecureStore,
  uuid: randomUUID,
  endpoint: endpoint(),
  session: () => sessionFor(token),
  send: (action: string, body: Row) => request(action, body, token),
});
