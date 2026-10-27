import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Alert,FlatList,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import * as Print from 'expo-print';
import {hasPermission,money,posCatalog,posSales,savePos,secureRequestId,type Item,type PosSale} from '../src/work';
import type {StaffSession} from '../src/domain';

const C={bg:'#F5F7F3',white:'#fff',ink:'#173B32',muted:'#63766C',brand:'#1C5845',line:'#DCE8DF'};
const input={borderColor:C.line,borderWidth:1,borderRadius:12,backgroundColor:C.white,minHeight:48,paddingHorizontal:12,fontSize:15,color:C.ink} as const;
const safe=(v:unknown)=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
export function receiptHtml(sale:PosSale,shop:{name:string;phone:string;address:string},width:58|80=80):string{
  const rows=sale.items.map(x=>'<div class="item">'+safe(x.product_name)+' — '+safe(x.variant_name)+'</div>'+
    '<div class="row"><span>'+Number(x.quantity)+' × '+safe(money(x.unit_price))+'</span><b>'+safe(money(x.subtotal))+'</b></div>').join('');
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<style>@page{size:'+width+'mm auto;margin:0}body{width:'+(width-6)+'mm;max-width:'+(width-6)+
    'mm;margin:0;padding:3mm;box-sizing:border-box;color:#000;font:11px/1.5 Arial,sans-serif}'+
    'h2{font-size:18px;margin:0}.center{text-align:center}.line{border-top:1px dashed #111;margin:6px 0}'+
    '.row{display:flex;justify-content:space-between;gap:3mm}.item{margin-top:7px;overflow-wrap:anywhere}'+
    'footer{text-align:center;margin-top:12px}.total{font-size:14px;font-weight:900}</style></head><body>'+
    '<div class="center"><h2>'+safe(shop.name)+'</h2><div>'+safe(shop.address)+'</div><div>'+safe(shop.phone)+'</div>'+
    '<div class="line"></div><b>SALES RECEIPT</b></div>'+
    '<div>Bill: '+safe(sale.sale_number)+'</div><div>Date: '+safe(new Date(sale.sold_at).toLocaleString('en-BD'))+
    '</div><div>Cashier: '+safe(sale.staff_name)+'</div><div>Customer: '+safe(sale.customer_name)+'</div>'+
    '<div class="line"></div>'+rows+'<div class="line"></div><div class="row"><span>Subtotal</span><span>'+
    safe(money(sale.subtotal))+'</span></div><div class="row"><span>Discount</span><span>-'+safe(money(sale.discount_amount))+
    '</span></div><div class="row total"><span>TOTAL</span><span>'+safe(money(sale.total_amount))+'</span></div>'+
    '<div>Paid by: '+safe(sale.payment_method)+'</div><div>TXID: '+safe(sale.payment_reference)+'</div>'+
    '<div class="row"><span>Received</span><span>'+safe(money(sale.amount_received))+'</span></div>'+
    '<div class="row"><span>Change</span><span>'+safe(money(sale.change_amount))+'</span></div>'+
    '<div class="line"></div><footer>Thank you for choosing '+safe(shop.name)+'!</footer></body></html>';
}
function Btn({label,onPress,secondary=false,disabled=false}:{label:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.btn,secondary&&styles.secondary,disabled&&{opacity:.45}]}>
    <Text style={[styles.btnText,secondary&&{color:C.ink}]}>{label}</Text></Pressable>;
}
export default function SalesScreen({token,session}:{token:string;session:StaffSession}){
  const [shop,setShop]=useState({name:"Aurora's Cake",phone:'',address:''});
  const [catalog,setCatalog]=useState<Item[]>([]);
  const [cart,setCart]=useState<{variant_id:string;quantity:number}[]>([]);
  const [query,setQuery]=useState('');
  const [customer,setCustomer]=useState('');
  const [phone,setPhone]=useState('');
  const [discount,setDiscount]=useState('');
  const [received,setReceived]=useState('');
  const [reference,setReference]=useState('');
  const [method,setMethod]=useState<'cash'|'bkash'|'nagad'>('cash');
  const [paper,setPaper]=useState<58|80>(80);
  const [sale,setSale]=useState<PosSale|null>(null);
  const [history,setHistory]=useState<PosSale[]>([]);
  const [showHistory,setShowHistory]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const pending=useRef<Record<string,unknown>|null>(null);
  const allowed=hasPermission(session,'sales_create');
  const allowDiscount=hasPermission(session,'sales_discount');
  useEffect(()=>{let active=true;posCatalog(token).then(r=>{if(!active)return;setCatalog(r.products);setShop(r.shop);})
    .catch(e=>{if(active)setError(e.message||'Catalog unavailable.');})
    .finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[token]);
  const lines=useMemo(()=>cart.map(row=>({row,item:catalog.find(x=>x.variant_id===row.variant_id)}))
    .filter((x):x is {row:{variant_id:string;quantity:number};item:Item}=>Boolean(x.item)),[cart,catalog]);
  const subtotal=Math.round(lines.reduce((n,x)=>n+x.item.price*x.row.quantity,0)*100)/100;
  const off=Number(discount||0);
  const total=Math.round((subtotal-off)*100)/100;
  const qty=(variant_id:string,delta:number)=>{if(pending.current||busy)return;
    setCart(old=>{const found=old.find(x=>x.variant_id===variant_id),count=(found?.quantity||0)+delta;
      if(count<=0)return old.filter(x=>x.variant_id!==variant_id);
      if(count>50)return old;
      return found?old.map(x=>x.variant_id===variant_id?{...x,quantity:count}:x):
        old.length>=25?old:[...old,{variant_id,quantity:1}];});
  };
  const loadHistory=async()=>{setError('');setBusy(true);try{const rows=await posSales(token);setHistory(rows);setShowHistory(true);}
    catch(e){setError(e instanceof Error?e.message:'History failed.');}finally{setBusy(false);}};
  const complete=async()=>{
    if(!allowed||busy)return;
    if(!pending.current){
      if(!cart.length||lines.length!==cart.length)return setError('Add a valid product before billing.');
      if(!Number.isFinite(off)||off<0||off>subtotal||(!allowDiscount&&off>0))return setError('Invalid or unauthorized discount.');
      if(method==='cash'&&received!==''&&(!Number.isFinite(Number(received))||Number(received)<total))
        return setError('Received cash is below total.');
      if(method!=='cash'&&reference.trim().length<6)return setError('Enter bKash/Nagad TXID.');
      pending.current={request_id:secureRequestId(),items:cart.map(x=>({...x})),
        payment_method:method,amount_received:method==='cash'?Number(received||total):0,
        payment_reference:method==='cash'?'':reference.trim(),discount_amount:off,
        customer_name:customer.trim()||'Walk-in',customer_phone:phone.trim()};
    }
    setError('');setBusy(true);setMessage('');
    try{const result=await savePos(token,pending.current);setSale(result);pending.current=null;setCart([]);
      setCustomer('');setPhone('');setReceived('');setReference('');setDiscount('');
      setMessage('Saved in Google Sheets. Confirmed bill is ready to print.');
    }catch(e){setError((e instanceof Error?e.message:'Save failed.')+' Retry this same sale; do not start a new bill.');}
    finally{setBusy(false);}
  };
  const print=async()=>{
    if(!sale)return;try{await Print.printAsync({html:receiptHtml(sale,shop,paper)});}
    catch(e){Alert.alert('Printer unavailable',e instanceof Error?e.message:'Check printer or use Print to PDF.');}
  };
  const products=catalog.filter(x=>(x.product_name+' '+x.variant_name).toLowerCase().includes(query.toLowerCase())).slice(0,120);
  return <ScrollView contentContainerStyle={{padding:16,paddingBottom:140,gap:12}} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>🛍 Counter Sales</Text>
    <Text style={styles.note}>Fast walk-in checkout • Cash / bKash / Nagad • POS receipt</Text>
    {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
    {message?<Text style={styles.success}>{message}</Text>:null}
    <View style={styles.panel}>
      <Text style={styles.heading}>Choose cakes</Text>
      <TextInput style={input} placeholder="Search cake or variant" value={query} onChangeText={setQuery}/>
      {loading?<ActivityIndicator color={C.brand}/>:null}
      {products.map(p=><Pressable key={p.variant_id} onPress={()=>qty(p.variant_id,1)}
        disabled={!allowed||busy||Boolean(pending.current)} style={styles.line}>
        <View style={{flex:1}}><Text style={styles.bold}>{p.product_name}</Text><Text style={styles.note}>{p.variant_name}</Text></View>
        <Text style={styles.price}>{money(p.price)}   ＋</Text>
      </Pressable>)}
      {!loading&&products.length===0?<Text style={styles.note}>No active cake matched.</Text>:null}
    </View>
    <View style={styles.panel}>
      <Text style={styles.heading}>Current bill ({cart.reduce((x,y)=>x+y.quantity,0)} pieces)</Text>
      {lines.length===0?<Text style={styles.note}>Tap a cake above to add it here.</Text>:null}
      {lines.map(({row,item})=><View key={row.variant_id} style={styles.line}>
        <View style={{flex:1}}><Text style={styles.bold}>{item.product_name}</Text><Text style={styles.note}>{item.variant_name} · {money(item.price)}</Text></View>
        <Pressable onPress={()=>qty(row.variant_id,-1)} style={styles.step}><Text>−</Text></Pressable>
        <Text style={styles.bold}>{row.quantity}</Text>
        <Pressable onPress={()=>qty(row.variant_id,1)} style={styles.step}><Text>＋</Text></Pressable>
      </View>)}
      <View style={styles.line}><Text>Subtotal</Text><Text style={styles.bold}>{money(subtotal)}</Text></View>
      {allowDiscount?<><Text style={styles.label}>Discount (BDT)</Text>
        <TextInput style={input} keyboardType="decimal-pad" value={discount} onChangeText={setDiscount} placeholder="0"/></>:null}
      <View style={styles.line}><Text style={styles.heading}>Payable</Text><Text style={styles.price}>{money(Math.max(0,total))}</Text></View>
      <Text style={styles.label}>Customer name (optional)</Text><TextInput style={input} value={customer} onChangeText={setCustomer} placeholder="Walk-in"/>
      <Text style={styles.label}>Phone (optional)</Text><TextInput style={input} keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="01…"/>
      <Text style={styles.label}>Payment method</Text><View style={{flexDirection:'row',gap:7}}>
        {(['cash','bkash','nagad'] as const).map(m=><Pressable key={m} onPress={()=>setMethod(m)}
          style={[styles.step,{flex:1,paddingVertical:14,backgroundColor:method===m?C.brand:C.bg}]}>
          <Text style={{color:method===m?'#fff':C.ink,fontWeight:'800'}}>{m.toUpperCase()}</Text></Pressable>)}
      </View>
      {method==='cash'?<><Text style={styles.label}>Cash received (blank = exact)</Text>
        <TextInput style={input} keyboardType="decimal-pad" value={received} onChangeText={setReceived} placeholder={String(total)}/>
        <Text style={styles.note}>Change: {money(Math.max(0,Number(received||total)-total))}</Text></>:
        <><Text style={styles.label}>TXID — manually checked by cashier</Text>
          <TextInput style={input} value={reference} onChangeText={setReference} placeholder="Transaction reference"/></>}
      <Btn label={busy?'Saving sale…':pending.current?'Retry saved bill reference':'Confirm payment & save'} onPress={()=>void complete()}
        disabled={!allowed||busy||(!pending.current&&cart.length===0)}/>
      <Text style={styles.note}>Payment is staff-attested; there is no automatic mobile-money gateway verification.</Text>
    </View>
    {sale?<View style={styles.panel}>
      <Text style={styles.heading}>✓ Saved receipt {sale.sale_number}</Text>
      <Text style={styles.price}>{money(sale.total_amount)}</Text>
      <View style={{flexDirection:'row',gap:9}}>
        {[58,80].map(w=><Pressable key={w} onPress={()=>setPaper(w as 58|80)}
          style={[styles.step,{flex:1,backgroundColor:paper===w?C.brand:C.bg}]}>
          <Text style={{color:paper===w?'white':C.ink}}>{w}mm</Text></Pressable>)}
      </View>
      <Btn label="🖨 Print / Save PDF" onPress={()=>void print()}/>
    </View>:null}
    {hasPermission(session,'sales_history')?<Btn secondary label={showHistory?'Hide history':'🧾 Recent sales & reprints'}
      onPress={()=>showHistory?setShowHistory(false):void loadHistory()} disabled={busy}/>:null}
    {showHistory&&history.map(row=><Pressable key={row.id} onPress={()=>{setSale(row);setShowHistory(false);setMessage('Receipt selected for reprint.');}} style={styles.line}>
      <View style={{flex:1}}><Text style={styles.bold}>{row.sale_number}</Text><Text style={styles.note}>{row.staff_name} · {row.payment_method}</Text></View><Text style={styles.price}>{money(row.total_amount)}</Text>
    </Pressable>)}
  </ScrollView>;
}
const styles=StyleSheet.create({
  title:{fontSize:24,fontWeight:'900',color:C.ink},heading:{fontSize:17,fontWeight:'900',color:C.ink},
  note:{fontSize:12,color:C.muted,lineHeight:18},label:{fontSize:12,fontWeight:'800',color:C.ink,marginTop:6},
  panel:{padding:16,borderColor:C.line,borderWidth:1,borderRadius:20,backgroundColor:C.white,gap:10},
  line:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingVertical:10,borderBottomWidth:1,borderColor:C.line},
  price:{fontSize:16,fontWeight:'900',color:C.brand},bold:{fontWeight:'800',color:C.ink,fontSize:14},
  step:{padding:10,minWidth:38,alignItems:'center',justifyContent:'center',backgroundColor:C.bg,borderRadius:10},
  btn:{minHeight:52,padding:13,backgroundColor:C.brand,borderRadius:13,alignItems:'center',justifyContent:'center'},
  btnText:{fontSize:14,color:'white',fontWeight:'900'},secondary:{backgroundColor:'#E6F0E8'},
  error:{padding:12,backgroundColor:'#FCE8E5',color:'#9A352A',borderRadius:12},
  success:{padding:12,backgroundColor:'#DDF5E3',color:C.brand,borderRadius:12}
});
