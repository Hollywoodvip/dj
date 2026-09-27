/* ==========================================================================
   TRACK ANALYSIS
   BPM + beat grid, downbeats, 3-band waveform, energy sections,
   recommended mix points and musical key (Camelot).
   ========================================================================== */
const Analysis = (() => {
    // Bump when the analysis changes: saved tracks get re-analysed in the background
    // 6: the outro starts where the lead (vocals/melody = mids + highs) leaves, not where
    //    the kick stops (tech house / melodic techno keep kick + bass to the very end)
    // 7: dembow check (the 3-3-2 snare made 90–100 BPM reggaeton read as 4/3 faster)
    const VERSION = 7;
    const FPS = 100;            // feature frames per second
    const FEATURE_RATE = 22050; // analysis sample rate

    // Render the track once into 3 filtered bands (low / mid / high), mono
    async function renderBands(buffer) {
        const length = Math.ceil(buffer.duration * FEATURE_RATE);
        const ctx = new OfflineAudioContext(3, length, FEATURE_RATE);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const merger = ctx.createChannelMerger(3);

        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.value = 200;
        const mid = ctx.createBiquadFilter();
        mid.type = 'bandpass';
        mid.frequency.value = 1000;
        mid.Q.value = 0.6;
        const high = ctx.createBiquadFilter();
        high.type = 'highpass';
        high.frequency.value = 3000;

        [low, mid, high].forEach((f, i) => {
            src.connect(f);
            f.connect(merger, 0, i);
        });
        merger.connect(ctx.destination);
        src.start();
        const rendered = await ctx.startRendering();
        return [0, 1, 2].map(ch => rendered.getChannelData(ch));
    }

    function frameRMS(data) {
        const hop = FEATURE_RATE / FPS;
        const frames = Math.floor(data.length / hop);
        const out = new Float32Array(frames);
        for (let f = 0; f < frames; f++) {
            const a = Math.floor(f * hop);
            const b = Math.min(data.length, Math.floor((f + 1) * hop));
            let s = 0;
            for (let i = a; i < b; i++) s += data[i] * data[i];
            out[f] = Math.sqrt(s / Math.max(1, b - a));
        }
        return out;
    }

    function percentile(arr, p) {
        const sorted = Float32Array.from(arr).sort();
        return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] || 1e-9;
    }

    function movingAverage(arr, radius) {
        const out = new Float32Array(arr.length);
        let sum = 0;
        let count = 0;
        for (let i = 0; i < arr.length + radius; i++) {
            if (i < arr.length) { sum += arr[i]; count++; }
            if (i - 2 * radius - 1 >= 0) { sum -= arr[i - 2 * radius - 1]; count--; }
            const c = i - radius;
            if (c >= 0 && c < arr.length) out[c] = sum / count;
        }
        return out;
    }

    // Onset strength: positive log-energy flux summed over the bands
    function onsetEnvelope(bands) {
        const frames = bands[0].length;
        const onset = new Float32Array(frames);
        const weights = [1.0, 0.8, 0.7];
        bands.forEach((band, bi) => {
            const norm = percentile(band, 0.95);
            const flux = new Float32Array(frames);
            let prev = 0;
            for (let f = 0; f < frames; f++) {
                const v = Math.log1p(20 * band[f] / norm);
                flux[f] = Math.max(0, v - prev);
                prev = v;
            }
            const mean = flux.reduce((a, b) => a + b, 0) / frames || 1;
            for (let f = 0; f < frames; f++) onset[f] += weights[bi] * flux[f] / mean;
        });
        // Adaptive threshold: keep what sticks out of the local average
        const local = movingAverage(onset, Math.round(FPS * 0.25));
        for (let f = 0; f < frames; f++) onset[f] = Math.max(0, onset[f] - local[f]);
        return onset;
    }

    function autocorrelation(onset, maxLag) {
        const n = onset.length;
        const ac = new Float32Array(maxLag + 2);
        for (let lag = 1; lag <= maxLag + 1; lag++) {
            let s = 0;
            for (let i = 0; i + lag < n; i++) s += onset[i] * onset[i + lag];
            ac[lag] = s / (n - lag);
        }
        return ac;
    }

    function interp(arr, x) {
        const i = Math.floor(x);
        if (i < 0 || i + 1 >= arr.length) return 0;
        const t = x - i;
        return arr[i] * (1 - t) + arr[i + 1] * t;
    }

    // Coarse tempo: autocorrelation with bar-level harmonics and a mild tempo prior
    function estimateTempo(onset) {
        const minBpm = 70, maxBpm = 180;
        const maxLag = Math.ceil(4 * 60 * FPS / minBpm);
        const ac = autocorrelation(onset, maxLag);
        let best = 120, bestScore = -Infinity;
        for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.25) {
            const lag = 60 * FPS / bpm;
            const score = interp(ac, lag) + 0.5 * interp(ac, 2 * lag) + 0.25 * interp(ac, 4 * lag);
            const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 118) / 0.9, 2));
            if (score * prior > bestScore) {
                bestScore = score * prior;
                best = bpm;
            }
        }
        return best;
    }

    // Dembow / reggaeton: the 3-3-2 snare repeats every 3/4 of a beat, so the tempo can
    // come out 4/3 too fast (a 90 BPM perreo read as 120). The kick lands on every real
    // beat: compare how well the low band repeats at the detected beat vs 3/4 of it
    function dembowCheck(bpm, lowOnset) {
        const slow = bpm * 0.75;
        if (bpm < 108 || slow < 76) return bpm;
        const ac = autocorrelation(lowOnset, Math.ceil(4 * 60 * FPS / slow) + 2);
        const score = (b) => { const lag = 60 * FPS / b; return interp(ac, lag) + 0.5 * interp(ac, 2 * lag) + 0.5 * interp(ac, 4 * lag); };
        return score(slow) > 1.1 * score(bpm) ? slow : bpm;
    }

    // Fine tempo + phase: fold the onset envelope over candidate beat periods
    function refineGrid(onset, bpmGuess, exact = false) {
        const BINS = 48;
        let best = { bpm: bpmGuess, phase: 0, score: -Infinity };
        const hist = new Float32Array(BINS);
        const lo = exact ? bpmGuess : bpmGuess * 0.98;
        const hi = exact ? bpmGuess : bpmGuess * 1.02;
        for (let bpm = lo; bpm <= hi + 1e-9; bpm += 0.02) {
            const period = 60 * FPS / bpm;
            hist.fill(0);
            for (let f = 0; f < onset.length; f++) {
                if (onset[f] === 0) continue;
                const ph = (f % period) / period;
                hist[Math.floor(ph * BINS) % BINS] += onset[f];
            }
            let mean = 0;
            for (let b = 0; b < BINS; b++) mean += hist[b];
            mean /= BINS;
            for (let b = 0; b < BINS; b++) {
                const peak = hist[b] + 0.5 * (hist[(b + 1) % BINS] + hist[(b + BINS - 1) % BINS]);
                const score = peak / (mean || 1);
                if (score > best.score) best = { bpm, phase: (b + 0.5) / BINS * period / FPS, score };
            }
        }
        // Most produced music sits on whole (or half) BPM values
        const rounded = Math.round(best.bpm * 2) / 2;
        if (!exact && Math.abs(rounded - best.bpm) < 0.08) best.bpm = rounded;
        return best;
    }

    // Choose which of the 4 beats is the downbeat: section changes land on bar starts
    function findDownbeat(firstBeat, beatSec, energyFrames) {
        const beats = [];
        for (let t = firstBeat; t < energyFrames.length / FPS; t += beatSec) {
            const a = Math.max(0, Math.floor(t * FPS));
            const b = Math.min(energyFrames.length, Math.floor((t + beatSec) * FPS));
            let s = 0;
            for (let i = a; i < b; i++) s += energyFrames[i];
            beats.push(s / Math.max(1, b - a));
        }
        const novelty = [];
        let maxNovelty = 0;
        for (let k = 4; k < beats.length - 4; k++) {
            const before = (beats[k - 4] + beats[k - 3] + beats[k - 2] + beats[k - 1]) / 4;
            const after = (beats[k] + beats[k + 1] + beats[k + 2] + beats[k + 3]) / 4;
            const n = Math.max(0, after - before);
            novelty.push([k, n]);
            maxNovelty = Math.max(maxNovelty, n);
        }
        // Only real section changes vote (small beat-to-beat jitter would drown them otherwise)
        const scores = [0, 0, 0, 0];
        novelty.forEach(([k, n], i) => {
            const isPeak = n >= (novelty[i - 1]?.[1] ?? 0) && n >= (novelty[i + 1]?.[1] ?? 0);
            if (isPeak && n > 0.3 * maxNovelty) scores[k % 4] += n;
        });
        let p = 0;
        for (let i = 1; i < 4; i++) if (scores[i] > scores[p]) p = i;
        return p;
    }

    // Is there an actual beat in each bar? YouTube videos often open (or close) with
    // talking, skits or ambience: sound, but nothing you can mix over. A real groove
    // repeats every beat, so the onset envelope correlates with itself one beat later.
    function rhythmPerBar(onset, downbeat, beatSec, duration) {
        const barSec = beatSec * 4;
        const lag = Math.round(beatSec * FPS);
        const scores = [];
        for (let t = downbeat; t + barSec <= duration + 0.01; t += barSec) {
            const a = Math.max(0, Math.floor(t * FPS));
            const b = Math.min(onset.length - lag - 2, Math.floor((t + barSec) * FPS));
            let num = 0, den = 0;
            for (let f = a; f < b; f++) {
                const o = onset[f];
                if (!o) continue;
                const later = Math.max(onset[f + lag - 1], onset[f + lag], onset[f + lag + 1]);
                num += o * later;
                den += o * o;
            }
            scores.push(den > 0 ? num / den : 0);
        }
        return scores;
    }

    function analyzeStructure(energyFrames, downbeat, beatSec, duration, rhythm = null) {
        const barSec = beatSec * 4;
        const bars = [];
        for (let t = downbeat; t + barSec <= duration + 0.01; t += barSec) {
            const a = Math.max(0, Math.floor(t * FPS));
            const b = Math.min(energyFrames.length, Math.floor((t + barSec) * FPS));
            let s = 0;
            for (let i = a; i < b; i++) s += energyFrames[i];
            bars.push(s / Math.max(1, b - a));
        }
        const totalBars = bars.length;
        if (totalBars < 8) {
            return { bars: [], mixIn: downbeat, introEnd: downbeat, outroStart: duration, mixOut: Math.max(downbeat, duration - barSec * 4), mixBars: 4, breakdowns: [], phraseStart: downbeat, musicEnd: duration };
        }
        const ref = percentile(bars, 0.9);
        const norm = bars.map(v => Math.min(1, v / ref));

        const HIGH = 0.72;
        // A bar is "music" when it has some level AND a repeating beat
        const beat = (i) => !rhythm || (rhythm[i] || 0) >= 0.3;
        const music = norm.map((v, i) => v > 0.08 && beat(i));
        const steady = (i) => music[i] && music[i + 1] && (music[i + 2] || music[i + 3]);
        let firstMusic = 0;
        while (firstMusic < totalBars - 8 && !steady(firstMusic)) firstMusic++;
        let lastMusic = totalBars - 1;
        while (lastMusic > firstMusic + 8 && !(music[lastMusic] && music[lastMusic - 1] && (music[lastMusic - 2] || music[lastMusic - 3]))) lastMusic--;

        const firstSound = firstMusic;
        let introEndBar = norm.findIndex((v, i) => i >= firstMusic && v >= HIGH);
        if (introEndBar < 0) introEndBar = firstMusic;
        let lastHigh = Math.min(totalBars, lastMusic + 1) - 1;
        while (lastHigh > firstMusic && norm[lastHigh] < HIGH) lastHigh--;
        let outroStartBar = lastHigh + 1;

        // Phrases (8 bars) are counted from where the music starts, not from 0:00
        const snap = (bar) => firstMusic + Math.round((bar - firstMusic) / 8) * 8;
        const lastUsableBar = lastMusic + 1;

        // Mix out on a phrase boundary, leaving room for at least 8 bars
        let mixOutBar = snap(outroStartBar);
        if (mixOutBar > lastUsableBar) mixOutBar = snap(lastUsableBar - 8);
        while (lastUsableBar - mixOutBar < 8 && mixOutBar - 8 >= introEndBar) mixOutBar -= 8;
        let mixBars = lastUsableBar - mixOutBar;
        mixBars = mixBars >= 32 ? 32 : mixBars >= 16 ? 16 : mixBars >= 8 ? 8 : Math.max(4, mixBars);

        // Breakdowns: sustained low-energy stretches in the body of the track
        const breakdowns = [];
        let runStart = -1;
        for (let i = introEndBar; i <= outroStartBar; i++) {
            const low = i < outroStartBar && norm[i] < 0.5;
            if (low && runStart < 0) runStart = i;
            if (!low && runStart >= 0) {
                if (i - runStart >= 4) breakdowns.push({ start: downbeat + runStart * barSec, end: downbeat + i * barSec });
                runStart = -1;
            }
        }

        return {
            bars: norm,
            mixIn: Math.max(0, downbeat + firstSound * barSec),
            phraseStart: downbeat + firstMusic * barSec,
            musicEnd: downbeat + lastUsableBar * barSec,
            introEnd: downbeat + introEndBar * barSec,
            outroStart: downbeat + outroStartBar * barSec,
            mixOut: downbeat + mixOutBar * barSec,
            mixBars,
            breakdowns,
        };
    }

    /* ---------------- Outro: where the lead leaves ----------------
       Learned from the user's real library (historial branch): extended mixes keep the
       kick and bass through the outro, so total energy put the outro at the very end
       and mixes shrank to 4 bars. Walk back 8-bar phrases from the end while their
       mids+highs stay under the body's level: that's the DJ outro (max 32 bars). Tracks
       without one (live edits, radio edits) still get at least 16 bars to mix over. */
    function refineOutro(a) {
        if (!a) return a;
        a.version = Math.max(a.version || 0, 6); // an upgraded v5 still lacks the v7 tempo check
        if (!a.wave || !a.wave[1] || !a.beatSec || a.musicEnd === undefined) return a;
        const bar = 4 * a.beatSec, db = a.downbeat;
        const mid = a.wave[1], high = a.wave[2];
        const toBar = (t) => Math.round((t - db) / bar);
        const lu = toBar(a.musicEnd), ie = toBar(a.introEnd), ps = toBar(a.phraseStart ?? db);
        const old = toBar(a.outroStart);
        const lead = (from, to) => {
            let s = 0, n = 0;
            const j1 = Math.min(mid.length, Math.floor((db + to * bar) * FPS));
            for (let j = Math.max(0, Math.floor((db + from * bar) * FPS)); j < j1; j++) { s += mid[j] + high[j]; n++; }
            return n ? s / n : 0;
        };
        const phrases = [];
        for (let p = ps; p < lu; p += 8) if (Math.min(p + 8, lu) - p >= 2) phrases.push({ p, e: lead(p, Math.min(p + 8, lu)) });
        const body = phrases.filter(x => x.p >= ie && x.p + 8 <= lu).map(x => x.e);
        let start = old;
        if (body.length >= 3) {
            const main = percentile(body, 0.75);
            let s = null;
            for (let i = phrases.length - 1; i >= 0; i--) {
                const x = phrases[i];
                if (x.p <= ie + 8) break;
                if (x.e < 0.85 * main) s = x.p; else break;
            }
            if (s !== null) start = Math.max(Math.min(old, s), lu - 32, ie + 16);
        }
        let mixOutBar = ps + Math.round((start - ps) / 8) * 8;
        if (mixOutBar > lu - 4) mixOutBar -= 8;
        const want = lu - ie >= 64 ? 16 : 8;
        while (lu - mixOutBar < want && mixOutBar - 8 >= ie) mixOutBar -= 8;
        const room = lu - mixOutBar;
        a.outroStart = db + start * bar;
        a.mixOut = db + mixOutBar * bar;
        a.mixBars = room >= 32 ? 32 : room >= 16 ? 16 : room >= 8 ? 8 : Math.max(4, room);
        delete a.fastOut;
        return a;
    }

    /* ---------------- Genre from the groove ----------------
       Works from the saved band envelopes (no re-decoding), folded over a 2-beat cell in
       16ths: the dembow puts a hit on the 3rd 16th (¾ of a beat), house/techno puts the
       kick on every beat and the hat on the offbeats. Mixing depends on it: reggaeton /
       urban mix early and short, house / techno mix long in the outro. */
    function detectGenre(a) {
        if (!a || !a.wave || !a.wave[0] || !a.beatSec) return null;
        const [low, mid, high] = a.wave;
        const cell = 2 * a.beatSec, F = FPS;
        const from = Math.max(0, Math.floor((a.phraseStart ?? a.mixIn ?? 0) * F));
        const to = Math.min(low.length, Math.floor((a.musicEnd || a.duration) * F));
        const fold = (env) => {
            const bins = new Float32Array(8), cnt = new Float32Array(8);
            for (let i = from + 1; i < to; i++) {
                const rise = env(i) - env(i - 1);
                if (rise <= 0) continue;
                const ph = (((i / F - a.firstBeat) / cell) % 1 + 1) % 1 * 8;
                const bin = Math.round(ph) % 8;
                if (Math.abs(ph - Math.round(ph)) > 0.3) continue; // only right on a 16th
                bins[bin] += rise; cnt[bin]++;
            }
            const total = bins.reduce((x, y) => x + y, 0) || 1;
            return Array.from(bins, v => v / total);
        };
        const L = fold(i => low[i]);
        const H = fold(i => mid[i] + high[i]);
        // Dembow: the ¾-beat hit (16th 3) against the plain offbeat / off-16ths
        const dembow = H[3] / Math.max(1e-6, (H[1] + H[2] + H[5] + H[7]) / 4);
        // Four on the floor: the kick on the beats (0, 4) against everything else in the low band
        const fourFloor = ((L[0] + L[4]) / 2) / Math.max(1e-6, (L[1] + L[2] + L[3] + L[5] + L[6] + L[7]) / 6);
        const bpm = a.bpm;
        let genre = 'otros';
        if (dembow > 3 && bpm >= 78 && bpm <= 112) genre = 'reggaeton';
        else if (bpm >= 140 && dembow > 3 && fourFloor < 5) genre = 'reggaeton'; // detected at double tempo
        else if (bpm >= 108 && fourFloor > 5) genre = 'electronica';
        else if (bpm < 112 || bpm >= 130) genre = 'urbano'; // hip hop, R&B, pop latino, trap (half-time kick)
        return { genre, dembow: Math.round(dembow * 100) / 100, fourFloor: Math.round(fourFloor * 100) / 100 };
    }

    /* ---------------- Key detection (chroma + Krumhansl profiles) ---------------- */
    const KEY_RATE = 11025;
    const FFT_SIZE = 4096;
    const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
    const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

    function fft(re, im) {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) {
                [re[i], re[j]] = [re[j], re[i]];
                [im[i], im[j]] = [im[j], im[i]];
            }
        }
        for (let len = 2; len <= n; len <<= 1) {
            const ang = -2 * Math.PI / len;
            const wr = Math.cos(ang), wi = Math.sin(ang);
            for (let i = 0; i < n; i += len) {
                let cr = 1, ci = 0;
                for (let k = 0; k < len / 2; k++) {
                    const a = i + k, b = a + len / 2;
                    const tr = re[b] * cr - im[b] * ci;
                    const ti = re[b] * ci + im[b] * cr;
                    re[b] = re[a] - tr; im[b] = im[a] - ti;
                    re[a] += tr; im[a] += ti;
                    const ncr = cr * wr - ci * wi;
                    ci = cr * wi + ci * wr;
                    cr = ncr;
                }
            }
        }
    }

    function pearson(a, b) {
        const n = a.length;
        const ma = a.reduce((s, v) => s + v, 0) / n;
        const mb = b.reduce((s, v) => s + v, 0) / n;
        let num = 0, da = 0, db = 0;
        for (let i = 0; i < n; i++) {
            num += (a[i] - ma) * (b[i] - mb);
            da += (a[i] - ma) ** 2;
            db += (b[i] - mb) ** 2;
        }
        return num / Math.sqrt(da * db || 1);
    }

    async function detectKey(buffer) {
        const ctx = new OfflineAudioContext(1, Math.ceil(buffer.duration * KEY_RATE), KEY_RATE);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start();
        const data = (await ctx.startRendering()).getChannelData(0);

        // Map FFT bins to pitch classes (50 Hz - 2 kHz)
        const binPc = new Int8Array(FFT_SIZE / 2).fill(-1);
        for (let k = 1; k < FFT_SIZE / 2; k++) {
            const f = k * KEY_RATE / FFT_SIZE;
            if (f < 50 || f > 2000) continue;
            const midi = 69 + 12 * Math.log2(f / 440);
            binPc[k] = ((Math.round(midi) % 12) + 12) % 12;
        }
        const window = new Float32Array(FFT_SIZE).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
        const chroma = new Float64Array(12);
        const start = Math.floor(data.length * 0.1);
        const end = Math.floor(data.length * 0.9) - FFT_SIZE;
        const frames = Math.min(240, Math.max(1, Math.floor((end - start) / FFT_SIZE)));
        const step = Math.max(1, Math.floor((end - start) / frames));
        const re = new Float32Array(FFT_SIZE), im = new Float32Array(FFT_SIZE);
        for (let pos = start; pos < end; pos += step) {
            for (let i = 0; i < FFT_SIZE; i++) { re[i] = data[pos + i] * window[i]; im[i] = 0; }
            fft(re, im);
            const frame = new Float64Array(12);
            let total = 0;
            for (let k = 1; k < FFT_SIZE / 2; k++) {
                if (binPc[k] < 0) continue;
                const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
                frame[binPc[k]] += mag;
                total += mag;
            }
            if (total > 1e-6) for (let c = 0; c < 12; c++) chroma[c] += frame[c] / total;
        }

        let best = { score: -Infinity };
        for (let tonic = 0; tonic < 12; tonic++) {
            const rotated = Array.from({ length: 12 }, (_, i) => chroma[(i + tonic) % 12]);
            const maj = pearson(rotated, MAJOR);
            const min = pearson(rotated, MINOR);
            if (maj > best.score) best = { score: maj, tonic, minor: false };
            if (min > best.score) best = { score: min, tonic, minor: true };
        }
        return {
            name: NOTE_NAMES[best.tonic] + (best.minor ? 'm' : ''),
            camelot: (best.minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[best.tonic] + (best.minor ? 'A' : 'B'),
            confidence: best.score,
        };
    }

    // Camelot code after pitching the track by `rate` (no key lock: pitch follows tempo)
    function shiftCamelot(camelot, rate) {
        if (!camelot) return null;
        // Small pitch changes (< ~3.5%) don't really move the key; beyond that round to semitones
        const exact = 12 * Math.log2(rate);
        const semis = Math.abs(exact) < 0.6 ? 0 : Math.round(exact);
        if (!semis) return camelot;
        const n = parseInt(camelot, 10);
        const letter = camelot.slice(-1);
        return (((n - 1 + 7 * semis) % 12 + 12) % 12 + 1) + letter;
    }

    // 2 = perfect/adjacent, 1 = relative/energy change, 0 = clash
    function keyCompatibility(a, b) {
        if (!a || !b) return null;
        const na = parseInt(a, 10), nb = parseInt(b, 10);
        const la = a.slice(-1), lb = b.slice(-1);
        const diff = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
        if (la === lb && diff <= 1) return 2;
        if (na === nb) return 1;
        if (la === lb && diff === 2) return 1;
        return 0;
    }

    // Loudness of the loud parts (90th percentile of 1-second RMS blocks), in dBFS
    function loudnessDb(buffer) {
        const win = Math.floor(buffer.sampleRate);
        const d0 = buffer.getChannelData(0);
        const d1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : d0;
        const blocks = [];
        for (let s = 0; s + win <= d0.length; s += win) {
            let sum = 0;
            for (let i = s; i < s + win; i += 4) { const v = (d0[i] + d1[i]) / 2; sum += v * v; }
            blocks.push(sum / (win / 4));
        }
        if (!blocks.length) return -14;
        blocks.sort((a, b) => a - b);
        return 10 * Math.log10(blocks[Math.floor(blocks.length * 0.9)] || 1e-9);
    }

    function framesFromBands(bands) {
        return bands.map(frameRMS);
    }

    async function analyzeTrack(buffer, knownBpm = null) {
        const bandData = await renderBands(buffer);
        const [low, mid, high] = framesFromBands(bandData);
        const energy = new Float32Array(low.length);
        for (let i = 0; i < low.length; i++) energy[i] = low[i] + 0.8 * mid[i] + 0.5 * high[i];

        const onset = onsetEnvelope([low, mid, high]);
        const guess = knownBpm || dembowCheck(estimateTempo(onset), onsetEnvelope([low]));
        const grid = refineGrid(onset, guess, !!knownBpm);
        const bpm = knownBpm || grid.bpm;
        const beatSec = 60 / bpm;
        // A beat a few ms before 0 belongs to the start of the track, not to the next beat
        const EARLY = 0.05;
        let firstBeat = grid.phase % beatSec;
        if (firstBeat > beatSec - EARLY) firstBeat -= beatSec;

        const p = findDownbeat(Math.max(0, firstBeat), beatSec, energy);
        let downbeat = firstBeat + p * beatSec;
        while (downbeat - 4 * beatSec >= -EARLY) downbeat -= 4 * beatSec;

        const rhythm = rhythmPerBar(onset, downbeat, beatSec, buffer.duration);
        const structure = analyzeStructure(energy, downbeat, beatSec, buffer.duration, rhythm);
        let key = null;
        try { key = await detectKey(buffer); } catch (e) { key = null; }

        // Normalised waveform bands for drawing
        const wave = [low, mid, high].map(band => {
            const ref = percentile(band, 0.985);
            return band.map(v => Math.min(1, v / ref));
        });

        return refineOutro({
            version: VERSION,
            bpm,
            beatSec,
            loudness: loudnessDb(buffer),
            firstBeat,
            downbeat,
            duration: buffer.duration,
            key,
            wave,
            ...structure,
        });
    }
    // The genre goes with every new analysis (older ones get it from their saved envelopes)
    const analyzeTrackBase = analyzeTrack;
    analyzeTrack = async function (buffer, knownBpm = null) {
        const a = await analyzeTrackBase(buffer, knownBpm);
        const g = detectGenre(a);
        a.genre = g ? g.genre : 'otros';
        return a;
    };

    // Beat grid for a track whose tempo is known and starts on the downbeat (demo beats)
    function simpleGrid(buffer, bpm) {
        return analyzeTrack(buffer, bpm);
    }

    return { VERSION, FPS, refineOutro, detectGenre, analyzeTrack, simpleGrid, shiftCamelot, keyCompatibility, detectKey };
})();
