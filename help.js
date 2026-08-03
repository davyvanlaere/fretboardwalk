/* Standalone "hear a scale" player for the help page.

   The help page doesn't load the game's script.js (that file is the whole
   trainer — it wires up the fretboard, state, and DOM the help page doesn't
   have). So this is a small, self-contained sampler that plays scales the
   SAME way the game does: the real recorded guitar samples in res/samples/,
   pitch-shifted with playbackRate. For each scale note it picks the nearest
   available sample (across all strings) and shifts by at most a couple of
   semitones, so it stays convincing. */
(function(){
  "use strict";

  // Open-string MIDI for each string, and the frets that were actually
  // recorded — identical to the game's sample grid.
  const STRING_MIDI = [40, 45, 50, 55, 59, 64];
  const SAMPLE_FRETS = [0, 6, 12];
  function pad2(n){ return String(n).padStart(2, '0'); }

  // Exactly the game's rule: play a fret from the nearest recorded sample on
  // the SAME string, pitch-shifted at most a few semitones. Keeping every note
  // of the scale on one string (rather than hopping to whichever string has the
  // closest sample) keeps the timbre consistent so it actually sounds like a
  // guitar playing a scale.
  function nearestSampleFret(f){
    if(f <= 3) return 0;
    if(f <= 9) return 6;
    return 12;
  }

  // Highest string whose open note is at or below the root, so the scale sits
  // in a low, natural position on that one string.
  function baseString(rootMidi){
    let s = 0;
    for(let i = 0; i < 6; i++){ if(STRING_MIDI[i] <= rootMidi) s = i; }
    return s;
  }

  const KEYS = [
    {name:'C major',  pc:0},  {name:'G major',  pc:7},
    {name:'D major',  pc:2},  {name:'A major',  pc:9},
    {name:'E major',  pc:4},  {name:'B major',  pc:11},
    {name:'F♯ major', pc:6},  {name:'D♭ major', pc:1},
    {name:'A♭ major', pc:8},  {name:'E♭ major', pc:3},
    {name:'B♭ major', pc:10}, {name:'F major',  pc:5},
  ];

  // Scale-degree offsets from the root, in semitones.
  const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
  const MAJOR_PENT = [0, 2, 4, 7, 9, 12];   // major scale minus the 4th and 7th

  // Root sits in a comfortable low octave (C3 = MIDI 48). Each scale note is a
  // real position {string, fret} on one string, played the game's way.
  function scalePositions(rootPc, offsets){
    const rootMidi = 48 + rootPc;
    const s = baseString(rootMidi);
    const f0 = rootMidi - STRING_MIDI[s];
    return offsets.map(o => ({ s, f: f0 + o }));
  }

  // Reuse the guitar chosen in the trainer if it was saved; otherwise steel.
  function guitarType(){
    try{
      const s = JSON.parse(localStorage.getItem('fretboardwalk.settings') || '{}');
      if(['SteelString','Classical','Electric'].includes(s.guitarType)) return s.guitarType;
    }catch(e){}
    return 'SteelString';
  }

  // ---- audio context (same iOS-safe acquire dance as the game) ----
  let audioCtx;
  function newCtx(){ return new (window.AudioContext || window.webkitAudioContext)(); }
  async function acquireCtx(){
    if(!audioCtx) audioCtx = newCtx();
    let ctx = audioCtx;
    if(ctx.state !== 'running'){
      try{ await ctx.resume(); }catch(e){}
      if(ctx.state !== 'running'){
        try{ ctx.close(); }catch(e){}
        ctx = audioCtx = newCtx();
      }
    }
    return ctx;
  }

  // Decoded buffers per guitar type, keyed "s-f" (f in {0,6,12}). Lazy:
  // nothing loads until the visitor actually presses play.
  const cache = {};
  function loadSamples(type){
    if(cache[type]) return cache[type];
    const map = {};
    const jobs = [];
    for(let s = 0; s < 6; s++){
      for(const f of SAMPLE_FRETS){
        const url = `res/samples/${type}/S${pad2(s)}-F${pad2(f)}.wav`;
        jobs.push(
          fetch(url)
            .then(r => r.arrayBuffer())
            .then(ab => audioCtx.decodeAudioData(ab))
            .then(buf => { map[s + '-' + f] = buf; })
            .catch(()=>{})
        );
      }
    }
    cache[type] = Promise.all(jobs).then(()=> map);
    return cache[type];
  }

  const NOTE_GAP = 0.34;   // seconds between notes

  async function playSequence(positions){
    const type = guitarType();
    const ctx = await acquireCtx();
    const buffers = await loadSamples(type);
    const start = ctx.currentTime + 0.06;
    positions.forEach((pos, i) => {
      const ref = nearestSampleFret(pos.f);
      const buf = buffers[pos.s + '-' + ref];
      if(!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.pow(2, (pos.f - ref) / 12);   // same-string shift, exactly like the game
      const gain = ctx.createGain();
      gain.gain.value = 0.85;
      src.connect(gain); gain.connect(ctx.destination);
      src.start(start + i * NOTE_GAP);
    });
    return positions.length * NOTE_GAP;   // rough duration, for the button lockout
  }

  // ---- wiring ----
  const keySel = document.getElementById('hearKey');
  const btnMajor = document.getElementById('playMajor');
  const btnPent = document.getElementById('playPent');
  if(!keySel || !btnMajor || !btnPent) return;

  KEYS.forEach((k, i) => {
    const opt = document.createElement('option');
    opt.value = k.pc; opt.textContent = k.name;
    keySel.appendChild(opt);
  });

  let busy = false;
  async function play(btn, offsets){
    if(busy) return;
    busy = true;
    btnMajor.disabled = true; btnPent.disabled = true;
    btn.classList.add('playing');
    try{
      const rootPc = +keySel.value;
      const dur = await playSequence(scalePositions(rootPc, offsets));
      setTimeout(() => {
        busy = false;
        btnMajor.disabled = false; btnPent.disabled = false;
        btn.classList.remove('playing');
      }, dur * 1000 + 350);
    }catch(e){
      busy = false;
      btnMajor.disabled = false; btnPent.disabled = false;
      btn.classList.remove('playing');
    }
  }

  btnMajor.addEventListener('click', () => play(btnMajor, MAJOR));
  btnPent.addEventListener('click', () => play(btnPent, MAJOR_PENT));
})();
