'use strict';
// 介面與模擬主迴圈
(function () {
  const LK = window.LK, D = window.LINKOU, V = window.VIEW, $ = id => document.getElementById(id);
  const DT = 0.25;
  const state = { scen: 'before', t: 7 * 3600, speed: 10, playing: true, par: JSON.parse(JSON.stringify(LK.DEF)) };
  const store = { before: {}, after: {} };
  let net, sim, acc = 0, eff = 0;

  function start() {
    net = LK.buildNet(D, state.scen, V.terr);
    sim = new LK.Sim(net, D, state.par, state.t);
    const S = store[state.scen], b0 = Math.floor(state.t / 300);
    for (const k in S) for (const b in S[k]) if (+b >= b0) delete S[k][b];
    sim.bins = S; window.SIMREF = sim; V.buildNet(net); V.setTime(state.t); acc = 0; refresh(true);
  }
  function clearStore() { store.before = {}; store.after = {}; }

  // ---------- 文字格式 ----------
  const hhmm = t => { t = ((t % 86400) + 86400) % 86400; const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
  const mmss = s => s >= 60 ? Math.floor(s / 60) + ' 分 ' + String(Math.round(s % 60)).padStart(2, '0') + ' 秒' : Math.round(s) + ' 秒';
  const MOV = [['S_in>S_out', '南下 主線直行'], ['S_in>A_S_L', '南下 → 林口A 左轉（龜山、長庚）'], ['S_in>A_S_R', '南下 → 林口A 右轉（林口）'], ['S_in>A_S_T', '南下 → 林口A 直行八德路'], ['S_in>B_S', '南下 → 林口B（文化北路）'], ['A_S_on>S_out', '林口A 南入'], ['B_S_on>S_out', '林口B 南入'],
    ['N_in>N_out', '北上 主線直行'], ['N_in>A_N', '北上 → 林口A'], ['N_in>B_N', '北上 → 林口B（忠義路）'], ['B_N_on>N_out', '林口B 北入'], ['A_N_on>N_out', '林口A 北入（既有匝道）'], ['A_N_on2>N_out', '林口A 北入（新高架匝道）']];
  const PAIRS = [['S_E>S_M', '南下 37.6K → 41.3K（林口A出口上游）'], ['S_M>S_W', '南下 41.3K → 46.7K'], ['N_W>N_M', '北上 46.7K → 41.3K（林口出口上游）'], ['N_M>N_E', '北上 41.3K → 37.6K']];
  const DETS = [['S_E', '南下 37.6K'], ['S_M', '南下 41.3K'], ['S_W', '南下 46.7K'], ['N_W', '北上 46.7K'], ['N_M', '北上 41.3K'], ['N_E', '北上 37.6K']];

  // ---------- 圖表 ----------
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function chart(cv, pk) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const L = 30, R = 6, T = 6, B = 18, X = b => L + (w - L - R) * b / 288, Y = v => T + (h - T - B) * (1 - Math.min(120, v) / 120);
    g.font = '10px "Barlow Semi Condensed", sans-serif'; g.fillStyle = css('--muted'); g.strokeStyle = css('--line'); g.lineWidth = 1;
    [0, 40, 80, 120].forEach(v => { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(w - R, Y(v)); g.stroke(); g.textAlign = 'right'; g.fillText(v, L - 4, Y(v) + 3); });
    [0, 6, 12, 18, 24].forEach(hh => { g.textAlign = 'center'; g.fillText(hh + ':00', X(hh * 12), h - 5); });
    const meas = D.spd[sim.pairs[pk]];
    g.strokeStyle = css('--muted'); g.lineWidth = 1.2; g.beginPath(); let st = false; for (let b = 0; b < 288; b++) { if (!meas[b]) continue; const x = X(b + 0.5), y = Y(meas[b]); if (st) g.lineTo(x, y); else { g.moveTo(x, y); st = true; } } g.stroke();
    [['before', '--c-before'], ['after', '--c-after']].forEach(sc => {
      const S = store[sc[0]]['v:' + pk]; if (!S) return; g.fillStyle = css(sc[1]);
      for (const b in S) { const q = S[b]; if (q.n < 3) continue; g.beginPath(); g.arc(X(+b % 288 + 0.5), Y(q.sd / q.st * 3.6), 2.3, 0, 6.3); g.fill(); }
    });
    const xb = X((sim.t / 300) % 288); g.strokeStyle = css('--ink'); g.globalAlpha = 0.35; g.beginPath(); g.moveTo(xb, T); g.lineTo(xb, h - B); g.stroke(); g.globalAlpha = 1;
  }

  // ---------- 量測面板 ----------
  function binAvg(S, key, b0, b1) { const B = S[key]; if (!B) return null; let n = 0, st = 0, sd = 0; for (let b = b0; b <= b1; b++) if (B[b]) { n += B[b].n; st += B[b].st; sd += B[b].sd; } return n ? { n, t: st / n, st, sd } : null; }
  function freeTime(key) { const ab = key.split('>'), sink = ab[1] === 'A_S_R' || ab[1] === 'A_S_T' ? 'A_S' : ab[1] === 'A_S_L' ? (state.scen === 'after' ? 'FLY1' : 'A_S') : ab[1]; const p = sim.pathFor(ab[0], sink); if (!p) return 0; let t = 0; p.e.forEach(e => { t += e.len / (Math.min(e.vlim, 100) / 3.6); }); return t; }
  let lastUI = 0;
  function refresh(force) {
    const now = performance.now(); if (!force && now - lastUI < 500) return; lastUI = now;
    $('clock').textContent = hhmm(sim.t); $('tslider').value = Math.floor(sim.t / 300) % 288;
    $('eff').textContent = state.playing ? '實際 ' + eff.toFixed(0) + '×' : '暫停';
    $('sun-info').textContent = V.sun.el > 0 ? '太陽高度角 ' + V.sun.el.toFixed(1) + '°，方位角 ' + V.sun.az.toFixed(0) + '°（自北順時針）' : '太陽在地平線下 ' + (-V.sun.el).toFixed(1) + '°（夜間）';
    const snap = sim.snapshot(), b = Math.floor(sim.t / 300);
    $('k-veh').textContent = snap.n.toLocaleString(); $('k-slow').textContent = snap.queued.toLocaleString();
    $('k-spillS').textContent = snap.spill.S; $('k-spillN').textContent = snap.spill.N;
    let wq = 0; for (const k in snap.srcQ) wq += snap.srcQ[k]; $('k-wait').textContent = wq.toLocaleString(); $('k-miss').textContent = (sim.missed || 0).toLocaleString();
    if (!$('tab-meas').hidden || force) {
      // 門架流量
      let h = '';
      DETS.forEach(d => { const q = (sim.bins['q:' + d[0]] || {})[b - 1], m = D.vol[sim.detG[d[0]]][(b - 1 + 288) % 288].reduce((a, c) => a + c, 0) * 12 * state.par.growth; h += '<tr><th>' + d[1] + '</th><td>' + (q ? (q.n * 12).toLocaleString() : '—') + '</td><td>' + Math.round(m).toLocaleString() + '</td><td>' + (q && q.n ? Math.round(q.st / q.n * 3.6) : '—') + '</td></tr>'; });
      $('tb-det').innerHTML = h;
      h = '';
      MOV.forEach(m => {
        const A = binAvg(store.before, 'm:' + m[0], b - 3, b), Bf = binAvg(store.after, 'm:' + m[0], b - 3, b); if (!A && !Bf) return;
        const f = v => v ? '<b>' + mmss(v.t) + '</b><small>' + v.n + ' 輛</small>' : '<span class="na">—</span>';
        let d = ''; if (A && Bf) { const r = (Bf.t - A.t) / A.t * 100; d = '<span class="' + (r < -3 ? 'good' : r > 3 ? 'bad' : '') + '">' + (r > 0 ? '+' : '') + r.toFixed(0) + '%</span>'; }
        h += '<tr><th>' + m[1] + '</th><td>' + f(A) + '</td><td>' + f(Bf) + '</td><td>' + d + '</td></tr>';
      });
      $('tb-mov').innerHTML = h || '<tr><td colspan="4" class="na">車輛駛離路網後才會出現統計，約需模擬 5 分鐘。</td></tr>';
      PAIRS.forEach((p, i) => chart($('ch' + i), p[0]));
    }
  }

  // ---------- 主迴圈 ----------
  let last = performance.now(), effT = 0, effS = 0;
  function frame(now) {
    const rdt = Math.min(0.1, (now - last) / 1000); last = now;
    if (state.playing && sim.t < 86400) {
      acc += rdt * state.speed; const t0 = performance.now(); let n = 0;
      while (acc >= DT && performance.now() - t0 < 24) { sim.step(DT); acc -= DT; n++; }
      if (acc > DT * 8) acc = 0;
      effT += rdt; effS += n * DT; if (effT > 1) { eff = effS / effT; effT = effS = 0; V.setTime(sim.t); }
      state.t = sim.t;
    }
    V.drawVehicles(sim); V.updateTrains(sim.t); V.render(rdt); refresh(false);
    requestAnimationFrame(frame);
  }

  // ---------- 控制項 ----------
  function seg(id, key, cb) { $(id).addEventListener('click', ev => { const b = ev.target.closest('button[data-v]'); if (!b) return; [...$(id).querySelectorAll('button')].forEach(x => x.setAttribute('aria-pressed', x === b)); cb(b.dataset.v); }); }
  seg('scen', 'scen', v => { state.scen = v; document.body.dataset.scen = v; start(); });
  seg('speed', 'speed', v => { state.speed = +v; });
  seg('colmode', 'colmode', v => { V.colorMode = v; $('legend').hidden = v !== 'speed'; });
  $('play').addEventListener('click', () => { state.playing = !state.playing; $('play').textContent = state.playing ? '暫停' : '繼續'; $('play').setAttribute('aria-pressed', !state.playing); });
  $('tslider').addEventListener('change', ev => { state.t = +ev.target.value * 300; start(); });
  $('tslider').addEventListener('input', ev => { $('clock').textContent = hhmm(+ev.target.value * 300); });
  document.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => { state.t = +b.dataset.jump * 3600; start(); }));
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { if (b.dataset.scen && state.scen !== b.dataset.scen) { state.scen = b.dataset.scen; document.body.dataset.scen = state.scen; [...$('scen').querySelectorAll('button')].forEach(x => x.setAttribute('aria-pressed', x.dataset.v === state.scen)); start(); } V.flyTo(b.dataset.view); if (window.innerWidth < 760) $('panel').classList.add('collapsed'); }));
  $('hl').addEventListener('change', ev => V.setHighlight(ev.target.checked));
  $('sh').addEventListener('change', ev => V.setShadows(ev.target.checked));
  $('lb').addEventListener('change', ev => { V.labels.visible = ev.target.checked; });
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b)); document.querySelectorAll('.tab').forEach(t => { t.hidden = t.id !== 'tab-' + b.dataset.tab; }); $('panel').classList.remove('collapsed'); refresh(true); }));
  $('collapse').addEventListener('click', () => $('panel').classList.toggle('collapsed'));
  // 參數滑桿
  const PARS = [['growth', '需求成長倍率', 0.5, 1.6, 0.05, v => Math.round(v * 100) + '%'], ['gcA_S', '林口A 南出端 綠燈比', 0.2, 0.8, 0.01, v => v.toFixed(2)], ['gcB_S', '林口B 南出端 綠燈比', 0.2, 0.8, 0.01, v => v.toFixed(2)], ['gcA_N', '林口A 北出端 綠燈比', 0.2, 0.8, 0.01, v => v.toFixed(2)], ['gcB_N', '林口B 北出端 綠燈比', 0.2, 0.8, 0.01, v => v.toFixed(2)],
    ['cycle', '號誌週期（秒）', 60, 240, 10, v => v + ' 秒'], ['alphaS', '南出車流走林口A的比例', 0.3, 0.9, 0.01, v => Math.round(v * 100) + '%'], ['betaS', '南入車流來自林口A的比例', 0.2, 0.8, 0.01, v => Math.round(v * 100) + '%'], ['alphaN', '北出車流走林口A的比例', 0.2, 0.8, 0.01, v => Math.round(v * 100) + '%'], ['betaN', '北入車流來自林口A的比例', 0.3, 0.9, 0.01, v => Math.round(v * 100) + '%'],
    ['left', '林口A南出左轉（往龜山）比例', 0.1, 0.6, 0.01, v => Math.round(v * 100) + '%'], ['newOn', '改善後使用北入新匝道比例', 0.1, 0.6, 0.01, v => Math.round(v * 100) + '%']];
  const getP = k => k.startsWith('gc') ? state.par.gc[k.slice(2)] : state.par[k];
  const setP = (k, v) => { if (k.startsWith('gc')) state.par.gc[k.slice(2)] = v; else state.par[k] = v; };
  $('pars').innerHTML = PARS.map(p => '<label class="par" for="p-' + p[0] + '"><span>' + p[1] + '</span><output id="o-' + p[0] + '">' + p[5](getP(p[0])) + '</output><input type="range" id="p-' + p[0] + '" min="' + p[2] + '" max="' + p[3] + '" step="' + p[4] + '" value="' + getP(p[0]) + '"></label>').join('');
  PARS.forEach(p => { const el = $('p-' + p[0]); el.addEventListener('input', () => { $('o-' + p[0]).textContent = p[5](+el.value); }); el.addEventListener('change', () => { setP(p[0], +el.value); clearStore(); start(); }); });
  $('bound').addEventListener('change', ev => { state.par.bound = ev.target.checked; clearStore(); start(); });
  $('reset').addEventListener('click', () => { state.par = JSON.parse(JSON.stringify(LK.DEF)); PARS.forEach(p => { $('p-' + p[0]).value = getP(p[0]); $('o-' + p[0]).textContent = p[5](getP(p[0])); }); $('bound').checked = true; clearStore(); start(); });
  // 匯出
  $('copy').addEventListener('click', () => {
    const rows = ['情境,時段起,項目,模擬流量(輛/時),實測流量(輛/時),模擬速率(km/h),實測速率(km/h),樣本數'];
    ['before', 'after'].forEach(sc => { const S = store[sc];
      DETS.forEach(d => { const B = S['q:' + d[0]]; if (!B) return; Object.keys(B).sort((a, c) => a - c).forEach(b => { const m = D.vol[sim.detG[d[0]]][b % 288].reduce((a, c) => a + c, 0) * 12; rows.push([sc === 'before' ? '現況' : '改善後', hhmm(b * 300).slice(0, 5), '門架 ' + sim.detG[d[0]], B[b].n * 12, m, (B[b].st / B[b].n * 3.6).toFixed(1), '', B[b].n].join(',')); }); });
      PAIRS.forEach(p => { const B = S['v:' + p[0]]; if (!B) return; Object.keys(B).sort((a, c) => a - c).forEach(b => rows.push([sc === 'before' ? '現況' : '改善後', hhmm(b * 300).slice(0, 5), '區間 ' + sim.pairs[p[0]], '', '', (B[b].sd / B[b].st * 3.6).toFixed(1), D.spd[sim.pairs[p[0]]][b % 288], B[b].n].join(','))); });
      MOV.forEach(m => { const B = S['m:' + m[0]]; if (!B) return; Object.keys(B).sort((a, c) => a - c).forEach(b => rows.push([sc === 'before' ? '現況' : '改善後', hhmm(b * 300).slice(0, 5), '動向 ' + m[1] + ' 平均行駛秒數', '', '', (B[b].st / B[b].n).toFixed(0), '', B[b].n].join(','))); });
    });
    const txt = rows.join('\n'), ta = $('csv'); ta.value = txt; ta.hidden = false;
    const done = ok => { $('copy-msg').textContent = ok ? '已複製 ' + (rows.length - 1) + ' 列到剪貼簿' : '無法自動複製，請在下方文字框全選後複製'; };
    try { navigator.clipboard.writeText(txt).then(() => done(true), () => { ta.select(); done(false); }); } catch (e) { ta.select(); done(false); }
  });

  $('date').textContent = D.date.replace(/-/g, '/');
  $('bld-note').textContent = D.bld.length.toLocaleString();
  function layout() { const h = $('bar').offsetHeight; if (window.innerWidth >= 760) { $('panel').style.top = (h + 10) + 'px'; $('help').style.top = (h + 10) + 'px'; $('legend').style.top = ''; } else { $('panel').style.top = ''; $('legend').style.top = (h + 8) + 'px'; } }
  window.addEventListener('resize', layout); layout();
  V.resize(); start(); V.resize();
  $('bld-known').textContent = V.bldKnown;
  requestAnimationFrame(frame);
  window.APP = { state, store, get sim() { return sim; } };
})();
