// Generates the standalone reference charts in res/.
//
//   node tests/gencharts.js
//
// These exist for image search. Inline SVG is invisible to Google Images —
// only a fetchable <img> can be indexed — so each of these is a real raster
// file with a descriptive name, embedded on its page with alt text and
// ImageObject markup.
//
// The artwork is NOT redrawn here. Each chart lifts the already-published SVG
// straight out of the page it belongs to, so the chart and the article can
// never drift apart, and the pitch verification done by genchords.js covers
// both. If an SVG can't be found, the build fails rather than shipping a chart
// built from a stale copy.
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, 'node_modules', 'playwright'));

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'res');
const SCALE = 1.5;                       // rendered px per layout px

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Pull one <svg> out of a page by the start of its aria-label.
function lift(file, ariaPrefix) {
  const html = read(file);
  const re = new RegExp(`<svg viewBox="[^"]*" role="img" aria-label="${ariaPrefix.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')}[^"]*">[\\s\\S]*?</svg>`);
  const m = html.match(re);
  if (!m) throw new Error(`${file}: no SVG whose aria-label starts "${ariaPrefix}"`);
  return m[0];
}
const chord = (shape, label) => lift('chords-from-degrees.html', `${shape} shape ${label} chord at the 5th fret`);

// ---------------------------------------------------------------------------
const SHELL = (title, sub, body, w) => `<!doctype html><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:${w}px;
    background:radial-gradient(ellipse 1000px 520px at 50% -10%,#151d26 0%,transparent 62%),
      linear-gradient(180deg,#0b0f14 0%,#06080b 100%);
    color:#e9eef4;font-family:'Space Grotesk',system-ui,sans-serif;padding:38px 40px 26px}
  header{display:flex;align-items:center;gap:14px;margin-bottom:6px}
  .mark{width:40px;height:40px;flex:0 0 auto;border-radius:11px;
    background:linear-gradient(145deg,#22d3ee,#0891b2);color:#04212a;
    display:flex;align-items:center;justify-content:center}
  .mark svg{width:27px;height:27px;display:block}
  h1{font-size:31px;letter-spacing:-.02em;font-weight:700;line-height:1.15}
  .sub{font-size:17px;color:#a4b2c2;margin:10px 0 26px;line-height:1.5;max-width:${w - 120}px}
  .sub b{color:#fbbf24;font-weight:600}
  .box{background:#12161c;border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:16px}
  .box svg{display:block;width:100%;height:auto}
  .cap{font-family:'IBM Plex Mono',monospace;font-size:14px;color:#a4b2c2;text-align:center;margin-top:10px}
  .cap b{color:#e9eef4;font-weight:600}
  footer{display:flex;justify-content:space-between;align-items:center;
    margin-top:26px;padding-top:16px;border-top:1px solid rgba(255,255,255,.09);
    font-family:'IBM Plex Mono',monospace;font-size:15px;color:#6b7a8a}
  footer b{color:#22d3ee;font-weight:500}
</style>
<header>
  <span class="mark"><svg viewBox="0 0 32 32"><g fill="currentColor"><ellipse cx="11.6" cy="22.6" rx="5.6" ry="4.3" transform="rotate(-22 11.6 22.6)"/><rect x="15.3" y="6.6" width="2.1" height="16.4" rx="1"/><path d="M17.4 6.2c4.6 1.8 8.4 4.3 8.4 8.7 0 2.5-1.2 4.4-2.4 5.3 1.1-3.7-1.4-6.4-6-8.7z"/></g></svg></span>
  <h1>${title}</h1>
</header>
<p class="sub">${sub}</p>
${body}
<footer><span>fretboardwalk.com</span><b>free guitar fretboard trainer</b></footer>`;

// ---------------------------------------------------------------------------
const CHARTS = [
  {
    file: 'a-shape-barre-chord-scale-degrees.png',
    width: 1000,
    title: 'A-shape barre chord: the scale degrees',
    sub: 'Label the shape once and every other chord is <b>one finger away</b>. The B string holds the 3, so it sets major / minor / sus. The G string holds the spare octave, so it holds the 7ths. Shown at the 5th fret (D), but the numbers are the same at every fret, in every key.',
    body: `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
        <div class="box">${chord('A', 'major')}<p class="cap"><b>major</b><br>1 3 5</p></div>
        <div class="box">${chord('A', 'minor')}<p class="cap"><b>minor</b><br>1 ♭3 5</p></div>
        <div class="box">${chord('A', 'sus2')}<p class="cap"><b>sus2</b><br>1 2 5</p></div>
        <div class="box">${chord('A', 'sus4')}<p class="cap"><b>sus4</b><br>1 4 5</p></div>
        <div class="box">${chord('A', '7')}<p class="cap"><b>7</b><br>1 3 5 ♭7</p></div>
        <div class="box">${chord('A', 'maj7')}<p class="cap"><b>maj7</b><br>1 3 5 7</p></div>
        <div class="box">${chord('A', 'm7')}<p class="cap"><b>m7</b><br>1 ♭3 5 ♭7</p></div>
        <div class="box">${chord('A', '6')}<p class="cap"><b>6</b><br>1 3 5 6</p></div>
        <div class="box" style="display:flex;flex-direction:column;justify-content:center;gap:11px;font-size:15px;color:#a4b2c2;line-height:1.5">
          <div><span style="color:#22d3ee;font-weight:600">cyan</span> — the root, degree 1</div>
          <div><span style="color:#fbbf24;font-weight:600">amber</span> — the note that moved</div>
          <div><span style="color:#6b7a8a">dashed</span> — where it moved from</div>
          <div style="margin-top:6px;padding-top:11px;border-top:1px solid rgba(255,255,255,.09);font-size:14px">
            3→4 and 7→1 are the major scale's only half steps. That's why sus4 is one fret and sus2 is two.</div>
        </div>
      </div>`,
  },
  {
    file: 'guitar-scale-degree-chart-major-minor.png',
    width: 760,
    title: 'Guitar scale degree chart',
    sub: 'Every note of C major / A minor across the neck. The <b>big number</b> is the major degree, the small one is the same note\'s relative-minor degree. Yellow is the major tonic (C), pink the minor tonic (A). The pattern shifts up a fret crossing G→B.',
    body: `<div class="box" style="padding:10px 20px">${lift('major-minor-degree-map.html', 'C major / A minor scale-degree map')}</div>`,
  },
];

// ---------------------------------------------------------------------------
(async () => {
  const browser = await chromium.launch();
  for (const c of CHARTS) {
    const ctx = await browser.newContext({ viewport: { width: c.width, height: 800 }, deviceScaleFactor: SCALE });
    const p = await ctx.newPage();
    await p.setContent(SHELL(c.title, c.sub, c.body, c.width), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    const over = await p.evaluate(w => document.documentElement.scrollWidth - w, c.width);
    if (over > 0) throw new Error(`${c.file}: overflows its own width by ${over}px`);
    await p.screenshot({ path: path.join(OUT, c.file), fullPage: true });
    const { width, height } = await p.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
    const kb = (fs.statSync(path.join(OUT, c.file)).size / 1024).toFixed(0);
    console.log(`res/${c.file}  ${Math.round(width * SCALE)}x${Math.round(height * SCALE)}  ${kb}KB`);
    await ctx.close();
  }
  await browser.close();
})();
