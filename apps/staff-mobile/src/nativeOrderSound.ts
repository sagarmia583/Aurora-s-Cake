import {createAudioPlayer,setAudioModeAsync,type AudioPlayer} from 'expo-audio';
import {Vibration} from 'react-native';
let player:AudioPlayer|null=null;
let preparing:Promise<void>|null=null;
let playbackGeneration=0;
let resourceGeneration=0;

// Android reports isLoaded=false on the player after a clip ends, but its
// playback status still reports a loaded clip that can be rewound and replayed.
function waitForAudio(active:AudioPlayer):Promise<void>{
  if(active.currentStatus.isLoaded)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{
      subscription.remove();
      reject(new Error('Notification sound could not load. Try Test sound again.'));
    },6000);
    const finish=(error?:Error)=>{
      clearTimeout(timeout);
      subscription.remove();
      if(error)reject(error);
      else resolve();
    };
    const subscription=active.addListener('playbackStatusUpdate',status=>{
      if(status.error)finish(new Error('Notification sound could not play. Try Test sound again.'));
      else if(status.isLoaded)finish();
    });
    // The player can finish loading between the first check and subscription.
    if(active.currentStatus.isLoaded)finish();
  });
}

export async function playNativeOrderSound():Promise<void> {
  const request=++playbackGeneration;
  const resources=resourceGeneration;
  if(!preparing)preparing=(async()=>{
    await setAudioModeAsync({playsInSilentMode:true,shouldPlayInBackground:false,
      shouldRouteThroughEarpiece:false,interruptionMode:'duckOthers'});
    if(resources!==resourceGeneration)throw new Error('Sound preparation cancelled.');
    player=createAudioPlayer(require('../assets/aurora_chime_v3.wav'));
    player.volume=1;
    await waitForAudio(player);
  })().catch(error=>{
    if(resources===resourceGeneration){player?.remove();player=null;preparing=null;}
    throw error;
  });
  try {
    await preparing;
    const active=player;
    if(request!==playbackGeneration||!active)return;
    await waitForAudio(active);
    if(request!==playbackGeneration)return;
    await active.seekTo(0);
    if(request!==playbackGeneration)return;
    active.volume=1;
    active.play();
    Vibration.vibrate([0,180,80,180]);
  }catch(error){
    if(request!==playbackGeneration)return;
    releaseNativeOrderSound();
    throw error;
  }
}
export function stopNativeOrderSound(){playbackGeneration++;player?.pause();Vibration.cancel();}
export function releaseNativeOrderSound(){resourceGeneration++;stopNativeOrderSound();player?.remove();player=null;preparing=null;}
