const { chromium } = require('C:/Git/FretboardWalk/tests/node_modules/playwright');
const fs = require('fs');
const SAMPLE = [...fs.readFileSync('C:/Git/FretboardWalk/help.html', 'utf8')
  .matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => m[1].replace(/<[^>]+>/g, ''))
  .join(' ').replace(/\s+/g, ' ').slice(0, 4000);

(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"><p>x</p>`, { waitUntil: 'networkidle' });
  const out = await p.evaluate(async (sample) => {
    const fams = ['Space Grotesk', 'IBM Plex Mono'];
    for (const f of fams) for (const w of [400,500,600,700]) await document.fonts.load(`${w} 100px "${f}"`, 'abc');
    await document.fonts.ready;
    const c = document.createElement('canvas').getContext('2d');
    const m = (w, fam) => { c.font = `${w} 100px ${fam}`;
      const t = c.measureText(sample), o = c.measureText('x');
      return { w: t.width / sample.length, asc: o.fontBoundingBoxAscent / 100, desc: o.fontBoundingBoxDescent / 100 }; };
    const res = [];
    for (const w of [400,500,600,700]) {
      // the fallback the browser would pick for that weight
      const fbW = w >= 600 ? 700 : 400;
      res.push({ font: 'Space Grotesk', w, t: m(w, '"Space Grotesk"'), f: m(fbW, 'Arial'), fb: 'Arial' });
    }
    for (const w of [400,500,600]) {
      const fbW = w >= 600 ? 700 : 400;
      res.push({ font: 'IBM Plex Mono', w, t: m(w, '"IBM Plex Mono"'), f: m(fbW, '"Courier New"'), fb: 'Courier New' });
    }
    return res;
  }, SAMPLE);

  const css = [];
  let last = '';
  for (const r of out) {
    const sa = r.t.w / r.f.w;
    if (r.font !== last) { css.push(`\n/* ${r.font} — metric-matched fallback (measured, not guessed) */`); last = r.font; }
    css.push(`@font-face{
  font-family:'${r.font} Fallback';
  src:local('${r.w >= 600 ? r.fb + ' Bold' : r.fb}'), local('${r.fb}');
  font-weight:${r.w};
  size-adjust:${(sa * 100).toFixed(2)}%;
  ascent-override:${(r.t.asc / sa * 100).toFixed(2)}%;
  descent-override:${(r.t.desc / sa * 100).toFixed(2)}%;
  line-gap-override:0%;
}`);
    console.log(`${r.font} ${r.w}: target ${r.t.w.toFixed(3)} vs ${r.fb} ${r.f.w.toFixed(3)} -> size-adjust ${(sa*100).toFixed(2)}%`);
  }
  fs.writeFileSync('fallback.css', css.join('\n') + '\n');
  console.log('\nwritten to fallback.css');
  await b.close();
})();
