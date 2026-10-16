// 关卡校验：node tools/verify.js [关卡id前缀]
// 检查：可解、坐标、星距、星线是否擦过别的星；并用随机游走估计难度
const S = require('../js/solver.js');
global.window = global;
require('../js/levels.js');
const { CHAPTERS } = global;

const only = process.argv[2] || '';
let bad = 0;

function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy), t };
}

// 随机游走：每步在可走的星线里随便挑一条，统计一笔画完的比例
function randomRate(G, runs = 20000) {
  const starts = S.startsOf(G);
  let ok = 0;
  for (let r = 0; r < runs; r++) {
    const rem = G.edges.map(e => e.n);
    let cur = starts[(Math.random() * starts.length) | 0], left = G.total;
    while (left) {
      const ms = S.moves(G, cur, rem);
      if (!ms.length) break;
      const m = ms[(Math.random() * ms.length) | 0];
      rem[m.e]--; left--; cur = m.at;
    }
    if (!left) ok++;
  }
  return ok / runs;
}

// 能成功的起点有几个
function goodStarts(G) {
  return S.startsOf(G).filter(s => S.solveFrom(G, s, G.edges.map(e => e.n), G.total)).length;
}

for (const ch of CHAPTERS) {
  for (const L of ch.levels) {
    if (!L.id.startsWith(only)) continue;
    const warn = [];
    let G;
    try { G = S.parse(L); } catch (e) { console.log('✗', e.message); bad++; continue; }
    const N = G.nodes;
    N.forEach((n, i) => { if (n.x < 0 || n.x > 100 || n.y < 0 || n.y > 100) warn.push(`星${i}超出范围`); });
    G.edges.forEach((e, i) => {
      if (e.a >= N.length || e.b >= N.length || e.a === e.b) warn.push(`边${i}端点错误`);
    });
    const seen = new Set();
    for (const e of G.edges) {
      const k = Math.min(e.a, e.b) + ',' + Math.max(e.a, e.b);
      if (seen.has(k)) warn.push(`重复边 ${k}`); seen.add(k);
    }
    N.forEach((n, i) => { if (!G.adj[i].length) warn.push(`星${i}没有连线`); });
    let minD = 1e9;
    for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
      const d = Math.hypot(N[i].x - N[j].x, N[i].y - N[j].y);
      minD = Math.min(minD, d);
      if (d < 9) warn.push(`星${i}与星${j}太近(${d.toFixed(1)})`);
    }
    G.edges.forEach((e) => {
      N.forEach((p, i) => {
        if (i === e.a || i === e.b) return;
        const { d, t } = segDist(p, N[e.a], N[e.b]);
        if (t > 0 && t < 1 && d < 5) warn.push(`星${i}贴着边${e.a}-${e.b}(${d.toFixed(1)})`);
      });
    });
    const sol = S.solve(G);
    if (!sol) {
      // 奇点分析（星门两端合并计算，鹊桥算两条，流星记出入差）
      const deg = N.map(() => 0), bal = N.map(() => 0);
      for (const e of G.edges) { deg[e.a] += e.n; deg[e.b] += e.n; if (e.dir) { bal[e.a]++; bal[e.b]--; } }
      const rep = N.map((_, i) => (G.portal[i] >= 0 ? Math.min(i, G.portal[i]) : i));
      const md = {}, mb = {};
      N.forEach((_, i) => { md[rep[i]] = (md[rep[i]] || 0) + deg[i]; mb[rep[i]] = (mb[rep[i]] || 0) + bal[i]; });
      const odd = Object.keys(md).filter(k => md[k] % 2).map(k => `${k}${G.portal[k] >= 0 ? '/' + G.portal[k] : ''}(${md[k]})`);
      const unb = Object.keys(mb).filter(k => mb[k]).map(k => `${k}:${mb[k] > 0 ? '+' : ''}${mb[k]}`);
      warn.push(`无解! 奇点 ${odd.join(' ') || '无'}；流星出入差 ${unb.join(' ') || '无'}`);
    }
    const rate = sol ? randomRate(G) : 0;
    const gs = sol ? goodStarts(G) : 0;
    const flag = warn.length ? '✗' : '✓';
    if (warn.length) bad++;
    console.log(`${flag} ${L.id.padEnd(10)} ${L.name.padEnd(6, '　')} 星${String(N.length).padStart(2)} 笔${String(G.total).padStart(3)}  起点${String(gs).padStart(2)}/${S.startsOf(G).length}  随机成功率 ${(rate * 100).toFixed(2).padStart(6)}%  最小星距${minD.toFixed(1)}`);
    for (const w of warn) console.log('    · ' + w);
  }
}
process.exit(bad ? 1 : 0);
