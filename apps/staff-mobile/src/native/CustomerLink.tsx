import {formatOrderNumber} from '../orderNumber';
import React,{useEffect,useState} from 'react';
import {Linking,Share,View} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {Text} from './typography';
import {request} from './client';
import {Button,C,T} from './ui';
const base='https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec';
export function validCustomerUrl(value:unknown):value is string {try{if(typeof value!=='string')return false;const u=new URL(value);return u.origin+u.pathname===base&&u.searchParams.get('action')==='receipt'&&/^ord_[0-9a-f-]{36}$/i.test(u.searchParams.get('ref')||'')&&/^[0-9a-f-]{72}$/i.test(u.searchParams.get('access')||'')&&!u.username&&!u.password&&!u.hash;}catch{return false;}}
export function CustomerLink({token,orderId,orderNumber,initialUrl,preview=false,autoCreate=false}:{token:string;orderId:string;orderNumber:string;initialUrl?:string;preview?:boolean;autoCreate?:boolean}){
  const [url,setUrl]=useState(initialUrl&&validCustomerUrl(initialUrl)?initialUrl:''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const revoke=async()=>{
    setBusy(true);setMessage('');
    try{
      const result=await request('staff_order_link',{order_id:orderId,revoke:true},token);
      if(result.order_id!==orderId||result.revoked!==true)throw new Error('Link বাতিল হয়েছে কি না যাচাই হয়নি।');
      setUrl('');setMessage('পুরোনো link বাতিল হয়েছে।');
    }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  };
  const make=async()=>{if(preview){setUrl('http://localhost:3000/?order-preview=1');return;}setBusy(true);setMessage('');try{const d=await request('staff_order_link',{order_id:orderId},token);if(d.order_id!==orderId||!validCustomerUrl(d.share_url))throw new Error('Customer link যাচাই হয়নি।');setUrl(d.share_url);}catch(e){setMessage('Link তৈরি হয়নি: '+(e as Error).message);}finally{setBusy(false);}};
  useEffect(()=>{let alive=true;setUrl(initialUrl&&validCustomerUrl(initialUrl)?initialUrl:'');if(preview){if(autoCreate)setUrl('http://localhost:3000/?order-preview=1');return;}if(autoCreate&&!initialUrl){setBusy(true);void request('staff_order_link',{order_id:orderId},token).then(d=>{if(d.order_id!==orderId||!validCustomerUrl(d.share_url))throw new Error('Link যাচাই হয়নি।');if(alive)setUrl(d.share_url);}).catch(e=>{if(alive)setMessage('Link তৈরি হয়নি: '+e.message);}).finally(()=>{if(alive)setBusy(false);});}return()=>{alive=false;};},[token,orderId,initialUrl,autoCreate,preview]);
  return <View style={[T.card,{backgroundColor:C.mint}]}><Text style={T.eyebrow}>CUSTOMER ORDER LINK</Text><Text style={T.h2}>Customer-এর জন্য, যত্নসহ</Text><Text style={T.sub}>সব items, লেখা, delivery, discount, payment ও status দেখা যাবে। Link শুধু customer-কে পাঠান।</Text>{url?<><Text selectable style={T.tiny}>{url}</Text><View style={T.row}><Button label="Copy link" kind="ghost" disabled={preview} style={{flex:1}} onPress={()=>void Clipboard.setStringAsync(url).then(()=>setMessage('Link copy হয়েছে।')).catch(()=>setMessage('Link copy হয়নি।'))}/><Button label="Link পাঠান ↗" disabled={preview} style={{flex:1}} onPress={()=>void Share.share({message:'আপনার Aurora’s Cake order '+formatOrderNumber(orderNumber)+'-এর বিস্তারিত:\n'+url}).catch(()=>setMessage('Share করা হয়নি।'))}/></View><Button label={preview?'Customer view preview':'Customer view খুলুন'} kind="ghost" onPress={()=>void Linking.openURL(url)}/></>:<Button label={busy?'Link তৈরি হচ্ছে…':'Customer link তৈরি করুন'} busy={busy} onPress={()=>void make()}/>}{url&&!preview&&<Button label="Link বাতিল করুন" kind="ghost" busy={busy} onPress={()=>void revoke()}/>}<Text style={T.tiny}>Link তৈরির পর ৩০ দিন ব্যবহার করা যাবে।</Text>{!!message&&<Text accessibilityRole="alert" style={T.sub}>{message}</Text>}</View>;
}
