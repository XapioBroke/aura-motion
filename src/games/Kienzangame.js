// ============================================================
//  KIENZAN GAME v2.0 — Destructo Disc canónico
//  - Disco blanco→amarillo fiel al anime (referencias aplicadas)
//  - Control telepático post-corte con inercia suave
//  - Bonus 6s: oleadas de 3 globos XP cada 1.5s
//  - Desintegración del disco al terminar bonus
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

// ── Audio Kienzan — Web Audio API ─────────────────────────
const _KienzanAudio = {
  _ctx: null,
  _cargaNodo: null,    // oscilador de carga (crece en pitch)
  _turbinaNode: null,  // oscilador de turbina en vuelo

  _getCtx() {
    if (!this._ctx) {
      try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(_) {}
    }
    return this._ctx;
  },

  iniciarCarga() {
    const ctx = this._getCtx(); if(!ctx) return;
    this.detenerTodo();
    try {
      // Oscilador base — zumbido eléctrico que sube de tono
      this._cargaNodo = ctx.createOscillator();
      const gain      = ctx.createGain();
      this._cargaNodo.type      = 'sawtooth';
      this._cargaNodo.frequency.setValueAtTime(180, ctx.currentTime);
      gain.gain.setValueAtTime(0.0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.3);
      this._cargaNodo.connect(gain); gain.connect(ctx.destination);
      this._cargaNodo.start();
      this._cargaGain = gain;

      // Segundo oscilador — armónico más agudo
      this._cargaAlto = ctx.createOscillator();
      const gain2     = ctx.createGain();
      this._cargaAlto.type      = 'sine';
      this._cargaAlto.frequency.setValueAtTime(360, ctx.currentTime);
      gain2.gain.setValueAtTime(0.0, ctx.currentTime);
      gain2.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.5);
      this._cargaAlto.connect(gain2); gain2.connect(ctx.destination);
      this._cargaAlto.start();
      this._cargaGain2 = gain2;
    } catch(_) {}
  },

  actualizarCarga(prog) {
    // prog 0→1: sube el pitch del zumbido
    const ctx = this._getCtx(); if(!ctx || !this._cargaNodo) return;
    try {
      const freq = 180 + prog * 420; // 180Hz → 600Hz
      this._cargaNodo.frequency.setValueAtTime(freq, ctx.currentTime);
      if(this._cargaAlto) this._cargaAlto.frequency.setValueAtTime(freq*2, ctx.currentTime);
    } catch(_) {}
  },

  iniciarTurbina() {
    const ctx = this._getCtx(); if(!ctx) return;
    this.detenerCarga();
    try {
      // Sonido de turbina — oscilador rápido modulado
      this._turbinaNode = ctx.createOscillator();
      const gain  = ctx.createGain();
      const lfo   = ctx.createOscillator();
      const lfoG  = ctx.createGain();

      this._turbinaNode.type      = 'sawtooth';
      this._turbinaNode.frequency.value = 620;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 0.08);

      // LFO para el efecto de "turbina girando"
      lfo.frequency.value  = 28;
      lfoG.gain.value      = 60;
      lfo.connect(lfoG); lfoG.connect(this._turbinaNode.frequency);

      this._turbinaNode.connect(gain); gain.connect(ctx.destination);
      lfo.start(); this._turbinaNode.start();
      this._turbinaGain = gain;
      this._lfo = lfo;
    } catch(_) {}
  },

  detenerCarga() {
    const ctx = this._getCtx();
    // Fade rápido antes de stop() para evitar click/zumbido residual
    try {
      if (ctx && this._cargaGain) {
        this._cargaGain.gain.cancelScheduledValues(ctx.currentTime);
        this._cargaGain.gain.setValueAtTime(this._cargaGain.gain.value, ctx.currentTime);
        this._cargaGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
      }
      if (ctx && this._cargaGain2) {
        this._cargaGain2.gain.cancelScheduledValues(ctx.currentTime);
        this._cargaGain2.gain.setValueAtTime(this._cargaGain2.gain.value, ctx.currentTime);
        this._cargaGain2.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
      }
      // Capturar referencias antes de nullear
      const n1 = this._cargaNodo, n2 = this._cargaAlto;
      this._cargaNodo = null; this._cargaAlto = null;
      this._cargaGain = null; this._cargaGain2 = null;
      setTimeout(() => {
        try { n1?.stop(); } catch(_) {}
        try { n2?.stop(); } catch(_) {}
      }, 100);
    } catch(_) {
      this._cargaNodo = null; this._cargaAlto = null;
    }
  },

  detenerTurbina() {
    const ctx = this._getCtx();
    try {
      if (ctx && this._turbinaGain) {
        this._turbinaGain.gain.cancelScheduledValues(ctx.currentTime);
        this._turbinaGain.gain.setValueAtTime(this._turbinaGain.gain.value, ctx.currentTime);
        this._turbinaGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
      }
      // Capturar antes de nullear — evita que segunda llamada antes de 150ms deje zombies
      const tn = this._turbinaNode, lfo = this._lfo;
      this._turbinaNode = null; this._lfo = null; this._turbinaGain = null;
      setTimeout(() => {
        try { tn?.stop(); } catch(_) {}
        try { lfo?.stop(); } catch(_) {}
      }, 150);
    } catch(_) {
      this._turbinaNode = null; this._lfo = null;
    }
  },

  detenerTodo() {
    this.detenerCarga();
    this.detenerTurbina();
  },
};


const DIF_MAP = {
  facil:   { velGlobos: 0.0012, cargaSeg: 1.5, puntosCorrecto: 25, puntosError: -8  },
  medio:   { velGlobos: 0.0020, cargaSeg: 1.5, puntosCorrecto: 35, puntosError: -12 },
  dificil: { velGlobos: 0.0032, cargaSeg: 1.5, puntosCorrecto: 50, puntosError: -18 },
};

const _crearParticula = (x, y, vx, vy, color, tam, vida) => ({
  x, y, vx, vy, color, tam, vida, vidaMax: vida, gravedad: 0.13 + Math.random()*0.08,
});

const _trayectorias = [
  { vx:  0.0012, vy:  0.0004 },
  { vx: -0.0010, vy:  0.0006 },
  { vx:  0.0008, vy: -0.0005 },
  { vx: -0.0014, vy:  0.0003 },
  { vx:  0.0006, vy:  0.0008 },
];

const BONUS_DURACION   = 420; // 7s × 60fps
const BONUS_OLEADA     = 90;  // 1.5s entre oleadas
const BONUS_XP_AMARILLO = 20;
const BONUS_XP_VERDE    = 50;
const BONUS_XP_PURPURA  = 100;
const LERP_DISCO       = 0.16; // inercia suave con hipersensibilidad — más ágil

export const KienzanGame = {
  _state: null,
  _timers: [],

  init(materia, colorTema, config = {}) {
    // Limpiar timers anteriores para evitar callbacks huérfanos
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
    _KienzanAudio.detenerTodo();
    const self = this;
    const dif  = config.dificultad || 'medio';
    const d    = DIF_MAP[dif] || DIF_MAP.medio;
    const reto = generarReto(materia);

    this._state = {
      materia, colorTema,
      pregunta:       reto.pregunta,
      tick:           0,
      puntosCorrecto: d.puntosCorrecto,
      puntosError:    d.puntosError,
      cargaMax:       d.cargaSeg * 60,
      velGlobos:      d.velGlobos,

      globos:         [],
      manoActiva:     null,
      cargaTick:      0,
      cargando:       false,
      discoListo:     false,

      // Disco — vuelo libre o telepático
      disco: null,
      // { x, y, vx, vy, rot, velRot, trail[], modo: 'vuelo'|'telepatico'|'desintegrando' }

      // Bonus
      bonusActivo:    false,
      bonusTick:      0,
      bonusOleadaTick:0,
      bonusGlobos:    [],  // globos XP flotando

      particulas:     [],
      mitades:        [],
      flashColor:     null,
      flashTick:      0,
      enCooldown:     false,

      // Posición mano para control telepático (canvas px)
      manoTeleX: null,
      manoTeleY: null,
    };

    this._spawnGlobos(reto.opciones);
    return this._state;
  },

  _spawnGlobos(opciones) {
    const s = this._state;
    s.globos = opciones.map((opc, i) => {
      const tray = _trayectorias[i % _trayectorias.length];
      return {
        x:  0.15 + (i / opciones.length) * 0.70,
        y:  0.20 + Math.random() * 0.35,
        vx: tray.vx * (Math.random() > 0.5 ? 1 : -1),
        vy: tray.vy,
        radio:      52,
        texto:      opc.texto,
        esCorrecto: opc.esCorrecto,
        cortado:    false,
        fase:       Math.random() * Math.PI * 2,
        color: opc.esCorrecto
          ? ['#4488FF','#00AAFF','#22CCFF','#0088DD'][Math.floor(Math.random()*4)]
          : ['#FF3355','#FF2244','#EE1133','#FF4466'][Math.floor(Math.random()*4)],
      };
    });
  },

  _spawnBonusOleada(canvasW, canvasH) {
    const s = this._state;
    // Tipos: amarillo(20xp), verde(50xp), purpura(100xp — 1 por oleada)
    // Cantidad: 4-5 por oleada (20% más que antes)
    const total = 4 + Math.floor(Math.random() * 2); // 4 o 5
    const yaPurpura = s.bonusGlobos.some(g => !g.cortado && g.tipo === 'purpura');

    for (let i = 0; i < total; i++) {
      // Último globo = púrpura si aún no hay uno activo, sino verde o amarillo
      let tipo;
      if (i === total - 1 && !yaPurpura) {
        tipo = 'purpura';
      } else {
        // 40% amarillo, 60% verde
        tipo = Math.random() < 0.40 ? 'amarillo' : 'verde';
      }

      const xp    = tipo === 'purpura' ? BONUS_XP_PURPURA
                  : tipo === 'verde'   ? BONUS_XP_VERDE
                  :                     BONUS_XP_AMARILLO;
      const radio = tipo === 'purpura' ? 44 : tipo === 'verde' ? 38 : 32;

      s.bonusGlobos.push({
        x:    0.08 + Math.random() * 0.84,
        y:    0.06 + Math.random() * 0.32,
        vx:   (Math.random() - 0.5) * 0.0018,
        vy:   (Math.random() - 0.5) * 0.0009,
        fase: Math.random() * Math.PI * 2,
        vida: 90 + Math.random() * 25,
        vidaMax: 115,
        radio,
        tipo,
        xp,
        cortado: false,
      });
    }
  },

  _nuevaRonda() {
    const self     = this;
    const s        = this._state;
    const reto     = generarReto(s.materia);
    s.pregunta     = reto.pregunta;
    s.enCooldown   = false;
    _KienzanAudio.detenerTodo();
    s._munPrev     = null;
    s._gestoFase   = null;
    s._distMax     = null;
    s._brazoCtrl   = null;
    s._wBox        = null;
    s.disco        = null;
    s.discoListo   = false;
    s.cargando     = false;
    s.cargaTick    = 0;
    s.manoActiva   = null;
    s.mitades      = [];
    s.bonusActivo  = false;
    s.bonusTick    = 0;
    s.bonusGlobos  = [];
    this._spawnGlobos(reto.opciones);
  },

  _iniciarBonus() {
    const s       = this._state;
    s.bonusActivo = true;
    s.bonusTick   = 0;
    s.bonusOleadaTick = 0;
    s.bonusGlobos = [];
    s.enCooldown  = false; // alumno puede controlar
    // Disco viene de modo 'espera' → pasa a telepático
    if (s.disco) {
      s.disco.modo = 'telepatico';
      s.disco.trail = [];
    } else {
      // Fallback: crear disco en el centro si por algún motivo no existe
      s.disco = { x: 0.5, y: 0.35, vx: 0, vy: 0, trail: [], modo: 'telepatico' };
    }
    this._spawnBonusOleada();
  },

  _desintegrarDisco() {
    const s = this._state;
    if (!s.disco) return;
    s.disco.modo = 'desintegrando';
    s.disco.desintTick = 0;
    // Partículas de desintegración
    const dx = s.disco.x * (s.disco._canvasW || 800);
    const dy = s.disco.y * (s.disco._canvasH || 500);
    for (let i = 0; i < 22; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3.5;
      s.particulas.push(_crearParticula(
        dx, dy,
        Math.cos(ang)*spd, Math.sin(ang)*spd - 1,
        i%3===0 ? '#FFFFFF' : i%3===1 ? '#FFFF88' : '#FFE000',
        2 + Math.random()*4, 35 + Math.random()*15
      ));
    }
  },

  update(landmarks, canvasW, canvasH, delta) {
    const self = this;
    const s = this._state;
    if (!s) return null;
    s.tick += delta;

    // Guardar dimensiones para desintegración
    if (s.disco) { s.disco._canvasW = canvasW; s.disco._canvasH = canvasH; }

    // ── Efectos ──────────────────────────────────────────
    s.particulas.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += p.gravedad;
      p.vx *= 0.97; p.tam *= 0.95; p.vida--;
    });
    s.particulas = s.particulas.filter(p => p.vida > 0 && p.tam > 0.3);

    s.mitades.forEach(m => {
      m.x += m.vx; m.y += m.vy; m.vy += 0.38;
      m.vx *= 0.98; m.rot += m.velRot; m.vida--;
      m.alpha = Math.max(0, m.vida / m.vidaMax);
    });
    s.mitades = s.mitades.filter(m => m.vida > 0);

    if (s.flashTick > 0) s.flashTick--;

    // ── Mover globos normales ─────────────────────────────
    s.globos.forEach(g => {
      if (g.cortado) return;
      g.x += g.vx; g.y += g.vy; g.fase += 0.03;
      if (g.x < 0.08 || g.x > 0.92) { g.vx *= -1; g.x = Math.max(0.08, Math.min(0.92, g.x)); }
      if (g.y < 0.08 || g.y > 0.65) { g.vy *= -1; g.y = Math.max(0.08, Math.min(0.65, g.y)); }
    });

    // ── BONUS ─────────────────────────────────────────────
    if (s.bonusActivo) {
      s.bonusTick      += delta;
      s.bonusOleadaTick += delta;

      // Nueva oleada cada 1.5s
      if (s.bonusOleadaTick >= BONUS_OLEADA && s.bonusTick < BONUS_DURACION - 30) {
        s.bonusOleadaTick = 0;
        this._spawnBonusOleada();
      }

      // Mover globos bonus
      s.bonusGlobos.forEach(g => {
        if (g.cortado) return;
        g.x += g.vx; g.y += g.vy; g.fase += 0.025;
        if (g.x < 0.06 || g.x > 0.94) g.vx *= -1;
        if (g.y < 0.04 || g.y > 0.38) g.vy *= -1;
        g.vida--;
      });
      s.bonusGlobos = s.bonusGlobos.filter(g => !g.cortado && g.vida > 0);

      // Fin del bonus
      if (s.bonusTick >= BONUS_DURACION) {
        this._desintegrarDisco();
        s.bonusActivo  = false;
        s._brazoCtrl   = null;
        s._wBox        = null;
        const t2 = setTimeout(() => { if(s === self._state) self._nuevaRonda(); }, 900);
        self._timers.push(t2);
        return null;
      }
    }

    if (!landmarks) return null;

    const getRX = n => (1 - n.x) * canvasW;
    const getRY = n => n.y * canvasH;

    // ── Control telepático — MAPEO TABLETA WACOM ────────────
    // El rango natural del brazo define un "rectángulo de trabajo" invisible.
    // Ese rectángulo se mapea 1:1 a la pantalla completa (escala mayor).
    // Brazo a esquina superior derecha del rectángulo → disco a esquina
    // superior derecha de la pantalla. Intuitivo y sin amplificación arbitraria.
    //
    // Espejo: getRX ya invierte X (1-n.x). Usamos getRX/getRY para que
    // las coordenadas sean consistentes con el resto del juego.
    const munL = landmarks[15], munR = landmarks[16];
    if (s.bonusActivo && s.disco?.modo === 'telepatico') {
      const homL = landmarks[11], homR = landmarks[12];

      // ── Fijar brazo al PRIMERO que suba sobre el hombro ──
      if (!s._brazoCtrl) {
        // getRY: y normalizada. muñeca.y < hombro.y → mano arriba
        const izqArriba = munL && homL && munL.y < homL.y - 0.04;
        const derArriba = munR && homR && munR.y < homR.y - 0.04;
        if (izqArriba)      s._brazoCtrl = 'L';
        else if (derArriba) s._brazoCtrl = 'R';
      }

      const mun = s._brazoCtrl === 'L' ? munL : s._brazoCtrl === 'R' ? munR : null;
      const hom = s._brazoCtrl === 'L' ? homL : s._brazoCtrl === 'R' ? homR : null;

      if (mun && hom) {
        // ── Rectángulo de trabajo relativo al cuerpo ────────
        // Usamos coordenadas NORMALIZADAS (0-1) de MediaPipe para que
        // el mapeo sea idéntico sin importar distancia o escala del alumno.
        // mun.x/y son siempre 0-1 independientemente de qué tan lejos esté.
        //
        // El "rectángulo invisible" se define en espacio normalizado:
        // Centro = hombro. Alcance = distancia hombro-muñeca cuando está extendido.
        // Usamos coordenadas RAW de MediaPipe para el box, y getRX solo al final
        // para convertir a píxeles para el disco.

        const munN = mun;  // coordenadas normalizadas 0-1 de MediaPipe
        const homN = hom;

        if (!s._wBox) {
          // Medir longitud real del brazo en este momento (normalizada)
          const brazoPx = Math.hypot(munN.x - homN.x, munN.y - homN.y);
          // El box es un cuadrado centrado en el hombro, lado = 2x longitud del brazo
          // Así el brazo extendido en cualquier dirección llega exactamente al borde
          const r = Math.max(brazoPx, 0.15); // mínimo 0.15 por si aún está doblado
          s._wBox = {
            xMin: homN.x - r, xMax: homN.x + r,
            yMin: homN.y - r, yMax: homN.y + r,
            // Guardar lado para referencia
            r,
          };
        }

        // Expandir box si el brazo llega más lejos — nunca contraer
        const curR = Math.hypot(munN.x - homN.x, munN.y - homN.y);
        if (curR > s._wBox.r) {
          const nr = curR * 1.05; // pequeño margen
          s._wBox.r    = nr;
          s._wBox.xMin = homN.x - nr; s._wBox.xMax = homN.x + nr;
          s._wBox.yMin = homN.y - nr; s._wBox.yMax = homN.y + nr;
        }

        // ── Mapeo lineal en espacio normalizado → pantalla completa ──
        // Exactamente como una tableta Wacom: box → pantalla 1:1
        const bW = s._wBox.xMax - s._wBox.xMin || 0.01;
        const bH = s._wBox.yMax - s._wBox.yMin || 0.01;

        // xNorm: posición relativa dentro del box normalizado
        // getRX ya espeja X, así que usamos munN.x directamente para el box
        // y al final convertimos con getRX para consistencia con el resto del juego
        const xNorm = Math.max(0, Math.min(1, (munN.x - s._wBox.xMin) / bW));
        const yNorm = Math.max(0, Math.min(1, (munN.y - s._wBox.yMin) / bH));

        // Espejo en X: brazo derecha en pantalla espejada → disco derecha
        // xNorm=0 es izquierda de MediaPipe = derecha de pantalla espejada
        // por eso invertimos xNorm para que coincida con la vista del alumno
        s.manoTeleX = (1 - xNorm) * canvasW;
        s.manoTeleY = yNorm * canvasH;
      }
    }

    // ── DETECCIÓN GESTO (solo si no hay bonus activo) ─────
    if (!s.disco && !s.bonusActivo && !s.enCooldown) {
      const homL = landmarks[11], homR = landmarks[12];
      const lIzqArriba = munL && homL && munL.y < homL.y - 0.10;
      const lDerArriba = munR && homR && munR.y < homR.y - 0.10;

      if (!s.cargando) {
        if (lIzqArriba || lDerArriba) {
          s.cargando   = true;
          s.manoActiva = lIzqArriba ? 'L' : 'R';
          s.cargaTick  = 0;
          _KienzanAudio.iniciarCarga();
        }
      } else {
        const manoSigueArriba = s.manoActiva === 'L' ? lIzqArriba : lDerArriba;
        if (!manoSigueArriba && !s.discoListo) {
          s.cargando = false; s.cargaTick = 0;
          s._gestoFase = null;
          _KienzanAudio.detenerCarga();
        } else {
          s.cargaTick += delta;
          if (s.cargaTick >= s.cargaMax) s.discoListo = true;
          _KienzanAudio.actualizarCarga(Math.min(1, s.cargaTick / s.cargaMax));
        }

        if (s.discoListo) {
          const munAct = s.manoActiva === 'L' ? munL : munR;
          const homAct = s.manoActiva === 'L' ? landmarks[11] : landmarks[12];

          if (munAct && homAct) {
            const mx = getRX(munAct), my = getRY(munAct);
            const hx = getRX(homAct), hy = getRY(homAct);

            // Disco siempre pegado a la mano
            s._discoManoX = mx / canvasW;
            s._discoManoY = my / canvasH;

            // Distancia muñeca↔hombro — medida clave del gesto
            const distBrazo = Math.hypot(mx - hx, my - hy);

            // Calibrar al propio cuerpo del alumno:
            // guardamos la distancia máxima vista como referencia de "brazo extendido"
            if (!s._distMax) s._distMax = distBrazo;
            if (distBrazo > s._distMax) s._distMax = distBrazo;
            const brazoRef = s._distMax; // distancia cuando está extendido

            // Retracto: muñeca a menos del 55% de la extensión máxima registrada
            // Extensión: muñeca a más del 80% de la extensión máxima
            const UMBRAL_RETRACTO  = brazoRef * 0.55;
            const UMBRAL_EXTENSION = brazoRef * 0.80;

            // Inicializar estado del gesto si no existe
            if (!s._gestoFase) s._gestoFase = 'esperando';

            if (s._gestoFase === 'esperando') {
              if (distBrazo < UMBRAL_RETRACTO) {
                s._gestoFase = 'retraido';
              }
            } else if (s._gestoFase === 'retraido') {
              if (distBrazo > UMBRAL_EXTENSION) {
                // ¡LANZAR! Dirección: vector hombro → muñeca
                const dirX = mx - hx, dirY = my - hy;
                const mag2 = Math.hypot(dirX, dirY) || 1;
                s.disco = {
                  x:  mx / canvasW,
                  y:  my / canvasH,
                  vx: (dirX/mag2) * 0.022,
                  vy: (dirY/mag2) * 0.022,
                  trail: [], modo: 'vuelo',
                };
                s._gestoFase  = null;
                s._munPrev    = null;
                s.discoListo  = false; s.cargando = false;
                s.cargaTick   = 0; s.manoActiva = null;
                _KienzanAudio.iniciarTurbina();
                try { SFX.laser?.(); } catch(_) {}
              }
            }
          }
        }
      }
    }

    // ── DISCO ─────────────────────────────────────────────
    if (s.disco) {
      const d = s.disco;
      // rot calculado en render desde s.tick para evitar acumulación errática

      if (d.modo === 'vuelo') {
        d.trail.unshift({ x: d.x, y: d.y });
        if (d.trail.length > 14) d.trail.pop();
        d.x += d.vx * delta; d.y += d.vy * delta;
      }

      if (d.modo === 'espera') {
        // Flota suavemente esperando el bonus
        d.y += Math.sin(s.tick * 0.05) * 0.00015;
        d.trail = [];
      }

      // Disco listo pero no lanzado: pegado a la punta de la mano
      if (s.discoListo && !s.disco && s.manoActiva) {
        const munPeg = s.manoActiva === 'L' ? landmarks?.[15] : landmarks?.[16];
        if (munPeg) {
          s._discoManoX = (1 - munPeg.x); // guardar posición normalizada
          s._discoManoY = munPeg.y;
        }
      }

      if (d.modo === 'telepatico' && s.manoTeleX !== null) {
        d.trail.unshift({ x: d.x, y: d.y });
        if (d.trail.length > 10) d.trail.pop();
        // Inercia suave — lerp rápido sin lag perceptible
        // manoTeleX/Y ya están mapeados con hipersensibilidad a px
        const targetX = s.manoTeleX / canvasW;
        const targetY = s.manoTeleY / canvasH;
        d.x += (targetX - d.x) * LERP_DISCO * delta;
        d.y += (targetY - d.y) * LERP_DISCO * delta;
      }

      if (d.modo === 'desintegrando') {
        d.desintTick = (d.desintTick||0) + delta;
        if (d.desintTick > 35) s.disco = null;
        return null;
      }

      // Colisión con globos de respuesta (solo modo vuelo)
      if (d.modo === 'vuelo') {
        const dx_px = d.x*canvasW, dy_px = d.y*canvasH;
        for (const g of s.globos) {
          if (g.cortado) continue;
          if (Math.hypot(dx_px - g.x*canvasW, dy_px - g.y*canvasH) < g.radio + 16) {
            g.cortado = true;
            this._cortarGlobo(g, dx_px, dy_px, canvasW, canvasH);
            const correcto = g.esCorrecto;

            if (correcto) {
              // ✅ Acierto → el disco NO desaparece, pasa a modo telepático en bonus
              s.enCooldown = true;
              // Disco queda flotando donde está hasta que _iniciarBonus lo tome
              s.disco.modo = 'espera'; // pausa — ni vuela ni sigue
              const t1 = setTimeout(() => { if(s === self._state) self._iniciarBonus(); }, 350);
              self._timers.push(t1);
              _KienzanAudio.iniciarTurbina(); // turbina continúa en bonus
            } else {
              // ❌ Fallo → disco desaparece, reset para relanzar
              s.disco        = null;
              _KienzanAudio.detenerTurbina();
              s.enCooldown   = false;
              s.cargando     = false;
              s.discoListo   = false;
              s.cargaTick    = 0;
              s.manoActiva   = null;
            }

            return {
              acierto: correcto, fallo: !correcto,
              puntos:  correcto ? s.puntosCorrecto : s.puntosError,
              mensaje: correcto ? `⭐ +${s.puntosCorrecto} XP — ¡BONUS!` : `💥 ${s.puntosError} XP`,
            };
          }
        }

        // Disco salió de pantalla sin golpear nada → reset para relanzar
        if (d.x < -0.05 || d.x > 1.05 || d.y < -0.05 || d.y > 1.05) {
          s.disco      = null;
          s.enCooldown = false;
          s.cargando   = false;
          s.discoListo = false;
          s.cargaTick  = 0;
          s.manoActiva = null;
          _KienzanAudio.detenerTurbina();
          return null;
        }
      }

      // Colisión con globos BONUS (modo telepático)
      if (d.modo === 'telepatico') {
        const dx_px = d.x*canvasW, dy_px = d.y*canvasH;
        for (const g of s.bonusGlobos) {
          if (g.cortado) continue;
          if (Math.hypot(dx_px - g.x*canvasW, dy_px - g.y*canvasH) < g.radio + 14) {
            g.cortado = true;
            // Partículas doradas
            for (let i=0; i<16; i++) {
              const ang = Math.random()*Math.PI*2, spd = 2+Math.random()*5;
              s.particulas.push(_crearParticula(
                g.x*canvasW, g.y*canvasH,
                Math.cos(ang)*spd, Math.sin(ang)*spd-1.5,
                i%2===0?'#FFD700':'#FFFFFF', 3+Math.random()*4, 30+Math.random()*15
              ));
            }
            try { SFX.bonus?.(); } catch(_) {}
            const xpG = g.xp || BONUS_XP_VERDE;
            const emoji = g.tipo==='purpura' ? '💜' : g.tipo==='verde' ? '💚' : '💛';
            // Partículas según tipo
            const colPart = g.tipo==='purpura' ? '#CC44FF'
                          : g.tipo==='verde'   ? '#44FF88' : '#FFE000';
            for(let pi=0; pi<(g.tipo==='purpura'?22:14); pi++){
              const a=Math.random()*Math.PI*2, sp=2+Math.random()*5;
              s.particulas.push(_crearParticula(
                g.x*canvasW, g.y*canvasH,
                Math.cos(a)*sp, Math.sin(a)*sp-1.5,
                pi%2===0?colPart:'#FFFFFF', 3+Math.random()*4, 30+Math.random()*15
              ));
            }
            return { acierto: true, fallo: false, puntos: xpG,
                     mensaje: `${emoji} +${xpG} XP BONUS` };
          }
        }
      }
    }

    return null;
  },

  _cortarGlobo(g, gx, gy, canvasW, canvasH) {
    const s = this._state;
    const correcto = g.esCorrecto;
    s.flashColor = correcto ? '#FFD700' : '#FF0000';
    s.flashTick  = 18;

    for (let m=0; m<2; m++) {
      s.mitades.push({
        x: gx, y: gy,
        vx: (m===0?-3.5:3.5)+(Math.random()-0.5)*2,
        vy: -2.5+Math.random()*2,
        rot: 0, velRot: (m===0?-0.09:0.09),
        radio: g.radio, mitad: m,
        color: g.color, texto: g.texto,
        vida: 55, vidaMax: 55, alpha: 1,
        esCorrecto: correcto,
      });
    }
    const count = correcto ? 28 : 18;
    for (let i=0; i<count; i++) {
      const ang = Math.random()*Math.PI*2, spd = 2.5+Math.random()*6;
      s.particulas.push(_crearParticula(
        gx, gy, Math.cos(ang)*spd, Math.sin(ang)*spd-2,
        correcto
          ? (i%3===0?'#FFD700':i%3===1?'#FFFFFF':'#FFEE00')
          : (i%2===0?'#FF2200':'#FF6600'),
        3+Math.random()*6, 35+Math.random()*20
      ));
    }
    try { correcto ? SFX.bonus?.() : SFX.impacto?.(); } catch(_) {}
  },

  // ─────────────────────────────────────────────────────────
  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;
    const W = canvasW, H = canvasH;

    // ── Flash ─────────────────────────────────────────────
    if (s.flashTick > 0) {
      ctx.save();
      ctx.globalAlpha = (s.flashTick/18)*0.30;
      ctx.fillStyle = s.flashColor;
      ctx.fillRect(0,0,W,H);
      ctx.restore();
    }

    // ── Pregunta ──────────────────────────────────────────
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.70)';
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(W*0.05,14,W*0.90,100,14);
    else ctx.rect(W*0.05,14,W*0.90,100);
    ctx.fill();
    ctx.textAlign='center';
    ctx.font='bold 36px Orbitron, sans-serif';
    ctx.fillStyle='#FFF'; ctx.shadowBlur=12; ctx.shadowColor=s.colorTema;
    ctx.fillText(s.pregunta, W/2, 62);
    ctx.font='16px Rajdhani, sans-serif';
    ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.shadowBlur=0;
    ctx.fillText(
      s.bonusActivo
        ? `⚡ MODO TELEPÁTICO — ${Math.ceil((BONUS_DURACION-s.bonusTick)/60)}s · ¡Corta todos los globos!`
        : '🥏 Levanta la mano 3s · Extiende el brazo para lanzar',
      W/2, 96
    );
    ctx.restore();

    // ── HUD Bonus: barra de tiempo ────────────────────────
    if (s.bonusActivo) {
      const prog  = 1 - s.bonusTick / BONUS_DURACION;
      const bW    = W*0.5, bX = W/2-bW/2, bY = H-48;
      ctx.save();
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(bX-4,bY-4,bW+8,20,6);
      else ctx.rect(bX-4,bY-4,bW+8,20);
      ctx.fill();
      const barC = prog > 0.5 ? '#FFE000' : prog > 0.25 ? '#FF8800' : '#FF2200';
      ctx.fillStyle=barC; ctx.shadowBlur=12; ctx.shadowColor=barC;
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(bX,bY,bW*prog,12,4);
      else ctx.rect(bX,bY,bW*prog,12);
      ctx.fill();
      ctx.restore();

      // Globos bonus
      s.bonusGlobos.forEach(g => {
        if(g.cortado) return;
        const gx=g.x*W, gy=g.y*H;
        const bob=Math.sin(g.fase)*4, alpha=Math.min(1,g.vida/20);

        // Colores por tipo
        const isPurpura = g.tipo==='purpura';
        const isVerde   = g.tipo==='verde';
        const c1 = isPurpura ? '#FFFFFF' : isVerde ? '#AAFFCC' : '#FFFFFF';
        const c2 = isPurpura ? '#CC44FF' : isVerde ? '#00DD66' : '#FFE000';
        const c3 = isPurpura ? '#8800CC' : isVerde ? '#008844' : '#FF9900';
        const hC = isPurpura ? '#CC44FF' : isVerde ? '#00FF88' : '#FFD700';
        const shadow = isPurpura ? '#CC00FF' : isVerde ? '#00FF66' : '#FFD700';

        ctx.save(); ctx.globalAlpha=alpha;
        ctx.translate(gx, gy+bob);

        // Halo exterior
        ctx.save();
        const haloPulse = isPurpura
          ? 0.30 + Math.sin(s.tick*0.18)*0.15  // púrpura más vivo
          : 0.18 + Math.sin(g.fase*1.5)*0.07;
        ctx.globalAlpha = haloPulse;
        const halo=ctx.createRadialGradient(0,0,0,0,0,g.radio*(isPurpura?2.4:2.0));
        halo.addColorStop(0,hC); halo.addColorStop(1,'transparent');
        ctx.fillStyle=halo; ctx.shadowBlur = isPurpura ? 30 : 0;
        ctx.shadowColor = shadow;
        ctx.beginPath(); ctx.arc(0,0,g.radio*(isPurpura?2.4:2.0),0,Math.PI*2); ctx.fill();
        ctx.restore();

        // Cuerpo
        const gg=ctx.createRadialGradient(-g.radio*0.3,-g.radio*0.3,3,0,0,g.radio);
        gg.addColorStop(0,c1); gg.addColorStop(0.35,c2);
        gg.addColorStop(0.75,c3); gg.addColorStop(1,c3+'88');
        ctx.fillStyle=gg; ctx.shadowBlur=isPurpura?30:18; ctx.shadowColor=shadow;
        ctx.beginPath(); ctx.arc(0,0,g.radio,0,Math.PI*2); ctx.fill();

        // Brillo especular
        ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.shadowBlur=0;
        ctx.beginPath();
        ctx.ellipse(-g.radio*0.25,-g.radio*0.3,g.radio*0.2,g.radio*0.12,-0.5,0,Math.PI*2);
        ctx.fill();
        ctx.restore();

        // Texto XP
        ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font=`bold ${isPurpura?20:16}px Orbitron, sans-serif`;
        ctx.fillStyle='#FFF'; ctx.shadowBlur=8; ctx.shadowColor=shadow;
        ctx.globalAlpha=alpha;
        ctx.fillText(`+${g.xp||BONUS_XP_VERDE}`, gx, gy+bob);
        ctx.restore();
      });
    }

    // ── Partículas ────────────────────────────────────────
    s.particulas.forEach(p => {
      ctx.save(); ctx.globalAlpha=Math.max(0,p.vida/p.vidaMax)*0.9;
      ctx.fillStyle=p.color; ctx.shadowBlur=6; ctx.shadowColor=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0.3,p.tam),0,Math.PI*2);
      ctx.fill(); ctx.restore();
    });

    // ── Mitades cayendo ───────────────────────────────────
    s.mitades.forEach(m => {
      ctx.save(); ctx.globalAlpha=m.alpha;
      ctx.translate(m.x, m.y); ctx.rotate(m.rot);
      ctx.save();
      ctx.beginPath();
      if(m.mitad===0) ctx.rect(-m.radio,-m.radio,m.radio,m.radio*2);
      else            ctx.rect(0,-m.radio,m.radio,m.radio*2);
      ctx.clip();
      const gGrad=ctx.createRadialGradient(-m.radio*0.3,-m.radio*0.3,4,0,0,m.radio);
      gGrad.addColorStop(0,'#FFF'); gGrad.addColorStop(0.25,m.color);
      gGrad.addColorStop(1,m.color);
      ctx.globalAlpha=0.7;
      ctx.fillStyle=gGrad; ctx.shadowBlur=15; ctx.shadowColor=m.color;
      ctx.beginPath(); ctx.arc(0,0,m.radio,0,Math.PI*2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=2.5;
      ctx.shadowBlur=8; ctx.shadowColor='#FFF';
      ctx.beginPath(); ctx.moveTo(0,-m.radio); ctx.lineTo(0,m.radio); ctx.stroke();
      ctx.restore();
    });

    // ── Globos de respuesta ───────────────────────────────
    if (!s.bonusActivo) {
      s.globos.forEach(g => {
        if(g.cortado) return;
        const gx=g.x*W, gy=g.y*H, bob=Math.sin(g.fase)*5;
        ctx.save(); ctx.translate(gx,gy+bob);
        ctx.save(); ctx.globalAlpha=0.13+Math.sin(g.fase*1.3)*0.06;
        const halo=ctx.createRadialGradient(0,0,0,0,0,g.radio*1.6);
        halo.addColorStop(0,g.color); halo.addColorStop(1,'transparent');
        ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(0,0,g.radio*1.6,0,Math.PI*2); ctx.fill();
        ctx.restore();
        const gGrad=ctx.createRadialGradient(-g.radio*0.35,-g.radio*0.35,4,0,0,g.radio);
        gGrad.addColorStop(0,'#FFF'); gGrad.addColorStop(0.2,g.color);
        gGrad.addColorStop(0.7,g.color); gGrad.addColorStop(1,g.color);
        ctx.globalAlpha=0.92;
        ctx.fillStyle=gGrad; ctx.shadowBlur=20; ctx.shadowColor=g.color;
        ctx.beginPath(); ctx.arc(0,0,g.radio,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,0.40)'; ctx.shadowBlur=0;
        ctx.beginPath(); ctx.ellipse(-g.radio*0.28,-g.radio*0.32,g.radio*0.22,g.radio*0.14,-0.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=g.color;
        ctx.beginPath(); ctx.moveTo(-5,g.radio-2); ctx.quadraticCurveTo(0,g.radio+14,5,g.radio-2); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(0,g.radio+14);
        ctx.quadraticCurveTo(10*Math.sin(g.fase),g.radio+50,0,g.radio+80); ctx.stroke();
        ctx.restore();
        // Texto
        ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font='bold 16px Orbitron, sans-serif';
        const palabras=g.texto.split(' ');
        let lineas=[],linea='';
        palabras.forEach(p=>{
          const t=linea+p+' ';
          if(ctx.measureText(t).width>g.radio*1.5&&linea){lineas.push(linea.trim());linea=p+' ';}
          else linea=t;
        });
        if(linea) lineas.push(linea.trim());
        const lH=20,bH=lineas.length*lH+10;
        const bW=Math.max(...lineas.map(l=>ctx.measureText(l).width))+16;
        ctx.fillStyle='rgba(0,0,0,0.75)';
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(gx-bW/2,gy+bob-bH/2,bW,bH,5);
        else ctx.rect(gx-bW/2,gy+bob-bH/2,bW,bH);
        ctx.fill();
        ctx.fillStyle='#FFF'; ctx.shadowBlur=3; ctx.shadowColor='#000';
        lineas.forEach((l,i)=>ctx.fillText(l,gx,gy+bob+(i-(lineas.length-1)/2)*lH));
        ctx.restore();
      });
    }

    // ── DISCO KIENZAN ─────────────────────────────────────
    // Disco pegado a la mano cuando está listo pero aún no lanzado
    const discoX = s.disco ? s.disco.x * W : (s._discoManoX !== undefined ? s._discoManoX * W : null);
    const discoY = s.disco ? s.disco.y * H : (s._discoManoY !== undefined ? s._discoManoY * H : null);
    const dibujarDisco = (s.disco && s.disco.modo !== 'desintegrando');

    if (dibujarDisco) {
      // 'espera', 'vuelo' y 'telepatico' se renderizan igual
      const d   = s.disco;
      const dx  = d.x * W, dy = d.y * H;
      const fading = d.modo === 'desintegrando';

      // Trail
      d.trail.forEach((t,i) => {
        const prog=1-i/d.trail.length;
        ctx.save(); ctx.globalAlpha=prog*0.28;
        ctx.translate(t.x*W,t.y*H);
        // Trail como discos de energía que se desvanecen — sin rotar
        const tG=ctx.createRadialGradient(0,0,0,0,0,28*prog);
        tG.addColorStop(0,'rgba(255,255,200,0.6)');
        tG.addColorStop(0.4,'rgba(255,210,0,0.3)');
        tG.addColorStop(1,'rgba(255,180,0,0)');
        ctx.fillStyle=tG; ctx.shadowBlur=8*prog; ctx.shadowColor='#FFE000';
        ctx.beginPath(); ctx.ellipse(0,0,30*prog,10*prog,0,0,Math.PI*2); ctx.fill();
        ctx.restore();
      });

      // ── DISCO KIENZAN — PIZZA HORIZONTAL SIEMPRE ────────
      // Clave: NINGUNA capa usa ctx.rotate() — la elipse nunca gira.
      // El efecto giroscópico se logra moviendo el punto de brillo
      // con trigonometría pura, sin rotar el contexto.
      ctx.save();
      ctx.translate(dx,dy);

      const R  = 62;
      const RY = R * 0.28; // muy plano — ratio 1:3.6 como el anime

      // Capa 1: corona de energía exterior difusa
      ctx.save();
      ctx.globalAlpha = 0.28 + Math.sin(s.tick*0.05)*0.07;
      const aura = ctx.createRadialGradient(0,0,R*0.5,0,0,R*1.6);
      aura.addColorStop(0,'rgba(255,245,80,0.45)');
      aura.addColorStop(0.5,'rgba(255,210,0,0.12)');
      aura.addColorStop(1,'transparent');
      ctx.fillStyle=aura; ctx.shadowBlur=0;
      ctx.beginPath(); ctx.ellipse(0,0,R*1.55,RY*1.55,0,0,Math.PI*2); ctx.fill();
      ctx.restore();

      // Capa 2: cuerpo del disco — gradiente radial puro, sin rotate
      ctx.save();
      ctx.shadowBlur  = 35;
      ctx.shadowColor = 'rgba(255,220,0,0.85)';
      const body = ctx.createRadialGradient(0,0,0,0,0,R);
      body.addColorStop(0,   'rgba(255,255,255,1)');
      body.addColorStop(0.1, 'rgba(255,255,230,1)');
      body.addColorStop(0.28,'rgba(255,242,60,0.97)');
      body.addColorStop(0.58,'rgba(255,198,0,0.78)');
      body.addColorStop(0.82,'rgba(255,160,0,0.35)');
      body.addColorStop(1,   'rgba(255,130,0,0)');
      ctx.fillStyle=body;
      ctx.beginPath(); ctx.ellipse(0,0,R,RY,0,0,Math.PI*2); ctx.fill();
      ctx.restore();

      // Capa 3: efecto giroscópico SIN ctx.rotate
      // Un punto de brillo orbita el interior calculado con cos/sin
      // La elipse siempre horizontal — solo el BRILLO se mueve
      ctx.save();
      ctx.globalAlpha = 0.55;
      const gAngle = s.tick * 0.045; // velocidad de giro del brillo
      // Brillo principal que orbita
      const bx = Math.cos(gAngle) * R * 0.42;
      const by = Math.sin(gAngle) * RY * 0.75; // achatado al radio Y
      const streak = ctx.createRadialGradient(bx,by,0,bx,by,R*0.55);
      streak.addColorStop(0,'rgba(255,255,255,0.7)');
      streak.addColorStop(0.3,'rgba(255,255,180,0.35)');
      streak.addColorStop(1,'rgba(255,255,100,0)');
      ctx.fillStyle=streak; ctx.shadowBlur=0;
      ctx.beginPath(); ctx.ellipse(0,0,R,RY,0,0,Math.PI*2); ctx.fill();
      // Segundo brillo opuesto (180°) más sutil
      ctx.globalAlpha = 0.25;
      const bx2 = Math.cos(gAngle+Math.PI)*R*0.42;
      const by2 = Math.sin(gAngle+Math.PI)*RY*0.75;
      const streak2 = ctx.createRadialGradient(bx2,by2,0,bx2,by2,R*0.4);
      streak2.addColorStop(0,'rgba(255,255,200,0.5)');
      streak2.addColorStop(1,'rgba(255,255,100,0)');
      ctx.fillStyle=streak2;
      ctx.beginPath(); ctx.ellipse(0,0,R,RY,0,0,Math.PI*2); ctx.fill();
      ctx.restore();

      // Capa 4: núcleo blanco puro — siempre centrado, siempre estático
      ctx.save();
      ctx.shadowBlur  = 28;
      ctx.shadowColor = '#FFFFFF';
      const core = ctx.createRadialGradient(0,0,0,0,0,R*0.26);
      core.addColorStop(0,'rgba(255,255,255,1)');
      core.addColorStop(0.45,'rgba(255,255,245,0.92)');
      core.addColorStop(1,'rgba(255,255,200,0)');
      ctx.fillStyle=core;
      ctx.beginPath(); ctx.ellipse(0,0,R*0.26,RY*0.26,0,0,Math.PI*2); ctx.fill();
      ctx.restore();

      ctx.restore(); // disco — ninguna capa rotó la elipse
    }

    // ── HUD de carga ──────────────────────────────────────
    if ((s.cargando||s.discoListo) && !s.bonusActivo) {
      const prog=Math.min(1,s.cargaTick/s.cargaMax);
      const bW=220,bH=22,bX=W/2-110,bY=H-55;
      ctx.save();
      ctx.fillStyle='rgba(0,0,0,0.6)';
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(bX-4,bY-4,bW+8,bH+8,8);
      else ctx.rect(bX-4,bY-4,bW+8,bH+8);
      ctx.fill();
      const bc=s.discoListo?'#FFFFFF':prog>0.6?'#FFE000':'#FFAA00';
      ctx.fillStyle=bc; ctx.shadowBlur=15; ctx.shadowColor=bc;
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(bX,bY,bW*prog,bH,6);
      else ctx.rect(bX,bY,bW*prog,bH);
      ctx.fill();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font='bold 13px Orbitron, sans-serif';
      ctx.fillStyle='#000'; ctx.shadowBlur=0;
      ctx.fillText(s.discoListo?'🥏 LISTO':`CARGANDO ${Math.round(prog*100)}%`, W/2, bY+bH/2);
      if(s.discoListo){
        ctx.font='bold 17px Orbitron, sans-serif';
        ctx.shadowBlur=18;
        if(!s._gestoFase || s._gestoFase==='esperando'){
          // Fase 1: pedir retracción
          ctx.fillStyle='#FFE000'; ctx.shadowColor='#FFE000';
          ctx.fillText('◀ RETRAE EL BRAZO', W/2, bY-26);
        } else if(s._gestoFase==='retraido'){
          // Fase 2: pedir extensión — parpadeo urgente
          const pulso = Math.sin(s.tick*0.4)>0;
          ctx.fillStyle= pulso ? '#FFFFFF' : '#FFE000';
          ctx.shadowColor='#FFFFFF';
          ctx.fillText('▶ ¡EXTIENDE Y LANZA!', W/2, bY-26);
        }
      }
      ctx.restore();
    }
  },

  // Disco formándose en la palma + halo telepático en bonus
  renderBrazos(ctx, landmarks, canvasW, canvasH) {
    const s = this._state;
    if (!s || !landmarks) return;
    const getRX = n => (1-n.x)*canvasW;
    const getRY = n => n.y*canvasH;

    // Halo de carga — disco crece de 8px a 62px (supera radio del globo 52px)
    if ((s.cargando||s.discoListo) && !s.bonusActivo) {
      const mun = s.manoActiva==='L' ? landmarks[15] : landmarks[16];
      if (!mun) return;
      const mx=getRX(mun), my=getRY(mun);
      const prog=Math.min(1,s.cargaTick/s.cargaMax);
      const radio = 8 + prog * 54;
      const pulso = s.discoListo ? 1 + Math.sin(s.tick*0.25)*0.08 : 1;

      ctx.save();
      ctx.globalAlpha=0.18+prog*0.28;
      const halo=ctx.createRadialGradient(mx,my,0,mx,my,radio*1.8*pulso);
      halo.addColorStop(0,'#FFE000'); halo.addColorStop(0.5,'rgba(255,200,0,0.3)');
      halo.addColorStop(1,'transparent');
      ctx.fillStyle=halo;
      ctx.beginPath(); ctx.arc(mx,my,radio*1.8*pulso,0,Math.PI*2); ctx.fill();

      if(prog>0.05){
        ctx.globalAlpha=0.3+prog*0.7;
        ctx.translate(mx,my);
        // NO rotamos el contexto — la elipse siempre horizontal
        const dg=ctx.createRadialGradient(0,0,0,0,0,radio);
        dg.addColorStop(0,'#FFFFFF'); dg.addColorStop(0.15,'#FFFFFF');
        dg.addColorStop(0.4,'#FFFF88'); dg.addColorStop(0.75,'#FFE000');
        dg.addColorStop(1,'rgba(255,200,0,0)');
        ctx.fillStyle=dg; ctx.shadowBlur=radio*0.6; ctx.shadowColor='rgba(255,230,0,0.8)';
        ctx.beginPath(); ctx.ellipse(0,0,radio,radio*0.33,0,0,Math.PI*2); ctx.fill();
        if(prog>0.5){
          // Aura de borde difusa — sin dientes, pura energía
          ctx.save();
          ctx.globalAlpha = (prog-0.5)*0.6;
          const edge = ctx.createRadialGradient(0,0,radio*0.82,0,0,radio*1.12);
          edge.addColorStop(0,'rgba(255,255,150,0.5)');
          edge.addColorStop(1,'rgba(255,200,0,0)');
          ctx.fillStyle=edge; ctx.shadowBlur=0;
          ctx.beginPath(); ctx.ellipse(0,0,radio*1.1,radio*0.38,0,0,Math.PI*2); ctx.fill();
          ctx.restore();
        }
        if(prog>0.2){
          const nucR=radio*0.22;
          const ng=ctx.createRadialGradient(0,0,0,0,0,nucR);
          ng.addColorStop(0,'#FFFFFF'); ng.addColorStop(1,'rgba(255,255,180,0)');
          ctx.fillStyle=ng; ctx.shadowBlur=nucR; ctx.shadowColor='#FFFFFF';
          ctx.beginPath(); ctx.ellipse(0,0,nucR,nucR*0.35,0,0,Math.PI*2); ctx.fill();
        }
        if(prog>0.4){
          // Brillo giroscópico — mismo sistema que el disco en vuelo
          const gA = s.tick * 0.045;
          const sbx = Math.cos(gA)*radio*0.42;
          const sby = Math.sin(gA)*radio*0.28;
          const sg = ctx.createRadialGradient(sbx,sby,0,sbx,sby,radio*0.6);
          sg.addColorStop(0,'rgba(255,255,255,'+Math.min(0.8,prog*0.9)+')');
          sg.addColorStop(1,'rgba(255,255,100,0)');
          ctx.fillStyle=sg; ctx.shadowBlur=0;
          ctx.globalAlpha=(0.3+prog*0.5)*ctx.globalAlpha;
          ctx.beginPath(); ctx.ellipse(0,0,radio,radio*0.33,0,0,Math.PI*2); ctx.fill();
        }
      }
      ctx.restore();
    }

    // Indicador telepático en bonus — halo en ambas manos
    if (s.bonusActivo) {
      [landmarks[15], landmarks[16]].forEach(mun => {
        if(!mun) return;
        const mx=getRX(mun), my=getRY(mun);
        ctx.save();
        ctx.globalAlpha=0.35+Math.sin(s.tick*0.12)*0.15;
        const h=ctx.createRadialGradient(mx,my,0,mx,my,40);
        h.addColorStop(0,'#FFE000'); h.addColorStop(1,'transparent');
        ctx.fillStyle=h; ctx.shadowBlur=0;
        ctx.beginPath(); ctx.arc(mx,my,40,0,Math.PI*2); ctx.fill();
        ctx.restore();
      });
    }
  },

  getState() { return this._state; },
};