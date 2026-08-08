# Build

`build/` is an optional, minified copy of the site. **The site does not need
it.** Every file in the repo root is still directly serveable, and that is what
is deployed today — this only exists to make a smaller copy when you want one.

```sh
npm run setup       # one-off: installs esbuild here and Playwright in tests/
npm run build       # writes build/
npm run test:build  # runs the full suite against build/
npm run serve:build # browse build/ at http://localhost:8415
```

## What it does

| Step | |
| --- | --- |
| Copy | Everything in the repo root, minus a short skip list (`tools/`, `tests/`, `package.json`, `index_old.html`, `icon-preview.svg`). It copies by exclusion so a new page or asset is picked up automatically rather than silently left out. |
| Minify | `.css` and `.js` through esbuild. Currently 150KB → 71KB, a 53% cut. |
| Re-hash | Every `?v=` cache key is rewritten to a content hash of the built file. |
| Verify | Fails the build if a page references an asset that isn't in the output, or if any internal link is broken. |

## What it deliberately does not do

**HTML is not minified.** These pages are mostly inline SVG and prose. The safe
wins are tiny, gzip already collapses the whitespace, and aggressive collapsing
risks changing rendered text nodes — a bad trade for a rounding error.

**Nothing is transpiled.** esbuild runs with no `target`, so it only shrinks the
code; it never rewrites syntax. Setting a target made it try to downlevel
destructuring the app relies on working natively, which changes what ships
instead of just making it smaller.

## Cache keys

The source keeps hand-written versions (`style.css?v=20260808c`) because the
repo root is deployed directly and something has to bust the cache. The build
replaces them with content hashes, so a rebuilt file only busts caches when its
contents actually changed — and you can stop remembering to bump them by hand.

## ⚠ Before you deploy build/

The site is currently deployed **from the repo root**, and this manifest adds a
`package.json` there — which is exactly what `tests/README.md` warns about:

> A `package.json` at the top level risks a static host deciding the project
> needs building.

For an Amplify app that is *already configured*, saved build settings are not
re-detected, so an existing deploy should be unaffected. But if you reconnect
the repo, create a new app, or let Amplify re-run detection, it may now propose
a Node build where before it saw a static site.

Two ways to make that safe, both requiring a decision:

1. **Keep deploying the root** (status quo). Pin it by setting Amplify's build
   spec explicitly to "no build, publish `/`", or commit an `amplify.yml` that
   says so, rather than relying on auto-detection.
2. **Deploy `build/` instead.** Set the Amplify build command to `npm ci &&
   npm run build` and the output directory to `build`. Note `build/` is
   gitignored, so this only works as a real build step — do not commit it.

Neither is chosen for you. Nothing here changes the current deployment.
