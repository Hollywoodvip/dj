/* ==========================================================================
   DJ PROFE: a teacher that watches what is playing and tells you what to do
   next (and why), plus "tricks" that run themselves on the beat.
   ========================================================================== */

// What each effect is and when it sounds good
const FX_HELP = {
    echo: 'Repite el sonido al ritmo. Úsalo 1 beat al final de una frase, o para sacar un tema (echo out).',
    reverb: 'Le da eco de sala/espacio. Queda lindo en partes suaves (breakdown) o para que un tema "se aleje".',
    flanger: 'Sonido de avión que sube y baja. Ideal en la subida antes del drop (4–8 compases).',
    phaser: 'Barrido suave que gira. Más sutil que el flanger: partes tranquilas y voces.',
    trans: 'Corta el sonido a ritmo (tartamudeo). Justo antes del drop, 1–2 beats con 1/4.',
    roll: 'Repite un pedacito y al soltar vuelve donde iba el tema. En el último compás antes del drop: 1/2 y luego 1/4.',
};

// Safe zones so an effect adds flavour instead of ruining the track
const FX_LIMITS = {
    echo: { max: 0.7, beats: [0.5, 1], maxBars: 4, tip: 'nivel hasta 70%, 1/2 o 1 beat, pocos compases' },
    reverb: { max: 0.6, beats: [1, 2, 4], maxBars: 16, tip: 'nivel hasta 60%: más que eso lava todo el tema' },
    flanger: { max: 0.7, beats: [2, 4], maxBars: 8, tip: 'nivel hasta 70%, 2 o 4 beats (1/4 suena a robot)' },
    phaser: { max: 0.6, beats: [2, 4], maxBars: 16, tip: 'nivel hasta 60%, 2 o 4 beats, es para ser sutil' },
    trans: { max: 1, beats: [0.25, 0.5], maxBars: 2, tip: '1/4 o 1/2, solo 1–2 compases antes de un drop' },
    roll: { max: 1, beats: [0.25, 0.5, 1], maxBars: 1, tip: 'máximo 1 compás, y suéltalo en el drop' },
};

const GLOSSARY = [
    ['BEAT', 'Cada golpe del ritmo (lo que marcas con el pie). 4 beats = 1 compás.'],
    ['COMPÁS', '4 beats. El contador del jog muestra compás.beat (ej. 12.3).'],
    ['FRASE', '8 compases. La música casi siempre cambia algo al empezar una frase: ahí se mezcla y se meten efectos.'],
    ['INTRO', 'El comienzo del tema, más vacío. Sirve para mezclarlo encima del tema anterior.'],
    ['DROP', 'El momento en que entra toda la fuerza (bajo + batería) después de una parte más suave. La gente salta ahí: prepáralo con una subida (filtro, flanger, roll) y suéltalo justo en el drop.'],
    ['BREAKDOWN', 'Parte suave en medio del tema, sin bajo o sin batería. Buen momento para reverb o phaser; mala para cortar el tema.'],
    ['OUTRO', 'El final del tema, se va vaciando. Es donde entra el siguiente tema.'],
    ['EQ (HI/MID/LOW)', 'Agudos, medios y bajos. En una mezcla nunca dejes dos bajos (LOW) a full a la vez: se "embarran".'],
    ['CROSSFADER', 'Pasa el sonido de un deck al otro. Al centro suenan los dos.'],
    ['SYNC', 'Iguala el tempo del deck con el otro y cuadra los beats.'],
];

const Profe = (() => {
    let enabled = true;
    let current = null;           // tip on screen
    let shownAt = 0;
    const dismissed = {};         // tip id -> until (ms)
    let targets = [];             // controls highlighted by "Muéstrame"
    let lastEqTouch = { a: 0, b: 0 };
    let fxOnSince = { a: null, b: null };
    let tipIndex = 0;
    // CONSEJOS = tips only · GUIADO = arms guided mixes by itself · AUTOMÁTICO = mixes by itself
    let mode = 'tips';
    let armedKey = null;
    const refused = new Set();
    const doneDrops = new Set();
    let autoTrickCount = 0;
    let lastAutoTrickPos = { a: -Infinity, b: -Infinity };

    /* ---------------- musical context ---------------- */
    const trackTime = (deck) => (deck.slip ? deck.slip.pos : deck.getCurrentTime());

    function context(deck) {
        const a = deck.analysis;
        const pos = trackTime(deck);
        const bar = 4 * a.beatSec;
        const drops = [];
        if (a.introEnd - a.mixIn >= 4 * bar) drops.push(a.introEnd);
        a.breakdowns.forEach(b => drops.push(b.end));
        const nextDrop = drops.filter(t => t > pos + 0.05).sort((x, y) => x - y)[0];
        const breakdown = a.breakdowns.find(b => pos >= b.start && pos < b.end);
        const section = pos < a.introEnd ? 'intro' : breakdown ? 'breakdown' : pos >= a.outroStart ? 'outro' : 'main';
        const barsIn = (pos - a.downbeat) / bar;
        const phraseLeft = 8 - (((barsIn % 8) + 8) % 8);
        return {
            pos, bar, section, breakdown,
            nextDrop, barsToDrop: nextDrop ? (nextDrop - pos) / bar : Infinity,
            barsToOut: (outPoint(deck) - pos) / bar,
            phraseLeft,                                   // bars to the end of the 8-bar phrase
            phraseEnd: pos + phraseLeft * bar,
        };
    }

    const barsText = (b) => (b < 1 ? `${Math.max(1, Math.round(b * 4))} beat(s)` : (Math.ceil(b) === 1 ? '1 compás' : `${Math.ceil(b)} compases`));
    const realMs = (deck, trackSeconds) => trackSeconds / deck.playbackRate * 1000;

    /* ---------------- tricks: timed actions on the beat ---------------- */
    function fxOn(deck, type, beats, level) {
        deck.fx.setType(type);
        deck.fx.setBeats(beats);
        setControl(`deck-${deck.key}-fx-level`, level);
        deck.fx.setOn(true);
        refreshFxUI(deck);
    }
    function fxOff(deck) {
        if (deck.fx.on) deck.fx.setOn(false);
        refreshFxUI(deck);
    }

    const TRICKS = {
        filter_build: {
            label: 'Subida con FILTRO', icon: 'fa-sliders',
            how: 'sube el FILTER (hacia la derecha, high-pass) durante los últimos 4 compases y suéltalo a 0 justo en el drop',
            minBars: 1,
            events(deck, ctx) {
                const id = `deck-${deck.key}-filter`;
                const start = Math.max(ctx.pos, ctx.nextDrop - 4 * ctx.bar);
                return [
                    [start, () => glideControl(id, 65, realMs(deck, ctx.nextDrop - start - 0.05))],
                    [ctx.nextDrop - 0.03, () => glideControl(id, 0, 0)],
                ];
            },
            show: (deck) => [{ id: `deck-${deck.key}-filter`, label: 'SUBE → y SUELTA en el drop' }],
        },
        roll_drop: {
            label: 'ROLL al drop', icon: 'fa-repeat',
            how: 'en el último compás antes del drop mantén FX ON con ROLL 1/2, cambia a 1/4 en los últimos 2 beats y suelta en el drop',
            minBars: 0.3,
            events(deck, ctx) {
                const b = deck.beatSec;
                const start = Math.max(ctx.pos, ctx.nextDrop - 4 * b);
                return [
                    [start, () => fxOn(deck, 'roll', 0.5, 0.6)],
                    [Math.max(start + 0.01, ctx.nextDrop - 2 * b), () => { deck.fx.setBeats(0.25); refreshFxUI(deck); }],
                    [ctx.nextDrop - 0.02, () => fxOff(deck)],
                ];
            },
            prepare: (deck) => { deck.fx.setType('roll'); deck.fx.setBeats(0.5); refreshFxUI(deck); },
            show: (deck) => [{ id: `deck-${deck.key}-fx-on`, label: 'MANTÉN 1 compás antes' }],
        },
        flanger_build: {
            label: 'FLANGER en la subida', icon: 'fa-plane',
            how: 'prende el FLANGER (4 beats) unos 8 compases antes del drop y apágalo justo en el drop',
            minBars: 2,
            events(deck, ctx) {
                const start = Math.max(ctx.pos, ctx.nextDrop - 8 * ctx.bar);
                return [
                    [start, () => fxOn(deck, 'flanger', 4, 0.6)],
                    [ctx.nextDrop - 0.02, () => fxOff(deck)],
                ];
            },
            prepare: (deck) => { deck.fx.setType('flanger'); deck.fx.setBeats(4); refreshFxUI(deck); },
            show: (deck) => [{ id: `deck-${deck.key}-fx-on`, label: 'ON y OFF en el drop' }],
        },
        trans_drop: {
            label: 'TRANS antes del drop', icon: 'fa-scissors',
            how: 'mantén FX ON con TRANS 1/4 solo los últimos 2 beats antes del drop',
            minBars: 0.6,
            events(deck, ctx) {
                const start = Math.max(ctx.pos, ctx.nextDrop - 2 * deck.beatSec);
                return [
                    [start, () => fxOn(deck, 'trans', 0.25, 0.9)],
                    [ctx.nextDrop - 0.02, () => fxOff(deck)],
                ];
            },
            prepare: (deck) => { deck.fx.setType('trans'); deck.fx.setBeats(0.25); refreshFxUI(deck); },
            show: (deck) => [{ id: `deck-${deck.key}-fx-on`, label: 'MANTÉN 2 beats' }],
        },
        echo_phrase: {
            label: 'ECHO fin de frase', icon: 'fa-wave-square',
            how: 'toca ECHO 1/2 en el último beat de la frase (el eco rellena el cambio)',
            minBars: 0.3,
            events(deck, ctx) {
                const b = deck.beatSec;
                const start = Math.max(ctx.pos, ctx.phraseEnd - b);
                return [
                    [start, () => fxOn(deck, 'echo', 0.5, 0.55)],
                    [ctx.phraseEnd, () => fxOff(deck)],
                ];
            },
            prepare: (deck) => { deck.fx.setType('echo'); deck.fx.setBeats(0.5); refreshFxUI(deck); },
            show: (deck) => [{ id: `deck-${deck.key}-fx-on`, label: 'TOCA en el último beat' }],
        },
        reverb_space: {
            label: 'REVERB en el breakdown', icon: 'fa-cloud',
            how: 'prende REVERB (2 beats, nivel bajo) durante el breakdown y apágalo antes del drop',
            minBars: 1,
            events(deck, ctx) {
                const end = ctx.breakdown ? Math.min(ctx.breakdown.end - deck.beatSec, ctx.pos + 16 * ctx.bar) : ctx.pos + 8 * ctx.bar;
                return [
                    [ctx.pos, () => fxOn(deck, 'reverb', 2, 0.4)],
                    [end, () => fxOff(deck)],
                ];
            },
            prepare: (deck) => { deck.fx.setType('reverb'); deck.fx.setBeats(2); refreshFxUI(deck); },
            show: (deck) => [{ id: `deck-${deck.key}-fx-on`, label: 'ON ahora, OFF antes del drop' }],
        },
    };

    function runTrick(name, deck) {
        const ctx = context(deck);
        const trick = TRICKS[name];
        const events = trick.events(deck, ctx).map(([t, fn]) => ({ t, fn, done: false }));
        deck.trick = { name, label: trick.label, events };
        toast(`PROFE: ${trick.label} programado ✓`, 'ok');
        render(true);
    }

    function tickTricks() {
        deckList.forEach(deck => {
            const tr = deck.trick;
            if (!tr) return;
            if (!deck.isPlaying) { fxOff(deck); deck.trick = null; return; }
            const pos = trackTime(deck);
            tr.events.forEach(e => { if (!e.done && pos >= e.t) { e.done = true; e.fn(); } });
            if (tr.events.every(e => e.done)) deck.trick = null;
        });
    }

    /* ---------------- tips ---------------- */
    function eqNeutral(deck) {
        const k = deck.key;
        return ['low', 'mid', 'high'].every(b => Math.abs(+$(`deck-${k}-eq-${b}`).value) < 0.6)
            && Math.abs(+$(`deck-${k}-filter`).value) < 3;
    }

    function trickActions(deck, names, ctx) {
        const acts = [];
        names.filter(n => ctx.barsToDrop >= TRICKS[n].minBars || n === 'echo_phrase' || n === 'reverb_space').forEach(n => {
            const t = TRICKS[n];
            acts.push({ label: t.label, icon: t.icon, kind: 'auto', run: () => runTrick(n, deck) });
        });
        const first = names.find(n => TRICKS[n].show);
        if (first) {
            acts.push({
                label: 'Enséñame a hacerlo yo', icon: 'fa-hand-pointer', kind: 'show',
                run: () => {
                    if (TRICKS[first].prepare) TRICKS[first].prepare(deck);
                    targets = TRICKS[first].show(deck);
                    applyHighlights();
                    toast(`Tú: ${TRICKS[first].how}`, 'info');
                },
            });
        }
        return acts;
    }

    function collectTips() {
        const tips = [];
        const add = (tip) => { if (!(dismissed[tip.id] > performance.now())) tips.push(tip); };
        const { live, next } = liveAndNext();

        if (!audioCtx || !live.analysis) {
            add({ id: 'start', p: 100, icon: 'fa-power-off', title: 'Empecemos',
                text: 'Carga un tema (pega un link de YouTube o arrastra un archivo) y dale PLAY con la tecla S (Deck A) o L (Deck B).' });
            return tips;
        }

        // Guided mix: the profe repeats what to do right now
        if (autoMix && autoMix.mode === 'guide') {
            const pending = autoMix.plan.steps.filter(s => s.fired && s.pending && s.pending.length).slice(-1)[0];
            const nextStep = autoMix.plan.steps.find(s => !s.fired);
            if (pending) add({ id: 'guide-now', p: 99, icon: 'fa-hand-point-right', title: autoMix.waiting ? 'Te espero' : 'AHORA',
                text: pending.text + '. Haz clic en lo que brilla en verde (o Espacio).' + (autoMix.waiting ? ' El plan no avanza hasta que lo hagas.' : '') });
            else if (nextStep) add({ id: 'guide-next', p: 98, icon: 'fa-hourglass-half', title: 'Lo que viene', text: nextStep.text + '.',
                when: () => { const b = nextStep.at - mixBarPosition(autoMix); return b > 0 ? `en ${barsText(b)}` : ''; } });
        } else if (autoMix) {
            add({ id: 'auto-running', p: 60, icon: 'fa-shuffle', title: 'Auto mix en curso', text: 'Mira el PLAN abajo: así se ve una mezcla profesional paso a paso.' });
        }

        // Right after a mix: how everything should be left
        if (!autoMix && lastMixDone && performance.now() - lastMixDone.at < 15000) {
            const { out, in: inc } = lastMixDone;
            add({ id: `after-mix-${Math.round(lastMixDone.at)}`, p: 96, icon: 'fa-flag-checkered', title: '¡Mezcla lista!',
                text: `Así queda: Deck ${out.id} en pausa con sus perillas en 0, crossfader del lado ${inc.id}. Ahora suena el ${inc.id} (su pitch vuelve a 0% de a poco). Siguiente paso: carga otro tema en el ${out.id}.`,
                actions: [{ label: 'Poner todo en 0', icon: 'fa-rotate-left', kind: 'auto', run: () => { resetChannel(out); resetChannel(inc); } }] });
        }

        if (!live.isPlaying) {
            add({ id: 'play', p: 97, icon: 'fa-play', title: 'Dale play', text: `Dale PLAY al Deck ${live.id} (${live === decks.a ? 'tecla S' : 'tecla L'}).` });
            return tips;
        }

        // Clipping
        if (deckList.some(d => d.vuLevel > 0.985)) {
            add({ id: 'clip', p: 95, icon: 'fa-volume-high', title: 'Suena saturado',
                text: 'El medidor está tocando el rojo: baja un poco el volumen del canal o el MASTER para que no se distorsione.' });
        }

        const ctx = context(live);
        const L = live.id;

        // Mix timing
        if (!autoMix && mode === 'tips' && next.analysis && ctx.barsToOut <= 8 && ctx.barsToOut > -4) {
            add({ id: 'mix-now', p: 90, icon: 'fa-shuffle', title: '¡Momento de mezclar!',
                text: `El Deck ${L} está llegando a su salida${resolvedPace(live) === 'fast' ? ' (ritmo rápido: termina un coro, la gente ya escuchó lo mejor)' : ''}. Presiona GUIADO (T) y yo te voy diciendo qué mover, o AUTO MIX (Enter) para verlo hecho.`,
                when: () => `salida en ${barsText(Math.max(0, context(live).barsToOut))}`,
                actions: [
                    { label: 'Mezcla GUIADA', icon: 'fa-graduation-cap', kind: 'show', run: () => startAutoMix(false, 'guide') },
                    { label: 'Hazlo por mí', icon: 'fa-shuffle', kind: 'auto', run: () => startAutoMix(false) },
                ] });
        }
        if (!autoMix && !next.analysis && ctx.barsToOut < 32) {
            const pick = typeof pickNextTrack === 'function' ? pickNextTrack(live) : null;
            add({ id: 'load-next', p: 88, icon: 'fa-folder-open', title: 'Prepara el próximo tema',
                text: pick ? `Quedan pocos compases del ${L}. Te recomiendo "${pick.title}" (es el que mejor combina).`
                    : `Quedan pocos compases del ${L}: extrae otro tema de YouTube y cárgalo en el Deck ${next.id}.`,
                when: () => `salida en ${barsText(Math.max(0, context(live).barsToOut))}`,
                actions: pick ? [{ label: `Cargar en Deck ${next.id}`, icon: 'fa-download', kind: 'auto', run: () => loadEntryToDeck(pick, next) }] : [] });
        }
        if (!autoMix && next.analysis && !next.isPlaying && ctx.barsToOut < 24 && ctx.barsToOut > 8
            && Math.abs(next.getCurrentTime() - planTransition(live, next).inStart) > 0.2) {
            add({ id: 'prep', p: 80, icon: 'fa-crosshairs', title: 'Deja listo el otro deck',
                text: `Presiona PREPARAR (G): pone el Deck ${next.id} en su punto de entrada y le iguala el tempo, así cuando llegue el momento solo mezclas.`,
                actions: [{ label: 'Preparar', icon: 'fa-crosshairs', kind: 'auto', run: prepareNext }] });
        }

        // Two decks at different tempos
        if (!autoMix && decks.a.isPlaying && decks.b.isPlaying && !decks.a.syncOn && !decks.b.syncOn
            && Math.abs(decks.a.effectiveBpm - decks.b.effectiveBpm) > 0.3 && tempoRatio(next, live)) {
            add({ id: 'sync', p: 85, icon: 'fa-rotate', title: 'Los beats se van a galopar',
                text: `Los dos decks suenan a distinto tempo (${decks.a.effectiveBpm.toFixed(1)} vs ${decks.b.effectiveBpm.toFixed(1)}). Presiona SYNC en el Deck ${next.id} (${next === decks.b ? 'K' : 'D'}).`,
                actions: [{ label: `SYNC Deck ${next.id}`, icon: 'fa-rotate', kind: 'auto', run: () => toggleSync(next) }] });
        }

        // Drop coming
        if (ctx.nextDrop && ctx.barsToDrop <= 8 && ctx.barsToDrop > 0.3 && !live.trick && (ctx.section === 'intro' || ctx.section === 'breakdown')) {
            const names = ctx.barsToDrop >= 4 ? ['filter_build', 'flanger_build', 'roll_drop'] : ctx.barsToDrop >= 1 ? ['roll_drop', 'filter_build', 'trans_drop'] : ['trans_drop', 'roll_drop'];
            add({ id: `drop-${Math.round(ctx.nextDrop)}`, p: 78, icon: 'fa-bolt', title: '¡Se viene el DROP!',
                text: 'El drop es cuando entra toda la fuerza del tema (bajo + batería). Prepáralo con una "subida" y suéltala justo en el drop: es lo que hace saltar a la gente.',
                when: () => `drop en ${barsText(context(live).barsToDrop)}`,
                actions: trickActions(live, names, ctx) });
        }

        // Knobs left out of place
        if (!autoMix && !eqNeutral(live) && performance.now() - lastEqTouch[live.key] > 6000) {
            add({ id: `eq-${live.key}`, p: 70, icon: 'fa-sliders', title: 'Perillas fuera de 0',
                text: `Las perillas del Deck ${L} no están en 0. Si no estás mezclando ni haciendo un efecto, déjalas en 0 para que el tema suene como fue grabado.`,
                actions: [{ label: 'Poner en 0', icon: 'fa-rotate-left', kind: 'auto', run: () => resetChannel(live) }] });
        }

        // Effect left on too long
        const since = fxOnSince[live.key];
        if (live.fx.on && since && (performance.now() - since) / 1000 > 8 * 4 * live.beatSec / live.playbackRate && !live.trick) {
            add({ id: `fx-long-${live.key}`, p: 68, icon: 'fa-power-off', title: 'Apaga el efecto',
                text: `Llevas más de 8 compases con ${FX_LABELS[live.fx.type]}. Los efectos suenan mejor en dosis cortas: prende, suelta.`,
                actions: [{ label: 'Apagar FX', icon: 'fa-power-off', kind: 'auto', run: () => fxOff(live) }] });
        }

        if (ctx.section === 'breakdown' && !live.trick && !live.fx.on) {
            add({ id: `bd-${Math.round(ctx.breakdown.start)}`, p: 55, icon: 'fa-cloud', title: 'Estás en un BREAKDOWN',
                text: 'Parte suave del tema (se va el bajo o la batería). Queda lindo un REVERB o PHASER suave. No cortes el tema aquí: después viene un drop.',
                when: () => (context(live).nextDrop ? `drop en ${barsText(context(live).barsToDrop)}` : ''),
                actions: trickActions(live, ['reverb_space'], ctx) });
        }

        if (ctx.section === 'main' && ctx.phraseLeft <= 1.5 && ctx.phraseLeft > 0.3 && !live.trick && !live.fx.on) {
            add({ id: `phrase-${Math.round(ctx.phraseEnd)}`, p: 50, icon: 'fa-wave-square', title: 'Termina una frase',
                text: 'Cada 8 compases la música cambia algo (frase). Un ECHO de 1 beat justo al final de la frase suena muy profesional.',
                when: () => `fin de frase en ${barsText(context(live).phraseLeft)}`,
                actions: trickActions(live, ['echo_phrase'], ctx) });
        }

        const sectionText = {
            intro: 'Estás en la INTRO: la parte más vacía del tema. Es la que se mezcla encima del tema anterior.',
            main: 'Parte principal: deja que suene. Los efectos van al final de cada frase de 8 compases, no todo el rato.',
            outro: 'Estás en el OUTRO: el tema se va vaciando. Es el momento de meter el siguiente.',
            breakdown: 'Breakdown: parte suave antes de otro drop.',
        };
        add({ id: `section-${ctx.section}`, p: 30, icon: 'fa-location-dot', title: `Sección: ${ctx.section.toUpperCase()}`, text: sectionText[ctx.section],
            when: () => { const c = context(live); return c.barsToOut > 0 ? `salida en ${barsText(c.barsToOut)}` : ''; } });

        const [term, def] = GLOSSARY[tipIndex % GLOSSARY.length];
        add({ id: `learn-${term}`, p: 10, icon: 'fa-book', title: `¿Qué es ${term}?`, text: def });
        return tips;
    }

    /* ---------------- live review of what you are doing ---------------- */
    const since = { loop: { a: null, b: null }, filter: { a: null, b: null } };
    const bars = (deck, ms) => ms / 1000 / (4 * deck.beatSec / deck.playbackRate);

    function xfGain(deck) {
        const x = +$('crossfader').value;
        return deck === decks.a ? Math.cos((x + 1) * 0.25 * Math.PI) : Math.sin((x + 1) * 0.25 * Math.PI);
    }
    const audible = (d) => d.isPlaying && d.analysis && xfGain(d) > 0.15 && +$(`deck-${d.key}-volume`).value > 0.05;
    const val = (id) => +$(id).value;

    function liveChecks() {
        const out = [];
        const now = performance.now();
        const add = (level, text, why, fix) => out.push({ level, text, why, fix });
        const set = (id, value) => ({ targets: [{ id, value }] });
        const on = deckList.filter(audible);
        if (!on.length) return out;

        deckList.forEach(d => {
            const k = d.key;
            since.loop[k] = d.loop.active && !d.slip ? (since.loop[k] || now) : null;
            since.filter[k] = Math.abs(val(`deck-${k}-filter`)) > 5 ? (since.filter[k] || now) : null;
        });

        on.forEach(d => {
            const k = d.key, D = d.id;
            // Effects inside their safe zone
            if (d.fx.on) {
                const lim = FX_LIMITS[d.fx.type];
                const name = FX_LABELS[d.fx.type];
                if (d.fx.level > lim.max + 0.02) add('warn', `${name} ${D} muy fuerte (${Math.round(d.fx.level * 100)}%)`, `Zona segura: ${lim.tip}.`, set(`deck-${k}-fx-level`, lim.max));
                else if (!lim.beats.includes(d.fx.beats)) add('warn', `${name} ${D} en ${beatLabel(d.fx.beats)}`, `Para ${name} lo que suena bien es ${lim.beats.map(beatLabel).join(' o ')}.`, { run: () => { d.fx.setBeats(lim.beats[lim.beats.length - 1]); refreshFxUI(d); } });
                else add('ok', `${name} ${D} en zona segura`, lim.tip);
            }
            // Loop left running
            if (since.loop[k] && bars(d, now - since.loop[k]) > 8) add('warn', `Loop del ${D} hace ${Math.round(bars(d, now - since.loop[k]))} comp.`, 'Un loop sirve para alargar una parte unos compases; si lo dejas mucho la gente siente que el tema se pegó.', { run: () => { d.exitLoop(); refreshDeckButtons(d); } });
            // Filter parked
            if (since.filter[k] && !autoMix && !d.trick && bars(d, now - since.filter[k]) > 8) add('warn', `FILTER del ${D} puesto hace rato`, 'El filtro es para una subida o una salida, no para dejarlo: el tema suena apagado o flaco.', set(`deck-${k}-filter`, 0));
            // EQ boosts
            ['low', 'mid', 'high'].forEach(b => {
                if (val(`deck-${k}-eq-${b}`) > 2.5) add('warn', `${b.toUpperCase()} del ${D} sobre 0`, 'Subir el EQ sobre 0 satura. Los DJs casi nunca suben: bajan lo que sobra.', set(`deck-${k}-eq-${b}`, 0));
            });
            // Pitch too far
            if (Math.abs(d.pitch - 1) > 0.06 && !d.pitchReturn) add('warn', `Pitch del ${D} en ${((d.pitch - 1) * 100).toFixed(1)}%`, 'Más de ±6% cambia notoriamente la voz (ardilla o monstruo). Lo devuelvo a 0 de a poco para que nadie lo note.', { run: () => startPitchReturn(d, 8) });
            else if (d.pitchReturn) add('ok', `Pitch del ${D} volviendo a 0`, 'Después de mezclar, el tempo vuelve de a poco a la velocidad original del tema.');
            // Only playing deck sounding dull
            if (on.length === 1 && !autoMix && (val(`deck-${k}-eq-mid`) < -12 || val(`deck-${k}-eq-high`) < -12 || val(`deck-${k}-eq-low`) < -12)) {
                add('warn', `EQ del ${D} muy cortado`, 'Es el único tema sonando: con tanto corte se escucha apagado. Vuelve las perillas a 0.', { run: () => resetChannel(d) });
            }
        });

        if (on.length === 2) {
            // Two basslines at once
            const lows = on.map(d => val(`deck-${d.key}-eq-low`));
            if (lows.every(v => v > -8)) {
                const quieter = xfGain(decks.a) < xfGain(decks.b) ? decks.a : decks.b;
                add('bad', 'Dos bajos sonando juntos', 'Los bajos de dos temas juntos chocan y se "embarran". Deja el LOW de uno en −26 hasta el cambio de bajos.', set(`deck-${quieter.key}-eq-low`, -26));
            } else add('ok', 'Bajos: solo uno a la vez', 'Así se escucha limpio.');
            // Beats aligned?
            const [a, b] = on;
            if (a.analysis && b.analysis && tempoRatio(b, a)) {
                const diff = Math.abs(a.effectiveBpm - b.effectiveBpm * (b.syncFactor || 1));
                let phase = (a.beatPosition() - b.beatPosition()) % 1;
                if (phase < 0) phase += 1;
                const off = Math.min(phase, 1 - phase);
                if (diff > 0.3 || off > 0.12) add('bad', 'Beats descuadrados', 'Los golpes de los dos temas no caen juntos (suena a "galope"). Presiona SYNC en el que entra.', { run: () => { const n = liveAndNext().next; if (!n.syncOn) toggleSync(n); else alignPhase(n, otherDeck(n)); } });
                else add('ok', 'Beats cuadrados', 'Los golpes de los dos temas caen juntos.');
            }
        }

        // Crossfader pointing at a deck that isn't playing
        const x = +$('crossfader').value;
        const side = x > 0.6 ? decks.b : x < -0.6 ? decks.a : null;
        if (side && !side.isPlaying && otherDeck(side).isPlaying) add('bad', `Crossfader en ${side.id} pero ${side.id} no suena`, 'Casi no se escucha nada: lleva el crossfader hacia el deck que está sonando.', set('crossfader', side === decks.a ? 1 : -1));
        return out;
    }

    let checksSig = '';
    function renderChecks() {
        const box = $('profe-checks');
        if (!box) return;
        const checks = enabled && audioCtx ? liveChecks() : [];
        const sig = checks.map(c => c.level + c.text).join('|');
        if (sig === checksSig) return;
        checksSig = sig;
        box.innerHTML = '';
        box.classList.toggle('hidden', !checks.length);
        if (!checks.length) return;
        const label = document.createElement('span');
        label.className = 'text-[10px] font-bold text-gray-400 tracking-wider mr-1';
        label.textContent = 'TU MEZCLA:';
        box.appendChild(label);
        const order = { bad: 0, warn: 1, ok: 2 };
        checks.sort((x, y) => order[x.level] - order[y.level]).forEach(c => {
            const el = document.createElement(c.fix ? 'button' : 'span');
            const styles = {
                ok: 'border-emerald-700/60 text-emerald-300 bg-emerald-950/40',
                warn: 'border-amber-500/70 text-amber-200 bg-amber-950/50 hover:bg-amber-900/60',
                bad: 'border-rose-500/80 text-rose-200 bg-rose-950/60 hover:bg-rose-900/60',
            };
            const icons = { ok: 'fa-circle-check', warn: 'fa-triangle-exclamation', bad: 'fa-circle-xmark' };
            el.className = `px-2 py-0.5 rounded-full border text-[11px] font-bold flex items-center gap-1 ${styles[c.level]}`;
            el.title = c.why + (c.fix ? ' (clic para arreglarlo)' : '');
            el.innerHTML = `<i class="fa-solid ${icons[c.level]}"></i><span></span>${c.fix ? '<span class="font-normal opacity-70 ml-1">· arreglar</span>' : ''}`;
            el.querySelector('span').textContent = c.text;
            if (c.fix) el.addEventListener('click', () => {
                ensureAudio();
                if (c.fix.targets) c.fix.targets.forEach(t => glideControl(t.id, t.value, 350));
                if (c.fix.run) c.fix.run();
                toast(`Arreglado: ${c.why}`, 'ok');
                checksSig = '';
            });
            box.appendChild(el);
        });
    }

    /* ---------------- rendering ---------------- */
    function render(force = false) {
        const el = $('profe');
        if (!el) return;
        el.classList.toggle('opacity-60', !enabled);
        $('profe-toggle').textContent = enabled ? 'PROFE: ON' : 'PROFE: OFF';
        if (!enabled) {
            $('profe-title').textContent = 'Apagado';
            $('profe-text').textContent = 'Préndelo para que te vaya diciendo qué hacer.';
            $('profe-when').textContent = '';
            $('profe-actions').innerHTML = '';
            return;
        }
        const tips = collectTips().sort((x, y) => y.p - x.p);
        let tip = tips[0];
        // Keep the current tip a few seconds unless something more important shows up
        const keep = current && tips.find(t => t.id === current.id);
        // (urgent tips, like the guided mix steps, always show right away)
        if (keep && tip.id !== current.id && tip.p < 95 && tip.p < current.p + 25 && performance.now() - shownAt < 9000) tip = keep;
        if (!tip) return;
        const changed = force || !current || tip.id !== current.id;
        current = tip;
        if (changed) {
            shownAt = performance.now();
            if (targets.length) { targets = []; applyHighlights(); }
            $('profe-icon').className = `fa-solid ${tip.icon} text-amber-300 text-xl`;
            $('profe-title').textContent = tip.title;
            $('profe-text').textContent = tip.text;
            const box = $('profe-actions');
            box.innerHTML = '';
            (tip.actions || []).forEach(a => {
                const b = document.createElement('button');
                b.className = `px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${a.kind === 'show'
                    ? 'border-emerald-500/60 text-emerald-200 bg-emerald-950/50 hover:bg-emerald-900/60'
                    : 'border-amber-500/60 text-amber-100 bg-amber-950/50 hover:bg-amber-900/60'}`;
                b.innerHTML = `<i class="fa-solid ${a.icon}"></i> <span></span>`;
                b.querySelector('span').textContent = a.label;
                b.addEventListener('click', () => { ensureAudio(); a.run(); });
                box.appendChild(b);
            });
        } else {
            $('profe-text').textContent = tip.text;
        }
        const active = deckList.find(d => d.trick);
        $('profe-when').textContent = active ? `▶ ${active.trick.label} en el Deck ${active.id}` : tip.when ? tip.when() : '';
    }

    const pairKey = (live, next) => `${live.key}:${live.track ? live.track.title : ''}>${next.track ? next.track.title : ''}`;

    // GUIADO / AUTOMÁTICO: arm the mix by itself about 32 bars before the out point
    function autoArm() {
        if (mode === 'tips' || autoMix || !audioCtx) return;
        const { live, next } = liveAndNext();
        if (!live.isPlaying || !live.analysis || !next.analysis || next.isPlaying) return;
        if (next.track && next.track.played) return;
        const key = pairKey(live, next);
        if (refused.has(key)) return;
        const ctx = context(live);
        if (ctx.barsToOut > 32 || ctx.barsToOut < -16) return;
        armedKey = key;
        startAutoMix(false, mode === 'guide' ? 'guide' : 'auto');
    }

    // AUTOMÁTICO: tasteful effects into drops (not every drop, never right before a mix)
    function autoTricks() {
        if (mode !== 'auto' || autoMix) return;
        const { live } = liveAndNext();
        if (!live.isPlaying || !live.analysis || live.trick || live.fx.on || !audible(live)) return;
        const ctx = context(live);
        if (!ctx.nextDrop || ctx.barsToDrop > 4.1 || ctx.barsToDrop < 1 || ctx.barsToOut < 12) return;
        const dropKey = `${live.key}:${live.track ? live.track.title : ''}:${Math.round(ctx.nextDrop)}`;
        if (doneDrops.has(dropKey)) return;
        doneDrops.add(dropKey);
        if (ctx.pos - lastAutoTrickPos[live.key] < 32 * ctx.bar) return;
        lastAutoTrickPos[live.key] = ctx.pos;
        const names = ctx.section === 'intro' ? ['filter_build', 'roll_drop'] : ['roll_drop', 'filter_build', 'trans_drop'];
        runTrick(names[autoTrickCount++ % names.length], live);
    }

    function setMode(m) {
        mode = m;
        try { localStorage.setItem('webdj-profe-mode', m); } catch (e) {}
        document.querySelectorAll('[data-profemode]').forEach(b => b.classList.toggle('mini-btn-on', b.dataset.profemode === m));
        const msg = {
            tips: 'Modo CONSEJOS: te digo qué hacer, tú decides.',
            guide: 'Modo GUIADO: cuando llegue el momento te armo la mezcla y te ilumino lo que tienes que mover.',
            auto: 'Modo AUTOMÁTICO: yo mezclo en el momento justo y le pongo efectos a los drops. Tú disfruta.',
        }[m];
        toast(msg, 'ok');
        render(true);
    }

    function tick() {
        deckList.forEach(d => {
            if (d.fx && d.fx.on && !fxOnSince[d.key]) fxOnSince[d.key] = performance.now();
            if (d.fx && !d.fx.on) fxOnSince[d.key] = null;
        });
        render();
        renderChecks();
        if (enabled) { autoArm(); autoTricks(); }
    }

    function init() {
        try { enabled = localStorage.getItem('webdj-profe') !== '0'; } catch (e) {}
        $('profe-toggle').addEventListener('click', () => {
            enabled = !enabled;
            try { localStorage.setItem('webdj-profe', enabled ? '1' : '0'); } catch (e) {}
            render(true);
        });
        try { mode = localStorage.getItem('webdj-profe-mode') || 'tips'; } catch (e) {}
        document.querySelectorAll('[data-profemode]').forEach(b => {
            b.classList.toggle('mini-btn-on', b.dataset.profemode === mode);
            b.addEventListener('click', () => setMode(b.dataset.profemode));
        });
        $('profe-next').addEventListener('click', () => {
            if (current) dismissed[current.id] = performance.now() + 30000;
            tipIndex++;
            render(true);
        });
        deckList.forEach(d => ['low', 'mid', 'high'].concat(['filter']).forEach(b => {
            const id = b === 'filter' ? `deck-${d.key}-filter` : `deck-${d.key}-eq-${b}`;
            $(id).addEventListener('input', () => { lastEqTouch[d.key] = performance.now(); });
        }));
        render(true);
    }

    return {
        init, tick, tickTricks, render,
        targets: () => targets, clearTargets: () => { targets = []; },
        mode: () => (enabled ? mode : 'off'),
        // A mix you cancelled is not re-armed for the same pair of tracks
        onCancel: () => { if (armedKey) refused.add(armedKey); armedKey = null; },
    };
})();
