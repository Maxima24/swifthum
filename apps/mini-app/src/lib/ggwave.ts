// Loads ggwave from CDN (matches teammate's spike approach — no build step needed).
// Falls back gracefully so the QR path remains usable if ggwave fails to load.

let factoryPromise: Promise<any> | null = null;
let instance: any = null;
let lib: any = null;

const SRC = 'https://unpkg.com/ggwave/ggwave.js';

declare global {
  interface Window {
    ggwave_factory?: () => Promise<any>;
  }
}

async function loadScript(): Promise<void> {
  if (window.ggwave_factory) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('ggwave script failed to load'));
    document.head.appendChild(s);
  });
}

export async function initGgwave(): Promise<boolean> {
  try {
    if (instance) return true;
    await loadScript();
    if (!factoryPromise) factoryPromise = window.ggwave_factory!();
    lib = await factoryPromise;
    const params = lib.getDefaultParameters();
    instance = lib.init(params);
    return true;
  } catch (e) {
    console.warn('[ggwave] init failed', e);
    return false;
  }
}

export function isReady(): boolean {
  return !!instance;
}

// volume is ggwave's 0–100 amplitude. 5–8 is plenty loud for short range
// and avoids the audible "ssss" artifact some speakers produce at the band edges.
export function encode(text: string, volume = 6): Float32Array | null {
  if (!instance || !lib) return null;
  try {
    return lib.encode(
      instance,
      text,
      lib.ProtocolId.GGWAVE_PROTOCOL_ULTRASOUND_NORMAL,
      volume,
    );
  } catch (e) {
    console.warn('[ggwave] encode failed', e);
    return null;
  }
}

export function decode(samples: Float32Array): string | null {
  if (!instance || !lib) return null;
  try {
    const out = lib.decode(instance, convertTypedArray(samples, Int8Array));
    if (!out) return null;
    return new TextDecoder().decode(out);
  } catch (e) {
    console.warn('[ggwave] decode failed', e);
    return null;
  }
}

// ggwave examples convert Float32Array to Int8Array before decoding
function convertTypedArray<T>(src: ArrayBufferView, Ctor: new (buf: ArrayBuffer) => T): T {
  const buffer = new ArrayBuffer(src.byteLength);
  new (src.constructor as any)(buffer).set(src as any);
  return new Ctor(buffer);
}

// Default playback gain ~0.35 — attenuates the chirp further so it doesn't
// pierce when the device volume is already high. ggwave decode tolerates this
// fine within ~6 ft.
export async function playSamples(
  samples: Float32Array,
  ctx?: AudioContext,
  gainValue = 0.35,
): Promise<void> {
  const audio = ctx ?? new AudioContext();
  const buf = audio.createBuffer(1, samples.length, audio.sampleRate);
  const copy = new Float32Array(samples.length);
  copy.set(samples);
  buf.copyToChannel(copy, 0);
  const src = audio.createBufferSource();
  src.buffer = buf;
  const gain = audio.createGain();
  gain.gain.value = gainValue;
  src.connect(gain).connect(audio.destination);
  return new Promise((resolve) => {
    src.onended = () => resolve();
    src.start();
  });
}

export interface MicListener {
  stop: () => void;
}

export async function startListening(onToken: (token: string) => void): Promise<MicListener> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    const samples = e.inputBuffer.getChannelData(0);
    const decoded = decode(samples);
    if (decoded) onToken(decoded);
  };
  src.connect(processor);
  processor.connect(ctx.destination);

  return {
    stop: () => {
      try {
        processor.disconnect();
        src.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
      } catch (e) {
        console.warn('[ggwave] stop failed', e);
      }
    },
  };
}
