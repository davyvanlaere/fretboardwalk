(function(){
  "use strict";

  // Same tuning and key list as the trainer (script.js), copied rather than
  // shared — this page is a standalone prototype and doesn't load script.js,
  // so it owns a tiny data model of its own instead of reaching into the app.
  const STRINGS = [
    {name:'E', midi:40}, {name:'A', midi:45}, {name:'D', midi:50},
    {name:'G', midi:55}, {name:'B', midi:59}, {name:'E', midi:64},
  ];
  const KEYS = [
    {name:'C major',  pc:0},  {name:'G major',  pc:7},
    {name:'D major',  pc:2},  {name:'A major',  pc:9},
    {name:'E major',  pc:4},  {name:'B major',  pc:11},
    {name:'F♯ major', pc:6},  {name:'D♭ major', pc:1},
    {name:'A♭ major', pc:8},  {name:'E♭ major', pc:3},
    {name:'B♭ major', pc:10}, {name:'F major',  pc:5},
  ];

  // Unlike the trainer — which only ever asks about the seven diatonic degrees
  // plus three lowered ones — this page toggles by raw semitone distance from
  // the root, all twelve of them. That's what makes it general enough to draw
  // a dominant 7 (1 3 5 ♭7) or a blues scale (1 ♭3 4 ♭5 5 ♭7) rather than only
  // major-scale subsets.
  const DEGREE_LABEL = ['1','♭2','2','♭3','3','4','♭5','5','♭6','6','♭7','7'];
  const FRET_COUNT = 15;

  const PRESETS = [
    {name:'Major triad',      idx:[0,4,7]},
    {name:'Minor triad',      idx:[0,3,7]},
    {name:'Major 7',          idx:[0,4,7,11]},
    {name:'Dominant 7',       idx:[0,4,7,10]},
    {name:'Minor 7',          idx:[0,3,7,10]},
    {name:'Major pentatonic', idx:[0,2,4,7,9]},
    {name:'Minor pentatonic', idx:[0,3,5,7,10]},
  ];

  // ---------- state ----------
  const state = {
    keyIndex: 0,
    active: new Set(PRESETS[0].idx),   // degree indices 0-11, relative to the root
    soundOn: true,
  };

  // ---------- DOM ----------
  const boardEl      = document.getElementById('board');
  const gutterEl      = document.getElementById('gutter');
  const neckScrollEl  = document.getElementById('neckScroll');
  const fretboardWrapEl = document.getElementById('fretboardWrap');
  const keySelectEl  = document.getElementById('keySelect');
  const soundToggleEl = document.getElementById('soundToggle');
  const chipsEl       = document.getElementById('degreeChips');
  const presetsEl     = document.getElementById('presets');
  const showingEl     = document.getElementById('showingList');
  const clearBtnEl    = document.getElementById('clearBtn');

  let cellsGroupEl, notesGroupEl, noteIndex = [];

  // ---------- degree math ----------
  // Degree index (0-11), not a note-name — so switching key transposes
  // whatever shape is toggled on instead of clearing it. Degrees are
  // key-relative by definition; this just leans on that.
  function degIdxAt(s, f){
    const pc = (STRINGS[s].midi + f) % 12;
    return (pc - KEYS[state.keyIndex].pc + 12) % 12;
  }

  const mq     = window.matchMedia('(max-width:1100px)');
  const mqWide = window.matchMedia('(min-width:1000px)');
  function rowOf(stringIndex){
    return layout.orientation==='vertical' ? stringIndex : 5-stringIndex;
  }

  // ---------- layout (ported from script.js's computeLayout/buildStaticBoard —
  // same board, same math, so this looks and behaves exactly like the trainer's) ----------
  let layout = null;

  function computeLayout(){
    const orientation = mq.matches ? 'vertical' : 'horizontal';
    const wide = mqWide.matches;
    const scroller = neckScrollEl;

    const widths = [58];
    let w = 76;
    for(let i=1;i<=FRET_COUNT;i++){ widths.push(w); w *= 0.966; }

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
    fretboardWrapEl.classList.toggle('vertical', mq.matches);
    layout = computeLayout();
    const K = layout.noteScale;

    const svgW = layout.orientation==='vertical' ? layout.crossSize : layout.totalPrimary;
    const svgH = layout.orientation==='vertical' ? layout.totalPrimary : layout.crossSize;

    const svg = boardEl;
    svg.setAttribute('width', svgW);
    svg.setAttribute('height', svgH);
    svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
    svg.innerHTML = '';

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

    cellsGroupEl = el('g', {id:'cellsGroup'});
    notesGroupEl = el('g', {id:'notesGroup'});
    frag.appendChild(cellsGroupEl);
    frag.appendChild(notesGroupEl);
    svg.appendChild(frag);

    const GUTTER = 25*K;
    const gutterSvg = gutterEl;
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

  // ---------- cells (hit targets) + notes (visuals) ----------
  function renderCells(){
    const cg = cellsGroupEl;
    cg.innerHTML = '';
    const cp = layout.crossPositions;
    const frag = document.createDocumentFragment();

    for(let s=0;s<6;s++){
      const row = rowOf(s);
      const lo = row===0 ? 0 : (cp[row-1] + cp[row]) / 2;
      const hi = row===5 ? layout.crossSize : (cp[row] + cp[row+1]) / 2;

      for(let f=0; f<=FRET_COUNT; f++){
        const a0 = layout.xStart[f], aLen = layout.widths[f];
        frag.appendChild(el('rect', {
          x: layout.orientation==='vertical' ? lo : a0,
          y: layout.orientation==='vertical' ? a0 : lo,
          width:  layout.orientation==='vertical' ? (hi-lo) : aLen,
          height: layout.orientation==='vertical' ? aLen : (hi-lo),
          fill:'transparent', class:'fret-cell',
          'data-string':s, 'data-fret':f,
        }));
      }
    }
    cg.appendChild(frag);

    cg.addEventListener('click', onCellClick);
  }

  function onCellClick(ev){
    const cell = ev.target.closest('.fret-cell');
    if(!cell) return;
    const s = +cell.dataset.string, f = +cell.dataset.fret;
    toggleDegree(degIdxAt(s, f));
    playNote(s, f);
  }

  function renderNotes(){
    const g = notesGroupEl;
    g.innerHTML = '';
    const frag = document.createDocumentFragment();
    noteIndex = Array.from({length:6}, ()=> new Array(FRET_COUNT+1));
    const k = layout.noteScale;

    for(let s=0;s<6;s++){
      for(let f=0; f<=FRET_COUNT; f++){
        const di = degIdxAt(s,f);
        const on = state.active.has(di);
        const isRoot = di === 0;
        const p = toXY(layout.xCenter[f], layout.crossPositions[rowOf(s)]);
        const cx = p.x, cy = p.y;

        const wrap = el('g', {});
        noteIndex[s][f] = wrap;

        if(on && isRoot){
          wrap.appendChild(el('circle', {cx, cy, r:14*k, fill:'var(--live)',
            stroke:'#8af0ff', 'stroke-width':1.5, class:'note-visible'}));
          const t = el('text', {x:cx, y:cy + 4.6*k, 'text-anchor':'middle',
            'font-size':13.5*k, 'font-weight':600, fill:'#04212a', class:'note-label'});
          t.textContent = '1';
          wrap.appendChild(t);

        } else if(on){
          wrap.appendChild(el('circle', {cx, cy, r:12*k, fill:'var(--panel-3)',
            stroke:'var(--line-strong)', 'stroke-width':1.3, class:'note-visible'}));
          const lab = DEGREE_LABEL[di];
          const t = el('text', {x:cx, y:cy + 4*k, 'text-anchor':'middle',
            'font-size':(lab.length>1 ? 9.5 : 11.5)*k, 'font-weight':500,
            fill:'var(--text)', class:'note-label'});
          t.textContent = lab;
          wrap.appendChild(t);

        } else {
          // Off: a faint dot rather than nothing, so the grid still reads as a
          // fretboard when most of it is toggled away.
          wrap.appendChild(el('circle', {cx, cy, r:4.2*k, fill:'var(--panel-2)',
            stroke:'var(--line)', 'stroke-width':1, opacity:.7, class:'note-visible'}));
        }

        frag.appendChild(wrap);
      }
    }
    g.appendChild(frag);
  }

  // ---------- audio (ported from script.js's sample playback) ----------
  const GUITAR = 'SteelString';
  const SAMPLE_FRETS = [0, 6, 12];
  const pad2 = n => String(n).padStart(2,'0');
  function nearestSampleFret(f){
    if(f <= 3) return 0;
    if(f <= 9) return 6;
    return 12;
  }

  let audioCtx;
  function newAudioCtx(){ return new (window.AudioContext||window.webkitAudioContext)(); }
  function ensureAudioCtx(){ if(!audioCtx) audioCtx = newAudioCtx(); return audioCtx; }
  function resumeAudioCtx(){ if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{}); }
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'visible') resumeAudioCtx(); });
  window.addEventListener('pageshow', resumeAudioCtx);
  window.addEventListener('focus', resumeAudioCtx);

  let sampleJob = null;
  const buffers = Array.from({length:6}, ()=>({}));
  function loadSamples(){
    if(sampleJob) return sampleJob;
    const ctx = ensureAudioCtx();
    const jobs = [];
    for(let s=0; s<6; s++){
      for(const f of SAMPLE_FRETS){
        const url = `res/samples/${GUITAR}/S${pad2(s)}-F${pad2(f)}.wav`;
        jobs.push(
          fetch(url).then(r=>r.arrayBuffer()).then(ab=>ctx.decodeAudioData(ab))
            .then(buf=>{ buffers[s][f]=buf; }).catch(()=>{})
        );
      }
    }
    sampleJob = Promise.all(jobs);
    return sampleJob;
  }

  async function playNote(s, f){
    if(!state.soundOn) return;
    try{
      let ctx = ensureAudioCtx();
      if(ctx.state !== 'running'){
        try{ await ctx.resume(); }catch(e){}
        if(ctx.state !== 'running'){
          try{ ctx.close(); }catch(e){}
          ctx = audioCtx = newAudioCtx();
        }
      }
      await loadSamples();
      const ref = nearestSampleFret(f);
      const buf = buffers[s] && buffers[s][ref];
      if(!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.pow(2, (f-ref)/12);
      const gain = ctx.createGain();
      gain.gain.value = 0.85;
      src.connect(gain); gain.connect(ctx.destination);
      src.start(ctx.currentTime);
    }catch(e){}
  }

  // ---------- toggling + UI sync ----------
  function toggleDegree(di){
    if(state.active.has(di)) state.active.delete(di); else state.active.add(di);
    renderNotes();
    syncChips();
    syncShowing();
  }

  function syncChips(){
    for(const chip of chipsEl.children){
      chip.classList.toggle('on', state.active.has(+chip.dataset.idx));
    }
    for(const btn of presetsEl.children){
      const idx = JSON.parse(btn.dataset.idx);
      const matches = idx.length === state.active.size && idx.every(i => state.active.has(i));
      btn.classList.toggle('on', matches);
    }
  }

  function syncShowing(){
    const ordered = [...state.active].sort((a,b)=>a-b);
    showingEl.textContent = ordered.length ? ordered.map(i=>DEGREE_LABEL[i]).join(' · ') : '— nothing toggled on —';
  }

  function buildChips(){
    chipsEl.innerHTML = '';
    DEGREE_LABEL.forEach((lab, i)=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ex-chip' + (i===0 ? ' root' : '');
      b.dataset.idx = i;
      b.textContent = lab;
      b.addEventListener('click', ()=> toggleDegree(i));
      chipsEl.appendChild(b);
    });
  }

  function buildPresets(){
    presetsEl.innerHTML = '';
    PRESETS.forEach(p=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ex-preset';
      b.dataset.idx = JSON.stringify(p.idx);
      b.textContent = p.name;
      b.addEventListener('click', ()=>{
        state.active = new Set(p.idx);
        renderNotes(); syncChips(); syncShowing();
      });
      presetsEl.appendChild(b);
    });
  }

  function buildKeySelect(){
    KEYS.forEach((k,i)=>{
      const o = document.createElement('option');
      o.value = i; o.textContent = k.name;
      keySelectEl.appendChild(o);
    });
    keySelectEl.value = state.keyIndex;
    keySelectEl.addEventListener('change', ()=>{
      state.keyIndex = +keySelectEl.value;
      // Cells don't encode the key, only notes do — no need to rebuild them.
      renderNotes();
    });
  }

  clearBtnEl.addEventListener('click', ()=>{
    state.active.clear();
    renderNotes(); syncChips(); syncShowing();
  });

  soundToggleEl.addEventListener('click', ()=>{
    state.soundOn = !state.soundOn;
    soundToggleEl.setAttribute('aria-pressed', String(state.soundOn));
  });

  // ---------- rebuild on resize/orientation, same debounce as the trainer ----------
  function rebuild(){
    buildStaticBoard();
    renderCells();
    renderNotes();
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

  // ---------- init ----------
  loadSamples();   // fire and forget: warms the cache before the first tap
  buildKeySelect();
  buildChips();
  buildPresets();
  rebuild();
  syncChips();
  syncShowing();

})();
