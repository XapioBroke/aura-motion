import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

// ============================================================
//  ESQUIVA GAME
//  El jugador debe esquivar proyectiles INCORRECTOS con su
//  cuerpo y dejar pasar (o tocar) los CORRECTOS.
//  Usa landmarks de torso + cabeza para detección de colisión.
// ============================================================

const VELOCIDAD_BASE = 0.004;

export const EsquivaGame = {
  _state: null,

  init(materia, colorTema, config = {}) {
    const dif = config.dificultad || 'medio';
    const velMult  = config.velocidad  ?? 1.0;
    const tamMult  = config.tamanoObjetivos ?? 1.0;

    const difMap = {
      facil:  { spawnMs: 2200, maxProy: 4,  puntosCorrecto: 15, puntosError: -5  },
      medio:  { spawnMs: 1600, maxProy: 6,  puntosCorrecto: 20, puntosError: -8  },
      dificil:{ spawnMs: 1100, maxProy: 9,  puntosCorrecto: 30, puntosError: -12 },
    };

    const d = difMap[dif] || difMap.medio;

    this._state = {
      materia,
      colorTema,
      proyectiles: [],
      tick: 0,
      ultimoSpawn: 0,
      spawnMs:  d.spawnMs,
      maxProy:  d.maxProy,
      velBase:  VELOCIDAD_BASE * velMult,
      radioBase: 38 * tamMult,
      puntosCorrecto: d.puntosCorrecto,
      puntosError:    d.puntosError,
      particulas: [],
      retoActual: null,
      enCooldown: false,
      ultimaColision: -999,
    };

    // Pre-cargar primer reto
    this._nuevoReto();
    return this._state;
  },

  _nuevoReto() {
    const s = this._state;
    s.retoActual = generarReto(s.materia);
    s.enCooldown = false;
  },

  _spawnProyectil() {
    const s = this._state;
    if (s.proyectiles.length >= s.maxProy) return;
    if (!s.retoActual) { this._nuevoReto(); return; }

    // Mezcla: 1 correcto + varios incorrectos
    const esCorrecto = s.proyectiles.filter(p => p.esCorrecto).length === 0
      ? Math.random() < 0.45
      : false;

    const opcion = esCorrecto
      ? s.retoActual.opciones.find(o => o.esCorrecto)
      : s.retoActual.opciones.filter(o => !o.esCorrecto)[
          Math.floor(Math.random() * s.retoActual.opciones.filter(o => !o.esCorrecto).length)
        ];

    if (!opcion) return;

    // Vienen siempre desde la derecha (x=1.05) a posición Y aleatoria
    const yPos = 0.15 + Math.random() * 0.65;
    const velocidad = s.velBase * (0.85 + Math.random() * 0.3);

    s.proyectiles.push({
      id: Date.now() + Math.random(),
      x: 1.05,
      y: yPos,
      vx: -velocidad,
      vy: (Math.random() - 0.5) * 0.0015,
      radio: s.radioBase,
      esCorrecto: opcion.esCorrecto,
      texto: opcion.texto,
      pregunta: s.retoActual.pregunta,
      golpeado: false,
      esquivado: false,
      alpha: 1,
      pulso: Math.random() * Math.PI * 2,
    });
  },

  _emitirParticulas(x, y, color, cantidad = 12) {
    const s = this._state;
    for (let i = 0; i < cantidad; i++) {
      const angulo = (Math.PI * 2 * i) / cantidad + Math.random() * 0.5;
      const vel = 2 + Math.random() * 4;
      s.particulas.push({
        x, y,
        vx: Math.cos(angulo) * vel,
        vy: Math.sin(angulo) * vel,
        vida: 30 + Math.random() * 20,
        vidaMax: 50,
        radio: 2 + Math.random() * 3,
        color,
      });
    }
  },

  // Devuelve hitboxes del cuerpo: segmentos [x1,y1,x2,y2] en coords normalizadas
  _getHitboxes(landmarks, canvasW, canvasH) {
    if (!landmarks) return [];
    const pts = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    const get = (i) => {
      const n = landmarks[i];
      if (!n || n.visibility < 0.25) return null;
      return { x: (1 - n.x) * canvasW, y: n.y * canvasH };
    };

    const conexiones = [
      [11,12],[11,13],[13,15],[12,14],[14,16],
      [11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],
      [0,11],[0,12],
    ];

    return conexiones.map(([a, b]) => {
      const pa = get(a), pb = get(b);
      if (!pa || !pb) return null;
      return { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y };
    }).filter(Boolean);
  },

  // Distancia punto-segmento
  _distPuntoSegmento(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;

    s.tick += delta;

    // Spawn
    if (s.tick - s.ultimoSpawn > s.spawnMs / 16) {
      s.ultimoSpawn = s.tick;
      this._spawnProyectil();
    }

    // Actualizar partículas
    s.particulas = s.particulas
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vida: p.vida - 1, vx: p.vx * 0.92, vy: p.vy * 0.92 }))
      .filter(p => p.vida > 0);

    // Hitboxes del cuerpo
    const hitboxes = this._getHitboxes(landmarks, canvasW, canvasH);

    let resultado = null;

    // Actualizar proyectiles
    s.proyectiles = s.proyectiles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.pulso += 0.08;

      // Salió por la izquierda sin ser tocado
      if (p.x < -0.1) {
        if (p.esCorrecto && !p.golpeado) {
          // Dejaste pasar el correcto → penalización
          resultado = { acierto: false, fallo: true, puntos: s.puntosError, msg: '❌ ¡Dejaste pasar la respuesta!' };
          SFX.error();
          this._nuevoReto();
        }
        return false;
      }

      // Colisión con cuerpo (cooldown 800ms)
      if (!p.golpeado && s.tick - s.ultimaColision > 50) {
        const px = p.x * canvasW;
        const py = p.y * canvasH;
        const radioColision = p.radio + 18;

        const colisiona = hitboxes.some(seg =>
          this._distPuntoSegmento(px, py, seg.x1, seg.y1, seg.x2, seg.y2) < radioColision
        );

        if (colisiona) {
          p.golpeado = true;
          s.ultimaColision = s.tick;

          if (p.esCorrecto) {
            SFX.acierto();
            this._emitirParticulas(px, py, '#00FF41', 18);
            resultado = { acierto: true, fallo: false, puntos: s.puntosCorrecto, msg: `✅ +${s.puntosCorrecto} XP` };
            this._nuevoReto();
          } else {
            SFX.perderVida();
            this._emitirParticulas(px, py, '#FF4444', 14);
            resultado = { acierto: false, fallo: true, puntos: s.puntosError, msg: `❌ ${s.puntosError} XP` };
          }

          // Desvanece el proyectil golpeado
          setTimeout(() => {}, 0);
          return false;
        }
      }

      return true;
    });

    return resultado;
  },

  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    // ── Pregunta activa en la parte superior ──
    if (s.retoActual) {
      ctx.save();
      // Fondo semitransparente para la pregunta
      const grad = ctx.createLinearGradient(0, 0, 0, 90);
      grad.addColorStop(0, 'rgba(0,0,20,0.85)');
      grad.addColorStop(1, 'rgba(0,0,20,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasW, 90);

      ctx.textAlign = 'center';
      ctx.font = `bold 26px Orbitron, sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowBlur = 10;
      ctx.shadowColor = s.colorTema;
      ctx.fillText(`🎯 ${s.retoActual.pregunta}`, canvasW / 2, 38);

      ctx.font = `20px Rajdhani, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.shadowBlur = 0;
      ctx.fillText('TOCA ✅ la respuesta correcta · ESQUIVA ❌ las incorrectas', canvasW / 2, 68);
      ctx.restore();
    }

    // ── Proyectiles ──
    s.proyectiles.forEach(p => {
      const px = p.x * canvasW;
      const py = p.y * canvasH;
      const r = p.radio;
      const pulsoR = r + Math.sin(p.pulso) * 4;

      ctx.save();
      ctx.globalAlpha = p.alpha;

      // Aura exterior
      const aura = ctx.createRadialGradient(px, py, pulsoR * 0.3, px, py, pulsoR * 1.8);
      if (p.esCorrecto) {
        aura.addColorStop(0, 'rgba(0,255,65,0.3)');
        aura.addColorStop(1, 'rgba(0,255,65,0)');
      } else {
        aura.addColorStop(0, 'rgba(255,50,50,0.25)');
        aura.addColorStop(1, 'rgba(255,50,50,0)');
      }
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(px, py, pulsoR * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Cuerpo del proyectil
      const gradProy = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, 2, px, py, pulsoR);
      if (p.esCorrecto) {
        gradProy.addColorStop(0, '#AFFFB8');
        gradProy.addColorStop(0.5, '#00CC33');
        gradProy.addColorStop(1, '#003300');
      } else {
        gradProy.addColorStop(0, '#FFAAAA');
        gradProy.addColorStop(0.5, '#CC2200');
        gradProy.addColorStop(1, '#330000');
      }
      ctx.shadowBlur = 18;
      ctx.shadowColor = p.esCorrecto ? '#00FF41' : '#FF3300';
      ctx.fillStyle = gradProy;
      ctx.beginPath();
      ctx.arc(px, py, pulsoR, 0, Math.PI * 2);
      ctx.fill();

      // Borde
      ctx.strokeStyle = p.esCorrecto ? '#00FF41' : '#FF6644';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Icono ✅ / ❌
      ctx.font = `bold ${Math.round(pulsoR * 0.65)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(p.esCorrecto ? '✅' : '❌', px, py - pulsoR * 0.22);

      // Texto de la opción
      ctx.font = `bold ${Math.max(11, Math.round(pulsoR * 0.38))}px Orbitron, sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowBlur = 6;
      ctx.shadowColor = p.esCorrecto ? '#00FF41' : '#FF3300';

      // Truncar texto largo
      let txt = p.texto;
      if (txt.length > 10) txt = txt.substring(0, 9) + '…';
      ctx.fillText(txt, px, py + pulsoR * 0.42);

      ctx.restore();
    });

    // ── Partículas ──
    s.particulas.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.vida / p.vidaMax;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radio * (p.vida / p.vidaMax), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  },
};