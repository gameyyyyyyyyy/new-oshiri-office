// Plain ES module, no imports. Hybrid synth + streamed-file jukebox.
//
// heya / gedatsu are still pure WebAudio synthesis: TRACK_DEFS + a single
// lookahead scheduler that calls each track's schedule(time, step, env)
// method once per sixteenth-note "step" (same mechanism as before).
//
// sekkai / android / alice / zoo are real audio files under assets/bgm/,
// lazy-loaded on first select (fetch + decodeAudioData, cached per track so
// each file is only ever fetched/decoded once) and played back as full,
// untrimmed songs via AudioBufferSourceNode:
//   - android / alice / zoo: a single file, source.loop = true.
//   - sekkai: two files (sekkai1 then sekkai2) chained back-to-back with
//     sample-accurate look-ahead scheduling (exact durations, scheduled
//     ahead of time on the same interval tick that drives the synth
//     scheduler) so the sekkai1->sekkai2->sekkai1... loop has no gap.
//     onended is only ever used for bookkeeping/cleanup, never to trigger
//     the next chunk - that would reintroduce the gap.
//
// fever.mp3 and ending.m4a are independent of the jukebox entirely (their
// own gain nodes / source lifecycle) - see startFever/stopFever/playEnding.
//
// setIntensity(p) is kept as an API (main.js calls it continuously as
// points accrue) but the old "tempo/gain ramps up with points" behavior
// has been removed per spec. It now just remembers the value; heya/gedatsu
// still read it from env for their existing per-note humanizing (extra
// gedatsu bell hits at high intensity, slightly louder hats, etc.) since
// that's arrangement thickening, not the deprecated tempo progression.

export const TRACKS = [
  { id: "heya", title: "部屋とくまとおしり" }, // 合成
  { id: "sekkai", title: "石灰の終わり" }, // ファイル(sekkai1→sekkai2連結ループ)
  { id: "android", title: "ぴっちぴち・アンドロイド" }, // ファイル
  { id: "gedatsu", title: "解脱" }, // 合成
  { id: "alice", title: "Alice fell down" }, // ファイル(隠し曲)
  { id: "zoo", title: "To the zoo" }, // ファイル(隠し曲)
];

// File-based jukebox tracks. Paths are relative to index.html, same
// convention as office.js's "assets/models/*.glb" / "assets/radiohip.jpg".
const FILE_TRACKS = {
  sekkai: { kind: "pair", urls: ["assets/bgm/sekkai1.mp3", "assets/bgm/sekkai2.mp3"] },
  android: { kind: "single", url: "assets/bgm/android.mp3" },
  alice: { kind: "single", url: "assets/bgm/alice.m4a" },
  zoo: { kind: "single", url: "assets/bgm/zoo.m4a" },
};
const FEVER_URL = "assets/bgm/fever.mp3";
const ENDING_URL = "assets/bgm/ending.m4a";
// カードゲームの対戦BGM。解禁状況に関係なく鳴らすので専用に読む
const BATTLE_URL = "assets/bgm/android.mp3";

// ---------------------------------------------------------------------
// Small stateless synth helpers shared by heya/gedatsu.
// ---------------------------------------------------------------------

// MIDI note number to Hz.
const noteToFreq = (note) => 440 * Math.pow(2, (note - 69) / 12);

// Build a buffer of white noise, reused (from time 0) for every noise hit,
// long or short — a one-shot source just stops sounding once its own
// envelope/stop() cuts it off, so one shared buffer covers hi-hats, kicks
// and slow ambient swells alike.
const NOISE_BUFFER_SECONDS = 8;
const makeNoiseBuffer = (audioContext) => {
  const len = Math.floor(audioContext.sampleRate * NOISE_BUFFER_SECONDS);
  const buffer = audioContext.createBuffer(1, len, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

// Plain oscillator note with a quick exponential attack/decay envelope.
const playTone = (audioContext, dest, { type, freq, time, peak, attack = 0.005, release }) => {
  const osc = audioContext.createOscillator();
  const env = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, time + attack + release);
  osc.connect(env);
  env.connect(dest);
  osc.start(time);
  osc.stop(time + attack + release + 0.05);
};

// Filtered noise burst (hi-hats, swells, airy pads).
const playNoise = (audioContext, buffer, dest, { time, filterType = "highpass", filterFreq = 4000, q = 1, peak = 0.05, attack = 0.001, release = 0.05 }) => {
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFreq, time);
  filter.Q.setValueAtTime(q, time);
  const env = audioContext.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, time + attack + release);
  source.connect(filter);
  filter.connect(env);
  env.connect(dest);
  source.start(time);
  source.stop(time + attack + release + 0.05);
};

// Temple-bell tone: fundamental + inharmonic partials, long decay.
const playBell = (audioContext, dest, { time, freq, peak = 0.12, decay = 5 }) => {
  const partials = [1, 2.76, 5.4];
  const gains = [1, 0.35, 0.15];
  partials.forEach((mult, i) => {
    const osc = audioContext.createOscillator();
    const env = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * mult, time);
    const p = peak * gains[i];
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(Math.max(p, 0.0002), time + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    osc.connect(env);
    env.connect(dest);
    osc.start(time);
    osc.stop(time + decay + 0.1);
  });
};

// Long sine drone note, retriggered every cycle with generous overlap so
// it reads as continuous rather than pulsing.
const playDrone = (audioContext, dest, { time, freqs, dur, peak = 0.05 }) => {
  freqs.forEach((freq) => {
    const osc = audioContext.createOscillator();
    const env = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + dur * 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(env);
    env.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.1);
  });
};

// ---------------------------------------------------------------------
// Synth track definitions (heya, gedatsu). All step indices are in
// sixteenth notes; 4 steps per beat, 16 steps per 4/4 bar.
// sekkai/android used to be synth here too; their synth definitions were
// removed now that they're real audio files (see FILE_TRACKS above).
// ---------------------------------------------------------------------

const TRACK_DEFS = {
  // --- 部屋とくまとおしり: the original cheerful office chiptune loop ---
  heya: {
    baseBPM: 84,
    chordRoots: [60, 65, 62, 67], // C, F, Dm, G
    melodyPattern: [
      [64, null, 66, null, 68, null, 69, null],
      [72, null, 70, null, 68, null, 66, null],
      [69, null, 68, null, 66, null, 64, null],
      [72, null, 71, null, 69, null, 68, null],
      [64, null, 66, null, 68, null, 69, null],
      [72, null, 70, null, 68, null, 66, null],
      [70, null, 69, null, 68, null, 67, null],
      [66, null, 64, null, 65, null, 64, null],
    ],
    schedule(time, step, env) {
      const { audioContext, masterGain, noiseBuffer, intensity, stepLen } = env;

      // hi-hat on every eighth note
      if (step % 2 === 0) {
        playNoise(audioContext, noiseBuffer, masterGain, {
          time,
          filterType: "highpass",
          filterFreq: 8000,
          peak: 0.05 + intensity * 0.02,
          release: 0.05,
        });
      }

      // triangle bass on quarter notes
      if (step % 4 === 0) {
        const beatIndex = step / 4;
        const chordIndex = beatIndex % 4;
        const quarterLen = stepLen * 4;
        playTone(audioContext, masterGain, {
          type: "triangle",
          freq: noteToFreq(this.chordRoots[chordIndex]),
          time,
          peak: 0.05,
          attack: 0.005,
          release: quarterLen * 0.7,
        });
      }

      // square lead, 8-bar melody on eighth notes
      if (step % 2 === 0) {
        const eighthIndex = step / 2;
        const barInLoop = Math.floor(eighthIndex / 8) % 8;
        const eighthInBar = eighthIndex % 8;
        const note = this.melodyPattern[barInLoop][eighthInBar];
        if (note !== null) {
          const eighthLen = stepLen * 2;
          playTone(audioContext, masterGain, {
            type: "square",
            freq: noteToFreq(note),
            time,
            peak: 0.08,
            attack: 0.003,
            release: eighthLen * 0.8,
          });
        }
      }
    },
  },

  // --- 解脱: zen ambient ---
  gedatsu: {
    baseBPM: 45,
    droneFreqs: [noteToFreq(33), noteToFreq(40)], // A1, E2
    bellFreq: noteToFreq(76), // E5
    schedule(time, step, env) {
      const { audioContext, masterGain, noiseBuffer, intensity, stepLen } = env;
      const cycleSteps = 32; // 8 beats
      const stepInCycle = step % cycleSteps;
      const cycleLen = stepLen * cycleSteps;

      // deep sine drone, always sounding: retrigger once per cycle with
      // generous overlap so the note never fully decays before the next
      if (stepInCycle === 0) {
        playDrone(audioContext, masterGain, {
          time,
          freqs: this.droneFreqs,
          dur: cycleLen * 1.08,
          peak: 0.05,
        });
      }

      // temple bell on beats 1 and 7; intensity adds a couple more hits
      const bellSteps = [0, 24];
      if (intensity > 0.33) bellSteps.push(12);
      if (intensity > 0.66) bellSteps.push(20);
      if (bellSteps.includes(stepInCycle)) {
        playBell(audioContext, masterGain, {
          time,
          freq: this.bellFreq,
          peak: 0.12,
          decay: 5.5,
        });
      }

      // faint airy noise-pad swell once per cycle
      if (stepInCycle === 16) {
        playNoise(audioContext, noiseBuffer, masterGain, {
          time,
          filterType: "highpass",
          filterFreq: 3200,
          q: 0.6,
          peak: 0.02,
          attack: cycleLen * 0.3,
          release: cycleLen * 0.35,
        });
      }
    },
  },
};

// ---------------------------------------------------------------------
// Jukebox: single lookahead scheduler shared by synth tracks and the
// sekkai file-pair chain. Single-file tracks (android/alice/zoo) just use
// AudioBufferSourceNode.loop and need no per-tick attention.
// ---------------------------------------------------------------------

const MASTER_GAIN_BASE = 0.15; // matches the old synth-only default loudness
let userVolume = 1; // 設定パネルのBGM音量(0〜1)
const FILE_GAIN = 0.8; // per-file-track balance gain, so files don't sit far from synth loudness
// 曲ごとの音量補正(2026-08-12)。実測RMSを android(0.145) 基準に揃える。
// 実測: sekkai1 0.111 / sekkai2 0.136 / android 0.145 / alice 0.178 / zoo 0.250(突出) /
//       fever 0.158 / ending 0.238
const TRACK_LEVEL = { sekkai: 1.1, android: 1, alice: 0.75, zoo: 0.52, fever: 0.85, ending: 0.55 };
const FILE_SCHEDULE_AHEAD = 0.3; // seconds; how far ahead the sekkai pair-chain schedules its next chunk

export function createBGM() {
  let audioContext = null;
  let isPlaying = false;
  let schedulerID = null;
  let nextEventTime = 0;
  let intensity = 0; // stored only; no longer drives tempo/gain (see file header)
  let currentTrackId = TRACKS[0].id; // "heya"
  let stepCounter = 0;

  const scheduleAheadTime = 0.1; // 100ms lookahead (synth notes)
  const lookAhead = 25; // 25ms scheduler interval

  // Gain graph: masterGain is the single final output (future volume
  // control). jukeboxGain carries the currently-selected jukebox track
  // (synth writes to it directly; file jukebox tracks go through fileGain
  // first for balance) and can be ducked to 0 during fever without
  // touching fever/ending, which have their own gain nodes straight to
  // masterGain.
  let masterGain = null;
  let jukeboxGain = null;
  let fileGain = null;
  let feverGain = null;
  let endingGain = null;
  let battleGain = null;
  let noiseBuffer = null;

  // -- file loading: fetch+decode once per URL, cached ------------------
  const bufferCache = new Map(); // url -> Promise<AudioBuffer>
  const trackAudioCache = new Map(); // trackId -> Promise<{kind, ...buffers}>

  const loadAudioBuffer = (url) => {
    if (!bufferCache.has(url)) {
      bufferCache.set(
        url,
        fetch(url)
          .then((res) => res.arrayBuffer())
          .then((data) => audioContext.decodeAudioData(data))
          .catch((err) => {
            console.warn(`[bgm] failed to load ${url}`, err);
            bufferCache.delete(url);
            throw err;
          })
      );
    }
    return bufferCache.get(url);
  };

  const loadTrackAudio = (id) => {
    if (!trackAudioCache.has(id)) {
      const def = FILE_TRACKS[id];
      const promise =
        def.kind === "single"
          ? loadAudioBuffer(def.url).then((buf) => ({ kind: "single", buf }))
          : Promise.all([loadAudioBuffer(def.urls[0]), loadAudioBuffer(def.urls[1])]).then(
              ([bufA, bufB]) => ({ kind: "pair", bufA, bufB })
            );
      trackAudioCache.set(id, promise);
    }
    return trackAudioCache.get(id);
  };

  // -- jukebox file-track playback state --------------------------------
  let singleFileSource = null; // current android/alice/zoo source
  let pairState = null; // { bufA, bufB, nextStartTime, nextIsA, sources: [] } for sekkai
  let fileLoadToken = 0; // guards against a stale load resolving after another switch

  const stopFileSources = () => {
    fileLoadToken++;
    if (singleFileSource) {
      try { singleFileSource.stop(); } catch { /* already stopped */ }
      try { singleFileSource.disconnect(); } catch { /* already disconnected */ }
      singleFileSource = null;
    }
    if (pairState) {
      pairState.sources.forEach((s) => {
        try { s.stop(); } catch { /* already stopped */ }
        try { s.disconnect(); } catch { /* already disconnected */ }
      });
      pairState = null;
    }
  };

  // Schedule as many sekkai1/sekkai2 chunks as fit within the lookahead
  // window, using exact buffer durations (never onended) so the loop is
  // sample-accurate and gapless.
  const pumpPairSchedule = () => {
    if (!pairState || !audioContext) return;
    const endTime = audioContext.currentTime + FILE_SCHEDULE_AHEAD;
    while (pairState.nextStartTime < endTime) {
      const buf = pairState.nextIsA ? pairState.bufA : pairState.bufB;
      const src = audioContext.createBufferSource();
      src.buffer = buf;
      src.connect(fileGain);
      src.start(pairState.nextStartTime);
      pairState.sources.push(src);
      src.onended = () => {
        // bookkeeping only - never used to trigger the next chunk
        if (!pairState) return;
        const i = pairState.sources.indexOf(src);
        if (i > -1) pairState.sources.splice(i, 1);
      };
      pairState.nextStartTime += buf.duration;
      pairState.nextIsA = !pairState.nextIsA;
    }
  };

  const beginFileTrack = (id) => {
    const loadToken = ++fileLoadToken;
    loadTrackAudio(id)
      .then((audio) => {
        if (loadToken !== fileLoadToken || currentTrackId !== id || !isPlaying) return; // stale
        fileGain.gain.value = FILE_GAIN * (TRACK_LEVEL[id] || 1); // 曲ごとの音量補正
        const when = audioContext.currentTime;
        if (audio.kind === "single") {
          const src = audioContext.createBufferSource();
          src.buffer = audio.buf;
          src.loop = true;
          src.connect(fileGain);
          src.start(when);
          singleFileSource = src;
        } else {
          pairState = { bufA: audio.bufA, bufB: audio.bufB, nextStartTime: when, nextIsA: true, sources: [] };
          pumpPairSchedule();
        }
      })
      .catch(() => {}); // already warned in loadAudioBuffer
  };

  const activateCurrentTrack = () => {
    stopFileSources();
    if (FILE_TRACKS[currentTrackId]) {
      beginFileTrack(currentTrackId);
    }
    // synth tracks need nothing extra here; the scheduler tick drives them
    // from stepCounter/nextEventTime, both already reset by the caller.
  };

  // step length = one sixteenth note at the track's fixed tempo (no more
  // intensity-driven speed-up; see file header)
  const getStepLength = () => {
    const bpm = TRACK_DEFS[currentTrackId].baseBPM;
    return 60 / bpm / 4;
  };

  // Main scheduler: runs every ~25ms. Drives synth note scheduling for
  // heya/gedatsu, and the sekkai pair-chain look-ahead. android/alice/zoo
  // are plain loop=true sources and need no per-tick work.
  const scheduler = () => {
    if (!isPlaying || !audioContext) return;

    if (pairState) {
      pumpPairSchedule();
    }

    const def = TRACK_DEFS[currentTrackId];
    if (def) {
      const endTime = audioContext.currentTime + scheduleAheadTime;
      const stepLen = getStepLength();
      while (nextEventTime < endTime) {
        def.schedule(nextEventTime, stepCounter, {
          audioContext,
          masterGain: jukeboxGain,
          noiseBuffer,
          intensity,
          stepLen,
        });
        stepCounter++;
        nextEventTime += stepLen;
      }
    }
  };

  const ensureAudioGraph = () => {
    if (audioContext === null) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
    if (masterGain === null) {
      masterGain = audioContext.createGain();
      masterGain.gain.value = MASTER_GAIN_BASE * userVolume;
      masterGain.connect(audioContext.destination);
    }
    if (jukeboxGain === null) {
      jukeboxGain = audioContext.createGain();
      jukeboxGain.gain.value = 1;
      jukeboxGain.connect(masterGain);
    }
    if (fileGain === null) {
      fileGain = audioContext.createGain();
      fileGain.gain.value = FILE_GAIN;
      fileGain.connect(jukeboxGain);
    }
    if (feverGain === null) {
      feverGain = audioContext.createGain();
      feverGain.gain.value = FILE_GAIN * TRACK_LEVEL.fever;
      feverGain.connect(masterGain);
    }
    if (battleGain === null) {
      battleGain = audioContext.createGain();
      battleGain.gain.value = FILE_GAIN;
      battleGain.connect(masterGain);
    }
    if (endingGain === null) {
      endingGain = audioContext.createGain();
      endingGain.gain.value = FILE_GAIN * TRACK_LEVEL.ending;
      endingGain.connect(masterGain);
    }
    if (noiseBuffer === null) {
      noiseBuffer = makeNoiseBuffer(audioContext);
    }
  };

  const start = () => {
    // Create/resume the audio graph (must happen inside a user gesture the
    // first time). Safe to call every tap: existing playback is untouched.
    ensureAudioGraph();

    if (endingPlaying) return; // ending is terminal; never resurrect the jukebox under it
    if (isPlaying) return; // already playing, avoid double-start

    isPlaying = true;
    stepCounter = 0;
    nextEventTime = audioContext.currentTime;
    activateCurrentTrack();
    schedulerID = setInterval(scheduler, lookAhead);
  };

  const stop = () => {
    isPlaying = false;
    if (schedulerID) {
      clearInterval(schedulerID);
      schedulerID = null;
    }
    stopFileSources();
    if (feverPlaying) {
      feverPlaying = false;
      if (feverSource) {
        try { feverSource.stop(); } catch { /* already stopped */ }
        try { feverSource.disconnect(); } catch { /* already disconnected */ }
        feverSource = null;
      }
    }
    if (endingPlaying) {
      endingPlaying = false;
      if (endingSource) {
        try { endingSource.stop(); } catch { /* already stopped */ }
        try { endingSource.disconnect(); } catch { /* already disconnected */ }
        endingSource = null;
      }
    }
  };

  const setIntensity = (p) => {
    // Kept as an API (main.js calls it continuously) but no longer drives
    // tempo or gain progression - see file header. Only stored, so
    // heya/gedatsu's own per-note humanizing still has a value to read.
    intensity = Math.max(0, Math.min(1, p));
  };

  const setTrack = (id) => {
    if ((!TRACK_DEFS[id] && !FILE_TRACKS[id]) || id === currentTrackId) return;

    currentTrackId = id;
    stepCounter = 0; // reset pattern position for the new track

    if (isPlaying && audioContext && jukeboxGain) {
      const now = audioContext.currentTime;
      // brief fade on the jukebox bus to mask the switch, covers both
      // synth->synth, synth->file and file->file transitions the same way
      jukeboxGain.gain.cancelScheduledValues(now);
      jukeboxGain.gain.setValueAtTime(jukeboxGain.gain.value, now);
      jukeboxGain.gain.linearRampToValueAtTime(0.0001, now + 0.05);
      jukeboxGain.gain.linearRampToValueAtTime(1, now + 0.15);
      nextEventTime = now + 0.05;
      activateCurrentTrack();
    }
  };

  // -- fever.mp3: independent of the jukebox, resumes from last position --
  let feverSource = null;
  let feverPlaying = false;
  let feverPosition = 0; // seconds; where to resume next time
  let feverBufferDuration = 0;
  let feverAnchorCtxTime = 0;
  let feverAnchorPosition = 0;

  const startFever = () => {
    ensureAudioGraph();
    const now = audioContext.currentTime;
    // duck the jukebox bus (pause "or volume 0" per spec) rather than
    // tearing down its sources, so resuming afterwards is instant/gapless
    jukeboxGain.gain.cancelScheduledValues(now);
    jukeboxGain.gain.setValueAtTime(0, now);

    if (feverPlaying) return; // already running
    feverPlaying = true;

    loadAudioBuffer(FEVER_URL)
      .then((buf) => {
        if (!feverPlaying) return; // stopFever() already called before load resolved
        feverBufferDuration = buf.duration;
        if (feverPosition >= buf.duration) feverPosition = 0;
        const src = audioContext.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(feverGain);
        const startAt = audioContext.currentTime;
        src.start(startAt, feverPosition);
        feverSource = src;
        feverAnchorCtxTime = startAt;
        feverAnchorPosition = feverPosition;
      })
      .catch(() => {});
  };

  const stopFever = () => {
    if (!feverPlaying) return;
    feverPlaying = false;
    if (feverSource) {
      const elapsed = audioContext.currentTime - feverAnchorCtxTime;
      let pos = feverAnchorPosition + elapsed;
      if (feverBufferDuration > 0 && pos >= feverBufferDuration) {
        pos = pos % feverBufferDuration;
      }
      feverPosition = pos;
      try { feverSource.stop(); } catch { /* already stopped */ }
      try { feverSource.disconnect(); } catch { /* already disconnected */ }
      feverSource = null;
    }
    if (jukeboxGain && audioContext) {
      const now = audioContext.currentTime;
      jukeboxGain.gain.cancelScheduledValues(now);
      jukeboxGain.gain.setValueAtTime(1, now);
    }
  };

  // -- 対戦BGM: ジュークボックスをダックして重ねる(毎回頭から) ------------
  let battleSource = null;
  let battlePlaying = false;

  const startBattle = () => {
    ensureAudioGraph();
    const now = audioContext.currentTime;
    jukeboxGain.gain.cancelScheduledValues(now);
    jukeboxGain.gain.setValueAtTime(0, now);
    if (battlePlaying) return;
    battlePlaying = true;
    loadAudioBuffer(BATTLE_URL)
      .then((buf) => {
        if (!battlePlaying) return;
        const src = audioContext.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(battleGain);
        src.start(audioContext.currentTime);
        battleSource = src;
      })
      .catch(() => {});
  };

  const stopBattle = () => {
    if (!battlePlaying) return;
    battlePlaying = false;
    if (battleSource) {
      try { battleSource.stop(); } catch { /* already stopped */ }
      try { battleSource.disconnect(); } catch { /* already disconnected */ }
      battleSource = null;
    }
    if (jukeboxGain && audioContext) {
      const now = audioContext.currentTime;
      jukeboxGain.gain.cancelScheduledValues(now);
      jukeboxGain.gain.setValueAtTime(1, now);
    }
  };

  // -- ending.m4a: terminal, stops the jukebox entirely --------------------
  let endingSource = null;
  let endingPlaying = false;

  const playEnding = () => {
    ensureAudioGraph();
    isPlaying = false;
    if (schedulerID) {
      clearInterval(schedulerID);
      schedulerID = null;
    }
    stopFileSources();
    endingPlaying = true;

    loadAudioBuffer(ENDING_URL)
      .then((buf) => {
        if (!endingPlaying) return;
        const src = audioContext.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(endingGain);
        src.start(audioContext.currentTime);
        endingSource = src;
      })
      .catch(() => {});
  };

  const setVolume = (v) => {
    userVolume = Math.max(0, Math.min(1, v));
    if (masterGain) masterGain.gain.value = MASTER_GAIN_BASE * userVolume;
  };

  return {
    start,
    stop,
    setIntensity,
    setTrack,
    startFever,
    stopFever,
    startBattle,
    stopBattle,
    playEnding,
    setVolume,
    get playing() {
      return isPlaying;
    },
    get track() {
      return currentTrackId;
    },
  };
}
