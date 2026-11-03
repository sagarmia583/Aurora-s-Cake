/**
 * High-Loudness Order Notification Sound Service
 * Synthesizes high-frequency, penetrating, crystal-clear kitchen & POS order chimes.
 * Automatically enabled by default (Auto ON) with instant browser gesture-unlock.
 */

const BEEP_STORAGE_KEY = 'aurora_order_beep_enabled_v2';
const LEGACY_BEEP_STORAGE_KEY = 'aurora_order_beep_enabled_v1';

let globalAudioContext: AudioContext | null = null;
let gestureListenerRegistered = false;
let memoryBeepPreference: boolean | null = null;

/**
 * Checks whether order notification sound is enabled.
 * Defaults to TRUE (Auto ON) unless explicitly toggled off by staff.
 */
export function isOrderBeepEnabled(): boolean {
  if (memoryBeepPreference !== null) {
    return memoryBeepPreference;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(BEEP_STORAGE_KEY);
      if (val !== null) return val !== 'false';
      // Fallback check legacy key if user previously set it explicitly
      const legacyVal = localStorage.getItem(LEGACY_BEEP_STORAGE_KEY);
      if (legacyVal === 'false') {
        // If legacy was disabled, respect it initially
        return false;
      }
    }
  } catch {
    // localStorage unavailable or restricted
  }
  return true;
}

/**
 * Persists the staff's preference for order notification sound.
 */
export function setOrderBeepEnabled(enabled: boolean): void {
  memoryBeepPreference = enabled;
  if (!enabled) {
    stopOrderAlertLoop();
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const val = enabled ? 'true' : 'false';
      localStorage.setItem(BEEP_STORAGE_KEY, val);
      localStorage.setItem(LEGACY_BEEP_STORAGE_KEY, val);
    }
  } catch {
    // localStorage unavailable
  }
}

/**
 * Safely initializes or returns the global AudioContext singleton.
 * Automatically hooks into user interaction gestures to auto-resume on the very first touch/click.
 */
export function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) return null;

  if (!globalAudioContext || globalAudioContext.state === 'closed') {
    try {
      globalAudioContext = new AudioContextClass();
    } catch {
      return null;
    }
  }

  // Register one-time interaction listeners so browser autoplay restrictions are unlocked instantly
  if (!gestureListenerRegistered && typeof window.addEventListener === 'function') {
    gestureListenerRegistered = true;
    const unlock = () => {
      if (globalAudioContext && globalAudioContext.state === 'suspended') {
        globalAudioContext.resume().catch(() => {});
      }
    };
    ['pointerdown', 'touchstart', 'click', 'keydown', 'scroll'].forEach((evt) => {
      window.addEventListener(evt, unlock, { capture: true, passive: true });
    });
  }

  if (globalAudioContext.state === 'suspended') {
    globalAudioContext.resume().catch(() => {});
  }

  return globalAudioContext;
}

/**
 * Synthesizes a loud, high-piercing bell note with primary body and sparkling overtone.
 * Features a rapid strike attack and acoustic sustain for high kitchen penetration.
 */
function playChimeNote(
  ctx: AudioContext,
  dest: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number,
  options?: { sustain?: number; overtoneRatio?: number }
) {
  try {
    const sustain = options?.sustain ?? 0.04;
    const overtoneRatio = options?.overtoneRatio ?? 2;

    // 1. Primary body: Rich triangle wave gives strong fundamental sound pressure
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(frequency, startTime);

    gain1.gain.setValueAtTime(0.0001, startTime);
    // Fast strike attack (3ms)
    gain1.gain.linearRampToValueAtTime(volume * 0.85, startTime + 0.003);
    // Acoustic sustain hold for high perceived loudness
    gain1.gain.setValueAtTime(volume * 0.85, startTime + sustain);
    // Ringing decay
    gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc1.connect(gain1);
    gain1.connect(dest);
    osc1.start(startTime);
    osc1.stop(startTime + duration + 0.05);

    // 2. High crystal piercing harmonic (Sine wave 1 octave higher)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(frequency * overtoneRatio, startTime);

    gain2.gain.setValueAtTime(0.0001, startTime);
    gain2.gain.linearRampToValueAtTime(volume * 0.50, startTime + 0.002);
    gain2.gain.setValueAtTime(volume * 0.45, startTime + sustain * 0.7);
    gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.85);

    osc2.connect(gain2);
    gain2.connect(dest);
    osc2.start(startTime);
    osc2.stop(startTime + duration * 0.85 + 0.05);

    // 3. Ultra-high shimmer ping for top chime notes
    if (frequency >= 2300) {
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(frequency * 1.5, startTime);

      gain3.gain.setValueAtTime(0.0001, startTime);
      gain3.gain.linearRampToValueAtTime(volume * 0.28, startTime + 0.002);
      gain3.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.6);

      osc3.connect(gain3);
      gain3.connect(dest);
      osc3.start(startTime);
      osc3.stop(startTime + duration * 0.6 + 0.05);
    }
  } catch {
    // Graceful catch for any edge-case browser audio limitation
  }
}

/**
 * Plays a loud, high-frequency, energetic kitchen & POS order alert chime.
 * Rhythmic structure:
 *  - Stage 1: High Double-Chime attention grabber (D7 2349Hz -> G7 3136Hz)
 *  - Stage 2: Ascending High POS Fanfare (C7 2093Hz -> E7 2637Hz -> G7 3136Hz -> High C8 4186Hz crystal ring)
 * Includes dynamics compression and boosted master gain for high audibility across mobile & laptop speakers.
 *
 * @param force If true, plays even if currently muted in settings (e.g. for user testing).
 */
export async function playOrderAlertSound(force = false): Promise<boolean> {
  if (!force && !isOrderBeepEnabled()) {
    return false;
  }

  // Native playback is independent of WebView autoplay/AudioContext policies.
  const native=typeof window!=='undefined'?(window as Window & {ReactNativeWebView?:{postMessage:(value:string)=>void}}).ReactNativeWebView:undefined;
  if(native){native.postMessage(JSON.stringify({type:'order_sound',force}));return true;}

  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    const t = ctx.currentTime + 0.02;
    const peakVolume = 1.0;

    // Use Dynamics Compressor to prevent clipping while maximizing acoustic punch
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-8, t);
    compressor.knee.setValueAtTime(12, t);
    compressor.ratio.setValueAtTime(12, t);
    compressor.attack.setValueAtTime(0.002, t);
    compressor.release.setValueAtTime(0.15, t);

    // Boosted master gain node for high audio output
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.15, t);

    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Part 1: High Attention Double-Ping (Ding-Ding!)
    // Note 1: D7 (2349.3 Hz)
    playChimeNote(ctx, compressor, 2349.3, t, 0.14, peakVolume * 0.92, { sustain: 0.04 });

    // Note 2: G7 (3135.9 Hz)
    playChimeNote(ctx, compressor, 3135.9, t + 0.12, 0.16, peakVolume, { sustain: 0.05 });

    // Part 2: Upbeat High POS Order Fanfare (Ascending high chimes)
    // Note 3: C7 (2093.0 Hz)
    playChimeNote(ctx, compressor, 2093.0, t + 0.34, 0.15, peakVolume * 0.90, { sustain: 0.04 });

    // Note 4: E7 (2637.0 Hz)
    playChimeNote(ctx, compressor, 2637.0, t + 0.46, 0.15, peakVolume * 0.95, { sustain: 0.04 });

    // Note 5: G7 (3135.9 Hz)
    playChimeNote(ctx, compressor, 3135.9, t + 0.58, 0.16, peakVolume, { sustain: 0.05 });

    // Note 6: High Grand Bell C8 (4186.0 Hz) - Crystal High Ring
    playChimeNote(ctx, compressor, 4186.0, t + 0.72, 0.75, peakVolume, { sustain: 0.08 });

    return true;
  } catch {
    return false;
  }
}

/**
 * Triggers a test of the high order notification sound (single play, does not loop).
 */
export async function testOrderAlertSound(): Promise<boolean> {
  return playOrderAlertSound(true);
}

// ---------------------------------------------------------------------------
// Continuous Alert Loop (Loops persistently until order is clicked/acknowledged)
// ---------------------------------------------------------------------------

let loopIntervalId: ReturnType<typeof setInterval> | null = null;
const activeLoopOrderIds = new Set<string>();
const loopListeners = new Set<(isLooping: boolean, orderIds: string[]) => void>();

/**
 * Returns whether an order alert loop is actively ringing.
 */
export function isOrderAlertLooping(): boolean {
  return loopIntervalId !== null;
}

/**
 * Returns list of order IDs that are currently unacknowledged and keeping the sound looping.
 */
export function getActiveAlertOrderIds(): string[] {
  return Array.from(activeLoopOrderIds);
}

/**
 * Subscribes to changes in order alert looping state.
 */
export function subscribeOrderAlertLoop(cb: (isLooping: boolean, orderIds: string[]) => void): () => void {
  loopListeners.add(cb);
  cb(isOrderAlertLooping(), getActiveAlertOrderIds());
  return () => {
    loopListeners.delete(cb);
  };
}

function notifyLoopListeners(): void {
  const isLooping = isOrderAlertLooping();
  const ids = getActiveAlertOrderIds();
  loopListeners.forEach((cb) => {
    try {
      cb(isLooping, ids);
    } catch {
      // ignore
    }
  });
}

/**
 * Starts continuous order alert ringing in a loop until explicitly acknowledged/clicked.
 * Plays the loud chime immediately, then repeats every 3.8s until silenced.
 *
 * @param orderId Optional ID of the new order being alerted.
 * @param force If true, bypasses isOrderBeepEnabled() check.
 */
export function startOrderAlertLoop(orderId?: string, force = false): void {
  if (!force && !isOrderBeepEnabled()) {
    return;
  }

  if (orderId) {
    activeLoopOrderIds.add(orderId);
  }

  // Play chime immediately
  void playOrderAlertSound(force);

  if (loopIntervalId !== null) {
    notifyLoopListeners();
    return;
  }

  // Repeating POS order alarm: repeats every 3.8 seconds until staff acknowledges
  loopIntervalId = setInterval(() => {
    if (!isOrderBeepEnabled() || (activeLoopOrderIds.size === 0 && !orderId)) {
      stopOrderAlertLoop();
      return;
    }
    void playOrderAlertSound(false);
  }, 3800);

  notifyLoopListeners();
}

/**
 * Acknowledges an order.
 * If orderId is given, removes that order from the unacknowledged alarm set.
 * If no more unacknowledged orders remain (or if no orderId passed), stops the alarm loop!
 */
export function acknowledgeOrderAlert(orderId?: string): void {
  if (orderId) {
    activeLoopOrderIds.delete(orderId);
  } else {
    activeLoopOrderIds.clear();
  }

  if (activeLoopOrderIds.size === 0 || !orderId) {
    stopOrderAlertLoop();
  } else {
    notifyLoopListeners();
  }
}

/**
 * Stops any ongoing order alert loop immediately.
 */
export function stopOrderAlertLoop(): void {
  if(typeof window!=='undefined'){
    (window as Window & {ReactNativeWebView?:{postMessage:(value:string)=>void}}).ReactNativeWebView?.postMessage(JSON.stringify({type:'order_sound_stop'}));
  }
  if (loopIntervalId !== null) {
    clearInterval(loopIntervalId);
    loopIntervalId = null;
  }
  activeLoopOrderIds.clear();
  notifyLoopListeners();
}
