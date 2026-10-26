import type { StaffOrder, StaffRoleName } from './sheetStaffApi';
import type { WorkspaceStorage } from './staffWorkspaceSession';

const SNAPSHOT_KEY='aurora_staff_orders_snapshot_v1';
const MAX_SNAPSHOT_AGE_MS=30*60*1000;
const MAX_SNAPSHOT_BYTES=600_000;
const ALLOWED_STATUSES=new Set([
  'pending','confirmed','preparing','ready','assigned','picked_up','out_for_delivery','delivered','cancelled',
]);

type Principal={token:string;email:string;role:StaffRoleName};
type CachedSnapshot={version:1;owner:string;expiresAt:number;orders:StaffOrder[]};
const ownerKey=(person:Principal)=>person.role+':'+person.email.trim().toLowerCase()+':'+person.token.slice(-16);

export function isStaffOrder(value:unknown):value is StaffOrder{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const item=value as Record<string,unknown>;
  return typeof item.id==='string'&&item.id.length>0&&typeof item.order_number==='string'&&item.order_number.length>0&&
    typeof item.status==='string'&&ALLOWED_STATUSES.has(item.status)&&
    typeof item.updated_at==='string'&&Number.isFinite(Date.parse(item.updated_at))&&
    !Object.prototype.hasOwnProperty.call(item,'delivery_otp')&&
    !Object.prototype.hasOwnProperty.call(item,'customer_access_token')&&
    !Object.prototype.hasOwnProperty.call(item,'password_hash');
}
export function validateStaffOrderList(items:unknown):items is StaffOrder[]{
  if(!Array.isArray(items)||items.length>100)return false;
  const ids=new Set<string>();
  for(const item of items){
    if(!isStaffOrder(item)||ids.has(item.id))return false;
    ids.add(item.id);
  }
  return true;
}
function sameSnapshot(a:readonly StaffOrder[],b:readonly StaffOrder[]):boolean{
  if(a===b)return true;
  if(a.length!==b.length)return false;
  // Order previews are at most 100 records; checking actual content, instead
  // of only updated_at, handles rider assignment and notes without blinking.
  return a.every((item,i)=>item.id===b[i].id&&JSON.stringify(item)===JSON.stringify(b[i]));
}
/** Accept a verified, complete server list only. No blink on identical data,
 * and never roll a recent local mutation back behind a slower network read.
 */
export function reconcileStaffOrders(previous:readonly StaffOrder[],incoming:readonly StaffOrder[]):StaffOrder[]{
  if(!validateStaffOrderList(incoming))throw new Error('Invalid or incomplete staff order snapshot.');
  const old=new Map(previous.map(item=>[item.id,item]));
  const next=incoming.map(item=>{
    const prior=old.get(item.id);
    if(!prior)return item;
    if(Date.parse(prior.updated_at)>Date.parse(item.updated_at))return prior;
    return JSON.stringify(prior)===JSON.stringify(item)?prior:item;
  });
  return sameSnapshot(previous,next)?previous as StaffOrder[]:next;
}
/** A same-tab continuity cache: read ONLY after backend validates the session.
 * It never becomes authorization, and it expires after 30 minutes.
 */
export function saveStaffOrdersSnapshot(storage:WorkspaceStorage|null,person:Principal,orders:readonly StaffOrder[],now=Date.now()):boolean{
  if(!storage||!validateStaffOrderList(orders))return false;
  try{
    const record:CachedSnapshot={version:1,owner:ownerKey(person),expiresAt:now+MAX_SNAPSHOT_AGE_MS,orders:[...orders]};
    const raw=JSON.stringify(record);
    if(raw.length>MAX_SNAPSHOT_BYTES)return false;
    storage.setItem(SNAPSHOT_KEY,raw);return true;
  }catch{return false;}
}
export function loadStaffOrdersSnapshot(storage:WorkspaceStorage|null,person:Principal,now=Date.now()):StaffOrder[]{
  if(!storage)return [];
  try{
    const raw=storage.getItem(SNAPSHOT_KEY);
    if(!raw)return [];
    if(raw.length>MAX_SNAPSHOT_BYTES){storage.removeItem(SNAPSHOT_KEY);return [];}
    const record=JSON.parse(raw) as CachedSnapshot;
    if(record?.version!==1||record.owner!==ownerKey(person)||record.expiresAt<=now||!validateStaffOrderList(record.orders)){
      storage.removeItem(SNAPSHOT_KEY);return [];
    }
    return record.orders;
  }catch{try{storage.removeItem(SNAPSHOT_KEY);}catch{}return [];}
}
export function clearStaffOrdersSnapshot(storage:WorkspaceStorage|null):void{
  try{storage?.removeItem(SNAPSHOT_KEY);}catch{}
}
