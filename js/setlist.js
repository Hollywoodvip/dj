/* ==========================================================================
   ARMAR SET: the order of the night, not just the next track.
   From the tracks of the open folder, follows an energy curve (previa → subida →
   peak → cierre) and at each step picks the track that best follows the previous
   one: key (Camelot), tempo (half/double allowed), same genre, not played lately.
   Energy = tempo + loudness, relative to the tracks of the set.
   ========================================================================== */
const Setlist = (() => {
    const KEY = 'webdj-set';
    let set = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } })();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(set)); } catch (e) {} };

    const tempoDiff = (a, b) => Math.min(...[1, 2, 0.5].map(f => Math.abs(a / (b * f) - 1)));
    // Where the energy should be at step i of n: warm up, climb, peak around 80%, come down a bit
    const curve = (i, n) => {
        const x = n > 1 ? i / (n - 1) : 0;
        return x < 0.3 ? 0.2 + (x / 0.3) * 0.3 : x < 0.8 ? 0.5 + ((x - 0.3) / 0.5) * 0.5 : 1 - ((x - 0.8) / 0.2) * 0.35;
    };

    function build(entries, size = 12) {
        const pool = entries.filter(e => e.analysis && !e.demo && e.id);
        if (pool.length < 3) { toast('Para armar un set necesito al menos 3 temas en esta carpeta', 'warn'); return null; }
        const n = Math.min(size, pool.length);
        const bpms = pool.map(e => e.analysis.bpm), louds = pool.map(e => e.analysis.loudness ?? -12);
        const norm = (v, arr) => { const mn = Math.min(...arr), mx = Math.max(...arr); return mx > mn ? (v - mn) / (mx - mn) : 0.5; };
        const energy = new Map(pool.map(e => [e, 0.6 * norm(e.analysis.bpm, bpms) + 0.4 * norm(e.analysis.loudness ?? -12, louds)]));
        const cam = (e) => e.analysis.key && e.analysis.key.camelot;
        const order = [];
        const used = new Set();
        for (let i = 0; i < n; i++) {
            const prev = order[order.length - 1];
            let best = null, bestScore = -Infinity;
            for (const e of pool) {
                if (used.has(e)) continue;
                let s = -2.5 * Math.abs(energy.get(e) - curve(i, n));
                if (prev) {
                    const k = Analysis.keyCompatibility(cam(prev), cam(e));
                    s += k === 2 ? 1 : k === 1 ? 0.4 : -1.2;
                    const d = tempoDiff(prev.analysis.bpm, e.analysis.bpm);
                    s += d < 0.03 ? 1 : d < 0.06 ? 0.5 : -1.5;
                    if (trackGenre(prev) === trackGenre(e)) s += 0.6;
                }
                if (playedRecently(e)) s -= 3;
                if (s > bestScore) { bestScore = s; best = e; }
            }
            order.push(best);
            used.add(best);
        }
        set = { ids: order.map(e => e.id), energy: order.map(e => Math.round(energy.get(e) * 100) / 100), createdAt: Date.now() };
        save();
        return set;
    }

    const entries = () => (set ? set.ids.map(id => library.find(e => e.id === id)).filter(Boolean) : []);
    const doneInSet = (e) => e.played || (e.lastPlayedAt && set && e.lastPlayedAt >= set.createdAt);
    // The next one: the first of the set that hasn't sounded and isn't on a deck
    function next() {
        return entries().find(e => !doneInSet(e) && !deckList.some(d => d.track === e)) || null;
    }
    // Why it follows the previous one (for the list)
    function why(i) {
        const list = entries();
        const e = list[i], prev = list[i - 1];
        if (!e || !prev) return 'abre el set';
        const k = Analysis.keyCompatibility(prev.analysis.key && prev.analysis.key.camelot, e.analysis.key && e.analysis.key.camelot);
        const d = tempoDiff(prev.analysis.bpm, e.analysis.bpm);
        return [k === 2 ? 'tono ✓' : k === 1 ? 'tono ~' : 'tono ✗', d < 0.03 ? 'tempo ✓' : d < 0.06 ? 'tempo ~' : 'tempo ✗ (corte)'].join(' · ');
    }
    const bar = (v) => '▁▂▃▄▅▆▇█'[Math.max(0, Math.min(7, Math.round(v * 7)))];

    function renderHeader() {
        const box = $('set-info');
        if (!box) return;
        const show = libFolder === 'set' && set;
        box.classList.toggle('hidden', !show);
        if (!show) return;
        const list = entries();
        const nx = next();
        box.innerHTML = `<span class="text-emerald-300 font-bold">SET DE ${list.length} TEMAS</span>
            <span class="text-gray-400">previa → subida → peak → cierre</span>
            <span class="font-mono text-emerald-400 tracking-tighter" title="Energía de cada tema en el orden del set">${set.energy.map(bar).join('')}</span>
            ${nx ? `<span class="text-gray-300">Siguiente: <b class="text-white"></b></span><button id="set-load-next" class="mini-btn !text-emerald-300">CARGAR SIGUIENTE</button>` : '<span class="text-emerald-300">¡Set completo! 🎉</span>'}
            <button id="set-clear" class="mini-btn">BORRAR SET</button>`;
        if (nx) {
            box.querySelector('b').textContent = nx.title;
            $('set-load-next').onclick = () => loadNext();
        }
        $('set-clear').onclick = () => { set = null; save(); libFolder = 'all'; renderLibrary(); };
    }

    // Loads the next track of the set into the free deck (the one not playing)
    function loadNext() {
        const nx = next();
        if (!nx) return;
        const { live, next: free } = liveAndNext();
        const deck = free && !free.isPlaying ? free : deckList.find(d => !d.isPlaying);
        if (!deck) { toast('Los dos decks están sonando: termina la mezcla primero', 'warn'); return; }
        loadEntryToDeck(nx, deck);
    }

    function create() {
        const pool = currentLibraryList();
        const s = build(pool.length >= 3 ? pool : library, 12);
        if (!s) return;
        libFolder = 'set';
        try { localStorage.setItem('webdj-lib-folder', 'set'); } catch (e) {}
        renderLibrary();
        toast(`Set armado: ${s.ids.length} temas en orden de energía, tono y tempo. Carga el primero y dale`, 'ok');
    }

    function init() {
        $('set-build').addEventListener('click', () => { ensureAudio(); create(); });
    }

    return {
        init, build, entries, next, why, bar, renderHeader, loadNext,
        active: () => !!(set && set.ids.length),
        energyAt: (i) => (set ? set.energy[i] : null),
    };
})();
