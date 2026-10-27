import {privatePost} from './sheetStaffApi';
const auth=(token:string)=>/^[a-f0-9-]{72}$/i.test(token)?{auth_token:token}:{id_token:token};
export type StockItem={id:string;name:string;unit:string;balance:number;reorder_level:number};
export type Refund={id:string;order_id:string;kind:string;amount:number;reason:string;status:string;created_by:string;approved_by:string;created_at:string;settled_at:string};
export type ProductionCost={id:string;order_id:string;order_number:string;total_cost:number;recorded_at:string;missing_recipe:boolean;lines_json:string};
export type InventoryState={stock:StockItem[];refunds:Refund[];cost_snapshots:ProductionCost[];movements:{id:string;item_id:string;delta:number;reason:string;created_at:string}[]};
export async function inventoryAction(endpoint:string,token:string,action:string,payload:Record<string,unknown>={}):Promise<InventoryState>{
  const response=await privatePost(endpoint,{action,...auth(token),...payload});
  const state=(response.state&&typeof response.state==='object'?response.state:response) as Record<string,unknown>;
  if(!Array.isArray(state.stock)||!Array.isArray(state.refunds)||!Array.isArray(state.cost_snapshots)||!Array.isArray(state.movements))
    throw new Error('Invalid inventory response. Deploy the latest Apps Script version.');
  return state as InventoryState;
}