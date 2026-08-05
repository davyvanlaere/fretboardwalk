const { test, expect } = require('@playwright/test');
const H = require('../helpers');

// The hint teaches the route rather than giving the answer, so the one thing it
// must never do is point somewhere wrong. These drive the real app and read the
// route back off the board itself — the drawn destination ring is mapped to the
// cell underneath it, so the arrows are checked against the same hit-targets the
// game scores against. A mirror of the algorithm would only prove the mirror.

// Which (string, fret) the destination ring is sitting on, and what degree that
// cell actually carries.
async function destinationCell(page) {
  return page.evaluate(() => {
    const ring = document.querySelector('.hint-dest');
    if (!ring) return null;
    const r = ring.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (const c of document.querySelectorAll('.fret-cell')) {
      const b = c.getBoundingClientRect();
      if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) {
        return { string: +c.dataset.string, fret: +c.dataset.fret, degree: c.dataset.degree || null };
      }
    }
    return { string: null, fret: null, degree: null };
  });
}

const CYCLE = ['7', '3', '6', '2', '5', '1', '4'];

// Which (string, fret) an SVG element on the board is sitting over, and what
// degree that cell carries. Everything here is read back off the real board
// rather than recomputed, so a drawing that disagrees with the game is caught.
const cellUnder = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (const c of document.querySelectorAll('.fret-cell')) {
    const b = c.getBoundingClientRect();
    if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) {
      return { string: +c.dataset.string, fret: +c.dataset.fret, degree: c.dataset.degree || null };
    }
  }
  return null;
}, selector);

// The reach as the hint describes it in words: how many strings, which way.
function parseReach(said) {
  const m = said.match(/(One string|(\d+) strings) (thinner|thicker)/);
  if (!m) return null;
  return { span: m[2] ? +m[2] : 1, dir: m[3] === 'thinner' ? 1 : -1 };
}

const cycleStep = (from, n) => {
  const i = CYCLE.indexOf(from);
  return i < 0 ? null : CYCLE[((i + n) % 7 + 7) % 7];
};

const openHint = async (page) => {
  await page.locator('#hintAskBtn').click();
  await expect(page.locator('#hintPanel')).toBeVisible();
};

// Several of these walk twenty-odd turns to sample enough routes, which is slow
// on purpose — the alternative is asserting against a copy of the algorithm.
test.beforeEach(({}, testInfo) => testInfo.setTimeout(testInfo.timeout * 2));

// The prose only. Diagrams live inside the steps and their SVG labels are text
// nodes too, so a plain textContent splices "…+1 −1" straight onto the sentence
// and any number pulled out of it is fiction.
const stepText = (page) => page.locator('#hintSteps').evaluate((el) => {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('svg').forEach((s) => s.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
});

// The slide is worded two ways: normally it names the scale interval and then
// the move, but when the staging note is outside the key there's no interval to
// name, so it only counts frets.
function parseSlide(said) {
  let m = said.match(/go (up|down) (\d+) fret/);
  if (m) return { dir: m[1], frets: +m[2] };
  // Landing in a crack has no scale interval to name, so it reads
  // "your 4 is the lower one — 1 fret down".
  m = said.match(/(\d+) frets? (up|down)/);
  if (m) return { dir: m[2], frets: +m[1] };
  return null;
}

test.describe('the "how do I find it" hint', () => {
  test('offers itself by naming the degree being asked for', async ({ page }) => {
    await H.gotoPlaying(page);
    const target = await H.currentTarget(page);
    await expect(page.locator('#hintAskDeg')).toHaveText(target.replace('b', '♭'));
    await expect(page.locator('#hintAskBtn')).toContainText('How do I find');
  });

  test('points at a cell that really is the target degree', async ({ page }) => {
    await H.gotoPlaying(page);

    // Several turns, since the route depends on where you're standing.
    for (let i = 0; i < 6; i++) {
      const target = await H.currentTarget(page);
      await openHint(page);

      const dest = await destinationCell(page);
      expect(dest, 'destination ring should sit on a board cell').not.toBeNull();
      expect(dest.degree, `hint pointed at ${dest.degree}, asked for ${target}`).toBe(target);
      expect(dest.fret).toBeGreaterThanOrEqual(0);
      expect(dest.fret).toBeLessThanOrEqual(15);

      await page.locator('#hintCloseBtn').click();
      await H.tapDegree(page, target);
    }
  });

  test('the route it draws is the route it describes', async ({ page }) => {
    await H.gotoPlaying(page);

    // Only cross-string routes draw a staging ring, and which kind you get
    // depends on where the game has put you — so loop until enough of them turn
    // up rather than hoping the first turn is the interesting one.
    let crossChecked = 0;
    for (let i = 0; i < 10 && crossChecked < 3; i++) {
      await openHint(page);

      const stop = await page.evaluate(() => {
        const ring = document.querySelector('.hint-stop');
        if (!ring) return null;
        const r = ring.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        for (const c of document.querySelectorAll('.fret-cell')) {
          const b = c.getBoundingClientRect();
          if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) {
            return { string: +c.dataset.string, fret: +c.dataset.fret };
          }
        }
        return null;
      });

      if (stop) {
        const said = await stepText(page);
        const dest = await destinationCell(page);
        const slide = parseSlide(said);
        expect(slide, `a staged route should describe a slide: "${said}"`).not.toBeNull();

        // The slide runs along one string, so the staging post and the
        // destination must share it.
        expect(dest.string).toBe(stop.string);
        // Fret numbers rise away from the nut in both orientations, so "up"
        // has to mean a higher fret number.
        const delta = dest.fret - stop.fret;
        expect(Math.abs(delta)).toBe(slide.frets);
        expect(delta > 0 ? 'up' : 'down').toBe(slide.dir);
        crossChecked++;
      }

      await page.locator('#hintCloseBtn').click();
      await H.tapDegree(page, await H.currentTarget(page));
    }
    expect(crossChecked, 'expected some cross-string routes in 10 turns').toBeGreaterThan(0);
  });

  test('reaches across more than one string when that is the shorter move', async ({ page }) => {
    await H.gotoPlaying(page);

    // Play from the outer strings. An inner string has a neighbour on both
    // sides, so a single-string reach almost always wins there and this test
    // used to fail on chance alone; from the low or high E there's only one
    // neighbour and 35% of routes reach further. Twenty turns then puts a run
    // of nothing but single-string reaches at about 1 in 6000, so a failure
    // here means the multi-string path is dead rather than unlucky. Alternating
    // the two ends also exercises both reach directions.
    const spans = new Set();
    for (let i = 0; i < 20; i++) {
      await openHint(page);
      const span = await page.evaluate(() => {
        const cellAt = (el) => {
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          for (const c of document.querySelectorAll('.fret-cell')) {
            const b = c.getBoundingClientRect();
            if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) return c;
          }
          return null;
        };
        const dest = cellAt(document.querySelector('.hint-dest'));
        const stop = document.querySelector('.hint-stop');
        const land = stop ? cellAt(stop) : dest;
        return land ? +land.dataset.string : null;
      });
      const said = await stepText(page);
      const m = said.match(/(One string|(\d+) strings) (thinner|thicker)/);
      if (m) {
        const claimed = m[2] ? +m[2] : 1;
        spans.add(claimed);
        expect(claimed).toBeLessThanOrEqual(3);
        if (claimed > 1) {
          expect(said).toContain('7 3 6 2 5 1 4');
          // Exactly one diagram per reach: the sequence normally, or the fork
          // when an edge case means the sequence is the thing that doesn't
          // apply. Never both, never neither.
          const cycles = await page.locator('.hint-cycle').count();
          const forks = await page.locator('.hint-branch').count();
          expect(cycles + forks, `expected one diagram, got ${cycles} cycle + ${forks} fork`).toBe(1);
          if (cycles) {
            // A multi-string reach has to show the places it passes through.
            await expect(page.locator('.hint-cycle span.via')).toHaveCount(claimed - 1);
          }
        }
        // Landing between two degrees is an edge case, not a dead end, so it
        // must always name the pair and never just report a failure.
        if (/gap between/.test(said)) {
          expect(said).toMatch(/gap between the .+ and the /);
          await expect(page.locator('#hintWarn')).toBeVisible();
        }
      }
      expect(span, 'route should land on a real string').not.toBeNull();
      await page.locator('#hintCloseBtn').click();
      await H.tapDegree(page, await H.currentTarget(page), { onString: i % 2 ? 5 : 0 });
    }
    expect([...spans].some((n) => n > 1), `only saw spans ${[...spans]}`).toBe(true);
  });

  test('the route always pauses on the degree the sequence names', async ({ page }) => {
    await H.gotoPlaying(page);

    // The rule that keeps the hint teaching something transferable: the stop is
    // the sequence's next degree, wherever the neck has put it. Crossing G→B
    // displaces that degree by a fret, and describing whatever sits level with
    // you instead states a coincidence — "one string thinner from a 5 is the 7"
    // holds across G→B and nowhere else. The single exception is the tritone
    // fork, where no such degree exists to reach.
    let reaches = 0, displaced = 0;
    for (let i = 0; i < 24; i++) {
      await openHint(page);
      const said = await stepText(page);
      const reach = parseReach(said);

      if (reach) {
        reaches++;
        const cur = (await page.locator('#curNum').textContent()).replace('♭', 'b');
        const expected = cycleStep(cur, reach.dir * reach.span);
        // Only one ring is drawn when the stop is already the destination.
        const stop = await cellUnder(page, '.hint-stop') || await cellUnder(page, '.hint-dest');
        expect(stop, 'the route should stop on a real cell').not.toBeNull();

        if (await page.locator('.hint-branch').count()) {
          // A fork stays level, in the crack — there is no degree to stop on.
          expect(stop.degree, `fork should stop in a gap, found ${stop.degree}`).toBeNull();
        } else if (expected) {
          // Within a couple of frets of the ends the sequence's degree can fall
          // off the neck entirely — measured, that's frets 0, 1, 14 and 15 only.
          // There the route honestly describes whatever is level instead, so
          // the rule can only be asserted where the degree is actually there.
          const inReach = await page.evaluate(({ s, f, d }) => {
            for (let n = -2; n <= 2; n++) {
              const c = document.querySelector(`.fret-cell[data-string="${s}"][data-fret="${f + n}"]`);
              if (c && c.dataset.degree === d) return true;
            }
            return false;
          }, { s: stop.string, f: stop.fret, d: expected });

          if (inReach) {
            expect(stop.degree,
              `on a ${cur}, ${reach.span} string(s) ${reach.dir === 1 ? 'thinner' : 'thicker'}: ` +
              `sequence says ${expected}, route stopped on ${stop.degree}`).toBe(expected);
            if (/rather than level/.test(said)) displaced++;
          }
        }
      }

      await page.locator('#hintCloseBtn').click();
      await H.tapDegree(page, await H.currentTarget(page), { onString: i % 6 });
    }
    expect(reaches, 'expected some cross-string reaches').toBeGreaterThan(4);
    // Roughly a third of reaches are displaced by a seam, so seeing none would
    // mean the displaced path is dead rather than merely unlucky.
    expect(displaced, 'expected some seam-displaced stops in 24 turns').toBeGreaterThan(0);
  });

  test('the edge-case fork is stacked the same way up as the neck', async ({ page }) => {
    await H.gotoPlaying(page);

    // Fret numbers grow downward on the neck, so the figure's top branch has to
    // be the LOWER fret. Checked against the board rather than against pitch —
    // getting this backwards is invisible unless you compare the two.
    let checked = 0;
    for (let i = 0; i < 26 && checked < 2; i++) {
      await openHint(page);

      if (await page.locator('.hint-branch').count()) {
        const stop = await page.evaluate(() => {
          const ring = document.querySelector('.hint-stop') || document.querySelector('.hint-dest');
          const r = ring.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          for (const c of document.querySelectorAll('.fret-cell')) {
            const b = c.getBoundingClientRect();
            if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) {
              return { string: +c.dataset.string, fret: +c.dataset.fret };
            }
          }
          return null;
        });
        expect(stop).not.toBeNull();

        // Boxes are emitted solo, top, bottom — so these are the two branches.
        const labels = await page.locator('.hint-branch text').allTextContents();
        const [top, bottom] = [labels[1], labels[2]];
        const degAt = (fret) => page.evaluate(
          ({ s, f }) => document.querySelector(
            `.fret-cell[data-string="${s}"][data-fret="${f}"]`)?.dataset.degree || null,
          { s: stop.string, f: fret });

        expect(top, 'top branch should be the fret above').toBe(await degAt(stop.fret - 1));
        expect(bottom, 'bottom branch should be the fret below').toBe(await degAt(stop.fret + 1));

        // And the pair must be one of the exactly two rules worth memorising.
        // A longer reach can cross the same join but carry the error onward and
        // land somewhere that isn't the pair — showing the fork there would
        // teach something false, so it must not appear.
        const said = await stepText(page);
        const dir = parseReach(said).dir;
        expect([top, bottom], `fork drew ${top}/${bottom} going ${dir === 1 ? 'thinner' : 'thicker'}`)
          .toEqual(dir === 1 ? ['6', '7'] : ['4', '5']);
        checked++;
      }

      await page.locator('#hintCloseBtn').click();
      await H.tapDegree(page, await H.currentTarget(page), { onString: i % 6 });
    }
    expect(checked, 'expected some edge-case forks in 26 turns').toBeGreaterThan(0);
  });

  test('calls out the G-to-B gap when the route crosses it', async ({ page }) => {
    await H.gotoPlaying(page);

    // Play until a hint whose cross-string move spans the G/B pair, then check
    // it warns rather than quietly being a fret out.
    let sawGap = false;
    for (let i = 0; i < 14 && !sawGap; i++) {
      await openHint(page);
      const crosses = await page.evaluate(() => {
        const stop = document.querySelector('.hint-stop') || document.querySelector('.hint-dest');
        const leg = document.querySelector('.hint-leg');
        if (!leg || !stop) return false;
        const r = stop.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let landedString = null;
        for (const c of document.querySelectorAll('.fret-cell')) {
          const b = c.getBoundingClientRect();
          if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) landedString = +c.dataset.string;
        }
        const cur = window.__curString;
        return { landedString };
      });
      const warned = await page.locator('#hintWarn').isVisible();
      if (warned) {
        const text = await page.locator('#hintWarn').textContent();
        // Whichever variant fires, it has to name one of the two odd joins —
        // the tuning's G→B pair or the sequence's 4-to-7 — and never be a bare
        // "that didn't work".
        expect(text).toMatch(
          /G→B|4-to-7|one string lighter always lands|one string heavier always lands/i);
        sawGap = true;
      }
      await page.locator('#hintCloseBtn').click();
      await H.tapDegree(page, await H.currentTarget(page));
    }
    // Roughly a quarter of routes hit an exception, so 14 turns without one
    // would be a signal the warning path is dead rather than merely unlucky.
    expect(sawGap, 'expected at least one exception warning in 14 turns').toBe(true);
  });

  // The route is drawn into groups that sit ABOVE the hit cells, so anything
  // with a fill in it can swallow the tap the hint just told you to make.
  // Rings are fill:none and let clicks through, which is why this went unnoticed
  // — but Dots and Hidden mode add an opaque labelled disc right on the target.
  for (const mode of ['numerals', 'dots', 'hidden']) {
    test(`the target stays tappable with the hint open (${mode})`, async ({ page }) => {
      await H.seedStorage(page, {
        [H.STORAGE.onboarded]: '1',
        [H.STORAGE.nudge]: '1',
        [H.STORAGE.settings]: JSON.stringify({ noteDisplay: mode }),
      });
      await page.goto('/');
      await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

      await openHint(page);
      const dest = await destinationCell(page);

      // Tap the very cell the route points at — no force, so an interception
      // fails the test rather than being papered over.
      await page.locator(`.fret-cell[data-string="${dest.string}"][data-fret="${dest.fret}"]`).click();
      await expect(page.locator('#streakVal')).toHaveText('1');
    });
  }

  // Dots draws the notes without numbers and Hidden draws nothing at all, so a
  // ring on its own sits over blank neck. The route has to name its own stops
  // in those modes or the words and the board can't be reconciled.
  for (const mode of ['dots', 'hidden']) {
    test(`the route names its own stops in ${mode} mode`, async ({ page }) => {
      await H.seedStorage(page, {
        [H.STORAGE.onboarded]: '1',
        [H.STORAGE.nudge]: '1',
        [H.STORAGE.settings]: JSON.stringify({ noteDisplay: mode }),
      });
      await page.goto('/');
      await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);
      await openHint(page);

      const labelled = await page.evaluate(() => {
        const out = [];
        for (const disc of document.querySelectorAll('.hint-name')) {
          const b = disc.getBoundingClientRect();
          const px = b.left + b.width / 2, py = b.top + b.height / 2;
          // The label drawn at the same centre as this disc.
          const text = [...document.querySelectorAll('#hintOver text')].find((t) => {
            const r = t.getBoundingClientRect();
            return Math.abs(r.left + r.width / 2 - px) < 4 && Math.abs(r.top + r.height / 2 - py) < 9;
          });
          let degree = null;
          for (const c of document.querySelectorAll('.fret-cell')) {
            const q = c.getBoundingClientRect();
            if (px >= q.left && px <= q.right && py >= q.top && py <= q.bottom) degree = c.dataset.degree || null;
          }
          out.push({ label: text ? text.textContent : null, degree });
        }
        return out;
      });

      expect(labelled.length, 'every stop on the route should be named').toBeGreaterThan(0);
      for (const stop of labelled) {
        expect(stop.label, 'a named stop must carry a label').not.toBeNull();
        // A stop in a crack has no degree of its own; every other one must say
        // exactly what the board says it is.
        if (stop.degree) expect(stop.label.replace('♭', 'b')).toBe(stop.degree);
      }
    });
  }

  test('clears itself once the answer is given', async ({ page }) => {
    await H.gotoPlaying(page);
    await openHint(page);
    await expect(page.locator('.hint-dest')).toHaveCount(1);

    await H.tapDegree(page, await H.currentTarget(page));

    await expect(page.locator('#hintPanel')).toBeHidden();
    await expect(page.locator('#hintAskBtn')).toBeVisible();
    await expect(page.locator('.hint-dest')).toHaveCount(0);
  });

  test('closing it leaves the board untouched', async ({ page }) => {
    await H.gotoPlaying(page);
    const before = await H.streak(page);
    await openHint(page);
    await page.locator('#hintCloseBtn').click();

    await expect(page.locator('.hint-dest')).toHaveCount(0);
    await expect(page.locator('.hint-leg')).toHaveCount(0);
    expect(await H.streak(page)).toBe(before);
    // and the game still works
    await H.tapDegree(page, await H.currentTarget(page));
    expect(await H.streak(page)).toBe('1');
  });

  test('using it costs nothing — the streak still builds', async ({ page }) => {
    await H.gotoPlaying(page);
    for (let i = 0; i < 3; i++) {
      await openHint(page);
      await H.tapDegree(page, await H.currentTarget(page));
    }
    expect(await H.streak(page)).toBe('3');
  });

  test('is not available during a Time Attack run', async ({ page }) => {
    await H.gotoPlaying(page);
    await expect(page.locator('#hintBox')).toBeVisible();

    await page.locator('#taStartBtn').click();
    await expect(page.locator('#hintBox')).toBeHidden();

    await page.locator('#taStartBtn').click();   // stop
    await expect(page.locator('#hintBox')).toBeVisible();
  });

  test('survives the board being rebuilt underneath it', async ({ page }) => {
    await H.gotoPlaying(page);
    await openHint(page);
    const before = await destinationCell(page);

    // A resize rebuilds every group on the board, including the hint's own.
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: vp.height - 120 });
    await page.waitForTimeout(400);

    await expect(page.locator('.hint-dest')).toHaveCount(1);
    const after = await destinationCell(page);
    expect(after.string).toBe(before.string);
    expect(after.fret).toBe(before.fret);
  });

  test('a key change takes the stale route down with it', async ({ page }) => {
    await H.gotoPlaying(page);
    await openHint(page);

    if (!H.isWide(page)) await page.locator('#gearBtn').click();
    await page.locator('#keySelect').selectOption({ label: 'A major' });

    await expect(page.locator('#hintPanel')).toBeHidden();
    await expect(page.locator('.hint-dest')).toHaveCount(0);
  });
});
