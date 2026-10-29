const MASTER_VOLUME = 0.5;
const SILENCE = 0.0001;

export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function unlock() {
    try {
      if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          return;
        }
        context = new AudioContextClass();
        master = context.createGain();
        master.gain.value = MASTER_VOLUME;
        master.connect(context.destination);
        noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const samples = noiseBuffer.getChannelData(0);
        for (let index = 0; index < samples.length; index++) {
          samples[index] = Math.random() * 2 - 1;
        }
      }
      if (context.state === "suspended") {
        context.resume().catch((error) => console.warn("Audio resume failed", error));
      }
    } catch (error) {
      console.warn("Audio is unavailable", error);
      context = null;
    }
  }

  function isReady() {
    return context !== null && context.state === "running";
  }

  function envelope(startTime, duration, volume) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(SILENCE, startTime + duration);
    gain.connect(master);
    return gain;
  }

  function tone({ frequency, duration = 0.1, type = "square", volume = 0.15, slideTo = 0, delay = 0 }) {
    if (!isReady()) {
      return;
    }
    const startTime = context.currentTime + delay;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    if (slideTo > 0) {
      oscillator.frequency.exponentialRampToValueAtTime(slideTo, startTime + duration);
    }
    oscillator.connect(envelope(startTime, duration, volume));
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  }

  function noise({ duration = 0.2, volume = 0.1, delay = 0, highpass = 800 }) {
    if (!isReady()) {
      return;
    }
    const startTime = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = highpass;
    source.connect(filter).connect(envelope(startTime, duration, volume));
    source.start(startTime, Math.random() * 0.5, duration + 0.02);
  }

  return { unlock, tone, noise };
}
