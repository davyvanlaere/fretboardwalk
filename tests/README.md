# Tests

Browser tests for Fretboardwalk, run with Playwright against the real files in
the repo root.

The dependency lives **here**, not at the repo root, on purpose: the site is a
zero-build static bundle and the whole repo is the deployed artifact. A
`package.json` at the top level risks a static host deciding the project needs
building.

## Running

```sh
cd tests
npm install
npm run setup      # one-off: downloads the Chromium build Playwright pins
npm test
```

Useful variants:

| Command | What it does |
| --- | --- |
| `npm test` | Everything, both viewports, headless |
| `npm run test:headed` | Watch it drive a real window |
| `npm run test:ui` | Playwright's interactive runner — best for debugging one spec |
| `npx playwright test --project=phone` | Narrow layout only |
| `npx playwright test specs/onboarding.spec.js` | One file |
| `npx playwright show-trace test-results/<dir>/trace.zip` | Step through a failure |

A static server on port 8413 is started automatically (`serve.js`) and reused if
one is already up.

## Why two projects

`phone` (412px) and `desktop` (1440px) are not cosmetic variants. Below 1100px
the neck renders vertically; at 1000px and above the settings drawer is
reparented out of the page flow into a permanent side rail, and the gear button
disappears entirely. Several bugs found while writing these only existed on one
side of that line.

Both projects use plain desktop Chromium at a set width rather than device
emulation — every breakpoint in the app keys off width alone, and touch
emulation would drag in the `pointer:coarse` rotate-lock, which is not what
these specs are about.

## The specs

| File | Covers |
| --- | --- |
| `gate.spec.js` | The first-visit dialog: both answers, Escape, that declining costs nothing, and that the tour stays reachable from the `?` button afterwards — including giving back a display mode the tour had to override |
| `onboarding.spec.js` | The tour itself: step sequence, the spotlight tracking each target, tap-blocking on read-only steps, the hands-on step, Escape, and the once-ever flag |
| `nudge.spec.js` | The "make it harder" toast: its 10-streak trigger, both answers, and the guarantee it never appears twice |
| `board.spec.js` | Degree mapping per key, lowered degrees, target selection rules, and what a correct/wrong tap does |
| `settings.spec.js` | Persistence round-trips, and that hand-edited or corrupt storage can't break startup |
| `timeattack.spec.js` | Run chrome, the per-display-mode score buckets, leaderboard cleanup, and restoring the practice run underneath |

## `genchords.js`

Not a test — a generator. It draws the chord boxes on `/chords-from-degrees`
and splices them into the page:

```sh
node tests/genchords.js chords-from-degrees.html
```

It lives here because `tests/` is the one folder that isn't part of the
deployed site. Run it after editing a shape; it is idempotent, finding diagrams
it wrote previously by their `aria-label`.

The reason it exists rather than hand-drawn SVG is the check in the middle:
before drawing anything it converts every position to a real pitch and asserts
the degree label is correct, and that the shape's degrees match the chord name
in the caption. A mislabelled diagram fails the build instead of teaching
someone the wrong thing.

## Writing more

Use `helpers.js` rather than driving the board directly. The one thing worth
knowing: **a correct tap updates the score immediately but moves you 380ms
later**, so waiting on the score and then reading the position gives you a board
that is still mid-transition. `tapDegree` waits for the move itself. Nearly
every flaky test written against this app traces back to that gap.

Two other traps the helpers already handle:

- You can only ever move to the degree currently being asked for, so "stand on a
  ♭3" means `playUntilTargetIn(page, ['b3', ...])`, not tapping a ♭3.
- The note you're standing on keeps its numeral in every display mode, so
  "hidden" and "dots" do not mean zero text on the board.
