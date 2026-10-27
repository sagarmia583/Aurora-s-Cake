import type {StaffRoleName,StaffOperation} from './sheetStaffApi';
export const STAFF_CAPABILITIES=[
  'orders_view','order_confirm','order_cancel','kitchen_start','kitchen_ready',
  'delivery_assign','delivery_pickup','delivery_start','delivery_complete',
  'custom_cakes_view','custom_cakes_quote','customers_lookup',
  'catalog_view','catalog_edit','catalog_archive','finance_view','finance_edit',
  'sales_view','sales_create','sales_discount','sales_history'
] as const;
export type StaffCapability=typeof STAFF_CAPABILITIES[number];
export const STAFF_CAPABILITY_GROUPS:{title:string;items:{key:StaffCapability;label:string}[]}[]=[
 {title:'Orders',items:[
  {key:'orders_view',label:'View orders'},{key:'order_confirm',label:'Confirm orders'},
  {key:'order_cancel',label:'Cancel orders'}]},
 {title:'Kitchen',items:[
  {key:'kitchen_start',label:'Start cake preparation'},
  {key:'kitchen_ready',label:'Mark cake ready'}]},
 {title:'Delivery',items:[
  {key:'delivery_assign',label:'Assign a rider'},
  {key:'delivery_pickup',label:'Pick up an assigned cake'},
  {key:'delivery_start',label:'Start assigned delivery'},
  {key:'delivery_complete',label:'Confirm cake delivered (COD)'}]},
 {title:'Customer & custom cakes',items:[
  {key:'customers_lookup',label:'Look up customer details'},
  {key:'custom_cakes_view',label:'View custom cake requests'},
  {key:'custom_cakes_quote',label:'Manage custom cake quotes'}]},
 {title:'Products and website',items:[
  {key:'catalog_view',label:'View website manager'},
  {key:'catalog_edit',label:'Edit products, coupons and content'},
  {key:'catalog_archive',label:'Archive website records'}]},
 {title:'Counter sales',items:[
  {key:'sales_view',label:'Open sales POS'},
  {key:'sales_create',label:'Create paid counter sales'},
  {key:'sales_discount',label:'Apply counter-sale discounts'},
  {key:'sales_history',label:'View previous counter receipts'}]},
 {title:'Finance',items:[
  {key:'finance_view',label:'View rider cash and cake cost'},
  {key:'finance_edit',label:'Record cash deposits and edit costs'}]}
];
const byRole:Partial<Record<StaffRoleName,StaffCapability[]>>={
  order_manager:['orders_view','order_confirm','order_cancel','customers_lookup','custom_cakes_view','custom_cakes_quote','sales_view','sales_create','sales_history'],
  kitchen_manager:['orders_view','kitchen_start','kitchen_ready'],
  delivery_manager:['orders_view','delivery_assign','customers_lookup'],
  delivery_man:['orders_view','delivery_pickup','delivery_start','delivery_complete'],
  accountant:['orders_view','finance_view','sales_view','sales_history']
};
export const defaultStaffPermissions=(role:StaffRoleName):StaffCapability[]=>{
 if(role==='super_admin'||role==='manager')return [...STAFF_CAPABILITIES];
 if(role==='admin')return STAFF_CAPABILITIES.filter(x=>!(['delivery_pickup','delivery_start','delivery_complete'] as string[]).includes(x));
 return [...(byRole[role]||[])];
};
export const hasStaffPermission=(role:StaffRoleName,permissions:readonly StaffCapability[]|undefined,capability:StaffCapability):boolean=>
 role==='super_admin'||role==='manager'||(permissions??defaultStaffPermissions(role)).includes(capability);
export const staffOperationPermission:Record<StaffOperation,StaffCapability>={
 confirm:'order_confirm',cancel:'order_cancel',start_baking:'kitchen_start',mark_ready:'kitchen_ready',
 assign:'delivery_assign',pick_up:'delivery_pickup',start_delivery:'delivery_start',deliver:'delivery_complete'
};
export const canStaffOperation=(role:StaffRoleName,permissions:readonly StaffCapability[]|undefined,operation:StaffOperation):boolean=>
 hasStaffPermission(role,permissions,staffOperationPermission[operation]);
/** UI guard mirrors backend's assigned-rider requirement; backend still checks it. */
export const canStaffOperateAssignedOrder=(role:StaffRoleName,permissions:readonly StaffCapability[]|undefined,
  operation:StaffOperation,staffEmail:string|undefined,assignedRider:string|undefined):boolean=>{
  if(!canStaffOperation(role,permissions,operation))return false;
  if(!['pick_up','start_delivery','deliver'].includes(operation))return true;
  return !!staffEmail&&!!assignedRider&&staffEmail.toLowerCase()===assignedRider.toLowerCase();
};
export const normalizedStaffPermissions=(value:unknown):StaffCapability[]|undefined=>{
 if(!Array.isArray(value)||value.length>STAFF_CAPABILITIES.length||
    !value.every(p=>typeof p==='string'&&(STAFF_CAPABILITIES as readonly string[]).includes(p)))return undefined;
 return [...new Set(value as StaffCapability[])];
};
