const { test, expect } = require('@playwright/test');
const H = require('../helpers');

// The hint answers two questions, and they are checked separately here because
// the app answers them separately.
//
//   WHICH note — decided on what it costs the hand: 1 a fret, 1.1 a string.
//   HOW to say it — decided on how many moves it takes to explain, where the
//                   only moves are "slide along this string" and "cross one
//                   string, one place along 7 3 6 2 5 1 4".
//
// Everything below drives the real app and reads the route back off the board
// itself: each drawn leg is resolved to the cells its two ends sit on, so the
// arrows are checked against the same hit-targets the game scores against. A
// mirror of the algorithm would only prove the mirror.

const CYCLE = ['7', '3', '6', '2', '5', '1', '4'];

// Load the app already standing on a chosen note with a chosen question, so one
// particular route can be looked at rather than played for. Twenty-odd turns of
// waiting for the game to offer a ♭7 is how the old specs became slow and
// still missed the cases that mattered.
async function gotoRoute(page, { at, find, flats = false }) {
  await H.seedStorage(page, {
    [H.STORAGE.onboarded]: '1',
    [H.STORAGE.nudge]: '1',
    [H.STORAGE.settings]: JSON.stringify({ includeFlats: flats, noteDisplay: 'numerals' }),
  });
  await page.goto(`/?at=${at}&find=${find}`);
  await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);
}

const openHint = async (page) => {
  await page.locator('#hintAskBtn').click();
  await expect(page.locator('#hintPanel')).toBeVisible();
};

// The route as the BOARD draws it: both ends of every leg resolved to the cell
// underneath, in the order the legs were drawn. Taken from the rendered paths
// rather than from any state the app kept, so a picture that disagrees with the
// words is caught rather than papered over.
const drawnRoute = (page) => page.evaluate(() => {
  const cellAt = (pt) => {
    for (const c of document.querySelectorAll('.fret-cell')) {
      const b = c.getBoundingClientRect();
      if (pt.x >= b.left && pt.x <= b.right && pt.y >= b.top && pt.y <= b.bottom) {
        return { string: +c.dataset.string, fret: +c.dataset.fret, degree: c.dataset.degree || null };
      }
    }
    return null;
  };
  // SVG user units are not viewport coordinates; the cells are measured in
  // viewport coordinates. getScreenCTM is the only honest bridge between them.
  const screenPoint = (path, len) => {
    const p = path.getPointAtLength(len), m = path.getScreenCTM();
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  };
  const legs = [...document.querySelectorAll('.hint-leg')];
  if (!legs.length) return null;
  const stops = [cellAt(screenPoint(legs[0], 0))];
  for (const leg of legs) stops.push(cellAt(screenPoint(leg, leg.getTotalLength())));
  return stops;
});

// The prose only. Each step carries its own diagram, and the SVG labels and the
// strip cells are text nodes too, so a plain textContent splices "7362514"
// straight onto the sentence and any number pulled out of it is fiction.
const stepTexts = (page) => page.locator('#hintSteps li').evaluateAll((els) =>
  els.map((li) => {
    const clone = li.cloneNode(true);
    clone.querySelectorAll('svg, .hint-cycle, .hint-formula').forEach((n) => n.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }));

// What the cheapest note of this degree costs the hand from where you stand,
// in the app's own tenths — a fret 10, a string 11.
const cheapestPrice = (page, degree, from) => page.evaluate(({ d, s, f }) => {
  let min = Infinity;
  for (const c of document.querySelectorAll('.fret-cell')) {
    if (c.dataset.degree !== d) continue;
    min = Math.min(min, 10 * Math.abs(+c.dataset.fret - f) + 11 * Math.abs(+c.dataset.string - s));
  }
  return min;
}, { d: degree, s: from.string, f: from.fret });

// Every rule the route promises to keep, checked against one open hint. Called
// from the sweeps rather than written out per turn, so the sweeps stay about
// which positions get covered.
async function expectSoundRoute(page) {
  const target = await H.currentTarget(page);
  const stops = await drawnRoute(page);
  const said = await stepTexts(page);

  expect(stops, 'the route should draw at least one leg').not.toBeNull();
  for (const st of stops) expect(st, 'every leg end should sit on a board cell').not.toBeNull();
  // One drawn leg per numbered step, so "step 2" in the panel and the "2" on
  // the neck are always the same instruction.
  expect(stops.length - 1, `${said.length} steps but ${stops.length - 1} legs`).toBe(said.length);
  for (const s of said) expect(s, 'step text').not.toContain('undefined');

  const dest = stops[stops.length - 1];
  expect(dest.degree, `hint pointed at ${dest.degree}, asked for ${target}`).toBe(target);

  const price = 10 * Math.abs(dest.fret - stops[0].fret) + 11 * Math.abs(dest.string - stops[0].string);
  expect(price, 'the destination should be a cheapest one for the hand')
    .toBe(await cheapestPrice(page, target, stops[0]));

  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i], text = said[i - 1];
    const dString = b.string - a.string, dFret = b.fret - a.fret;

    if (dString === 0) {
      // A slide: one string, inside a hand's reach — three frets of travel is
      // the four-fret box, one finger per fret.
      expect(Math.abs(dFret), `slide of ${Math.abs(dFret)} frets: "${text}"`).toBeLessThanOrEqual(3);
      expect(Math.abs(dFret)).toBeGreaterThan(0);
      expect(text, `a slide should not claim the sequence: "${text}"`).not.toContain('one place along');
    } else {
      // A crossing: exactly one string, exactly one place along the sequence,
      // and level unless the G-B pair forced it across — which it must own.
      expect(Math.abs(dString), `crossed ${Math.abs(dString)} strings at once: "${text}"`).toBe(1);
      const from = CYCLE.indexOf(a.degree), to = CYCLE.indexOf(b.degree);
      expect(from, `crossed off a ${a.degree}, which is not in the sequence`).toBeGreaterThanOrEqual(0);
      expect(to - from, `${a.degree} to ${b.degree} is not one place along the sequence`)
        .toBe(dString > 0 ? 1 : -1);
      // The 4|7 join is a tritone, so it is the one crossing that never happens.
      expect([a.degree, b.degree].join('')).not.toBe(dString > 0 ? '47' : '74');
      const overGB = Math.min(a.string, b.string) === 3;
      expect(dFret, 'a crossing is level unless the G-B pair shifts it')
        .toBe(overGB ? dString : 0);
      if (overGB) expect(text, `crossing G-B should name the quirk: "${text}"`).toContain('G–B');
      else expect(text).toContain('same fret');
      expect(text).toContain('one place along');
    }
  }
  return { stops, said };
}

test.describe('the "how do I find it" hint', () => {

  // ---- the worked examples ----
  // Each of these pins a position and a question, so the assertion is on the
  // exact advice rather than on whatever the game happened to ask for.

  test('a lowered degree steps onto the degree it is named after, then crosses', async ({ page }) => {
    // ♭7 on the D string, asked for a 3. Both the 3 a string thinner and the 3
    // a string thicker cost the hand 2.1, and both take two moves — so what
    // decides is that a ♭7 is a flattened 7. Going by way of the 6 would be
    // just as true and would teach nothing.
    await gotoRoute(page, { at: '2.8', find: '3', flats: true });
    await openHint(page);
    const { stops, said } = await expectSoundRoute(page);

    expect(said).toHaveLength(2);
    expect(said[0]).toMatch(/♭7 is the 7 flattened, so the 7 is 1 fret up/);
    expect(said[1]).toMatch(/One string thinner, same fret: 7 to 3/);
    expect(stops).toEqual([
      { string: 2, fret: 8, degree: 'b7' },
      { string: 2, fret: 9, degree: '7' },
      { string: 3, fret: 9, degree: '3' },
    ]);
  });

  test('crossing to a lowered degree lands on its natural first', async ({ page }) => {
    // The same fact read backwards: a 3 asked for a ♭7. The sequence carries
    // you to the 7, and the ♭ is one fret off it.
    await gotoRoute(page, { at: '2.2', find: 'b7', flats: true });
    await openHint(page);
    const { stops, said } = await expectSoundRoute(page);

    expect(said).toHaveLength(2);
    expect(said[0]).toMatch(/One string thicker, same fret: 3 to 7/);
    expect(said[1]).toMatch(/♭7 is this 7 flattened — 1 fret down/);
    expect(stops).toEqual([
      { string: 2, fret: 2, degree: '3' },
      { string: 1, fret: 2, degree: '7' },
      { string: 1, fret: 1, degree: 'b7' },
    ]);
  });

  test('a note two frets away is a slide, not a trip round the sequence', async ({ page }) => {
    // A 5 asked for a 4. The sequence could get there, but two frets down the
    // string is one move and costs the hand less than crossing anywhere.
    await gotoRoute(page, { at: '2.5', find: '4' });
    await openHint(page);
    const { stops, said } = await expectSoundRoute(page);

    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/5 to 4 is a whole step — go down 2 frets/);
    expect(stops).toEqual([
      { string: 2, fret: 5, degree: '5' },
      { string: 2, fret: 3, degree: '4' },
    ]);
  });

  test('the G-B pair is one move, with the quirk named', async ({ page }) => {
    // 5 on the G string to 1 on the B string. It costs the hand 2.1 rather than
    // 1.1 because the pair is tuned a third — but it is still one place along
    // the sequence, so it stays one step to explain.
    await gotoRoute(page, { at: '3.12', find: '1' });
    await openHint(page);
    const { stops, said } = await expectSoundRoute(page);

    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/One string thinner, 1 fret up across the G–B pair: 5 to 1/);
    expect(stops).toEqual([
      { string: 3, fret: 12, degree: '5' },
      { string: 4, fret: 13, degree: '1' },
    ]);
    await expect(page.locator('#hintWarn')).toContainText('G→B');
  });

  test('leaving a 7 towards a thicker string steps off the sequence first', async ({ page }) => {
    // 7 to 4 is the tritone, so there is no crossing to make. The advice is to
    // step onto the 1 or the 6 and cross from there — and both are offered,
    // because next time round the other one will be the near one.
    await gotoRoute(page, { at: '3.4', find: '5' });
    await openHint(page);
    const { stops, said } = await expectSoundRoute(page);

    expect(said).toHaveLength(2);
    expect(said[0]).toMatch(/The 7–4 join is the one the sequence can't make/);
    expect(said[0]).toMatch(/step off the 7 first: the 1 is 1 fret up \(the 6 would do too\)/);
    expect(said[1]).toMatch(/One string thicker, same fret: 1 to 5/);
    expect(stops).toEqual([
      { string: 3, fret: 4, degree: '7' },
      { string: 3, fret: 5, degree: '1' },
      { string: 2, fret: 5, degree: '5' },
    ]);
    await expect(page.locator('.hint-branch')).toHaveCount(1);
    await expect(page.locator('#hintWarn')).toContainText('tritone');
  });

  test('leaving a 4 towards a thinner string does the same, mirrored', async ({ page }) => {
    await gotoRoute(page, { at: '2.3', find: '6' });
    await openHint(page);
    const { stops, said } = await expectSoundRoute(page);

    expect(said).toHaveLength(2);
    expect(said[0]).toMatch(/The 4–7 join is the one the sequence can't make/);
    expect(said[0]).toMatch(/step off the 4 first: the 3 is 1 fret down \(the 5 would do too\)/);
    expect(said[1]).toMatch(/One string thinner, same fret: 3 to 6/);
    expect(stops).toEqual([
      { string: 2, fret: 3, degree: '4' },
      { string: 2, fret: 2, degree: '3' },
      { string: 3, fret: 2, degree: '6' },
    ]);
    await expect(page.locator('.hint-branch')).toHaveCount(1);
  });

  // The fork is the only figure that has to agree with the neck's geometry:
  // fret numbers grow downward, so its top branch must be the LOWER fret.
  // Getting this backwards is invisible unless the two are compared.
  test('the fork is stacked the same way up as the neck', async ({ page }) => {
    await gotoRoute(page, { at: '3.4', find: '5' });
    await openHint(page);

    // Boxes are emitted solo, top, bottom.
    const labels = await page.locator('.hint-branch text').allTextContents();
    expect(labels[0], 'the solo box is the degree you are leaving').toBe('7');
    const degAt = (fret) => page.evaluate((f) => document.querySelector(
      `.fret-cell[data-string="3"][data-fret="${f}"]`)?.dataset.degree || null, fret);
    expect(labels[1], 'top branch should be the lower fret').toBe(await degAt(2));
    expect(labels[2], 'bottom branch should be the higher fret').toBe(await degAt(5));
  });

  // The handle every example above leans on, checked in its own right. Naming a
  // degree rather than a square has to land on that degree somewhere the route
  // isn't boxed in, and anything unrecognised has to be ignored rather than
  // guessed at — a silently mistaken start would make every example above a
  // test of the wrong position.
  test('?at= takes a square or a degree, and ignores nonsense', async ({ page }) => {
    for (const deg of ['2', '4', '7']) {
      await gotoRoute(page, { at: deg, find: '1' });
      await openHint(page);
      const start = (await drawnRoute(page))[0];
      expect(start.degree, `?at=${deg} should stand on a ${deg}`).toBe(deg);
      // Middle of the neck, so there is somewhere to go in every direction.
      expect(start.string, `?at=${deg} landed on an outer string`).toBeGreaterThan(0);
      expect(start.string).toBeLessThan(5);
      expect(start.fret, `?at=${deg} landed at fret ${start.fret}`).toBeGreaterThan(3);
      expect(start.fret).toBeLessThan(12);
    }
    // Unrecognised, so the game opens where it normally would: on the root.
    await gotoRoute(page, { at: 'nonsense', find: '6' });
    await expect(page.locator('#curNum')).toHaveText('1');
  });

  // ---- the rules, over whatever the game deals ----

  test('offers itself by naming the degree being asked for', async ({ page }) => {
    await H.gotoPlaying(page);
    const target = await H.currentTarget(page);
    await expect(page.locator('#hintAskDeg')).toHaveText(target.replace('b', '♭'));
    await expect(page.locator('#hintAskBtn')).toContainText('How do I find');
  });

  test('every route it draws obeys the two moves it is made of', async ({ page }) => {
    test.setTimeout(test.info().timeout * 2);
    await H.gotoPlaying(page);

    // Walked around the neck deliberately rather than left to chance: the
    // routes that break are the ones near the two seams and the two ends, and
    // playing at random parks you on the inner strings.
    for (let i = 0; i < 14; i++) {
      await openHint(page);
      await expectSoundRoute(page);
      await page.locator('#hintCloseBtn').click();
      await H.tapDegree(page, await H.currentTarget(page), { onString: i % 6 });
    }
  });

  test('the same rules hold with lowered degrees switched on', async ({ page }) => {
    test.setTimeout(test.info().timeout * 2);
    await H.seedStorage(page, {
      [H.STORAGE.onboarded]: '1',
      [H.STORAGE.nudge]: '1',
      [H.STORAGE.settings]: JSON.stringify({ includeFlats: true, noteDisplay: 'numerals' }),
    });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    // A lowered degree has no place in the sequence, so the one thing that must
    // never happen is a route claiming it took a step along it from a ♭.
    let fromLowered = 0;
    for (let i = 0; i < 14; i++) {
      const cur = (await page.locator('#curNum').textContent()).replace('♭', 'b');
      await openHint(page);
      const { said } = await expectSoundRoute(page);
      const warn = await page.locator('#hintWarn').isVisible()
        ? await page.locator('#hintWarn').textContent() : '';
      expect(warn, 'warning text').not.toContain('undefined');
      if (cur.startsWith('b')) {
        fromLowered++;
        expect(said[0], `claimed a sequence step straight off a ${cur}`)
          .not.toContain('one place along');
      }
      await page.locator('#hintCloseBtn').click();
      await H.tapDegree(page, await H.currentTarget(page), { onString: i % 6 });
    }
    // Roughly a third of degrees are lowered once they are enabled, so seeing
    // none would mean this never exercised the path it exists for.
    expect(fromLowered, 'expected some turns starting on a lowered degree').toBeGreaterThan(1);
  });

  test('each crossing shows the sequence, each slide shows the formula', async ({ page }) => {
    await H.gotoPlaying(page);

    // One picture per move, and the right one: the sequence for a crossing, the
    // major scale for a slide, the fork for the join that has neither.
    for (let i = 0; i < 8; i++) {
      await openHint(page);
      const kinds = await page.locator('#hintSteps li').evaluateAll((els) => els.map((li) => ({
        crosses: /one place along/.test(li.textContent),
        cycle: !!li.querySelector('.hint-cycle'),
        formula: !!li.querySelector('.hint-formula'),
        fork: !!li.querySelector('.hint-branch'),
      })));
      for (const k of kinds) {
        expect(k.cycle, 'the sequence strip belongs to crossings and only crossings')
          .toBe(k.crosses);
        expect(k.formula && k.crosses, 'a crossing never shows the scale formula').toBe(false);
        expect(k.fork && k.crosses, 'a crossing never shows the fork').toBe(false);
      }
      await page.locator('#hintCloseBtn').click();
      await H.tapDegree(page, await H.currentTarget(page), { onString: i % 6 });
    }
  });

  // ---- the panel as a thing on screen ----

  // The route is drawn into groups that sit ABOVE the hit cells, so anything
  // with a fill in it can swallow the tap the hint just told you to make.
  // Rings are fill:none and let clicks through, which is why this went
  // unnoticed — but Dots and Hidden mode add an opaque labelled disc right on
  // the target.
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
      const stops = await drawnRoute(page);
      const dest = stops[stops.length - 1];

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

  test('asking for the route ends the streak, and says so first', async ({ page }) => {
    await H.gotoPlaying(page);

    // Nothing to lose yet, so no warning and no cost.
    await expect(page.locator('#hintCost')).toBeHidden();
    await H.playCorrect(page, 3);
    expect(await H.streak(page)).toBe('3');
    await expect(page.locator('#hintCost')).toBeVisible();

    await openHint(page);
    expect(await H.streak(page), 'the run ends when you take the help').toBe('0');
    await expect(page.locator('#hintCost')).toBeHidden();

    // The board still works — it costs the streak, not the turn.
    await page.locator('#hintCloseBtn').click();
    await H.playCorrect(page, 1);
    expect(await H.streak(page)).toBe('1');
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
    await gotoRoute(page, { at: '2.8', find: '3', flats: true });
    await openHint(page);
    const before = await drawnRoute(page);

    // A resize rebuilds every group on the board, including the hint's own.
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: vp.height - 120 });
    await page.waitForTimeout(400);

    await expect(page.locator('.hint-dest')).toHaveCount(1);
    expect(await drawnRoute(page)).toEqual(before);
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
