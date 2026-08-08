// Generates the per-page social cards in res/. Each content page gets its own
// 1200x630 og:image instead of all of them sharing one generic cover — the card
// is what decides whether a link posted to a forum or Discord gets clicked.
//
//   node tests/genog.js            # all of them
//   node tests/genog.js minor      # just the ones whose slug matches
//
// The artwork is drawn from the same degree data the pages themselves use, so a
// card can't drift out of step with the article it advertises.
const path = require('path');
const { chromium } = require(path.join(__dirname, 'node_modules', 'playwright'));

const OUT = path.resolve(__dirname, '..', 'res');
const W = 1200, H = 630;

const C = {
  cyan:'#22d3ee', cyanDim:'#0891b2', amber:'#fbbf24', pink:'#f472b6',
  text:'#e9eef4', muted:'#a4b2c2', dim:'#6b7a8a',
  panel:'#12161c', chip:'#232a34', line:'rgba(255,255,255,.09)', stroke:'#4a5568',
};

// ---------------------------------------------------------------------------
// art primitives. Each returns an SVG sized to the 380x440 art panel.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Anything drawn on a neck is checked against real pitches before it ships. A
// social card is the most-seen and least-reviewed artwork on the site, which is
// exactly why it should not be the one place a wrong note can hide.
// ---------------------------------------------------------------------------
const OPEN = [40, 45, 50, 55, 59, 64];                    // E A D G B e
const SHARP = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const MAJOR = { 0:'1', 2:'2', 4:'3', 5:'4', 7:'5', 9:'6', 11:'7' };
const REL   = { '1':'♭3', '2':'4', '3':'5', '4':'♭6', '5':'♭7', '6':'1', '7':'2' };

function checkBoard(slug, notes, { startFret, keyPc }) {
  for (const n of notes) {
    const midi = OPEN[n.s] + startFret + n.r;
    if (keyPc === undefined) {
      const want = SHARP[midi % 12];
      if (n.label !== want) throw new Error(`${slug}: ${SHARP[OPEN[n.s] % 12]} string fret ${startFret + n.r} is ${want}, labelled ${n.label}`);
    } else {
      const deg = MAJOR[(midi - keyPc + 120) % 12];
      if (!deg) throw new Error(`${slug}: string ${n.s} fret ${startFret + n.r} is not in the key at all`);
      if (n.label !== deg) throw new Error(`${slug}: string ${n.s} fret ${startFret + n.r} is degree ${deg}, labelled ${n.label}`);
      if (n.sub && n.sub !== REL[deg]) throw new Error(`${slug}: degree ${deg} has relative-minor degree ${REL[deg]}, labelled ${n.sub}`);
    }
  }
  return notes.length;
}

// A stack of degree tokens, read top to bottom.
function degreeColumn(items, { w = 380, h = 440 } = {}) {
  const gap = (h - 40) / items.length, r = Math.min(29, gap / 2 - 5);
  const o = [`<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`];
  items.forEach((it, i) => {
    const cy = 20 + gap * i + gap / 2, cx = w / 2;
    const ghost = it.state === 'ghost';
    const fill = it.state === 'root' ? C.cyan : it.state === 'accent' ? C.amber : ghost ? 'none' : C.chip;
    const stroke = it.state === 'root' ? '#67e8f9' : it.state === 'accent' ? '#fde047' : ghost ? '#3a4553' : C.stroke;
    const tc = it.state === 'root' ? '#04212a' : it.state === 'accent' ? '#3a2e00' : ghost ? '#4a5568' : C.text;
    if (i) o.push(`<line x1="${cx}" y1="${cy - gap + r}" x2="${cx}" y2="${cy - r}" stroke="#2c3542" stroke-width="2"/>`);
    o.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${ghost ? 2 : 1.8}"${ghost ? ' stroke-dasharray="6 5"' : ''}/>`);
    o.push(`<text x="${cx}" y="${cy + 11}" text-anchor="middle" font-size="30" font-weight="600" font-family="IBM Plex Mono, monospace" fill="${tc}">${it.label}</text>`);
    if (it.note) o.push(`<text x="${cx + r + 18}" y="${cy + 7}" font-size="19" font-family="IBM Plex Mono, monospace" fill="${C.dim}">${it.note}</text>`);
  });
  o.push('</svg>');
  return o.join('');
}

// A slice of neck: 6 vertical strings, `rows` frets, notes placed by [string,row].
function miniBoard(notes, { rows = 5, w = 380, h = 440, sub } = {}) {
  const x0 = 46, dx = 58, top = 40, dy = (h - top - 40) / rows;
  const xs = i => x0 + i * dx, ys = r => top + r * dy + dy / 2;
  const o = [`<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`];
  for (let i = 0; i < 6; i++)
    o.push(`<line x1="${xs(i)}" y1="${top}" x2="${xs(i)}" y2="${top + rows * dy}" stroke="#c3cfdb" stroke-width="${(2.4 - i * .26).toFixed(2)}" opacity=".38"/>`);
  for (let r = 0; r <= rows; r++)
    o.push(`<line x1="${xs(0) - 20}" y1="${top + r * dy}" x2="${xs(5) + 20}" y2="${top + r * dy}" stroke="#252d38" stroke-width="${r === 0 ? 3 : 1.5}"/>`);
  for (const n of notes) {
    const fill = n.state === 'root' ? C.cyan : n.state === 'accent' ? C.amber : n.state === 'alt' ? C.pink : C.chip;
    const stroke = n.state === 'root' ? '#67e8f9' : n.state === 'accent' ? '#fde047' : n.state === 'alt' ? '#f9a8d4' : C.stroke;
    const tc = n.state === 'root' ? '#04212a' : n.state === 'accent' ? '#3a2e00' : n.state === 'alt' ? '#3a0a24' : C.text;
    o.push(`<circle cx="${xs(n.s)}" cy="${ys(n.r)}" r="23" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>`);
    o.push(`<text x="${xs(n.s) + (n.sub ? -4 : 0)}" y="${ys(n.r) + 8}" text-anchor="middle" font-size="22" font-weight="600" font-family="IBM Plex Mono, monospace" fill="${tc}">${n.label}</text>`);
    if (n.sub) o.push(`<text x="${xs(n.s) + 12}" y="${ys(n.r) + 19}" text-anchor="middle" font-size="13" font-family="IBM Plex Mono, monospace" fill="${n.state ? tc : C.muted}" opacity=".85">${n.sub}</text>`);
  }
  if (sub) o.push(`<text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-size="16" font-family="IBM Plex Mono, monospace" fill="${C.dim}">${sub}</text>`);
  o.push('</svg>');
  return o.join('');
}

// The A-shape barre chord with one finger moving — the cover for the chord page.
function chordArt({ w = 380, h = 440 } = {}) {
  const x0 = 62, dx = 52, top = 62, dy = 82, rows = 4, R = 23;
  const xs = i => x0 + i * dx, ys = r => top + r * dy + dy / 2;
  const names = ['E', 'A', 'D', 'G', 'B', 'e'];
  const shape = [null, { r:0, d:'1' }, { r:2, d:'5' }, { r:2, d:'1' }, { r:3, d:'4', moved:1, from:2 }, { r:0, d:'5' }];
  const o = [`<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`];
  for (let i = 0; i < 6; i++) {
    const on = !!shape[i];
    o.push(`<line x1="${xs(i)}" y1="${top}" x2="${xs(i)}" y2="${top + rows * dy}" stroke="#c3cfdb" stroke-width="${(2.4 - i * .26).toFixed(2)}" opacity="${on ? .38 : .12}"/>`);
    o.push(`<text x="${xs(i)}" y="${top - 22}" text-anchor="middle" font-size="17" font-family="IBM Plex Mono, monospace" fill="${on ? C.dim : '#3f4a57'}">${names[i]}</text>`);
    if (!on) o.push(`<text x="${xs(i)}" y="${top - 2}" text-anchor="middle" font-size="18" font-family="IBM Plex Mono, monospace" fill="${C.dim}">×</text>`);
  }
  for (let r = 0; r <= rows; r++)
    o.push(`<line x1="${xs(0) - 20}" y1="${top + r * dy}" x2="${xs(5) + 20}" y2="${top + r * dy}" stroke="#252d38" stroke-width="1.6"/>`);
  o.push(`<rect x="${xs(1) - R - 6}" y="${ys(0) - R - 6}" width="${xs(5) - xs(1) + (R + 6) * 2}" height="${(R + 6) * 2}" rx="${R + 6}" fill="#2b3442" stroke="#48546a" stroke-width="1.6"/>`);
  const m = shape[4];
  o.push(`<circle cx="${xs(4)}" cy="${ys(m.from)}" r="${R}" fill="none" stroke="#4a5568" stroke-width="2" stroke-dasharray="6 5"/>`);
  o.push(`<line x1="${xs(4)}" y1="${ys(m.from) + R + 6}" x2="${xs(4)}" y2="${ys(m.r) - R - 10}" stroke="${C.amber}" stroke-width="3"/>`);
  o.push(`<polygon points="${xs(4) - 6},${ys(m.r) - R - 10} ${xs(4) + 6},${ys(m.r) - R - 10} ${xs(4)},${ys(m.r) - R - 1}" fill="${C.amber}"/>`);
  shape.forEach((s, i) => {
    if (!s) return;
    const fill = s.moved ? C.amber : s.d === '1' ? C.cyan : C.chip;
    const stroke = s.moved ? '#fde047' : s.d === '1' ? '#67e8f9' : C.stroke;
    const tc = s.moved ? '#3a2e00' : s.d === '1' ? '#04212a' : C.text;
    o.push(`<circle cx="${xs(i)}" cy="${ys(s.r)}" r="${R}" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>`);
    o.push(`<text x="${xs(i)}" y="${ys(s.r) + 8}" text-anchor="middle" font-size="22" font-weight="600" font-family="IBM Plex Mono, monospace" fill="${tc}">${s.d}</text>`);
  });
  o.push(`<text x="${w / 2}" y="${h - 10}" text-anchor="middle" font-size="16" font-family="IBM Plex Mono, monospace" fill="${C.dim}">major → sus4, one fret</text>`);
  o.push('</svg>');
  return o.join('');
}

// ---------------------------------------------------------------------------
// the cards
// ---------------------------------------------------------------------------
const D = (label, state, note) => ({ label, state, note });

const CARDS = [
  {
    slug: 'chords-from-degrees', eyebrow: 'BUILDING CHORDS',
    h1: 'One barre shape,<br>twelve chords',
    sub: 'Know which finger plays which <b>scale degree</b> and minor, sus4 and 7ths are one move away.',
    chips: ['A shape', 'E shape', 'no new shapes'],
    art: chordArt(),
  },
  {
    slug: 'major-minor-degree-map', eyebrow: 'DEGREE MAP',
    h1: 'One shape,<br>two keys',
    sub: 'Every major scale shape is also its <b>relative minor</b> — one map carrying both sets of degrees.',
    chips: ['7 3 6 2 5 1 4', 'mind the gap'],
    // C major / A minor, frets 7-10. Cyan is the major tonic C, pink the
    // minor tonic A; the small number is the relative-minor degree.
    board: { startFret:7, keyPc:0, rows:4, sub:'major degree · minor degree', notes:[
      { s:0, r:1, label:'1', sub:'♭3', state:'root' }, { s:0, r:3, label:'2', sub:'4' },
      { s:1, r:0, label:'3', sub:'5' },                { s:1, r:3, label:'5', sub:'♭7' },
      { s:2, r:0, label:'6', sub:'1', state:'alt' },   { s:2, r:3, label:'1', sub:'♭3', state:'root' },
      { s:3, r:0, label:'2', sub:'4' },
      { s:4, r:1, label:'5', sub:'♭7' },               { s:4, r:3, label:'6', sub:'1', state:'alt' },
      { s:5, r:1, label:'1', sub:'♭3', state:'root' },
    ] },
  },
  {
    slug: 'scale-degrees', eyebrow: 'SCALE DEGREES',
    h1: 'The numbers that<br>make it make sense',
    sub: 'Name a note by its <b>job in the scale</b>, not its letter — and one pattern covers all twelve keys.',
    chips: ['1 2 3 4 5 6 7', 'any key'],
    art: degreeColumn([
      D('1','root','home'), D('2',null,''), D('3','accent','major'),
      D('4',null,''), D('5','accent','the fifth'), D('6',null,''), D('7',null,'pulls home'),
    ]),
  },
  {
    slug: 'minor-scale', eyebrow: 'THE MINOR SCALE',
    h1: 'Why minor<br>sounds sad',
    sub: "It's the major scale with <b>three lowered degrees</b>. That's the entire difference.",
    chips: ['♭3', '♭6', '♭7'],
    art: degreeColumn([
      D('1',null,''), D('2',null,''), D('♭3','accent','the sad one'),
      D('4',null,''), D('5',null,''), D('♭6','accent',''), D('♭7','accent',''),
    ]),
  },
  {
    slug: 'pentatonic-scale', eyebrow: 'THE PENTATONIC SCALE',
    h1: 'The five notes<br>solos are built on',
    sub: 'The major pentatonic is just the major scale <b>minus the 4 and the 7</b>.',
    chips: ['1 2 3 5 6', 'five notes'],
    art: degreeColumn([
      D('1','root',''), D('2',null,''), D('3',null,''), D('4','ghost','removed'),
      D('5',null,''), D('6',null,''), D('7','ghost','removed'),
    ]),
  },
  {
    slug: 'memorize-the-fretboard', eyebrow: 'FRETBOARD METHOD',
    h1: 'Memorize the<br>whole fretboard',
    sub: 'A practical method that beats brute force, plus a full chart of every note on every string.',
    chips: ['octave shapes', 'notes chart'],
    // Frets 1-5, real note names. The three cyan dots are all G — the point of
    // the page, so they had better actually be the same note.
    board: { startFret:1, rows:5, sub:'the same note, three places', notes:[
      { s:0, r:0, label:'F' },  { s:0, r:2, label:'G', state:'root' },
      { s:1, r:0, label:'A♯' }, { s:1, r:2, label:'C' },
      { s:2, r:1, label:'E' },  { s:2, r:4, label:'G', state:'root' },
      { s:3, r:0, label:'G♯' }, { s:4, r:1, label:'C♯' },
      { s:5, r:2, label:'G', state:'root' },
    ] },
  },
  {
    slug: 'help', eyebrow: 'THE COMPLETE GUIDE',
    h1: 'How to actually<br>learn the neck',
    sub: 'Three display modes, the <b>two patterns</b> worth memorising, and how to practise them.',
    chips: ['Numbers', 'Dots', 'Hidden'],
    art: degreeColumn([
      D('7',null,''), D('3',null,''), D('6',null,''), D('2',null,''),
      D('5',null,''), D('1','root','home'), D('4',null,''),
    ]),
  },
];

// ---------------------------------------------------------------------------
const page = c => `<!doctype html><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:${W}px;height:${H}px;overflow:hidden;
    background:
      radial-gradient(ellipse 980px 560px at 14% -6%, #17212c 0%, transparent 62%),
      radial-gradient(ellipse 620px 420px at 96% 108%, #101a22 0%, transparent 60%),
      linear-gradient(160deg,#0b0f14 0%,#05070a 100%);
    color:${C.text}; font-family:'Space Grotesk',system-ui,sans-serif;
    display:flex; align-items:center; gap:40px; padding:0 76px;}
  .left{flex:1 1 auto; min-width:0}
  .eyebrow{display:flex;align-items:center;gap:15px;margin-bottom:26px}
  .mark{width:52px;height:52px;flex:0 0 auto;border-radius:14px;
    background:linear-gradient(145deg,${C.cyan},${C.cyanDim});color:#04212a;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 0 34px rgba(34,211,238,.34)}
  .mark svg{width:34px;height:34px;display:block}
  .eyebrow span{font-family:'IBM Plex Mono',monospace;font-size:19px;font-weight:500;
    letter-spacing:.19em;color:${C.cyan}}
  h1{font-size:63px;line-height:1.07;letter-spacing:-.028em;font-weight:700;margin-bottom:22px}
  .sub{font-size:25px;line-height:1.45;color:${C.muted};max-width:610px}
  .sub b{color:${C.amber};font-weight:600}
  .chips{display:flex;gap:11px;margin-top:32px;flex-wrap:wrap}
  .chips i{font-style:normal;font-family:'IBM Plex Mono',monospace;font-size:16px;
    color:${C.muted};border:1px solid ${C.line};background:rgba(255,255,255,.03);
    padding:9px 17px;border-radius:999px}
  .chips i:first-child{color:${C.cyan};border-color:rgba(34,211,238,.45)}
  .art{flex:0 0 380px;height:440px;border-radius:20px;background:${C.panel};
    border:1px solid ${C.line};display:flex;align-items:center;justify-content:center;
    box-shadow:0 24px 60px rgba(0,0,0,.45)}
  .host{position:absolute;left:76px;bottom:34px;font-family:'IBM Plex Mono',monospace;
    font-size:17px;color:${C.dim};letter-spacing:.04em}
</style>
<div class="left">
  <div class="eyebrow">
    <span class="mark"><svg viewBox="0 0 32 32"><g fill="currentColor"><ellipse cx="11.6" cy="22.6" rx="5.6" ry="4.3" transform="rotate(-22 11.6 22.6)"/><rect x="15.3" y="6.6" width="2.1" height="16.4" rx="1"/><path d="M17.4 6.2c4.6 1.8 8.4 4.3 8.4 8.7 0 2.5-1.2 4.4-2.4 5.3 1.1-3.7-1.4-6.4-6-8.7z"/></g></svg></span>
    <span>${c.eyebrow}</span>
  </div>
  <h1>${c.h1}</h1>
  <p class="sub">${c.sub}</p>
  <div class="chips">${c.chips.map(t => `<i>${t}</i>`).join('')}</div>
</div>
<div class="art">${c.art}</div>
<div class="host">fretboardwalk.com</div>`;

(async () => {
  const filter = process.argv[2];
  const cards = filter ? CARDS.filter(c => c.slug.includes(filter)) : CARDS;
  if (!cards.length) { console.error('no cards match ' + filter); process.exit(1); }

  // Verify before drawing: a card with a `board` spec has every label checked
  // against the real pitch at that string and fret.
  let verified = 0;
  for (const c of cards) {
    if (!c.board) continue;
    const { notes, ...opts } = c.board;
    verified += checkBoard(c.slug, notes, opts);
    c.art = miniBoard(notes, opts);
  }
  if (verified) console.log(`${verified} note labels verified against real pitches`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const c of cards) {
    const p = await ctx.newPage();
    await p.setContent(page(c), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    // A card that overflows its own frame is silently cropped by every social
    // scraper, so refuse to write one.
    const over = await p.evaluate(() => ({
      x: document.documentElement.scrollWidth - 1200,
      y: document.documentElement.scrollHeight - 630,
    }));
    if (over.x > 0 || over.y > 0) throw new Error(`${c.slug}: content overflows the card by ${over.x}x${over.y}px`);
    const file = path.join(OUT, `og-${c.slug}.png`);
    await p.screenshot({ path: file });
    console.log(`res/og-${c.slug}.png`);
    await p.close();
  }
  await browser.close();
})();
