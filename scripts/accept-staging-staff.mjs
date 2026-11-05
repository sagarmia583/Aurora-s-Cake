/**
 * Staging-only authenticated Staff + COD workflow acceptance.
 * Requires the hardened staging Apps Script (health.staging_auth_hardened=true)
 * and a one-time owner-created admin password in process environment.
 * No secrets are printed or committed. NEVER run with production /exec.
 * GET-only preflight unless --commit is explicitly supplied.
 */
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {sheetFingerprint} from './prepare-staging-apps-script.mjs';

const ensure=(ok,message)=>{if(!ok)throw new Error(message);};
const uuid=/^ord_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function endpoint(value){
  let url;
  try{url=new URL(value);}catch{throw new Error('A staging /exec URL is required');}
  ensure(url.protocol==='https:'&&url.hostname==='script.google.com'&&
    /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)&&
    !url.search&&!url.hash&&!url.username&&!url.password,
    'Only an exact Google Apps Script /exec URL may be checked.');
  return url.href;
}
async function readJson(url,opts,fetcher){
  const response=await fetcher(url,{
    credentials:'omit',redirect:'follow',cache:'no-store',...opts,
    signal:AbortSignal.timeout(25000)
  });
  ensure(response.ok,'Apps Script HTTP '+response.status);
  if(response.url){
    const hostname=new URL(response.url).hostname;
    ensure(hostname==='script.google.com'||hostname==='script.googleusercontent.com',
      'Unexpected redirect host');
  }
  const text=await response.text();
  ensure(text.length>0&&text.length<1000000,'Empty or oversized JSON response');
  try{return JSON.parse(text);}catch{throw new Error('Apps Script returned non-JSON data');}
}
const code=response=>typeof response?.code==='string'?response.code:'invalid_response';
const resultOk=response=>response?.ok===true;
const stageStatus=order=>String(order?.status||'');
export async function acceptStagingStaff({
  url,sheetId,orderId,expectedTotal,commit=false,adminPassword='',fetcher=globalThis.fetch,
  report=()=>{}
}={}){
  const target=endpoint(url||'');
  ensure(/^[A-Za-z0-9_-]{25,150}$/.test(sheetId||''),'Provide isolated staging Sheet ID');
  ensure(uuid.test(orderId||''),'Provide the exact UUID-based staging COD order ID');
  ensure(Number.isFinite(expectedTotal)&&expectedTotal>0,
    'Provide the previously verified test order amount in BDT');
  const health=await readJson(target+'?action=health',{method:'GET'},fetcher);
  ensure(health?.ok===true&&health.database_backend==='google_sheets'&&
    health.environment==='staging'&&
    health.staging_sheet_fingerprint===sheetFingerprint(sheetId),
    'STAGING SAFETY BLOCK: endpoint does not match isolated Google Sheets');
  ensure(health.staging_auth_hardened===true,
    'STAGING SAFETY BLOCK: redeploy hardened staging Code.gs before staff tests');
  ensure(health.writes_frozen===false,'Staging writes are unavailable');
  if(!commit)return {mode:'preflight',isolated_staging:true,hardened_staff_auth:true,order_id:orderId};

  ensure(typeof adminPassword==='string'&&adminPassword.length>=16,
    'Set AURORA_STAGING_ADMIN_PASSWORD locally; never pass it in a command argument.');
  const post=payload=>readJson(target,{
    method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(payload)
  },fetcher);
  const checked=async(payload,label)=>{
    const data=await post(payload);
    ensure(resultOk(data),label+' failed ('+code(data)+'). Stop without rerunning --commit.');
    return data;
  };
  const admin=await checked({action:'staff_password_login',username:'admin',
    password:adminPassword},'Owner login');
  ensure(admin.role==='super_admin'&&typeof admin.auth_token==='string',
    'Not a verified staging super admin');
  const adminToken=admin.auth_token;
  const asAdmin={auth_token:adminToken};
  const staffOrders=()=>post({action:'staff_orders',...asAdmin});
  const fromOrders=async(stage)=>{
    const data=await checked({action:'staff_orders',...asAdmin},'Order refresh');
    ensure(data.snapshot_complete===true,'Order snapshot incomplete; do not continue.');
    const rows=Array.isArray(data.orders)?data.orders:[];
    const order=rows.find(x=>x.id===orderId);
    ensure(order,'Target staging order is not visible to the owner');
    ensure(Number(order.total_amount)===expectedTotal,'Test total changed; refusing to proceed');
    if(stage)ensure(stageStatus(order)===stage,'Stage mismatch: expected '+stage);
    return order;
  };
  await fromOrders('pending');
  report('Confirmed the single pending staging order; creating temporary role accounts');
  const random=randomBytes(5).toString('hex');
  const roles=[
    ['order_manager','torder'+random],
    ['kitchen_manager','tkitch'+random],
    ['delivery_manager','tdelmg'+random],
    ['delivery_man','trider'+random],
    ['accountant','tacct'+random]
  ];
  const people={};
  for(const [role,username] of roles){
    const password='T7!x'+randomBytes(20).toString('base64url')+'Ab';
    await checked({action:'staff_account_create',...asAdmin,username,
      name:'Staging '+role,role,password},'Create '+role);
    const login=await checked({action:'staff_password_login',username,password},
      'Login '+role);
    ensure(login.role===role&&typeof login.auth_token==='string',
      'Role mismatch for '+role);
    people[role]={username,auth_token:login.auth_token};
  }
  const mutation=async(role,operation,extras={})=>post({
    action:'staff_mutate',auth_token:people[role].auth_token,
    order_id:orderId,operation,...extras
  });
  const deny=async(role,operation,reason)=>{
    const r=await mutation(role,operation);
    ensure(r?.code===reason,'Expected '+reason+' for '+role+' / '+operation);
  };
  const advance=async(role,operation,expected,more={})=>{
    const r=await mutation(role,operation,more);
    ensure(resultOk(r)&&r.order?.status===expected,
      role+' '+operation+' failed ('+code(r)+')');
    await fromOrders(expected);
    report(role+' → '+expected);
  };
  await deny('kitchen_manager','confirm','forbidden');
  await deny('order_manager','start_baking','forbidden');
  await advance('order_manager','confirm','confirmed');
  await advance('kitchen_manager','start_baking','preparing');
  await advance('kitchen_manager','mark_ready','ready');
  await advance('delivery_manager','assign','assigned',{
    rider_id:people.delivery_man.username,rider_username:people.delivery_man.username,
    rider_name:'Staging Rider'
  });
  await deny('accountant','deliver','forbidden');
  await advance('delivery_man','pick_up','picked_up');
  await advance('delivery_man','start_delivery','out_for_delivery');
  const uncollected=await mutation('delivery_man','deliver',{cash_collected:false});
  ensure(uncollected.code==='cash_unconfirmed',
    'Delivery must NOT succeed without COD cash acknowledgement');
  await fromOrders('out_for_delivery');
  await advance('delivery_man','deliver','delivered',{cash_collected:true});
  const delivered=await fromOrders('delivered');
  ensure(delivered.payment_status==='paid'&&delivered.cod_collected===true,
    'COD payment status or collected flag was not stored');
  ensure(Number(delivered.cod_amount)===expectedTotal,
    'Rider cash amount does not match test invoice');

  // Retain the immutable order history but disable all temporary role users.
  // If a process crashes between steps, these records may remain: inspect them
  // manually; NEVER re-run the full --commit sequence without reviewing state.
  let disabled=0;
  for(const [,username] of roles){
    const response=await post({action:'staff_account_set_active',...asAdmin,
      username,active:false});
    if(resultOk(response))disabled++;
  }
  return {mode:'commit',isolated_staging:true,hardened_staff_auth:true,
    order_id:orderId,final_status:delivered.status,payment_status:delivered.payment_status,
    cod_collected:delivered.cod_collected,cod_amount:Number(delivered.cod_amount),
    role_permissions_verified:true,stages_checked:7,cash_unconfirmed_denied:true,
    temporary_roles_created:roles.length,temporary_roles_disabled:disabled,
    caveat:'Cash acknowledgement is not an independent rider deposit/approval ledger.'};
}
const direct=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(direct){
  const arg=name=>{const i=process.argv.indexOf(name);return i<0?'':process.argv[i+1]||'';};
  acceptStagingStaff({
    url:arg('--url')||process.env.AURORA_STAGING_EXEC_URL,
    sheetId:arg('--sheet-id')||process.env.AURORA_STAGING_SHEET_ID,
    orderId:arg('--order-id'),expectedTotal:Number(arg('--expect-total')),
    commit:process.argv.includes('--commit'),
    adminPassword:process.env.AURORA_STAGING_ADMIN_PASSWORD||'',
    report:message=>console.log('STAGING STEP:',message)
  }).then(data=>console.log('STAGING STAFF ACCEPTANCE:',JSON.stringify(data)))
    .catch(error=>{console.error('STAGING STAFF FAILED:',error.message);process.exitCode=1;});
}
