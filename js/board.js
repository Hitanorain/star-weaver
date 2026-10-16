// 棋盘：星与星线的绘制、拖拽连线、撤销 / 提示 / 胜利动画
(function () {
  const S = window.Solver;
  const PORTAL_COLORS = ['#7fe8ff', '#ff9ad8', '#b9ff8f'];
  const GOLD = '#ffd98a';
  const hex = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const ease = k => 1 - Math.pow(1 - k, 3);

  let haloCache = {};
  function halo(color) {
    if (haloCache[color]) return haloCache[color];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, hex(color, 0.95)); gr.addColorStop(0.22, hex(color, 0.35));
    gr.addColorStop(0.5, hex(color, 0.08)); gr.addColorStop(1, hex(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return (haloCache[color] = c);
  }

  function fit(nodes, rect, pad) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const n of nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    const s = Math.min((rect.w - pad * 2) / w, (rect.h - pad * 2) / h);
    const ox = rect.x + (rect.w - w * s) / 2 - x0 * s, oy = rect.y + (rect.h - h * s) / 2 - y0 * s;
    return nodes.map(n => ({ x: ox + n.x * s, y: oy + n.y * s }));
  }

  // 一条星线在屏幕上的若干"车道"（鹊桥两道）
  function lanes(P, e, trim) {
    const a = P[e.a], b = P[e.b], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const offs = e.n === 2 ? [-3.2, 3.2] : [0];
    return offs.map(o => ({ x1: a.x + ux * trim + nx * o, y1: a.y + uy * trim + ny * o, x2: b.x - ux * trim + nx * o, y2: b.y - uy * trim + ny * o, ux, uy, L: L - trim * 2 }));
  }

  function chevrons(g, ln, t, dirSign, color, alpha) {
    const gap = 24, off = ((t * 18) % gap + gap) % gap;
    g.strokeStyle = hex(color, alpha); g.lineWidth = 1.6; g.lineCap = 'round';
    const s = 4.6;
    for (let d = off; d < ln.L - 2; d += gap) {
      const cx = ln.x1 + ln.ux * d * dirSign + (dirSign < 0 ? ln.ux * ln.L : 0);
      const cy = ln.y1 + ln.uy * d * dirSign + (dirSign < 0 ? ln.uy * ln.L : 0);
      const fx = ln.ux * dirSign, fy = ln.uy * dirSign, px = -fy, py = fx;
      const fade = Math.min(1, d / 10, (ln.L - d) / 10);
      g.globalAlpha = Math.max(0, fade);
      g.beginPath();
      g.moveTo(cx - fx * s + px * s, cy - fy * s + py * s); g.lineTo(cx, cy); g.lineTo(cx - fx * s - px * s, cy - fy * s - py * s);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function litLine(g, x1, y1, x2, y2, k = 1, color = GOLD) {
    const x = x1 + (x2 - x1) * k, y = y1 + (y2 - y1) * k;
    g.lineCap = 'round';
    g.strokeStyle = hex(color, 0.13); g.lineWidth = 9; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x, y); g.stroke();
    g.strokeStyle = hex(color, 0.4); g.lineWidth = 3.4; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x, y); g.stroke();
    g.strokeStyle = 'rgba(255,248,226,0.95)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x, y); g.stroke();
  }

  const B = {
    L: null, G: null, P: [], rect: { x: 0, y: 0, w: 100, h: 100 },
    path: [], rem: [], cur: -1, startNode: -1, left: 0,
    dragging: false, ptr: null, ignore: -1, hitR: 30, nodeR: 6,
    anims: [], parts: [], hint: null, shake: 0, won: false, winT: 0, alpha: 1,
    demo: null, accent: '#ffe2b0', hintsUsed: 0, t: 0,
    on: {},   // 回调：change / win / stuck / toast

    load(L, opts = {}) {
      this.L = L; this.G = S.parse(L); this.P = []; this.PT = null;
      this.demo = opts.demo ? { sol: S.solve(this.G), i: -1, next: 0.8 } : null;
      this.accent = opts.accent || this.accent;
      this.reset();
      this.layout(this.rect);
    },
    reset() {
      this.path = []; this.rem = this.G.edges.map(e => e.n); this.cur = -1; this.startNode = -1;
      this.left = this.G.total; this.anims = []; this.hint = null; this.won = false; this.dragging = false;
      this.hintsUsed = 0;
      this.emit('change');
    },
    layout(rect) {
      this.rect = rect;
      if (!this.G) return;
      const pad = Math.min(36, Math.min(rect.w, rect.h) * 0.08);
      const np = fit(this.G.nodes, rect, pad);
      if (this.smooth && this.P.length === np.length) this.PT = np; else { this.P = np; this.PT = null; }
      this.smooth = false;
      let md = 1e9;
      for (let i = 0; i < this.P.length; i++) for (let j = i + 1; j < this.P.length; j++) md = Math.min(md, Math.hypot(this.P[i].x - this.P[j].x, this.P[i].y - this.P[j].y));
      this.hitR = Math.max(20, Math.min(42, md * 0.46));
      this.nodeR = Math.max(4.5, Math.min(7.5, md * 0.09));
    },
    emit(k, ...a) { if (this.on[k]) this.on[k](...a); },

    available(to) {
      return S.moves(this.G, this.cur, this.rem).find(m => m.to === to);
    },
    nodeAt(x, y, except = -1) {
      let best = -1, bd = this.hitR;
      this.P.forEach((p, i) => { if (i === except) return; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
      return best;
    },

    begin(i) {
      if (this.G.start >= 0 && i !== this.G.start) { this.emit('toast', '要从闪烁的那颗星出发'); this.hint = { node: this.G.start, t: this.t }; return false; }
      this.cur = i; this.startNode = i; this.ignore = i; this.hint = null;
      this.burst(this.P[i].x, this.P[i].y, 8, this.accent);
      window.Audio2.start(this.pan(i));
      this.emit('change');
      return true;
    },
    pan(i) { return Math.max(-0.7, Math.min(0.7, (this.P[i].x - (this.rect.x + this.rect.w / 2)) / (this.rect.w / 2) * 0.7)); },

    move(m, quiet) {
      this.rem[m.e]--; this.left--; this.path.push(m); this.cur = m.at; this.ignore = m.to; this.hint = null;
      const e = this.G.edges[m.e];
      this.anims.push({ e: m.e, lane: e.n - this.rem[m.e] - 1, from: m.from, t0: this.t });
      const p = this.P[m.to];
      this.burst(p.x, p.y, 10, GOLD);
      if (!quiet) window.Audio2.stroke(this.path.length - 1, this.pan(m.to));
      if (m.at !== m.to) {
        const q = this.P[m.at];
        for (let k = 0; k < 18; k++) {
          const u = k / 18;
          this.parts.push({ x: p.x, y: p.y, tx: q.x, ty: q.y, delay: u * 0.15, life: 0, max: 0.5, s: 2.2, c: PORTAL_COLORS[this.portalIndex(m.to)], fly: true });
        }
        if (!quiet) window.Audio2.portal();
      }
      this.emit('change');
      if (this.left === 0) { this.won = true; this.winT = this.t; this.dragging = false; if (!this.demo) setTimeout(() => this.emit('win'), 1500); }
      else if (!S.moves(this.G, this.cur, this.rem).length && !this.demo) {
        this.shake = 0.45; window.Audio2.stuck(); this.dragging = false;
        this.emit('stuck');
      }
    },
    portalIndex(i) {
      const ps = this.L.portals || [];
      return Math.max(0, ps.findIndex(([a, b]) => a === i || b === i));
    },

    undo() {
      if (this.won) return;
      if (this.path.length) {
        const m = this.path.pop(); this.rem[m.e]++; this.left++; this.cur = m.from;
        this.anims = this.anims.filter(a => !(a.e === m.e && a.lane === this.G.edges[m.e].n - this.rem[m.e]));
      } else if (this.cur >= 0) { this.cur = -1; this.startNode = -1; }
      else return;
      this.hint = null; window.Audio2.undo(); this.emit('change');
    },
    restart() { if (this.won) return; const used = this.hintsUsed; this.reset(); this.hintsUsed = used; },

    // 提示：给出下一步；如果已经走进死路，先退回到还能走通的地方
    giveHint() {
      if (this.won) return;
      this.hintsUsed++;
      window.Audio2.hint();
      const G = this.G;
      if (this.cur < 0) {
        const sol = S.solve(G);
        this.hint = { node: sol.start, t: this.t };
        this.emit('toast', '从闪烁的星出发');
        return;
      }
      const rest = S.solveFrom(G, this.cur, this.rem.slice(), this.left);
      if (rest) { this.hint = { node: rest[0].to, e: rest[0].e, from: this.cur, t: this.t }; return; }
      // 往回找
      const steps = this.path.slice();
      for (let k = steps.length - 1; k >= 0; k--) {
        const rem = G.edges.map(e => e.n);
        for (let j = 0; j < k; j++) rem[steps[j].e]--;
        const at = k ? steps[k - 1].at : this.startNode;
        const r = S.solveFrom(G, at, rem, G.total - k);
        if (r) {
          const back = steps.length - k;
          for (let j = 0; j < back; j++) { const m = this.path.pop(); this.rem[m.e]++; this.left++; this.cur = m.from; }
          this.anims = this.anims.filter(a => this.lit(a.e) > a.lane);
          this.hint = { node: r[0].to, e: r[0].e, from: this.cur, t: this.t };
          this.emit('toast', `之前走岔了，已退回 ${back} 步`);
          this.emit('change');
          return;
        }
      }
      const sol = S.solve(G);
      this.reset(); this.hintsUsed = Math.max(1, this.hintsUsed);
      this.hint = { node: sol.start, t: this.t };
      this.emit('toast', '起点选错了，换这颗星出发');
    },
    lit(e) { return this.G.edges[e].n - this.rem[e]; },

    // —— 输入 ——
    down(x, y) {
      if (this.won || this.demo) return;
      this.ptr = { x, y };
      const i = this.nodeAt(x, y);
      if (this.cur < 0) { if (i >= 0 && this.begin(i)) this.dragging = true; return; }
      if (i >= 0 && i !== this.cur) {
        const m = this.available(i);
        if (m) { this.move(m); this.dragging = !this.won; return; }
        if (!this.path.length) { if (this.begin(i)) this.dragging = true; return; }
        window.Audio2.tap();
      }
      this.dragging = true;
      this.ignore = i;
    },
    moveTo(x, y) {
      if (!this.dragging || !this.ptr) { this.ptr = { x, y }; return; }
      const p0 = this.ptr, d = Math.hypot(x - p0.x, y - p0.y), n = Math.max(1, Math.ceil(d / 6));
      for (let k = 1; k <= n; k++) {
        const sx = p0.x + (x - p0.x) * k / n, sy = p0.y + (y - p0.y) * k / n;
        if (this.ignore >= 0 && Math.hypot(this.P[this.ignore].x - sx, this.P[this.ignore].y - sy) > this.hitR) this.ignore = -1;
        const i = this.nodeAt(sx, sy, this.cur);
        if (i >= 0 && i !== this.ignore) {
          const m = this.available(i);
          if (m) { this.move(m); if (!this.dragging) break; }
        }
      }
      this.ptr = { x, y };
      if (Math.random() < 0.5) this.parts.push({ x, y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0, max: 0.6, s: 1.4, c: this.accent });
    },
    up() { this.dragging = false; },

    burst(x, y, n, c) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.283, v = 30 + Math.random() * 70;
        this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 0.5, s: 1.2 + Math.random() * 1.4, c });
      }
    },

    // —— 绘制 ——
    draw(g, t, dt) {
      this.t = t;
      if (!this.G) return;
      if (this.demo) this.stepDemo(dt);
      if (this.PT) {
        const k = Math.min(1, dt * 5);
        this.P = this.P.map((p, i) => ({ x: p.x + (this.PT[i].x - p.x) * k, y: p.y + (this.PT[i].y - p.y) * k }));
      }
      const G = this.G, P = this.P, R = this.nodeR;
      let sx = 0;
      if (this.shake > 0) { this.shake -= dt; sx = Math.sin(this.shake * 60) * 6 * (this.shake / 0.45); }
      g.save(); g.translate(sx, 0); g.globalAlpha = this.alpha;
      const A = this.alpha, acc = this.accent;
      const winK = this.won ? Math.min(1, (t - this.winT) / 1.2) : 0;

      // 星线
      G.edges.forEach((e, i) => {
        const ls = lanes(P, e, R + 3), lit = this.lit(i);
        ls.forEach((ln, li) => {
          if (li < lit) {
            const an = this.anims.find(a => a.e === i && a.lane === li);
            let k = 1;
            if (an) k = Math.min(1, (t - an.t0) / 0.16);
            const rev = an ? an.from === e.b : false;
            g.globalCompositeOperation = 'lighter';
            if (rev) litLine(g, ln.x2, ln.y2, ln.x1, ln.y1, ease(k));
            else litLine(g, ln.x1, ln.y1, ln.x2, ln.y2, ease(k));
            if (winK > 0) {
              // 胜利时一道光沿着画线顺序流过
              const order = this.path.findIndex(m => m.e === i);
              const w = Math.max(0, 1 - Math.abs(winK * (this.path.length + 4) - order - 2) / 3);
              if (w > 0) { g.globalAlpha = A * w; litLine(g, ln.x1, ln.y1, ln.x2, ln.y2, 1, '#ffffff'); g.globalAlpha = A; }
            }
            g.globalCompositeOperation = 'source-over';
            if (e.dir) chevrons(g, ln, t, 1, '#fff6dc', 0.85 * A);
          } else {
            g.strokeStyle = hex(acc, 0.5); g.lineWidth = 1.5; g.setLineDash([4, 6]); g.lineDashOffset = -t * 6;
            g.beginPath(); g.moveTo(ln.x1, ln.y1); g.lineTo(ln.x2, ln.y2); g.stroke(); g.setLineDash([]);
            if (e.dir) chevrons(g, ln, t, 1, acc, 0.75 * A);
          }
        });
        // 提示的那条线
        const h = this.hint;
        if (h && h.e === i) {
          const k = (t - h.t) % 1.2 / 1.2, a = P[h.from], b = P[h.from === e.a ? e.b : e.a];
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = A * (0.5 + 0.5 * Math.sin(t * 6));
          litLine(g, a.x, a.y, a.x + (b.x - a.x) * ease(k), a.y + (b.y - a.y) * ease(k), 1, '#9fe8ff');
          g.globalAlpha = A; g.globalCompositeOperation = 'source-over';
        }
      });

      // 拖拽中的牵引线
      if (this.dragging && this.cur >= 0 && this.ptr && !this.won) {
        const a = P[this.cur], gr = g.createLinearGradient(a.x, a.y, this.ptr.x, this.ptr.y);
        gr.addColorStop(0, hex(GOLD, 0.7)); gr.addColorStop(1, hex(GOLD, 0.05));
        g.strokeStyle = gr; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(this.ptr.x, this.ptr.y); g.stroke();
      }

      // 星
      g.globalCompositeOperation = 'lighter';
      const big = new Set(this.L.big || []);
      P.forEach((p, i) => {
        const done = G.adj[i].every(ei => !this.rem[ei]);
        const touched = G.adj[i].some(ei => this.lit(ei) > 0) || i === this.startNode;
        const tw = 0.85 + 0.15 * Math.sin(t * (1.3 + (i % 5) * 0.3) + i * 1.7);
        let size = R * (big.has(i) ? 13 : 10.5) * tw;
        const col = done || touched ? GOLD : acc;
        if (done) size *= 1.12;
        if (winK > 0) size *= 1 + 0.5 * Math.sin(Math.min(1, winK * 1.5) * Math.PI);
        g.globalAlpha = A * (done ? 1 : touched ? 0.95 : 0.8);
        g.drawImage(halo(col), p.x - size / 2, p.y - size / 2, size, size);
        // 衍射十字
        if (big.has(i) || done) {
          const sl = R * (big.has(i) ? 4.2 : 2.8) * tw;
          g.strokeStyle = hex('#ffffff', 0.35 * A); g.lineWidth = 1;
          g.beginPath(); g.moveTo(p.x - sl, p.y); g.lineTo(p.x + sl, p.y); g.moveTo(p.x, p.y - sl); g.lineTo(p.x, p.y + sl); g.stroke();
        }
        g.globalAlpha = A;
        g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(p.x, p.y, R * (big.has(i) ? 0.62 : 0.5), 0, 6.283); g.fill();
      });
      g.globalCompositeOperation = 'source-over';

      // 星门
      (this.L.portals || []).forEach(([a, b], pi) => {
        const c = PORTAL_COLORS[pi % PORTAL_COLORS.length];
        [a, b].forEach((i, s) => {
          const p = P[i], rr = R * 2.6;
          g.strokeStyle = hex(c, 0.25 * A); g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, rr, 0, 6.283); g.stroke();
          g.fillStyle = hex(c, 0.9 * A);
          for (let k = 0; k < 8; k++) {
            const ang = t * (s ? -1.2 : 1.2) + k * 0.785;
            g.globalAlpha = A * (0.35 + 0.65 * ((k + 1) / 8));
            g.beginPath(); g.arc(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr, 1.6, 0, 6.283); g.fill();
          }
          g.globalAlpha = A;
        });
      });

      // 当前所在的星：呼吸光圈
      if (this.cur >= 0 && !this.won) {
        const p = P[this.cur], k = (t * 0.9) % 1;
        g.strokeStyle = hex(GOLD, (1 - k) * 0.8 * A); g.lineWidth = 1.6;
        g.beginPath(); g.arc(p.x, p.y, R * (1.6 + k * 2.6), 0, 6.283); g.stroke();
        g.strokeStyle = hex(GOLD, 0.7 * A); g.lineWidth = 1.2;
        g.beginPath(); g.arc(p.x, p.y, R * 1.6, 0, 6.283); g.stroke();
      }
      // 提示的星 / 固定起点
      const hn = this.hint ? this.hint.node : (this.cur < 0 && G.start >= 0 ? G.start : -1);
      if (hn >= 0) {
        const p = P[hn], k = (t * 1.2) % 1;
        g.strokeStyle = hex('#9fe8ff', (1 - k) * 0.9 * A); g.lineWidth = 2;
        g.beginPath(); g.arc(p.x, p.y, R * (1.4 + k * 3.2), 0, 6.283); g.stroke();
      }

      // 粒子
      g.globalCompositeOperation = 'lighter';
      for (const q of this.parts) {
        if (q.fly) {
          q.delay -= dt; if (q.delay > 0) continue;
          q.life += dt; const k = ease(Math.min(1, q.life / q.max));
          const x = q.x + (q.tx - q.x) * k, y = q.y + (q.ty - q.y) * k - Math.sin(k * Math.PI) * 30;
          g.globalAlpha = A * (1 - k * 0.6); g.fillStyle = q.c;
          g.beginPath(); g.arc(x, y, q.s, 0, 6.283); g.fill();
          continue;
        }
        q.life += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96;
        const a = 1 - q.life / q.max;
        if (a <= 0) continue;
        g.globalAlpha = A * a; g.fillStyle = q.c;
        g.beginPath(); g.arc(q.x, q.y, q.s * a + 0.3, 0, 6.283); g.fill();
      }
      this.parts = this.parts.filter(q => q.life < q.max);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.restore();
    },

    // 标题画面：自动把星座画出来
    stepDemo(dt) {
      const d = this.demo; if (!d.sol) return;
      d.next -= dt;
      if (d.next > 0) return;
      if (d.i < 0) { this.cur = d.sol.start; this.startNode = d.sol.start; d.i = 0; d.next = 0.5; return; }
      if (d.i < d.sol.path.length) { this.move(d.sol.path[d.i], false); d.i++; d.next = 0.42; return; }
      d.next = 1e9;
      this.emit('demoDone');
    },
  };

  // 关卡卡片上的小预览
  B.preview = function (cv, L, done, accent) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const G = S.parse(L), P = fit(G.nodes, { x: 0, y: 0, w, h }, 12);
    g.lineCap = 'round';
    for (const e of G.edges) {
      const a = P[e.a], b = P[e.b];
      if (done) { g.strokeStyle = hex(GOLD, 0.25); g.lineWidth = 4; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
      g.strokeStyle = done ? 'rgba(255,240,200,0.85)' : hex(accent, 0.35); g.lineWidth = done ? 1.2 : 1;
      if (!done) g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
    }
    g.globalCompositeOperation = 'lighter';
    const big = new Set(L.big || []);
    P.forEach((p, i) => { const s = big.has(i) ? 22 : 15; g.drawImage(halo(done ? GOLD : accent), p.x - s / 2, p.y - s / 2, s, s); });
  };

  window.Board = B;
})();
