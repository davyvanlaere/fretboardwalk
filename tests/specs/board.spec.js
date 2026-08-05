const { test, expect } = require('@playwright/test');
const H = require('../helpers');

// The board's degree mapping is the app's single source of truth: the hit cells
// carry the same value that was used to draw the note, so a drift between them
// would mean tapping the right-looking note and being told it's wrong.

async function openSettings(page) {
  if (!H.isWide(page)) await page.locator('#gearBtn').click();
  await expect(page.locator('#settingsDrawer')).toHaveClass(/on|open/);
}

const degreesOnBoard = (page) => page.evaluate(() =>
  [...new Set([...document.querySelectorAll('.fret-cell')]
    .map((c) => c.dataset.degree).filter(Boolean))].sort());

test.describe('board and scoring', () => {
  test('a correct tap moves you there and extends the streak', async ({ page }) => {
    await H.gotoPlaying(page);

    const target = await H.currentTarget(page);
    await H.tapDegree(page, target);

    expect(await H.streak(page)).toBe('1');
    // Where you're standing is now what you were asked to find.
    const shown = await page.locator('#curNum').textContent();
    expect(shown.replace('♭', 'b')).toBe(target);
  });

  test('a wrong tap breaks the streak without moving you', async ({ page }) => {
    await H.gotoPlaying(page);
    await H.playCorrect(page, 2);
    expect(await H.streak(page)).toBe('2');

    const before = await page.locator('#curNum').textContent();
    await H.tapWrong(page);

    await expect(page.locator('#streakVal')).toHaveText('0');
    await expect(page.locator('#curNum')).toHaveText(before);
  });

  test('the major scale is all seven degrees and nothing else', async ({ page }) => {
    await H.gotoPlaying(page);
    expect(await degreesOnBoard(page)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  test('lowered degrees appear only when asked for', async ({ page }) => {
    await H.gotoPlaying(page);
    await openSettings(page);

    await page.locator('#toggleFlats').click();
    expect(await degreesOnBoard(page)).toEqual(
      ['1', '2', '3', '4', '5', '6', '7', 'b3', 'b6', 'b7']);

    await page.locator('#toggleFlats').click();
    expect(await degreesOnBoard(page)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  test('turning flats off mid-run never strands you on a note that left the scale', async ({ page }) => {
    await H.gotoPlaying(page);
    await openSettings(page);
    await page.locator('#toggleFlats').click();

    // Walk onto a lowered degree, then pull it out from under the run. You can
    // only move to whatever is being asked for, so play until it asks for one.
    await H.playUntilTargetIn(page, ['b3', 'b6', 'b7']);
    const standing = (await page.locator('#curNum').textContent()).replace('♭', 'b');
    expect(['b3', 'b6', 'b7']).toContain(standing);

    await page.locator('#toggleFlats').click();

    // Whatever it does, it must not leave you on a degree the board no longer
    // has, or asking for one.
    const after = (await page.locator('#curNum').textContent()).replace('♭', 'b');
    const asking = await H.currentTarget(page);
    expect(['1', '2', '3', '4', '5', '6', '7']).toContain(after);
    expect(['1', '2', '3', '4', '5', '6', '7']).toContain(asking);

    // And the game still works afterwards.
    await H.playCorrect(page, 1);
    expect(await H.streak(page)).toBe('1');
  });

  test('changing key restarts the walk and remaps every degree', async ({ page }) => {
    await H.gotoPlaying(page);
    await H.playCorrect(page, 2);

    // In C major the open low E string (fret 0) is the 3rd; in A major it's the 5th.
    const degreeAtOpenE = () => page.evaluate(() =>
      document.querySelector('.fret-cell[data-string="0"][data-fret="0"]').dataset.degree);
    expect(await degreeAtOpenE()).toBe('3');

    await page.locator('#keySelect').selectOption({ label: 'A major' });
    await expect(page.locator('#streakVal')).toHaveText('0');
    expect(await degreeAtOpenE()).toBe('5');
    await expect(page.locator('#curNum')).toHaveText('1');
  });

  test('the target is never something already under your hand', async ({ page }) => {
    await H.gotoPlaying(page);

    // pickNextTargetDegree skips anything within a tone of where you are, and
    // the last two degrees visited, so the walk can't idle in one spot.
    for (let i = 0; i < 6; i++) {
      const cur = (await page.locator('#curNum').textContent()).replace('♭', 'b');
      const next = await H.currentTarget(page);
      expect(next).not.toBe(cur);

      const semis = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, b3: 3, b6: 8, b7: 10 };
      const d = Math.abs(semis[cur] - semis[next]);
      expect(Math.min(d, 12 - d)).toBeGreaterThan(2);

      await H.tapDegree(page, next);
    }
  });

  test('restart returns to the root', async ({ page }) => {
    await H.gotoPlaying(page);
    await H.playCorrect(page, 3);
    await openSettings(page);

    await page.locator('#restartBtn').click();
    await expect(page.locator('#streakVal')).toHaveText('0');
    await expect(page.locator('#curNum')).toHaveText('1');
  });
});
