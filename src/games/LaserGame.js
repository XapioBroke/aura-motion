// ============================================================
//  LASER GAME v5 — ORBE DE PLASMA
//  Mecánica: desdobla el brazo para disparar un orbe en línea
//  recta. Ambos brazos independientes, ilimitados en vuelo.
//  Incorrecto: el orbe REBOTA y sigue volando.
//  Correcto:   explosión y nueva ronda.
//
//  Detección de gesto:
//    - Mide ángulo codo: hombro→codo→muñeca
//    - CARGADO si ángulo < ANGULO_CARGA (brazo doblado)
//    - DISPARA si ángulo > ANGULO_DISPARO y venía de cargado
//      Y la velocidad de extensión supera DELTA_MINIMO
//    - Dirección = vector normalizado hombro→muñeca (espejado)
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

// ── Umbrales de gesto ──────────────────────────────────────
const ANGULO_CARGA   = 120; // grados — brazo "doblado"
const ANGULO_DISPARO = 155; // grados — brazo "extendido"
const DELTA_MINIMO   = 8;   // grados/frame mínimos para que cuente como rápido
const COOLDOWN_DISPARO = 700; // ms entre disparos por brazo

// ── Paleta hex fija (evita hsl() dinámico en addColorStop) ─
const COLORES_GLOBO = [
  { base: '#2EC4B6', ligero: '#2EC4B666' },
  { base: '#E94F6A', ligero: '#E94F6A66' },
  { base: '#4EA8DE', ligero: '#4EA8DE66' },
  { base: '#A78BFA', ligero: '#A78BFA66' },
  { base: '#34D399', ligero: '#34D39966' },
];

// ── Helpers geométricos ────────────────────────────────────
const _angulo = (A, B, C) => {
  // Ángulo en B formado por A-B-C, en grados
  const AB = { x: A.x - B.x, y: A.y - B.y };
  const CB = { x: C.x - B.x, y: C.y - B.y };
  const dot  = AB.x * CB.x + AB.y * CB.y;
  const magAB = Math.hypot(AB.x, AB.y);
  const magCB = Math.hypot(CB.x, CB.y);
  if (magAB === 0 || magCB === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / (magAB * magCB)))) * 180) / Math.PI;
};

const _normalize = (vx, vy) => {
  const mag = Math.hypot(vx, vy);
  if (mag === 0) return { x: 0, y: -1 };
  return { x: vx / mag, y: vy / mag };
};

// ── Configuración por dificultad ───────────────────────────
const DIF_MAP = {
  facil:   { puntosCorrecto: 15, puntosError: -5,  velOrbe: 0.012, cooldown: 1800, floatSpeed: 0.15 },
  medio:   { puntosCorrecto: 20, puntosError: -8,  velOrbe: 0.018, cooldown: 1500, floatSpeed: 0.20 },
  dificil: { puntosCorrecto: 30, puntosError: -12, velOrbe: 0.025, cooldown: 1000, floatSpeed: 0.28 },
};

export const LaserGame = {
  _state: null,
  _timers: [],

  init(materia, colorTema, config = {}) {
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];

    const dif     = config.dificultad      || 'medio';
    const tamMult = config.tamanoObjetivos ?? 1.0;
    const d       = DIF_MAP[dif] || DIF_MAP.medio;

    const reto = generarReto(materia);
    this._state = {
      materia, colorTema,
      globos:  [],
      orbes:   [],     // proyectiles en vuelo
      pregunta: reto.pregunta,
      tick:    0,

      // ── Config gameplay ──
      radioBase:      56 * tamMult,
      puntosCorrecto: d.puntosCorrecto,
      puntosError:    d.puntosError,
      cooldown:       d.cooldown,
      floatSpeed:     d.floatSpeed,
      velOrbe:        d.velOrbe,

      // ── Estado de brazos (L=izq, R=der) ──
      brazoL: { anguloPrev: 180, cargado: false, lastDisparo: 0 },
      brazoR: { anguloPrev: 180, cargado: false, lastDisparo: 0 },

      // ── Cooldown de resultado (para no duplicar eventos) ──
      enCooldown: true,   // gracia inicial 1.5s
    };
    this._generarGlobos(reto.opciones);

    const t = setTimeout(() => {
      if (this._state) this._state.enCooldown = false;
    }, 1500);
    this._timers.push(t);

    return this._state;
  },

  // ── Globos ─────────────────────────────────────────────
  _generarGlobos(opciones) {
    const s = this._state;
    const pos = [
      { x: 0.20, y: 0.30 },
      { x: 0.50, y: 0.24 },
      { x: 0.80, y: 0.30 },
    ];
    s.globos = opciones.map((opc, i) => {
      const c = COLORES_GLOBO[i % COLORES_GLOBO.length];
      return {
        x: pos[i]?.x ?? (0.2 + i * 0.3),
        y: pos[i]?.y ?? 0.27,
        baseY: pos[i]?.y ?? 0.27,
        radio: s.radioBase,
        texto: opc.texto,
        esCorrecto: opc.esCorrecto,
        explotando:  false,
        explotTick:  0,
        fase: Math.random() * Math.PI * 2,
        color:   c.base,
        colorBg: c.ligero,
        rebotes: 0,       // cuántas veces ha rebotado en él
        fragmentos: [],
      };
    });
  },

  _nuevaRonda() {
    if (!this._state) return;
    const s = this._state;
    const reto = generarReto(s.materia);
    s.pregunta  = reto.pregunta;
    s.orbes     = [];
    s.enCooldown = false;
    this._generarGlobos(reto.opciones);
  },

  // ── Disparo de orbe ────────────────────────────────────
  _disparar(origen, dir, brazoId, ahora) {
    const s = this._state;
    s.orbes.push({
      // posición en coordenadas normalizadas [0,1]
      x:  origen.x,
      y:  origen.y,
      vx: dir.x * s.velOrbe,
      vy: dir.y * s.velOrbe,
      brazoId,
      vida: 200,   // frames máximos antes de desaparecer
      trail: [],   // posiciones anteriores para el rastro
      rebotes: 0,
    });
    try { SFX.laser(); } catch (_) {}
  },

  // ── Update principal ───────────────────────────────────
  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;
    s.tick += delta;
    const ahora = performance.now();

    // ── 1. Flotar globos y animar explosiones ──
    s.globos.forEach(g => {
      if (!g.explotando) {
        g.y = g.baseY + Math.sin(s.tick * s.floatSpeed + g.fase) * 0.007; // tenue
      } else {
        g.explotTick++;
        g.fragmentos.forEach(f => { f.x += f.vx; f.y += f.vy; f.vy += 0.3; f.vida--; });
        g.fragmentos = g.fragmentos.filter(f => f.vida > 0);
      }
    });

    // ── 2. Mover orbes y detectar colisiones ──
    let resultado = null;

    for (let oi = s.orbes.length - 1; oi >= 0; oi--) {
      const o = s.orbes[oi];
      // Guardar trail
      o.trail.push({ x: o.x, y: o.y });
      if (o.trail.length > 10) o.trail.shift();

      o.x += o.vx;
      o.y += o.vy;
      o.vida--;

      // Eliminar si sale de pantalla o agotó vida
      if (o.x < -0.1 || o.x > 1.1 || o.y < -0.1 || o.y > 1.2 || o.vida <= 0) {
        s.orbes.splice(oi, 1);
        continue;
      }

      // Colisión con globos
      for (const g of s.globos) {
        if (g.explotando) continue;
        const gx = g.x, gy = g.y;
        const radioN = g.radio / canvasW; // radio en espacio normalizado
        const dist = Math.hypot(o.x - gx, o.y - gy);

        if (dist < radioN + 0.012) {
          if (g.esCorrecto) {
            // ✅ Explota el globo correcto
            g.explotando  = true;
            g.explotTick  = 0;
            g.fragmentos  = Array.from({ length: 24 }, () => ({
              x: gx * canvasW, y: gy * canvasH,
              vx: (Math.random() - 0.5) * 12,
              vy: -Math.random() * 10 - 2,
              vida: 30 + Math.random() * 20,
            }));
            s.orbes.splice(oi, 1);
            try { SFX.explosion(); } catch (_) {}
            const t = setTimeout(() => this._nuevaRonda(), s.cooldown);
            this._timers.push(t);
            resultado = { acierto: true, fallo: false, puntos: s.puntosCorrecto };
            break; // no seguir revisando globos para este orbe
          } else {
            // ❌ REBOTE — calcula normal de la superficie del globo
            const nx = (o.x - gx) / dist;
            const ny = (o.y - gy) / dist;
            // Reflexión: v' = v - 2(v·n)n
            const dot = o.vx * nx + o.vy * ny;
            o.vx = o.vx - 2 * dot * nx;
            o.vy = o.vy - 2 * dot * ny;
            // Empujar fuera para evitar re-colisión inmediata
            o.x = gx + nx * (radioN + 0.015);
            o.y = gy + ny * (radioN + 0.015);
            o.rebotes++;
            o.trail = []; // limpiar trail en rebote para efecto visual limpio
            try { SFX.error(); } catch (_) {}
            if (!resultado) {
              resultado = { acierto: false, fallo: true, puntos: s.puntosError, esRebote: true };
            }
          }
        }
      }
      if (resultado?.acierto) break; // acierto encontrado, parar
    }

    // ── 3. Detección de gesto de disparo ──
    if (!landmarks || s.enCooldown) return resultado;

    // landmarks en espacio normalizado — espejados para usuario
    // getRX aplica el espejo: x_pantalla = (1 - lm.x)
    // Para calcular el ángulo y dirección usamos coordenadas normalizadas con espejo
    const ex = (n) => 1 - n.x; // x espejada normalizada
    const ey = (n) => n.y;

    const brazos = [
      {
        id:      'L',
        hombro:  landmarks[11],
        codo:    landmarks[13],
        muneca:  landmarks[15],
        estado:  s.brazoL,
      },
      {
        id:      'R',
        hombro:  landmarks[12],
        codo:    landmarks[14],
        muneca:  landmarks[16],
        estado:  s.brazoR,
      },
    ];

    brazos.forEach(({ id, hombro, codo, muneca, estado }) => {
      if (!hombro || !codo || !muneca) return;
      if ((hombro.visibility ?? 1) < 0.5 || (codo.visibility ?? 1) < 0.5) return;

      // Calcular ángulo con coordenadas espejadas
      const H = { x: ex(hombro), y: ey(hombro) };
      const C = { x: ex(codo),   y: ey(codo)   };
      const M = { x: ex(muneca), y: ey(muneca)  };

      const anguloActual = _angulo(H, C, M);
      const delta_ang    = anguloActual - estado.anguloPrev;

      // Marcar como cargado si dobla el brazo
      if (anguloActual < ANGULO_CARGA) {
        estado.cargado = true;
      }

      // Disparar: estaba cargado + se extiende rápido + cooldown ok
      if (
        estado.cargado &&
        anguloActual > ANGULO_DISPARO &&
        delta_ang > DELTA_MINIMO &&
        (ahora - estado.lastDisparo) > COOLDOWN_DISPARO
      ) {
        estado.cargado    = false;
        estado.lastDisparo = ahora;

        // Dirección = vector normalizado hombro → muñeca (espejado)
        const dir = _normalize(M.x - H.x, M.y - H.y);

        // Origen = posición de la muñeca en espacio normalizado
        this._disparar({ x: M.x, y: M.y }, dir, id, ahora);
      }

      estado.anguloPrev = anguloActual;
    });

    return resultado;
  },

  // ── Render ─────────────────────────────────────────────
  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    // Overlay inicial
    if (s.enCooldown && s.tick < 2) {
      ctx.save();
      ctx.textAlign  = 'center';
      ctx.font       = `bold 28px Orbitron, sans-serif`;
      ctx.fillStyle  = s.colorTema;
      ctx.shadowBlur = 15; ctx.shadowColor = s.colorTema;
      ctx.fillText('⚡ CARGANDO PLASMA...', canvasW / 2, canvasH / 2);
      ctx.restore();
    }

    // Fondo oscuro detrás de la pregunta para legibilidad desde lejos
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect?.(canvasW * 0.05, 18, canvasW * 0.90, 110, 12) 
      ?? ctx.rect(canvasW * 0.05, 18, canvasW * 0.90, 110);
    ctx.fill();
    ctx.restore();
    // Pregunta
    ctx.save();
    ctx.textAlign  = 'center';
    ctx.font = `bold 42px Orbitron, sans-serif`;
    ctx.fillStyle  = '#FFFFFF';
    ctx.shadowBlur = 14; ctx.shadowColor = s.colorTema;
    ctx.fillText(s.pregunta, canvasW / 2, 72);
    ctx.font = `20px Rajdhani, sans-serif`;
    ctx.fillStyle  = 'rgba(255,255,255,0.55)'; ctx.shadowBlur = 0;
    ctx.fillText('⚡ Dobla y extiende el brazo para disparar · El orbe rebota en los incorrectos', canvasW / 2, 105);
    ctx.restore();

    // ── Orbes en vuelo ──
    s.orbes.forEach(o => {
      const ox = o.x * canvasW, oy = o.y * canvasH;

      // Trail (rastro de energía)
      o.trail.forEach((p, i) => {
        const alpha = (i / o.trail.length) * 0.5;
        const r     = 8 * (i / o.trail.length);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = s.colorTema;
        ctx.shadowBlur  = 10; ctx.shadowColor = s.colorTema;
        ctx.beginPath();
        ctx.arc(p.x * canvasW, p.y * canvasH, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Orbe principal
      ctx.save();
      const pulso = 1 + Math.sin(s.tick * 0.3) * 0.15;
      const radio = 18 * pulso;
      const grad  = ctx.createRadialGradient(ox, oy, 2, ox, oy, radio);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.4, s.colorTema);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.shadowBlur  = 30; ctx.shadowColor = s.colorTema;
      ctx.fillStyle   = grad;
      ctx.beginPath(); ctx.arc(ox, oy, radio, 0, Math.PI * 2); ctx.fill();

      // Indicador de rebotes
      if (o.rebotes > 0) {
        ctx.font      = `bold 14px Orbitron`;
        ctx.fillStyle = '#FFD700'; ctx.shadowBlur = 6; ctx.shadowColor = '#FFD700';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(`×${o.rebotes}`, ox, oy - radio - 4);
      }
      ctx.restore();
    });

    // ── Globos ──
    s.globos.forEach(g => {
      const gx = g.x * canvasW, gy = g.y * canvasH;

      if (g.explotando) {
        g.fragmentos.forEach(f => {
          ctx.save(); ctx.globalAlpha = Math.max(0, f.vida / 50);
          ctx.fillStyle = g.color; ctx.shadowBlur = 8; ctx.shadowColor = g.color;
          ctx.beginPath(); ctx.arc(f.x, f.y, 5, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        if (g.explotTick < 14) {
          ctx.save();
          ctx.globalAlpha = (14 - g.explotTick) / 14;
          ctx.fillStyle   = g.esCorrecto ? '#00FF41' : '#FF4444';
          ctx.shadowBlur  = 50; ctx.shadowColor = g.esCorrecto ? '#00FF41' : '#FF4444';
          ctx.beginPath(); ctx.arc(gx, gy, g.radio * 2.8, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        return;
      }

      ctx.save();
      // Hilo
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx, gy + g.radio);
      ctx.lineTo(gx + Math.sin(g.fase) * 8, gy + g.radio + 55);
      ctx.stroke();

      // Globo con glow
      ctx.shadowBlur = 20; ctx.shadowColor = g.color;
      ctx.beginPath(); ctx.arc(gx, gy, g.radio, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(
        gx - g.radio * 0.3, gy - g.radio * 0.35, 4,
        gx, gy, g.radio
      );
      grad.addColorStop(0, '#FFFFFF99');
      grad.addColorStop(0.35, g.color);
      grad.addColorStop(1, g.colorBg);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = '#FFFFFF44'; ctx.lineWidth = 2; ctx.stroke();

      // Nudo
      ctx.beginPath(); ctx.arc(gx, gy + g.radio - 4, 5, 0, Math.PI * 2);
      ctx.fillStyle = g.color; ctx.shadowBlur = 0; ctx.fill();

      // Brillo interior
      ctx.beginPath();
      ctx.arc(gx - g.radio * 0.28, gy - g.radio * 0.32, g.radio * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();

      // Texto — wrap con fondo para visibilidad
      ctx.font = `bold 20px Orbitron, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowBlur = 0;
      const palabras = g.texto.split(' ');
      let lineas = [], linea = '';
      const maxW = g.radio * 1.55;
      palabras.forEach(p => {
        const t = linea + p + ' ';
        if (ctx.measureText(t).width > maxW && linea) { lineas.push(linea.trim()); linea = p + ' '; }
        else linea = t;
      });
      if (linea) lineas.push(linea.trim());
      const lineH = 20;
      const bH = lineas.length * lineH + 10;
      const bW = Math.max(...lineas.map(l => ctx.measureText(l).width)) + 18;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.roundRect?.(gx - bW/2, gy - bH/2, bW, bH, 5) ?? ctx.rect(gx - bW/2, gy - bH/2, bW, bH);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      lineas.forEach((l, i) => ctx.fillText(l, gx, gy + (i - (lineas.length - 1) / 2) * lineH));

      ctx.restore();
    });

    // ── Indicadores de brazos (estado CARGADO) ──
    // Se renderizan en BodySensor via landmarks, aquí solo el HUD
  },

  // ── Render del estado de carga en los brazos (llamado desde BodySensor) ──
  renderBrazos(ctx, landmarks, canvasW, canvasH) {
    const s = this._state;
    if (!s || !landmarks) return;

    const ex = (n) => (1 - n.x) * canvasW;
    const ey = (n) => n.y * canvasH;

    const brazos = [
      { muneca: landmarks[15], estado: s.brazoL },
      { muneca: landmarks[16], estado: s.brazoR },
    ];

    brazos.forEach(({ muneca, estado }) => {
      if (!muneca) return;
      const mx = ex(muneca), my = ey(muneca);

      if (estado.cargado) {
        // Anillo pulsante alrededor de la muñeca cuando está cargado
        const pulso = 1 + Math.sin(s.tick * 0.25) * 0.3;
        ctx.save();
        ctx.strokeStyle = s.colorTema;
        ctx.lineWidth   = 3;
        ctx.shadowBlur  = 20; ctx.shadowColor = s.colorTema;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(mx, my, 28 * pulso, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle   = s.colorTema;
        ctx.beginPath(); ctx.arc(mx, my, 28 * pulso, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Texto "LISTO"
        ctx.save();
        ctx.font      = `bold 13px Orbitron`;
        ctx.fillStyle = s.colorTema; ctx.shadowBlur = 8; ctx.shadowColor = s.colorTema;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('⚡ LISTO', mx, my - 35);
        ctx.restore();
      }
    });
  },

  getState() { return this._state; },
};