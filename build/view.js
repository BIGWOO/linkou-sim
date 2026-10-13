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
    ground: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#a3b384'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const c = 120 + Math.random() * 70; g.fillStyle = 'rgba(' + (c * 0.8 | 0) + ',' + (c | 0) + ',' + (c * 0.55 | 0) + ',0.35)'; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 2 + Math.random() * 5); } }, 200, 80),
    street: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#6a6e73'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, 0.08, false); noise(g, w, h, 1500, 0.12, true); g.fillStyle = '#d9d9d2'; g.fillRect(2, 0, 3, h); g.fillRect(w - 5, 0, 3, h); g.fillStyle = '#e3c341'; g.fillRect(w / 2 - 1.5, 0, 3, h * 0.5); }),
    concrete: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#b9b7b0'; g.fillRect(0, 0, w, h); noise(g, w, h, 2500, 0.08, true); g.fillStyle = 'rgba(60,60,60,0.25)'; g.fillRect(0, 0, w, 2); })
  };
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
  const sun = new T3.DirectionalLight(0xfff3dc, 0.85); sun.position.set(-600, 900, 500); scene.add(sun);
  V.scene = scene; V.camera = camera; V.controls = controls; V.renderer = renderer;

  // 地形網格（30 m），供地面道路與建物貼地
  const GS = 30, GX0 = -4300, GY0 = -1800, GNX = 278, GNY = 108, GH = new Float32Array(GNX * GNY);
  for (let j = 0; j < GNY; j++) for (let i = 0; i < GNX; i++) GH[j * GNX + i] = terr.T(GX0 + i * GS, GY0 + j * GS);
  function gh(x, y) { let fx = (x - GX0) / GS, fy = (y - GY0) / GS; fx = Math.max(0, Math.min(GNX - 1.001, fx)); fy = Math.max(0, Math.min(GNY - 1.001, fy)); const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * GNX + i; return (GH[k] * (1 - u) + GH[k + 1] * u) * (1 - v) + (GH[k + GNX] * (1 - u) + GH[k + GNX + 1] * u) * v; }
  V.gh = gh;
  (function terrain() {
    const pos = new Float32Array(GNX * GNY * 3), uv = new Float32Array(GNX * GNY * 2), col = new Float32Array(GNX * GNY * 3), idx = [];
    for (let j = 0; j < GNY; j++) for (let i = 0; i < GNX; i++) {
      const k = j * GNX + i, x = GX0 + i * GS, y = GY0 + j * GS, h = GH[k];
      pos.set([x, h - BASE - 0.05, -y], k * 3); uv.set([i / (GNX - 1), j / (GNY - 1)], k * 2);
      const sl = Math.min(1, (Math.abs(GH[Math.min(GNX * GNY - 1, k + 1)] - h) + Math.abs(GH[Math.min(GNX * GNY - 1, k + GNX)] - h)) / 18), f = 0.92 + hash(i, j) * 0.16;
      col.set([(0.92 - sl * 0.25) * f, (1.0 - sl * 0.2) * f, (0.9 - sl * 0.3) * f], k * 3);
      if (i < GNX - 1 && j < GNY - 1) idx.push(k, k + 1, k + GNX, k + 1, k + GNX + 1, k + GNX);
    }
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.BufferAttribute(pos, 3)); g.setAttribute('uv', new T3.BufferAttribute(uv, 2)); g.setAttribute('color', new T3.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    scene.add(new T3.Mesh(g, new T3.MeshLambertMaterial({ map: TEX.ground, vertexColors: true })));
  })();

  // 地面道路
  (function streets() {
    const WD = { secondary: 9, tertiary: 8, residential: 6, unclassified: 6, service: 4, living_street: 5, secondary_link: 5, tertiary_link: 5 };
    const P = [], U = [], N = [], I = []; const conc = Acc(); let base = 0;
    D.roads.forEach(r => {
      const w = (r.ln ? r.ln * 3.3 + 1 : (WD[r.t] || 5)) / 2, pts = LK.resample(r.p, false, 12), n = pts.length;
      let hs = pts.map(p => gh(p[0], p[1]) + 0.18);
      if (r.br) { // 跨越橋：兩端接地，中段至少高出國道 6.8 m
        const hA = hs[0], hB = hs[n - 1], mid = pts[n >> 1], need = terr.M(mid[0]) + 6.8, bump = Math.max(0, need - (hA + hB) / 2);
        hs = pts.map((p, i) => { const t = i / (n - 1); return hA + (hB - hA) * t + bump * LK.sstep(Math.min(1, Math.min(t, 1 - t) * 3.2)); });
      }
      let s = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, rx = (b[1] - a[1]) / d, ry = -(b[0] - a[0]) / d, p = pts[i];
        if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
        P.push(p[0] - rx * w, hs[i] - BASE, -(p[1] - ry * w), p[0] + rx * w, hs[i] - BASE, -(p[1] + ry * w)); U.push(0, s / 12, 1, s / 12); N.push(0, 1, 0, 0, 1, 0);
        if (i) { const q = base + (i - 1) * 2; I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
        if (r.br && i) { // 橋面側牆
          const p0 = pts[i - 1], a0 = pts[Math.max(0, i - 2)], d0 = Math.hypot(p[0] - a0[0], p[1] - a0[1]) || 1, r0x = (p[1] - a0[1]) / d0, r0y = -(p[0] - a0[0]) / d0, y0 = hs[i - 1] - BASE, y1 = hs[i] - BASE;
          for (const sgn of [-1, 1]) { const A = [p0[0] + sgn * r0x * w, y0 + 0.9, -(p0[1] + sgn * r0y * w)], B = [p[0] + sgn * rx * w, y1 + 0.9, -(p[1] + sgn * ry * w)]; quad(conc, [A[0], y0 - 1.3, A[2]], [B[0], y1 - 1.3, B[2]], B, A); quad(conc, [B[0], y1 - 1.3, B[2]], [A[0], y0 - 1.3, A[2]], A, B); }
          if (i % 3 === 0 && hs[i] - gh(p[0], p[1]) > 3.5 && Math.abs(p[1] - terr.Yc(p[0])) > 22) box(conc, p[0], gh(p[0], p[1]) - BASE, -p[1], 1.6, hs[i] - gh(p[0], p[1]) - 1.2, 1.6);
        }
      }
      base += n * 2;
    });
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new T3.Float32BufferAttribute(U, 2)); g.setAttribute('normal', new T3.Float32BufferAttribute(N, 3)); g.setIndex(I);
    scene.add(new T3.Mesh(g, new T3.MeshLambertMaterial({ map: TEX.street, side: T3.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })));
    scene.add(toMesh(conc, new T3.MeshLambertMaterial({ color: 0xb4b2ab })));
  })();

  // 建物
  (function buildings() {
    const kinds = { apt: Acc(), glass: Acc(), ind: Acc(), shop: Acc(), gen: Acc() }, roofs = Acc();
    const DEFH = { apartments: 42, residential: 16, house: 9, industrial: 12, school: 14, retail: 14, hospital: 36, commercial: 24, office: 30, roof: 6, construction: 12, yes: 12 };
    const KIND = { apartments: 'apt', residential: 'apt', house: 'gen', industrial: 'ind', school: 'gen', retail: 'shop', commercial: 'shop', hospital: 'glass', office: 'glass' };
    const PAL = { apt: [[0.95, 0.92, 0.86], [0.86, 0.84, 0.8], [0.93, 0.86, 0.78], [0.8, 0.82, 0.84]], glass: [[0.9, 0.95, 1], [0.8, 0.9, 0.95]], ind: [[0.95, 0.95, 0.95], [0.75, 0.82, 0.9], [0.9, 0.86, 0.78]], shop: [[1, 0.96, 0.9], [0.9, 0.9, 0.9]], gen: [[0.95, 0.93, 0.88], [0.85, 0.85, 0.82]] };
    let known = 0;
    D.bld.forEach((b, bi) => {
      let p = b.p; if (p.length < 3) return;
      let area = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; area += p[i][0] * q[1] - q[0] * p[i][1]; }
      if (area < 0) p = p.slice().reverse(); area = Math.abs(area) / 2; if (area < 12) return;
      let H = b.h || (b.lv ? b.lv * 3.3 + 1 : 0); if (H) known++; else { H = (DEFH[b.t] || 12) * (0.82 + hash(bi, 7) * 0.36); if (b.t === 'apartments' || b.t === 'residential') H *= area < 160 ? 0.35 : area < 420 ? 0.7 : 1; }
      if (b.t === 'roof') H = 6;
      const kd = KIND[b.t] || (H > 30 ? 'apt' : 'gen'), acc = kinds[kd], pal = PAL[kd], col = pal[(hash(bi, 3) * pal.length) | 0];
      let y0 = 1e9; p.forEach(q => { y0 = Math.min(y0, gh(q[0], q[1])); }); y0 -= BASE + 0.5; const y1 = y0 + H + 0.5;
      let u = 0;
      for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); quad(acc, [a[0], y0, -a[1]], [c[0], y0, -c[1]], [c[0], y1, -c[1]], [a[0], y1, -a[1]], col, [u / 12.8, (u + L) / 12.8, 0, (H + 0.5) / 13.2]); u += L; }
      const tris = T3.ShapeUtils.triangulateShape(p.map(q => new T3.Vector2(q[0], q[1])), []), rc = [0.62 + hash(bi, 5) * 0.12, 0.62 + hash(bi, 5) * 0.12, 0.6 + hash(bi, 5) * 0.12];
      tris.forEach(t => { const a = p[t[0]], c = p[t[1]], e = p[t[2]]; tri(roofs, a[0], y1, -a[1], e[0], y1, -e[1], c[0], y1, -c[1], rc); });
    });
    V.bldKnown = known; V.bldTotal = D.bld.length;
    for (const k in kinds) if (kinds[k].p.length) scene.add(toMesh(kinds[k], new T3.MeshLambertMaterial({ map: facade(k), vertexColors: true })));
    scene.add(toMesh(roofs, new T3.MeshLambertMaterial({ vertexColors: true, side: T3.DoubleSide })));
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
  [['林口A交流道 41K', 263, 20, 34], ['林口B交流道', -1010, 0, 34], ['文化一路', 255, 330, 14, 1], ['文化二路', -180, 420, 14, 1], ['文化三路', -520, 420, 14, 1], ['文化北路', -1080, 380, 14, 1], ['忠義路', -1120, -330, 14, 1], ['八德路', -330, 95, 10, 1], ['龜山一路', -420, -120, 10, 1], ['林口長庚醫院', 160, -400, 60, 2], ['機捷 A9 林口站', -473, 62, 30, 2], ['機捷 A8 長庚醫院站', 430, -500, 30, 2], ['往臺北 ▶', 2500, -470, 40, 3], ['◀ 往桃園', -2900, -700, 40, 3]]
    .forEach(l => labels.add(label(l[0], l[1], l[2], l[3], l[4] === 1 ? { bg: 'rgba(40,44,52,0.82)', size: 0.022 } : l[4] === 2 ? { bg: 'rgba(120,60,140,0.9)', size: 0.024 } : l[4] === 3 ? { bg: 'rgba(0,92,52,0.92)', size: 0.026 } : null)));

  // ---------- 路網（隨情境重建） ----------
  let netGroup = null; const GC = { so: 0xff8e7a, ni: 0x7fb2ff, ws: 0x7fe0d2, wn: 0xf2d16b };
  V.GC = GC; V.highlight = true;
  const concMat = new T3.MeshLambertMaterial({ map: TEX.concrete, color: 0xd0cec6 }), concPlain = new T3.MeshLambertMaterial({ color: 0xb9b7b0 });
  V.buildNet = function (net) {
    if (netGroup) { scene.remove(netGroup); netGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    netGroup = new T3.Group(); scene.add(netGroup); V.net = net; V.newMats = [];
    const conc = Acc(), P = [0, 0, 0, 0, 0, 0];
    net.edges.forEach(e => {
      const main = e.k === 'm' || e.k === 'v', sl = main ? 1.0 : 0.8, sr = main ? 3.0 : 1.5, half = e.n * e.lw / 2, pts = edgePts(e);
      const mat = new T3.MeshLambertMaterial({ map: laneTex(e.n, e.lw, sl, sr, main), side: T3.DoubleSide, polygonOffset: true, polygonOffsetFactor: main ? -3 : -4, polygonOffsetUnits: main ? -6 : -8 });
      if (e.grp) { mat.userData = { grp: e.grp }; V.newMats.push(mat); if (V.highlight) mat.color.setHex(GC[e.grp]); }
      const m = new T3.Mesh(ribbonGeo(pts, half + sl, half + sr, 10, e.k === 'm' ? 0.22 : 0.3), mat); m.userData.edge = e; netGroup.add(m);
      const wl = half + sl, wr = half + sr;
      // 中央護欄、高架側牆、橋墩、擋土牆
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], ya = a[2] - BASE + 0.3, yb = b[2] - BASE + 0.3;
        const L = (p, w) => [p[0] - p[4] * w, 0, -(p[1] + p[3] * w)], R = (p, w) => [p[0] + p[4] * w, 0, -(p[1] - p[3] * w)];
        const wallAt = (fa, fb, top, bot0, bot1) => { const A = fa, B = fb; quad(conc, [A[0], ya + bot0, A[2]], [B[0], yb + bot1, B[2]], [B[0], yb + top, B[2]], [A[0], ya + top, A[2]]); quad(conc, [B[0], yb + bot1, B[2]], [A[0], ya + bot0, A[2]], [A[0], ya + top, A[2]], [B[0], yb + top, B[2]]); };
        if (e.k === 'm') wallAt(L(a, wl + 0.3), L(b, wl + 0.3), 0.85, 0, 0);
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
          const ground = e.k === 'v' ? terr.M(P[0]) : P[2] - off;
          if (e.k !== 'v' && Math.abs(P[1] - terr.Yc(P[0])) < 19) continue; // 不在主線車道上立墩
          if (e.k === 'v' && Math.abs(P[1] - terr.Yc(P[0])) < 21) { // 位於國道上方：改以門型橋墩跨越
            const yc = terr.Yc(P[0]); box(conc, P[0], ground - BASE, -(yc + 24), 2.2, P[2] - ground - 1.4, 2.2); box(conc, P[0], ground - BASE, -(yc - 24), 2.2, P[2] - ground - 1.4, 2.2); box(conc, P[0], P[2] - BASE - 3.2, -yc, 2.4, 1.8, 50);
          } else {
            box(conc, P[0], ground - BASE, -P[1], sz, P[2] - ground - 1.4, sz);
            box(conc, P[0], P[2] - BASE - 1.9, -P[1], sz * 1.1, 0.5, Math.min(e.n * e.lw + 3, 14) * 0.8);
          }
        }
      }
    });
    conc.u = []; netGroup.add(toMesh(conc, concPlain));
    // ETC 門架與號誌
    V.sigs = [];
    const pole = Acc();
    for (const k in net.sinks) { const e = net.sinks[k]; if (!e.sig) continue; LK.posAt(e, e.len - 1, e.n * e.lw / 2 + 1.2, P); box(pole, P[0], P[2] - BASE, -P[1], 0.25, 6, 0.25); const lamp = new T3.Mesh(new T3.SphereGeometry(0.9, 12, 8), new T3.MeshBasicMaterial({ color: 0xff0000 })); lamp.position.set(P[0], P[2] - BASE + 6.4, -P[1]); netGroup.add(lamp); V.sigs.push({ key: e.sig, lamp }); }
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
  LK.CLS.forEach((c, ci) => { const m = new T3.InstancedMesh(vehGeo(c, ci), new T3.MeshLambertMaterial({ vertexColors: true }), MAXV[ci]); m.frustumCulled = false; m.setColorAt(0, new T3.Color(1, 1, 1)); m.count = 0; m.instanceMatrix.setUsage(T3.DynamicDrawUsage); scene.add(m); vmesh.push(m); });
  const CARCOL = [[0.95, 0.95, 0.95], [0.78, 0.8, 0.82], [0.12, 0.12, 0.14], [0.45, 0.47, 0.5], [0.16, 0.25, 0.5], [0.62, 0.1, 0.1], [0.9, 0.9, 0.86], [0.3, 0.33, 0.3]];
  const CLSCOL = [null, [[0.95, 0.95, 0.95], [0.2, 0.4, 0.7], [0.85, 0.75, 0.2]], [[0.2, 0.55, 0.35], [0.9, 0.9, 0.9], [0.2, 0.35, 0.65]], [[0.25, 0.45, 0.75], [0.9, 0.9, 0.9], [0.7, 0.25, 0.2]], [[0.9, 0.9, 0.9], [0.75, 0.2, 0.15], [0.2, 0.3, 0.55]]];
  V.colorMode = 'speed';
  const M4 = new T3.Matrix4(), Q = new T3.Quaternion(), E = new T3.Euler(0, 0, 0, 'YZX'), S1 = new T3.Vector3(1, 1, 1), PV = new T3.Vector3(), COL = new T3.Color(), PP = [0, 0, 0, 0, 0, 0];
  V.drawVehicles = function (sim) {
    const cnt = [0, 0, 0, 0, 0], edges = sim.net.edges, spd = V.colorMode === 'speed';
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei], vref = e.vlim / 3.6;
      for (let l = 0; l < e.n; l++) {
        const arr = e.L[l];
        for (let i = 0; i < arr.length; i++) {
          const v = arr[i], ci = v.cls, k = cnt[ci]; if (k >= MAXV[ci]) continue;
          LK.posAt(e, v.s, v.lat, PP);
          E.set(0, Math.atan2(PP[4], PP[3]), Math.atan(PP[5])); Q.setFromEuler(E);
          PV.set(PP[0] + v.ox, PP[2] - BASE + 0.32, -(PP[1] + v.oy)); M4.compose(PV, Q, S1); vmesh[ci].setMatrixAt(k, M4);
          if (spd) { const r = Math.min(1, v.v / vref); COL.setHSL(r * 0.34, 0.85, 0.46); }
          else { const pal = ci === 0 ? CARCOL : CLSCOL[ci], c = pal[(v.col * pal.length) | 0]; COL.setRGB(c[0], c[1], c[2]); }
          vmesh[ci].setColorAt(k, COL); cnt[ci] = k + 1;
        }
      }
    }
    for (let ci = 0; ci < 5; ci++) { vmesh[ci].count = cnt[ci]; vmesh[ci].instanceMatrix.needsUpdate = true; if (vmesh[ci].instanceColor) vmesh[ci].instanceColor.needsUpdate = true; }
    if (V.sigs) V.sigs.forEach(s => s.lamp.material.color.setHex(sim.green(s.key) ? 0x1fd65a : 0xe5332a));
  };

  // 天色隨時間變化
  const SKY = [[0, 0x0d1524], [5, 0x1a2538], [6.2, 0xf0b98a], [7.5, 0xbfd9ee], [16.5, 0xbfd4e6], [18, 0xf3a56b], [19, 0x27304a], [24, 0x0d1524]];
  V.setTime = function (tsec) {
    const h = (tsec / 3600) % 24; let i = 0; while (i < SKY.length - 2 && h > SKY[i + 1][0]) i++;
    const a = SKY[i], b = SKY[i + 1], u = (h - a[0]) / (b[0] - a[0]);
    const c = new T3.Color(a[1]).lerp(new T3.Color(b[1]), Math.max(0, Math.min(1, u)));
    scene.background = c; scene.fog.color.copy(c);
    const day = Math.min(1, Math.max(0, Math.sin((h - 5.3) / 13.6 * Math.PI)) * 3); hemi.intensity = 0.42 + 0.5 * day; sun.intensity = 0.08 + 0.62 * day;
    const ang = (h - 5.5) / 13.5 * Math.PI; sun.position.set(Math.cos(ang) * 1200, Math.max(120, Math.sin(ang) * 1200), 500);
  };

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
  V.render = function (dt) {
    if (fly) { fly.t = Math.min(1, fly.t + dt / 1.4); const u = LK.sstep(fly.t); camera.position.lerpVectors(fly.p0, fly.p1, u); controls.target.lerpVectors(fly.t0, fly.t1, u); if (fly.t >= 1) fly = null; }
    controls.update(); renderer.render(scene, camera);
  };
  canvas.addEventListener('pointerdown', () => { fly = null; });
})();
