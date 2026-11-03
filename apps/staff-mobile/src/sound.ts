import { Platform, Vibration } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import {playNativeOrderSound,stopNativeOrderSound} from './nativeOrderSound';

const SOUND_ENABLED_KEY = 'aurora_staff_sound_enabled_v1';
let soundEnabledMemory = true;

// Initialize sound preference from SecureStore
SecureStore.getItemAsync(SOUND_ENABLED_KEY).then(val => {
  if (val !== null) {
    soundEnabledMemory = val !== 'false';
  }
}).catch(() => {});

export function isSoundAlertEnabled(): boolean {
  return soundEnabledMemory;
}

export async function setSoundAlertEnabled(enabled: boolean): Promise<void> {
  soundEnabledMemory = enabled;
  try {
    await SecureStore.setItemAsync(SOUND_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {}
}

/**
 * Web Audio API synthesizer for web platforms or environments with AudioContext.
 */
function playWebAudioChime(): void {
  try {
    const win = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AudioCtx = win.AudioContext || win.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Beep 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.7, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.26);

    // Beep 2: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now + 0.18);
    gain2.gain.setValueAtTime(0.85, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.56);

    // Beep 3: 1174.66 Hz (D6)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(1174.66, now + 0.38);
    gain3.gain.setValueAtTime(0.95, now + 0.38);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.38);
    osc3.stop(now + 0.86);
  } catch (err) {
    console.warn('Web Audio chime error:', err);
  }
}

/**
 * Stop any playing order alert sound and cancel vibration.
 */
export async function stopOrderAlertSound(): Promise<void> {
  if (Platform.OS === 'web') Vibration.cancel();
  else stopNativeOrderSound();
}

/**
 * Plays the kitchen/POS order notification chime and vibrates the phone.
 */
export async function playOrderAlertSound(force = false): Promise<void> {
  if (!force && !soundEnabledMemory) return;

  if (Platform.OS === 'web') {
    playWebAudioChime();
    return;
  }
  await playNativeOrderSound().catch(() => Vibration.vibrate([0, 450, 150, 450]));
}
