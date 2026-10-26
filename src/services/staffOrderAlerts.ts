import type { StaffOrder, StaffRoleName } from './sheetStaffApi';

/** Alerts only for a newly arrived order or a new stage needing this role.
 * Keep this separate from the broad "actionable" badges to avoid beeping
 * for a delivery completed by somebody else or an old unchanged order.
 */
export function staffAlertStage(order: StaffOrder,role: StaffRoleName,identity: string): string|null {
  switch(role){
    case 'super_admin':
    case 'admin':
    case 'order_manager':
      return order.status==='pending' ? 'pending' : null;
    case 'kitchen_manager':
      return order.status==='confirmed' ? 'confirmed' : null;
    case 'delivery_manager':
      return order.status==='ready' ? 'ready' : null;
    case 'delivery_man':
      if(order.status!=='assigned')return null;
      return String(order.rider_id||'').trim().toLowerCase()===identity.trim().toLowerCase()?'assigned':null;
    default:return null;
  }
}
export function detectNewStaffOrderAlerts(previous:readonly StaffOrder[],next:readonly StaffOrder[],
  role:StaffRoleName,identity:string):string[] {
  const former=new Map(previous.map(order=>[order.id,order]));
  return next.filter(order=>{
    const stage=staffAlertStage(order,role,identity);
    if(!stage)return false;
    const last=former.get(order.id);
    return !last || staffAlertStage(last,role,identity)!==stage;
  }).map(order=>order.id);
}
export function activeStaffOrderAlertIds(next:readonly StaffOrder[],ids:readonly string[],
  role:StaffRoleName,identity:string):string[]{
  const match=new Map(next.map(order=>[order.id,order]));
  return ids.filter(id=>{const order=match.get(id);return !!order&&staffAlertStage(order,role,identity)!==null;});
}
