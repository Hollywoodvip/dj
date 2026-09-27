/* ==========================================================================
   AUDÍFONOS (CUE / pre-listen): two outputs at once, like a real mixer.
   - MASTER (what the crowd hears) goes to the device you pick (Bluetooth speaker…)
     with AudioContext.setSinkId.
   - CUE: each channel's CUE button sends it (after EQ, before the fader and the
     crossfader) to a second device (AirPods, headphones in the Mac's jack…).
     The cue bus is a MediaStream played by an <audio> element with its own sinkId.
   - CUE MIX blends the master into the headphones (to beatmatch by ear).
   The cue never plays until you pick a headphone device different from the
   speakers: otherwise the pre-listen would leak into the party.
   ========================================================================== */
const Cue = (() => {
    const pfl = { a: false, b: false };
    let nodes = null;
    const saved = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    let cueDev = saved('webdj-out-cue');       // { id, label }
    let masterDev = saved('webdj-out-master'); // { id, label } (null = system default)
    let devices = [];
    let labelsAllowed = false;

    const supported = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
    const masterSupported = () => typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
    // Headphones picked and different from the speakers
    const ready = () => !!(nodes && cueDev && cueDev.id && (!masterDev || cueDev.id !== masterDev.id) && nodes.routed);

    function build() {
        if (nodes || !audioCtx || !Mixer.limiter || !decks.a.filterNode) return;
        const g = (v = 1) => { const n = audioCtx.createGain(); n.gain.value = v; return n; };
        nodes = { bus: g(), master: g(0), cueLvl: g(1), out: g(0.8), ch: {}, routed: false };
        deckList.forEach(d => {
            nodes.ch[d.key] = g(pfl[d.key] ? 1 : 0);
            d.filterNode.connect(nodes.ch[d.key]); // pre-fader, post-EQ (PFL)
            nodes.ch[d.key].connect(nodes.bus);
        });
        Mixer.limiter.connect(nodes.master);
        nodes.bus.connect(nodes.cueLvl);
        nodes.cueLvl.connect(nodes.out);
        nodes.master.connect(nodes.out);
        nodes.dest = audioCtx.createMediaStreamDestination();
        nodes.out.connect(nodes.dest);
        nodes.el = new Audio();
        nodes.el.srcObject = nodes.dest.stream;
        applyMix();
        applyVol();
    }

    // Sends the cue stream to the headphones (and only there)
    async function route() {
        if (!nodes) return;
        nodes.routed = false;
        if (!cueDev || !supported() || (masterDev && cueDev.id === masterDev.id)) { nodes.el.pause(); render(); return; }
        try {
            await nodes.el.setSinkId(cueDev.id);
            await nodes.el.play();
            nodes.routed = true;
        } catch (e) {
            console.warn('cue sink', e);
            nodes.el.pause();
            toast(`No pude usar "${cueDev.label || 'los audífonos'}": ¿están conectados? Elige de nuevo en AUDÍFONOS`, 'warn');
        }
        render();
    }

    async function routeMaster() {
        if (!audioCtx || !masterSupported()) return;
        try { await audioCtx.setSinkId(masterDev ? masterDev.id : ''); }
        catch (e) { console.warn('master sink', e); toast(`No pude usar "${masterDev && masterDev.label}" para los parlantes`, 'warn'); }
    }

    function applyMix() {
        if (!nodes) return;
        // -1 = only the channels you cue, 1 = only the master
        const x = +$('cue-mix').value;
        nodes.cueLvl.gain.setTargetAtTime(Math.cos((x + 1) * Math.PI / 4), audioCtx.currentTime, 0.02);
        nodes.master.gain.setTargetAtTime(Math.sin((x + 1) * Math.PI / 4), audioCtx.currentTime, 0.02);
    }
    function applyVol() { if (nodes) nodes.out.gain.setTargetAtTime(+$('cue-vol').value, audioCtx.currentTime, 0.02); }

    function setPfl(deck, on) {
        pfl[deck.key] = on;
        if (nodes) nodes.ch[deck.key].gain.setTargetAtTime(on ? 1 : 0, audioCtx.currentTime, 0.01);
        render();
    }
    function toggle(deck) {
        ensureAudio();
        build();
        setPfl(deck, !pfl[deck.key]);
        if (pfl[deck.key] && !ready()) {
            toast('Primero elige tus audífonos: botón ELEGIR en AUDÍFONOS (así el CUE no sale por los parlantes)', 'warn');
            openSetup();
        }
    }

    function render() {
        deckList.forEach(d => {
            const b = $(`deck-${d.key}-pfl`);
            if (b) b.classList.toggle('active', pfl[d.key]);
        });
        const st = $('cue-status');
        if (!st) return;
        if (!supported()) st.textContent = 'Tu navegador no deja elegir la salida: usa Chrome';
        else if (!cueDev) st.textContent = 'Sin audífonos: toca ELEGIR';
        else if (masterDev && cueDev.id === masterDev.id) st.textContent = 'Audífonos = parlantes: elige otro';
        else st.textContent = `🎧 ${cueDev.label || 'audífonos'}${nodes && !nodes.routed ? ' (no conectado)' : ''}`;
        st.title = st.textContent;
    }

    /* ---------------- choosing the devices ---------------- */
    async function listDevices() {
        try {
            devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput');
            labelsAllowed = devices.some(d => d.label);
        } catch (e) { devices = []; }
        return devices;
    }
    // Chrome only shows the names of the outputs after you allow the microphone once.
    // The mic is closed right away (AirPods would switch to "call" quality while it's open).
    async function askNames() {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            s.getTracks().forEach(t => t.stop());
        } catch (e) { toast('Sin ese permiso no puedo ver los nombres de tus audífonos', 'warn'); }
        await fillSelects();
    }

    async function fillSelects() {
        await listDevices();
        const fill = (sel, current, withDefault) => {
            sel.innerHTML = '';
            if (withDefault) sel.add(new Option('Salida del sistema (la que elegiste en el Mac)', ''));
            else sel.add(new Option('— sin audífonos —', ''));
            devices.filter(d => d.deviceId !== 'default').forEach((d, i) => sel.add(new Option(d.label || `Salida ${i + 1}`, d.deviceId)));
            sel.value = current && devices.some(d => d.deviceId === current.id) ? current.id : '';
        };
        fill($('out-master'), masterDev, true);
        fill($('out-cue'), cueDev, false);
        $('out-names').classList.toggle('hidden', labelsAllowed);
        $('out-names-note').classList.toggle('hidden', labelsAllowed);
        $('out-master').disabled = !masterSupported();
        $('out-master-note').classList.toggle('hidden', masterSupported());
    }

    function openSetup() {
        $('cue-modal').classList.remove('hidden');
        fillSelects();
    }

    function beep(where) {
        ensureAudio();
        build();
        const o = audioCtx.createOscillator();
        const e = audioCtx.createGain();
        const t = audioCtx.currentTime + 0.02;
        o.frequency.value = where === 'cue' ? 880 : 660;
        e.gain.setValueAtTime(0.0001, t);
        e.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        e.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(e);
        e.connect(where === 'cue' ? nodes.bus : Mixer.master);
        o.start(t); o.stop(t + 0.55);
        if (where === 'cue' && !ready()) toast('Elige primero unos audífonos distintos de los parlantes', 'warn');
    }

    function init() {
        // Headphones section of the mixer
        deckList.forEach(d => $(`deck-${d.key}-pfl`).addEventListener('click', () => toggle(d)));
        $('cue-mix').addEventListener('input', applyMix);
        $('cue-vol').addEventListener('input', applyVol);
        $('cue-setup').addEventListener('click', openSetup);
        $('cue-close').addEventListener('click', () => $('cue-modal').classList.add('hidden'));
        $('cue-modal').addEventListener('click', (e) => { if (e.target.id === 'cue-modal') $('cue-modal').classList.add('hidden'); });
        $('out-names').addEventListener('click', askNames);
        $('out-test-master').addEventListener('click', () => beep('master'));
        $('out-test-cue').addEventListener('click', () => beep('cue'));
        $('out-master').addEventListener('change', async (e) => {
            const opt = e.target.selectedOptions[0];
            masterDev = e.target.value ? { id: e.target.value, label: opt.textContent } : null;
            save('webdj-out-master', masterDev);
            ensureAudio(); build();
            await routeMaster();
            await route();
        });
        $('out-cue').addEventListener('change', async (e) => {
            const opt = e.target.selectedOptions[0];
            cueDev = e.target.value ? { id: e.target.value, label: opt.textContent } : null;
            save('webdj-out-cue', cueDev);
            ensureAudio(); build();
            await route();
            if (ready()) toast(`Audífonos: ${cueDev.label}. Prende el CUE 🎧 de un canal para escucharlo solo tú`, 'ok');
        });
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
            // Plugging/unplugging headphones: try again with the saved choice
            navigator.mediaDevices.addEventListener('devicechange', async () => {
                if (!nodes) return;
                await listDevices();
                if (cueDev && devices.some(d => d.deviceId === cueDev.id)) await route();
                else if (nodes.routed) { nodes.el.pause(); nodes.routed = false; render(); toast('Se desconectaron los audífonos', 'warn'); }
                if (!$('cue-modal').classList.contains('hidden')) fillSelects();
            });
        }
        render();
    }

    // Called once the audio engine exists (first click)
    async function onAudio() {
        build();
        if (masterDev) await routeMaster();
        if (cueDev) await route();
    }

    return {
        init, onAudio, toggle, setPfl, ready, render,
        pfl: (deck) => pfl[deck.key],
        hasHeadphones: () => !!cueDev,
        debug: () => nodes, // tests
    };
})();
