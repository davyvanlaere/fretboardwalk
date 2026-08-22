const { test, expect } = require('@playwright/test');
const H = require('../helpers');

// The first-visit tour is gated behind a localStorage flag, which means it is
// never seen again once dismissed — so nobody re-tests it by hand. That is
// exactly why it's worth pinning down here.

const tour     = '#tour';
const stepText = '#tourStep';
const body     = '#tourBody';

// Steps 5 to 8 are the taught ones: the scale's own spacing along one string,
// then 7 3 6 2 5 1 4 across them, then which of the two a given pair of numbers
// calls for, then what any of it is good for. Everything that only wants to
// reach the end goes through playTeachingSteps.
const STEP = { run: 5, column: 6, rule: 7, why: 8 };

// Each of those steps smooth-scrolls its subject clear of the card as it opens,
// so nothing on the board can be measured until that has landed.
const nextStep = async (page, n) => {
  await page.locator('#tourNext').click();
  await expect.poll(() => stepNumber(page)).toBe(n);
  await H.settle(page);
};

// Walks the three teaching steps and lands on the closing one.
const playTeachingSteps = async (page) => {
  await H.settle(page);   // the tap that arrived here re-centred the neck
  await nextStep(page, STEP.column);
  await nextStep(page, STEP.rule);
  await nextStep(page, STEP.why);
  await nextStep(page, STEP.why + 1);
};

// Which cells the current step has marked, and what is at them. Note that the
// note you're standing on CANNOT be read off the board: every instance of the
// current degree renders identically, on purpose. So the departure point is
// derived from the marks and cross-checked against the plaque instead.
const marked = (page, sel) =>
  page.evaluate((s) => {
    const at = (x, y) => {
      for (const c of document.querySelectorAll('.fret-cell')) {
        const q = c.getBoundingClientRect();
        if (x >= q.left && x <= q.right && y >= q.top && y <= q.bottom)
          return { s: +c.dataset.string, f: +c.dataset.fret, deg: c.dataset.degree };
      }
      return null;
    };
    const card = document.getElementById('tourCard').getBoundingClientRect();
    return [...document.querySelectorAll(s)].map((r) => {
      const q = r.getBoundingClientRect();
      return {
        cell: at(q.left + q.width / 2, q.top + q.height / 2),
        hidden: !(q.bottom < card.top || q.top > card.bottom
               || q.right < card.left || q.left > card.right),
      };
    });
  }, sel);

const degreeAt = (page, s, f) =>
  page.evaluate(({ s, f }) => {
    const c = document.querySelector(`.fret-cell[data-string="${s}"][data-fret="${f}"]`);
    return c ? c.dataset.degree : null;
  }, { s, f });

const stepNumber = (page) =>
  page.locator(stepText).textContent().then((t) => parseInt(t.match(/Step (\d+)/)[1], 10));

const totalSteps = (page) =>
  page.locator(stepText).textContent().then((t) => parseInt(t.match(/of (\d+)/)[1], 10));

test.describe('first-visit tour', () => {
  test('a cold visitor lands on step 1 with the board visible behind it', async ({ page }) => {
    await H.gotoTour(page);

    await expect(page.locator(tour)).toHaveClass(/open/);
    expect(await stepNumber(page)).toBe(1);
    // The whole point of the redesign: the app is not hidden behind the dialog.
    await expect(page.locator('#board')).toBeVisible();
    expect(await H.holeFrames(page, '.fretboard-wrap')).toBe(true);
  });

  test('read-only steps swallow board taps', async ({ page }) => {
    await H.gotoTour(page);

    const cell = await H.findCell(page, '5', { safeBottom: 260 });
    await page.mouse.click(cell.x, cell.y);
    await page.waitForTimeout(400);   // give it every chance to react, then assert it didn't

    expect(await H.streak(page)).toBe('0');
    expect(await stepNumber(page)).toBe(1);
  });

  test('the header and settings stay inert for the whole tour', async ({ page }) => {
    await H.gotoTour(page);

    await page.locator('#helpBtn').click({ force: true });
    await expect(page.locator('#howto')).not.toHaveClass(/open/);

    if (H.isWide(page)) {
      // The rail is permanently on screen at this width, so the thing to guard
      // is a setting being poked mid-tour — which would change the board out
      // from under the copy describing it.
      await page.locator('#noteVisibilitySeg .seg-btn', { hasText: 'Hidden' }).click({ force: true });
      await expect(page.locator('#noteVisibilitySeg .seg-btn.active')).toHaveText('Numerals');
    } else {
      // The gear is the only way in on narrow screens, and it's hidden entirely
      // on wide ones.
      await page.locator('#gearBtn').click({ force: true });
      await expect(page.locator('#settingsDrawer')).not.toHaveClass(/open/);
    }

    expect(await stepNumber(page)).toBe(1);
  });

  test('the spotlight follows each step to its own target', async ({ page }) => {
    await H.gotoTour(page);

    // 2: the note you're standing on.
    await page.locator('#tourNext').click();
    await expect.poll(() => stepNumber(page)).toBe(2);
    await H.waitForSpotlight(page);
    // Every note of the current degree renders identically, so the assertion is
    // that the spotlight is on one of them — and that it shrank to note size
    // rather than still framing the whole neck.
    expect(await H.holeFramesAny(page, '.note-visible[stroke="#8af0ff"]')).toBe(true);
    expect((await H.holeRect(page)).width).toBeLessThan(120);

    // 3: the Find plaque.
    await page.locator('#tourNext').click();
    await expect.poll(() => stepNumber(page)).toBe(3);
    await H.waitForSpotlight(page);
    expect(await H.holeFrames(page, '.plaque.target')).toBe(true);
  });

  test('the hands-on step rings every valid answer and waits for a real tap', async ({ page }) => {
    await H.gotoTour(page);
    for (let i = 0; i < 3; i++) await page.locator('#tourNext').click();
    await expect.poll(() => stepNumber(page)).toBe(4);

    await expect(page.locator(tour)).toHaveClass(/await-tap/);
    await expect(page.locator('#tourNext')).toBeHidden();

    // One ring per 5 on the neck — not a hardcoded number, since it depends on
    // the key and fret count.
    const expected = await page.evaluate(() =>
      [...document.querySelectorAll('.fret-cell')].filter((c) => c.dataset.degree === '5').length);
    expect(expected).toBeGreaterThan(4);
    await expect(page.locator('.tour-hint')).toHaveCount(expected);
  });

  test('a wrong tap names what you actually hit and holds the step', async ({ page }) => {
    await H.gotoTour(page);
    for (let i = 0; i < 3; i++) await page.locator('#tourNext').click();
    await expect.poll(() => stepNumber(page)).toBe(4);

    const wrong = await page.evaluate(() => {
      // Measured against the card rather than a fixed margin: its height moves
      // with the step's copy, and a tap that lands on it never reaches the board.
      const card = document.getElementById('tourCard').getBoundingClientRect();
      for (const c of document.querySelectorAll('.fret-cell')) {
        const r = c.getBoundingClientRect();
        if (!c.dataset.degree || c.dataset.degree === '5' || c.dataset.degree === '1') continue;
        if (r.width > 5 && r.top > 120 && r.bottom < card.top - 4)
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, deg: c.dataset.degree };
      }
      return null;
    });
    expect(wrong, 'needed a non-5 cell in the safe area').not.toBeNull();

    await page.mouse.click(wrong.x, wrong.y);
    await expect(page.locator(body)).toContainText(`That's a ${wrong.deg}`);
    expect(await stepNumber(page)).toBe(4);
    await expect(page.locator(tour)).toHaveClass(/await-tap/);
  });

  test('a correct tap advances, and scores like any other correct answer', async ({ page }) => {
    await H.gotoTour(page);
    for (let i = 0; i < 3; i++) await page.locator('#tourNext').click();
    await expect.poll(() => stepNumber(page)).toBe(4);

    const cell = await H.findCell(page, '5', { safeBottom: 260 });
    await page.mouse.click(cell.x, cell.y);

    await expect.poll(() => stepNumber(page), { timeout: 5000 }).toBe(STEP.run);
    expect(await H.streak(page)).toBe('1');
    // One ring per 5 gave way to the two the scale-run step draws for itself:
    // proof the hands-on rings were cleared, not merely added to.
    await expect(page.locator('.tour-hint')).toHaveCount(2);
  });

  test('the scale step shows a whole step and a half step side by side', async ({ page }) => {
    // The other half of the technique: how far to slide once you're on the
    // right string. The point only lands if the two gaps on the board really
    // are two frets and then one, so that is what is asserted — not the copy.
    await H.gotoTour(page);
    for (let i = 0; i < 3; i++) await page.locator('#tourNext').click();
    const cell = await H.findCell(page, '5', { safeBottom: 260 });
    await page.mouse.click(cell.x, cell.y);
    await expect.poll(() => stepNumber(page), { timeout: 5000 }).toBe(STEP.run);


    const rings = await marked(page, '#board .tour-hint');
    expect(rings).toHaveLength(2);
    const [mid, last] = rings.map((r) => r.cell);

    // All three on one string, and the gaps are the whole point: two frets to
    // the middle note, one more to the last.
    expect(last.s).toBe(mid.s);
    expect(last.f - mid.f).toBe(1);
    const fromDeg = await degreeAt(page, mid.s, mid.f - 2);

    // And that half step is one of the scale's only two.
    const walk = [fromDeg, mid.deg, last.deg];
    expect([['2', '3', '4'], ['6', '7', '1']]).toContainEqual(walk);

    // Standing on the first, asked for the last: the run answers the question
    // on the plaques rather than sitting beside an unrelated one.
    await expect(page.locator('#curNum')).toHaveText(walk[0]);
    await expect(page.locator('#tgtNum')).toHaveText(walk[2]);

    // The formula is on the card too, in the same drawing the hints will use.
    await expect(page.locator('.tour-body .hint-formula')).toHaveCount(1);
    await expect(page.locator('.tour-body .hint-formula .gap.lit')).toHaveCount(2);

    expect(rings.filter((r) => r.hidden), 'both rings must clear the card').toHaveLength(0);
  });

  test('the sequence step reads four places of the cycle straight off the neck', async ({ page }) => {
    // The technique the whole app rests on. It is shown on the real board in
    // the real key at whichever fret sits nicest on the neck, so the assertion
    // is that the four ringed positions really are four consecutive places in
    // 7 3 6 2 5 1 4 — if the fret picker ever drifts, this is a step that
    // confidently teaches the wrong thing.
    await H.gotoTour(page);
    for (let i = 0; i < 3; i++) await page.locator('#tourNext').click();
    const cell = await H.findCell(page, '5', { safeBottom: 260 });
    await page.mouse.click(cell.x, cell.y);
    await expect.poll(() => stepNumber(page), { timeout: 5000 }).toBe(STEP.run);

    await nextStep(page, STEP.column);

    const rings = await marked(page, '#board .tour-hint');
    expect(rings).toHaveLength(5);
    const cells = rings.map((r) => r.cell);

    // A ring on every string above the one the run sets off from.
    expect(cells.map((c) => c.s)).toEqual([1, 2, 3, 4, 5]);

    // The lesson: E-A-D-G are all a fourth apart so they sit level, and G-B is
    // a third, so the run steps up a fret there and stays up. Asserted rather
    // than assumed — a demo that drew this level would be teaching a rule the
    // neck doesn't keep.
    const fret = cells[0].f;
    expect(cells.map((c) => c.f - fret)).toEqual([0, 0, 0, 1, 1]);
    const fromDeg = await degreeAt(page, 0, fret);

    // Six consecutive places in the cycle, and never a run that would set off
    // from the 4 — that join is a tritone, not a fourth, and leaves the key.
    const CYCLE = ['7', '3', '6', '2', '5', '1', '4'];
    const run = [fromDeg, ...cells.map((c) => c.deg)];
    const i = CYCLE.indexOf(run[0]);
    expect(i, `${run[0]} is not in the cycle`).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThanOrEqual(1);
    expect(run).toEqual(CYCLE.slice(i, i + 6));

    // The degree one string over is what it asks for — crossing is the move
    // being taught, and the rest of the run is there to show it continues.
    await expect(page.locator('#curNum')).toHaveText(run[0]);
    await expect(page.locator('#tgtNum')).toHaveText(run[1]);

    // Somewhere the neck can actually put it: a demonstration that cannot be
    // scrolled out from under the card is not a demonstration.
    expect(rings.filter((r) => r.hidden), 'every ring must clear the card').toHaveLength(0);
  });

  test('the closing rule names both moves and what each one was for', async ({ page }) => {
    // The step that replaced a hands-on drill on the sequence's broken join.
    // What matters is that it states the choice and grounds it in the two
    // demonstrations just given, rather than in an example pulled from the air.
    await H.gotoTour(page);
    for (let i = 0; i < 3; i++) await page.locator('#tourNext').click();
    const cell = await H.findCell(page, '5', { safeBottom: 260 });
    await page.mouse.click(cell.x, cell.y);
    await expect.poll(() => stepNumber(page), { timeout: 5000 }).toBe(STEP.run);

    const run = (await marked(page, '#board .tour-hint')).map((r) => r.cell);
    const slideTo = run[1].deg;
    await nextStep(page, STEP.column);
    const crossTo = (await marked(page, '#board .tour-hint'))[0].cell.deg;
    await nextStep(page, STEP.rule);

    // Both branches, each carrying the degree the player just watched it reach.
    await expect(page.locator(body)).toContainText(`to ${slideTo}`);
    await expect(page.locator(body)).toContainText(`reached the ${crossTo}`);
    await expect(page.locator(body)).toContainText('Across, then along');
    // No board demo here: the decision is read off the plaques, so that is
    // what the spotlight has to be on.
    await H.waitForSpotlight(page);
    for (const sel of ['.plaque.current', '.plaque.target']) {
      expect(await H.holeCovers(page, sel), sel).toBe(true);
    }
    await expect(page.locator('#board .tour-hint')).toHaveCount(0);
  });

  test('the payoff step ties the numbers to the chords they already play', async ({ page }) => {
    // Four steps of method owe an answer to "and then what". Chords are it,
    // because they are the thing a beginner is already learning — and the page
    // that picks the thread up has to be one tap away, in a new tab, so
    // following it can't abandon the tour and leave the flag unset.
    await H.gotoTour(page);
    for (let i = 0; i < 3; i++) await page.locator('#tourNext').click();
    const cell = await H.findCell(page, '5', { safeBottom: 260 });
    await page.mouse.click(cell.x, cell.y);
    await expect.poll(() => stepNumber(page), { timeout: 5000 }).toBe(STEP.run);

    await nextStep(page, STEP.column);
    await nextStep(page, STEP.rule);
    await nextStep(page, STEP.why);

    await expect(page.locator(body)).toContainText('the 1, the 3 and the 5');
    const link = page.locator('.tour-body a[href="/chords-from-degrees"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
    // It is still not the last word: the difficulty dial comes after it.
    expect(await stepNumber(page)).toBeLessThan(await totalSteps(page));
  });

  // All three board steps pick their own spot on the neck from the loaded key,
  // so C major proves almost nothing about the other eleven. A handful of keys
  // that stress different parts of the search: C is the one whose only workable
  // column is the open strings, F puts its 7 on the open low E, and G and E sit
  // either side of the middle of the neck.
  for (const [keyIndex, name] of [[0, 'C'], [1, 'G'], [4, 'E'], [11, 'F']]) {
    test(`the board steps hold up in ${name} major`, async ({ page }) => {
      await H.seedStorage(page, { [H.STORAGE.settings]: JSON.stringify({ keyIndex }) });
      await page.goto('/');
      await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);
      await expect(page.locator('#keySelect')).toHaveValue(String(keyIndex));
      await page.locator('#gateYes').click();
      await H.waitForSpotlight(page);

      for (let i = 0; i < 3; i++) await page.locator('#tourNext').click();
      const cell = await H.findCell(page, '5', { safeBottom: 260 });
      await page.mouse.click(cell.x, cell.y);
      await expect.poll(() => stepNumber(page), { timeout: 5000 }).toBe(STEP.run);

      // A whole step then a half, on one string.
      const run = await marked(page, '#board .tour-hint');
      const rc = run.map((r) => r.cell);
      expect(rc[1].f - rc[0].f).toBe(1);
      expect(rc[0].s).toBe(rc[1].s);
      const runWalk = [await degreeAt(page, rc[0].s, rc[0].f - 2), rc[0].deg, rc[1].deg];
      expect([['2', '3', '4'], ['6', '7', '1']]).toContainEqual(runWalk);

      // Level across E-A-D-G, up a fret from the B string on.
      await nextStep(page, STEP.column);
      const col = await marked(page, '#board .tour-hint');
      const cc = col.map((r) => r.cell);
      expect(cc.map((c) => c.s)).toEqual([1, 2, 3, 4, 5]);
      expect(cc.map((c) => c.f - cc[0].f)).toEqual([0, 0, 0, 1, 1]);

      // And what it asks for is the one a single crossing reaches.
      await expect(page.locator('#curNum')).toHaveText(await degreeAt(page, 0, cc[0].f));
      await expect(page.locator('#tgtNum')).toHaveText(cc[0].deg);

      // Nothing either step drew ended up behind the card.
      for (const r of [...run, ...col]) expect(r.hidden).toBe(false);

      // Both demos are named in the closing rule, so both had to find one.
      await nextStep(page, STEP.rule);
      await expect(page.locator(body)).toContainText(`${runWalk[0]} to ${runWalk[2]}`);
      await expect(page.locator(body)).toContainText(`reached the ${cc[0].deg}`);
    });
  }

  test('the final step reveals the display setting and points at the guide', async ({ page }) => {
    await H.gotoTour(page);
    for (let i = 0; i < 3; i++) await page.locator('#tourNext').click();
    const cell = await H.findCell(page, '5', { safeBottom: 260 });
    await page.mouse.click(cell.x, cell.y);
    await expect.poll(() => stepNumber(page), { timeout: 5000 }).toBe(STEP.run);

    await playTeachingSteps(page);
    const last = await totalSteps(page);
    expect(await stepNumber(page)).toBe(last);

    // The control it describes has to actually be on screen — on phones that
    // means the collapsed drawer must have been opened for it.
    await expect(page.locator('#settingsDrawer')).toHaveClass(/open/);
    await expect(page.locator('#noteVisibilitySeg')).toBeVisible();
    await H.waitForSpotlight(page);
    expect(await H.holeFrames(page, '#noteVisibilitySeg')).toBe(true);

    await expect(page.locator(body)).toContainText('Dots only');
    await expect(page.locator(body)).toContainText('Hidden');

    // Two ways out for someone still lost: memorisation tips, and — since six
    // steps of pointing at numbers never actually define the term — a plain
    // explanation of what a scale degree is.
    await expect(page.locator('.tour-body a[href="/help"]')).toBeVisible();
    await expect(page.locator('.tour-body a[href="/scale-degrees"]')).toBeVisible();
    await expect(page.locator(body)).toContainText('what a scale degree actually is');
    // Both open in a new tab so reading one can't abandon the tour halfway and
    // leave the onboarded flag unset.
    for (const href of ['/help', '/scale-degrees']) {
      await expect(page.locator(`.tour-body a[href="${href}"]`)).toHaveAttribute('target', '_blank');
    }
    await expect(page.locator('#tourSkip')).toBeHidden();
    await expect(page.locator('#tourNext')).toHaveText('Start playing');
  });

  test('finishing hands the app back and is remembered', async ({ page }) => {
    await H.gotoTour(page);
    const last = await totalSteps(page);

    for (let i = 0; i < 3; i++) await page.locator('#tourNext').click();
    const cell = await H.findCell(page, '5', { safeBottom: 260 });
    await page.mouse.click(cell.x, cell.y);
    await expect.poll(() => stepNumber(page), { timeout: 5000 }).toBe(STEP.run);
    await playTeachingSteps(page);
    expect(await stepNumber(page)).toBe(last);
    await page.locator('#tourNext').click();

    await expect(page.locator(tour)).not.toHaveClass(/open/);
    await expect(page.locator('body')).not.toHaveClass(/tour-open/);
    await expect(page.locator('.tour-hint')).toHaveCount(0);
    expect(await H.readStorage(page, H.STORAGE.onboarded)).toBe('1');

    // The last step opened the drawer to point inside it; on phones that space
    // belongs to the board again afterwards, on desktop the rail keeps it.
    const drawerOpen = await page.locator('#settingsDrawer').evaluate((e) => e.classList.contains('open'));
    expect(drawerOpen).toBe(H.isWide(page));

    // And the board is live again.
    await H.playCorrect(page, 1);
    expect(await H.streak(page)).toBe('2');
  });

  test('Escape bails out and still counts as onboarded', async ({ page }) => {
    await H.gotoTour(page);
    await page.keyboard.press('Escape');

    await expect(page.locator(tour)).not.toHaveClass(/open/);
    expect(await H.readStorage(page, H.STORAGE.onboarded)).toBe('1');
    await expect(page.locator('.tour-hint')).toHaveCount(0);
  });

  test('a returning visitor is left alone', async ({ page }) => {
    await H.gotoPlaying(page);
    await expect(page.locator(tour)).not.toHaveClass(/open/);
    await expect(page.locator('body')).not.toHaveClass(/tour-open/);
  });

  test('?init=true replays the gate and the tour forces a view the copy describes', async ({ page }) => {
    // Someone who had already switched to Hidden must not be told to look at
    // numbered circles that aren't drawn.
    await H.seedStorage(page, {
      [H.STORAGE.onboarded]: '1',
      [H.STORAGE.settings]: JSON.stringify({ noteDisplay: 'hidden', showNames: true, includeFlats: true }),
    });
    await page.goto('/?init=true');

    await expect(page.locator('#gate')).toHaveClass(/open/);
    await page.locator('#gateYes').click();

    await expect(page.locator(tour)).toHaveClass(/open/);
    const s = await H.readJSON(page, H.STORAGE.settings);
    expect(s.noteDisplay).toBe('numerals');
    expect(s.showNames).toBe(false);
    expect(s.includeFlats).toBe(false);
  });

  test('a normal visit never rewrites a saved display mode', async ({ page }) => {
    await H.seedStorage(page, {
      [H.STORAGE.onboarded]: '1',
      [H.STORAGE.settings]: JSON.stringify({ noteDisplay: 'hidden' }),
    });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    expect((await H.readJSON(page, H.STORAGE.settings)).noteDisplay).toBe('hidden');
  });
});
