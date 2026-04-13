// ============================================================
//  TIRO AL BLANCO GAME v1.0 — Apunta y dispara con precisión
//  ✅ Detección: dedo índice apuntando + brazo extendido
//  ✅ Zona de recarga: llevar mano a cadera = recargar
//  ✅ Dianas animadas en trayectorias (circular, zigzag, rebote)
//  ✅ Sistema de PRECISIÓN — headshot (centro) da bonus XP
//  ✅ Proyectil visual tipo bala con trayectoria y humo
//  ✅ Explosión de diana por anillos concéntricos
//  ✅ HUD: mira telescópica en la mano + munición restante
//  ✅ Efectos de flash de disparo y humo residual
//  ✅ API: init / update / render / renderBrazos / getState
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

// ── Umbrales de gesto de disparo ───────────────────────────
const ANGULO_MIN_DISPARO = 145;  // brazo casi extendido
const DELTA_ANGULO_DISP  = 12;   // grados/frame — velocidad de extensión
const COOLDOWN_DISPARO   = 900;  // ms entre disparos

// ── Zonas de recarga (cadera) ───────────────────────────────
const RECARGA_Y_NORM  = 0.72;   // y normalizado de las caderas
const RECARGA_TIEMPO  = 55;     // frames para recargar 1 bala
const MUNICION_MAX    = 5;

// ── Precisión de impacto ───────────────────────────────────
const RADIO_HEADSHOT = 0.35;    // fracción del radio total para headshot

// ── Configuración por dificultad ───────────────────────────
const DIF_MAP = {
  facil:   { puntosCorrecto: 18, puntosError: -5, ptoHeadshot: 35, cooldown: 1700, velDiana: 0.5, numDianas: 2 },
  medio:   { puntosCorrecto: 25, puntosError: -8, ptoHeadshot: 50, cooldown: 1400, velDiana: 0.9, numDianas: 3 },
  dificil: { puntosCorrecto: 38, puntosError: -12, ptoHeadshot: 70, cooldown: 1100, velDiana: 1.4, numDianas: 3 },
};

// ── Trayectorias de diana ──────────────────────────────────
const TRAYECTORIAS = ['horizontal', 'circular', 'zigzag', 'hover'];

const _anguloExtension = (hombro, codo, muneca) => {
  if (!hombro || !codo || !muneca) return 0;
  const AB = { x: hombro.x - codo.x, y: hombro.y - codo.y };
  const CB = { x: muneca.x - codo.x, y: muneca.y - codo.y };
  const dot = AB.x * CB.x + AB.y * CB.y;
  const mag = Math.hypot(AB.x, AB.y) * Math.hypot(CB.x, CB.y);
  return mag === 0 ? 0 : (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
};

export const TiroAlBlancoGame = {
  _state: null,
  _timers: [],

  init(materia, colorTema, config = {}) {
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];

    const dif     = config.dificultad      || 'medio';
    const tamMult = config.tamanoObjetivos ?? 1.0;
    const velMult = config.velocidad        ?? 1.0;
    const d       = DIF_MAP[dif] || DIF_MAP.medio;

    const reto = generarReto(materia);

    this._state = {
      materia,
      colorTema,
      pregunta:       reto.pregunta,
      tick:           0,
      velMult,

      // Config
      puntosCorrecto: d.puntosCorrecto,
      puntosError:    d.puntosError,
      ptoHeadshot:    d.ptoHeadshot,
      cooldown:       d.cooldown,
      velDiana:       d.velDiana * velMult,
      radioDiana:     60 * tamMult,

      // Estado
      enCooldown:   false,
      municion:     MUNICION_MAX,
      recargaTick:  0,
      recargando:   false,

      // Historial de brazos
      brazoL: { angPrev: 0, lastDisparo: 0 },
      brazoR: { angPrev: 0, lastDisparo: 0 },

      // Proyectiles en vuelo
      balas: [],

      // Efectos
      explosiones:  [],   // { x, y, radio, maxRadio, color, vida, anillos }
      humo:         [],   // { x, y, radio, vida, drift }
      textos:       [],   // flotantes
      flashMano:    0,    // frames de flash en mano

      // Mira (crosshair) en la mano activa
      manoActiva:   'R',  // qué mano está apuntando
      miraX:        0.5,
      miraY:        0.5,

      // Dianas
      dianas: [],
    };

    this._generarDianas(reto.opciones, d.numDianas, tamMult);
    return this._state;
  },

  // ── Generar dianas con trayectorias ───────────────────
  _generarDianas(opciones, num, tamMult) {
    const s = this._state;
    s.dianas = opciones.slice(0, num).map((opc, i) => {
      const trayectoria = TRAYECTORIAS[i % TRAYECTORIAS.length];
      const xBase = 0.18 + (i / Math.max(num - 1, 1)) * 0.64;
      const yBase = 0.35 + Math.random() * 0.25;
      return {
        x:    xBase,
        y:    yBase,
        xBase, yBase,
        radio: s.radioDiana,
        texto: opc.texto,
        esCorrecto: opc.esCorrecto,
        trayectoria,
        fase: Math.random() * Math.PI * 2,
        velX: (Math.random() - 0.5) * 0.003 * s.velDiana,
        velY: (Math.random() - 0.5) * 0.002 * s.velDiana,
        angCircular: Math.random() * Math.PI * 2,
        zigzagDir: 1,

        // Visual
        rotacion:  0,
        velRot:    (Math.random() - 0.5) * 0.015,
        pulsacion: 0,
        impacto:   0,       // frames de impacto (squish)
        destruida: false,
        destruyendoTick: 0,
        fragmentos: [],
      };
    });
  },

  // ── Nueva ronda ────────────────────────────────────────
  _nuevaRonda() {
    if (!this._state) return;
    const s = this._state;
    const reto = generarReto(s.materia);
    s.pregunta   = reto.pregunta;
    s.enCooldown = false;
    s.balas      = [];
    s.municion   = Math.min(MUNICION_MAX, s.municion + 2); // bonus de munición

    const tam = s.radioDiana / 60;
    const num = s.dianas.length;
    this._generarDianas(reto.opciones, num, tam);
  },

  // ── Disparar bala ──────────────────────────────────────
  _disparar(oriX, oriY, dirX, dirY, lado) {
    const s = this._state;
    if (s.municion <= 0) {
      try { SFX.ui(); } catch(_) {} // click vacío
      return false;
    }
    s.municion--;
    s.flashMano = 10;
    try { SFX.laser(); } catch(_) {}

    // Humo del disparo
    for (let i = 0; i < 5; i++) {
      s.humo.push({
        x: oriX + (Math.random() - 0.5) * 20,
        y: oriY + (Math.random() - 0.5) * 20,
        radio: 8 + Math.random() * 12,
        maxR: 25 + Math.random() * 20,
        vida: 20 + Math.random() * 15,
        drift: (Math.random() - 0.5) * 1.5,
      });
    }

    const velocidad = 0.028;
    s.balas.push({
      x:   oriX,
      y:   oriY,
      vx:  dirX * velocidad,
      vy:  dirY * velocidad,
      trail: [],
      vida: 80,
      lado,
    });
    return true;
  },

  // ── Explosión de diana ─────────────────────────────────
  _explosionDiana(diana, canvasW, canvasH, esHeadshot) {
    const s   = this._state;
    const dx  = diana.x * canvasW;
    const dy  = diana.y * canvasH;
    const col = diana.esCorrecto ? (esHeadshot ? '#FFD700' : '#00FF41') : '#FF4444';

    s.explosiones.push({
      x: dx, y: dy,
      radio: 0,
      maxRadio: diana.radio * (esHeadshot ? 3.5 : 2.5),
      color: col,
      vida: 35,
      vidaMax: 35,
      anillos: esHeadshot ? 4 : 2,
    });

    // Fragmentos de diana
    diana.destruida   = true;
    diana.destruyendoTick = 0;
    diana.fragmentos  = Array.from({ length: 24 }, (_, i) => {
      const ang   = (i / 24) * Math.PI * 2;
      const dist  = diana.radio * (0.4 + Math.random() * 0.6);
      const fuerza = 3 + Math.random() * 8;
      const anillo = ['rojo','blanco','azul','amarillo'][i % 4];
      return {
        x: dx, y: dy,
        vx: Math.cos(ang) * fuerza,
        vy: Math.sin(ang) * fuerza - 3,
        radio: dist * 0.18,
        vida: 45 + Math.random() * 30,
        color: { rojo: '#E63946', blanco: '#FFFFFF', azul: '#2196F3', amarillo: '#FFD700' }[anillo],
      };
    });
  },

  // ── Update principal ───────────────────────────────────
  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;
    s.tick += delta;

    // ── 1. Mover dianas ──
    s.dianas.forEach(d => {
      if (d.destruida) {
        d.destruyendoTick++;
        d.fragmentos.forEach(f => {
          f.x += f.vx; f.y += f.vy; f.vy += 0.25; f.vida--;
        });
        d.fragmentos = d.fragmentos.filter(f => f.vida > 0);
        return;
      }
      d.rotacion += d.velRot;
      if (d.impacto > 0) d.impacto--;

      switch (d.trayectoria) {
        case 'horizontal':
          d.x += d.velX;
          if (d.x < 0.08 || d.x > 0.92) d.velX *= -1;
          break;
        case 'circular':
          d.angCircular += 0.012 * s.velDiana;
          d.x = d.xBase + Math.cos(d.angCircular) * 0.14;
          d.y = d.yBase + Math.sin(d.angCircular) * 0.09;
          break;
        case 'zigzag':
          d.x += d.velX;
          d.y += Math.sin(s.tick * 0.04 + d.fase) * 0.003 * s.velDiana;
          if (d.x < 0.08 || d.x > 0.92) { d.velX *= -1; d.zigzagDir *= -1; }
          if (d.y < 0.15 || d.y > 0.75) d.velY *= -1;
          break;
        case 'hover':
          d.x = d.xBase + Math.sin(s.tick * 0.02 + d.fase) * 0.08;
          d.y = d.yBase + Math.cos(s.tick * 0.015 + d.fase) * 0.06;
          break;
      }
    });

    // ── 2. Mover balas y colisiones ──
    let resultado = null;

    for (let bi = s.balas.length - 1; bi >= 0; bi--) {
      const bala = s.balas[bi];
      bala.trail.push({ x: bala.x, y: bala.y });
      if (bala.trail.length > 8) bala.trail.shift();

      bala.x   += bala.vx;
      bala.y   += bala.vy;
      bala.vida--;

      // Fuera de pantalla
      if (bala.x < -0.1 || bala.x > 1.1 || bala.y < -0.1 || bala.y > 1.1 || bala.vida <= 0) {
        s.balas.splice(bi, 1);
        continue;
      }

      // Colisión con diana
      for (const diana of s.dianas) {
        if (diana.destruida) continue;
        const dx  = diana.x;
        const dy  = diana.y;
        const radioN = diana.radio / canvasW;
        const dist   = Math.hypot(bala.x - dx, bala.y - dy);

        if (dist < radioN + 0.01) {
          const esHeadshot = dist < radioN * RADIO_HEADSHOT;
          this._explosionDiana(diana, canvasW, canvasH, esHeadshot);
          s.balas.splice(bi, 1);

          if (diana.esCorrecto) {
            const xp = esHeadshot ? s.ptoHeadshot : s.puntosCorrecto;
            try { SFX.acierto(); if (esHeadshot) SFX.bonus(); } catch(_) {}
            this._agregarTexto(diana.x * canvasW, diana.y * canvasH - 60,
              esHeadshot ? `🎯 ¡HEADSHOT! +${xp} XP` : `✅ +${xp} XP`,
              esHeadshot ? '#FFD700' : '#00FF41',
              esHeadshot ? 28 : 22
            );
            s.enCooldown = true;
            const t = setTimeout(() => this._nuevaRonda(), s.cooldown);
            this._timers.push(t);
            resultado = { acierto: true, fallo: false, puntos: xp, msg: `+${xp} XP` };
          } else {
            try { SFX.error(); } catch(_) {}
            this._agregarTexto(diana.x * canvasW, diana.y * canvasH - 50, '❌ ¡Falsa!', '#FF4444');
            s.enCooldown = true;
            const t = setTimeout(() => { if (s) s.enCooldown = false; }, 600);
            this._timers.push(t);
            resultado = { acierto: false, fallo: true, puntos: s.puntosError };
          }
          break;
        }
      }
      if (resultado) break;
    }

    // ── 3. Actualizar efectos ──
    s.explosiones.forEach(e => { e.radio += (e.maxRadio - e.radio) * 0.18; e.vida--; });
    s.explosiones = s.explosiones.filter(e => e.vida > 0);

    s.humo.forEach(h => { h.radio += 0.8; h.x += h.drift; h.vida--; });
    s.humo = s.humo.filter(h => h.vida > 0);

    s.textos.forEach(t => { t.y += t.vy; t.vy *= 0.92; t.vida--; });
    s.textos = s.textos.filter(t => t.vida > 0);

    if (s.flashMano > 0) s.flashMano--;

    // ── 4. Recarga automática si mano baja a cadera ──
    if (!landmarks) return resultado;
    const getRY = n => n.y;

    const munecaL  = landmarks[15];
    const munecaR  = landmarks[16];
    const cadArriba = RECARGA_Y_NORM;
    const enZonaRecargaL = munecaL && getRY(munecaL) > cadArriba;
    const enZonaRecargaR = munecaR && getRY(munecaR) > cadArriba;

    if ((enZonaRecargaL || enZonaRecargaR) && s.municion < MUNICION_MAX) {
      s.recargaTick++;
      if (s.recargaTick >= RECARGA_TIEMPO) {
        s.municion = Math.min(MUNICION_MAX, s.municion + 1);
        s.recargaTick = 0;
        try { SFX.checkpoint(); } catch(_) {}
      }
      s.recargando = true;
    } else {
      s.recargaTick = Math.max(0, s.recargaTick - 1);
      s.recargando  = false;
    }

    // ── 5. Detección de disparo ──
    if (s.enCooldown) return resultado;

    const ahora   = performance.now();
    const ex      = n => 1 - n.x;
    const ey      = n => n.y;

    const brazosData = [
      { id: 'L', hombro: landmarks[11], codo: landmarks[13], muneca: landmarks[15], estado: s.brazoL },
      { id: 'R', hombro: landmarks[12], codo: landmarks[14], muneca: landmarks[16], estado: s.brazoR },
    ];

    for (const { id, hombro, codo, muneca, estado } of brazosData) {
      if (!hombro || !codo || !muneca) continue;
      const ang    = _anguloExtension(hombro, codo, muneca);
      const delta_ang = ang - estado.angPrev;
      const coolOk = (ahora - estado.lastDisparo) > COOLDOWN_DISPARO;

      // Disparo: brazo extendido + extensión rápida + cooldown
      if (ang > ANGULO_MIN_DISPARO && delta_ang > DELTA_ANGULO_DISP && coolOk) {
        estado.lastDisparo = ahora;

        // Actualizar posición de mira
        s.miraX       = ex(muneca);
        s.miraY       = ey(muneca);
        s.manoActiva  = id;

        // Dirección del disparo: hombro → muñeca
        const dX = ex(muneca) - ex(hombro);
        const dY = ey(muneca) - ey(hombro);
        const mag = Math.hypot(dX, dY) || 1;

        this._disparar(s.miraX, s.miraY, dX / mag, dY / mag, id);
      }

      // Actualizar mira continuamente si el brazo está extendido
      if (ang > 130) {
        s.miraX = ex(muneca) + (s.miraX - ex(muneca)) * 0.7;
        s.miraY = ey(muneca) + (s.miraY - ey(muneca)) * 0.7;
        s.manoActiva = id;
      }

      estado.angPrev = ang;
    }

    return resultado;
  },

  _agregarTexto(x, y, texto, color, tamaño = 22) {
    this._state.textos.push({ x, y, texto, color, tamaño, vida: 65, vy: -2.5 });
  },

  // ── Render ─────────────────────────────────────────────
  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    // ── Humo de disparo ──
    s.humo.forEach(h => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, h.vida / 35) * 0.35;
      ctx.fillStyle   = '#AAAAAA';
      ctx.beginPath(); ctx.arc(h.x * canvasW, h.y * canvasH, h.radio, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // ── Explosiones ──
    s.explosiones.forEach(e => {
      for (let a = 0; a < e.anillos; a++) {
        const rAnillo = e.radio * (0.4 + a * 0.22);
        ctx.save();
        ctx.globalAlpha = (e.vida / e.vidaMax) * (1 - a * 0.2);
        ctx.strokeStyle = e.color;
        ctx.lineWidth   = 4 - a;
        ctx.shadowBlur  = 20; ctx.shadowColor = e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, rAnillo, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    });

    // ── Pregunta ──
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.70)';
    ctx.beginPath();
    ctx.roundRect?.(canvasW * 0.05, 14, canvasW * 0.90, 112, 14)
      ?? ctx.rect(canvasW * 0.05, 14, canvasW * 0.90, 112);
    ctx.fill();
    ctx.textAlign  = 'center';
    ctx.shadowBlur = 14; ctx.shadowColor = s.colorTema;
    ctx.font       = 'bold 40px Orbitron, sans-serif';
    ctx.fillStyle  = '#FFFFFF';
    ctx.fillText(s.pregunta, canvasW / 2, 70);
    ctx.font       = '18px Rajdhani, sans-serif';
    ctx.fillStyle  = 'rgba(255,255,255,0.55)';
    ctx.shadowBlur = 0;
    ctx.fillText('🎯 Apunta y extiende el brazo para disparar · Centro = HEADSHOT', canvasW / 2, 106);
    ctx.restore();

    // ── HUD munición ──
    const hudX = 30, hudY = canvasH - 55;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect?.(hudX - 10, hudY - 8, MUNICION_MAX * 28 + 20, 36, 8)
      ?? ctx.rect(hudX - 10, hudY - 8, MUNICION_MAX * 28 + 20, 36);
    ctx.fill();
    for (let m = 0; m < MUNICION_MAX; m++) {
      const loaded  = m < s.municion;
      ctx.fillStyle = loaded ? '#FFD700' : 'rgba(255,255,255,0.15)';
      ctx.shadowBlur = loaded ? 10 : 0; ctx.shadowColor = '#FFD700';
      ctx.beginPath();
      ctx.roundRect?.(hudX + m * 28, hudY, 20, 20, 3) ?? ctx.rect(hudX + m * 28, hudY, 20, 20);
      ctx.fill();
    }
    // Barra de recarga
    if (s.recargando && s.municion < MUNICION_MAX) {
      const pct  = s.recargaTick / RECARGA_TIEMPO;
      ctx.fillStyle = '#00FFFF';
      ctx.shadowBlur = 8; ctx.shadowColor = '#00FFFF';
      ctx.beginPath();
      ctx.roundRect?.(hudX - 8, hudY + 26, (MUNICION_MAX * 28 + 16) * pct, 6, 3)
        ?? ctx.rect(hudX - 8, hudY + 26, (MUNICION_MAX * 28 + 16) * pct, 6);
      ctx.fill();
      ctx.fillStyle = '#00FFFF';
      ctx.font = '11px Orbitron';
      ctx.textAlign = 'left';
      ctx.fillText(`↺ RECARGANDO...`, hudX - 8, hudY - 12);
    }
    ctx.font      = 'bold 12px Orbitron';
    ctx.fillStyle = '#AAA'; ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.fillText(`🔫 BALAS`, hudX - 10, hudY - 12);
    ctx.restore();

    // ── Balas ──
    s.balas.forEach(bala => {
      // Trail
      bala.trail.forEach((p, i) => {
        const alpha = (i / bala.trail.length) * 0.6;
        const r     = 5 * (i / bala.trail.length);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = '#FFFAA0';
        ctx.shadowBlur  = 8; ctx.shadowColor = '#FFD700';
        ctx.beginPath(); ctx.arc(p.x * canvasW, p.y * canvasH, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
      // Bala
      ctx.save();
      const bx = bala.x * canvasW, by = bala.y * canvasH;
      ctx.shadowBlur  = 20; ctx.shadowColor = '#FFD700';
      ctx.fillStyle   = '#FFD700';
      ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(bx - 2, by - 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // ── Dianas ──
    s.dianas.forEach(diana => {
      const dx = diana.x * canvasW;
      const dy = diana.y * canvasH;
      const r  = diana.radio;

      if (diana.destruida) {
        diana.fragmentos.forEach(f => {
          ctx.save();
          ctx.globalAlpha = Math.max(0, f.vida / 75);
          ctx.fillStyle   = f.color;
          ctx.shadowBlur  = 6; ctx.shadowColor = f.color;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.radio, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        return;
      }

      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(diana.rotacion);

      // Squish al impacto
      const squish = diana.impacto / 8;
      ctx.scale(1 + squish * 0.15, 1 - squish * 0.1);

      ctx.shadowBlur  = 18;
      ctx.shadowColor = diana.esCorrecto ? '#00FF41' : '#FF4444';

      // Anillos de diana (de afuera hacia adentro)
      const colores = ['#E63946', '#FFFFFF', '#2196F3', '#FFD700', '#E63946'];
      const radios  = [1, 0.78, 0.56, 0.34, 0.16];
      radios.forEach((rFrac, i) => {
        ctx.beginPath();
        ctx.arc(0, 0, r * rFrac, 0, Math.PI * 2);
        ctx.fillStyle = colores[i];
        if (i === 0) ctx.shadowBlur = 12, ctx.shadowColor = colores[i];
        else ctx.shadowBlur = 0;
        ctx.fill();
      });

      // Borde exterior
      ctx.strokeStyle = diana.esCorrecto ? '#00FF41AA' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth   = diana.esCorrecto ? 3 : 1.5;
      ctx.shadowBlur  = diana.esCorrecto ? 15 : 0;
      ctx.shadowColor = '#00FF41';
      ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, Math.PI * 2); ctx.stroke();

      // Retícula (líneas de mira)
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth   = 1.5; ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, 0); ctx.lineTo(-r * 0.15, 0);
      ctx.moveTo(r * 0.15, 0); ctx.lineTo(r * 1.1, 0);
      ctx.moveTo(0, -r * 1.1); ctx.lineTo(0, -r * 0.15);
      ctx.moveTo(0, r * 0.15); ctx.lineTo(0, r * 1.1);
      ctx.stroke();

      ctx.restore();

      // Texto (fuera del rotate)
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font         = 'bold 17px Orbitron, sans-serif';
      const palabras   = diana.texto.split(' ');
      let lineas = [], linea = '';
      const maxW = r * 1.4;
      palabras.forEach(w => {
        const t = linea + w + ' ';
        if (ctx.measureText(t).width > maxW && linea) { lineas.push(linea.trim()); linea = w + ' '; }
        else linea = t;
      });
      if (linea) lineas.push(linea.trim());
      const lineH = 19;
      const bH    = lineas.length * lineH + 12;
      const bW    = Math.min(r * 2, Math.max(...lineas.map(l => ctx.measureText(l).width)) + 20);
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.roundRect?.(dx - bW/2, dy - bH/2, bW, bH, 5) ?? ctx.rect(dx - bW/2, dy - bH/2, bW, bH);
      ctx.fill();
      ctx.fillStyle  = '#FFFFFF';
      ctx.shadowBlur = 4; ctx.shadowColor = '#FFF';
      lineas.forEach((l, i) => ctx.fillText(l, dx, dy + (i - (lineas.length - 1) / 2) * lineH));
      ctx.restore();
    });

    // ── Mira telescópica (crosshair) en el canvas ──
    if (!s.enCooldown) {
      const mirX = s.miraX * canvasW;
      const mirY = s.miraY * canvasH;
      const cr   = 28;
      ctx.save();
      ctx.strokeStyle = s.colorTema;
      ctx.lineWidth   = 2.5;
      ctx.shadowBlur  = 15; ctx.shadowColor = s.colorTema;
      ctx.globalAlpha = 0.85;
      // Círculo exterior
      ctx.beginPath(); ctx.arc(mirX, mirY, cr, 0, Math.PI * 2); ctx.stroke();
      // Círculo interior
      ctx.beginPath(); ctx.arc(mirX, mirY, 5, 0, Math.PI * 2); ctx.stroke();
      // Cruces
      ctx.lineWidth = 2;
      [[-cr, 0, -cr * 0.4, 0], [cr * 0.4, 0, cr, 0],
       [0, -cr, 0, -cr * 0.4], [0, cr * 0.4, 0, cr]].forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath();
        ctx.moveTo(mirX + x1, mirY + y1);
        ctx.lineTo(mirX + x2, mirY + y2);
        ctx.stroke();
      });
      // Flash de disparo
      if (s.flashMano > 0) {
        ctx.globalAlpha = s.flashMano / 10;
        ctx.fillStyle   = '#FFD700';
        ctx.shadowBlur  = 30; ctx.shadowColor = '#FFD700';
        ctx.beginPath(); ctx.arc(mirX, mirY, cr * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // ── Textos flotantes ──
    s.textos.forEach(t => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, t.vida / 20);
      ctx.textAlign   = 'center';
      ctx.font        = `bold ${t.tamaño}px Orbitron, sans-serif`;
      ctx.fillStyle   = t.color;
      ctx.shadowBlur  = 16; ctx.shadowColor = t.color;
      ctx.fillText(t.texto, t.x, t.y);
      ctx.restore();
    });
  },

  // ── Render brazos (crosshair en mano + indicadores) ──
  renderBrazos(ctx, landmarks, canvasW, canvasH) {
    const s = this._state;
    if (!s || !landmarks) return;

    const getRX = n => (1 - n.x) * canvasW;
    const getRY = n =>  n.y      * canvasH;

    const brazos = [
      { hombro: landmarks[11], codo: landmarks[13], muneca: landmarks[15] },
      { hombro: landmarks[12], codo: landmarks[14], muneca: landmarks[16] },
    ];

    brazos.forEach(({ hombro, codo, muneca }) => {
      if (!muneca || !hombro || !codo) return;
      const ang       = _anguloExtension(hombro, codo, muneca);
      const extension = Math.max(0, (ang - 90) / 80);
      const mx        = getRX(muneca);
      const my        = getRY(muneca);
      const listo     = ang > ANGULO_MIN_DISPARO;

      // Línea de punto de mira (hombro → muñeca extendida)
      if (extension > 0.5) {
        const hx = getRX(hombro), hy = getRY(hombro);
        const dX = mx - hx, dY = my - hy;
        const mag = Math.hypot(dX, dY) || 1;
        ctx.save();
        ctx.globalAlpha = extension * 0.4;
        ctx.strokeStyle = listo ? '#FFD700' : s.colorTema;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.shadowBlur  = 8; ctx.shadowColor = listo ? '#FFD700' : s.colorTema;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + dX / mag * 300, my + dY / mag * 300);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Mira en la mano
      const r = 24 + extension * 10;
      ctx.save();
      ctx.strokeStyle = listo ? '#FFD700' : s.colorTema;
      ctx.lineWidth   = listo ? 3.5 : 2;
      ctx.shadowBlur  = listo ? 22 : 8;
      ctx.shadowColor = listo ? '#FFD700' : s.colorTema;
      ctx.globalAlpha = 0.5 + extension * 0.45;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.stroke();
      // Punto central
      ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.stroke();
      // Cruces mini
      ctx.lineWidth = 2;
      [[-r * 0.5, 0], [r * 0.5, 0], [0, -r * 0.5], [0, r * 0.5]].forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(mx + dx, my + dy);
        ctx.lineTo(mx + dx * 0.4, my + dy * 0.4);
        ctx.stroke();
      });
      if (listo) {
        ctx.font      = 'bold 13px Orbitron';
        ctx.fillStyle = '#FFD700'; ctx.shadowBlur = 10; ctx.shadowColor = '#FFD700';
        ctx.textAlign = 'center'; ctx.globalAlpha = 1;
        ctx.fillText('🔫 LISTO', mx, my - r - 8);
      }
      ctx.restore();
    });

    // Indicador de zona de recarga
    if (s.municion < MUNICION_MAX) {
      const caderaY = RECARGA_Y_NORM * canvasH;
      ctx.save();
      const pulso   = 0.5 + Math.sin(s.tick * 0.2) * 0.4;
      ctx.globalAlpha = pulso * 0.6;
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth   = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(canvasW * 0.05, caderaY);
      ctx.lineTo(canvasW * 0.95, caderaY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = pulso;
      ctx.fillStyle   = '#00FFFF';
      ctx.font        = 'bold 13px Orbitron';
      ctx.textAlign   = 'center';
      ctx.shadowBlur  = 8; ctx.shadowColor = '#00FFFF';
      ctx.fillText('↺ BAJA LA MANO PARA RECARGAR', canvasW / 2, caderaY - 10);
      ctx.restore();
    }
  },

  getState() { return this._state; },
};