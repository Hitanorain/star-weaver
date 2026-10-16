// 夜空背景：渐变 + 银河 + 星云 + 山丘（静态层缓存），闪烁星点、流星、季节粒子（逐帧）
(function () {
  const THEMES = {
    title: {
      sky: ['#0b0820', '#1b1440', '#33255a', '#6a3d6c'], neb: ['#ff8fc8', '#a68cff', '#7fb4ff'], glow: '#ff9eb5',
      hills: ['#2a1c40', '#1c1330', '#110b1e'], rim: '#ffa8c8', accent: '#ffe2b0', fx: 'petal', band: 0.55,
    },
    spring: {
      sky: ['#0c0a24', '#1d1746', '#3a2a5c', '#7a4a6e'], neb: ['#ff8fc8', '#b48cff', '#7fb4ff'], glow: '#ff9eb5',
      hills: ['#2a1d3e', '#1d1430', '#120c20'], rim: '#ff9fc0', accent: '#ffd6ec', fx: 'petal', band: 0.5,
    },
    summer: {
      sky: ['#040918', '#0b1736', '#152e58', '#2b5878'], neb: ['#7fd4ff', '#a08cff', '#ffd28a'], glow: '#6fd6c8',
      hills: ['#0f2433', '#0a1a26', '#06111a'], rim: '#7fe8d0', accent: '#b4ecff', fx: 'firefly', band: 1,
    },
    autumn: {
      sky: ['#0d0820', '#201437', '#3c2246', '#8a4e3e'], neb: ['#ffb07a', '#ff7fa0', '#b08cff'], glow: '#ffb072',
      hills: ['#2a1a26', '#1c1119', '#110a10'], rim: '#ffb47a', accent: '#ffdcae', fx: 'leaf', band: 0.6,
    },
    winter: {
      sky: ['#040b1a', '#0c1c37', '#1a3557', '#4a6f8e'], neb: ['#9fd8ff', '#c8b8ff', '#ffffff'], glow: '#bfe4ff',
      hills: ['#30455f', '#1f3048', '#121e30'], rim: '#eaf6ff', accent: '#d8f0ff', fx: 'snow', band: 0.7,
    },
  };

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hex = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  function gauss(r) { return (r() + r() + r() + r() - 2) / 2; }

  let W = 0, H = 0, DPR = 1, cur = null, prev = null, fade = 1;
  let twinkles = [], shooting = [], parts = [], nextShoot = 3;
  const sprite = {};

  function makeSprite(color, size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, hex(color, 0.9)); gr.addColorStop(0.35, hex(color, 0.25)); gr.addColorStop(1, hex(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  }

  function ridge(r, w, base, amp, n) {
    const ph = [r() * 6, r() * 6, r() * 6], fr = [1 + r(), 2.5 + r() * 2, 6 + r() * 4];
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * w, u = i / n;
      const y = base - amp * (0.55 * Math.sin(u * fr[0] * Math.PI + ph[0]) + 0.3 * Math.sin(u * fr[1] * Math.PI + ph[1]) + 0.15 * Math.sin(u * fr[2] * Math.PI + ph[2]));
      pts.push([x, y]);
    }
    return pts;
  }

  function buildLayer(key) {
    const T = THEMES[key], r = rng([...key].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const c = document.createElement('canvas'); c.width = W * DPR; c.height = H * DPR;
    const g = c.getContext('2d'); g.scale(DPR, DPR);
    // 天空渐变
    const sg = g.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0, T.sky[0]); sg.addColorStop(0.45, T.sky[1]); sg.addColorStop(0.78, T.sky[2]); sg.addColorStop(1, T.sky[3]);
    g.fillStyle = sg; g.fillRect(0, 0, W, H);
    // 地平线辉光
    const hg = g.createRadialGradient(W * 0.5, H * 1.05, 0, W * 0.5, H * 1.05, Math.max(W, H) * 0.75);
    hg.addColorStop(0, hex(T.glow, 0.35)); hg.addColorStop(0.4, hex(T.glow, 0.1)); hg.addColorStop(1, hex(T.glow, 0));
    g.fillStyle = hg; g.fillRect(0, 0, W, H);

    // 银河带：从左下到右上的一条斜带
    const ax = -0.1 * W, ay = H * 0.95, bx = 1.1 * W, by = H * 0.05;
    const L = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / L, ny = (bx - ax) / L, bandW = Math.min(W, H) * 0.16;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const t = r(), off = gauss(r) * bandW * 0.8;
      const x = ax + (bx - ax) * t + nx * off, y = ay + (by - ay) * t + ny * off;
      const rad = bandW * (0.6 + r() * 1.4), col = T.neb[(r() * T.neb.length) | 0];
      const ng = g.createRadialGradient(x, y, 0, x, y, rad);
      ng.addColorStop(0, hex(col, 0.07 * T.band)); ng.addColorStop(1, hex(col, 0));
      g.fillStyle = ng; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const dust = Math.round(W * H / 260 * T.band);
    for (let i = 0; i < dust; i++) {
      const t = r(), off = gauss(r) * bandW;
      const x = ax + (bx - ax) * t + nx * off, y = ay + (by - ay) * t + ny * off;
      g.fillStyle = `rgba(255,248,235,${0.05 + r() * 0.22})`;
      const s = r() < 0.92 ? 0.6 : 1.1;
      g.fillRect(x, y, s, s);
    }
    // 尘埃暗带
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 14; i++) {
      const t = 0.15 + r() * 0.7, off = gauss(r) * bandW * 0.25;
      const x = ax + (bx - ax) * t + nx * off, y = ay + (by - ay) * t + ny * off, rad = bandW * (0.25 + r() * 0.35);
      const dg = g.createRadialGradient(x, y, 0, x, y, rad);
      dg.addColorStop(0, hex(T.sky[0], 0.35 * T.band)); dg.addColorStop(1, hex(T.sky[0], 0));
      g.fillStyle = dg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // 静态暗星
    for (let i = 0; i < W * H / 900; i++) {
      g.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.3})`;
      g.fillRect(r() * W, r() * H * 0.9, 0.8, 0.8);
    }

    // 山丘：三层，越近越暗、越高
    const hillTop = H * (W < H ? 0.84 : 0.8);
    const layers = [[hillTop, H * 0.05], [hillTop + H * 0.05, H * 0.045], [hillTop + H * 0.1, H * 0.035]];
    layers.forEach(([base, amp], li) => {
      const pts = ridge(r, W, base, amp, 80);
      g.beginPath(); g.moveTo(0, H);
      pts.forEach(([x, y]) => g.lineTo(x, y));
      g.lineTo(W, H); g.closePath();
      const fg = g.createLinearGradient(0, base - amp, 0, H);
      fg.addColorStop(0, T.hills[li]); fg.addColorStop(1, T.sky[0]);
      g.fillStyle = fg; g.fill();
      // 迎光的山脊
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.strokeStyle = hex(T.rim, 0.18 - li * 0.04); g.lineWidth = 1.2; g.stroke();
      // 山间薄雾
      if (li < 2) {
        const mg = g.createLinearGradient(0, base - amp * 0.3, 0, base + H * 0.05);
        mg.addColorStop(0, hex(T.glow, 0)); mg.addColorStop(0.5, hex(T.glow, 0.06)); mg.addColorStop(1, hex(T.glow, 0));
        g.fillStyle = mg; g.fillRect(0, base - amp, W, H * 0.12);
      }
      // 最近一层：几棵树和一盏灯
      if (li === 2) {
        const pine = key === 'winter' || key === 'autumn';
        const nT = Math.max(5, Math.round(W / 90));
        for (let k = 0; k < nT; k++) {
          const u = r(); if (u > 0.36 && u < 0.64) continue;          // 中间留空
          const i = Math.round(u * 80), [x, y] = pts[i], s = (0.7 + r() * 0.8) * Math.min(26, H * 0.03);
          g.fillStyle = T.hills[2];
          if (pine) {
            for (let j = 0; j < 3; j++) { g.beginPath(); g.moveTo(x, y - s * (2.2 - j * 0.55)); g.lineTo(x - s * (0.45 + j * 0.18), y - s * (0.9 - j * 0.45) + 2); g.lineTo(x + s * (0.45 + j * 0.18), y - s * (0.9 - j * 0.45) + 2); g.fill(); }
            if (key === 'winter') { g.fillStyle = 'rgba(235,245,255,0.35)'; g.beginPath(); g.moveTo(x, y - s * 2.2); g.lineTo(x - s * 0.2, y - s * 1.75); g.lineTo(x + s * 0.2, y - s * 1.75); g.fill(); }
          } else {
            g.fillRect(x - 1, y - s * 1.1, 2, s * 1.2);
            g.beginPath(); g.arc(x, y - s * 1.35, s * 0.62, 0, Math.PI * 2); g.arc(x - s * 0.38, y - s * 1.05, s * 0.42, 0, Math.PI * 2); g.arc(x + s * 0.4, y - s * 1.1, s * 0.45, 0, Math.PI * 2); g.fill();
          }
        }
        const [lx, ly] = pts[Math.round(0.73 * 80)];
        const lg = g.createRadialGradient(lx, ly - 10, 0, lx, ly - 10, 46);
        lg.addColorStop(0, 'rgba(255,214,140,0.55)'); lg.addColorStop(0.2, 'rgba(255,180,110,0.18)'); lg.addColorStop(1, 'rgba(255,180,110,0)');
        g.fillStyle = lg; g.fillRect(lx - 50, ly - 60, 100, 100);
        g.fillStyle = T.hills[2]; g.fillRect(lx - 0.8, ly - 14, 1.6, 14);
        g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(lx, ly - 15, 2.4, 0, Math.PI * 2); g.fill();
      }
    });
    return { key, T, canvas: c };
  }

  function seedTwinkles() {
    const r = rng(99), n = Math.round(W * H / 3200);
    twinkles = Array.from({ length: n }, () => ({
      x: r() * W, y: r() * H * 0.86, s: Math.pow(r(), 3) * 2.4 + 0.5, p: r() * 6.28, f: 0.6 + r() * 1.8,
      c: r() < 0.15 ? 1 : r() < 0.3 ? 2 : 0,
    }));
  }

  function spawnPart(T, init) {
    const kind = T.fx, p = { kind, life: 0 };
    if (kind === 'snow') Object.assign(p, { x: Math.random() * W, y: init ? Math.random() * H : -10, vy: 14 + Math.random() * 22, vx: -6 + Math.random() * 6, s: 0.8 + Math.random() * 1.8, ph: Math.random() * 6 });
    else if (kind === 'petal' || kind === 'leaf') Object.assign(p, { x: init ? Math.random() * W : -20 + Math.random() * W * 0.6, y: init ? Math.random() * H : -14, vy: 12 + Math.random() * 14, vx: 10 + Math.random() * 16, s: 2 + Math.random() * 2.5, ph: Math.random() * 6, rot: Math.random() * 6 });
    else Object.assign(p, { x: Math.random() * W, y: H * (0.8 + Math.random() * 0.18), vx: 0, vy: 0, s: 1.2 + Math.random(), ph: Math.random() * 6, hx: 0, hy: 0 });
    return p;
  }

  const Sky = {
    THEMES,
    get theme() { return cur ? cur.T : THEMES.title; },
    get key() { return cur ? cur.key : 'title'; },
    resize(w, h, dpr) {
      W = Math.max(2, w); H = Math.max(2, h); DPR = dpr;
      const k = cur ? cur.key : 'title';
      cur = buildLayer(k); prev = null; fade = 1;
      seedTwinkles();
      for (const c of Object.keys(THEMES)) { sprite[c] = makeSprite(THEMES[c].accent, 32); }
      sprite.warm = makeSprite('#ffd9a0', 32); sprite.cool = makeSprite('#a8d0ff', 32);
      parts = Array.from({ length: this.partCount() }, () => spawnPart(cur.T, true));
    },
    partCount() { return Math.round(Math.min(60, W * H / 22000)); },
    set(key) {
      if (cur && cur.key === key) return;
      prev = cur; cur = buildLayer(key); fade = prev ? 0 : 1;
      parts = Array.from({ length: this.partCount() }, () => spawnPart(cur.T, true));
    },
    draw(g, t, dt) {
      if (prev && fade < 1) {
        fade = Math.min(1, fade + dt / 1.2);
        g.drawImage(prev.canvas, 0, 0, W, H);
        g.globalAlpha = fade; g.drawImage(cur.canvas, 0, 0, W, H); g.globalAlpha = 1;
        if (fade >= 1) prev = null;
      } else g.drawImage(cur.canvas, 0, 0, W, H);

      const T = cur.T, sp = [sprite[cur.key], sprite.warm, sprite.cool];
      g.globalCompositeOperation = 'lighter';
      for (const s of twinkles) {
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.f + s.p));
        const sz = s.s * 4.5;
        g.globalAlpha = a * (s.s > 1.6 ? 0.9 : 0.6);
        g.drawImage(sp[s.c], s.x - sz / 2, s.y - sz / 2, sz, sz);
      }
      g.globalAlpha = 1;

      // 流星
      nextShoot -= dt;
      if (nextShoot < 0) {
        nextShoot = 4 + Math.random() * 7;
        const a = 0.35 + Math.random() * 0.35;
        shooting.push({ x: W * (0.1 + Math.random() * 0.8), y: H * Math.random() * 0.35, vx: -Math.cos(a) * 520 * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * 520, life: 0, max: 0.9 + Math.random() * 0.5 });
      }
      for (const s of shooting) {
        s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
        const k = s.life / s.max, al = Math.sin(Math.PI * Math.min(1, k)) * 0.8;
        const tx = s.x - s.vx * 0.14, ty = s.y - s.vy * 0.14;
        const lg = g.createLinearGradient(s.x, s.y, tx, ty);
        lg.addColorStop(0, `rgba(255,250,235,${al})`); lg.addColorStop(1, 'rgba(255,250,235,0)');
        g.strokeStyle = lg; g.lineWidth = 1.6; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(tx, ty); g.stroke();
      }
      shooting = shooting.filter(s => s.life < s.max);

      // 季节粒子
      for (const p of parts) {
        p.life += dt;
        if (p.kind === 'firefly') {
          p.hx += (Math.random() - 0.5) * 40 * dt; p.hy += (Math.random() - 0.5) * 40 * dt;
          p.hx *= 0.98; p.hy *= 0.98; p.x += p.hx * dt * 3; p.y += p.hy * dt * 3;
          if (p.y < H * 0.72 || p.y > H || p.x < 0 || p.x > W) Object.assign(p, spawnPart(T, true));
          const a = Math.max(0, Math.sin(p.life * 1.3 + p.ph)) * 0.9, sz = 14 * p.s;
          g.globalAlpha = a; g.drawImage(sprite.warm, p.x - sz / 2, p.y - sz / 2, sz, sz);
        } else if (p.kind === 'snow') {
          p.x += (p.vx + Math.sin(p.life + p.ph) * 8) * dt; p.y += p.vy * dt;
          if (p.y > H + 10) Object.assign(p, spawnPart(T, false));
          g.globalAlpha = 0.55; g.fillStyle = '#f2f8ff';
          g.beginPath(); g.arc(p.x, p.y, p.s, 0, 6.283); g.fill();
        } else {
          p.x += (p.vx + Math.sin(p.life * 1.4 + p.ph) * 10) * dt; p.y += p.vy * dt; p.rot += dt * 1.6;
          if (p.y > H + 14 || p.x > W + 20) Object.assign(p, spawnPart(T, false));
          g.globalCompositeOperation = 'source-over';
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, 0.55 + 0.45 * Math.sin(p.life * 3 + p.ph));
          g.globalAlpha = 0.55;
          g.fillStyle = p.kind === 'petal' ? '#ffc4dc' : ['#e8945a', '#d8703e', '#f0b860'][(p.ph * 10 | 0) % 3];
          g.beginPath(); g.ellipse(0, 0, p.s * 1.4, p.s * 0.8, 0, 0, 6.283); g.fill();
          g.restore();
          g.globalCompositeOperation = 'lighter';
        }
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    },
  };
  window.Sky = Sky;
})();
