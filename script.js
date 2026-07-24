(function(){
  "use strict";

  // ---------- tuning & keys ----------
  const STRINGS = [
    {name:'E', midi:40},
    {name:'A', midi:45},
    {name:'D', midi:50},
    {name:'G', midi:55},
    {name:'B', midi:59},
    {name:'E', midi:64},
  ];
  const KEYS = [
    {name:'C major',  pc:0},  {name:'G major',  pc:7},
    {name:'D major',  pc:2},  {name:'A major',  pc:9},
    {name:'E major',  pc:4},  {name:'B major',  pc:11},
    {name:'F♯ major', pc:6},  {name:'D♭ major', pc:1},
    {name:'A♭ major', pc:8},  {name:'E♭ major', pc:3},
    {name:'B♭ major', pc:10}, {name:'F major',  pc:5},
  ];
  const NOTE_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];

  // Degrees are tokens rather than plain numbers so the lowered ones fit the same
  // system: state, comparisons, data attributes and display all speak one
  // vocabulary and nothing needs special-casing for flats.
  const MAJOR_OFFSETS = {0:'1', 2:'2', 4:'3', 5:'4', 7:'5', 9:'6', 11:'7'};
  const FLAT_OFFSETS  = {3:'b3', 8:'b6', 10:'b7'};
  const BASE_DEGREES  = ['1','2','3','4','5','6','7'];
  const FLAT_DEGREES  = ['b3','b6','b7'];
  const DEGREE_SEMI   = {'1':0,'2':2,'3':4,'4':5,'5':7,'6':9,'7':11,'b3':3,'b6':8,'b7':10};
  const DEGREE_LABEL  = {'1':'1','2':'2','3':'3','4':'4','5':'5','6':'6','7':'7',
                         'b3':'♭3','b6':'♭6','b7':'♭7'};
  const DEGREE_ROMAN  = {'1':'I','2':'ii','3':'iii','4':'IV','5':'V','6':'vi','7':'vii°',
                         'b3':'♭III','b6':'♭VI','b7':'♭VII'};

  const FRET_COUNT = 15;
  const NEAR_SEMITONES = 2;   // degrees this close to current are too easy to ask for

  // ---------- state ----------
  let state = {
    keyIndex:0,
    noteDisplay:'hidden',  // 'numerals' | 'dots' | 'hidden'
    showNames:false,
    includeFlats:false,
    soundOn:true,
    guitarType:'SteelString',  // 'SteelString' | 'Classical' | 'Electric'
    current:{string:0, fret:0},
    prevDegree:null,
    prevDegree2:null,
    targetDegree:'5',
    streak:0,
  };

  // Neck runs vertically on phones and tablets (a neck is long and thin, so it
  // suits the tall axis); horizontal only at true desktop widths. Wide screens
  // additionally get the rail, so 1000–1100px = rail + vertical neck.
  const mq     = window.matchMedia('(max-width:1100px)');
  const mqWide = window.matchMedia('(min-width:1000px)');

  // Which visual row a string is drawn on. Horizontal fretboard diagrams put the
  // low E at the BOTTOM, so the draw order inverts; vertical diagrams put it on
  // the LEFT, matching array order. Everything positioned per-string goes through
  // this, so the visuals and the hit cells can't disagree.
  function rowOf(stringIndex){
    return layout.orientation==='vertical' ? stringIndex : 5-stringIndex;
  }

  function degreeAt(s,f){
    const pc = (STRINGS[s].midi + f) % 12;
    const diff = (pc - KEYS[state.keyIndex].pc + 12) % 12;
    if(MAJOR_OFFSETS[diff]) return MAJOR_OFFSETS[diff];
    if(state.includeFlats && FLAT_OFFSETS[diff]) return FLAT_OFFSETS[diff];
    return null;
  }
  function pitchClassAt(s,f){ return (STRINGS[s].midi + f) % 12; }

  function enabledDegrees(){
    return state.includeFlats ? BASE_DEGREES.concat(FLAT_DEGREES) : BASE_DEGREES;
  }

  // shortest distance around the octave, so 7→1 counts as adjacent
  function semitoneGap(a,b){
    const d = Math.abs(DEGREE_SEMI[a] - DEGREE_SEMI[b]);
    return Math.min(d, 12-d);
  }

  function pickNextTargetDegree(){
    const cur = degreeAt(state.current.string, state.current.fret);
    // Skip anything within a tone of where you are — those sit right under the
    // hand and don't test anything. Also skip the last two degrees visited, so
    // the walk can't bounce A→B→A or settle into a 3-note loop like A→B→C→A.
    let pool = enabledDegrees().filter(d =>
      d !== cur && d !== state.prevDegree && d !== state.prevDegree2 &&
      (cur === null || semitoneGap(cur, d) > NEAR_SEMITONES)
    );
    // relax rather than fail if a narrow configuration ever empties the pool
    if(!pool.length) pool = enabledDegrees().filter(d => d !== cur);
    if(!pool.length) return cur === '1' ? '2' : '1';
    return pool[Math.floor(Math.random()*pool.length)];
  }

  function rootStartPosition(){
    const root = KEYS[state.keyIndex].pc;
    for(let f=0; f<=12; f++){
      if(((STRINGS[0].midi+f)%12) === root) return {string:0, fret:f};
    }
    return {string:0, fret:0};
  }

  // ---------- layout ----------
  let layout = null;

  function computeLayout(){
    const orientation = mq.matches ? 'vertical' : 'horizontal';
    const wide = mqWide.matches;
    const scroller = document.getElementById('neckScroll');

    const widths = [58];
    let w = 76;
    for(let i=1;i<=FRET_COUNT;i++){ widths.push(w); w *= 0.966; }

    // On a wide horizontal board, scale so all 15 frets fit the available width:
    // the whole neck readable at a glance, no scrolling.
    let scale = 1;
    if(wide && orientation === 'horizontal'){
      const avail = scroller.clientWidth;
      const natural = widths.reduce((a,b)=>a+b, 0);
      if(avail > 0) scale = Math.min(2.2, Math.max(1, avail/natural));
      for(let i=0;i<widths.length;i++) widths[i] *= scale;
    }

    const xStart = [0];
    for(let i=1;i<widths.length;i++) xStart.push(xStart[i-1]+widths[i-1]);
    const xCenter = widths.map((wd,i)=> xStart[i] + wd/2);
    const totalPrimary = xStart[xStart.length-1] + widths[widths.length-1];

    let measured = orientation==='vertical' ? scroller.clientWidth : scroller.clientHeight;
    if(!measured) measured = orientation==='vertical' ? 340 : 240;
    const crossSize = Math.max(190, Math.min(measured, wide ? 470 : 400));

    // Note size tracks the board so numerals stay legible instead of shrinking
    // into a big neck.
    const noteScale = Math.min(1.5, Math.max(1, crossSize/280));

    const stringMargin = 24*noteScale;
    const crossPositions = [];
    for(let i=0;i<6;i++) crossPositions.push(stringMargin + i*((crossSize-2*stringMargin)/5));

    return {orientation, wide, widths, xStart, xCenter, totalPrimary,
            crossSize, crossPositions, wireMargin:12, nutMargin:8, scale, noteScale};
  }

  function toXY(primary, cross){
    if(layout.orientation === 'vertical') return {x:cross, y:primary};
    return {x:primary, y:cross};
  }

  const SVGNS = "http://www.w3.org/2000/svg";
  function el(tag, attrs){
    const e = document.createElementNS(SVGNS, tag);
    for(const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function buildStaticBoard(){
    // Apply the orientation class BEFORE measuring: computeLayout reads the
    // scroller's client size, which changes with flex-direction. Measuring first
    // would size the new board from the previous orientation's dimensions.
    document.getElementById('fretboardWrap').classList.toggle('vertical', mq.matches);

    layout = computeLayout();
    const K = layout.noteScale;

    const svgW = layout.orientation==='vertical' ? layout.crossSize : layout.totalPrimary;
    const svgH = layout.orientation==='vertical' ? layout.totalPrimary : layout.crossSize;

    const svg = document.getElementById('board');
    svg.setAttribute('width', svgW);
    svg.setAttribute('height', svgH);
    svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
    svg.innerHTML = '';

    // Every piece below is collected into one fragment and attached to the SVG
    // once at the end, instead of each element triggering its own insertion
    // into the live tree — cheap everywhere, but it matters most on slow
    // devices where connected-DOM mutations are the expensive part.
    const frag = document.createDocumentFragment();

    frag.appendChild(el('rect', {x:0, y:0, width:svgW, height:svgH, fill:'var(--neck)'}));

    for(let f=1; f<=FRET_COUNT; f++){
      const p1 = toXY(layout.xStart[f], layout.wireMargin);
      const p2 = toXY(layout.xStart[f], layout.crossSize - layout.wireMargin);
      frag.appendChild(el('line', {x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y,
        stroke:'var(--fretwire)', 'stroke-width':1.4*K, opacity:.5}));
    }

    const n1 = toXY(2, layout.nutMargin);
    const n2 = toXY(2, layout.crossSize - layout.nutMargin);
    frag.appendChild(el('line', {x1:n1.x, y1:n1.y, x2:n2.x, y2:n2.y,
      stroke:'var(--string)', 'stroke-width':5*K, opacity:.85}));

    const midCross = (layout.crossPositions[2] + layout.crossPositions[3]) / 2;
    [3,5,7,9,15].forEach(f=>{
      if(f > FRET_COUNT) return;
      const p = toXY(layout.xCenter[f], midCross);
      frag.appendChild(el('circle', {cx:p.x, cy:p.y, r:3.4*K, fill:'var(--inlay)'}));
    });
    if(FRET_COUNT >= 12){
      const c1 = (layout.crossPositions[1] + layout.crossPositions[2]) / 2;
      const c2 = (layout.crossPositions[3] + layout.crossPositions[4]) / 2;
      const a = toXY(layout.xCenter[12], c1), b = toXY(layout.xCenter[12], c2);
      frag.appendChild(el('circle', {cx:a.x, cy:a.y, r:3.4*K, fill:'var(--inlay)'}));
      frag.appendChild(el('circle', {cx:b.x, cy:b.y, r:3.4*K, fill:'var(--inlay)'}));
    }

    [0,3,5,7,9,12,15].forEach(f=>{
      if(f > FRET_COUNT) return;
      const p = toXY(layout.xCenter[f], layout.crossSize - 12*K);
      const t = el('text', {x:p.x, y:p.y + 3*K, 'text-anchor':'middle',
        'font-size':9.5*K, fill:'var(--dim)', class:'note-label'});
      t.textContent = f;
      frag.appendChild(t);
    });

    STRINGS.forEach((s,i)=>{
      const thickness = (1 + (5-i)*0.36) * K;
      const p1s = toXY(0, layout.crossPositions[rowOf(i)]);
      const p2s = toXY(layout.totalPrimary, layout.crossPositions[rowOf(i)]);
      frag.appendChild(el('line', {x1:p1s.x, y1:p1s.y, x2:p2s.x, y2:p2s.y,
        stroke:'var(--string)', 'stroke-width':thickness, opacity:.8}));
    });

    // Hit cells sit beneath the note graphics; both are populated separately
    // (renderCells/renderNotes) since they refresh on different triggers.
    frag.appendChild(el('g', {id:'cellsGroup'}));
    frag.appendChild(el('g', {id:'notesGroup'}));

    svg.appendChild(frag);

    // String names live in their own SVG sharing the board's exact cross-axis
    // coordinates, so a label can never drift from its string.
    const GUTTER = 25*K;
    const gutterSvg = document.getElementById('gutter');
    const gW = layout.orientation==='vertical' ? layout.crossSize : GUTTER;
    const gH = layout.orientation==='vertical' ? GUTTER : layout.crossSize;
    gutterSvg.setAttribute('width', gW);
    gutterSvg.setAttribute('height', gH);
    gutterSvg.setAttribute('viewBox', `0 0 ${gW} ${gH}`);
    gutterSvg.innerHTML = '';

    const gutterFrag = document.createDocumentFragment();
    STRINGS.forEach((s,i)=>{
      const cp = layout.crossPositions[rowOf(i)];
      const t = el('text', {
        x: layout.orientation==='vertical' ? cp : GUTTER/2,
        y: layout.orientation==='vertical' ? GUTTER - 8*K : cp,
        'text-anchor':'middle',
        'dominant-baseline': layout.orientation==='vertical' ? 'auto' : 'central',
        'font-size':11.5*K, fill:'var(--dim)', class:'note-label'
      });
      t.textContent = s.name;
      gutterFrag.appendChild(t);
    });
    gutterSvg.appendChild(gutterFrag);
  }

  // ---------- note + cell rendering ----------
  let noteIndex = [];

  // Every fret/string intersection gets one invisible rectangle carrying its
  // scale degree. Rectangles tile the board edge to edge, so unlike circles they
  // can never overlap however tight the string spacing gets — each point belongs
  // to exactly one cell, and the handler validates the same value used to draw
  // that spot.
  function renderCells(){
    const cg = document.getElementById('cellsGroup');
    cg.innerHTML = '';
    const cp = layout.crossPositions;
    const frag = document.createDocumentFragment();

    for(let s=0;s<6;s++){
      const row = rowOf(s);
      const lo = row===0 ? 0 : (cp[row-1] + cp[row]) / 2;
      const hi = row===5 ? layout.crossSize : (cp[row] + cp[row+1]) / 2;

      for(let f=0; f<=FRET_COUNT; f++){
        const deg = degreeAt(s,f);
        const a0 = layout.xStart[f], aLen = layout.widths[f];
        frag.appendChild(el('rect', {
          x: layout.orientation==='vertical' ? lo : a0,
          y: layout.orientation==='vertical' ? a0 : lo,
          width:  layout.orientation==='vertical' ? (hi-lo) : aLen,
          height: layout.orientation==='vertical' ? aLen : (hi-lo),
          fill:'transparent', class:'fret-cell',
          'data-string':s, 'data-fret':f, 'data-degree': deg===null ? '' : deg
        }));
      }
    }
    cg.appendChild(frag);
  }

  // Cell hit-regions (renderCells) aren't rebuilt here: their degree mapping
  // only depends on the key/flats setting and layout, none of which change on
  // a normal move, so callers ask for it explicitly when one of those does
  // (key change, flats toggle, resize/orientation, init) instead of paying to
  // regenerate 96 identical rects on every single correct tap.
  function renderNotes(){
    const g = document.getElementById('notesGroup');
    g.innerHTML = '';
    const frag = document.createDocumentFragment();
    noteIndex = Array.from({length:6}, ()=> new Array(FRET_COUNT+1));

    const curDeg = degreeAt(state.current.string, state.current.fret);
    const k = layout.noteScale;

    for(let s=0;s<6;s++){
      for(let f=0; f<=FRET_COUNT; f++){
        const deg = degreeAt(s,f);
        const isCurrent = (deg !== null && deg === curDeg);
        const p = toXY(layout.xCenter[f], layout.crossPositions[rowOf(s)]);
        const cx = p.x, cy = p.y;

        const wrap = el('g', {});
        noteIndex[s][f] = wrap;

        if(isCurrent){
          wrap.appendChild(el('circle', {cx, cy, r:14*k, fill:'none',
            stroke:'var(--live)', 'stroke-width':2, class:'pulse'}));
          wrap.appendChild(el('circle', {cx, cy, r:14*k, fill:'var(--live)',
            stroke:'#8af0ff', 'stroke-width':1.5, class:'note-visible'}));

          const lab = DEGREE_LABEL[deg];
          const t = el('text', {x:cx, y:cy + 4.6*k, 'text-anchor':'middle',
            'font-size':(lab.length>1 ? 11 : 13.5)*k, 'font-weight':600,
            fill:'#04212a', class:'note-label'});
          t.textContent = lab;
          wrap.appendChild(t);

        } else if(deg !== null && state.noteDisplay !== 'hidden'){
          wrap.appendChild(el('circle', {cx, cy, r:12*k, fill:'var(--panel-3)',
            stroke:'var(--line-strong)', 'stroke-width':1.3, class:'note-visible'}));

          if(state.noteDisplay === 'numerals'){
            const lab = state.showNames ? NOTE_NAMES[pitchClassAt(s,f)] : DEGREE_LABEL[deg];
            const t = el('text', {x:cx, y:cy + 4*k, 'text-anchor':'middle',
              'font-size':(lab.length>1 ? 9.5 : 11.5)*k, 'font-weight':500,
              fill:'var(--text)', class:'note-label'});
            t.textContent = lab;
            wrap.appendChild(t);
          }

        } else {
          // hidden: invisible ring kept only so feedback has something to flash
          wrap.appendChild(el('circle', {cx, cy, r:12*k, fill:'transparent',
            stroke:'transparent', 'stroke-width':2.5, class:'note-visible'}));
        }

        frag.appendChild(wrap);
      }
    }
    g.appendChild(frag);
  }

  // ---------- feedback: guitar sample playback ----------
  // Real recordings only exist at the open string, 6th and 12th frets. Every
  // other fret plays the nearest of those three, pitch-shifted by playbackRate —
  // standard tuning means one fret is exactly one semitone, so the ratio is just
  // 2^(semitones/12). Picking the *nearest* anchor keeps the shift small (at most
  // 3 semitones) so it stays convincing instead of chipmunk/demonic at the edges.
  const SAMPLE_FRETS = [0, 6, 12];
  function nearestSampleFret(f){
    if(f <= 3) return 0;
    if(f <= 9) return 6;
    return 12;
  }
  function pad2(n){ return String(n).padStart(2,'0'); }

  let audioCtx;
  function newAudioCtx(){
    return new (window.AudioContext||window.webkitAudioContext)();
  }
  function ensureAudioCtx(){
    if(!audioCtx) audioCtx = newAudioCtx();
    return audioCtx;
  }

  // iOS Safari suspends the AudioContext whenever the tab loses focus (e.g.
  // switching apps) and doesn't always resume it on its own — sound stays dead
  // until resume() is called again. Nudge it back to 'running' as soon as the
  // page is visible/focused again, so no manual refresh is needed.
  function resumeAudioCtx(){
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
  }
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible') resumeAudioCtx();
  });
  window.addEventListener('pageshow', resumeAudioCtx);
  window.addEventListener('focus', resumeAudioCtx);

  // One entry per guitar type: {promise, buffers} where buffers[string][fret] is
  // a decoded AudioBuffer. Cached so switching guitars twice doesn't re-fetch,
  // and so playback can just await a promise that's almost always already settled.
  const sampleCache = {};
  function loadGuitarSamples(type){
    if(sampleCache[type]) return sampleCache[type].promise;
    const ctx = ensureAudioCtx();
    const buffers = Array.from({length:6}, ()=>({}));
    const jobs = [];
    for(let s=0; s<6; s++){
      for(const f of SAMPLE_FRETS){
        const url = `res/samples/${type}/S${pad2(s)}-F${pad2(f)}.wav`;
        jobs.push(
          fetch(url)
            .then(r=>r.arrayBuffer())
            .then(ab=>ctx.decodeAudioData(ab))
            .then(buf=>{ buffers[s][f]=buf; })
            .catch(()=>{})
        );
      }
    }
    const promise = Promise.all(jobs).then(()=>buffers);
    sampleCache[type] = {promise, buffers};
    return promise;
  }

  // Plays the real note at (s,f). `wrong` layers a short, quiet error blip on
  // top rather than replacing the note, so a miss still tells you what you
  // actually played.
  async function playGuitarNote(s, f, wrong){
    if(!state.soundOn) return;
    try{
      let ctx = ensureAudioCtx();
      if(ctx.state !== 'running'){
        // iOS Safari's AudioContext can come back from a long background/lock-
        // screen spell stuck 'suspended' (or worse, reporting 'running' but
        // silent) in a way resume() never actually fixes — see webkit.org
        // bug 231105. A refresh works because that mints a fresh context, so
        // do the same thing here: discard it and build a new one. This runs
        // inside the tap's own click handler, which counts as the user
        // gesture Safari requires to let the new context start unlocked.
        try{ await ctx.resume(); }catch(e){}
        if(ctx.state !== 'running'){
          try{ ctx.close(); }catch(e){}
          ctx = audioCtx = newAudioCtx();
        }
      }
      const buffers = await loadGuitarSamples(state.guitarType);
      const ref = nearestSampleFret(f);
      const buf = buffers[s] && buffers[s][ref];
      if(!buf) return;
      const now = ctx.currentTime;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.pow(2, (f-ref)/12);
      const gain = ctx.createGain();
      gain.gain.value = 0.85;
      src.connect(gain); gain.connect(ctx.destination);
      src.start(now);

      if(wrong){
        const o = ctx.createOscillator(), gn = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(140, now);
        gn.gain.setValueAtTime(0.05, now);
        gn.gain.exponentialRampToValueAtTime(0.001, now+0.16);
        o.connect(gn); gn.connect(ctx.destination);
        o.start(now); o.stop(now+0.18);
      }
    }catch(e){}
  }

  function flashNote(s, f, cls){
    const node = noteIndex[s] && noteIndex[s][f];
    if(!node) return;
    const ring = node.querySelector('.note-visible');
    if(!ring) return;
    ring.classList.add(cls);
    setTimeout(()=> ring.classList.remove(cls), 700);
  }

  function centerOn(s,f){
    const scroller = document.getElementById('neckScroll');
    const pos = layout.xCenter[f];
    if(layout.orientation === 'vertical'){
      scroller.scrollTo({top: Math.max(0, pos - scroller.clientHeight/2), behavior:'smooth'});
    } else {
      scroller.scrollTo({left: Math.max(0, pos - scroller.clientWidth/2), behavior:'smooth'});
    }
  }

  function setStreak(n){
    state.streak = n;
    document.getElementById('streakVal').textContent = n;
    document.getElementById('streakBox').classList.toggle('hot', n >= 5);
  }

  // ---------- interaction ----------
  // One delegated listener. The cell that was hit already carries its own scale
  // degree, so validation is a direct attribute read — no coordinate maths and no
  // second source of truth that could drift from what's drawn.
  document.getElementById('board').addEventListener('click', (e)=>{
    const cell = e.target.closest('.fret-cell');
    if(!cell) return;
    handleClick(+cell.dataset.string, +cell.dataset.fret,
                cell.dataset.degree === '' ? null : cell.dataset.degree);
  });

  function trackEvent(name, params){
    if(typeof gtag === 'function') gtag('event', name, params);
  }

  function handleClick(s, f, deg){
    const curDeg = degreeAt(state.current.string, state.current.fret);
    if(deg !== null && deg === curDeg) return;   // already standing here

    const isCorrect = deg === state.targetDegree;
    playGuitarNote(s, f, !isCorrect);

    if(isCorrect){
      trackEvent('CorrectClick', {degree: deg});
      flashNote(s, f, 'correct-flash');
      setStreak(state.streak + 1);
      setTimeout(()=>{
        state.prevDegree2 = state.prevDegree;
        state.prevDegree = curDeg;
        state.current = {string:s, fret:f};
        state.targetDegree = pickNextTargetDegree();
        renderNotes();
        renderPlaques();
        centerOn(s,f);
      }, 380);
    } else {
      trackEvent('WrongClick', {degree: deg, target: state.targetDegree});
      flashNote(s, f, 'wrong-flash');
      setStreak(0);
    }
  }

  function setPlaque(numEl, romanEl, deg){
    const lab = DEGREE_LABEL[deg] || '';
    numEl.textContent = lab;
    // Flats are two glyphs wide; a class sized per breakpoint eases the numeral
    // back so it can't clip. em would resolve against the parent, not this
    // element's own size, so it can't be done inline.
    numEl.classList.toggle('wide', lab.length > 1);
    romanEl.textContent = DEGREE_ROMAN[deg] || '';
  }

  function renderPlaques(){
    const curDeg = degreeAt(state.current.string, state.current.fret);
    setPlaque(document.getElementById('curNum'), document.getElementById('curRoman'), curDeg);
    setPlaque(document.getElementById('tgtNum'), document.getElementById('tgtRoman'), state.targetDegree);
  }

  // ---------- settings ----------
  const keySelect = document.getElementById('keySelect');
  KEYS.forEach((k,i)=>{
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = k.name;
    keySelect.appendChild(opt);
  });
  keySelect.addEventListener('change', ()=>{
    state.keyIndex = +keySelect.value;
    resetRun();
  });

  document.getElementById('gearBtn').addEventListener('click', ()=>{
    document.getElementById('settingsDrawer').classList.toggle('open');
  });

  const NOTE_DISPLAY_EVENT = {numerals:'SwitchNumerals', dots:'SwitchDots', hidden:'SwitchHidden'};
  const noteVisibilitySeg = document.getElementById('noteVisibilitySeg');
  noteVisibilitySeg.addEventListener('click', (e)=>{
    const btn = e.target.closest('.seg-btn');
    if(!btn) return;
    state.noteDisplay = btn.dataset.val;
    for(const b of noteVisibilitySeg.children) b.classList.toggle('active', b===btn);
    trackEvent(NOTE_DISPLAY_EVENT[state.noteDisplay]);
    renderNotes();
  });

  const toggleFlats = document.getElementById('toggleFlats');
  toggleFlats.addEventListener('click', ()=>{
    state.includeFlats = !state.includeFlats;
    toggleFlats.classList.toggle('on', state.includeFlats);

    // Switching flats off can pull the ground out from under a run: the note
    // you're on, or the one you've been asked to find, may no longer be in the
    // scale. Only restart when that's actually happened.
    const curDeg = degreeAt(state.current.string, state.current.fret);
    if(curDeg === null){ resetRun(); return; }
    if(!enabledDegrees().includes(state.targetDegree)){
      state.prevDegree = null;
      state.prevDegree2 = null;
      state.targetDegree = pickNextTargetDegree();
    }
    renderCells();   // degree-per-cell mapping just changed
    renderNotes();
    renderPlaques();
  });

  const toggleNames = document.getElementById('toggleNames');
  toggleNames.addEventListener('click', ()=>{
    state.showNames = !state.showNames;
    toggleNames.classList.toggle('on', state.showNames);
    renderNotes();
  });

  const toggleSound = document.getElementById('toggleSound');
  toggleSound.addEventListener('click', ()=>{
    state.soundOn = !state.soundOn;
    toggleSound.classList.toggle('on', state.soundOn);
  });

  const guitarTypeSeg = document.getElementById('guitarTypeSeg');
  guitarTypeSeg.addEventListener('click', (e)=>{
    const btn = e.target.closest('.seg-btn');
    if(!btn || btn.dataset.val === state.guitarType) return;
    state.guitarType = btn.dataset.val;
    for(const b of guitarTypeSeg.children) b.classList.toggle('active', b===btn);
    loadGuitarSamples(state.guitarType);
  });

  document.getElementById('restartBtn').addEventListener('click', resetRun);

  function resetRun(){
    state.current = rootStartPosition();
    state.prevDegree = null;
    state.prevDegree2 = null;
    state.targetDegree = pickNextTargetDegree();
    setStreak(0);
    renderCells();   // covers the key-change path; a no-op cost otherwise since this only runs on manual restart/key-change, never mid-game
    renderNotes();
    renderPlaques();
    document.getElementById('neckScroll').scrollTo({left:0, top:0, behavior:'smooth'});
  }

  // ---------- responsive chrome ----------
  // Move the settings panel between the mobile drawer and the desktop rail.
  // Moving the real node rather than duplicating keeps one source of truth, and
  // listeners ride along since they're bound to these elements.
  function placeChrome(){
    const drawer = document.getElementById('settingsDrawer');
    const slot   = document.getElementById('sideSlot');
    const app    = document.querySelector('.app');
    const stage  = document.querySelector('.stage');

    if(mqWide.matches){
      slot.appendChild(drawer);
      drawer.classList.add('open');
    } else {
      app.insertBefore(drawer, stage);
      drawer.classList.remove('open');
    }
  }

  function rebuild(){
    placeChrome();          // changes how much room the neck has, so do it first
    buildStaticBoard();
    renderCells();          // layout just changed, so cell geometry has too
    renderNotes();
    renderPlaques();
    const scroller = document.getElementById('neckScroll');
    scroller.scrollLeft = 0;
    scroller.scrollTop = 0;
  }

  for(const q of [mq, mqWide]){
    if(q.addEventListener) q.addEventListener('change', rebuild);
    else q.addListener(rebuild);
  }
  let resizeTimer;
  window.addEventListener('resize', ()=>{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 150);
  });

  // Real orientation locking only works in fullscreen / installed contexts and
  // is unsupported on iOS Safari, so this is a best-effort attempt; the CSS
  // rotate prompt is what actually holds the line.
  try{
    if(screen.orientation && screen.orientation.lock){
      screen.orientation.lock('portrait').catch(()=>{});
    }
  }catch(e){}

  // ---------- init ----------
  loadGuitarSamples(state.guitarType);   // fire and forget: warms the cache before the first click
  state.current = rootStartPosition();
  state.targetDegree = pickNextTargetDegree();
  placeChrome();
  buildStaticBoard();
  renderCells();
  renderNotes();
  renderPlaques();

})();
