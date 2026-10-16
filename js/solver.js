// 关卡图结构 + 求解器（浏览器与 node 校验脚本共用）
// 边的写法："a-b" 普通星线，"a=b" 鹊桥（要走两次），"a>b" 流星（只能 a → b）
// portals: [[p, q], ...] 星门：走到 p 会被传送到 q（反之亦然），从那里继续
(function (root) {
  function parse(L) {
    const nodes = L.nodes.map(([x, y]) => ({ x, y }));
    const edges = [];
    for (const tok of L.edges.trim().split(/\s+/)) {
      const m = tok.match(/^(\d+)([-=>])(\d+)$/);
      if (!m) throw new Error(`${L.id}: bad edge "${tok}"`);
      edges.push({ a: +m[1], b: +m[3], n: m[2] === '=' ? 2 : 1, dir: m[2] === '>' });
    }
    const portal = new Array(nodes.length).fill(-1);
    for (const [p, q] of L.portals || []) { portal[p] = q; portal[q] = p; }
    const adj = nodes.map(() => []);
    edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
    return { nodes, edges, portal, adj, start: L.start ?? -1, total: edges.reduce((s, e) => s + e.n, 0) };
  }

  // 从 v 出发当前可走的步：{ e, from, to, at }，at 为落脚点（经过星门后）
  function moves(G, v, rem) {
    const out = [];
    for (const i of G.adj[v]) {
      if (!rem[i]) continue;
      const e = G.edges[i];
      let to;
      if (e.a === v) to = e.b; else if (!e.dir) to = e.a; else continue;
      out.push({ e: i, from: v, to, at: G.portal[to] >= 0 ? G.portal[to] : to });
    }
    return out;
  }

  // 深搜求一条完整路线；dead 记录已证明走不通的状态
  function solveFrom(G, cur, rem, left, dead = new Set(), budget = { n: 4e6 }) {
    if (left === 0) return [];
    const key = cur + ':' + rem.join('');
    if (dead.has(key) || --budget.n < 0) return null;
    for (const m of moves(G, cur, rem)) {
      rem[m.e]--;
      const rest = solveFrom(G, m.at, rem, left - 1, dead, budget);
      rem[m.e]++;
      if (rest) return [m, ...rest];
    }
    dead.add(key);
    return null;
  }

  function startsOf(G) {
    return G.start >= 0 ? [G.start] : G.nodes.map((_, i) => i).filter(i => G.adj[i].length);
  }

  // 整关求解：返回 { start, path } 或 null
  function solve(G) {
    for (const s of startsOf(G)) {
      const rem = G.edges.map(e => e.n);
      const p = solveFrom(G, s, rem, G.total);
      if (p) return { start: s, path: p };
    }
    return null;
  }

  const api = { parse, moves, solveFrom, solve, startsOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Solver = api;
})(this);
