(function () {
  const BASE_PATH = "sonidos/stereo/";
  const SOUND_FILES = Object.freeze({
    bell: "bell.ogg",
    trash: "trash-empty.ogg",
    tab: "notebook-tab-changed.ogg",
    info: "dialog-information.ogg",
    success: "complete.ogg",
    warning: "dialog-warning.ogg",
    error: "dialog-error.ogg",
    question: "dialog-question.ogg",
    default: "dialog-information.ogg"
  });

  const state = {
    enabled: true,
    volume: 0.42,
    minIntervalMs: 180,
    lastPlayAt: new Map(),
    cache: new Map(),
    audioCtx: null
  };

  function clampVolume(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return state.volume;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function resolveUrl(fileName) {
    return new URL(`${BASE_PATH}${fileName}`, window.location.href).toString();
  }

  function getCachedAudio(fileName) {
    if (state.cache.has(fileName)) return state.cache.get(fileName);
    const audio = new Audio(resolveUrl(fileName));
    audio.preload = "auto";
    try {
      audio.load();
    } catch (_err) {}
    state.cache.set(fileName, audio);
    return audio;
  }

  function warmup() {
    Object.values(SOUND_FILES).forEach((fileName) => {
      getCachedAudio(fileName);
    });
  }

  function normalizeKey(kind) {
    const k = String(kind || "").toLowerCase();
    if (SOUND_FILES[k]) return k;
    return "default";
  }

  function canPlay(key, minIntervalMs) {
    const now = Date.now();
    const lastAt = Number(state.lastPlayAt.get(key) || 0);
    const min = Number.isFinite(minIntervalMs) ? minIntervalMs : state.minIntervalMs;
    if (now - lastAt < min) return false;
    state.lastPlayAt.set(key, now);
    return true;
  }

  function getAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!state.audioCtx) {
      try {
        state.audioCtx = new Ctx();
      } catch (_err) {
        state.audioCtx = null;
      }
    }
    return state.audioCtx;
  }

  function fallbackTone(kind, options = {}) {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const freqByKind = {
      bell: 760,
      trash: 430,
      tab: 700,
      info: 680,
      success: 880,
      warning: 520,
      error: 240,
      question: 620,
      default: 680
    };

    const now = ctx.currentTime;
    const freq = freqByKind[kind] || freqByKind.default;
    const vol = clampVolume(options.volume) * 0.14;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = kind === "error" ? "square" : "sine";
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0003), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  function play(kind, options = {}) {
    if (!state.enabled) return Promise.resolve(false);

    const key = normalizeKey(kind);
    if (!canPlay(key, Number(options.minIntervalMs))) {
      return Promise.resolve(false);
    }

    const fileName = SOUND_FILES[key] || SOUND_FILES.default;
    const source = getCachedAudio(fileName);
    const audio = source.cloneNode(true);
    audio.volume = clampVolume(options.volume);

    let played = true;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        played = false;
        fallbackTone(key, options);
      });
    }
    if (playPromise === undefined) {
      try {
        if (audio.paused) {
          played = false;
          fallbackTone(key, options);
        }
      } catch (_err) {
        played = false;
        fallbackTone(key, options);
      }
    }
    return Promise.resolve(played);
  }

  function setEnabled(enabled) {
    state.enabled = Boolean(enabled);
  }

  function setVolume(volume) {
    state.volume = clampVolume(volume);
  }

  function bindUserActivation() {
    const activate = () => {
      warmup();
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      window.removeEventListener("pointerdown", activate, true);
      window.removeEventListener("keydown", activate, true);
      window.removeEventListener("touchstart", activate, true);
    };

    window.addEventListener("pointerdown", activate, true);
    window.addEventListener("keydown", activate, true);
    window.addEventListener("touchstart", activate, true);
  }

  window.playUiSound = play;
  window.uiSound = {
    play,
    warmup,
    setEnabled,
    setVolume
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", warmup, { once: true });
  } else {
    warmup();
  }
  bindUserActivation();
})();
