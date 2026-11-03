import React from 'react';
import {ActivityIndicator,Image,View,Platform,useWindowDimensions} from 'react-native';
import {useFonts} from 'expo-font';
import NativeApp from './NativeApp';
const fonts={
  Roboto400:require('../../assets/fonts/roboto-400.ttf'),Roboto500:require('../../assets/fonts/roboto-500.ttf'),Roboto700:require('../../assets/fonts/roboto-700.ttf'),Roboto800:require('../../assets/fonts/roboto-800.ttf'),
  Bengali400:require('../../assets/fonts/noto-bengali-400.ttf'),Bengali500:require('../../assets/fonts/noto-bengali-500.ttf'),Bengali700:require('../../assets/fonts/noto-bengali-700.ttf'),Bengali800:require('../../assets/fonts/noto-bengali-800.ttf'),
};
export default function FontBootstrap(){const [loaded,error]=useFonts(fonts);const {height}=useWindowDimensions();if(!loaded&&!error)return <View style={{flex:1,backgroundColor:'#FCF8F3',justifyContent:'center',alignItems:'center',gap:20}}><Image source={require("../../assets/icon.png")} style={{width:83,height:83}}/><ActivityIndicator color="#803C55"/></View>;return Platform.OS==='web'?<View style={{height,maxHeight:height,width:'100%',overflow:'hidden'}}><NativeApp/></View>:<NativeApp/>;}
