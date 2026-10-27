// Native Google Sign-In requires separate iOS/Android OAuth registration.
// This config plugin is only enabled when the iOS OAuth client ID is supplied
// in the EAS build environment. Do not put OAuth client secrets in this file.
const base = require('./app.json').expo;
const iosId=process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID||'';
module.exports=()=>{
 const plugins=[...base.plugins];
 if(/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(iosId)){
   plugins.push(['@react-native-google-signin/google-signin',{
     iosUrlScheme:'com.googleusercontent.apps.'+iosId.replace('.apps.googleusercontent.com','')
   }]);
 }
 return {expo:{...base,plugins}};
};
