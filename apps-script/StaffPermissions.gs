/**
 * Server-authoritative staff capability matrix. Owner-controlled overrides for
 * staff_accounts; no permissions ever come from unauthenticated client state.
 */
var AURORA_STAFF_CAPABILITIES_=[
  'orders_view','order_confirm','order_cancel','kitchen_start','kitchen_ready',
  'delivery_assign','delivery_pickup','delivery_start','delivery_complete',
  'custom_cakes_view','custom_cakes_quote','customers_lookup',
  'catalog_view','catalog_edit','catalog_archive','finance_view','finance_edit'
];
var AURORA_OPERATION_CAPABILITY_={
  confirm:'order_confirm',cancel:'order_cancel',start_baking:'kitchen_start',
  mark_ready:'kitchen_ready',assign:'delivery_assign',pick_up:'delivery_pickup',
  start_delivery:'delivery_start',deliver:'delivery_complete'
};
function auroraStaffDefaultPermissions_(role){
  var all=AURORA_STAFF_CAPABILITIES_.slice();
  if(role==='super_admin'||role==='manager')return all;
  if(role==='admin')return all.filter(function(x){
    return ['delivery_pickup','delivery_start','delivery_complete'].indexOf(x)===-1;
  });
  var groups={
    order_manager:['orders_view','order_confirm','order_cancel','customers_lookup','custom_cakes_view','custom_cakes_quote'],
    kitchen_manager:['orders_view','kitchen_start','kitchen_ready'],
    delivery_manager:['orders_view','delivery_assign','customers_lookup'],
    delivery_man:['orders_view','delivery_pickup','delivery_start','delivery_complete'],
    accountant:['orders_view','finance_view']
  };
  return (groups[role]||[]).slice();
}
function auroraStaffParsePermissions_(stored,role){
  if(role==='super_admin'||role==='manager')return auroraStaffDefaultPermissions_(role);
  if(stored===undefined||stored===null||stored==='')return auroraStaffDefaultPermissions_(role);
  var value;
  try{value=JSON.parse(String(stored));}catch(_){return [];}
  if(!Array.isArray(value)||value.length> AURORA_STAFF_CAPABILITIES_.length||
     value.some(function(p){return typeof p!=='string'||AURORA_STAFF_CAPABILITIES_.indexOf(p)===-1;}))
    return [];
  return value.filter(function(p,i){return value.indexOf(p)===i;});
}
function auroraStaffValidatedPermissions_(value){
  if(!Array.isArray(value)||value.length>AURORA_STAFF_CAPABILITIES_.length||
     value.some(function(p){return typeof p!=='string'||AURORA_STAFF_CAPABILITIES_.indexOf(p)===-1;}))
    auroraReject_('invalid_permissions','Choose supported staff permissions only.');
  return value.filter(function(p,i){return value.indexOf(p)===i;});
}
function auroraStaffHas_(actor,capability){
  if(AURORA_STAFF_CAPABILITIES_.indexOf(capability)===-1)return false;
  if(actor.role==='super_admin'||actor.role==='manager')return true;
  var list=Array.isArray(actor.permissions)?actor.permissions:auroraStaffDefaultPermissions_(actor.role);
  return list.indexOf(capability)!==-1;
}
function auroraStaffRequire_(actor,capability){
  if(!auroraStaffHas_(actor,capability))
    auroraReject_('forbidden','Your staff account does not have permission: '+capability);
}
function auroraStaffDeliveryEligible_(actor){
  return ['delivery_pickup','delivery_start','delivery_complete'].every(function(capability){
    return auroraStaffHas_(actor,capability);
  });
}
function auroraStaffCandidate_(role,stored){
  return ['delivery_pickup','delivery_start','delivery_complete'].every(function(p){
    return auroraStaffParsePermissions_(stored,role).indexOf(p)!==-1;
  });
}
