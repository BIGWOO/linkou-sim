'use strict';
// 3D 場景：地形、道路、橋梁、建物、車輛（three.js r128）
(function () {
  const LK = window.LK, D = window.LINKOU, T3 = window.THREE;
  const BASE = 250; // 高程基準（林口台地約 250 m）
  const terr = LK.Terrain(D);
  const V = window.VIEW = { terr, BASE };
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

  // ---------- 貼圖 ----------
  function canvasTex(w, h, draw, rx, ry) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T3.CanvasTexture(c); t.wrapS = t.wrapT = T3.RepeatWrapping; if (rx) t.repeat.set(rx, ry || rx); t.anisotropy = 8; return t;
  }
  function noise(g, w, h, n, a, dark) { for (let i = 0; i < n; i++) { const v = dark ? 0 : 255; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (Math.random() * a) + ')'; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } }
  const texCache = {};
  // 車道貼圖：橫向為整個路幅（含路肩），縱向 10 m 一循環（車道線 4 m 線段、6 m 間距）
  function laneTex(n, lw, sl, sr, main) {
    const key = [n, lw, sl, sr, main].join(':'); if (texCache[key]) return texCache[key];
    const W = n * lw + sl + sr, pw = 512, ph = 256, k = pw / W;
    return texCache[key] = canvasTex(pw, ph, (g) => {
      g.fillStyle = '#55595f'; g.fillRect(0, 0, pw, ph); noise(g, pw, ph, 5000, 0.07, false); noise(g, pw, ph, 5000, 0.12, true);
      g.fillStyle = 'rgba(105,109,114,0.55)'; g.fillRect(0, 0, sl * k, ph); g.fillRect((sl + n * lw) * k, 0, sr * k, ph);
      for (let i = 0; i < n; i++) { g.fillStyle = 'rgba(20,20,22,0.10)'; g.fillRect((sl + i * lw + lw * 0.22) * k, 0, lw * 0.14 * k, ph); g.fillRect((sl + i * lw + lw * 0.64) * k, 0, lw * 0.14 * k, ph); }
      const lw2 = Math.max(2.5, 0.15 * k);
      g.fillStyle = '#e8c53a'; g.fillRect(sl * k - lw2 / 2, 0, lw2, ph);
      g.fillStyle = '#f2f2ee'; g.fillRect((sl + n * lw) * k - lw2 / 2, 0, lw2, ph);
      for (let i = 1; i < n; i++) g.fillRect((sl + i * lw) * k - lw2 / 2, 0, lw2, ph * 0.4);
    });
  }
  const TEX = {
    ground: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#e4e4de'; g.fillRect(0, 0, w, h); for (let i = 0; i < 5200; i++) { const c = 150 + Math.random() * 105; g.fillStyle = 'rgba(' + (c | 0) + ',' + (c | 0) + ',' + (c * 0.94 | 0) + ',' + (0.12 + Math.random() * 0.3) + ')'; const r = 1 + Math.random() * 4; g.fillRect(Math.random() * w, Math.random() * h, r, r * (0.6 + Math.random())); } }),
    street: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#6a6e73'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, 0.08, false); noise(g, w, h, 1500, 0.12, true); g.fillStyle = '#d9d9d2'; g.fillRect(2, 0, 3, h); g.fillRect(w - 5, 0, 3, h); g.fillStyle = '#e3c341'; g.fillRect(w / 2 - 1.5, 0, 3, h * 0.5); }),
    concrete: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#b9b7b0'; g.fillRect(0, 0, w, h); noise(g, w, h, 2500, 0.08, true); g.fillStyle = 'rgba(60,60,60,0.25)'; g.fillRect(0, 0, w, 2); })
  };
  function photoTex(k) { const TX = window.TEXS || {}; if (!TX[k]) return null; const t = new T3.Texture(); t.wrapS = t.wrapT = T3.RepeatWrapping; t.anisotropy = 8; const im = new Image(); im.onload = () => { t.image = im; t.needsUpdate = true; }; im.src = 'data:image/jpeg;base64,' + TX[k]; return t; }
  // 建物立面：一張貼圖代表 4 開間 × 4 層樓（12.8 m × 13.2 m）
  function facade(kind) {
    return canvasTex(256, 256, (g, w, h) => {
      const bw = w / 4, fh = h / 4;
      if (kind === 'apt') {
        g.fillStyle = '#d9d2c4'; g.fillRect(0, 0, w, h); noise(g, w, h, 1800, 0.05, true);
        for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) {
          const x = b * bw, y = f * fh;
          g.fillStyle = '#bfb7a6'; g.fillRect(x, y + fh - 6, bw, 6);
          if (b % 2 === 0) { g.fillStyle = '#8f8a80'; g.fillRect(x + 6, y + fh * 0.52, bw - 12, fh * 0.4); g.fillStyle = '#2f3b47'; g.fillRect(x + 12, y + 10, bw - 24, fh * 0.42); }
          else { g.fillStyle = '#31404d'; g.fillRect(x + 14, y + 14, bw - 28, fh * 0.5); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 14, y + 14, (bw - 28) / 2, fh * 0.5); }
          g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y, 2, fh);
        }
      } else if (kind === 'glass') {
        g.fillStyle = '#5d7f93'; g.fillRect(0, 0, w, h);
        for (let f = 0; f < 4; f++) for (let b = 0; b < 8; b++) { const sh = 0.75 + Math.random() * 0.35; g.fillStyle = 'rgb(' + (70 * sh | 0) + ',' + (110 * sh | 0) + ',' + (135 * sh | 0) + ')'; g.fillRect(b * bw / 2 + 2, f * fh + 12, bw / 2 - 4, fh - 16); }
        g.fillStyle = '#dfe3e2'; for (let f = 0; f < 4; f++) g.fillRect(0, f * fh, w, 10);
      } else if (kind === 'ind') {
        g.fillStyle = '#aab0b3'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 6) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x, 0, 2, h); }
        g.fillStyle = '#3a4650'; for (let b = 0; b < 4; b++) g.fillRect(b * bw + 10, h * 0.12, bw - 20, h * 0.1);
        g.fillStyle = '#7e8a90'; g.fillRect(0, h - 26, w, 26);
      } else if (kind === 'shop') {
        g.fillStyle = '#cfc8ba'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, 0.06, true);
        for (let f = 0; f < 4; f++) { g.fillStyle = '#39434d'; g.fillRect(8, f * fh + 12, w - 16, fh * 0.55); g.fillStyle = '#b5553a'; g.fillRect(0, f * fh + fh - 8, w, 4); }
      } else {
        g.fillStyle = '#c9c4b8'; g.fillRect(0, 0, w, h); noise(g, w, h, 1800, 0.06, true);
        for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) { g.fillStyle = '#3b4853'; g.fillRect(b * bw + 12, f * fh + 14, bw - 24, fh * 0.48); g.fillStyle = '#a9a394'; g.fillRect(b * bw + 8, f * fh + 14 + fh * 0.5, bw - 16, 5); }
      }
    });
  }

  // ---------- 幾何累加器 ----------
  function Acc() { return { p: [], n: [], u: [], c: [] }; }
  function tri(a, x1, y1, z1, x2, y2, z2, x3, y3, z3, col) {
    const ux = x2 - x1, uy = y2 - y1, uz = z2 - z1, vx = x3 - x1, vy = y3 - y1, vz = z3 - z1;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    a.p.push(x1, y1, z1, x2, y2, z2, x3, y3, z3); a.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    if (col) a.c.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
  }
  function quad(a, p1, p2, p3, p4, col, uv) { // p1-p2-p3-p4 環繞
    tri(a, p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], col); tri(a, p1[0], p1[1], p1[2], p3[0], p3[1], p3[2], p4[0], p4[1], p4[2], col);
    if (uv) a.u.push(uv[0], uv[2], uv[1], uv[2], uv[1], uv[3], uv[0], uv[2], uv[1], uv[3], uv[0], uv[3]); // uv = [u0, u1, v0, v1]
  }
  function box(a, cx, y0, cz, sx, sy, sz, col) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2, y1 = y0 + sy;
    quad(a, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col); quad(a, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col);
    quad(a, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col); quad(a, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col);
    quad(a, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col);
  }
  // 橋墩：矩形墩身，頂部以弧形向外展開成墩帽（五楊高架常見型式）
  function pier(a, x, y, g, top, hx, hy, cap, sh, th) {
    const nx = hy, ny = -hx, F = Math.min(6.5, (top - g) * 0.45), lev = [[g, sh, th]];
    for (let q = 0; q <= 7; q++) { const t = q / 7; lev.push([top - F + F * t, sh + (cap - sh) * t * t * (3 - 2 * t) * (0.55 + 0.45 * t), th * (1 + 0.15 * t)]); }
    const pt = (l, sa, sb) => [x + nx * l[1] * sa + hx * l[2] / 2 * sb, l[0] - BASE, -(y + ny * l[1] * sa + hy * l[2] / 2 * sb)], C = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    for (let i = 1; i < lev.length; i++) for (let k = 0; k < 4; k++) { const p = C[k], q = C[(k + 1) % 4]; quad(a, pt(lev[i - 1], p[0], p[1]), pt(lev[i - 1], q[0], q[1]), pt(lev[i], q[0], q[1]), pt(lev[i], p[0], p[1])); }
    const l = lev[lev.length - 1]; quad(a, pt(l, 1, 1), pt(l, 1, -1), pt(l, -1, -1), pt(l, -1, 1));
  }
  function beam(a, x1, y1, x2, y2, zt, dep, th) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L * th / 2, ny = dx / L * th / 2, p = (q, z) => [q[0], z - BASE, -q[1]];
    const A = [x1 + nx, y1 + ny], B = [x2 + nx, y2 + ny], C = [x2 - nx, y2 - ny], E2 = [x1 - nx, y1 - ny];
    for (const uv of [[A, B], [B, C], [C, E2], [E2, A]]) quad(a, p(uv[0], zt - dep), p(uv[1], zt - dep), p(uv[1], zt), p(uv[0], zt));
    quad(a, p(A, zt - dep), p(B, zt - dep), p(C, zt - dep), p(E2, zt - dep));
  }
  // 橋墩配置：墩位不得落在任何路面上。先沿橋軸前後找空地立單柱；找不到就在兩側空地立柱、以橫梁跨越（門型墩）
  function support(a, x, y, z, hx, hy, deckHalf, big) {
    const top = z - 1.5, ok = (px, py) => { Hq(px, py); return edgeD > 2.2; };
    for (const ds of [0, 7, -7, 13, -13]) { const px = x + hx * ds, py = y + hy * ds; if (ok(px, py)) { const g = Hq(px, py); if (top - g > 2.5) pier(a, px, py, g, top, hx, hy, deckHalf * (big ? 0.72 : 0.6), big ? 1.5 : 0.9, big ? 2.6 : 1.6); return; } }
    const nx = hy, ny = -hx; let L = 0, R = 0; for (let k = deckHalf + 1; k <= 60; k += 2) { if (!R && ok(x + nx * k, y + ny * k)) R = k; if (!L && ok(x - nx * k, y - ny * k)) L = k; if (L && R) break; }
    if (!L && !R) return; const cols = []; if (R) cols.push([x + nx * R, y + ny * R]); if (L) cols.push([x - nx * L, y - ny * L]);
    cols.forEach(c => { const g = Hq(c[0], c[1]); if (top - 2 - g > 2) pier(a, c[0], c[1], g, top - 2.0, hx, hy, big ? 2.4 : 1.6, big ? 1.3 : 0.9, big ? 2.4 : 1.6); });
    const e1 = cols[0], e2 = cols[1] || [x, y]; beam(a, e1[0], e1[1], e2[0], e2[1], top, 2.0, big ? 2.6 : 1.8);
  }
  function toMesh(a, mat) {
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(a.p, 3)); g.setAttribute('normal', new T3.Float32BufferAttribute(a.n, 3));
    if (a.u.length) g.setAttribute('uv', new T3.Float32BufferAttribute(a.u, 2)); if (a.c.length) g.setAttribute('color', new T3.Float32BufferAttribute(a.c, 3));
    return new T3.Mesh(g, mat);
  }
  // 沿線帶狀面：pts = [[x,y,z,hx,hy]]（模擬座標），wl/wr 為左右寬度
  function ribbonGeo(pts, wl, wr, vscale, yoff) {
    const n = pts.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), nor = new Float32Array(n * 6), idx = [];
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i]; if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const rx = p[4], ry = -p[3];
      pos.set([p[0] - rx * wl, p[2] - BASE + yoff, -(p[1] - ry * wl), p[0] + rx * wr, p[2] - BASE + yoff, -(p[1] + ry * wr)], i * 6);
      uv.set([0, s / vscale, 1, s / vscale], i * 4); nor.set([0, 1, 0, 0, 1, 0], i * 6);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.BufferAttribute(pos, 3)); g.setAttribute('uv', new T3.BufferAttribute(uv, 2)); g.setAttribute('normal', new T3.BufferAttribute(nor, 3)); g.setIndex(idx); return g;
  }
  function edgePts(e) {
    const out = [];
    for (let i = 0; i < e.np; i++) { const a = Math.max(0, i - 1), b = Math.min(e.np - 1, i + 1), d = Math.hypot(e.X[b] - e.X[a], e.Y[b] - e.Y[a]) || 1; out.push([e.X[i], e.Y[i], e.Z[i], (e.X[b] - e.X[a]) / d, (e.Y[b] - e.Y[a]) / d, e.OFF[i]]); }
    return out;
  }

  // ---------- 場景 ----------
  const canvas = document.getElementById('scene');
  const renderer = new T3.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new T3.Scene(); scene.fog = new T3.Fog(0xbfd4e6, 2500, 9000);
  const camera = new T3.PerspectiveCamera(48, 1, 3, 16000);
  const controls = new T3.OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = 0.12; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 25; controls.maxDistance = 7000; controls.screenSpacePanning = false;
  const hemi = new T3.HemisphereLight(0xdfeeff, 0x6f7a5c, 0.95); scene.add(hemi);
  const sun = new T3.DirectionalLight(0xfff3dc, 0.85); sun.position.set(-600, 900, 500); scene.add(sun); scene.add(sun.target);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T3.PCFSoftShadowMap;
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5; sun.shadow.camera.near = 200; sun.shadow.camera.far = 7000;
  V.scene = scene; V.camera = camera; V.controls = controls; V.renderer = renderer;

  // ---------- 地形 ----------
  // gh：原地面（台地面）高程，地面道路與建物貼此面；Hq：加上國道路塹與匝道路堤後的完成面
  const gh = (x, y) => terr.N(x, y); V.gh = gh;
  const streetS = []; // 地面道路取樣點 [x, y, z, w]
  let grid = null, clearD = 0, edgeD = 0; // edgeD：到最近路面邊緣的距離（負值表示在路面上）
  function buildHash(net) {
    grid = new Map();
    const put = (x, y, z, w, st) => { const k = (Math.floor(x / 32) + 500) * 4096 + Math.floor(y / 32) + 500; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(x, y, z, w, st); };
    net.edges.forEach(e => {
      if (e.k === 'v' || e.k === 's') return; const main = e.k === 'm', w = Math.max((e.nb || e.n) / 2, e.n - (e.nb || e.n) / 2) * e.lw + (main ? 3.0 : 1.5) + 5.5; // 邊坡起點須離路面邊緣至少一格網格，否則內插後會壓到路肩
      // 橋梁下方維持原地形（橋台附近離地不到 1.5 m 處仍貼合）；其餘路段（含抬高的路堤）地形一律貼合路面
      for (let i = 1; i < e.np; i++) { if (e.br && e.OFF[i] > 1.5 && e.OFF[i - 1] > 1.5) continue; const d = e.S[i] - e.S[i - 1], n = Math.max(1, Math.ceil(d / 5)); for (let q = 0; q < n; q++) { const t = q / n; put(e.X[i - 1] + (e.X[i] - e.X[i - 1]) * t, e.Y[i - 1] + (e.Y[i] - e.Y[i - 1]) * t, e.Z[i - 1] + (e.Z[i] - e.Z[i - 1]) * t, w, 0); } }
    });
    for (let i = 0; i < streetS.length; i += 4) put(streetS[i], streetS[i + 1], streetS[i + 2], streetS[i + 3], 1);
  }
  function Hq(x, y) {
    const n = terr.N(x, y); if (!grid) return n;
    const cx = Math.floor(x / 32), cy = Math.floor(y / 32); let up = 1e9, dn = -1e9, zin = 1e9, zst = 1e9, cl = 1e9, el = 1e9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = grid.get((cx + a + 500) * 4096 + cy + b + 500); if (!arr) continue;
      for (let i = 0; i < arr.length; i += 5) {
        const d = Math.hypot(x - arr[i], y - arr[i + 1]) - arr[i + 3], z = arr[i + 2]; if (d < cl) cl = d; { const ed = d + (arr[i + 4] ? 1.5 : 5.5); if (ed < el) el = ed; }
        if (d <= 0) { if (arr[i + 4]) { if (z < zst) zst = z; } else if (z < zin) zin = z; continue; }
        const u = z + d / 1.5, w = z - d / 1.5; if (u < up) up = u; if (w > dn) dn = w;
      }
    }
    clearD = cl; edgeD = el;
    if (zin < 1e8) return zin; if (zst < 1e8) return zst;
    return Math.max(Math.min(n, up), dn);
  }
  V.Hq = Hq;
  // 地表分類遮罩（20 m）：1 林地 2 公園草地 3 水域 4 建物周邊
  const MX0 = -4300, MY0 = -1800, MS = 20, MNX = 416, MNY = 161, mask = new Uint8Array(MNX * MNY);
  const mAt = (x, y) => { const i = Math.floor((x - MX0) / MS), j = Math.floor((y - MY0) / MS); return i < 0 || j < 0 || i >= MNX || j >= MNY ? 0 : mask[j * MNX + i]; };
  function inPoly(p, x, y) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; }
  (D.green || []).forEach(gp => {
    const code = gp.t === 'w' ? 1 : gp.t === 'p' ? 2 : 3; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; gp.p.forEach(q => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    for (let j = Math.max(0, Math.floor((y0 - MY0) / MS)); j <= Math.min(MNY - 1, Math.floor((y1 - MY0) / MS)); j++) for (let i = Math.max(0, Math.floor((x0 - MX0) / MS)); i <= Math.min(MNX - 1, Math.floor((x1 - MX0) / MS)); i++) if (inPoly(gp.p, MX0 + (i + 0.5) * MS, MY0 + (j + 0.5) * MS)) mask[j * MNX + i] = code;
  });
  const occ = new Set(), oKey = (x, y) => (Math.floor(x / 6) + 2000) * 8192 + Math.floor(y / 6) + 2000; // 建物佔用格（6 m）
  D.bld.forEach(b => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; b.p.forEach(q => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }); for (let x = x0 - 3; x <= x1 + 3; x += 6) for (let y = y0 - 3; y <= y1 + 3; y += 6) occ.add(oKey(x, y)); const i = Math.floor(((x0 + x1) / 2 - MX0) / MS), j = Math.floor(((y0 + y1) / 2 - MY0) / MS); for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) { const k = (j + c) * MNX + i + a; if (i + a >= 0 && j + c >= 0 && i + a < MNX && j + c < MNY && !mask[k]) mask[k] = 4; } });
  function groundCol(x, y, slope, cl, out) {
    if (OR) { const v = cl <= 0 ? 0.7 : slope > 1.0 ? 0.86 : 1; out[0] = out[1] = out[2] = v; return; } // 有航照時地表顏色取自影像
    const m = mAt(x, y), f = 0.9 + hash2(x, y) * 0.2; let r, g, b;
    if (cl <= 0) { r = 0.42; g = 0.42; b = 0.4; }
    else if (slope > 1.0) { r = 0.7; g = 0.69; b = 0.64; }               // 擋土牆、噴凝土護坡
    else if (m === 3) { r = 0.36; g = 0.5; b = 0.52; }
    else if (m === 1 || slope > 0.16) { r = 0.27; g = 0.42; b = 0.22; }  // 林地、陡坡
    else if (m === 2) { r = 0.42; g = 0.6; b = 0.3; }
    else if (m === 4) { r = 0.6; g = 0.61; b = 0.56; }                  // 市區鋪面
    else { r = 0.45; g = 0.57; b = 0.32; }
    out[0] = r * f; out[1] = g * f; out[2] = b * f;
  }
  const hash2 = (x, y) => hash(Math.floor(x / 9), Math.floor(y / 9));
  // 航照正射影像（國土測繪中心 WMTS）：far = 全域 z16、near = 交流道核心 z18
  const OR = window.ORTHO || null, LAT0 = D.origin[0], LON0 = D.origin[1], KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110574;
  function orthoTex(set) {
    const c = document.createElement('canvas'); c.width = set.nx * 256; c.height = set.ny * 256; const g = c.getContext('2d'); g.fillStyle = '#5f6f52'; g.fillRect(0, 0, c.width, c.height);
    const t = new T3.CanvasTexture(c); t.anisotropy = 8; t.wrapS = t.wrapT = T3.ClampToEdgeWrapping;
    let left = set.t.length; set.t.forEach((b, i) => { const im = new Image(); im.onload = () => { g.drawImage(im, (i % set.nx) * 256, Math.floor(i / set.nx) * 256); if (--left % 12 === 0) t.needsUpdate = true; }; im.src = 'data:image/jpeg;base64,' + b; });
    return t;
  }
  function orthoUV(set, x, y, out, k) {
    const n = Math.pow(2, set.z), lat = (LAT0 + y / KY) * Math.PI / 180, X = (LON0 + x / KX + 180) / 360 * n, Y = (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * n;
    out[k] = (X - set.c0) / set.nx; out[k + 1] = 1 - (Y - set.r0) / set.ny;
  }
  const groundMat = OR ? new T3.MeshLambertMaterial({ map: orthoTex(OR.far), vertexColors: true }) : new T3.MeshLambertMaterial({ map: TEX.ground, vertexColors: true });
  const nearMat = OR ? new T3.MeshLambertMaterial({ map: orthoTex(OR.near), vertexColors: true }) : groundMat;
  V.hasOrtho = !!OR;
  let corrMesh = null, staticDone = false;
  const BAND = 300; // 需涵蓋所有匝道端點（最遠約距國道中心 270 m）
  // 路廊細網格：沿線 8 m、橫向 4 m，呈現路塹邊坡與匝道路堤
  function corridor() {
    if (corrMesh) corrMesh.forEach(m => { scene.remove(m); m.geometry.dispose(); });
    const NX = 1039, NO = 151, pos = new Float32Array(NX * NO * 3), col = new Float32Array(NX * NO * 3), uv = new Float32Array(NX * NO * 2), hs = new Float32Array(NX * NO), cls = new Float32Array(NX * NO), idx = [], idxN = [], uvN = new Float32Array(NX * NO * 2), c3 = [0, 0, 0];
    for (let i = 0; i < NX; i++) { const x = -4300 + i * 8, yc = terr.Yc(x); for (let j = 0; j < NO; j++) { const o = -BAND + j * 4, y = yc + o, k = i * NO + j; hs[k] = Math.abs(o) >= BAND - 4 ? terr.N(x, y) : Hq(x, y); cls[k] = Math.abs(o) >= BAND - 4 ? 9 : clearD; pos.set([x, hs[k] - BASE, -y], k * 3); if (OR) { orthoUV(OR.far, x, y, uv, k * 2); orthoUV(OR.near, x, y, uvN, k * 2); } else uv.set([x / 14, y / 14], k * 2); } }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NO; j++) {
      const k = i * NO + j, a = hs[i * NO + Math.max(0, j - 1)], b = hs[i * NO + Math.min(NO - 1, j + 1)], c = hs[Math.max(0, i - 1) * NO + j], d = hs[Math.min(NX - 1, i + 1) * NO + j];
      const sl = Math.max(Math.abs(b - a) / 8, Math.abs(d - c) / 16); groundCol(pos[k * 3], -pos[k * 3 + 2], sl, cls[k], c3); col.set(c3, k * 3);
      if (i < NX - 1 && j < NO - 1) { const x = pos[k * 3], nearOK = OR && x > -1235 && x < 925 && uvN[k * 2 + 1] > 0.004 && uvN[k * 2 + 1] < 0.996 && uvN[(k + 1) * 2 + 1] > 0.004 && uvN[(k + 1) * 2 + 1] < 0.996; (nearOK ? idxN : idx).push(k, k + NO, k + 1, k + 1, k + NO, k + NO + 1); }
    }
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.BufferAttribute(pos, 3)); g.setAttribute('uv', new T3.BufferAttribute(uv, 2)); g.setAttribute('color', new T3.BufferAttribute(col, 3)); g.setIndex(idx.concat(idxN)); g.computeVertexNormals(); g.setIndex(idx); // 法向量須以全部三角形計算
    const m1 = new T3.Mesh(g, groundMat); m1.receiveShadow = true; scene.add(m1); corrMesh = [m1];
    if (idxN.length) { const g2 = new T3.BufferGeometry(); g2.setAttribute('position', g.attributes.position); g2.setAttribute('normal', g.attributes.normal); g2.setAttribute('color', g.attributes.color); g2.setAttribute('uv', new T3.BufferAttribute(uvN, 2)); g2.setIndex(idxN); const m2 = new T3.Mesh(g2, nearMat); m2.receiveShadow = true; scene.add(m2); corrMesh.push(m2); }
  }
  function coarse() {
    const GS = 30, GX0 = -4300, GY0 = -1800, GNX = 278, GNY = 108, GH = new Float32Array(GNX * GNY);
    for (let j = 0; j < GNY; j++) for (let i = 0; i < GNX; i++) GH[j * GNX + i] = terr.N(GX0 + i * GS, GY0 + j * GS);
    const pos = new Float32Array(GNX * GNY * 3), uv = new Float32Array(GNX * GNY * 2), col = new Float32Array(GNX * GNY * 3), idx = [], c3 = [0, 0, 0], inBand = new Uint8Array(GNX * GNY);
    for (let j = 0; j < GNY; j++) for (let i = 0; i < GNX; i++) {
      const k = j * GNX + i, x = GX0 + i * GS, y = GY0 + j * GS, h = GH[k], inB = Math.abs(y - terr.Yc(x)) < BAND - 34;
      inBand[k] = inB ? 1 : 0; pos.set([x, h - BASE - 0.05, -y], k * 3); if (OR) orthoUV(OR.far, x, y, uv, k * 2); else uv.set([x / 14, y / 14], k * 2);
      const sl = Math.max(Math.abs(GH[Math.min(GNX * GNY - 1, k + 1)] - h), Math.abs(GH[Math.min(GNX * GNY - 1, k + GNX)] - h)) / GS; groundCol(x, y, Math.min(sl, 0.9), 9, c3); col.set(c3, k * 3);
    }
    // 路廊範圍由細網格負責：粗網格在此範圍內的三角形直接移除（深路塹處原本會從路面穿出）
    for (let j = 0; j < GNY - 1; j++) for (let i = 0; i < GNX - 1; i++) { const k = j * GNX + i; if (!(inBand[k] || inBand[k + 1] || inBand[k + GNX])) idx.push(k, k + 1, k + GNX); if (!(inBand[k + 1] || inBand[k + GNX + 1] || inBand[k + GNX])) idx.push(k + 1, k + GNX + 1, k + GNX); }
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.BufferAttribute(pos, 3)); g.setAttribute('uv', new T3.BufferAttribute(uv, 2)); g.setAttribute('color', new T3.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const cm = new T3.Mesh(g, groundMat); cm.receiveShadow = true; scene.add(cm);
  }
  // ---------- 機場捷運：高架軌道、橋墩、車站與列車 ----------
  const RAIL = { paths: [], trains: [], lastT: -1 };
  function railway(net) {
    if (!D.rail || !D.rail.tracks.length) return;
    const vs = []; net.edges.forEach(e => { if (e.k === 'v') for (let i = 0; i < e.np; i += 2) vs.push(e.X[i], e.Y[i], e.Z[i]); });
    const deck = Acc(), conc = Acc(), glass = Acc(), roof = Acc();
    // 車站材質貼圖：依現場照片以影像生成模型產生的可拼接貼圖（data/tex），缺檔時退回單色
    const TX = window.TEXS || {}, imgTex = k => { if (!TX[k]) return null; const t = new T3.Texture(); t.wrapS = t.wrapT = T3.RepeatWrapping; t.anisotropy = 8; const im = new Image(); im.onload = () => { t.image = im; t.needsUpdate = true; }; im.src = 'data:image/jpeg;base64,' + TX[k]; return t; };
    const sRoof = Acc(), sWall = Acc(), sConc = Acc(), sEnt = Acc(), W1 = [1, 1, 1];
    const railTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#b4b2ab'; g.fillRect(0, 0, w, h); noise(g, w, h, 500, 0.1, true); g.fillStyle = '#8a8880'; g.fillRect(w * 0.5 - 30, 0, 60, h); g.fillStyle = '#4a4744'; g.fillRect(w * 0.5 - 20, 0, 3, h); g.fillRect(w * 0.5 + 17, 0, 3, h); g.fillStyle = '#77756e'; for (let y = 0; y < h; y += 8) g.fillRect(w * 0.5 - 26, y, 52, 2); });
    const tracks = D.rail.tracks.map(t => {
      const pts = LK.resample(t.p, true, 8), n = pts.length, z = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const x = pts[i][0], y = pts[i][1]; let ns = 0; for (let q = -2; q <= 2; q++) ns += terr.N(x + q * 30, y); let r = ns / 5 + 9.5, cap = 1e9;
        for (let k = 0; k < vs.length; k += 3) if (Math.abs(vs[k] - x) < 18 && Math.abs(vs[k + 1] - y) < 18) cap = Math.min(cap, vs[k + 2] - 7.4); // 自五楊高架下方穿越
        r = Math.min(r, cap); if (Math.abs(y - terr.Yc(x)) < 60) r = Math.max(r, terr.M(x) + 7.2); z[i] = r;
      }
      for (let pass = 0; pass < 4; pass++) { const o = z.slice(); for (let i = 0; i < n; i++) { let s2 = 0, c = 0; for (let q = -6; q <= 6; q++) { const j = i + q; if (j >= 0 && j < n) { s2 += o[j]; c++; } } z[i] = s2 / c; } }
      const S = new Float64Array(n); for (let i = 1; i < n; i++) S[i] = S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return { m: t.m, pts, z, S, len: S[n - 1] };
    });
    const P5 = [];
    tracks.forEach((t, ti) => {
      const rp = t.pts.map((p, i) => { const a = t.pts[Math.max(0, i - 1)], b = t.pts[Math.min(t.pts.length - 1, i + 1)], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [p[0], p[1], t.z[i], (b[0] - a[0]) / d, (b[1] - a[1]) / d]; });
      const m = new T3.Mesh(ribbonGeo(rp, 2.4, 2.4, 4, 0), new T3.MeshLambertMaterial({ map: railTex, side: T3.DoubleSide })); m.castShadow = m.receiveShadow = true; scene.add(m);
      for (let i = 1; i < rp.length; i++) { const a = rp[i - 1], b = rp[i]; for (const sg of [-1, 1]) { const A = [a[0] + sg * a[4] * 2.4, a[2] - BASE, -(a[1] - sg * a[3] * 2.4)], B = [b[0] + sg * b[4] * 2.4, b[2] - BASE, -(b[1] - sg * b[3] * 2.4)]; quad(conc, [A[0], A[1] - 1.9, A[2]], [B[0], B[1] - 1.9, B[2]], [B[0], B[1] + 0.9, B[2]], [A[0], A[1] + 0.9, A[2]]); } }
      t.rp = rp; if (t.m) RAIL.paths.push(t);
    });
    // 橋墩：沿第一條主線每 30 m，墩位取兩股道中心
    const A0 = RAIL.paths[0], B0 = RAIL.paths[1];
    if (A0) for (let s0 = 15; s0 < A0.len; s0 += 30) {
      let i = 0; while (i < A0.S.length - 2 && A0.S[i + 1] < s0) i++; const p = A0.rp[i]; let cx = p[0], cy = p[1], cap = 2.6;
      if (B0) { let bd = 1e9, bq = null; for (const q of B0.rp) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; bq = q; } } if (bd < 14) { cx = (p[0] + bq[0]) / 2; cy = (p[1] + bq[1]) / 2; cap = bd / 2 + 2.6; } }
      if (p[2] - Hq(cx, cy) > 4) support(conc, cx, cy, p[2] - 0.4, p[3], p[4], cap, false);
    }
    // 車站：月台層雨庇與玻璃帷幕（沿軌道前後各 70 m）
    RAIL.stops = [];
    D.rail.st.forEach(st => {
      RAIL.paths.forEach((t, k) => { let bi = 0, bd = 1e9; t.rp.forEach((q, i) => { const d = Math.hypot(q[0] - st.x, q[1] - st.y); if (d < bd) { bd = d; bi = i; } }); if (bd < 60) (RAIL.stops[k] = RAIL.stops[k] || []).push({ s: t.S[bi], ref: st.ref }); });
      const t = A0; if (!t) return; let bi = 0, bd = 1e9; t.rp.forEach((q, i) => { const d = Math.hypot(q[0] - st.x, q[1] - st.y); if (d < bd) { bd = d; bi = i; } }); if (bd > 60) return;
      const side = B0 ? (() => { let bq = null, d0 = 1e9; for (const q of B0.rp) { const d = Math.hypot(q[0] - t.rp[bi][0], q[1] - t.rp[bi][1]); if (d < d0) { d0 = d; bq = q; } } const p = t.rp[bi]; return ((bq[0] - p[0]) * p[4] - (bq[1] - p[1]) * p[3]) > 0 ? 1 : -1; })() : 1;
      for (let i = Math.max(1, bi - 9); i <= Math.min(t.rp.length - 1, bi + 9); i++) {
        const a = t.rp[i - 1], b = t.rp[i], o1 = side > 0 ? -7 : -13, o2 = side > 0 ? 13 : 7;
        const P = (p, o, h) => [p[0] + p[4] * o, p[2] - BASE + h, -(p[1] - p[3] * o)];
        { const u0 = t.S[i - 1] / 8, u1 = t.S[i] / 8; quad(sRoof, P(a, o1, 6.9), P(b, o1, 6.9), P(b, (o1 + o2) / 2, 7.5), P(a, (o1 + o2) / 2, 7.5), W1, [u0, u1, 0, 1.25]); quad(sRoof, P(a, (o1 + o2) / 2, 7.5), P(b, (o1 + o2) / 2, 7.5), P(b, o2, 6.9), P(a, o2, 6.9), W1, [u0, u1, 1.25, 2.5]); } quad(roof, P(a, (o1 + o2) / 2 - 1.2, 7.55), P(b, (o1 + o2) / 2 - 1.2, 7.55), P(b, (o1 + o2) / 2 + 1.2, 7.55), P(a, (o1 + o2) / 2 + 1.2, 7.55), [0.78, 0.8, 0.82]); // 深灰金屬屋面與中央採光帶
        { const u0 = t.S[i - 1] / 9, u1 = t.S[i] / 9; quad(sWall, P(a, o1, -1.5), P(b, o1, -1.5), P(b, o1, 6.9), P(a, o1, 6.9), W1, [u0, u1, 0, 0.93]); quad(sWall, P(b, o2, -1.5), P(a, o2, -1.5), P(a, o2, 6.9), P(b, o2, 6.9), W1, [u1, u0, 0, 0.93]); } // 月台層金屬網牆
        quad(conc, P(a, o1, -1.5), P(a, o2, -1.5), P(b, o2, -1.5), P(b, o1, -1.5)); quad(conc, P(a, o1, 0.9), P(b, o1, 0.9), P(b, o2, 0.9), P(a, o2, 0.9));
      }
    });
    const add0 = a => { if (!a.p.length) return; const m = toMesh(a, new T3.MeshLambertMaterial({ vertexColors: true, side: T3.DoubleSide })); m.castShadow = m.receiveShadow = true; scene.add(m); };
    // 站體（OSM 輪廓）：穿堂層架高跨越道路，地面層只留柱與出入口；柱位避開路面
    const body = Acc();
    stPolys.forEach(pl => {
      let ar = 0; for (let i = 0; i < pl.length; i++) { const q = pl[(i + 1) % pl.length]; ar += pl[i][0] * q[1] - q[0] * pl[i][1]; } const p = ar < 0 ? pl.slice().reverse() : pl;
      let cx = 0, cy = 0, g = 1e9; p.forEach(q => { cx += q[0] / p.length; cy += q[1] / p.length; g = Math.min(g, gh(q[0], q[1])); });
      let zt = g + 12, bd = 1e9; if (A0) A0.rp.forEach(q => { const d = Math.hypot(q[0] - cx, q[1] - cy); if (d < bd) { bd = d; zt = q[2]; } });
      const y0 = g + 6.3 - BASE, y1 = zt - 1.6 - BASE, y2 = zt + 6.6 - BASE;
      const wall = (acc, ya, yb, c, us, vs) => { let u = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); quad(acc, [a[0], ya, -a[1]], [b[0], ya, -b[1]], [b[0], yb, -b[1]], [a[0], yb, -a[1]], c, us ? [u / us, (u + L) / us, 0, (yb - ya) / vs] : undefined); u += L; } };
      wall(sConc, y0, y1, W1, 12, 8); wall(body, y1, y1 + 0.5, [0.74, 0.75, 0.74]); wall(sWall, y1 + 0.5, y2 - 0.6, W1, 9, 9); wall(body, y2 - 0.6, y2, [0.3, 0.32, 0.35]);
      const tris = T3.ShapeUtils.triangulateShape(p.map(q => new T3.Vector2(q[0], q[1])), []);
      tris.forEach(t => { const a = p[t[0]], b = p[t[1]], c = p[t[2]]; tri(sRoof, a[0], y2, -a[1], c[0], y2, -c[1], b[0], y2, -b[1], W1); sRoof.u.push(a[0] / 8, a[1] / 8, c[0] / 8, c[1] / 8, b[0] / 8, b[1] / 8); tri(body, a[0], y0, -a[1], b[0], y0, -b[1], c[0], y0, -c[1], [0.55, 0.56, 0.56]); });
      let x0 = 1e9, x1 = -1e9, yy0 = 1e9, yy1 = -1e9; p.forEach(q => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); yy0 = Math.min(yy0, q[1]); yy1 = Math.max(yy1, q[1]); });
      for (let x = x0 + 3; x < x1; x += 11) for (let y = yy0 + 3; y < yy1; y += 11) { if (!inPoly(p, x, y)) continue; const gz = Hq(x, y); if (edgeD > 2) box(body, x, gz - BASE, -y, 1.3, y0 - (gz - BASE), 1.3, [0.72, 0.72, 0.7]); }
      // 出入口樓梯間（綠色格柵外觀）：站體兩端外側、不在路面上的位置
      [[x0, (yy0 + yy1) / 2, -1], [x1, (yy0 + yy1) / 2, 1]].forEach(e => { for (const dy of [0, 14, -14, 26, -26]) { const ex = e[0] + e[2] * 5, ey = e[1] + dy, gz = Hq(ex, ey); if (edgeD > 4) { const yb = gz - BASE, yt = y0 + 3.2, hh = yt - yb, c4 = [[ex - 3.5, ey - 5], [ex + 3.5, ey - 5], [ex + 3.5, ey + 5], [ex - 3.5, ey + 5]]; for (let q = 0; q < 4; q++) { const a = c4[q], b = c4[(q + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]); quad(sEnt, [a[0], yb, -a[1]], [b[0], yb, -b[1]], [b[0], yt, -b[1]], [a[0], yt, -a[1]], W1, [0, L / 7, 0, hh / 7]); } quad(body, [c4[0][0], yt, -c4[0][1]], [c4[1][0], yt, -c4[1][1]], [c4[2][0], yt, -c4[2][1]], [c4[3][0], yt, -c4[3][1]], [0.3, 0.32, 0.35]); break; } } });
    });
    add0(body);
    [[sRoof, 'roof', 0x55595f], [sWall, 'wall', 0xb8bcc0], [sConc, 'concourse', 0x3a4046], [sEnt, 'entrance', 0x3f8a3c]].forEach(q => { if (!q[0].p.length) return; const tx = imgTex(q[1]), m = toMesh(q[0], new T3.MeshLambertMaterial(tx ? { map: tx, side: T3.DoubleSide } : { color: q[2], side: T3.DoubleSide })); m.castShadow = m.receiveShadow = true; scene.add(m); });
    const add = (a, mat) => { if (!a.p.length) return; const m = toMesh(a, mat); m.castShadow = m.receiveShadow = true; scene.add(m); };
    add(conc, new T3.MeshLambertMaterial({ color: 0xc2c0b9, side: T3.DoubleSide })); add(roof, new T3.MeshLambertMaterial({ vertexColors: true, side: T3.DoubleSide })); add(glass, new T3.MeshLambertMaterial({ vertexColors: true, side: T3.DoubleSide, transparent: true, opacity: 0.72 }));
    // 列車：4 節編組（每節約 20.25 m），普通車各站停、直達車僅停 A8
    const car = Acc(); box(car, 0, 0.9, 0, 19.9, 2.9, 3.0, [1, 1, 1]); box(car, 0, 2.0, 0, 18.6, 1.0, 3.04, [0.12, 0.14, 0.18]); box(car, 0, 0.4, 0, 19.0, 0.6, 2.6, [0.25, 0.25, 0.27]);
    const cg = new T3.BufferGeometry(); cg.setAttribute('position', new T3.Float32BufferAttribute(car.p, 3)); cg.setAttribute('normal', new T3.Float32BufferAttribute(car.n, 3)); cg.setAttribute('color', new T3.Float32BufferAttribute(car.c, 3));
    RAIL.mesh = new T3.InstancedMesh(cg, new T3.MeshLambertMaterial({ vertexColors: true }), 64); RAIL.mesh.setColorAt(0, new T3.Color(1, 1, 1)); RAIL.mesh.count = 0; RAIL.mesh.frustumCulled = false; RAIL.mesh.castShadow = true; scene.add(RAIL.mesh);
  }
  // 依模擬時間推進列車（班距 7.5 分，普通車與直達車交錯；最高 100 km/h、加減速 1 m/s²、停站 30 秒）
  V.updateTrains = function (t) {
    if (!RAIL.mesh || RAIL.paths.length < 1) return;
    let dt = t - RAIL.lastT; const HW = 450;
    if (RAIL.lastT < 0 || dt < 0 || dt > 120) { RAIL.trains = []; RAIL.paths.forEach((p, k) => { for (let s = p.len * 0.25; s < p.len; s += p.len * 0.5) RAIL.trains.push({ k, s: k ? p.len - s : s, v: 22, dwell: 0, exp: (Math.floor(t / HW) + RAIL.trains.length) % 2, done: {} }); }); RAIL.next = [Math.ceil(t / HW) * HW, Math.ceil(t / HW) * HW + HW / 2]; dt = 0; }
    RAIL.lastT = t;
    RAIL.paths.forEach((p, k) => { if (k < 2 && t >= RAIL.next[k]) { RAIL.trains.push({ k, s: k ? p.len - 45 : 45, v: 20, dwell: 0, exp: Math.round(RAIL.next[k] / HW) % 2, done: {} }); RAIL.next[k] += HW; } });
    const m4 = new T3.Matrix4(), q = new T3.Quaternion(), eu = new T3.Euler(0, 0, 0, 'YZX'), pv = new T3.Vector3(), sc = new T3.Vector3(1, 1, 1), col = new T3.Color(); let n = 0;
    RAIL.trains = RAIL.trains.filter(tr => {
      const p = RAIL.paths[tr.k], dir = tr.k ? -1 : 1; if (tr.k > 1) return false;
      if (tr.dwell > 0) tr.dwell -= dt; else {
        let lim = 27.8; (RAIL.stops[tr.k] || []).forEach(st => { if (tr.done[st.ref] || (tr.exp && st.ref !== 'A8')) return; const d = (st.s - tr.s) * dir; if (d < -5) return; lim = Math.min(lim, Math.sqrt(2 * 0.9 * Math.max(0, d))); if (d < 1.2 && tr.v < 1.5) { tr.dwell = 30; tr.done[st.ref] = 1; tr.v = 0; } });
        tr.v = tr.v < lim ? Math.min(lim, tr.v + 1.0 * dt) : Math.max(lim, tr.v - 1.1 * dt); tr.s += dir * tr.v * dt;
      }
      if (tr.s < 42 || tr.s > p.len - 42) return false;
      for (let c = 0; c < 4 && n < 64; c++) {
        const sc2 = tr.s - dir * (c * 20.4 - 30.6); let i = 0, lo = 0, hi = p.S.length - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (p.S[md] <= sc2) lo = md; else hi = md; } i = lo;
        const a = p.rp[i], b = p.rp[Math.min(p.rp.length - 1, i + 1)], u = (sc2 - p.S[i]) / ((p.S[i + 1] - p.S[i]) || 1);
        pv.set(a[0] + (b[0] - a[0]) * u, a[2] + (b[2] - a[2]) * u - BASE + 0.25, -(a[1] + (b[1] - a[1]) * u)); eu.set(0, Math.atan2(a[4], a[3]), Math.atan((b[2] - a[2]) / 8)); q.setFromEuler(eu); m4.compose(pv, q, sc); RAIL.mesh.setMatrixAt(n, m4);
        if (tr.exp) col.setRGB(0.5, 0.3, 0.62); else col.setRGB(0.25, 0.45, 0.8); RAIL.mesh.setColorAt(n, col); n++;
      }
      return true;
    });
    RAIL.mesh.count = n; RAIL.mesh.instanceMatrix.needsUpdate = true; if (RAIL.mesh.instanceColor) RAIL.mesh.instanceColor.needsUpdate = true;
  };

  // 樹木：林地與陡坡密植、公園與路廊綠帶疏植、主要道路行道樹
  function trees() {
    // 高架橋、跨越橋與捷運高架下方不種樹
    const og = new Map(), ok2 = (x, y) => (Math.floor(x / 16) + 1000) * 4096 + Math.floor(y / 16) + 1000, oput = (pts, w) => pts.forEach(p => { const k = ok2(p[0], p[1]); let a = og.get(k); if (!a) og.set(k, a = []); a.push(p[0], p[1], w); });
    D.edges.forEach(e => { if (e.k === 'v') oput(LK.resample(e.p, false, 8), 15); else if (e.br) oput(LK.resample(e.p, false, 8), 10); }); // 半徑含樹冠
    D.roads.forEach(r => { if (r.br) oput(r._pts, r._w + 10); }); ((D.rail || {}).tracks || []).forEach(t => oput(LK.resample(t.p, false, 8), 9));
    const under = (x, y) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const arr = og.get(ok2(x + a * 16, y + b * 16)); if (!arr) continue; for (let i = 0; i < arr.length; i += 3) if (Math.hypot(arr[i] - x, arr[i + 1] - y) < arr[i + 2]) return true; } return false; };
    const P = [], add = (x, y, s) => { if (P.length < 34000 * 4 && !occ.has(oKey(x, y)) && !under(x, y)) { const z = Hq(x, y); if (clearD > 4) P.push(x, y, z, s); } };
    for (let pass = 0; pass < 2; pass++) for (let x = -4250; x < 3950; x += 9) for (let y = -1750; y < 1350; y += 9) {
      if ((Math.abs(x + 300) < 1900) !== (pass === 0)) continue; // 先種交流道周邊，再種外圍
      const jx = x + hash(x, y) * 8, jy = y + hash(y, x) * 8, m = mAt(jx, jy), o = Math.abs(jy - terr.Yc(jx)), r = hash(x + 3, y + 7);
      const sl = Math.abs(terr.N(jx + 12, jy) - terr.N(jx - 12, jy)) / 24 + Math.abs(terr.N(jx, jy + 12) - terr.N(jx, jy - 12)) / 24;
      if (m === 3) continue;
      const far = pass === 1 ? 0.45 : 1, p = (m === 1 ? 0.7 : sl > 0.16 ? 0.5 : m === 2 ? 0.16 : (o < 150 && m !== 4) ? 0.25 : m === 4 ? 0.03 : 0.06) * far;
      if (r < p) add(jx, jy, 0.75 + hash(x + 1, y) * 0.7);
    }
    D.roads.forEach((r, ri) => { if (r.br || (r.t !== 'secondary' && r.t !== 'tertiary')) return; const w = r._w + 2.2, pts = LK.resample(r.p, false, 16); for (let i = 1; i < pts.length - 1; i++) { const a = pts[i - 1], b = pts[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / d, ny = -(b[0] - a[0]) / d; if (Math.abs(pts[i][1] - terr.Yc(pts[i][0])) > 135 && !V._crossing(pts[i][0] + nx * w, pts[i][1] + ny * w, r._id, 14)) add(pts[i][0] + nx * w, pts[i][1] + ny * w, 0.6 + hash(ri, i) * 0.3); } });
    const PM = []; for (let i = 0; i < medTrees.length; i += 3) { if (under(medTrees[i], medTrees[i + 1]) || Math.abs(medTrees[i + 1] - terr.Yc(medTrees[i])) < 135) continue; /* 交流道範圍內（兩側側車道之間）的分隔島不種樹 */ if (medTrees[i + 2]) PM.push(medTrees[i], medTrees[i + 1], gh(medTrees[i], medTrees[i + 1])); else P.push(medTrees[i], medTrees[i + 1], gh(medTrees[i], medTrees[i + 1]), 0.75 + hash(i, 4) * 0.3); }
    if (PM.length) { // 棕櫚（文化北路分隔島）：細高樹幹與放射狀樹冠
      const np = PM.length / 3, tg = new T3.CylinderGeometry(0.22, 0.3, 7.5, 6).translate(0, 3.75, 0), fg = new T3.ConeGeometry(3.4, 2.2, 9, 1, true).translate(0, 8.2, 0);
      const mt2 = new T3.InstancedMesh(tg, new T3.MeshLambertMaterial({ color: 0x6b5a45 }), np), mf = new T3.InstancedMesh(fg, new T3.MeshLambertMaterial({ color: 0x3f6a2c, side: T3.DoubleSide }), np), m5 = new T3.Matrix4(), q5 = new T3.Quaternion(), s5 = new T3.Vector3(), p5 = new T3.Vector3();
      for (let i = 0; i < np; i++) { const k = 0.85 + hash(i, 11) * 0.35; p5.set(PM[i * 3], PM[i * 3 + 2] - BASE, -PM[i * 3 + 1]); s5.set(1, k, 1); m5.compose(p5, q5, s5); mt2.setMatrixAt(i, m5); mf.setMatrixAt(i, m5); }
      mt2.castShadow = mf.castShadow = true; mt2.frustumCulled = mf.frustumCulled = false; scene.add(mt2); scene.add(mf); V.palmCount = np;
    }
    const n = P.length / 4, crown = new T3.IcosahedronGeometry(1, 0); crown.scale(1.3, 1.25, 1.3); crown.translate(0, 1.55, 0);
    const mc = new T3.InstancedMesh(crown, new T3.MeshLambertMaterial(), n), mt = new T3.InstancedMesh(new T3.CylinderGeometry(0.09, 0.13, 0.9, 5).translate(0, 0.45, 0), new T3.MeshLambertMaterial({ color: 0x5a4632 }), n);
    const m4 = new T3.Matrix4(), q = new T3.Quaternion(), sc = new T3.Vector3(), pv = new T3.Vector3(), c = new T3.Color(), ax = new T3.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) { const s = P[i * 4 + 3] * 3.4, h = hash(i, 5); pv.set(P[i * 4], P[i * 4 + 2] - BASE - 0.2, -P[i * 4 + 1]); q.setFromAxisAngle(ax, h * 6.28); sc.set(s * (0.85 + h * 0.3), s, s * (0.85 + hash(i, 9) * 0.3)); m4.compose(pv, q, sc); mc.setMatrixAt(i, m4); mt.setMatrixAt(i, m4); c.setRGB(0.14 + h * 0.1, 0.29 + hash(i, 2) * 0.15, 0.12 + h * 0.07); mc.setColorAt(i, c); }
    mc.frustumCulled = mt.frustumCulled = false; mc.castShadow = true; mc.receiveShadow = true; scene.add(mc); scene.add(mt); V.treeCount = n;
  }

  // 地面道路：車道數取 OSM 標註；未標註者沿用同名道路最常見的值。雙向分隔的幹道另畫中央分隔島與行道樹
  const medTrees = []; // [x, y, palm]
  (function streets() {
    const major = r => r.t === 'secondary' || r.t === 'tertiary';
    LK.roadLanes(D); // 車道數與跨越橋斷面（繪圖與地面車流模擬共用，見 surf.js）
    D.roads.forEach(r => { r._w = (r.t === 'service' && !r.ln ? 4 : r._n * (major(r) ? 3.3 : 3.0) + 0.8) / 2; r._pts = LK.resample(r.p, false, 8); });
    const texC = {};
    const stTex = (n, ow) => texC[n + ':' + ow] || (texC[n + ':' + ow] = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#6a6e73'; g.fillRect(0, 0, w, h); noise(g, w, h, 2500, 0.08, false); noise(g, w, h, 2500, 0.12, true);
      const W = n * 3.3 + 0.8, k = w / W, x = q => (0.4 + q * 3.3) * k;
      g.fillStyle = ow ? '#e3c341' : '#e2e2dc'; g.fillRect(x(0) - 1.5, 0, 3, h); g.fillStyle = '#e2e2dc'; g.fillRect(x(n) - 1.5, 0, 3, h);
      for (let q = 1; q < n; q++) { if (!ow && q === n / 2) { g.fillStyle = '#e3c341'; g.fillRect(x(q) - 4, 0, 2.5, h); g.fillRect(x(q) + 1.5, 0, 2.5, h); } else if (!ow && n === 2) { g.fillStyle = '#e3c341'; g.fillRect(x(q) - 1.5, 0, 3, h * 0.5); } else { g.fillStyle = '#e2e2dc'; g.fillRect(x(q) - 1.5, 0, 3, h * 0.4); } }
      if (!ow && n === 1) { /* 巷道：不畫標線 */ }
    }));
    const groups = {}, conc = Acc(), conc2 = Acc(), med = Acc();
    // 路口偵測：把所有道路（含匝道與其銜接段）的取樣點放進格網，分隔島與行道樹遇到橫交道路就中斷
    const xg = new Map(), xk = (x, y) => (Math.floor(x / 16) + 1000) * 4096 + Math.floor(y / 16) + 1000, xput = (x, y, id) => { const k = xk(x, y); let a = xg.get(k); if (!a) xg.set(k, a = []); a.push(x, y, id); };
    const nameId = {}; let nid = 1; D.roads.forEach((r, ri) => { const id = r.n ? (nameId[r.n] || (nameId[r.n] = nid++)) : -ri - 1; r._id = id; r._pts.forEach(p => xput(p[0], p[1], id)); });
    D.edges.forEach(e => { if (e.k === 'l' || e.k === 'n') LK.resample(e.p, false, 8).forEach(p => xput(p[0], p[1], 0)); });
    const crossing = (x, y, id, rad) => { const c = Math.ceil(rad / 16); for (let a = -c; a <= c; a++) for (let b = -c; b <= c; b++) { const arr = xg.get(xk(x + a * 16, y + b * 16)); if (!arr) continue; for (let i = 0; i < arr.length; i += 3) if (arr[i + 2] !== id && Math.hypot(arr[i] - x, arr[i + 1] - y) < rad) return true; } return false; };
    // 對向車道索引（同名、單行、方向相反）
    const pairs = {}; D.roads.forEach((r, ri) => { if (r.ow && major(r) && r.n) (pairs[r.n] = pairs[r.n] || []).push(ri); });
    // 同一車道（同名、同為單行或雙向）前後路段車道數不同時，以 35 m 漸變段銜接，不讓路寬在節點突變
    const wAt = new Map(), wk = (p, r) => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10) + '|' + r.n + '|' + r.ow;
    D.roads.forEach(r => { if (!major(r) || !r.n || r.br) return; wAt.set('e' + wk(r.p[r.p.length - 1], r), r._w); wAt.set('s' + wk(r.p[0], r), r._w); });
    D.roads.forEach((r, ri) => {
      const W0 = r._w, pts = r._pts, n = pts.length, key = r._n + ':' + r.ow, G = groups[key] || (groups[key] = { P: [], U: [], N: [], I: [], base: 0, n: r._n, ow: r.ow });
      let hs = pts.map(p => gh(p[0], p[1]) + 0.18);
      if (r.br) { // 跨越橋：兩端接地，中段至少高出國道 6.8 m
        const hA = hs[0], hB = hs[n - 1], mid = pts[n >> 1], need = terr.M(mid[0]) + 6.8, bump = Math.max(0, need - (hA + hB) / 2);
        hs = pts.map((p, i) => { const t = i / (n - 1); return hA + (hB - hA) * t + bump * LK.sstep(Math.min(1, Math.min(t, 1 - t) * 3.2)); });
      }
      r._hs = hs;
      const others = r.ow && major(r) && r.n ? pairs[r.n].filter(q => q !== ri) : null;
      let s = 0, prevM = null, prevOver = false, wIn, wOut, Ltot = 0;
      if (major(r) && r.n && !r.br) { wIn = wAt.get('e' + wk(r.p[0], r)); wOut = wAt.get('s' + wk(r.p[r.p.length - 1], r)); for (let i = 1; i < n; i++) Ltot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); }
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, hx = (b[0] - a[0]) / d, hy = (b[1] - a[1]) / d, rx = hy, ry = -hx, p = pts[i];
        if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
        let w = W0; { const T = Math.min(35, Ltot * 0.45); if (wIn < W0 && s < T) w = wIn + (W0 - wIn) * LK.sstep(s / T); else if (wOut < W0 && Ltot - s < T) w = wOut + (W0 - wOut) * LK.sstep((Ltot - s) / T); }
        let sh = 0, narrow = false;
        // 中央分隔島：向左找對向車道，兩者之間鋪綠帶，各畫一半
        let cur = null;
        if (others) {
          let bd = 34, bw = 0, bi = -1;
          for (const oi of others) { const o = D.roads[oi], op = o._pts; for (let j = 0; j < op.length; j++) { const dx = op[j][0] - p[0], dy = op[j][1] - p[1], dd = Math.hypot(dx, dy); if (dd >= bd || dx * -rx + dy * -ry < 2) continue; const c = op[Math.min(op.length - 1, j + 1)], e = op[Math.max(0, j - 1)]; if ((c[0] - e[0]) * hx + (c[1] - e[1]) * hy > 0) continue; bd = dd; bw = o._w; bi = oi; } }
          let gap = bd - w - bw;
          const mx = p[0] - rx * (w + Math.max(gap, 1) / 2), my = p[1] - ry * (w + Math.max(gap, 1) / 2);
          if (bi >= 0 && !crossing(mx, my, r._id, Math.max(gap, 1) / 2 + 3)) {
            if (gap < 1) { sh = (1 - gap) / 2; gap = 1; } // 兩向中心線太近：各自外移，中間留 1 m 分隔島
            narrow = gap < 2.2 || !!r.br; // 橋上為鋪面分隔島
            cur = [[p[0] + rx * (sh - w), hs[i] - BASE + 0.16, -(p[1] + ry * (sh - w))], [p[0] + rx * (sh - w - gap / 2 - 0.05), hs[i] - BASE + 0.16, -(p[1] + ry * (sh - w - gap / 2 - 0.05))]];
            if (ri < bi && i % 2 === 1 && gap > 2.2 && !r.br && !crossing(mx, my, r._id, gap / 2 + 18)) medTrees.push(p[0] - rx * (w + gap / 2), p[1] - ry * (w + gap / 2), r.n.indexOf('文化北路') === 0 || r.n === '文化一路一段' ? 1 : 0);
            if (ri < bi && narrow && !(r._bf && r._bf.green)) box(conc2, p[0] + rx * (sh - w - gap / 2), hs[i] - BASE + 0.16, -(p[1] + ry * (sh - w - gap / 2)), 0.14, 0.75, 0.14, [0.92, 0.45, 0.12]); // 橘色導桿
          }
        }
        G.P.push(p[0] + rx * (sh - w), hs[i] - BASE, -(p[1] + ry * (sh - w)), p[0] + rx * (sh + w), hs[i] - BASE, -(p[1] + ry * (sh + w))); G.U.push(0, s / 10, 1, s / 10); G.N.push(0, 1, 0, 0, 1, 0);
        const over = !r.br && Math.abs(p[1] - terr.Yc(p[0])) < 40 && hs[i] - terr.M(p[0]) > 2.5; // 未標為橋卻懸在國道上方的路段不畫
        if (i && !over && !prevOver) { const q = G.base + (i - 1) * 2; G.I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } prevOver = over;
        if (!r.br && Math.abs(p[1] - terr.Yc(p[0])) > 30) streetS.push(p[0], p[1], hs[i] - 0.18, w + (major(r) ? 4.5 : 1.5));
        if (cur && prevM) { const f = 0.9 + hash(ri, i) * 0.2; quad(med, prevM[0], cur[0], cur[1], prevM[1], narrow && !(r._bf && r._bf.green) ? [0.62, 0.62, 0.6] : [0.34 * f, 0.5 * f, 0.24 * f]); quad(med, [prevM[0][0], prevM[0][1] - 0.2, prevM[0][2]], [cur[0][0], cur[0][1] - 0.2, cur[0][2]], cur[0], prevM[0], [0.72, 0.72, 0.7]); }
        prevM = cur;
        if (r.br && i) { // 橋面：外側人行道與欄杆；未成對的橋兩側都設護欄
          const p0 = pts[i - 1], y0 = hs[i - 1] - BASE, y1 = hs[i] - BASE, sw = r._bf ? r._bf.sw : major(r) ? 2.0 : 0;
          const E = (q, o, y) => [q[0] + rx * o, y, -(q[1] + ry * o)];
          if (sw) quad(conc2, E(p0, sh + w, y0 + 0.15), E(p, sh + w, y1 + 0.15), E(p, sh + w + sw, y1 + 0.15), E(p0, sh + w + sw, y0 + 0.15), [0.58, 0.4, 0.34]);
          for (const o of (cur ? [sh + w + sw] : [sh + w + sw, sh - w])) quad(conc2, E(p0, o, y0 - 1.4), E(p, o, y1 - 1.4), E(p, o, y1 + 1.1), E(p0, o, y0 + 1.1), [0.72, 0.72, 0.69]);
          quad(conc2, E(p0, sh - w - 1, y0 - 1.4), E(p, sh - w - 1, y1 - 1.4), E(p, sh + w + sw, y1 - 1.4), E(p0, sh + w + sw, y0 - 1.4), [0.6, 0.6, 0.58]);
          if (i % 4 === 0 && hs[i] - terr.M(p[0]) > 3.5 && Math.abs(Math.abs(p[1] - terr.Yc(p[0])) - 1) < 4.1) box(conc, p[0], terr.M(p[0]) - BASE, -p[1], 1.6, hs[i] - terr.M(p[0]) - 1.2, 1.6); // 中央分隔島橋墩
        }
      }
      G.base += n * 2;
    });
    V._crossing = crossing;
    // 林口A南出匝道口的槽化島：右轉槽化車道、5 車道進口與文化一路北向三者圍出的三角區（依高公局示意圖與空拍影像）
    { const slip = D.edges.find(e => e.id === '182679857_0'), app = D.edges.find(e => e.id === '790658669_0'), nr = (r, c) => r.n === '文化一路一段' && Math.hypot(r.p[0][0] - c[0], r.p[0][1] - c[1]) < 3, r1 = D.roads.find(r => nr(r, [265, 68])), r2 = D.roads.find(r => nr(r, [263.6, 103.5]));
      if (slip && app && r1 && r2) {
        const lines = [[LK.resample(slip.p, false, 1.5), 5.2, 1], [LK.resample(app.p, false, 1.5), 8.4, -1], [LK.resample(r1.p.concat(r2.p.slice(1)), false, 1.5), r2._w + 1, -1]]; // [折線, 與中心線的淨距, 島在行進方向的左(1)/右(-1)側]
        const sd = (P, x, y) => { let bd = 1e9, sg = 0; for (let i = 1; i < P.length; i++) { const ax = P[i - 1][0], ay = P[i - 1][1], dx = P[i][0] - ax, dy = P[i][1] - ay, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)), d = Math.hypot(x - ax - dx * t, y - ay - dy * t); if (d < bd) { bd = d; sg = dx * (y - ay) - dy * (x - ax) > 0 ? 1 : -1; } } return bd * sg; };
        const pts = [];
        lines.forEach((ln, li) => { const P = ln[0]; for (let i = 1; i < P.length; i++) { const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1], L = Math.hypot(dx, dy) || 1, x = P[i][0] - dy / L * ln[1] * ln[2], y = P[i][1] + dx / L * ln[1] * ln[2]; if (lines.every((o, oi) => oi === li ? Math.abs(sd(o[0], x, y) * o[2] - o[1]) < 0.3 : sd(o[0], x, y) * o[2] > o[1] - 0.05)) pts.push([x, y]); } });
        if (pts.length >= 3) {
          let cx = 0, cy = 0; pts.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length; pts.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
          const V3 = (p, k, dz) => { const x = cx + (p[0] - cx) * k, y = cy + (p[1] - cy) * k; return [x, gh(x, y) + dz - BASE, -y]; }, fan = (k, dz, col) => { const c = V3([cx, cy], 1, dz); for (let i = 0; i < pts.length; i++) { const a = V3(pts[i], k, dz), b = V3(pts[(i + 1) % pts.length], k, dz); tri(med, c[0], c[1], c[2], b[0], b[1], b[2], a[0], a[1], a[2], col); } };
          fan(1, 0.36, [0.72, 0.72, 0.7]); fan(0.88, 0.4, [0.33, 0.5, 0.24]);
          medTrees.push(cx, cy, 1); pts.filter((p, i) => i % Math.ceil(pts.length / 4) === 0).forEach(p => medTrees.push(cx + (p[0] - cx) * 0.55, cy + (p[1] - cy) * 0.55, 1));
          V.island = pts.length;
        }
      }
    }
    // 路口：三向以上交會處，以各進口斷面圍成的凸多邊形鋪一塊無標線的路面（斜交的匝道口、分流口只鋪很短的一段）
    { const arms = new Map(), key = p => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);
      const addA = (p, q, w, n) => { const k = key(p); let a = arms.get(k); if (!a) arms.set(k, a = { p, n: 0, d: [] }); a.n += n; if (q) { const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L > 0.5) a.d.push([(q[0] - p[0]) / L, (q[1] - p[1]) / L, w, L]); } };
      D.roads.forEach(r => { if (r.br) return; const P = r.p; P.forEach((p, i) => { const end = i === 0 || i === P.length - 1; addA(p, i ? P[i - 1] : null, r._w, end ? 1 : 2); if (i < P.length - 1) addA(p, P[i + 1], r._w, 0); }); });
      D.edges.forEach(e => { if (e.k !== 'l' && e.k !== 'n') return; const P = e.p, w = (e.ln || 1) * 1.9 + 1.2; addA(P[0], P[1], w, 1); addA(P[P.length - 1], P[P.length - 2], w, 1); });
      const hull = pts => { pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = []; for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } for (let q = pts.length - 1; q >= 0; q--) { const p = pts[q]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } lo.pop(); up.pop(); return lo.concat(up); };
      const JP = [], JU = [], JN = [], JI = []; let jb = 0, jc = 0;
      arms.forEach(a => {
        if (a.n < 3 || a.d.length < 3 || Math.abs(a.p[1] - terr.Yc(a.p[0])) < 30) return;
        const pts = [];
        a.d.forEach(u => { let d = 2.5; a.d.forEach(o => { const sn = Math.abs(u[0] * o[1] - u[1] * o[0]); if (o !== u && sn > 0.4) d = Math.max(d, Math.min(20, o[2] / sn + 1.2)); }); d = Math.min(d, u[3] * 0.6 + 2); pts.push([a.p[0] + u[0] * d + u[1] * u[2], a.p[1] + u[1] * d - u[0] * u[2]], [a.p[0] + u[0] * d - u[1] * u[2], a.p[1] + u[1] * d + u[0] * u[2]]); });
        const H = hull(pts); if (H.length < 3) return; let cx = 0, cy = 0; H.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= H.length; cy /= H.length;
        const put = p => { JP.push(p[0], gh(p[0], p[1]) + 0.21 - BASE, -p[1]); JU.push(p[0] / 12, p[1] / 12); JN.push(0, 1, 0); };
        put([cx, cy]); H.forEach(put); for (let q = 0; q < H.length; q++) JI.push(jb, jb + 1 + q, jb + 1 + (q + 1) % H.length); jb += H.length + 1; jc++;
      });
      const jg = new T3.BufferGeometry(); jg.setAttribute('position', new T3.Float32BufferAttribute(JP, 3)); jg.setAttribute('uv', new T3.Float32BufferAttribute(JU, 2)); jg.setAttribute('normal', new T3.Float32BufferAttribute(JN, 3)); jg.setIndex(JI);
      const jm = new T3.Mesh(jg, new T3.MeshLambertMaterial({ map: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#6a6e73'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, 0.08, false); noise(g, w, h, 1500, 0.12, true); }), side: T3.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); jm.receiveShadow = true; scene.add(jm); V.junctions = jc; }
    for (const k in groups) { const G = groups[k], g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(G.P, 3)); g.setAttribute('uv', new T3.Float32BufferAttribute(G.U, 2)); g.setAttribute('normal', new T3.Float32BufferAttribute(G.N, 3)); g.setIndex(G.I); const sm = new T3.Mesh(g, new T3.MeshLambertMaterial({ map: stTex(G.n, G.ow), side: T3.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })); sm.receiveShadow = true; scene.add(sm); }
    { const bm = toMesh(conc, new T3.MeshLambertMaterial({ color: 0xb4b2ab, side: T3.DoubleSide })); bm.castShadow = bm.receiveShadow = true; scene.add(bm); { const c2 = toMesh(conc2, new T3.MeshLambertMaterial({ vertexColors: true, side: T3.DoubleSide })); c2.castShadow = c2.receiveShadow = true; scene.add(c2); } if (med.p.length) { const mm = toMesh(med, new T3.MeshLambertMaterial({ vertexColors: true, side: T3.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); mm.receiveShadow = true; scene.add(mm); } }
  })();

  const stPolys = [];
  // 建物
  (function buildings() {
    // 立面材質：依街景參考生成的照片質感貼圖（data/tex）；缺檔時退回程序貼圖
    const STY = { apt_brick: 'apt', apt_grey: 'apt', apt_dark: 'apt', apt_beige: 'apt', apt_old: 'gen', office_glass: 'glass', hospital: 'glass', mall: 'shop', industrial: 'ind', school: 'gen', home_a9: 'apt', home_a9_podium: 'shop', a9_east: 'apt', a9_side: 'apt', a9_flank: 'apt', a9_core: 'apt', sky_ab: 'apt', sky_ab_balc: 'apt', sky_c: 'glass', sky_c_side: 'gen' };
    const kinds = {}, roofs = Acc(); for (const k in STY) kinds[k] = Acc();
    // 地標：名稱關鍵字 → 立面；OSM 未命名者以座標補上名稱
    const LM = [[/時尚A9/, 'home_a9'], [/長庚|兒童大樓|復健大樓|醫學大樓|病理大樓|尖端醫療|質子|工程大樓/, 'hospital'], [/冠德鼎捷|璽來登|翡翠大道/, 'apt_dark'], [/福樺中央|世貿新都|丰嶺商辦/, 'office_glass'], [/環球購物|Global Mall|三井|昕境廣場/, 'mall'], [/^[A-I]$/, 'apt_grey']];
    // 以座標補名稱與樓層：[x, y, 名稱, 樓層(0=不指定)]。時尚A9：位置取自 Google 地圖（三民路 15 號），獨棟 12 層為住戶提供
    const NAMEFIX = [[-70, 559, '三井 Outlet Park 林口', 0], [-779, 150, '時尚A9', 12], [-649, 105, '亞昕晴空樹 A棟', 33], [-616, 105, '亞昕晴空樹 B棟', 33], [-581, 148, '亞昕晴空樹 C棟', 33]];
    const places = V.places = [];
    const styleOf = (b, H, area, bi) => {
      for (const l of LM) if (l[0].test(b.n)) return l[1];
      const t = b.t, r = hash(bi, 13);
      if (t === 'hospital') return 'hospital'; if (t === 'industrial' || t === 'warehouse') return 'industrial'; if (t === 'school' || t === 'university' || t === 'dormitory') return t === 'dormitory' ? 'apt_grey' : 'school';
      if (t === 'office') return 'office_glass'; if (t === 'retail' || t === 'commercial') return area > 2500 ? 'mall' : 'office_glass';
      if (H > 30) return r < 0.34 ? 'apt_beige' : r < 0.6 ? 'apt_brick' : r < 0.82 ? 'apt_grey' : 'apt_dark';
      if (t === 'apartments' || t === 'residential') return H > 18 ? (r < 0.5 ? 'apt_brick' : 'apt_beige') : 'apt_old';
      return area > 1500 ? 'industrial' : 'apt_old';
    };
    const DEFH = { apartments: 42, residential: 16, house: 9, industrial: 12, school: 14, retail: 14, hospital: 36, commercial: 24, office: 30, roof: 6, construction: 12, yes: 12 };
    let known = 0;
    D.bld.forEach((b, bi) => {
      let p = b.p; if (p.length < 3) return;
      let area = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; area += p[i][0] * q[1] - q[0] * p[i][1]; }
      if (area < 0) p = p.slice().reverse(); area = Math.abs(area) / 2; if (area < 12) return;
      { let fx = 0, fy = 0; p.forEach(q => { fx += q[0] / p.length; fy += q[1] / p.length; }); for (const f of NAMEFIX) if (!b.n && Math.hypot(fx - f[0], fy - f[1]) < 12) { b.n = f[2]; if (f[3] && !b.lv) b.lv = f[3]; } }
      let H = b.h || (b.lv ? b.lv * 3.3 + 1 : 0); if (H) known++; else { H = (DEFH[b.t] || 12) * (0.82 + hash(bi, 7) * 0.36); if (b.t === 'apartments' || b.t === 'residential') H *= area < 160 ? 0.35 : area < 420 ? 0.7 : 1; }
      if (b.t === 'roof') H = 6;
      const isSt = (b.t === 'train_station' || b.t === 'transportation') && D.rail && D.rail.st.some(q => Math.hypot(q.x - p[0][0], q.y - p[0][1]) < 160);
      if (isSt) { stPolys.push(p); return; } // 捷運站體為高架結構，另行建模（見 railway）
      let cx = 0, cy = 0; p.forEach(q => { cx += q[0] / p.length; cy += q[1] / p.length; });
      if (b.n.indexOf('亞昕晴空樹') === 0) {
        // 亞昕晴空樹（文化三路一段 39 巷）：依住戶提供的照片與建商圖面個別建模。A、B 棟為雙塔，屋頂為樹枝狀框架；C 棟正面為玻璃帷幕與樹形線條
        const g0 = Math.min(...p.map(q => gh(q[0], q[1]))) - BASE - 0.5, FH = 3.5, NF = 33, yT = g0 + 0.5 + NF * FH, W1 = [1, 1, 1], WH = [0.86, 0.87, 0.88];
        const seg = (F, u1, h1, u2, h2, w, col, off) => { const o = off === undefined ? 0.3 : off, P = (u, h) => [F.ox + F.dx * u + F.nx * o, h, -(F.oy + F.dy * u + F.ny * o)], du = u2 - u1, dh = h2 - h1, L = Math.hypot(du, dh) || 1, pu = -dh / L * w / 2, ph = du / L * w / 2; quad(roofs, P(u1 - pu, h1 - ph), P(u2 - pu, h2 - ph), P(u2 + pu, h2 + ph), P(u1 + pu, h1 + ph), col); };
        const capP = (pl, y, c) => T3.ShapeUtils.triangulateShape(pl.map(q => new T3.Vector2(q[0], q[1])), []).forEach(t => { const a = pl[t[0]], d = pl[t[1]], e = pl[t[2]]; tri(roofs, a[0], y, -a[1], e[0], y, -e[1], d[0], y, -d[1], c); });
        const isC = /C棟$/.test(b.n);
        let u = 0;
        for (let k = 0; k < p.length; k++) {
          const a = p[k], c = p[(k + 1) % p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]), north = -(c[0] - a[0]) / L > 0.7, key = !isC ? (north ? 'sky_ab' : 'sky_ab_balc') : (L > 12 && L < 13.5 ? 'sky_c_side' : 'sky_c'); // A、B 棟：北面為窗牆，南、東、西面為白色直柱與玻璃陽台（依八德路街景）
          quad(kinds[key], [a[0], g0, -a[1]], [c[0], g0, -c[1]], [c[0], yT, -c[1]], [a[0], yT, -a[1]], W1, [u / 12.8, (u + L) / 12.8, 0, NF / 4]); u += L;
          if (isC && L > 12 && L < 13.5) { const F = { ox: a[0], oy: a[1], dx: (c[0] - a[0]) / L, dy: (c[1] - a[1]) / L, nx: (c[1] - a[1]) / L, ny: -(c[0] - a[0]) / L }; seg(F, L / 2, g0 + 8, L / 2, yT + 3, 2.2, [0.2, 0.23, 0.27]); for (const s of [0.22, 0.78]) seg(F, L * s, yT, L * s, yT + 4.5, L * 0.4, [0.74, 0.75, 0.76], 0); } // C 棟端牆：中央深色凹槽、頂部兩側升高
          if (isC && L > 13.5) { // C 棟長向立面：自地面向上分岔的樹形線條
            const F = { ox: a[0], oy: a[1], dx: (c[0] - a[0]) / L, dy: (c[1] - a[1]) / L, nx: (c[1] - a[1]) / L, ny: -(c[0] - a[0]) / L }, Ht = yT - g0, n = Math.max(2, Math.round(L / 7.5));
            const grow = (uu, h, sp, dpt) => { const top = Math.min(yT, h + Ht * (dpt === 0 ? 0.3 : 0.17)); seg(F, uu, h, uu, top, 0.45, WH); if (top >= yT - 1 || dpt > 3) { if (top < yT) seg(F, uu, top, uu, yT, 0.45, WH); return; } const h2 = Math.min(yT, top + Ht * 0.07); for (const s of [-1, 1]) { const u2 = Math.max(0.4, Math.min(L - 0.4, uu + s * sp)); seg(F, uu, top, u2, h2, 0.4, WH); grow(u2, h2, sp * 0.52, dpt + 1); } };
            for (let q = 0; q < n; q++) grow(L * (q + 0.5) / n, g0, L / n * 0.26, 0);
          }
        }
        capP(p, yT, [0.5, 0.5, 0.49]);
        if (!isC) { // A、B 棟屋頂：退縮的玻璃量體，外圍立柱向上分岔成樹枝狀，頂部一圈框架
          let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; p.forEach(q => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
          const CH = 11, pen = [[x0 + 4, y0 + 4], [x1 - 4, y0 + 4], [x1 - 4, y1 - 4], [x0 + 4, y1 - 4]];
          pen.forEach((a, k) => { const c = pen[(k + 1) % 4]; quad(kinds.office_glass, [a[0], yT, -a[1]], [c[0], yT, -c[1]], [c[0], yT + 7, -c[1]], [a[0], yT + 7, -a[1]], W1, [0, 1.5, 0, 0.5]); }); capP(pen, yT + 7, [0.45, 0.46, 0.47]);
          [{ ox: x0, oy: y0, dx: 1, dy: 0, nx: 0, ny: -1, L: x1 - x0 }, { ox: x1, oy: y0, dx: 0, dy: 1, nx: 1, ny: 0, L: y1 - y0 }, { ox: x1, oy: y1, dx: -1, dy: 0, nx: 0, ny: 1, L: x1 - x0 }, { ox: x0, oy: y1, dx: 0, dy: -1, nx: -1, ny: 0, L: y1 - y0 }].forEach(F => {
            const n = Math.round(F.L / 3.3), sp = F.L / n, G = [0.74, 0.76, 0.78];
            seg(F, 0, yT + CH - 0.5, F.L, yT + CH - 0.5, 1.0, G, 0); seg(F, 0.4, yT, 0.4, yT + CH, 0.8, G, 0); seg(F, F.L - 0.4, yT, F.L - 0.4, yT + CH, 0.8, G, 0);
            for (let k = 1; k < n; k++) { const uu = k * sp; if (k % 2) { seg(F, uu, yT, uu, yT + CH * 0.45, 0.45, G, 0); for (const s of [-1, 1]) { seg(F, uu, yT + CH * 0.45, uu + s * sp * 0.5, yT + CH * 0.7, 0.4, G, 0); seg(F, uu + s * sp * 0.5, yT + CH * 0.7, uu + s * sp * 0.5, yT + CH - 0.5, 0.4, G, 0); } } else seg(F, uu, yT, uu, yT + CH * 0.3, 0.4, G, 0); }
          });
          [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(q => box(roofs, q[0] + (q[0] === x0 ? 0.4 : -0.4), yT, -(q[1] + (q[1] === y0 ? 0.4 : -0.4)), 0.8, CH, 0.8, [0.74, 0.76, 0.78]));
        }
        places.push({ n: b.n, x: cx, y: cy, h: NF * FH + (isC ? 2 : 11), a: area }); return;
      }
      if (b.n === '時尚A9') {
        // 依住戶提供的平面圖與照片個別建模。正面朝東（三民路）；平面比例取自平面圖，並配合 OSM 輪廓東側量體的實際尺寸
        const OX = -779, OY = 150, g0 = Math.min(...p.map(q => gh(q[0], q[1]))) - BASE - 0.5, FH = 3.3, yP = g0 + 0.5 + 2 * 4.2, yT = yP + 10 * FH, W1 = [1, 1, 1];
        const A = (x, y) => [OX + x, OY + y];
        // 塔樓外框（逆時針）：東正面 15.5 m、南北側面 9 m、西側中央為凸出的電梯梯間
        const T = [[11.5, -4.3, 'a9_east'], [11.5, 11.2, 'a9_side'], [2.5, 11.2, 'a9_flank'], [2.5, 6.7, 'a9_core'], [-1.7, 6.7, 'a9_core'], [-1.7, 0.2, 'a9_core'], [2.5, 0.2, 'a9_flank'], [2.5, -4.3, 'a9_side']];
        const face = (acc, a, c, ya, yb, rows) => quad(acc, [a[0], ya, -a[1]], [c[0], ya, -c[1]], [c[0], yb, -c[1]], [a[0], yb, -a[1]], W1, [0, 1, 0, rows]);
        const capP = (pl, y, c) => T3.ShapeUtils.triangulateShape(pl.map(q => new T3.Vector2(q[0], q[1])), []).forEach(t => { const a = pl[t[0]], d = pl[t[1]], e = pl[t[2]]; tri(roofs, a[0], y, -a[1], e[0], y, -e[1], d[0], y, -d[1], c); });
        // 裙樓：沿用 OSM 輪廓，2 層石材與玻璃店面；東側加紅色招牌
        { let u = 0; for (let k = 0; k < p.length; k++) { const a = p[k], c = p[(k + 1) % p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); quad(kinds.home_a9_podium, [a[0], g0, -a[1]], [c[0], g0, -c[1]], [c[0], yP, -c[1]], [a[0], yP, -a[1]], W1, [u / 12.8, (u + L) / 12.8, 0, 1]); u += L; } capP(p, yP, [0.6, 0.6, 0.58]); }
        box(roofs, OX + 12.2, g0 + 4.7, -(OY + 0.5), 0.3, 1.0, 4.2, [0.78, 0.12, 0.14]);
        // 塔樓 10 層：四個立面各用對應的貼圖
        const TP = T.map(q => A(q[0], q[1]));
        T.forEach((q, k) => face(kinds[q[2]], TP[k], TP[(k + 1) % TP.length], yP, yT, 2.5));
        TP.forEach((a, k) => { const c = TP[(k + 1) % TP.length]; quad(roofs, [a[0], yT, -a[1]], [c[0], yT, -c[1]], [c[0], yT + 1.2, -c[1]], [a[0], yT + 1.2, -a[1]], [0.72, 0.72, 0.7]); }); capP(TP, yT + 0.2, [0.5, 0.5, 0.49]);
        // 東正面的立體細部：中間三開間為陽台（樓板與玻璃欄杆），其餘三開間為窗上雨遮
        const bw = 15.5 / 6;
        for (let f = 0; f < 10; f++) for (let k = 0; k < 6; k++) {
          const yc = OY - 4.3 + (k + 0.5) * bw, yf = yP + f * FH;
          if (k >= 1 && k <= 3) { box(roofs, OX + 11.5 + 0.55, yf - 0.1, -yc, 1.1, 0.2, bw - 0.25, [0.74, 0.74, 0.72]); box(roofs, OX + 11.5 + 1.07, yf + 0.1, -yc, 0.06, 1.05, bw - 0.25, [0.2, 0.24, 0.28]); }
          else box(roofs, OX + 11.5 + 0.3, yf + 2.7, -yc, 0.6, 0.12, bw - 0.5, [0.74, 0.74, 0.72]);
        }
        // 屋頂：梯間與水箱量體，外圍一圈框架
        const C = [A(6.5, 0.2), A(6.5, 6.7), A(-1.7, 6.7), A(-1.7, 0.2)]; C.forEach((a, k) => face(kinds.a9_core, a, C[(k + 1) % 4], yT, yT + 8.5, 8.5 / 13.2)); capP(C, yT + 8.5, [0.45, 0.45, 0.44]);
        [[11.5, -4.3], [11.5, 11.2], [2.5, 11.2], [2.5, -4.3]].forEach(q => box(roofs, OX + q[0] + (q[0] > 5 ? -0.5 : 0.5), yT, -(OY + q[1] + (q[1] > 0 ? -0.5 : 0.5)), 0.9, 4.6, 0.9, [0.72, 0.72, 0.7]));
        box(roofs, OX + 7, yT + 4.1, -(OY - 3.8), 9, 0.5, 0.6, [0.72, 0.72, 0.7]); box(roofs, OX + 7, yT + 4.1, -(OY + 10.7), 9, 0.5, 0.6, [0.72, 0.72, 0.7]); box(roofs, OX + 11, yT + 4.1, -(OY + 3.45), 0.6, 0.5, 15.5, [0.72, 0.72, 0.7]);
        places.push({ n: b.n, x: OX + 5, y: OY + 3.5, h: 12 * FH + 9, a: area }); return;
      }
      const kd = styleOf(b, H, area, bi), acc = kinds[kd], tv = 0.9 + hash(bi, 3) * 0.1, col = [tv, tv, tv];
      if (b.n && !/^.$/.test(b.n)) places.push({ n: b.n, x: cx, y: cy, h: H, a: area });
      let y0 = 1e9; p.forEach(q => { y0 = Math.min(y0, gh(q[0], q[1])); }); y0 -= BASE + 0.5; const y1 = y0 + H + 0.5; if (Math.abs(p[0][1] - terr.Yc(p[0][0])) < 260) y0 -= 14; // 路塹旁建物：牆面向下延伸，避免基座懸空
      let u = 0;
      for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); quad(acc, [a[0], y0, -a[1]], [c[0], y0, -c[1]], [c[0], y1, -c[1]], [a[0], y1, -a[1]], col, [u / 12.8, (u + L) / 12.8, (y0 - y1) / 13.2 + Math.ceil(H / 13.2), Math.ceil(H / 13.2)]); u += L; } // 貼圖自屋頂往下對齊樓層
      const tris = T3.ShapeUtils.triangulateShape(p.map(q => new T3.Vector2(q[0], q[1])), []), rv = 0.4 + hash(bi, 5) * 0.16, rc = [rv, rv, rv * 0.97], yr = y1 - (H > 9 ? 1.1 : 0.3); // 屋頂略低於牆頂，形成女兒牆
      tris.forEach(t => { const a = p[t[0]], c = p[t[1]], e = p[t[2]]; tri(roofs, a[0], yr, -a[1], e[0], yr, -e[1], c[0], yr, -c[1], rc); });
      if (H > 24 && area > 250) { const s2 = Math.min(9, Math.sqrt(area) * 0.3); box(roofs, cx, yr, -cy, s2, 3.2 + hash(bi, 6) * 2, s2 * 0.7, [0.62, 0.62, 0.6]); } // 屋突（梯間、水箱）
    });
    V.bldKnown = known; V.bldTotal = D.bld.length;
    for (const k in kinds) if (kinds[k].p.length) { const bm = toMesh(kinds[k], new T3.MeshLambertMaterial({ map: photoTex(k) || facade(STY[k]), vertexColors: true })); bm.castShadow = bm.receiveShadow = true; scene.add(bm); }
    { const rm = toMesh(roofs, new T3.MeshLambertMaterial({ vertexColors: true, side: T3.DoubleSide })); rm.castShadow = rm.receiveShadow = true; scene.add(rm); }
  })();

  // 標籤
  function label(text, x, y, zAbove, opt) {
    opt = opt || {}; const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 44; g.font = '600 ' + fs + 'px "Noto Sans TC", sans-serif';
    const w = Math.ceil(g.measureText(text).width) + 36; c.width = w; c.height = 64; g.font = '600 ' + fs + 'px "Noto Sans TC", sans-serif';
    g.fillStyle = opt.bg || 'rgba(0,92,52,0.92)'; const r = 12; g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, 64, r); g.arcTo(w, 64, 0, 64, r); g.arcTo(0, 64, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.fill();
    g.fillStyle = opt.fg || '#fff'; g.textBaseline = 'middle'; g.fillText(text, 18, 34);
    const t = new T3.CanvasTexture(c), sp = new T3.Sprite(new T3.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false, transparent: true }));
    const k = (opt.size || 0.03); sp.scale.set(k * w / 64, k, 1); sp.position.set(x, gh(x, y) - BASE + zAbove, -y); sp.renderOrder = 10; return sp;
  }
  const labels = new T3.Group(); scene.add(labels); V.labels = labels;
  // 路名標籤位置取自道路資料：在指定側、距國道約 dist 公尺處（平行道路則取最接近指定 x 的點）
  function roadPt(name, side, dist, atX) {
    let best = null, bd = 1e9;
    D.roads.forEach(r => { if (r.n.indexOf(name) !== 0) return; r.p.forEach(p => { const dy = p[1] - terr.Yc(p[0]); if (side && dy * side < 0) return; const d = atX === undefined ? Math.abs(Math.abs(dy) - dist) : Math.abs(p[0] - atX); if (d < bd) { bd = d; best = p; } }); });
    return best;
  }
  const RD = { bg: 'rgba(40,44,52,0.82)', size: 0.022 }, ST = { bg: 'rgba(120,60,140,0.9)', size: 0.024 }, DIR = { bg: 'rgba(0,92,52,0.92)', size: 0.026 };
  [['文化一路', 1, 320], ['文化二路', 1, 320], ['文化三路', 1, 320], ['文化北路', 1, 320], ['忠義路', -1, 300], ['八德路', 1, 0, -330], ['龜山一路', -1, 0, -420]].forEach(l => { const p = roadPt(l[0], l[1], l[2], l[3]); if (p) labels.add(label(l[0], p[0], p[1], 12, RD)); });
  { const a = roadPt('文化一路', 0, 0), b = roadPt('文化北路', 1, 40); if (a) labels.add(label('林口A交流道 41K', a[0], terr.Yc(a[0]), 34)); if (b) labels.add(label('林口B交流道', b[0], terr.Yc(b[0]), 34)); }
  [['林口長庚醫院', 160, -400, 60, ST], ['機捷 A9 林口站', -473, 62, 30, ST], ['機捷 A8 長庚醫院站', 430, -500, 30, ST], ['往臺北 ▶', 2500, -470, 40, DIR], ['◀ 往桃園', -2900, -700, 40, DIR]].forEach(l => labels.add(label(l[0], l[1], l[2], l[3], l[4])));

  // 地標標籤與「找我家」定位
  (D.rail ? D.rail.st : []).forEach(s => V.places.push({ n: '機場捷運 ' + s.ref + ' ' + s.n + '站', x: s.x, y: s.y, h: 25, a: 9e9 }));
  { const seen = {}; V.places = V.places.filter(p => { if (seen[p.n]) { if (p.a > seen[p.n].a) Object.assign(seen[p.n], p); return false; } seen[p.n] = p; return true; }).sort((a, b) => a.n.localeCompare(b.n, 'zh-Hant')); }
  [/三井 Outlet/, /國家檔案館/, /福樺中央大樓/, /^環球購物中心$/, /桃園長庚轉運站/, /冠德鼎捷/, /時尚A9/, /亞昕晴空樹 B棟/].forEach(re => { const p = V.places.find(q => re.test(q.n)); if (p) { const sp = label(p.n, p.x, p.y, 0, { bg: 'rgba(150,96,20,0.92)', size: 0.022 }); sp.position.y = gh(p.x, p.y) - BASE + p.h + 14; labels.add(sp); } });
  { const p = V.places.find(q => q.n === 'F'); const sp = label('林口社會住宅（世大運選手村）', 1330, 1020, 80, { bg: 'rgba(150,96,20,0.92)', size: 0.022 }); labels.add(sp); V.places.push({ n: '林口社會住宅（世大運選手村）', x: 1330, y: 1020, h: 66, a: 1 }); }
  let pin = null;
  V.focusPlace = function (p) {
    if (pin) scene.remove(pin); pin = label('▼ ' + p.n, p.x, p.y, 0, { bg: 'rgba(214,40,40,0.95)', size: 0.034 }); pin.position.y = gh(p.x, p.y) - BASE + p.h + 26; scene.add(pin);
    const gy = gh(p.x, p.y) - BASE, d = Math.max(140, p.h * 2.6);
    fly = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: new T3.Vector3(p.x + d * 0.55, gy + p.h + d * 0.55, -p.y + d * 0.85), t1: new T3.Vector3(p.x, gy + p.h * 0.5, -p.y) };
  };

  // ---------- 路網（隨情境重建） ----------
  let netGroup = null; const GC = { so: 0xff8e7a, ni: 0x7fb2ff, ws: 0x7fe0d2, wn: 0xf2d16b };
  V.GC = GC; V.highlight = true;
  const concPlain = new T3.MeshLambertMaterial({ color: 0xbdbbb4, side: T3.DoubleSide });
  let surfSig = null;
  // 地面路網：路面高程取自街道幾何；號誌化進口在停止線右側立燈號
  function surfInit(net) {
    surfSig = null; const S = net.surf; if (!S) return;
    S.links.forEach(e => { const r = D.roads[e.ri], P = r._pts, H = r._hs; for (let i = 0; i < e.np; i++) { let bd = 1e18, bj = 0; for (let q = 0; q < P.length; q++) { const dx = P[q][0] - e.X[i], dy = P[q][1] - e.Y[i], d = dx * dx + dy * dy; if (d < bd) { bd = d; bj = q; } } e.Z[i] = H[bj]; } });
    const L = S.links.filter(e => e.sg); if (!L.length) return;
    const poles = Acc(), PP = [0, 0, 0, 0, 0, 0], m = new T3.InstancedMesh(new T3.BoxGeometry(0.5, 1.3, 0.5), new T3.MeshBasicMaterial(), L.length), M = new T3.Matrix4();
    L.forEach((e, i) => { LK.posAt(e, e.stop, LK.laneOff(e, e.n - 1) + e.lw / 2 + 1.3, PP); box(poles, PP[0], PP[2] - BASE, -PP[1], 0.16, 5.2, 0.16, [0.3, 0.32, 0.34]); M.makeTranslation(PP[0], PP[2] - BASE + 5.4, -PP[1]); m.setMatrixAt(i, M); m.setColorAt(i, new T3.Color(0xe5332a)); e._g = null; });
    m.userData.links = L; m.frustumCulled = false; netGroup.add(m); netGroup.add(toMesh(poles, new T3.MeshLambertMaterial({ vertexColors: true }))); surfSig = m;
  }
  // 情境別的周邊地貌。現況：航照即施工中的樣貌（圍籬、工務所、裸露地），不另加東西；
  // 改善後：依高公局示意圖，南出高架匝道環圈內側整地為草地並植樹，蓋掉航照上的施工設施
  function scenery(net) {
    if (net.scen !== 'after') { const P = label('高架匝道施工中', 250, 205, 0, { bg: 'rgba(120,110,95,0.92)', size: 0.03 }); if (P) { P.position.y = gh(250, 205) - BASE + 22; netGroup.add(P); } return; }
    const loop = D.edges.find(e => e.id === '1122274253_0'); if (!loop) return;
    const poly = LK.resample(loop.p, false, 4).filter(p => p[1] > 84);
    const inside = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const lawn = Acc(), G = 3, ok = (x, y) => y > 88 && inside(x, y) && !V._crossing(x, y, -1e9, 6.5), tp = [];
    for (let x = 170; x < 380; x += G) for (let y = 86; y < 206; y += G) {
      if (!(ok(x, y) && ok(x + G, y) && ok(x, y + G) && ok(x + G, y + G))) continue;
      const f = 0.97 + hash(x, y) * 0.06, V3 = (a, b) => [a, Hq(a, b) + 0.13 - BASE, -b];
      quad(lawn, V3(x, y), V3(x + G, y), V3(x + G, y + G), V3(x, y + G), [0.36 * f, 0.55 * f, 0.26 * f]);
      if (hash(y, x) > 0.93 && !V._crossing(x, y, -1e9, 13)) tp.push([x, y]);
    }
    if (!lawn.p.length) return;
    const lm = toMesh(lawn, new T3.MeshLambertMaterial({ vertexColors: true, side: T3.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); lm.receiveShadow = true; netGroup.add(lm);
    if (tp.length) {
      const cr = new T3.InstancedMesh(new T3.IcosahedronGeometry(1, 0), new T3.MeshLambertMaterial({ color: 0x3f7a35, flatShading: true }), tp.length), tk = Acc(), M = new T3.Matrix4();
      tp.forEach((p, i) => { const h = 5 + hash(p[0], p[1] + 7) * 3, y = Hq(p[0], p[1]) - BASE; box(tk, p[0], y, -p[1], 0.35, h * 0.55, 0.35, [0.36, 0.27, 0.18]); M.makeScale(h * 0.42, h * 0.5, h * 0.42); M.setPosition(p[0], y + h * 0.8, -p[1]); cr.setMatrixAt(i, M); });
      cr.castShadow = true; netGroup.add(cr); const tm = toMesh(tk, new T3.MeshLambertMaterial({ vertexColors: true })); tm.castShadow = true; netGroup.add(tm);
    }
    V.lawn = lawn.p.length / 18;
  }
  V.buildNet = function (net) {
    if (netGroup) { scene.remove(netGroup); netGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    netGroup = new T3.Group(); scene.add(netGroup); V.net = net; V.newMats = [];
    buildHash(net); corridor(); if (!staticDone) { staticDone = true; coarse(); trees(); railway(net); }
    surfInit(net);
    const conc = Acc(), hedge = Acc(), P = [0, 0, 0, 0, 0, 0];
    // 現況：新增的高架匝道尚在施工，只畫出橋面與橋墩（無標線、無車流）；改善後才通車
    const ghosts = net.scen === 'before' ? (V._ghost || (V._ghost = LK.buildNet(D, 'after', terr, { surf: false }).edges.filter(e => e.k === 'n' && e.br))) : null;
    const ghostMat = new T3.MeshLambertMaterial({ color: 0x8f877c, side: T3.DoubleSide });
    const drawEdge = (e, ghost) => {
      if (e.k === 's') return; // 地面道路段沿用既有街道路面
      const main = e.k === 'm' || e.k === 'v', sl = main ? 1.0 : 0.8, sr = main ? 3.0 : 1.5, nb = e.nb || e.n, halfL = nb * e.lw / 2, halfR = (e.n - nb / 2) * e.lw, half = e.n * e.lw / 2, pts = edgePts(e);
      const mat = ghost ? ghostMat : new T3.MeshLambertMaterial({ map: laneTex(e.n, e.lw, sl, sr, main), side: T3.DoubleSide, polygonOffset: true, polygonOffsetFactor: e.k === 'm' ? -6 : -3 - Math.min(2, e.n) * 0.5, polygonOffsetUnits: e.k === 'm' ? -12 : -6 - Math.min(2, e.n) }); // 主線蓋過匝道：匝道在匯出入口從主線路緣下方接出
      if (e.grp && !ghost) { mat.userData = { grp: e.grp }; V.newMats.push(mat); if (V.highlight) mat.color.setHex(GC[e.grp]); }
      const m = new T3.Mesh(ribbonGeo(pts, halfL + sl, halfR + sr, 10, e.k === 'm' ? 0.3 : 0.24), mat); m.userData.edge = e; m.receiveShadow = true; netGroup.add(m);
      const wl = halfL + sl, wr = halfR + sr;
      // 中央護欄、高架側牆、橋墩、擋土牆
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], ya = a[2] - BASE + 0.3, yb = b[2] - BASE + 0.3;
        const L = (p, w) => [p[0] - p[4] * w, 0, -(p[1] + p[3] * w)], R = (p, w) => [p[0] + p[4] * w, 0, -(p[1] - p[3] * w)];
        const wallAt = (fa, fb, top, bot0, bot1) => { const A = fa, B = fb; quad(conc, [A[0], ya + bot0, A[2]], [B[0], yb + bot1, B[2]], [B[0], yb + top, B[2]], [A[0], ya + top, A[2]]); quad(conc, [B[0], yb + bot1, B[2]], [A[0], ya + bot0, A[2]], [A[0], ya + top, A[2]], [B[0], yb + top, B[2]]); };
        if (e.k === 'm') {
          wallAt(L(a, wl + 0.3), L(b, wl + 0.3), 0.85, 0, 0); wallAt(R(a, wr + 0.2), R(b, wr + 0.2), 0.8, 0, 0);
          if (!e.dirW) { // 中央分隔島灌木與路燈（設於北上側內緣外）
            const A1 = L(a, wl + 0.7), B1 = L(b, wl + 0.7), A2 = L(a, wl + 2.3), B2 = L(b, wl + 2.3), hc = [0.2 + hash(i, e.i) * 0.06, 0.36 + hash(e.i, i) * 0.1, 0.14];
            quad(hedge, [A1[0], ya, A1[2]], [B1[0], yb, B1[2]], [B1[0], yb + 1.3, B1[2]], [A1[0], ya + 1.3, A1[2]], hc); quad(hedge, [B2[0], yb, B2[2]], [A2[0], ya, A2[2]], [A2[0], ya + 1.3, A2[2]], [B2[0], yb + 1.3, B2[2]], hc);
            quad(hedge, [A1[0], ya + 1.3, A1[2]], [B1[0], yb + 1.3, B1[2]], [B2[0], yb + 1.3, B2[2]], [A2[0], ya + 1.3, A2[2]], hc);
            if (i % 3 === 0) { const c = L(b, wl + 1.5), g2 = [0.55, 0.57, 0.58]; box(hedge, c[0], yb, c[2], 0.22, 10.5, 0.22, g2); box(hedge, c[0], yb + 10.4, c[2], 0.18, 0.14, 5.2, g2); }
          }
        }
        const elev = a[5] > 0.6 || b[5] > 0.6;
        if (elev) {
          const overT = net.tunnels.some(t => { for (let j = 0; j < t.np; j += 2) if (Math.abs(t.X[j] - b[0]) < 6 && Math.abs(t.Y[j] - b[1]) < 6) return true; return false; });
          const solid = e.over && !e.br; // 箱涵上方以擋土牆呈現
          const d0 = solid ? -a[5] - 0.4 : -1.5, d1 = solid ? -b[5] - 0.4 : -1.5;
          if (!(solid && overT)) { wallAt(L(a, wl), L(b, wl), 0.95, d0, d1); wallAt(R(a, wr), R(b, wr), 0.95, d0, d1); }
          else { wallAt(L(a, wl), L(b, wl), 0.95, -1.0, -1.0); wallAt(R(a, wr), R(b, wr), 0.95, -1.0, -1.0); }
          if (!solid) { const A = L(a, wl), B = L(b, wl), C = R(b, wr), Dd = R(a, wr); quad(conc, [A[0], ya - 1.5, A[2]], [Dd[0], ya - 1.5, Dd[2]], [C[0], yb - 1.5, C[2]], [B[0], yb - 1.5, B[2]]); }
        }
      }
      if (e.k === 'v' || e.br) {
        const step = e.k === 'v' ? 40 : 30, sz = e.k === 'v' ? 2.6 : 1.7;
        for (let s = step / 2; s < e.len; s += step) {
          LK.posAt(e, s, (sr - sl) / 2, P); const i = LK.idxAt(e, s), off = e.OFF[i]; if (off < 3.5) continue;
          support(conc, P[0], P[1], P[2], P[3], P[4], e.n * e.lw / 2 + 2, e.k === 'v');
        }
      }
    };
    net.edges.forEach(e => drawEdge(e, false)); if (ghosts) ghosts.forEach(e => drawEdge(e, true));
    scenery(net);
    conc.u = []; { const cm = toMesh(conc, concPlain); cm.castShadow = cm.receiveShadow = true; netGroup.add(cm); const hm = toMesh(hedge, new T3.MeshLambertMaterial({ vertexColors: true })); hm.castShadow = true; netGroup.add(hm); }
    // ETC 門架與號誌
    V.sigs = [];
    const pole = Acc();
    for (const e of net.edges) { if (!e.sig) continue; LK.posAt(e, e.len - 1, e.n * e.lw / 2 + 1.2, P); box(pole, P[0], P[2] - BASE, -P[1], 0.25, 6, 0.25); const lamp = new T3.Mesh(new T3.SphereGeometry(0.9, 12, 8), new T3.MeshBasicMaterial({ color: 0xff0000 })); lamp.position.set(P[0], P[2] - BASE + 6.4, -P[1]); netGroup.add(lamp); V.sigs.push({ key: e.sig, lamp }); }
    if (window.SIMREF && window.SIMREF.dets) for (const k in window.SIMREF.dets) {
      const d = window.SIMREF.dets[k], e = d.e, w = e.n * e.lw / 2 + 2.2; LK.posAt(e, d.s, 0, P);
      const rx = P[4], ry = -P[3], y = P[2] - BASE;
      box(pole, P[0] - rx * w, y, -(P[1] - ry * w), 0.5, 7.2, 0.5); box(pole, P[0] + rx * w, y, -(P[1] + ry * w), 0.5, 7.2, 0.5);
      for (let q = -w; q <= w; q += 1) box(pole, P[0] + rx * q, y + 6.6, -(P[1] + ry * q), 1.02, 0.6, 1.02);
      const lb = label('ETC ' + window.SIMREF.detG[k], P[0], P[1], 0, { bg: 'rgba(20,24,30,0.85)', size: 0.02 }); lb.position.y = y + 12; netGroup.add(lb);
    }
    netGroup.add(toMesh(pole, new T3.MeshLambertMaterial({ color: 0x8d9499 })));
    // 改善工程標示
    if (net.scen === 'after') {
      [['南出高架匝道（新增）', 250, -40, 26, 'so'], ['北入高架匝道（新增）', 190, 150, 20, 'ni'], ['南出南入交織改善（箱涵）', -110, 30, 16, 'ws'], ['北出北入交織改善（箱涵）', -810, -75, 16, 'wn']].forEach(l => {
        const c = new T3.Color(GC[l[4]]), sp = label(l[0], l[1], l[2], l[3], { bg: 'rgba(' + (c.r * 200 | 0) + ',' + (c.g * 200 | 0) + ',' + (c.b * 200 | 0) + ',0.95)', fg: '#111', size: 0.026 }); netGroup.add(sp);
      });
    }
  };
  V.setHighlight = function (on) { V.highlight = on; (V.newMats || []).forEach(m => m.color.setHex(on ? GC[m.userData.grp] : 0xffffff)); };

  // ---------- 車輛 ----------
  const MAXV = [9000, 2500, 500, 1200, 900], vmesh = [];
  function vehGeo(c, ci) {
    const a = Acc(), W = [1, 1, 1], G = [0.16, 0.2, 0.25], K = [0.12, 0.12, 0.12];
    const L = c.len, w = c.w, h = c.h;
    if (ci === 0) { box(a, 0, 0.28, 0, L, 0.62, w, W); box(a, -L * 0.06, 0.9, 0, L * 0.52, 0.55, w * 0.9, G); box(a, -L * 0.06, 1.38, 0, L * 0.46, 0.08, w * 0.86, W); }
    else if (ci === 1) { box(a, L * 0.33, 0.35, 0, L * 0.3, 1.25, w, W); box(a, L * 0.36, 1.1, 0, L * 0.2, 0.55, w * 1.01, G); box(a, -L * 0.16, 0.55, 0, L * 0.66, h - 0.55, w, [0.92, 0.92, 0.9]); }
    else if (ci === 2) { box(a, 0, 0.4, 0, L, h - 0.4, w, W); box(a, 0, 1.55, 0, L * 0.96, 0.95, w * 1.01, G); }
    else if (ci === 3) { box(a, L * 0.38, 0.5, 0, L * 0.22, 2.3, w, W); box(a, L * 0.42, 1.8, 0, L * 0.13, 0.75, w * 1.01, G); box(a, -L * 0.12, 0.95, 0, L * 0.74, h - 0.95, w, [0.85, 0.86, 0.86]); }
    else { box(a, L * 0.42, 0.5, 0, L * 0.15, 2.5, w, W); box(a, L * 0.44, 1.9, 0, L * 0.1, 0.8, w * 1.01, G); box(a, -L * 0.09, 1.05, 0, L * 0.8, h - 1.05, w, [0.8, 0.82, 0.84]); }
    const wl = ci === 0 ? [L * 0.3, -L * 0.3] : ci === 4 ? [L * 0.4, L * 0.25, -L * 0.3, -L * 0.4] : [L * 0.33, -L * 0.3];
    wl.forEach(x => box(a, x, 0, 0, 0.75, 0.5, w * 1.02, K));
    // 幾何中心移到車頭後 L/2：模擬位置 s 為車頭
    for (let i = 0; i < a.p.length; i += 3) a.p[i] -= L / 2;
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(a.p, 3)); g.setAttribute('normal', new T3.Float32BufferAttribute(a.n, 3)); g.setAttribute('color', new T3.Float32BufferAttribute(a.c, 3)); return g;
  }
  LK.CLS.forEach((c, ci) => { const m = new T3.InstancedMesh(vehGeo(c, ci), new T3.MeshLambertMaterial({ vertexColors: true }), MAXV[ci]); m.frustumCulled = false; m.castShadow = true; m.setColorAt(0, new T3.Color(1, 1, 1)); m.count = 0; m.instanceMatrix.setUsage(T3.DynamicDrawUsage); scene.add(m); vmesh.push(m); });
  const CARCOL = [[0.95, 0.95, 0.95], [0.78, 0.8, 0.82], [0.12, 0.12, 0.14], [0.45, 0.47, 0.5], [0.16, 0.25, 0.5], [0.62, 0.1, 0.1], [0.9, 0.9, 0.86], [0.3, 0.33, 0.3]];
  const CLSCOL = [null, [[0.95, 0.95, 0.95], [0.2, 0.4, 0.7], [0.85, 0.75, 0.2]], [[0.2, 0.55, 0.35], [0.9, 0.9, 0.9], [0.2, 0.35, 0.65]], [[0.25, 0.45, 0.75], [0.9, 0.9, 0.9], [0.7, 0.25, 0.2]], [[0.9, 0.9, 0.9], [0.75, 0.2, 0.15], [0.2, 0.3, 0.55]]];
  V.colorMode = 'speed';
  const M4 = new T3.Matrix4(), Q = new T3.Quaternion(), E = new T3.Euler(0, 0, 0, 'YZX'), S1 = new T3.Vector3(1, 1, 1), PV = new T3.Vector3(), COL = new T3.Color(), PP = [0, 0, 0, 0, 0, 0];
  V.drawVehicles = function (sim) {
    const net = sim.net, surf = net.surf, edges = surf ? (net._all || (net._all = net.edges.concat(surf.links))) : net.edges, cnt = [0, 0, 0, 0, 0], spd = V.colorMode === 'speed';
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei], vref = e.vlim / 3.6;
      for (let l = 0; l < e.n; l++) {
        const arr = e.L[l];
        for (let i = 0; i < arr.length; i++) {
          const v = arr[i], ci = v.cls, k = cnt[ci]; if (k >= MAXV[ci]) continue;
          LK.posAt(e, v.s, v.lat, PP);
          E.set(0, Math.atan2(PP[4], PP[3]), Math.atan(PP[5])); Q.setFromEuler(E);
          if (e.stub && !surf) { const f = Math.max(0.02, Math.min(1, (e.stub === 'out' ? e.len - v.s : v.s + 4) / 28)); S1.set(f, f, f); } else S1.set(1, 1, 1); // 進出模型邊界時漸顯／漸隱
          PV.set(PP[0] + v.ox, PP[2] - BASE + 0.32, -(PP[1] + v.oy)); M4.compose(PV, Q, S1); vmesh[ci].setMatrixAt(k, M4);
          if (spd) { const r = Math.min(1, v.v / vref); COL.setHSL(r * 0.34, 0.85, 0.46); }
          else { const pal = ci === 0 ? CARCOL : CLSCOL[ci], c = pal[(v.col * pal.length) | 0]; COL.setRGB(c[0], c[1], c[2]); }
          vmesh[ci].setColorAt(k, COL); cnt[ci] = k + 1;
        }
      }
    }
    for (let ci = 0; ci < 5; ci++) { vmesh[ci].count = cnt[ci]; vmesh[ci].instanceMatrix.needsUpdate = true; if (vmesh[ci].instanceColor) vmesh[ci].instanceColor.needsUpdate = true; }
    if (V.sigs) V.sigs.forEach(s => s.lamp.material.color.setHex(sim.green(s.key) ? 0x1fd65a : 0xe5332a));
    if (surfSig) { const L = surfSig.userData.links; for (let i = 0; i < L.length; i++) { const g = surf.green(L[i]); if (g !== L[i]._g) { L[i]._g = g; COL.setHex(g ? 0x1fd65a : 0xe5332a); surfSig.setColorAt(i, COL); surfSig.instanceColor.needsUpdate = true; } } }
  };

  // 太陽位置：依模擬日期、時刻與當地經緯度計算（NOAA 簡化式），同時決定光色、天空與陰影方向
  const DOY = (() => { const d = D.date.split('-').map(Number); return Math.round((Date.UTC(d[0], d[1] - 1, d[2]) - Date.UTC(d[0], 0, 0)) / 864e5); })();
  const sunDir = new T3.Vector3(0, 1, 0), cA = new T3.Color(), cB = new T3.Color();
  V.sun = { az: 0, el: 0 }; V.shadows = true;
  V.setTime = function (tsec) {
    const rad = Math.PI / 180, g = 2 * Math.PI / 365 * (DOY - 1 + ((tsec / 3600) - 12) / 24);
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)); // 分鐘
    const solar = tsec / 60 + eot + 4 * (LON0 - 120), H = (solar / 4 - 180) * rad, lat = LAT0 * rad; // 臺灣標準時 UTC+8（東經 120°）
    const el = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI; // 自北順時針
    V.sun.az = (az / rad + 360) % 360; V.sun.el = el / rad;
    const e2 = Math.max(el, 4 * rad); sunDir.set(Math.sin(az) * Math.cos(e2), Math.sin(e2), -Math.cos(az) * Math.cos(e2)); // 模擬座標 x 東、y 北 → 世界座標 Z = −y
    const d = V.sun.el, day = LK.sstep((d + 4) / 14), high = LK.sstep((d - 4) / 22);
    cA.setHex(0x0b1322); cB.setHex(0xf0b183); const sky = cA.clone().lerp(cB, LK.sstep((d + 8) / 9)); cA.setHex(0xa9cbea); sky.lerp(cA, LK.sstep((d - 1) / 14));
    scene.background = sky; scene.fog.color.copy(sky);
    sun.color.setHex(0xffb070).lerp(cA.setHex(0xfff6e6), high); sun.intensity = 0.8 * LK.sstep((d + 0.5) / 9);
    hemi.intensity = 0.3 + 0.5 * day; // 背光面保留足夠亮度，避免立面細節全黑 hemi.color.setHex(0x7d8fb5).lerp(cA.setHex(0xdfeeff), day);
    sun.castShadow = V.shadows && d > 1.5;
  };
  V.setShadows = function (on) { V.shadows = on; sun.castShadow = on && V.sun.el > 1.5; };

  // 視角
  const VIEWS = {
    all: [[150, 1050, 1500], [-250, 0, 60]], A: [[820, 300, 520], [300, 5, -10]], so: [[640, 200, 360], [320, 12, 20]], ni: [[-120, 200, -420], [240, 8, -90]],
    ws: [[-330, 150, -330], [-330, 0, -5]], wn: [[-790, 150, 360], [-790, 0, 65]], B: [[-1500, 320, 480], [-1050, 0, 0]], hill: [[3100, 330, 1250], [2300, -70, 520]], west: [[-3300, 260, 1500], [-2700, -40, 760]]
  };
  let fly = null;
  V.flyTo = function (name) { const v = VIEWS[name]; if (!v) return; fly = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: new T3.Vector3(...v[0]), t1: new T3.Vector3(...v[1]) }; };
  camera.position.set(...VIEWS.all[0]); controls.target.set(...VIEWS.all[1]);
  V.resize = function () { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  window.addEventListener('resize', V.resize);
  const keys = new Set(), KEYS = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyQ: 'q', KeyE: 'e', ShiftLeft: 'shift', ShiftRight: 'shift' };
  window.addEventListener('keydown', ev => { const t = ev.target, k = KEYS[ev.code]; if (!k || ev.ctrlKey || ev.metaKey || ev.altKey || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.type !== 'range' && t.type !== 'checkbox')) return; keys.add(k); if (k !== 'shift') ev.preventDefault(); });
  window.addEventListener('keyup', ev => { const k = KEYS[ev.code]; if (k) keys.delete(k); });
  window.addEventListener('blur', () => keys.clear()); document.addEventListener('visibilitychange', () => keys.clear());
  window.addEventListener('keydown', ev => { if (ev.metaKey || ev.ctrlKey || ev.altKey) keys.clear(); }, true); // 按著組合鍵時放開按鍵不一定會送出 keyup，避免按鍵卡住
  V._keys = keys;
  V.render = function (dt) {
    if (fly) { fly.t = Math.min(1, fly.t + dt / 1.4); const u = LK.sstep(fly.t); camera.position.lerpVectors(fly.p0, fly.p1, u); controls.target.lerpVectors(fly.t0, fly.t1, u); if (fly.t >= 1) fly = null; }
    // 鍵盤：WASD 沿視線方向平移（Shift 加速），Q／E 以鏡頭位置為軸左右轉向
    if (keys.size) {
      const f = new T3.Vector3().subVectors(controls.target, camera.position); f.y = 0; const dist = Math.max(30, camera.position.distanceTo(controls.target));
      if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize(); const r = new T3.Vector3(-f.z, 0, f.x), sp = dist * 0.9 * dt * (keys.has('shift') ? 3 : 1), mv = new T3.Vector3();
      if (keys.has('w')) mv.addScaledVector(f, sp); if (keys.has('s')) mv.addScaledVector(f, -sp); if (keys.has('d')) mv.addScaledVector(r, sp); if (keys.has('a')) mv.addScaledVector(r, -sp);
      camera.position.add(mv); controls.target.add(mv);
      const yaw = ((keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0)) * 0.9 * dt;
      if (yaw) { const o = new T3.Vector3().subVectors(controls.target, camera.position); o.applyAxisAngle(new T3.Vector3(0, 1, 0), -yaw); controls.target.copy(camera.position).add(o); }
      if (mv.lengthSq() || yaw) fly = null;
    }
    controls.update();
    // 陰影範圍跟隨視點，範圍隨視距調整以維持解析度
    const tg = controls.target, S = Math.max(220, Math.min(2200, camera.position.distanceTo(tg) * 0.85)), sc = sun.shadow.camera;
    sun.target.position.copy(tg); sun.position.copy(tg).addScaledVector(sunDir, 3200);
    if (sc.right !== S) { sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.updateProjectionMatrix(); }
    renderer.render(scene, camera);
  };
  canvas.addEventListener('pointerdown', () => { fly = null; });
})();
