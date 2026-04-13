import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

// ============================================================
//  CONDUCTOR GAME - Guía el orbe por el canal eléctrico
//  ✅ v2: Acepta config { dificultad, velocidad }
//  (tamanoObjetivos no aplica — el canal es fijo por diseño)
// ============================================================

const DIF_MAP = {
  facil:   { grosor: 0.075, puntosCorrecto: 15, puntosError: -3  },
  medio:   { grosor: 0.055, puntosCorrecto: 20, puntosError: -5  },
  dificil: { grosor: 0.038, puntosCorrecto: 30, puntosError: -10 },
};

export const ConductorGame = {
  _state: null,

  init(materia, colorTema, config = {}) {
    const dif     = config.dificultad ?? 'medio';
    const velMult = config.velocidad  ?? 1.0;
    const d       = DIF_MAP[dif] || DIF_MAP.medio;

    this._state = {
      materia,
      colorTema,
      orbeX: 0.5,
      orbeY: 0.5,
      canal: null,
      tick: 0,
      preguntaActiva: null,
      opciones: [],
      enCooldown: false,
      chispas: [],
      checkpointActual: 0,
      modoRespuesta: false,
      grosor:         d.grosor,
      lerpVel:        0.25 * velMult,
      puntosCorrecto: d.puntosCorrecto,
      puntosError:    d.puntosError,
    };
    this._generarCanal();
    return this._state;
  },

  _generarCanal() {
    const s = this._state;
    const grosor = s.grosor;
    s.canal = {
      segmentos: [
        { x1: 0.05, y1: 0.5,  x2: 0.35, y2: 0.5,  grosor },
        { x1: 0.35, y1: 0.5,  x2: 0.35, y2: 0.25, grosor },
        { x1: 0.35, y1: 0.25, x2: 0.65, y2: 0.25, grosor },
        { x1: 0.65, y1: 0.25, x2: 0.65, y2: 0.6,  grosor },
        { x1: 0.65, y1: 0.6,  x2: 0.95, y2: 0.6,  grosor },
      ],
      checkpoints: [0.35, 0.65],
      meta: { x: 0.92, y: 0.6 },
    };
    s.orbeX = 0.08;
    s.orbeY = 0.5;
  },

  _activarPregunta() {
    const s = this._state;
    const reto = generarReto(s.materia);
    s.preguntaActiva = reto.pregunta;
    s.opciones = reto.opciones.map((opc, i) => ({
      ...opc,
      x: 0.2 + i * 0.3,
      y: 0.78,
      radio: 50,
    }));
    s.modoRespuesta = true;
  },

  _cerrarPregunta() {
    const s = this._state;
    s.preguntaActiva = null;
    s.opciones = [];
    s.modoRespuesta = false;
    s.enCooldown = false;
    s.checkpointActual++;
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;
    s.tick += delta;

    s.chispas = s.chispas
      .map(c => ({ ...c, x: c.x + c.vx, y: c.y + c.vy, vida: c.vida - 1 }))
      .filter(c => c.vida > 0);

    if (!landmarks) return null;

    const getRX = (n) => (1 - n.x);
    const getRY = (n) => n.y;

    const m1 = landmarks[15];
    const m2 = landmarks[16];
    if (m1 && m2) {
      const targetX = (getRX(m1) + getRX(m2)) / 2;
      const targetY = (getRY(m1) + getRY(m2)) / 2;
      s.orbeX += (targetX - s.orbeX) * s.lerpVel;
      s.orbeY += (targetY - s.orbeY) * s.lerpVel;
    }

    if (s.modoRespuesta && !s.enCooldown) {
      const ox = s.orbeX * canvasW;
      const oy = s.orbeY * canvasH;
      for (const opc of s.opciones) {
        const opx = opc.x * canvasW;
        const opy = opc.y * canvasH;
        if (Math.hypot(ox - opx, oy - opy) < opc.radio + 15) {
          s.enCooldown = true;
          if (opc.esCorrecto) {
            SFX.acierto();
            setTimeout(() => this._cerrarPregunta(), 1000);
            return { acierto: true, fallo: false, puntos: s.puntosCorrecto };
          } else {
            SFX.error();
            setTimeout(() => this._cerrarPregunta(), 1000);
            return { acierto: false, fallo: true, puntos: s.puntosError };
          }
        }
      }
      return null;
    }

    const ox = s.orbeX, oy = s.orbeY;
    let enCanal = false;

    for (const seg of s.canal.segmentos) {
      const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
      const len2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((ox - seg.x1) * dx + (oy - seg.y1) * dy) / len2));
      const px = seg.x1 + t * dx, py = seg.y1 + t * dy;
      if (Math.hypot(ox - px, oy - py) < seg.grosor + 0.01) { enCanal = true; break; }
    }

    if (!enCanal) {
      if (s.chispas.length < 20) {
        for (let i = 0; i < 5; i++) {
          s.chispas.push({
            x: s.orbeX * canvasW, y: s.orbeY * canvasH,
            vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
            vida: 15,
          });
        }
        SFX.electrico();
      }
      return { acierto: false, fallo: true, puntos: 0, esChoque: true };
    }

    const cp = s.canal.checkpoints[s.checkpointActual];
    if (cp !== undefined && !s.modoRespuesta) {
      const distCp = Math.abs(s.orbeX - cp) + Math.abs(s.orbeY - (s.checkpointActual === 0 ? 0.37 : 0.43));
      if (distCp < 0.06) this._activarPregunta();
    }

    const meta = s.canal.meta;
    if (Math.hypot(s.orbeX - meta.x, s.orbeY - meta.y) < 0.05 && !s.modoRespuesta) {
      SFX.meta();
      this._generarCanal();
      s.checkpointActual = 0;
      return { acierto: true, fallo: false, puntos: 40, mensaje: '🏁 ¡META! +40 XP' };
    }

    return null;
  },

  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    // Canal
    s.canal.segmentos.forEach(seg => {
      const x1 = seg.x1 * canvasW, y1 = seg.y1 * canvasH;
      const x2 = seg.x2 * canvasW, y2 = seg.y2 * canvasH;
      const grosor = seg.grosor * canvasH;

      // Fondo oscuro detrás de la pregunta para legibilidad desde lejos
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect?.(canvasW * 0.05, 18, canvasW * 0.90, 110, 12) 
      ?? ctx.rect(canvasW * 0.05, 18, canvasW * 0.90, 110);
    ctx.fill();
    ctx.restore();
    ctx.save();
      ctx.strokeStyle = s.colorTema + '55';
      ctx.lineWidth = grosor * 2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

      ctx.strokeStyle = '#001020';
      ctx.lineWidth = grosor * 1.6;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

      ctx.strokeStyle = s.colorTema;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8; ctx.shadowColor = s.colorTema;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
    });

    // Checkpoints y meta
    s.canal.checkpoints.forEach((cpX, i) => {
      if (i < s.checkpointActual) return;
      const x = cpX * canvasW;
      const y = (i === 0 ? 0.37 : 0.43) * canvasH;
      ctx.save();
      ctx.strokeStyle = i === s.checkpointActual ? '#FFD700' : '#444';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = i === s.checkpointActual ? '#FFD70055' : '#44444433';
      ctx.fill();
      ctx.font = `bold 14px Orbitron`;
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('❓', x, y);
      ctx.restore();
    });

    const meta = s.canal.meta;
    ctx.save();
    ctx.fillStyle = '#00FF41'; ctx.shadowBlur = 20; ctx.shadowColor = '#00FF41';
    ctx.font = `bold 22px Orbitron`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🏁', meta.x * canvasW, meta.y * canvasH);
    ctx.restore();

    // Chispas
    s.chispas.forEach(c => {
      ctx.save();
      ctx.globalAlpha = c.vida / 15;
      ctx.fillStyle = '#FFD700'; ctx.shadowBlur = 10; ctx.shadowColor = '#FFD700';
      ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // Orbe
    const ox = s.orbeX * canvasW, oy = s.orbeY * canvasH;
    const pulso = 1 + Math.sin(s.tick * 0.15) * 0.12;
    ctx.save();
    const grad = ctx.createRadialGradient(ox, oy, 2, ox, oy, 22 * pulso);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.4, s.colorTema);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.shadowBlur = 25; ctx.shadowColor = s.colorTema;
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(ox, oy, 22 * pulso, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Panel de pregunta
    if (s.modoRespuesta && s.preguntaActiva) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,10,0.75)';
      ctx.fillRect(0, canvasH * 0.62, canvasW, canvasH * 0.38);
      ctx.textAlign = 'center';
      ctx.font = `bold 28px Orbitron, sans-serif`;
      ctx.fillStyle = '#FFFFFF'; ctx.shadowBlur = 10; ctx.shadowColor = s.colorTema;
      ctx.fillText('⚡ ' + s.preguntaActiva, canvasW / 2, canvasH * 0.68);

      s.opciones.forEach(opc => {
        const opx = opc.x * canvasW, opy = opc.y * canvasH;
        ctx.beginPath(); ctx.arc(opx, opy, opc.radio, 0, Math.PI * 2);
        ctx.fillStyle = s.colorTema + '33'; ctx.fill();
        ctx.strokeStyle = s.colorTema; ctx.lineWidth = 3;
        ctx.shadowBlur = 12; ctx.shadowColor = s.colorTema; ctx.stroke();
        ctx.fillStyle = '#FFF'; ctx.font = `bold 20px Orbitron`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 0;
        ctx.fillText(opc.texto, opx, opy);
      });
      ctx.restore();
    }

    // Instrucción
    if (!s.modoRespuesta) {
      ctx.save();
      ctx.font = `bold 30px Orbitron, sans-serif`;
      ctx.fillStyle = '#FFFFFF'; ctx.shadowBlur = 12; ctx.shadowColor = s.colorTema;
      ctx.textAlign = 'center';
      ctx.fillText('⚡ Guía el orbe por el canal eléctrico', canvasW / 2, 70);
      ctx.font = `20px Rajdhani`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Mueve ambas manos · Para en ❓ para responder · Llega a 🏁', canvasW / 2, 105);
      ctx.restore();
    }
  },

  getState() { return this._state; },
};