const { test, expect } = require('@playwright/test');
const { CHORD_CHART, notesIn } = require('../chart');

// The key signatures guide (/key-signatures): the order of sharps and flats as
// Father Charles and Battle Ends, with a worked example for whichever key is
// picked. Linked from the key quiz only, for now.

const pick = (page, key) => page.getByLabel('Key').selectOption({ label: `${key} major` });

// The example's sentence: the words in a given state, in sentence order.
const words = (page, state) => page.locator(`#ksSentence .ks-word${state}`)
  .evaluateAll((els) => els.map((e) => e.dataset.word));

test.describe('key signatures guide', () => {
  test('every key on the chord chart gets its sharps or flats from the sentence', async ({ page }) => {
    await page.goto('/key-signatures');
    for (const key of Object.keys(CHORD_CHART)) {
      await pick(page, key);
      const notes = notesIn(key);
      // The words it says name exactly the chart's sharps or flats…
      const said = await page.locator('#ksSentence .ks-word.on').evaluateAll((els) => els.map((e) => e.dataset.note));
      expect(said.sort(), `${key} major`).toEqual(notes.filter((n) => n.length > 1).sort());
      // …and put on the letters from the root up, they give the chart's notes.
      await expect(page.locator('#ksScale')).toHaveText(notes.join(' '));
    }
  });

  test('a sharp key: say the sentence up to the note a half step below its name', async ({ page }) => {
    await page.goto('/key-signatures');
    await pick(page, 'A');
    expect(await words(page, '.on')).toEqual(['Father', 'Charles', 'Goes']);
    expect(await words(page, '.stop')).toEqual(['Goes']);
    await expect(page.locator('#ksSteps')).toContainText('Its last sharp is the note a half step below A: G♯.');
    await expect(page.locator('#ksResult')).toHaveText('A major has 3 sharps: F♯, C♯ and G♯.');
  });

  test('a flat key: say the sentence up to its name, then one more', async ({ page }) => {
    await page.goto('/key-signatures');
    await pick(page, 'E♭');
    expect(await words(page, '.on')).toEqual(['Battle', 'Ends', 'And']);
    expect(await words(page, '.name')).toEqual(['Ends']);
    expect(await words(page, '.stop')).toEqual(['And']);
    await expect(page.locator('#ksSteps')).toContainText('Its second-to-last flat is its own name, E♭.');
    await expect(page.locator('#ksResult')).toHaveText('E♭ major has 3 flats: B♭, E♭ and A♭.');
  });

  test('F major is the one flat key to know by heart, and C major has nothing to say', async ({ page }) => {
    await page.goto('/key-signatures');
    await pick(page, 'F');
    expect(await words(page, '.on')).toEqual(['Battle']);
    expect(await words(page, '.name')).toEqual([]);
    await expect(page.locator('#ksResult')).toHaveText('F major has 1 flat: B♭.');

    await pick(page, 'C');
    expect(await words(page, '.on')).toEqual([]);
    await expect(page.locator('#ksResult')).toHaveText('C major has no sharps or flats.');
  });

  test('C♯ and C♭ major use a whole sentence each', async ({ page }) => {
    await page.goto('/key-signatures');
    await pick(page, 'C♯');
    expect(await words(page, '.on')).toEqual(['Father', 'Charles', 'Goes', 'Down', 'And', 'Ends', 'Battle']);
    await expect(page.locator('#ksResult')).toHaveText('C♯ major has 7 sharps: F♯, C♯, G♯, D♯, A♯, E♯ and B♯.');

    // C♭ isn't on the chord chart, so its notes are written out here.
    await pick(page, 'C♭');
    expect(await words(page, '.on')).toEqual(['Battle', 'Ends', 'And', 'Down', 'Goes', 'Charles\'s', 'Father']);
    await expect(page.locator('#ksResult')).toHaveText('C♭ major has 7 flats: B♭, E♭, A♭, D♭, G♭, C♭ and F♭.');
    await expect(page.locator('#ksScale')).toHaveText('C♭ D♭ E♭ F♭ G♭ A♭ B♭');
  });

  test('the introduction points down to the circle of fifths behind the sentence', async ({ page }) => {
    await page.goto('/key-signatures');
    const intro = page.locator('main > .lede');
    await expect(intro.locator('a[href="#why"]')).toHaveCount(1);
    await expect(page.locator('#why')).toHaveText(/circle of fifths/);
  });

  test('?key= picks the example\'s key', async ({ page }) => {
    for (const [param, key] of [['Eb', 'E♭'], ['F%23', 'F♯'], ['C', 'C']]) {
      await page.goto('/key-signatures?key=' + param);
      await expect(page.locator('#ksKey option:checked')).toHaveText(`${key} major`);
      await expect(page.locator('#ksResult')).toContainText(`${key} major has`);
    }
  });

  test('the quiz links here after its Father Charles line, with its key already picked', async ({ page }) => {
    await page.goto('/key-quiz?key=A');
    await page.getByRole('button', { name: 'Check' }).click();   // all natural: a miss in A major

    const lines = await page.locator('#kqExplain p').allTextContents();
    expect(lines.at(-2)).toContain('Father Charles Goes Down And Ends Battle');
    expect(lines.at(-1)).toBe('The Father Charles approach, in full →');

    await page.getByRole('link', { name: 'The Father Charles approach, in full' }).click();
    await expect(page).toHaveURL(/\/key-signatures\?key=A$/);
    await expect(page.locator('#ksKey option:checked')).toHaveText('A major');
    await expect(page.locator('#ksResult')).toHaveText('A major has 3 sharps: F♯, C♯ and G♯.');
  });
});
