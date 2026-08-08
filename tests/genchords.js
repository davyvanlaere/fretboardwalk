// Generates the chord-box SVGs for chords-from-degrees.html and splices them
// into the page in place of <!--SVG:name--> markers. Every shape is also
// verified against real pitches before it is drawn, so a wrong degree label
// fails the build instead of shipping.
const fs = require('fs');

const OPEN = [40, 45, 50, 55, 59, 64];            // E A D G B e
const NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
const SEMI = { '1':0, 'b2':1, '2':2, 'b3':3, '3':4, '4':5, 'b5':6, '5':7, 'b6':8, '6':9, 'b7':10, '7':11 };
const PRETTY = d => d.replace('b', '♭');

// ---- geometry -------------------------------------------------------------
const X0 = 44, DX = 42, TOP = 52, DY = 48, ROWS = 4, R = 15;
const xs = i => X0 + i * DX;
const ys = rel => TOP + rel * DY + DY / 2;
const W = xs(5) + 44, H = TOP + ROWS * DY + 26;

// ---- shapes ---------------------------------------------------------------
// rel = frets above the barre. null = string not played.
const A_SHAPE = [null, { rel:0, deg:'1' }, { rel:2, deg:'5' }, { rel:2, deg:'1' }, { rel:2, deg:'3' }, { rel:0, deg:'5' }];
const E_SHAPE = [{ rel:0, deg:'1' }, { rel:2, deg:'5' }, { rel:2, deg:'1' }, { rel:1, deg:'3' }, { rel:0, deg:'5' }, { rel:0, deg:'1' }];

// A variant is the base shape with one or two strings moved elsewhere.
const variants = {
  'ashape-major': { base:'A', label:'major',  chord:'1 3 5' },
  'ashape-minor': { base:'A', label:'minor',  chord:'1 ♭3 5',      moves:[[4,1,'b3']] },
  'ashape-sus2':  { base:'A', label:'sus2',   chord:'1 2 5',            moves:[[4,0,'2']] },
  'ashape-sus4':  { base:'A', label:'sus4',   chord:'1 4 5',            moves:[[4,3,'4']] },
  'ashape-7':     { base:'A', label:'7',      chord:'1 3 5 ♭7',    moves:[[3,0,'b7']] },
  'ashape-maj7':  { base:'A', label:'maj7',   chord:'1 3 5 7',          moves:[[3,1,'7']] },
  'ashape-m7':    { base:'A', label:'m7',     chord:'1 ♭3 5 ♭7', moves:[[3,0,'b7'],[4,1,'b3']] },
  'ashape-6':     { base:'A', label:'6',      chord:'1 3 5 6',          moves:[[5,2,'6']] },

  'eshape-major': { base:'E', label:'major',  chord:'1 3 5' },
  'eshape-minor': { base:'E', label:'minor',  chord:'1 ♭3 5',      moves:[[3,0,'b3']] },
  'eshape-sus4':  { base:'E', label:'sus4',   chord:'1 4 5',            moves:[[3,2,'4']] },
  'eshape-7':     { base:'E', label:'7',      chord:'1 3 5 ♭7',    moves:[[2,0,'b7']] },
  'eshape-maj7':  { base:'E', label:'maj7',   chord:'1 3 5 7',          moves:[[2,1,'7']] },
  'eshape-m7':    { base:'E', label:'m7',     chord:'1 ♭3 5 ♭7', moves:[[2,0,'b7'],[3,0,'b3']] },
};

function build(v) {
  const shape = (v.base === 'A' ? A_SHAPE : E_SHAPE).map(s => s && { ...s });
  const moves = [];
  for (const [str, rel, deg] of v.moves || []) {
    moves.push({ str, from: shape[str].rel, to: rel });
    shape[str] = { rel, deg };
  }
  return { shape, moves };
}

// ---- verification ---------------------------------------------------------
// The barre sits at fret 5 throughout the page. Check that every labelled
// degree really is that many semitones above the chord's root.
let checked = 0;
function verify(name, v, shape) {
  const BARRE = 5;
  const rootString = v.base === 'A' ? 1 : 0;
  const rootPc = (OPEN[rootString] + BARRE) % 12;
  shape.forEach((s, i) => {
    if (!s) return;
    const pc = (OPEN[i] + BARRE + s.rel) % 12;
    const want = (rootPc + SEMI[s.deg]) % 12;
    if (pc !== want) throw new Error(`${name}: ${NAMES[i]} string fret ${BARRE + s.rel} is labelled ${s.deg}, but that is wrong`);
    checked++;
  });
  // and the chord's degree set must match its advertised formula
  const got = [...new Set(shape.filter(Boolean).map(s => s.deg))].sort((a, b) => SEMI[a] - SEMI[b]).map(PRETTY).join(' ');
  if (got !== v.chord) throw new Error(`${name}: shape spells "${got}" but is billed as "${v.chord}"`);
}

// ---- drawing --------------------------------------------------------------
// The aria-label is derived purely from the spec, which also makes it the
// handle for re-generating a page whose markers have already been consumed.
function ariaFor(v, shape) {
  const per = shape.map((s, i) => s ? `${NAMES[i]} string, degree ${s.deg.replace('b', 'flat ')}` : `${NAMES[i]} string muted`).join('; ');
  return `${v.base} shape ${v.label} chord at the 5th fret: ${per}.`;
}

function svg(name, v) {
  const { shape, moves } = build(v);
  verify(name, v, shape);

  const played = shape.map((s, i) => s ? i : -1).filter(i => i >= 0);
  const lo = Math.min(...played), hi = Math.max(...played);
  const o = [];
  const aria = ariaFor(v, shape);
  o.push(`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria}">`);

  // strings, thick to thin. A muted string is drawn faint so the shape reads
  // as five notes rather than six with a small mark above one of them.
  for (let i = 0; i < 6; i++) {
    const sw = (2.6 - i * 0.28).toFixed(2);
    const on = !!shape[i];
    o.push(`<line x1="${xs(i)}" y1="${TOP}" x2="${xs(i)}" y2="${TOP + ROWS * DY}" stroke="#c3cfdb" stroke-width="${sw}" opacity="${on ? 0.4 : 0.13}"/>`);
    o.push(`<text x="${xs(i)}" y="24" text-anchor="middle" font-size="11" fill="${on ? '#5a6979' : '#3f4a57'}">${NAMES[i]}</text>`);
    if (!on) o.push(`<text x="${xs(i)}" y="44" text-anchor="middle" font-size="13" fill="#5a6979">×</text>`);
  }
  // frets
  for (let r = 0; r <= ROWS; r++) {
    o.push(`<line x1="${xs(0) - 16}" y1="${TOP + r * DY}" x2="${xs(5) + 16}" y2="${TOP + r * DY}" stroke="#252d38" stroke-width="1.4"/>`);
  }
  o.push(`<text x="18" y="${ys(0) + 4}" text-anchor="middle" font-size="10" fill="#5a6979">5fr</text>`);

  // The barre. It has to read as one finger laid flat across the strings — at
  // the size these are shown, a faint outline doesn't, so it's a solid bar
  // behind the notes.
  o.push(`<rect x="${xs(lo) - R - 4}" y="${ys(0) - R - 4}" width="${xs(hi) - xs(lo) + (R + 4) * 2}" height="${(R + 4) * 2}" rx="${R + 4}" fill="#2b3442" stroke="#48546a" stroke-width="1.2"/>`);

  // ghost of where a moved finger came from, plus the arrow
  for (const m of moves) {
    const x = xs(m.str);
    o.push(`<circle cx="${x}" cy="${ys(m.from)}" r="${R}" fill="none" stroke="#4a5568" stroke-width="1.4" stroke-dasharray="4 3"/>`);
    const dir = m.to > m.from ? 1 : -1;
    const y1 = ys(m.from) + dir * (R + 5), y2 = ys(m.to) - dir * (R + 7);
    if (Math.abs(y2 - y1) > 4) {
      o.push(`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#fbbf24" stroke-width="1.8"/>`);
      o.push(`<polygon points="${x - 4},${y2} ${x + 4},${y2} ${x},${y2 + dir * 6}" fill="#fbbf24"/>`);
    }
  }

  // the notes
  shape.forEach((s, i) => {
    if (!s) return;
    const moved = moves.some(m => m.str === i);
    const fill = moved ? '#fbbf24' : (s.deg === '1' ? '#22d3ee' : '#232a34');
    const stroke = moved ? '#fde047' : (s.deg === '1' ? '#67e8f9' : '#4a5568');
    const tc = moved ? '#3a2e00' : (s.deg === '1' ? '#04212a' : '#e9eef4');
    o.push(`<g><circle cx="${xs(i)}" cy="${ys(s.rel)}" r="${R}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`
         + `<text x="${xs(i)}" y="${ys(s.rel) + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="${tc}">${PRETTY(s.deg)}</text></g>`);
  });

  o.push('</svg>');
  return o.join('\n      ');
}

// ---- splice ---------------------------------------------------------------
const file = process.argv[2];
let html = fs.readFileSync(file, 'utf8');
let n = 0;
for (const [name, v] of Object.entries(variants)) {
  const marker = `<!--SVG:${name}-->`;
  const fresh = svg(name, v);
  if (html.includes(marker)) {
    html = html.split(marker).join(fresh);
    n++;
    continue;
  }
  // Already generated once: find it by its aria-label and swap it wholesale,
  // so the diagrams stay regenerable after the markers are gone.
  const aria = ariaFor(v, build(v).shape).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<svg viewBox="[^"]*" role="img" aria-label="${aria}">[\\s\\S]*?</svg>`);
  if (!re.test(html)) { console.log(`  (not found: ${name})`); continue; }
  html = html.replace(re, fresh);
  n++;
}
const left = html.match(/<!--SVG:[a-z0-9-]+-->/g);
if (left) throw new Error('unfilled markers: ' + left.join(', '));
fs.writeFileSync(file, html);
console.log(`${n} diagrams written, ${checked} degree labels verified against real pitches`);
