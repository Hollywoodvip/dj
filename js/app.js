/* ==========================================================================
   WEBDJ PRO - UI, mixer, sync, mix assistant, auto mix / auto DJ,
   library, YouTube converter and keyboard shortcuts
   ========================================================================== */
const $ = (id) => document.getElementById(id);
const decks = { a: new Deck('A'), b: new Deck('B') };
const deckList = [decks.a, decks.b];
const otherDeck = (d) => (d === decks.a ? decks.b : decks.a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const HOTCUE_COLORS = { 1: '#22c55e', 2: '#f59e0b', 3: '#a855f7' };
const WAVE_COLORS = { low: '#2563eb', mid: '#f59e0b', high: '#f8fafc' };

/* ==========================================================================
   TEMPLATES
   ========================================================================== */
function deckTemplate(k) {
    const K = k.toUpperCase();
    const c = k === 'a' ? 'cyan' : 'rose';
    const pitch = `
        <div class="col-span-3 flex flex-col items-center justify-between gap-1 bg-black/30 p-2 rounded border border-gray-800/80 h-full">
            <span class="text-[10px] font-bold text-gray-400">PITCH</span>
            <input id="deck-${k}-pitch" type="range" min="0.92" max="1.08" step="0.0005" value="1" class="h-32 vertical-pitch" title="Doble clic = 0%">
            <span id="deck-${k}-pitch-val" class="font-digits text-[10px] text-${c}-400">+0.0%</span>
            <button id="deck-${k}-range" class="mini-btn" title="Rango del pitch">±8%</button>
        </div>`;
    const jog = `
        <div class="col-span-9 flex justify-center items-center py-1">
            <div id="deck-${k}-jog" class="jog-wheel w-40 h-40 md:w-48 md:h-48 rounded-full">
                <div class="jog-grooves"></div>
                <div id="deck-${k}-jog-rotor" class="absolute inset-0 pointer-events-none">
                    <div class="absolute top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-6 rounded-full bg-${c}-400" style="box-shadow:0 0 8px currentColor"></div>
                </div>
                <div class="jog-center-label bg-${c}-950 text-${c}-300 border-2 border-${c}-500/50">
                    <span id="deck-${k}-jog-beat" class="font-digits text-base leading-none">-.-</span>
                    <span class="text-[8px] tracking-widest mt-1">DECK ${K}</span>
                </div>
            </div>
        </div>`;
    const fxButtons = FX_TYPES.map(t => `<button data-fx="${t}" class="btn-dj btn-fx py-1 rounded font-bold text-[9px] text-gray-300">${FX_LABELS[t]}</button>`).join('');
    const beatButtons = FX_BEATS.map(b => `<button data-fxbeats="${b}" class="btn-dj btn-fx py-1 rounded font-bold text-[10px] text-gray-300">${beatLabel(b)}</button>`).join('');

    return `
        <div class="bg-black/70 p-2.5 rounded border border-${c}-900/40">
            <div class="flex justify-between items-start gap-2">
                <div class="overflow-hidden min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-xs font-bold text-${c}-400 tracking-wider">DECK ${K}</span>
                        <span id="deck-${k}-key" class="tag" title="Tonalidad (Camelot)">KEY --</span>
                        <span id="deck-${k}-sync-tag" class="tag hidden" style="color:#22d3ee;border-color:#0e7490">SYNC</span>
                        <span id="deck-${k}-trim" class="tag hidden" title="Nivelación automática de volumen entre temas"></span>
                        <span id="deck-${k}-status" class="text-[10px] text-amber-400"></span>
                    </div>
                    <h2 id="deck-${k}-title" class="text-sm font-bold text-white truncate">No track loaded</h2>
                    <span id="deck-${k}-artist" class="text-[10px] text-gray-400 block truncate">Pega un link de YouTube o arrastra un archivo</span>
                </div>
                <div class="text-right shrink-0">
                    <div id="deck-${k}-bpm" class="font-digits text-lg font-bold text-${c}-400 leading-none">--.-</div>
                    <div id="deck-${k}-bpm-orig" class="text-[9px] text-gray-500 mt-0.5">BPM</div>
                    <div class="flex gap-1 justify-end mt-1">
                        <button id="deck-${k}-bpm-half" class="mini-btn" title="El BPM detectado es el doble del real">½</button>
                        <button id="deck-${k}-bpm-double" class="mini-btn" title="El BPM detectado es la mitad del real">×2</button>
                        <button id="deck-${k}-tap" class="mini-btn" title="Toca al ritmo (4+ veces) para fijar el BPM">TAP</button>
                    </div>
                </div>
            </div>
            <canvas id="deck-${k}-zoom" class="w-full h-16 block mt-2 rounded bg-gray-950 border border-gray-800"></canvas>
            <canvas id="deck-${k}-overview" class="w-full h-9 block mt-1 rounded bg-gray-950 border border-gray-800 cursor-pointer" title="Clic para saltar"></canvas>
            <div class="flex justify-between items-center text-xs font-digits text-gray-400 mt-1">
                <span id="deck-${k}-time-elapsed">00:00.0</span>
                <span id="deck-${k}-phrase" class="text-[10px] font-sans text-gray-400"></span>
                <span id="deck-${k}-time-remain">-00:00.0</span>
            </div>
        </div>

        <div class="grid grid-cols-12 gap-2 items-center">
            ${k === 'a' ? pitch + jog : jog + pitch}
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="bg-black/40 p-2 rounded border border-gray-800">
                <span class="text-[10px] font-bold text-gray-400 block mb-1">HOT CUES <span class="text-gray-600 font-normal">(shift+clic borra)</span></span>
                <div class="grid grid-cols-3 gap-1">
                    ${[1, 2, 3].map(n => `<button id="deck-${k}-hot${n}" class="btn-dj py-1.5 rounded font-bold text-gray-300">CUE ${n}</button>`).join('')}
                </div>
            </div>
            <div class="bg-black/40 p-2 rounded border border-gray-800">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-[10px] font-bold text-gray-400">LOOP <span class="text-gray-600 font-normal">(beats)</span></span>
                    <span id="deck-${k}-loop-indicator" class="text-[10px] text-${c}-400 font-digits">OFF</span>
                </div>
                <div class="grid grid-cols-4 gap-1">
                    ${[1, 2, 4, 8].map(b => `<button id="deck-${k}-loop-${b}" class="btn-dj btn-loop py-1.5 rounded font-bold text-gray-300">${b}</button>`).join('')}
                </div>
            </div>
        </div>

        <div class="bg-black/40 p-2 rounded border border-gray-800 text-xs">
            <div class="flex justify-between items-center mb-1">
                <span class="text-[10px] font-bold text-gray-400">BEAT FX</span>
                <span id="deck-${k}-fx-status" class="text-[10px] font-digits text-violet-300"></span>
            </div>
            <div id="deck-${k}-fx-types" class="grid grid-cols-6 gap-1 mb-1.5">${fxButtons}</div>
            <div id="deck-${k}-fx-hint" class="text-[10px] text-gray-400 leading-snug mb-1.5 truncate"></div>
            <div class="grid grid-cols-12 gap-1.5 items-center">
                <div id="deck-${k}-fx-beats" class="col-span-6 grid grid-cols-5 gap-1">${beatButtons}</div>
                <div class="col-span-3 flex flex-col">
                    <span class="text-[9px] text-gray-500">LEVEL/DEPTH</span>
                    <input id="deck-${k}-fx-level" type="range" min="0" max="1" step="0.01" value="0.6" class="w-full slim">
                    <div class="fx-safe-track" title="Verde = zona segura, rojo = arruina el tema"><div id="deck-${k}-fx-safe" style="width:70%"></div></div>
                </div>
                <button id="deck-${k}-fx-on" class="col-span-3 btn-dj btn-fx-on py-2 rounded font-black text-[11px] text-rose-300">FX ON</button>
            </div>
        </div>

        <div class="grid grid-cols-5 gap-2">
            <button id="deck-${k}-cue-btn" class="btn-dj btn-cue py-3 rounded-lg font-black text-sm text-amber-400 flex flex-col items-center justify-center"><i class="fa-solid fa-bookmark mb-0.5"></i> CUE</button>
            <button id="deck-${k}-play-btn" class="btn-dj btn-play py-3 rounded-lg font-black text-sm text-emerald-400 flex flex-col items-center justify-center"><i class="fa-solid fa-play mb-0.5"></i> PLAY</button>
            <button id="deck-${k}-sync-btn" class="btn-dj btn-sync py-3 rounded-lg font-black text-xs text-cyan-400 flex flex-col items-center justify-center"><i class="fa-solid fa-rotate mb-0.5"></i> SYNC</button>
            <button id="deck-${k}-brake-btn" class="btn-dj py-3 rounded-lg font-black text-xs text-rose-400 flex flex-col items-center justify-center"><i class="fa-solid fa-stop mb-0.5"></i> BRAKE</button>
            <button id="deck-${k}-spin-btn" class="btn-dj py-3 rounded-lg font-black text-xs text-violet-300 flex flex-col items-center justify-center"><i class="fa-solid fa-rotate-left mb-0.5"></i> SPIN</button>
        </div>`;
}

function knob(id, min, max, step, def, label, labelClass = 'text-gray-400') {
    return `
        <div class="flex flex-col items-center">
            <span class="text-[9px] ${labelClass}">${label}</span>
            <div class="knob-container" title="Arrastra ↕ · rueda · doble clic = reset">
                <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${def}" data-default="${def}" class="hidden">
                <div class="knob-dial"><div class="knob-indicator"></div></div>
            </div>
        </div>`;
}

function mixerTemplate() {
    const strip = (k) => {
        const c = k === 'a' ? 'cyan' : 'rose';
        return `
            <div class="flex flex-col items-center gap-1.5 bg-black/20 p-1.5 rounded border border-${c}-900/20 ch-${k}">
                <div class="flex items-center gap-1.5">
                    <span class="text-[10px] font-bold text-${c}-400">CH-${k.toUpperCase()}</span>
                    <button id="deck-${k}-eq-reset" class="mini-btn" title="Todas las perillas de este canal a 0">0</button>
                </div>
                ${knob(`deck-${k}-eq-high`, -26, 6, 0.5, 0, 'HI')}
                ${knob(`deck-${k}-eq-mid`, -26, 6, 0.5, 0, 'MID')}
                ${knob(`deck-${k}-eq-low`, -26, 6, 0.5, 0, 'LOW')}
                ${knob(`deck-${k}-filter`, -100, 100, 1, 0, 'FILTER', `font-bold text-${c}-300`)}
            </div>`;
    };
    return `
        <div class="text-xs font-bold text-gray-400 tracking-widest border-b border-gray-800 pb-1 w-full text-center">MIXER</div>
        <div class="grid grid-cols-2 gap-2 w-full">${strip('a')}${strip('b')}</div>
        <div class="grid grid-cols-2 gap-3 w-full bg-black/40 p-2 rounded border border-gray-800">
            <div class="flex justify-center items-center gap-1.5">
                <canvas id="vu-meter-a" class="w-2.5 h-28 bg-gray-900 rounded border border-gray-800"></canvas>
                <input id="deck-a-volume" type="range" min="0" max="1" step="0.01" value="0.9" class="h-28 vertical-pitch">
            </div>
            <div class="flex justify-center items-center gap-1.5">
                <input id="deck-b-volume" type="range" min="0" max="1" step="0.01" value="0.9" class="h-28 vertical-pitch">
                <canvas id="vu-meter-b" class="w-2.5 h-28 bg-gray-900 rounded border border-gray-800"></canvas>
            </div>
        </div>
        <div class="w-full bg-black/60 p-2 rounded border border-gray-800 text-center">
            <div class="flex justify-between text-[10px] font-bold mb-1">
                <span class="text-cyan-400">A</span><span class="text-gray-400">CROSSFADER</span><span class="text-rose-400">B</span>
            </div>
            <input id="crossfader" type="range" min="-1" max="1" step="0.01" value="0" class="w-full" title="← → en el teclado · doble clic = centro">
        </div>`;
}

/* ==========================================================================
   AUDIO GRAPH <-> CONTROLS
   ========================================================================== */
function ensureAudio() {
    if (!initAudioEngine()) return;
    deckList.forEach(d => d.initAudioNodes(audioCtx, d === decks.a ? Mixer.xfA : Mixer.xfB));
    Mixer.master.gain.value = +$('master-gain').value;
    Mixer.sampler.gain.value = +$('sampler-gain').value;
    applyCrossfader(+$('crossfader').value);
    deckList.forEach(d => {
        const k = d.key;
        d.gainNode.gain.value = +$(`deck-${k}-volume`).value;
        ['low', 'mid', 'high'].forEach(b => applyEq(d, b, +$(`deck-${k}-eq-${b}`).value));
        applyFilter(d, +$(`deck-${k}-filter`).value);
        d.fx.level = +$(`deck-${k}-fx-level`).value;
    });
    const btn = $('audio-init-btn');
    btn.classList.remove('from-cyan-500', 'to-blue-600');
    btn.classList.add('from-emerald-500', 'to-teal-600');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Audio ON';

    loadDemo(128, 0, decks.a, true);
    loadDemo(124, 1, decks.b, true);
}

function applyCrossfader(x) {
    if (!Mixer.xfA) return;
    // Equal-power curve
    Mixer.xfA.gain.setTargetAtTime(Math.cos((x + 1) * 0.25 * Math.PI), audioCtx.currentTime, 0.005);
    Mixer.xfB.gain.setTargetAtTime(Math.sin((x + 1) * 0.25 * Math.PI), audioCtx.currentTime, 0.005);
}

function applyEq(deck, band, val) {
    if (!deck.eqLow) return;
    const node = band === 'low' ? deck.eqLow : band === 'mid' ? deck.eqMid : deck.eqHigh;
    node.gain.setTargetAtTime(val, audioCtx.currentTime, 0.01);
}

function applyFilter(deck, val) {
    if (!deck.filterNode) return;
    const f = deck.filterNode;
    if (val < -2) {
        f.type = 'lowpass';
        f.frequency.value = 20000 * Math.pow(100 / 20000, -val / 100);
        f.Q.value = 1.2;
    } else if (val > 2) {
        f.type = 'highpass';
        f.frequency.value = 20 * Math.pow(8000 / 20, val / 100);
        f.Q.value = 1.2;
    } else {
        f.type = 'allpass';
    }
}

// Programmatic control change (auto mix, keyboard): moves the UI and the audio
function setControl(id, value) {
    const input = $(id);
    input.value = value;
    input.dispatchEvent(new Event('input'));
}

/* ==========================================================================
   KNOBS (drag / wheel / double-click)
   ========================================================================== */
// Touchpads send many small scroll events; mice send big notches. Both are
// turned into a proportional amount (positive = increase). On Macs "natural
// scrolling" flips the direction, which the SCROLL button lets you invert.
const Prefs = {
    naturalScroll: (() => {
        try { const v = localStorage.getItem('webdj-natural-scroll'); if (v !== null) return v === '1'; } catch (e) {}
        return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
    })(),
};

function wheelAmount(e) {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dy = e.deltaY * unit, dx = e.deltaX * unit;
    const y = Prefs.naturalScroll ? dy : -dy;
    const x = Prefs.naturalScroll ? -dx : dx;
    return Math.abs(dy) >= Math.abs(dx) ? y : x;
}

// Adds `px` of wheel movement to a range input (full range = `fullPx` pixels)
function nudgeRange(input, px, fullPx) {
    const min = +input.min, max = +input.max, range = max - min;
    const delta = clamp(px / fullPx * range, -range / 10, range / 10);
    const v = clamp(+input.value + delta, min, max);
    if (v === +input.value) return;
    input.value = v;
    input.dispatchEvent(new Event('input'));
}

function knobText(input) {
    const v = +input.value;
    if (input.id.endsWith('filter')) return v > 2 ? `HPF ${Math.round(v)}` : v < -2 ? `LPF ${Math.round(-v)}` : 'OFF';
    return `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
}

function setupKnob(container) {
    const input = container.querySelector('input');
    const dial = container.querySelector('.knob-dial');
    const min = +input.min, max = +input.max, step = +input.step;
    const def = +input.dataset.default;
    const bubble = document.createElement('span');
    bubble.className = 'knob-value';
    container.appendChild(bubble);
    let hideTimer = null;
    const flash = () => {
        bubble.textContent = knobText(input);
        bubble.classList.add('show');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => bubble.classList.remove('show'), 900);
    };
    const render = () => {
        const v = +input.value;
        const angle = v >= def ? ((v - def) / (max - def)) * 135 : -((def - v) / (def - min)) * 135;
        dial.style.transform = `rotate(${angle}deg)`;
    };
    const setValue = (v) => {
        v = Math.round(clamp(v, min, max) / step) * step;
        if (+input.value === v) return;
        input.value = v;
        input.dispatchEvent(new Event('input'));
    };
    // Drag in any direction: up or right = more
    let drag = null;
    container.addEventListener('pointerdown', (e) => {
        ensureAudio();
        const lit = litTargetFor(container);
        if (lit) { glideControl(lit.id, lit.value, 350); drag = null; setTimeout(flash, 360); return; }
        container.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, v: +input.value };
        flash();
    });
    container.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const moved = (e.clientX - drag.x) - (e.clientY - drag.y);
        setValue(drag.v + moved / (e.shiftKey ? 500 : 130) * (max - min));
        flash();
    });
    const end = () => { drag = null; };
    container.addEventListener('pointerup', end);
    container.addEventListener('pointercancel', end);
    container.addEventListener('dblclick', () => { setValue(def); flash(); });
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        ensureAudio();
        nudgeRange(input, wheelAmount(e), e.shiftKey ? 900 : 260);
        flash();
    }, { passive: false });
    input.addEventListener('input', () => { render(); if (drag || bubble.classList.contains('show')) bubble.textContent = knobText(input); });
    render();
}

function wheelSlider(input, fullPx = 300) {
    input.addEventListener('wheel', (e) => {
        e.preventDefault();
        nudgeRange(input, wheelAmount(e), e.shiftKey ? fullPx * 4 : fullPx);
    }, { passive: false });
}

function refreshScrollLabel() {
    $('scroll-label').textContent = Prefs.naturalScroll ? 'NATURAL' : 'CLÁSICO';
}

/* ==========================================================================
   TOASTS
   ========================================================================== */
function toast(message, type = 'info') {
    const colors = { info: 'border-cyan-500/50 text-cyan-100', warn: 'border-amber-500/60 text-amber-100', ok: 'border-emerald-500/60 text-emerald-100' };
    const el = document.createElement('div');
    el.className = `toast dj-panel rounded-lg px-3 py-2 text-xs border ${colors[type] || colors.info} max-w-sm`;
    el.textContent = message;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), Math.max(3500, message.length * 60));
}

/* ==========================================================================
   LIBRARY
   ========================================================================== */
const library = [];
let libraryId = 0;

async function decodeBytes(bytes) {
    return audioCtx.decodeAudioData(bytes.slice(0));
}

// Decode + analyse audio bytes and add them to the library
async function importTrack({ title, artist, source, bytes }) {
    ensureAudio();
    const buffer = await decodeBytes(bytes);
    const analysis = await Analysis.analyzeTrack(buffer);
    const entry = { id: ++libraryId, title, artist, source, bytes, analysis, duration: buffer.duration, played: false };
    library.push(entry);
    renderLibrary();
    return { entry, buffer };
}

async function loadEntryToDeck(entry, deck, buffer = null, { onlyIfEmpty = false } = {}) {
    ensureAudio();
    if (deck.isPlaying && !onlyIfEmpty && !confirm(`El Deck ${deck.id} está sonando. ¿Cargar igual?`)) return false;
    const token = deck.loadToken = (deck.loadToken || 0) + 1;
    $(`deck-${deck.key}-status`).textContent = 'CARGANDO...';
    try {
        if (!buffer) buffer = entry.demo ? await generateDemoTrack(entry.demo.bpm, entry.demo.variant) : await decodeBytes(entry.bytes);
        if (!entry.analysis) entry.analysis = await Analysis.analyzeTrack(buffer, entry.demo ? entry.demo.bpm : null);
        if (token !== deck.loadToken) return false;          // a newer load replaced this one
        if (onlyIfEmpty && (deck.track || deck.isPlaying)) return false;
        if (autoMix && (autoMix.in === deck || autoMix.out === deck)) cancelAutoMix();
        deck.load(buffer, entry.analysis, entry);
        onDeckLoaded(deck);
        return true;
    } catch (e) {
        console.error(e);
        toast(`No se pudo cargar "${entry.title}"`, 'warn');
        return false;
    } finally {
        if (token === deck.loadToken) $(`deck-${deck.key}-status`).textContent = '';
    }
}

async function loadDemo(bpm, variant, deck, onlyIfEmpty = false) {
    const entry = { id: 0, title: `Demo Beat ${bpm}`, artist: 'Synthesized demo · 48 compases', demo: { bpm, variant } };
    await loadEntryToDeck(entry, deck, null, { onlyIfEmpty });
}

function trackMatch(entry, live) {
    if (!live || !live.analysis || !entry.analysis) return null;
    const target = live.effectiveBpm;
    const ratios = [target / entry.analysis.bpm, target / (entry.analysis.bpm * 2), target / (entry.analysis.bpm / 2)];
    const tempoDiff = Math.min(...ratios.map(r => Math.abs(r - 1)));
    const liveKey = live.analysis.key && Analysis.shiftCamelot(live.analysis.key.camelot, live.pitch);
    const keyScore = Analysis.keyCompatibility(liveKey, entry.analysis.key && entry.analysis.key.camelot);
    let stars = 0;
    if (tempoDiff < 0.08) stars++;
    if (tempoDiff < 0.03) stars++;
    if (keyScore === 2) stars++;
    if (keyScore === 0) stars = Math.max(0, stars - 1);
    return { stars, tempoDiff, keyScore };
}

function renderLibrary() {
    const { live } = liveAndNext();
    $('library-count').textContent = library.length ? `${library.length} temas` : '';
    const body = $('library-body');
    if (!library.length) {
        body.innerHTML = '<tr><td colspan="7" class="py-3 text-center text-gray-500">Vacía. Extrae temas de YouTube o arrastra archivos aquí abajo.</td></tr>';
        return;
    }
    body.innerHTML = '';
    library.forEach((entry, i) => {
        const a = entry.analysis;
        const m = trackMatch(entry, live && live.track !== entry ? live : null);
        const onDeck = deckList.filter(d => d.track === entry).map(d => d.id).join('+');
        const tr = document.createElement('tr');
        tr.className = `lib-row border-t border-gray-800/60 ${entry.played ? 'opacity-50' : ''}`;
        tr.innerHTML = `
            <td class="py-1 text-gray-500">${i + 1}</td>
            <td class="py-1 pr-2"><div class="text-white font-bold truncate max-w-[340px]"></div><div class="text-[10px] text-gray-500 truncate max-w-[340px]"></div></td>
            <td class="font-digits text-[11px]">${a ? a.bpm.toFixed(1) : '--'}</td>
            <td><span class="tag">${a && a.key ? a.key.camelot : '--'}</span></td>
            <td class="font-digits text-[11px]">${formatTime(entry.duration, false)}</td>
            <td class="text-emerald-400">${m ? '<i class="fa-solid fa-star"></i>'.repeat(m.stars) + '<i class="fa-regular fa-star text-gray-700"></i>'.repeat(3 - m.stars) : ''}</td>
            <td class="text-right whitespace-nowrap">
                ${onDeck ? `<span class="text-[10px] text-gray-400 mr-1">EN ${onDeck}</span>` : ''}
                <button data-load="a" class="mini-btn !text-cyan-300">A</button>
                <button data-load="b" class="mini-btn !text-rose-300">B</button>
                <button data-remove class="mini-btn" title="Quitar"><i class="fa-solid fa-xmark"></i></button>
            </td>`;
        tr.children[1].children[0].textContent = entry.title;
        tr.children[1].children[1].textContent = entry.artist + (entry.played ? ' · ya sonó' : '');
        tr.querySelector('[data-load="a"]').onclick = () => loadEntryToDeck(entry, decks.a);
        tr.querySelector('[data-load="b"]').onclick = () => loadEntryToDeck(entry, decks.b);
        tr.querySelector('[data-remove]').onclick = () => { library.splice(library.indexOf(entry), 1); renderLibrary(); };
        body.appendChild(tr);
    });
}

async function handleAudioFiles(files) {
    ensureAudio();
    const list = Array.from(files);
    toast(`Analizando ${list.length} archivo(s)...`);
    deckList.forEach(d => { d.claimed = false; });
    for (const file of list) {
        try {
            const bytes = await file.arrayBuffer();
            const name = file.name.replace(/\.[^.]+$/, '');
            const [artist, title] = name.includes(' - ') ? name.split(' - ', 2) : ['Local file', name];
            const { entry, buffer } = await importTrack({ title, artist, source: 'file', bytes });
            // Fill an empty (or demo) deck that isn't playing
            const free = deckList.find(d => !d.isPlaying && (!d.track || d.track.demo) && !d.claimed);
            if (free) free.claimed = true;
            if (free) await loadEntryToDeck(entry, free, buffer);
        } catch (e) {
            console.error(e);
            toast(`No se pudo leer "${file.name}". ¿Es un archivo de audio válido?`, 'warn');
        }
    }
}

/* ==========================================================================
   DECK UI
   ========================================================================== */
// EQ + filter back to 0 (smoothly)
function resetChannel(deck, ms = 250) {
    const k = deck.key;
    ['low', 'mid', 'high'].forEach(b => glideControl(`deck-${k}-eq-${b}`, 0, ms));
    glideControl(`deck-${k}-filter`, 0, ms);
}

function onDeckLoaded(deck) {
    const k = deck.key;
    if (!deck.isPlaying) {
        // A fresh track starts clean: knobs at 0, no effect running
        resetChannel(deck, 0);
        if (deck.fx && deck.fx.on) deck.fx.setOn(false);
        deck.trick = null;
    }
    const t = deck.track;
    $(`deck-${k}-title`).textContent = t.title;
    $(`deck-${k}-artist`).textContent = t.artist || '';
    setPitchUI(deck);
    const trim = $(`deck-${k}-trim`);
    trim.classList.toggle('hidden', !deck.trimDb);
    trim.textContent = `GAIN ${deck.trimDb > 0 ? '+' : ''}${(deck.trimDb || 0).toFixed(1)}dB`;
    buildOverviewCache(deck);
    refreshDeckButtons(deck);
    renderLibrary();
}

function setPitchUI(deck) {
    const k = deck.key;
    const slider = $(`deck-${k}-pitch`);
    slider.min = 1 - deck.pitchRange;
    slider.max = 1 + deck.pitchRange;
    slider.value = deck.pitch;
    $(`deck-${k}-range`).textContent = `±${Math.round(deck.pitchRange * 100)}%`;
    const percent = ((deck.pitch - 1) * 100).toFixed(1);
    $(`deck-${k}-pitch-val`).textContent = `${percent >= 0 ? '+' : ''}${percent}%`;
}

function refreshDeckButtons(deck) {
    const k = deck.key;
    [1, 2, 3].forEach(n => {
        const btn = $(`deck-${k}-hot${n}`);
        const set = deck.hotCues[n] !== null;
        btn.style.background = set ? HOTCUE_COLORS[n] : '';
        btn.style.color = set ? '#0b0d12' : '';
    });
    [1, 2, 4, 8].forEach(b => $(`deck-${k}-loop-${b}`).classList.toggle('active', deck.loop.active && !deck.slip && deck.loop.beats === b));
    $(`deck-${k}-loop-indicator`).textContent = deck.slip ? 'ROLL' : deck.loop.active ? `${deck.loop.beats} BEATS` : 'OFF';
    $(`deck-${k}-sync-btn`).classList.toggle('active', deck.syncOn);
    $(`deck-${k}-sync-tag`).classList.toggle('hidden', !deck.syncOn);
    refreshFxUI(deck);
}

function refreshFxUI(deck) {
    const k = deck.key;
    const fx = deck.fx;
    const type = fx ? fx.type : 'echo';
    const beats = fx ? fx.beats : 0.5;
    document.querySelectorAll(`#deck-${k}-fx-types [data-fx]`).forEach(b => b.classList.toggle('active', b.dataset.fx === type));
    document.querySelectorAll(`#deck-${k}-fx-beats [data-fxbeats]`).forEach(b => b.classList.toggle('active', +b.dataset.fxbeats === beats));
    $(`deck-${k}-fx-on`).classList.toggle('active', !!(fx && fx.on));
    const level = fx ? Math.round(fx.level * 100) : 60;
    $(`deck-${k}-fx-status`).textContent = `${FX_LABELS[type]} · ${beatLabel(beats)} · ${level}%`;
    const lim = typeof FX_LIMITS !== 'undefined' ? FX_LIMITS[type] : null;
    const hint = typeof FX_HELP !== 'undefined' ? `${FX_HELP[type]}${lim ? ` Límite: ${lim.tip}.` : ''}` : '';
    const hintEl = $(`deck-${k}-fx-hint`);
    if (hintEl.textContent !== hint) { hintEl.textContent = hint; hintEl.title = hint; }
    if (lim) {
        $(`deck-${k}-fx-safe`).style.width = `${lim.max * 100}%`;
        document.querySelectorAll(`#deck-${k}-fx-beats [data-fxbeats]`).forEach(b => b.classList.toggle('fx-rec', lim.beats.includes(+b.dataset.fxbeats)));
        const over = fx && fx.level > lim.max + 0.02;
        $(`deck-${k}-fx-status`).classList.toggle('text-amber-300', !!over);
        $(`deck-${k}-fx-status`).classList.toggle('text-violet-300', !over);
    }
}

function formatTime(seconds, tenths = true) {
    seconds = Math.max(0, seconds || 0);
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const base = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return tenths ? `${base}.${Math.floor((seconds % 1) * 10)}` : base;
}

/* ---------- transport actions ---------- */
function togglePlay(deck) {
    ensureAudio();
    if (!deck.audioBuffer) return;
    deck.cuePreview = false;
    if (deck.isPlaying) {
        if (autoMix && autoMix.out === deck) cancelAutoMix();
        deck.pause();
    } else {
        if (deck.getCurrentTime() >= deck.duration - 0.05) deck.pauseOffset = deck.cue;
        deck.play();
        if (deck.track) deck.track.played = true;
        const master = otherDeck(deck);
        if (deck.syncOn && master.isPlaying) alignPhase(deck, master);
        renderLibrary();
    }
}

function cueDown(deck) {
    ensureAudio();
    if (!deck.audioBuffer) return;
    if (deck.isPlaying && !deck.cuePreview) {
        deck.pause();
        deck.seek(deck.cue);
        return;
    }
    const pos = deck.getCurrentTime();
    if (Math.abs(pos - deck.cue) > 0.03) {
        deck.cue = deck.nearestBeat(pos);
        deck.seek(deck.cue);
    } else {
        deck.play(deck.cue);
        deck.cuePreview = true; // plays while held (Pioneer style)
    }
}

function cueUp(deck) {
    if (!deck.cuePreview) return;
    deck.cuePreview = false;
    deck.pause();
    deck.seek(deck.cue);
}

function hotCue(deck, n, erase = false) {
    ensureAudio();
    if (!deck.audioBuffer) return;
    if (erase) {
        deck.hotCues[n] = null;
    } else if (deck.hotCues[n] === null) {
        deck.hotCues[n] = deck.nearestBeat(deck.getCurrentTime());
    } else {
        deck.seek(deck.hotCues[n]);
    }
    refreshDeckButtons(deck);
}

function tapTempo(deck) {
    if (!deck.analysis) return;
    const now = performance.now();
    deck.taps = (deck.taps || []).filter(t => now - t < 2500);
    deck.taps.push(now);
    if (deck.taps.length < 4) {
        toast(`TAP ${deck.taps.length}/4...`);
        return;
    }
    const taps = deck.taps.slice(-8);
    const interval = (taps[taps.length - 1] - taps[0]) / (taps.length - 1) / 1000;
    const heardBpm = 60 / interval;
    const pos = deck.getCurrentTime();
    setTrackBpm(deck, heardBpm / deck.pitch, pos);
}

function setTrackBpm(deck, bpm, anchor = null) {
    const a = deck.analysis;
    if (!a) return;
    bpm = Math.round(bpm * 10) / 10;
    a.bpm = bpm;
    a.beatSec = 60 / bpm;
    if (anchor !== null) {
        a.firstBeat = ((anchor % a.beatSec) + a.beatSec) % a.beatSec;
        a.downbeat = a.firstBeat;
    }
    deck.bpm = bpm;
    const other = otherDeck(deck);
    if (other.syncOn) matchTempo(other, deck);
    if (deck.syncOn) matchTempo(deck, other);
    toast(`Deck ${deck.id}: BPM ${bpm.toFixed(1)}`);
}

/* ---------- sync ---------- */
// Tempo ratio closest to 1, allowing half/double time. Returns {rate, factor} or null
// Without key lock, speeding a track up raises its pitch: past ~6% voices sound
// like chipmunks, so mixes never push the pitch further than this
const MAX_MIX_PITCH = 0.06;
const MAX_SYNC_PITCH = 0.08;

function tempoRatio(deck, master, limit = MAX_SYNC_PITCH) {
    const target = master.bpm * master.pitch;
    const options = [1, 2, 0.5].map(factor => ({ factor, rate: target / (deck.bpm * factor) }));
    options.sort((x, y) => Math.abs(x.rate - 1) - Math.abs(y.rate - 1));
    return Math.abs(options[0].rate - 1) <= limit ? options[0] : null;
}

// Bring a deck's pitch back to 0% slowly (nobody notices a slow tempo drift)
function startPitchReturn(deck, bars = 32) {
    if (Math.abs(deck.pitch - 1) < 0.003) return;
    deck.syncOn = false;
    deck.pitchReturn = { from: deck.pitch, start: performance.now(), ms: bars * 4 * deck.beatSec * 1000 };
}
function tickPitchReturn(nowMs) {
    deckList.forEach(d => {
        const r = d.pitchReturn;
        if (!r) return;
        const t = clamp((nowMs - r.start) / r.ms, 0, 1);
        d.setPitch(r.from + (1 - r.from) * t);
        setPitchUI(d);
        if (t >= 1) d.pitchReturn = null;
    });
}

function matchTempo(deck, master, quiet = false) {
    if (!deck.analysis || !master.analysis) return false;
    const r = tempoRatio(deck, master);
    if (!r) {
        if (!quiet) toast(`Tempos muy distintos (${deck.bpm.toFixed(0)} vs ${master.effectiveBpm.toFixed(0)} BPM): igualarlos haría que las voces suenen a ardilla. Mezcla con ECHO OUT (el profe lo elige solo).`, 'warn');
        return false;
    }
    if (Math.abs(r.rate - 1) > deck.pitchRange) deck.pitchRange = 0.16;
    deck.pitchReturn = null;
    deck.syncFactor = r.factor;
    deck.setPitch(r.rate);
    setPitchUI(deck);
    return true;
}

// Nudge the deck so its beats land on the master's beats
function alignPhase(deck, master) {
    if (!deck.analysis || !master.analysis || !deck.isPlaying || !master.isPlaying) return;
    const factor = deck.syncFactor || 1;
    const mb = master.beatPosition();
    const db = deck.beatPosition();
    // Compare in units of the slower grid when tempos are half/double
    const masterPhase = factor === 2 ? mb / 2 : factor === 0.5 ? mb * 2 : mb;
    let delta = (masterPhase - db) % 1;
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
    if (Math.abs(delta) < 0.01) return;
    deck.seek(deck.getCurrentTime() + delta * deck.beatSec);
}

function toggleSync(deck) {
    ensureAudio();
    const master = otherDeck(deck);
    if (deck.syncOn) {
        deck.syncOn = false;
    } else if (!deck.analysis || !master.analysis) {
        toast('Carga temas en ambos decks para sincronizar', 'warn');
    } else if (matchTempo(deck, master)) {
        deck.syncOn = true;
        master.syncOn = false;
        alignPhase(deck, master);
    }
    refreshDeckButtons(deck);
    refreshDeckButtons(master);
}

/* ==========================================================================
   WAVEFORMS
   ========================================================================== */
function sizeCanvas(canvas, maxDpr = 2) {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        return true;
    }
    return false;
}

function drawBandColumn(ctx, x, w, h, low, mid, high) {
    const cy = h / 2;
    const draw = (v, scale, color) => {
        if (v <= 0.01) return;
        const half = v * scale * cy;
        ctx.fillStyle = color;
        ctx.fillRect(x, cy - half, w, half * 2);
    };
    draw(low, 0.95, WAVE_COLORS.low);
    draw(mid, 0.7, WAVE_COLORS.mid);
    draw(high, 0.45, WAVE_COLORS.high);
}

function buildOverviewCache(deck) {
    const canvas = $(`deck-${deck.key}-overview`);
    sizeCanvas(canvas);
    const a = deck.analysis;
    if (!a) { deck.overviewCache = null; return; }
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const ctx = off.getContext('2d');
    const [low, mid, high] = a.wave;
    const n = low.length;
    for (let x = 0; x < off.width; x++) {
        const f0 = Math.floor(x * n / off.width);
        const f1 = Math.max(f0 + 1, Math.floor((x + 1) * n / off.width));
        let l = 0, m = 0, hi = 0;
        for (let f = f0; f < f1 && f < n; f++) {
            if (low[f] > l) l = low[f];
            if (mid[f] > m) m = mid[f];
            if (high[f] > hi) hi = high[f];
        }
        drawBandColumn(ctx, x, 1, off.height, l, m, hi);
    }
    deck.overviewCache = off;
}

function marker(ctx, x, h, color, label, top = true) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x) - 1, 0, 2, h);
    if (label) {
        ctx.font = `bold ${Math.round(h * 0.22)}px Rajdhani, sans-serif`;
        const tw = ctx.measureText(label).width + 6;
        const y = top ? 0 : h - Math.round(h * 0.28);
        ctx.fillRect(Math.round(x), y, tw, Math.round(h * 0.28));
        ctx.fillStyle = '#0b0d12';
        ctx.fillText(label, Math.round(x) + 3, y + Math.round(h * 0.22));
    }
}

function drawOverview(deck) {
    const canvas = $(`deck-${deck.key}-overview`);
    if (sizeCanvas(canvas)) buildOverviewCache(deck);
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const a = deck.analysis;
    if (!a || !deck.overviewCache) return;
    const dur = deck.duration;
    const X = (t) => t / dur * w;

    a.breakdowns.forEach(b => {
        ctx.fillStyle = 'rgba(168,85,247,0.16)';
        ctx.fillRect(X(b.start), 0, X(b.end) - X(b.start), h);
    });
    ctx.drawImage(deck.overviewCache, 0, 0);

    // phrase ticks (every 8 bars)
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let t = a.downbeat; t < dur; t += a.beatSec * 32) ctx.fillRect(Math.round(X(t)), h - 4, 1, 4);

    const pos = deck.getCurrentTime();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, X(pos), h);

    if (deck.loop.active) {
        ctx.fillStyle = 'rgba(250,204,21,0.35)';
        ctx.fillRect(X(deck.loop.start), 0, Math.max(2, X(deck.loop.end) - X(deck.loop.start)), h);
    }
    marker(ctx, X(a.mixIn), h, '#10b981', 'IN');
    if (a.introEnd - a.mixIn > a.beatSec * 8) marker(ctx, X(a.introEnd), h, '#8b5cf6', 'DROP', false);
    marker(ctx, X(a.mixOut), h, '#f97316', 'OUT');
    if (resolvedPace(deck) === 'fast') { const f = outPoint(deck); if (Math.abs(f - a.mixOut) > 1) marker(ctx, X(f), h, '#facc15', 'OUT', false); }
    ctx.fillStyle = 'rgba(249,115,22,0.25)';
    ctx.fillRect(X(a.mixOut), h - 3, X(Math.min(dur, a.mixOut + a.mixBars * 4 * a.beatSec)) - X(a.mixOut), 3);
    [1, 2, 3].forEach(n => { if (deck.hotCues[n] !== null) marker(ctx, X(deck.hotCues[n]), h, HOTCUE_COLORS[n], String(n), false); });
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(X(pos)) - 1, 0, 2, h);
}

const ZOOM_SECONDS = 8;
function drawZoom(deck) {
    const canvas = $(`deck-${deck.key}-zoom`);
    sizeCanvas(canvas, 1.5);
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, w, h);
    const a = deck.analysis;
    if (!a) {
        ctx.fillStyle = '#374151';
        ctx.font = `${Math.round(h * 0.25)}px Rajdhani, sans-serif`;
        ctx.fillText('NO TRACK', w / 2 - 30, h / 2 + 5);
        return;
    }
    const pos = deck.getCurrentTime();
    const start = pos - ZOOM_SECONDS / 2;
    const X = (t) => (t - start) / ZOOM_SECONDS * w;
    const [low, mid, high] = a.wave;
    const fps = Analysis.FPS;

    a.breakdowns.forEach(b => {
        if (b.end < start || b.start > start + ZOOM_SECONDS) return;
        ctx.fillStyle = 'rgba(168,85,247,0.12)';
        ctx.fillRect(X(b.start), 0, X(b.end) - X(b.start), h);
    });

    const colW = 2;
    for (let x = 0; x < w; x += colW) {
        const t = start + x / w * ZOOM_SECONDS;
        const f0 = Math.floor(t * fps);
        const f1 = Math.max(f0 + 1, Math.floor((start + (x + colW) / w * ZOOM_SECONDS) * fps));
        if (f1 <= 0 || f0 >= low.length) continue;
        let l = 0, m = 0, hi = 0;
        for (let f = Math.max(0, f0); f < f1 && f < low.length; f++) {
            if (low[f] > l) l = low[f];
            if (mid[f] > m) m = mid[f];
            if (high[f] > hi) hi = high[f];
        }
        drawBandColumn(ctx, x, colW, h, l, m, hi);
    }

    // Beat grid: beats, bars (brighter), phrases (red)
    const d0 = Math.round((a.downbeat - a.firstBeat) / a.beatSec);
    const k0 = Math.ceil((start - a.firstBeat) / a.beatSec);
    for (let k = k0; ; k++) {
        const t = a.firstBeat + k * a.beatSec;
        if (t > start + ZOOM_SECONDS) break;
        const rel = ((k - d0) % 32 + 32) % 32;
        const x = Math.round(X(t));
        if (rel === 0) { ctx.fillStyle = 'rgba(239,68,68,0.95)'; ctx.fillRect(x - 1, 0, 2, h); }
        else if (rel % 4 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x, 0, 1, h); }
        else { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, 0, 1, h * 0.18); ctx.fillRect(x, h * 0.82, 1, h * 0.18); }
    }

    if (deck.loop.active) {
        ctx.fillStyle = 'rgba(250,204,21,0.25)';
        ctx.fillRect(X(deck.loop.start), 0, X(deck.loop.end) - X(deck.loop.start), h);
    }
    const inView = (t) => t >= start && t <= start + ZOOM_SECONDS;
    if (inView(a.mixIn)) marker(ctx, X(a.mixIn), h, '#10b981', 'MIX IN');
    if (inView(a.mixOut)) marker(ctx, X(a.mixOut), h, '#f97316', 'MIX OUT');
    if (resolvedPace(deck) === 'fast') { const f = outPoint(deck); if (inView(f) && Math.abs(f - a.mixOut) > 1) marker(ctx, X(f), h, '#facc15', 'MIX OUT RÁPIDO'); }
    if (inView(a.introEnd) && a.introEnd - a.mixIn > a.beatSec * 8) marker(ctx, X(a.introEnd), h, '#8b5cf6', 'DROP');
    if (inView(deck.cue)) marker(ctx, X(deck.cue), h, '#f59e0b', 'CUE', false);
    [1, 2, 3].forEach(n => { if (deck.hotCues[n] !== null && inView(deck.hotCues[n])) marker(ctx, X(deck.hotCues[n]), h, HOTCUE_COLORS[n], String(n), false); });

    ctx.fillStyle = deck === decks.a ? '#00f0ff' : '#ff0055';
    ctx.fillRect(Math.round(w / 2) - 1, 0, 3, h);
}

function drawVU(deck) {
    const canvas = $(`vu-meter-${deck.key}`);
    sizeCanvas(canvas, 1);
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!deck.analyser) return;
    const data = deck.vuData || (deck.vuData = new Float32Array(deck.analyser.fftSize));
    deck.analyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    const db = 20 * Math.log10(peak || 1e-6);
    const level = clamp((db + 42) / 42, 0, 1);
    deck.vuLevel = Math.max(level, (deck.vuLevel || 0) - 0.03);
    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, '#10b981');
    grad.addColorStop(0.7, '#f59e0b');
    grad.addColorStop(1, '#ef4444');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - deck.vuLevel * h, w, deck.vuLevel * h);
}

/* ==========================================================================
   MIX COACH: transition plans, AUTO MIX (does it for you) and GUIDED mode
   (lights up the controls you have to move)
   ========================================================================== */
let autoMix = null;
let autoDJ = false;
let mixBarsSetting = 'auto';
let mixStyleSetting = 'auto';
const MIX_STYLES = { blend: 'BLEND CON EQ', filter: 'FILTER SWEEP', echo: 'ECHO OUT' };

function liveAndNext() {
    if (autoMix) return { live: autoMix.out, next: autoMix.in };
    const playing = deckList.filter(d => d.isPlaying);
    const xf = +$('crossfader').value;
    let live;
    if (playing.length === 1) live = playing[0];
    else if (playing.length === 2) live = xf <= 0 ? decks.a : decks.b;
    else live = xf > 0.3 ? decks.b : decks.a;
    return { live, next: otherDeck(live) };
}

function barsToSec(deck, bars) { return bars * 4 * deck.beatSec; }

/* ---------- mixing pace: fast (reggaeton, latin, hip-hop) vs long (house, techno) ---------- */
let mixPaceSetting = 'auto';
function resolvedPace(deck) {
    if (mixPaceSetting !== 'auto') return mixPaceSetting;
    return deck.effectiveBpm < 112 ? 'fast' : 'long';
}

// Fast pace: a phrase boundary after ~1 minute where the energy drops (end of a chorus)
function fastOutPoint(a) {
    if (a.fastOut !== undefined) return a.fastOut;
    const bar = 4 * a.beatSec, phrase = 8 * bar;
    const start = Math.max(a.introEnd + 16 * bar, a.mixIn + 55);
    const end = Math.max(start, Math.min(a.mixOut - 8 * bar, a.mixIn + 110));
    let best = a.mixOut, bestScore = -Infinity;
    const avg = (i0, i1) => { let s = 0, n = 0; for (let i = Math.max(0, i0); i < Math.min(a.bars.length, i1); i++) { s += a.bars[i]; n++; } return n ? s / n : 0; };
    for (let t = a.downbeat + Math.ceil((start - a.downbeat) / phrase - 1e-6) * phrase; t <= end + 0.01; t += phrase) {
        const i = Math.round((t - a.downbeat) / bar);
        const score = (avg(i - 4, i) - avg(i, i + 4)) - (t - start) / 400;
        if (score > bestScore) { bestScore = score; best = t; }
    }
    a.fastOut = best;
    return best;
}

// Where the playing deck should be mixed out, given the pace and where it is now
function outPoint(deck) {
    const a = deck.analysis;
    if (resolvedPace(deck) === 'long') return a.mixOut;
    const fast = fastOutPoint(a);
    const pos = deck.getCurrentTime();
    if (pos < fast - 2 * 4 * a.beatSec) return fast;
    // Missed it: next phrase start (at least 2 bars away), never after the normal outro
    const phrase = 32 * a.beatSec;
    const next = a.downbeat + Math.ceil((pos + 8 * a.beatSec - a.downbeat) / phrase) * phrase;
    return Math.min(next, a.mixOut);
}

function keyInfo(live, next, nextRate) {
    const liveKey = live.analysis.key && Analysis.shiftCamelot(live.analysis.key.camelot, live.pitch);
    const nextKey = next.analysis.key && Analysis.shiftCamelot(next.analysis.key.camelot, nextRate);
    return { liveKey, nextKey, compat: Analysis.keyCompatibility(liveKey, nextKey) };
}

function recommendedBars(live, next) {
    if (mixBarsSetting !== 'auto') return +mixBarsSetting;
    let bars = live.analysis.mixBars;
    const introBars = Math.floor((next.analysis.introEnd - next.analysis.mixIn) / (4 * next.beatSec));
    if (introBars >= 8) bars = Math.min(bars, introBars >= 32 ? 32 : introBars >= 16 ? 16 : 8);
    return Math.max(4, bars);
}

// Build a transition plan. Pure: it doesn't touch the decks.
function planTransition(live, next, now = false) {
    const la = live.analysis, na = next.analysis;
    const r = tempoRatio(next, live, MAX_MIX_PITCH);
    const { liveKey, nextKey, compat } = keyInfo(live, next, r ? r.rate : next.pitch);
    const barOut = 4 * live.beatSec;
    const pos = live.getCurrentTime();

    let style = mixStyleSetting;
    let reason;
    if (style === 'auto') {
        if (!r) {
            style = 'echo';
            const diff = Math.abs(live.effectiveBpm / next.bpm - 1) * 100;
            reason = `los tempos (${live.effectiveBpm.toFixed(0)} y ${next.bpm.toFixed(0)} BPM) están a ${diff.toFixed(0)}%: para igualarlos las voces sonarían a ardilla. Se corta con eco y el ${next.id} entra a su velocidad normal`;
        } else if (compat === 0) {
            style = 'filter';
            reason = `las tonalidades ${liveKey} y ${nextKey} chocan: el filtro le quita cuerpo al tema que sale y la mezcla es corta`;
        } else if (la.mixBars <= 4) {
            style = 'echo';
            reason = 'el tema que suena casi no tiene outro para mezclar encima';
        } else {
            style = 'blend';
            reason = compat === 2 ? `tempo cercano y tonalidades armónicas (${liveKey} → ${nextKey}): se pueden fundir largo`
                : 'tempo cercano: se funden con EQ cambiando los bajos a la mitad';
        }
    } else if (!r && style !== 'echo') {
        style = 'echo';
        reason = `elegiste ${MIX_STYLES[mixStyleSetting]}, pero los tempos están muy lejos para sonar encima sin que suene a ardilla: uso ECHO OUT`;
    } else {
        reason = 'estilo elegido por ti';
    }

    const pace = resolvedPace(live);
    let bars = style === 'echo' ? 2 : recommendedBars(live, next);
    if (pace === 'fast' && mixBarsSetting === 'auto') bars = Math.min(bars, 8);
    if (style === 'filter' && mixBarsSetting === 'auto') bars = Math.min(bars, compat === 0 ? 8 : 16);
    let target = outPoint(live);
    if (now || pos > target - 1.5 * live.playbackRate) target = live.nextBarAfter(pos + 1.2 * live.playbackRate);
    while (bars > 2 && target + (bars + 0.5) * barOut > live.duration) bars /= 2;
    bars = Math.max(2, Math.round(bars));

    // Incoming start point: the intro for blends, straight into the drop for an echo out
    const introBars = (na.introEnd - na.mixIn) / (4 * next.beatSec);
    const useDrop = style === 'echo' && introBars >= 4 && na.introEnd < next.duration - 30;
    // Blends: start the incoming track exactly `bars` bars before its drop, so the
    // drop lands right when the mix ends (that's what makes a transition hit)
    const barIn = 4 * next.beatSec;
    let inStart = useDrop ? na.introEnd : na.mixIn;
    let dropAtEnd = false;
    if (!useDrop && introBars >= 2) {
        const ideal = na.introEnd - bars * barIn;
        if (ideal >= na.mixIn - 0.05) {
            inStart = Math.max(0, na.downbeat + Math.round((ideal - na.downbeat) / barIn) * barIn);
            dropAtEnd = true;
        } else {
            // Intro shorter than the mix: the drop comes in partway through
            dropAtEnd = introBars >= bars / 2;
        }
    }

    const A = live.key, B = next.key, LA = live.id, LB = next.id;
    const xOut = live === decks.a ? -1 : 1;
    const xIn = -xOut;
    const steps = [];
    const step = (at, text, actions) => steps.push({ at, text, actions });
    // preset = applied automatically even in guided mode (incoming deck is still silent)
    const set = (id, value, glide = 0, preset = false) => ({ type: 'set', id, value, glide, preset });
    const q = bars / 4;

    if (style === 'blend') {
        step(0, `Entra ${LB} desde ${formatTime(inStart, false)} con LOW −26, MID −10 y HI −8 (te lo dejo listo). Lleva el crossfader al centro`,
            [{ type: 'startIn' }, set(`deck-${B}-eq-low`, -26, 0, true), set(`deck-${B}-eq-mid`, -10, 0, true), set(`deck-${B}-eq-high`, -8, 0, true), set('crossfader', 0, q)]);
        // The mids carry the vocals: two singers at once sounds messy, so swap them
        step(q, `Cambio de voces: MID de ${LA} a −12, MID y HI de ${LB} a 0`,
            [set(`deck-${A}-eq-mid`, -12, 1), set(`deck-${B}-eq-mid`, 0, 1), set(`deck-${B}-eq-high`, 0, 1)]);
        step(bars / 2, `Cambio de bajos: LOW de ${LA} a −26 y LOW de ${LB} a 0`, [set(`deck-${A}-eq-low`, -26, 0.25), set(`deck-${B}-eq-low`, 0, 0.25)]);
        step(3 * q, `Baja el HI de ${LA} a −12`, [set(`deck-${A}-eq-high`, -12, Math.max(1, q - 1))]);
        if (pace === 'fast') step(bars - 1, `ECHO 1/2 en ${LA} para despedirlo`, [{ type: 'fx', deck: A, fx: 'echo', beats: 0.5, level: 0.5 }]);
        else if (bars >= 8) step(bars - 2, `REVERB (2 beats) en ${LA} para que se desvanezca`, [{ type: 'fx', deck: A, fx: 'reverb', beats: 2, level: 0.45 }]);
        step(bars, `Crossfader entero a ${LB}`, [set('crossfader', xIn, 0.5)]);
    } else if (style === 'filter') {
        step(0, `Entra ${LB} desde ${formatTime(inStart, false)} con el LOW en −26 (te lo dejo listo). Crossfader al centro y empieza a subir el FILTER de ${LA} (high-pass) de a poco`,
            [{ type: 'startIn' }, set(`deck-${B}-eq-low`, -26, 0, true), set('crossfader', 0, q), set(`deck-${A}-filter`, 70, bars)]);
        step(bars / 2, `Cambio de bajos: LOW de ${LA} a −26 y LOW de ${LB} a 0`, [set(`deck-${A}-eq-low`, -26, 0.25), set(`deck-${B}-eq-low`, 0, 0.25)]);
        step(bars - 1, `ECHO 1/2 en ${LA} para cerrar`, [{ type: 'fx', deck: A, fx: 'echo', beats: 0.5, level: 0.6 }]);
        step(bars, `Crossfader entero a ${LB} (el eco se va apagando)`, [set('crossfader', xIn, 0.5)]);
    } else {
        step(-1, `Un compás antes: ECHO 1/2 en ${LA}`, [{ type: 'fx', deck: A, fx: 'echo', beats: 0.5, level: 0.7 }]);
        step(0, `Corta ${LA} (el eco queda sonando) y entra ${LB} ${useDrop ? 'directo en su drop' : 'desde su IN'} (${formatTime(inStart, false)}). Crossfader al centro`,
            [{ type: 'stopOut' }, { type: 'startIn' }, set('crossfader', 0, 0, true)]);
        step(1, `Crossfader entero a ${LB}`, [set('crossfader', xIn, 1)]);
    }
    step(bars + 0.5, `Listo: ${LA} se detiene y sus perillas vuelven a 0`, [{ type: 'end' }]);

    return {
        style, styleLabel: MIX_STYLES[style], reason, bars, target, inStart, useDrop, dropAtEnd, pace,
        dropBar: useDrop ? 0 : Math.round((na.introEnd - inStart) / barIn),
        synced: !!r, rate: r ? r.rate : null, factor: r ? r.factor : 1, steps, xIn, xOut,
    };
}

function prepareNext() {
    ensureAudio();
    const { live, next } = liveAndNext();
    if (!next.analysis) { toast(`Carga un tema en el Deck ${next.id}`, 'warn'); return; }
    if (next.isPlaying) { toast(`El Deck ${next.id} ya está sonando`, 'warn'); return; }
    const plan = live.analysis ? planTransition(live, next) : null;
    next.cue = plan ? plan.inStart : next.analysis.mixIn;
    next.seek(next.cue);
    if (plan && plan.synced) matchTempo(next, live, true);
    toast(`Deck ${next.id} listo en su punto de entrada${plan && plan.synced ? ' y con el tempo ajustado' : ''}`, 'ok');
}

function startAutoMix(now = false, mode = 'auto') {
    ensureAudio();
    if (autoMix) { toast('Ya hay una mezcla en curso (Esc cancela)', 'warn'); return false; }
    const { live, next } = liveAndNext();
    if (!live.analysis || !next.analysis) { toast('Necesitas temas cargados en ambos decks', 'warn'); return false; }
    if (!live.isPlaying) { toast(`Dale PLAY al Deck ${live.id} primero`, 'warn'); return false; }

    const plan = planTransition(live, next, now);
    live.pitchReturn = null; // freeze the playing deck's tempo during the mix
    if (plan.synced) {
        next.pitchReturn = null;
        next.syncFactor = plan.factor;
        next.setPitch(plan.rate);
        setPitchUI(next);
    } else if (!next.isPlaying) {
        next.pitchReturn = null;
        next.setPitch(1); // echo out: the new track plays at its own speed
        setPitchUI(next);
    }
    if (!next.isPlaying) {
        next.pause();
        next.seek(plan.inStart);
    }
    plan.steps.forEach(s => { s.fired = false; s.pending = []; });
    autoMix = { out: live, in: next, plan, mode, target: plan.target, bars: plan.bars, phase: 'waiting', progress: 0, started: false, startCtx: 0 };
    // Crossfader on the playing side so the incoming deck starts silent
    glideControl('crossfader', plan.xOut, 400);
    toast(mode === 'guide'
        ? `Mezcla GUIADA: se van a iluminar las perillas que tienes que mover. Empieza a las ${formatTime(plan.target, false)} del ${live.id}`
        : now ? `Mezclando al Deck ${next.id} en el próximo compás` : `Auto mix armado (${plan.styleLabel}): entra el Deck ${next.id} a las ${formatTime(plan.target, false)} del ${live.id}`, 'ok');
    updateAssistant();
    return true;
}

function cancelAutoMix(message = 'Mezcla cancelada') {
    if (!autoMix) return;
    if (typeof Profe !== 'undefined') Profe.onCancel();
    const { out } = autoMix;
    autoMix = null;
    if (out.fx && out.fx.on) out.fx.setOn(false);
    deckList.forEach(d => resetChannel(d, 400));
    setCoachTargets([]);
    toast(message, 'warn');
    updateAssistant();
}

// Smoothly move a control over `ms` milliseconds
const glides = {};
function glideControl(id, to, ms) {
    const from = +$(id).value;
    if (ms <= 0) { delete glides[id]; setControl(id, to); return; }
    glides[id] = { from, to, start: performance.now(), ms };
}
function tickGlides(nowMs) {
    Object.entries(glides).forEach(([id, g]) => {
        const t = clamp((nowMs - g.start) / g.ms, 0, 1);
        setControl(id, g.from + (g.to - g.from) * t);
        if (t >= 1) delete glides[id];
    });
}

function mixBarSeconds(m) { return 4 * m.out.beatSec / m.out.playbackRate; }

// Bars since the transition point (negative while waiting)
function mixBarPosition(m) {
    if (m.started) return (audioCtx.currentTime - m.startCtx) / mixBarSeconds(m);
    return (m.out.getCurrentTime() - m.target) / (4 * m.out.beatSec);
}

function fireStep(m, step) {
    step.fired = true;
    step.pending = [];
    step.actions.forEach(a => {
        if (a.type === 'set') {
            if (m.mode === 'auto' || a.preset) glideControl(a.id, a.value, a.glide * mixBarSeconds(m) * 1000);
            else step.pending.push({ id: a.id, value: a.value });
        } else if (a.type === 'fx') {
            const d = decks[a.deck];
            d.fx.setType(a.fx);
            d.fx.setBeats(a.beats);
            setControl(`deck-${a.deck}-fx-level`, a.level);
            if (m.mode === 'auto') d.fx.setOn(true);
            else step.pending.push({ id: `deck-${a.deck}-fx-on`, fx: d.fx });
            refreshFxUI(d);
        } else if (a.type === 'stopOut') {
            if (m.out.isPlaying) m.out.pause();
        } else if (a.type === 'end') {
            finishAutoMix();
        }
    });
    if (autoMix) refreshCoachTargets();
}

function targetReached(t) {
    if (t.fx) return t.fx.on;
    const el = $(t.id);
    const tol = (+el.max - +el.min) * 0.1;
    return Math.abs(+el.value - t.value) <= tol;
}

function refreshCoachTargets() {
    const m = autoMix;
    if (!m) { setCoachTargets([]); return; }
    const targets = [];
    m.plan.steps.forEach(s => {
        s.pending = (s.pending || []).filter(t => !targetReached(t));
        targets.push(...s.pending);
    });
    setCoachTargets(targets);
}

function formatTarget(t) {
    if (t.label) return t.label;
    if (t.fx) return 'ON';
    if (t.id === 'crossfader') return t.value === 0 ? 'CENTRO' : t.value < 0 ? 'A' : 'B';
    if (t.id.endsWith('filter')) return t.value > 0 ? `HPF ${t.value}` : t.value < 0 ? `LPF ${-t.value}` : '0';
    return `${t.value > 0 ? '+' : ''}${t.value} dB`;
}

let coachEls = [];
let mixTargets = [];
function setCoachTargets(targets) {
    mixTargets = targets;
    applyHighlights();
}
// Lights up what the mix coach (guided mix) and the DJ PROFE want you to touch
function applyHighlights() {
    const all = mixTargets.concat(typeof Profe !== 'undefined' ? Profe.targets() : []);
    coachEls.forEach(el => { el.classList.remove('coach-target'); delete el.dataset.target; delete el.dataset.targetValue; });
    coachEls = all.map(t => {
        const input = $(t.id);
        const el = input.closest('.knob-container') || (input.tagName === 'INPUT' ? input.parentElement : input);
        el.classList.add('coach-target');
        el.dataset.target = formatTarget(t) + (t.value !== undefined ? ' · clic' : '');
        if (t.value !== undefined) el.dataset.targetValue = t.value;
        return el;
    });
    currentTargets = all;
}
let currentTargets = [];

// One click on a lit-up control (or Space for all of them) moves it to its target by itself
function applyTarget(t) {
    if (t.fx) { if (!t.fx.on) { t.fx.setOn(true); refreshFxUI(t.fx.deck); } return; }
    if (t.value !== undefined) glideControl(t.id, t.value, 350);
}
function applyAllTargets() {
    ensureAudio();
    if (!currentTargets.length) { toast('No hay nada que mover ahora mismo', 'info'); return; }
    currentTargets.forEach(applyTarget);
}
function litTargetFor(el) {
    const host = el.closest('.coach-target');
    if (!host || host.dataset.targetValue === undefined) return null;
    const input = host.querySelector('input[type=range]') || el;
    return { id: input.id, value: +host.dataset.targetValue };
}

let lastMixDone = null;
function finishAutoMix(early = false) {
    const m = autoMix;
    if (!m) return;
    const { out, in: inc, plan } = m;
    if (out.isPlaying) out.pause();
    if (out.fx.on) out.fx.setOn(false);
    ['low', 'mid', 'high'].forEach(b => setControl(`deck-${out.key}-eq-${b}`, 0));
    setControl(`deck-${out.key}-filter`, 0);
    setControl(`deck-${inc.key}-eq-low`, 0);
    setControl(`deck-${inc.key}-eq-high`, 0);
    setControl('crossfader', plan.xIn);
    if (out.syncOn) out.syncOn = false;
    inc.syncOn = false;
    startPitchReturn(inc, 32);
    refreshDeckButtons(out);
    refreshDeckButtons(inc);
    autoMix = null;
    lastMixDone = { out, in: inc, at: performance.now(), early };
    setCoachTargets([]);
    toast(`${early ? '¡Te adelantaste y está bien!' : 'Mezcla completa.'} Así queda todo: Deck ${out.id} en pausa con sus perillas en 0, crossfader en ${inc.id}. Ahora suena el ${inc.id}: carga el próximo tema en el ${out.id}.`, 'ok');
    renderLibrary();
    updateAssistant();
}

function tickAutoMix() {
    const m = autoMix;
    if (!m) return;
    const { out, in: inc, plan } = m;
    if (!m.started) {
        if (!out.isPlaying) { cancelAutoMix('Mezcla cancelada: el deck se detuvo'); return; }
        const dt = (m.target - out.getCurrentTime()) / out.playbackRate;
        if (dt <= 0.3) {
            // Start the incoming deck sample-accurately on the outgoing deck's bar
            m.startCtx = audioCtx.currentTime + Math.max(0.01, dt);
            if (!inc.isPlaying) {
                inc.play(plan.inStart, m.startCtx);
                if (inc.track) inc.track.played = true;
            } else if (plan.synced) {
                alignPhase(inc, out);
            }
            m.started = true;
            m.phase = 'mixing';
            renderLibrary();
        }
    }
    // You got there before the plan: crossfader already on the new deck, or the old track ended
    if (m.started) {
        const xfDone = Math.abs(+$('crossfader').value - plan.xIn) < 0.1 && mixBarPosition(m) > 0.5;
        const outEnded = plan.style !== 'echo' && !out.isPlaying;
        if ((m.mode === 'guide' && xfDone) || outEnded) { finishAutoMix(true); return; }
    }
    const barPos = mixBarPosition(m);
    m.progress = clamp(barPos / plan.bars, 0, 1);
    for (const s of plan.steps) {
        if (!autoMix) return;
        if (s.fired || barPos < s.at) continue;
        if (s.at >= 0 && !m.started) continue;
        fireStep(m, s);
    }
    if (autoMix && m.mode === 'guide') refreshCoachTargets();
}

/* ---------- assistant panel ---------- */
function deckCard(deck, role) {
    const c = deck === decks.a ? 'text-cyan-400' : 'text-rose-400';
    if (!deck.analysis) return `<div class="${c} font-bold text-[10px] mb-1">${role} · DECK ${deck.id}</div><div class="text-gray-500">Sin tema cargado</div>`;
    const a = deck.analysis;
    const pos = deck.getCurrentTime();
    const key = a.key ? Analysis.shiftCamelot(a.key.camelot, deck.pitch) : '--';
    let line;
    if (role === 'SONANDO') {
        const out = outPoint(deck);
        const toOut = out - pos;
        line = toOut > 0
            ? `Salida recomendada <b class="text-orange-400">${formatTime(out, false)}</b> · en ${formatTime(toOut / deck.playbackRate, false)} (${Math.ceil(toOut / (4 * deck.beatSec))} comp.)`
            : `<b class="text-orange-400">En la zona de salida</b> · quedan ${formatTime((deck.duration - pos) / deck.playbackRate, false)}`;
    } else {
        const introBars = Math.round((a.introEnd - a.mixIn) / (4 * deck.beatSec));
        line = `Entrada <b class="text-emerald-400">${formatTime(a.mixIn, false)}</b> · intro de ${introBars} comp. · drop <b class="text-violet-300">${formatTime(a.introEnd, false)}</b>`;
    }
    return `
        <div class="flex justify-between items-center mb-1">
            <span class="${c} font-bold text-[10px]">${role} · DECK ${deck.id}${deck.isPlaying ? ' ▶' : ''}</span>
            <span class="font-digits text-[10px] text-gray-300">${deck.effectiveBpm.toFixed(1)} BPM · <span class="tag">${key}</span>${deck.trimDb ? ` <span class="tag" title="Nivelación automática de volumen">${deck.trimDb > 0 ? '+' : ''}${deck.trimDb.toFixed(1)}dB</span>` : ''}</span>
        </div>
        <div class="text-white font-bold truncate">${escapeHtml(deck.track ? deck.track.title : '')}</div>
        <div class="text-gray-400 mt-0.5">${line}</div>`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function stepLabel(at) {
    if (at < 0) return `${at} comp.`;
    return `comp. ${Number.isInteger(at) ? at : at.toFixed(1)}`;
}

function renderPlan(plan, m, live, next) {
    const total = plan.bars + 0.5;
    const minAt = Math.min(0, ...plan.steps.map(s => s.at));
    const span = total - minAt;
    const barPos = m ? mixBarPosition(m) : null;
    let status;
    if (!m) {
        const remain = (plan.target - live.getCurrentTime()) / live.playbackRate;
        status = live.isPlaying ? `empezaría en ${formatTime(Math.max(0, remain), false)}` : 'dale PLAY para empezar';
    } else if (!m.started) {
        status = `empieza en ${formatTime(Math.max(0, (m.target - m.out.getCurrentTime()) / m.out.playbackRate), false)} (${Math.max(0, Math.ceil(-barPos))} comp.)`;
    } else {
        status = `compás ${Math.min(plan.bars, Math.floor(barPos) + 1)} de ${plan.bars}`;
    }
    const pct = plan.rate ? ((plan.rate - 1) * 100).toFixed(1) : null;
    const current = m ? plan.steps.filter(s => s.fired && s.pending && s.pending.length).slice(-1) : [];

    const markers = plan.steps.map(s => {
        const left = ((s.at - minAt) / span) * 100;
        const color = s.fired ? '#34d399' : '#4b5563';
        return `<div class="absolute top-0 w-1 h-3 -ml-0.5 rounded" style="left:${left}%;background:${color}"></div>`;
    }).join('');
    const cursor = barPos !== null ? `<div class="absolute -top-0.5 w-0.5 h-4 bg-white" style="left:${clamp((barPos - minAt) / span, 0, 1) * 100}%"></div>` : '';
    const zero = ((0 - minAt) / span) * 100;

    const rows = plan.steps.map(s => {
        let icon = '<i class="fa-regular fa-circle text-gray-600"></i>';
        let cls = 'text-gray-300';
        if (s.fired && s.pending && s.pending.length) { icon = '<i class="fa-solid fa-hand-point-right text-amber-300"></i>'; cls = 'text-amber-200 font-bold'; }
        else if (s.fired) { icon = '<i class="fa-solid fa-check text-emerald-400"></i>'; cls = 'text-gray-500'; }
        return `<li class="flex gap-2 items-start ${cls}">${icon}<span class="font-digits text-[9px] text-gray-500 w-14 shrink-0 mt-0.5">${stepLabel(s.at)}</span><span>${s.text}</span></li>`;
    }).join('');

    return `
        <div class="flex flex-wrap justify-between items-center gap-2 mb-1">
            <span class="font-bold text-emerald-300 text-xs"><i class="fa-solid fa-route mr-1"></i>PLAN: ${plan.styleLabel} · ${plan.bars} compases · ritmo ${plan.pace === 'fast' ? 'RÁPIDO' : 'LARGO'}${m ? (m.mode === 'guide' ? ' · GUIADO' : ' · AUTO') : ''}</span>
            <span class="font-digits text-[10px] text-gray-300">${status}</span>
        </div>
        <div class="text-[11px] text-gray-400 mb-1">Por qué: ${plan.reason}. ${plan.pace === 'fast'
            ? 'Ritmo rápido (reggaetón/latino): se mezcla temprano, al terminar un coro, para que la pista no se haga larga.'
            : 'Ritmo largo (house/techno): se mezcla en el outro, que está hecho para eso.'}</div>
        <div class="text-[11px] text-gray-200 mb-2">
            <i class="fa-solid fa-play text-emerald-400 mr-1"></i>Empieza cuando el <b>${live.id}</b> llegue a <b class="text-orange-400">${formatTime(plan.target, false)}</b>
            · el <b>${next.id}</b> arranca desde <b class="text-emerald-400">${formatTime(plan.inStart, false)}</b>${plan.useDrop ? ' (directo en su drop)' : plan.dropAtEnd ? ` <span class="text-violet-300">(así su DROP cae justo al terminar la mezcla, en el compás ${plan.dropBar})</span>` : ''}
            ${pct !== null ? `· tempo del ${next.id} ${pct >= 0 ? '+' : ''}${pct}%` : '· sin sync'}
        </div>
        ${current.length ? `<div class="mb-2 p-2 rounded border border-amber-500/50 bg-amber-950/40 text-amber-200 text-xs font-bold animate-pulse"><i class="fa-solid fa-hand-point-right mr-1"></i>AHORA: ${current[0].text} <span class="font-normal text-amber-300/80">(haz clic en lo que brilla en verde y se ajusta solo, o presiona ESPACIO para todo)</span></div>` : ''}
        <div class="relative h-3 bg-gray-900 rounded mb-2 border border-gray-800">
            <div class="absolute top-0 bottom-0 bg-emerald-900/60 rounded" style="left:${zero}%;width:${m ? clamp(barPos / plan.bars, 0, 1) * (100 - zero) : 0}%"></div>
            ${markers}${cursor}
        </div>
        <ul class="space-y-1 text-[11px]">${rows}</ul>`;
}

function updateAssistant() {
    const { live, next } = liveAndNext();
    $('assist-live').innerHTML = deckCard(live, 'SONANDO');
    $('assist-next').innerHTML = deckCard(next, 'SIGUIENTE');
    const tips = [];
    const add = (icon, color, html) => tips.push(`<li class="flex gap-2"><i class="fa-solid ${icon} ${color} mt-0.5"></i><span>${html}</span></li>`);
    let planHtml = '';

    if (!live.analysis) {
        add('fa-circle-info', 'text-gray-400', `Carga un tema en el Deck ${live.id} y dale PLAY para empezar.`);
    } else if (!next.analysis) {
        add('fa-circle-info', 'text-gray-400', `Carga el próximo tema en el Deck ${next.id}. Los de la librería con <i class="fa-solid fa-star text-emerald-400"></i> combinan mejor.`);
    } else {
        const plan = autoMix ? autoMix.plan : planTransition(live, next);
        const { liveKey, nextKey, compat } = keyInfo(live, next, plan.rate || next.pitch);
        if (!plan.synced) add('fa-triangle-exclamation', 'text-amber-400', `Tempos muy distintos (${live.effectiveBpm.toFixed(0)} vs ${next.bpm.toFixed(0)} BPM). Si el BPM detectado está mal, corrígelo con ½ / ×2 / TAP.`);
        if (compat === 2) add('fa-music', 'text-emerald-400', `Tonalidad ${liveKey} → ${nextKey}: <b>armónica</b>.`);
        else if (compat === 1) add('fa-music', 'text-amber-300', `Tonalidad ${liveKey} → ${nextKey}: compatible (cambio de energía).`);
        else if (compat === 0) add('fa-music', 'text-rose-400', `Tonalidad ${liveKey} → ${nextKey}: <b>chocan</b>, mejor una mezcla corta.`);
        planHtml = renderPlan(plan, autoMix, live, next);
    }
    if (autoDJ) add('fa-robot', 'text-emerald-400', `AUTO DJ activo: ${library.filter(e => !e.played).length} tema(s) sin tocar en la librería.`);
    $('assist-advice').innerHTML = tips.join('');
    $('assist-plan').innerHTML = planHtml;
    $('assist-plan').classList.toggle('hidden', !planHtml);
    $('automix-cancel').classList.toggle('hidden', !autoMix);
}

function pickNextTrack(live) {
    const onDecks = deckList.map(d => d.track);
    const candidates = library.filter(e => !e.played && !onDecks.includes(e));
    if (!candidates.length) return null;
    const scored = candidates.map((e, i) => ({ e, score: (trackMatch(e, live)?.stars || 0) * 10 - i * 0.01 }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].e;
}

let autoDJBusy = false;
async function tickAutoDJ() {
    const profeAuto = typeof Profe !== 'undefined' && Profe.mode() === 'auto';
    if (!(autoDJ || profeAuto) || autoMix || autoDJBusy) return;
    const playing = deckList.filter(d => d.isPlaying);
    if (playing.length !== 1) return;
    const live = playing[0];
    const next = otherDeck(live);
    autoDJBusy = true;
    try {
        if (!next.track || next.track.played || next.track.demo) {
            const pick = pickNextTrack(live);
            if (!pick) {
                if (!autoDJ) return; // profe AUTOMÁTICO: just waits for you to load something
                autoDJ = false;
                $('autodj-btn').classList.remove('active');
                toast('AUTO DJ: no quedan temas sin tocar en la librería', 'warn');
                return;
            }
            await loadEntryToDeck(pick, next);
            toast(`AUTO DJ: cargado "${pick.title}" en el Deck ${next.id}`, 'ok');
        }
        // AUTO DJ arms right away; the profe arms it itself closer to the out point
        if (autoDJ && next.track && !next.track.played && !autoMix) startAutoMix(false);
    } finally {
        autoDJBusy = false;
    }
}

/* ==========================================================================
   KEYBOARD
   ========================================================================== */
// [code, deck, action, target element suffix, description, hold?]
const KEYMAP = [
    ['KeyA', 'a', 'cue', 'cue-btn', 'CUE (mantener = preview)', true],
    ['KeyS', 'a', 'play', 'play-btn', 'PLAY / PAUSA'],
    ['KeyD', 'a', 'sync', 'sync-btn', 'SYNC (tempo + fase)'],
    ['KeyF', 'a', 'fxOn', 'fx-on', 'FX ON (tocar = fijo, mantener = momentáneo)', true],
    ['KeyC', 'a', 'fxNext', null, 'Siguiente efecto'],
    ['KeyZ', 'a', 'nudgeDown', null, 'Frenar (mantener) · Shift = pitch -0.1%', true],
    ['KeyX', 'a', 'nudgeUp', null, 'Empujar (mantener) · Shift = pitch +0.1%', true],
    ['KeyV', 'a', 'brake', 'brake-btn', 'BRAKE · Shift = SPINBACK'],
    ['Digit1', 'a', 'hot1', 'hot1', 'Hot cue 1 (Shift = borrar)'],
    ['Digit2', 'a', 'hot2', 'hot2', 'Hot cue 2'],
    ['Digit3', 'a', 'hot3', 'hot3', 'Hot cue 3'],
    ['KeyQ', 'a', 'loop1', 'loop-1', 'Loop 1 beat'],
    ['KeyW', 'a', 'loop2', 'loop-2', 'Loop 2 beats'],
    ['KeyE', 'a', 'loop4', 'loop-4', 'Loop 4 beats'],
    ['KeyR', 'a', 'loop8', 'loop-8', 'Loop 8 beats'],

    ['Semicolon', 'b', 'cue', 'cue-btn', 'CUE (mantener = preview)', true],
    ['KeyL', 'b', 'play', 'play-btn', 'PLAY / PAUSA'],
    ['KeyK', 'b', 'sync', 'sync-btn', 'SYNC (tempo + fase)'],
    ['KeyJ', 'b', 'fxOn', 'fx-on', 'FX ON (tocar = fijo, mantener = momentáneo)', true],
    ['Comma', 'b', 'fxNext', null, 'Siguiente efecto'],
    ['Slash', 'b', 'nudgeDown', null, 'Frenar (mantener) · Shift = pitch -0.1%', true],
    ['Period', 'b', 'nudgeUp', null, 'Empujar (mantener) · Shift = pitch +0.1%', true],
    ['KeyM', 'b', 'brake', 'brake-btn', 'BRAKE · Shift = SPINBACK'],
    ['Digit8', 'b', 'hot1', 'hot1', 'Hot cue 1 (Shift = borrar)'],
    ['Digit9', 'b', 'hot2', 'hot2', 'Hot cue 2'],
    ['Digit0', 'b', 'hot3', 'hot3', 'Hot cue 3'],
    ['KeyU', 'b', 'loop1', 'loop-1', 'Loop 1 beat'],
    ['KeyI', 'b', 'loop2', 'loop-2', 'Loop 2 beats'],
    ['KeyO', 'b', 'loop4', 'loop-4', 'Loop 4 beats'],
    ['KeyP', 'b', 'loop8', 'loop-8', 'Loop 8 beats'],

    ['ArrowLeft', null, 'xfLeft', null, 'Crossfader ← (Shift = todo a A)'],
    ['ArrowRight', null, 'xfRight', null, 'Crossfader → (Shift = todo a B)'],
    ['ArrowDown', null, 'xfCenter', null, 'Crossfader al centro'],
    ['Enter', null, 'automix', 'automix-btn', 'AUTO MIX · Shift = MIX NOW'],
    ['KeyT', null, 'guide', 'guide-btn', 'Mezcla GUIADA (tú mueves lo que se ilumina)'],
    ['Escape', null, 'cancel', null, 'Cancelar auto mix / cerrar ventanas'],
    ['KeyG', null, 'prep', 'prep-btn', 'Preparar el siguiente deck'],
    ['Digit4', null, 'pad0', 'pad-0', 'Sampler: Air horn'],
    ['Digit5', null, 'pad1', 'pad-1', 'Sampler: Siren'],
    ['Digit6', null, 'pad2', 'pad-2', 'Sampler: Riser'],
    ['Digit7', null, 'pad3', 'pad-3', 'Sampler: Laser'],
    ['KeyH', null, 'help', null, 'Mostrar/ocultar esta ayuda'],
    ['KeyN', null, 'profeNext', null, 'DJ PROFE: otro consejo'],
    ['Space', null, 'applyTargets', null, 'Ajustar solo todo lo que está iluminado en verde'],
];
const keyIndex = Object.fromEntries(KEYMAP.map(m => [m[0], m]));
let keyLabels = {};

function defaultKeyLabel(code) {
    const special = { Semicolon: ';', Comma: ',', Period: '.', Slash: '/', ArrowLeft: '←', ArrowRight: '→', ArrowDown: '↓', Enter: '⏎', Escape: 'Esc', Space: 'Espacio' };
    if (special[code]) return special[code];
    return code.replace(/^Key|^Digit/, '');
}
const keyLabel = (code) => (keyLabels[code] || defaultKeyLabel(code)).toUpperCase();

async function loadKeyboardLayout() {
    // Shows the real key caps on non-US keyboards (e.g. Ñ and - on a Spanish Mac)
    try {
        if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
            const map = await navigator.keyboard.getLayoutMap();
            KEYMAP.forEach(([code]) => { const v = map.get(code); if (v) keyLabels[code] = v; });
        }
    } catch (e) { /* not supported */ }
    renderKeyBadges();
    renderHelp();
}

function renderKeyBadges() {
    document.querySelectorAll('.kbd').forEach(el => el.remove());
    KEYMAP.forEach(([code, deck, , target]) => {
        if (!target) return;
        const el = $(deck ? `deck-${deck}-${target}` : target);
        if (!el) return;
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        const badge = document.createElement('span');
        badge.className = 'kbd';
        badge.textContent = keyLabel(code);
        el.appendChild(badge);
    });
}

function renderHelp() {
    const col = (title, color, rows) => `
        <div>
            <div class="font-bold ${color} mb-1 text-[11px] tracking-wider">${title}</div>
            <table class="w-full">${rows.map(([code, , , , desc, hold]) =>
                `<tr><td class="py-0.5 pr-2 w-10"><span class="inline-block min-w-[22px] text-center px-1 rounded border border-gray-600 bg-gray-900 font-mono text-[10px] text-white">${keyLabel(code)}</span></td><td class="text-gray-300">${desc}${hold && !desc.includes('mantener') ? ' <span class="text-gray-500">(mantener)</span>' : ''}</td></tr>`).join('')}</table>
        </div>`;
    $('help-content').innerHTML =
        col('DECK A (izquierda)', 'text-cyan-400', KEYMAP.filter(m => m[1] === 'a')) +
        col('DECK B (derecha)', 'text-rose-400', KEYMAP.filter(m => m[1] === 'b')) +
        col('MIXER / GLOBAL', 'text-emerald-400', KEYMAP.filter(m => !m[1])) +
        `<div class="md:col-span-3 grid md:grid-cols-2 gap-4 border-t border-gray-800 pt-3">
            <div><div class="font-bold text-violet-300 mb-1 text-[11px] tracking-wider">EFECTOS: QUÉ SON Y CUÁNDO USARLOS</div>
                <table class="w-full">${FX_TYPES.map(t => `<tr><td class="py-0.5 pr-2 align-top font-bold text-white w-16">${FX_LABELS[t]}</td><td class="text-gray-300">${FX_HELP[t]}</td></tr>`).join('')}</table></div>
            <div><div class="font-bold text-amber-300 mb-1 text-[11px] tracking-wider">GLOSARIO</div>
                <table class="w-full">${GLOSSARY.map(([w, d]) => `<tr><td class="py-0.5 pr-2 align-top font-bold text-white w-24">${w}</td><td class="text-gray-300">${d}</td></tr>`).join('')}</table></div>
        </div>`;
}

function pressFlash(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 120);
}

const fxHold = {};
function runAction(m, phase, shift) {
    const [, dk, action, target] = m;
    const deck = dk ? decks[dk] : null;
    if (phase === 'down' && target) pressFlash(deck ? `deck-${dk}-${target}` : target);
    if (phase === 'down' && action !== 'help' && action !== 'cancel') ensureAudio();

    switch (action) {
        case 'cue': phase === 'down' ? cueDown(deck) : cueUp(deck); break;
        case 'play': togglePlay(deck); break;
        case 'sync': toggleSync(deck); break;
        case 'fxOn': fxKey(deck, phase); break;
        case 'fxNext': {
            const i = FX_TYPES.indexOf(deck.fx.type);
            deck.fx.setType(FX_TYPES[(i + 1) % FX_TYPES.length]);
            refreshDeckButtons(deck);
            break;
        }
        case 'nudgeDown':
        case 'nudgeUp': {
            const dir = action === 'nudgeUp' ? 1 : -1;
            if (shift && phase === 'down') {
                deck.syncOn = false;
                deck.setPitch(clamp(deck.pitch + dir * 0.001, 1 - deck.pitchRange, 1 + deck.pitchRange));
                setPitchUI(deck);
                refreshDeckButtons(deck);
            } else {
                deck.keyNudge = phase === 'down' ? dir : 0;
            }
            break;
        }
        case 'brake': shift ? deck.spinback() : deck.startBrake(); break;
        case 'hot1': case 'hot2': case 'hot3': hotCue(deck, +action.slice(-1), shift); break;
        case 'loop1': case 'loop2': case 'loop4': case 'loop8':
            deck.loopBeats(+action.slice(4));
            refreshDeckButtons(deck);
            break;
        case 'xfLeft': setControl('crossfader', shift ? -1 : clamp(+$('crossfader').value - 0.1, -1, 1)); break;
        case 'xfRight': setControl('crossfader', shift ? 1 : clamp(+$('crossfader').value + 0.1, -1, 1)); break;
        case 'xfCenter': setControl('crossfader', 0); break;
        case 'automix': startAutoMix(shift); break;
        case 'guide': startAutoMix(shift, 'guide'); break;
        case 'cancel':
            if (!$('help-modal').classList.contains('hidden')) $('help-modal').classList.add('hidden');
            else if (!$('converter-modal').classList.contains('hidden')) $('converter-modal').classList.add('hidden');
            else cancelAutoMix();
            break;
        case 'prep': prepareNext(); break;
        case 'pad0': case 'pad1': case 'pad2': case 'pad3': triggerPad(+action.slice(3)); break;
        case 'help': $('help-modal').classList.toggle('hidden'); break;
        case 'profeNext': $('profe-next').click(); break;
        case 'applyTargets': applyAllTargets(); break;
    }
}

// Tap = toggle, hold > 300 ms = momentary (Pioneer style)
function fxKey(deck, phase) {
    const k = deck.key;
    if (phase === 'down') {
        fxHold[k] = { t: performance.now(), wasOn: deck.fx.on };
        if (!deck.fx.on) deck.fx.setOn(true);
    } else if (fxHold[k]) {
        const held = performance.now() - fxHold[k].t > 300;
        if (held || fxHold[k].wasOn) deck.fx.setOn(false);
        delete fxHold[k];
    }
    refreshFxUI(deck);
}

function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' && t.type === 'text' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (isTyping(e)) { if (e.code === 'Escape') e.target.blur(); return; }
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const m = keyIndex[e.code];
        if (!m) {
            if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) applyAllTargets(); }
            return;
        }
        e.preventDefault();
        if (e.repeat && !['xfLeft', 'xfRight'].includes(m[2])) return;
        runAction(m, 'down', e.shiftKey);
    });
    document.addEventListener('keyup', (e) => {
        if (isTyping(e)) return;
        const m = keyIndex[e.code];
        if (m && m[5]) runAction(m, 'up', e.shiftKey);
    });
    // Release held keys when the window loses focus
    window.addEventListener('blur', () => deckList.forEach(d => { d.keyNudge = 0; cueUp(d); }));
}

/* ==========================================================================
   SAMPLER
   ========================================================================== */
function triggerPad(i) {
    ensureAudio();
    const pad = SAMPLER_PADS[i];
    const { live } = liveAndNext();
    const beatSec = live.analysis ? live.beatSec / live.pitch : 0.47;
    Sampler.play(audioCtx, Mixer.sampler, pad.id, beatSec);
}

/* ==========================================================================
   YOUTUBE CONVERTER
   ========================================================================== */
const server = { online: false, ffmpeg: false };
let convertedTrack = null; // { entry, buffer }

async function checkServer() {
    const status = $('yt-server-status');
    try {
        if (location.protocol === 'file:') throw new Error('file');
        const res = await fetch('/api/status');
        const data = await res.json();
        server.online = !!data.ytdlp;
        server.ffmpeg = !!data.ffmpeg;
        status.title = server.online
            ? 'Conversor listo: pega un link, extrae el audio y cárgalo en un deck'
            : 'El servidor corre pero falta yt-dlp: pip install -r requirements.txt';
        status.className = `w-2.5 h-2.5 rounded-full inline-block shrink-0 ${server.online ? 'bg-emerald-400' : 'bg-amber-400'}`;
    } catch (e) {
        server.online = false;
        status.title = 'Conversor apagado: corre python server.py y abre http://localhost:8000';
        status.className = 'w-2.5 h-2.5 rounded-full inline-block shrink-0 bg-amber-400';
    }
}

function setStep(el, state, text) {
    const styles = {
        waiting: ['text-gray-600', 'fa-regular fa-circle'],
        active: ['text-amber-400 font-bold', 'fa-solid fa-circle-notch animate-spin'],
        done: ['text-emerald-400', 'fa-solid fa-check'],
        error: ['text-red-400 font-bold', 'fa-solid fa-triangle-exclamation'],
    };
    const [cls, icon] = styles[state];
    el.className = `flex items-center gap-3 text-xs ${cls}`;
    el.innerHTML = `<i class="${icon}"></i> <span></span>`;
    el.querySelector('span').innerText = text;
}

async function triggerYouTubeConverter() {
    ensureAudio();
    const url = $('youtube-url-input').value.trim();
    if (!url) { toast('Pega un link de YouTube primero', 'warn'); return; }

    const step1 = $('step-1'), step2 = $('step-2'), step3 = $('step-3');
    const progressBar = $('modal-progress-bar');
    const deckActions = $('modal-deck-actions');
    const errorBox = $('modal-error');
    $('converter-modal').classList.remove('hidden');
    errorBox.classList.add('hidden');
    progressBar.style.width = '5%';
    deckActions.classList.add('opacity-50', 'pointer-events-none');
    $('modal-track-name').innerText = url;
    convertedTrack = null;

    setStep(step1, 'active', 'Fetching video & extracting audio on the server...');
    setStep(step2, 'waiting', 'Transferring audio to the browser...');
    setStep(step3, 'waiting', 'Decoding + analysing BPM, key & mix points...');

    const fail = (step, message) => {
        setStep(step, 'error', 'Failed');
        errorBox.innerText = message;
        errorBox.classList.remove('hidden');
        progressBar.style.width = '0%';
    };

    await checkServer();
    if (!server.online) {
        fail(step1, location.protocol === 'file:'
            ? 'The converter needs the local server. In the project folder run "python server.py" and open http://localhost:8000 (not the HTML file directly).'
            : 'The converter server is not available. Run "pip install -r requirements.txt" and then "python server.py".');
        return;
    }

    let res;
    try {
        res = await fetch(`/api/convert?url=${encodeURIComponent(url)}`);
    } catch (e) {
        fail(step1, 'Could not reach the converter server. Is "python server.py" still running?');
        return;
    }
    if (!res.ok) {
        let message = `Server error (${res.status})`;
        try { message = (await res.json()).error || message; } catch (e) {}
        fail(step1, message);
        return;
    }
    const title = decodeURIComponent(res.headers.get('X-Track-Title') || 'YouTube Track');
    const artist = decodeURIComponent(res.headers.get('X-Track-Artist') || 'YouTube');
    $('modal-track-name').innerText = artist ? `${artist} - ${title}` : title;
    setStep(step1, 'done', 'Audio extracted!');
    progressBar.style.width = '40%';

    setStep(step2, 'active', 'Transferring audio to the browser...');
    let bytes;
    try {
        const total = parseInt(res.headers.get('Content-Length') || '0', 10);
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            if (total) {
                progressBar.style.width = `${40 + (received / total) * 40}%`;
                setStep(step2, 'active', `Transferring audio... ${(received / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`);
            }
        }
        bytes = await new Blob(chunks).arrayBuffer();
    } catch (e) {
        fail(step2, 'The transfer was interrupted. Try again.');
        return;
    }
    setStep(step2, 'done', `Audio received (${(bytes.byteLength / 1048576).toFixed(1)} MB)`);
    progressBar.style.width = '80%';

    setStep(step3, 'active', 'Decoding + analysing BPM, key & mix points...');
    try {
        convertedTrack = await importTrack({ title, artist, source: 'youtube', bytes });
    } catch (e) {
        fail(step3, 'Your browser could not decode this audio format. Try Chrome or Firefox.');
        return;
    }
    const a = convertedTrack.entry.analysis;
    setStep(step3, 'done', `Ready! ${formatTime(convertedTrack.buffer.duration, false)} · ${a.bpm.toFixed(1)} BPM · ${a.key ? `${a.key.name} (${a.key.camelot})` : ''}`);
    progressBar.style.width = '100%';

    $('modal-download').href = `/api/convert?url=${encodeURIComponent(url)}&download=1${server.ffmpeg ? '&format=mp3' : ''}`;
    $('modal-download-label').innerText = server.ffmpeg ? 'Download MP3' : 'Download M4A';
    deckActions.classList.remove('opacity-50', 'pointer-events-none');
    $('youtube-url-input').value = '';
}

async function sendConvertedToDeck(deck) {
    if (!convertedTrack) return;
    const ok = await loadEntryToDeck(convertedTrack.entry, deck, convertedTrack.buffer);
    if (ok) $('converter-modal').classList.add('hidden');
}

/* ==========================================================================
   SETUP
   ========================================================================== */
function setupDeck(deck) {
    const k = deck.key;
    const hold = (id, down, up) => {
        const el = $(id);
        el.addEventListener('pointerdown', (e) => { if (e.button === 0) down(e); });
        if (up) ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, up));
    };

    $(`deck-${k}-play-btn`).addEventListener('click', () => togglePlay(deck));
    hold(`deck-${k}-cue-btn`, () => cueDown(deck), () => cueUp(deck));
    $(`deck-${k}-sync-btn`).addEventListener('click', () => toggleSync(deck));
    $(`deck-${k}-brake-btn`).addEventListener('click', () => { ensureAudio(); deck.startBrake(); });
    $(`deck-${k}-spin-btn`).addEventListener('click', () => { ensureAudio(); deck.spinback(); });
    [1, 2, 3].forEach(n => $(`deck-${k}-hot${n}`).addEventListener('click', (e) => hotCue(deck, n, e.shiftKey)));
    [1, 2, 4, 8].forEach(b => $(`deck-${k}-loop-${b}`).addEventListener('click', () => {
        ensureAudio();
        deck.loopBeats(b);
        refreshDeckButtons(deck);
    }));

    // Pitch
    const pitch = $(`deck-${k}-pitch`);
    pitch.addEventListener('input', () => {
        ensureAudio();
        if (deck.syncOn) { deck.syncOn = false; refreshDeckButtons(deck); }
        deck.pitchReturn = null;
        deck.setPitch(+pitch.value);
        setPitchUI(deck);
        const follower = otherDeck(deck);
        if (follower.syncOn) matchTempo(follower, deck, true);
    });
    pitch.addEventListener('dblclick', () => setControl(`deck-${k}-pitch`, 1));
    wheelSlider(pitch, 1200);
    $(`deck-${k}-range`).addEventListener('click', () => {
        deck.pitchRange = deck.pitchRange === 0.08 ? 0.16 : 0.08;
        deck.setPitch(clamp(deck.pitch, 1 - deck.pitchRange, 1 + deck.pitchRange));
        setPitchUI(deck);
    });

    // BPM tools
    $(`deck-${k}-bpm-half`).addEventListener('click', () => setTrackBpm(deck, deck.bpm / 2));
    $(`deck-${k}-bpm-double`).addEventListener('click', () => setTrackBpm(deck, deck.bpm * 2));
    $(`deck-${k}-tap`).addEventListener('click', () => tapTempo(deck));

    // EQ / filter / volume
    $(`deck-${k}-eq-reset`).addEventListener('click', () => { ensureAudio(); resetChannel(deck); });
    ['low', 'mid', 'high'].forEach(b => $(`deck-${k}-eq-${b}`).addEventListener('input', (e) => applyEq(deck, b, +e.target.value)));
    $(`deck-${k}-filter`).addEventListener('input', (e) => applyFilter(deck, +e.target.value));
    const vol = $(`deck-${k}-volume`);
    vol.addEventListener('input', () => { if (deck.gainNode) deck.gainNode.gain.setTargetAtTime(+vol.value, audioCtx.currentTime, 0.01); });
    wheelSlider(vol, 250);

    // FX
    document.querySelectorAll(`#deck-${k}-fx-types [data-fx]`).forEach(btn => btn.addEventListener('click', () => {
        ensureAudio();
        deck.fx.setType(btn.dataset.fx);
        refreshFxUI(deck);
    }));
    document.querySelectorAll(`#deck-${k}-fx-beats [data-fxbeats]`).forEach(btn => btn.addEventListener('click', () => {
        ensureAudio();
        deck.fx.setBeats(+btn.dataset.fxbeats);
        refreshFxUI(deck);
    }));
    $(`deck-${k}-fx-level`).addEventListener('input', (e) => {
        ensureAudio();
        deck.fx.setLevel(+e.target.value);
        refreshFxUI(deck);
    });
    hold(`deck-${k}-fx-on`, () => { ensureAudio(); fxKey(deck, 'down'); }, () => { if (fxHold[k]) fxKey(deck, 'up'); });

    // Overview click = seek
    $(`deck-${k}-overview`).addEventListener('click', (e) => {
        if (!deck.audioBuffer) return;
        const r = e.currentTarget.getBoundingClientRect();
        deck.seek((e.clientX - r.left) / r.width * deck.duration);
    });

    // Jog wheel: playing = pitch bend, paused = scrub
    const jog = $(`deck-${k}-jog`);
    let lastAngle = null;
    const angleOf = (e) => {
        const r = jog.getBoundingClientRect();
        return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    };
    jog.addEventListener('pointerdown', (e) => {
        ensureAudio();
        jog.setPointerCapture(e.pointerId);
        lastAngle = angleOf(e);
        jog.classList.add('touched');
    });
    jog.addEventListener('pointermove', (e) => {
        if (lastAngle === null || !deck.audioBuffer) return;
        const a = angleOf(e);
        let d = a - lastAngle;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        lastAngle = a;
        deck.jogAngle += d;
        if (deck.isPlaying) {
            deck.jogBend = clamp(1 + d * 0.03, 0.5, 1.5);
            deck.lastJogMove = performance.now();
        } else {
            deck.seek(deck.getCurrentTime() + d / 360 * 1.8);
        }
    });
    const release = () => { lastAngle = null; deck.jogBend = null; jog.classList.remove('touched'); };
    jog.addEventListener('pointerup', release);
    jog.addEventListener('pointercancel', release);
}

function setupGlobal() {
    $('audio-init-btn').addEventListener('click', ensureAudio);
    $('master-gain').addEventListener('input', (e) => { if (Mixer.master) Mixer.master.gain.setTargetAtTime(+e.target.value, audioCtx.currentTime, 0.01); });
    $('sampler-gain').addEventListener('input', (e) => { if (Mixer.sampler) Mixer.sampler.gain.value = +e.target.value; });
    const xf = $('crossfader');
    // Lit-up crossfader: one click sends it to the target instead of jumping to the cursor
    xf.addEventListener('mousedown', (e) => {
        const lit = litTargetFor(xf);
        if (lit) { e.preventDefault(); glideControl('crossfader', lit.value, 350); }
    });
    xf.addEventListener('touchstart', (e) => {
        const lit = litTargetFor(xf);
        if (lit) { e.preventDefault(); glideControl('crossfader', lit.value, 350); }
    }, { passive: false });
    xf.addEventListener('input', () => applyCrossfader(+xf.value));
    xf.addEventListener('dblclick', () => setControl('crossfader', 0));
    wheelSlider(xf, 300);

    document.querySelectorAll('.knob-container').forEach(setupKnob);

    // Converter
    $('convert-yt-btn').addEventListener('click', triggerYouTubeConverter);
    $('youtube-url-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') triggerYouTubeConverter(); });
    $('clear-yt-btn').addEventListener('click', () => { $('youtube-url-input').value = ''; });
    $('modal-send-deck-a').addEventListener('click', () => sendConvertedToDeck(decks.a));
    $('modal-send-deck-b').addEventListener('click', () => sendConvertedToDeck(decks.b));
    $('modal-library-only').addEventListener('click', () => $('converter-modal').classList.add('hidden'));
    $('modal-close').addEventListener('click', () => $('converter-modal').classList.add('hidden'));

    // Demos
    $('demo-select').addEventListener('change', (e) => {
        const v = e.target.value;
        e.target.value = '';
        e.target.blur();
        if (!v) return;
        ensureAudio();
        const [bpm, variant, d] = v.split(',');
        loadDemo(+bpm, +variant, decks[d.toLowerCase()]);
    });

    // Assistant
    $('automix-btn').addEventListener('click', () => startAutoMix(false));
    $('guide-btn').addEventListener('click', () => startAutoMix(false, 'guide'));
    document.querySelectorAll('[data-mixpace]').forEach(btn => btn.addEventListener('click', () => {
        if (autoMix) { toast('Cancela la mezcla en curso para cambiar el ritmo', 'warn'); return; }
        mixPaceSetting = btn.dataset.mixpace;
        document.querySelectorAll('[data-mixpace]').forEach(b => b.classList.toggle('active', b === btn));
        updateAssistant();
    }));
    document.querySelectorAll('[data-mixstyle]').forEach(btn => btn.addEventListener('click', () => {
        if (autoMix) { toast('Cancela la mezcla en curso para cambiar el estilo', 'warn'); return; }
        mixStyleSetting = btn.dataset.mixstyle;
        document.querySelectorAll('[data-mixstyle]').forEach(b => b.classList.toggle('active', b === btn));
        updateAssistant();
    }));
    refreshScrollLabel();
    $('scroll-toggle').addEventListener('click', () => {
        Prefs.naturalScroll = !Prefs.naturalScroll;
        try { localStorage.setItem('webdj-natural-scroll', Prefs.naturalScroll ? '1' : '0'); } catch (e) {}
        refreshScrollLabel();
        toast(Prefs.naturalScroll ? 'Scroll natural: desliza hacia arriba para subir las perillas' : 'Scroll clásico: rueda hacia arriba para subir las perillas', 'ok');
    });
    $('mixnow-btn').addEventListener('click', () => startAutoMix(true));
    $('prep-btn').addEventListener('click', prepareNext);
    $('automix-cancel').addEventListener('click', () => cancelAutoMix());
    $('autodj-btn').addEventListener('click', () => {
        ensureAudio();
        autoDJ = !autoDJ;
        $('autodj-btn').classList.toggle('active', autoDJ);
        if (autoDJ && !library.some(e => !e.played)) toast('AUTO DJ: agrega temas a la librería (YouTube o archivos) y dale PLAY a un deck', 'warn');
        else if (autoDJ) toast('AUTO DJ activado: dale PLAY a un deck y se encarga del resto', 'ok');
        updateAssistant();
    });
    document.querySelectorAll('[data-mixbars]').forEach(btn => btn.addEventListener('click', () => {
        mixBarsSetting = btn.dataset.mixbars;
        document.querySelectorAll('[data-mixbars]').forEach(b => b.classList.toggle('active', b === btn));
        updateAssistant();
    }));

    // Sampler pads
    $('sampler-pads').innerHTML = SAMPLER_PADS.map((p, i) => `
        <button id="pad-${i}" class="pad rounded-lg py-3 font-black text-xs text-amber-200 flex flex-col items-center justify-center gap-1">
            <i class="fa-solid ${p.icon} text-lg"></i>${p.label}
        </button>`).join('');
    SAMPLER_PADS.forEach((p, i) => $(`pad-${i}`).addEventListener('pointerdown', () => triggerPad(i)));

    // Help + key badges
    $('help-btn').addEventListener('click', () => $('help-modal').classList.remove('hidden'));
    $('help-close').addEventListener('click', () => $('help-modal').classList.add('hidden'));
    $('help-modal').addEventListener('click', (e) => { if (e.target.id === 'help-modal') $('help-modal').classList.add('hidden'); });
    $('kbd-toggle').addEventListener('click', () => {
        document.body.classList.toggle('hide-kbd');
        try { localStorage.setItem('webdj-hide-kbd', document.body.classList.contains('hide-kbd') ? '1' : '0'); } catch (e) {}
    });
    try { if (localStorage.getItem('webdj-hide-kbd') === '1') document.body.classList.add('hide-kbd'); } catch (e) {}

    // Buttons shouldn't keep focus (Space/Enter would re-trigger them)
    document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.blur(); });

    // Files
    const dropZone = $('drop-zone');
    const fileInput = $('file-input');
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-cyan-400'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-cyan-400'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-cyan-400');
        if (e.dataTransfer.files.length) handleAudioFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => { handleAudioFiles(e.target.files); fileInput.value = ''; });
    window.addEventListener('resize', () => deckList.forEach(buildOverviewCache));
}

/* ==========================================================================
   FRAME LOOP
   ========================================================================== */
let lastAssist = 0;
let librarySignature = '';
function frame(nowMs) {
    $('master-clock').innerText = new Date().toTimeString().split(' ')[0];
    if (audioCtx) {
        tickGlides(nowMs);
        tickPitchReturn(nowMs);
        deckList.forEach(d => d.tick(nowMs));
        tickAutoMix();
        Profe.tickTricks();
    }
    deckList.forEach(deck => {
        const k = deck.key;
        const pos = deck.getCurrentTime();
        $(`deck-${k}-time-elapsed`).innerText = formatTime(pos);
        $(`deck-${k}-time-remain`).innerText = `-${formatTime(Math.max(0, deck.duration - pos) / (deck.playbackRate || 1))}`;
        $(`deck-${k}-play-btn`).classList.toggle('active', deck.isPlaying);
        $(`deck-${k}-cue-btn`).classList.toggle('active', !deck.isPlaying && deck.audioBuffer && Math.abs(pos - deck.cue) < 0.03);

        const a = deck.analysis;
        if (a) {
            $(`deck-${k}-bpm`).innerText = deck.effectiveBpm.toFixed(1);
            $(`deck-${k}-bpm-orig`).innerText = Math.abs(deck.pitch - 1) > 0.0004 ? `orig ${deck.bpm.toFixed(1)}` : 'BPM';
            const key = a.key ? Analysis.shiftCamelot(a.key.camelot, deck.pitch) : null;
            const keyEl = $(`deck-${k}-key`);
            keyEl.innerText = !key ? 'KEY --' : key === a.key.camelot ? `${key} · ${a.key.name}` : `${key} (orig ${a.key.camelot})`;
            keyEl.title = key && key !== a.key.camelot ? 'El pitch cambió la tonalidad (sin key lock)' : 'Tonalidad (Camelot)';
            const beatIdx = Math.floor((pos - a.downbeat) / a.beatSec + 1e-3);
            const bar = Math.floor(beatIdx / 4) + 1;
            const beat = ((beatIdx % 4) + 4) % 4 + 1;
            $(`deck-${k}-jog-beat`).innerText = pos < a.downbeat ? '-.-' : `${bar}.${beat}`;
            const toOut = Math.ceil((outPoint(deck) - pos) / (4 * a.beatSec));
            const leds = [1, 2, 3, 4].map(i => `<span style="color:${i === beat && deck.isPlaying ? (i === 1 ? '#ef4444' : '#e5e7eb') : '#374151'}">■</span>`).join('');
            $(`deck-${k}-phrase`).innerHTML = `${leds} <span class="ml-1">${toOut > 0 ? `OUT en ${toOut} comp.` : pos < a.mixOut + barsToSec(deck, a.mixBars) ? '<span class="text-orange-400">ZONA DE SALIDA</span>' : ''}</span>`;
        }
        if (deck.isPlaying) deck.jogAngle += 3 * deck.playbackRate;
        $(`deck-${k}-jog-rotor`).style.transform = `rotate(${deck.jogAngle}deg)`;

        drawZoom(deck);
        drawOverview(deck);
        drawVU(deck);
    });
    if (nowMs - lastAssist > 300) {
        lastAssist = nowMs;
        updateAssistant();
        deckList.forEach(refreshDeckButtons);
        const { live } = liveAndNext();
        const sig = `${live.id}:${live.track ? live.track.id : ''}:${live.pitch.toFixed(3)}:${library.length}`;
        if (sig !== librarySignature) { librarySignature = sig; renderLibrary(); }
        if (audioCtx) tickAutoDJ();
        Profe.tick();
    }
    requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', () => {
    $('deck-a').innerHTML = deckTemplate('a');
    $('deck-b').innerHTML = deckTemplate('b');
    $('mixer').innerHTML = mixerTemplate();
    deckList.forEach(setupDeck);
    setupGlobal();
    setupKeyboard();
    loadKeyboardLayout();
    deckList.forEach(refreshDeckButtons);
    renderLibrary();
    checkServer();
    Profe.init();
    requestAnimationFrame(frame);
});
