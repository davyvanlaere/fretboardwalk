// Shared vocabulary for driving the board. Every spec goes through these so
// that timing rules live in one place: a correct tap runs a 380ms move plus a
// smooth scroll, and tests that sleep through it by guesswork are the ones that
// go flaky on a slow machine.

const STORAGE = {
  settings:   'fretboardwalk.settings',
  onboarded:  'fretboardwalk.onboarded',
  bestScores: 'fretboardwalk.bestScores',
  nudge:      'fretboardwalk.harderNudge',
};

// Loading with the tour already dismissed is the normal starting point for
// everything that isn't an onboarding spec — otherwise the overlay eats taps.
async function gotoPlaying(page, query = '') {
  await seedStorage(page, { [STORAGE.onboarded]: '1', [STORAGE.nudge]: '1' });
  await page.goto('/' + query);
  await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);
}

// A cold visitor: nothing in storage, so the gate opens asking whether they
// want showing around. The tour itself is opt-in from there.
async function gotoFirstVisit(page, query = '') {
  await seedStorage(page, {});
  await page.goto('/' + query);
  await page.waitForFunction(() => document.querySelectorAll('.fret-cell').length > 0);
}

// Cold visit, then accept the tour — the starting point for every spec about
// the tour's own behaviour.
async function gotoTour(page, query = '') {
  await gotoFirstVisit(page, query);
  await page.locator('#gateYes').click();
  await page.waitForFunction(() => document.getElementById('tour').classList.contains('open'));
  await waitForSpotlight(page);
}

// The spotlight animates between targets over 350ms, and a step that reveals
// its own target re-measures after the reveal settles. Measuring it mid-flight
// reads a rectangle that frames nothing.
async function waitForSpotlight(page) {
  await page.waitForFunction(() => {
    const s = getComputedStyle(document.getElementById('tourHole'));
    const key = [s.left, s.top, s.width, s.height].join(':');
    const stable = window.__lastHoleKey === key && parseFloat(s.width) > 0;
    window.__lastHoleKey = key;
    return stable;
  }, null, { timeout: 5000, polling: 100 });
}

// localStorage is per-origin, so the page has to exist before it can be
// written. Visit a cheap document first, seed, then let the caller navigate.
async function seedStorage(page, entries) {
  await page.goto('/robots.txt');
  await page.evaluate((e) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v);
  }, entries);
}

function readStorage(page, key) {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

function readJSON(page, key) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, key);
}

// The degree the app is currently asking for, in the same token vocabulary the
// cells carry ('b3' rather than the '♭3' the plaque displays).
function currentTarget(page) {
  return page.evaluate(() => document.getElementById('tgtNum').textContent.replace('♭', 'b'));
}

function streak(page) {
  return page.evaluate(() => document.getElementById('streakVal').textContent);
}

// Finds a tappable cell for `degree`, avoiding the bands where the header,
// plaques and any bottom-anchored card sit — a click that lands on an overlay
// silently does nothing and reads as a game-logic failure.
async function findCell(page, degree, { safeBottom = 200 } = {}) {
  return page.evaluate(({ deg, safeBottom }) => {
    const board = document.getElementById('neckScroll').getBoundingClientRect();
    const cells = [];
    for (const c of document.querySelectorAll('.fret-cell')) {
      if (c.dataset.degree !== deg) continue;
      const r = c.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) continue;
      if (r.top < Math.max(board.top, 0) + 10) continue;
      if (r.bottom > innerHeight - safeBottom) continue;
      if (r.right > innerWidth - 5 || r.left < 5) continue;
      cells.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
    // Middle of the pack: least likely to be clipped by a scroll settling.
    return cells.length ? cells[Math.floor(cells.length / 2)] : null;
  }, { deg: degree, safeBottom });
}

// Taps a cell of the given degree, letting Playwright handle scrolling it into
// view and waiting for it to be genuinely clickable. Hand-rolled coordinate
// clicking looks simpler but silently misses whenever the neck is mid-scroll or
// an overlay is in the way, which then surfaces as a confusing game-logic
// failure three assertions later.
async function tapDegree(page, degree, opts = {}) {
  const cells = page.locator(`.fret-cell[data-degree="${degree}"]`);
  const n = await cells.count();
  if (!n) throw new Error(`no cell exists for degree "${degree}"`);

  // Middle of the pack in DOM order by default: away from the nut and the top
  // string, where a cell is most likely to sit under the header or off the end.
  //
  // `onString` moves that preference to a chosen string. Cells are generated
  // string-major, so the default lands on the D/G strings every single time —
  // fine for most specs, but it parks the player permanently on an inner string
  // with a neighbour on both sides, which quietly skews anything that depends
  // on where you're standing. Real players wander.
  let index = Math.floor(n / 2);

  // `avoid` skips cells sitting behind an overlay. The nudge toast is
  // click-through everywhere except its two buttons — which have to stay
  // clickable — so a note directly behind those genuinely can't be tapped until
  // it's dismissed. That's the app behaving correctly, not a bug to route
  // around, but a test aiming blind will hang on it.
  if (opts.avoid) {
    const free = await cells.evaluateAll((els, sel) => {
      const o = document.querySelector(sel);
      if (!o) return els.map((_, i) => i);
      const b = o.getBoundingClientRect();
      return els.reduce((acc, e, i) => {
        const r = e.getBoundingClientRect();
        const overlaps = !(r.right < b.left || r.left > b.right ||
                           r.bottom < b.top || r.top > b.bottom);
        if (!overlaps) acc.push(i);
        return acc;
      }, []);
    }, opts.avoid);
    if (free.length) index = free[Math.floor(free.length / 2)];
  }

  if (opts.onString !== undefined) {
    const strings = await cells.evaluateAll((els) => els.map((e) => +e.dataset.string));
    let best = Infinity;
    strings.forEach((s, i) => {
      const d = Math.abs(s - opts.onString);
      if (d < best) { best = d; index = i; }
    });
  }
  const cell = cells.nth(index);
  const before = await streak(page);
  await cell.scrollIntoViewIfNeeded();
  await cell.click();

  if (opts.expectCorrect !== false) {
    // The score bumps the instant you're right, but the walk itself — moving
    // you onto the note and choosing the next target — runs 380ms later. Wait
    // for the position, not the score, or every later read (current degree,
    // next target, note layout) is of a board still mid-transition.
    await page.waitForFunction(
      ({ b, d }) =>
        document.getElementById('streakVal').textContent !== b &&
        document.getElementById('curNum').textContent.replace('♭', 'b') === d,
      { b: before, d: degree }, { timeout: 6000 },
    );
    await settle(page);
  }
  return cell;
}

// Taps something that is deliberately NOT the current target, to exercise the
// miss path. Returns the degree that was hit.
async function tapWrong(page) {
  const target = await currentTarget(page);
  const standing = (await page.locator('#curNum').textContent()).replace('♭', 'b');
  const deg = await page.evaluate(({ t, cur }) => {
    for (const c of document.querySelectorAll('.fret-cell')) {
      const d = c.dataset.degree;
      if (d && d !== t && d !== cur) return d;
    }
    return null;
  }, { t: target, cur: standing });
  if (!deg) throw new Error('no wrong degree available to tap');

  await tapDegree(page, deg, { expectCorrect: false });
  return deg;
}

// Plays `n` correct answers, re-reading the target each time because it changes
// after every one.
async function playCorrect(page, n, opts = {}) {
  for (let i = 0; i < n; i++) {
    await tapDegree(page, await currentTarget(page), opts);
  }
}

// Walks the game until it asks for one of `wanted`, then answers it — the only
// way to end up standing on a specific degree, since you can only ever move to
// whatever the app is currently asking for.
async function playUntilTargetIn(page, wanted, maxTurns = 25) {
  for (let i = 0; i < maxTurns; i++) {
    const target = await currentTarget(page);
    await tapDegree(page, target);
    if (wanted.includes(target)) return target;
  }
  throw new Error(`never asked for any of ${wanted.join(', ')} in ${maxTurns} turns`);
}

// The move animation is 380ms and centerOn() smooth-scrolls after it; wait for
// the scroller to stop moving rather than guessing a duration.
async function settle(page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('neckScroll');
    const key = el.scrollTop + ':' + el.scrollLeft;
    const stable = window.__lastScrollKey === key;
    window.__lastScrollKey = key;
    return stable;
  }, null, { timeout: 5000, polling: 120 });
}

// Bounding box of an element in viewport coordinates, or null if absent.
function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, selector);
}

// Where the tour spotlight currently sits, in the same viewport coordinates as
// rectOf, so a spec can assert the hole actually frames its target.
function holeRect(page) {
  return page.evaluate(() => {
    const app = document.querySelector('.app').getBoundingClientRect();
    const s = getComputedStyle(document.getElementById('tourHole'));
    return {
      left: app.left + parseFloat(s.left),
      top: app.top + parseFloat(s.top),
      width: parseFloat(s.width),
      height: parseFloat(s.height),
    };
  });
}

// True when the spotlight frames `selector` — same centre, and big enough to
// contain it (the hole is drawn with padding, so it's never an exact match).
async function holeFrames(page, selector) {
  const hole = await holeRect(page);
  const target = await rectOf(page, selector);
  if (!target) return false;
  const near = (a, b, tol = 26) => Math.abs(a - b) <= tol;
  return near(hole.left + hole.width / 2, target.left + target.width / 2)
      && near(hole.top + hole.height / 2, target.top + target.height / 2)
      && hole.width >= target.width - 1
      && hole.height >= target.height - 1;
}

// Same idea for targets that aren't unique in the DOM. Every note of the
// current degree lights up identically, so "the spotlight is on the note you're
// standing on" can only be asserted as "on one of them".
async function holeFramesAny(page, selector) {
  const hole = await holeRect(page);
  const targets = await page.evaluate((sel) =>
    [...document.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }), selector);

  const near = (a, b, tol = 26) => Math.abs(a - b) <= tol;
  return targets.some((t) =>
    near(hole.left + hole.width / 2, t.left + t.width / 2) &&
    near(hole.top + hole.height / 2, t.top + t.height / 2) &&
    hole.width >= t.width - 1 && hole.height >= t.height - 1);
}

const isWide = (page) => page.viewportSize().width >= 1000;

module.exports = {
  STORAGE, gotoPlaying, gotoFirstVisit, gotoTour, waitForSpotlight, seedStorage,
  readStorage, readJSON,
  currentTarget, streak, findCell, tapDegree, tapWrong, playCorrect, settle,
  playUntilTargetIn,
  rectOf, holeRect, holeFrames, holeFramesAny, isWide,
};
