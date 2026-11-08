import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,BackHandler,Linking,Platform,Pressable,StatusBar,StyleSheet,Text,View} from 'react-native';
import {WebView,type WebViewMessageEvent} from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import * as Print from 'expo-print';
import {useKeepAwake} from 'expo-keep-awake';
import {playNativeOrderSound,stopNativeOrderSound,releaseNativeOrderSound} from './nativeOrderSound';
import {isStaffCredential,isWorkspaceNavigation,NATIVE_SESSION_KEY,nativeWorkspaceScript,restoredWorkspaceToken,staffWorkspaceUrl} from './workspace';
import {STAFF_PRODUCTION_OPERATIONS_URL} from './domain';

const workspace=staffWorkspaceUrl(process.env.EXPO_PUBLIC_OPERATIONS_URL||STAFF_PRODUCTION_OPERATIONS_URL,
  __DEV__?process.env.EXPO_PUBLIC_STAFF_WEB_URL:undefined,__DEV__);
const origin=new URL(workspace).origin;
const source={uri:workspace};

/** One staff workspace on web, Android and iOS: same permissions, forms and Sheets API. */
export function SharedStaffWorkspace() {
  useKeepAwake();
  const web=useRef<WebView<{}>>(null),canGoBack=useRef(false),printBusy=useRef(false);
  const sessionWrites=useRef<Promise<void>>(Promise.resolve());
  const [savedToken,setSavedToken]=useState<string|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [soundError,setSoundError]=useState('');
  const soundBusy=useRef(false);
  const appIsActive=useRef(AppState.currentState==='active');
  const testSound=async()=>{
    if(soundBusy.current)return;
    soundBusy.current=true;setSoundError('');
    try{await playNativeOrderSound();}
    catch{setSoundError('সাউন্ড বাজানো যায়নি। Media volume চালু করে Test sound চাপুন; নতুন app build প্রয়োজন হতে পারে।');}
    finally{soundBusy.current=false;}
  };
  useEffect(()=>{
    let alive=true;
    SecureStore.getItemAsync(NATIVE_SESSION_KEY)
      .then(raw=>{if(alive)setSavedToken(restoredWorkspaceToken(raw,origin));})
      .catch(()=>{if(alive)setSavedToken('');});
    const back=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(!canGoBack.current)return false;web.current?.goBack();return true;
    });
    const foreground=AppState.addEventListener('change',state=>{
      appIsActive.current=state==='active';
      if(state==='active')web.current?.injectJavaScript("window.dispatchEvent(new Event('focus'));true;");
      else stopNativeOrderSound();
    });
    return()=>{alive=false;back.remove();foreground.remove();releaseNativeOrderSound();};
  },[]);
  const onMessage=async(event:WebViewMessageEvent)=>{
    if(!isWorkspaceNavigation(event.nativeEvent.url,workspace))return;
    try {
      const message=JSON.parse(event.nativeEvent.data);
      if(message.type==='order_sound') {
        if(appIsActive.current)await testSound();
      } else if(message.type==='order_sound_stop') {
        stopNativeOrderSound();
      } else if(message.type==='staff_session') {
        if(message.token!==''&&!isStaffCredential(message.token))return;
        const nextToken:string=message.token;
        // A subsequent reload must inject the latest session, never the token
        // restored when the component first mounted. Serialize login/logout writes.
        setSavedToken(nextToken);
        const write=sessionWrites.current.catch(()=>{}).then(async()=>{
          if(!nextToken)await SecureStore.deleteItemAsync(NATIVE_SESSION_KEY);
          else await SecureStore.setItemAsync(NATIVE_SESSION_KEY,JSON.stringify({origin,token:nextToken}),
            {keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
        });
        sessionWrites.current=write;
        await write;
      } else if(message.type==='print'&&typeof message.html==='string'&&message.html.length<=2000000&&!printBusy.current) {
        printBusy.current=true;
        try {await Print.printAsync({html:message.html});} finally {printBusy.current=false;}
      }
    } catch {Alert.alert('Staff workspace','সেশন সংরক্ষণ বা প্রিন্ট সম্পন্ন হয়নি। আবার চেষ্টা করুন।');}
  };
  if(Platform.OS==='web')return <View style={styles.center}><Text>একই live staff panel ব্রাউজারে খুলুন।</Text>
    <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(workspace)}><Text style={styles.link}>Staff panel খুলুন</Text></Pressable></View>;
  return <View style={styles.root}>
    <StatusBar barStyle="dark-content"/>
    <View style={styles.toolbar}>
      <Text style={styles.title}>Staff workspace</Text>
      <Pressable accessibilityLabel="Test order notification sound" onPress={()=>void testSound()}><Text style={styles.link}>Test sound</Text></Pressable>
      <Pressable accessibilityLabel="Refresh live staff data" onPress={()=>{
        setError('');web.current?.reload();
      }}><Text style={styles.link}>রিফ্রেশ</Text></Pressable>
    </View>
    {!!soundError&&<Text accessibilityRole="alert" style={styles.error}>{soundError}</Text>}
    {savedToken!==null&&<WebView<{}> ref={web} source={source} style={styles.web}
      originWhitelist={['*']} javaScriptEnabled domStorageEnabled mixedContentMode="never"
      allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
      injectedJavaScriptBeforeContentLoaded={nativeWorkspaceScript(savedToken)}
      injectedJavaScript={nativeWorkspaceScript('')} onMessage={event=>void onMessage(event)}
      onShouldStartLoadWithRequest={request=>{
        if(request.url==='about:blank'||isWorkspaceNavigation(request.url,workspace))return true;
        if(request.isTopFrame===false)return true;
        Alert.alert('বাইরের লিংক','ব্রাউজারে এই লিংক খুলবেন?',[
          {text:'বাতিল',style:'cancel'},
          {text:'খুলুন',onPress:()=>{
            if(/^(https:\/\/|tel:|mailto:)/i.test(request.url))void Linking.openURL(request.url);
          }},
        ]);return false;
      }}
      onNavigationStateChange={state=>{canGoBack.current=state.canGoBack;}}
      onLoadStart={()=>{setLoading(true);setError('');}} onLoadEnd={()=>setLoading(false)}
      onError={()=>{setLoading(false);setError('Live staff panel লোড হয়নি। ইন্টারনেট ও ওয়েবসাইট সংযোগ পরীক্ষা করুন।');}}
      onHttpError={event=>{if(event.nativeEvent.url===workspace&&event.nativeEvent.statusCode>=400)setError('Staff panel HTTP '+event.nativeEvent.statusCode);}}
      setSupportMultipleWindows={false}
    />}
    {(loading||savedToken===null)&&!error&&<View style={styles.loading}><ActivityIndicator size="large" color="#174b3b"/><Text>Live staff panel লোড হচ্ছে…</Text></View>}
    {!!error&&<View style={styles.error}><Text accessibilityRole="alert">{error}</Text><Text>রিফ্রেশ করে আবার চেষ্টা করুন।</Text></View>}
  </View>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:'#f5f7f3',paddingTop:Platform.OS==='android'?(StatusBar.currentHeight||0):44},
  toolbar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:14},
  title:{fontSize:16,fontWeight:'700',color:'#174b3b'},link:{color:'#174b3b',fontWeight:'700',padding:8},
  web:{flex:1,backgroundColor:'#f5f7f3'},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12},
  loading:{position:'absolute',top:'40%',alignSelf:'center',alignItems:'center',gap:12,backgroundColor:'#f5f7f3',padding:20,borderRadius:16},
  error:{padding:20,backgroundColor:'#fff0e8',gap:10},
});
