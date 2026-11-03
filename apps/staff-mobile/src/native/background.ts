import {Platform} from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import {randomUUID} from 'expo-crypto';
import {readBackgroundSession,getOrders,getCatalog,endpoint,request} from './client';
import {readRecord,writeRecord} from './secureRecords';
import {statusLabel,type StaffOrder,type StaffSession} from '../domain';
import {orderStageUpdates,orderStages,type StageSnapshot,type StageUpdate} from './orderStageUpdates';
const TASK='aurora-sheet-refresh-v1',CHANNEL='aurora-orders-chime-v3',KEY='aurora_background_seen_v2';
const CHIME='aurora_chime_v3.wav', PUSH_KEY='aurora_order_stage_push_v1';
type Seen={owner:string;origin:string;stages:StageSnapshot};
export const relevantOrder=(o:StaffOrder,s:StaffSession)=>['super_admin','admin','order_manager'].includes(s.role)?o.status==='pending':s.role==='kitchen_manager'?o.status==='confirmed':s.role==='delivery_manager'?o.status==='ready':s.role==='delivery_man'?o.status==='assigned'&&o.rider_id?.toLowerCase()===s.email.toLowerCase():false;
export async function rememberBackgroundOrders(orders:StaffOrder[],session:StaffSession){
  if(Platform.OS==='web')return;
  await writeRecord(SecureStore,KEY,{owner:session.email,origin:new URL(endpoint()).origin,stages:orderStages(orders)},randomUUID());
}
export async function notifyOrderStages(updates:StageUpdate[],sound:boolean){
  if(Platform.OS==='web'||!updates.length||!(await Notifications.getPermissionsAsync()).granted)return;
  await ensureOrderChannels();
  for(const update of updates){
    await Notifications.scheduleNotificationAsync({
      content:{title:'Aurora’s Cake · #'+update.number,body:statusLabel(update.status),sound:sound?CHIME:false,data:{screen:'orders',orderId:update.id}},
      trigger:{type:Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,seconds:1,channelId:sound?CHANNEL:CHANNEL+'-silent'}
    });
  }
}
async function ensureOrderChannels(){
  await Notifications.setNotificationChannelAsync(CHANNEL,{name:'Order updates · Aurora chime',importance:Notifications.AndroidImportance.HIGH,sound:CHIME,vibrationPattern:[0,230,100,230]});
  await Notifications.setNotificationChannelAsync(CHANNEL+'-silent',{name:'Order updates · muted',importance:Notifications.AndroidImportance.DEFAULT,sound:null});
}
if(Platform.OS!=='web'){
  Notifications.setNotificationHandler({handleNotification:async notification=>{
    const kind=notification.request.content.data?.kind;
    const remote=kind==='new_order_push'||kind==='order_stage_push';
    return {shouldPlaySound:!remote&&notification.request.content.sound!=null,
      shouldSetBadge:false,shouldShowBanner:!remote,shouldShowList:!remote};
  }});
  TaskManager.defineTask(TASK,async()=>{
    try{
      const auth=await readBackgroundSession();if(!auth)return BackgroundTask.BackgroundTaskResult.Success;
      const [orders]=await Promise.all([getOrders(auth.token),getCatalog()]);
      // A missing baseline never announces historical orders as new work.
      const before=await readRecord<Seen>(SecureStore,KEY);
      const current=JSON.parse(await SecureStore.getItemAsync('aurora_native_session_v2')||'null');
      if(current?.token!==auth.token)return BackgroundTask.BackgroundTaskResult.Success;
      const push=await SecureStore.getItemAsync(PUSH_KEY);
      const updates=before?.owner===auth.session.email&&before.origin===new URL(endpoint()).origin?orderStageUpdates(before.stages,orders):[];
      if(updates.length&&push!==auth.token.slice(-16)){
        const sound=(await SecureStore.getItemAsync('aurora_native_sound_v2'))!=='false';
        await notifyOrderStages(updates,sound);
      }
      await rememberBackgroundOrders(orders,auth.session);
      return BackgroundTask.BackgroundTaskResult.Success;
    }catch{return BackgroundTask.BackgroundTaskResult.Failed;}
  });
}
export async function enableBackgroundRefresh(){
  if(Platform.OS==='web')return 'Phone build-এ background refresh চালু হবে।';
  await ensureOrderChannels();
  let permission=await Notifications.getPermissionsAsync();
  if(!permission.granted)permission=await Notifications.requestPermissionsAsync();
  if(!await TaskManager.isAvailableAsync())return 'Background refresh-এর জন্য development/release build লাগবে।';
  if(await BackgroundTask.getStatusAsync()!==BackgroundTask.BackgroundTaskStatus.Available)return 'ফোনের Background App Refresh / battery setting চালু করুন।';
  if(!await TaskManager.isTaskRegisteredAsync(TASK))await BackgroundTask.registerTaskAsync(TASK,{minimumInterval:15});
  return permission.granted?'Background sync চালু · ফোনের সময়সূচিতে ১৫ মিনিট বা বেশি ব্যবধানে।':'Background sync চালু · alert-এর জন্য notification permission দিন।';
}
export async function stopBackgroundRefresh(){
  if(Platform.OS==='web')return;
  if(await TaskManager.isTaskRegisteredAsync(TASK))await BackgroundTask.unregisterTaskAsync(TASK);
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
  await SecureStore.deleteItemAsync(PUSH_KEY);
}
let pushRegistration=Promise.resolve('');
export function registerOrderPush(auth:{token:string;session:StaffSession},sound:boolean){
  const projectId=process.env.EXPO_PUBLIC_EAS_PROJECT_ID||Constants.easConfig?.projectId||Constants.expoConfig?.extra?.eas?.projectId;
  if(Platform.OS==='web'||!projectId||!/^[0-9a-f-]{72}$/i.test(auth.token))return Promise.resolve('');
  pushRegistration=pushRegistration.catch(()=> '').then(async()=>{
    await SecureStore.deleteItemAsync(PUSH_KEY);
    const permission=await Notifications.getPermissionsAsync();
    if(!permission.granted)return '';
    const {data:push_token}=await Notifications.getExpoPushTokenAsync({projectId});
    const active=await readBackgroundSession();
    if(active?.token!==auth.token)return '';
    const result=await request('staff_push_register',{push_token,sound,sound_version:3},auth.token);
    if(result.registered!==true)throw new Error('Push registration was not confirmed.');
    if(result.stage_notifications===true)await SecureStore.setItemAsync(PUSH_KEY,auth.token.slice(-16));
    return result.stage_notifications===true?'Order status push চালু।':'New order push চালু।';
  });
  return pushRegistration;
}
