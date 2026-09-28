(function(){
  "use strict";

  // ---------- the music ----------
  // One number does all the work: a note's place on the line of fifths. C is
  // 0; each fifth up is +1 (G 1, D 2 … F♯ 6, C♯ 7) and each fifth down −1
  // (F −1, B♭ −2 … G♭ −6). For a key's root that number IS its key signature
  // — +2 is two sharps, −3 three flats. The circle of fifths is the same line
  // wrapped round at 12, and a major key is the seven neighbours running from
  // one step below its root to five above. Spelling, key signature and the
  // diagram all fall out of that, so there is no per-key table to get wrong.
  const LETTERS = 'FCGDAEB';                 // the naturals, at −1 … 5
  const SIGN = {'-1':'♭', '0':'', '1':'♯'};
  const mod = (n, m) => ((n % m) + m) % m;

  const letterOf = p => LETTERS[mod(p + 1, 7)];
  const spell    = p => letterOf(p) + SIGN[Math.floor((p + 1) / 7)];
  const posOf    = (letter, acc) => LETTERS.indexOf(letter) - 1 + 7 * acc;

  // Degrees 1–7 as steps from the root along that line. In step order they
  // read 4 1 5 2 6 3 7 — the trainer's across-the-strings sequence, backwards.
  const DEGREE_STEPS = [0, 2, 4, -1, 1, 3, 5];

  // The trainer's twelve keys (script.js), in circle order from C: sharps up
  // to F♯, flats from D♭. They double as the circle's labels outside the key.
  const KEYS = [0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1];

  const CHOICES = [[1, '♯', 'sharp'], [0, '♮', 'natural'], [-1, '♭', 'flat']];

  let root = null, streak = 0;
  const keyName = () => spell(root) + ' major';

  // The key's note at a spot on the circle (0 = C at the top, clockwise), or
  // undefined when that spot is outside the key.
  function keyNoteAt(spot){
    const p = root - 1 + mod(spot - root + 1, 12);
    return p <= root + 5 ? p : undefined;
  }

  // The key's notes clockwise round the circle, from its 4 to its 7.
  const arcNotes = () => Array.from({length: 7}, (_, k) => spell(root - 1 + k)).join(' ');

  function signature(){
    const n = Math.abs(root);
    return n ? `${n} ${root > 0 ? 'sharp' : 'flat'}${n > 1 ? 's' : ''}` : 'no sharps or flats';
  }

  const list = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0];

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
  const explainEl = document.getElementById('kqExplain');
  const nextEl    = document.getElementById('kqNext');

  // ---------- asking ----------
  // One column per letter, in scale order from the root. Every major key uses
  // each letter once, so the letters are given and only the accidentals are
  // asked — which is exactly the question the circle of fifths answers.
  function renderSlots(){
    slotsEl.innerHTML = DEGREE_STEPS.map((step, i) => {
      const letter = letterOf(root + step);
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

    const answer = [...slotsEl.children].map((slot, i) => {
      const want = root + DEGREE_STEPS[i];
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
      say('ok', `Right — ${keyName()} is ${DEGREE_STEPS.map(s => spell(root + s)).join(' ')}.`);
      setTimeout(nextKey, 1200);
      return;
    }
    setStreak(0);
    say('miss', `Not quite — ${keyName()} has ${list(wrong.map(a => spell(a.want)))}, ` +
                `not ${list(wrong.map(a => spell(a.got)))}.`);
    drawCircle(wrong);
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

  function explain(wrong){
    const lines = [];

    // A wrong accidental is always seven steps off along the line, so outside
    // the key's arc — unless it wraps round to the pitch of a note the key
    // already has under another letter (G♭ for F♯, E♯ for F, B♯ for C).
    const outside = wrong.filter(a => keyNoteAt(mod(a.got, 12)) === undefined);
    if(outside.length){
      lines.push(`${list(outside.map(a => tok(a.got, 'miss')))} ${outside.length > 1 ? 'are' : 'is'} ` +
                 `outside the arc — the arc has ${list(outside.map(a => tok(a.want, 'seek')))}.`);
    }
    for(const a of wrong){
      const twin = keyNoteAt(mod(a.got, 12));
      if(twin === undefined) continue;
      lines.push(`${tok(a.got, 'miss')} sounds the same as ${tok(twin)}, which the arc already has. ` +
                 `Each letter appears exactly once, so this one has to be ${tok(a.want, 'seek')}.`);
    }

    lines.push(`That arc is the key. A major key's seven notes sit side by side on the circle of fifths: ` +
               `one step counter-clockwise of the root, the root, then five steps clockwise — ` +
               `for ${keyName()}, <strong>${arcNotes()}</strong>.`);

    const n = Math.abs(root);
    if(!n){
      lines.push(`C sits at the top of the circle, so ${keyName()} has no sharps or flats.`);
    } else {
      // Each step clockwise sharpens one more note and each step back flattens
      // one: F♯ C♯ G♯ … and B♭ E♭ A♭ …, the circle itself again.
      const accs = Array.from({length: n}, (_, k) => spell(root > 0 ? 6 + k : -2 - k));
      lines.push(`Shortcut: ${spell(root)} is ${n} step${n > 1 ? 's' : ''} ` +
                 `${root > 0 ? 'clockwise' : 'counter-clockwise'} from C, so ${keyName()} has ` +
                 `${signature()}: ${list(accs)}.`);
    }
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

  // viewBox units. Spots count clockwise from C at the top, 30° apart; a
  // fractional spot lets the arc start and end halfway between two notes.
  const MID = 180, R = 116;
  function at(spot, r){
    const a = spot * Math.PI / 6;
    return {x: +(MID + r * Math.sin(a)).toFixed(1), y: +(MID - r * Math.cos(a)).toFixed(1)};
  }

  function drawCircle(wrong){
    const yours = new Map();                  // spot → your wrong spellings there
    for(const a of wrong){
      const spot = mod(a.got, 12);
      yours.set(spot, (yours.get(spot) || []).concat(spell(a.got)));
    }
    const needed = new Set(wrong.map(a => mod(a.want, 12)));

    const frag = document.createDocumentFragment();
    frag.appendChild(el('circle', {cx: MID, cy: MID, r: R, class: 'kq-ring'}));

    // The key: seven spots, from half a step before its 4 to half past its 7.
    // Always 210°, so both arcs take the long way round.
    const ro = R + 25, ri = R - 25;
    const a0 = at(root - 1.5, ro), a1 = at(root + 5.5, ro), b1 = at(root + 5.5, ri), b0 = at(root - 1.5, ri);
    frag.appendChild(el('path', {class: 'kq-arc',
      d: `M${a0.x} ${a0.y}A${ro} ${ro} 0 1 1 ${a1.x} ${a1.y}L${b1.x} ${b1.y}A${ri} ${ri} 0 1 0 ${b0.x} ${b0.y}Z`}));

    for(let spot = 0; spot < 12; spot++){
      const p = keyNoteAt(spot), inKey = p !== undefined, mine = yours.get(spot);
      // Inside the key a spot is spelled the key's way (E♯, not F, in F♯
      // major); outside it, as whatever you wrote there, else as a key name.
      const label = inKey ? spell(p) : mine ? mine.join('/') : spell(KEYS[spot]);
      const cls = ['kq-node'];
      if(inKey) cls.push('in');
      if(p === root) cls.push('root');
      if(needed.has(spot)) cls.push('needed');
      if(mine && !inKey) cls.push('wrong');

      const g = el('g', {class: cls.join(' '), 'data-note': label});
      const c = at(spot, R);
      g.appendChild(el('circle', {cx: c.x, cy: c.y, r: 18}));
      g.appendChild(el('text', {x: c.x, y: c.y, class: 'kq-name' + (label.length > 2 ? ' long' : ''),
        'dominant-baseline': 'central'}, label));
      if(inKey){
        const d = at(spot, R - 38);
        g.appendChild(el('text', {x: d.x, y: d.y, class: 'kq-num', 'dominant-baseline': 'central'},
          DEGREE_STEPS.indexOf(p - root) + 1));
      }
      if(mine && inKey){
        // You wrote this pitch, but under another letter — tag it on the
        // outside rather than pretend the key's own note is wrong.
        const t = at(spot, R + 42), tag = el('g', {class: 'kq-clash'});
        tag.appendChild(el('rect', {x: t.x - 17, y: t.y - 10, width: 34, height: 20, rx: 6}));
        tag.appendChild(el('text', {x: t.x, y: t.y, 'dominant-baseline': 'central'}, mine.join('/')));
        g.appendChild(tag);
      }
      frag.appendChild(g);
    }

    frag.appendChild(el('text', {x: MID, y: MID - 7, class: 'kq-centre-key'}, keyName()));
    frag.appendChild(el('text', {x: MID, y: MID + 15, class: 'kq-centre-sig'}, signature()));

    circleEl.innerHTML = '';
    circleEl.appendChild(frag);
    circleEl.setAttribute('aria-label', `Circle of fifths with ${keyName()} highlighted: ${arcNotes()}.`);
  }

  // ---------- init ----------
  // ?key=D, ?key=Eb, ?key=F%23 pins the first question — for specs, and for
  // looking at one key's explanation by hand.
  const pinned = new URLSearchParams(location.search).get('key');
  const asked = KEYS.find(p => spell(p).replace('♯', '#').replace('♭', 'b') === pinned);
  ask(asked !== undefined ? asked : randomKey());

})();
