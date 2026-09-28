const { test, expect } = require('@playwright/test');

// The key quiz (/key-quiz): name the seven notes of a major key, and on a miss
// see why on the circle of fifths. ?key= pins the first question; later ones
// are random, so a spec that goes past the first reads the key off the page
// and looks it up in KEYS.

// Written out by hand from the key signatures rather than derived the way the
// page derives them, so the page is checked against theory, not against its
// own arithmetic.
const KEYS = {
  'C major':  ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  'G major':  ['G', 'A', 'B', 'C', 'D', 'E', 'F♯'],
  'D major':  ['D', 'E', 'F♯', 'G', 'A', 'B', 'C♯'],
  'A major':  ['A', 'B', 'C♯', 'D', 'E', 'F♯', 'G♯'],
  'E major':  ['E', 'F♯', 'G♯', 'A', 'B', 'C♯', 'D♯'],
  'B major':  ['B', 'C♯', 'D♯', 'E', 'F♯', 'G♯', 'A♯'],
  'F♯ major': ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯'],
  'D♭ major': ['D♭', 'E♭', 'F', 'G♭', 'A♭', 'B♭', 'C'],
  'A♭ major': ['A♭', 'B♭', 'C', 'D♭', 'E♭', 'F', 'G'],
  'E♭ major': ['E♭', 'F', 'G', 'A♭', 'B♭', 'C', 'D'],
  'B♭ major': ['B♭', 'C', 'D', 'E♭', 'F', 'G', 'A'],
  'F major':  ['F', 'G', 'A', 'B♭', 'C', 'D', 'E'],
};

// URLs spell keys in ASCII: ?key=Eb, ?key=F%23.
const open = (page, root) =>
  page.goto('/key-quiz?key=' + encodeURIComponent(root.replace('♯', '#').replace('♭', 'b')));

// Picks the accidental for every letter but the root — the question gives that
// one away — then submits.
async function answer(page, notes) {
  for (const note of notes.slice(1)) {
    const acc = note.endsWith('♯') ? 'sharp' : note.endsWith('♭') ? 'flat' : 'natural';
    await page.getByRole('radio', { name: `${note[0]} ${acc}`, exact: true }).check();
  }
  await page.getByRole('button', { name: 'Check' }).click();
}

// Note names on the circle's nodes matching `state`, clockwise from the top.
const onCircle = (page, state) => page.locator(`#kqCircle .kq-node${state}`)
  .evaluateAll((els) => els.map((e) => e.dataset.note));

test.describe('key quiz', () => {
  test('knows the notes of every key the trainer uses', async ({ page }) => {
    for (const [key, notes] of Object.entries(KEYS)) {
      await open(page, notes[0]);
      await expect(page.locator('#kqKey')).toHaveText(key);
      await answer(page, notes);
      await expect(page.locator('#kqVerdict')).toHaveText(`Right — ${key} is ${notes.join(' ')}.`);
    }
  });

  test('the root comes from the question, so only the other six letters are asked', async ({ page }) => {
    await open(page, 'B♭');
    const letters = await page.locator('.kq-slot').evaluateAll((els) => els.map((e) => e.dataset.letter));
    expect(letters).toEqual(['B', 'C', 'D', 'E', 'F', 'G', 'A']);
    await expect(page.locator('.kq-slot').first()).toContainText('B♭');
    await expect(page.getByRole('radio')).toHaveCount(18);
  });

  test('a right answer scores and moves straight on to another key', async ({ page }) => {
    await open(page, 'D');
    await answer(page, KEYS['D major']);

    await expect(page.locator('#kqStreak')).toHaveText('1');
    await expect(page.locator('#kqKey')).not.toHaveText('D major');
    await expect(page.locator('#kqWhy')).toBeHidden();
    // A clean slate: every letter back to natural, and answerable again.
    await expect(page.getByRole('button', { name: 'Check' })).toBeEnabled();
    const picked = await page.locator('#kqSlots input:checked').evaluateAll((els) => els.map((e) => e.value));
    expect(picked).toEqual(['0', '0', '0', '0', '0', '0']);
  });

  test('the streak builds across random keys and a miss resets it', async ({ page }) => {
    await open(page, 'C');
    for (let i = 1; i <= 3; i++) {
      const key = await page.locator('#kqKey').textContent();
      await answer(page, KEYS[key]);
      await expect(page.locator('#kqStreak')).toHaveText(String(i));
      await expect(page.locator('#kqKey')).not.toHaveText(key);
    }

    // Spoil the 4th: a natural one sharpened, or a flat one made natural, is
    // wrong in every major key.
    const notes = [...KEYS[await page.locator('#kqKey').textContent()]];
    notes[3] = notes[3].length === 1 ? notes[3] + '♯' : notes[3][0];
    await answer(page, notes);
    await expect(page.locator('#kqStreak')).toHaveText('0');
  });

  test('a wrong note shows up outside the key\'s arc on the circle of fifths', async ({ page }) => {
    await open(page, 'D');
    await expect(page.locator('#kqWhy')).toBeHidden();
    await answer(page, ['D', 'E', 'F', 'G', 'A', 'B', 'C♯']);   // forgot the F♯

    await expect(page.locator('#kqVerdict')).toHaveText('Not quite — D major has F♯, not F.');
    await expect(page.locator('#kqStreak')).toHaveText('0');
    await expect(page.locator('.kq-slot[data-letter="F"]')).toHaveClass(/\bbad\b/);
    await expect(page.locator('.kq-slot[data-letter="C"]')).toHaveClass(/\bok\b/);

    await expect(page.locator('#kqWhy')).toBeVisible();
    // The key is seven neighbours on the circle, the root among them.
    expect(await onCircle(page, '.in')).toEqual(['G', 'D', 'A', 'E', 'B', 'F♯', 'C♯']);
    expect(await onCircle(page, '.root')).toEqual(['D']);
    // Your F sits outside that arc; the F♯ it needed sits inside.
    expect(await onCircle(page, '.wrong')).toEqual(['F']);
    expect(await onCircle(page, '.needed')).toEqual(['F♯']);

    const why = page.locator('#kqExplain');
    await expect(why).toContainText('F is outside the arc — the arc has F♯.');
    await expect(why).toContainText('D is 2 steps clockwise from C, so D major has 2 sharps: F♯ and C♯.');
  });

  test('after a miss, Next asks a different key', async ({ page }) => {
    await open(page, 'A');
    await answer(page, ['A', 'B', 'C', 'D', 'E', 'F♯', 'G♯']);
    await expect(page.locator('#kqWhy')).toBeVisible();

    await page.getByRole('button', { name: 'Next key' }).click();
    await expect(page.locator('#kqWhy')).toBeHidden();
    await expect(page.locator('#kqKey')).not.toHaveText('A major');
    await expect(page.locator('#kqVerdict')).toHaveText('');
    await expect(page.getByRole('button', { name: 'Check' })).toBeEnabled();
  });

  test('flat keys count their flats counter-clockwise', async ({ page }) => {
    await open(page, 'E♭');
    await answer(page, ['E♭', 'F', 'G', 'A', 'B♭', 'C', 'D']);   // forgot the A♭

    await expect(page.locator('#kqVerdict')).toHaveText('Not quite — E♭ major has A♭, not A.');
    expect(await onCircle(page, '.in')).toEqual(['C', 'G', 'D', 'A♭', 'E♭', 'B♭', 'F']);
    expect(await onCircle(page, '.wrong')).toEqual(['A']);
    await expect(page.locator('#kqExplain')).toContainText(
      'E♭ is 3 steps counter-clockwise from C, so E♭ major has 3 flats: B♭, E♭ and A♭.');
  });

  test('F♯ major is spelled with an E♯, which takes F\'s place on the circle', async ({ page }) => {
    await open(page, 'F♯');
    await answer(page, ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E']);

    await expect(page.locator('#kqVerdict')).toHaveText('Not quite — F♯ major has E♯, not E.');
    expect(await onCircle(page, '.in')).toEqual(['B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯']);
    expect(await onCircle(page, '.needed')).toEqual(['E♯']);
  });

  test('a note that sounds right but borrows another letter is explained as such', async ({ page }) => {
    await open(page, 'D');
    await answer(page, ['D', 'E', 'F♯', 'G♭', 'A', 'B', 'C♯']);

    await expect(page.locator('#kqVerdict')).toHaveText('Not quite — D major has G, not G♭.');
    // G♭ is the same pitch as F♯, so it lands inside the arc: tagged on F♯'s
    // spot rather than drawn as a note outside the key.
    expect(await onCircle(page, '.wrong')).toEqual([]);
    await expect(page.locator('#kqCircle .kq-clash')).toHaveText('G♭');
    await expect(page.locator('#kqExplain')).toContainText(
      'G♭ sounds the same as F♯, which the arc already has. Each letter appears exactly once, so this one has to be G.');
  });
});
