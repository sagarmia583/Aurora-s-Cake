import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {Platform} from 'react-native';
// The WEB OAuth client ID must be the same audience verified by Apps Script.
const WEB_CLIENT=process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID||
  '246617121730-fssfp59nlinltkfq0rccuud74rfpccum.apps.googleusercontent.com';
const IOS_CLIENT=process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
let configured=false,cache:{token:string;time:number}|null=null;
function configure(){
  if(configured)return;
  if(Platform.OS==='ios'&&!IOS_CLIENT)
    throw new Error('Owner Google login requires EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID and a native rebuild.');
  GoogleSignin.configure({webClientId:WEB_CLIENT,...(Platform.OS==='ios'?{iosClientId:IOS_CLIENT}:{})});
  configured=true;
}
function resultToken(response:{type:string;data?:{idToken?:string|null}|null}):string{
  const token=response.type==='success'?response.data?.idToken:'';
  if(!token||token.length<100)throw new Error('Google did not return an owner ID token. Check OAuth settings.');
  cache={token,time:Date.now()};
  return token;
}
export async function ownerGoogleSignIn():Promise<string>{
  configure();
  if(Platform.OS==='android')await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog:true});
  return resultToken(await GoogleSignin.signIn());
}
export async function ownerGoogleRestore():Promise<string>{
  configure();
  return resultToken(await GoogleSignin.signInSilently());
}
export async function ownerGoogleRefresh():Promise<string>{
  if(cache&&Date.now()-cache.time<10*60*1000)return cache.token;
  return ownerGoogleRestore();
}
export async function ownerGoogleSignOut():Promise<void>{
  cache=null;
  try{configure();await GoogleSignin.signOut();}catch{/* SecureStore marker still cleared. */}
}
