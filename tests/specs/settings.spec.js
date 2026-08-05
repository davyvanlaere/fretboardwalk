const { test, expect } = require('@playwright/test');
const H = require('../helpers');

// Settings are the app's only persisted preferences. loadSettings validates
// them field by field precisely because a stale or hand-edited value would
// otherwise throw deep inside init, where nothing catches it.

// On phones the drawer is collapsed; on desktop it's always open in the rail.
async function openSettings(page) {
  if (!H.isWide(page)) await page.locator('#gearBtn').click();
  await expect(page.locator('#settingsDrawer')).toHaveClass(/open/);
}

test.describe('settings persistence', () => {
  test('choices survive a reload', async ({ page }) => {
    await H.gotoPlaying(page);
    await openSettings(page);

    await page.locator('#noteVisibilitySeg .seg-btn', { hasText: 'Hidden' }).click();
    await page.locator('#toggleFlats').click();
    await page.locator('#toggleNames').click();
    await page.locator('#toggleSound').click();
    await page.locator('#guitarTypeSeg .seg-btn', { hasText: 'Electric' }).click();
    await page.locator('#keySelect').selectOption({ label: 'A major' });

    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);
    await openSettings(page);

    await expect(page.locator('#noteVisibilitySeg .seg-btn.active')).toHaveText('Hidden');
    await expect(page.locator('#guitarTypeSeg .seg-btn.active')).toHaveText('Electric');
    await expect(page.locator('#toggleFlats')).toHaveClass(/on/);
    await expect(page.locator('#toggleNames')).toHaveClass(/on/);
    await expect(page.locator('#toggleSound')).not.toHaveClass(/on/);
    await expect(page.locator('#keySelect')).toHaveValue('3');   // A major
  });

  test('a run in progress is deliberately not persisted', async ({ page }) => {
    await H.gotoPlaying(page);
    await H.playCorrect(page, 3);
    expect(await H.streak(page)).toBe('3');

    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    // Every visit starts fresh from the root, whatever happened last time.
    expect(await H.streak(page)).toBe('0');
    await expect(page.locator('#curNum')).toHaveText('1');
  });

  test('hand-edited nonsense in storage cannot break startup', async ({ page }) => {
    await H.seedStorage(page, {
      [H.STORAGE.onboarded]: '1',
      [H.STORAGE.nudge]: '1',
      [H.STORAGE.settings]: JSON.stringify({
        keyIndex: 999,               // out of range
        noteDisplay: 'sideways',     // not a mode
        showNames: 'yes',            // not a boolean
        includeFlats: null,
        guitarType: 'Banjo',         // not a sample set
      }),
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    expect(errors).toEqual([]);
    // Every bad field falls back to its default rather than being adopted.
    await expect(page.locator('#keySelect')).toHaveValue('0');
    await expect(page.locator('#noteVisibilitySeg .seg-btn.active')).toHaveText('Numerals');
    await expect(page.locator('#guitarTypeSeg .seg-btn.active')).toHaveText('Steel String');

    // And the app is actually playable, not just rendered.
    await H.playCorrect(page, 1);
    expect(await H.streak(page)).toBe('1');
  });

  test('unparseable storage is survivable', async ({ page }) => {
    await H.seedStorage(page, {
      [H.STORAGE.onboarded]: '1',
      [H.STORAGE.nudge]: '1',
      [H.STORAGE.settings]: '{not json at all',
      [H.STORAGE.bestScores]: 'also broken',
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    expect(errors).toEqual([]);
    await H.playCorrect(page, 1);
    expect(await H.streak(page)).toBe('1');
  });

  test('numerals mode can show note names instead of degrees', async ({ page }) => {
    await H.gotoPlaying(page);
    await openSettings(page);

    // Degrees by default: the labels are digits.
    const degreeLabels = await page.locator('#notesGroup text').allTextContents();
    expect(degreeLabels.every((t) => /^[1-7]$|^♭[367]$/.test(t))).toBe(true);

    await page.locator('#toggleNames').click();
    const nameLabels = await page.locator('#notesGroup text').allTextContents();
    // Now they're note names. Not C, though: in C major every C is the root,
    // every root is the current degree, and the current degree always keeps its
    // numeral in every mode — so the letters that show up are the other six.
    expect(nameLabels).toContain('D');
    expect(nameLabels).not.toContain('C');
    expect(nameLabels.filter((t) => /^[A-G]♯?$/.test(t)).length).toBeGreaterThan(5);
  });
});
