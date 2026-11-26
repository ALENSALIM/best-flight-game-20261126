// Ridge Runner: all sound is synthesised with WebAudio — an engine drone
// whose pitch follows the throttle, wind that rises with speed, a chime for
// each ring, a thud for touchdown and a low thump for a crash. No audio
// files, no network. Everything is guarded so the game plays silently when
// the browser will not start audio (headless screenshots included).
export function createAudio() {
  let ctx = null, engineOsc = null, engineOsc2 = null, engineGain = null;
  let windSrc = null, windGain = null, windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: two detuned saws through a low-pass, gain follows throttle.
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420; filt.Q.value = 1.2;
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 52;
      engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square'; engineOsc2.frequency.value = 26;
      const g2 = ctx.createGain(); g2.gain.value = 0.5;
      engineOsc.connect(filt); engineOsc2.connect(g2); g2.connect(filt);
      filt.connect(engineGain); engineGain.connect(ctx.destination);
      engineOsc.start(); engineOsc2.start();
      // Wind: looped noise through a band-pass, gain follows airspeed.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource(); windSrc.buffer = buf; windSrc.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass'; windFilter.frequency.value = 600; windFilter.Q.value = 0.6;
      windGain = ctx.createGain(); windGain.gain.value = 0;
      windSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(ctx.destination);
      windSrc.start();
      started = true;
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, when, dur, type, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(when); o.stop(when + dur + 0.05);
  }

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    setMuted(m) {
      muted = m;
      if (ctx && engineGain) engineGain.gain.value = muted ? 0 : engineGain.gain.value;
    },
    isMuted() { return muted; },
    update(throttle, speedKts, onGround) {
      if (!ctx || muted || !started) return;
      if (ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const rpm = 46 + throttle * 64 + (onGround ? 0 : 6);
      engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(rpm / 2, t, 0.08);
      engineGain.gain.setTargetAtTime(0.028 + throttle * 0.05, t, 0.1);
      const wind = Math.max(0, (speedKts - 30) / 160);
      windGain.gain.setTargetAtTime(wind * 0.06, t, 0.15);
      windFilter.frequency.setTargetAtTime(380 + speedKts * 6, t, 0.2);
    },
    ring() {
      if (!ensure() || muted || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      blip(880, t, 0.35, 'sine', 0.22);
      blip(1318.5, t + 0.09, 0.45, 'sine', 0.18);
    },
    land() {
      if (!ensure() || muted || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      blip(196, t, 0.25, 'sine', 0.3);
      blip(98, t + 0.05, 0.4, 'sine', 0.25);
    },
    crash() {
      if (!ensure() || muted || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      blip(70, t, 0.7, 'sine', 0.4);
      blip(49, t + 0.08, 0.8, 'triangle', 0.3);
    },
    click() {
      if (!ensure() || muted || ctx.state !== 'running') return;
      blip(1200, ctx.currentTime, 0.06, 'sine', 0.1);
    },
  };
}
