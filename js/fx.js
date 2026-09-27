/* ==========================================================================
   BEAT FX (Pioneer DJM style) + SAMPLER
   Each deck owns an FXUnit inserted between its filter and channel fader:
     input ─┬─ dry ────────────────┬─ gate ─ output
            └─ send ─ [effect] ─ wet┘
   Time-based parameters follow the deck's tempo (beats → seconds).
   ========================================================================== */
const FX_TYPES = ['echo', 'reverb', 'flanger', 'phaser', 'trans', 'roll'];
const FX_LABELS = { echo: 'ECHO', reverb: 'REVERB', flanger: 'FLANGER', phaser: 'PHASER', trans: 'TRANS', roll: 'ROLL' };
const FX_BEATS = [0.25, 0.5, 1, 2, 4];

function beatLabel(b) {
    return b === 0.25 ? '1/4' : b === 0.5 ? '1/2' : String(b);
}

class FXUnit {
    constructor(ctx, deck) {
        this.ctx = ctx;
        this.deck = deck;
        this.type = 'echo';
        this.beats = 0.5;
        this.level = 0.6;
        this.on = false;

        this.input = ctx.createGain();
        this.output = ctx.createGain();
        this.dry = ctx.createGain();
        this.send = ctx.createGain();
        this.wet = ctx.createGain();
        this.gate = ctx.createGain();
        this.send.gain.value = 0;
        this.wet.gain.value = 0;

        this.input.connect(this.dry);
        this.input.connect(this.send);
        this.dry.connect(this.gate);
        this.wet.connect(this.gate);
        this.gate.connect(this.output);

        this.effects = {
            echo: this.buildEcho(),
            reverb: this.buildReverb(),
            flanger: this.buildModDelay(0.003, 0.0025, 0.65),
            phaser: this.buildPhaser(),
        };
        Object.values(this.effects).forEach(fx => fx.out.connect(this.wet));
        this.connectedEffect = null;
        this.lastGateEdge = -Infinity;
        this.reverbSeconds = 0;
        this.applied = {};
    }

    buildEcho() {
        const ctx = this.ctx;
        const input = ctx.createGain();
        const delay = ctx.createDelay(6);
        const feedback = ctx.createGain();
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = 4500;
        input.connect(delay);
        delay.connect(tone);
        tone.connect(feedback);
        feedback.connect(delay);
        return { in: input, out: tone, delay, feedback };
    }

    buildReverb() {
        const input = this.ctx.createGain();
        const convolver = this.ctx.createConvolver();
        input.connect(convolver);
        return { in: input, out: convolver, convolver };
    }

    makeImpulse(seconds) {
        const rate = this.ctx.sampleRate;
        const length = Math.floor(rate * seconds);
        const impulse = this.ctx.createBuffer(2, length, rate);
        for (let ch = 0; ch < 2; ch++) {
            const d = impulse.getChannelData(ch);
            for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
        }
        return impulse;
    }

    // Flanger: short delay swept by an LFO, with feedback
    buildModDelay(base, depth, fb) {
        const ctx = this.ctx;
        const input = ctx.createGain();
        const delay = ctx.createDelay(0.05);
        delay.delayTime.value = base;
        const feedback = ctx.createGain();
        feedback.gain.value = fb;
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = depth;
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        lfo.start();
        input.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        return { in: input, out: delay, lfo, lfoGain };
    }

    // Phaser: chain of all-pass filters swept by an LFO
    buildPhaser() {
        const ctx = this.ctx;
        const input = ctx.createGain();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 900;
        lfo.connect(lfoGain);
        lfo.start();
        let node = input;
        for (let i = 0; i < 6; i++) {
            const ap = ctx.createBiquadFilter();
            ap.type = 'allpass';
            ap.frequency.value = 1000;
            ap.Q.value = 0.7;
            lfoGain.connect(ap.frequency);
            node.connect(ap);
            node = ap;
        }
        // Web Audio only allows feedback cycles that contain a DelayNode
        const feedback = ctx.createGain();
        feedback.gain.value = 0.4;
        const feedbackDelay = ctx.createDelay(0.01);
        feedbackDelay.delayTime.value = 0.001;
        node.connect(feedback);
        feedback.connect(feedbackDelay);
        feedbackDelay.connect(input);
        return { in: input, out: node, lfo };
    }

    // Seconds per beat as currently heard
    beatSeconds() {
        const deck = this.deck;
        return (deck.analysis ? deck.analysis.beatSec : 60 / deck.bpm) / (deck.pitch || 1);
    }

    setType(type) {
        if (type === this.type) return;
        const wasOn = this.on;
        if (wasOn) this.setOn(false);
        this.type = type;
        if (wasOn) this.setOn(true);
    }

    setBeats(beats) {
        this.beats = beats;
        if (this.on && this.type === 'roll') this.deck.startRoll(this.beats);
        this.update(true);
    }

    setLevel(level) {
        this.level = level;
        this.update(true);
    }

    setOn(on) {
        const now = this.ctx.currentTime;
        this.on = on;
        const type = this.type;

        if (type === 'roll') {
            if (on) this.deck.startRoll(this.beats);
            else this.deck.stopRoll();
            return;
        }
        if (type === 'trans') {
            this.gate.gain.cancelScheduledValues(now);
            this.gate.gain.setValueAtTime(1, now);
            this.lastGateEdge = -Infinity;
            return;
        }

        const fx = this.effects[type];
        if (on) {
            if (this.connectedEffect && this.connectedEffect !== fx) {
                try { this.send.disconnect(this.connectedEffect.in); } catch (e) {}
            }
            if (this.connectedEffect !== fx) this.send.connect(fx.in);
            this.connectedEffect = fx;
            this.send.gain.setTargetAtTime(1, now, 0.01);
            this.update(true);
        } else {
            // Echo & reverb keep their tails (trails), the others cut
            this.send.gain.setTargetAtTime(0, now, 0.01);
            if (type !== 'echo' && type !== 'reverb') {
                this.wet.gain.setTargetAtTime(0, now, 0.02);
                this.applied.wet = 0;
            }
        }
    }

    // Set an AudioParam smoothly, but only when the value really changed
    setParam(name, param, value, force) {
        if (!force && this.applied[name] !== undefined && Math.abs(this.applied[name] - value) < 1e-4) return;
        this.applied[name] = value;
        param.setTargetAtTime(value, this.ctx.currentTime, 0.02);
    }

    // Called every animation frame
    update(force = false) {
        const beatSec = this.beatSeconds();
        const cycle = this.beats * beatSec;

        if (this.on && this.type === 'echo') {
            const fx = this.effects.echo;
            this.setParam('echoTime', fx.delay.delayTime, Math.min(cycle, 5.9), force);
            this.setParam('echoFb', fx.feedback.gain, 0.3 + this.level * 0.45, force);
            this.setParam('wet', this.wet.gain, 0.4 + this.level * 0.6, force);
        }
        if (this.on && this.type === 'reverb') {
            const seconds = 0.8 + this.beats * 0.8;
            if (Math.abs(seconds - this.reverbSeconds) > 0.01) {
                this.effects.reverb.convolver.buffer = this.makeImpulse(seconds);
                this.reverbSeconds = seconds;
            }
            this.setParam('wet', this.wet.gain, this.level * 1.2, force);
        }
        if (this.on && (this.type === 'flanger' || this.type === 'phaser')) {
            const fx = this.effects[this.type];
            // one sweep every (beats x 4) beats
            this.setParam(this.type + 'Lfo', fx.lfo.frequency, 1 / Math.max(0.05, cycle * 4), force);
            this.setParam('wet', this.wet.gain, 0.3 + this.level * 0.7, force);
        }
        if (this.on && this.type === 'trans') this.scheduleGate(beatSec);
    }

    // TRANS: chop the signal on the beat grid (look-ahead scheduling)
    scheduleGate(beatSec) {
        const deck = this.deck;
        if (!deck.isPlaying) return;
        const now = this.ctx.currentTime;
        const lookahead = 0.15;
        const chop = this.beats * beatSec;       // real seconds per on/off cycle
        const pos = deck.getCurrentTime();
        const grid = deck.analysis ? deck.analysis.firstBeat : 0;
        const trackBeatSec = deck.analysis ? deck.analysis.beatSec : 60 / deck.bpm;
        // time (real seconds) since the grid origin
        const elapsed = (pos - grid) / trackBeatSec * beatSec;
        let edge = Math.ceil(elapsed / (chop / 2));
        const low = Math.max(0, 1 - this.level);
        while (true) {
            const edgeTime = now + (edge * chop / 2 - elapsed);
            if (edgeTime > now + lookahead) break;
            if (edge > this.lastGateEdge) {
                this.gate.gain.setValueAtTime(edge % 2 === 0 ? 1 : low, Math.max(now, edgeTime));
                this.lastGateEdge = edge;
            }
            edge++;
        }
    }
}

/* ---------------- Sampler pads (synthesized live, no files needed) ----------------
   Club "transition FX": each pad knows WHEN it sounds good and lands on the grid of the
   playing track by itself (`sync`): 'end' = finishes exactly on the next drop / phrase,
   'bar' = hits on the next "1", 'beat' = on the next beat. Any pad can be replaced by
   your own sound (drag a .wav/.mp3 onto it). */
const SAMPLER_PADS = [
    { id: 'riser', label: 'SUBIDA', icon: 'fa-arrow-trend-up', sync: 'end', minBars: 2, maxBars: 8,
      when: 'Ruido que sube y termina justo en el drop (o en la próxima frase). Tócala 4–8 compases antes de un drop: la gente siente que viene algo.' },
    { id: 'impact', label: 'IMPACTO', icon: 'fa-burst', sync: 'bar',
      when: 'Golpe grave con cola, suena en el próximo "1". Úsalo en el drop o en el primer beat del tema nuevo después de una mezcla.' },
    { id: 'snareroll', label: 'REDOBLE', icon: 'fa-drum', sync: 'end', minBars: 1, maxBars: 2,
      when: 'Redoble que se acelera en los 2 últimos compases antes del drop o de la frase. Clásico de la subida (tech house, EDM, reggaetón de club).' },
    { id: 'reverse', label: 'REVERSO', icon: 'fa-backward', sync: 'end', minBars: 0.75, maxBars: 1,
      when: 'Platillo al revés: crece durante 1 compás y termina en el "1". Perfecto justo antes de un drop o al entrar el tema nuevo.' },
    { id: 'downlifter', label: 'BAJADA', icon: 'fa-arrow-trend-down', sync: 'bar',
      when: 'Ruido que baja durante 2 compases. Úsalo después de un drop o al sacar un tema (junto al ECHO OUT).' },
    { id: 'subdrop', label: 'SUB DROP', icon: 'fa-arrow-down', sync: 'bar',
      when: 'Bajo profundo que cae, en el próximo "1". En el drop o cuando entra el bajo del tema nuevo. Con parlantes grandes se siente en el pecho.' },
    { id: 'stab', label: 'STAB', icon: 'fa-music', sync: 'beat',
      when: 'Acorde corto de techno, en el tono del tema que suena (no desafina). Tócalo en los huecos o en los últimos beats de una frase, pocas veces.' },
    { id: 'horn', label: 'AIR HORN', icon: 'fa-bullhorn', sync: 'beat',
      when: 'La bocina de dancehall/reggaetón. Una vez en el drop o cuando la gente ya está arriba; si la usas mucho aburre.' },
];

const Sampler = (() => {
    const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    let verb = null;

    function noise(ctx, len) {
        const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * len)), ctx.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return b;
    }
    function noiseSrc(ctx, len, t) {
        const s = ctx.createBufferSource();
        s.buffer = noise(ctx, len + 0.1);
        s.start(t);
        s.stop(t + len + 0.1);
        return s;
    }
    // Shared hall reverb for the tails (impacts, stabs)
    function reverb(ctx, dest) {
        if (!verb || verb.ctx !== ctx) {
            const len = 2.8, sr = ctx.sampleRate;
            const ir = ctx.createBuffer(2, Math.floor(sr * len), sr);
            for (let c = 0; c < 2; c++) {
                const d = ir.getChannelData(c);
                for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
            }
            const conv = ctx.createConvolver();
            conv.buffer = ir;
            const out = ctx.createGain();
            out.gain.value = 0.35;
            conv.connect(out);
            verb = { ctx, input: conv, out, dest: null };
        }
        if (verb.dest !== dest) { verb.out.disconnect(); verb.out.connect(dest); verb.dest = dest; }
        return verb.input;
    }
    const gainNode = (ctx, v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };

    const SOUNDS = {
        riser(ctx, dest, t, len) {
            const out = gainNode(ctx, 0);
            out.gain.setValueAtTime(0.02, t);
            out.gain.exponentialRampToValueAtTime(0.32, t + len);
            out.gain.setValueAtTime(0, t + len);
            out.connect(dest);
            // Noise sweeping up
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass'; bp.Q.value = 1.4;
            bp.frequency.setValueAtTime(350, t);
            bp.frequency.exponentialRampToValueAtTime(11000, t + len);
            noiseSrc(ctx, len, t).connect(bp); bp.connect(out);
            // Detuned saws gliding up an octave and a half, through an opening filter
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.Q.value = 6;
            lp.frequency.setValueAtTime(400, t);
            lp.frequency.exponentialRampToValueAtTime(7000, t + len);
            const sg = gainNode(ctx, 0.07);
            lp.connect(sg); sg.connect(out);
            [-12, 0, 11].forEach(det => {
                const o = ctx.createOscillator();
                o.type = 'sawtooth'; o.detune.value = det;
                o.frequency.setValueAtTime(130, t);
                o.frequency.exponentialRampToValueAtTime(660, t + len);
                o.connect(lp); o.start(t); o.stop(t + len);
            });
            return len;
        },
        impact(ctx, dest, t) {
            const sub = ctx.createOscillator();
            sub.frequency.setValueAtTime(140, t);
            sub.frequency.exponentialRampToValueAtTime(38, t + 0.9);
            const sg = gainNode(ctx, 0);
            sg.gain.setValueAtTime(0.7, t);
            sg.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
            sub.connect(sg); sg.connect(dest);
            sub.start(t); sub.stop(t + 1.7);
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(6000, t);
            lp.frequency.exponentialRampToValueAtTime(300, t + 0.8);
            const ng = gainNode(ctx, 0);
            ng.gain.setValueAtTime(0.45, t);
            ng.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
            noiseSrc(ctx, 1, t).connect(lp); lp.connect(ng);
            ng.connect(dest); ng.connect(reverb(ctx, dest));
            return 2.5;
        },
        snareroll(ctx, dest, t, len, beatSec) {
            // Quarters, then 8ths, 16ths, 32nds: faster and louder into the "1"
            const beats = Math.max(1, Math.round(len / beatSec));
            const hits = [];
            const seg = beats / 4;
            [1, 0.5, 0.25, 0.125].forEach((step, i) => {
                for (let b = i * seg; b < (i + 1) * seg - 1e-6; b += step) hits.push(b);
            });
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.setValueAtTime(200, t);
            hp.frequency.exponentialRampToValueAtTime(1500, t + len);
            hp.connect(dest);
            hits.forEach(b => {
                const at = t + b * beatSec;
                const vol = 0.08 + 0.3 * (b / beats);
                const g = gainNode(ctx, 0);
                g.gain.setValueAtTime(vol, at);
                g.gain.exponentialRampToValueAtTime(0.001, at + 0.13);
                const bp = ctx.createBiquadFilter();
                bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.8;
                noiseSrc(ctx, 0.15, at).connect(bp); bp.connect(g);
                const body = ctx.createOscillator();
                body.type = 'triangle';
                body.frequency.setValueAtTime(240, at);
                body.frequency.exponentialRampToValueAtTime(160, at + 0.06);
                const bg = gainNode(ctx, 0);
                bg.gain.setValueAtTime(vol * 0.8, at);
                bg.gain.exponentialRampToValueAtTime(0.001, at + 0.08);
                body.connect(bg); bg.connect(g);
                body.start(at); body.stop(at + 0.1);
                g.connect(hp);
            });
            return len;
        },
        reverse(ctx, dest, t, len) {
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass'; hp.frequency.value = 4000;
            const pk = ctx.createBiquadFilter();
            pk.type = 'peaking'; pk.frequency.value = 9000; pk.gain.value = 6;
            const g = gainNode(ctx, 0);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.4, t + len - 0.01);
            g.gain.setValueAtTime(0, t + len);
            noiseSrc(ctx, len, t).connect(hp); hp.connect(pk); pk.connect(g); g.connect(dest);
            return len;
        },
        downlifter(ctx, dest, t, len) {
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass'; bp.Q.value = 1.2;
            bp.frequency.setValueAtTime(9000, t);
            bp.frequency.exponentialRampToValueAtTime(250, t + len);
            const g = gainNode(ctx, 0);
            g.gain.setValueAtTime(0.35, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + len);
            noiseSrc(ctx, len, t).connect(bp); bp.connect(g); g.connect(dest);
            return len;
        },
        subdrop(ctx, dest, t) {
            const o = ctx.createOscillator();
            o.frequency.setValueAtTime(95, t);
            o.frequency.exponentialRampToValueAtTime(28, t + 1.8);
            const sh = ctx.createWaveShaper();
            const curve = new Float32Array(1024);
            for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(2.2 * (i / 512 - 1));
            sh.curve = curve;
            const g = gainNode(ctx, 0);
            g.gain.setValueAtTime(0.55, t);
            g.gain.setValueAtTime(0.55, t + 0.4);
            g.gain.exponentialRampToValueAtTime(0.001, t + 2);
            o.connect(sh); sh.connect(g); g.connect(dest);
            o.start(t); o.stop(t + 2.05);
            return 2;
        },
        stab(ctx, dest, t, len, beatSec, key) {
            // Minor chord on the key of the track that's playing (so it's never out of tune)
            let root = 57; // A
            if (key && key.name) {
                const n = NOTES.indexOf(key.name.replace(/m$/, ''));
                if (n >= 0) root = 48 + n + (n < 5 ? 12 : 0);
            }
            const minor = !key || /m$/.test(key.name);
            const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.Q.value = 4;
            lp.frequency.setValueAtTime(5000, t);
            lp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
            const g = gainNode(ctx, 0);
            g.gain.setValueAtTime(0.16, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
            lp.connect(g); g.connect(dest); g.connect(reverb(ctx, dest));
            [0, minor ? 3 : 4, 7, 12].forEach(iv => [-8, 8].forEach(det => {
                const o = ctx.createOscillator();
                o.type = 'sawtooth'; o.detune.value = det;
                o.frequency.value = hz(root + iv);
                o.connect(lp); o.start(t); o.stop(t + 0.5);
            }));
            return 1.5;
        },
        horn(ctx, dest, t) {
            // Dancehall air horn: short-short-long blasts
            [[0, 0.13], [0.2, 0.13], [0.4, 0.75]].forEach(([at, len]) => {
                const env = ctx.createGain();
                const shaper = ctx.createWaveShaper();
                const curve = new Float32Array(1024);
                for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(3 * x); }
                shaper.curve = curve;
                const tone = ctx.createBiquadFilter();
                tone.type = 'peaking'; tone.frequency.value = 1400; tone.gain.value = 8;
                [1, 1.5, 2.01].forEach(mult => {
                    const osc = ctx.createOscillator();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(330 * mult, t + at);
                    osc.frequency.linearRampToValueAtTime(370 * mult, t + at + 0.06);
                    osc.connect(shaper);
                    osc.start(t + at);
                    osc.stop(t + at + len + 0.05);
                });
                shaper.connect(tone); tone.connect(env); env.connect(dest);
                env.gain.setValueAtTime(0, t + at);
                env.gain.linearRampToValueAtTime(0.22, t + at + 0.02);
                env.gain.setValueAtTime(0.22, t + at + len - 0.04);
                env.gain.linearRampToValueAtTime(0, t + at + len);
            });
            return 1.2;
        },
    };

    // Plays a pad at audio time `t`; `len` = its length for the ones that build up.
    // `buffer` = your own sample for this pad. Returns how long it sounds (seconds).
    function play(ctx, dest, id, { t = ctx.currentTime + 0.01, len = 4, beatSec = 0.47, key = null, buffer = null } = {}) {
        if (buffer) {
            const s = ctx.createBufferSource();
            s.buffer = buffer;
            s.connect(dest);
            s.start(t);
            return buffer.duration;
        }
        return SOUNDS[id](ctx, dest, t, len, beatSec, key);
    }
    // Length of a sound that doesn't build up (so an 'end' pad can finish on the grid)
    const defaultLen = (pad, beatSec) => (pad.id === 'downlifter' ? 8 * beatSec : 4 * beatSec);

    return { play, defaultLen };
})();
