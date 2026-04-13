// ============================================================
//  SOUND ENGINE v2 — Web Audio API procedural
//  Sin archivos externos. Todos los sonidos generados en código.
//  Contexto compartido con resumeOnInteraction automático.
// ============================================================

let _ctx = null;
let _masterVolume = 0.7; // 0.0 – 1.0 (controlable desde fuera)
let _muted = false;

// ── Obtener / crear contexto ──────────────────────────────────
const getCtx = () => {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Auto-resume en primer gesto del usuario
    const resume = () => { if (_ctx.state === 'suspended') _ctx.resume(); };
    document.addEventListener('pointerdown', resume, { once: false });
    document.addEventListener('keydown', resume, { once: false });
  }
  return _ctx;
};

// ── Nodo master gain ─────────────────────────────────────────
let _masterNode = null;
const getMaster = () => {
  const ac = getCtx();
  if (!_masterNode) {
    _masterNode = ac.createGain();
    _masterNode.gain.value = _muted ? 0 : _masterVolume;
    _masterNode.connect(ac.destination);
  }
  return _masterNode;
};

// ── Primitivas de síntesis ────────────────────────────────────

/** Oscilador simple con envolvente ADSR */
const tono = (freq, tipo, duracion, volumen = 0.3, freqFin = null, delay = 0) => {
  try {
    const ac   = getCtx();
    const t0   = ac.currentTime + delay;
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(getMaster());

    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqFin !== null) osc.frequency.linearRampToValueAtTime(freqFin, t0 + duracion);

    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volumen, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duracion);

    osc.start(t0);
    osc.stop(t0 + duracion + 0.01);
  } catch (_) {}
};

/** Ruido blanco con filtro opcional */
const ruido = (duracion, volumen = 0.2, filtroFreq = null, delay = 0) => {
  try {
    const ac  = getCtx();
    const t0  = ac.currentTime + delay;
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * duracion), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src  = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = buf;

    if (filtroFreq) {
      const filtro = ac.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.value = filtroFreq;
      src.connect(filtro);
      filtro.connect(gain);
    } else {
      src.connect(gain);
    }

    gain.connect(getMaster());
    gain.gain.setValueAtTime(volumen, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duracion);

    src.start(t0);
  } catch (_) {}
};

/** Acorde: varios tonos a la vez */
const acorde = (freqs, tipo, duracion, volumen = 0.2, delay = 0) => {
  freqs.forEach(f => tono(f, tipo, duracion, volumen / freqs.length, null, delay));
};

// ── Catálogo de efectos ───────────────────────────────────────
export const SFX = {

  // ─── CONTROL DE VOLUMEN ──────────────────────────────────
  setVolumen(v) {
    _masterVolume = Math.max(0, Math.min(1, v));
    if (_masterNode) _masterNode.gain.setTargetAtTime(_muted ? 0 : _masterVolume, getCtx().currentTime, 0.05);
  },
  toggleMute() {
    _muted = !_muted;
    if (_masterNode) _masterNode.gain.setTargetAtTime(_muted ? 0 : _masterVolume, getCtx().currentTime, 0.05);
    return _muted;
  },
  isMuted: () => _muted,

  // ─── FEEDBACK DE JUEGO ──────────────────────────────────

  /** ✅ Acierto — acorde mayor ascendente */
  acierto() {
    tono(523.25, 'sine', 0.12, 0.28, null, 0.00);
    tono(659.25, 'sine', 0.12, 0.28, null, 0.07);
    tono(783.99, 'sine', 0.14, 0.28, null, 0.14);
    tono(1046.5, 'sine', 0.18, 0.26, null, 0.22);
  },

  /** ❌ Error — descenso disonante */
  error() {
    tono(320, 'sawtooth', 0.18, 0.22, 140, 0.00);
    tono(160, 'sawtooth', 0.22, 0.20, 100, 0.10);
    ruido(0.15, 0.08, 400, 0.05);
  },

  /** 🫧 Pop suave de burbuja */
  pop() {
    tono(900, 'sine', 0.06, 0.18, 180, 0);
    ruido(0.07, 0.06, 2000);
  },

  /** 🔫 Disparo de láser estilo retro */
  laser() {
    tono(1400, 'sawtooth', 0.28, 0.14, 220, 0.00);
    tono(900,  'square',   0.28, 0.07, 300, 0.00);
    ruido(0.04, 0.08, 3000, 0.00);
  },

  /** 💥 Explosión de globo */
  explosion() {
    ruido(0.35, 0.38, 600);
    tono(220, 'sawtooth', 0.22, 0.18, 55, 0.00);
    tono(110, 'sine',     0.30, 0.12, 40, 0.05);
  },

  /** ☄️ Impacto de meteorito */
  impacto() {
    ruido(0.22, 0.32, 800);
    tono(130, 'sine', 0.30, 0.28, 60, 0.00);
    tono(80,  'sine', 0.20, 0.12, 40, 0.08);
  },

  /** 🌊 Ola de surf */
  ola() {
    ruido(0.50, 0.10, 600, 0.00);
    tono(380, 'sine', 0.40, 0.07, 290, 0.00);
    tono(320, 'sine', 0.35, 0.05, 240, 0.20);
  },

  /** ⚡ Corriente eléctrica / choque */
  electrico() {
    tono(55,  'sawtooth', 0.12, 0.28, null, 0.00);
    tono(110, 'square',   0.12, 0.14, null, 0.00);
    ruido(0.10, 0.20, null, 0.00);
    tono(220, 'sawtooth', 0.06, 0.10, null, 0.08);
  },

  /** 🪨 Salto */
  salto() {
    tono(280, 'sine', 0.12, 0.20, 560, 0.00);
    ruido(0.05, 0.08, 1000, 0.00);
  },

  /** 🛡️ Esquiva exitosa */
  esquiva() {
    tono(440, 'sine',     0.08, 0.16, 600, 0.00);
    tono(660, 'triangle', 0.07, 0.12, 800, 0.04);
  },

  /** 🧠 Zona de memoria activada */
  zonaMemoria() {
    tono(880, 'triangle', 0.10, 0.20, null, 0.00);
    tono(1100, 'sine',    0.08, 0.14, null, 0.06);
  },

  /** 🧠 Secuencia completada */
  secuenciaOk() {
    [0, 0.06, 0.12, 0.18, 0.25].forEach((d, i) => {
      const notas = [523, 659, 784, 988, 1175];
      tono(notas[i], 'sine', 0.16, 0.20, null, d);
    });
    ruido(0.12, 0.04, 2000, 0.30);
  },

  /** 🚀 Fanfare de inicio */
  inicio() {
    const notas = [392, 523, 659, 784, 1047];
    notas.forEach((n, i) => tono(n, 'sine', 0.22, 0.25, null, i * 0.09));
    acorde([392, 523, 659], 'triangle', 0.40, 0.15, 0.50);
  },

  /** ⚔️ Fanfare de combate Versus */
  versusStart() {
    // Melodía épica corta
    const seq = [523, 659, 784, 1047, 784, 659, 784];
    seq.forEach((n, i) => tono(n, 'sawtooth', 0.15, 0.18, null, i * 0.08));
    acorde([196, 247, 294], 'sine', 0.60, 0.12, 0.10);
    ruido(0.10, 0.06, 500, 0.00);
  },

  /** 🏆 Game Over — descenso dramático */
  gameOver() {
    const seq = [523, 415, 349, 294, 220];
    seq.forEach((n, i) => tono(n, 'sine', 0.35, 0.24, null, i * 0.18));
    ruido(0.40, 0.06, 300, 0.70);
    acorde([220, 165], 'sawtooth', 0.40, 0.10, 0.80);
  },

  /** ❤️ Perder vida — golpe seco */
  perderVida() {
    tono(220, 'square',   0.28, 0.28, 110, 0.00);
    tono(165, 'sawtooth', 0.20, 0.14, 80,  0.05);
    ruido(0.14, 0.18, 500, 0.00);
  },

  /** ⭐ Bonus / colectar ítems especiales */
  bonus() {
    const notas = [784, 880, 988, 1047, 1175, 1319];
    notas.forEach((n, i) => tono(n, 'sine', 0.14, 0.18, null, i * 0.05));
    ruido(0.08, 0.04, 3000, 0.25);
  },

  /** 🏁 Meta alcanzada (Conductor) */
  meta() {
    // Jingle corto de victoria
    const notas = [523, 659, 784, 1047, 784, 1047, 1319];
    notas.forEach((n, i) => tono(n, 'sine', 0.18, 0.22, null, i * 0.07));
    acorde([523, 659, 784, 1047], 'triangle', 0.50, 0.14, 0.55);
    ruido(0.12, 0.06, 2500, 0.60);
  },

  /** ⚡ Checkpoint en Conductor */
  checkpoint() {
    tono(880, 'triangle', 0.10, 0.22, null, 0.00);
    tono(1100, 'sine',    0.12, 0.18, null, 0.06);
    tono(1320, 'sine',    0.10, 0.14, null, 0.12);
  },

  /** 🎵 Tick de countdown */
  countdown() {
    tono(660, 'sine', 0.10, 0.22, null, 0.00);
  },

  /** 🎺 GO! del countdown final */
  go() {
    acorde([523, 659, 784], 'sine', 0.30, 0.28, 0.00);
    ruido(0.08, 0.08, 1500, 0.00);
    tono(1047, 'sine', 0.25, 0.20, null, 0.05);
  },

  /** 🔔 Notificación suave (UI) */
  ui() {
    tono(880,  'sine', 0.08, 0.14, null, 0.00);
    tono(1100, 'sine', 0.06, 0.10, null, 0.05);
  },

  /** 💾 Guardado OK (Firebase) */
  guardado() {
    tono(523, 'triangle', 0.10, 0.16, null, 0.00);
    tono(659, 'triangle', 0.08, 0.14, null, 0.07);
    tono(784, 'triangle', 0.10, 0.18, null, 0.14);
  },
};