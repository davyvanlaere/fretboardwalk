(function(){
  "use strict";

  // ---------- the music ----------
  // Spelling and key signatures are fifths.js, shared with the key signatures
  // guide: every note is a place on the line of fifths.
  const {mod, letterOf, spell, posOf, scaleOf, signatureOf, MNEMONICS, ascii, howMany, list} = window.Fifths;

  // The reverse of Fifths.addedAt: the step that brings an accidental in, or
  // null for a natural.
  function stepOf(p){
    if(p >= 6) return {dir: 1, step: p - 5};
    if(p <= -2) return {dir: -1, step: -1 - p};
    return null;
  }

  // The trainer's twelve keys (script.js), in circle order from C: sharps up
  // to F♯, flats from D♭.
  const KEYS = [0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1];

  // The circle as the usual chart prints it. Same spots as KEYS, but with G♭
  // at the bottom; F♯ is shown there as its second spelling.
  const CHART = [0, 1, 2, 3, 4, 5, -6, -5, -4, -3, -2, -1];

  const CHOICES = [[1, '♯', 'sharp'], [0, '♮', 'natural'], [-1, '♭', 'flat']];
  const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];

  let root = null, streak = 0;
  const keyName = () => spell(root) + ' major';

  // ---------- DOM ----------
  const cardEl    = document.getElementById('kqCard');
  const keyEl     = document.getElementById('kqKey');
  const streakEl  = document.getElementById('kqStreak');
  const formEl    = document.getElementById('kqForm');
  const slotsEl   = document.getElementById('kqSlots');
  const checkEl   = document.getElementById('kqCheck');
  const verdictEl = document.getElementById('kqVerdict');
  const whyEl     = document.getElementById('kqWhy');
  const circleEl  = document.getElementById('kqCircle');
  const scaleEl   = document.getElementById('kqScale');
  const explainEl = document.getElementById('kqExplain');
  const nextEl    = document.getElementById('kqNext');

  // ---------- asking ----------
  // One column per letter, in scale order from the root. Every major key uses
  // each letter once, so the letters are given and only the accidentals are
  // asked — which is exactly the question the circle of fifths answers.
  function renderSlots(){
    slotsEl.innerHTML = scaleOf(root).map((p, i) => {
      const letter = letterOf(p);
      if(i === 0){
        // The question already names the root, so it isn't asked for.
        return `<div class="kq-slot root" data-letter="${letter}"><div class="kq-note">${spell(root)}</div>` +
               `<div class="kq-root">root</div><div class="kq-deg">1</div></div>`;
      }
      const buttons = CHOICES.map(([acc, sign, word]) =>
        `<label class="kq-acc"><input type="radio" name="${letter}" value="${acc}" ` +
        `aria-label="${letter} ${word}"${acc ? '' : ' checked'}><span>${sign}</span></label>`).join('');
      return `<div class="kq-slot" data-letter="${letter}" role="radiogroup" aria-label="${letter}">` +
             `<div class="kq-note">${letter}</div>${buttons}<div class="kq-deg">${i + 1}</div></div>`;
    }).join('');
  }

  slotsEl.addEventListener('change', e => {
    const slot = e.target.closest('.kq-slot');
    slot.querySelector('.kq-note').textContent = spell(posOf(slot.dataset.letter, +e.target.value));
  });

  function ask(p){
    root = p;
    keyEl.textContent = keyName();
    renderSlots();
    say('', '');
    whyEl.hidden = true;
    checkEl.disabled = false;
  }

  function randomKey(){
    const others = KEYS.filter(p => p !== root);
    return others[Math.floor(Math.random() * others.length)];
  }

  function nextKey(){
    ask(randomKey());
    slotsEl.querySelector('input:checked').focus({preventScroll: true});
  }

  function say(kind, text){
    verdictEl.className = 'kq-verdict ' + kind;
    verdictEl.textContent = text;
  }

  function setStreak(n){
    streak = n;
    streakEl.textContent = n;
  }

  // ---------- checking ----------
  formEl.addEventListener('submit', e => {
    e.preventDefault();
    if(checkEl.disabled) return;
    checkEl.disabled = true;

    const notes = scaleOf(root);
    const answer = [...slotsEl.children].map((slot, i) => {
      const want = notes[i];
      const picked = slot.querySelector('input:checked');
      return {slot, want, got: picked ? posOf(slot.dataset.letter, +picked.value) : want};
    });
    for(const a of answer){
      a.slot.classList.add(a.got === a.want ? 'ok' : 'bad');
      for(const input of a.slot.querySelectorAll('input')){
        input.disabled = true;
        // In a missed column, ring the accidental it needed.
        if(a.got !== a.want && posOf(a.slot.dataset.letter, +input.value) === a.want){
          input.parentNode.classList.add('want');
        }
      }
    }

    const wrong = answer.filter(a => a.got !== a.want);
    if(!wrong.length){
      setStreak(streak + 1);
      say('ok', `Right — ${keyName()} is ${scaleOf(root).map(spell).join(' ')}.`);
      setTimeout(nextKey, 1200);
      return;
    }
    setStreak(0);
    say('miss', `Not quite — ${keyName()} has ${list(wrong.map(a => spell(a.want)))}, ` +
                `not ${list(wrong.map(a => spell(a.got)))}.`);
    drawCircle(wrong);
    // The right answer in full under the circle, the ones you missed in amber.
    // No key name in front: the circle's centre already says it.
    scaleEl.innerHTML = scaleOf(root).map(p =>
      tok(p, p === root ? 'root' : wrong.some(a => a.want === p) ? 'seek' : '')).join(' ');
    explainEl.innerHTML = explain(wrong);
    whyEl.hidden = false;
    whyEl.scrollIntoView({block: 'nearest'});
    nextEl.focus({preventScroll: true});
  });

  nextEl.addEventListener('click', () => {
    nextKey();
    cardEl.scrollIntoView({block: 'nearest'});
  });

  // ---------- explaining ----------
  const tok = (p, cls) => `<span class="deg${cls ? ' ' + cls : ''}">${spell(p)}</span>`;
  // Its initials picked out, since they are the point: they spell the order.
  const mnemonic = s => `<em class="kq-mnemonic">${s.replace(/(^|\s)(\w)/g, '$1<b>$2</b>')}</em>`;
  // "the second step, G → D"
  const stepName = ({dir, step}) =>
    `the ${ORDINALS[step - 1]} step, ${spell(dir * (step - 1))} → ${spell(dir * step)}`;

  function explain(wrong){
    const n = Math.abs(root), dir = Math.sign(root);
    const lines = [];

    if(n){
      lines.push(`${keyName()} is ${n} step${n > 1 ? 's' : ''} ${dir > 0 ? 'clockwise' : 'counter-clockwise'} ` +
                 `from C. Each step that way adds a ${dir > 0 ? 'sharp' : 'flat'} — ` +
                 `${list(signatureOf(root).map(spell), ', then ')} — so ${keyName()} has ${howMany(root)}.`);
    } else {
      lines.push(`${keyName()} sits at the top of the circle: no steps from C, so no sharps or flats.`);
    }

    for(const a of wrong){
      const needed = stepOf(a.want), yours = stepOf(a.got);
      if(needed){
        lines.push(`${tok(a.want, 'seek')} is added at ${stepName(needed)} — so ${keyName()} has it.`);
      }
      // A wrong accidental is never among the key's own steps: it's either
      // further round the same way, or on the other side of C.
      if(yours && yours.dir === dir){
        const past = yours.step - n;
        lines.push(`${tok(a.got, 'miss')} isn't added until ${stepName(yours)} — ` +
                   `${past} step${past > 1 ? 's' : ''} past ${keyName()}.`);
      } else if(yours){
        lines.push(`${tok(a.got, 'miss')} is a ${yours.dir > 0 ? 'sharp' : 'flat'}: those are added ` +
                   `${yours.dir > 0 ? 'clockwise' : 'counter-clockwise'}, and it only comes in at ${stepName(yours)}.`);
      }
    }

    // Each side's order and its sentence: for the key's own side, and for any
    // side one of your accidentals strayed to.
    const sides = new Set(wrong.map(a => stepOf(a.got)).filter(Boolean).map(s => s.dir));
    if(dir) sides.add(dir);
    for(const side of [1, -1].filter(s => sides.has(s))){
      const order = signatureOf(7 * side).map(spell).join(' ');
      lines.push(`${side > 0 ? 'Sharps' : 'Flats'} always arrive in the same order, ${order} — ` +
                 `${mnemonic(MNEMONICS[side])} — so knowing how many tells you which.`);
    }
    // Where the sentences are explained properly, with this key already picked.
    lines.push(`<a href="/key-signatures?key=${encodeURIComponent(ascii(root))}">` +
               `The Father Charles approach, in full →</a>`);
    return lines.map(l => `<p>${l}</p>`).join('');
  }

  // ---------- the circle ----------
  const SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, text){
    const e = document.createElementNS(SVGNS, tag);
    for(const k in attrs) e.setAttribute(k, attrs[k]);
    if(text !== undefined) e.textContent = text;
    return e;
  }

  // viewBox units. Spots count clockwise from C at the top, 30° apart; the
  // step pills sit just outside the ring.
  const MID = 180;
  const R_IN = 55, R_MID = 94, R_OUT = 136;
  const R_MINOR = 74.5, R_MAJOR = 110, R_SECOND = 127, R_STEP = 158;

  function at(spot, r){
    const a = spot * Math.PI / 6;
    return {x: +(MID + r * Math.sin(a)).toFixed(1), y: +(MID - r * Math.cos(a)).toFixed(1)};
  }

  // One 30° wedge of a ring.
  function sector(spot, r0, r1){
    const a = at(spot - .5, r1), b = at(spot + .5, r1), c = at(spot + .5, r0), d = at(spot - .5, r0);
    return `M${a.x} ${a.y}A${r1} ${r1} 0 0 1 ${b.x} ${b.y}L${c.x} ${c.y}A${r0} ${r0} 0 0 0 ${d.x} ${d.y}Z`;
  }

  // A key name with its accidental raised and small, as the chart prints it.
  // The sign's lift is in its own (smaller) ems, so whatever follows it — the
  // m of a minor — drops back by the same distance in the parent's.
  function label(parent, spot, r, cls, text){
    const p = at(spot, r);
    const t = el('text', {x: p.x, y: p.y, class: cls, 'dominant-baseline': 'central'}, text[0]);
    if(text.length > 1){
      if(/[♯♭]/.test(text[1])){
        t.appendChild(el('tspan', {class: 'kq-sup', dy: '-.5em'}, text[1]));
        if(text.length > 2) t.appendChild(el('tspan', {dy: '.34em'}, text.slice(2)));
      } else {
        t.appendChild(document.createTextNode(text.slice(1)));
      }
    }
    parent.appendChild(t);
  }

  function drawCircle(wrong){
    const frag = document.createDocumentFragment();

    for(let spot = 0; spot < 12; spot++){
      const major = CHART[spot], minor = spell(major + 3) + 'm';   // relative minor: its 6th
      const g = el('g', {class: 'kq-node' + (spot === mod(root, 12) ? ' key' : ''),
        'data-note': spell(major), 'data-minor': minor});
      g.appendChild(el('path', {class: 'kq-out', d: sector(spot, R_MID, R_OUT)}));
      g.appendChild(el('path', {class: 'kq-in', d: sector(spot, R_IN, R_MID)}));
      label(g, spot, R_MAJOR, 'kq-maj', spell(major));
      // The spot's other spelling, where that's still a key of at most seven
      // accidentals: C♭ beside B, F♯ beside G♭, C♯ beside D♭.
      const second = major + (major > 0 ? -12 : 12);
      if(Math.abs(second) <= 7){
        g.setAttribute('data-second', spell(second));
        label(g, spot, R_SECOND, 'kq-second', spell(second));
      }
      label(g, spot, R_MINOR, 'kq-min', minor);
      frag.appendChild(g);
    }

    // The walk from C: a pill on each key it steps to, naming what that step
    // adds; then each wrong accidental of yours, on the step that adds it.
    const pills = signatureOf(root).map(p => ({p, cls: wrong.some(a => a.want === p) ? ' missed' : ''}));
    for(const a of wrong) if(stepOf(a.got)) pills.push({p: a.got, cls: ' extra'});
    for(const pill of pills){
      const s = stepOf(pill.p);
      pill.spot = mod(s.dir * s.step, 12);
    }
    for(const pill of pills){
      // Two on one key (a rare pairing like A♯ and F♭) sit side by side.
      const shared = pills.filter(q => q.spot === pill.spot);
      const nudge = shared.length > 1 ? (shared[0] === pill ? -.24 : .24) : 0;
      const c = at(pill.spot + nudge, R_STEP);
      const g = el('g', {class: 'kq-step' + pill.cls, 'data-note': spell(pill.p), 'data-at': spell(CHART[pill.spot])});
      g.appendChild(el('rect', {x: c.x - 17, y: c.y - 10, width: 34, height: 20, rx: 10}));
      g.appendChild(el('text', {x: c.x, y: c.y, 'dominant-baseline': 'central'}, '+' + spell(pill.p)));
      frag.appendChild(g);
    }

    frag.appendChild(el('text', {x: MID, y: MID - 7, class: 'kq-centre-key'}, keyName()));
    frag.appendChild(el('text', {x: MID, y: MID + 13, class: 'kq-centre-sig'}, howMany(root)));

    circleEl.innerHTML = '';
    circleEl.appendChild(frag);
    circleEl.setAttribute('aria-label', `Circle of fifths with ${keyName()} highlighted: ${howMany(root)}` +
      (root ? `, added one per step from C: ${list(signatureOf(root).map(spell))}` : '') + '.');
  }

  // ---------- init ----------
  // ?key=D, ?key=Eb, ?key=F%23 pins the first question — for specs, and for
  // looking at one key's explanation by hand.
  const pinned = new URLSearchParams(location.search).get('key');
  const asked = KEYS.find(p => ascii(p) === pinned);
  ask(asked !== undefined ? asked : randomKey());

})();
