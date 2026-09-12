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

  // ---------- cached DOM refs ----------
  // Looked up once since these nodes are never replaced (only their attributes/
  // contents change), so hot render paths don't re-walk the DOM by id each call.
  const boardEl         = document.getElementById('board');
  const gutterEl        = document.getElementById('gutter');
  const neckScrollEl    = document.getElementById('neckScroll');
  const fretboardWrapEl = document.getElementById('fretboardWrap');
  const streakValEl     = document.getElementById('streakVal');
  const streakBoxEl     = document.getElementById('streakBox');
  const comboBurstEl    = document.getElementById('comboBurst');
  const curNumEl        = document.getElementById('curNum');
  const curRomanEl      = document.getElementById('curRoman');
  const tgtNumEl        = document.getElementById('tgtNum');
  const tgtRomanEl      = document.getElementById('tgtRoman');
  const gearBtnEl       = document.getElementById('gearBtn');
  const helpBtnEl       = document.getElementById('helpBtn');
  const howtoEl         = document.getElementById('howto');
  const howtoCloseEl    = document.getElementById('howtoClose');
  const appEl           = document.querySelector('.app');
  const gateEl          = document.getElementById('gate');
  const gateYesEl       = document.getElementById('gateYes');
  const gateNoEl        = document.getElementById('gateNo');
  const howtoTourBtnEl  = document.getElementById('howtoTourBtn');
  const tourEl          = document.getElementById('tour');
  const tourHoleEl      = document.getElementById('tourHole');
  const tourCardEl      = document.getElementById('tourCard');
  const tourStepEl      = document.getElementById('tourStep');
  const tourTitleEl     = document.getElementById('tourTitle');
  const tourBodyEl      = document.getElementById('tourBody');
  const tourNextEl      = document.getElementById('tourNext');
  const tourSkipEl      = document.getElementById('tourSkip');
  const nudgeEl         = document.getElementById('nudge');
  const nudgeYesEl      = document.getElementById('nudgeYes');
  const nudgeNoEl       = document.getElementById('nudgeNo');
  const settingsDrawerEl= document.getElementById('settingsDrawer');
  const restartBtnEl    = document.getElementById('restartBtn');
  const sideSlotEl      = document.getElementById('sideSlot');
  // The whole settings row, not just the select: it now lives in the drawer, so
  // hiding the control alone would leave an orphaned "Key" label behind.
  const keyRowEl        = document.getElementById('keyRow');
  const hintBoxEl       = document.getElementById('hintBox');
  const hintAskBtnEl    = document.getElementById('hintAskBtn');
  const hintAskDegEl    = document.getElementById('hintAskDeg');
  const hintPanelEl     = document.getElementById('hintPanel');
  const hintStepsEl     = document.getElementById('hintSteps');
  const hintWarnEl      = document.getElementById('hintWarn');
  const hintAltEl       = document.getElementById('hintAlt');
  const hintCostEl      = document.getElementById('hintCost');
  const hintCloseBtnEl  = document.getElementById('hintCloseBtn');
  const taBarTrackEl    = document.getElementById('taBarTrack');
  const taBarFillEl     = document.getElementById('taBarFill');
  const taStartBtnEl    = document.getElementById('taStartBtn');
  const taResultsEl     = document.getElementById('taResults');
  const taFinalScoreEl  = document.getElementById('taFinalScore');
  const taBestLineEl    = document.getElementById('taBestLine');
  const taBoardLabelEl  = document.getElementById('taBoardLabel');
  const taBoardEl       = document.getElementById('taBoard');
  const taAgainBtnEl    = document.getElementById('taAgainBtn');
  const taExitBtnEl     = document.getElementById('taExitBtn');
  const streakLabelEl   = streakBoxEl.querySelector('.l');

  // cellsGroup/notesGroup are recreated from scratch by buildStaticBoard on
  // every layout change, so these two get reassigned there instead of cached
  // once — everything else above is a fixed node for the page's lifetime.
  let cellsGroupEl, notesGroupEl, hintUnderEl, hintOverEl;

  // Whether the "how do I get there" route is on screen, and what it says.
  let hint = {open:false, route:null};

  // ---------- state ----------
  let state = {
    mode:'practice',  // 'practice' | 'timeAttack'
    keyIndex:0,
    noteDisplay:'numerals',  // 'numerals' | 'dots' | 'hidden' — beginner-friendly default; first visit lets the user pick
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

  // ---------- settings persistence ----------
  // Only the user-facing preferences persist across visits — not the run in
  // progress (current position, streak, target), which should always start
  // fresh. localStorage can throw (Safari private browsing, storage disabled),
  // so both directions are best-effort: a failure just means settings don't
  // stick, not a broken app.
  const SETTINGS_KEY = 'fretboardwalk.settings';

  function loadSettings(){
    try{
      const raw = localStorage.getItem(SETTINGS_KEY);
      if(!raw) return;
      const saved = JSON.parse(raw);
      // Validated field-by-field rather than merged wholesale: a stale or
      // hand-edited value (e.g. an out-of-range keyIndex) would otherwise
      // throw deep inside init with no try/catch to catch it there.
      if(typeof saved.keyIndex === 'number' && saved.keyIndex >= 0 && saved.keyIndex < KEYS.length){
        state.keyIndex = saved.keyIndex;
      }
      if(['numerals','dots','hidden'].includes(saved.noteDisplay)) state.noteDisplay = saved.noteDisplay;
      if(typeof saved.showNames === 'boolean') state.showNames = saved.showNames;
      if(typeof saved.includeFlats === 'boolean') state.includeFlats = saved.includeFlats;
      if(typeof saved.soundOn === 'boolean') state.soundOn = saved.soundOn;
      if(['SteelString','Classical','Electric'].includes(saved.guitarType)) state.guitarType = saved.guitarType;
    }catch(e){}
  }

  function saveSettings(){
    try{
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        keyIndex: state.keyIndex,
        noteDisplay: state.noteDisplay,
        showNames: state.showNames,
        includeFlats: state.includeFlats,
        soundOn: state.soundOn,
        guitarType: state.guitarType,
      }));
    }catch(e){}
  }

  loadSettings();

  // ---------- time attack ----------
  // One life: each correct note shaves time off the deadline for the next
  // one (multiplicative, floored so it stays tappable rather than becoming
  // literally impossible), and the run ends the instant one note times out.
  // These three are the entire difficulty curve — tune here, nowhere else.
  const TA_START_MS = 9000;
  const TA_DECAY = 0.96;
  const TA_FLOOR_MS = 900;

  // Transient run data, not a user preference, so it lives beside `state`
  // rather than inside it — nothing here persists or gets saved/loaded.
  let timeAttack = {
    running:false,
    score:0,
    nextMs:TA_START_MS,
    timeoutId:null,
    mode:'hidden',          // note-display mode captured at run start (scoring bucket)
    practiceSnapshot:null,  // {current, prevDegree, prevDegree2, targetDegree, streak}
  };

  // Scores are bucketed by note-display mode because it changes the difficulty
  // outright — numerals hands you the answer on the board, dots show only where
  // the scale sits, hidden shows nothing — so ranking them together would be
  // meaningless. Each bucket keeps a top-5 leaderboard.
  const BEST_SCORES_KEY = 'fretboardwalk.bestScores';
  const TA_MAX_SCORES = 5;
  const NOTE_DISPLAY_LABEL = {numerals:'Numerals', dots:'Dots', hidden:'Hidden'};

  function emptyBoards(){ return {numerals:[], dots:[], hidden:[]}; }

  // A board is the distinct top scores for a mode — a high-scores list, not a
  // history, so the same value never appears twice. Deduped on load too, which
  // also cleans up any duplicates written before that rule existed.
  function cleanBoard(arr){
    return Array.from(new Set(arr.filter(n => Number.isFinite(n) && n >= 0)))
      .sort((a,b) => b-a)
      .slice(0, TA_MAX_SCORES);
  }

  function loadBestScores(){
    const boards = emptyBoards();
    try{
      const saved = JSON.parse(localStorage.getItem(BEST_SCORES_KEY) || '{}');
      for(const mode of Object.keys(boards)){
        if(Array.isArray(saved[mode])) boards[mode] = cleanBoard(saved[mode]);
      }
    }catch(e){}
    return boards;
  }

  // Inserts a finished run's score into its mode bucket and returns where it
  // landed: {rank, board, isNew}. rank is 1-based (1 = best) or 0 when the
  // score didn't crack the top 5. isNew is false when the score merely tied a
  // value already on the board, so the results screen can skip celebrating it.
  // A score of 0 is never recorded — a run that found nothing earns no slot.
  function recordScore(mode, score){
    const boards = loadBestScores();
    const board = boards[mode];
    if(score <= 0) return {rank:0, board, isNew:false};

    const isNew = !board.includes(score);
    boards[mode] = cleanBoard([...board, score]);
    try{ localStorage.setItem(BEST_SCORES_KEY, JSON.stringify(boards)); }catch(e){}

    const idx = boards[mode].indexOf(score);   // -1 if it fell outside the top 5
    return {rank: idx >= 0 ? idx + 1 : 0, board: boards[mode], isNew};
  }

  const RANK_LABEL = {1:'New personal best!', 2:'2nd best!', 3:'3rd best!', 4:'4th best!', 5:'5th best!'};

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

  // The major scale only, ignoring the lowered-degrees setting. The 7 3 6 2 5 1 4
  // sequence is built on the major scale, so anything reasoning about the
  // sequence has to ask this rather than degreeAt().
  function majorDegreeAt(s,f){
    const diff = (pitchClassAt(s,f) - KEYS[state.keyIndex].pc + 12) % 12;
    return MAJOR_OFFSETS[diff] || null;
  }

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
    const scroller = neckScrollEl;

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
    // (renderCells/renderNotes) since they refresh on different triggers. Kept
    // as direct references (not re-queried by id later) since these two nodes
    // are recreated fresh right here every time this function runs.
    cellsGroupEl = el('g', {id:'cellsGroup'});
    notesGroupEl = el('g', {id:'notesGroup'});
    // The route straddles the notes on purpose: its lines go underneath, so the
    // note circles clip them and each leg appears to stop at the edge of a
    // sphere rather than run across it. Rings and step labels go over the top
    // where they have to stay readable. Both are separate from notesGroup so
    // renderNotes can rebuild the board without erasing the route.
    hintUnderEl  = el('g', {id:'hintUnder'});
    hintOverEl   = el('g', {id:'hintOver'});
    frag.appendChild(cellsGroupEl);
    frag.appendChild(hintUnderEl);
    frag.appendChild(notesGroupEl);
    frag.appendChild(hintOverEl);

    svg.appendChild(frag);

    // String names live in their own SVG sharing the board's exact cross-axis
    // coordinates, so a label can never drift from its string.
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

  // ---------- note + cell rendering ----------
  let noteIndex = [];

  // Every fret/string intersection gets one invisible rectangle carrying its
  // scale degree. Rectangles tile the board edge to edge, so unlike circles they
  // can never overlap however tight the string spacing gets — each point belongs
  // to exactly one cell, and the handler validates the same value used to draw
  // that spot.
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
    const g = notesGroupEl;
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
    const scroller = neckScrollEl;
    const pos = layout.xCenter[f];
    if(layout.orientation === 'vertical'){
      scroller.scrollTo({top: Math.max(0, pos - scroller.clientHeight/2), behavior:'smooth'});
    } else {
      scroller.scrollTo({left: Math.max(0, pos - scroller.clientWidth/2), behavior:'smooth'});
    }
  }

  // Same thing, but centred in the part of the neck the tour card isn't sitting
  // on. The card is bottom-anchored over the board, so a step that pointed at
  // something with plain centerOn was liable to spotlight a note behind its own
  // explanation — which reads as the app dimming the screen for no reason.
  // Only the vertical board can solve it by scrolling: on a horizontal one the
  // whole neck is already on screen and placeTourCard() moves the card instead.
  // `f2` centres a run of frets on its middle rather than on one end, which for
  // a three-fret stretch is the difference between all of it being on screen
  // and the last note of it sitting under the card.
  function centerOnClear(s, f, f2){
    // A fret that isn't one leaves the target NaN, which Chromium scrolls to as
    // if it were 0 — the neck silently jumps to the nut and the step spotlights
    // the wrong end of the board. Better to leave it where it is.
    if(!layout || !Number.isFinite(layout.xCenter[f])) return;
    const pos = Number.isFinite(layout.xCenter[f2])
      ? (layout.xCenter[f] + layout.xCenter[f2]) / 2
      : layout.xCenter[f];
    const scroller = neckScrollEl;
    if(layout.orientation !== 'vertical'){
      scroller.scrollTo({left: Math.max(0, pos - scroller.clientWidth/2), behavior:'smooth'});
      return;
    }
    const top = scroller.getBoundingClientRect().top;
    const cardTop = tourCardEl.getBoundingClientRect().top;
    // Floored, so a short window or a card taller than the board still scrolls
    // somewhere sane instead of pinning everything to the nut.
    const clear = Math.max(140, Math.min(scroller.clientHeight, cardTop - top));
    // Seat the whole spotlit span inside the clear band, not just its midpoint:
    // centring a two- or three-fret run leaves its last note under the card on a
    // short phone. margin covers the note radius so the outer circles clear too.
    const lo = Math.min(layout.xCenter[f], Number.isFinite(layout.xCenter[f2]) ? layout.xCenter[f2] : layout.xCenter[f]);
    const hi = Math.max(layout.xCenter[f], Number.isFinite(layout.xCenter[f2]) ? layout.xCenter[f2] : layout.xCenter[f]);
    const margin = 12 + 14 * layout.noteScale;
    const spanH = (hi - lo) + margin * 2;
    const offset = spanH <= clear ? (clear - spanH) / 2 : 0;
    scroller.scrollTo({top: Math.max(0, lo - margin - offset), behavior:'smooth'});
  }

  // Shared by practice's streak and time attack's score, which repaint the
  // same header box but never both at once (mode is exclusive). The heat tier
  // is derived purely from the count, so dropping to 0 (a broken streak) also
  // clears the glow.
  function renderScoreBox(n){
    streakValEl.textContent = n;
    streakBoxEl.classList.toggle('combo1', n >= 5  && n < 10);
    streakBoxEl.classList.toggle('combo2', n >= 10 && n < 25);
    streakBoxEl.classList.toggle('combo3', n >= 25);
  }
  function setStreak(n){
    state.streak = n;
    renderScoreBox(n);
    maybeNudgeHarder(n);
    syncHintCost();   // the warning only applies while there's a streak to lose
  }

  // ---------- combo juice ----------
  // Reinforcement layered on top of a correct answer WITHOUT touching the note
  // audio: the pitch you hear is always the true fretted note. Escalation rides
  // on sight (pop + heat), touch (haptics), and an occasional milestone chime
  // that's deliberately a bright non-guitar sound so it can't be mistaken for a
  // note being learned.
  const COMBO_MILESTONE = 5;   // celebrate every 5 in a row

  // Android fires this; iOS Safari has no Vibration API, so it's a silent no-op
  // there (guarded, never throws). Gated on the same Sound-feedback switch so
  // one control quiets everything.
  function haptic(pattern){
    if(!state.soundOn) return;
    try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(e){}
  }

  // A short ascending chime built from the existing AudioContext. Triangle
  // tones, obviously a UI flourish rather than a fretted note; more notes the
  // higher the milestone. Reuses whatever context playGuitarNote already woke.
  function playMilestoneSound(level){
    if(!state.soundOn || !audioCtx || audioCtx.state !== 'running') return;
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const base = 660;   // bright, well clear of the guitar register
    const steps = level >= 25 ? [0,4,7,12] : level >= 10 ? [0,4,7] : [0,7];
    steps.forEach((semi, i)=>{
      const t = now + i*0.06;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(base * Math.pow(2, semi/12), t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t+0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t+0.18);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t+0.2);
    });
  }

  // Removing then re-adding a class after a forced reflow restarts a CSS
  // animation that's already running — needed since consecutive correct taps
  // re-trigger the same pop.
  function restartAnim(elEl, cls){
    elEl.classList.remove(cls);
    void elEl.offsetWidth;
    elEl.classList.add(cls);
  }

  function bumpCombo(n){
    restartAnim(streakValEl, 'pop');
    haptic(8);
    if(n > 0 && n % COMBO_MILESTONE === 0){
      playMilestoneSound(n);
      haptic([0,25,35,25]);
      comboBurstEl.textContent = '🔥 ' + n;
      restartAnim(comboBurstEl, 'go');
      restartAnim(streakBoxEl, 'milestone');
    }
  }

  // ---------- interaction ----------
  // One delegated listener. The cell that was hit already carries its own scale
  // degree, so validation is a direct attribute read — no coordinate maths and no
  // second source of truth that could drift from what's drawn.
  boardEl.addEventListener('click', (e)=>{
    const cell = e.target.closest('.fret-cell');
    if(!cell) return;
    handleClick(+cell.dataset.string, +cell.dataset.fret,
                cell.dataset.degree === '' ? null : cell.dataset.degree);
  });

  function trackEvent(name, params){
    if(typeof gtag === 'function') gtag('event', name, params);
  }

  function handleClick(s, f, deg){
    // Between a timeout firing and the results screen actually opening (or
    // after "play again" but before the first note is armed), ignore stray
    // taps rather than let them score against a run that's already over.
    if(state.mode === 'timeAttack' && !timeAttack.running) return;

    const curDeg = degreeAt(state.current.string, state.current.fret);
    if(deg !== null && deg === curDeg){
      // Silent no-op normally, but during the tour a tap that does nothing at
      // all reads as the app being broken — so it still gets an answer.
      if(tour.awaitingTap) tourHandleTap(deg, false);
      return;   // already standing here
    }

    const isCorrect = deg === state.targetDegree;
    playGuitarNote(s, f, !isCorrect);
    if(tour.awaitingTap) tourHandleTap(deg, isCorrect);

    if(isCorrect){
      trackEvent('CorrectClick', {degree: deg});
      flashNote(s, f, 'correct-flash');
      if(state.mode === 'timeAttack'){
        timeAttack.score++;
        renderScoreBox(timeAttack.score);
        timeAttack.nextMs = Math.max(TA_FLOOR_MS, timeAttack.nextMs * TA_DECAY);
        bumpCombo(timeAttack.score);
      } else {
        setStreak(state.streak + 1);
        bumpCombo(state.streak);
      }
      setTimeout(()=>{
        // The route was drawn for a target that's now been answered.
        if(hint.open) closeHint();
        state.prevDegree2 = state.prevDegree;
        state.prevDegree = curDeg;
        state.current = {string:s, fret:f};
        state.targetDegree = pickNextTargetDegree();
        renderNotes();
        renderPlaques();
        centerOn(s,f);
        // Only start the next deadline once its target is actually visible —
        // arming it back in the isCorrect branch above would burn part of
        // the player's reaction window on this same 380ms move transition,
        // which becomes unfair once nextMs shrinks anywhere near that.
        if(state.mode === 'timeAttack') armNextNote();
      }, 380);
    } else {
      trackEvent('WrongClick', {degree: deg, target: state.targetDegree});
      flashNote(s, f, 'wrong-flash');
      // Time attack is forgiving of a mis-tap: the clock is the only thing
      // that ends a run, so a wrong note costs nothing here.
      if(state.mode !== 'timeAttack') setStreak(0);
    }
  }

  // ---------- time attack control ----------
  const taLabelEl = taStartBtnEl.querySelector('.ta-label');
  function setTimeAttackButton(running){
    taStartBtnEl.classList.toggle('stopping', running);
    taStartBtnEl.setAttribute('aria-label', running ? 'Stop Time Attack' : 'Start Time Attack');
    taLabelEl.innerHTML = running ? 'Stop' : 'Time<br>Attack';
  }

  function startTimeAttack(){
    // Play Again re-enters while state.mode is already 'timeAttack' — only
    // snapshot the practice run the first time, or a second run would save
    // the previous run's leftover position as if it were "practice."
    if(state.mode !== 'timeAttack'){
      timeAttack.practiceSnapshot = {
        current: state.current,
        prevDegree: state.prevDegree,
        prevDegree2: state.prevDegree2,
        targetDegree: state.targetDegree,
        streak: state.streak,
      };
    }
    state.mode = 'timeAttack';
    state.current = rootStartPosition();
    state.prevDegree = null;
    state.prevDegree2 = null;
    state.targetDegree = pickNextTargetDegree();

    timeAttack.running = true;
    timeAttack.score = 0;
    timeAttack.nextMs = TA_START_MS;
    // Lock in the difficulty bucket now; changing the note display mid-run
    // won't move the goalposts on which board this score lands in.
    timeAttack.mode = state.noteDisplay;

    keyRowEl.hidden = true;
    // A worked answer against a running clock isn't a hint, it's the answer.
    closeHint();
    hintBoxEl.hidden = true;
    helpBtnEl.hidden = true;     // a modal mid-run would hide a ticking clock
    setTimeAttackButton(true);   // same tile becomes the Stop control

    streakLabelEl.textContent = 'score';
    renderScoreBox(0);
    taBarTrackEl.hidden = false;
    settingsDrawerEl.classList.remove('open');
    taResultsEl.classList.remove('open');
    closeHowto();

    renderNotes();
    renderPlaques();
    centerOn(state.current.string, state.current.fret);

    trackEvent('TimeAttackStart');
    armNextNote();   // first target is already visible above, so it's safe to arm now
  }

  function armNextNote(){
    clearTimeout(timeAttack.timeoutId);
    // Restarting a CSS animation with a new duration means setting it to
    // 'none', forcing a reflow, then reassigning — without the reflow the
    // browser coalesces the two assignments and the animation never restarts.
    taBarFillEl.style.animation = 'none';
    void taBarFillEl.offsetWidth;
    taBarFillEl.style.animation = `taDeplete ${timeAttack.nextMs}ms linear forwards`;
    timeAttack.timeoutId = setTimeout(endTimeAttack, timeAttack.nextMs);
  }

  function endTimeAttack(){
    timeAttack.running = false;
    clearTimeout(timeAttack.timeoutId);

    const mode = timeAttack.mode;
    const {rank, board, isNew} = recordScore(mode, timeAttack.score);
    const madeBoard = rank > 0;

    taFinalScoreEl.textContent = timeAttack.score;
    // Only celebrate a genuinely new placement; tying a score already on the
    // board still highlights its row but reads as a neutral standing.
    taBestLineEl.textContent = (madeBoard && isNew)
      ? RANK_LABEL[rank]
      : (board.length ? `Best: ${board[0]}` : 'No score this run');
    taBestLineEl.classList.toggle('new-best', madeBoard && isNew);

    taBoardLabelEl.textContent = `${NOTE_DISPLAY_LABEL[mode]} mode · top 5`;
    renderLeaderboard(board, madeBoard ? rank : 0);
    taResultsEl.classList.add('open');

    trackEvent('TimeAttackEnd', {score: timeAttack.score, mode, rank});
  }

  // Renders the mode's top-5 as an ordered list, marking the row this run
  // earned (highlightRank, 1-based; 0 = nothing to highlight). Scores are
  // distinct, so at most one row matches.
  function renderLeaderboard(board, highlightRank){
    taBoardEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    for(let i=0; i<board.length; i++){
      const li = document.createElement('li');
      li.textContent = board[i];
      if(i === highlightRank - 1) li.className = 'you';
      frag.appendChild(li);
    }
    taBoardEl.appendChild(frag);
  }

  function exitTimeAttack(){
    const snap = timeAttack.practiceSnapshot;
    clearTimeout(timeAttack.timeoutId);
    timeAttack.running = false;
    timeAttack.practiceSnapshot = null;

    state.mode = 'practice';
    if(snap){
      state.current = snap.current;
      state.prevDegree = snap.prevDegree;
      state.prevDegree2 = snap.prevDegree2;
      state.targetDegree = snap.targetDegree;
      state.streak = snap.streak;
    }

    keyRowEl.hidden = false;
    hintBoxEl.hidden = false;
    helpBtnEl.hidden = false;
    setTimeAttackButton(false);
    streakLabelEl.textContent = 'streak';
    taBarTrackEl.hidden = true;
    taResultsEl.classList.remove('open');

    setStreak(state.streak);
    renderNotes();
    renderPlaques();
    centerOn(state.current.string, state.current.fret);
  }

  // ---------- hint: how to get there ----------
  // Two questions, and they have different right answers, so they get answered
  // separately.
  //
  // WHICH note to send you to is a question about the hand: a fret along this
  // string costs 1, a string across costs 1.1, and the cheapest note carrying
  // the asked-for degree wins.
  //
  // HOW to describe getting there is a question about the head, and the head
  // counts moves rather than frets. So the route is re-derived as the shortest
  // chain of the only two moves worth teaching:
  //
  //   slide  — along this string, inside a hand's reach, the distance read off
  //            the major scale;
  //   cross  — to the neighbouring string, one place along 7 3 6 2 5 1 4.
  //
  // Everything that used to need a special case falls out of those two instead
  // of being written down beside them, and that goes for the wording as much as
  // the routing. The sequence is cut at the 4|7 join because that one is a
  // tritone: no crossing move exists across it, so the search puts a slide in
  // front of it unprompted and that slide is then described like any other —
  // a distance along the string, with no note taken of why it is there. A
  // lowered degree isn't in the sequence either and gets the same treatment for
  // the same reason. G to B is tuned a third rather than a fourth, so its
  // crossing move lands a fret across — still one move, still one place along
  // the sequence, with the quirk named where it bites.
  const CYCLE = ['7','3','6','2','5','1','4'];

  // Hand prices in tenths, so the arithmetic stays whole numbers and two routes
  // that genuinely cost the same compare equal rather than nearly equal.
  const PRICE_FRET = 10, PRICE_STRING = 11;

  // Which natural degree a lowered one is named after. A ♭7 IS a flattened 7,
  // so "the 7 is one fret up" teaches the name it already has, while "the 6 is
  // one fret down" is a true sentence about a coincidence. Both are one fret
  // away, so nothing but this decides between them.
  const NATURAL_OF = {b3:'3', b6:'6', b7:'7'};

  const nodeId = (s, f) => s * (FRET_COUNT + 1) + f;

  // How far the fret has to move for a string crossing to still be worth a
  // perfect fourth. Zero everywhere except the G-B pair, which is tuned a third
  // — the tuning's own quirk, read off the tuning rather than hardcoded.
  const crossShift = (s, ns) => (ns - s) * 5 - (STRINGS[ns].midi - STRINGS[s].midi);

  // Every move a player can be told to make from one square, and nothing else.
  //
  // A slide is one move however far it goes, and deliberately uncapped. A cap
  // reads like prudence but only ever splits one slide into two — "go down two
  // frets, then two more" — because which note you are sent to is settled on
  // hand price before any of this runs, and by then a note more than a few
  // frets along your own string has already lost to a nearer one across it.
  // Measured over every key, position and target: the longest slide a winning
  // route uses is four frets, with a cap or without one. The limit is a fact
  // about the prices, not a rule that needs writing down.
  function movesFrom(s, f){
    const deg = degreeAt(s, f);
    const out = [];
    for(let nf = 0; nf <= FRET_COUNT; nf++){
      const to = nf === f ? null : degreeAt(s, nf);
      if(to) out.push({kind:'slide', string:s, fret:nf, from:deg, to, frets:nf - f});
    }
    // The sequence never wraps: its two ends are the two sides of the tritone,
    // which is exactly the crossing that doesn't work.
    const i = CYCLE.indexOf(deg);
    if(i < 0) return out;
    for(const dir of [1, -1]){
      const j = i + dir, ns = s + dir;
      if(j < 0 || j >= CYCLE.length || ns < 0 || ns > 5) continue;
      const nf = f + crossShift(s, ns);
      if(nf < 0 || nf > FRET_COUNT || degreeAt(ns, nf) !== CYCLE[j]) continue;
      out.push({kind:'cross', string:ns, fret:nf, from:deg, to:CYCLE[j],
                dir, frets:nf - f, quirk:nf !== f});
    }
    return out;
  }

  // How much explaining a route takes, compared in order: how many moves, how
  // far the hand travels, and whether a lowered degree was handled as the
  // degree it is named after.
  const moveKey = (m) => [1, Math.abs(m.frets),
    (NATURAL_OF[m.from] && NATURAL_OF[m.from] !== m.to ? 1 : 0) +
    (NATURAL_OF[m.to] && NATURAL_OF[m.to] !== m.from ? 1 : 0)];
  const addKey = (a, b) => a.map((v, i) => v + b[i]);
  const lessKey = (a, b) => {
    for(let i = 0; i < a.length; i++) if(a[i] !== b[i]) return a[i] < b[i];
    return false;
  };

  // Cheapest chain of moves to every square on the neck. Ninety-six squares, so
  // the plainest possible Dijkstra runs instantly and there is nothing in it to
  // get wrong.
  function reachAll(s0, f0){
    const best = new Map([[nodeId(s0, f0), {key:[0,0,0], moves:[], s:s0, f:f0}]]);
    const done = new Set();
    for(;;){
      let pick = null;
      for(const [id, n] of best)
        if(!done.has(id) && (pick === null || lessKey(n.key, best.get(pick).key))) pick = id;
      if(pick === null) break;
      done.add(pick);
      const node = best.get(pick);
      for(const m of movesFrom(node.s, node.f)){
        const id = nodeId(m.string, m.fret), key = addKey(node.key, moveKey(m));
        if(!best.has(id) || lessKey(key, best.get(id).key))
          best.set(id, {key, moves:node.moves.concat(m), s:m.string, f:m.fret});
      }
    }
    return best;
  }

  function computeHintRoute(){
    if(!layout) return null;
    const s = state.current.string, f = state.current.fret;
    const target = state.targetDegree;
    const reach = reachAll(s, f);

    // Price decides the destination, as promised; the explanation only breaks
    // ties between notes that cost the hand exactly the same. Comparing both in
    // one lexicographic key keeps that order honest, and skipping squares the
    // two moves can't reach means an unreachable corner costs a slightly dearer
    // note rather than costing the whole hint.
    let best = null;
    for(let ns = 0; ns <= 5; ns++) for(let nf = 0; nf <= FRET_COUNT; nf++){
      if(degreeAt(ns, nf) !== target) continue;
      const node = reach.get(nodeId(ns, nf));
      if(!node || !node.moves.length) continue;
      const key = [PRICE_FRET * Math.abs(nf - f) + PRICE_STRING * Math.abs(ns - s)]
        .concat(node.key);
      if(!best || lessKey(key, best.key)) best = {key, node};
    }
    if(!best) return null;

    return {
      from:{string:s, fret:f}, dest:{string:best.node.s, fret:best.node.f},
      curDeg:degreeAt(s, f), target, moves:best.node.moves,
    };
  }

  function fretWord(n){
    const a = Math.abs(n);
    return a + (a === 1 ? ' fret' : ' frets');
  }
  // Plain-language interval, since "a half step" means more to a beginner than
  // "one semitone" and both mean more than "minor second".
  function stepWord(n){
    const a = Math.abs(n);
    if(a === 1) return 'a half step';
    if(a === 2) return 'a whole step';
    return fretWord(a);
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
    setPlaque(curNumEl, curRomanEl, curDeg);
    setPlaque(tgtNumEl, tgtRomanEl, state.targetDegree);
    hintAskDegEl.textContent = DEGREE_LABEL[state.targetDegree] || '';
  }

  // The sequence with this one crossing lit on it: the string of digits from
  // the guide, made concrete for the move in front of you. A reach of more
  // than one string lights what it passes over too, dimmer than either end —
  // the places the sequence is counted through but the hand never stops. Both
  // ends of the row stay marked as the seam, because the join between them is
  // the reason a route ever has to step off a 4 or a 7 first.
  function cycleStripHtml(g){
    const from = g[0].from, to = g[g.length - 1].to;
    const via = g.slice(0, -1).map(m => m.to);
    const cells = CYCLE.map((d, i)=>{
      const cls = [];
      if(d === from) cls.push('from');
      else if(d === to) cls.push('to');
      else if(via.indexOf(d) >= 0) cls.push('via');
      if(i === 0 || i === CYCLE.length - 1) cls.push('seam');
      return `<span class="${cls.join(' ')}">${d}</span>`;
    }).join('');
    return `<div class="hint-cycle">${cells}</div>`;
  }

  // The intervals between consecutive degrees of the major scale, 1→2 up to
  // 7→1. Two of the seven are half steps, and knowing which two is the whole
  // trick to sliding the right distance along a string.
  const SCALE_GAPS = ['W','W','H','W','W','W','H'];
  const NATURALS = ['1','2','3','4','5','6','7'];

  // The formula with the stretch being walked lit up: the same treatment the
  // cycle strip gives a crossing, for a slide. Takes two degrees rather than a
  // move, so the tour can light a stretch it has drawn on the board with no
  // route behind it — the same picture a hint will show later rather than a
  // second dialect of it. Empty for a lowered degree, which has no place in the
  // formula and is explained by its name instead.
  // The row is fourteen cells, not seven: a degree, the gap above it, a degree,
  // and so on round to the 7. That is what lets a lowered degree be drawn at
  // all — it has no cell of its own because it isn't in the scale, it lives
  // inside the whole step below the degree it is named after, which is the
  // thing that makes it lowered. Standing in a gap is then just another place
  // on the row, and the gap says the ♭'s name instead of its width.
  const ROW_CELLS = 14;
  const slotOf = (deg) => NATURAL_OF[deg]
    ? (NATURALS.indexOf(NATURAL_OF[deg]) - 1) * 2 + 1
    : NATURALS.indexOf(deg) * 2;

  function formulaRowHtml(fromDeg, toDeg, up){
    const a = slotOf(fromDeg), b = slotOf(toDeg);
    if(a < 0 || b < 0 || a === b) return '';

    // Walked round the ring rather than counted, so the picture is of the
    // journey and not just of its two ends.
    const mark = new Array(ROW_CELLS).fill('');
    const step = up ? 1 : ROW_CELLS - 1;
    for(let i = (a + step) % ROW_CELLS; i !== b; i = (i + step) % ROW_CELLS) mark[i] = 'via';
    mark[a] = 'from';
    mark[b] = 'to';

    let cells = '';
    for(let i = 0; i < ROW_CELLS; i++){
      const cls = mark[i];
      if(i % 2 === 0){ cells += `<span class="deg ${cls}">${NATURALS[i / 2]}</span>`; continue; }
      // A gap reports its width, unless the slide starts or ends inside it —
      // then it says which ♭ that is, the more useful half of the same fact.
      const label = cls === 'from' ? DEGREE_LABEL[fromDeg]
                  : cls === 'to'   ? DEGREE_LABEL[toDeg]
                  : SCALE_GAPS[(i - 1) / 2];
      cells += `<span class="gap ${cls}${cls === 'via' ? ' lit' : ''}">${label}</span>`;
    }
    return `<div class="hint-formula">${cells}</div>`;
  }

  const L = (d) => DEGREE_LABEL[d] || '';
  const wayWord = (n) => n > 0 ? 'up' : 'down';

  // One slide. A lowered degree is described by the name it already carries —
  // it is the natural degree flattened, and saying so is the whole lesson — and
  // every other slide is a distance read straight off the major scale. The row
  // comes with all of them: how far to slide IS the formula, so the step that
  // asks for a slide is exactly the moment it is worth looking at.
  function slideHtml(m){
    const words =
      NATURAL_OF[m.from] === m.to
        ? `<b>${L(m.from)}</b> is the <b>${m.to}</b> flattened, so the <b>${m.to}</b> is `
          + `${fretWord(m.frets)} ${wayWord(m.frets)}.`
      : NATURAL_OF[m.to] === m.from
        ? `<b>${L(m.to)}</b> is this <b>${m.from}</b> flattened — ${fretWord(m.frets)} `
          + `${wayWord(m.frets)}.`
      : `<b>${L(m.from)}</b> to <b>${L(m.to)}</b> ` + (Math.abs(m.frets) <= 2
          ? `is ${stepWord(m.frets)} — go ${wayWord(m.frets)} ${fretWord(m.frets)}.`
          : `is ${fretWord(m.frets)} ${wayWord(m.frets)} the string.`);
    return words + formulaRowHtml(m.from, m.to, m.frets > 0);
  }

  const COUNT_WORD = ['', 'One', 'Two', 'Three', 'Four', 'Five'];

  // A crossing, or a run of them in the same direction, which is one thing to
  // do and so one thing to say. "Two strings thicker" is the instruction the
  // hand actually carries out; saying "one string thicker" twice asks it to
  // stop somewhere it never stops. The sequence is still counted a place per
  // string, so the count of strings and the count of steps are the same number
  // said twice — that being the whole point of the sequence.
  //
  // "Same fret" is the rule, so it is claimed only where it holds — and where
  // it doesn't, the tuning is named on the spot rather than left to the
  // footnote. At most one crossing in a run can be the G–B pair, so the run's
  // own displacement names it as plainly as a single crossing would.
  function crossHtml(g){
    const first = g[0], last = g[g.length - 1];
    const frets = g.reduce((n, m) => n + m.frets, 0);
    const n = COUNT_WORD[g.length], s = g.length > 1 ? 's' : '';
    const where = g.some(m => m.quirk) && frets !== 0
      ? `, ${fretWord(frets)} ${wayWord(frets)} across the <b>G–B</b> pair`
      : ', same fret';
    return `<b>${n} string${s} ${first.dir === 1 ? 'thinner' : 'thicker'}</b>${where}, `
         + `from <b>${first.from}</b> to <b>${last.to}</b>. ${n} step${s} along the `
         + `memorised circle of fourths sequence (<b>7 3 6 2 5 1 4</b>).`
         + cycleStripHtml(g);
  }

  // The moves the router found, gathered into the instructions a player is
  // given. Crossings that keep going the same way are one instruction; a slide
  // is always its own, because two slides in a row would each be a distance to
  // measure. Both the panel and the board walk this, so a step in the text and
  // a leg on the neck stay the same thing however the moves underneath group.
  function groupMoves(moves){
    const groups = [];
    for(const m of moves){
      const last = groups[groups.length - 1];
      if(last && m.kind === 'cross' && last[0].kind === 'cross' && last[0].dir === m.dir)
        last.push(m);
      else groups.push([m]);
    }
    return groups;
  }

  function renderHintText(r){
    let quirk = false;

    // One list item per instruction, in the same order the board draws them, so
    // "step 2" in the panel and the "2" on the neck are always the same thing.
    const steps = groupMoves(r.moves).map((g)=>{
      if(g[0].kind === 'cross'){
        quirk = quirk || g.some(m => m.quirk);
        return crossHtml(g);
      }
      return slideHtml(g[0]);
    });
    hintStepsEl.innerHTML = steps.map(s => `<li>${s}</li>`).join('');

    // The one join in the tuning that is not a perfect fourth. Named only on
    // the routes that actually cross it, which is the only moment it means
    // anything.
    const warn = quirk
      ? 'Mind the gap: <b>G→B</b> is the one string pair tuned a third '
        + 'rather than a fourth, so the sequence sits a fret across it — and stays shifted '
        + 'for every string above.'
      : '';
    hintWarnEl.innerHTML = warn;
    hintWarnEl.hidden = !warn;

    // Every degree repeats all over the neck, and the router picked whichever
    // was cheapest to reach. Saying so keeps the hint honest and quietly makes
    // the point that these numbers are everywhere.
    // Minus one: the destination itself is in that count.
    const others = boardEl.querySelectorAll(`.fret-cell[data-degree="${r.target}"]`).length - 1;
    hintAltEl.innerHTML = others > 0
      ? `One way of many — <b>${others}</b> other <b>${L(r.target)}</b>${others > 1 ? 's' : ''} on the neck would count too.`
      : '';
    hintAltEl.hidden = others <= 0;
  }

  // A quadratic arc between two points plus the point halfway along it, which
  // is where the step badge sits. Curved rather than straight so two legs of a
  // route read as one travelling path instead of a rigid L.
  function arcBetween(p, q, k){
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(len * 0.22, 26 * k);
    const cx = (p.x + q.x) / 2 - (dy / len) * bow;
    const cy = (p.y + q.y) / 2 + (dx / len) * bow;
    return {
      d: `M ${p.x} ${p.y} Q ${cx} ${cy} ${q.x} ${q.y}`,
      mid: {x:(p.x + 2*cx + q.x) / 4, y:(p.y + 2*cy + q.y) / 4},
    };
  }

  function drawHintRoute(r){
    clearHintRoute();
    if(!r || !hintUnderEl || !layout) return;
    const k = layout.noteScale;
    const at = (s, f) => toXY(layout.xCenter[f], layout.crossPositions[rowOf(s)]);
    const c = at(r.dest.string, r.dest.fret);
    const under = document.createDocumentFragment();
    // Three layers above the notes, appended in this order: the stop markers
    // first, then the rings around them, then the step badges last so a badge
    // is never buried by a marker it happens to sit near.
    const stops  = document.createDocumentFragment();
    const rings  = document.createDocumentFragment();
    const badges = document.createDocumentFragment();

    // Numbered to match the panel's steps exactly, so "step 2" in the text and
    // the "2" on the neck are the same instruction.
    let step = 0;
    const addLeg = (p, q)=>{
      const arc = arcBetween(p, q, k);
      under.appendChild(el('path', {d:arc.d, fill:'none', stroke:'var(--seek)',
        'stroke-width':2.2*k, 'stroke-dasharray':`${4.5*k} ${3.5*k}`,
        'stroke-linecap':'round', class:'hint-leg'}));
      const n = ++step;
      badges.appendChild(el('circle', {cx:arc.mid.x, cy:arc.mid.y, r:8*k,
        fill:'var(--seek)', stroke:'var(--bg)', 'stroke-width':1.5*k, class:'hint-badge'}));
      const t = el('text', {x:arc.mid.x, y:arc.mid.y + 3.4*k, 'text-anchor':'middle',
        'font-size':10*k, 'font-weight':600, fill:'#2a1a00', class:'note-label'});
      t.textContent = n;
      badges.appendChild(t);
    };

    // Dots mode draws the notes without numbers; hidden mode draws nothing at
    // all, leaving the rings floating over blank neck with no way to tell what
    // they are. So the route labels its own stops in those modes — the words
    // name a 5 and a 4, and the board has to be able to say the same. Giving
    // the numbers away is the point: the hint is opt-in help.
    const nameStops = state.noteDisplay !== 'numerals';
    const nameStop = (p, deg)=>{
      if(!nameStops || !deg) return;
      // Opaque, so it also clips the dashed legs the way a real note does.
      stops.appendChild(el('circle', {cx:p.x, cy:p.y, r:12*k, fill:'var(--panel-3)',
        stroke:'var(--seek)', 'stroke-width':1.4*k, class:'hint-name'}));
      const lab = DEGREE_LABEL[deg];
      const t = el('text', {x:p.x, y:p.y + 4*k, 'text-anchor':'middle',
        'font-size':(lab.length > 1 ? 9.5 : 11.5)*k, 'font-weight':600,
        fill:'var(--text)', class:'note-label'});
      t.textContent = lab;
      stops.appendChild(t);
    };

    // The route draws as the instructions read: one leg per grouped step, in
    // the same order the panel numbers them. A reach of two strings is one arc,
    // not two — the string it passes over is counted in the sequence, not
    // stopped on, so drawing a pause there would contradict the sentence above
    // it. The last stop is the destination and gets its own heavier ring below.
    const groups = groupMoves(r.moves);
    const stopsOnRoute = [{p:at(r.from.string, r.from.fret), deg:r.curDeg, mark:false}];
    groups.forEach((g, i) => {
      const m = g[g.length - 1];
      stopsOnRoute.push({p:at(m.string, m.fret), deg:m.to, mark:i < groups.length - 1});
    });

    for(let i = 1; i < stopsOnRoute.length; i++){
      addLeg(stopsOnRoute[i - 1].p, stopsOnRoute[i].p);
      const st = stopsOnRoute[i];
      if(!st.mark) continue;
      // The pauses along the way earn a marker; the destination gets its own
      // heavier ring below.
      rings.appendChild(el('circle', {cx:st.p.x, cy:st.p.y, r:17*k, fill:'none',
        stroke:'var(--seek)', 'stroke-width':2*k, opacity:.55, class:'hint-stop'}));
      nameStop(st.p, st.deg);
    }

    rings.appendChild(el('circle', {cx:c.x, cy:c.y, r:18*k, fill:'none',
      stroke:'var(--seek)', 'stroke-width':2.5*k, class:'hint-dest'}));
    nameStop(c, r.target);

    hintUnderEl.appendChild(under);
    hintOverEl.appendChild(stops);
    hintOverEl.appendChild(rings);
    hintOverEl.appendChild(badges);
  }

  function clearHintRoute(){
    if(hintUnderEl) hintUnderEl.innerHTML = '';
    if(hintOverEl) hintOverEl.innerHTML = '';
  }

  // Asking for the route ends the run. A recall trainer whose help is free,
  // unlimited and consequence-free teaches you to derive the answer instead of
  // remembering it — and deriving is exactly the skill the app is trying to
  // make unnecessary. The cost is announced on the button beforehand, so it's a
  // decision rather than a trap.
  function syncHintCost(){
    hintCostEl.hidden = !(state.mode === 'practice' && state.streak > 0);
  }

  function openHint(){
    const r = computeHintRoute();
    if(!r) return;
    if(state.mode === 'practice' && state.streak > 0){
      setStreak(0);
      trackEvent('HintBrokeStreak');
    }
    hint.open = true;
    hint.route = r;
    renderHintText(r);
    drawHintRoute(r);
    hintPanelEl.hidden = false;
    hintAskBtnEl.hidden = true;
    // Both ends of the route have to be on screen for the arrows to mean
    // anything, so centre between them rather than on either one.
    centerOn(r.dest.string, Math.round((r.from.fret + r.dest.fret) / 2));
    trackEvent('HintOpen', {from: r.curDeg, to: r.target, steps: r.moves.length,
      strings: Math.abs(r.dest.string - r.from.string), frets: r.dest.fret - r.from.fret});
  }

  function closeHint(){
    hint.open = false;
    hint.route = null;
    clearHintRoute();
    hintPanelEl.hidden = true;
    hintAskBtnEl.hidden = false;
  }

  // ---------- settings ----------
  const keySelect = document.getElementById('keySelect');
  KEYS.forEach((k,i)=>{
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = k.name;
    keySelect.appendChild(opt);
  });
  keySelect.addEventListener('change', ()=>{
    if(state.mode === 'timeAttack') return;   // hidden during a run, but guard regardless
    state.keyIndex = +keySelect.value;
    saveSettings();
    resetRun();
  });

  gearBtnEl.addEventListener('click', ()=>{
    settingsDrawerEl.classList.toggle('open');
  });

  // ---------- how-to overlay ----------
  function openHowto(){ howtoEl.classList.add('open'); trackEvent('OpenHowto'); }
  function closeHowto(){ howtoEl.classList.remove('open'); }
  helpBtnEl.addEventListener('click', openHowto);
  howtoCloseEl.addEventListener('click', closeHowto);
  // Click on the dimmed backdrop (but not the card) closes it.
  howtoEl.addEventListener('click', (e)=>{ if(e.target === howtoEl) closeHowto(); });
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Escape') return;
    closeHowto();
    if(tour.active) endTour();
    // Dismissing the gate is the same answer as declining — the alternative is
    // a keyboard user with no way out of it.
    else if(gateEl.classList.contains('open')) declineTour();
  });

  // ---------- first-visit tour ----------
  // The welcome dialog this replaces asked newcomers to rate their own fluency
  // with scale degrees before they'd seen a single one — unanswerable for the
  // exact person it was meant to help. This walks the real board instead, one
  // spotlit thing at a time, and ends by having them play a note. The
  // difficulty question now lives in maybeNudgeHarder(), asked once they can
  // answer it. Gated on the same flag as before, so anyone who already got the
  // old dialog is left alone.
  const ONBOARDED_KEY = 'fretboardwalk.onboarded';
  const TOUR_DEGREE = '5';   // consonant, easy to name, and always several frets away

  function markOnboarded(){ try{ localStorage.setItem(ONBOARDED_KEY, '1'); }catch(e){} }
  function shouldTour(){
    // ?init=true force-shows the tour regardless of the saved flag — handy for
    // testing without clearing storage.
    try{ if(new URLSearchParams(location.search).get('init') === 'true') return true; }catch(e){}
    try{ return !localStorage.getItem(ONBOARDED_KEY); }catch(e){ return false; }
  }

  // `restore` holds the display settings the tour overrode, so replaying it from
  // the ? button doesn't quietly cost someone the Hidden mode they'd worked up
  // to. Null whenever no tour is running.
  let tour = {active:false, i:0, awaitingTap:false, restore:null, run:null, cyc:null};

  // The sequence strip the hint panel draws, built from a bare map of
  // degree -> class instead of from a computed route — so the tour can show it
  // before there is any route to explain, in exactly the styling it will keep
  // meeting later. Same markup, same CSS: a first-visit picture that turns into
  // a familiar one rather than a second dialect of the same idea.
  function cycleRowHtml(marks){
    const cells = CYCLE.map((d, i)=>{
      const cls = [];
      if(marks[d]) cls.push(marks[d]);
      // Written cut at its odd join, so the 4 and the 7 at either end are the
      // two sides of one seam rather than two separate things to memorise.
      if(i === 0 || i === CYCLE.length - 1) cls.push('seam');
      return `<span class="${cls.join(' ')}">${d}</span>`;
    }).join('');
    return `<div class="hint-cycle">${cells}</div>`;
  }

  // Three notes on one string that catch the scale changing its stride: a whole
  // step and then a half, side by side. Both runs the board can show are of that
  // shape — 2 3 4 and 6 7 1 — which are also, not by coincidence, the only two
  // places the major scale has a half step in it.
  const SCALE_RUNS = [['2','3','4'], ['6','7','1']];
  function scaleRun(){
    const out = [];
    for(const degrees of SCALE_RUNS){
      for(let s=0; s<6; s++){
        // f+3 is the last note of the run, so it has to be a real fret; and the
        // run starts off the nut so the first note has a fret wire either side.
        for(let f=1; f+3<=FRET_COUNT; f++){
          if(majorDegreeAt(s, f) === degrees[0]) out.push({s, f, degrees});
        }
      }
    }
    // Mid-neck for the same reason as the two steps after it (see cycleColumn):
    // the board scrolls only as far as its own end.
    out.sort((a, b)=> Math.abs(a.f - 5) - Math.abs(b.f - 5) || a.s - b.s);
    return out[0] || null;
  }

  // One fret read across all six strings: the sequence's own order, in the
  // loaded key, on the board.
  //
  // Five of the six string pairs are tuned a fourth apart, so the same fret
  // gives the next place along. G to B is a major third — a semitone closer —
  // so from the B string up, the run steps a fret higher. That kink is drawn
  // rather than described: it is the single thing that trips people crossing
  // strings, and a demonstration that quietly avoided it would be teaching a
  // rule the neck doesn't keep.
  //
  // Six strings is five crossings, and none of them may set off from the 4 —
  // that one join is a tritone rather than a fourth and lands outside the key
  // altogether, which is a different lesson for a different day.
  function cycleColumn(){
    const found = [];
    for(let f=0; f+1<=FRET_COUNT; f++){
      const i = CYCLE.indexOf(majorDegreeAt(0, f));
      if(i < 0 || i + 5 >= CYCLE.length) continue;
      const degrees = CYCLE.slice(i, i + 6);
      // Built from the tuning rule, then checked against the board's own pitch
      // maths rather than trusted. A column that doesn't actually read this way
      // is dropped, so the step can never point at six notes and name them wrong.
      const cells = degrees.map((deg, sIdx)=> ({s:sIdx, f: sIdx >= 4 ? f + 1 : f, deg}));
      if(cells.every(c => majorDegreeAt(c.s, c.f) === c.deg)) found.push({fret:f, cells, degrees});
    }
    // Low on the neck, and not merely a preference. The board stops scrolling
    // at its own end, so anything past about the 6th fret can never be lifted
    // clear of the tour card on a phone however hard centerOnClear tries —
    // hence a hard cutoff rather than a distance from the middle. Only one of
    // the twelve keys is left with the open strings, and a column read off the
    // open strings is no worse a demonstration than any other.
    const cost = (f)=> f <= 6 ? Math.abs(f - 3) : 50 + f;
    found.sort((a, b)=> cost(a.fret) - cost(b.fret));
    return found[0] || null;
  }

  // {key} is filled from the live key so the copy never claims C major to
  // someone who arrived on a link with another key saved.
  const TOUR_STEPS = [
    {
      title:'Every circle is a note that fits',
      body:'Circles mark the notes of {key} — the seven that sound at home together, repeating all the way up the neck. The number is just which step of the scale it is: 1, 2, 3, up to 7.',
      target:()=> fretboardWrapEl, pad:4,
    },
    {
      // Every instance of the current degree lights up, not only the one you're
      // on, so the copy has to own that rather than say "the glowing note" —
      // and the repetition is the whole reason degrees beat note names anyway.
      title:"You're standing on a 1",
      body:'This one is your position. Notice the other 1s lit up too — one scale step turns up in a dozen places on a neck, which is exactly why these are worth learning as numbers.',
      target:()=> currentNoteNode(), pad:16, radius:'50%',
      // Root position sits low on the neck, which on a phone is exactly where
      // the card is — without this the step spotlights a note behind its own
      // explanation.
      focus:()=> ({s:state.current.string, f:state.current.fret}),
    },
    {
      title:'Find is the one to go to next',
      body:"It's asking for the 5 — the fifth step of the scale. Same number, same distance, in every key: learn the shape once and it travels.",
      target:()=> document.querySelector('.plaque.target'), pad:7,
    },
    {
      title:'Your turn — tap a 5',
      body:'Every 5 on the neck is ringed in gold, and they all count. Pick whichever one you can reach.',
      target:()=> fretboardWrapEl, pad:4, awaitTap:true,
    },
    {
      // Half of the technique: how far to slide once you're on the right string.
      // The other half — how to get to the right string — is the step after
      // this one, and neither is much use without the other. This one first
      // because it is only the scale they met in step 1, seen sideways: the
      // sequence is a new idea, this is a fact about something they already
      // have.
      title:'Along a string, it’s just the scale',
      body(){
        const d = tour.run ? tour.run.degrees : SCALE_RUNS[0];
        return `<p>Up one string is the scale itself — uneven: here <b>${d[0]}</b> to <b>${d[1]}</b> is two frets, <b>${d[1]}</b> to <b>${d[2]}</b> one.</p>`
          + formulaRowHtml(d[0], d[2], true)
          + `<p>Only <b>3 to 4</b> and <b>7 to 1</b> are short, every key — the whole formula, and what sets your slide.</p>`;
      },
      target:()=> tour.run ? boardSpanNode(runCells()) : fretboardWrapEl,
      pad:10,
      // Centred on the middle of the run: a three-fret stretch centred on
      // either end puts the other end under the card.
      focus:()=> tour.run ? {s:tour.run.s, f:tour.run.f, f2:tour.run.f + 3} : null,
      enter(){
        tour.run = scaleRun();
        if(!tour.run) return;
        state.current = {string:tour.run.s, fret:tour.run.f};
        state.prevDegree = null;
        state.prevDegree2 = null;
        state.targetDegree = tour.run.degrees[2];
        renderNotes();
        renderPlaques();
      },
      mark(){
        if(!tour.run) return;
        const cells = runCells();
        markSpan(cells);
        for(const c of cells.slice(1)) markCell(c.s, c.f);
      },
    },
    {
      // The method, and the reason the app is playable with the numbers off.
      // Every step before this one teaches the game; without this one the game
      // has no technique behind it, and Hidden mode is just guessing faster.
      // Shown on the real neck in the real key rather than as a diagram — the
      // numerals are already printed on those circles, so the board says
      // 7 3 6 2 by itself and the copy only has to point.
      title:'Too far to slide? Cross strings.',
      body(){
        // cycleColumn() has a candidate in every key, but a step that throws
        // would take the whole tour down with it.
        const d = tour.cyc ? tour.cyc.degrees : CYCLE.slice(0, 6);
        const marks = {};
        d.forEach((deg, i)=>{ marks[deg] = i === 0 ? 'from' : i === 1 ? 'to' : 'via'; });
        return `<p>Your <b>${d[1]}</b> is five frets up this string — but one string over, at the <b>same fret</b>, it's already there. Too far to slide? Cross instead.</p>`
          + `<p>Each string you cross is one step along the <b>circle of fourths</b>: <b>7 3 6 2 5 1 4</b>, same order in every key. Learn those seven and cross without counting.</p>`
          + cycleRowHtml(marks)
          + `<p>One catch: <b>G to B</b> is tuned a third, not a fourth — the number sits <b>a fret higher</b>, and stays there the rest of the way up. <a href="/major-minor-degree-map" target="_blank" rel="noopener">The degree map</a> draws it out.</p>`;
      },
      target:()=> tour.cyc ? boardSpanNode(columnCells()) : fretboardWrapEl,
      pad:10,
      // The run covers two frets now that the G-B jog is in it, so it is
      // centred between them rather than on either.
      focus:()=> tour.cyc ? {s:0, f:tour.cyc.fret, f2:tour.cyc.fret + 1} : null,
      enter(){
        tour.cyc = cycleColumn();
        if(!tour.cyc) return;
        // Asked for the degree ONE string over rather than the one at the far
        // end of the run: crossing is what the sequence buys you, and a target
        // five strings away is one the very next step would tell them to slide
        // to instead.
        state.current = {string:0, fret:tour.cyc.fret};
        state.prevDegree = null;
        state.prevDegree2 = null;
        state.targetDegree = tour.cyc.degrees[1];
        renderNotes();
        renderPlaques();
      },
      mark(){
        if(!tour.cyc) return;
        const cells = columnCells();
        markSpan(cells);
        // The first one is already the live note, lit by renderNotes — ringing
        // it again would say "go here" about the place you're standing.
        for(const c of cells.slice(1)) markCell(c.s, c.f);
      },
    },
    {
      // The two moves, and the only question worth asking before making one.
      // This is where the tour used to spend a whole hands-on step on the
      // sequence's broken join. That join is real, but it is an exception, and
      // drilling an exception before the rule is in place teaches the
      // exception. The rule is: how far apart are the two numbers. The join is
      // still there on the degree map for whoever goes looking, which is the
      // moment it means anything.
      title:'Which move, and when',
      body(){
        const r = tour.run ? tour.run.degrees : SCALE_RUNS[0];
        const c = tour.cyc ? tour.cyc.degrees : CYCLE.slice(0, 4);
        return `<p>Every turn asks the same question: how far is <b>Find</b> from <b>Current</b>? A step or two — like <b>${r[0]}</b> to <b>${r[2]}</b> — and it's already on the string you're on, four frets at most. Slide, and let the formula tell you how far.</p>`
          + `<p>Any further and sliding means half the neck. Cross instead: one string over covers five frets in a single move, which is what the <b>circle of fourths</b> buys you — it's how the <b>${c[0]}</b> reached the <b>${c[1]}</b>. Get near with the sequence, then slide the rest with the formula. Across, then along.</p>`;
      },
      // The two numbers the decision is read off, which is the whole step.
      target:()=> elementSpanNode(['.plaque.current', '.plaque.target']),
      pad:7,
    },
    {
      // The payoff, and the first one that arrives. Everything before this is
      // method; a beginner who has just been handed two of those and a rule for
      // choosing between them is owed an answer to "and then what". Chords are
      // the honest answer because they are the thing they are already learning
      // — the numbers turn a shape they memorised into one they can read.
      title:'What this buys you',
      body:
        `<p>Knowing the neck makes you a better improviser — and it pays off in the chords you're already learning.</p>`
      + `<p>Every chord you know is built from the <b>1</b>, the <b>3</b> and the <b>5</b>. Swap the <b>3</b> for a <b>♭3</b> to make it minor; add the <b>2</b> or <b>4</b> for sus chords. Same for 7ths.</p>`
      + `<p><a href="/chords-from-degrees" target="_blank" rel="noopener">Chords from degrees</a> takes it from there.</p>`,
      // No one spot on the board is the subject — the whole neck is.
      target:()=> fretboardWrapEl, pad:4,
    },
    {
      // The destination, stated plainly. Numerals are a crutch the app is
      // supposed to take away, and a beginner who never learns that just plays
      // a reading game forever. maybeNudgeHarder() offers the switch later; this
      // is only where they find out it's the point.
      title:'The goal: turn the numbers off',
      body:'<p>Reading numbers off the neck is the training wheels. As it gets easy, drop this to <b>Dots only</b>, then <b>Hidden</b> — recalling a shape you can\'t see is the real skill. The <a href="/help" target="_blank" rel="noopener">guide</a> behind the <b>?</b> button has tips and tricks for memorising it faster.</p>'
       // Six steps of pointing at numbered circles still never says what a
       // scale degree *is*. Anyone who nodded along without that landing gets
       // told plainly where to find it, rather than being left to guess.
       + '<p>Not sure what a scale degree actually is? <a href="/scale-degrees" target="_blank" rel="noopener">Scale degrees explained</a> walks through the numbers 1–7 in plain English — no theory background needed.</p>',
      target:()=> noteVisibilitySeg.closest('.setting-row'),
      pad:8, next:'Start playing',
      // On phones the control lives in a collapsed drawer, so there'd be
      // nothing to point at. Opening it also shows them exactly where to go.
      enter:()=> settingsDrawerEl.classList.add('open'),
      settle:320,   // just past the drawer's .26s max-height transition
    },
  ];

  function currentNoteNode(){
    const row = noteIndex[state.current.string];
    const g = row ? row[state.current.fret] : null;
    // The group also carries the .pulse halo, which scales to 1.85 forever — so
    // its bounding box breathes, and a spotlight measured from it would throb
    // with it. The solid circle underneath is a fixed size.
    return g ? g.querySelector('.note-visible') : null;
  }

  // The hole is positioned in .app's coordinate space, so every target — an SVG
  // note group inside a scroller, a plaque in the rail, the header streak box —
  // goes through the same two rects and nothing needs to know where it lives.
  function positionTourHole(){
    const step = TOUR_STEPS[tour.i];
    if(!step) return;
    let node = null;
    try{ node = step.target(); }catch(e){}
    if(!node){ tourHoleEl.style.opacity = '0'; placeTourCard(null); return; }
    const a = appEl.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    const pad = step.pad || 8;
    tourHoleEl.style.opacity = '1';
    tourHoleEl.style.left   = (r.left - a.left - pad) + 'px';
    tourHoleEl.style.top    = (r.top  - a.top  - pad) + 'px';
    tourHoleEl.style.width  = (r.width  + pad*2) + 'px';
    tourHoleEl.style.height = (r.height + pad*2) + 'px';
    tourHoleEl.style.borderRadius = step.radius || '14px';
    placeTourCard({left: r.left - a.left - pad, width: r.width + pad*2});
  }

  // Where the card sits so that it isn't covering the thing it describes.
  //
  // The two boards need opposite tactics. A vertical board scrolls, so the card
  // stays put at the bottom and centerOnClear lifts the subject into the space
  // above it. A horizontal board can't scroll — the whole neck is already on
  // screen, and a fret column runs the full height of it, so there is no "above"
  // to move anything into — but it is wide, so the card moves sideways instead,
  // to whichever end the subject isn't at.
  //
  // Decided from the subject's own position rather than from whether the two
  // currently overlap, so it can't oscillate. A subject spanning most of the
  // width (the whole board, on the opening step) has no clear side to prefer,
  // and stays centred.
  function placeTourCard(hole){
    tourCardEl.classList.remove('left', 'right');
    if(!hole || !layout || layout.orientation !== 'horizontal') return;
    const w = appEl.getBoundingClientRect().width;
    if(!w || hole.width > w * 0.55) return;
    tourCardEl.classList.add(hole.left + hole.width/2 < w/2 ? 'right' : 'left');
  }

  // One ring on one position. Appended to the existing note group (so it
  // inherits its position) and reading its centre off the circle already there
  // rather than recomputing layout maths.
  function markCell(s, f, cls){
    const node = noteIndex[s] && noteIndex[s][f];
    if(!node) return null;
    const base = node.querySelector('.note-visible');
    if(!base) return null;
    const ring = el('circle', {
      cx: base.getAttribute('cx'), cy: base.getAttribute('cy'),
      r: 16*layout.noteScale, fill:'none',
      stroke:'var(--seek)', 'stroke-width':2.5, class: cls || 'tour-hint'
    });
    node.appendChild(ring);
    return ring;
  }

  // A dashed thread through a run of positions, drawn UNDER the notes so it
  // reads as the path between them rather than a line over the top. Static
  // rather than pulsing: it is the route, not the invitation.
  function markSpan(cells){
    const pts = [];
    for(const c of cells){
      const node = noteIndex[c.s] && noteIndex[c.s][c.f];
      const base = node && node.querySelector('.note-visible');
      if(base) pts.push(base.getAttribute('cx') + ',' + base.getAttribute('cy'));
    }
    if(pts.length < 2) return;
    notesGroupEl.insertBefore(el('polyline', {
      points: pts.join(' '), fill:'none', stroke:'var(--seek)',
      'stroke-width':1.6, 'stroke-dasharray':'4 4', opacity:.75,
      class:'tour-mark tour-span'
    }), notesGroupEl.firstChild);
  }

  // A stand-in target covering several things at once, for the steps whose
  // subject is a run of notes or a pair of controls rather than one element.
  // positionTourHole only ever asks a target for its bounding rect, so anything
  // that can answer that is a valid target — no wrapper has to exist in the DOM.
  function spanNode(rects){
    if(!rects.length) return null;
    const l = Math.min(...rects.map(q => q.left));
    const t = Math.min(...rects.map(q => q.top));
    const r = Math.max(...rects.map(q => q.right));
    const b = Math.max(...rects.map(q => q.bottom));
    return {getBoundingClientRect: ()=> ({left:l, top:t, right:r, bottom:b, width:r-l, height:b-t})};
  }

  // Measured off .note-visible for the same reason currentNoteNode is: the
  // group also carries the breathing .pulse halo.
  function boardSpanNode(cells){
    const rects = [];
    for(const c of cells){
      const node = noteIndex[c.s] && noteIndex[c.s][c.f];
      const base = node && node.querySelector('.note-visible');
      if(base) rects.push(base.getBoundingClientRect());
    }
    return spanNode(rects);
  }

  function elementSpanNode(selectors){
    return spanNode(selectors
      .map(sel => document.querySelector(sel))
      .filter(Boolean)
      .map(n => n.getBoundingClientRect()));
  }

  // Rings on every valid answer for the hands-on step — the fastest way to say
  // "several spots count" without a sentence about it.
  function showTapHints(){
    for(let s=0; s<6; s++){
      for(let f=0; f<=FRET_COUNT; f++){
        if(degreeAt(s,f) === TOUR_DEGREE) markCell(s, f);
      }
    }
  }
  function clearBoardMarks(){
    for(const n of boardEl.querySelectorAll('.tour-hint, .tour-mark')) n.remove();
  }

  // ---------- the two board-teaching steps ----------
  // The three notes of the scale run: a whole step, then a half.
  const runCells = ()=> [0, 2, 3].map(d => ({s: tour.run.s, f: tour.run.f + d}));
  const columnCells = ()=> tour.cyc.cells;
  // A one-line answer to a tap, keeping the step where it is. The card jogs
  // rather than flashing red: someone missing here is expected, not wrong.
  function tourSay(html){
    if(html) tourBodyEl.innerHTML = html;
    restartAnim(tourCardEl, 'jog');
  }

  // Shared by every step that ends on a tap.
  function tourAdvanceAfterTap(){
    tour.awaitingTap = false;
    tourEl.classList.remove('await-tap');
    // Waits out the 380ms move so the next step doesn't talk over the board
    // rearranging itself.
    const next = tour.i + 1;
    setTimeout(()=> goToTourStep(next), 460);
  }

  function goToTourStep(i){
    tour.i = i;
    const step = TOUR_STEPS[i];

    // enter() first: a step that has to go looking for its own subject on the
    // board (a fret where the sequence reads cleanly, a 4 with a string above
    // it) can come up empty in a way that decides whether the step is hands-on
    // at all — so awaitTap is allowed to be a question asked afterwards.
    if(step.enter) step.enter();
    tour.awaitingTap = typeof step.awaitTap === 'function' ? step.awaitTap() : !!step.awaitTap;
    tourEl.classList.toggle('await-tap', tour.awaitingTap);

    tourStepEl.textContent = `Step ${i+1} of ${TOUR_STEPS.length}`;
    tourTitleEl.textContent = step.title;
    // innerHTML because a couple of steps carry emphasis and a link. Every
    // string here is authored above — nothing user-supplied reaches this.
    // A couple of steps build their copy from whatever they found on the board,
    // so body can be a function; either way {key} is filled from the live key.
    const copy = typeof step.body === 'function' ? step.body() : step.body;
    tourBodyEl.innerHTML = copy.replace('{key}', KEYS[state.keyIndex].name);
    tourNextEl.hidden = tour.awaitingTap;
    tourNextEl.textContent = step.next || 'Next';
    tourSkipEl.hidden = (i === TOUR_STEPS.length - 1);   // nothing left to skip past
    // Steps whose copy changes as they're played write it themselves, once the
    // static body above has been laid down.
    if(step.after) step.after();
    // Scrolled only now: how much neck is left clear depends on how tall the
    // card is, and the card is not that tall until its own copy is in it.
    if(step.focus){
      const c = step.focus();
      if(c) centerOnClear(c.s, c.f, c.f2);
    }

    clearBoardMarks();
    if(step.mark) step.mark();
    else if(tour.awaitingTap) showTapHints();
    positionTourHole();
    // A step that reveals its own target (opening the drawer) can't be measured
    // until that settles; the hole's CSS transition makes the correction read
    // as one movement rather than a jump.
    if(step.settle) setTimeout(()=>{ if(tour.active && tour.i === i) positionTourHole(); }, step.settle);
  }

  // Called from handleClick while the hands-on step is waiting. A miss names
  // the degree they actually hit — the single most useful thing to say, and it
  // teaches the vocabulary in passing.
  function tourHandleTap(deg, isCorrect){
    if(isCorrect){ tourAdvanceAfterTap(); return; }
    tourSay(deg === null
      ? "That one isn't in the scale, which is why it has no circle. Tap any circle ringed in gold."
      : `That's a ${DEGREE_LABEL[deg]}. You're after a 5 — any circle ringed in gold.`);
  }

  function startTour(){
    tour.active = true;
    closeHowto();          // the tour can be launched from in there
    gateEl.classList.remove('open');

    // The tour describes seven numbered circles, so the board has to actually
    // be showing them — a saved Hidden/flats setting would leave the copy
    // pointing at a neck that doesn't match. Remembered rather than imposed:
    // endTour puts it all back.
    tour.restore = {
      noteDisplay: state.noteDisplay,
      showNames: state.showNames,
      includeFlats: state.includeFlats,
    };
    state.noteDisplay = 'numerals';
    state.showNames = false;
    state.includeFlats = false;
    syncSettingsUI();
    saveSettings();

    state.current = rootStartPosition();
    state.prevDegree = null;
    state.prevDegree2 = null;
    state.targetDegree = TOUR_DEGREE;   // fixed, so step 3 and 4 can name it
    setStreak(0);
    renderCells();
    renderNotes();
    renderPlaques();

    document.body.classList.add('tour-open');
    tourEl.classList.add('open');
    // Root position sits well down a 15-fret neck, so bring it into view before
    // any hole is measured against it.
    centerOn(state.current.string, state.current.fret);
    requestAnimationFrame(()=> goToTourStep(0));
    trackEvent('TourStart');
  }

  function endTour(){
    const finished = tour.i >= TOUR_STEPS.length - 1;
    tour.active = false;
    tour.awaitingTap = false;
    tour.run = null;
    tour.cyc = null;
    clearBoardMarks();
    tourEl.classList.remove('open', 'await-tap');
    tourCardEl.classList.remove('left', 'right');
    document.body.classList.remove('tour-open');
    // The last step opens the drawer to point inside it. On wide screens that's
    // the rail's normal resting state; on phones it isn't, so hand the board
    // back its space.
    if(!mqWide.matches) settingsDrawerEl.classList.remove('open');
    restoreAfterTour();
    markOnboarded();
    trackEvent(finished ? 'TourComplete' : 'TourSkip', {step: tour.i + 1});
  }

  // Puts back whatever the tour overrode. On a first visit these are already the
  // defaults so nothing visibly happens; on a replay it's the difference between
  // a helpful refresher and one that resets your difficulty.
  function restoreAfterTour(){
    const r = tour.restore;
    tour.restore = null;
    if(!r) return;

    const flatsChanged = r.includeFlats !== state.includeFlats;
    state.noteDisplay = r.noteDisplay;
    state.showNames = r.showNames;
    state.includeFlats = r.includeFlats;
    syncSettingsUI();
    saveSettings();

    if(flatsChanged){
      // Bringing the lowered degrees back changes the degree-per-cell mapping,
      // and the tour left the run standing on a plain major degree with a plain
      // major target. Restarting is the one state guaranteed to be coherent.
      resetRun();
    } else {
      renderNotes();
    }
  }

  tourNextEl.addEventListener('click', ()=>{
    if(tour.i >= TOUR_STEPS.length - 1) endTour();
    else goToTourStep(tour.i + 1);
  });
  tourSkipEl.addEventListener('click', endTour);

  // ---------- first-visit gate ----------
  // Asking "want showing around?" needs no musical knowledge, so it's a fair
  // question to put in front of someone who hasn't seen the app — unlike the
  // difficulty picker this replaced. Either answer counts as onboarded, and the
  // ? button keeps the tour reachable afterwards.
  function declineTour(){
    gateEl.classList.remove('open');
    markOnboarded();
    trackEvent('TourDeclined');
  }
  gateYesEl.addEventListener('click', startTour);
  gateNoEl.addEventListener('click', declineTour);
  howtoTourBtnEl.addEventListener('click', ()=>{
    trackEvent('TourReplay');
    startTour();
  });
  // The board scrolls under the spotlight (smooth-scrolling into position, or
  // the player dragging the neck during the hands-on step), so the hole has to
  // track it rather than being placed once.
  neckScrollEl.addEventListener('scroll', ()=>{ if(tour.active) positionTourHole(); }, {passive:true});

  // ---------- "make it harder" nudge ----------
  // The difficulty question, asked at the first moment it's answerable. A
  // 10-streak in numerals means they've read plenty of degrees off the neck —
  // now "hide the numbers" describes something they've seen.
  const NUDGE_KEY = 'fretboardwalk.harderNudge';
  const NUDGE_AT_STREAK = 10;

  function closeNudge(){
    nudgeEl.classList.remove('open');
    try{ localStorage.setItem(NUDGE_KEY, '1'); }catch(e){}
  }
  function maybeNudgeHarder(streak){
    if(streak < NUDGE_AT_STREAK) return;
    if(tour.active || state.mode !== 'practice') return;
    if(state.noteDisplay !== 'numerals') return;   // nothing left to hide
    if(nudgeEl.classList.contains('open')) return;
    // A storage failure counts as "already seen" so it can't nag every session.
    try{ if(localStorage.getItem(NUDGE_KEY)) return; }catch(e){ return; }
    nudgeEl.classList.add('open');
    trackEvent('HarderNudgeShown');
  }
  nudgeYesEl.addEventListener('click', ()=>{
    // Dots, not hidden: the next rung up, not the top of the ladder.
    state.noteDisplay = 'dots';
    syncSettingsUI();
    saveSettings();
    renderNotes();
    if(hint.open) drawHintRoute(hint.route);
    trackEvent('HarderNudgeAccept');
    closeNudge();
  });
  nudgeNoEl.addEventListener('click', ()=>{
    trackEvent('HarderNudgeDismiss');
    closeNudge();
  });

  const NOTE_DISPLAY_EVENT = {numerals:'SwitchNumerals', dots:'SwitchDots', hidden:'SwitchHidden'};
  const noteVisibilitySeg = document.getElementById('noteVisibilitySeg');
  noteVisibilitySeg.addEventListener('click', (e)=>{
    const btn = e.target.closest('.seg-btn');
    if(!btn) return;
    state.noteDisplay = btn.dataset.val;
    for(const b of noteVisibilitySeg.children) b.classList.toggle('active', b===btn);
    trackEvent(NOTE_DISPLAY_EVENT[state.noteDisplay]);
    saveSettings();
    renderNotes();
    // Whether the route has to name its own stops depends on this setting.
    if(hint.open) drawHintRoute(hint.route);
  });

  const toggleFlats = document.getElementById('toggleFlats');
  toggleFlats.addEventListener('click', ()=>{
    // The settings rail stays reachable on wide screens during time attack;
    // flipping this mid-run could invalidate the live current/target degree
    // out from under a running countdown, so it's blocked outright there.
    if(state.mode === 'timeAttack') return;
    state.includeFlats = !state.includeFlats;
    toggleFlats.classList.toggle('on', state.includeFlats);
    saveSettings();
    closeHint();   // the degree-per-cell mapping is about to change under it

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
    saveSettings();
    renderNotes();
  });

  const toggleSound = document.getElementById('toggleSound');
  toggleSound.addEventListener('click', ()=>{
    state.soundOn = !state.soundOn;
    toggleSound.classList.toggle('on', state.soundOn);
    saveSettings();
  });

  const guitarTypeSeg = document.getElementById('guitarTypeSeg');
  guitarTypeSeg.addEventListener('click', (e)=>{
    const btn = e.target.closest('.seg-btn');
    if(!btn || btn.dataset.val === state.guitarType) return;
    state.guitarType = btn.dataset.val;
    for(const b of guitarTypeSeg.children) b.classList.toggle('active', b===btn);
    saveSettings();
    loadGuitarSamples(state.guitarType);
  });

  // Reflects state onto the controls above after a load — the markup's
  // hardcoded active/on classes are just the factory defaults, which
  // loadSettings() may have already overridden.
  function syncSettingsUI(){
    keySelect.value = state.keyIndex;
    for(const b of noteVisibilitySeg.children) b.classList.toggle('active', b.dataset.val === state.noteDisplay);
    toggleFlats.classList.toggle('on', state.includeFlats);
    toggleNames.classList.toggle('on', state.showNames);
    toggleSound.classList.toggle('on', state.soundOn);
    for(const b of guitarTypeSeg.children) b.classList.toggle('active', b.dataset.val === state.guitarType);
  }

  hintAskBtnEl.addEventListener('click', openHint);
  hintCloseBtnEl.addEventListener('click', ()=>{
    trackEvent('HintClose');
    closeHint();
  });

  restartBtnEl.addEventListener('click', resetRun);

  // The one tile toggles: it's Start in practice, Stop mid-run. Stopping
  // aborts back to practice (exitTimeAttack) rather than showing the results
  // screen — quitting isn't the same as the clock catching you.
  taStartBtnEl.addEventListener('click', ()=>{
    if(state.mode === 'timeAttack') exitTimeAttack();
    else startTimeAttack();
  });
  taAgainBtnEl.addEventListener('click', startTimeAttack);
  taExitBtnEl.addEventListener('click', exitTimeAttack);

  function resetRun(){
    // Restarting mid-sprint would desync the live countdown from whatever
    // position/target it just reset to; the settings rail stays reachable
    // on wide screens even during time attack, so this needs its own guard
    // rather than relying on the button being hidden.
    if(state.mode === 'timeAttack') return;
    closeHint();   // its route points at the position we're about to leave
    state.current = rootStartPosition();
    state.prevDegree = null;
    state.prevDegree2 = null;
    state.targetDegree = pickNextTargetDegree();
    setStreak(0);
    renderCells();   // covers the key-change path; a no-op cost otherwise since this only runs on manual restart/key-change, never mid-game
    renderNotes();
    renderPlaques();
    neckScrollEl.scrollTo({left:0, top:0, behavior:'smooth'});
  }

  // ---------- responsive chrome ----------
  // Move the settings panel between the mobile drawer and the desktop rail.
  // Moving the real node rather than duplicating keeps one source of truth, and
  // listeners ride along since they're bound to these elements.
  function placeChrome(){
    const drawer = settingsDrawerEl;
    const slot   = sideSlotEl;
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
    const scroller = neckScrollEl;
    scroller.scrollLeft = 0;
    scroller.scrollTop = 0;
    // buildStaticBoard minted a fresh hintGroup and every coordinate moved, so
    // an open route has to be drawn again against the new layout.
    if(hint.open) drawHintRoute(hint.route);
    // renderNotes above threw away the note groups the hints and the spotlight
    // were measured against, so both have to be re-derived from the new ones.
    if(tour.active){
      const step = TOUR_STEPS[tour.i];
      if(step && step.mark) step.mark();
      else if(tour.awaitingTap) showTapHints();
      centerOn(state.current.string, state.current.fret);
      positionTourHole();
    }
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

  // Where to stand when ?at= names a degree rather than a square: the one
  // nearest the middle of the neck, which is the only place a route has
  // somewhere to go in all four directions. Anywhere near an end or an outer
  // string quietly answers a different question than the one being asked.
  // Measured with the hint's own hand prices rather than a weight invented for
  // the occasion: frets and strings are different sizes, and the router already
  // knows by how much.
  function midNeckSquare(degree){
    let best = null;
    for(let s = 0; s <= 5; s++) for(let f = 0; f <= FRET_COUNT; f++){
      if(degreeAt(s, f) !== degree) continue;
      const d = PRICE_FRET * Math.abs(f - FRET_COUNT / 2) +
                PRICE_STRING * Math.abs(s - 2.5);
      if(!best || d < best.d) best = {d, square:{string:s, fret:f}};
    }
    return best && best.square;
  }

  // ?at=<string>.<fret> or ?at=<degree>, with ?find=<degree>: pins the opening
  // position and the first question — the same kind of handle as ?init=true,
  // and the only way to look at one particular route without playing until the
  // game happens to offer it. Strings count from the low E; degrees are written
  // the way the cells are ('b7', not '♭7'). Anything that doesn't name a real
  // square or an enabled degree is ignored rather than guessed at.
  function applyStartOverride(){
    let q;
    try{ q = new URLSearchParams(location.search); }catch(e){ return; }
    const at = q.get('at') || '', n = at.split('.').map(Number);
    const square = n.length === 2 && n.every(Number.isInteger) &&
                   n[0] >= 0 && n[0] <= 5 && n[1] >= 0 && n[1] <= FRET_COUNT
      ? {string:n[0], fret:n[1]}
      : (enabledDegrees().indexOf(at) >= 0 ? midNeckSquare(at) : null);
    if(square) state.current = square;

    const find = q.get('find');
    if(find && enabledDegrees().indexOf(find) >= 0) state.targetDegree = find;
  }

  // ---------- init ----------
  loadGuitarSamples(state.guitarType);   // fire and forget: warms the cache before the first click
  state.current = rootStartPosition();
  state.targetDegree = pickNextTargetDegree();
  applyStartOverride();
  syncSettingsUI();
  placeChrome();
  buildStaticBoard();
  renderCells();
  renderNotes();
  renderPlaques();

  if(shouldTour()) gateEl.classList.add('open');

})();
