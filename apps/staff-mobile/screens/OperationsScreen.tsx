import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Alert,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import type {StaffSession,Role} from '../src/domain';
import {hasPermission,money,secureRequestId,staffPost,inventory,finance,catalogue,editCatalog,createStaff,updateStaff,
 type InventorySnapshot,type FinanceSnapshot,type Catalogue,type StaffProfile} from '../src/work';
export type Module='finance'|'inventory'|'production'|'team'|'catalog'|'custom';
const c={dark:'#173b32',brand:'#205A45',white:'#fff',line:'#dce7e0',muted:'#65786d',bg:'#f4f7f4',red:'#ab453a'};
const s=StyleSheet.create({
 card:{backgroundColor:c.white,borderRadius:18,borderWidth:1,borderColor:c.line,padding:16,gap:9,marginBottom:10},
 heading:{fontSize:20,fontWeight:'900',color:c.dark},sub:{fontSize:14,fontWeight:'800',color:c.dark},
 small:{fontSize:12,color:c.muted,lineHeight:18},input:{minHeight:48,paddingHorizontal:12,borderWidth:1,borderRadius:10,borderColor:c.line,color:c.dark,backgroundColor:c.white},
 button:{backgroundColor:c.brand,padding:14,minHeight:48,borderRadius:12,justifyContent:'center',alignItems:'center'},
 btnLabel:{fontWeight:'900',color:c.white,fontSize:13},line:{paddingVertical:9,borderBottomColor:c.line,borderBottomWidth:1,flexDirection:'row',justifyContent:'space-between',gap:8},
 error:{color:c.red,backgroundColor:'#faece9',borderRadius:12,padding:12},
 choice:{padding:10,borderRadius:10,backgroundColor:c.bg,borderWidth:1,borderColor:c.line,margin:2}
});
const Caption=({children}:{children:React.ReactNode})=><Text style={s.small}>{children}</Text>;
const Field=({label,value,set,keyboard='default',secret=false}:{label:string;value:string;set:(value:string)=>void;keyboard?:'default'|'decimal-pad'|'number-pad';secret?:boolean})=>
  <View style={{gap:5}}><Text style={s.small}>{label}</Text><TextInput style={s.input} placeholder={label} value={value}
    onChangeText={set} keyboardType={keyboard} secureTextEntry={secret} autoCapitalize="none"/></View>;
const Button=({text,onPress,disabled=false}:{text:string;onPress:()=>void;disabled?:boolean})=>
  <Pressable accessibilityRole="button" style={[s.button,disabled&&{opacity:.5}]} onPress={onPress} disabled={disabled}><Text style={s.btnLabel}>{text}</Text></Pressable>;
const Choice=({value,selected,onPress}:{value:string;selected:boolean;onPress:()=>void})=>
  <Pressable style={[s.choice,selected&&{backgroundColor:'#d9eee0',borderColor:c.brand}]} onPress={onPress}>
    <Text style={{color:c.dark,fontWeight:selected?'900':'500',fontSize:13}}>{selected?'◉':'○'} {value}</Text></Pressable>;
const digits=(str:string)=>Number(str);
const isMoney=(value:string,allowZero=false)=>value.trim()!==''&&Number.isFinite(Number(value))&&
  Number(value)>=(allowZero?0:0.01)&&Number(value)<=10000000&&Math.abs(Number(value)*100-Math.round(Number(value)*100))<.0001;

export const modules:{key:Module;title:string;hint:string;icon:string;permission:string}[]=[
 {key:'production',title:'Baking cost',hint:'Recipes & historical cost',icon:'🎂',permission:'finance_view'},
 {key:'inventory',title:'Inventory & returns',hint:'Ingredients, restock, refunds',icon:'📦',permission:'finance_view'},
 {key:'finance',title:'Cash & finance',hint:'Rider cash and approvals',icon:'💳',permission:'finance_view'},
 {key:'custom',title:'Custom cake quotes',hint:'Customer requests',icon:'📝',permission:'custom_cakes_view'},
 {key:'team',title:'Staff & permissions',hint:'Super Admin controls',icon:'👥',permission:'owner_only'},
 {key:'catalog',title:'Shop & product settings',hint:'Price, availability, open orders',icon:'⚙️',permission:'catalog_view'},
];
export function availableModules(session:StaffSession):Module[]{
 return modules.filter(m=>m.key==='team'?session.role==='super_admin':hasPermission(session,m.permission)).map(m=>m.key);
}
export function WorkMenu({session,onOpen}:{session:StaffSession;onOpen:(m:Module)=>void}){
 const visible=modules.filter(x=>availableModules(session).includes(x.key));
 return <ScrollView contentContainerStyle={{padding:16,paddingBottom:125,gap:12}}>
 <Text style={s.heading}>Operations</Text><Caption>Only authorized tools appear here. Every change is checked again by the server.</Caption>
 {visible.map(x=><Pressable key={x.key} onPress={()=>onOpen(x.key)} style={[s.card,{flexDirection:'row',alignItems:'center',minHeight:88}]}>
 <Text style={{fontSize:30}}>{x.icon}</Text><View style={{flex:1}}><Text style={s.sub}>{x.title}</Text><Caption>{x.hint}</Caption></View>
 <Text style={{fontSize:19,color:c.brand}}>›</Text></Pressable>)}
 {visible.length===0?<Caption>No additional modules for this role.</Caption>:null}
 </ScrollView>;
}

function InventoryModule({token,canEdit}:{token:string;canEdit:boolean}){
 const [snap,setSnap]=useState<InventorySnapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [create,setCreate]=useState(false),[name,setName]=useState(''),[unit,setUnit]=useState('pcs');
 const [item,setItem]=useState(''),[qty,setQty]=useState(''),[reason,setReason]=useState('');
 const [refOrder,setRefOrder]=useState(''),[refAmount,setRefAmount]=useState(''),[refReason,setRefReason]=useState('');
 const [settleNote,setSettleNote]=useState('');
 const refresh=async()=>{setBusy(true);setError('');try{setSnap(await inventory(token));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 useEffect(()=>{void refresh();},[token]);
 const action=async(act:string,fields:Record<string,unknown>)=>{setBusy(true);setError('');try{
  setSnap(await inventory(token,act,fields));setQty('');setReason('');setRefReason('');setRefAmount('');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <>
 <Text style={s.heading}>Ingredient stock</Text>
 {snap?.stock.map(x=><Pressable key={x.id} onPress={()=>setItem(x.id)} style={s.line}>
 <View style={{flex:1}}><Text style={s.sub}>{x.name}</Text><Caption>{x.unit} · Reorder below {x.reorder_level}</Caption></View>
 <Text style={{fontWeight:'900',color:x.balance<=x.reorder_level?c.red:c.brand}}>{x.balance} {item===x.id?'✓':''}</Text></Pressable>)}
 {canEdit?<View style={s.card}>
 <Text style={s.sub}>Restock / Waste</Text><Caption>Select an ingredient above. Enter positive quantity for restock, negative for waste.</Caption>
 <Field label="Quantity (+10 or -3)" value={qty} set={setQty} keyboard="decimal-pad"/>
 <Field label="Reason (min 5 characters)" value={reason} set={setReason}/>
 <Button text="Save stock movement" disabled={busy||!item||!Number.isFinite(digits(qty))||digits(qty)===0||reason.length<5}
 onPress={()=>void action('staff_stock_adjust',{request_id:secureRequestId(),item_id:item,delta:digits(qty),reason,unit_cost:0})}/>
 <Button text={create?'Hide ingredient form':'+ Add new ingredient'} onPress={()=>setCreate(x=>!x)}/>
 {create?<><Field label="Ingredient name" value={name} set={setName}/>
 <View style={{flexDirection:'row',flexWrap:'wrap'}}>{['g','kg','ml','l','pcs'].map(x=><Choice key={x} value={x} selected={unit===x} onPress={()=>setUnit(x)}/>)}</View>
 <Button text="Create ingredient" disabled={busy||name.trim().length<2} onPress={()=>void action('staff_stock_item_create',{name,unit,reorder_level:0})}/></>:null}
 </View>:null}
 <View style={s.card}><Text style={s.sub}>Historical production snapshots</Text>
 {snap?.cost_snapshots.slice(0,15).map(x=><View key={x.id} style={s.line}>
 <View><Text style={s.sub}>#{x.order_number}</Text><Caption>{x.missing_recipe?'Incomplete recipe mapping':'Frozen baking cost'}</Caption></View><Text>{money(x.total_cost)}</Text></View>)}
 </View>
 <View style={s.card}><Text style={s.sub}>Refund / Return Ledger</Text>
 {canEdit?<><Field label="Delivered, paid Order ID" value={refOrder} set={setRefOrder}/>
 <Field label="Refund amount (৳)" value={refAmount} set={setRefAmount} keyboard="decimal-pad"/>
 <Field label="Reason (min 8 characters)" value={refReason} set={setRefReason}/>
 <Button text="Request refund" disabled={busy||!refOrder||!isMoney(refAmount)||refReason.length<8}
 onPress={()=>void action('staff_refund_request',{request_id:secureRequestId(),order_id:refOrder,
 amount:digits(refAmount),reason:refReason,kind:'refund'})}/></>:null}
 {snap?.refunds.slice(0,25).map(r=><View key={r.id} style={{gap:5,borderTopWidth:1,borderColor:c.line,paddingTop:9}}>
 <Text style={s.sub}>{r.status.toUpperCase()} · {money(r.amount)}</Text><Caption>{r.order_id} · {r.reason}</Caption>
 {canEdit&&r.status==='requested'?<Button text="Approve (different staff account)"
 onPress={()=>void action('staff_refund_approve',{refund_id:r.id})} disabled={busy}/>:null}
 {canEdit&&r.status==='approved'?<><Field label="Settlement evidence or transfer reference" value={settleNote} set={setSettleNote}/>
 <Button text="Record refund settlement" disabled={busy||settleNote.length<8}
 onPress={()=>void action('staff_refund_settle',{refund_id:r.id,settlement_note:settleNote})}/></>:null}</View>)}
 </View>
 </>;
}

function FinanceModule({token,canEdit}:{token:string;canEdit:boolean}){
 const [snap,setSnap]=useState<FinanceSnapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [rider,setRider]=useState(''),[amount,setAmount]=useState(''),[notes,setNotes]=useState('');
 const refresh=async()=>{setBusy(true);setError('');try{setSnap(await finance(token));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 useEffect(()=>{void refresh();},[token]);
 const action=async(act:string,p:Record<string,unknown>)=>{setBusy(true);setError('');
 try{setSnap(await finance(token,act,p));setAmount('');setNotes('');}
 catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <>
 <Text style={s.heading}>Rider cash</Text>
 {snap?.riders.map(r=><Pressable key={r.rider_id} style={s.line} onPress={()=>setRider(r.rider_id)}>
 <View style={{flex:1}}><Text style={s.sub}>{r.rider_name} {r.rider_id===rider?'✓':''}</Text>
 <Caption>Collected {money(r.collected)} · Deposited {money(r.deposited)}</Caption></View>
 <Text style={{fontWeight:'900',color:c.brand}}>{money(r.remaining)}</Text></Pressable>)}
 {canEdit?<View style={s.card}><Text style={s.sub}>Record cash handover</Text>
 <Caption>Select rider above. Requires a second staff member to approve.</Caption>
 <Field label="Amount (৳)" value={amount} set={setAmount} keyboard="decimal-pad"/>
 <Field label="Notes" value={notes} set={setNotes}/>
 <Button text="Submit for approval" disabled={busy||!rider||!isMoney(amount)}
 onPress={()=>void action('staff_cash_deposit',{request_id:secureRequestId(),rider_id:rider,
 amount:digits(amount),date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'}),notes})}/>
 </View>:null}
 <View style={s.card}><Text style={s.sub}>Cash approval queue</Text>
 {snap?.deposits.slice(0,30).map(x=><View style={{gap:6,paddingVertical:9,borderBottomWidth:1,borderColor:c.line}} key={x.id}>
 <Text style={s.sub}>{money(x.amount)} · {x.status}</Text><Caption>{x.rider_id} · Logged by {x.actor_name}</Caption>
 {canEdit&&x.status==='pending'?<Button text="Approve handover (independent)" disabled={busy}
 onPress={()=>void action('staff_cash_deposit_approve',{deposit_id:x.id})}/>:null}</View>)}
 </View>
 {error?<Text style={s.error}>{error}</Text>:null}
 <Button text="↻ Refresh cash & accounts" onPress={()=>void refresh()} disabled={busy}/>
 </>;
}

function ProductionModule({token,canEdit}:{token:string;canEdit:boolean}){
 const [snap,setSnap]=useState<FinanceSnapshot|null>(null),[stocks,setStocks]=useState<InventorySnapshot|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [product,setProduct]=useState(''),[variant,setVariant]=useState(''),[component,setComponent]=useState('');
 const [qty,setQty]=useState(''),[cost,setCost]=useState(''),[unit,setUnit]=useState('g'),[stockId,setStockId]=useState('');
 const refresh=async()=>{setBusy(true);try{const [f,i]=await Promise.all([finance(token),inventory(token)]);setSnap(f);setStocks(i);}
 catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 useEffect(()=>{void refresh();},[token]);
 const save=async()=>{setBusy(true);setError('');
 try{setSnap(await finance(token,'staff_cake_cost_save',{request_id:secureRequestId(),product_id:product,variant_id:variant,
 component,quantity:Number(qty),unit_cost:Number(cost),unit_label:unit,inventory_item_id:stockId}));
 setComponent('');setQty('');setCost('');}
 catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <>
 <Text style={s.heading}>Recipe & baking cost</Text>
 <Caption>Save each ingredient cost against a cake size. Ingredient stock is consumed at Start Baking and historical cost is frozen.</Caption>
 <View style={s.card}>
 <Text style={s.sub}>Select cake</Text>
 {snap?.products.map(p=><Choice key={p.id} value={p.name} selected={product===p.id} onPress={()=>{setProduct(p.id);setVariant('');}}/>)}
 {snap?.variants.filter(v=>v.product_id===product).map(v=><Choice key={v.id} value={v.name} selected={variant===v.id} onPress={()=>setVariant(v.id)}/>)}
 {canEdit?<><Field label="Ingredient / cost component" value={component} set={setComponent}/>
 <Field label="Quantity for 1 cake" value={qty} set={setQty} keyboard="decimal-pad"/>
 <Field label="Unit cost (৳)" value={cost} set={setCost} keyboard="decimal-pad"/>
 <View style={{flexDirection:'row',flexWrap:'wrap'}}>{['g','kg','ml','l','pcs'].map(x=><Choice key={x} value={x} selected={unit===x} onPress={()=>{setUnit(x);setStockId('');}}/>)}</View>
 <Caption>Optional matching ingredient stock item:</Caption>
 <Choice value="No mapped ingredient" selected={stockId===''} onPress={()=>setStockId('')}/>
 {stocks?.stock.filter(x=>x.unit===unit).map(x=><Choice key={x.id} value={x.name} selected={stockId===x.id} onPress={()=>setStockId(x.id)}/>)}
 <Button text="Save ingredient cost" disabled={busy||!product||!variant||!component||!isMoney(qty)||!isMoney(cost,true)}
 onPress={()=>void save()}/></>:null}
 </View>
 <View style={s.card}><Text style={s.sub}>Recipe cost breakdown</Text>
 {snap?.costs.filter(x=>x.product_id===product&&x.variant_id===variant).map(x=><View key={x.id} style={s.line}>
 <View style={{flex:1}}><Text style={s.sub}>{x.component}</Text><Caption>{x.quantity} {x.unit_label} × {money(x.unit_cost)}</Caption></View><Text>{money(x.total)}</Text></View>)}
 <Text style={s.heading}>Total: {money(snap?.cost_totals[product+'::'+variant]||0)}</Text></View>
 {error?<Text style={s.error}>{error}</Text>:null}
 <Button text="↻ Refresh recipes" onPress={()=>void refresh()} disabled={busy}/>
 </>;
}

const permissionGroups=[
 'orders_view','order_confirm','order_cancel','kitchen_start','kitchen_ready','delivery_assign',
 'delivery_pickup','delivery_start','delivery_complete','sales_view','sales_create','sales_discount','sales_history',
 'finance_view','finance_edit','custom_cakes_view','custom_cakes_quote','customers_lookup','catalog_view','catalog_edit','catalog_archive'
];
const roles:Role[]=['admin','manager','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant'];
function TeamModule({token,session}:{token:string;session:StaffSession}){
 const [staff,setStaff]=useState<StaffProfile[]>(session.staff_profiles||[]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [name,setName]=useState(''),[username,setUsername]=useState(''),[password,setPassword]=useState('');
 const [role,setRole]=useState<Role>('kitchen_manager'),[permissions,setPermissions]=useState<string[]>([]);
 const [editUser,setEditUser]=useState('');
 const reload=async()=>{const r=await staffPost(token,'staff_session');setStaff((r.staff_profiles||[]) as StaffProfile[]);};
 const submit=async()=>{setBusy(true);setError('');
 try{await createStaff(token,{name,username,password,role,...(permissions.length?{permissions}: {})});await reload();
 setName('');setUsername('');setPassword('');}
 catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const grant=async(name:string,perm:string[])=>{setBusy(true);setError('');
 try{await updateStaff(token,'staff_account_update_permissions',{username:name,permissions:perm});await reload();setEditUser('');}
 catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const toggle=(p:string)=>setPermissions(old=>old.includes(p)?old.filter(x=>x!==p):[...old,p]);
 return <>
 <Text style={s.heading}>Staff & access</Text><Caption>Super Admin only. Every permission is verified by the backend, not just hidden in the app.</Caption>
 <View style={s.card}>
 <Text style={s.sub}>Create employee</Text>
 <Field label="Full name" value={name} set={setName}/>
 <Field label="Username (4+ characters)" value={username} set={setUsername}/>
 <Field label="Temporary password (10+ characters)" value={password} set={setPassword} secret/>
 <Caption>Role</Caption><View style={{flexDirection:'row',flexWrap:'wrap'}}>{roles.map(x=><Choice key={x} value={x.replaceAll('_',' ')} selected={role===x} onPress={()=>{setRole(x);setPermissions([]);}}/>)}</View>
 <Caption>Optional custom permission set (leave unselected for role defaults)</Caption>
 <View style={{flexDirection:'row',flexWrap:'wrap'}}>{permissionGroups.map(p=><Choice key={p} value={p.replaceAll('_',' ')} selected={permissions.includes(p)} onPress={()=>toggle(p)}/>)}</View>
 <Button text="Create staff account" disabled={busy||!name.trim()||username.length<4||password.length<10} onPress={()=>void submit()}/>
 </View>
 <Text style={s.sub}>Existing staff</Text>
 {staff.map(x=><View key={x.username||x.email} style={s.card}>
 <Text style={s.sub}>{x.name} · {x.role}</Text><Caption>{x.username||x.email} · {x.active?'Active':'Disabled'}</Caption>
 {x.username?<><Button text={x.active?'Disable staff':'Enable staff'} disabled={busy} onPress={()=>
 Alert.alert('Change staff access?','Confirm account status update.',[
 {text:'Cancel'}, {text:'Confirm',onPress:()=>{setBusy(true);void updateStaff(token,'staff_account_set_active',{username:x.username,active:!x.active})
 .then(reload).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}])}/>
 <Button text="Edit permissions" disabled={busy} onPress={()=>{setEditUser(x.username||'');setPermissions(x.permissions||[]);}}/>
 {editUser===x.username?<><View style={{flexDirection:'row',flexWrap:'wrap'}}>{permissionGroups.map(p=>
 <Choice key={p} value={p.replaceAll('_',' ')} selected={permissions.includes(p)} onPress={()=>toggle(p)}/>)}</View>
 <Button text="Save permissions" disabled={busy} onPress={()=>void grant(x.username!,permissions)}/></>:null}</>:null}
 </View>)}
 {error?<Text style={s.error}>{error}</Text>:null}
 <Button text="↻ Refresh staff" disabled={busy} onPress={()=>void reload().catch(e=>setError(e.message))}/>
 </>;
}

function CatalogModule({token,canEdit}:{token:string;canEdit:boolean}){
 const [data,setData]=useState<Catalogue|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [editing,setEditing]=useState(''),[amount,setAmount]=useState('');
 const refresh=async()=>{setBusy(true);try{setData(await catalogue(token));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 useEffect(()=>{void refresh();},[token]);
 const change=async(table:'settings'|'product_variants'|'products',id:string,field:string,value:number|boolean)=>{
 setBusy(true);setError('');try{await editCatalog(token,table,id,field,value);setData(await catalogue(token));setEditing('');}
 catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <>
 <Text style={s.heading}>Shop management</Text>
 {data?<View style={s.card}><Text style={s.sub}>{data.settings.shop_name}</Text>
 {(['accepting_orders','delivery_enabled'] as const).map(key=><View key={key} style={s.line}>
 <Text style={{color:c.dark}}>{key.replaceAll('_',' ')}: {data.settings[key]?'On':'Off'}</Text>
 {canEdit?<Button text="Toggle" disabled={busy} onPress={()=>void change('settings',key,key,!data.settings[key])}/>:null}</View>)}</View>:null}
 <Text style={s.sub}>Variants & pricing</Text>
 {data?.variants.map(v=><View key={v.id} style={s.card}>
 <Text style={s.sub}>{data.products.find(p=>p.id===v.product_id)?.name||'Cake'} · {v.name}</Text>
 <Caption>Regular price: {money(v.price)} · Sale: {v.sale_price===''?'None':money(v.sale_price)}</Caption>
 {canEdit?<><Button text={v.is_active?'Disable variant':'Enable variant'} disabled={busy}
 onPress={()=>void change('product_variants',v.id,'is_active',!v.is_active)}/>
 {editing===v.id?<><Field label="New regular price" value={amount} set={setAmount} keyboard="decimal-pad"/>
 <Button text="Save price" disabled={!isMoney(amount,true)||busy}
 onPress={()=>void change('product_variants',v.id,'price',Number(amount))}/></>:
 <Button text="Edit price" disabled={busy} onPress={()=>{setEditing(v.id);setAmount(String(v.price));}}/>}</>:null}
 </View>)}
 {error?<Text style={s.error}>{error}</Text>:null}
 <Button text="↻ Refresh catalog" disabled={busy} onPress={()=>void refresh()}/>
 </>;
}
function CustomModule({token,canQuote}:{token:string;canQuote:boolean}){
 const [rows,setRows]=useState<Record<string,any>[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [editing,setEditing]=useState(''),[price,setPrice]=useState('');
 const refresh=async()=>{setBusy(true);try{const r=await staffPost(token,'staff_custom_cakes');setRows((r.requests||[]) as Record<string,any>[]);}
 catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 useEffect(()=>{void refresh();},[token]);
 const quote=async(id:string,status:'quoted'|'declined')=>{setBusy(true);try{
 await staffPost(token,'staff_custom_quote',{request_id:id,status,quoted_price:status==='quoted'?Number(price):0});
 await refresh();setEditing('');setPrice('');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <><Text style={s.heading}>Custom cake requests</Text>
 {rows.map((r,i)=><View key={String(r.request_id||i)} style={s.card}>
 <Text style={s.sub}>{r.customer_name||'Customer'} · {r.status}</Text>
 <Caption>{r.cake_type} · {r.approx_size} · {r.flavor}</Caption><Caption>{r.instructions||''}</Caption>
 {canQuote&&['pending','quoted'].includes(String(r.status))?<><Button text="Prepare quote" onPress={()=>setEditing(String(r.request_id))}/>
 {editing===r.request_id?<><Field label="Quoted price (৳)" value={price} set={setPrice} keyboard="decimal-pad"/>
 <Button text="Save quote" disabled={busy||!isMoney(price)} onPress={()=>void quote(String(r.request_id),'quoted')}/>
 <Button text="Decline request" disabled={busy} onPress={()=>void quote(String(r.request_id),'declined')}/></>:null}</>:null}
 </View>)}
 {error?<Text style={s.error}>{error}</Text>:null}
 <Button text="↻ Refresh quotes" disabled={busy} onPress={()=>void refresh()}/></>;
}
export default function OperationsScreen({module,token,session,onBack}:{module:Module;token:string;session:StaffSession;onBack:()=>void}){
 const list=availableModules(session);
 if(!list.includes(module))return null;
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:120,gap:12}}>
 <Pressable style={{paddingVertical:9}} onPress={onBack}><Text style={{color:c.brand,fontWeight:'900'}}>‹ Back to operations</Text></Pressable>
 {module==='finance'?<FinanceModule token={token} canEdit={hasPermission(session,'finance_edit')}/>:null}
 {module==='inventory'?<InventoryModule token={token} canEdit={hasPermission(session,'finance_edit')}/>:null}
 {module==='production'?<ProductionModule token={token} canEdit={hasPermission(session,'finance_edit')}/>:null}
 {module==='team'?<TeamModule token={token} session={session}/>:null}
 {module==='catalog'?<CatalogModule token={token} canEdit={hasPermission(session,'catalog_edit')}/>:null}
 {module==='custom'?<CustomModule token={token} canQuote={hasPermission(session,'custom_cakes_quote')}/>:null}
 </ScrollView>;
}
