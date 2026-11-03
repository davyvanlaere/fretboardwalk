(function(){
  "use strict";

  const params = new URLSearchParams(location.search);

  // ---------------------------------------------------------------------
  // The virtual instrument
  //
  // A string every perfect fourth. Six of them are a guitar's — E A D G and
  // then the two the instrument would have if the G-to-B major third never
  // interrupted the run — and the rest carry the same run on past both ends.
  //
  // That one irregularity is the whole reason this page exists. In straight
  // fourths the minor pentatonic tiles the neck with exactly two shapes and
  // never stops; on a real guitar the B string shifts the tiling by a fret
  // halfway up, which is what turns one pattern into "five positions".
  // ---------------------------------------------------------------------
  const FOURTH = 5;
  const LOW_PC = 4;                 // E
  const FRET_COUNT = 16;
  const GUITAR_STRINGS = 6;
  const PC_NAME = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];

  // A minor pentatonic: A C D E G.
  const ROOT_PC = 9;
  const SCALE = [9, 0, 2, 4, 7];

  // Every note on the board is labelled with its degree counted both ways:
  // first in the parent major (C), then in that key's relative minor (A) —
  // the same seven notes, numbered from two different roots. Written
  // major|minor, so A, the root of this page's scale, reads 6|1.
  //
  // The seven keys here are exactly the diatonic pitch classes, which is also
  // exactly the set of notes that get a label at all; the five chromatic ones
  // belong to neither scale and stay bare dots.
  const DEGREES = {
    0: [1, 3],   // C
    2: [2, 4],   // D
    4: [3, 5],   // E
    5: [4, 6],   // F
    7: [5, 7],   // G
    9: [6, 1],   // A
    11:[7, 2],   // B
  };
  const degreeLabel = pc => DEGREES[pc][0] + '|' + DEGREES[pc][1];

  // The two notes the pentatonic leaves out of its parent scale: B and F. Put
  // them back and the five notes become A natural minor — the same seven as C
  // major. They are drawn half transparent and take no part in the box
  // finding below, because the tiling is a property of the five-note scale and
  // stops being one the moment these join in.
  const PARENT_EXTRA = [11, 5];

  // Gap in frets -> overlay colour. Along any one string the scale steps
  // 3,2,2,3,2 and repeats, so two and three are the only gaps it can make
  // between neighbouring notes: this pair is exhaustive, not a selection.
  const KINDS = [{kind:'primary', gap:2}, {kind:'secondary', gap:3}];

  const STRING_CHOICES = [6, 8, 10, 12, 14, 16];

  // The guitar is centred in whatever neck is drawn rather than sitting at the
  // bottom of it: with twelve strings, three run below the low E and three
  // above the top one. The pattern then continues off both ends of the
  // instrument at once, which is the point — a guitar is a window onto this,
  // not the bottom of it. An odd number of spare strings puts the extra one on
  // top, where the strings are thinner and the diagram is less crowded.
  const belowE = strings => Math.floor((strings - GUITAR_STRINGS) / 2);

  // ?tuning=guitar puts standard tuning's one irregularity back: the string
  // above the G is a B, a major third up, where every other step is a fourth.
  // Everything from there up is therefore tuned a semitone low, so the same
  // note is found one fret further along. That is the whole of the difference,
  // and `drift` is the whole of how it is modelled — one fret, from the B
  // string up. Nothing about the scale or the tiling changes; only where the
  // neck puts it.
  const GUITAR_TUNING = params.get('tuning') === 'guitar';
  const gString = () => belowE(state.strings) + 3;
  const drift   = s => (GUITAR_TUNING && s > gString()) ? 1 : 0;

  const mod12  = n => ((n % 12) + 12) % 12;
  const openPc = s => mod12(LOW_PC + FOURTH * (s - belowE(state.strings)) - drift(s));
  // Frets run past both ends of the board when a box is being measured, so f
  // can be negative here as well.
  const pcAt   = (s, f) => mod12(openPc(s) + f);
  const isOn   = (s, f) => SCALE.includes(pcAt(s, f));
  const isGuitar = s => s >= belowE(state.strings) && s < belowE(state.strings) + GUITAR_STRINGS;

  // ---------------------------------------------------------------------
  // Boxes
  //
  // A box is a run of neighbouring strings that all carry the scale at the
  // same two frets. Runs are maximal: one is only reported from the string it
  // starts on, and grows until a string breaks it. Nothing here filters by how
  // tall a run came out — the colour is decided by the fret gap alone, and the
  // fact that a 2-fret gap always spans three strings while a 3-fret gap
  // always spans two is a property of the scale, not something this code
  // imposes. Runs that come out shorter are ones the edge of the board cut off.
  //
  // The fret sweep deliberately starts before the nut and ends past the last
  // fret: a tile with one side off the end of the board is still a tile, and
  // dropping it would leave a hole exactly where the page is claiming the
  // pattern runs on. Those come out as a shape reaching off the edge, which
  // the SVG viewport cuts — so a part-tile is drawn as a part-tile. A tile
  // with every side off the board has nothing to show and is skipped.
  //
  // The sweep runs in "fourths space": u is the fret a note would sit at if
  // the neck ran in straight fourths all the way up, and string s draws it at
  // u + drift(s). In the default tuning drift is nought everywhere and u is
  // simply the fret. With a guitar's B string in the way it is one from there
  // up, and a run that straddles it comes out bent rather than square — which
  // is the whole point of the comparison, and needs no separate search: the
  // tiles are the same tiles, found the same way, drawn where the tuning
  // actually puts them.
  // ---------------------------------------------------------------------
  function findBoxes(strings, gap){
    const pair = (s, u) => s >= 0 && s < strings &&
      isOn(s, u + drift(s)) && isOn(s, u + drift(s) + gap);
    // Drawn if any one of its strings has part of it on the board.
    const onBoard = (s0, s1, u) => {
      for(let s = s0; s <= s1; s++){
        const f = u + drift(s);
        if(f + gap >= 0 && f <= FRET_COUNT) return true;
      }
      return false;
    };
    const out = [];
    for(let s = 0; s < strings; s++){
      for(let u = -gap - 1; u <= FRET_COUNT; u++){
        if(!pair(s, u) || pair(s - 1, u)) continue;   // not where this run starts
        let e = s;
        while(pair(e + 1, u)) e++;
        if(onBoard(s, e, u)) out.push({gap, u1: u, u2: u + gap, s0: s, s1: e});
      }
    }
    return out;
  }

  // An outline through a list of corners, each one rounded off. Every tile is
  // drawn this way — a level one is four corners and a bent one eight — so the
  // bend costs a longer list of points rather than a second renderer.
  function roundedPath(pts, r){
    const back = (a, b) => {                       // r along a->b, never past halfway
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const t = Math.min(r, len / 2) / len;
      return (a[0] + dx * t).toFixed(1) + ' ' + (a[1] + dy * t).toFixed(1);
    };
    let d = '';
    for(let i = 0; i < pts.length; i++){
      const prev = pts[(i + pts.length - 1) % pts.length];
      const cur = pts[i], next = pts[(i + 1) % pts.length];
      d += (i ? 'L' : 'M') + back(cur, prev) +
           'Q' + cur[0].toFixed(1) + ' ' + cur[1].toFixed(1) + ' ' + back(cur, next);
    }
    return d + 'Z';
  }

  // ---------------------------------------------------------------------
  // Layout
  //
  // Frets are all the same width, unlike the trainer's neck, which tapers the
  // way a real one does. This board is a diagram of a pattern rather than a
  // picture of an instrument, and a taper would draw the repeating shapes at
  // visibly different sizes — precisely what the page is here to deny.
  // ---------------------------------------------------------------------
  const FRET_W = 46, ROW_H = 34, PAD_Y = 21, TOP_BAND = 22, GUTTER_W = 32;
  const NOTE_R = 12.5, ROOT_R = 14, OFF_R = 3.6, BOX_PAD = 16, BOX_R = 11;
  // The title sits above the fret numbers, inside the board's own SVG, so it
  // scales with the board and comes along in the wallpaper for free.
  const TITLE_H = 30, TITLE = 'A Minor / C Major Pentatonic Scale';
  const HEAD = TITLE_H + TOP_BAND;                // everything above the nut

  const xCenter = f => f * FRET_W + FRET_W / 2;
  const wireX   = f => (f + 1) * FRET_W;          // the wire that ends fret f

  // Wallpaper mode (?wallpaper): the diagram on its own, filling one 16:9
  // screen, so it can be screenshotted as a desktop background. Nothing is
  // redrawn at a second set of sizes — the same SVG keeps its viewBox and is
  // scaled up, so every line and label stays vector-crisp however big it goes.
  // ?strings= picks the width in the same mode, where the control is hidden.
  const WALLPAPER = params.has('wallpaper');
  const SHOT_W = 1920, SHOT_H = 1080;
  // Breathing room inside the frame, so the neck reads as a framed diagram on
  // a desktop rather than running off all four edges. The board is fitted to
  // what is left, and centred in the frame by the stylesheet.
  const SHOT_PAD = 80;

  // ?palette= : which two colours do the mixing. The values live in the
  // stylesheet; all this does is name one. Anything unrecognised falls back
  // to the first rather than leaving the board unpainted.
  const PALETTES = ['amethyst', 'ember', 'dusk', 'neon'];
  const palette = PALETTES.includes(params.get('palette')) ? params.get('palette') : PALETTES[0];

  const asked = +params.get('strings');
  const state = {
    strings: STRING_CHOICES.includes(asked) ? asked : 12,
    show: {primary: true, secondary: true},
  };

  const boardEl   = document.getElementById('fsBoard');
  const gutterEl  = document.getElementById('fsGutter');
  const stringsEl = document.getElementById('fsStrings');

  const SVGNS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, text){
    const e = document.createElementNS(SVGNS, tag);
    for(const k in attrs) if(attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if(text != null) e.textContent = text;
    return e;
  }

  // String 0 is the lowest and sits at the bottom, as on a chart of a neck
  // held horizontally. padY grows in wallpaper mode, so it is read rather
  // than closed over.
  let padY = PAD_Y;
  const rowY = s => HEAD + padY + (state.strings - 1 - s) * ROW_H;

  function render(){
    const n = state.strings;
    const svgW = (FRET_COUNT + 1) * FRET_W;

    // The box the board is fitted into: the whole frame less its margin in
    // wallpaper mode, and the board's own natural size otherwise.
    const fitW = SHOT_W - 2 * SHOT_PAD, fitH = SHOT_H - 2 * SHOT_PAD;

    padY = PAD_Y;
    if(WALLPAPER){
      // Whatever height that box has spare goes into the neck's own top and
      // bottom margin, so the neck fills it rather than being letterboxed
      // inside it. Never below the normal padding: with enough strings the
      // board is already the taller shape, and then the width is what gives
      // and the slack turns into extra margin at the sides.
      const want = ((GUTTER_W + svgW) * fitH / fitW - HEAD - (n - 1) * ROW_H) / 2;
      padY = Math.max(PAD_Y, want);
    }

    const neckTop = HEAD;
    const neckH = (n - 1) * ROW_H + 2 * padY;
    const svgH = neckTop + neckH;
    // One factor for both SVGs, so the gutter stays in step with the board.
    const k = WALLPAPER ? Math.min(fitW / (GUTTER_W + svgW), fitH / svgH) : 1;

    boardEl.setAttribute('width', svgW * k);
    boardEl.setAttribute('height', svgH * k);
    boardEl.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);
    boardEl.innerHTML = '';
    const frag = document.createDocumentFragment();

    frag.appendChild(el('text', {x:1, y:TITLE_H - 9, 'font-size':17,
      class:'fs-boardtitle'}, TITLE));

    frag.appendChild(el('rect', {x:0, y:neckTop, width:svgW, height:neckH, fill:'var(--neck)', rx:4}));

    for(let f = 1; f <= FRET_COUNT; f++){
      frag.appendChild(el('line', {x1:wireX(f-1), y1:neckTop+4, x2:wireX(f-1), y2:neckTop+neckH-4,
        stroke:'var(--fretwire)', 'stroke-width':1.4, opacity:.5}));
    }
    // The nut: the wire that closes the open-string column.
    frag.appendChild(el('line', {x1:wireX(0), y1:neckTop+2, x2:wireX(0), y2:neckTop+neckH-2,
      stroke:'var(--string)', 'stroke-width':4.5, opacity:.85}));

    const mid = neckTop + neckH / 2;
    for(const f of [3,5,7,9,15]){
      if(f <= FRET_COUNT) frag.appendChild(el('circle', {cx:xCenter(f), cy:mid, r:3.6, fill:'var(--inlay)'}));
    }
    if(FRET_COUNT >= 12){
      for(const dy of [-neckH/6, neckH/6]){
        frag.appendChild(el('circle', {cx:xCenter(12), cy:mid+dy, r:3.6, fill:'var(--inlay)'}));
      }
    }

    for(let f = 0; f <= FRET_COUNT; f++){
      frag.appendChild(el('text', {x:xCenter(f), y:HEAD-8, 'text-anchor':'middle',
        'font-size':10, class:'fs-fretnum'}, f));
    }

    // The guitar picked out of the longer neck: a lit band behind its six
    // strings, with a hairline along each edge. Skipped at six strings, where
    // the whole board is the guitar and the band would just be a frame.
    const gLo = belowE(n), gHi = gLo + GUITAR_STRINGS - 1;
    if(n > GUITAR_STRINGS){
      const bandTop = rowY(gHi) - ROW_H / 2, bandBot = rowY(gLo) + ROW_H / 2;
      frag.appendChild(el('rect', {x:0, y:bandTop, width:svgW, height:bandBot - bandTop,
        class:'fs-guitar-band'}));
      for(const y of [bandTop, bandBot]){
        frag.appendChild(el('line', {x1:0, y1:y, x2:svgW, y2:y, class:'fs-guitar-edge'}));
      }
    }

    for(let s = 0; s < n; s++){
      // Thicker at the bottom, thinning as the strings climb, but bounded —
      // a sixteen-string neck would otherwise end in a hair.
      const thickness = Math.max(0.9, 2.6 - s * 0.22);
      // The strings a guitar hasn't got are drawn a shade back, so the six
      // it has read as the instrument and the rest as the neck going on.
      const opacity = isGuitar(s) ? .95 : .4;
      const seg = (x1, x2) => frag.appendChild(el('line', {x1:x1, y1:rowY(s), x2:x2, y2:rowY(s),
        stroke:'var(--string)', 'stroke-width':thickness, opacity:opacity}));

      // Drawn in segments, broken around everything that sits on it: the
      // note chips, and the bare dots where the scale is silent. Both are
      // part-transparent, and a line ruled straight through them reads as a
      // line across the marker rather than as a string behind it. Behind the
      // opaque chips the break is invisible anyway, so breaking at every
      // square is simpler than picking out the ones that would show it.
      let x = 0;
      for(let f = 0; f <= FRET_COUNT; f++){
        const pc = pcAt(s, f);
        const named = SCALE.includes(pc) || PARENT_EXTRA.includes(pc);
        // Out to the far edge of the marker's own outline, so no sliver of
        // string is left showing against it.
        const r = (named ? (pc === ROOT_PC ? ROOT_R : NOTE_R) : OFF_R) + 0.8;
        const cx = xCenter(f);
        if(cx - r > x) seg(x, cx - r);
        x = cx + r;
      }
      if(x < svgW) seg(x, svgW);
    }

    // Overlays sit above the neck but below the notes, so a shaded box never
    // costs you the note names it is drawn around.
    const boxes = el('g', {id:'fsBoxes'});
    for(const {kind, gap} of KINDS){
      for(const b of findBoxes(n, gap)){
        const xL = s => xCenter(b.u1 + drift(s)) - BOX_PAD;
        const xR = s => xCenter(b.u2 + drift(s)) + BOX_PAD;
        const yBot = rowY(b.s0) + BOX_PAD, yTop = rowY(b.s1) - BOX_PAD;
        const bent = drift(b.s0) !== drift(b.s1);
        let pts;
        if(!bent){
          pts = [[xL(b.s0), yTop], [xR(b.s0), yTop], [xR(b.s0), yBot], [xL(b.s0), yBot]];
        } else {
          // The run straddles the B string: the strings above it carry the
          // tile a fret further along, so each side leans across the gap on
          // a straight diagonal instead of turning two right angles. The
          // diagonal runs from one string's line to the next, which is the
          // steepest it can be — carrying the full fret of offset over the
          // row's own height — while still meeting each string square on,
          // where that string's two notes actually are.
          let q = b.s0;
          while(drift(q) === drift(b.s0)) q++;
          const yLow = rowY(q - 1), yHigh = rowY(q);
          pts = [[xL(b.s1), yTop],  [xR(b.s1), yTop], [xR(b.s1), yHigh], [xR(b.s0), yLow],
                 [xR(b.s0), yBot], [xL(b.s0), yBot], [xL(b.s0), yLow],   [xL(b.s1), yHigh]];
        }
        boxes.appendChild(el('path', {
          d: roundedPath(pts, BOX_R),
          class: 'fs-box fs-box-' + kind,
          'data-kind': kind,
          'data-gap': gap,
          // Where the tile sits on its lowest string; a bent one is a fret
          // further along on every string above the B.
          'data-fret-lo': b.u1 + drift(b.s0),
          'data-fret-hi': b.u2 + drift(b.s0),
          'data-string-lo': b.s0,
          'data-string-hi': b.s1,
          'data-span': b.s1 - b.s0 + 1,
          'data-bent': bent ? '1' : null,
          // `display` rather than the HTML `hidden` attribute: this is SVG,
          // where only the presentation attribute is reliably honoured.
          display: state.show[kind] ? null : 'none',
        }));
      }
    }
    frag.appendChild(boxes);

    const notes = el('g', {id:'fsNotes'});
    for(let s = 0; s < n; s++){
      for(let f = 0; f <= FRET_COUNT; f++){
        const pc = pcAt(s, f), on = SCALE.includes(pc), root = pc === ROOT_PC;
        const extra = !on && PARENT_EXTRA.includes(pc);
        const cx = xCenter(f), cy = rowY(s);
        const g = el('g', {class:'fs-note' + (on ? (root ? ' on root' : ' on') : extra ? ' extra' : ''),
          'data-string': s, 'data-fret': f, 'data-pc': pc,
          'data-note': on || extra ? PC_NAME[pc] : ''});

        // A named note is drawn the same way whether it belongs to the
        // pentatonic or only to the parent scale; the half transparency is the
        // whole of the difference, and it comes from the class, not from here.
        if(on || extra){
          g.appendChild(el('circle', {cx:cx, cy:cy, r: root ? ROOT_R : NOTE_R,
            class:'fs-dot' + (root ? ' fs-dot-root' : '')}));
          // Three characters rather than one or two, so the type is smaller
          // than a note name would need to be to sit inside the same chip.
          g.appendChild(el('text', {x:cx, y:cy + 3.7, 'text-anchor':'middle',
            'font-size': root ? 11.5 : 10.5, 'font-weight': root ? 600 : 500,
            class:'fs-name'}, degreeLabel(pc)));
        } else {
          g.appendChild(el('circle', {cx:cx, cy:cy, r:OFF_R, class:'fs-dot-off'}));
        }
        notes.appendChild(g);
      }
    }
    frag.appendChild(notes);
    boardEl.appendChild(frag);

    gutterEl.setAttribute('width', GUTTER_W * k);
    gutterEl.setAttribute('height', svgH * k);
    gutterEl.setAttribute('viewBox', '0 0 ' + GUTTER_W + ' ' + svgH);
    gutterEl.innerHTML = '';
    const gFrag = document.createDocumentFragment();
    // Now that the guitar is somewhere in the middle, something has to say
    // where: one pill down the six names it has, the rest dimmed and bare.
    // One pill rather than six, so the group reads as a single instrument
    // rather than six strings that happen to be marked the same way.
    gFrag.appendChild(el('rect', {x:GUTTER_W/2 - 11, y:rowY(gHi) - 13,
      width:22, height:(gHi - gLo) * ROW_H + 26, rx:11, class:'fs-open-pill'}));

    for(let s = 0; s < n; s++){
      const guitar = isGuitar(s);
      gFrag.appendChild(el('text', {x:GUTTER_W/2, y:rowY(s), 'text-anchor':'middle',
        'dominant-baseline':'central', 'font-size':11.5,
        class:'fs-open' + (guitar ? ' fs-open-guitar' : ''),
        'data-string': s, 'data-guitar': guitar ? '1' : ''}, PC_NAME[openPc(s)]));
    }

    // In guitar tuning, a small warning between the two string names either
    // side of the one step that is not a fourth. Drawn rather than typed: the
    // ⚠ glyph is a different size and sits on a different baseline in every
    // font, and this has to land in a 32-unit gutter.
    if(GUITAR_TUNING && gString() + 1 < n){
      const cy = (rowY(gString()) + rowY(gString() + 1)) / 2, cx = GUTTER_W / 2;
      const w = 13, h = 11.5;
      gFrag.appendChild(el('path', {
        d: 'M' + cx + ' ' + (cy - h / 2) + 'L' + (cx + w / 2) + ' ' + (cy + h / 2) +
           'L' + (cx - w / 2) + ' ' + (cy + h / 2) + 'Z',
        class:'fs-warn'}));
      gFrag.appendChild(el('text', {x:cx, y:cy + h / 2 - 1.9, 'text-anchor':'middle',
        'font-size':8, 'font-weight':700, class:'fs-warn-mark'}, '!'));
    }
    gutterEl.appendChild(gFrag);
  }

  // ---------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------
  if(WALLPAPER) document.body.classList.add('fs-wallpaper');
  if(GUITAR_TUNING) document.body.classList.add('fs-guitar');
  document.body.classList.add('fs-pal-' + palette);

  // The two tunings are one link apart, and the link is the state: which neck
  // you are looking at lives in the URL, as it does elsewhere on the site.
  const link = document.getElementById('fsTuningLink');
  if(link){
    link.href = GUITAR_TUNING ? '/fretscience' : '/fretscience?tuning=guitar';
    link.textContent = GUITAR_TUNING
      ? 'Back to the neck in straight fourths →'
      : 'See the same neck with a guitar’s B string in it →';
  }

  for(const n of STRING_CHOICES){
    const o = document.createElement('option');
    o.value = n; o.textContent = n;
    stringsEl.appendChild(o);
  }
  stringsEl.value = state.strings;
  stringsEl.addEventListener('change', () => {
    state.strings = +stringsEl.value;
    render();
  });

  for(const btn of document.querySelectorAll('.fs-leg')){
    btn.addEventListener('click', () => {
      const kind = btn.dataset.kind;
      state.show[kind] = !state.show[kind];
      btn.setAttribute('aria-pressed', String(state.show[kind]));
      render();
    });
  }

  render();
})();
