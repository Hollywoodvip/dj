/* ==========================================================================
   AUDIO ENGINE: decks, mixer bus, demo track generator
   ========================================================================== */
let audioCtx = null;
const Mixer = { master: null, limiter: null, xfA: null, xfB: null, sampler: null };

class Deck {
    constructor(id) {
        this.id = id;              // 'A' | 'B'
        this.key = id.toLowerCase();
        this.audioBuffer = null;
        this.analysis = null;
        this.track = null;         // library entry
        this.sourceNode = null;
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseOffset = 0;
        this.duration = 0;
        this.bpm = 120;

        this.pitch = 1;            // pitch fader
        this.bend = 1;             // temporary: jog / nudge / brake
        this.playbackRate = 1;     // pitch * bend
        this.pitchRange = 0.08;
        this.syncOn = false;

        this.cue = 0;
        this.hotCues = { 1: null, 2: null, 3: null };
        this.loop = { active: false, start: 0, end: 0, beats: 0 };
        this.slip = null;          // roll: where the track would be without the loop
        this.brake = null;
        this.keyNudge = 0;
        this.jogBend = null;
        this.lastJogMove = 0;
        this.jogAngle = 0;
        this.cuePreview = false;
    }

    initAudioNodes(ctx, destination) {
        this.trim = ctx.createGain();        // auto gain: evens out loud and quiet tracks
        this.eqLow = ctx.createBiquadFilter();
        this.eqMid = ctx.createBiquadFilter();
        this.eqHigh = ctx.createBiquadFilter();
        this.filterNode = ctx.createBiquadFilter();
        this.fx = new FXUnit(ctx, this);
        this.gainNode = ctx.createGain();
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 512;

        this.eqLow.type = 'lowshelf';
        this.eqLow.frequency.value = 250;
        this.eqMid.type = 'peaking';
        this.eqMid.frequency.value = 1000;
        this.eqMid.Q.value = 0.6;
        this.eqHigh.type = 'highshelf';
        this.eqHigh.frequency.value = 3500;
        this.filterNode.type = 'allpass';

        this.trim.connect(this.eqLow);
        this.eqLow.connect(this.eqMid);
        this.eqMid.connect(this.eqHigh);
        this.eqHigh.connect(this.filterNode);
        this.filterNode.connect(this.fx.input);
        this.fx.output.connect(this.gainNode);
        this.gainNode.connect(this.analyser);
        this.analyser.connect(destination);
    }

    /* ---------- beat grid helpers (track seconds) ---------- */
    get beatSec() { return this.analysis ? this.analysis.beatSec : 60 / this.bpm; }
    get firstBeat() { return this.analysis ? this.analysis.firstBeat : 0; }
    get downbeat() { return this.analysis ? this.analysis.downbeat : 0; }
    get effectiveBpm() { return this.bpm * this.pitch; }

    beatPosition(pos = this.getCurrentTime()) {
        return (pos - this.firstBeat) / this.beatSec;
    }

    nearestBeat(pos) {
        if (!this.analysis) return pos;
        return this.firstBeat + Math.round(this.beatPosition(pos)) * this.beatSec;
    }

    // Grid start at or before pos for a given unit (seconds)
    floorToGrid(pos, unit) {
        if (!this.analysis) return pos;
        return this.firstBeat + Math.floor((pos - this.firstBeat) / unit + 1e-6) * unit;
    }

    nextBarAfter(pos) {
        const bar = this.beatSec * 4;
        return this.downbeat + Math.ceil((pos - this.downbeat) / bar) * bar;
    }

    /* ---------- transport ---------- */
    load(buffer, analysis, track) {
        if (this.isPlaying) this.pause();
        this.audioBuffer = buffer;
        this.analysis = analysis;
        this.track = track;
        this.duration = buffer.duration;
        this.bpm = analysis ? analysis.bpm : 120;
        this.cue = analysis ? Math.max(0, analysis.mixIn) : 0;
        this.pauseOffset = this.cue;
        this.hotCues = { 1: null, 2: null, 3: null };
        this.loop = { active: false, start: 0, end: 0, beats: 0 };
        this.slip = null;
        this.brake = null;
        this.bend = 1;
        this.syncOn = false;
        this.playbackRate = this.pitch;
        // Level every track to about -12 dBFS RMS on its loud parts
        this.trimDb = analysis && analysis.loudness !== undefined ? Math.max(-9, Math.min(6, -12 - analysis.loudness)) : 0;
        if (this.trim) this.trim.gain.setTargetAtTime(Math.pow(10, this.trimDb / 20), audioCtx.currentTime, 0.02);
    }

    // offset: track position; when: AudioContext time to start (0 = now)
    play(offset = null, when = 0) {
        if (!this.audioBuffer || !audioCtx) return;
        if (this.isPlaying) this.stopSource();

        const src = audioCtx.createBufferSource();
        src.buffer = this.audioBuffer;
        src.playbackRate.value = this.playbackRate;
        if (this.loop.active) {
            src.loop = true;
            src.loopStart = this.loop.start;
            src.loopEnd = this.loop.end;
        }
        src.connect(this.trim);
        this.sourceNode = src;

        const startPos = Math.max(0, Math.min(offset !== null ? offset : this.pauseOffset, this.duration - 0.01));
        const startAt = Math.max(when, audioCtx.currentTime);
        this.startTime = startAt - startPos / this.playbackRate;
        src.start(startAt, startPos);
        this.isPlaying = true;

        src.onended = () => {
            if (this.sourceNode !== src) return; // replaced by a seek/loop/restart
            this.isPlaying = false;
            this.sourceNode = null;
            this.pauseOffset = this.duration;
        };
    }

    pause() {
        if (!this.isPlaying) return;
        this.pauseOffset = this.getCurrentTime();
        this.stopSource();
        this.isPlaying = false;
    }

    stopSource() {
        if (this.sourceNode) {
            const src = this.sourceNode;
            this.sourceNode = null;
            try { src.stop(); src.disconnect(); } catch (e) {}
        }
    }

    getCurrentTime() {
        if (!this.isPlaying) return this.pauseOffset;
        let pos = (audioCtx.currentTime - this.startTime) * this.playbackRate;
        if (this.loop.active && pos >= this.loop.end) {
            const len = this.loop.end - this.loop.start;
            pos = this.loop.start + ((pos - this.loop.start) % len);
        }
        return Math.max(0, Math.min(pos, this.duration));
    }

    seek(seconds) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) this.stopSource();
        this.isPlaying = false;
        this.pauseOffset = Math.max(0, Math.min(seconds, this.duration));
        if (this.loop.active && (this.pauseOffset < this.loop.start || this.pauseOffset >= this.loop.end)) this.loop.active = false;
        if (wasPlaying) this.play();
    }

    // Rebase the clock so a speed change never moves the playhead
    applyRate() {
        const rate = Math.max(0.01, this.pitch * this.bend);
        if (rate === this.playbackRate) return;
        if (this.isPlaying && this.sourceNode) {
            const pos = this.getCurrentTime();
            this.playbackRate = rate;
            this.startTime = audioCtx.currentTime - pos / rate;
            this.sourceNode.playbackRate.setValueAtTime(rate, audioCtx.currentTime);
        } else {
            this.playbackRate = rate;
        }
    }

    setPitch(pitch) {
        this.pitch = pitch;
        this.applyRate();
    }

    /* ---------- loops & roll ---------- */
    setLoop(start, length, beats) {
        this.loop = { active: true, start, end: Math.min(start + length, this.duration), beats };
        if (this.sourceNode) {
            this.sourceNode.loopStart = this.loop.start;
            this.sourceNode.loopEnd = this.loop.end;
            this.sourceNode.loop = true;
        }
    }

    exitLoop() {
        if (!this.loop.active) return;
        const pos = this.getCurrentTime();
        this.loop.active = false;
        if (this.isPlaying && this.sourceNode) {
            this.sourceNode.loop = false;
            this.startTime = audioCtx.currentTime - pos / this.playbackRate;
        }
    }

    loopBeats(beats) {
        if (!this.audioBuffer) return;
        const len = beats * this.beatSec;
        if (this.loop.active && this.loop.beats === beats && !this.slip) {
            this.exitLoop();
            return;
        }
        const pos = this.getCurrentTime();
        const start = this.loop.active ? this.loop.start : this.floorToGrid(pos, Math.min(len, this.beatSec));
        this.setLoop(start, len, beats);
    }

    startRoll(beats) {
        if (!this.isPlaying) return;
        const pos = this.getCurrentTime();
        if (!this.slip) this.slip = { pos, last: audioCtx.currentTime };
        const len = beats * this.beatSec;
        const start = this.floorToGrid(this.slip.pos, Math.min(len, this.beatSec));
        this.setLoop(start, len, beats);
    }

    stopRoll() {
        if (!this.slip) return;
        const target = this.slip.pos;
        this.slip = null;
        this.loop.active = false;
        if (this.isPlaying) this.seek(target);
        else this.pauseOffset = target;
    }

    /* ---------- per-frame updates ---------- */
    tick(nowMs) {
        const now = audioCtx.currentTime;
        if (this.slip) {
            this.slip.pos += (now - this.slip.last) * this.playbackRate;
            this.slip.last = now;
        }

        let bend = 1;
        if (this.brake) {
            const t = (nowMs - this.brake.start) / this.brake.duration;
            if (t >= 1) {
                this.brake = null;
                this.pause();
            } else {
                bend = Math.max(0.02, Math.pow(1 - t, 1.6));
            }
        } else if (this.jogBend !== null && nowMs - this.lastJogMove < 80) {
            bend = this.jogBend;
        } else if (this.keyNudge) {
            bend = 1 + 0.04 * this.keyNudge;
        }
        if (bend !== this.bend) {
            this.bend = bend;
            this.applyRate();
        }
        if (this.fx) this.fx.update();
    }

    startBrake(duration = 900) {
        if (!this.isPlaying || this.brake) return;
        this.brake = { start: performance.now(), duration };
    }

    // Vinyl spin-back: play the last seconds reversed while slowing down, then stop
    spinback() {
        if (!this.isPlaying || !this.audioBuffer) return;
        const pos = this.getCurrentTime();
        const buf = this.audioBuffer;
        const sr = buf.sampleRate;
        const len = Math.min(pos, 2.5);
        const n = Math.floor(len * sr);
        this.pause();
        this.bend = 1;
        this.applyRate();
        if (n < sr * 0.1) return;
        const rev = audioCtx.createBuffer(buf.numberOfChannels, n, sr);
        const end = Math.floor(pos * sr);
        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
            const srcData = buf.getChannelData(ch);
            const out = rev.getChannelData(ch);
            for (let i = 0; i < n; i++) out[i] = srcData[end - 1 - i];
        }
        const src = audioCtx.createBufferSource();
        src.buffer = rev;
        const g = audioCtx.createGain();
        const t = audioCtx.currentTime;
        src.playbackRate.setValueAtTime(2.8, t);
        src.playbackRate.exponentialRampToValueAtTime(0.25, t + 1.3);
        g.gain.setValueAtTime(1, t);
        g.gain.linearRampToValueAtTime(0, t + 1.3);
        src.connect(g);
        g.connect(this.trim);
        src.start(t);
        src.stop(t + 1.35);
        this.pauseOffset = Math.max(0, pos - 1.3);
    }
}

function initAudioEngine() {
    if (audioCtx) return false;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext({ latencyHint: 'interactive' });

    Mixer.limiter = audioCtx.createDynamicsCompressor();
    Mixer.limiter.threshold.value = -2;
    Mixer.limiter.knee.value = 0;
    Mixer.limiter.ratio.value = 20;
    Mixer.limiter.attack.value = 0.003;
    Mixer.limiter.release.value = 0.2;
    Mixer.limiter.connect(audioCtx.destination);

    Mixer.master = audioCtx.createGain();
    Mixer.master.connect(Mixer.limiter);
    Mixer.xfA = audioCtx.createGain();
    Mixer.xfB = audioCtx.createGain();
    Mixer.xfA.connect(Mixer.master);
    Mixer.xfB.connect(Mixer.master);
    Mixer.sampler = audioCtx.createGain();
    Mixer.sampler.connect(Mixer.master);
    return true;
}

/* ---------------- Demo tracks: structured 48-bar grooves, built from 1-bar loops ---------------- */
async function renderDemoLayer(bpm, sr, build) {
    const beat = 60 / bpm;
    const ctx = new OfflineAudioContext(2, Math.ceil(4 * beat * sr), sr);
    build(ctx, beat);
    return ctx.startRendering();
}

async function generateDemoTrack(bpm, variant) {
    const sr = audioCtx.sampleRate;
    const roots = variant === 1 ? [57, 53, 60, 55] : [62, 58, 65, 60]; // A-minor-ish / D-minor-ish
    const noise = (ctx, len) => {
        const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return b;
    };
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

    const drums = await renderDemoLayer(bpm, sr, (ctx, beat) => {
        for (let i = 0; i < 4; i++) {
            const t = i * beat;
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.frequency.setValueAtTime(150, t);
            o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
            g.gain.setValueAtTime(1, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            o.connect(g).connect(ctx.destination);
            o.start(t); o.stop(t + 0.32);

            const h = ctx.createBufferSource(), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
            h.buffer = noise(ctx, 0.06);
            hf.type = 'highpass'; hf.frequency.value = 7500;
            hg.gain.setValueAtTime(0.28, t + beat / 2);
            hg.gain.exponentialRampToValueAtTime(0.001, t + beat / 2 + 0.05);
            h.connect(hf).connect(hg).connect(ctx.destination);
            h.start(t + beat / 2);

            if (i % 2 === 1) {
                const c = ctx.createBufferSource(), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
                c.buffer = noise(ctx, 0.2);
                cf.type = 'bandpass'; cf.frequency.value = 1600; cf.Q.value = 0.8;
                cg.gain.setValueAtTime(0.5, t);
                cg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                c.connect(cf).connect(cg).connect(ctx.destination);
                c.start(t);
            }
        }
    });

    const bassBars = [], chordBars = [];
    for (const root of roots) {
        bassBars.push(await renderDemoLayer(bpm, sr, (ctx, beat) => {
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 500;
            lp.connect(ctx.destination);
            for (let i = 0; i < 8; i++) {
                const t = i * beat / 2 + (i % 2 ? 0 : 0.0);
                if (i % 2 === 0) continue; // off-beat bass
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sawtooth';
                o.frequency.value = hz(root - 24);
                g.gain.setValueAtTime(0.35, t);
                g.gain.exponentialRampToValueAtTime(0.01, t + beat / 2 - 0.01);
                o.connect(g).connect(lp);
                o.start(t); o.stop(t + beat / 2);
            }
        }));
        chordBars.push(await renderDemoLayer(bpm, sr, (ctx, beat) => {
            [0, 3, 7, 10].forEach(iv => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'triangle';
                o.frequency.value = hz(root + iv);
                g.gain.setValueAtTime(0.0001, 0);
                g.gain.linearRampToValueAtTime(0.06, 0.08);
                g.gain.setValueAtTime(0.06, 4 * beat - 0.1);
                g.gain.linearRampToValueAtTime(0.0001, 4 * beat);
                o.connect(g).connect(ctx.destination);
                o.start(0); o.stop(4 * beat);
            });
        }));
    }

    // [bars, drums, bass, chords]
    const sections = [[8, 1, 0, 0], [8, 1, 1, 0.6], [8, 1, 1, 1], [8, 0, 0, 1], [8, 1, 1, 1], [8, 1, 0, 0.3]];
    const barLen = drums.length;
    const totalBars = sections.reduce((a, s) => a + s[0], 0);
    const out = audioCtx.createBuffer(2, barLen * totalBars + sr, sr);
    let bar = 0;
    for (const [bars, gd, gb, gc] of sections) {
        for (let i = 0; i < bars; i++, bar++) {
            const layers = [[drums, gd], [bassBars[bar % 4], gb], [chordBars[bar % 4], gc]];
            for (let ch = 0; ch < 2; ch++) {
                const o = out.getChannelData(ch);
                const base = bar * barLen;
                for (const [layer, gain] of layers) {
                    if (!gain) continue;
                    const d = layer.getChannelData(ch);
                    for (let s = 0; s < d.length && base + s < o.length; s++) o[base + s] += d[s] * gain;
                }
            }
        }
    }
    return out;
}
