/* ==========================================================================
   STEMS: each track split into VOZ / BATERÍA / BAJO / MELODÍA (Demucs, run by
   server.py). The deck then plays the 4 parts in sync and each one has its own
   on/off (a hidden 0–1 control, so the mix coach can light and glide it like a knob).
   Enables two guided mixes: STEMS (swap drums, bass, melody and voice one by one)
   and MASHUP (the new track's voice over the old one's beat, then the full track).
   ========================================================================== */
const STEM_PARTS = [
    { id: 'vocals', label: 'VOZ', icon: 'fa-microphone', name: 'la voz' },
    { id: 'drums', label: 'BAT', icon: 'fa-drum', name: 'la batería' },
    { id: 'bass', label: 'BAJO', icon: 'fa-guitar', name: 'el bajo' },
    { id: 'other', label: 'MEL', icon: 'fa-music', name: 'la melodía' },
];

const Stems = (() => {
    const state = { a: { status: 'none' }, b: { status: 'none' } };
    const stemId = (deck, part) => `deck-${deck.key}-stem-${part}`;

    async function sha1(bytes) {
        const d = await crypto.subtle.digest('SHA-1', bytes);
        return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    // 16-bit WAV of exactly what the deck plays, so the stems line up sample by sample
    function toWav(buffer) {
        const ch = Math.min(2, buffer.numberOfChannels), sr = buffer.sampleRate, n = buffer.length;
        const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
        const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
        str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
        out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
        out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
        str(36, 'data'); out.setUint32(40, n * ch * 2, true);
        const data = [...Array(ch)].map((_, c) => buffer.getChannelData(c));
        let o = 44;
        for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { out.setInt16(o, Math.max(-1, Math.min(1, data[c][i])) * 32767, true); o += 2; }
        return out.buffer;
    }

    async function trackHash(deck) {
        const t = deck.track;
        if (!t) return null;
        if (t.stemHash) return t.stemHash;
        t.stemHash = t.bytes ? await sha1(t.bytes) : await sha1(toWav(deck.audioBuffer));
        return t.stemHash;
    }

    function render(deck) {
        const s = state[deck.key];
        const btn = $(`deck-${deck.key}-stems-btn`);
        if (!btn) return;
        const ready = s.status === 'ready';
        btn.textContent = ready ? 'LISTO ✓' : s.status === 'working' ? `${s.progress || 0}%` : s.status === 'queued' ? 'EN COLA' : s.status === 'loading' ? 'CARGANDO' : s.status === 'error' ? 'REINTENTAR' : 'SEPARAR';
        btn.disabled = ['working', 'queued', 'loading'].includes(s.status);
        btn.title = s.status === 'error' ? `Error: ${s.message || ''}` : ready ? 'Este tema ya está separado en voz, batería, bajo y melodía'
            : 'Separa este tema en VOZ, BATERÍA, BAJO y MELODÍA (tarda 1–3 minutos la primera vez; después queda guardado)';
        STEM_PARTS.forEach(p => {
            const b = $(`deck-${deck.key}-stemb-${p.id}`);
            b.disabled = !ready;
            const v = +$(stemId(deck, p.id)).value;
            b.classList.toggle('stem-on', ready && v >= 0.5);
            b.classList.toggle('stem-off', ready && v < 0.5);
        });
    }

    // When a track is loaded: back to the full track, and pick up stems separated before
    async function onLoad(deck) {
        state[deck.key] = { status: 'none' };
        STEM_PARTS.forEach(p => setControl(stemId(deck, p.id), 1));
        deck.vocalPhrase = null;
        render(deck);
        if (!deck.track || !server.online) return;
        const track = deck.track;
        try {
            const h = await trackHash(deck);
            if (deck.track !== track) return;
            const res = await (await fetch(`/api/stems?hash=${h}`)).json();
            if (res.status === 'done') await loadFiles(deck, res.files, track);
            else if (res.status === 'working' || res.status === 'queued') { state[deck.key] = { status: res.status, progress: res.progress }; render(deck); poll(deck, h, track); }
        } catch (e) { /* no stems: fine */ }
    }

    async function separate(deck) {
        ensureAudio();
        if (!deck.track || !deck.audioBuffer) { toast(`Carga un tema en el Deck ${deck.id}`, 'warn'); return; }
        if (!server.online) { toast('Para separar necesitas python server.py corriendo', 'warn'); return; }
        const track = deck.track;
        state[deck.key] = { status: 'queued', progress: 0 };
        render(deck);
        try {
            const h = await trackHash(deck);
            const res = await fetch(`/api/stems?hash=${h}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: toWav(deck.audioBuffer) });
            const out = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(out.error || `error ${res.status}`);
            if (out.status === 'done') { await loadFiles(deck, out.files, track); return; }
            toast(`Separando el Deck ${deck.id} en voz, batería, bajo y melodía… (1–3 min, puedes seguir tocando)`, 'info');
            poll(deck, h, track);
        } catch (e) {
            state[deck.key] = { status: 'error', message: e.message };
            render(deck);
            toast(`No se pudo separar: ${e.message}`, 'warn');
        }
    }

    async function poll(deck, h, track) {
        while (deck.track === track) {
            await new Promise(r => setTimeout(r, 1500));
            if (deck.track !== track) return;
            let res;
            try { res = await (await fetch(`/api/stems?hash=${h}`)).json(); } catch (e) { continue; }
            if (res.status === 'done') { await loadFiles(deck, res.files, track); return; }
            if (res.status === 'error' || res.status === 'none') {
                state[deck.key] = { status: 'error', message: res.message || 'se interrumpió' };
                render(deck);
                toast(`No se pudo separar: ${res.message || 'se interrumpió'}`, 'warn');
                return;
            }
            state[deck.key] = { status: res.status, progress: res.progress };
            render(deck);
        }
    }

    async function loadFiles(deck, files, track) {
        state[deck.key] = { status: 'loading' };
        render(deck);
        const buffers = {};
        for (const p of STEM_PARTS) {
            const bytes = await (await fetch(files[p.id])).arrayBuffer();
            buffers[p.id] = await audioCtx.decodeAudioData(bytes);
        }
        if (deck.track !== track) return;
        if (!track.stemsReady && !track.demo) { track.stemsReady = true; saveEntry(track); }
        deck.setStems(buffers);
        STEM_PARTS.forEach(p => deck.setStemLevel(p.id, +$(stemId(deck, p.id)).value));
        deck.vocalPhrase = findVocalPhrase(deck, buffers.vocals);
        state[deck.key] = { status: 'ready' };
        render(deck);
        toast(`Deck ${deck.id}: STEMS listos (VOZ · BAT · BAJO · MEL)`, 'ok');
        if (typeof replanForStems === 'function') replanForStems();
    }

    // Where the track sings the most (the chorus): the 8-bar phrase with the loudest voice
    function findVocalPhrase(deck, vocals) {
        const a = deck.analysis;
        if (!a || !vocals) return null;
        const d = vocals.getChannelData(0), sr = vocals.sampleRate, bar = 4 * a.beatSec;
        const ps = a.phraseStart ?? a.downbeat;
        let best = null, bestE = 0, total = 0, count = 0;
        for (let p = ps; p + 8 * bar <= (a.musicEnd || deck.duration) - 8 * bar; p += 8 * bar) {
            if (p < a.mixIn) continue;
            let s = 0;
            const i0 = Math.floor(p * sr), i1 = Math.min(d.length, Math.floor((p + 8 * bar) * sr));
            for (let i = i0; i < i1; i += 64) s += d[i] * d[i];
            const e = s / Math.max(1, (i1 - i0) / 64);
            total += e; count++;
            if (e > bestE) { bestE = e; best = p; }
        }
        // Barely any voice: an instrumental, no chorus to take
        return count && Math.sqrt(bestE) > 0.02 ? best : null;
    }

    /* ---------- separate a whole folder, one track after another ---------- */
    let batch = null;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    function renderBatch() {
        const b = $('stems-batch');
        if (!b) return;
        b.textContent = batch ? `STEMS ${batch.done + 1}/${batch.total} · ${batch.progress || 0}% · PARAR` : 'SEPARAR CARPETA';
        b.classList.toggle('mini-btn-on', !!batch);
    }
    async function separateMany(entries) {
        if (batch) { batch.stop = true; toast('Paro después del tema que se está separando', 'info'); return; }
        if (!server.online) { toast('Para separar necesitas python server.py corriendo', 'warn'); return; }
        ensureAudio();
        const list = entries.filter(e => e.bytes && !e.demo && !e.stemsReady);
        if (!list.length) { toast('Todos los temas de esta carpeta ya tienen STEMS ✓', 'ok'); return; }
        batch = { stop: false, done: 0, total: list.length, progress: 0 };
        renderBatch();
        toast(`Separando ${list.length} tema${list.length === 1 ? '' : 's'} en fila (1–3 min cada uno). Puedes seguir tocando`, 'info');
        for (const e of list) {
            if (batch.stop) break;
            try {
                const h = e.stemHash || (e.stemHash = await sha1(e.bytes));
                let res = await (await fetch(`/api/stems?hash=${h}`)).json();
                if (res.status === 'none' || res.status === 'error') {
                    const r = await fetch(`/api/stems?hash=${h}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: toWav(await decodeBytes(e.bytes)) });
                    res = await r.json().catch(() => ({}));
                    if (!r.ok) throw new Error(res.error || `error ${r.status}`);
                }
                while (res.status !== 'done') {
                    await sleep(2000);
                    res = await (await fetch(`/api/stems?hash=${h}`)).json();
                    if (res.status === 'error' || res.status === 'none') throw new Error(res.message || 'se interrumpió');
                    batch.progress = res.progress || 0;
                    renderBatch();
                }
                e.stemsReady = true;
                saveEntry(e);
            } catch (err) {
                toast(`No se pudo separar "${e.title}": ${err.message}`, 'warn');
                if (/Demucs|numpy|pip install/.test(err.message)) break; // same error for every track
            }
            batch.done++;
            batch.progress = 0;
            renderBatch();
            renderLibrary();
        }
        toast(`STEMS listos: ${list.filter(e => e.stemsReady).length} de ${list.length} temas ✓`, 'ok');
        batch = null;
        renderBatch();
    }

    function toggle(deck, part) {
        const id = stemId(deck, part);
        const lit = currentTargets.find(t => t.id === id && t.value !== undefined);
        if (lit) { applyTarget(lit); return; }
        const to = +$(id).value >= 0.5 ? 0 : 1;
        // A beat's fade: a stem cut on the beat, without a click
        glideControl(id, to, deck.isPlaying ? Math.max(60, deck.beatSec / deck.playbackRate * 1000 * 0.5) : 0);
    }

    function init() {
        $('stems-batch').addEventListener('click', () => separateMany(currentLibraryList()));
        deckList.forEach(deck => {
            $(`deck-${deck.key}-stems-btn`).addEventListener('click', () => separate(deck));
            STEM_PARTS.forEach(p => {
                $(stemId(deck, p.id)).addEventListener('input', (e) => { deck.setStemLevel(p.id, +e.target.value); render(deck); });
                $(`deck-${deck.key}-stemb-${p.id}`).addEventListener('click', () => { ensureAudio(); toggle(deck, p.id); });
            });
            render(deck);
        });
    }

    return {
        init, onLoad, separate, render, separateMany,
        ready: (deck) => state[deck.key].status === 'ready' && !!deck.stems,
        allOn: (deck) => STEM_PARTS.every(p => +$(stemId(deck, p.id)).value >= 0.5),
        id: stemId,
    };
})();
