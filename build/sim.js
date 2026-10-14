'use strict';
// 國道1號林口交流道：路網建置與微觀車流模擬（IDM 跟車 + 車道變換），不依賴 DOM
(function (G) {
  const LW = 3.65; // 國道主線車道寬 (m)
  const CLS = [
    { code: '31', name: '小客車', len: 4.6, w: 1.8, h: 1.5, a: 1.5, b: 2.2, T: 1.05, gf: 0.12, heavy: 0 },
    { code: '32', name: '小貨車', len: 5.6, w: 1.9, h: 2.1, a: 1.2, b: 2.0, T: 1.2, gf: 0.3, heavy: 0 },
    { code: '41', name: '大客車', len: 12.0, w: 2.5, h: 3.3, a: 0.9, b: 1.8, T: 1.5, gf: 0.6, heavy: 1 },
    { code: '42', name: '大貨車', len: 9.5, w: 2.5, h: 3.4, a: 0.75, b: 1.8, T: 1.6, gf: 0.85, heavy: 1 },
    { code: '5', name: '聯結車', len: 16.5, w: 2.5, h: 3.8, a: 0.55, b: 1.6, T: 1.8, gf: 1.0, heavy: 1 }
  ];
  const sstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------------- 地形 ----------------
  function Terrain(D) {
    const E = D.elev, nx = E.nx, ny = E.ny, H = E.h;
    function t0(x, y) {
      let fx = (x - E.x0) / E.st, fy = (y - E.y0) / E.st;
      fx = Math.max(0, Math.min(nx - 1.001, fx)); fy = Math.max(0, Math.min(ny - 1.001, fy));
      const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * nx + i;
      return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + nx] * (1 - u) + H[k + nx + 1] * u) * v;
    }
    const X0 = -4400, DX = 50, N_ = 172;
    const sy = new Float64Array(N_), sc = new Float64Array(N_);
    D.edges.forEach(e => {
      if (e.k !== 'm') return;
      for (let i = 1; i < e.p.length; i++) {
        const a = e.p[i - 1], b = e.p[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 20));
        for (let q = 0; q <= n; q++) { const x = a[0] + (b[0] - a[0]) * q / n, y = a[1] + (b[1] - a[1]) * q / n, k = Math.round((x - X0) / DX); if (k >= 0 && k < N_) { sy[k] += y; sc[k]++; } }
      }
    });
    const yc = new Float64Array(N_); let first = -1, last = -1;
    for (let i = 0; i < N_; i++) if (sc[i]) { yc[i] = sy[i] / sc[i]; if (first < 0) first = i; last = i; }
    for (let i = first + 1; i < last; i++) if (!sc[i]) { let j = i; while (!sc[j]) j++; const a = i - 1; for (let q = i; q < j; q++) yc[q] = yc[a] + (yc[j] - yc[a]) * (q - a) / (j - a); i = j; }
    const sl0 = (yc[first + 4] - yc[first]) / 4, sl1 = (yc[last] - yc[last - 4]) / 4;
    for (let i = first - 1; i >= 0; i--) yc[i] = yc[i + 1] - sl0;
    for (let i = last + 1; i < N_; i++) yc[i] = yc[i - 1] + sl1;
    let hm = new Float64Array(N_);
    for (let i = 0; i < N_; i++) hm[i] = t0(X0 + i * DX, yc[i]);
    for (let pass = 0; pass < 3; pass++) { const o = new Float64Array(N_); for (let i = 0; i < N_; i++) { let s = 0, c = 0; for (let q = -8; q <= 8; q++) { const j = Math.max(0, Math.min(N_ - 1, i + q)); s += hm[j]; c++; } o[i] = s / c; } hm = o; }
    function lin(arr, x) { let f = (x - X0) / DX; f = Math.max(0, Math.min(N_ - 1.001, f)); const i = f | 0, u = f - i; return arr[i] * (1 - u) + arr[i + 1] * u; }
    const Yc = x => lin(yc, x);
    function cosf(x) { const m = (Yc(x + 25) - Yc(x - 25)) / 50; return 1 / Math.sqrt(1 + m * m); }
    // 原地面 N：SRTM 30 m 在路廊內已被路塹「平均」過，改以路廊兩側 170 m 外的高程內插還原台地面
    const DN = 170;
    function N(x, y) {
      const D = DN / cosf(x), c = Yc(x), o = y - c, ao = Math.abs(o); if (ao >= D) return t0(x, y);
      const a = t0(x, c - D), b = t0(x, c + D), l = a + (b - a) * (o + D) / (2 * D), w = sstep((ao / D - 0.7) / 0.3);
      return l * (1 - w) + t0(x, y) * w;
    }
    // 國道縱斷面 M：林口台地段（約 39.9K–43K）為下挖路塹，路面至少低於兩側台地面 7 m（跨越橋與地面道路同高）
    { let nc = new Float64Array(N_), o;
      for (let i = 0; i < N_; i++) { const x = X0 + i * DX, D = DN / cosf(x); nc[i] = (t0(x, yc[i] - D) + t0(x, yc[i] + D)) / 2; }
      for (let pass = 0; pass < 3; pass++) { o = new Float64Array(N_); for (let i = 0; i < N_; i++) { let s2 = 0; for (let q = -8; q <= 8; q++) s2 += nc[Math.max(0, Math.min(N_ - 1, i + q))]; o[i] = s2 / 17; } nc = o; }
      for (let i = 0; i < N_; i++) { const x = X0 + i * DX, core = sstep((x + 2000) / 350) * (1 - sstep((x - 1000) / 350)); hm[i] -= Math.max(0, 7 * core - (nc[i] - hm[i])); }
      o = new Float64Array(N_); for (let i = 0; i < N_; i++) { let s2 = 0; for (let q = -3; q <= 3; q++) s2 += hm[Math.max(0, Math.min(N_ - 1, i + q))]; o[i] = s2 / 7; } hm = o;
    }
    const M = x => lin(hm, x);
    return { t0, T: N, N, M, Yc };
  }

  // ---------------- 幾何 ----------------
  function resample(p, smooth, step) {
    const out = [];
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
      const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(1, Math.ceil(L / step));
      for (let q = 0; q < n; q++) {
        const t = q / n;
        if (!smooth) { out.push([p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]); continue; }
        // Catmull-Rom，切線長度以相鄰弦長限制，避免過衝
        const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || L, d3 = Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) || L;
        const k1 = Math.min(1, L / d1) * 0.5, k2 = Math.min(1, L / d3) * 0.5;
        const m1x = (p2[0] - p0[0]) * k1, m1y = (p2[1] - p0[1]) * k1, m2x = (p3[0] - p1[0]) * k2, m2y = (p3[1] - p1[1]) * k2;
        const t2 = t * t, t3 = t2 * t, h1 = 2 * t3 - 3 * t2 + 1, h2 = t3 - 2 * t2 + t, h3 = -2 * t3 + 3 * t2, h4 = t3 - t2;
        out.push([h1 * p1[0] + h2 * m1x + h3 * p2[0] + h4 * m2x, h1 * p1[1] + h2 * m1y + h3 * p2[1] + h4 * m2y]);
      }
    }
    out.push(p[p.length - 1].slice());
    return out;
  }
  function setGeom(e, pts) {
    const n = pts.length; e.X = new Float64Array(n); e.Y = new Float64Array(n); e.S = new Float64Array(n); e.Z = new Float64Array(n); e.OFF = new Float64Array(n);
    for (let i = 0; i < n; i++) { e.X[i] = pts[i][0]; e.Y[i] = pts[i][1]; if (i) e.S[i] = e.S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); }
    e.len = e.S[n - 1]; e.np = n;
  }
  function idxAt(e, s) { let lo = 0, hi = e.np - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (e.S[m] <= s) lo = m; else hi = m; } return lo; }
  // 回傳 [x, y, z, hx, hy]；lat 為相對中心線向右的橫向偏移 (m)
  function posAt(e, s, lat, out) {
    s = s < 0 ? 0 : s > e.len ? e.len : s;
    const i = idxAt(e, s), d = e.S[i + 1] - e.S[i] || 1, u = (s - e.S[i]) / d;
    const hx = (e.X[i + 1] - e.X[i]) / d, hy = (e.Y[i + 1] - e.Y[i]) / d;
    out[0] = e.X[i] + (e.X[i + 1] - e.X[i]) * u + hy * lat;
    out[1] = e.Y[i] + (e.Y[i + 1] - e.Y[i]) * u - hx * lat;
    out[2] = e.Z[i] + (e.Z[i + 1] - e.Z[i]) * u; out[3] = hx; out[4] = hy; out[5] = (e.Z[i + 1] - e.Z[i]) / d;
    return out;
  }
  // 車道橫向位置：主線以內側 4 車道為基準靠左對齊，增減的車道都出現在外側（右側）
  const laneOff = (e, l) => e.l0 !== undefined ? e.l0 + l * e.lw : (l - ((e.nb || e.n) - 1) / 2) * e.lw;

  // ---------------- 情境設定 ----------------
  const CFG = {
    lanes: {
      both: { '25439936': 2, '182679857': 1, '790658669': 3, '1534580804': 1, '1534580805': 1, '1123164658_0': 1, '1123164658_1': 2, '394517636': 2, '27516896': 1, '25439941': 1, '182979602': 1, '1534580808': 1, '1534580809': 1, '1534580803': 1 },
      after: { '182679857': 2, '1534580801_0': 1, '1534580801_1': 3, '24000913': 1, '1534580806': 1, '1534580807': 1, '1310980990': 1, '1123164658_0': 1 }
    },
    removeAfter: ['74281316_1', '1534580803_0', '1534580805_0'],
    // 端點（以座標比對 OSM 節點）
    stubN: { A_S_T: 1, A_S_L: 3, B_N: 1, B_N_L: 2, B_N_T: 1 },
    sinks: { A_S: [268, 138], A_S_T: [264, 74], A_S_L: [264, 74], B_N_L: [-1106, -102], B_N_T: [-1106, -102], B_S: [-914, 86], B_N: [-1106, -102], A_N: [70, -82], FLY1: [313, -261], FLY2: [289, -252] },
    sources: { A_S_on: [136, 64], B_S_on: [-1090, 80], B_N_on: [-979, -98], A_N_on: [278, -75], A_N_on2: [281, 267] },
    signals: { A_S: 'A_SR', A_S_T: 'A_S', A_S_L: 'A_S', B_N_L: 'B_N', B_N_T: 'B_N', B_S: 'B_S', B_N: 'B_N', A_N: 'A_N' }
  };
  const NEW_GROUP = { // 改善工程分項（供著色與說明）
    '1122274257': 'so', '1122274253': 'so', '1122274254': 'so', '1122274255': 'so', '1124093682': 'so', '1122274256': 'so',
    '1122274260': 'ni', '1122274258': 'ni', '1122274259': 'ni',
    '24000913': 'ws', '1534580806': 'ws', '1534580807': 'ws', '1310980990': 'ws',
    '1534580810': 'wn', '1534580811': 'wn', '1534580812': 'wn'
  };

  function buildNet(D, scen, terr, opt) {
    const surfOn = !(opt && opt.surf === false) && !!G.LK.Surf; // 地面道路車流：匝道端點改與地面路網銜接
    const after = scen === 'after';
    let edges = [];
    D.edges.forEach(src => {
      if (src.k === 'n' && !after) return;
      if (after && CFG.removeAfter.indexOf(src.id) >= 0) return;
      const way = src.id.split('_')[0];
      const e = { id: src.id, way, k: src.k, a: src.a, b: src.b, layer: src.ly, br: src.br, tu: src.tu, grp: NEW_GROUP[way] || '', dest: src.ds, nb: src.k === 'm' ? 4 : 0 };
      const pick = t => t && (t[src.id] !== undefined ? t[src.id] : t[way]);
      let n = pick(CFG.lanes.both); const na = after ? pick(CFG.lanes.after) : undefined; if (na !== undefined) n = na;
      e.n = n || src.ln || (src.k === 'm' ? 4 : src.k === 'v' ? 3 : 1);
      e.vlim = (src.k === 'm' || src.k === 'v') ? 100 : (src.ms || (src.br ? 50 : 60));
      e.lw = (src.k === 'm' || src.k === 'v') ? LW : (e.n > 1 ? 3.5 : 4.0);
      setGeom(e, resample(src.p, src.k !== 'm', src.k === 'm' ? 15 : 5));
      edges.push(e);
    });
    // 林口A南出匝道（Google 街景 2025/11）：起點 2 車道，至路口共 5 車道——最右 1 車道為雙白線分隔的右轉專用道（另一路段），
    // 其左 4 車道為左轉 3、左轉／直行共用 1。改善後依計畫另增 1 條右轉車道
    { const r = split('790658669_0', Math.max(20, byLen('790658669_0') - 60), 3, 4); if (r) r[0].shiftNext = -1; }
    // 林口B北出匝道末端展寬為 3 車道（衛星影像可見三列停等車輛）
    split('74281305_0', Math.max(20, byLen('74281305_0') - 90), 2, 3);
    // 匝道端點銜接地面道路：出口車輛駛入地面道路後離開模型，入口車輛由地面道路進場
    const nearPt = (x, y, c) => Math.hypot(x - c[0], y - c[1]) < 14;
    for (const key in (D.stubs || {})) {
      const out = key in CFG.sinks, c = out ? CFG.sinks[key] : CFG.sources[key]; if (!c) continue;
      const ramp = edges.find(e => out ? nearPt(e.X[e.np - 1], e.Y[e.np - 1], c) : nearPt(e.X[0], e.Y[0], c)); if (!ramp) continue;
      const p = D.stubs[key].map(q => q.slice());
      if (out) p[0] = [ramp.X[ramp.np - 1], ramp.Y[ramp.np - 1]]; else p[p.length - 1] = [ramp.X[0], ramp.Y[0]];
      const e = { id: 'stub_' + key, way: 'stub', k: 's', a: out ? ramp.b : 'stubsrc:' + key, b: out ? 'stubend:' + key : ramp.a, layer: 0, br: 0, tu: 0, grp: '', dest: '', n: CFG.stubN[key] || ramp.n, vlim: 50, lw: 3.0, stub: out ? 'out' : 'in', stubKey: key };
      if (out) ramp.sigKey = CFG.signals[key] || null;
      let rp = resample(p, true, 5);
      if (surfOn) { // 只保留緊鄰匝道端點的 25 m（路口內的轉向軌跡），其餘交給地面路網
        if (!out) rp.reverse();
        let L = 0, k = 1; for (; k < rp.length - 1; k++) { L += Math.hypot(rp[k][0] - rp[k - 1][0], rp[k][1] - rp[k - 1][1]); if (L >= 25) break; }
        rp = rp.slice(0, k + 1); if (!out) rp.reverse();
      }
      setGeom(e, rp); edges.push(e);
    }
    function byLen(id) { const e = edges.find(q => q.id === id); return e ? e.len : 0; }
    function split(id, sAt, n1, n2) {
      const i = edges.findIndex(e => e.id === id); if (i < 0) return;
      const e = edges[i], k = idxAt(e, sAt) + 1, p1 = [], p2 = [];
      for (let q = 0; q <= k; q++) p1.push([e.X[q], e.Y[q]]); for (let q = k; q < e.np; q++) p2.push([e.X[q], e.Y[q]]);
      const nid = 'sp:' + id + ':' + Math.round(sAt);
      const e1 = Object.assign({}, e, { id: id + 'a', b: nid, n: n1 }), e2 = Object.assign({}, e, { id: id + 'b', a: nid, n: n2 });
      setGeom(e1, p1); setGeom(e2, p2); edges.splice(i, 1, e1, e2); return [e1, e2];
    }
    // 南下主線 39.4K 至林口A南出：現況 5 車道（OSM），改善後拓寬增加 1 車道
    { const e = edges.find(q => q.id === '694423904_0'); if (e) { split('694423904_0', e.len - 437, 5, after ? 6 : 5); const t = edges.find(q => q.id === '1149178849_0'); if (t) t.n = after ? 6 : 5; } }
    // 北上林口A入口下游：2 車道匝道併入後漸變 6→5→4（依實測通過量校估之假設）
    { const e = edges.find(q => q.id === '327721839_0'); if (e) { if (after) { const t = edges.find(q => q.id === '47442771_1'); if (t) t.n = 3; const r0 = split('327721839_0', 150, 7, 4); if (r0) { const r = split(r0[1].id, 200, 6, 4); if (r) split(r[1].id, 400, 5, 4); } } else { const r = split('327721839_0', 200, 6, 4); if (r) split(r[1].id, 400, 5, 4); } } }

    const byId = {}; const nodeIn = {}, nodeOut = {};
    edges.forEach((e, i) => { e.i = i; byId[e.id] = e; e.L = []; for (let l = 0; l < e.n; l++) e.L.push([]); e.det = []; (nodeOut[e.a] = nodeOut[e.a] || []).push(e); (nodeIn[e.b] = nodeIn[e.b] || []).push(e); });
    edges.forEach(e => { e.outs = nodeOut[e.b] || []; e.ins = nodeIn[e.a] || []; e.dirW = e.X[e.np - 1] < e.X[0]; });
    const P = [0, 0, 0, 0, 0, 0];
    // 橫向位置：edge 末端前 25 m 相對於參考方向的左右
    function sideOf(e, ref, atEnd) {
      const pe = atEnd ? posAt(e, Math.max(0, e.len - 25), 0, []) : posAt(e, Math.min(e.len, 25), 0, []);
      const pr = atEnd ? posAt(ref, Math.max(0, ref.len - 25), 0, []) : posAt(ref, Math.min(ref.len, 25), 0, []);
      const h = atEnd ? posAt(ref, ref.len, 0, []) : posAt(ref, 0, 0, []);
      return (pe[0] - pr[0]) * h[4] - (pe[1] - pr[1]) * h[3]; // >0：e 在 ref 右側
    }
    // 轉移表：e.tr[outId] = {o, lo, hi, shift, yield?}
    edges.forEach(e => {
      e.tr = {}; e.merge = null;
      const outs = e.outs;
      if (!outs.length) return;
      if (outs.length >= 2) {
        const sorted = outs.slice().sort((p, q) => sideOf(p, outs[0], false) - sideOf(q, outs[0], false)); // 左→右
        sorted.forEach((o, j) => {
          if (j === 0) e.tr[o.id] = { o, lo: 0, hi: Math.min(e.n, o.n) - 1, shift: 0 };
          else { const lo = Math.max(0, e.n - o.n); e.tr[o.id] = { o, lo, hi: e.n - 1, shift: lo }; }
        });
        return;
      }
      const o = outs[0], ins = nodeIn[e.b];
      if (ins.length === 1) { e.tr[o.id] = { o, lo: 0, hi: Math.min(e.n, o.n) - 1, shift: e.shiftNext || 0 }; return; }
      const f = ins.find(q => q !== e), right = sideOf(e, f, true) > 0;
      if (e.n + f.n <= o.n) { e.tr[o.id] = right ? { o, lo: 0, hi: e.n - 1, shift: -(o.n - e.n) } : { o, lo: 0, hi: e.n - 1, shift: 0 }; return; }
      const rank = q => (q.k === 'm' ? 100 : 0) + q.n * 10 + (q.k === 'n' ? -1 : 0);
      const major = rank(e) >= rank(f) ? e : f;
      if (major === e) { e.tr[o.id] = right ? { o, lo: Math.max(0, e.n - o.n), hi: e.n - 1, shift: Math.max(0, e.n - o.n) } : { o, lo: 0, hi: Math.min(e.n, o.n) - 1, shift: 0 }; }
      else {
        const adj = right ? 0 : e.n - 1; // 匝道上緊鄰主線的車道
        e.merge = { major: f, mlane: right ? f.n - 1 : 0, adj, zone: Math.min(300, e.len * 0.85) };
        e.tr[o.id] = { o, lo: adj, hi: adj, shift: 0, yield: true };
      }
    });
    { const e = edges.find(q => q.id === '790658669_0b'), L = e && e.tr.stub_A_S_L, T = e && e.tr.stub_A_S_T; if (L && T) { L.lo = 0; L.hi = 3; L.shift = 0; T.lo = 3; T.hi = 3; T.shift = 3; } } // 最右車道左轉／直行共用
    { const e = edges.find(q => q.id === '74281305_0b'), t = e && e.tr; if (t && t.stub_B_N_L && t.stub_B_N_T && t.stub_B_N) { Object.assign(t.stub_B_N_L, { lo: 0, hi: 1, shift: 0 }); Object.assign(t.stub_B_N_T, { lo: 2, hi: 2, shift: 2 }); Object.assign(t.stub_B_N, { lo: 2, hi: 2, shift: 2 }); } } // 林口B北出：左側 2 車道左轉過橋，最右車道直行／右轉
    // 端點比對
    const near = (x, y, c) => Math.hypot(x - c[0], y - c[1]) < 14;
    const sinks = {}, sources = {};
    edges.forEach(e => {
      if (e.sigKey) e.sig = e.sigKey;
      if (e.stub === 'out') { sinks[e.stubKey] = e; e.sink = e.stubKey; return; }
      if (e.stub === 'in') { sources[e.stubKey] = e; e.source = e.stubKey; return; }
      const ex = e.X[e.np - 1], ey = e.Y[e.np - 1], sx = e.X[0], sy = e.Y[0];
      if (!e.outs.length) {
        for (const k in CFG.sinks) if (near(ex, ey, CFG.sinks[k])) { sinks[k] = e; e.sink = k; e.sig = CFG.signals[k] || null; }
        if (!e.sink) { if (e.k === 'm') { const k = e.dirW ? 'S_out' : 'N_out'; sinks[k] = e; e.sink = k; } else if (e.k === 'v') { const k = e.dirW ? 'VS_out' : 'VN_out'; sinks[k] = e; e.sink = k; } }
      }
      if (!e.ins.length) {
        for (const k in CFG.sources) if (near(sx, sy, CFG.sources[k])) { sources[k] = e; e.source = k; }
        if (!e.source) { if (e.k === 'm') { const k = e.dirW ? 'S_in' : 'N_in'; sources[k] = e; e.source = k; } else if (e.k === 'v') { const k = e.dirW ? 'VS_in' : 'VN_in'; sources[k] = e; e.source = k; } }
      }
    });
    // ---- 高程 ----
    edges.forEach(e => { e.OFF.fill(0); e.seed = new Float64Array(e.np); });
    // 高架橋：分層高度
    const SL = 0.075;
    edges.forEach(e => {
      if (e.k === 'm' || e.k === 'v' || !e.br) return;
      const H = e.layer >= 2 ? 11 : 7.5;
      // 橋群起迄距離
      let up = 0, q = e; while (q.ins.length === 1 && q.ins[0].br && q.ins[0].k !== 'm') { q = q.ins[0]; up += q.len; }
      let down = 0; q = e; while (q.outs.length && q.outs.some(o => o.br)) { q = q.outs.find(o => o.br); down += q.len; }
      const need = H / SL; let any = false;
      for (let i = 0; i < e.np; i++) { const ds = up + e.S[i], de = down + e.len - e.S[i]; if (ds > need && de > need * 0.8) { e.seed[i] = H; any = true; } }
      if (!any && up === 0 && down === 0) e.seed[e.np >> 1] = Math.min(H, e.len / 2 * SL);
    });
    // 箱涵：與箱涵路段平面重疊之其他匝道抬升跨越（模型以跨越呈現立體分離）
    const tunnels = edges.filter(e => e.tu);
    tunnels.forEach(t => {
      edges.forEach(o => {
        if (o === t || o.k === 'm' || o.k === 'v' || o.tu || o.a === t.a || o.a === t.b || o.b === t.a || o.b === t.b) return;
        for (let i = 0; i < o.np; i++) for (let j = 0; j < t.np; j++) if (Math.abs(o.X[i] - t.X[j]) < 7 && Math.abs(o.Y[i] - t.Y[j]) < 7) { o.seed[i] = 5.8; o.over = true; break; }
      });
    });
    const nodeOff = {}, fixed = {};
    const isFix = e => e.k === 'm' || e.k === 'v' || e.tu;
    edges.forEach(e => { if (isFix(e)) { fixed[e.a] = 1; fixed[e.b] = 1; } });
    for (let pass = 0; pass < 6; pass++) {
      edges.forEach(e => {
        if (isFix(e)) return;
        const o = e.OFF; for (let i = 0; i < e.np; i++) o[i] = Math.max(o[i], e.seed[i]);
        o[0] = Math.max(o[0], nodeOff[e.a] || 0); o[e.np - 1] = Math.max(o[e.np - 1], nodeOff[e.b] || 0);
        for (let i = 1; i < e.np; i++) o[i] = Math.max(o[i], o[i - 1] - (e.S[i] - e.S[i - 1]) * SL);
        for (let i = e.np - 2; i >= 0; i--) o[i] = Math.max(o[i], o[i + 1] - (e.S[i + 1] - e.S[i]) * SL);
      });
      edges.forEach(e => { if (isFix(e)) return; if (!fixed[e.a]) nodeOff[e.a] = Math.max(nodeOff[e.a] || 0, e.OFF[0]); if (!fixed[e.b]) nodeOff[e.b] = Math.max(nodeOff[e.b] || 0, e.OFF[e.np - 1]); });
    }
    edges.forEach(e => { // 與主線、箱涵相接處回到路面高程
      if (isFix(e)) return;
      for (let i = 0; i < e.np; i++) { if (fixed[e.a]) e.OFF[i] = Math.min(e.OFF[i], e.S[i] * 0.09); if (fixed[e.b]) e.OFF[i] = Math.min(e.OFF[i], (e.len - e.S[i]) * 0.09); }
    });
    // 匝道縱斷面：主線端為國道路面高程、地面道路端為台地面高程，中間節點以鄰接路段長度加權求解
    const nodeZ = {}, fixZ = {};
    edges.forEach(e => { if (e.k === 'm') { fixZ[e.a] = terr.M(e.X[0]); fixZ[e.b] = terr.M(e.X[e.np - 1]); } });
    edges.forEach(e => { if (e.k !== 's') return; const o = e.stub === 'out', n = o ? e.a : e.b, i = o ? 0 : e.np - 1; if (!(n in fixZ)) fixZ[n] = terr.N(e.X[i], e.Y[i]); });
    const lk = edges.filter(e => e.k === 'l' || e.k === 'n');
    lk.forEach(e => { if (!e.outs.length && !(e.b in fixZ)) fixZ[e.b] = terr.N(e.X[e.np - 1], e.Y[e.np - 1]); if (!e.ins.length && !(e.a in fixZ)) fixZ[e.a] = terr.N(e.X[0], e.Y[0]); });
    lk.forEach(e => { nodeZ[e.a] = e.a in fixZ ? fixZ[e.a] : terr.M(e.X[0]); nodeZ[e.b] = e.b in fixZ ? fixZ[e.b] : terr.M(e.X[e.np - 1]); });
    for (let it = 0; it < 300; it++) {
      const sw = {}, sz = {};
      lk.forEach(e => { const w = 1 / Math.max(20, e.len); sw[e.a] = (sw[e.a] || 0) + w; sz[e.a] = (sz[e.a] || 0) + w * nodeZ[e.b]; sw[e.b] = (sw[e.b] || 0) + w; sz[e.b] = (sz[e.b] || 0) + w * nodeZ[e.a]; });
      for (const n in sw) if (!(n in fixZ)) nodeZ[n] = sz[n] / sw[n];
    }
    edges.forEach(e => {
      for (let i = 0; i < e.np; i++) {
        const x = e.X[i], y = e.Y[i];
        if (e.k === 'm') e.Z[i] = terr.M(x);
        else if (e.k === 'v') { // 高架：至少高於國道 17 m，且高於沿線平滑後的原地面 9 m（山坡段）
          const hi = e.layer >= 5 ? 6.5 * sstep(Math.min(e.S[i], e.len - e.S[i]) / 300) : 0; let ns = 0; for (let q = -4; q <= 4; q++) ns += terr.N(x + q * 45, y); ns /= 9;
          e.Z[i] = Math.max(terr.M(x) + 17, ns + 9) + hi; e.OFF[i] = e.Z[i] - terr.M(x);
        }
        else if (e.k === 's') e.Z[i] = terr.N(x, y) + e.OFF[i];
        else e.Z[i] = nodeZ[e.a] + (nodeZ[e.b] - nodeZ[e.a]) * sstep(e.S[i] / e.len) * 0.5 + (nodeZ[e.b] - nodeZ[e.a]) * (e.S[i] / e.len) * 0.5 + e.OFF[i];
      }
      // 縱坡（每 60 m 平滑）
      e.GR = new Float32Array(e.np);
      for (let i = 0; i < e.np; i++) { const s0 = Math.max(0, e.S[i] - 30), s1 = Math.min(e.len, e.S[i] + 30); const a = posAt(e, s0, 0, P)[2], b = posAt(e, s1, 0, P)[2]; e.GR[i] = (b - a) / Math.max(1, s1 - s0); }
    });
    // ---- 路徑 ----
    function route(src, dst) {
      const dist = new Map([[src, 0]]), prev = new Map(), open = [src];
      while (open.length) { open.sort((p, q) => dist.get(p) - dist.get(q)); const u = open.shift(); if (u === dst) break; u.outs.forEach(o => { const nd = dist.get(u) + u.len / u.vlim; if (!dist.has(o) || nd < dist.get(o)) { dist.set(o, nd); prev.set(o, u); if (open.indexOf(o) < 0) open.push(o); } }); }
      if (!dist.has(dst)) return null;
      const path = []; let u = dst; while (u) { path.unshift(u); u = prev.get(u); }
      return mkPath(path);
    }
    function needAt(path, i, e, nextNeed) { // 車輛位於 e（path[i] 或其合流主線）末端時須在的車道範圍
      if (i >= path.length - 1) return [0, e.n - 1];
      const o = path[i + 1], tr = e.tr[o.id]; if (!tr) return [0, e.n - 1];
      let lo = tr.lo, hi = tr.hi;
      if (nextNeed) { const k = Math.floor(o.len / ((o.k === 'm' && o.n <= 5) ? 800 : 250)); const a = nextNeed[0] + tr.shift - k, b = nextNeed[1] + tr.shift + k; const l2 = Math.max(lo, a), h2 = Math.min(hi, b); if (l2 <= h2) { lo = l2; hi = h2; } else if (a > hi) lo = hi; else hi = lo; }
      return [lo, hi];
    }
    function mkPath(edgesArr) {
      const need = new Array(edgesArr.length); let len = 0;
      for (let i = edgesArr.length - 1; i >= 0; i--) { need[i] = needAt(edgesArr, i, edgesArr[i], need[i + 1]); len += edgesArr[i].len; }
      return { e: edgesArr, need, len };
    }
    const net = { scen, edges, byId, sinks, sources, route, needAt, mkPath, terr, tunnels };
    if (surfOn) net.surf = new G.LK.Surf(D, net);
    return net;
  }

  // ---------------- 模擬 ----------------
  const DEF = { growth: 1, alphaS: 0.68, alphaN: 0.45, betaS: 0.45, betaN: 0.62, left: 0.31, thru: 0.15, newOn: 0.30, bLeft: 0.6, bThru: 0.15, bg: 0.5, spill: false, diamond: false, cycle: 150, gc: { A_S: 0.32, A_SR: 0.65, B_S: 0.45, B_N: 0.45, A_N: 0.65 }, gcAfter: { A_S: 0.32, A_SR: 0.65, B_S: 0.45, B_N: 0.45, A_N: 0.65 }, bound: true, seed: 20260908 };

  function Sim(net, D, par, t0) {
    this.net = net; this.D = D; this.par = Object.assign({}, DEF, par || {}); this.par.gc = Object.assign({}, DEF.gc, (par && par.gc) || {});
    if (net.scen === 'after') this.par.gc = Object.assign({}, DEF.gcAfter, (par && par.gcAfter) || {}); // 改善後的號誌時制另行設定，不沿用現況校估值
    this.t = t0 || 0; this.veh = []; this.rand = rng(this.par.seed); this.nid = 1;
    this.srcQ = {}; this.srcAcc = {}; this.paths = {};
    for (const k in net.sources) { this.srcQ[k] = []; this.srcAcc[k] = this.rand(); }
    this.setupDetectors(); this.resetStats();
    if (net.surf) net.surf.reset(this);
  }
  Sim.prototype.resetStats = function () {
    this.bins = {}; // key -> {n, sumT, sumD} per 5 分鐘
    this.mov = {};  // 動向統計
    this.done = 0;
  };
  Sim.prototype.setupDetectors = function () {
    const net = this.net, dets = this.dets = {};
    const place = (name, west, x) => {
      let best = null;
      net.edges.forEach(e => { if (e.k !== 'm' || e.dirW !== west) return; const x0 = Math.min(e.X[0], e.X[e.np - 1]), x1 = Math.max(e.X[0], e.X[e.np - 1]); if (x >= x0 && x <= x1) { let bi = 0, bd = 1e9; for (let i = 0; i < e.np; i++) { const d = Math.abs(e.X[i] - x); if (d < bd) { bd = d; bi = i; } } best = { e, s: e.S[bi] }; } });
      if (best) { const d = { name, e: best.e, s: best.s, x }; best.e.det.push(d); dets[name] = d; }
    };
    place('S_E', true, 3640); place('S_M', true, -150); place('S_W', true, -3950);
    place('N_W', false, -3950); place('N_M', false, -300); place('N_E', false, 3640);
    this.pairs = { 'S_E>S_M': '01F0376S>01F0413S', 'S_M>S_W': '01F0413S>01F0467S', 'N_W>N_M': '01F0467N>01F0413N', 'N_M>N_E': '01F0413N>01F0376N' };
    this.pairDist = {};
    for (const pk in this.pairs) { const ab = pk.split('>'), d1 = dets[ab[0]], d2 = dets[ab[1]]; if (d1 && d2) { const r = d1.e === d2.e ? { len: d1.e.len } : net.route(d1.e, d2.e); if (r) this.pairDist[pk] = r.len - d1.s - (d2.e.len - d2.s); } }
    this.detG = { S_E: '01F0376S', S_M: '01F0413S', S_W: '01F0467S', N_W: '01F0467N', N_M: '01F0413N', N_E: '01F0376N' };
  };
  Sim.prototype.bin = function (key, b) { const B = this.bins[key] || (this.bins[key] = {}); return B[b] || (B[b] = { n: 0, st: 0, sd: 0 }); };

  // 需求：由門架 5 分鐘實測量推得各起點到達率與迄點比例
  Sim.prototype.demand = function () {
    const V = this.D.vol, p = this.par, tb = this.t / 300, b = Math.floor(tb) % 288;
    const q = g => { const r = V[g][b]; return r[0] + r[1] + r[2] + r[3] + r[4]; };
    const k = p.growth / 300;
    const sIn = q('01F0376S'), sM = q('01F0413S'), sOut = q('01F0467S'), nIn = q('01F0467N'), nM = q('01F0413N'), nOut = q('01F0376N');
    const xS = Math.max(0, sIn - sM), eS = Math.max(0, sOut - sM), xN = Math.max(0, nIn - nM), eN = Math.max(0, nOut - nM);
    const after = this.net.scen === 'after';
    const pxS = sIn ? xS / sIn : 0, pxN = nIn ? xN / nIn : 0;
    const aL = p.alphaS * p.left, aT = p.alphaS * p.thru, aR = p.alphaS * (1 - p.left - p.thru);
    const d = {
      S_in: { r: sIn * k, mix: V['01F0376S'][b], to: [['S_out', 1 - pxS], ['A_S_R', pxS * aR], ['A_S_L', pxS * aL], ['A_S_T', pxS * aT], ['B_S', pxS * (1 - p.alphaS)]] },
      N_in: { r: nIn * k, mix: V['01F0467N'][b], to: [['N_out', 1 - pxN], ['A_N', pxN * p.alphaN], ['B_N_L', pxN * (1 - p.alphaN) * p.bLeft], ['B_N_T', pxN * (1 - p.alphaN) * p.bThru], ['B_N', pxN * (1 - p.alphaN) * (1 - p.bLeft - p.bThru)]] },
      A_S_on: { r: eS * p.betaS * k, mix: V['01F0467S'][b], to: [['S_out', 1]] },
      B_S_on: { r: eS * (1 - p.betaS) * k, mix: V['01F0467S'][b], to: [['S_out', 1]] },
      A_N_on: { r: eN * p.betaN * (after ? 1 - p.newOn : 1) * k, mix: V['01F0376N'][b], to: [['N_out', 1]] },
      A_N_on2: { r: after ? eN * p.betaN * p.newOn * k : 0, mix: V['01F0376N'][b], to: [['N_out', 1]] },
      B_N_on: { r: eN * (1 - p.betaN) * k, mix: V['01F0376N'][b], to: [['N_out', 1]] },
      VS_in: { r: q('01H0447S') * k, mix: V['01H0447S'][b], to: [['VS_out', 1]] },
      VN_in: { r: q('01H0447N') * k, mix: V['01H0447N'][b], to: [['VN_out', 1]] }
    };
    this.cur = { xS, eS, xN, eN, sIn, nIn };
    // 下游邊界：以下一組門架區間實測速率作為出口速率（僅在低於 80 km/h 時作用）
    const bS = this.D.spd['01F0467S>01F0492S'][b], bN = this.D.spd['01F0376N>01F0340N'][b];
    this.bnd = p.bound ? { S_out: bS > 0 && bS < 80 ? bS / 3.6 : 0, N_out: bN > 0 && bN < 80 ? bN / 3.6 : 0 } : null;
    return d;
  };
  Sim.prototype.sinkFor = function (dst) {
    const after = this.net.scen === 'after';
    if (dst === 'A_S_R') return 'A_S';
    if (dst === 'A_S_L') return after ? (this.rand() < 0.5 ? 'FLY1' : 'FLY2') : 'A_S_L';
    return dst;
  };
  Sim.prototype.pathFor = function (src, sink) {
    const key = src + '>' + sink; let p = this.paths[key];
    if (p === undefined) { const a = this.net.sources[src], b = this.net.sinks[sink]; p = this.paths[key] = (a && b) ? this.net.route(a, b) : null; }
    return p;
  };
  Sim.prototype.spawn = function (dt) {
    const dem = this.demand(), ff = this.D.ff;
    for (const src in dem) {
      const s = dem[src], e = this.net.sources[src]; if (!e || s.r <= 0) continue;
      this.srcAcc[src] += s.r * dt;
      const Q = this.srcQ[src];
      while (this.srcAcc[src] >= 1) {
        this.srcAcc[src] -= 0.5 + this.rand(); // 平均 1，帶隨機性
        let r = this.rand(), dst = s.to[0][0]; for (let i = 0; i < s.to.length; i++) { r -= s.to[i][1]; if (r <= 0) { dst = s.to[i][0]; break; } }
        const m = s.mix, tot = m[0] + m[1] + m[2] + m[3] + m[4] || 1; let c = 0, rr = this.rand() * tot; for (; c < 4; c++) { rr -= m[c]; if (rr <= 0) break; }
        if (e.k === 'v' && c > 2) c = 0;
        if (Q.length < 4000) { const it = { dst, cls: c, t: this.t }; if (!(e.stub === 'in' && this.net.surf && this.net.surf.toRamp(src, it))) Q.push(it); } // 入口匝道車輛先行駛地面道路抵達匝道口
      }
      // 嘗試放入路網
      let tries = e.n;
      while (Q.length && tries-- > 0) {
        const q = Q[0], sink = this.sinkFor(q.dst), path = this.pathFor(src, sink); if (!path) { Q.shift(); continue; }
        const C = CLS[q.cls]; let bestL = -1, bestGap = 0;
        const loL = (C.heavy && e.k === 'm' && e.n >= 3) ? e.n - 2 : 0;
        for (let l = loL; l < e.n; l++) { const arr = e.L[l], last = arr[arr.length - 1]; const gap = last ? last.s - last.len : 1e4; if (gap > bestGap) { bestGap = gap; bestL = l; } }
        const last = bestL >= 0 ? e.L[bestL][e.L[bestL].length - 1] : null;
        const v0 = Math.min(e.vlim, ff[q.cls]) / 3.6 * (e.k === 'm' || e.k === 'v' ? 1 : 0.6);
        const vin = last ? Math.min(v0, last.v + 1) : v0;
        if (bestL < 0 || bestGap < 6 + vin * 0.9) break;
        Q.shift();
        const f = 1 + (this.rand() + this.rand() + this.rand() - 1.5) * 0.09;
        const v = { id: this.nid++, cls: q.cls, len: C.len, f, T: C.T * (0.85 + this.rand() * 0.3), a: C.a, b: C.b, gf: C.gf, heavy: C.heavy, e, lane: bestL, s: 0, v: vin, acc: 0, path, pi: 0, need: path.need[0], tGen: q.t, t0: this.t, src, dst: q.dst, sink, lat: laneOff(e, bestL), ox: 0, oy: 0, lcT: this.t + this.rand() * 2, stuck: 0, yt: 0, yv: null, td: null, col: this.rand() };
        e.L[bestL].push(v); this.veh.push(v);
      }
    }
  };
  function idm(v, v0, gap, dv, T, a, b) {
    const free = 1 - Math.pow(v / v0, 4);
    if (gap > 1e3) return a * free;
    if (gap < 0.1) gap = 0.1;
    const ss = 2 + Math.max(0, v * T + v * dv / (2 * Math.sqrt(a * b)));
    return a * (free - (ss / gap) * (ss / gap));
  }
  const SIGOFF = { A_S: 0, B_S: 40, B_N: 75, A_N: 110 };
  Sim.prototype.green = function (key) { const p = this.par, off = SIGOFF[key] || 0; return ((this.t + off) % p.cycle) < p.gc[key] * p.cycle; };
  // 在 lane 陣列（依 s 遞減）找到插入位置：回傳第一個 s 小於給定值的索引
  function findIdx(arr, s) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].s > s) lo = m + 1; else hi = m; } return lo; }
  Sim.prototype.leaderAhead = function (v, e, lane, out) {
    // 跨路段尋找前車或停止線；out = [gap, vLead]
    let dist = e.len - v.s, pi = v.pi, cur = e, l = lane, depth = 0;
    while (depth < 4) {
      const next = v.path.e[pi + 1];
      if (cur.sig && !this.green(cur.sig)) { out[0] = dist - 1; out[1] = 0; return; }
      if (!next) { if (cur.stub === 'out' && this.net.surf) { this.net.surf.entryGap(cur.stubKey, out); out[0] += dist; return; } const vb = this.bnd && this.bnd[cur.sink]; if (vb) { out[0] = dist + 25; out[1] = vb; return; } out[0] = 1e4; out[1] = 0; return; }
      const tr = cur.tr[next.id];
      if (!tr || l < tr.lo || l > tr.hi || tr.yield) { out[0] = dist - 1.5; out[1] = 0; return; }
      let l2 = l - tr.shift; if (l2 < 0) l2 = 0; if (l2 >= next.n) l2 = next.n - 1;
      const arr = next.L[l2];
      if (arr.length) { const ld = arr[arr.length - 1]; out[0] = dist + ld.s - ld.len; out[1] = ld.v; return; }
      dist += next.len; if (dist > 260) { out[0] = 1e4; out[1] = 0; return; }
      cur = next; l = l2; pi++; depth++;
    }
    out[0] = 1e4; out[1] = 0;
  };
  Sim.prototype.accFor = function (v, e, lane, s, leader, tmp) {
    let gap, vl;
    if (leader) { gap = leader.s - leader.len - s; vl = leader.v; }
    else { const sv = v.s; v.s = s; this.leaderAhead(v, e, lane, tmp); v.s = sv; gap = tmp[0]; vl = tmp[1]; }
    const base = (e.k === 'm' || e.k === 'v') ? Math.min(e.vlim * 1.04, this.D.ff[v.cls]) : e.vlim;
    let v0 = base / 3.6 * v.f;
    if (e.merge && e.merge.major.k === 'm' && e.len - s < e.merge.zone) v0 = Math.max(v0, 88 / 3.6 * v.f); // 加速車道
    const gr = e.GR[idxAt(e, s)]; if (gr > 0.01) v0 *= 1 - v.gf * Math.min(gr, 0.07) * 6; // 上坡：重車爬坡速率下降
    const a = idm(v.v, v0, gap, v.v - vl, v.T, v.a, v.b);
    return a < -8 ? -8 : a;
  };
  Sim.prototype.step = function (dt) {
    const net = this.net, tmp = [0, 0], P1 = [0, 0, 0, 0, 0, 0], P2 = [0, 0, 0, 0, 0, 0];
    this.t += dt; const t = this.t;
    this.spawn(dt);
    if (net.surf) net.surf.step(dt, t);
    const edges = net.edges;
    // 1) 加速度
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei];
      for (let l = 0; l < e.n; l++) {
        const arr = e.L[l];
        for (let i = 0; i < arr.length; i++) {
          const v = arr[i];
          let a = this.accFor(v, e, l, v.s, i ? arr[i - 1] : null, tmp);
          if (v.yv) { // 禮讓匯入車
            const y = v.yv;
            if (t > v.yt || y.dead || y.e !== y.yFrom) v.yv = null;
            else { const ys = e.len - (y.e.len - y.s), gap = ys - y.len - v.s; if (gap > 0) { const ay = idm(v.v, 30, gap, v.v - y.v, v.T, v.a, v.b); if (ay < a) a = Math.max(ay, -2.2); } }
          }
          v.acc = a;
        }
      }
    }
    // 2) 車道變換與匯入
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei];
      for (let l = 0; l < e.n; l++) {
        const arr = e.L[l];
        for (let i = arr.length - 1; i >= 0; i--) {
          const v = arr[i]; if (t < v.lcT) continue;
          const dEnd = e.len - v.s, need = v.need;
          // 匝道末段：平行匯入主線
          if (e.merge && v.e === e && v.path.e[v.pi] === e) {
            const m = e.merge;
            if (l === m.adj && dEnd < m.zone) {
              const M = m.major, sm = M.len - dEnd;
              if (sm > 0) {
                {
                  const ta = M.L[m.mlane], k = findIdx(ta, sm), ld = k ? ta[k - 1] : null, fo = ta[k] || null;
                  const urgent = dEnd < 60 ? 1 : 0;
                  const g1 = ld ? ld.s - ld.len - sm : 1e4, g2 = fo ? sm - v.len - fo.s : 1e4;
                  const ok1 = g1 > (urgent ? 1.5 : 2.5) + Math.max(0, v.v - (ld ? ld.v : 0)) * (urgent ? 0.6 : 1.2);
                  const ok2 = g2 > (urgent ? 1.5 : 2.5) + Math.max(0, (fo ? fo.v : 0) - v.v) * (urgent ? 0.7 : 1.3) + (fo ? fo.v * 0.12 : 0);
                  if (ok1 && ok2) {
                    posAt(e, v.s, v.lat, P1);
                    arr.splice(i, 1); ta.splice(k, 0, v);
                    v.e = M; v.s = sm; v.lane = m.mlane; v.lat = laneOff(M, m.mlane);
                    posAt(M, sm, v.lat, P2); v.ox += P1[0] - P2[0]; v.oy += P1[1] - P2[1];
                    v.need = net.needAt(v.path.e, v.pi, M, v.path.need[v.pi + 1]); v.lcT = t + 2.5; v.merged = true;
                    continue;
                  } else if (fo && g1 > 2 && !fo.yv) { fo.yv = v; v.yFrom = e; fo.yt = t + 2.5; }
                }
              }
            }
          }
          const trig = e.len < 350 ? 1e4 : e.k === 'm' ? 1400 : 420;
          let dir = 0, mand = false;
          if (l < need[0]) { if (dEnd < trig + 260 * (need[0] - l)) { dir = 1; mand = true; } }
          else if (l > need[1]) { if (dEnd < trig + 260 * (l - need[1])) { dir = -1; mand = true; } }
          const hvLo = (v.heavy && e.k === 'm' && e.n >= 3) ? Math.max(0, Math.min(e.n - 2, need[1] - 1)) : 0; // 大型車限行外側兩車道
          if (!dir && l < hvLo) { dir = 1; mand = true; }
          if (!dir) {
            // 自由變換：前方受阻且鄰道較快
            if (v.acc > v.a * 0.25 - 0.2 || v.v < 1) { v.lcT = t + 0.6; continue; }
            const lim = dEnd < trig + 200;
            let best = 0, bestA = v.acc + 0.35;
            for (let d = -1; d <= 1; d += 2) {
              const tl = l + d; if (tl < 0 || tl >= e.n || tl < hvLo) continue;
              if (lim && (tl < need[0] || tl > need[1])) continue;
              const ta = e.L[tl], k = findIdx(ta, v.s), ld = k ? ta[k - 1] : null, fo = ta[k] || null;
              if (ld && ld.s - ld.len - v.s < 3 + v.v * 0.5) continue;
              if (fo && v.s - v.len - fo.s < 3 + fo.v * 0.6 + Math.max(0, fo.v - v.v) * 1.5) continue;
              const a2 = this.accFor(v, e, tl, v.s, ld, tmp); if (a2 > bestA) { bestA = a2; best = d; }
            }
            if (!best) { v.lcT = t + 0.8; continue; }
            dir = best;
          }
          const tl = l + dir; if (tl < 0 || tl >= e.n) { v.lcT = t + 0.5; continue; }
          const ta = e.L[tl], k = findIdx(ta, v.s), ld = k ? ta[k - 1] : null, fo = ta[k] || null;
          const urgent = mand && (dEnd < 150 || v.v < 3);
          const g1 = ld ? ld.s - ld.len - v.s : 1e4, g2 = fo ? v.s - v.len - fo.s : 1e4;
          let ok1 = g1 > (urgent ? 0.6 : 2.5) + Math.max(0, v.v - (ld ? ld.v : 0)) * (urgent ? 0.5 : 1.2);
          let ok2 = g2 > (urgent ? 0.6 : 2.5) + Math.max(0, (fo ? fo.v : 0) - v.v) * (urgent ? 0.6 : 1.3) + (fo && !urgent ? fo.v * 0.15 : 0);
          if (mand && ((v.stuck > 20 && g1 > 0.3) || (v.stuck > 45 && g1 > -1.5))) { ok1 = ok2 = true; this.forced = (this.forced || 0) + 1; } // 久候強行切入，避免死結
          if (ok1 && ok2) { arr.splice(i, 1); ta.splice(k, 0, v); v.lane = tl; v.lcT = t + (mand ? 1.2 : 4); }
          else {
            v.lcT = t + 0.4;
            if (mand && v.v < 14) { // 請目標車道後方第一輛「車頭在我車尾之後」的車禮讓
              let q = k; while (q < ta.length && v.s - v.len - ta[q].s < 0.5) q++;
              const y = ta[q]; if (y && v.s - y.s < 60 && !(y.czBan > t) && (!y.cz || y.cz === v || t > y.czT)) { if (y.cz !== v) y.czS = t; y.cz = v; y.czT = t + 3; }
            }
          }
        }
      }
    }
    // 3) 積分與路段轉移
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei];
      for (let l = 0; l < e.n; l++) {
        const arr = e.L[l];
        for (let i = 0; i < arr.length; i++) {
          const v = arr[i];
          let a = v.acc;
          if (v.cz) { const c = v.cz; if (t - v.czS > 7) { v.cz = null; v.czBan = t + 15; } else if (t > v.czT || c.dead || c.e !== e || c.lane === l) v.cz = null; else { const gap = c.s - c.len - v.s; if (gap > 0.5) { const ay = idm(v.v, 30, gap, v.v - c.v, v.T, v.a, v.b); if (ay < a) a = Math.max(ay, -2); } } }
          let nv = v.v + a * dt; if (nv < 0) nv = 0;
          const s0 = v.s; v.s += (v.v + nv) * 0.5 * dt; v.v = nv;
          if (i) { const ld = arr[i - 1], lim = ld.s - ld.len - 0.4; if (v.s > lim) { v.s = Math.max(s0, lim); if (v.v > ld.v) v.v = ld.v; } }
          if (nv < 0.5) v.stuck += dt; else v.stuck = 0;
          // 橫向位置平滑
          const tgt = laneOff(e, l), dl = tgt - v.lat, mx = (0.9 + nv * 0.03) * dt; v.lat += dl > mx ? mx : dl < -mx ? -mx : dl;
          if (v.ox || v.oy) { const d = Math.hypot(v.ox, v.oy), k = Math.max(0, 1 - Math.max(2.5, d * 0.5) * dt / d); v.ox *= k; v.oy *= k; }
          if (e.det.length) for (let q = 0; q < e.det.length; q++) { const d = e.det[q]; if (s0 < d.s && v.s >= d.s) this.hit(v, d); }
        }
      }
    }
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei];
      for (let l = 0; l < e.n; l++) {
        const arr = e.L[l];
        while (arr.length && arr[0].s >= e.len) {
          const v = arr[0], next = v.path.e[v.pi + 1];
          if (e.sig && !this.green(e.sig)) { v.s = e.len - 0.3; v.v = 0; break; }
          if (!next) {
            if (e.stub === 'out' && net.surf && !net.surf.fromRamp(v, e)) { v.s = e.len - 0.3; v.v = 0; break; } // 地面道路回堵：停等於匝道端
            arr.shift(); this.finish(v); continue;
          }
          const tr = e.tr[next.id];
          let okLane = tr && l >= tr.lo && l <= tr.hi && !tr.yield;
          if (!okLane && e.k === 'm' && tr && !tr.yield && v.stuck > 6) { // 主線上來不及變換車道：錯過出口，續行主線
            const alt = e.outs.find(o => o !== next && e.tr[o.id] && l >= e.tr[o.id].lo && l <= e.tr[o.id].hi);
            const fb = net.sinks[e.dirW ? 'S_out' : 'N_out'];
            if (alt && fb) { const r = net.route(alt, fb); if (r) { v.path = net.mkPath([e].concat(r.e)); v.pi = 0; v.need = v.path.need[0]; v.sink = fb.sink; v.missed = true; this.missed = (this.missed || 0) + 1; continue; } }
          }
          if (!okLane) {
            if (v.stuck > 20 && tr) { // 久候強制通過，避免死結
              let l2 = Math.max(0, Math.min(next.n - 1, (tr.yield ? (e.merge && e.merge.mlane === 0 ? 0 : next.n - 1) : Math.max(tr.lo, Math.min(tr.hi, l)) - tr.shift)));
              const ta = next.L[l2], last = ta[ta.length - 1];
              if (!last || last.s - last.len > 3) { arr.shift(); v.s = 0; v.e = next; v.lane = l2; v.pi++; v.need = v.path.need[v.pi]; v.lat = laneOff(next, l2); v.stuck = 0; ta.push(v); this.forced = (this.forced || 0) + 1; continue; }
            }
            v.s = e.len - 0.3; v.v = 0; break;
          }
          let l2 = l - tr.shift; if (l2 < 0) l2 = 0; if (l2 >= next.n) l2 = next.n - 1;
          const ta = next.L[l2], last = ta[ta.length - 1], ns = v.s - e.len;
          if (last && last.s - last.len < ns + 0.5) { v.s = e.len - 0.2; v.v = Math.min(v.v, last.v); break; }
          arr.shift();
          const dLat = v.lat - laneOff(e, l);
          v.s = ns; v.e = next; v.lane = l2; v.pi++; v.need = v.path.need[v.pi]; v.lat = laneOff(next, l2) + dLat; ta.push(v);
          if (next.stub === 'out') this.count(v); // 行駛時間計到通過匝道末端停止線
          if (next.det.length) for (let q = 0; q < next.det.length; q++) { const d = next.det[q]; if (v.s >= d.s) this.hit(v, d); }
        }
      }
    }
    if (this.veh.length > 64 && (this.sweep = (this.sweep || 0) + 1) % 40 === 0) this.veh = this.veh.filter(v => !v.dead);
  };
  Sim.prototype.hit = function (v, d) {
    const b = Math.floor(this.t / 300), B = this.bin('q:' + d.name, b); B.n++; B.st += v.v;
    if (!v.td) v.td = {};
    for (const pk in this.pairDist) { const ab = pk.split('>'); if (ab[1] === d.name && v.td[ab[0]] !== undefined) { const P = this.bin('v:' + pk, b); P.n++; P.st += this.t - v.td[ab[0]]; P.sd += this.pairDist[pk]; } }
    v.td[d.name] = this.t;
  };
  Sim.prototype.finish = function (v) { v.dead = true; this.done++; this.count(v); };
  Sim.prototype.count = function (v) {
    if (v.cnt) return; v.cnt = true;
    const key = v.src + '>' + v.dst, b = Math.floor(this.t / 300), B = this.bin('m:' + key, b);
    B.n++; B.st += this.t - v.tGen; B.sd += v.path.len;
  };
  // 目前路網狀態摘要
  Sim.prototype.snapshot = function () {
    const out = { n: 0, queued: 0, q: {}, srcQ: {}, spill: { S: 0, N: 0 } };
    this.net.edges.forEach(e => { let slow = 0, c = 0; for (let l = 0; l < e.n; l++) for (const v of e.L[l]) { c++; if (v.v < 2.8) { slow++; if (e.k === 'm' && v.dst !== 'S_out' && v.dst !== 'N_out') out.spill[e.dirW ? 'S' : 'N']++; } } e.cnt = c; e.slow = slow; out.n += c; out.queued += slow; });
    for (const k in this.srcQ) out.srcQ[k] = this.srcQ[k].length;
    return out;
  };
  G.LK = { LW, CLS, CFG, DEF, NEW_GROUP, SIGOFF, Terrain, buildNet, Sim, posAt, laneOff, idxAt, resample, sstep, setGeom, idm, findIdx, rng };
})(typeof window !== 'undefined' ? window : globalThis);
