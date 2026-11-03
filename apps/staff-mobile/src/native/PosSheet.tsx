import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Linking,Platform,View} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Print from 'expo-print';
import {WebView} from 'react-native-webview';
import type {StaffOrder} from '../domain';
import {formatOrderNumber} from '../orderNumber';
import {type Catalog} from './model';
import {imageUrl} from './client';
import {receiptHtml,loadPrintLogo,DEFAULT_POS,validPosOptions,type PosOptions} from './posReceipt';
import {PRINT_LOGO} from './printAssets';
import {Text} from './typography';
import {Button,Chip,Sheet,T} from './ui';
import {resolveFacebookUrl,resolvePublicWebUrl} from '../receiptQr';
const KEY='aurora_native_pos_v1';
export function PosSheet({order,catalog,onClose,demo=false}:{order:StaffOrder;catalog:Catalog;onClose:()=>void;demo?:boolean}){
  const [options,setOptions]=useState<PosOptions>(DEFAULT_POS),[message,setMessage]=useState(''),[printing,setPrinting]=useState(false);
  const frame=useRef<HTMLIFrameElement|null>(null);
  const [logo,setLogo]=useState(PRINT_LOGO);
  useEffect(()=>{let alive=true;setLogo(PRINT_LOGO);void loadPrintLogo(imageUrl(catalog.settings.logo_url)).then(value=>{if(alive)setLogo(value)});return()=>{alive=false}},[catalog.settings.logo_url]);
  useEffect(()=>{let alive=true;if(Platform.OS!=='web')void SecureStore.getItemAsync(KEY).then(raw=>{if(raw&&alive){const value=JSON.parse(raw);if(validPosOptions(value))setOptions(value)}}).catch(()=>{});return()=>{alive=false}},[]);
  const update=(patch:Partial<PosOptions>)=>{const next={...options,...patch};setOptions(next);if(Platform.OS!=='web')void SecureStore.setItemAsync(KEY,JSON.stringify(next)).catch(()=>setMessage('Printer settings সংরক্ষণ হয়নি।'));};
  const html=useMemo(()=>receiptHtml(order,catalog,options,logo,demo),[order,catalog,options,logo,demo]);
  const openLink=(url:string)=>{
    if(url==='about:blank')return true;
    if(url===resolvePublicWebUrl(String(catalog.settings.website_url||''))||url===resolveFacebookUrl(String(catalog.settings.facebook_url||'')))
      void Linking.openURL(url).catch(()=>setMessage('Link could not be opened.'));
    return false;
  };
  const print=async()=>{if(printing)return;setPrinting(true);setMessage('');try{if(Platform.OS==='web'){if(!frame.current?.contentWindow)throw Error('Preview প্রস্তুত হচ্ছে।');frame.current.contentWindow.focus();frame.current.contentWindow.print();}else await Print.printAsync({html,width:Math.round((options.paper==='80mm'?80:58)*72/25.4),margins:{left:0,right:0,top:0,bottom:0}});setMessage('Print dialog-এ 80mm printer, scale 100% ও margin None বাছুন।');}catch(e){setMessage((e as Error).message);}finally{setPrinting(false)}};
  return <Sheet title={'POS · #'+formatOrderNumber(order.order_number)} subtitle="80mm USB / Wi-Fi" onClose={onClose} footer={<Button label="Printer বাছুন ও print করুন" busy={printing} onPress={()=>void print()}/>}>
    {demo && <Text style={T.eyebrow}>DEMO · নমুনা রসিদ</Text>}
    <Text style={T.sub}>কম্পিউটারে installed USB printer অথবা একই Wi-Fi-এর printer print dialog থেকে বাছুন। ফোনে printer-এর print service / AirPrint চালু থাকতে হবে।</Text>
    <Text style={T.h3}>Paper width</Text><View style={T.wrap}>{(['80mm','58mm'] as const).map(p=><Chip key={p} label={p} selected={options.paper===p} onPress={()=>update({paper:p})}/>)}</View>
    <Text style={T.h3}>কোন কপি?</Text><View style={T.wrap}>{([['customer','ক্যাশ মেমো'],['kitchen','Kitchen ticket'],['box','Box label']] as const).map(([value,label])=><Chip key={value} label={label} selected={options.template===value} onPress={()=>update({template:value})}/>)}</View>
    <View style={T.wrap}>{([1,2] as const).map(copies=><Chip key={copies} label={copies+' copy'} selected={options.copies===copies} onPress={()=>update({copies})}/>)}<Chip label="বড় লেখা" selected={options.font==='large'} onPress={()=>update({font:options.font==='large'?'normal':'large'})}/></View>
    {!!message&&<Text accessibilityRole="alert" style={T.sub}>{message}</Text>}
    <Text style={T.h3}>Receipt preview</Text><View style={{height:560,minWidth:0,width:'100%',backgroundColor:'white',borderRadius:12,overflow:'hidden'}}>{Platform.OS==='web'?React.createElement('iframe',{ref:frame,title:'POS receipt preview',srcDoc:html,style:{border:0,width:'100%',height:'100%'}}):<WebView originWhitelist={['*']} source={{html}} javaScriptEnabled={false} onShouldStartLoadWithRequest={({url})=>openLink(url)} style={{flex:1,backgroundColor:'white'}}/>}</View>
  </Sheet>;
}
