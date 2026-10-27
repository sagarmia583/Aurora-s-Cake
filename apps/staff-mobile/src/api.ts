import * as SecureStore from 'expo-secure-store';
import {ownerGoogleSignIn,ownerGoogleRestore,ownerGoogleRefresh,ownerGoogleSignOut} from './ownerGoogle';
import {isOrder, roles, type Role,type StaffSession,type StaffOrder,type Operation} from './domain';

const KEY='aurora_staff_session_v1';
const TOKEN=/^[a-f0-9-]{72}$/i;
const OWNER_MARKER='owner-google-native';
const ownerToken=(value:string)=>value.length>100&&/^[a-z0-9_.-]+$/i.test(value);
const rawEndpoint=process.env.EXPO_PUBLIC_OPERATIONS_URL||'';
export function operationsUrl():string {
  if(!rawEndpoint)throw new Error('App API URL is not configured. Set EXPO_PUBLIC_OPERATIONS_URL before building.');
  let u:URL;
  try{u=new URL(rawEndpoint);}catch{throw new Error('Invalid staff API URL.');}
  // Do not allow credential-bearing mobile requests to arbitrary or HTTP servers.
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
    u.pathname!=='/api/operations'||
    !(/(^|\.)vercel\.app$/i.test(u.hostname)))
    throw new Error('Only a secure Vercel /api/operations URL is accepted.');
  return u.toString();
}
export class ApiError extends Error{
  constructor(message:string,public code:string){super(message);this.name='ApiError';}
}
function record(data:unknown):data is Record<string,unknown>{
  return !!data&&typeof data==='object'&&!Array.isArray(data);
}
export async function post(action:string,params:Record<string,unknown>={},timeoutMs=30000):Promise<Record<string,unknown>> {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const input=params.id_token&&typeof params.id_token==='string' ? {...params,id_token:await ownerGoogleRefresh()} : params;
    const response=await fetch(operationsUrl(),{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action,...input}),
      signal:controller.signal
    });
    // Never send cookies, Google OAuth secrets or passwords to a third-party URL.
    if(!response.ok)throw new ApiError(
      response.status===404?'API route missing: deploy the latest Vercel backend.':
      response.status===401||response.status===403?'API access blocked; check deployment protection.':
      'Server connection failed (HTTP '+response.status+').','network');
    const data:unknown=await response.json().catch(()=>null);
    if(!record(data))throw new ApiError('Server returned an invalid response.','invalid_response');
    if(data.ok!==true)throw new ApiError(
      typeof data.error==='string'?data.error:'The operation could not be completed.',
      typeof data.code==='string'?data.code:'server_error');
    return data;
  }catch(error){
    if(error instanceof Error&&error.name==='AbortError')throw new ApiError('Network timeout. Retry or pull to refresh.','timeout');
    if(error instanceof ApiError)throw error;
    throw new ApiError('Unable to connect. Check internet or deployment.','network');
  }finally{clearTimeout(timeout);}
}
export async function login(username:string,password:string):Promise<{token:string;session:StaffSession}>{
  const payload=await post('staff_password_login',{username:username.trim().toLowerCase(),password});
  if(typeof payload.auth_token!=='string'||!TOKEN.test(payload.auth_token))
    throw new ApiError('The server returned an invalid session.','invalid_response');
  const token=payload.auth_token;
  const session=await getSession(token);
  await SecureStore.setItemAsync(KEY,token,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
  return {token,session};
}
export async function getSession(token:string):Promise<StaffSession>{
  if(!TOKEN.test(token)&&!ownerToken(token))throw new ApiError('Staff session is invalid.','unauthorized');
  const p=await post('staff_session',TOKEN.test(token)?{auth_token:token}:{id_token:token});
  if(typeof p.name!=='string'||typeof p.email!=='string'||!roles.includes(p.role as Role))
    throw new ApiError('Server returned an unknown staff role.','invalid_response');
  const riders:Array<{email:string;name:string}>=[];
  if(Array.isArray(p.riders))for(const x of p.riders){
    if(record(x)&&typeof x.email==='string'&&typeof x.name==='string')
      riders.push({email:x.email,name:x.name});
  }
  return {name:p.name,email:p.email,username:typeof p.username==='string'?p.username:undefined,
    role:p.role as Role,riders,
    permissions:Array.isArray(p.permissions)?p.permissions.filter((x):x is string=>typeof x==='string'):undefined,
    staff_profiles:p.role==='super_admin'&&Array.isArray(p.staff_profiles)?p.staff_profiles as StaffSession['staff_profiles']:undefined};
}
export async function restore():Promise<{token:string;session:StaffSession}|null>{
  const token=await SecureStore.getItemAsync(KEY);
  if(token===OWNER_MARKER){const fresh=await ownerGoogleRestore();return {token:fresh,session:await getSession(fresh)};}
  if(!token||!TOKEN.test(token))return null;
  return {token,session:await getSession(token)};
}
export async function clearSession(token?:string):Promise<void>{
  try{
    if(token&&TOKEN.test(token))await post('staff_password_logout',{auth_token:token});
    if(token&&ownerToken(token))await ownerGoogleSignOut();
  }catch{/* Local sign-out must succeed even while offline. */}
  finally{await SecureStore.deleteItemAsync(KEY);}
}
export async function loginOwner():Promise<{token:string;session:StaffSession}>{
  const token=await ownerGoogleSignIn();
  const session=await getSession(token);
  if(session.role!=='super_admin')throw new ApiError('This account is not the bakery Super Admin.','forbidden');
  await SecureStore.setItemAsync(KEY,OWNER_MARKER,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
  return {token,session};
}
export async function ordersFor(token:string):Promise<StaffOrder[]>{
  const data=await post('staff_orders',TOKEN.test(token)?{auth_token:token}:{id_token:token});
  if(!Array.isArray(data.orders)||data.orders.length>500||
      data.snapshot_complete===false||(data.orders.length===0&&data.snapshot_complete!==true)||
      !data.orders.every(isOrder))
    throw new ApiError('Staff order snapshot incomplete. Keeping previous data.','invalid_snapshot');
  return data.orders as StaffOrder[];
}
export async function mutate(token:string,order:StaffOrder,operation:Operation,extra:Record<string,unknown>={}):Promise<StaffOrder>{
  const body={...(TOKEN.test(token)?{auth_token:token}:{id_token:token}),operation,order_id:order.id,...extra};
  const result=await post('staff_mutate',body,35000);
  if(!isOrder(result.order)||result.order.id!==order.id)
    throw new ApiError('Order update response could not be verified. Refresh orders.','invalid_response');
  return result.order;
}
