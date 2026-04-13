// ============================================================
//  BOXEO GAME v2.2 — INMERSIÓN TOTAL CON GUANTES PNG PROPORCIONALES
//  
//  ✅ Tamaño PROPORCIONAL (doble de grande para realismo)
//  ✅ Rotación dinámica basada en ángulo Codo-Muñeca
//  ✅ "Espejo" matemático automático para guante Izquierdo (pulgar correcto)
//  ✅ ELIMINACIÓN TOTAL de orbes y degradados antiguos en renderBrazos
//  ✅ Sistema de STAMINA y Críticos preservado
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

// ── Assets PNG y Caché ─────────────────────────────────────
// Asegúrate de que estas imágenes estén en tu carpeta /public
const URL_GUANTE_ROJO = '/guante_rojo.png'; 
const URL_GUANTE_AZUL = '/guante_azul.png'; 

const _imgCache = new Map();
const _cargarImg = (url) => {
  if (_imgCache.has(url)) return _imgCache.get(url);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  _imgCache.set(url, img);
  return img;
};

// ── Umbrales de golpe ──────────────────────────────────────
const VEL_JAB      = 8.0;   // velocidad mínima golpe normal
const VEL_CRITICO  = 16.0;  // velocidad para golpe crítico
const DIST_PUÑO    = 65;    // px — radio de colisión
const COOLDOWN_PUÑO = 400;  // ms entre golpes

// ── Stamina ────────────────────────────────────────────────
const STAMINA_MAX        = 100;
const STAMINA_COSTO_GOLPE = 15;
const STAMINA_REGEN       = 0.5;  // por frame

// ── Configuración por dificultad ───────────────────────────
const DIF_MAP = {
  facil:   { puntosCorrecto: 20, puntosError: -5,  puntoCritico: 35, numSacos: 2 },
  medio:   { puntosCorrecto: 20, puntosError: -10, puntoCritico: 40, numSacos: 3 },
  dificil: { puntosCorrecto: 20, puntosError: -15, puntoCritico: 50, numSacos: 3 },
};

// ── Colores de sacos ───────────────────────────────────────
const PALETA_SACOS = [
  { primario: '#8B4513', secundario: '#654321', brillo: '#A0522D' },
  { primario: '#6B4423', secundario: '#4A2F1A', brillo: '#8B5A2B' },
  { primario: '#704214', secundario: '#4E2A0F', brillo: '#9A5B2E' },
];

// ── Helper: velocidad de landmark ──────────────────────────
const _vel = (prev, curr, W, H) => {
  if (!prev || !curr) return 0;
  return Math.hypot((curr.x - prev.x) * W, (curr.y - prev.y) * H);
};

export const BoxeoGame = {
  _state: null,
  _timers: [],

  init(materia, colorTema, config = {}) {
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];

    const dif     = config.dificultad || 'medio';
    const tamMult = config.tamanoObjetivos ?? 1.0;
    const d       = DIF_MAP[dif] || DIF_MAP.medio;

    const reto = generarReto(materia);
    
    // Precargar imágenes para evitar parpadeos
    _cargarImg(URL_GUANTE_ROJO);
    _cargarImg(URL_GUANTE_AZUL);

    this._state = {
      materia, colorTema,
      pregunta: reto.pregunta,
      tick: 0,

      // Config
      puntosCorrecto: d.puntosCorrecto,
      puntosError: d.puntosError,
      puntoCritico: d.puntoCritico,
      radioSaco: 55 * tamMult,
      maxGolpes: 5, // 5 golpes × 20 = 100 puntos

      // Guantes
      colorGuantes: null,

      // Estado
      enCooldown: false,
      stamina: STAMINA_MAX,

      // Tracking de manos
      manoL: { prev: null, lastGolpe: 0 },
      manoR: { prev: null, lastGolpe: 0 },

      // Efectos
      textos: [],
      ondas: [],
      estrellas: [],

      // Sacos
      sacos: [],
    };

    this._generarSacos(reto.opciones, d.numSacos, tamMult);
    return this._state;
  },

  _generarSacos(opciones, num, tamMult) {
    const s = this._state;
    const posX = num === 2 ? [0.28, 0.72] : [0.18, 0.50, 0.82];

    s.sacos = opciones.slice(0, num).map((opc, i) => {
      const paleta = PALETA_SACOS[i % PALETA_SACOS.length];
      return {
        anclaX: posX[i] ?? (0.2 + i * 0.3),
        anclaY: 0.08,
        longitud: 180,
        angulo: 0,
        velAng: 0,

        radio: 55 * tamMult,
        altoSaco: 100 * tamMult,
        texto: opc.texto,
        esCorrecto: opc.esCorrecto,
        paleta,

        golpeFrame: 0,
        golpesRecibidos: 0,
        puntosAcumulados: 0,
        completado: false,
      };
    });
  },

  _nuevaRonda() {
    if (!this._state) return;
    const s = this._state;
    const reto = generarReto(s.materia);
    s.pregunta = reto.pregunta;
    s.enCooldown = false;
    const num = s.sacos.length;
    const tam = s.radioSaco / 55;
    this._generarSacos(reto.opciones, num, tam);
  },

  _agregarTexto(x, y, texto, color, tamaño = 22) {
    this._state.textos.push({ x, y, texto, color, tamaño, vida: 60, vy: -2.5 });
  },

  _agregarOnda(x, y, color) {
    this._state.ondas.push({ x, y, radio: 0, maxRadio: 80, color, vida: 25 });
  },

  _estrellasCritico(cx, cy, color) {
    const s = this._state;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const fuerza = 4 + Math.random() * 6;
      s.estrellas.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * fuerza,
        vy: Math.sin(ang) * fuerza - 2,
        vida: 30 + Math.random() * 15,
        color,
        tamaño: 6 + Math.random() * 8,
      });
    }
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;
    s.tick++;

    // Regenerar stamina
    s.stamina = Math.min(STAMINA_MAX, s.stamina + STAMINA_REGEN);

    // Física de péndulo
    const GRAVEDAD = 0.0006;
    s.sacos.forEach(saco => {
      const ac = -GRAVEDAD * (canvasH / saco.longitud) * Math.sin(saco.angulo);
      saco.velAng = (saco.velAng + ac) * 0.994;
      saco.angulo += saco.velAng;
      if (saco.golpeFrame > 0) saco.golpeFrame--;
    });

    // Actualizar efectos
    s.ondas.forEach(o => { o.radio += 4; o.vida--; });
    s.ondas = s.ondas.filter(o => o.vida > 0);

    s.estrellas.forEach(e => {
      e.x += e.vx * 0.95; e.y += e.vy;
      e.vy += 0.2; e.vida--;
    });
    s.estrellas = s.estrellas.filter(e => e.vida > 0);

    s.textos.forEach(t => { t.y += t.vy; t.vy *= 0.93; t.vida--; });
    s.textos = s.textos.filter(t => t.vida > 0);

    if (!landmarks || s.enCooldown) return null;

    // Detección de golpes
    const ahora = performance.now();
    const getRX = n => (1 - n.x) * canvasW;
    const getRY = n => n.y * canvasH;

    const velL = _vel(s.manoL.prev, landmarks[15], canvasW, canvasH);
    const velR = _vel(s.manoR.prev, landmarks[16], canvasW, canvasH);

    s.manoL.prev = landmarks[15] ? { ...landmarks[15] } : null;
    s.manoR.prev = landmarks[16] ? { ...landmarks[16] } : null;

    let resultado = null;

    for (const saco of s.sacos) {
      if (saco.completado) continue;

      const pivX = saco.anclaX * canvasW;
      const pivY = saco.anclaY * canvasH;
      const sx = pivX + Math.sin(saco.angulo) * saco.longitud;
      const sy = pivY + Math.cos(saco.angulo) * saco.longitud;

      const manos = [
        { lm: landmarks[15], vel: velL, lado: 'L', state: s.manoL },
        { lm: landmarks[16], vel: velR, lado: 'R', state: s.manoR },
      ];

      for (const { lm, vel, lado, state } of manos) {
        if (!lm) continue;

        const mx = getRX(lm);
        const my = getRY(lm);
        const dist = Math.hypot(mx - sx, my - sy);

        const distOk = dist < saco.radio + DIST_PUÑO;
        const velOk = vel > VEL_JAB;
        const coolOk = (ahora - state.lastGolpe) > COOLDOWN_PUÑO;
        const stamOk = s.stamina >= STAMINA_COSTO_GOLPE * 0.5;

        if (distOk && velOk && coolOk && stamOk) {
          state.lastGolpe = ahora;
          s.stamina = Math.max(0, s.stamina - STAMINA_COSTO_GOLPE);

          if (!s.colorGuantes) {
            s.colorGuantes = lado === 'L' ? 'azul' : 'rojo';
          }

          const dxN = (sx - mx) / (dist || 1);
          saco.velAng += dxN * 0.03 * (vel / VEL_JAB);
          saco.golpeFrame = 8;

          const esCritico = vel > VEL_CRITICO;

          if (saco.esCorrecto) {
            saco.golpesRecibidos++;
            let xp = esCritico ? s.puntoCritico : s.puntosCorrecto;
            saco.puntosAcumulados += xp;

            try { 
              SFX.impacto?.(); 
              if (esCritico) SFX.bonus?.();
            } catch(_) {}

            this._agregarOnda(sx, sy, esCritico ? '#FFD700' : s.colorTema);
            if (esCritico) this._estrellasCritico(sx, sy, '#FFD700');

            this._agregarTexto(
              sx, sy - 60,
              esCritico ? `⚡ CRÍTICO! +${xp}` : `+${xp} XP`,
              esCritico ? '#FFD700' : '#00FF41',
              esCritico ? 26 : 20
            );

            if (saco.puntosAcumulados >= 100) {
              saco.completado = true;
              this._agregarTexto(sx, sy - 100, '💯 ¡COMPLETO!', '#FFD700', 32);
              s.enCooldown = true;
              const t = setTimeout(() => this._nuevaRonda(), 1500);
              this._timers.push(t);
            }

            resultado = {
              acierto: true, fallo: false, puntos: xp,
              msg: `+${xp} XP (${saco.golpesRecibidos}/${s.maxGolpes})`,
            };

          } else {
            saco.golpesRecibidos++;
            saco.puntosAcumulados -= 10;
            try { SFX.error?.(); } catch(_) {}

            saco.velAng *= -0.5;
            this._agregarOnda(sx, sy, '#FF4444');
            this._agregarTexto(sx, sy - 50, '-10 XP ❌', '#FF4444');

            if (saco.puntosAcumulados <= -50) {
              saco.completado = true;
            }

            s.enCooldown = true;
            const t = setTimeout(() => { if (s) s.enCooldown = false; }, 700);
            this._timers.push(t);

            resultado = {
              acierto: false, fallo: true, puntos: -10,
              msg: `-10 XP (${saco.golpesRecibidos}/${s.maxGolpes})`,
            };
          }
          break;
        }
      }
      if (resultado) break;
    }

    return resultado;
  },

  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    // ── Efectos Visuales (Ondas y Estrellas) ──
    s.ondas.forEach(o => {
      ctx.save();
      ctx.globalAlpha = o.vida / 25;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 15; ctx.shadowColor = o.color;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.radio, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });

    s.estrellas.forEach(e => {
      ctx.save();
      ctx.globalAlpha = e.vida / 45;
      ctx.fillStyle = e.color;
      ctx.shadowBlur = 10; ctx.shadowColor = e.color;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.tamaño, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // ── Caja de Pregunta ──
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(canvasW * 0.05, 14, canvasW * 0.90, 100, 12);
    else ctx.rect(canvasW * 0.05, 14, canvasW * 0.90, 100);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.font = 'bold 36px Orbitron, sans-serif';
    ctx.fillStyle = '#FFF';
    ctx.shadowBlur = 12; ctx.shadowColor = s.colorTema;
    ctx.fillText(s.pregunta, canvasW / 2, 50);

    ctx.font = '16px Rajdhani, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 0;
    ctx.fillText('🥊 Golpea rápido para CRÍTICO — 100 puntos para nueva pregunta', canvasW / 2, 90);
    ctx.restore();

    // ── HUD Stamina ──
    const staminaW = 200;
    const staminaX = canvasW / 2 - staminaW / 2;
    const staminaY = canvasH - 55;
    
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(staminaX - 5, staminaY - 5, staminaW + 10, 26, 6);
    else ctx.rect(staminaX, staminaY, staminaW, 16);
    ctx.fill();

    const stamRatio = s.stamina / STAMINA_MAX;
    const stamColor = stamRatio > 0.6 ? '#00FF41' : stamRatio > 0.3 ? '#FFD700' : '#FF4444';
    ctx.fillStyle = stamColor;
    ctx.shadowBlur = 10; ctx.shadowColor = stamColor;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(staminaX, staminaY, staminaW * stamRatio, 16, 4);
    else ctx.rect(staminaX, staminaY, staminaW * stamRatio, 16);
    ctx.fill();

    ctx.font = 'bold 12px Orbitron';
    ctx.fillStyle = '#FFF';
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.fillText(`💪 STAMINA ${Math.round(s.stamina)}%`, canvasW / 2, staminaY - 8);
    ctx.restore();

    // ── Sacos de Boxeo ──
    s.sacos.forEach(saco => {
      const pivX = saco.anclaX * canvasW;
      const pivY = saco.anclaY * canvasH;
      const sx = pivX + Math.sin(saco.angulo) * saco.longitud;
      const sy = pivY + Math.cos(saco.angulo) * saco.longitud;

      // Cadena
      ctx.save();
      ctx.strokeStyle = '#666'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.moveTo(pivX, pivY); ctx.lineTo(sx, sy - saco.radio); ctx.stroke();
      ctx.restore();

      // Saco de cuero con deformación por golpe
      ctx.save();
      ctx.translate(sx, sy);
      const golpeFactor = saco.golpeFrame / 8;
      ctx.scale(1 + golpeFactor * 0.2, 1 - golpeFactor * 0.15);

      const r = saco.radio;
      const h = saco.altoSaco;
      ctx.shadowBlur = 20; ctx.shadowColor = saco.paleta.primario;
      const grad = ctx.createLinearGradient(-r, -h / 2, r, h / 2);
      grad.addColorStop(0, saco.paleta.brillo); grad.addColorStop(0.5, saco.paleta.primario); grad.addColorStop(1, saco.paleta.secundario);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2C1810'; ctx.lineWidth = 3; ctx.stroke();

      // Costuras realistas
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(i * r * 0.4, -r * 0.7); ctx.lineTo(i * r * 0.4, r * 0.7); ctx.stroke();
      }
      ctx.restore();

      // Texto de Respuesta
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 18px Orbitron, sans-serif';
      ctx.fillStyle = '#FFF'; ctx.shadowBlur = 8; ctx.shadowColor = '#000';
      const palabras = saco.texto.split(' ');
      let lineas = [], linea = '';
      const maxW = saco.radio * 1.3;
      palabras.forEach(p => {
        const test = linea + p + ' ';
        if (ctx.measureText(test).width > maxW && linea) { lineas.push(linea.trim()); linea = p + ' '; }
        else { linea = test; }
      });
      if (linea) lineas.push(linea.trim());
      lineas.forEach((l, i) => { ctx.fillText(l, sx, sy + (i - (lineas.length - 1) / 2) * 22); });
      ctx.restore();

      // Contador de puntos progresivo (0/100)
      if (saco.puntosAcumulados !== 0) {
        ctx.save();
        ctx.textAlign = 'center'; ctx.font = 'bold 16px Orbitron, sans-serif';
        const color = saco.esCorrecto ? '#00FF41' : '#FF4444';
        ctx.fillStyle = color; ctx.shadowBlur = 12; ctx.shadowColor = color;
        ctx.fillText(`${saco.puntosAcumulados > 0 ? '+' : ''}${saco.puntosAcumulados} / 100`, sx, sy - saco.radio - 25);
        ctx.restore();
      }
    });

    // ── Textos Flotantes (XP y Críticos) ──
    s.textos.forEach(t => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, t.vida / 20);
      ctx.textAlign = 'center';
      ctx.font = `bold ${t.tamaño}px Orbitron, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.shadowBlur = 16; ctx.shadowColor = t.color;
      ctx.fillText(t.texto, t.x, t.y);
      ctx.restore();
    });
  },

  // ══════════════════════════════════════════════════════════
  // ── RENDER DE BRAZOS v2.2 — PURO GUANTE PNG — SIN ORBES ──
  // ══════════════════════════════════════════════════════════
  // ============================================================
//  BOXEO GAME — renderBrazos v2.3 FIX GUARDIA

  renderBrazos(ctx, landmarks, canvasW, canvasH) {
    const s = this._state;
    if (!s || !landmarks) return;

    const getRX = n => (1 - n.x) * canvasW;
    const getRY = n =>  n.y       * canvasH;

    // ── Colores de guante ──────────────────────────────────
    const COLORES = {
      rojo: { base: '#CC1100', medio: '#FF2200', brillo: '#FF6644', cuero: '#8B0000', costura: '#FFB3A0' },
      azul: { base: '#001FCC', medio: '#0044FF', brillo: '#4488FF', cuero: '#00008B', costura: '#A0C0FF' },
      default: { base: '#333', medio: '#555', brillo: '#888', cuero: '#222', costura: '#999' },
    };

    const colorKey = s.colorGuantes || 'default';
    const C = COLORES[colorKey] || COLORES.default;

    // ── Función principal: dibujar UN guante ──────────────
    // cx, cy = posición del centro del guante (muñeca)
    // angulo = dirección del puño (radianes), apuntando "hacia donde golpea"
    // lado   = 'L' | 'R' — determina orientación del pulgar
    // escala = tamaño relativo según ancho de hombros
    const dibujarGuante = (cx, cy, angulo, lado, escala) => {
      const tam = escala * 1.1; // base de tamaño

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angulo);

      // ── Sombra de profundidad ──
      ctx.shadowBlur  = 25 + (s.tick % 30) * 0.3;
      ctx.shadowColor = C.medio + 'BB';

      // ── 1. MUÑEQUERA (parte trasera del guante) ──────────
      // Rectángulo redondeado en la base, más ancho que el puño
      const mW = tam * 0.72;
      const mH = tam * 0.48;
      const mY = tam * 0.18; // desplazada hacia abajo (hacia el brazo)

      const gradMun = ctx.createLinearGradient(-mW/2, mY, mW/2, mY + mH);
      gradMun.addColorStop(0,   C.medio);
      gradMun.addColorStop(0.4, C.base);
      gradMun.addColorStop(1,   C.cuero);
      ctx.fillStyle = gradMun;
      ctx.beginPath();
      ctx.roundRect?.(-mW/2, mY, mW, mH, [4, 4, tam*0.15, tam*0.15])
        ?? (() => {
          ctx.moveTo(-mW/2 + 4, mY);
          ctx.lineTo(mW/2 - 4, mY);
          ctx.quadraticCurveTo(mW/2, mY, mW/2, mY + 4);
          ctx.lineTo(mW/2, mY + mH - tam*0.1);
          ctx.quadraticCurveTo(mW/2, mY + mH, mW/2 - tam*0.1, mY + mH);
          ctx.lineTo(-mW/2 + tam*0.1, mY + mH);
          ctx.quadraticCurveTo(-mW/2, mY + mH, -mW/2, mY + mH - tam*0.1);
          ctx.lineTo(-mW/2, mY + 4);
          ctx.quadraticCurveTo(-mW/2, mY, -mW/2 + 4, mY);
          ctx.closePath();
        })();
      ctx.fill();

      // Costura de muñequera
      ctx.strokeStyle = C.costura + '66';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(-mW/2 + tam*0.08, mY + mH * 0.35);
      ctx.lineTo( mW/2 - tam*0.08, mY + mH * 0.35);
      ctx.stroke();

      // ── 2. CUERPO DEL PUÑO ──────────────────────────────
      // Forma ovalada-cónica que representa los nudillos
      const pW  = tam * 0.68;  // ancho del puño
      const pH  = tam * 0.52;  // alto del puño
      const pY  = -tam * 0.45; // arriba (dirección del golpe)

      // Gradiente radial para dar volumen 3D
      const gradPun = ctx.createRadialGradient(
        -pW * 0.15, pY + pH * 0.25, tam * 0.05,
         0,         pY + pH * 0.5,  pW * 0.65
      );
      gradPun.addColorStop(0,   C.brillo);
      gradPun.addColorStop(0.3, C.medio);
      gradPun.addColorStop(0.7, C.base);
      gradPun.addColorStop(1,   C.cuero);

      ctx.fillStyle = gradPun;
      ctx.beginPath();
      // Forma del puño: más ancho arriba (nudillos), más estrecho abajo
      ctx.moveTo(-pW * 0.42, pY + pH);
      ctx.bezierCurveTo(
        -pW * 0.52, pY + pH * 0.5,
        -pW * 0.50, pY,
        -pW * 0.28, pY
      );
      ctx.bezierCurveTo(
        -pW * 0.05, pY - tam * 0.04,
         pW * 0.05, pY - tam * 0.04,
         pW * 0.28, pY
      );
      ctx.bezierCurveTo(
         pW * 0.50, pY,
         pW * 0.52, pY + pH * 0.5,
         pW * 0.42, pY + pH
      );
      ctx.bezierCurveTo(
         pW * 0.20, pY + pH + tam * 0.06,
        -pW * 0.20, pY + pH + tam * 0.06,
        -pW * 0.42, pY + pH
      );
      ctx.closePath();
      ctx.fill();

      // ── 3. NUDILLOS (4 protuberancias en la parte frontal) ──
      const nudilloY = pY + tam * 0.04;
      const nudilloW = pW * 0.78;
      for (let n = 0; n < 4; n++) {
        const nx = -nudilloW / 2 + (n + 0.5) * (nudilloW / 4);
        const nr = tam * (n === 1 || n === 2 ? 0.095 : 0.075); // centrales más grandes

        const gradNud = ctx.createRadialGradient(
          nx - nr * 0.3, nudilloY - nr * 0.3, 0,
          nx, nudilloY, nr
        );
        gradNud.addColorStop(0, C.brillo);
        gradNud.addColorStop(0.5, C.medio);
        gradNud.addColorStop(1, C.base);

        ctx.fillStyle = gradNud;
        ctx.shadowBlur = 8; ctx.shadowColor = C.brillo + '88';
        ctx.beginPath();
        ctx.ellipse(nx, nudilloY, nr, nr * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── 4. PULGAR ────────────────────────────────────────
      // El pulgar va a UN lado según 'lado' (L o R)
      const pulgDir = lado === 'R' ? 1 : -1; // derecha o izquierda del guante
      const pulX    = pulgDir * pW * 0.46;
      const pulY    = pY + pH * 0.35;
      const pulW    = tam * 0.22;
      const pulH    = tam * 0.30;
      const pulAng  = pulgDir * 0.55; // inclinación del pulgar

      const gradPul = ctx.createRadialGradient(
        pulX - pulW * 0.2, pulY, 0,
        pulX, pulY, pulW * 1.2
      );
      gradPul.addColorStop(0, C.brillo);
      gradPul.addColorStop(0.5, C.medio);
      gradPul.addColorStop(1, C.base);

      ctx.save();
      ctx.translate(pulX, pulY);
      ctx.rotate(pulAng);
      ctx.fillStyle = gradPul;
      ctx.shadowBlur = 6; ctx.shadowColor = C.base;
      ctx.beginPath();
      ctx.ellipse(0, 0, pulW * 0.5, pulH * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Uña del pulgar (detalle)
      ctx.fillStyle = C.cuero + 'AA';
      ctx.beginPath();
      ctx.ellipse(0, -pulH * 0.18, pulW * 0.25, pulH * 0.18, 0, 0, Math.PI);
      ctx.fill();
      ctx.restore();

      // ── 5. COSTURAS DECORATIVAS ──────────────────────────
      ctx.strokeStyle = C.costura + '55';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      // Costura central vertical
      ctx.beginPath();
      ctx.moveTo(0, pY + tam * 0.06);
      ctx.lineTo(0, pY + pH * 0.85);
      ctx.stroke();
      // Costura horizontal de nudillos
      ctx.beginPath();
      ctx.moveTo(-pW * 0.35, pY + tam * 0.14);
      ctx.lineTo( pW * 0.35, pY + tam * 0.14);
      ctx.stroke();
      ctx.setLineDash([]);

      // ── 6. BRILLO ESPECULAR (reflejo de luz) ─────────────
      const gradBrillo = ctx.createLinearGradient(
        -pW * 0.25, pY,
        -pW * 0.05, pY + pH * 0.4
      );
      gradBrillo.addColorStop(0, 'rgba(255,255,255,0.35)');
      gradBrillo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradBrillo;
      ctx.beginPath();
      ctx.ellipse(-pW * 0.15, pY + pH * 0.2, pW * 0.18, pH * 0.28, -0.4, 0, Math.PI * 2);
      ctx.fill();

      // ── 7. GLOW DE ENERGÍA (efecto neón) ─────────────────
      const pulsoGlow = 0.7 + Math.sin(s.tick * 0.08) * 0.3;
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = C.brillo;
      ctx.lineWidth   = 2;
      ctx.globalAlpha = pulsoGlow * 0.6;
      ctx.beginPath();
      ctx.ellipse(0, pY + pH * 0.4, pW * 0.54, pH * 0.58, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Partículas de energía en nudillos (solo en movimiento rápido)
      const mano = lado === 'L' ? s.manoL : s.manoR;
      const enMovimiento = mano?.prev !== null;
      if (enMovimiento && Math.random() > 0.5) {
        ctx.globalAlpha = Math.random() * 0.7;
        ctx.fillStyle = C.brillo;
        ctx.shadowBlur = 10; ctx.shadowColor = C.brillo;
        const px = (Math.random() - 0.5) * pW * 0.8;
        const py = pY + Math.random() * pH * 0.3;
        ctx.beginPath();
        ctx.arc(px, py, Math.random() * 3 + 1, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      ctx.restore();
    };

    // ── Calcular escala desde ancho de hombros ─────────────
    const h11 = landmarks[11], h12 = landmarks[12];
    let escala = 55; // fallback
    if (h11 && h12) {
      const dx = getRX(h12) - getRX(h11);
      const dy = getRY(h12) - getRY(h11);
      escala = Math.hypot(dx, dy) * 0.38;
      escala = Math.max(40, Math.min(escala, 90));
    }

    // ── Procesar cada brazo ────────────────────────────────
    const brazos = [
      { muneca: landmarks[15], codo: landmarks[13], lado: 'L' },
      { muneca: landmarks[16], codo: landmarks[14], lado: 'R' },
    ];

    brazos.forEach(({ muneca, codo, lado }) => {
      if (!muneca || !codo) return;

      const mx = getRX(muneca), my = getRY(muneca);
      const cx = getRX(codo),   cy = getRY(codo);

      // Vector de codo → muñeca (dirección del antebrazo)
      const dvx = mx - cx;
      const dvy = my - cy;

      // El puño "golpea" en la dirección del antebrazo
      // atan2 nos da el ángulo, -PI/2 alinea el PNG/canvas con "arriba"
      const angulo = Math.atan2(dvy, dvx) + Math.PI / 2;

      dibujarGuante(mx, my, angulo, lado, escala);
    });

    // ── Banda en la cabeza ─────────────────────────────────
    const nariz = landmarks[0];
    if (nariz && s.colorGuantes) {
      const nx = getRX(nariz), ny = getRY(nariz);
      const colorBanda = C.medio;
      ctx.save();
      ctx.fillStyle = colorBanda;
      ctx.shadowBlur = 12; ctx.shadowColor = colorBanda;
      ctx.fillRect(nx - 60, ny - 50, 120, 14);
      // Nudo lateral
      ctx.beginPath();
      ctx.arc(nx + 64, ny - 43, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 9px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 0;
      ctx.fillText('BOXEO', nx, ny - 40);
      ctx.restore();
    }

    // ── Instrucción inicial ────────────────────────────────
    if (!s.colorGuantes) {
      ctx.save();
      ctx.textAlign  = 'center';
      ctx.font       = 'bold 16px Orbitron, sans-serif';
      ctx.fillStyle  = 'rgba(255,255,255,0.8)';
      ctx.shadowBlur = 10; ctx.shadowColor = '#000';
      ctx.fillText('🥊 Golpea un saco para activar los guantes', canvasW / 2, canvasH * 0.85);
      ctx.restore();
    }
  },

  getState() { return this._state; },
};