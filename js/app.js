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
            <div id="deck-${k}-jog" class="jog-wheel w-40 h-40 md:w-48 md:h-48 rounded-full" style="--dc:${k === 'a' ? '#00f0ff' : '#ff0055'}">
                <div id="deck-${k}-jog-ring" class="jog-ring" title="Cuánto va del tema (se pone rojo en los últimos 30 s)"></div>
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
    const fxButtons = FX_TYPES.map(t => `<button id="deck-${k}-fxt-${t}" data-fx="${t}" class="btn-dj btn-fx py-1 rounded font-bold text-[9px] text-gray-300">${FX_LABELS[t]}</button>`).join('');
    const beatButtons = FX_BEATS.map(b => `<button id="deck-${k}-fxb-${String(b).replace('.', '_')}" data-fxbeats="${b}" class="btn-dj btn-fx py-1 rounded font-bold text-[10px] text-gray-300">${beatLabel(b)}</button>`).join('');

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

        <div class="grid grid-cols-3 gap-2 text-xs">
            <div class="bg-black/40 p-2 rounded border border-gray-800">
                <span class="text-[10px] font-bold text-gray-400 block mb-1">HOT CUES <span class="text-gray-600 font-normal">(shift = borra)</span></span>
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
            <div class="bg-black/40 p-2 rounded border border-gray-800">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-[10px] font-bold text-gray-400">STEMS</span>
                    <button id="deck-${k}-stems-btn" class="mini-btn">SEPARAR</button>
                </div>
                <div class="grid grid-cols-4 gap-1">
                    ${STEM_PARTS.map(p => `<button id="deck-${k}-stemb-${p.id}" class="btn-dj btn-stem py-1.5 rounded font-bold text-[10px] text-gray-300" title="${p.label}: prende / apaga ${p.name} de este tema" disabled><i class="fa-solid ${p.icon}"></i> ${p.label}<input id="deck-${k}-stem-${p.id}" type="range" min="0" max="1" step="0.01" value="1" class="hidden"></button>`).join('')}
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
                    <div class="flex items-center justify-between gap-0.5">
                        <span class="text-[9px] text-gray-500">NIVEL</span>
                        ${[0, 1, 2].map(i => `<button id="deck-${k}-fxl-${i}" class="fx-preset" title="Nivel seguro para este efecto">·</button>`).join('')}
                    </div>
                    <input id="deck-${k}-fx-level" type="range" min="0" max="1" step="0.01" value="0.6" class="w-full fx-level" title="Arrastra, usa la rueda o toca un número">
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
                <div class="knob-ring"></div>
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
            <div class="relative">
                <input id="crossfader" type="range" min="-1" max="1" step="0.01" value="0" class="w-full" title="← → en el teclado · doble clic = centro">
                <div id="xf-plan" class="xf-plan hidden" title="Dónde debería estar el crossfader ahora según el plan de la mezcla"></div>
            </div>
        </div>
        <div class="w-full bg-black/40 p-2 rounded border border-gray-800">
            <div class="flex justify-between items-center mb-1.5">
                <span class="text-[10px] font-bold text-gray-300"><i class="fa-solid fa-headphones mr-1 text-emerald-400"></i>AUDÍFONOS</span>
                <button id="cue-setup" class="mini-btn" title="Elige parlantes y audífonos">ELEGIR</button>
            </div>
            <div class="grid grid-cols-2 gap-1.5 mb-1">
                <button id="deck-a-pfl" class="btn-dj btn-pfl py-1.5 rounded font-bold text-[11px] text-cyan-300" title="Escuchar el Deck A solo en tus audífonos"><i class="fa-solid fa-headphones"></i> CUE A</button>
                <button id="deck-b-pfl" class="btn-dj btn-pfl py-1.5 rounded font-bold text-[11px] text-rose-300" title="Escuchar el Deck B solo en tus audífonos"><i class="fa-solid fa-headphones"></i> CUE B</button>
            </div>
            <div class="flex justify-around items-end">
                ${knob('cue-mix', -1, 1, 0.01, -0.4, 'CUE ↔ MASTER')}
                ${knob('cue-vol', 0, 1, 0.01, 0.8, 'VOL 🎧')}
            </div>
            <div id="cue-status" class="text-[9px] text-gray-500 text-center truncate mt-1"></div>
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

    Cue.onAudio();

    loadDemo(128, 0, decks.a, true);
    loadDemo(124, 1, decks.b, true);
}

// Mixing curve: in the middle each channel is at −1.5 dB (the equal-power curve dropped
// them to −3 dB, and with the new track still EQ'd down the blend dipped in volume)
function xfCurve(deck, x = +$('crossfader').value) {
    const t = deck === decks.a ? x : -x; // -1 = fader on this deck's side, 1 = on the other side
    return Math.sqrt(Math.max(0, Math.cos((t + 1) * 0.25 * Math.PI)));
}
function applyCrossfader(x) {
    if (!Mixer.xfA) return;
    Mixer.xfA.gain.setTargetAtTime(xfCurve(decks.a, x), audioCtx.currentTime, 0.005);
    Mixer.xfB.gain.setTargetAtTime(xfCurve(decks.b, x), audioCtx.currentTime, 0.005);
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
        // The coloured arc from the centre (0) to the value, like a pro mixer's LED ring
        container.style.setProperty('--ks', `${Math.min(angle, 0)}deg`);
        container.style.setProperty('--kl', `${Math.abs(angle)}deg`);
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
        if (lit) { applyTarget(lit); drag = null; setTimeout(flash, 360); return; }
        delete glides[input.id]; // grabbing it by hand stops any glide
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
    const box = $('toasts');
    // Never the same message twice, and at most 2 on screen
    if ([...box.children].some(c => c.textContent === message)) return;
    while (box.children.length >= 2) box.firstChild.remove();
    box.appendChild(el);
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

/* ---------- persistence (IndexedDB): the library survives reloads ---------- */
function youtubeKey(url) {
    const m = String(url || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
    return m ? m[1] : String(url || '').trim();
}

async function saveEntry(entry) {
    if (!entry || entry.demo || !entry.id) return;
    const { played, ...record } = entry;
    try {
        await Store.put(record);
    } catch (e) {
        console.warn(e);
        toast('No se pudo guardar en la librería (¿sin espacio en el disco?)', 'warn');
    }
    refreshStorageInfo();
}

async function refreshStorageInfo() {
    const bytes = await Store.usage();
    const n = library.length;
    $('library-count').textContent = n
        ? `${n} tema${n === 1 ? '' : 's'} · guardados en este navegador${bytes ? ` (${(bytes / 1048576).toFixed(0)} MB)` : ''}`
        : '';
    $('library-clear').classList.toggle('hidden', !n);
}

async function loadLibraryFromStore() {
    let records = [];
    try { records = await Store.all(); } catch (e) { console.warn('Library storage unavailable', e); return; }
    records.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    records.forEach(r => {
        // Fix BPMs pushed out of range with ×2 / ½ (e.g. 976 instead of 122)
        const a = r.analysis;
        if (a && (a.bpm > 200 || a.bpm < 60)) {
            while (a.bpm > 200) a.bpm /= 2;
            while (a.bpm < 60) a.bpm *= 2;
            a.beatSec = 60 / a.bpm;
            delete a.fastOut;
            Store.put(r).catch(() => {});
        }
        // Analysis v5 → v6 (outro): recomputed from the saved waveform, no re-decoding
        if (a && a.version === 5 && a.wave) { Analysis.refineOutro(a); Store.put(r).catch(() => {}); }
        library.push({ ...r, played: false });
        libraryId = Math.max(libraryId, r.id);
    });
    renderLibrary();
    refreshStorageInfo();
    if (records.length) toast(`Tu librería: ${records.length} tema${records.length === 1 ? '' : 's'} guardado${records.length === 1 ? '' : 's'}`, 'ok');
    reanalyzeStale();
}

// Tracks analysed by an older version of the analysis get re-analysed quietly
async function reanalyzeStale() {
    for (const e of library) {
        // v6 → v7 only changes the tempo of dembow tracks: redone when loaded into a deck
        // (a full background re-analysis of the whole library would load the CPU mid-set)
        if (e.analysis && e.analysis.version >= 6) continue;
        if (deckList.some(d => d.track === e)) continue;
        try {
            const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(e.bytes.slice(0));
            e.analysis = await Analysis.analyzeTrack(buf, e.bpmFixed && e.analysis ? e.analysis.bpm : null);
            await saveEntry(e);
            renderLibrary();
        } catch (err) { console.warn('Re-analysis failed', err); }
    }
}

// Decode + analyse audio bytes and add them to the library
async function importTrack({ title, artist, source, bytes, url = null }) {
    ensureAudio();
    const buffer = await decodeBytes(bytes);
    const analysis = await Analysis.analyzeTrack(buffer);
    const entry = { id: ++libraryId, title, artist, source, url, bytes, analysis, duration: buffer.duration, cues: null, addedAt: Date.now(), played: false };
    // Added with a folder open: it goes into that folder
    if (libFolder !== 'all') entry.folder = libFolder;
    library.push(entry);
    renderLibrary();
    saveEntry(entry);
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
        else if (entry.analysis.version < Analysis.VERSION && !entry.bpmFixed && !entry.demo) {
            // Older analysis (before the dembow check): redo it now that the audio is decoded
            const before = entry.analysis.bpm;
            entry.analysis = await Analysis.analyzeTrack(buffer);
            if (Math.abs(entry.analysis.bpm - before) > 1) toast(`BPM de "${entry.title}" corregido: ${before.toFixed(0)} → ${entry.analysis.bpm.toFixed(0)}`, 'ok');
            saveEntry(entry);
        }
        if (token !== deck.loadToken) return false;          // a newer load replaced this one
        if (onlyIfEmpty && (deck.track || deck.isPlaying)) return false;
        if (autoMix && (autoMix.in === deck || autoMix.out === deck)) cancelAutoMix();
        deck.load(buffer, entry.analysis, entry);
        if (entry.cues) deck.hotCues = { ...entry.cues }; // your saved hot cues
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

// Played now: remembered (saved), so the library says "sonó hace 12 min" and doesn't suggest it
function markPlayed(track) {
    if (!track) return;
    track.played = true;
    if (track.demo) return;
    if (!track.lastPlayedAt || Date.now() - track.lastPlayedAt > 60000) { track.lastPlayedAt = Date.now(); saveEntry(track); }
}
function agoText(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'recién';
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ayer' : `hace ${d} días`;
}
const playedRecently = (e) => e.played || (e.lastPlayedAt && Date.now() - e.lastPlayedAt < 3 * 3600 * 1000);

// Suggestions for what's playing: tempo + key (stars), same genre, not played lately
function suggestScore(entry, live) {
    if (!live || !live.track || live.track === entry || deckList.some(d => d.track === entry)) return null;
    const m = trackMatch(entry, live);
    if (!m) return null;
    let score = m.stars * 2 - m.tempoDiff * 10;
    const sameGenre = !live.track.demo && trackGenre(entry) === trackGenre(live.track);
    if (sameGenre) score += 2;
    if (playedRecently(entry)) score -= 6;
    const why = [m.tempoDiff < 0.03 ? 'mismo tempo' : m.tempoDiff < 0.06 ? 'tempo cercano' : null,
        m.keyScore === 2 ? 'tonos que combinan' : m.keyScore === 0 ? null : 'tono compatible', sameGenre ? `mismo género (${folderLabel(trackGenre(entry))})` : null].filter(Boolean);
    return { score, stars: m.stars, why, ok: m.stars >= 2 && m.tempoDiff < 0.06 && !playedRecently(entry) };
}
function suggestions(live) {
    return library.map(e => ({ e, s: suggestScore(e, live) })).filter(x => x.s && x.s.ok).sort((x, y) => y.s.score - x.s.score).slice(0, 6);
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

let libFolder = (() => { try { return localStorage.getItem('webdj-lib-folder') || 'all'; } catch (e) { return 'all'; } })();
let libSearch = '';
function libraryFolders() {
    const names = Object.keys(GENRES);
    library.forEach(e => { const f = trackFolder(e); if (!names.includes(f)) names.push(f); });
    return names;
}
function renderFolderTabs() {
    const box = $('lib-folders');
    if (!box) return;
    const counts = {};
    library.forEach(e => { const f = trackFolder(e); counts[f] = (counts[f] || 0) + 1; });
    const { live } = liveAndNext();
    const sug = live && live.track ? suggestions(live).length : 0;
    const setTab = typeof Setlist !== 'undefined' && Setlist.active() ? [['set', `🎚 SET (${Setlist.entries().length})`]] : [];
    const tabs = [['all', `TODOS (${library.length})`]].concat(setTab, sug ? [['sug', `★ SUGERIDOS (${sug})`]] : []).concat(libraryFolders().filter(f => counts[f] || !GENRES[f]).map(f => [f, `${folderLabel(f)} (${counts[f] || 0})`]));
    if (libFolder !== 'all' && libFolder !== 'sug' && !tabs.some(t => t[0] === libFolder)) libFolder = 'all';
    if (libFolder === 'sug' && !sug) libFolder = 'all';
    box.innerHTML = '';
    tabs.forEach(([f, label]) => {
        const b = document.createElement('button');
        b.className = `mini-btn ${f === libFolder ? 'mini-btn-on' : ''}`;
        b.textContent = label;
        b.onclick = () => { libFolder = f; try { localStorage.setItem('webdj-lib-folder', f); } catch (e) {} renderLibrary(); };
        box.appendChild(b);
    });
}

// The tracks the library shows right now (folder / SUGERIDOS / SET + search)
function currentLibraryList(sugList = null) {
    const q = libSearch.trim().toLowerCase();
    let pool = library;
    if (libFolder === 'sug') { const { live } = liveAndNext(); pool = (sugList || (live && live.track ? suggestions(live) : [])).map(x => x.e); }
    else if (libFolder === 'set') pool = typeof Setlist !== 'undefined' ? Setlist.entries() : [];
    return pool.filter(e => (['all', 'sug', 'set'].includes(libFolder) || trackFolder(e) === libFolder)
        && (!q || `${e.title} ${e.artist}`.toLowerCase().includes(q)));
}

function renderLibrary() {
    const { live } = liveAndNext();
    refreshStorageInfo();
    renderFolderTabs();
    const body = $('library-body');
    if (!library.length) {
        body.innerHTML = '<tr><td colspan="8" class="py-3 text-center text-gray-500">Vacía. Extrae temas de YouTube o arrastra archivos aquí abajo.</td></tr>';
        return;
    }
    const sugList = live && live.track ? suggestions(live) : [];
    const sugSet = new Map(sugList.map(x => [x.e, x.s]));
    const shown = currentLibraryList(sugList);
    const inSet = libFolder === 'set';
    const q = libSearch.trim();
    if (typeof Setlist !== 'undefined') Setlist.renderHeader();
    body.innerHTML = shown.length ? '' : `<tr><td colspan="8" class="py-3 text-center text-gray-500">${q ? `Nada con "${libSearch}"` : 'Esta carpeta está vacía: arrastra temas aquí abajo con la carpeta abierta'}.</td></tr>`;
    shown.forEach((entry, i) => {
        const a = entry.analysis;
        const m = trackMatch(entry, live && live.track !== entry ? live : null);
        const onDeck = deckList.filter(d => d.track === entry).map(d => d.id).join('+');
        const tr = document.createElement('tr');
        const sg = sugSet.get(entry);
        tr.className = `lib-row border-t border-gray-800/60 ${sg ? 'lib-reco' : ''} ${playedRecently(entry) && !onDeck ? 'opacity-50' : ''}`;
        if (sg) tr.title = `Recomendado para mezclar con lo que suena: ${sg.why.join(' · ')}`;
        tr.innerHTML = `
            <td class="py-1 text-gray-500">${i + 1}</td>
            <td class="py-1 pr-2"><div class="text-white font-bold truncate max-w-[340px]"></div><div class="text-[10px] text-gray-500 truncate max-w-[340px]"></div></td>
            <td class="font-digits text-[11px]">${a ? a.bpm.toFixed(1) : '--'}</td>
            <td><span class="tag">${a && a.key ? a.key.camelot : '--'}</span></td>
            <td class="font-digits text-[11px]">${formatTime(entry.duration, false)}</td>
            <td><select data-folder class="lib-folder" title="Carpeta (el género se detecta solo por el ritmo; cámbialo si no corresponde)"></select></td>
            <td class="text-emerald-400">${m ? '<i class="fa-solid fa-star"></i>'.repeat(m.stars) + '<i class="fa-regular fa-star text-gray-700"></i>'.repeat(3 - m.stars) : ''}</td>
            <td class="text-right whitespace-nowrap">
                ${onDeck ? `<span class="text-[10px] text-gray-400 mr-1">EN ${onDeck}</span>` : ''}
                <button data-load="a" class="mini-btn !text-cyan-300">A</button>
                <button data-load="b" class="mini-btn !text-rose-300">B</button>
                <button data-remove class="mini-btn" title="Quitar"><i class="fa-solid fa-xmark"></i></button>
            </td>`;
        tr.children[1].children[0].textContent = entry.title;
        tr.children[1].children[1].textContent = entry.artist + (entry.played && !entry.lastPlayedAt ? ' · ya sonó' : entry.lastPlayedAt ? ` · sonó ${agoText(entry.lastPlayedAt)}` : '');
        if (sg) tr.children[1].children[0].insertAdjacentHTML('afterbegin', '<span class="reco-chip">RECOMENDADO</span>');
        if (entry.stemsReady) tr.children[1].children[0].insertAdjacentHTML('beforeend', ' <i class="fa-solid fa-layer-group text-violet-300 text-[10px]" title="Ya separado en STEMS"></i>');
        if (inSet) {
            // Set order: energy bar + why it follows the previous one
            const si = Setlist.entries().indexOf(entry);
            const done = entry.played || (entry.lastPlayedAt && playedRecently(entry));
            tr.children[0].textContent = si + 1;
            tr.children[1].children[1].insertAdjacentHTML('beforeend', ` · <span class="text-emerald-300 font-mono">${Setlist.bar(Setlist.energyAt(si) || 0)}</span> <span class="text-gray-400">${Setlist.why(si)}</span>`);
            if (Setlist.next() === entry) tr.classList.add('lib-reco');
            if (done) tr.classList.add('opacity-50');
        }
        const sel = tr.querySelector('[data-folder]');
        const cur = trackFolder(entry);
        libraryFolders().forEach(f => sel.add(new Option(folderLabel(f) + (!entry.folder && f === cur ? ' (auto)' : ''), f)));
        sel.add(new Option('+ Nueva carpeta…', '__new'));
        sel.value = cur;
        sel.onchange = () => {
            let f = sel.value;
            if (f === '__new') {
                f = (prompt('Nombre de la carpeta (ej: PERREO, AFRO HOUSE, PREVIA):') || '').trim().toLowerCase();
                if (!f) { sel.value = cur; return; }
            }
            entry.folder = f;
            if (entry.analysis) delete entry.analysis.fastOut;
            saveEntry(entry);
            renderLibrary();
            updateAssistant();
        };
        tr.querySelector('[data-load="a"]').onclick = () => loadEntryToDeck(entry, decks.a);
        tr.querySelector('[data-load="b"]').onclick = () => loadEntryToDeck(entry, decks.b);
        tr.querySelector('[data-remove]').onclick = () => {
            if (!confirm(`¿Quitar "${entry.title}" de tu librería?`)) return;
            library.splice(library.indexOf(entry), 1);
            Store.remove(entry.id).catch(() => {});
            renderLibrary();
            refreshStorageInfo();
        };
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
    deck.freshLoad = !deck.isPlaying; // the profe prepares it as the next track
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
    if (typeof Stems !== 'undefined') Stems.onLoad(deck);
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

// Three safe levels for each effect: soft, medium, the most it can take without ruining the track
const fxPresets = (type) => {
    const max = typeof FX_LIMITS !== 'undefined' && FX_LIMITS[type] ? FX_LIMITS[type].max : 0.7;
    return [0.35, 0.65, 1].map(f => Math.round(max * f * 100) / 100);
};

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
        fxPresets(type).forEach((v, i) => {
            const b = $(`deck-${k}-fxl-${i}`);
            b.textContent = Math.round(v * 100);
            b.dataset.level = v;
            b.classList.toggle('active', !!fx && Math.abs(fx.level - v) < 0.015);
        });
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
        // Pausing the old deck once the new one is in = the mix is done, not cancelled
        if (autoMix && autoMix.out === deck) {
            if (autoMix.started) { deck.pause(); finishAutoMix(true); return; }
            cancelAutoMix();
        }
        deck.pause();
    } else {
        if (autoMix && autoMix.mode === 'guide' && autoMix.in === deck && !autoMix.started) { guidedStart(autoMix); return; }
        if (deck.getCurrentTime() >= deck.duration - 0.05) deck.pauseOffset = deck.cue;
        deck.play();
        markPlayed(deck.track);
        const master = otherDeck(deck);
        if (deck.syncOn && master.isPlaying) alignPhase(deck, master);
        renderLibrary();
    }
}

function cueDown(deck) {
    ensureAudio();
    if (!deck.audioBuffer) return;
    const lit = currentTargets.find(t => t.id === `deck-${deck.key}-cue-btn` && t.run);
    if (lit) { lit.run(); return; }
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
        refreshDeckButtons(deck);
        return;
    }
    refreshDeckButtons(deck);
    // Hot cues are saved with the track
    if (deck.track && !deck.track.demo) { deck.track.cues = { ...deck.hotCues }; saveEntry(deck.track); }
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
    if (bpm < 60 || bpm > 200) { toast(`${bpm.toFixed(0)} BPM no tiene sentido para mezclar (entre 60 y 200)`, 'warn'); return; }
    // Keep what the analysis found the first time: the corrections teach us where it fails
    if (deck.track && deck.track.bpmDetected === undefined) deck.track.bpmDetected = a.bpm;
    a.bpm = bpm;
    a.beatSec = 60 / bpm;
    if (anchor !== null) {
        a.firstBeat = ((anchor % a.beatSec) + a.beatSec) % a.beatSec;
        a.downbeat = a.firstBeat;
    }
    deck.bpm = bpm;
    delete a.fastOut;
    if (deck.track && !deck.track.demo) { deck.track.bpmFixed = true; saveEntry(deck.track); }
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

/* ---------- The mix map: where the plan does each thing, drawn on the waveforms ---------- */
// For the outgoing deck: track positions of "B comes in", "bass swap", "all on B", "pause".
// For the incoming deck: the stretch of it that plays during the mix.
function mixMap(deck) {
    const m = autoMix;
    if (!m || !deck.analysis) return null;
    const { plan } = m;
    if (deck === m.out) {
        const bar = 4 * deck.beatSec;
        const now = deck.getCurrentTime();
        const bp = mixBarPosition(m);
        const at = (b) => now + (b - bp) * bar;
        const I = m.in.id, O = m.out.id;
        const marks = [];
        plan.steps.forEach(st => {
            if (st.prep) return;
            st.actions.forEach(a => {
                if (a.type === 'startIn') marks.push({ t: at(st.at), label: `ENTRA ${I}`, color: '#10b981' });
                else if (a.type === 'set' && a.id === 'crossfader' && a.value === plan.xIn) marks.push({ t: at(st.at), label: `TODO AL ${I}`, color: '#22d3ee' });
                else if (a.type === 'set' && (a.id === `deck-${m.out.key}-eq-low` && a.value < -20 || a.id === `deck-${m.out.key}-stem-bass` && a.value < 0.5)) marks.push({ t: at(st.at), label: 'BAJOS', color: '#f59e0b' });
                else if (a.type === 'set' && a.id === `deck-${m.out.key}-stem-vocals` && a.value < 0.5) marks.push({ t: at(st.at), label: 'VOCES', color: '#f472b6' });
                else if (a.type === 'fx') marks.push({ t: at(st.at), label: 'FX', color: '#a78bfa' });
                else if (a.type === 'pauseOut') marks.push({ t: at(st.at), label: `PAUSA ${O}`, color: '#f43f5e' });
                else if (a.type === 'pad' && a.pad === 0) marks.push({ t: at(st.at), label: 'SUBIDA', color: '#fbbf24' });
                else if (a.type === 'loop') marks.push({ t: at(st.at), label: 'LOOP', color: '#facc15' });
            });
        });
        const ends = marks.map(k => k.t);
        return { from: at(0), to: Math.max(...ends), marks };
    }
    if (deck === m.in) {
        const from = plan.inStart;
        return { from, to: from + plan.bars * 4 * deck.beatSec, marks: [{ t: from, label: `ENTRA AQUÍ`, color: '#10b981' }] };
    }
    return null;
}

// Where the crossfader should be right now according to the plan
function planCrossfader(m) {
    const bp = mixBarPosition(m);
    let x = m.plan.xOut;
    m.plan.steps.filter(s => !s.prep).sort((p, q) => p.at - q.at).forEach(s => s.actions.forEach(a => {
        if (a.type !== 'set' || a.id !== 'crossfader') return;
        const g = Math.max(0.01, a.glide || 0.01);
        if (bp >= s.at + g) x = a.value;
        else if (bp > s.at) x = x + (a.value - x) * (bp - s.at) / g;
    }));
    return x;
}
function renderPlanCrossfader() {
    const el = $('xf-plan');
    const show = !!autoMix;
    el.classList.toggle('hidden', !show);
    if (show) el.style.left = `calc(${((planCrossfader(autoMix) + 1) / 2 * 100).toFixed(1)}% - 1px)`;
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
    const ps = a.phraseStart ?? a.downbeat;
    for (let t = ps; t < dur; t += a.beatSec * 32) ctx.fillRect(Math.round(X(t)), h - 4, 1, 4);

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
    const map = mixMap(deck);
    if (map) {
        ctx.fillStyle = 'rgba(16,185,129,0.28)';
        ctx.fillRect(X(map.from), 0, Math.max(2, X(map.to) - X(map.from)), h);
        marker(ctx, X(map.from), h, '#10b981', 'MEZCLA');
    }
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
    const d0 = Math.round(((a.phraseStart ?? a.downbeat) - a.firstBeat) / a.beatSec);
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
    const map = mixMap(deck);
    if (map) {
        ctx.fillStyle = 'rgba(16,185,129,0.14)';
        ctx.fillRect(X(map.from), 0, X(map.to) - X(map.from), h);
        map.marks.forEach(k => { if (inView(k.t)) marker(ctx, X(k.t), h, k.color, k.label, false); });
    }
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
    // LED segments (green → amber → red) and a peak that holds for a moment
    if (level >= (deck.vuPeak || 0)) { deck.vuPeak = level; deck.vuPeakAt = performance.now(); }
    else if (performance.now() - (deck.vuPeakAt || 0) > 900) deck.vuPeak = Math.max(0, deck.vuPeak - 0.015);
    const segs = 16, gap = Math.max(1, Math.round(h / 90)), sh = (h - gap * (segs - 1)) / segs;
    const lit = Math.round(deck.vuLevel * segs), hold = Math.min(segs - 1, Math.round(deck.vuPeak * segs) - 1);
    for (let i = 0; i < segs; i++) {
        const color = i >= segs - 2 ? '239,68,68' : i >= segs - 5 ? '245,158,11' : '16,185,129';
        ctx.fillStyle = `rgba(${color},${i < lit || i === hold ? 1 : 0.13})`;
        ctx.fillRect(0, h - (i + 1) * sh - i * gap, w, sh);
    }
}

/* ==========================================================================
   MIX COACH: transition plans, AUTO MIX (does it for you) and GUIDED mode
   (lights up the controls you have to move)
   ========================================================================== */
let autoMix = null;
let autoDJ = false;
let mixBarsSetting = 'auto';
let mixStyleSetting = 'auto';
const MIX_STYLES = { blend: 'BLEND CON EQ', filter: 'FILTER SWEEP', echo: 'ECHO OUT', stems: 'STEMS POR PARTES', mashup: 'MASHUP (VOZ SOBRE BASE)' };

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
/* ---------- genre (from the groove) and library folders ---------- */
const GENRES = { reggaeton: 'REGGAETÓN', urbano: 'URBANO', electronica: 'ELECTRÓNICA', otros: 'OTROS' };
const folderLabel = (f) => GENRES[f] || String(f).toUpperCase();
// The track's genre: what you set (its folder, if it's a genre) or what the analysis heard
function trackGenre(entry) {
    if (!entry) return 'otros';
    if (entry.folder && GENRES[entry.folder]) return entry.folder;
    const a = entry.analysis;
    if (a && a.wave && (!a.genre || a.genreV !== Analysis.GENRE_VERSION)) { const g = Analysis.detectGenre(a); a.genre = g ? g.genre : 'otros'; a.genreV = Analysis.GENRE_VERSION; }
    return (a && a.genre) || 'otros';
}
const trackFolder = (entry) => (entry && entry.folder) || trackGenre(entry);

// Reggaeton / urban: mix early and short. House / techno: long, in the outro
function resolvedPace(deck) {
    if (mixPaceSetting !== 'auto') return mixPaceSetting;
    const g = deck.track && !deck.track.demo ? trackGenre(deck.track) : null;
    if (g === 'reggaeton' || g === 'urbano') return 'fast';
    if (g === 'electronica') return 'long';
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
    const ps = a.phraseStart ?? a.downbeat;
    for (let t = ps + Math.ceil((start - ps) / phrase - 1e-6) * phrase; t <= end + 0.01; t += phrase) {
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
    const ps = a.phraseStart ?? a.downbeat;
    const next = ps + Math.ceil((pos + 8 * a.beatSec - ps) / phrase) * phrase;
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
// How much bass a track has between t0 and t1, compared with its usual bass (1 = normal)
function bassAt(analysis, t0, t1) {
    const w = analysis && analysis.wave && analysis.wave[0];
    if (!w || !w.length) return 1;
    const f = Analysis.FPS;
    if (!analysis.usualLow) {
        const sample = [];
        for (let i = 0; i < w.length; i += 10) sample.push(w[i]);
        sample.sort((x, y) => x - y);
        analysis.usualLow = sample[Math.floor(sample.length * 0.6)] || 1e-6;
    }
    let sum = 0, n = 0;
    for (let i = Math.max(0, Math.floor(t0 * f)); i < Math.min(w.length, Math.floor(t1 * f)); i++) { sum += w[i]; n++; }
    return n ? sum / n / analysis.usualLow : 1;
}

const barsWord = (n) => (n === 1 ? '1 compás' : `${+n.toFixed(1)} compases`);

function planTransition(live, next, now = false, mode = null) {
    const guided = (mode || (typeof Profe !== 'undefined' ? Profe.mode() : 'guide')) === 'guide';
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
            // History: filter mixes over clashing keys got 👎 (two melodies out of tune on top of
            // each other), but an echo cut felt too fast. So: EQ blend where the melodies never
            // overlap (the new one comes in with only drums/hats, mids swapped in one move)
            style = 'blend';
            reason = `las tonalidades ${liveKey} y ${nextKey} chocan: se mezclan con perillas pero sin que las dos melodías suenen juntas (el ${next.id} entra solo con su ritmo, y los MID se cambian de una vez)`;
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

    // Stems: both tracks split and tempos close → swap them part by part (cleaner than EQ)
    const stemsOk = typeof Stems !== 'undefined' && Stems.ready(live) && Stems.ready(next) && !!r;
    if (mixStyleSetting === 'auto' && stemsOk && style === 'blend') {
        style = 'stems';
        reason = `los dos temas están separados en stems: se cambian por partes (batería, bajo, melodía, voz), más limpio que con EQ${compat === 2 ? ` y las tonalidades combinan (${liveKey} → ${nextKey})` : ''}`;
    }
    if ((style === 'stems' || style === 'mashup') && !stemsOk) {
        style = r ? 'blend' : 'echo';
        reason = `para ${MIX_STYLES[mixStyleSetting]} separa primero los dos temas (botón SEPARAR en cada deck), y los tempos tienen que estar cerca`;
    } else if (style === 'mashup' && !next.vocalPhrase) {
        style = 'stems';
        reason = `el ${next.id} casi no tiene voz para hacer un mashup: se mezcla por stems`;
    }

    const pace = resolvedPace(live);
    let bars = style === 'echo' ? 2 : style === 'mashup' ? (pace === 'fast' ? 8 : 16) : recommendedBars(live, next);
    // Fast pace: 8 bars in AUTO; guided gets 16 so you have time for each move
    if (pace === 'fast' && mixBarsSetting === 'auto') bars = Math.min(Math.max(bars, guided ? 16 : 8), guided ? 16 : 8);
    if (style === 'filter' && mixBarsSetting === 'auto') bars = Math.min(bars, compat === 0 ? 8 : 16);
    let target = outPoint(live);
    if (now || pos > target - 1.5 * live.playbackRate) target = live.nextBarAfter(pos + 1.2 * live.playbackRate);
    while (bars > 2 && target + (bars + 0.5) * barOut > live.duration) bars /= 2;
    bars = Math.max(2, Math.round(bars));

    // Incoming start point: the intro for blends, straight into the drop for an echo out
    const introBars = (na.introEnd - na.mixIn) / (4 * next.beatSec);
    // Echo out into the drop only if the old track is loud where you cut; from a quiet
    // outro the drop was a +10 dB jump (history: every echo out warned "subió mucho")
    const outBar = Math.round((target - la.downbeat) / barOut);
    const outNow = la.bars && la.bars.length ? la.bars.slice(Math.max(0, outBar - 4), Math.max(1, outBar)).reduce((s, v, i, arr) => s + v / arr.length, 0) : 1;
    const useDrop = style === 'echo' && introBars >= 4 && na.introEnd < next.duration - 30 && outNow >= 0.6;
    // Blends: start the incoming track exactly `bars` bars before its drop, so the
    // drop lands right when the mix ends (that's what makes a transition hit)
    const barIn = 4 * next.beatSec;
    let inStart = useDrop ? na.introEnd : na.mixIn;
    let dropAtEnd = false;
    let introLoop = null;
    if (!useDrop && introBars >= 1) {
        const ideal = na.introEnd - bars * barIn;
        if (ideal >= na.mixIn - 0.05) {
            inStart = Math.max(na.mixIn, na.downbeat + Math.round((ideal - na.downbeat) / barIn) * barIn);
            dropAtEnd = true;
        } else {
            // Intro shorter than the mix: loop it (2 or 1 bars) so the drop still lands
            // right at the end — what DJs do with short reggaeton intros. Otherwise the
            // drop comes in partway through
            const ib = Math.round(introBars);
            const extra = bars - ib;
            const L = [2, 1].find(l => l <= ib && extra % l === 0 && extra / l <= 4);
            if (style !== 'echo' && L && Math.abs(introBars - ib) < 0.1) {
                introLoop = { start: na.mixIn, bars: L, beats: 4 * L, releaseAt: extra + 0.25 };
                dropAtEnd = true;
            } else dropAtEnd = introBars >= bars / 2;
        }
    }

    // Mashup: the new track starts where it sings the most (its chorus), only its voice sounding
    if (style === 'mashup') { inStart = next.vocalPhrase; dropAtEnd = false; introLoop = null; }

    const A = live.key, B = next.key, LA = live.id, LB = next.id;
    const xOut = live === decks.a ? -1 : 1;
    const xIn = -xOut;
    const steps = [];
    const step = (at, text, actions, extra = {}) => steps.push({ at, text, actions, ...extra });
    const set = (id, value, glide = 0) => ({ type: 'set', id, value, glide });
    const val = (id) => +$(id).value;
    const q = bars / 4;
    // Bass swap halfway, unless the new track has no bass yet there (an intro with just drums):
    // then the old track keeps the bass until the new one's drop and they swap right on it,
    // so there is never a moment without bass (that's the "hole" that sounds like a volume drop)
    const bassOnDrop = style !== 'echo' && dropAtEnd && bassAt(na, inStart + (bars / 2) * barIn, inStart + (bars - 0.5) * barIn) < 0.45;
    const swapText = `LOW del ${LA} a −26 y LOW del ${LB} a 0 (al mismo tiempo, así el volumen no baja)`;
    // Transition FX from the sampler when the new track's drop lands at the end of the mix
    // (optional: the plan never waits for them)
    const padSteps = () => {
        if (!dropAtEnd || bars < 4) return;
        step(bars - (bars >= 8 ? 4 : 2), `Opcional: pad SUBIDA del sampler, termina solo justo en el drop del ${LB}`, [{ type: 'pad', pad: 0, bar: bars }]);
        step(bars - 0.5, `Opcional: pad IMPACTO, suena justo en el drop del ${LB}`, [{ type: 'pad', pad: 1, bar: bars }]);
    };
    const endFx = style === 'blend' && pace !== 'fast' ? { fx: 'reverb', beats: 2, level: 0.45 } : { fx: 'echo', beats: 0.5, level: style === 'echo' ? 0.6 : 0.5 };

    /* ---------- PREPARATION (right after loading the track, one thing at a time) ---------- */
    let order = 0;
    const prep = (text, actions) => step(-1000 + order++, text, actions, { prep: true });
    if (Math.abs(val('crossfader') - xOut) > 0.15) {
        prep(`Crossfader del lado del ${LA} (el que está sonando), así el ${LB} todavía no se escucha`, [set('crossfader', xOut, 0.1)]);
    }
    if (!next.isPlaying) {
        prep(`Pon el ${LB} en su punto de entrada: ${formatTime(inStart, false)}${useDrop ? ' (su drop)' : ''}. Clic en su CUE iluminado`, [{ type: 'cue' }]);
    }
    // With headphones: listen to the new track before the crowd hears it
    if (typeof Cue !== 'undefined' && Cue.ready() && !Cue.pfl(next)) {
        prep(`Escucha el ${LB} en tus audífonos: prende su CUE 🎧 (solo lo oyes tú). Mantén su botón CUE para oírlo desde donde va a entrar`, [{ type: 'pfl' }]);
    }
    if (introLoop && !next.isPlaying) {
        prep(`La intro del ${LB} es corta (${Math.round(introBars)} comp.): ponle un LOOP ${introLoop.beats} (repite ${introLoop.bars === 1 ? 'su primer compás' : 'sus 2 primeros compases'}). Así su drop cae justo al final de la mezcla`, [{ type: 'inLoop' }]);
    }
    const wantRate = r ? r.rate : 1;
    if (!next.isPlaying && Math.abs(next.pitch - wantRate) > 0.0015) {
        const pct = ((wantRate - 1) * 100).toFixed(1);
        prep(r ? `Iguala el tempo del ${LB} al del ${LA}: pitch del ${LB} a ${pct >= 0 ? '+' : ''}${pct}%`
            : `Pitch del ${LB} a 0% (los tempos están muy lejos para igualarlos sin que suene a ardilla)`,
            [set(`deck-${B}-pitch`, wantRate)]);
    }
    // Same channel volume for both, so the new track doesn't come in louder or quieter
    const volOut = val(`deck-${A}-volume`);
    if (Math.abs(val(`deck-${B}-volume`) - volOut) > 0.05) {
        prep(`Volumen del canal ${LB} igual al del ${LA} (${Math.round(volOut * 100)}%): así la mezcla no sube ni baja de volumen`, [set(`deck-${B}-volume`, volOut)]);
    }
    // Which parts of each track sound when the new one comes in
    if (style === 'stems' || style === 'mashup') {
        const want = style === 'stems' ? { vocals: 0, drums: 1, bass: 0, other: 0 } : { vocals: 1, drums: 0, bass: 0, other: 0 };
        const acts = STEM_PARTS.filter(p => Math.abs(val(Stems.id(next, p.id)) - want[p.id]) > 0.1).map(p => set(Stems.id(next, p.id), want[p.id]));
        STEM_PARTS.filter(p => val(Stems.id(live, p.id)) < 0.5).forEach(p => acts.push(set(Stems.id(live, p.id), 1)));
        if (acts.length) prep(style === 'stems'
            ? `Stems del ${LB}: deja solo su BATERÍA prendida (VOZ, BAJO y MEL apagados). Va a entrar por partes`
            : `Stems del ${LB}: deja solo su VOZ prendida. Va a cantar encima de la base del ${LA}`, acts);
    }
    const clashBlend = style === 'blend' && compat === 0;
    const inEq = style === 'stems' || style === 'mashup' ? { low: 0, mid: 0, high: 0 } : clashBlend ? { low: -26, mid: -26, high: -12 } : style === 'blend' ? { low: -26, mid: -10, high: -8 } : style === 'filter' ? { low: -26, mid: -8, high: -4 } : { low: 0, mid: 0, high: 0 };
    const eqActs = ['low', 'mid', 'high'].filter(b => Math.abs(val(`deck-${B}-eq-${b}`) - inEq[b]) > 1).map(b => set(`deck-${B}-eq-${b}`, inEq[b]));
    if (Math.abs(val(`deck-${B}-filter`)) > 3) eqActs.push(set(`deck-${B}-filter`, 0));
    if (eqActs.length) {
        prep(style === 'echo' ? `Perillas del ${LB} en 0: entra con todo, en su drop`
            : clashBlend ? `Deja las perillas del ${LB} listas: LOW −26, MID −26, HI −12. Entra solo su ritmo: los tonos chocan y su melodía espera`
            : `Deja las perillas del ${LB} listas: LOW −26, MID ${inEq.mid}, HI ${inEq.high}. Así entra suave, sin bajo y sin subir el volumen`, eqActs);
    }
    const outEqActs = ['low', 'mid', 'high'].filter(b => Math.abs(val(`deck-${A}-eq-${b}`)) > 1).map(b => set(`deck-${A}-eq-${b}`, 0));
    if (Math.abs(val(`deck-${A}-filter`)) > 3) outEqActs.push(set(`deck-${A}-filter`, 0));
    if (outEqActs.length) prep(`Perillas del ${LA} en 0 antes de empezar la mezcla`, outEqActs);
    if (style !== 'stems' && style !== 'mashup' && (live.fx.type !== endFx.fx || live.fx.beats !== endFx.beats)) {
        prep(`Elige el efecto del final: ${FX_LABELS[endFx.fx]} ${beatLabel(endFx.beats)} en el ${LA} (todavía NO lo prendas)`, [{ type: 'fxPrep', deck: A, ...endFx }]);
    }

    /* ---------- TRANSITION (bars counted from the moment the new track comes in) ---------- */
    const playText = next.isPlaying ? `El ${LB} ya está sonando: sigue desde el próximo compás`
        : `Dale PLAY al ${LB} (entra justo en el compás aunque lo aprietes un poco antes o después)`;
    const SI = (d, p) => (typeof Stems !== 'undefined' ? Stems.id(d, p) : '');
    if (style === 'stems') {
        // Part by part: drums, then melody, then the bass swap, then the voices
        step(0, `${playText}: entra solo su BATERÍA. Lleva el crossfader al centro (se mueve solo en ${barsWord(q)})`, [{ type: 'startIn' }, set('crossfader', 0, q)]);
        step(q, `Entra la MELODÍA del ${LB}`, [set(SI(next, 'other'), 1, 1)]);
        step(bars / 2, `Cambio de bajos con stems: BAJO del ${LA} OFF y BAJO del ${LB} ON, al mismo tiempo (un clic hace los dos)`, [set(SI(live, 'bass'), 0, 0.25), set(SI(next, 'bass'), 1, 0.25)]);
        step(3 * q, `Cambio de voces: VOZ y MELODÍA del ${LA} OFF, VOZ del ${LB} ON`, [set(SI(live, 'vocals'), 0, 1), set(SI(live, 'other'), 0, 1), set(SI(next, 'vocals'), 1, 1)]);
        step(bars, `Crossfader entero al ${LB} (la batería del ${LA} se va con él)`, [set('crossfader', xIn, 1)]);
        padSteps();
    } else if (style === 'mashup') {
        // The new track's voice over the old one's beat, then the whole new track drops in
        const clash = compat === 0;
        step(0, `${playText}: suena solo su VOZ. Apaga la VOZ del ${LA}${clash ? ' y su MELODÍA (los tonos chocan)' : ''} y lleva el crossfader al centro`,
            [{ type: 'startIn' }, set(SI(live, 'vocals'), 0, 0.5), ...(clash ? [set(SI(live, 'other'), 0, 0.5)] : []), set('crossfader', 0, 1)]);
        step(bars, `¡Entra el ${LB} completo! BATERÍA, BAJO y MELODÍA del ${LB} ON y crossfader entero al ${LB}`,
            [set(SI(next, 'drums'), 1, 0.25), set(SI(next, 'bass'), 1, 0.25), set(SI(next, 'other'), 1, 0.25), set('crossfader', xIn, 1)]);
        step(bars - 0.5, `Opcional: pad IMPACTO justo cuando entra el ${LB} completo`, [{ type: 'pad', pad: 1, bar: bars }]);
    } else if (clashBlend) {
        // Keys clash: never both melodies at once. Rhythm first, then bass, then ONE mid swap
        step(0, `${playText} (entra solo su ritmo) y lleva el crossfader al centro (se mueve solo en ${barsWord(q)})`, [{ type: 'startIn' }, set('crossfader', 0, q)]);
        step(q, `Sube el HI del ${LB} a 0 (sus platillos): todavía sin su melodía`, [set(`deck-${B}-eq-high`, 0, 1)]);
        if (!bassOnDrop) step(bars / 2, `Cambio de bajos: ${swapText}`, [set(`deck-${A}-eq-low`, -26, 0.5), set(`deck-${B}-eq-low`, 0, 0.5)]);
        step(3 * q, `Cambio de melodía de una sola vez: MID del ${LA} a −26 y MID del ${LB} a 0 (un clic hace los dos: nunca suenan juntas)`,
            [set(`deck-${A}-eq-mid`, -26, 0.5), set(`deck-${B}-eq-mid`, 0, 0.5), set(`deck-${A}-eq-high`, -12, 1)]);
        step(bars - 1, `Prende el ${FX_LABELS[endFx.fx]} del ${LA} (FX ON) para despedirlo`, [{ type: 'fx', deck: A, ...endFx }]);
        if (bassOnDrop) step(bars, `¡Drop del ${LB}! Cambio de bajos (${swapText}) y crossfader entero al ${LB}`,
            [set(`deck-${A}-eq-low`, -26, 0.25), set(`deck-${B}-eq-low`, 0, 0.25), set('crossfader', xIn, 1)]);
        else step(bars, `Crossfader entero al ${LB} (en 1 compás)`, [set('crossfader', xIn, 1)]);
        padSteps();
    } else if (style === 'blend') {
        // Glides are in bars: a click starts the move and the knob turns by itself at DJ speed
        step(0, `${playText} y lleva el crossfader al centro (se mueve solo en ${barsWord(q)})`, [{ type: 'startIn' }, set('crossfader', 0, q)]);
        // The mids carry the vocals: two singers at once sounds messy, so swap them
        step(q, `Cambio de voces: MID del ${LA} a −12, MID y HI del ${LB} a 0 (en 1 compás)`,
            [set(`deck-${A}-eq-mid`, -12, 1), set(`deck-${B}-eq-mid`, 0, 1), set(`deck-${B}-eq-high`, 0, 1)]);
        // Bass swap on the 1: one comes out while the other goes in, the level stays even
        if (!bassOnDrop) step(bars / 2, `Cambio de bajos: ${swapText}`, [set(`deck-${A}-eq-low`, -26, 0.5), set(`deck-${B}-eq-low`, 0, 0.5)]);
        step(3 * q, `Baja el HI del ${LA} a −12 (de a poco)`, [set(`deck-${A}-eq-high`, -12, Math.max(1, q - 1))]);
        step(bars - (endFx.fx === 'reverb' ? 2 : 1), `Prende el ${FX_LABELS[endFx.fx]} del ${LA} (FX ON) para despedirlo`, [{ type: 'fx', deck: A, ...endFx }]);
        if (bassOnDrop) step(bars, `¡Llega el drop del ${LB}! Cambio de bajos justo en el 1 (${swapText}) y crossfader entero al ${LB}. Un clic hace todo`,
            [set(`deck-${A}-eq-low`, -26, 0.25), set(`deck-${B}-eq-low`, 0, 0.25), set('crossfader', xIn, 1)]);
        else step(bars, `Crossfader entero al ${LB} (en 1 compás)`, [set('crossfader', xIn, 1)]);
        padSteps();
    } else if (style === 'filter') {
        // The filter only starts after the bass swap: before that the old track carries the
        // bass, so the mix never runs out of low end (that's what sounds like a volume drop)
        step(0, `${playText} y lleva el crossfader al centro (se mueve solo en ${barsWord(q)})`,
            [{ type: 'startIn' }, set('crossfader', 0, q)]);
        if (!bassOnDrop) {
            const sweep = Math.max(1, bars / 2 - 1);
            step(bars / 2, `Cambio de bajos: LOW del ${LA} a −26; LOW, MID y HI del ${LB} a 0. Y sube el FILTER del ${LA} (high-pass): sube solo en ${barsWord(sweep)}`,
                [set(`deck-${A}-eq-low`, -26, 0.5), set(`deck-${B}-eq-low`, 0, 0.5), set(`deck-${B}-eq-mid`, 0, 1), set(`deck-${B}-eq-high`, 0, 1), set(`deck-${A}-filter`, 70, sweep)]);
        } else {
            // The new track has no bass until its drop: the filter builds the tension into it
            const from = Math.max(bars / 2, bars - 3);
            step(from, `MID y HI del ${LB} a 0, y sube el FILTER del ${LA} (high-pass) hasta el drop: sube solo en ${barsWord(bars - 1 - from)}`,
                [set(`deck-${B}-eq-mid`, 0, 1), set(`deck-${B}-eq-high`, 0, 1), set(`deck-${A}-filter`, 70, Math.max(1, bars - 1 - from))]);
        }
        step(bars - 1, `Prende el ECHO del ${LA} (FX ON) para cerrar`, [{ type: 'fx', deck: A, ...endFx }]);
        if (bassOnDrop) step(bars, `¡Drop del ${LB}! LOW del ${LB} a 0, LOW del ${LA} a −26 y crossfader entero al ${LB} (el eco se apaga solo)`,
            [set(`deck-${B}-eq-low`, 0, 0.25), set(`deck-${A}-eq-low`, -26, 0.25), set('crossfader', xIn, 1)]);
        else step(bars, `Crossfader entero al ${LB} (el eco se va apagando solo)`, [set('crossfader', xIn, 1)]);
        padSteps();
    } else {
        // Loop the old track's last bar: it holds the music (in time) while you do the cut
        step(-2, `Si llegaste al final del tema: LOOP 4 del ${LA}, repite su último compás a tiempo mientras haces el corte (así no te apuras)`, [{ type: 'loop', beats: 4 }]);
        // Echo on + the old track's bass out: the echo tail stays clean under the new track
        step(-1, `Prende el ECHO del ${LA} (FX ON) y baja su LOW a −26: el eco queda limpio, sin bajo`, [{ type: 'fx', deck: A, ...endFx }, set(`deck-${A}-eq-low`, -26, 0.5)]);
        step(0, `${playText} y pasa el crossfader entero al ${LB}: el eco del ${LA} sigue sonando solo`,
            [{ type: 'startIn' }, set('crossfader', xIn, 0.25)]);
    }
    if (introLoop) step(introLoop.releaseAt, `Suelta el LOOP del ${LB}: su intro sigue y el drop llega justo al final de la mezcla`, [{ type: 'inLoopOut' }]);
    const endBar = style === 'echo' ? 2 : bars + 0.5;
    step(endBar, `Pausa el Deck ${LA}: ya no se escucha (el crossfader está en el ${LB})`, [{ type: 'pauseOut' }]);
    step(endBar + 0.25, `Listo: el efecto del ${LA} se apaga y sus perillas vuelven a 0`, [{ type: 'end' }]);

    return {
        style, styleLabel: MIX_STYLES[style], reason, bars, target, inStart, useDrop, dropAtEnd, pace, introLoop,
        dropBar: useDrop ? 0 : Math.round((na.introEnd - inStart) / barIn), bassOnDrop,
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

    const plan = planTransition(live, next, now, mode);
    live.pitchReturn = null; // freeze the playing deck's tempo during the mix
    if (plan.synced) next.syncFactor = plan.factor;
    if (mode === 'guide') {
        // Guided: nothing moves by itself, every step lights up for you
    } else if (plan.synced) {
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
    if (typeof Historial !== 'undefined') Historial.mixStarted(autoMix);
    if (mode === 'guide' && next.isPlaying) {
        // It's already playing: the mix starts on the next bar, beats lined up
        if (plan.synced) alignPhase(next, live);
        const pos = live.getCurrentTime();
        autoMix.target = live.nextBarAfter(pos + 0.05 * live.playbackRate);
        autoMix.startCtx = audioCtx.currentTime + (autoMix.target - pos) / live.playbackRate;
        autoMix.started = true;
        autoMix.phase = 'mixing';
        if (typeof Historial !== 'undefined') Historial.mixCameIn(autoMix);
        markPlayed(next.track);
    }
    // Crossfader on the playing side so the incoming deck starts silent
    if (mode === 'auto') glideControl('crossfader', plan.xOut, 400);
    toast(mode === 'guide'
        ? `Mezcla GUIADA: primero preparamos el ${next.id} paso a paso (lo que brilla), y el cambio empieza a las ${formatTime(plan.target, false)} del ${live.id}`
        : now ? `Mezclando al Deck ${next.id} en el próximo compás` : `Auto mix armado (${plan.styleLabel}): entra el Deck ${next.id} a las ${formatTime(plan.target, false)} del ${live.id}`, 'ok');
    updateAssistant();
    return true;
}

function cancelAutoMix(message = 'Mezcla cancelada') {
    if (!autoMix) return;
    if (typeof Profe !== 'undefined') Profe.onCancel();
    const { out, in: inc, plan } = autoMix;
    if (typeof Historial !== 'undefined') Historial.mixEnded(autoMix, 'cancelled');
    autoMix = null;
    if (out.fx && out.fx.on) out.fx.setOn(false);
    if (plan.introLoop && inc.loop.active) { inc.exitLoop(); refreshDeckButtons(inc); }
    if (typeof Stems !== 'undefined') [out, inc].forEach(d => STEM_PARTS.forEach(p => glideControl(Stems.id(d, p.id), 1, 400)));
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
    // pausedBars: in guided mode the plan's clock stops while it waits for you
    if (m.started) return (audioCtx.currentTime - m.startCtx) / mixBarSeconds(m) - (m.pausedBars || 0);
    return (m.out.getCurrentTime() - m.target) / (4 * m.out.beatSec);
}

function fireStep(m, step) {
    step.fired = true;
    step.pending = [];
    // Moves of the same step go together (a bass swap is both LOWs at once): one click does all
    const group = [];
    step.actions.forEach(a => {
        if (a.type === 'set') {
            if (m.mode === 'auto') glideControl(a.id, a.value, a.glide * mixBarSeconds(m) * 1000);
            else {
                // In the step that starts the new track, the other moves light up once it's playing
                const t = { id: a.id, value: a.value, glide: a.glide, group, afterStart: step.actions.some(x => x.type === 'startIn') };
                group.push(t); step.pending.push(t);
            }
        } else if (a.type === 'fxPrep') {
            const d = decks[a.deck];
            if (m.mode === 'auto') {
                d.fx.setType(a.fx); d.fx.setBeats(a.beats); setControl(`deck-${a.deck}-fx-level`, a.level); refreshFxUI(d);
            } else {
                step.pending.push({ id: `deck-${a.deck}-fxt-${a.fx}`, label: 'clic', check: () => d.fx.type === a.fx, run: () => { d.fx.setType(a.fx); refreshFxUI(d); } });
                step.pending.push({ id: `deck-${a.deck}-fxb-${String(a.beats).replace('.', '_')}`, label: 'clic', check: () => d.fx.beats === a.beats, run: () => { d.fx.setBeats(a.beats); refreshFxUI(d); } });
                step.pending.push({ id: `deck-${a.deck}-fx-level`, value: a.level });
            }
        } else if (a.type === 'fx') {
            const d = decks[a.deck];
            if (m.mode === 'auto') {
                d.fx.setType(a.fx); d.fx.setBeats(a.beats); setControl(`deck-${a.deck}-fx-level`, a.level); d.fx.setOn(true); refreshFxUI(d);
            } else {
                // The effect was chosen in the preparation: now just FX ON
                if (d.fx.type !== a.fx) { d.fx.setType(a.fx); d.fx.setBeats(a.beats); refreshFxUI(d); }
                step.pending.push({ id: `deck-${a.deck}-fx-on`, label: 'FX ON · clic', fx: d.fx });
            }
        } else if (a.type === 'cue') {
            const inc = m.in, at = m.plan.inStart;
            const go = () => { inc.cue = at; inc.seek(at); };
            if (m.mode === 'auto') go();
            else step.pending.push({ id: `deck-${inc.key}-cue-btn`, label: `IR A ${formatTime(at, false)} · clic`, check: () => !inc.isPlaying && Math.abs(inc.getCurrentTime() - at) < 0.15, run: go });
        } else if (a.type === 'pad') {
            // Scheduled on the mix's own clock: SUBIDA ends on bar a.bar, IMPACTO hits it
            const when = () => audioCtx.currentTime + (a.bar - mixBarPosition(m)) * mixBarSeconds(m);
            const go = () => { if (a.done) return; a.done = true; triggerPad(a.pad, a.pad === 0 ? { endCtx: when() } : { atCtx: when() }); };
            if (m.mode === 'auto') go();
            else step.pending.push({ id: `pad-${a.pad}`, label: a.pad === 0 ? 'termina en el drop · clic' : 'suena en el drop · clic', optional: true,
                until: a.pad === 0 ? a.bar - 1 : a.bar + 0.1, check: () => !!a.done, run: go });
        } else if (a.type === 'inLoop') {
            const inc = m.in, L = m.plan.introLoop;
            const on = () => inc.loop.active && Math.abs(inc.loop.start - L.start) < 0.05;
            const go = () => { if (!on()) { inc.setLoop(L.start, L.bars * 4 * inc.beatSec, L.beats); refreshDeckButtons(inc); } };
            if (m.mode === 'auto') go();
            else step.pending.push({ id: `deck-${inc.key}-loop-${L.beats}`, label: 'LOOP · clic', check: on, run: go });
        } else if (a.type === 'inLoopOut') {
            const inc = m.in;
            const go = () => {
                if (!inc.loop.active) return;
                inc.exitLoop();
                refreshDeckButtons(inc);
                // Line the plan's clock up with where the drop really is now
                if (m.started) {
                    const barsToDrop = (inc.analysis.introEnd - inc.getCurrentTime()) / inc.playbackRate / mixBarSeconds(m);
                    m.pausedBars = (audioCtx.currentTime - m.startCtx) / mixBarSeconds(m) - (m.plan.bars - barsToDrop);
                }
            };
            if (m.mode === 'auto') go();
            else step.pending.push({ id: `deck-${inc.key}-loop-${m.plan.introLoop.beats}`, label: 'SOLTAR · clic', check: () => !inc.loop.active, run: go });
        } else if (a.type === 'loop') {
            const out = m.out;
            const go = () => { if (!out.loop.active) stretchLoopBeats(out, a.beats); };
            if (m.mode === 'auto') go();
            else if (!m.started) step.pending.push({ id: `deck-${out.key}-loop-${a.beats}`, label: 'LOOP · clic', check: () => out.loop.active, run: go });
        } else if (a.type === 'pfl') {
            const inc = m.in;
            if (m.mode === 'auto') Cue.setPfl(inc, true);
            else step.pending.push({ id: `deck-${inc.key}-pfl`, label: 'PRENDER · clic', check: () => Cue.pfl(inc), run: () => { if (!Cue.pfl(inc)) Cue.toggle(inc); } });
        } else if (a.type === 'startIn') {
            const inc = m.in;
            if (m.mode === 'guide' && !m.started) step.pending.push({ id: `deck-${inc.key}-play-btn`, label: 'PLAY en el 1 · clic', startTarget: true, check: () => m.started, run: () => { if (!m.started) togglePlay(inc); } });
        } else if (a.type === 'stopOut') {
            if (m.out.isPlaying) m.out.pause();
        } else if (a.type === 'pauseOut') {
            const out = m.out;
            if (m.mode === 'auto') { if (out.isPlaying) out.pause(); }
            else if (out.isPlaying) step.pending.push({ id: `deck-${out.key}-play-btn`, label: 'PAUSA · clic', check: () => !out.isPlaying, run: () => { if (out.isPlaying) togglePlay(out); } });
        } else if (a.type === 'end') {
            finishAutoMix();
        }
    });
    if (autoMix) refreshCoachTargets();
}

function targetReached(t) {
    if (t.check) return t.check();
    // Already on its way there (a slow, musical move you started with a click)
    if (t.value !== undefined && glides[t.id] && Math.abs(glides[t.id].to - t.value) < 1e-6) return true;
    if (t.fx) return t.fx.on;
    const el = $(t.id);
    const tol = t.id.endsWith('-pitch') ? 0.0015 : (+el.max - +el.min) * 0.1;
    return Math.abs(+el.value - t.value) <= tol;
}

// A lit loop button does what the profe asked for (a loop that starts on the bar)
function loopButton(deck, beats) {
    const lit = currentTargets.find(t => t.id === `deck-${deck.key}-loop-${beats}` && t.run);
    if (lit) lit.run(); else deck.loopBeats(beats);
    refreshDeckButtons(deck);
}

// Music left in a track (in bars), up to where its beat ends (not the talking at the end)
function musicLeftBars(deck) {
    if (!deck.analysis) return Infinity;
    const end = Math.min(deck.analysis.musicEnd || deck.duration, deck.duration);
    return (end - deck.getCurrentTime()) / (4 * deck.beatSec);
}
// Loop of the last 2 bars of music, in time, to stretch the end of a track
function stretchLoop(deck) { stretchLoopBeats(deck, 8); }
function stretchLoopBeats(deck, beats) {
    deck.loopFromBar(beats, deck.analysis ? deck.analysis.musicEnd || deck.duration : deck.duration);
    refreshDeckButtons(deck);
}

// The old track runs out of music before the mix is over: stretch it with a loop
function tickMixLoop(m) {
    const { out, plan } = m;
    if (m.loopTarget && targetReached(m.loopTarget)) m.loopTarget = null;
    if (!out.isPlaying || out.loop.active || out.slip || !out.analysis) return;
    // Bars of music the old track still has to play: until the crossfader reaches the new one
    // (an echo out only needs to reach its cut, the echo covers the rest)
    const last = plan.style === 'echo' ? 0.5 : plan.bars;
    let need;
    if (m.started) need = last - mixBarPosition(m);
    else {
        const beats = out.beatPosition() - (out.downbeat - out.firstBeat) / out.beatSec;
        need = last + (1 - ((beats / 4) % 1 + 1) % 1); // it would start on the next bar
    }
    const left = musicLeftBars(out);
    if (need <= 0.25 || left >= need - 0.5 || left < -8) return;
    if (m.mode === 'auto') { stretchLoop(out); return; }
    if (!m.loopTarget) m.loopTarget = { id: `deck-${out.key}-loop-8`, label: 'LOOP · clic', check: () => out.loop.active, run: () => stretchLoop(out) };
}

function refreshCoachTargets() {
    const m = autoMix;
    if (!m) { setCoachTargets([]); return; }
    const targets = m.loopTarget ? [m.loopTarget] : [];
    const bp = mixBarPosition(m);
    m.plan.steps.forEach(s => { s.pending = (s.pending || []).filter(t => !targetReached(t) && !(t.optional && bp > t.until)); });
    if (m.extraTargets) m.extraTargets = m.extraTargets.filter(t => !targetReached(t));
    // Before the new track comes in (echo out): one thing at a time — loop, then echo +
    // bass out, then PLAY; the crossfader only once the new track plays
    const pre = m.started ? [] : m.plan.steps.filter(s => !s.prep && s.fired && s.at < 0 && s.pending.length).sort((x, y) => x.at - y.at);
    m.plan.steps.forEach(s => {
        if (pre.length && s.at < 0 && !s.prep && s !== pre[0]) return;
        targets.push(...s.pending.filter(t => !(t.afterStart && !m.started) && !(t.startTarget && pre.length)));
    });
    targets.push(...(m.extraTargets || []));
    setCoachTargets(targets);
}

function formatTarget(t) {
    if (t.label) return t.label;
    if (t.fx) return 'ON';
    if (t.id === 'crossfader') return t.value === 0 ? 'CENTRO' : t.value < 0 ? 'A' : 'B';
    if (t.id.endsWith('-pitch')) { const pct = ((t.value - 1) * 100).toFixed(1); return `${pct >= 0 ? '+' : ''}${pct}%`; }
    if (t.id.endsWith('-fx-level') || t.id.endsWith('-volume')) return `${Math.round(t.value * 100)}%`;
    if (t.id.includes('-stem-')) return t.value >= 0.5 ? 'ON' : 'OFF';
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
    // One light per control: the mix plan's step wins over a profe suggestion on the same control
    const all = mixTargets.concat(typeof Profe !== 'undefined' ? Profe.targets() : [])
        .filter((t, i, list) => list.findIndex(o => o.id === t.id) === i);
    coachEls.forEach(el => { el.classList.remove('coach-target', 'coach-warn', 'coach-idea'); delete el.dataset.target; delete el.dataset.targetValue; });
    coachEls = all.map(t => {
        const input = $(t.id);
        const el = input.closest('.knob-container') || (input.tagName === 'INPUT' ? input.parentElement : input);
        el.classList.add('coach-target');
        el.classList.toggle('coach-warn', !!t.warn);
        el.classList.toggle('coach-idea', !!t.idea);
        el.dataset.target = formatTarget(t) + (t.value !== undefined && !t.label ? ' · clic' : '');
        if (t.value !== undefined) el.dataset.targetValue = t.value;
        return el;
    });
    currentTargets = all;
}
let currentTargets = [];

// One click on a lit-up control (or Space for all of them) moves it to its target by itself
function applyTarget(t) {
    if (targetReached(t)) return; // already done: never toggle it back
    if (t.run) { t.run(); return; }
    if (t.fx) { if (!t.fx.on) { t.fx.setOn(true); refreshFxUI(t.fx.deck); } return; }
    if (t.value !== undefined) glideControl(t.id, t.value, glideMsFor(t.id, t));
    if (t.group) t.group.forEach(o => { if (o !== t && !targetReached(o)) glideControl(o.id, o.value, glideMsFor(o.id, o)); });
}
// Is this control changing something you can hear right now?
function controlAudible(id) {
    if (id === 'crossfader') return deckList.filter(d => d.isPlaying).length === 2;
    const deck = decks[(id.match(/^deck-([ab])-/) || [])[1]];
    return !!(deck && deck.isPlaying && xfCurve(deck) > 0.3 && !id.includes('-fx'));
}
// How fast a click moves a control to its target. Anything you can hear moves like a DJ's
// hand would (a bar or more, a filter rises over several bars); silent prep moves are quick
const glideMsFor = (id, t) => {
    const deck = decks[(id.match(/^deck-([ab])-/) || [])[1]];
    if (id.endsWith('-pitch')) return deck && deck.isPlaying ? 4000 : 400;
    if (!controlAudible(id)) return 350;
    const m = autoMix;
    if (t && t.glide >= 0.2 && m && m.started) return Math.max(900, t.glide * mixBarSeconds(m) * 1000);
    const ref = deck && deck.isPlaying ? deck : deckList.find(d => d.isPlaying);
    return ref && ref.beatSec ? clamp(4 * ref.beatSec / ref.playbackRate * 1000, 1200, 2500) : 1500;
};
function applyAllTargets() {
    ensureAudio();
    if (!currentTargets.length) { toast('No hay nada que mover ahora mismo', 'info'); return; }
    // Space = the steps you have to do (the profe's optional IDEAS only on their own click)
    const must = currentTargets.filter(t => !t.idea);
    if (!must.length) { toast('Nada obligatorio ahora: lo morado son ideas, clic si te gustan', 'info'); return; }
    must.forEach(applyTarget);
}
function litTargetFor(el) {
    const host = el.closest('.coach-target');
    if (!host) return null;
    const input = host.querySelector('input[type=range]') || el;
    const idea = currentTargets.find(t => t.idea && t.run && t.id === input.id);
    if (idea) return idea;
    if (host.dataset.targetValue === undefined) return null;
    return currentTargets.find(t => t.id === input.id && t.value !== undefined) || { id: input.id, value: +host.dataset.targetValue };
}

// The stems of both tracks got ready while a guided mix was waiting: redo it with stems
function replanForStems() {
    const m = autoMix;
    if (!m || m.started || !['auto', 'stems', 'mashup'].includes(mixStyleSetting)) return;
    if (!(Stems.ready(m.out) && Stems.ready(m.in)) || ['stems', 'mashup'].includes(m.plan.style)) return;
    const mode = m.mode;
    m.log = null;
    autoMix = null;
    setCoachTargets([]);
    startAutoMix(false, mode);
}

let lastMixDone = null;
function finishAutoMix(early = false) {
    const m = autoMix;
    if (!m) return;
    const { out, in: inc, plan } = m;
    if (typeof Historial !== 'undefined') Historial.mixEnded(m, early ? 'early' : 'done');
    if (out.isPlaying && m.mode === 'auto') out.pause();
    if (out.fx.on) out.fx.setOn(false);
    if (out.loop.active && !out.isPlaying) out.exitLoop(); // the stretch loop is done
    ['low', 'mid', 'high'].forEach(b => setControl(`deck-${out.key}-eq-${b}`, 0));
    setControl(`deck-${out.key}-filter`, 0);
    // The paused deck gets all its parts back for next time (nobody hears it)
    if (typeof Stems !== 'undefined') STEM_PARTS.forEach(p => setControl(Stems.id(out, p.id), 1));
    if (m.mode === 'auto') {
        if (typeof Stems !== 'undefined') STEM_PARTS.forEach(p => glideControl(Stems.id(inc, p.id), 1, 1000));
        // The new track's knobs go back to 0 over a bar (a snap would jump the volume)
        resetChannel(inc, clamp(4 * inc.beatSec / inc.playbackRate * 1000, 1200, 2500));
        if (out.isPlaying) glideControl('crossfader', plan.xIn, 1500); else setControl('crossfader', plan.xIn);
    }
    // Guided: the crossfader and the new track's knobs stay where YOU left them (the
    // profe lights them if something is off, and the next mix starts by placing the crossfader)
    if (out.syncOn) out.syncOn = false;
    inc.syncOn = false;
    startPitchReturn(inc, 32);
    // The new track is on air now: the headphones go back to nothing cued
    if (typeof Cue !== 'undefined') { Cue.setPfl(inc, false); Cue.setPfl(out, false); }
    refreshDeckButtons(out);
    refreshDeckButtons(inc);
    autoMix = null;
    lastMixDone = { out, in: inc, at: performance.now(), early };
    // Guided: nothing moves by itself, but if you ended early the new track may still have
    // its knobs cut (thin and quiet: -17 dB in the history): light them to go back to 0
    afterMixTargets = m.mode === 'guide'
        ? ['low', 'mid', 'high'].map(b => `deck-${inc.key}-eq-${b}`).concat([`deck-${inc.key}-filter`])
            .filter(id => Math.abs(+$(id).value) > 1).map(id => ({ id, value: 0, glide: 1 }))
            .concat(typeof Stems === 'undefined' ? [] : STEM_PARTS.map(p => Stems.id(inc, p.id)).filter(id => +$(id).value < 0.5).map(id => ({ id, value: 1, glide: 0.5 })))
        : [];
    out.freshLoad = false;
    inc.freshLoad = false;
    setCoachTargets([]);
    // The DJ PROFE explains how everything is left; without it, a short toast
    if (typeof Profe === 'undefined' || Profe.mode() === 'off') toast(`Mezcla completa: ahora suena el Deck ${inc.id}`, 'ok');
    renderLibrary();
    updateAssistant();
}

// Guided mix: you pressed PLAY on the new track. It comes in exactly on the bar:
// on the planned one if you're close, otherwise on the next bar of the playing track
function guidedStart(m) {
    if (m.started) return;
    const { out, in: inc, plan } = m;
    const pos = out.getCurrentTime();
    const barReal = 4 * out.beatSec / out.playbackRate;
    let dt = (m.target - pos) / out.playbackRate;
    if (dt < 0.05 || dt > 2 * barReal) {
        m.target = out.nextBarAfter(pos + 0.08 * out.playbackRate);
        dt = (m.target - pos) / out.playbackRate;
    }
    m.startCtx = audioCtx.currentTime + dt;
    m.pausedBars = 0;
    if (typeof Historial !== 'undefined') Historial.mixCameIn(m);
    inc.play(plan.inStart, m.startCtx);
    markPlayed(inc.track);
    m.started = true;
    m.phase = 'mixing';
    if (dt > 0.25) toast(`El ${inc.id} entra justo en el próximo compás`, 'ok');
    renderLibrary();
}

function tickAutoMix() {
    const m = autoMix;
    if (!m) return;
    const { out, in: inc, plan } = m;
    if (!m.started) {
        if (!out.isPlaying) { cancelAutoMix('Mezcla cancelada: el deck se detuvo'); return; }
        const dt = (m.target - out.getCurrentTime()) / out.playbackRate;
        // Guided: the new track comes in when you press PLAY (quantized to the bar).
        // Only if the old track is about to end does it come in by itself
        const leftBars = (out.duration - out.getCurrentTime()) / (4 * out.beatSec);
        if (m.mode === 'guide' && leftBars < 3) guidedStart(m);
        if (m.mode === 'auto' && dt <= 0.3) {
            // Start the incoming deck sample-accurately on the outgoing deck's bar
            m.startCtx = audioCtx.currentTime + Math.max(0.01, dt);
            if (!inc.isPlaying) {
                inc.play(plan.inStart, m.startCtx);
                markPlayed(inc.track);
            } else if (plan.synced) {
                alignPhase(inc, out);
            }
            m.started = true;
            m.phase = 'mixing';
            if (typeof Historial !== 'undefined') Historial.mixCameIn(m);
            renderLibrary();
        }
    }
    if (m.started && m.mode === 'guide') {
        const now = audioCtx.currentTime;
        const dtBars = m.lastCtx ? (now - m.lastCtx) / mixBarSeconds(m) : 0;
        m.lastCtx = now;
        const waiting = plan.steps.some(s => s.fired && s.pending && s.pending.some(t => !t.optional)); // optional FX never hold the plan
        const nextStep = plan.steps.find(s => !s.fired);
        const outLeftBars = (out.duration - out.getCurrentTime()) / (4 * out.beatSec);
        m.waiting = false;
        if (waiting && outLeftBars <= 4) {
            // The old track is about to end: no more waiting, do what's left
            plan.steps.forEach(s => (s.pending || []).forEach(applyTarget));
        } else if (waiting && nextStep && mixBarPosition(m) >= nextStep.at - 0.02) {
            m.pausedBars = (m.pausedBars || 0) + dtBars; // the plan waits for you
            m.waiting = true;
        }
        // Crossfader already fully on the new deck: skip straight to pausing the old one
        const pauseStep = plan.steps.find(s => s.actions.some(a => a.type === 'pauseOut'));
        if (!m.skipped && pauseStep && !pauseStep.fired && Math.abs(+$('crossfader').value - plan.xIn) < 0.1 && mixBarPosition(m) > 0.5) {
            m.skipped = true;
            plan.steps.forEach(s => { if (s.at < pauseStep.at) { s.fired = true; s.pending = []; } });
            m.pausedBars = (m.pausedBars || 0) - (pauseStep.at - mixBarPosition(m));
            // The new track should play full (bass, mids, highs): light what's still cut
            m.extraTargets = ['low', 'mid', 'high'].map(b => `deck-${inc.key}-eq-${b}`).concat([`deck-${inc.key}-filter`])
                .filter(id => Math.abs(+$(id).value) > 1).map(id => ({ id, value: 0, glide: 1 }));
            toast(`¡Te adelantaste! Ya suena el ${inc.id}: solo falta pausar el ${out.id}`, 'ok');
        }
    }
    // The old track stopped (you paused it or it ended): the mix is done
    if (m.started && plan.style !== 'echo' && !out.isPlaying) { finishAutoMix(true); return; }
    tickMixLoop(m);
    const barPos = mixBarPosition(m);
    m.progress = clamp(barPos / plan.bars, 0, 1);
    let prepBlocked = false;
    for (const s of plan.steps) {
        if (!autoMix) return;
        if (s.prep) {
            // Preparation: one thing at a time in guided mode, all at once in auto mode
            if (s.fired) { if (m.mode === 'guide' && s.pending && s.pending.some(t => !targetReached(t))) prepBlocked = true; continue; }
            if (m.mode === 'guide' && prepBlocked) continue;
            fireStep(m, s);
            if (m.mode === 'guide' && s.pending.length) prepBlocked = true;
            continue;
        }
        if (s.fired) continue;
        const isStart = s.actions.some(a => a.type === 'startIn');
        // Guided: once the preparation is done, PLAY lights up right away (come in whenever
        // you want, it's quantized); otherwise it lights one bar before the ideal moment
        const at = isStart && m.mode === 'guide' ? s.at - (plan.style === 'echo' ? 0.5 : 1) : s.at;
        const prepDone = plan.steps.every(p => !p.prep || (p.fired && !(p.pending || []).some(t => !targetReached(t))));
        // Echo + bass out: lit as soon as you're ready. The LOOP only makes sense near the end of
        // the track (to hold it while you cut), never in the middle of a song: it keeps its time
        const preStart = plan.style === 'echo' && s.at < 0 && !s.actions.some(a => a.type === 'loop');
        if (barPos < at && !((isStart || preStart) && m.mode === 'guide' && prepDone)) continue;
        if (s.at >= 0 && !m.started && !(isStart && m.mode === 'guide')) continue;
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
            <span class="${c} font-bold text-[10px]">${role} · DECK ${deck.id}${deck.isPlaying ? ' ▶' : ''}${deck.track && !deck.track.demo ? ` <span class="tag" title="Género detectado por el ritmo (cámbialo con la carpeta en la librería)">${folderLabel(trackGenre(deck.track))}</span>` : ''}</span>
            <span class="font-digits text-[10px] text-gray-300">${deck.effectiveBpm.toFixed(1)} BPM · <span class="tag">${key}</span>${deck.trimDb ? ` <span class="tag" title="Nivelación automática de volumen">${deck.trimDb > 0 ? '+' : ''}${deck.trimDb.toFixed(1)}dB</span>` : ''}</span>
        </div>
        <div class="text-white font-bold truncate">${escapeHtml(deck.track ? deck.track.title : '')}</div>
        <div class="text-gray-400 mt-0.5">${line}</div>`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function stepLabel(at) {
    if (at <= -500) return 'PREPARA';
    if (at < 0) return `${at} comp.`;
    return `comp. ${Number.isInteger(at) ? at : at.toFixed(1)}`;
}

function renderPlan(plan, m, live, next) {
    const total = plan.bars + 0.5;
    const timed = plan.steps.filter(s => !s.prep);
    const minAt = Math.min(0, ...timed.map(s => s.at));
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

    const markers = timed.map(s => {
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
            ? `Ritmo rápido (${live.track && !live.track.demo ? folderLabel(trackGenre(live.track)) : 'reggaetón/urbano'}): se mezcla temprano, al terminar un coro, para que la pista no se haga larga.`
            : `Ritmo largo (${live.track && !live.track.demo ? folderLabel(trackGenre(live.track)) : 'house/techno'}): se mezcla en el outro, que está hecho para eso.`}${live.track && next.track && !live.track.demo && !next.track.demo && trackGenre(live.track) !== trackGenre(next.track)
            ? ` <b class="text-amber-300">Cambio de género (${folderLabel(trackGenre(live.track))} → ${folderLabel(trackGenre(next.track))})</b>: hazlo en un momento de energía alta y con un corte limpio, la gente lo siente como una sorpresa.` : ''}</div>
        <div class="text-[11px] text-gray-200 mb-2">
            <i class="fa-solid fa-play text-emerald-400 mr-1"></i>Empieza cuando el <b>${live.id}</b> llegue a <b class="text-orange-400">${formatTime(plan.target, false)}</b>
            · el <b>${next.id}</b> arranca desde <b class="text-emerald-400">${formatTime(plan.inStart, false)}</b>${plan.useDrop ? ' (directo en su drop)' : plan.dropAtEnd ? ` <span class="text-violet-300">(así su DROP cae justo al terminar la mezcla, en el compás ${plan.dropBar})</span>` : ''}
            ${pct !== null ? `· tempo del ${next.id} ${pct >= 0 ? '+' : ''}${pct}%` : '· sin sync'}
        </div>
        ${current.length ? `<div class="mb-2 p-2 rounded border border-amber-500/50 bg-amber-950/40 text-amber-200 text-xs font-bold"><i class="fa-solid fa-hand-point-right mr-1"></i>AHORA: ${current[0].text} <span class="font-normal text-amber-300/80">(haz clic en lo que brilla en verde y se ajusta solo, o presiona ESPACIO para todo)</span></div>` : ''}
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
        else if (compat === 0) add('fa-music', 'text-rose-400', `Tonalidad ${liveKey} → ${nextKey}: <b>chocan</b>: el profe no deja sonar las dos melodías juntas.`);
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
    ['Digit4', null, 'pad0', 'pad-0', 'Sampler: SUBIDA (Shift = STAB)'],
    ['Digit5', null, 'pad1', 'pad-1', 'Sampler: IMPACTO (Shift = BAJADA)'],
    ['Digit6', null, 'pad2', 'pad-2', 'Sampler: REDOBLE (Shift = SUB DROP)'],
    ['Digit7', null, 'pad3', 'pad-3', 'Sampler: REVERSO (Shift = AIR HORN)'],
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
    // Second row of pads: Shift + 4..7
    [4, 5, 6, 7].forEach(i => {
        const el = $(`pad-${i}`);
        if (!el) return;
        const badge = document.createElement('span');
        badge.className = 'kbd';
        badge.textContent = `⇧${i}`;
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
            loopButton(deck, +action.slice(4));
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
        case 'pad0': case 'pad1': case 'pad2': case 'pad3': triggerPad(+action.slice(3) + (shift ? 4 : 0)); break;
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
    return t && (t.tagName === 'INPUT' && ['text', 'search', 'number', 'url', ''].includes(t.type) || t.tagName === 'TEXTAREA' || t.isContentEditable);
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
// Your own sounds on the pads (drag a file onto a pad), saved in the browser
const padCustom = SAMPLER_PADS.map(() => null); // { name, buffer }

// When a pad should sound so it lands on the music: a beat, the next "1", or (the ones that
// build up) finishing exactly on the next drop / 8-bar phrase. `at` = a track position to hit.
function padTiming(pad, at = null, custom = null) {
    const { live } = liveAndNext();
    const now = audioCtx.currentTime + 0.02;
    if (!live.isPlaying || !live.analysis) {
        const beatSec = 0.47;
        const len = pad.maxBars ? Math.min(pad.maxBars, 2) * 4 * beatSec : Sampler.defaultLen(pad, beatSec);
        return { t: now, len, beatSec, key: null, where: '' };
    }
    const pos = live.getCurrentTime(), rate = live.playbackRate, beat = live.beatSec, bar = 4 * beat;
    const toCtx = (p) => Math.max(now, audioCtx.currentTime + (p - pos) / rate);
    const base = { beatSec: beat / rate, key: live.analysis.key };
    const nextBeat = live.firstBeat + Math.ceil((pos + 0.03 * rate - live.firstBeat) / beat) * beat;
    if (at !== null) return { ...base, t: toCtx(at), len: Sampler.defaultLen(pad, base.beatSec), where: 'en el drop' };
    if (pad.sync === 'beat' || pad.sync === 'bar' || custom && pad.sync !== 'end') {
        // Snap to the beat you meant: the nearest one to what you're HEARING right now
        // (speakers, Bluetooth above all, play a bit later than the audio clock), and to
        // the "1" if it's that close. Never waits a whole bar: pressing on time sounds on time
        const heard = pos - audioLatency() * rate;
        let tb = live.firstBeat + Math.round((heard - live.firstBeat) / beat) * beat;
        const one = live.downbeat + Math.round((heard - live.downbeat) / bar) * bar;
        if (pad.sync === 'bar' && Math.abs(one - heard) <= 0.5 * beat) tb = one;
        // Already rendered (you pressed late): the next beat, still on the grid
        while (audioCtx.currentTime + (tb - pos) / rate < audioCtx.currentTime - 0.06) tb += beat;
        const isOne = Math.abs(((tb - live.downbeat) / bar) - Math.round((tb - live.downbeat) / bar)) < 0.01;
        return { ...base, t: toCtx(tb), len: Sampler.defaultLen(pad, base.beatSec), where: isOne ? 'en el 1' : 'en el beat' };
    }
    // 'end': finish on the next drop or phrase that is far enough away
    const ctx = Profe.context(live);
    const ps = live.analysis.phraseStart ?? live.downbeat;
    const ends = [];
    if (ctx.nextDrop) ends.push({ t: ctx.nextDrop, what: 'el drop' });
    for (let k = 1; k <= 3; k++) ends.push({ t: ps + (Math.floor((pos - ps) / (8 * bar)) + k) * 8 * bar, what: 'la próxima frase' });
    const end = ends.filter(e => (e.t - pos) / bar >= pad.minBars - 1e-3).sort((x, y) => x.t - y.t)[0];
    const len = custom ? custom.buffer.duration * rate : pad.maxBars * bar;
    const start = Math.max(end.t - len, nextBeat);
    const barsAway = Math.ceil((end.t - pos) / bar - 0.05);
    return { ...base, t: toCtx(start), len: (end.t - start) / rate, where: `termina en ${end.what} (en ${barsAway} ${barsAway === 1 ? 'compás' : 'compases'})` };
}

function triggerPad(i, { at = null, endCtx = null, atCtx = null } = {}) {
    ensureAudio();
    const pad = SAMPLER_PADS[i];
    const custom = padCustom[i];
    let tm = padTiming(pad, at, custom);
    const soon = audioCtx.currentTime + 0.02;
    // The mix plan says exactly when: finish on the drop / hit on the drop
    if (endCtx) { const start = Math.max(soon, endCtx - (pad.maxBars || 2) * 4 * tm.beatSec); tm = { ...tm, t: start, len: Math.max(0.2, endCtx - start), where: 'termina en el drop' }; }
    if (atCtx) tm = { ...tm, t: Math.max(soon, atCtx), where: 'en el drop' };
    const t = custom && pad.sync === 'end' ? Math.max(audioCtx.currentTime + 0.02, tm.t + tm.len - custom.buffer.duration) : tm.t;
    const dur = Sampler.play(audioCtx, Mixer.sampler, pad.id, { t, len: tm.len, beatSec: tm.beatSec, key: tm.key, buffer: custom && custom.buffer });
    // The pad shows it's waiting for its moment, then lights while it sounds
    const el = $(`pad-${i}`);
    const wait = Math.max(0, (t - audioCtx.currentTime) * 1000);
    clearTimeout(el._t1); clearTimeout(el._t2);
    el.classList.toggle('armed', wait > 60);
    el._t1 = setTimeout(() => { el.classList.remove('armed'); el.classList.add('pressed'); }, wait);
    el._t2 = setTimeout(() => el.classList.remove('pressed'), wait + Math.min(dur, 4) * 1000);
    showPadHint(i, tm.where);
    if (typeof Profe !== 'undefined') Profe.onPad(i);
}

// How late the speakers play what the audio clock renders (Bluetooth: ~0.15–0.3 s)
function audioLatency() {
    if (!audioCtx) return 0;
    return Math.min(0.5, (audioCtx.outputLatency || 0) + (audioCtx.baseLatency || 0));
}

function showPadHint(i, where = '') {
    const pad = SAMPLER_PADS[i];
    const c = padCustom[i];
    const lat = audioLatency();
    $('sampler-hint').innerHTML = `<b class="text-amber-300">${pad.label}${c ? ' (tu sonido)' : ''}${where ? ` · ${where}` : ''}:</b> <span></span>`;
    $('sampler-hint').querySelector('span').textContent = (c ? `"${c.name}". Clic derecho vuelve al sonido original.` : pad.when)
        + (lat > 0.1 ? ` · Tu salida tiene ${Math.round(lat * 1000)} ms de retraso (Bluetooth): si te suena tarde, aprieta apenas antes del golpe.` : '');
}

function renderPads() {
    SAMPLER_PADS.forEach((p, i) => {
        const c = padCustom[i];
        const el = $(`pad-${i}`);
        el.querySelector('.pad-label').textContent = c ? c.name.replace(/\.[^.]+$/, '').slice(0, 12).toUpperCase() : p.label;
        el.classList.toggle('pad-custom', !!c);
        el.title = c ? `Tu sonido: ${c.name} (clic derecho = volver a ${p.label})` : `${p.when} Arrastra aquí un .wav/.mp3 para usar tu propio sonido.`;
    });
}

async function setPadSample(i, file) {
    try {
        ensureAudio();
        if (file.size > 15e6) { toast('Ese archivo es muy grande para un pad (máx. 15 MB)', 'warn'); return; }
        const bytes = await file.arrayBuffer();
        const buffer = await audioCtx.decodeAudioData(bytes.slice(0));
        padCustom[i] = { name: file.name, buffer };
        renderPads();
        showPadHint(i);
        toast(`Pad ${SAMPLER_PADS[i].label} → ${file.name}`, 'ok');
        await Store.pads.put({ pad: i, name: file.name, bytes });
    } catch (e) {
        console.error(e);
        toast(`No pude leer "${file.name}" como audio`, 'warn');
    }
}

async function resetPad(i) {
    if (!padCustom[i]) return;
    padCustom[i] = null;
    renderPads();
    showPadHint(i);
    try { await Store.pads.remove(i); } catch (e) {}
}

async function loadPadSamples() {
    try {
        const list = await Store.pads.all();
        if (!list.length) return;
        // Decoded without starting the audio (that needs a click); buffers work in any context
        const dec = new OfflineAudioContext(2, 1, 44100);
        for (const r of list) {
            try { padCustom[r.pad] = { name: r.name, buffer: await dec.decodeAudioData(r.bytes.slice(0)) }; } catch (e) {}
        }
        renderPads();
    } catch (e) { /* no pads store yet */ }
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
        if (data.version) $('app-version').textContent = `v ${data.version}`;
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

    // Already in the library: no need to download it again
    const existing = library.find(e => e.url && youtubeKey(e.url) === youtubeKey(url));
    if (existing) {
        $('modal-track-name').innerText = `${existing.artist} - ${existing.title}`;
        ['step-1', 'step-2'].forEach(id => setStep($(id), 'done', 'Ya estaba en tu librería: no hace falta bajarlo de nuevo'));
        setStep($('step-3'), 'done', `Listo · ${existing.analysis ? existing.analysis.bpm.toFixed(1) + ' BPM' : ''}`);
        progressBar.style.width = '100%';
        convertedTrack = { entry: existing, buffer: null };
        deckActions.classList.remove('opacity-50', 'pointer-events-none');
        $('youtube-url-input').value = '';
        return;
    }

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
        convertedTrack = await importTrack({ title, artist, source: 'youtube', bytes, url });
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
        loopButton(deck, b);
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
    // Hard to drag a thin slider on a touchpad: wheel over it, or one click on a safe level
    wheelSlider($(`deck-${k}-fx-level`), 200);
    [0, 1, 2].forEach(i => $(`deck-${k}-fxl-${i}`).addEventListener('click', (e) => {
        ensureAudio();
        glideControl(`deck-${k}-fx-level`, +e.currentTarget.dataset.level, 250);
    }));
    hold(`deck-${k}-fx-on`, () => { ensureAudio(); fxKey(deck, 'down'); }, () => { if (fxHold[k]) fxKey(deck, 'up'); });

    // Overview click = seek
    // Overview: click or hold and drag to move through the track
    const ov = $(`deck-${k}-overview`);
    let ovDrag = false, ovLast = 0;
    const ovSeek = (e, force) => {
        if (!deck.audioBuffer) return;
        const now = performance.now();
        if (!force && now - ovLast < 60) return; // don't restart the audio on every pixel
        ovLast = now;
        const r = ov.getBoundingClientRect();
        deck.seek(clamp((e.clientX - r.left) / r.width, 0, 1) * deck.duration);
    };
    ov.addEventListener('pointerdown', (e) => { ensureAudio(); ovDrag = true; ov.setPointerCapture(e.pointerId); ovSeek(e, true); });
    ov.addEventListener('pointermove', (e) => { if (ovDrag) ovSeek(e, false); });
    const ovEnd = (e) => { if (!ovDrag) return; ovDrag = false; ovSeek(e, true); };
    ov.addEventListener('pointerup', ovEnd);
    ov.addEventListener('pointercancel', () => { ovDrag = false; });

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
    $('rec-btn').addEventListener('click', toggleRecording);
    Setlist.init();
    $('lib-search').addEventListener('input', (e) => { libSearch = e.target.value; renderLibrary(); });
    $('library-clear').addEventListener('click', async () => {
        if (!confirm('¿Borrar TODOS los temas guardados en este navegador? No se puede deshacer.')) return;
        await Store.clear();
        library.splice(0, library.length);
        renderLibrary();
        refreshStorageInfo();
    });
    // Don't lose a recording (or one in progress) by closing the page
    window.addEventListener('beforeunload', (e) => {
        if (Recorder.rec || Recorder.list.some(r => !r.downloaded)) { e.preventDefault(); e.returnValue = ''; }
    });
    $('master-gain').addEventListener('input', (e) => { if (Mixer.master) Mixer.master.gain.setTargetAtTime(+e.target.value, audioCtx.currentTime, 0.01); });
    $('sampler-gain').addEventListener('input', (e) => { if (Mixer.sampler) Mixer.sampler.gain.value = +e.target.value; });
    const xf = $('crossfader');
    // Lit-up crossfader: one click sends it to the target instead of jumping to the cursor
    // Lit-up sliders: one click sends them to the target instead of jumping to the cursor
    document.querySelectorAll('input[type=range]:not(.hidden)').forEach(input => {
        const go = (e) => {
            const lit = litTargetFor(input);
            if (lit && lit.id === input.id) { e.preventDefault(); ensureAudio(); applyTarget(lit); }
            else delete glides[input.id]; // grabbing it by hand stops any glide
        };
        input.addEventListener('mousedown', go);
        input.addEventListener('touchstart', go, { passive: false });
    });
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
        <button id="pad-${i}" class="pad rounded-lg py-2 font-black text-[11px] text-amber-200 flex flex-col items-center justify-center gap-1">
            <i class="fa-solid ${p.icon} text-base"></i><span class="pad-label">${p.label}</span>
        </button>`).join('');
    SAMPLER_PADS.forEach((p, i) => {
        const el = $(`pad-${i}`);
        el.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            // Lit by the mix plan / the profe: it knows exactly when it should sound
            const lit = currentTargets.find(t => t.id === `pad-${i}` && t.run);
            if (lit) lit.run(); else triggerPad(i);
        });
        el.addEventListener('mouseenter', () => showPadHint(i));
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); resetPad(i); });
        // Drop your own sample on a pad (not into the library)
        el.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('pad-drop'); });
        el.addEventListener('dragleave', () => el.classList.remove('pad-drop'));
        el.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation();
            el.classList.remove('pad-drop');
            const f = e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) setPadSample(i, f);
        });
    });
    renderPads();

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
    // A button lit as a profe IDEA (FX ON, a stem…) does the idea on the beat instead of a plain toggle
    document.addEventListener('click', (e) => {
        const host = e.target.closest('.coach-idea');
        if (!host) return;
        const t = currentTargets.find(x => x.idea && x.run && ($(x.id) === host || host.contains($(x.id))));
        if (!t || t.id.startsWith('pad-')) return;
        e.preventDefault(); e.stopPropagation();
        ensureAudio(); applyTarget(t);
    }, true);

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
   RECORDING: everything that comes out of the master (effects and sampler too)
   ========================================================================== */
const Recorder = { rec: null, chunks: [], startedAt: 0, dest: null, list: [], tracks: [] };

function toggleRecording() {
    ensureAudio();
    if (Recorder.rec) { Recorder.rec.stop(); return; }
    if (!window.MediaRecorder) { toast('Este navegador no puede grabar audio (usa Chrome)', 'warn'); return; }
    Recorder.dest = Recorder.dest || audioCtx.createMediaStreamDestination();
    Mixer.limiter.connect(Recorder.dest);
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(Recorder.dest.stream, type ? { mimeType: type, audioBitsPerSecond: 256000 } : {});
    Recorder.chunks = [];
    Recorder.tracks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) Recorder.chunks.push(e.data); };
    rec.onstop = () => {
        try { Mixer.limiter.disconnect(Recorder.dest); } catch (e) {}
        const blob = new Blob(Recorder.chunks, { type: rec.mimeType || type || 'audio/webm' });
        const seconds = (performance.now() - Recorder.startedAt) / 1000;
        const at = new Date(Date.now() - seconds * 1000);
        const stamp = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')} ${String(at.getHours()).padStart(2, '0')}.${String(at.getMinutes()).padStart(2, '0')}`;
        Recorder.list.unshift({ blob, seconds, name: `WebDJ mezcla ${stamp}`, ext: blob.type.includes('mp4') ? 'm4a' : 'webm', tracks: Recorder.tracks.slice(), downloaded: false });
        Recorder.rec = null;
        renderRecordings();
        refreshRecButton();
        toast(`Grabación lista (${formatTime(seconds, false)}): descárgala abajo, en MIS GRABACIONES`, 'ok');
    };
    rec.start(1000);
    Recorder.rec = rec;
    Recorder.startedAt = performance.now();
    refreshRecButton();
    toast('Grabando tu mezcla: todo lo que suena (efectos y sampler incluidos)', 'ok');
}

// Tracklist of the recording: which tracks were heard, and when
function tickRecorderTracklist() {
    if (!Recorder.rec) return;
    const t = (performance.now() - Recorder.startedAt) / 1000;
    const x = +$('crossfader').value;
    deckList.forEach(d => {
        const gain = xfCurve(d, x);
        if (!d.isPlaying || !d.track || gain < 0.3) return;
        const title = `${d.track.artist ? d.track.artist + ' - ' : ''}${d.track.title}`;
        if (!Recorder.tracks.some(r => r.title === title)) Recorder.tracks.push({ t, title });
    });
}

function refreshRecButton() {
    const btn = $('rec-btn');
    const on = !!Recorder.rec;
    btn.classList.toggle('bg-rose-600', on);
    btn.classList.toggle('text-white', on);
    $('rec-label').textContent = on ? `GRABANDO ${formatTime((performance.now() - Recorder.startedAt) / 1000, false)} · STOP` : 'REC';
}

function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function downloadRecordingMp3(item, button) {
    button.disabled = true;
    const label = button.innerHTML;
    button.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin"></i> MP3...';
    try {
        const res = await fetch(`/api/mp3?name=${encodeURIComponent(item.name)}`, { method: 'POST', body: item.blob });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
        downloadBlob(await res.blob(), `${item.name}.mp3`);
        item.downloaded = true;
    } catch (e) {
        toast(`No se pudo convertir a MP3: ${e.message}. Descarga el original.`, 'warn');
    } finally {
        button.disabled = false;
        button.innerHTML = label;
    }
}

function renderRecordings() {
    $('recordings').classList.toggle('hidden', !Recorder.list.length);
    const list = $('recordings-list');
    list.innerHTML = '';
    Recorder.list.forEach(item => {
        const row = document.createElement('div');
        row.className = 'flex flex-wrap items-center gap-2 bg-black/30 rounded px-2 py-1.5 border border-gray-800';
        row.innerHTML = `
            <i class="fa-solid fa-compact-disc text-rose-400"></i>
            <span class="font-bold text-white"></span>
            <span class="font-digits text-[10px] text-gray-400">${formatTime(item.seconds, false)}</span>
            <span class="text-[10px] text-gray-500 flex-1 truncate" title=""></span>
            <button data-dl class="mini-btn !text-emerald-300" title="Descarga el audio tal cual se grabó">DESCARGAR .${item.ext}</button>
            <button data-mp3 class="mini-btn !text-amber-300" title="${server.ffmpeg ? 'Convierte a MP3 320 kbps' : 'Necesitas ffmpeg (brew install ffmpeg) y reiniciar python server.py'}" ${server.ffmpeg ? '' : 'disabled'}>MP3</button>
            <button data-tl class="mini-btn" title="Descarga la lista de temas con sus tiempos">TRACKLIST</button>`;
        row.children[1].textContent = item.name;
        const tl = item.tracks.map(r => `${formatTime(r.t, false)} ${r.title}`).join(' · ');
        row.children[3].textContent = tl;
        row.children[3].title = tl;
        row.querySelector('[data-dl]').onclick = () => { downloadBlob(item.blob, `${item.name}.${item.ext}`); item.downloaded = true; };
        row.querySelector('[data-mp3]').onclick = (e) => downloadRecordingMp3(item, e.currentTarget);
        row.querySelector('[data-tl]').onclick = () => downloadBlob(new Blob([item.tracks.map(r => `${formatTime(r.t, false)}  ${r.title}`).join('\n') + '\n'], { type: 'text/plain' }), `${item.name} - tracklist.txt`);
        list.appendChild(row);
    });
}

/* ==========================================================================
   FRAME LOOP
   ========================================================================== */
let lastAssist = 0;
let librarySignature = '';
let afterMixTargets = [];
function tickAfterMixTargets() {
    if (autoMix || !afterMixTargets.length) return;
    const left = afterMixTargets.filter(t => !targetReached(t));
    if (left.length !== afterMixTargets.length || mixTargets !== afterMixTargets) { afterMixTargets = left; setCoachTargets(left); }
}

function frame(nowMs) {
    $('master-clock').innerText = new Date().toTimeString().split(' ')[0];
    if (audioCtx) {
        tickGlides(nowMs);
        tickPitchReturn(nowMs);
        deckList.forEach(d => d.tick(nowMs));
        tickAutoMix();
        tickAfterMixTargets();
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
            const beatIdx = Math.floor((pos - (a.phraseStart ?? a.downbeat)) / a.beatSec + 1e-3);
            const bar = Math.floor(beatIdx / 4) + 1;
            const beat = ((beatIdx % 4) + 4) % 4 + 1;
            $(`deck-${k}-jog-beat`).innerText = pos < (a.phraseStart ?? a.downbeat) - 0.05 ? '-.-' : `${bar}.${beat}`;
            const toOut = Math.ceil((outPoint(deck) - pos) / (4 * a.beatSec));
            const leds = [1, 2, 3, 4].map(i => `<span style="color:${i === beat && deck.isPlaying ? (i === 1 ? '#ef4444' : '#e5e7eb') : '#374151'}">■</span>`).join('');
            // During a mix: the next thing on the mix map, with its countdown
            const map = autoMix && deck === autoMix.out ? mixMap(deck) : null;
            const nextMark = map && map.marks.filter(mk => mk.t > pos + 0.05).sort((x, y) => x.t - y.t)[0];
            const status = nextMark ? `<span style="color:${nextMark.color}">${nextMark.label} en ${Math.max(1, Math.ceil((nextMark.t - pos) / (4 * a.beatSec) - 0.02))} comp.</span>`
                : toOut > 0 ? `OUT en ${toOut} comp.` : pos < a.mixOut + barsToSec(deck, a.mixBars) ? '<span class="text-orange-400">ZONA DE SALIDA</span>' : '';
            $(`deck-${k}-phrase`).innerHTML = `${leds} <span class="ml-1">${status}</span>`;
        }
        if (a && deck.duration) {
            const ring = $(`deck-${k}-jog-ring`);
            const left = (a.musicEnd || deck.duration) - pos;
            ring.style.setProperty('--p', `${clamp(pos / deck.duration, 0, 1) * 360}deg`);
            ring.classList.toggle('ending', deck.isPlaying && left < 30 && left > -5);
        }
        if (deck.isPlaying) deck.jogAngle += 3 * deck.playbackRate;
        $(`deck-${k}-jog-rotor`).style.transform = `rotate(${deck.jogAngle}deg)`;

        drawZoom(deck);
        drawOverview(deck);
        drawVU(deck);
    });
    renderPlanCrossfader();
    if (nowMs - lastAssist > 300) {
        lastAssist = nowMs;
        updateAssistant();
        deckList.forEach(refreshDeckButtons);
        const { live } = liveAndNext();
        const sig = `${live.id}:${live.track ? live.track.id : ''}:${live.pitch.toFixed(3)}:${library.length}`;
        if (sig !== librarySignature) { librarySignature = sig; renderLibrary(); }
        if (audioCtx) tickAutoDJ();
        Profe.tick();
        tickRecorderTracklist();
        if (Recorder.rec) refreshRecButton();
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
    Cue.init();
    Historial.init();
    Stems.init();
    loadLibraryFromStore();
    loadPadSamples();
    requestAnimationFrame(frame);
});
