const { test, expect } = require('@playwright/test');

// The key quiz (/key-quiz): name the seven notes of a major key, and on a miss
// see why on the circle of fifths. ?key= pins the first question; later ones
// are random, so a spec that goes past the first reads the key off the page
// and looks it up in CHORD_CHART.

// "Chords In All Major Keys", the reference chart, transcribed row by row: the
// triads on I ii iii IV V vi vii° of every major key. Their roots are the
// key's notes, so this is the answer key the quiz is held to — written out
// from the chart, never derived the way the page derives it.
const CHORD_CHART = {
  'C':  ['C',  'Dm',  'Em',  'F',  'G',  'Am',  'B°'],
  'C♯': ['C♯', 'D♯m', 'E♯m', 'F♯', 'G♯', 'A♯m', 'B♯°'],
  'D♭': ['D♭', 'E♭m', 'Fm',  'G♭', 'A♭', 'B♭m', 'C°'],
  'D':  ['D',  'Em',  'F♯m', 'G',  'A',  'Bm',  'C♯°'],
  'E♭': ['E♭', 'Fm',  'Gm',  'A♭', 'B♭', 'Cm',  'D°'],
  'E':  ['E',  'F♯m', 'G♯m', 'A',  'B',  'C♯m', 'D♯°'],
  'F':  ['F',  'Gm',  'Am',  'B♭', 'C',  'Dm',  'E°'],
  'F♯': ['F♯', 'G♯m', 'A♯m', 'B',  'C♯', 'D♯m', 'E♯°'],
  'G♭': ['G♭', 'A♭m', 'B♭m', 'C♭', 'D♭', 'E♭m', 'F°'],
  'G':  ['G',  'Am',  'Bm',  'C',  'D',  'Em',  'F♯°'],
  'A♭': ['A♭', 'B♭m', 'Cm',  'D♭', 'E♭', 'Fm',  'G°'],
  'A':  ['A',  'Bm',  'C♯m', 'D',  'E',  'F♯m', 'G♯°'],
  'B♭': ['B♭', 'Cm',  'Dm',  'E♭', 'F',  'Gm',  'A°'],
  'B':  ['B',  'C♯m', 'D♯m', 'E',  'F♯', 'G♯m', 'A♯°'],
};

// A key's notes: its chart row with each chord's quality (m, °) dropped.
const notesIn = (key) => CHORD_CHART[key].map((chord) => chord.replace(/[m°]$/, ''));

// The keys the quiz asks — the trainer's twelve. That's the whole chart but
// C♯ and G♭, whose twins D♭ and F♯ it spells instead.
const QUIZ_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'];

// A sure miss in any key: its 4th knocked off the right spelling, a natural
// sharpened and anything else made natural.
const spoil = (notes) => notes.map((n, i) => (i !== 3 ? n : n.length === 1 ? n + '♯' : n[0]));

// The circle as it's printed on the usual chart: majors round the outside,
// with G♭ at the bottom, B/C♭, G♭/F♯ and D♭/C♯ as second spellings, and the
// relative minors inside. Also hand-written, from that chart.
const CHART = {
  majors: ['C', 'G', 'D', 'A', 'E', 'B', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F'],
  seconds: { 'B': 'C♭', 'G♭': 'F♯', 'D♭': 'C♯' },
  minors: ['Am', 'Em', 'Bm', 'F♯m', 'C♯m', 'G♯m', 'E♭m', 'B♭m', 'Fm', 'Cm', 'Gm', 'Dm'],
};

// The order each side's accidentals arrive in, with the sentence it's
// remembered by. A miss shows the one for each side it involves.
const SHARPS_ORDER = 'Sharps always arrive in the same order, F♯ C♯ G♯ D♯ A♯ E♯ B♯ — ' +
  'Father Charles Goes Down And Ends Battle — so knowing how many tells you which.';
const FLATS_ORDER = 'Flats always arrive in the same order, B♭ E♭ A♭ D♭ G♭ C♭ F♭ — ' +
  'Battle Ends And Down Goes Charles\'s Father — so knowing how many tells you which.';

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

// A right answer moves on to the next key after 1.2s, clearing the verdict.
// With the page's clock stopped it stays up for as long as a spec needs to
// read it — and a failure shows the wrong verdict rather than an empty one.
// page.clock.runFor(1200) moves on.
async function stopClock(page) {
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
}

// Major keys on the circle's wedges matching `state`, clockwise from the top.
const onCircle = (page, state) => page.locator(`#kqCircle .kq-node${state}`)
  .evaluateAll((els) => els.map((e) => e.dataset.note));

// The step pills matching `state`, in the order they're drawn, as
// [key the pill sits on, accidental it names].
const steps = (page, state) => page.locator(`#kqCircle .kq-step${state}`)
  .evaluateAll((els) => els.map((e) => [e.dataset.at, e.dataset.note]));

test.describe('every key the quiz asks, against the chord chart', () => {
  for (const key of QUIZ_KEYS) {
    const notes = notesIn(key);

    test(`${key} major: ${notes.join(' ')}`, async ({ page }) => {
      await stopClock(page);

      // Answered straight off the chart, it's right — one column per note.
      await open(page, key);
      await expect(page.locator('#kqKey')).toHaveText(`${key} major`);
      const letters = await page.locator('.kq-slot').evaluateAll((els) => els.map((e) => e.dataset.letter));
      expect(letters).toEqual(notes.map((n) => n[0]));
      await answer(page, notes);
      await expect(page.locator('#kqVerdict')).toHaveText(`Right — ${key} major is ${notes.join(' ')}.`);

      // Missed, the answer shown under the circle is the chart's, and the walk
      // from C adds exactly the chart's sharps or flats.
      await open(page, key);
      await answer(page, spoil(notes));
      await expect(page.locator('#kqScale')).toHaveText(notes.join(' '));
      const walked = (await steps(page, ':not(.extra)')).map(([, note]) => note);
      expect(walked.sort()).toEqual(notes.filter((n) => n.length > 1).sort());
    });
  }

  test('whichever key comes up, the chart\'s notes are right — every time', async ({ page }) => {
    // Moving on by hand rather than waiting 1.2s a time, so this can keep
    // going until every key has come up at random.
    await stopClock(page);
    await page.goto('/key-quiz');

    const seen = new Set();
    for (let round = 1; seen.size < QUIZ_KEYS.length; round++) {
      expect(round, `after ${round - 1} rounds only saw ${[...seen].join(' ')}`).toBeLessThan(200);
      const asked = await page.locator('#kqKey').textContent();
      const key = asked.replace(' major', '');
      expect(QUIZ_KEYS).toContain(key);

      await answer(page, notesIn(key));
      await expect(page.locator('#kqVerdict')).toHaveText(`Right — ${asked} is ${notesIn(key).join(' ')}.`);
      await expect(page.locator('#kqStreak')).toHaveText(String(round));
      seen.add(key);

      await page.clock.runFor(1200);
      await expect(page.locator('#kqKey')).not.toHaveText(asked);
    }

    // And one miss ends the run.
    const key = (await page.locator('#kqKey').textContent()).replace(' major', '');
    await answer(page, spoil(notesIn(key)));
    await expect(page.locator('#kqStreak')).toHaveText('0');
  });
});

test.describe('key quiz', () => {
  test('the root comes from the question, so only the other six letters are asked', async ({ page }) => {
    await open(page, 'B♭');
    const letters = await page.locator('.kq-slot').evaluateAll((els) => els.map((e) => e.dataset.letter));
    expect(letters).toEqual(['B', 'C', 'D', 'E', 'F', 'G', 'A']);
    await expect(page.locator('.kq-slot').first()).toContainText('B♭');
    await expect(page.getByRole('radio')).toHaveCount(18);
  });

  test('a right answer scores and moves straight on to another key', async ({ page }) => {
    await open(page, 'D');
    await answer(page, notesIn('D'));

    await expect(page.locator('#kqStreak')).toHaveText('1');
    await expect(page.locator('#kqKey')).not.toHaveText('D major');
    await expect(page.locator('#kqWhy')).toBeHidden();
    // A clean slate: every letter back to natural, and answerable again.
    await expect(page.getByRole('button', { name: 'Check' })).toBeEnabled();
    const picked = await page.locator('#kqSlots input:checked').evaluateAll((els) => els.map((e) => e.value));
    expect(picked).toEqual(['0', '0', '0', '0', '0', '0']);
  });

  test('the circle is the standard chart, whichever key is asked', async ({ page }) => {
    // A sharp-heavy key and a flat one: neither may respell the chart.
    for (const [root, miss] of [
      ['B', ['B', 'C', 'D♯', 'E', 'F♯', 'G♯', 'A♯']],
      ['E♭', ['E♭', 'F', 'G', 'A', 'B♭', 'C', 'D']],
    ]) {
      await open(page, root);
      await answer(page, miss);   // a miss, so the circle is drawn

      const wedges = page.locator('#kqCircle .kq-node');
      expect(await wedges.evaluateAll((els) => els.map((e) => e.dataset.note))).toEqual(CHART.majors);
      expect(await wedges.evaluateAll((els) => els.map((e) => e.dataset.minor))).toEqual(CHART.minors);
      expect(await wedges.evaluateAll((els) => Object.fromEntries(
        els.filter((e) => e.dataset.second).map((e) => [e.dataset.note, e.dataset.second]))))
        .toEqual(CHART.seconds);
    }
  });

  test('a miss walks from C to the key, one sharp per step', async ({ page }) => {
    await open(page, 'D');
    await expect(page.locator('#kqWhy')).toBeHidden();
    await answer(page, ['D', 'E', 'F', 'G', 'A', 'B', 'C♯']);   // forgot the F♯

    await expect(page.locator('#kqVerdict')).toHaveText('Not quite — D major has F♯, not F.');
    await expect(page.locator('#kqStreak')).toHaveText('0');
    await expect(page.locator('.kq-slot[data-letter="F"]')).toHaveClass(/\bbad\b/);
    await expect(page.locator('.kq-slot[data-letter="C"]')).toHaveClass(/\bok\b/);

    await expect(page.locator('#kqWhy')).toBeVisible();
    expect(await onCircle(page, '.key')).toEqual(['D']);
    // C → G adds F♯, G → D adds C♯; the F♯ you missed is the one picked out.
    expect(await steps(page, '')).toEqual([['G', 'F♯'], ['D', 'C♯']]);
    expect(await steps(page, '.missed')).toEqual([['G', 'F♯']]);

    // Under the circle, the right answer in full, the note you missed picked
    // out. Just the notes: the circle already names the key.
    const scale = page.locator('#kqScale');
    await expect(scale).toHaveText('D E F♯ G A B C♯');
    expect(await scale.locator('.deg.seek').allTextContents()).toEqual(['F♯']);
    // Straight under it and centred on it. Measured in one go: a miss scrolls
    // the page down to the explanation, so separate reads can straddle that.
    const place = await page.evaluate(() => {
      const circle = document.getElementById('kqCircle').getBoundingClientRect();
      const notes = [...document.querySelectorAll('#kqScale .deg')].map((n) => n.getBoundingClientRect());
      return {
        gap: notes[0].top - circle.bottom,
        offCentre: (notes[0].left + notes[notes.length - 1].right) / 2 - (circle.left + circle.width / 2),
      };
    });
    expect(place.gap).toBeGreaterThanOrEqual(0);
    expect(Math.abs(place.offCentre)).toBeLessThan(2);

    const why = page.locator('#kqExplain');
    await expect(why).toContainText(
      'D major is 2 steps clockwise from C. Each step that way adds a sharp — F♯, then C♯ — so D major has 2 sharps.');
    await expect(why).toContainText('F♯ is added at the first step, C → G — so D major has it.');
    await expect(why).toContainText(SHARPS_ORDER);
    await expect(why).not.toContainText('Battle Ends');
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

  test('flat keys walk counter-clockwise, one flat per step', async ({ page }) => {
    await open(page, 'E♭');
    await answer(page, ['E♭', 'F', 'G', 'A', 'B♭', 'C', 'D']);   // forgot the A♭

    await expect(page.locator('#kqVerdict')).toHaveText('Not quite — E♭ major has A♭, not A.');
    expect(await onCircle(page, '.key')).toEqual(['E♭']);
    expect(await steps(page, '')).toEqual([['F', 'B♭'], ['B♭', 'E♭'], ['E♭', 'A♭']]);
    expect(await steps(page, '.missed')).toEqual([['E♭', 'A♭']]);

    const why = page.locator('#kqExplain');
    await expect(why).toContainText(
      'E♭ major is 3 steps counter-clockwise from C. Each step that way adds a flat — B♭, E♭, then A♭ — so E♭ major has 3 flats.');
    await expect(why).toContainText('A♭ is added at the third step, B♭ → E♭ — so E♭ major has it.');
    await expect(why).toContainText(FLATS_ORDER);
    await expect(why).not.toContainText('Father Charles');
  });

  test('F♯ major is six steps round, the last one adding E♯', async ({ page }) => {
    await open(page, 'F♯');
    await answer(page, ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E']);

    await expect(page.locator('#kqVerdict')).toHaveText('Not quite — F♯ major has E♯, not E.');
    // On the chart F♯ is the second spelling at the bottom, beside G♭.
    expect(await onCircle(page, '.key')).toEqual(['G♭']);
    expect(await steps(page, '')).toEqual(
      [['G', 'F♯'], ['D', 'C♯'], ['A', 'G♯'], ['E', 'D♯'], ['B', 'A♯'], ['G♭', 'E♯']]);
    expect(await steps(page, '.missed')).toEqual([['G♭', 'E♯']]);
    await expect(page.locator('#kqExplain')).toContainText(
      'E♯ is added at the sixth step, B → F♯ — so F♯ major has it.');
  });

  test('an accidental the key doesn\'t have is shown on the step that would add it', async ({ page }) => {
    await open(page, 'D');
    // E♭ belongs to the flat side; G♯ only arrives one step past D.
    await answer(page, ['D', 'E♭', 'F♯', 'G♯', 'A', 'B', 'C♯']);

    await expect(page.locator('#kqVerdict')).toHaveText('Not quite — D major has E and G, not E♭ and G♯.');
    expect(await steps(page, '.missed')).toEqual([]);
    expect(await steps(page, '.extra')).toEqual([['B♭', 'E♭'], ['A', 'G♯']]);
    // Plain E and G were the right answers there, so those are picked out.
    expect(await page.locator('#kqScale .deg.seek').allTextContents()).toEqual(['E', 'G']);

    const why = page.locator('#kqExplain');
    await expect(why).toContainText(
      'E♭ is a flat: those are added counter-clockwise, and it only comes in at the second step, F → B♭.');
    await expect(why).toContainText('G♯ isn\'t added until the third step, D → A — 1 step past D major.');
    // The E♭ strays to the flat side, so both orders are in play.
    await expect(why).toContainText(SHARPS_ORDER);
    await expect(why).toContainText(FLATS_ORDER);
  });

  test('C major takes no steps, so a sharp in it is explained from the sharp side', async ({ page }) => {
    await open(page, 'C');
    await answer(page, ['C', 'D', 'E', 'F♯', 'G', 'A', 'B']);

    await expect(page.locator('#kqVerdict')).toHaveText('Not quite — C major has F, not F♯.');
    expect(await onCircle(page, '.key')).toEqual(['C']);
    // Nothing is added on the way to C major; the only pill is yours.
    expect(await steps(page, '')).toEqual([['G', 'F♯']]);
    expect(await steps(page, '.extra')).toEqual([['G', 'F♯']]);

    const why = page.locator('#kqExplain');
    await expect(why).toContainText('C major sits at the top of the circle: no steps from C, so no sharps or flats.');
    await expect(why).toContainText(
      'F♯ is a sharp: those are added clockwise, and it only comes in at the first step, C → G.');
    await expect(why).toContainText(SHARPS_ORDER);
    await expect(why).not.toContainText('Battle Ends');
  });
});
