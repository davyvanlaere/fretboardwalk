(function(){
  "use strict";

  // The spelling and the two sentences are fifths.js, shared with the key quiz.
  const {spell, scaleOf, signatureOf, MNEMONICS, ascii, howMany, list} = window.Fifths;

  // Every key a signature can spell, up to seven sharps or flats, grouped the
  // way the page explains them.
  const GROUPS = [
    ['No sharps or flats', [0]],
    ['Sharp keys', [1, 2, 3, 4, 5, 6, 7]],
    ['Flat keys', [-1, -2, -3, -4, -5, -6, -7]],
  ];

  const keyEl      = document.getElementById('ksKey');
  const sentenceEl = document.getElementById('ksSentence');
  const stepsEl    = document.getElementById('ksSteps');
  const resultEl   = document.getElementById('ksResult');
  const scaleEl    = document.getElementById('ksScale');

  keyEl.innerHTML = GROUPS.map(([label, keys]) => `<optgroup label="${label}">` +
    keys.map(p => `<option value="${p}">${spell(p)} major</option>`).join('') + '</optgroup>').join('');

  // The rule, spelled out for one key. `said` is the words it takes, each
  // with its note: "Father (F♯)".
  function steps(root, said){
    const name = spell(root);
    if(root === 0) return [
      'C major sits at the top of the circle of fifths: no sharps, no flats — nothing to say.',
    ];
    if(root > 0) return [
      `${name} major takes sharps: there's no ♭ in its name, and it isn't F.`,
      `Its last sharp is the note a half step below ${name}: ${spell(root + 5)}.`,
      `So say the sentence up to ${spell(root + 5)}: ${list(said)}.`,
    ];
    if(root === -1) return [
      'F major is the one flat key without a ♭ in its name.',
      'It has a single flat, so there\'s no second-to-last to look for — it\'s the one to know by heart.',
      `So it's just the first word: ${said[0]}.`,
    ];
    return [
      `${name} major takes flats: there's a ♭ in its name.`,
      `Its second-to-last flat is its own name, ${name}.`,
      `So say the sentence up to ${name}, then one more: ${list(said)}.`,
    ];
  }

  function show(root){
    const n = Math.abs(root);
    const dir = root < 0 ? -1 : 1;           // C shows the sharps sentence, unsaid
    const words = MNEMONICS[dir].split(' ');
    const notes = signatureOf(7 * dir);      // the whole sentence's notes

    // Every word of the sentence: the ones this key says lit, where it stops
    // marked, and for a flat key the word that is its own name.
    sentenceEl.innerHTML = words.map((word, i) => {
      const stop = i === n - 1, isName = dir < 0 && n > 1 && i === n - 2;
      const cls = (i < n ? 'on' : 'off') + (stop ? ' stop' : '') + (isName ? ' name' : '');
      const tag = stop ? 'stop' : isName ? 'the key' : '';
      return `<span class="ks-word ${cls}" data-word="${word}" data-note="${spell(notes[i])}">` +
             `<b>${spell(notes[i])}</b>${word}${tag ? `<i>${tag}</i>` : ''}</span>`;
    }).join('');

    const said = words.slice(0, n).map((word, i) => `${word} (${spell(notes[i])})`);
    stepsEl.innerHTML = steps(root, said).map(s => `<li>${s}</li>`).join('');
    resultEl.textContent = `${spell(root)} major has ${howMany(root)}` +
      (n ? `: ${list(signatureOf(root).map(spell))}.` : '.');

    const signature = new Set(signatureOf(root));
    scaleEl.innerHTML = scaleOf(root).map(p =>
      `<span class="deg${p === root ? ' root' : signature.has(p) ? ' seek' : ''}">${spell(p)}</span>`).join(' ');
  }

  keyEl.addEventListener('change', () => show(+keyEl.value));

  // ?key=D, ?key=Eb, ?key=F%23 picks the example's key — it's how the key quiz
  // links here. Otherwise D major, the page's own first example.
  const param = new URLSearchParams(location.search).get('key');
  const start = GROUPS.flatMap(([, keys]) => keys).find(p => ascii(p) === param);
  keyEl.value = String(start !== undefined ? start : 2);
  show(+keyEl.value);

})();
