// Organica simulation worker — owns the Gray-Scott grid (U/V/C) and runs the
// per-frame ticks off the main thread, posting V/C snapshots back for rendering.
// Loaded via `new Worker('sim-worker.js')`. No DOM access.
(function () {
  'use strict';
  var W = 0, H = 0;
  var U, V, U_next, V_next, C, C_next;
  var seedAnchors = [];
  var cellSeed1 = null, cellSeed2 = null;
  var frameCount = 0, stableCount = 0, stabilityPrev = null;
  var running = false;
  var params = {
    f: 0.055, k: 0.062, Du: 0.21, Dv: 0.105, stepsPerFrame: 40,
    seed: '', seedMode: 'spots',
    coloredSeeds: false, seedColorRandom: false,
    seedColorDiff: 1.0, seedColorDiffusion: 0.08, seedColorOffset: 0.0,
    seedColorBrightness: 0.0, seedPalette: 'viridis'
  };
  var stableFrames = 15;
  var VIS_BIN = 2.5 / 255;      // CPU float tail keeps a slightly larger residual motion than GPU
  var STABLE_VIS_FRAC = 0.0003; // allow up to 0.03% of cells to flicker without counting as "still evolving"
  var STABLE_DECAY = 2;         // a single non-stable frame only nudges the counter down, not a full reset
  var SEED_U = 0.5, SEED_V = 0.25;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = Math.imul(31, h) + s.charCodeAt(i) | 0; }
    return h >>> 0;
  }
  function paintBlob(cx, cy, radius, uVal, vVal) {
    var r2 = radius * radius;
    for (var dy = -radius; dy <= radius; dy++) {
      var yy = (((cy + dy) % H) + H) % H;
      var row = yy * W;
      var span = Math.floor(Math.sqrt(r2 - dy * dy));
      for (var dx = -span; dx <= span; dx++) {
        var xx = (((cx + dx) % W) + W) % W;
        U[row + xx] = uVal; V[row + xx] = vVal;
      }
    }
  }
  function paintSquare(cx, cy, half, uVal, vVal) {
    for (var dy = -half; dy <= half; dy++) {
      var yy = (((cy + dy) % H) + H) % H;
      var row = yy * W;
      for (var dx = -half; dx <= half; dx++) {
        var xx = (((cx + dx) % W) + W) % W;
        U[row + xx] = uVal; V[row + xx] = vVal;
      }
    }
  }
  function paintBand(pos, thickness, vertical, uVal, vVal) {
    var along = vertical ? W : H;
    for (var a = pos; a < pos + thickness; a++) {
      var aa = ((a % along) + along) % along;
      for (var b = 0; b < (vertical ? H : W); b++) {
        var i = vertical ? (b * W + aa) : (aa * W + b);
        U[i] = uVal; V[i] = vVal;
      }
    }
  }
  function initGrid(w, h, seedStr, mode) {
    W = w; H = h;
    var n = w * h;
    U = new Float32Array(n); V = new Float32Array(n); C = new Float32Array(n);
    U_next = new Float32Array(n); V_next = new Float32Array(n); C_next = new Float32Array(n);
    U.fill(1); V.fill(0);
    var rand = mulberry32(hashStr(seedStr));
    seedAnchors = [];
    if (mode === 'spots') {
      var count = 20 + Math.floor(rand() * 61);
      for (var s = 0; s < count; s++) {
        var bx = Math.floor(rand() * w), by = Math.floor(rand() * h);
        var br = 2 + Math.floor(rand() * 7);
        paintBlob(bx, by, br, SEED_U, SEED_V);
        seedAnchors.push({ type: 'blob', x: bx, y: by, r: br });
      }
    } else if (mode === 'stripe') {
      var bands = 3 + Math.floor(rand() * 8);
      var vertical = rand() < 0.5;
      var maxThick = Math.max(3, Math.floor((vertical ? w : h) / 64));
      for (var b = 0; b < bands; b++) {
        var pos = Math.floor(rand() * (vertical ? w : h));
        var thick = 1 + Math.floor(rand() * maxThick);
        paintBand(pos, thick, vertical, SEED_U, SEED_V);
        seedAnchors.push({ type: 'band', pos: pos, thick: thick, vertical: vertical });
      }
    } else if (mode === 'noise') {
      for (var i = 0; i < n; i++) { U[i] = 0.8 + rand() * 0.2; V[i] = rand() * 0.2; }
    } else if (mode === 'center') {
      var cx = w >> 1, cy = h >> 1, r = Math.max(4, w >> 3);
      paintSquare(cx, cy, r, SEED_U, SEED_V);
      seedAnchors.push({ type: 'blob', x: cx, y: cy, r: r });
    } else if (mode === 'corners') {
      var off2 = Math.max(4, w >> 3);
      var rad = Math.max(3, w >> 4);
      var cs = [[off2, off2], [w - off2, off2], [off2, h - off2], [w - off2, h - off2]];
      for (var c = 0; c < cs.length; c++) {
        paintBlob(cs[c][0], cs[c][1], rad, SEED_U, SEED_V);
        seedAnchors.push({ type: 'blob', x: cs[c][0], y: cs[c][1], r: rad });
      }
    } else if (mode === 'cross') {
      var th = Math.max(2, Math.round(w / 128));
      var px = (w >> 1) - (th >> 1), py = (h >> 1) - (th >> 1);
      paintBand(px, th, false, SEED_U, SEED_V);
      paintBand(py, th, true, SEED_U, SEED_V);
      seedAnchors.push({ type: 'band', pos: px, thick: th, vertical: false });
      seedAnchors.push({ type: 'band', pos: py, thick: th, vertical: true });
    } else if (mode === 'random_scatter') {
      for (var j = 0; j < n; j++) { U[j] = rand(); V[j] = rand(); }
    }
    computeVoronoi();
    assignColors();
    frameCount = 0;
  }
  function computeVoronoi() {
    var n = W * H;
    if (!cellSeed1 || cellSeed1.length !== n) {
      cellSeed1 = new Int32Array(n); cellSeed2 = new Int32Array(n);
    }
    var pts = [];
    for (var a = 0; a < seedAnchors.length; a++) {
      var an = seedAnchors[a];
      var p = an.type === 'blob' ? [an.x, an.y]
        : (an.vertical ? [an.pos + an.thick / 2, H / 2] : [W / 2, an.pos + an.thick / 2]);
      an._px = p[0]; an._py = p[1];
      pts.push(p);
    }
    for (var i = 0; i < n; i++) {
      var x = i % W, y = (i / W) | 0;
      var d1 = Infinity, d2 = Infinity, s1 = -1, s2 = -1;
      for (var s = 0; s < pts.length; s++) {
        var dx = x - pts[s][0], dy = y - pts[s][1];
        var d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; s2 = s1; d1 = d; s1 = s; }
        else if (d < d2) { d2 = d; s2 = s; }
      }
      cellSeed1[i] = s1; cellSeed2[i] = s2;
    }
  }
  function assignColors() {
    if (!C || W === 0) return;
    var frac = function (x) { return x - Math.floor(x); };
    C.fill(0);
    if (!seedAnchors.length) {
      if (params.seedColorRandom) {
        var rng = mulberry32(hashStr(params.seed + '\x00color'));
        for (var i = 0, n = W * H; i < n; i++) C[i] = rng();
      } else {
        var ca = function (x, y) { return frac(((x / W) * 0.5 + (y / H) * 0.5) * params.seedColorDiff + params.seedColorOffset); };
        for (var ii = 0, nn = W * H; ii < nn; ii++) C[ii] = ca(ii % W, (ii / W) | 0);
      }
      return;
    }
    var cs = params.seedColorRandom;
    var rng2 = cs ? mulberry32(hashStr(params.seed + '\x00color')) : null;
    var ca2 = function (x, y) { return frac(((x / W) + (y / H)) * 0.5 * params.seedColorDiff + params.seedColorOffset); };
    for (var ai = 0; ai < seedAnchors.length; ai++) {
      var a = seedAnchors[ai];
      a.c = cs ? rng2() : ca2(a._px, a._py);
    }
    var soft = params.seedColorDiffusion;
    var n2 = W * H;
    for (var i3 = 0; i3 < n2; i3++) {
      var s1 = cellSeed1[i3], s2 = cellSeed2[i3];
      if (s1 < 0) continue;
      var a1 = seedAnchors[s1];
      if (s2 < 0) { C[i3] = a1.c; continue; }
      var a2 = seedAnchors[s2];
      var x = i3 % W, y = (i3 / W) | 0;
      var dx1 = x - a1._px, dy1 = y - a1._py; var d1 = dx1 * dx1 + dy1 * dy1;
      var dx2 = x - a2._px, dy2 = y - a2._py; var d2 = dx2 * dx2 + dy2 * dy2;
      var w1 = d2 / (d1 + d2);
      if (soft < 1) { var wHard = d1 < d2 ? 1 : 0; w1 = wHard * (1 - soft) + w1 * soft; }
      C[i3] = a1.c * w1 + a2.c * (1 - w1);
    }
  }
  function tick(p) {
    var f = p.f, k = p.k, Du = p.Du, Dv = p.Dv;
    var _U = U, _V = V, _Un = U_next, _Vn = V_next;
    var lastX = W - 1;
    for (var y = 0; y < H; y++) {
      var yo = y * W;
      var ym = ((y - 1 + H) % H) * W;
      var yp = ((y + 1) % H) * W;
      {
        var i = yo;
        var r = i + 1;
        var uN = ym, dN = yp;
        var l = yo + lastX;
        var ul = ym + lastX, ur = ym + 1;
        var dl = yp + lastX, dr = yp + 1;
        var lapU = (_U[l] + _U[r] + _U[uN] + _U[dN]) * 0.20 + (_U[ul] + _U[ur] + _U[dl] + _U[dr]) * 0.05 - _U[i];
        var lapV = (_V[l] + _V[r] + _V[uN] + _V[dN]) * 0.20 + (_V[ul] + _V[ur] + _V[dl] + _V[dr]) * 0.05 - _V[i];
        var re = _U[i] * _V[i] * _V[i];
        var nu = _U[i] + (Du * lapU - re + f * (1 - _U[i]));
        var nv = _V[i] + (Dv * lapV + re - (f + k) * _V[i]);
        _Un[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
        _Vn[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
      }
      for (var x = 1; x < lastX; x++) {
        var i = yo + x;
        var l = i - 1, r = i + 1;
        var uN = ym + x, dN = yp + x;
        var ul = uN - 1, ur = uN + 1;
        var dl = dN - 1, dr = dN + 1;
        var lapU = (_U[l] + _U[r] + _U[uN] + _U[dN]) * 0.20 + (_U[ul] + _U[ur] + _U[dl] + _U[dr]) * 0.05 - _U[i];
        var lapV = (_V[l] + _V[r] + _V[uN] + _V[dN]) * 0.20 + (_V[ul] + _V[ur] + _V[dl] + _V[dr]) * 0.05 - _V[i];
        var re = _U[i] * _V[i] * _V[i];
        var nu = _U[i] + (Du * lapU - re + f * (1 - _U[i]));
        var nv = _V[i] + (Dv * lapV + re - (f + k) * _V[i]);
        _Un[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
        _Vn[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
      }
      {
        var i = yo + lastX;
        var l = i - 1;
        var uN = ym + lastX, dN = yp + lastX;
        var r = yo;
        var ul = ym + lastX - 1, ur = ym;
        var dl = yp + lastX - 1, dr = yp;
        var lapU = (_U[l] + _U[r] + _U[uN] + _U[dN]) * 0.20 + (_U[ul] + _U[ur] + _U[dl] + _U[dr]) * 0.05 - _U[i];
        var lapV = (_V[l] + _V[r] + _V[uN] + _V[dN]) * 0.20 + (_V[ul] + _V[ur] + _V[dl] + _V[dr]) * 0.05 - _V[i];
        var re = _U[i] * _V[i] * _V[i];
        var nu = _U[i] + (Du * lapU - re + f * (1 - _U[i]));
        var nv = _V[i] + (Dv * lapV + re - (f + k) * _V[i]);
        _Un[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
        _Vn[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
      }
    }
    U = _Un; U_next = _U; V = _Vn; V_next = _V;
  }
  function postFrame() {
    if (!V) return;
    self.postMessage({ type: 'frame', v: V.slice(), c: C.slice(), frameCount: frameCount, running: running, done: stableCount >= stableFrames });
  }
  function loop() {
    if (!running) return;
    var steps = params.stepsPerFrame | 0;
    for (var s = 0; s < steps; s++) tick(params);
    frameCount++;
    if (!stabilityPrev || stabilityPrev.length !== W * H) stabilityPrev = new Float32Array(W * H);
    var changed = 0;
    for (var i = 0; i < W * H; i++) {
      var d = V[i] - stabilityPrev[i];
      if (d < 0) d = -d;
      if (d >= VIS_BIN) changed++;
      stabilityPrev[i] = V[i];
    }
    var n = W * H;
    if (changed <= n * STABLE_VIS_FRAC) { stableCount++; if (stableCount >= stableFrames) { running = false; } }
    else { stableCount = Math.max(0, stableCount - STABLE_DECAY); }
    postFrame();
    if (running) setTimeout(loop, 0);
  }
  self.onmessage = function (e) {
    var m = e.data;
    if (m.cmd === 'init') { params = m.params; initGrid(m.size, m.size, m.seed, m.mode); running = false; stableCount = 0; stabilityPrev = null; postFrame(); }
    else if (m.cmd === 'setParams') { for (var kk in m.params) params[kk] = m.params[kk]; }
    else if (m.cmd === 'setRunning') { running = m.running; if (running) loop(); else postFrame(); }
    else if (m.cmd === 'step') { tick(params); frameCount++; postFrame(); }
    else if (m.cmd === 'recolor') { for (var k2 in m.params) params[k2] = m.params[k2]; assignColors(); postFrame(); }
  };
})();
