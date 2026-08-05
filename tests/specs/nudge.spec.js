const { test, expect } = require('@playwright/test');
const H = require('../helpers');

// The difficulty question used to block the first visit, where a beginner had
// no way to answer it. It now waits for a 10-streak — proof they've been
// reading degrees off the neck — and must never nag twice.

const nudge = '#nudge';

// Reaching a streak of 10 through the real game loop is the only honest way in;
// the trigger lives inside setStreak.
async function playTo(page, n) {
  await H.playCorrect(page, n);
  expect(await H.streak(page)).toBe(String(n));
}

test.describe('"make it harder" nudge', () => {
  test('stays away below the threshold', async ({ page }) => {
    await H.seedStorage(page, { [H.STORAGE.onboarded]: '1' });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    await playTo(page, 9);
    await expect(page.locator(nudge)).not.toHaveClass(/open/);
  });

  test('arrives at a streak of 10 without interrupting play', async ({ page }) => {
    await H.seedStorage(page, { [H.STORAGE.onboarded]: '1' });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    await playTo(page, 10);
    await expect(page.locator(nudge)).toHaveClass(/open/);

    // A toast, not a dialog: the run underneath keeps working while it's up.
    await H.playCorrect(page, 1, { safeBottom: 320 });
    expect(await H.streak(page)).toBe('11');
  });

  test('"Hide the numbers" steps down to dots, not straight to hidden', async ({ page }) => {
    await H.seedStorage(page, { [H.STORAGE.onboarded]: '1' });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);
    await playTo(page, 10);

    await page.locator('#nudgeYes').click();
    await expect(page.locator(nudge)).not.toHaveClass(/open/);
    expect((await H.readJSON(page, H.STORAGE.settings)).noteDisplay).toBe('dots');
    expect(await H.readStorage(page, H.STORAGE.nudge)).toBe('1');

    // The setting panel agrees with what just happened.
    await expect(page.locator('#noteVisibilitySeg .seg-btn.active')).toHaveText('Dots only');
    // Dots mode strips the numerals from every note except the one you're
    // standing on, which keeps its label in all modes.
    const labelled = await page.locator('#notesGroup text').count();
    const circles = await page.locator('#notesGroup circle').count();
    expect(labelled).toBeGreaterThan(0);
    expect(labelled).toBeLessThan(circles / 3);
  });

  test('"Not yet" keeps numerals but still never asks again', async ({ page }) => {
    await H.seedStorage(page, { [H.STORAGE.onboarded]: '1' });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);
    await playTo(page, 10);

    await page.locator('#nudgeNo').click();
    await expect(page.locator(nudge)).not.toHaveClass(/open/);
    // Declining changes no setting, so nothing is written — read the live UI
    // rather than storage, which is legitimately still empty here.
    await expect(page.locator('#noteVisibilitySeg .seg-btn.active')).toHaveText('Numerals');
    expect(await H.readStorage(page, H.STORAGE.nudge)).toBe('1');

    // Keep playing well past the threshold — it must not come back.
    await H.playCorrect(page, 3);
    await expect(page.locator(nudge)).not.toHaveClass(/open/);
  });

  test('never fires again in a later session', async ({ page }) => {
    await H.seedStorage(page, { [H.STORAGE.onboarded]: '1', [H.STORAGE.nudge]: '1' });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    await playTo(page, 10);
    await expect(page.locator(nudge)).not.toHaveClass(/open/);
  });

  test('has nothing to offer someone already past numerals', async ({ page }) => {
    await H.seedStorage(page, {
      [H.STORAGE.onboarded]: '1',
      [H.STORAGE.settings]: JSON.stringify({ noteDisplay: 'dots' }),
    });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    await playTo(page, 10);
    await expect(page.locator(nudge)).not.toHaveClass(/open/);
    expect(await H.readStorage(page, H.STORAGE.nudge)).toBeNull();
  });

  test('stays out of the way during a Time Attack run', async ({ page }) => {
    await H.seedStorage(page, { [H.STORAGE.onboarded]: '1' });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    await page.locator('#taStartBtn').click();
    await H.playCorrect(page, 10);   // this is a score, not a streak
    await expect(page.locator(nudge)).not.toHaveClass(/open/);
  });
});
