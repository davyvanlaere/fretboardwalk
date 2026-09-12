const { test, expect } = require('@playwright/test');
const H = require('../helpers');

// The hint answers two questions, and they are checked separately here because
// the app answers them separately.
//
//   WHICH note — decided on what it costs the hand: 1 a fret, 1.1 a string.
//   HOW to say it — decided on how many moves it takes to explain, where the
//                   only moves are "slide along this string" and "cross one
//                   string, one step along 7 3 6 2 5 1 4".
//
// Everything below drives the real app and reads the route back off the board
// itself: each drawn leg is resolved to the cells its two ends sit on, so the
// arrows are checked against the same hit-targets the game scores against. A
// mirror of the algorithm would only prove the mirror.

const CYCLE = ['7', '3', '6', '2', '5', '1', '4'];

// How the panel counts strings and sequence steps, which are the same count.
const COUNT = ['', 'One', 'Two', 'Three', 'Four', 'Five'];

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

  // The direction of the crossing the previous leg made, 0 if it was a
  // slide — so a run told as two legs instead of one is caught.
  let prevCross = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i], text = said[i - 1];
    const dString = b.string - a.string, dFret = b.fret - a.fret;

    if (dString === 0) {
      // A slide: one string, and never a long one. Nothing in the router caps
      // it — the destination is settled on hand price first, so by the time a
      // slide is being described, a note further along this string has already
      // lost to a nearer one across it. That makes four frets an emergent
      // ceiling rather than a rule, which is exactly why it is worth pinning:
      // if pricing ever drifts, this is where it shows up.
      expect(Math.abs(dFret), `slide of ${Math.abs(dFret)} frets: "${text}"`).toBeLessThanOrEqual(4);
      expect(Math.abs(dFret)).toBeGreaterThan(0);
      expect(text, `a slide should not claim the sequence: "${text}"`).not.toMatch(/steps? along/);
    } else {
      // A crossing, or a run of them in the same direction told as one leg: n
      // strings is n places along the sequence, said as one number in both
      // halves of the sentence. Level unless the G-B pair falls inside the
      // span — which the step has to own.
      //
      // Because the sequence is a flat list cut at the 4|7 join, "n places
      // along" can only hold if the run stayed inside it: a route that walked
      // the join would have to leave the array to do it. So the tritone is
      // checked by the same arithmetic rather than beside it.
      const n = Math.abs(dString), dir = Math.sign(dString);
      const from = CYCLE.indexOf(a.degree), to = CYCLE.indexOf(b.degree);
      expect(from, `crossed off a ${a.degree}, which is not in the sequence`).toBeGreaterThanOrEqual(0);
      expect(to - from, `${a.degree} to ${b.degree} is not ${n} along the sequence`).toBe(dir * n);
      // Runs are told whole, so two crossings the same way never draw as two
      // legs — that is the thing the grouping exists to stop.
      expect(prevCross, 'consecutive crossings the same way should be one leg').not.toBe(dir);
      const overGB = Math.min(a.string, b.string) <= 3 && Math.max(a.string, b.string) >= 4;
      expect(dFret, 'a crossing is level unless the G-B pair shifts it').toBe(overGB ? dir : 0);
      if (overGB) expect(text, `crossing G-B should name the quirk: "${text}"`).toContain('G–B');
      else expect(text).toContain('same fret');
      expect(text, `${n} strings crossed: "${text}"`)
        .toContain(`${COUNT[n]} step${n > 1 ? 's' : ''} along`);
      prevCross = dir;
      continue;
    }
    prevCross = 0;
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
    expect(said[1]).toMatch(/One string thinner, same fret, from 7 to 3\./);
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
    expect(said[0]).toMatch(/One string thicker, same fret, from 3 to 7\./);
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
    // 1.1 because the pair is tuned a third — but it is still one step along
    // the sequence, so it stays one step to explain.
    await gotoRoute(page, { at: '3.12', find: '1' });
    await openHint(page);
    const { stops, said } = await expectSoundRoute(page);

    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/One string thinner, 1 fret up across the G–B pair, from 5 to 1\./);
    expect(stops).toEqual([
      { string: 3, fret: 12, degree: '5' },
      { string: 4, fret: 13, degree: '1' },
    ]);
    await expect(page.locator('#hintWarn')).toContainText('G→B');
  });

  // The classes on one step's sequence strip, in the order the strip draws
  // them — the picture's own account of which degrees it lit and how.
  const stripOf = (page, step) => page.locator('#hintSteps li').nth(step)
    .locator('.hint-cycle span').evaluateAll((els) =>
      els.map((s) => `${s.textContent}${s.classList.contains('from') ? ':from'
        : s.classList.contains('to') ? ':to' : s.classList.contains('via') ? ':via' : ''}`));

  test('two crossings the same way are one step, counted once', async ({ page }) => {
    // 4 on the D string, asked for a 2: step onto the 3, then 3 6 2 — two
    // places along the sequence and two strings across, which is one jump for
    // the hand and so one instruction. The 6 is counted through, not stopped
    // on, which is why the strip lights it but the neck draws no marker there.
    //
    // The odd pair sits inside the reach, and only one of its two crossings is
    // shifted, so the reach as a whole moves one fret — said once, the way the
    // hand does it, rather than once per string. Every two-string reach the
    // pricing ever actually picks has the G-B pair in it: a level one costs 22
    // and loses to a slide long before it is worth describing.
    await gotoRoute(page, { at: '2.3', find: '2' });
    await openHint(page);
    const { stops, said } = await expectSoundRoute(page);

    expect(said).toHaveLength(2);
    expect(said[0]).toMatch(/4 to 3 is a half step — go down 1 fret\./);
    expect(said[1]).toMatch(/Two strings thinner, 1 fret up across the G–B pair, from 3 to 2\. Two steps along/);
    expect(stops).toEqual([
      { string: 2, fret: 3, degree: '4' },
      { string: 2, fret: 2, degree: '3' },
      { string: 4, fret: 3, degree: '2' },
    ]);
    expect(await stripOf(page, 1)).toEqual(['7', '3:from', '6:via', '2:to', '5', '1', '4']);
    await expect(page.locator('#hintWarn')).toContainText('G→B');
  });

  // 7 to 4 is the tritone, so no crossing exists to make and the search puts a
  // slide in front of it unprompted. The panel says nothing about why: the
  // detour is described as the slide it is, in the same words as every other
  // slide. Naming the broken join here would be teaching the exception before
  // the rule.
  test('leaving a 7 towards a thicker string slides off it without comment', async ({ page }) => {
    await gotoRoute(page, { at: '3.4', find: '5' });
    await openHint(page);
    const { stops, said } = await expectSoundRoute(page);

    expect(said).toHaveLength(2);
    expect(said[0]).toMatch(/7 to 1 is a half step — go up 1 fret\./);
    expect(said[1]).toMatch(/One string thicker, same fret, from 1 to 5\./);
    expect(stops).toEqual([
      { string: 3, fret: 4, degree: '7' },
      { string: 3, fret: 5, degree: '1' },
      { string: 2, fret: 5, degree: '5' },
    ]);
    expect(said.join(' ')).not.toMatch(/join|tritone/i);
    await expect(page.locator('#hintWarn')).toBeHidden();
  });

  test('leaving a 4 towards a thinner string does the same, mirrored', async ({ page }) => {
    await gotoRoute(page, { at: '2.3', find: '6' });
    await openHint(page);
    const { stops, said } = await expectSoundRoute(page);

    expect(said).toHaveLength(2);
    expect(said[0]).toMatch(/4 to 3 is a half step — go down 1 fret\./);
    expect(said[1]).toMatch(/One string thinner, same fret, from 3 to 6\./);
    expect(stops).toEqual([
      { string: 2, fret: 3, degree: '4' },
      { string: 2, fret: 2, degree: '3' },
      { string: 3, fret: 2, degree: '6' },
    ]);
    expect(said.join(' ')).not.toMatch(/join|tritone/i);
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
          .not.toContain('One step along');
      }
      await page.locator('#hintCloseBtn').click();
      await H.tapDegree(page, await H.currentTarget(page), { onString: i % 6 });
    }
    // Roughly a third of degrees are lowered once they are enabled, so seeing
    // none would mean this never exercised the path it exists for.
    expect(fromLowered, 'expected some turns starting on a lowered degree').toBeGreaterThan(1);
  });

  test('each crossing shows the sequence, each slide shows the formula', async ({ page }) => {
    test.setTimeout(test.info().timeout * 2);
    // Lowered degrees on, because the formula row used to go missing for
    // exactly those: a ♭ has no cell in a row of seven naturals, so a slide on
    // or off one silently lost its picture — which is the one step where how
    // far to slide is the whole question.
    await H.seedStorage(page, {
      [H.STORAGE.onboarded]: '1',
      [H.STORAGE.nudge]: '1',
      [H.STORAGE.settings]: JSON.stringify({ includeFlats: true, noteDisplay: 'numerals' }),
    });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    // One picture per move, and the right one: the sequence for a crossing, the
    // major scale for a slide, and nothing else.
    let slides = 0, flatSlides = 0;
    for (let i = 0; i < 14; i++) {
      await openHint(page);
      const kinds = await page.locator('#hintSteps li').evaluateAll((els) => els.map((li) => ({
        crosses: /steps? along/.test(li.textContent),
        flat: /♭/.test(li.textContent),
        cycle: !!li.querySelector('.hint-cycle'),
        formula: !!li.querySelector('.hint-formula'),
      })));
      for (const k of kinds) {
        expect(k.cycle, 'the sequence strip belongs to crossings and only crossings')
          .toBe(k.crosses);
        expect(k.formula, 'every slide shows the formula, and no crossing does')
          .toBe(!k.crosses);
        if (!k.crosses) { slides++; if (k.flat) flatSlides++; }
      }
      await page.locator('#hintCloseBtn').click();
      await H.tapDegree(page, await H.currentTarget(page), { onString: i % 6 });
    }
    expect(slides, 'expected some slides').toBeGreaterThan(3);
    expect(flatSlides, 'expected some slides touching a lowered degree').toBeGreaterThan(0);
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
