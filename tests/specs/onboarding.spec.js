const { test, expect } = require('@playwright/test');
const H = require('../helpers');

// The first-visit tour is gated behind a localStorage flag, which means it is
// never seen again once dismissed — so nobody re-tests it by hand. That is
// exactly why it's worth pinning down here.

const tour     = '#tour';
const stepText = '#tourStep';
const body     = '#tourBody';

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
      for (const c of document.querySelectorAll('.fret-cell')) {
        const r = c.getBoundingClientRect();
        if (!c.dataset.degree || c.dataset.degree === '5' || c.dataset.degree === '1') continue;
        if (r.width > 5 && r.top > 120 && r.bottom < innerHeight - 260)
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

    await expect.poll(() => stepNumber(page), { timeout: 5000 }).toBe(5);
    expect(await H.streak(page)).toBe('1');
    await expect(page.locator('.tour-hint')).toHaveCount(0);
  });

  test('the final step reveals the display setting and points at the guide', async ({ page }) => {
    await H.gotoTour(page);
    for (let i = 0; i < 3; i++) await page.locator('#tourNext').click();
    const cell = await H.findCell(page, '5', { safeBottom: 260 });
    await page.mouse.click(cell.x, cell.y);
    await expect.poll(() => stepNumber(page), { timeout: 5000 }).toBe(5);

    await page.locator('#tourNext').click();
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
    await expect.poll(() => stepNumber(page), { timeout: 5000 }).toBe(5);
    for (let i = 5; i < last; i++) await page.locator('#tourNext').click();
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
