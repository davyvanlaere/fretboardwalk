// "Chords In All Major Keys", the reference chart, transcribed row by row: the
// triads on I ii iii IV V vi vii° of every major key. Their roots are the
// key's notes, so this is the answer key the key pages (the quiz and the key
// signatures guide) are held to — written out from the chart, never derived
// the way the pages derive it.
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

module.exports = { CHORD_CHART, notesIn };
