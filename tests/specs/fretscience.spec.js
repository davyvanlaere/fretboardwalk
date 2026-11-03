const { test, expect } = require('@playwright/test');

// Fretscience (/fretscience): a neck of arbitrarily many strings, every one a
// fourth above the last, with A minor pentatonic on it and the two box shapes
// the pattern tiles with, each shaded in its own colour. The guitar's own six
// strings sit in the middle of however many are drawn, so the pattern is seen
// running on below the low E as well as above the top string.
//
// The page's whole claim is geometric, so these read the drawn board back out
// of the DOM and check the geometry rather than checking that something was
// drawn. Reading it is the expensive part; everything after is assertions on
// the same snapshot.

const SCALE = ['A', 'C', 'D', 'E', 'G'];
const FRETS = 16;                        // the last fret the board draws
// What the pentatonic leaves out of its parent scale — drawn, but half
// transparent, and no part of the tiling.
const EXTRA = ['B', 'F'];
const PC = { C: 0, 'D♭': 1, D: 2, 'E♭': 3, E: 4, F: 5, 'G♭': 6, G: 7, 'A♭': 8, A: 9, 'B♭': 10, B: 11 };
const nameOf = (pc) => Object.keys(PC).find((k) => PC[k] === pc);

// What each note is labelled: its degree in the parent major (C) and in that
// key's relative minor (A), written major|minor. Spelled out from the two
// scales by hand here rather than imported, so the page's own table has
// something independent to be wrong against.
const C_MAJOR = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const A_MINOR = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const labelFor = (name) => `${C_MAJOR.indexOf(name) + 1}|${A_MINOR.indexOf(name) + 1}`;

// Everything drawn, in one round trip.
async function readBoard(page) {
  return page.evaluate(() => ({
    // [data-string], so the warning sign's own glyph is not read as a string.
    open: [...document.querySelectorAll('#fsGutter text[data-string]')].map((t) => t.textContent),
    // Which of those are the six a guitar has, as the gutter marks them.
    guitar: [...document.querySelectorAll('#fsGutter text[data-string]')]
      .map((t) => t.dataset.guitar === '1'),
    pills: document.querySelectorAll('#fsGutter .fs-open-pill').length,
    // Which string names the one pill runs behind.
    pillCovers: (() => {
      const p = document.querySelector('#fsGutter .fs-open-pill');
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return [...document.querySelectorAll('#fsGutter text[data-string]')]
        .filter((t) => {
          const b = t.getBoundingClientRect();
          return b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
        })
        .map((t) => +t.dataset.string);
    })(),
    title: (document.querySelector('#fsBoard .fs-boardtitle') || {}).textContent || '',
    // The two string names the warning sign sits between, if there is one.
    warnBetween: (() => {
      const w = document.querySelector('#fsGutter .fs-warn');
      if (!w) return null;
      const y = w.getBoundingClientRect().top;
      const names = [...document.querySelectorAll('#fsGutter text[data-string]')]
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const i = names.findIndex((t) => t.getBoundingClientRect().top > y);
      return [names[i - 1].textContent, names[i].textContent];
    })(),
    notes: [...document.querySelectorAll('#fsNotes .fs-note')].map((g) => ({
      s: +g.dataset.string, f: +g.dataset.fret, pc: +g.dataset.pc,
      name: g.dataset.note, on: g.classList.contains('on'), root: g.classList.contains('root'),
      extra: g.classList.contains('extra'),
      label: (g.querySelector('text') || {}).textContent || '',
      // Read back off the element rather than off the class, so this is the
      // transparency that actually renders.
      opacity: +getComputedStyle(g).opacity,
    })),
    boxes: [...document.querySelectorAll('#fsBoxes path')].map((r) => ({
      kind: r.dataset.kind, gap: +r.dataset.gap,
      // Where the tile sits on its lowest string; higher strings can carry it
      // a fret further along, which is what bends it.
      f1: +r.dataset.fretLo, f2: +r.dataset.fretHi,
      s0: +r.dataset.stringLo, s1: +r.dataset.stringHi, span: +r.dataset.span,
      bent: r.dataset.bent === '1',
      corners: (r.getAttribute('d').match(/Q/g) || []).length,
      hidden: r.getAttribute('display') === 'none',
    })),
  }));
}

// The two invariants the page exists to show, checked against whatever is on
// screen: a 2-fret box spans three strings, a 3-fret box spans two, and every
// note of the scale is a corner of at least one of them. A box may come out
// short only where the edge of the board cut it off, and a tile the edge cuts
// through is still drawn — part of a tile is how the page says the pattern
// carries on past the board.
//
// However wide the neck gets, the guitar stays in the middle of it: six
// contiguous strings reading E A D G C F, with the spare strings split as
// evenly as the count allows between below the low E and above the top one.
function checkGuitarBlock({ open, guitar, pills, pillCovers }, strings, label,
  tuned = ['E', 'A', 'D', 'G', 'C', 'F']) {
  const below = guitar.indexOf(true);
  expect(below, `${label}: strings below the low E`).toBe(Math.floor((strings - 6) / 2));
  expect(guitar.filter(Boolean), `${label}: six marked`).toHaveLength(6);
  expect(guitar.lastIndexOf(true) - below, `${label}: contiguous`).toBe(5);
  expect(open.slice(below, below + 6), label).toEqual(tuned);
  // One pill down the six of them, covering those names and no others.
  expect(pills, `${label}: pills`).toBe(1);
  expect(pillCovers, `${label}: what the pill covers`)
    .toEqual([0, 1, 2, 3, 4, 5].map((i) => below + i));
  const above = strings - below - 6;
  expect(Math.abs(above - below), `${label}: ${below} below, ${above} above`).toBeLessThanOrEqual(1);
}

// How far each string's notes sit from where straight fourths would put them,
// read off the open strings alone: a step of a major third instead of a fourth
// leaves that string and every one above it a semitone low, so the same note
// is a fret further along. Nought all the way up in the default tuning.
function driftOf(open, label) {
  const drift = [0];
  for (let s = 1; s < open.length; s++) {
    const step = (((PC[open[s]] - PC[open[s - 1]]) % 12) + 12) % 12;
    expect([4, 5], `${label}: ${open[s - 1]} to ${open[s]} is ${step} semitones`).toContain(step);
    drift.push(drift[s - 1] + (step === 4 ? 1 : 0));
  }
  return drift;
}

function checkTiling({ open, notes, boxes }, strings, label) {
  // Worked out from the open strings rather than read off the board, because
  // a tile can have a corner at a fret the board does not draw.
  const isLit = (s, f) => SCALE.includes(nameOf((((PC[open[s]] + f) % 12) + 12) % 12));
  const drift = driftOf(open, label);
  // The tile's lower fret on string s. The page records it for the box's
  // lowest string; anything above a major-third step carries it a fret on.
  const fretAt = (b, s) => b.f1 + drift[s] - drift[b.s0];

  for (const b of boxes) {
    const where = `${label}: ${b.kind} box f${b.f1}-${b.f2} s${b.s0}-${b.s1}`;
    expect(b.gap, where).toBe(b.kind === 'primary' ? 2 : 3);
    expect(b.f2 - b.f1, where).toBe(b.gap);
    // A tile is bent exactly when its strings do not agree on where it sits,
    // and the drawn outline has the extra corners to show for it.
    expect(b.bent, `${where}: bent`).toBe(drift[b.s0] !== drift[b.s1]);
    expect(b.corners, `${where}: corners`).toBe(b.bent ? 8 : 4);
    // Part of it is on the board — a tile entirely off the end is not drawn.
    const seen = [];
    for (let s = b.s0; s <= b.s1; s++) {
      const f = fretAt(b, s);
      if (f + b.gap >= 0 && f <= FRETS) seen.push(s);
      // Every string it spans really does carry both of its frets…
      expect(isLit(s, f) && isLit(s, f + b.gap), `${where}: string ${s} corners`).toBe(true);
    }
    expect(seen.length, `${where}: entirely off the board`).toBeGreaterThan(0);
    // …and the box is maximal: the neighbours just outside it do not.
    for (const s of [b.s0 - 1, b.s1 + 1]) {
      if (s >= 0 && s < strings) {
        const f = fretAt(b, s);
        expect(isLit(s, f) && isLit(s, f + b.gap), `${where}: not maximal at string ${s}`).toBe(false);
      }
    }
    const full = b.kind === 'primary' ? 3 : 2;
    if (b.span !== full) {
      expect(b.s0 === 0 || b.s1 === strings - 1, `${where}: short but not at an edge`).toBe(true);
    }
    expect(b.span, where).toBeLessThanOrEqual(full);
  }

  // Nothing is left out: every pair of frets the scale makes on a string is
  // some drawn box's two sides, including the pairs with one fret off the end
  // of the board, which get drawn as the part of the tile that still fits.
  for (let s = 0; s < strings; s++) {
    for (const gap of [2, 3]) {
      for (let f = -gap; f <= FRETS; f++) {
        if (!isLit(s, f) || !isLit(s, f + gap)) continue;
        const drawn = boxes.some((b) => b.gap === gap && s >= b.s0 && s <= b.s1 && fretAt(b, s) === f);
        expect(drawn, `${label}: no ${gap}-fret box on string ${s} at frets ${f}-${f + gap}`).toBe(true);
      }
    }
  }

  const uncovered = notes.filter((n) => n.on && !boxes.some((b) =>
    n.s >= b.s0 && n.s <= b.s1 && (n.f === fretAt(b, n.s) || n.f === fretAt(b, n.s) + b.gap)));
  expect(uncovered, `${label}: notes in no box`).toEqual([]);
}

test.describe('fretscience', () => {
  test('a neck in straight fourths, carrying A minor pentatonic', async ({ page }) => {
    await page.goto('/fretscience');
    const board = await readBoard(page);

    // Twelve strings by default — a full turn of the cycle of fourths, with
    // the guitar's six in the middle: three strings below its low E, three
    // above its top one.
    expect(board.open).toEqual(['D♭', 'G♭', 'B', 'E', 'A', 'D', 'G', 'C', 'F', 'B♭', 'E♭', 'A♭']);
    checkGuitarBlock(board, 12, '12 strings');
    // The diagram carries its own title, so a screenshot of the board alone
    // still says what it is — and nothing warns about a neck with no kink.
    expect(board.title).toBe('A Minor / C Major Pentatonic Scale');
    expect(board.warnBetween).toBeNull();
    for (let s = 1; s < board.open.length; s++) {
      expect((PC[board.open[s - 1]] + 5) % 12, `string ${s} is a fourth up`).toBe(PC[board.open[s]]);
    }

    // 12 strings x 17 frets, every square drawn, lit exactly where the scale is.
    expect(board.notes).toHaveLength(12 * 17);
    for (const n of board.notes) {
      const where = `string ${n.s} fret ${n.f}`;
      expect((PC[board.open[n.s]] + n.f) % 12, where).toBe(n.pc);
      expect(n.on, where).toBe(SCALE.includes(nameOf(n.pc)));
      expect(n.extra, where).toBe(EXTRA.includes(nameOf(n.pc)));
      expect(n.on && n.extra, `${where}: cannot be both`).toBe(false);
      if (n.on || n.extra) {
        expect(n.name, where).toBe(nameOf(n.pc));
        // Labelled by degree, not by name: major|minor.
        expect(n.label, `${where} (${n.name})`).toBe(labelFor(n.name));
      } else {
        expect(n.name, where).toBe('');             // chromatic: a bare dot…
        expect(n.label, where).toBe('');            // …and no degree in either scale
      }
      expect(n.root, where).toBe(n.pc === PC.A);
      if (n.root) expect(n.name).toBe('A');
    }

    // The five of the pentatonic and the two it leaves out, spelled the way
    // the page says they read.
    const labelsOf = (pick) => [...new Set(board.notes.filter(pick).map((n) => n.label))].sort();
    expect(labelsOf((n) => n.on)).toEqual(['1|3', '2|4', '3|5', '5|7', '6|1']);
    expect(labelsOf((n) => n.extra)).toEqual(['4|6', '7|2']);
    expect(labelsOf((n) => n.root)).toEqual(['6|1']);
    expect(board.notes.filter((n) => n.on)).toHaveLength(85);
    expect(board.notes.filter((n) => n.root)).toHaveLength(17);
  });

  test('the notes the pentatonic leaves out are there, at half transparency', async ({ page }) => {
    await page.goto('/fretscience');
    const board = await readBoard(page);

    // B and F: the pair that turns A minor pentatonic into A natural minor,
    // which is C major from a different root.
    const extra = board.notes.filter((n) => n.extra);
    expect([...new Set(extra.map((n) => n.name))].sort()).toEqual(['B', 'F']);
    expect(extra).toHaveLength(34);
    expect(extra.every((n) => n.opacity === 0.5)).toBe(true);
    // Everything else on the board is fully opaque — the transparency is the
    // only thing marking them out.
    expect(board.notes.filter((n) => !n.extra).every((n) => n.opacity === 1)).toBe(true);

    // Spot-check the guitar's low E — string 3 of the default twelve — against
    // the pitches by hand: F at 1 and 13, B at 7, and nothing else.
    const lowE = board.guitar.indexOf(true);
    expect(board.open[lowE]).toBe('E');
    expect(extra.filter((n) => n.s === lowE).map((n) => `${n.f}:${n.name}`)).toEqual(['1:F', '7:B', '13:F']);

    // Seven notes of the parent scale named per string, five chromatic ones left as dots.
    const named = board.notes.filter((n) => n.s === lowE && n.name && n.f < 12);
    expect(named).toHaveLength(7);

    // And they stay out of the pattern: no tile corner ever lands on one.
    for (const n of extra) {
      const inBox = board.boxes.some((b) => n.s >= b.s0 && n.s <= b.s1 && (n.f === b.f1 || n.f === b.f2));
      expect(inBox, `${n.name} at string ${n.s} fret ${n.f} is inside a box`).toBe(false);
    }
  });

  test('the primary tile is three strings two frets apart, the secondary two strings three frets apart', async ({ page }) => {
    await page.goto('/fretscience');
    const board = await readBoard(page);

    checkTiling(board, 12, '12 strings');
    expect(board.boxes.filter((b) => b.kind === 'primary')).toHaveLength(22);
    expect(board.boxes.filter((b) => b.kind === 'secondary')).toHaveLength(21);
    expect(board.boxes.every((b) => !b.hidden)).toBe(true);

    // Eleven of those are part-tiles, cut by the nut or by the last fret:
    // six running off the left of the board, five off the right.
    const cut = board.boxes.filter((b) => b.f1 < 0 || b.f2 > FRETS);
    expect(cut).toHaveLength(11);
    expect(cut.filter((b) => b.f1 < 0)).toHaveLength(6);
    // The furthest out of them: a 3-fret tile on the G and C strings starting
    // three frets before the nut, so only its right-hand side is on the board.
    expect(cut.some((b) => b.kind === 'secondary' && b.f1 === -3 && b.f2 === 0 &&
      board.open[b.s0] === 'G' && board.open[b.s1] === 'C')).toBe(true);

    // On a neck of straight fourths nothing bends: every tile is a plain
    // four-cornered block. ?tuning=guitar is the test that proves the kink.
    expect(board.boxes.every((b) => !b.bent && b.corners === 4)).toBe(true);

    // The tiles have no outline, so the blend is what draws every edge:
    // without it the tile drawn second would simply cover the first, and
    // nothing else on this page would notice.
    expect(await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('#fsBoxes path'));
      return [s.mixBlendMode, s.stroke];
    })).toEqual(['screen', 'none']);

    // Away from the two edge strings the shapes are always their full size —
    // the claim the page makes in prose.
    const inner = board.boxes.filter((b) => b.s0 > 0 && b.s1 < 11);
    expect(inner.length).toBeGreaterThan(10);
    for (const b of inner) expect(b.span, `${b.kind} f${b.f1}-${b.f2}`).toBe(b.kind === 'primary' ? 3 : 2);
  });

  test('the neck is not limited to six strings, and the tiling survives every width', async ({ page }) => {
    await page.goto('/fretscience');
    for (const strings of ['6', '16', '10']) {
      await page.getByLabel('Number of strings').selectOption(strings);
      const board = await readBoard(page);
      expect(board.open, strings).toHaveLength(+strings);
      expect(board.notes, strings).toHaveLength(+strings * 17);
      checkGuitarBlock(board, +strings, `${strings} strings`);
      checkTiling(board, +strings, `${strings} strings`);
      // Widening the neck only ever adds shapes; it never breaks existing ones.
      expect(board.boxes.length, strings).toBeGreaterThanOrEqual(+strings);
      // The half-transparent notes come along at every width, and stay outside
      // the tiling at every width.
      const extra = board.notes.filter((n) => n.extra);
      expect(extra.length, strings).toBeGreaterThan(0);
      expect(extra.every((n) => n.opacity === 0.5), strings).toBe(true);
      expect(extra.some((n) => board.boxes.some((b) =>
        n.s >= b.s0 && n.s <= b.s1 && (n.f === b.f1 || n.f === b.f2))), strings).toBe(false);
    }
  });

  test('?tuning=guitar puts the B string back, and the tiles that cross it bend', async ({ page }) => {
    await page.goto('/fretscience?tuning=guitar');
    const board = await readBoard(page);

    // The same twelve strings, except the one above the G is a B — a major
    // third — and everything above that is a semitone lower than it was.
    expect(board.open).toEqual(['D♭', 'G♭', 'B', 'E', 'A', 'D', 'G', 'B', 'E', 'A', 'D', 'G']);
    checkGuitarBlock(board, 12, 'guitar tuning', ['E', 'A', 'D', 'G', 'B', 'E']);
    const drift = driftOf(board.open, 'guitar tuning');
    expect(drift).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);   // one kink, above the G
    // And the gutter flags it, in the one gap where it happens.
    expect(board.warnBetween).toEqual(['B', 'G']);
    expect(board.title).toBe('A Minor / C Major Pentatonic Scale');

    // The pattern itself is untouched: same two tiles, same tiling, every lit
    // note still a corner. Only where the neck puts them has changed.
    checkTiling(board, 12, 'guitar tuning');
    expect(board.boxes.filter((b) => b.kind === 'primary')).toHaveLength(22);
    expect(board.boxes.filter((b) => b.kind === 'secondary')).toHaveLength(21);

    // Five of them straddle the G-to-B step, and those are the bent ones —
    // bent exactly where the guitar is irregular, nowhere else.
    const bent = board.boxes.filter((b) => b.bent);
    expect(bent).toHaveLength(5);
    expect(bent.filter((b) => b.kind === 'primary')).toHaveLength(3);
    for (const b of bent) {
      expect(b.s0 <= 6 && b.s1 >= 7, `${b.kind} f${b.f1} s${b.s0}-${b.s1} straddles the B`).toBe(true);
    }
    // And every tile that straddles it is bent: nothing crosses the kink flat.
    expect(board.boxes.filter((b) => b.s0 <= 6 && b.s1 >= 7)).toHaveLength(5);

    // The page says which neck you are on, and offers the other one.
    await expect(page.locator('.fs-lede-guitar')).toBeVisible();
    await expect(page.locator('.fs-lede-fourths')).toBeHidden();
    await expect(page.locator('#fsTuningLink')).toHaveAttribute('href', '/fretscience');

    // The kink travels with the guitar when the neck is resized around it.
    await page.getByLabel('Number of strings').selectOption('8');
    const eight = await readBoard(page);
    expect(eight.open).toEqual(['B', 'E', 'A', 'D', 'G', 'B', 'E', 'A']);
    checkGuitarBlock(eight, 8, 'guitar tuning, 8 strings', ['E', 'A', 'D', 'G', 'B', 'E']);
    checkTiling(eight, 8, 'guitar tuning, 8 strings');
    expect(eight.boxes.filter((b) => b.bent)).toHaveLength(5);
  });

  test('is not announced yet: unlisted, unlinked, and says so to crawlers', async ({ page, request }) => {
    // Deliberate, and here so that half a launch is visible rather than
    // quiet: the page works and is served, but nothing points at it. Delete
    // this test when it goes live — and put the three things back.
    expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/fretscience');

    await page.goto('/toolbox');
    await expect(page.locator('a[href="/fretscience"]')).toHaveCount(0);

    await page.goto('/fretscience');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
    // Still a real page, with its canonical, for whoever has the link.
    await expect(page.locator('link[rel="canonical"]'))
      .toHaveAttribute('href', 'https://www.fretboardwalk.com/fretscience');
    await expect(page.locator('#fsBoxes path').first()).toBeAttached();
  });

  test('?palette= repaints both tiles, and an unknown name falls back', async ({ page }) => {
    // The board, the legend swatches and the words in the prose all have to
    // move together, or the page starts describing a colour it isn't using.
    const paint = () => page.evaluate(() => {
      const of = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
      return {
        tiles: [of('#fsBoxes .fs-box-primary', 'fill'), of('#fsBoxes .fs-box-secondary', 'fill')],
        swatches: [of('.fs-leg.primary .fs-swatch', 'backgroundColor'),
          of('.fs-leg.secondary .fs-swatch', 'backgroundColor')],
        inks: [of('.fs-ink-primary', 'color'), of('.fs-ink-secondary', 'color'),
          of('.fs-ink-mixed', 'color')],
      };
    });

    await page.goto('/fretscience');
    const fallback = await paint();
    const tiles = [];
    for (const name of ['amethyst', 'ember', 'dusk', 'neon']) {
      await page.goto('/fretscience?palette=' + name);
      const p = await paint();
      expect(p.tiles[0], `${name}: the two tiles are the same colour`).not.toBe(p.tiles[1]);
      // The swatch is the tile's own colour, and each ink is its own.
      expect(p.swatches.map((c) => c.replace(/^rgba?\(|\)$/g, '')), `${name}: swatches`)
        .toEqual(p.tiles.map((c) => c.replace(/^rgba?\(|\)$/g, '')));
      expect(new Set(p.inks).size, `${name}: inks`).toBe(3);
      tiles.push(p.tiles.join(' + '));
    }
    // Four distinct palettes. Pairs, not colours: ember keeps amethyst's blue
    // on purpose and only warms the other half, so the eight are not all
    // different and asserting that they are would be asserting a mistake.
    expect(new Set(tiles).size, tiles.join('\n')).toBe(4);

    // The first is the default, and a name that isn't one lands on it rather
    // than leaving the board unpainted.
    await page.goto('/fretscience?palette=amethyst');
    expect(await paint()).toEqual(fallback);
    await page.goto('/fretscience?palette=chartreuse');
    expect(await paint()).toEqual(fallback);
  });

  test('each legend swatch switches its own overlay off the board', async ({ page }) => {
    await page.goto('/fretscience');
    const primary = page.getByRole('button', { name: '3 strings, 2 frets apart' });
    const secondary = page.getByRole('button', { name: '2 strings, 3 frets apart' });

    await primary.click();
    await expect(primary).toHaveAttribute('aria-pressed', 'false');
    let boxes = (await readBoard(page)).boxes;
    expect(boxes.filter((b) => b.kind === 'primary').every((b) => b.hidden)).toBe(true);
    expect(boxes.filter((b) => b.kind === 'secondary').every((b) => !b.hidden)).toBe(true);

    await secondary.click();
    boxes = (await readBoard(page)).boxes;
    expect(boxes.every((b) => b.hidden)).toBe(true);

    // And back: the choice survives a redraw from the string count.
    await primary.click();
    await page.getByLabel('Number of strings').selectOption('8');
    boxes = (await readBoard(page)).boxes;
    expect(boxes.filter((b) => b.kind === 'primary').every((b) => !b.hidden)).toBe(true);
    expect(boxes.filter((b) => b.kind === 'secondary').every((b) => b.hidden)).toBe(true);
  });
});
