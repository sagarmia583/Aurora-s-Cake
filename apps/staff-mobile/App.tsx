import React, {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {
  ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Linking,
  Platform, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, View
} from 'react-native';
import {ApiError, clearSession, login, mutate, ordersFor, restore} from './src/api';
import {
  money,nextOperation,operationLabels,roleLabel,statusLabel,visibleOrders,
  type Operation,type StaffOrder,type StaffSession,type Tab
} from './src/domain';

const C={ink:'#15352C',sub:'#60746C',bg:'#F5F7F3',paper:'#FFFFFF',line:'#E1E8E0',
  brand:'#1D5845',dark:'#123A2F',mint:'#E4F2E8',gold:'#F3B35D',warn:'#A34835',rose:'#FCE8E5'};
const cardShadow={shadowColor:'#0F2E23',shadowOpacity:0.045,shadowRadius:14,shadowOffset:{width:0,height:4},elevation:1};
const humanTime=(value:string)=>{
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('en-BD',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
};
function SmallLabel({children}:{children:React.ReactNode}){return <Text style={s.muted}>{children}</Text>;}
function ActionButton({label,onPress,disabled=false,kind='main'}:{
  label:string;onPress:()=>void;disabled?:boolean;kind?:'main'|'secondary'|'danger'
}){
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[s.button,kind==='secondary'&&s.secondaryButton,kind==='danger'&&s.dangerButton,disabled&&s.disabled]}>
    <Text style={[s.buttonText,kind==='secondary'&&s.secondaryButtonText,kind==='danger'&&s.dangerButtonText]}>{label}</Text>
  </Pressable>;
}
function Input({label,value,onChange,secure=false,keyboard,placeholder}:{
  label:string;value:string;onChange:(t:string)=>void;secure?:boolean;
  keyboard?:'default'|'number-pad';placeholder?:string;
}){
  return <View style={{gap:7,marginBottom:14}}>
    <Text style={s.inputLabel}>{label}</Text>
    <TextInput accessibilityLabel={label} style={s.input} value={value} onChangeText={onChange}
      secureTextEntry={secure} autoCapitalize="none" autoCorrect={false}
      keyboardType={keyboard||'default'} placeholder={placeholder}
      placeholderTextColor="#93A39A"/>
  </View>;
}
function OrderTile({order,session,working,onNext,onAssign,onOtp,onCancel}:{
  order:StaffOrder;session:StaffSession;working:boolean;
  onNext:(o:StaffOrder,op:Operation)=>void;onAssign:(o:StaffOrder)=>void;
  onOtp:(o:StaffOrder)=>void;onCancel:(o:StaffOrder)=>void;
}){
  const [expanded,setExpanded]=useState(false);
  const next=nextOperation(order,session);
  const canCancel=(session.role==='super_admin'||session.role==='admin'||session.role==='order_manager')&&
    ['pending','confirmed','preparing','ready','assigned'].includes(order.status);
  const done=order.status==='delivered'||order.status==='cancelled';
  const onAction=()=>{
    if(!next)return;
    if(next==='assign')onAssign(order);
    else if(next==='deliver')onOtp(order);
    else onNext(order,next);
  };
  return <View style={[s.orderCard,cardShadow]}>
    <View style={s.inline}>
      <View style={{flex:1}}>
        <Text style={s.orderNo}>#{order.order_number||order.id.slice(-8)}</Text>
        <Text style={s.muted}>{humanTime(order.created_at)}</Text>
      </View>
      <View style={[s.pill,done?s.pillGrey:next?s.pillAction:s.pillPlain]}>
        <Text style={s.pillText}>{statusLabel(order.status)}</Text>
      </View>
    </View>
    <View style={[s.inline,{marginTop:14}]}>
      <View style={{flex:1}}>
        <Text style={s.customer}>{order.customer_name||'Customer'}</Text>
        <SmallLabel>{order.customer_phone||'Contact restricted for this role'}</SmallLabel>
      </View>
      <Text style={s.money}>{money(order.total_amount)}</Text>
    </View>
    {order.delivery_slot?<Text style={s.deliveryMeta}>🕘 {order.delivery_date||''}  {order.delivery_slot}</Text>:null}
    {(session.role==='delivery_man'||session.role==='delivery_manager'||session.role==='admin'||session.role==='super_admin')&&
       order.delivery_address?<Text numberOfLines={expanded?undefined:2} style={s.address}>📍 {order.delivery_address}</Text>:null}
    {session.role==='delivery_man'&&order.payment_method==='cod'?<View style={s.codStrip}>
      <Text style={s.codText}>Cash on delivery</Text><Text style={s.codAmount}>{money(order.cod_amount??order.total_amount)}</Text>
    </View>:null}
    {next?<ActionButton disabled={working} label={working?'⏳ Saving to Google Sheets…':operationLabels[next]+'  →'} onPress={onAction}/>:null}
    <Pressable accessibilityRole="button" onPress={()=>setExpanded(v=>!v)} style={s.detailsToggle}>
      <Text style={s.detailsToggleText}>{expanded?'Hide order details  −':'View order details  +'}</Text>
    </Pressable>
    {expanded?<View style={{gap:9,marginTop:8,paddingTop:12,borderTopWidth:1,borderColor:C.line}}>
      {Array.isArray(order.items)&&order.items.map((item,i)=>
        <View key={i} style={s.inline}><Text style={{color:C.ink,flex:1,fontSize:13}}>{item.quantity} × {item.product_name} {item.variant_name||''}</Text>
          <Text style={{color:C.ink,fontWeight:'700'}}>{money(item.subtotal)}</Text></View>)}
      {order.order_note?<Text style={s.note}>Note: {order.order_note}</Text>:null}
      {order.rider_name?<SmallLabel>Assigned rider: {order.rider_name}</SmallLabel>:null}
      {session.role==='delivery_man'&&order.customer_phone?
        <ActionButton kind="secondary" label="📞 Call customer" onPress={()=>void Linking.openURL('tel:'+order.customer_phone!.replace(/[^\d+]/g,''))}/>:null}
      {session.role==='delivery_man'&&order.delivery_address?
        <ActionButton kind="secondary" label="🗺️ Open delivery map" onPress={()=>void Linking.openURL('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(order.delivery_address!))}/>:null}
      {canCancel?<ActionButton kind="danger" disabled={working} label="Cancel this order" onPress={()=>onCancel(order)}/>:null}
    </View>:null}
  </View>;
}
export default function App(){
  const [initializing,setInitializing]=useState(true);
  const [token,setToken]=useState('');
  const [session,setSession]=useState<StaffSession|null>(null);
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [loginBusy,setLoginBusy]=useState(false);
  const [orders,setOrders]=useState<StaffOrder[]>([]);
  const [tab,setTab]=useState<Tab>('tasks');
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<'all'|'open'|'done'>('open');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [refreshing,setRefreshing]=useState(false);
  const [workingId,setWorkingId]=useState('');
  const [lastRefresh,setLastRefresh]=useState('');
  const [otpOrder,setOtpOrder]=useState<StaffOrder|null>(null);
  const [otp,setOtp]=useState('');
  const [cash,setCash]=useState(false);
  const [assignOrder,setAssignOrder]=useState<StaffOrder|null>(null);
  const [rider,setRider]=useState('');
  const refreshBusy=useRef(false),mutationEpoch=useRef(0);
  const alive=useRef(true);
  const sessionRef=useRef(session),tokenRef=useRef(token);
  useEffect(()=>{sessionRef.current=session;tokenRef.current=token;},[session,token]);
  const applyLogin=useCallback((nextToken:string,nextSession:StaffSession)=>{
    setToken(nextToken);setSession(nextSession);setTab('tasks');
    setOrders([]);setError('');setNotice('');
  },[]);
  const attemptRestore=useCallback(async()=>{
    setInitializing(true);setError('');
    try{
      const stored=await restore();
      if(alive.current&&stored)applyLogin(stored.token,stored.session);
    }catch(e){
      // Expired session should be deleted, but network outages should not force sign-out.
      if(e instanceof ApiError&&['unauthorized','invalid_credentials'].includes(e.code))
        await clearSession();
      if(alive.current)setError(e instanceof Error?e.message:'Could not restore staff login.');
    }finally{if(alive.current)setInitializing(false);}
  },[applyLogin]);
  useEffect(()=>{
    alive.current=true;void attemptRestore();
    return()=>{alive.current=false;};
  },[attemptRestore]);
  const refresh=useCallback(async(silent=false)=>{
    const activeToken=tokenRef.current;
    if(!activeToken||refreshBusy.current)return;
    refreshBusy.current=true;
    const startEpoch=mutationEpoch.current;
    if(!silent)setRefreshing(true);
    try{
      const next=await ordersFor(activeToken);
      if(!alive.current||tokenRef.current!==activeToken||startEpoch!==mutationEpoch.current)return;
      setOrders(next);setLastRefresh(new Date().toISOString());setError('');
    }catch(e){
      if(!alive.current)return;
      if(e instanceof ApiError&&e.code==='unauthorized'){
        setToken('');setSession(null);setOrders([]);
        void clearSession();
        setError('Your session has expired. Sign in again.');
      }else if(!silent){setError(e instanceof Error?e.message:'Could not refresh orders.');}
    }finally{refreshBusy.current=false;if(alive.current)setRefreshing(false);}
  },[]);
  useEffect(()=>{
    if(!token)return;
    void refresh();
    const listener=AppState.addEventListener('change',v=>{
      if(v==='active')void refresh(true);
    });
    const timer=setInterval(()=>{
      if(AppState.currentState==='active'&&!workingId)void refresh(true);
    },30000);
    return()=>{listener.remove();clearInterval(timer);};
  },[token,workingId,refresh]);
  const submitLogin=async()=>{
    if(loginBusy)return;
    if(!username.trim()||password.length<10){setError('Username এবং ১০ অক্ষরের Password দাও।');return;}
    setLoginBusy(true);setError('');
    try{const data=await login(username,password);applyLogin(data.token,data.session);setPassword('');}
    catch(e){setError(e instanceof Error?e.message:'Login unsuccessful.');}
    finally{setLoginBusy(false);}
  };
  const signout=()=>Alert.alert('Sign out?','এই ডিভাইসের Staff session বন্ধ হবে।',[
    {text:'Cancel',style:'cancel'},
    {text:'Sign out',style:'destructive',onPress:()=>{
      const old=tokenRef.current;mutationEpoch.current++;
      setToken('');setSession(null);setOrders([]);setOtpOrder(null);
      void clearSession(old);
    }}
  ]);
  const applyMutation=async(order:StaffOrder,operation:Operation,extra:Record<string,unknown>={})=>{
    if(workingId)return;
    setWorkingId(order.id);setError('');setNotice('');
    mutationEpoch.current+=1;
    try{
      const updated=await mutate(token,order,operation,extra);
      if(!alive.current)return;
      setOrders(prev=>prev.map(o=>o.id===updated.id?{...o,...updated}:o));
      setNotice('#'+order.order_number+' — '+statusLabel(updated.status)+' ✓');
      setOtpOrder(null);setOtp('');setCash(false);setAssignOrder(null);
      // Do not block UI waiting for a slow second Sheets read.
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Order was not updated.');}
    finally{if(alive.current)setWorkingId('');}
  };
  const action=(order:StaffOrder,op:Operation)=>{
    if(op==='cancel'){Alert.alert('Cancel order?','এটি আর ডেলিভারি হবে না।',[
      {text:'Back',style:'cancel'},{text:'Cancel order',style:'destructive',
        onPress:()=>void applyMutation(order,'cancel')}]);return;}
    if(op==='start_delivery'){
      Alert.alert('Start delivery','এখন Customer-এর order tracking-এ OTP তৈরি হবে।',[
        {text:'Back',style:'cancel'},{text:'Start delivery',onPress:()=>void applyMutation(order,op)}]);return;
    }
    void applyMutation(order,op);
  };
  const finishDelivery=()=>{
    if(!otpOrder||!/^\d{4}$/.test(otp)){setError('Customer-এর সঠিক ৪ সংখ্যার OTP দাও।');return;}
    if(otpOrder.payment_method==='cod'&&!cash){setError('পুরো COD Cash সংগ্রহ নিশ্চিত করো।');return;}
    void applyMutation(otpOrder,'deliver',{delivery_otp:otp,cash_collected:cash});
  };
  const visible=useMemo(()=>{
    if(!session)return [];
    let result=visibleOrders(orders,session,tab==='tasks'?'tasks':'orders');
    if(tab==='orders'&&filter==='open')result=result.filter(o=>!['delivered','cancelled'].includes(o.status));
    if(tab==='orders'&&filter==='done')result=result.filter(o=>['delivered','cancelled'].includes(o.status));
    const q=query.trim().toLowerCase();
    if(q)result=result.filter(o=>(o.order_number+' '+(o.customer_name||'')+' '+(o.customer_phone||'')).toLowerCase().includes(q));
    return result;
  },[orders,session,tab,filter,query]);
  const counts=useMemo(()=>({
    tasks:session?visibleOrders(orders,session,'tasks').length:0,
    active:orders.filter(o=>!['delivered','cancelled'].includes(o.status)).length,
    done:orders.filter(o=>o.status==='delivered').length
  }),[orders,session]);
  if(initializing)return <View style={s.center}><StatusBar barStyle="dark-content"/>
    <Text style={s.logo}>AURORA'S</Text><Text style={s.logoSub}>CAKE · STAFF</Text>
    <ActivityIndicator color={C.brand} size="large" style={{marginTop:22}}/>
    <SmallLabel>Restoring secure session…</SmallLabel>
  </View>;
  if(!session)return <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={s.root}>
    <StatusBar backgroundColor={C.bg} barStyle="dark-content"/>
    <ScrollView contentContainerStyle={s.loginContainer} keyboardShouldPersistTaps="handled">
      <View style={s.loginLogo}><Text style={{fontSize:35}}>🍰</Text></View>
      <Text style={s.logo}>AURORA'S</Text><Text style={s.logoSub}>CAKE · STAFF</Text>
      <Text style={s.loginTitle}>Welcome back</Text>
      <Text style={s.loginIntro}>Kitchen, Rider, Delivery ও Manager—সব Staff-এর জন্য একটি দ্রুত অ্যাপ।</Text>
      <View style={[s.loginPanel,cardShadow]}>
        <Input label="Staff Username" value={username} onChange={setUsername} placeholder="e.g. rider01"/>
        <Input label="Password" value={password} onChange={setPassword} secure placeholder="Minimum 10 characters"/>
        {error?<Text style={s.error}>{error}</Text>:null}
        <ActionButton disabled={loginBusy} label={loginBusy?'Verifying account…':'Sign in to workspace →'} onPress={()=>void submitLogin()}/>
        <Text style={s.note}>এই Login শুধু Super Admin-এর তৈরি Employee account-এর জন্য। Owner-এর Google Login ওয়েব Dashboard-এ থাকবে।</Text>
      </View>
      <Pressable onPress={()=>void attemptRestore()}><Text style={s.reconnect}>Previous session? Tap to reconnect</Text></Pressable>
      <Text style={s.footer}>Private Staff App · Aurora's Cake</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
  const readyToAssign=session.riders.filter(x=>x.email);
  return <View style={s.root}>
    <StatusBar barStyle="light-content"/>
    <View style={s.top}>
      <View><Text style={s.topEyebrow}>AURORA'S CAKE</Text><Text style={s.topTitle}>{roleLabel[session.role]} Workspace</Text>
        <Text style={s.topSub}>Hello, {session.name}</Text></View>
      <Pressable accessibilityLabel="Refresh orders" style={s.refreshCircle} onPress={()=>void refresh()}>
        {refreshing?<ActivityIndicator color={C.brand}/>:<Text style={{fontSize:23,color:C.brand}}>↻</Text>}
      </Pressable>
    </View>
    <View style={s.stats}>
      <View style={s.stat}><Text style={s.statValue}>{counts.tasks}</Text><Text style={s.statLabel}>To do</Text></View>
      <View style={s.stat}><Text style={s.statValue}>{counts.active}</Text><Text style={s.statLabel}>Active</Text></View>
      <View style={s.stat}><Text style={s.statValue}>{counts.done}</Text><Text style={s.statLabel}>Delivered</Text></View>
    </View>
    {error?<View style={s.bannerError}><Text style={{color:C.warn,flex:1}}>{error}</Text>
      <Pressable onPress={()=>setError('')}><Text style={{color:C.warn,fontWeight:'800'}}>✕</Text></Pressable></View>:null}
    {notice?<View style={s.bannerSuccess}><Text style={{color:C.brand,flex:1}}>{notice}</Text>
      <Pressable onPress={()=>setNotice('')}><Text style={{color:C.brand}}>✕</Text></Pressable></View>:null}
    {tab==='account'?<ScrollView contentContainerStyle={{padding:18,gap:14}}>
      <View style={s.infoCard}><Text style={s.infoTitle}>👤 My Profile</Text>
        <Text style={s.customer}>{session.name}</Text>
        <SmallLabel>{session.username?'@'+session.username:session.email}</SmallLabel>
        <Text style={s.infoLine}>Role: {roleLabel[session.role]}</Text>
        <Text style={s.infoLine}>Session: encrypted on your device. Server expires after 12 hours.</Text>
        <Text style={s.infoLine}>Order details are never permanently cached on this device.</Text>
      </View>
      <View style={s.infoCard}><Text style={s.infoTitle}>⚡ Quick Help</Text>
        <Text style={s.infoLine}>• Pull down to refresh orders.</Text>
        <Text style={s.infoLine}>• Order status refreshes about every 30 seconds while open.</Text>
        <Text style={s.infoLine}>• Rider OTP appears on customer's tracking page only after Start delivery.</Text>
        <Text style={s.infoLine}>• Cash on delivery must be collected before completion.</Text>
      </View>
      <ActionButton kind="danger" label="Sign out securely" onPress={signout}/>
    </ScrollView>:<>
      <View style={s.listToolbar}>
        <Text style={s.sectionTitle}>{tab==='tasks'?'My next actions':'Order history'}</Text>
        <Text style={s.muted}>{lastRefresh?'Updated '+humanTime(lastRefresh):'Connecting…'}</Text>
      </View>
      {tab==='orders'?<View style={s.filterBar}>
        {(['open','done','all'] as const).map(option=><Pressable key={option}
          onPress={()=>setFilter(option)} style={[s.filterPill,filter===option&&s.filterActive]}>
          <Text style={[s.filterText,filter===option&&s.filterTextActive]}>{option==='open'?'Active':option==='done'?'Completed':'All'}</Text>
        </Pressable>)}
      </View>:null}
      <TextInput style={s.search} accessibilityLabel="Search order" placeholder="Search by order, name or phone"
        placeholderTextColor="#94A39B" value={query} onChangeText={setQuery}/>
      <FlatList data={visible} keyExtractor={item=>item.id} contentContainerStyle={{padding:16,paddingBottom:110,gap:12}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void refresh()} tintColor={C.brand}/>}
        keyboardShouldPersistTaps="handled" initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
        renderItem={({item})=><OrderTile order={item} session={session} working={workingId===item.id}
          onNext={action} onAssign={o=>{setAssignOrder(o);setRider(readyToAssign[0]?.email||'');}}
          onOtp={o=>{setOtpOrder(o);setOtp('');setCash(false);}}
          onCancel={o=>action(o,'cancel')}/>}
        ListEmptyComponent={<View style={s.empty}><Text style={{fontSize:40}}>✨</Text>
          <Text style={s.emptyTitle}>{refreshing?'Loading orders…':'Nothing waiting here'}</Text>
          <Text style={s.muted}>Pull down to refresh or choose All Orders.</Text></View>}
      />
    </>}
    <View style={s.tabBar}>
      {([{id:'tasks',icon:'✅',name:'My tasks'},{id:'orders',icon:'📦',name:'Orders'},{id:'account',icon:'👤',name:'Account'}] as const).map(item=>
        <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{selected:tab===item.id}}
          onPress={()=>setTab(item.id)} style={[s.tab,tab===item.id&&s.tabActive]}>
          <Text style={s.tabIcon}>{item.icon}</Text><Text style={[s.tabText,tab===item.id&&s.tabTextActive]}>{item.name}</Text>
        </Pressable>)}
    </View>
    {assignOrder?<View style={s.overlay}><View style={s.sheet}>
      <Text style={s.sheetTitle}>Assign a delivery rider</Text>
      <SmallLabel>Order #{assignOrder.order_number}</SmallLabel>
      {readyToAssign.length?readyToAssign.map(person=>
        <Pressable key={person.email} style={[s.choice,rider===person.email&&s.choiceSelected]}
          onPress={()=>setRider(person.email)}>
          <Text style={{fontSize:16,color:C.ink}}>{rider===person.email?'◉':'○'}  {person.name}</Text>
          <SmallLabel>{person.email}</SmallLabel>
        </Pressable>):<Text style={s.error}>No active delivery rider. Create one from the web Super Admin dashboard.</Text>}
      <ActionButton disabled={!rider||!!workingId} label={workingId?'Assigning…':'Confirm rider assignment'}
        onPress={()=>void applyMutation(assignOrder,'assign',{rider_email:rider})}/>
      <ActionButton kind="secondary" label="Back" onPress={()=>setAssignOrder(null)}/>
    </View></View>:null}
    {otpOrder?<View style={s.overlay}><View style={s.sheet}>
      <Text style={s.sheetTitle}>✅ Complete delivery</Text>
      <SmallLabel>#{otpOrder.order_number} · {money(otpOrder.cod_amount??otpOrder.total_amount)}</SmallLabel>
      <Text style={s.infoLine}>Ask the customer for the 4-digit OTP shown on their private tracking receipt.</Text>
      <TextInput style={[s.input,{fontSize:26,textAlign:'center',letterSpacing:14,marginVertical:14}]}
        value={otp} onChangeText={t=>setOtp(t.replace(/[^\d]/g,'').slice(0,4))}
        maxLength={4} keyboardType="number-pad" secureTextEntry placeholder="••••"
        accessibilityLabel="Customer delivery OTP"/>
      {otpOrder.payment_method==='cod'?<Pressable style={[s.cashConfirm,cash&&s.cashConfirmed]} onPress={()=>setCash(x=>!x)}>
        <Text style={{color:C.ink,fontSize:15,fontWeight:'700'}}>{cash?'☑':'☐'}  Full COD cash collected: {money(otpOrder.cod_amount??otpOrder.total_amount)}</Text>
      </Pressable>:null}
      <ActionButton disabled={otp.length!==4||(otpOrder.payment_method==='cod'&&!cash)||!!workingId}
        label={workingId?'Verifying…':'Verify OTP and mark delivered'} onPress={finishDelivery}/>
      <ActionButton kind="secondary" label="Back" onPress={()=>{setOtpOrder(null);setOtp('');setCash(false);}}/>
    </View></View>:null}
  </View>;
}
const s=StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg,paddingTop:Platform.OS==='android'?(StatusBar.currentHeight||24):54},
  center:{flex:1,justifyContent:'center',alignItems:'center',gap:8,backgroundColor:C.bg},
  logo:{fontSize:31,fontWeight:'900',letterSpacing:3.8,color:C.dark,textAlign:'center'},
  logoSub:{fontSize:12,fontWeight:'800',letterSpacing:4,color:C.brand,textAlign:'center'},
  loginContainer:{paddingHorizontal:24,paddingTop:55,paddingBottom:40,alignItems:'stretch'},
  loginLogo:{alignSelf:'center',width:78,height:78,borderRadius:25,justifyContent:'center',alignItems:'center',backgroundColor:C.mint,marginBottom:12},
  loginTitle:{fontSize:26,fontWeight:'900',color:C.ink,marginTop:37},
  loginIntro:{color:C.sub,fontSize:14,marginTop:8,lineHeight:22,marginBottom:21},
  loginPanel:{backgroundColor:C.paper,borderWidth:1,borderColor:C.line,borderRadius:23,padding:19,gap:2},
  inputLabel:{fontSize:13,fontWeight:'800',color:C.ink},
  input:{backgroundColor:C.paper,borderColor:'#CFDCD2',borderWidth:1,borderRadius:13,paddingHorizontal:13,paddingVertical:13,fontSize:16,color:C.ink,minHeight:51},
  button:{backgroundColor:C.brand,paddingVertical:15,paddingHorizontal:16,borderRadius:14,alignItems:'center',justifyContent:'center',minHeight:52,marginTop:7},
  buttonText:{color:'#FFF',fontSize:14,fontWeight:'800',textAlign:'center'},
  secondaryButton:{backgroundColor:'#F8FBF8',borderWidth:1,borderColor:'#B9CEBE'},
  secondaryButtonText:{color:C.brand},
  dangerButton:{backgroundColor:'#FFF7F6',borderWidth:1,borderColor:'#EAC5BF'},
  dangerButtonText:{color:C.warn},
  disabled:{opacity:0.48},
  note:{fontSize:12,color:C.sub,lineHeight:18,marginTop:8},
  reconnect:{fontSize:13,color:C.brand,textAlign:'center',textDecorationLine:'underline',marginTop:20},
  footer:{color:'#93A39C',fontSize:11,textAlign:'center',marginTop:30},
  error:{color:C.warn,backgroundColor:C.rose,padding:12,borderRadius:12,fontSize:13,lineHeight:19,marginBottom:8},
  top:{backgroundColor:C.dark,paddingHorizontal:20,paddingVertical:20,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomLeftRadius:24,borderBottomRightRadius:24},
  topEyebrow:{color:'#B4D9C2',fontSize:10,fontWeight:'900',letterSpacing:2},
  topTitle:{color:'#FFF',fontWeight:'900',fontSize:22,marginTop:5},
  topSub:{color:'#BDD5C8',fontSize:13,marginTop:5},
  refreshCircle:{width:45,height:45,borderRadius:15,backgroundColor:'#EFF9F0',alignItems:'center',justifyContent:'center'},
  stats:{flexDirection:'row',gap:10,paddingHorizontal:16,marginTop:14},
  stat:{flex:1,backgroundColor:C.paper,borderWidth:1,borderColor:C.line,borderRadius:17,paddingVertical:13,alignItems:'center'},
  statValue:{fontSize:23,fontWeight:'900',color:C.ink},
  statLabel:{fontSize:11,color:C.sub,fontWeight:'700',marginTop:3},
  listToolbar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:18,paddingTop:18,paddingBottom:6},
  sectionTitle:{fontSize:18,fontWeight:'900',color:C.ink},
  muted:{color:C.sub,fontSize:12},
  bannerError:{marginHorizontal:16,marginTop:12,padding:12,backgroundColor:C.rose,borderRadius:12,flexDirection:'row',gap:10},
  bannerSuccess:{marginHorizontal:16,marginTop:12,padding:12,backgroundColor:C.mint,borderRadius:12,flexDirection:'row',gap:10},
  filterBar:{flexDirection:'row',gap:8,paddingHorizontal:17,paddingVertical:8},
  filterPill:{borderColor:C.line,borderWidth:1,paddingHorizontal:14,paddingVertical:8,borderRadius:99,backgroundColor:C.paper},
  filterActive:{backgroundColor:C.dark,borderColor:C.dark},
  filterText:{fontSize:12,fontWeight:'800',color:C.sub},
  filterTextActive:{color:'#FFF'},
  search:{backgroundColor:C.paper,borderWidth:1,borderColor:C.line,marginHorizontal:16,marginBottom:2,padding:12,borderRadius:13,color:C.ink,fontSize:14,minHeight:46},
  orderCard:{backgroundColor:C.paper,borderRadius:19,borderWidth:1,borderColor:C.line,padding:16,gap:8},
  inline:{flexDirection:'row',alignItems:'center',gap:10},
  orderNo:{fontSize:16,color:C.ink,fontWeight:'900'},
  customer:{fontSize:17,color:C.ink,fontWeight:'800'},
  money:{fontSize:20,color:C.brand,fontWeight:'900'},
  pill:{paddingVertical:7,paddingHorizontal:9,borderRadius:99},
  pillGrey:{backgroundColor:'#E9ECEB'},pillAction:{backgroundColor:'#E8F7EA'},pillPlain:{backgroundColor:'#F5EEDB'},
  pillText:{color:C.ink,fontSize:11,fontWeight:'800'},
  address:{color:C.sub,fontSize:13,lineHeight:18,marginTop:3},
  deliveryMeta:{color:C.sub,fontSize:12},
  codStrip:{backgroundColor:'#F7F0DE',padding:12,borderRadius:13,flexDirection:'row',justifyContent:'space-between',marginVertical:3},
  codText:{color:'#68512B',fontWeight:'700',fontSize:13},codAmount:{color:'#785021',fontWeight:'900'},
  detailsToggle:{paddingVertical:9,alignItems:'center'},
  detailsToggleText:{color:C.brand,fontWeight:'700',fontSize:12},
  infoCard:{padding:17,backgroundColor:C.paper,borderRadius:18,borderWidth:1,borderColor:C.line,gap:10},
  infoTitle:{fontSize:19,fontWeight:'900',color:C.ink,marginBottom:5},
  infoLine:{fontSize:14,lineHeight:23,color:C.sub},
  tabBar:{flexDirection:'row',borderTopWidth:1,borderColor:C.line,backgroundColor:C.paper,paddingBottom:Platform.OS==='ios'?26:12,paddingTop:10,paddingHorizontal:15,gap:8},
  tab:{flex:1,alignItems:'center',gap:4,paddingVertical:9,borderRadius:14},
  tabActive:{backgroundColor:C.mint},
  tabIcon:{fontSize:20},tabText:{fontSize:11,fontWeight:'700',color:C.sub},tabTextActive:{color:C.brand},
  empty:{alignItems:'center',justifyContent:'center',padding:45,gap:8},
  emptyTitle:{fontSize:17,color:C.ink,fontWeight:'900'},
  overlay:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,25,14,0.65)',justifyContent:'flex-end',zIndex:15},
  sheet:{backgroundColor:C.paper,borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,paddingBottom:Platform.OS==='ios'?42:26,gap:11,maxHeight:'90%'},
  sheetTitle:{fontSize:22,fontWeight:'900',color:C.ink},
  choice:{backgroundColor:C.bg,borderRadius:12,padding:12,borderWidth:1,borderColor:C.line,gap:4},
  choiceSelected:{borderColor:C.brand,backgroundColor:C.mint},
  cashConfirm:{padding:14,backgroundColor:'#FBF3E3',borderRadius:12,borderWidth:1,borderColor:'#F2DFB1'},
  cashConfirmed:{backgroundColor:C.mint,borderColor:'#ABD7B2'}
});
