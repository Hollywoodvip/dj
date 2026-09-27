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

/* ---------------- Sampler pads (synthesized live, no files needed) ---------------- */
const SAMPLER_PADS = [
    { id: 'horn', label: 'AIR HORN', icon: 'fa-bullhorn' },
    { id: 'siren', label: 'SIREN', icon: 'fa-bell' },
    { id: 'riser', label: 'RISER', icon: 'fa-arrow-trend-up' },
    { id: 'laser', label: 'LASER', icon: 'fa-bolt' },
];

const Sampler = {
    play(ctx, dest, id, beatSec = 0.47) {
        const t = ctx.currentTime + 0.01;
        if (id === 'horn') {
            // Dancehall air horn: short-short-long blasts
            [[0, 0.13], [0.2, 0.13], [0.4, 0.75]].forEach(([at, len]) => {
                const env = ctx.createGain();
                const shaper = ctx.createWaveShaper();
                const curve = new Float32Array(1024);
                for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(3 * x); }
                shaper.curve = curve;
                const tone = ctx.createBiquadFilter();
                tone.type = 'peaking';
                tone.frequency.value = 1400;
                tone.gain.value = 8;
                [1, 1.5, 2.01].forEach(mult => {
                    const osc = ctx.createOscillator();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(330 * mult, t + at);
                    osc.frequency.linearRampToValueAtTime(370 * mult, t + at + 0.06);
                    osc.connect(shaper);
                    osc.start(t + at);
                    osc.stop(t + at + len + 0.05);
                });
                shaper.connect(tone);
                tone.connect(env);
                env.connect(dest);
                env.gain.setValueAtTime(0, t + at);
                env.gain.linearRampToValueAtTime(0.22, t + at + 0.02);
                env.gain.setValueAtTime(0.22, t + at + len - 0.04);
                env.gain.linearRampToValueAtTime(0, t + at + len);
            });
        } else if (id === 'siren') {
            // Dub siren: LFO-swept square wave
            const len = beatSec * 8;
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = 700;
            const lfo = ctx.createOscillator();
            lfo.type = 'triangle';
            lfo.frequency.value = 1 / beatSec;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 350;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 2500;
            const env = ctx.createGain();
            env.gain.setValueAtTime(0, t);
            env.gain.linearRampToValueAtTime(0.12, t + 0.05);
            env.gain.setValueAtTime(0.12, t + len - 0.3);
            env.gain.linearRampToValueAtTime(0, t + len);
            osc.connect(lp);
            lp.connect(env);
            env.connect(dest);
            osc.start(t); lfo.start(t);
            osc.stop(t + len); lfo.stop(t + len);
        } else if (id === 'riser') {
            // 8-beat white-noise sweep + rising tone, lands on the beat
            const len = beatSec * 8;
            const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
            const d = noise.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            const src = ctx.createBufferSource();
            src.buffer = noise;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.Q.value = 2;
            bp.frequency.setValueAtTime(300, t);
            bp.frequency.exponentialRampToValueAtTime(9000, t + len);
            const env = ctx.createGain();
            env.gain.setValueAtTime(0.001, t);
            env.gain.exponentialRampToValueAtTime(0.35, t + len);
            env.gain.linearRampToValueAtTime(0, t + len + 0.02);
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(110, t);
            osc.frequency.exponentialRampToValueAtTime(880, t + len);
            const oscGain = ctx.createGain();
            oscGain.gain.value = 0.15;
            src.connect(bp); bp.connect(env);
            osc.connect(oscGain); oscGain.connect(env);
            env.connect(dest);
            src.start(t); osc.start(t);
            src.stop(t + len + 0.05); osc.stop(t + len + 0.05);
        } else if (id === 'laser') {
            [0, 0.12, 0.24].forEach(at => {
                const osc = ctx.createOscillator();
                osc.type = 'square';
                osc.frequency.setValueAtTime(2400, t + at);
                osc.frequency.exponentialRampToValueAtTime(120, t + at + 0.18);
                const env = ctx.createGain();
                env.gain.setValueAtTime(0.14, t + at);
                env.gain.exponentialRampToValueAtTime(0.001, t + at + 0.2);
                osc.connect(env);
                env.connect(dest);
                osc.start(t + at);
                osc.stop(t + at + 0.22);
            });
        }
    },
};
