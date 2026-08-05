const { test, expect } = require('@playwright/test');
const H = require('../helpers');

// The tour is opt-in, so this dialog is the only thing standing between a first
// visitor and the app. Two things have to hold: declining must cost nothing,
// and there must be a way back — an optional tour with no second chance is just
// a tour most people never see.

const gate = '#gate';
const tour = '#tour';

test.describe('first-visit gate', () => {
  test('a cold visitor is asked, not shown', async ({ page }) => {
    await H.gotoFirstVisit(page);

    await expect(page.locator(gate)).toHaveClass(/open/);
    await expect(page.locator(tour)).not.toHaveClass(/open/);
    // No difficulty question, no jargon — just the two answers.
    await expect(page.locator('#gateYes')).toBeVisible();
    await expect(page.locator('#gateNo')).toBeVisible();
    // And the board is already there behind it.
    await expect(page.locator('#board')).toBeVisible();
  });

  test('accepting starts the tour', async ({ page }) => {
    await H.gotoFirstVisit(page);
    await page.locator('#gateYes').click();

    await expect(page.locator(gate)).not.toHaveClass(/open/);
    await expect(page.locator(tour)).toHaveClass(/open/);
    await expect(page.locator('#tourStep')).toContainText('Step 1');
  });

  test('declining drops you straight into a working app', async ({ page }) => {
    await H.gotoFirstVisit(page);
    await page.locator('#gateNo').click();

    await expect(page.locator(gate)).not.toHaveClass(/open/);
    await expect(page.locator(tour)).not.toHaveClass(/open/);
    await expect(page.locator('body')).not.toHaveClass(/tour-open/);
    expect(await H.readStorage(page, H.STORAGE.onboarded)).toBe('1');

    // Nothing is left blocking the board.
    await H.playCorrect(page, 2);
    expect(await H.streak(page)).toBe('2');
  });

  test('Escape counts as declining rather than trapping a keyboard user', async ({ page }) => {
    await H.gotoFirstVisit(page);
    await page.keyboard.press('Escape');

    await expect(page.locator(gate)).not.toHaveClass(/open/);
    expect(await H.readStorage(page, H.STORAGE.onboarded)).toBe('1');
    await H.playCorrect(page, 1);
    expect(await H.streak(page)).toBe('1');
  });

  test('neither the gate nor the tour returns on a later visit', async ({ page }) => {
    await H.gotoFirstVisit(page);
    await page.locator('#gateNo').click();

    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    await expect(page.locator(gate)).not.toHaveClass(/open/);
    await expect(page.locator(tour)).not.toHaveClass(/open/);
  });

  test('the tour stays reachable from the ? button after declining', async ({ page }) => {
    await H.gotoFirstVisit(page);
    await page.locator('#gateNo').click();

    await page.locator('#helpBtn').click();
    await expect(page.locator('#howto')).toHaveClass(/open/);
    await page.locator('#howtoTourBtn').click();

    // Launching from in there closes the how-to behind it.
    await expect(page.locator('#howto')).not.toHaveClass(/open/);
    await expect(page.locator(tour)).toHaveClass(/open/);
    await expect(page.locator('#tourStep')).toContainText('Step 1');
  });

  test('replaying the tour does not cost you the difficulty you worked up to', async ({ page }) => {
    // Someone playing on Hidden asks for a refresher. The tour has to switch to
    // numerals to make any sense — and has to give Hidden back afterwards.
    await H.seedStorage(page, {
      [H.STORAGE.onboarded]: '1',
      [H.STORAGE.nudge]: '1',
      [H.STORAGE.settings]: JSON.stringify({ noteDisplay: 'hidden', includeFlats: true }),
    });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    await page.locator('#helpBtn').click();
    await page.locator('#howtoTourBtn').click();
    await expect(page.locator(tour)).toHaveClass(/open/);

    // Mid-tour: numerals, no flats, so the copy matches the board.
    expect((await H.readJSON(page, H.STORAGE.settings)).noteDisplay).toBe('numerals');
    await expect(page.locator('#noteVisibilitySeg .seg-btn.active')).toHaveText('Numerals');

    await page.keyboard.press('Escape');

    // Afterwards: exactly as they left it.
    const s = await H.readJSON(page, H.STORAGE.settings);
    expect(s.noteDisplay).toBe('hidden');
    expect(s.includeFlats).toBe(true);
    await expect(page.locator('#noteVisibilitySeg .seg-btn.active')).toHaveText('Hidden');
    await expect(page.locator('#toggleFlats')).toHaveClass(/on/);

    // Restoring flats remaps every cell, so the run must be coherent again.
    const degrees = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('.fret-cell')]
        .map((c) => c.dataset.degree).filter(Boolean))].sort());
    expect(degrees).toContain('b3');
    await H.playCorrect(page, 1);
    expect(await H.streak(page)).toBe('1');
  });
});
