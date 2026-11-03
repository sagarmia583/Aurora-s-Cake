import React from 'react';
import {Text as NativeText,TextInput as NativeTextInput,StyleSheet,type TextProps,type TextInputProps} from 'react-native';
const bengali=/[\u0980-\u09ff]/;
const weight=(value:unknown)=>{const n=value==='bold'?700:Number(value)||400;return n>=750?800:n>=600?700:n>=450?500:400;};
export function Text(props:TextProps){
  const w=weight(StyleSheet.flatten(props.style)?.fontWeight);
  const children=React.Children.map(props.children,child=>{
    if(typeof child!=='string'||!bengali.test(child))return child;
    return child.split(/([\u0980-\u09ff\u200c\u200d]+)/g).map((part,index)=>bengali.test(part)?<NativeText key={index} style={{fontFamily:'Bengali'+w}}>{part}</NativeText>:part);
  });
  return <NativeText {...props} style={[{flexShrink:1,minWidth:0},props.style,{fontFamily:'Roboto'+w,fontWeight:undefined}]}>{children}</NativeText>;
}
export function TextInput(props:TextInputProps & {ref?: React.Ref<React.ComponentRef<typeof NativeTextInput>>}){
  const w=weight(StyleSheet.flatten(props.style)?.fontWeight),hasBengali=bengali.test(String(props.value||props.placeholder||''));
  return <NativeTextInput {...props} style={[props.style,{fontFamily:(hasBengali?'Bengali':'Roboto')+w,fontWeight:undefined}]}/>;
}
