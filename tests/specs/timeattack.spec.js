const { test, expect } = require('@playwright/test');
const H = require('../helpers');

// Time Attack runs on a real clock (9s for the first note, shrinking 4% each
// time), so the specs that wait for a run to end are genuinely slow. They earn
// it: scores are bucketed per display mode, and getting that wrong silently
// mixes an easy board's scores into a hard one's leaderboard.

const TA_FIRST_NOTE_MS = 9000;

async function startRun(page) {
  await page.locator('#taStartBtn').click();
  await expect(page.locator('#taBarTrack')).toBeVisible();
}

test.describe('time attack', () => {
  test('starting a run takes over the chrome', async ({ page }) => {
    await H.gotoPlaying(page);
    await expect(page.locator('#streakBox .l')).toHaveText('streak');

    await startRun(page);

    await expect(page.locator('#streakBox .l')).toHaveText('score');
    await expect(page.locator('#streakVal')).toHaveText('0');
    await expect(page.locator('.key-select')).toBeHidden();
    await expect(page.locator('#helpBtn')).toBeHidden();   // no modal over a ticking clock
    await expect(page.locator('#taStartBtn')).toHaveClass(/stopping/);
    await expect(page.locator('#curNum')).toHaveText('1');  // always restarts from the root
  });

  test('a wrong tap costs nothing but time', async ({ page }) => {
    await H.gotoPlaying(page);
    await startRun(page);
    await H.playCorrect(page, 2);
    expect(await H.streak(page)).toBe('2');

    await H.tapWrong(page);
    await page.waitForTimeout(400);
    // The clock is the only thing that ends a run.
    expect(await H.streak(page)).toBe('2');
    await expect(page.locator('#taResults')).not.toHaveClass(/open/);
  });

  test('stopping a run abandons it rather than scoring it', async ({ page }) => {
    await H.gotoPlaying(page);
    await H.playCorrect(page, 2);                       // build a practice streak first
    await startRun(page);
    await H.playCorrect(page, 1);

    await page.locator('#taStartBtn').click();          // same tile, now Stop

    await expect(page.locator('#taResults')).not.toHaveClass(/open/);
    await expect(page.locator('#streakBox .l')).toHaveText('streak');
    await expect(page.locator('.key-select')).toBeVisible();
    await expect(page.locator('#taBarTrack')).toBeHidden();
    // The practice run it interrupted is handed back intact.
    expect(await H.streak(page)).toBe('2');
    expect(await H.readJSON(page, H.STORAGE.bestScores)).toBeNull();
  });

  test('the clock ending a run opens the results and banks the score', async ({ page }) => {
    test.slow();
    await H.gotoPlaying(page);
    await startRun(page);
    await H.playCorrect(page, 2);

    await expect(page.locator('#taResults')).toHaveClass(/open/, { timeout: TA_FIRST_NOTE_MS + 5000 });
    await expect(page.locator('#taFinalScore')).toHaveText('2');

    const boards = await H.readJSON(page, H.STORAGE.bestScores);
    expect(boards.numerals).toEqual([2]);
    // Scored into its own bucket only — the other modes stay untouched.
    expect(boards.dots).toEqual([]);
    expect(boards.hidden).toEqual([]);
    await expect(page.locator('#taBoardLabel')).toHaveText('Numerals mode · top 5');
  });

  test('a run that found nothing earns no place', async ({ page }) => {
    test.slow();
    await H.gotoPlaying(page);
    await startRun(page);

    await expect(page.locator('#taResults')).toHaveClass(/open/, { timeout: TA_FIRST_NOTE_MS + 5000 });
    await expect(page.locator('#taFinalScore')).toHaveText('0');
    await expect(page.locator('#taBestLine')).toHaveText('No score this run');

    // Nothing is written at all — a scoreless run doesn't even create the file.
    expect(await H.readJSON(page, H.STORAGE.bestScores)).toBeNull();
  });

  test('a leaderboard is cleaned up on the way out of storage', async ({ page }) => {
    test.slow();
    // Duplicated, unsorted, over-long, and containing junk — all of which a
    // hand-edited or older file could hold.
    await H.seedStorage(page, {
      [H.STORAGE.onboarded]: '1',
      [H.STORAGE.nudge]: '1',
      [H.STORAGE.bestScores]: JSON.stringify({
        numerals: [7, 3, 7, 99, 12, 3, 40, -5, null, 21],
        dots: [], hidden: [],
      }),
    });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);

    await startRun(page);
    await expect(page.locator('#taResults')).toHaveClass(/open/, { timeout: TA_FIRST_NOTE_MS + 5000 });

    // Distinct, descending, capped at five, junk dropped.
    await expect(page.locator('#taBoard li')).toHaveCount(5);
    expect(await page.locator('#taBoard li').allTextContents())
      .toEqual(['99', '40', '21', '12', '7']);
    await expect(page.locator('#taBestLine')).toHaveText('Best: 99');
  });

  test('the scoring bucket is locked at the start, not the finish', async ({ page }) => {
    test.slow();
    await H.gotoPlaying(page);
    await startRun(page);
    await H.playCorrect(page, 1);

    // Switching the display mid-run must not move the goalposts on which board
    // this score lands in. On phones the drawer is unreachable mid-run, so go
    // through the same control the app itself uses.
    await page.evaluate(() => {
      document.getElementById('settingsDrawer').classList.add('open');
      [...document.getElementById('noteVisibilitySeg').children]
        .find((b) => b.dataset.val === 'hidden').click();
    });

    await expect(page.locator('#taResults')).toHaveClass(/open/, { timeout: TA_FIRST_NOTE_MS + 5000 });
    await expect(page.locator('#taBoardLabel')).toHaveText('Numerals mode · top 5');

    const boards = await H.readJSON(page, H.STORAGE.bestScores);
    expect(boards.numerals).toEqual([1]);
    expect(boards.hidden).toEqual([]);
  });

  test('exiting the results screen restores the practice run underneath', async ({ page }) => {
    test.slow();
    await H.gotoPlaying(page);
    await H.playCorrect(page, 4);
    const practiceNote = await page.locator('#curNum').textContent();

    await startRun(page);
    await expect(page.locator('#taResults')).toHaveClass(/open/, { timeout: TA_FIRST_NOTE_MS + 5000 });
    await page.locator('#taExitBtn').click();

    await expect(page.locator('#taResults')).not.toHaveClass(/open/);
    await expect(page.locator('#streakBox .l')).toHaveText('streak');
    expect(await H.streak(page)).toBe('4');
    await expect(page.locator('#curNum')).toHaveText(practiceNote);
  });
});
