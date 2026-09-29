/* The line of fifths: the one number behind every spelling on the key pages
   (the key quiz and the key signatures guide). Each loads this first.

   C is 0; each fifth up is +1 (G 1, D 2 … F♯ 6, C♯ 7) and each fifth down −1
   (F −1, B♭ −2 … G♭ −6). For a key's root that number IS its key signature —
   +2 is two sharps, −3 three flats — and the circle of fifths is the same line
   wrapped round at 12. Spelling, key signatures and the diagrams all fall out
   of that, so there is no per-key table to get wrong. */
window.Fifths = (function(){
  "use strict";

  const LETTERS = 'FCGDAEB';                 // the naturals, at −1 … 5
  const SIGN = {'-1':'♭', '0':'', '1':'♯'};
  const mod = (n, m) => ((n % m) + m) % m;

  const letterOf = p => LETTERS[mod(p + 1, 7)];
  const spell    = p => letterOf(p) + SIGN[Math.floor((p + 1) / 7)];
  const posOf    = (letter, acc) => LETTERS.indexOf(letter) - 1 + 7 * acc;

  // Degrees 1–7 as steps from the root along the line, in scale order.
  const DEGREE_STEPS = [0, 2, 4, -1, 1, 3, 5];
  // A key's notes, root first.
  const scaleOf = root => DEGREE_STEPS.map(s => root + s);

  // Walking round the circle from C, each step clockwise adds one sharp (the
  // new key's 7th) and each step counter-clockwise one flat (the new key's
  // 4th): F♯ C♯ G♯ D♯ A♯ E♯ B♯ one way, B♭ E♭ A♭ D♭ G♭ C♭ F♭ the other.
  const addedAt = (dir, step) => dir > 0 ? 5 + step : -1 - step;
  // A key's sharps or flats, in the order it picks them up.
  const signatureOf = root =>
    Array.from({length: Math.abs(root)}, (_, i) => addedAt(Math.sign(root), i + 1));
  // Both orders are usually remembered as one sentence, read both ways.
  const MNEMONICS = {'1': 'Father Charles Goes Down And Ends Battle', '-1': "Battle Ends And Down Goes Charles's Father"};

  // Key names in URLs are ASCII: ?key=Eb, ?key=F%23.
  const ascii = p => spell(p).replace('♯', '#').replace('♭', 'b');

  // The words both pages put these in: "2 sharps", "1 flat", "no sharps or
  // flats"; and "F♯, C♯ and G♯".
  function howMany(root){
    const n = Math.abs(root);
    return n ? `${n} ${root > 0 ? 'sharp' : 'flat'}${n > 1 ? 's' : ''}` : 'no sharps or flats';
  }
  const list = (xs, last = ' and ') =>
    xs.length > 1 ? xs.slice(0, -1).join(', ') + last + xs[xs.length - 1] : xs[0];

  return {mod, letterOf, spell, posOf, scaleOf, addedAt, signatureOf, MNEMONICS, ascii, howMany, list};
})();
