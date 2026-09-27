/* ==========================================================================
   HISTORIAL: what the app learns from your real sessions, without any audio.
   - Every track's analysis (BPM, key, drop, breaks, energy per bar) and your
     corrections (½ / ×2 / TAP, hot cues).
   - Every mix: the profe's plan, when you came in, how the volume moved, and
     your 👍 / 👎.
   "COMPARTIR HISTORIAL" sends it to server.py, which saves it in historial/ and
   publishes it on the repo's `historial` branch so the developer can study it.
   ========================================================================== */
const Historial = (() => {
    const KEY = 'webdj-mixlog';
    const MAX = 400;
    const r3 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 1000) / 1000 : v);

    function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
    function store(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (e) {} }

    const trackInfo = (d) => (d && d.track ? {
        title: d.track.title || '', artist: d.track.artist || '', url: d.track.url || null,
        bpm: r3(d.bpm), key: d.analysis && d.analysis.key ? d.analysis.key.camelot : null,
    } : null);

    // A mix starts being recorded when the profe arms it
    function mixStarted(m) {
        m.log = {
            at: new Date().toISOString(), mode: m.mode,
            out: trackInfo(m.out), in: trackInfo(m.in),
            plan: {
                style: m.plan.style, pace: m.plan.pace, bars: m.plan.bars, synced: m.plan.synced, rate: r3(m.plan.rate),
                dropAtEnd: m.plan.dropAtEnd, useDrop: m.plan.useDrop, bassOnDrop: !!m.plan.bassOnDrop,
                introLoop: !!m.plan.introLoop, idealOutPos: r3(m.plan.target), inStart: r3(m.plan.inStart), reason: m.plan.reason,
            },
            startedBarsFromIdeal: null, levelMinDb: null, levelMaxDb: null, warnings: [],
        };
    }
    // You pressed PLAY: how many bars before (+) or after (−) the ideal moment
    function mixCameIn(m) {
        if (!m.log) return;
        m.log.startedBarsFromIdeal = r3((m.plan.target - m.target) / (4 * m.out.beatSec));
        m.log.startedAt = Date.now();
    }
    function mixLevel(m, diffDb) {
        if (!m.log || diffDb === null || diffDb === undefined) return;
        m.log.levelMinDb = r3(m.log.levelMinDb === null ? diffDb : Math.min(m.log.levelMinDb, diffDb));
        m.log.levelMaxDb = r3(m.log.levelMaxDb === null ? diffDb : Math.max(m.log.levelMaxDb, diffDb));
    }
    function mixWarning(m, text) {
        if (m && m.log && !m.log.warnings.includes(text) && m.log.warnings.length < 12) m.log.warnings.push(text);
    }
    function mixEnded(m, result) {
        if (!m.log) return;
        const e = m.log;
        e.result = result; // 'done' | 'early' | 'cancelled'
        e.mixSeconds = e.startedAt ? Math.round((Date.now() - e.startedAt) / 100) / 10 : null;
        delete e.startedAt;
        const list = load();
        list.push(e);
        store(list);
        m.log = null;
    }
    // Your verdict on the last mix
    function rateLast(rating) {
        const list = load();
        if (!list.length) return;
        list[list.length - 1].rating = rating;
        store(list);
        toast(rating === 'good' ? '¡Anotado! 👍 El profe aprende de esto' : 'Anotado 👎: con el historial vemos qué falló', 'ok');
    }

    // Everything the analysis found, energy per bar instead of the waveform
    function trackSummary(e) {
        const a = e.analysis;
        if (!a) return null;
        const bar = 4 * a.beatSec;
        const f = Analysis.FPS;
        const bands = { low: [], mid: [], high: [] };
        if (a.wave) {
            for (let t = a.downbeat, i = 0; t < a.duration && i < 600; t += bar, i++) {
                ['low', 'mid', 'high'].forEach((b, k) => {
                    const w = a.wave[k];
                    let s = 0, n = 0;
                    for (let j = Math.max(0, Math.floor(t * f)); j < Math.min(w.length, Math.floor((t + bar) * f)); j++) { s += w[j]; n++; }
                    bands[b].push(n ? Math.round(s / n * 100) / 100 : 0);
                });
            }
        }
        return {
            id: e.id, title: e.title || '', artist: e.artist || '', url: e.url || null,
            duration: r3(a.duration), analysisVersion: a.version,
            bpm: r3(a.bpm), bpmDetected: r3(e.bpmDetected ?? a.bpm), bpmFixed: !!e.bpmFixed,
            key: a.key ? { name: a.key.name, camelot: a.key.camelot, confidence: r3(a.key.confidence) } : null,
            loudness: r3(a.loudness), firstBeat: r3(a.firstBeat), downbeat: r3(a.downbeat), phraseStart: r3(a.phraseStart),
            mixIn: r3(a.mixIn), introEnd: r3(a.introEnd), outroStart: r3(a.outroStart), mixOut: r3(a.mixOut),
            mixBars: a.mixBars, musicEnd: r3(a.musicEnd),
            breakdowns: (a.breakdowns || []).map(b => ({ start: r3(b.start), end: r3(b.end) })),
            cues: e.cues || null, energyPerBar: bands,
        };
    }

    async function share() {
        const btn = $('history-share');
        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = 'ENVIANDO…';
        try {
            const records = await Store.all();
            const tracks = records.map(trackSummary).filter(Boolean);
            const mixes = load();
            if (!tracks.length && !mixes.length) { toast('Todavía no hay historial: carga temas y haz mezclas', 'info'); return; }
            const res = await fetch('/api/history', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tracks, mixes, app: $('app-version') ? $('app-version').textContent : '' }),
            });
            const out = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(out.error || `error ${res.status}`);
            toast(out.pushed
                ? `Historial compartido: ${out.tracks} temas y ${out.mixes} mezclas (rama "historial" en GitHub) ✓`
                : `Historial guardado en la carpeta historial/ (${out.tracks} temas, ${out.mixes} mezclas), pero no se pudo subir a GitHub: ${out.message || ''}`, out.pushed ? 'ok' : 'warn');
        } catch (e) {
            toast(`No pude guardar el historial: ${e.message}. ¿Está corriendo python server.py?`, 'warn');
        } finally {
            btn.disabled = false;
            btn.textContent = old;
        }
    }

    function init() {
        $('history-share').addEventListener('click', share);
    }

    return { init, mixStarted, mixCameIn, mixLevel, mixWarning, mixEnded, rateLast, count: () => load().length };
})();
