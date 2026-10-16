// 合成音频：钢琴 / 钟琴音色，每画一笔奏出旋律的下一个音；季节氛围配乐
(function () {
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  // 各季调式（五声音阶，MIDI 根音）
  const KEYS = {
    title: { root: 62, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]] },
    spring: { root: 62, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7, 11], [5, 9, 12, 16], [9, 12, 16, 19], [7, 11, 14, 18]] },
    summer: { root: 65, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7, 14], [-3, 0, 4, 7], [5, 9, 12, 16], [7, 11, 14, 17]] },
    autumn: { root: 57, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-7, -3, 0, 5]] },
    winter: { root: 64, scale: [0, 2, 3, 7, 10], chords: [[0, 3, 7, 14], [-4, 0, 3, 7], [-7, -3, 0, 5], [-2, 2, 5, 10]] },
  };

  let ctx = null, out, verb, pianoBus, bellBus, padBus, noiseBuf, on = true;
  let key = KEYS.title, music = { next: 0, bar: 0, timer: 0 };

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    out = ctx.createGain(); out.gain.value = on ? 1 : 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
    out.connect(comp); comp.connect(ctx.destination);
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.55; verb.connect(wet); wet.connect(out);
    const bus = (send, dry, lpf) => {
      const g = ctx.createGain(), s = ctx.createGain(), d = ctx.createGain();
      s.gain.value = send; d.gain.value = dry;
      let head = g;
      if (lpf) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpf; f.Q.value = 0.3; g.connect(f); head = f; }
      head.connect(d); d.connect(out); head.connect(s); s.connect(verb);
      return g;
    };
    pianoBus = bus(0.9, 0.8, 4200);
    bellBus = bus(1.1, 0.5, 7000);
    padBus = bus(1, 0.5, 1400);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function osc(dest, type, f, t, dur, vol, attack = 0.004, pan = 0, detune = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    env(g, t, vol, attack, dur);
    o.connect(g);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest); } else g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function piano(m, t, vol = 0.06, dur = 3, pan = 0) {
    const f = mtof(m), dk = Math.max(0.6, dur * Math.pow(220 / f, 0.35));
    [[1, 1], [2, 0.42], [3, 0.2], [4, 0.09], [5, 0.05], [6, 0.025]].forEach(([k, a]) => {
      const fk = f * k * Math.sqrt(1 + 0.0004 * k * k);
      if (fk < 9000) osc(pianoBus, 'sine', fk, t, dk / Math.pow(k, 0.6), vol * a, 0.003, pan);
    });
    const n = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuf; flt.type = 'bandpass'; flt.frequency.value = Math.min(6000, f * 3); flt.Q.value = 1.5;
    env(g, t, vol * 0.15, 0.002, 0.03); n.connect(flt); flt.connect(g); g.connect(pianoBus); n.start(t); n.stop(t + 0.06);
  }
  function bell(m, t, vol = 0.04, decay = 2.6, pan = 0) {
    const f = mtof(m);
    [[1, 1], [2.76, 0.32], [5.4, 0.12], [8.93, 0.05]].forEach(([k, a]) => osc(bellBus, 'sine', f * k, t, decay / Math.sqrt(k), vol * a, 0.002, pan));
  }
  function pad(notes, t, dur, vol = 0.018) {
    notes.forEach((m, i) => { for (const dt of [-6, 6]) osc(padBus, i % 2 ? 'sine' : 'triangle', mtof(m), t, dur, vol, dur * 0.35, (i - 1.5) * 0.3, dt); });
  }

  // 五声音阶第 i 级（可跨八度）
  const deg = i => { const s = key.scale, o = Math.floor(i / s.length), r = ((i % s.length) + s.length) % s.length; return key.root + o * 12 + s[r]; };

  // 每关一条旋律：随机游走，逐渐往高处走
  let melody = [];
  function makeMelody(seed, n) {
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    melody = [];
    let p = 0;
    for (let i = 0; i < n; i++) {
      const target = Math.round((i / Math.max(1, n - 1)) * 6);
      const step = [-2, -1, -1, 1, 1, 2][(r() * 6) | 0] + Math.sign(target - p) * (r() < 0.5 ? 1 : 0);
      p = Math.max(-2, Math.min(9, p + step));
      melody.push(p);
    }
  }

  const A = {
    get on() { return on; },
    unlock() {
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume();
    },
    setOn(v) {
      on = v;
      if (ctx) out.gain.setTargetAtTime(v ? 1 : 0, ctx.currentTime, 0.1);
    },
    setKey(k) { key = KEYS[k] || KEYS.title; },
    level(seed, n) { makeMelody(seed, n); },
    // 第 i 笔（i 从 0 开始）
    stroke(i, pan = 0) {
      if (!ctx || !on) return;
      const t = ctx.currentTime + 0.01, m = deg(melody[Math.min(i, melody.length - 1)] ?? 0) + 12;
      piano(m, t, 0.07, 2.6, pan);
      bell(m + 12, t + 0.01, 0.012, 1.6, -pan);
    },
    start(pan = 0) { if (!ctx || !on) return; const t = ctx.currentTime + 0.01; bell(deg(0) + 12, t, 0.035, 2.4, pan); },
    portal() {
      if (!ctx || !on) return;
      const t = ctx.currentTime + 0.01;
      [0, 2, 4, 5, 7].forEach((d, i) => bell(deg(d) + 24, t + i * 0.035, 0.02, 1.4, -0.6 + i * 0.3));
    },
    stuck() {
      if (!ctx || !on) return;
      const t = ctx.currentTime + 0.01;
      piano(key.root - 12, t, 0.05, 2); piano(key.root - 11, t + 0.02, 0.035, 1.6);
    },
    undo() { if (!ctx || !on) return; const t = ctx.currentTime + 0.01; bell(deg(2) + 12, t, 0.018, 0.8); bell(deg(0) + 12, t + 0.07, 0.015, 0.8); },
    tap() { if (!ctx || !on) return; bell(deg(4) + 24, ctx.currentTime + 0.01, 0.012, 0.5); },
    hint() { if (!ctx || !on) return; const t = ctx.currentTime + 0.01; bell(deg(3) + 24, t, 0.02, 1.2); bell(deg(5) + 24, t + 0.12, 0.02, 1.4); },
    win() {
      if (!ctx || !on) return;
      const t = ctx.currentTime + 0.05, c = key.chords[0];
      c.forEach((d, i) => piano(key.root + d, t + i * 0.09, 0.06, 4, -0.4 + i * 0.25));
      [0, 1, 2, 3, 4, 5, 7, 9].forEach((d, i) => bell(deg(d) + 24, t + 0.4 + i * 0.07, 0.022, 2.2, -0.6 + i * 0.17));
      pad(c.map(d => key.root + d - 12), t, 5, 0.02);
    },
    // 背景氛围：每 8 拍换和弦，偶尔飘过几个钢琴音
    tick() {
      if (!ctx || !on || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (music.next < now - 1) music.next = now + 0.2;
      while (music.next < now + 0.5) {
        const t = music.next, ch = key.chords[music.bar % key.chords.length];
        pad(ch.map(d => key.root + d - 12), t, 9.5, 0.011);
        piano(key.root + ch[0] - 24, t, 0.03, 5);
        for (let k = 0; k < 3; k++) if (Math.random() < 0.55) {
          const d = ch[(Math.random() * ch.length) | 0] + (Math.random() < 0.5 ? 12 : 24);
          piano(key.root + d, t + 1 + k * 2.4 + Math.random() * 0.6, 0.016 + Math.random() * 0.01, 3, (Math.random() - 0.5) * 0.8);
        }
        music.next += 8; music.bar++;
      }
    },
  };
  window.Audio2 = A;
})();
