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
            barsToOut: (a.mixOut - pos) / bar,
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
            if (pending) add({ id: 'guide-now', p: 99, icon: 'fa-hand-point-right', title: 'AHORA', text: pending.text + '. Mueve lo que brilla en verde.' });
            else if (nextStep) add({ id: 'guide-next', p: 98, icon: 'fa-hourglass-half', title: 'Lo que viene', text: nextStep.text + '.',
                when: () => { const b = nextStep.at - mixBarPosition(autoMix); return b > 0 ? `en ${barsText(b)}` : ''; } });
        } else if (autoMix) {
            add({ id: 'auto-running', p: 60, icon: 'fa-shuffle', title: 'Auto mix en curso', text: 'Mira el PLAN abajo: así se ve una mezcla profesional paso a paso.' });
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
        if (!autoMix && next.analysis && ctx.barsToOut <= 8 && ctx.barsToOut > -4) {
            add({ id: 'mix-now', p: 90, icon: 'fa-shuffle', title: '¡Momento de mezclar!',
                text: `El Deck ${L} está llegando a su salida. Presiona GUIADO (T) y yo te voy diciendo qué mover, o AUTO MIX (Enter) para verlo hecho.`,
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
        if (keep && tip.id !== current.id && tip.p < current.p + 15 && performance.now() - shownAt < 5000) tip = keep;
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

    function tick() {
        deckList.forEach(d => {
            if (d.fx && d.fx.on && !fxOnSince[d.key]) fxOnSince[d.key] = performance.now();
            if (d.fx && !d.fx.on) fxOnSince[d.key] = null;
        });
        render();
    }

    function init() {
        try { enabled = localStorage.getItem('webdj-profe') !== '0'; } catch (e) {}
        $('profe-toggle').addEventListener('click', () => {
            enabled = !enabled;
            try { localStorage.setItem('webdj-profe', enabled ? '1' : '0'); } catch (e) {}
            render(true);
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

    return { init, tick, tickTricks, render, targets: () => targets, clearTargets: () => { targets = []; } };
})();
