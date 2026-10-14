'use strict';
// 地面道路車流：幹道路網（OSM secondary / tertiary）、號誌化路口、IDM 跟車，並與匝道端點銜接
// 地面道路沒有實測流量，背景車流量為假設值（par.bg），時間分布比照交流道進出量
(function (G) {
  const LK = G.LK, posAt = LK.posAt, laneOff = LK.laneOff, idm = LK.idm, findIdx = LK.findIdx;
  // 跨越國道的四座幹道橋：依 Google 街景（2025/11–2026/03）目視判讀的車道數 [北向, 南向]、分隔型式與人行道寬
  const BRIDGE = { '文化一路': { n: [4, 4], green: 1, sw: 2.0 }, '文化二路': { n: [2, 2], sw: 3.2 }, '文化三路': { n: [2, 3], sw: 3.2 }, '忠義路三段': { n: [4, 3], sw: 2.0 } };
  // 依使用者提供的空拍與街景修正的車道數：八德路西行在林口B北側路口前被機場捷運高架分成兩側，
  // 南側（左）4 車道、其中 2 條可左轉上橋；北側（右）2 車道只能直行或右轉
  // 文化北路一段在八德路口北側：南下（往龜山）4 車道、北上 3 車道
  const LANEFIX = [{ n: '八德路', p: [-1005, 73], ln: 4 }, { n: '八德路', p: [-972, 70], ln: 4 }, { n: '文化北路一段', p: [-980, 395], ln: 4 }, { n: '文化北路一段', p: [-1071, 96], ln: 3 }];
  const major = r => r.t === 'secondary' || r.t === 'tertiary';
  const USE = { secondary: 1, tertiary: 1, secondary_link: 1, tertiary_link: 1, unclassified: 1 }; // unclassified：側車道與主要巷道，提供幹道以外的分流路徑
  // 各道路的車道數（繪圖與模擬共用）
  function roadLanes(D) {
    if (D._rl) return; D._rl = 1;
    const byName = {}; D.roads.forEach(r => { if (r.n && r.ln && major(r)) { const k = r.n + '|' + r.ow, m = byName[k] || (byName[k] = {}); m[r.ln] = (m[r.ln] || 0) + r.p.length; } });
    const mode = k => { const m = byName[k]; if (!m) return 0; let b = 0, bn = 0; for (const q in m) if (m[q] > bn) { bn = m[q]; b = +q; } return b; };
    D.roads.forEach(r => {
      let n = r.ln || (major(r) ? mode(r.n + '|' + r.ow) : 0);
      if (!n) n = r.ow ? (major(r) ? 2 : 1) : (r.t === 'service' || r.t === 'living_street' ? 1 : 2);
      if (r.br && r.ow && major(r)) { const f = BRIDGE[r.n]; n = f ? f.n[r.p[r.p.length - 1][1] > r.p[0][1] ? 0 : 1] : Math.max(n, 2); r._bf = f; }
      r._n = Math.min(6, n);
      LANEFIX.forEach(f => { if (r.n === f.n && Math.hypot(r.p[0][0] - f.p[0], r.p[0][1] - f.p[1]) < 3) r._n = f.ln; });
    });
  }
  // 起迄分布的旅行時間衰減常數（秒）。地面道路沒有起迄調查資料：假設旅次端點沿街分布，
  // 匝道車輛只模擬進出匝道前後的最後一段（約 0.5–1.5 km），其餘行程不在模型內
  const TAU = 120, TAU_ON = 60;
  // 入口匝道車流的來向與排隊（使用者實地觀察）：林口B北入的車多由文化北路南下過橋後左轉進匝道，晨峰會在橋上回堵。
  // NORTH：該匝道車輛起點在國道北側的比例；COUPLED：地面車輛實際駛入匝道（匝道口滿了就在地面道路上排隊），不採「對應車輛」
  const NORTH = { B_N_on: 0.85 }, COUPLED = { B_N_on: 1 };
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const mapLane = (l, e, o) => Math.min(o.n - 1, Math.max(0, Math.round((l + 0.5) * o.n / e.n - 0.5)));

  function Surf(D, net) {
    roadLanes(D);
    this.net = net; const links = this.links = [], nodes = this.nodes = {};
    const key = p => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);
    const use = new Map(), sel = [];
    D.roads.forEach((r, ri) => { if (!USE[r.t] || r.p.length < 2) return; sel.push(ri); r.p.forEach((q, i) => { const k = key(q); use.set(k, (use.get(k) || 0) + (i === 0 || i === r.p.length - 1 ? 2 : 1)); }); });
    const node = p => { const k = key(p); return nodes[k] || (nodes[k] = { k, x: p[0], y: p[1], ins: [], outs: [], c: null }); };
    const mk = (ri, pts, rev) => {
      const r = D.roads[ri], P = rev ? pts.slice().reverse() : pts, lwb = major(r) ? 3.3 : 3.0;
      const e = { k: 'u', ri, rev, sec: r.t === 'secondary', minor: r.t === 'unclassified', vlim: r.t.indexOf('_link') > 0 || r.t === 'unclassified' ? 40 : 50, br: r.br, hw: (r._n * lwb + 0.8) / 2, det: [] };
      if (r.ow) { e.n = r._n; e.lw = lwb; e.l0 = -(e.n - 1) / 2 * lwb; } // 單行（含分向道路的一側）：車道置中
      else { e.n = Math.max(1, r._n >> 1); e.lw = r._n * lwb / 2 / e.n; e.l0 = e.lw / 2; } // 雙向：靠右半幅
      LK.setGeom(e, LK.resample(P, false, 8)); if (e.len < 0.5) return;
      if (e.n < 2 && r.t !== 'unclassified' && (e.len < 40 || (r.ow && !major(r)))) { e.n = 2; if (r.ow) e.l0 = -lwb / 2; else { e.lw = Math.max(2.6, e.lw / 2); e.l0 = e.lw / 2; } } // 路口內的短連接段與轉向道：未標註車道數者以 2 車道計
      e.GR = new Float32Array(e.np); e.L = []; for (let l = 0; l < e.n; l++) e.L.push([]);
      const q = posAt(e, Math.min(e.len, 12), 0, []), w = posAt(e, Math.max(0, e.len - 12), 0, []);
      e.h0 = Math.atan2(q[1] - e.Y[0], q[0] - e.X[0]); e.h1 = Math.atan2(e.Y[e.np - 1] - w[1], e.X[e.np - 1] - w[0]);
      e.A = node(P[0]); e.B = node(P[P.length - 1]); e.i = links.length; e.id = 'u' + e.i; links.push(e); e.A.outs.push(e); e.B.ins.push(e);
    };
    sel.forEach(ri => { const r = D.roads[ri], p = r.p; let s = 0; for (let i = 1; i < p.length; i++) if (i === p.length - 1 || use.get(key(p[i])) >= 2) { const seg = p.slice(s, i + 1); mk(ri, seg, false); if (!r.ow) mk(ri, seg, true); s = i; } });
    links.forEach(e => { e.outs = e.B.outs.filter(o => o.B !== e.A); });
    // 路口前後的短路段（OSM 多未標車道數）沿用上游直行路段的車道數，避免在停止線前憑空縮減
    links.forEach(e => { if (e.len >= 60 || !D.roads[e.ri].ow) return; let m = e.n; e.A.ins.forEach(i => { if (D.roads[i.ri].ow && Math.abs(wrap(e.h0 - i.h1)) < 0.5 && i.n > m) m = Math.min(i.n, 4); }); if (m > e.n) { e.n = m; e.l0 = -(m - 1) / 2 * e.lw; e.L = []; for (let l = 0; l < m; l++) e.L.push([]); } });
    // 路口：把相距很近的節點（分向道路交會產生的多個節點）併成一個路口
    const par = {}, find = k => { while (par[k] !== k) k = par[k] = par[par[k]]; return k; };
    for (const k in nodes) { par[k] = k; const nd = nodes[k], nb = new Set(); nd.ins.forEach(e => nb.add(e.A.k)); nd.outs.forEach(e => nb.add(e.B.k)); nd.deg = nb.size; }
    links.forEach(e => { if (e.len < 32 && e.A.deg >= 3 && e.B.deg >= 3) par[find(e.A.k)] = find(e.B.k); });
    const cl = {}; for (const k in nodes) { const r = find(k); nodes[k].c = cl[r] || (cl[r] = { app: [], x: nodes[k].x, y: nodes[k].y }); }
    links.forEach(e => { if (e.A.c !== e.B.c) e.B.c.app.push(e); });
    const phase = (h, ref) => { const d = Math.abs(wrap(h - ref)); return d > Math.PI / 4 && d < Math.PI * 3 / 4 ? 1 : 0; };
    this.sigs = [];
    let ci = 0;
    for (const r in cl) {
      const c = cl[r]; ci++; if (c.app.length < 3) continue;
      const mj = c.app.filter(e => !e.minor); if (!mj.length) continue; // 號誌只設在幹道與幹道交會處；巷道進口隨橫交方向的時相
      let ref = mj[0]; mj.forEach(e => { if (e.n > ref.n) ref = e; });
      const ln = [0, 0]; c.app.forEach(e => { e.ph = phase(e.h1, ref.h1); if (!e.minor) ln[e.ph] = Math.max(ln[e.ph], e.n); });
      if (!ln[0] || !ln[1]) continue;
      c.ref = ref.h1; c.cyc = c.app.some(e => e.sec) ? 150 : 100; c.g0 = Math.max(0.38, Math.min(0.62, ln[0] / (ln[0] + ln[1]))); c.off = (ci * 37) % c.cyc;
      setStop(c); this.sigs.push(c);
    }
    // 菱形交流道匝道端點的標準三時相：φ1 幹道雙向直行／右轉 → φ2 幹道雙向左轉保護 → φ3 匝道（含其餘支道）
    // φ3 長度依匝道綠燈比（校估參數），φ1／φ2 依每週期左轉與直行的排隊量分配
    function diamond(c) {
      if (c.ref === undefined) { let ref = c.app[0]; c.app.forEach(a => { if (a.n > ref.n) ref = a; }); c.ref = ref.h1; }
      c.app.forEach(a => { a.art = phase(a.h1, c.ref) === 0; a.hasL = a.art && a.outs.some(o => wrap(o.h0 - a.h1) > 0.6); }); c.f2 = 0.35; c.dia = true;
      c.dual = c.app.filter(a => a.hasL).length > 1; // 只有一個方向有左轉時採「領先左轉」：該方向的直行與左轉在 φ2 同時放行，對向停等
    }
    function setStop(c) {
      c.app.forEach(e => {
        e.sg = c; let sb = 3; e.B.ins.concat(e.B.outs).forEach(o => { if (o.ri !== e.ri && Math.abs(Math.sin(o === e ? 0 : (o.B === e.B ? o.h1 : o.h0) - e.h1)) > 0.5) sb = Math.max(sb, o.hw + 2.5); });
        e.stop = Math.max(e.len * 0.4, e.len - sb);
      });
    }
    // 同一大路口被拆成相鄰兩組號誌時：兩組之間的短路段不設停止線（視為路口內部）
    // 匝道端點號誌：所在路口改用匝道號誌的週期與綠燈比，匝道與同方向的地面道路同時相
    net.edges.forEach(e => {
      if (!e.sig || e.stub) return; const x = e.X[e.np - 1], y = e.Y[e.np - 1]; let best = null, bd = 60;
      if (e.sig === 'A_SR') return; // 右轉專用道匯入下游路段，不構成路口
      const cross = e.sig === 'B_N'; // 林口B北出匝道與忠義路十字交叉；林口B南出、林口A北出是先匯入同向道路，路口另有號誌
      for (const r in cl) { const c = cl[r]; if (!c.cyc && !cross) continue; c.app.forEach(a => { const d = Math.hypot(a.B.x - x, a.B.y - y) + (c.cyc ? 0 : 20); if (d < bd) { bd = d; best = c; } }); }
      if (best && !best.cyc && !best.ext) { best.app.forEach(a => { a.ph = 0; }); setStop(best); this.sigs.push(best); best.inv = true; } // 匝道口的地面道路只有單一軸向：地面道路為一時相，匝道為另一時相
      if (best && !best.ext) { diamond(best); best.ext = e.sig; this.sigs.forEach(c => { if (c !== best && !c.ext && c.app.some(a => a.len < 45 && a.A.c === best)) c.ext = e.sig; }); }
    });
    // 同一大路口被拆成相鄰兩組號誌時，兩組之間的短路段不設停止線；轉向專用道（*_link）不受路口號誌控制
    links.forEach(e => { if (e.sg && ((e.len < 45 && (e.A.c.cyc || e.A.c.ext)) || D.roads[e.ri].t.indexOf('_link') > 0)) { e.sg = null; e.stop = undefined; } });
    // 八德路北側車道（捷運高架北邊）不可左轉：經路口內連接段時只能直行往八德一路（另建一條只通往八德一路的連接段供其使用）
    { const from = links.find(e => D.roads[e.ri].n === '八德路' && Math.hypot(e.B.x + 1071, e.B.y - 96) < 3 && e.A.x > -900), via = from && from.outs.find(o => D.roads[o.ri].t === 'tertiary' && !D.roads[o.ri].n);
      if (via) { const c = Object.assign({}, via, { i: links.length, id: 'u' + links.length, L: via.L.map(() => []), outs: via.outs.filter(o => wrap(o.h0 - via.h1) < 0.6) }); links.push(c); from.outs = from.outs.map(o => o === via ? c : o); } }
    // 林口B南側路口的側車道（忠義路三段231巷）：依 Google 街景（2025/11）「側車道 禁止直行及左轉」，只准右轉，紅燈時有右轉箭頭
    links.forEach(e => { if (D.roads[e.ri].n === '忠義路三段231巷' && Math.hypot(e.B.x + 1107, e.B.y + 102) < 15) { e.outs = e.outs.filter(o => wrap(o.h0 - e.h1) < -0.5); e.sg = null; e.stop = undefined; } });
    // 進出模型的端點
    // 起迄點：路網邊界（對外聯絡）＋各路段中點（代表未納入模擬的巷道、社區與停車場出入口）
    const wt = e => e.n * (e.sec ? 1.6 : e.minor ? 0.5 : 1) * 2;
    this.orig = []; this.dest = [];
    links.forEach(e => {
      if (e.len < 30) return;
      if (!e.A.ins.some(i => i.A !== e.B)) this.orig.push({ e, s: 0, w: wt(e), q: [] }); else if (e.len > 120 && !e.br) this.orig.push({ e, s: e.len * 0.35, w: Math.min(3, e.len / 200) * (e.sec ? 1 : e.minor ? 0.4 : 0.7), q: [] });
      if (!e.outs.length) this.dest.push({ e, s: 1e9, w: wt(e) }); else if (e.len > 120 && !e.br) this.dest.push({ e, s: e.len * 0.6, w: Math.min(3, e.len / 200) * (e.sec ? 1 : e.minor ? 0.4 : 0.7) });
    });
    this.rampW = {};
    this.trees = {};
    // 匝道端點與地面路網的銜接位置
    const snap = (x, y, hx, hy) => { let best = null, bd = 30; links.forEach(e => { for (let i = 0; i < e.np - 1; i++) { const d = e.S[i + 1] - e.S[i] || 1, ex = (e.X[i + 1] - e.X[i]) / d, ey = (e.Y[i + 1] - e.Y[i]) / d; if (ex * hx + ey * hy < 0.6) continue; const u = Math.max(0, Math.min(d, (x - e.X[i]) * ex + (y - e.Y[i]) * ey)), dd = Math.hypot(e.X[i] + ex * u - x, e.Y[i] + ey * u - y); if (dd < bd) { bd = dd; best = { e, s: e.S[i] + u, d: dd }; } } }); return best; };
    this.inE = {}; this.outE = {};
    net.edges.forEach(e => {
      if (!e.stub) return; const P = [];
      if (e.stub === 'out') { posAt(e, e.len, 0, P); const s = snap(P[0], P[1], P[3], P[4]); if (s && s.e.len - s.s > 5) this.outE[e.stubKey] = s; }
      else { posAt(e, 0, 0, P); const s = snap(P[0], P[1], P[3], P[4]); if (s) this.inE[e.stubKey] = s; }
    });
  }
  Surf.prototype.reset = function (sim) {
    this.sim = sim; this.t = sim.t; this.rand = LK.rng(sim.par.seed + 7); this.acc = this.rand(); this.nid = 1; this.tmp = [0, 0];
    this.orig.forEach(o => { o.q.length = 0; }); this.links.forEach(e => { for (let l = 0; l < e.n; l++) e.L[l] = []; });
    this.stat = { gen: 0, done: 0, drop: 0, lost: 0, in: 0, out: 0, push: 0, skip: 0, jump: 0 };
  };
  const mvOf = (e, n) => n && wrap(n.h0 - e.h1) > 0.6 ? 'L' : 'T';
  const kL = (e, n) => n && e.sg && e.sg.dia && mvOf(e, n) === 'L' ? 2 : 1; // 往匝道車輛可用的內側車道數
  Surf.prototype.green = function (e, n) { return this.state(e, mvOf(e, n)) > 0; };
  // 燈號：0 紅、1 綠、2 黃（綠燈最後 3 秒；車輛視同綠燈）
  Surf.prototype.state = function (e, mv) {
    const c = e.sg; if (!c) return 1;
    const dia = this.sim.par.diamond; if (c.inv && !dia) return 1; // 三時相關閉時，原本無號誌的匝道口維持地面道路不停等
    if (c.dia && dia) {
      const p = this.sim.par, cyc = p.cycle, G = p.gc[c.ext] * cyc, tau = (this.t + (LK.SIGOFF[c.ext] || 0)) % cyc, d1 = (cyc - G) * (1 - c.f2);
      const w = !e.art ? [0, G] : mv === 'L' ? [G + 1 + d1, cyc] : (e.hasL && !c.dual) ? [G + 1, cyc] : [G + 1, G + 1 + d1], b = w[1] - 4;
      return tau < w[0] || tau >= b ? 0 : tau >= b - 3 ? 2 : 1;
    }
    let cyc = c.cyc, g = c.g0 * cyc, off = c.off, ph = e.ph;
    if (c.ext) { const p = this.sim.par; cyc = p.cycle; g = p.gc[c.ext] * cyc; off = LK.SIGOFF[c.ext] || 0; ph = e.ph ? 0 : 1; } // 匝道與橫交方向（時相 1）同時相，幹道在匝道紅燈時通行
    const tau = (this.t + off) % cyc, a = ph === 0 ? 0 : g, b = (ph === 0 ? g : cyc) - 4; return tau < a || tau >= b ? 0 : tau >= b - 3 ? 2 : 1;
  };
  // 以 e0 為起點的最短時間路徑樹（成本含轉向與號誌延滯）
  Surf.prototype.tree = function (e0) {
    let T = this.trees[e0.i]; if (T) return T;
    const n = this.links.length, dist = new Float64Array(n).fill(1e18), prev = new Int32Array(n).fill(-1), H = [[0, e0]], done = new Uint8Array(n);
    dist[e0.i] = 0;
    const push = x => { H.push(x); let i = H.length - 1; while (i) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
    const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
    while (H.length) {
      const u = pop()[1]; if (done[u.i]) continue; done[u.i] = 1;
      for (const o of u.outs) { const a = wrap(o.h0 - u.h1), nd = dist[u.i] + o.len / (o.vlim / 3.6) + (a > 0.6 ? 14 : a < -0.6 ? 5 : 0) + (u.sg ? 18 : 0); if (nd < dist[o.i]) { dist[o.i] = nd; prev[o.i] = u.i; push([nd, o]); } }
    }
    return this.trees[e0.i] = { dist, prev };
  };
  Surf.prototype.path = function (e0, e1) {
    const T = this.tree(e0); if (T.dist[e1.i] > 1e17) return null;
    const p = []; let i = e1.i; while (i >= 0) { p.unshift(this.links[i]); if (i === e0.i) break; i = T.prev[i]; } return p;
  };
  // 依權重抽樣；wf(a) 回傳該候選的權重（0 表示不可選）
  Surf.prototype.pick = function (arr, wf) {
    const W = this.pw || (this.pw = new Float64Array(2048)); let tot = 0; for (let i = 0; i < arr.length; i++) tot += W[i] = wf(arr[i]);
    if (tot <= 0) return null; let r = this.rand() * tot; for (let i = 0; i < arr.length; i++) { r -= W[i]; if (r <= 0) return arr[i]; } return null;
  };
  Surf.prototype.mkVeh = function (e, lane, s, v, cls, path) {
    const C = LK.CLS[cls], R = this.rand;
    return { id: 's' + this.nid++, cls, len: C.len, f: 1 + (R() + R() + R() - 1.5) * 0.12, T: C.T * (0.85 + R() * 0.3), a: C.a, b: C.b, e, lane, s, v, acc: 0, path, pi: 0, sT: 1e9, ramp: null, lat: laneOff(e, lane), ox: 0, oy: 0, stuck: 0, lcT: 0, col: R() };
  };
  // 在 e 的 s 處找可插入的車道；回傳車道或 -1
  Surf.prototype.slot = function (e, s, len, v) {
    let best = -1, bs = 0;
    for (let l = 0; l < e.n; l++) { const arr = e.L[l], k = findIdx(arr, s), ld = k ? arr[k - 1] : null, fo = arr[k] || null; const g1 = ld ? ld.s - ld.len - s : 1e4, g2 = fo ? s - len - fo.s : 1e4; if (g1 < 3 + v * 0.5 || g2 < 2 + (fo ? fo.v * 0.6 : 0)) continue; const sc = Math.min(g1, g2 * 2); if (sc > bs) { bs = sc; best = l; } }
    return best;
  };
  Surf.prototype.insert = function (v) { const arr = v.e.L[v.lane]; arr.splice(findIdx(arr, v.s), 0, v); };
  // 背景車流：隨機起迄
  Surf.prototype.gen = function () {
    const o = this.pick(this.orig, a => a.q.length < 20 ? a.w : 0); if (!o) { this.stat.lost++; return; }
    const T = this.tree(o.e), d = this.pick(this.dest, a => { const t = T.dist[a.e.i]; return t < 1e17 && t > 25 ? a.w * Math.exp(-t / TAU) : 0; }); if (!d) return;
    const r = this.rand(); o.q.push({ path: this.path(o.e, d.e), cls: r < 0.87 ? 0 : r < 0.97 ? 1 : 2, sT: d.s }); this.stat.gen++;
  };
  // 入口匝道車輛：自某個端點進入地面路網，行駛至匝道口後交給匝道
  Surf.prototype.toRamp = function (key, item) {
    const tg = this.inE[key]; if (!tg) return false;
    const W = this.rampW[key] || (this.rampW[key] = this.orig.map(a => { const t = this.tree(a.e).dist[tg.e.i]; return a.e !== tg.e && t < 1e17 ? a.w * Math.exp(-t / (NORTH[key] ? TAU : TAU_ON)) : 0; }));
    if (NORTH[key] && !W.done) { W.done = 1; const T = this.net.terr, isN = this.orig.map(a => { const P = posAt(a.e, a.s, 0, []); return P[1] > T.Yc(P[0]); }); let n = 0, s = 0; W.forEach((w, i) => { if (isN[i]) n += w; else s += w; }); if (n > 0 && s > 0) for (let i = 0; i < W.length; i++) W[i] *= isN[i] ? NORTH[key] / n : (1 - NORTH[key]) / s; }
    let tot = 0; for (let i = 0; i < W.length; i++) if (this.orig[i].q.length < 60) tot += W[i]; if (tot <= 0) return false;
    let r = this.rand() * tot, o = null; for (let i = 0; i < W.length; i++) { if (this.orig[i].q.length >= 60) continue; r -= W[i]; if (r <= 0) { o = this.orig[i]; break; } } if (!o) return false;
    // 預設（spill 關閉）：匝道需求仍依實測量直接到達匝道口，地面上另放一輛對應車輛行駛至匝道口後離開，
    // 以免未經校估的地面路網延誤匝道需求；spill 開啟時改為實際交接
    const sp = this.sim.par.spill || COUPLED[key]; o.q.push({ path: this.path(o.e, tg.e), cls: item.cls, ramp: key, item: sp ? item : null, sT: tg.s }); return !!sp;
  };
  // 出口匝道車輛駛入地面路網；無空間時回傳 false（回堵到匝道）
  Surf.prototype.fromRamp = function (v, stub) {
    const en = this.outE[stub.stubKey]; if (!en) return true;
    let l = this.slot(en.e, en.s, v.len, v.v), s0 = en.s;
    if (l < 0) {
      // 匝道在自己的綠燈時相進入路口，只要銜接處有實體空間即可駛入；完全沒有空間才回堵到匝道
      let bg = -1e9; for (let q = 0; q < en.e.n; q++) { const arr = en.e.L[q], k = findIdx(arr, en.s), ld = k ? arr[k - 1] : null, g = ld ? ld.s - ld.len - en.s : 1e4; if (g > bg) { bg = g; l = q; } }
      if (bg < 1.5) { if (this.sim.par.spill) return false; this.stat.skip++; return true; } // 銜接處已滿：回堵；spill 關閉時該車不進入地面路網（計數）
      this.stat.push++;
    }
    const T = this.tree(en.e), d = this.pick(this.dest, a => { const t = T.dist[a.e.i]; return a.e !== en.e && t < 1e17 ? a.w * Math.exp(-t / TAU) : 0; });
    const u = this.mkVeh(en.e, l, s0, Math.min(v.v, 10), v.cls, d ? this.path(en.e, d.e) : [en.e]); u.col = v.col; if (d) u.sT = d.s;
    const P1 = posAt(stub, v.s, v.lat, []), P2 = posAt(en.e, s0, u.lat, []); u.ox = P1[0] + v.ox - P2[0]; u.oy = P1[1] + v.oy - P2[1];
    this.insert(u); this.stat.in++; return true;
  };
  Surf.prototype.entryGap = function (key, out) {
    const en = this.outE[key]; out[0] = 1e4; out[1] = 0; if (!en) return;
    if (!this.sim.par.spill) return;
    let bg = -1, bv = 0; for (let l = 0; l < en.e.n; l++) { const arr = en.e.L[l], k = findIdx(arr, en.s - 6), ld = k ? arr[k - 1] : null, g = ld ? ld.s - ld.len - en.s : 1e4; if (g > bg) { bg = g; bv = ld ? ld.v : 0; } }
    out[0] = bg; out[1] = bv;
  };
  Surf.prototype.ahead = function (v, out) {
    let e = v.e, l = v.lane, dist = e.len - v.s, pi = v.pi;
    for (let d = 0; d < 4; d++) {
      const next = v.path[pi + 1]; if (!next) break;
      if (e.sg && !this.green(e, next)) { const g = dist - (e.len - e.stop); if (d || g > -0.5) { out[0] = g - 1; out[1] = 0; return; } }
      const l2 = mapLane(l, e, next), arr = next.L[l2];
      if (arr.length) { const ld = arr[arr.length - 1]; out[0] = dist + ld.s - ld.len; out[1] = ld.v; return; }
      dist += next.len; if (dist > 160) break; e = next; l = l2; pi++;
    }
    out[0] = 1e4; out[1] = 0;
  };
  Surf.prototype.handoff = function (v) { this.stat.out++; if (!v.item) return; v.item.t = this.t; this.sim.srcQ[v.ramp].push(v.item); };
  Surf.prototype.step = function (dt, t) {
    this.t = t; const sim = this.sim, par = sim.par, links = this.links, tmp = this.tmp, st = this.stat, P1 = [], P2 = [];
    const c = sim.cur; if (c && par.bg > 0) { this.acc += par.bg * par.growth * (c.xS + c.eS + c.xN + c.eN) / 300 * dt; while (this.acc >= 1) { this.acc -= 0.5 + this.rand(); this.gen(); } }
    for (const s of this.sigs) { // 每週期依各時相的排隊車輛數調整綠燈比（近似感應式號誌）
      if (s.dia && par.diamond) { // 幹道左轉與直行的分配：依上一週期兩者的排隊量
        const k = Math.floor((t + (LK.SIGOFF[s.ext] || 0)) / par.cycle); if (k === s.k) continue; s.k = k; let qL = 0, qT = 0;
        s.app.forEach(e => { // 進口與其上游 250 m 內的排隊車輛，依它們到這個路口時的轉向分類
          if (e.sg !== s || !e.art) return;
          if (!e.up) { e.up = [e]; let d = 0, q = e; while (d < 250) { const p = q.A.ins.find(i => Math.abs(wrap(q.h0 - i.h1)) < 0.5); if (!p || e.up.indexOf(p) >= 0) break; e.up.push(p); d += p.len; q = p; } }
          e.up.forEach(u => { for (let l = 0; l < u.n; l++) for (const v of u.L[l]) if (v.v < 4) { const j = v.path.indexOf(e, v.pi); if (j < 0) continue; if (mvOf(e, v.path[j + 1]) === 'L') qL++; else qT++; } });
        });
        s.f2 += (Math.max(0.2, Math.min(0.6, (qL + 1) / (qL + qT + 2))) - s.f2) * 0.5; continue;
      }
      if (s.ext || s.inv) continue; const k = Math.floor((t + s.off) / s.cyc); if (k === s.k) continue; s.k = k;
      const q = [0, 0]; s.app.forEach(e => { if (e.sg !== s) return; let n = 0; for (let l = 0; l < e.n; l++) for (const v of e.L[l]) if (v.v < 4) n++; let o = n / Math.max(4, Math.min(e.len, 250) * e.n / 7); if (o > 0.85 && e.len < 250) o *= 1.6; if (o > q[e.ph]) q[e.ph] = o; }); // 各時相最滿的進口（排隊佔儲車空間比例；短路段將滿時加權，避免回堵到上游路口）
      s.g0 += (Math.max(0.3, Math.min(0.7, (q[0] + 0.1) / (q[0] + q[1] + 0.2))) - s.g0) * 0.5;
    }
    for (const o of this.orig) { // 端點進場
      const e = o.e, Q = o.q; if (!Q.length) continue; let tries = o.s ? 1 : e.n;
      while (Q.length && tries-- > 0) { const r = Q[0], sp = o.s ? 5 : 10, l = this.slot(e, o.s, LK.CLS[r.cls].len, sp); if (l < 0) break; Q.shift(); const v = this.mkVeh(e, l, o.s, sp, r.cls, r.path); v.sT = r.sT; if (r.ramp) { v.ramp = r.ramp; v.item = r.item; } if (o.s) { v.lat += e.lw * 1.2; } this.insert(v); }
    }
    // 1) 加速度
    for (let ei = 0; ei < links.length; ei++) {
      const e = links[ei];
      for (let l = 0; l < e.n; l++) {
        const arr = e.L[l];
        for (let i = 0; i < arr.length; i++) {
          const v = arr[i], next = v.path[v.pi + 1], dEnd = e.len - v.s; let gap, vl;
          if (i) { const ld = arr[i - 1]; gap = ld.s - ld.len - v.s; vl = ld.v; if (e.sg && v.s <= e.stop && ld.s > e.stop && next && !this.green(e, next)) { const g = e.stop - v.s - 1; if (g < gap) { gap = g; vl = 0; } } }
          else { this.ahead(v, tmp); gap = tmp[0]; vl = tmp[1]; }
          if (v.item && !next && sim.srcQ[v.ramp].length >= 4) { const g = v.sT - v.s - 1; if (g < gap) { gap = g; vl = 0; } } // 匝道口已滿：在地面道路上排隊
          let v0 = e.vlim / 3.6 * v.f;
          if (next && dEnd < 30 && Math.abs(wrap(next.h0 - e.h1)) > 0.7) v0 = Math.min(v0, 5 + dEnd * 0.3); // 轉彎減速
          else if (v.pi && v.s < 12 && Math.abs(wrap(e.h0 - v.path[v.pi - 1].h1)) > 0.7) v0 = Math.min(v0, 7);
          const a = idm(v.v, v0, gap, v.v - vl, v.T, v.a, v.b); v.acc = a < -8 ? -8 : a; v.gap = gap;
        }
      }
    }
    // 2) 車道變換：前方受阻而鄰道較空
    for (let ei = 0; ei < links.length; ei++) {
      const e = links[ei]; if (e.n < 2) continue;
      for (let l = 0; l < e.n; l++) {
        const arr = e.L[l];
        for (let i = arr.length - 1; i >= 0; i--) {
          const v = arr[i]; if (t < v.lcT) continue;
          if (v.item) { // 往匝道的車：靠內側車道排成一列，其餘車道留給其他車流
            v.lcT = t + 1; if (l < kL(e, v.path[v.pi + 1])) continue; // 左轉前的進口可用內側兩條左轉道（林口B南側路口，使用者提供之空拍與街景）
            const ta = e.L[l - 1], k = findIdx(ta, v.s), ld = k ? ta[k - 1] : null, fo = ta[k] || null;
            if ((!ld || ld.s - ld.len - v.s > 1.5) && (!fo || v.s - v.len - fo.s > 1.5 + fo.v * 0.4)) { arr.splice(i, 1); v.lane = l - 1; this.insert(v); }
            continue;
          }
          if (v.gap > 25 || v.acc > 0) continue; v.lcT = t + 2;
          let best = -1, bg = v.gap + 12;
          for (let d = -1; d <= 1; d += 2) { const tl = l + d; if (tl < 0 || tl >= e.n) continue; const ta = e.L[tl], k = findIdx(ta, v.s), ld = k ? ta[k - 1] : null, fo = ta[k] || null, g1 = ld ? ld.s - ld.len - v.s : 200, g2 = fo ? v.s - v.len - fo.s : 1e4; if (g2 < 3 + (fo ? fo.v * 0.7 : 0) || g1 < bg) continue; bg = g1; best = tl; }
          if (best >= 0) { arr.splice(i, 1); v.lane = best; this.insert(v); v.lcT = t + 5; }
        }
      }
    }
    // 3) 積分
    for (let ei = 0; ei < links.length; ei++) {
      const e = links[ei];
      for (let l = 0; l < e.n; l++) {
        const arr = e.L[l]; let rm = false;
        for (let i = 0; i < arr.length; i++) {
          const v = arr[i]; let nv = v.v + v.acc * dt; if (nv < 0) nv = 0;
          const s0 = v.s; v.s += (v.v + nv) * 0.5 * dt; v.v = nv;
          if (i) { const ld = arr[i - 1], lim = ld.s - ld.len - 0.4; if (v.s > lim) { v.s = Math.max(s0, lim); if (v.v > ld.v) v.v = ld.v; } }
          if (e.sg && s0 <= e.stop && v.s > e.stop && v.path[v.pi + 1] && !this.green(e, v.path[v.pi + 1])) { v.s = e.stop; v.v = 0; }
          if (nv < 0.5) v.stuck += dt; else v.stuck = 0;
          const tgt = laneOff(e, l), dl = tgt - v.lat, mx = (0.9 + nv * 0.03) * dt; v.lat += dl > mx ? mx : dl < -mx ? -mx : dl;
          if (v.ox || v.oy) { const d = Math.hypot(v.ox, v.oy), k = Math.max(0, 1 - Math.max(3, d * 0.6) * dt / d); v.ox *= k; v.oy *= k; }
          if (!v.path[v.pi + 1] && v.s >= v.sT) { if (v.ramp) this.handoff(v); else st.done++; v.dead = rm = true; }
          else if (v.stuck > 300) { if (v.ramp) this.handoff(v); else st.drop++; v.dead = rm = true; } // 久候未動：移出模型並計數
        }
        if (rm) e.L[l] = arr.filter(v => !v.dead);
      }
    }
    // 4) 路段轉移
    for (let ei = 0; ei < links.length; ei++) {
      const e = links[ei];
      for (let l = 0; l < e.n; l++) {
        const arr = e.L[l];
        while (arr.length && arr[0].s >= e.len) {
          const v = arr[0], next = v.path[v.pi + 1];
          if (!next) { arr.shift(); v.dead = true; st.done++; continue; }
          const ns = v.s - e.len, l0 = v.item ? Math.min(l, kL(next, v.path[v.pi + 2]) - 1, next.n - 1) : mapLane(l, e, next); let l2 = -1, bg = ns + 1;
          for (let q = 0; q < (v.item && v.stuck < 20 ? Math.min(next.n, kL(next, v.path[v.pi + 2])) : next.n); q++) { const ta = next.L[q], last = ta[ta.length - 1], g = (last ? last.s - last.len : 1e4) - (q === l0 ? 0 : 6); if (g > bg) { bg = g; l2 = q; if (q === l0 && g > ns + 8) break; } }
          { const ta = next.L[l0], last = ta[ta.length - 1]; if (!last || last.s - last.len > ns + 8) l2 = l0; }
          if (l2 < 0) {
            if (v.stuck < 90) { v.s = e.len - 0.2; v.v = 0; break; }
            l2 = l0; st.jump++; // 下游滿車久候：強制推進，避免路網環狀互鎖（計數）
          }
          posAt(e, e.len, v.lat, P1);
          arr.shift(); v.s = ns; v.e = next; v.lane = l2; v.pi++; v.lat = laneOff(next, l2); next.L[l2].push(v);
          posAt(next, ns, v.lat, P2); v.ox += P1[0] - P2[0]; v.oy += P1[1] - P2[1];
        }
      }
    }
  };
  Surf.prototype.count = function () { let n = 0, slow = 0, q = 0; this.orig.forEach(o => { q += o.q.length; }); this.links.forEach(e => { for (let l = 0; l < e.n; l++) for (const v of e.L[l]) { n++; if (v.v < 2.8) slow++; } }); return { n, slow, q }; };
  LK.Surf = Surf; LK.roadLanes = roadLanes; LK.BRIDGE = BRIDGE;
})(typeof window !== 'undefined' ? window : globalThis);
