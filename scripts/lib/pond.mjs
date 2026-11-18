// A pond: a lattice of dots seen as a water surface. Each drop keeps sending out rings; the rings from all
// drops add up and cancel like real waves, and a dot swells where the water is high.
//
// The sum of many rings of one frequency is, at every point, one wave with its own height and its own timing.
// So each dot only needs two numbers, and dots that share them can share one animated <path>.
// Dots are round-capped strokes of (almost) zero length; their size is the stroke width.

export const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 2246822519); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

const DEFAULTS = {
  pitch: 4,        // distance between dots; odd rows are shifted half a step, like a print halftone
  lambda: 30,      // wavelength in px
  period: 6.4,     // seconds for a ring to travel one wavelength
  fps: 25,         // sizes are updated this many times a second, all dots at the same instants, so the browser redraws only then
  gamma: 0.62,     // how fast the waves die out away from the drops (higher = calmer far side)
  reach: 14,       // px over which a ring loses its first strength
  crest: 1.6,      // >1 makes crests narrower than troughs
  fill: 0.84,      // biggest dot as a share of the pitch
  rest: 1.2,       // size of the resting dot every lattice point always shows (smaller ones turn into a plaid when the image is scaled)
  minMove: 0.7,    // a dot whose crest stays under this size is left at rest
  buckets: 20,     // how finely a dot's timing is resolved
  levels: 7,       // how finely a dot's wave height is resolved  (browser cost follows buckets x levels)
  calm: null,      // optional (x, y) => 0..1, multiplies the wave height (0 = still water)
  cls: 'l',        // class prefix, unique per svg
};

// box: { x, y, w, h } in px.  drops: [{ x, y, s (0..1 strength), ph (radians, when in the cycle it falls) }]
// returns { css, rest(tone) -> svg, surface -> svg, stats }
export function pond(box, drops, options = {}) {
  const O = { ...DEFAULTS, ...options };
  const r2 = (n) => Math.round(n * 100) / 100;
  const K = 2 * Math.PI / O.lambda;
  const rows = Math.floor(box.h / O.pitch), cols = Math.floor(box.w / O.pitch);
  const offY = box.y + (box.h - rows * O.pitch) / 2 + O.pitch / 2, offX = box.x + (box.w - cols * O.pitch) / 2 + O.pitch / 2;
  const dots = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i <= cols; i++) {
    const x = offX + i * O.pitch - (j & 1 ? O.pitch / 2 : 0), y = offY + j * O.pitch;
    if (x < box.x + 1.5 || x > box.x + box.w - 1.5) continue;
    let re = 0, im = 0;
    for (const s of drops) { const d = Math.hypot(x - s.x, y - s.y), a = s.s / Math.sqrt(1 + d / O.reach), th = s.ph - K * d; re += a * Math.cos(th); im += a * Math.sin(th); }
    dots.push({ x, y, row: j, mag: Math.hypot(re, im), arg: Math.atan2(im, re) });
  }
  const ref = dots.map((d) => d.mag).sort((a, b) => a - b)[Math.floor(dots.length * 0.985)] || 1;
  const RMAX = O.pitch * O.fill;
  const wave = (u) => Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * u), O.crest);   // 1 at the crest, 0 in the trough
  const sizeOf = (lv) => r2(lv * RMAX / O.levels);

  const group = new Map();
  let moving = 0;
  for (const d of dots) {
    const amp = Math.min(1, Math.pow(d.mag / ref, O.gamma)) * (O.calm ? O.calm(d.x, d.y) : 1);
    const lv = Math.round(amp * O.levels);
    if (sizeOf(lv) <= O.minMove) continue;                                           // too small to see: leave it at rest
    const until = (((-d.arg / (2 * Math.PI)) % 1) + 1) % 1;                          // share of a cycle until this dot's crest
    const key = lv * 1000 + Math.floor(until * O.buckets) % O.buckets;
    if (!group.has(key)) group.set(key, []);
    group.get(key).push(d); moving++;
  }
  let surface = '';
  for (const [key, list] of [...group].sort((p, q) => p[0] - q[0])) {
    const lv = Math.floor(key / 1000), u = (key % 1000 + 0.5) / O.buckets;
    surface += `<path class="${O.cls}${lv}" stroke-width="${r2(sizeOf(lv) * wave(u))}" style="animation-delay:${+(-(1 - u) * O.period).toFixed(4)}s" d="${list.map((p) => `M${r2(p.x)} ${r2(p.y)}h.01`).join('')}"/>`;
  }
  // the resting lattice: one dashed line per row (a .01 dash with round caps is a dot)
  let lattice = '';
  for (let j = 0; j < rows; j++) { const xs = dots.filter((d) => d.row === j).map((d) => d.x); if (xs.length) lattice += `M${r2(Math.min(...xs))} ${r2(offY + j * O.pitch)}H${r2(Math.max(...xs) + 0.01)}`; }
  const rest = (tone) => `<path stroke="${tone}" stroke-width="${O.rest}" stroke-dasharray=".01 ${O.pitch - 0.01}" d="${lattice}"/>`;
  // Sizes change in small steps, STOPS per cycle, and every path steps at the same instants (delays are whole steps).
  const STOPS = Math.round(O.fps * O.period / O.buckets) * O.buckets, used = [...new Set([...group.keys()].map((k) => Math.floor(k / 1000)))];
  const css = used.map((lv) => `@keyframes ${O.cls}${lv}{${Array.from({ length: STOPS }, (_, s) => `${+(100 * s / STOPS).toFixed(4)}%{stroke-width:${r2(sizeOf(lv) * wave((s + 0.5) / STOPS))}}`).join('')}}.${O.cls}${lv}{animation:${O.cls}${lv} ${O.period}s step-end infinite}`).join('') +
    `@media (prefers-reduced-motion:reduce){path{animation:none!important}}`;
  return { css, rest, surface, stats: { dots: dots.length, moving, paths: group.size } };
}
