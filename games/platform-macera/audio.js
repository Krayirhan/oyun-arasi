// Zıpkın: Volkana Yolculuk ses efektleri: tamamen WebAudio ile sentezlenir, dosya indirmez.
export function createAudio(isEnabled) {
  let ctx = null;
  let master = null;
  let noise = null;
  let lastPlayed = {};

  function ensure() {
    if (!isEnabled()) return null;
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch { return null; }
  }

  function tone({ type = 'square', from = 440, to = from, time = 0.1, gain = 0.2, delay = 0, curve = 'exp' }) {
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator(); const g = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency[curve === 'exp' ? 'exponentialRampToValueAtTime' : 'linearRampToValueAtTime'](Math.max(1, to), t0 + time);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + time);
    osc.connect(g); g.connect(master); osc.start(t0); osc.stop(t0 + time + 0.02);
  }

  function hiss({ time = 0.15, gain = 0.2, from = 1200, to = 400, q = 1, delay = 0, type = 'bandpass' }) {
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = noise;
    const filter = c.createBiquadFilter(); filter.type = type; filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t0); filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + time);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + time);
    src.connect(filter); filter.connect(g); g.connect(master); src.start(t0); src.stop(t0 + time + 0.02);
  }

  const SOUNDS = {
    jump: () => tone({ type: 'square', from: 280, to: 620, time: 0.09, gain: 0.07 }),
    walljump: () => { tone({ type: 'square', from: 360, to: 760, time: 0.09, gain: 0.07 }); hiss({ time: 0.06, gain: 0.08, from: 3000, to: 1500 }); },
    land: e => { const k = Math.min(1, (e.impact || 0) / 900); if (k < 0.2) return; hiss({ time: 0.07 + k * 0.05, gain: 0.08 + k * 0.1, from: 500, to: 120, type: 'lowpass' }); },
    dash: () => { hiss({ time: 0.2, gain: 0.25, from: 600, to: 3500, q: 1.5 }); tone({ type: 'sawtooth', from: 180, to: 90, time: 0.12, gain: 0.05 }); },
    refill: () => tone({ type: 'sine', from: 1200, to: 1500, time: 0.06, gain: 0.05 }),
    die: () => { tone({ type: 'sawtooth', from: 520, to: 70, time: 0.35, gain: 0.12 }); hiss({ time: 0.3, gain: 0.25, from: 2000, to: 200, type: 'lowpass' }); },
    respawn: () => { tone({ type: 'sine', from: 300, to: 900, time: 0.18, gain: 0.08 }); },
    gem: e => { const base = 880 * Math.pow(1.122, (e.count || 1) - 1); tone({ type: 'triangle', from: base, time: 0.09, gain: 0.14 }); tone({ type: 'triangle', from: base * 1.5, time: 0.16, gain: 0.12, delay: 0.07 }); tone({ type: 'sine', from: base * 2, time: 0.22, gain: 0.07, delay: 0.14 }); },
    checkpoint: () => [523, 659, 784].forEach((f, i) => tone({ type: 'triangle', from: f, time: 0.14, gain: 0.12, delay: i * 0.07 })),
    spring: () => { tone({ type: 'sine', from: 180, to: 980, time: 0.2, gain: 0.16 }); tone({ type: 'square', from: 90, to: 160, time: 0.08, gain: 0.05 }); },
    orb: () => { tone({ type: 'sine', from: 660, to: 1320, time: 0.12, gain: 0.12 }); tone({ type: 'triangle', from: 990, time: 0.12, gain: 0.08, delay: 0.05 }); },
    stomp: () => { tone({ type: 'square', from: 520, to: 180, time: 0.1, gain: 0.1 }); hiss({ time: 0.08, gain: 0.12, from: 900, to: 300 }); },
    crumble: () => hiss({ time: 0.12, gain: 0.08, from: 800, to: 300, q: 3 }),
    crumbled: () => hiss({ time: 0.22, gain: 0.14, from: 400, to: 80, type: 'lowpass' }),
    fire: e => { if (e.far) return; hiss({ time: 0.18, gain: 0.07, from: 300, to: 1200, q: 0.7 }); },
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: i === 4 ? 'triangle' : 'square', from: f, time: i === 4 ? 0.45 : 0.12, gain: i === 4 ? 0.12 : 0.07, delay: i * 0.08 })),
    click: () => tone({ type: 'triangle', from: 660, time: 0.05, gain: 0.06 })
  };

  function play(type, event = {}) {
    const fn = SOUNDS[type]; if (!fn || !isEnabled()) return;
    const now = performance.now();
    if (lastPlayed[type] && now - lastPlayed[type] < 35) return;
    lastPlayed[type] = now;
    try { fn(event); } catch { /* Ses isteğe bağlıdır. */ }
  }

  return {
    unlock: ensure,
    play,
    onEvents(events) { for (const e of events) play(e.type, e); }
  };
}
