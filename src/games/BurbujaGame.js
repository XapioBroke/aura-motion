// ============================================================
//  BURBUJA GAME v3 — Burbujas dinámicas por toda la pantalla
//  - Fácil:   movimiento suave ondulante
//  - Medio:   zigzag + rebotes en bordes
//  - Difícil: movimiento libre caótico + aceleración
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

const DIF_MAP = {
  facil:   { puntosCorrecto: 50, puntosError: -10, cooldown: 1600,
             vel: 0.0007, patron: 'ondulante' },
  medio:   { puntosCorrecto: 50, puntosError: -12, cooldown: 1200,
             vel: 0.0014, patron: 'zigzag'    },
  dificil: { puntosCorrecto: 50, puntosError: -15, cooldown: 800,
             vel: 0.0024, patron: 'caotico'   },
};

// Colores neón para cada burbuja (rotan por índice)
const COLORES = ['#00FFFF', '#FF44CC', '#44FF88', '#FFD700', '#FF6644', '#AA44FF'];

export const BurbujaGame = {
  _state: null,

  init(materia, colorTema, config = {}) {
    const dif     = config.dificultad      || 'medio';
    const tamMult = config.tamanoObjetivos ?? 1.0;
    const d       = DIF_MAP[dif] || DIF_MAP.medio;

    const reto = generarReto(materia);
    this._state = {
      materia, colorTema,
      dificultad: dif,
      patron:     d.patron,
      velBase:    d.vel,
      burbujas:   [],
      pregunta:   reto.pregunta,
      enCooldown: false,
      tick:       0,
      radioBase:  62 * tamMult,
      puntosCorrecto: d.puntosCorrecto,
      puntosError:    d.puntosError,
      cooldown:       d.cooldown,
    };
    this._generarBurbujas(reto.opciones);
    return this._state;
  },

  _spawnBurbuja(opc, idx, total) {
    const s = this._state;
    const r = s.radioBase;
    // Distribuir posición inicial bien separada
    const sectores = total <= 3
      ? [0.22, 0.50, 0.78]
      : [0.18, 0.38, 0.62, 0.82, 0.50];
    const xStart = sectores[idx] ?? (0.15 + (idx / total) * 0.70);
    const yStart = 0.25 + Math.random() * 0.50;

    // Velocidad con dirección aleatoria
    const ang  = Math.random() * Math.PI * 2;
    const vel  = s.velBase * (0.8 + Math.random() * 0.5);
    const vx   = Math.cos(ang) * vel;
    const vy   = Math.sin(ang) * vel * 0.6;

    return {
      x: xStart, y: yStart,
      vx, vy,
      // Para zigzag: oscilación en Y
      fase:       Math.random() * Math.PI * 2,
      faseDelta:  0.012 + Math.random() * 0.008,
      // Para caótico: aceleración aleatoria periódica
      accelTick:  Math.floor(Math.random() * 120),
      accelMax:   140 + Math.floor(Math.random() * 80),
      radio:      r,
      texto:      opc.texto,
      esCorrecto: opc.esCorrecto,
      color:      COLORES[idx % COLORES.length],
      pulsoFase:  Math.random() * Math.PI * 2,
      reventando: false,
      reventTick: 0,
      particulas: [],
    };
  },

  _generarBurbujas(opciones) {
    const s = this._state;
    s.burbujas = opciones.map((opc, i) => this._spawnBurbuja(opc, i, opciones.length));
  },

  _nuevaRonda() {
    const s = this._state;
    const reto = generarReto(s.materia);
    s.pregunta  = reto.pregunta;
    s.enCooldown = false;
    this._generarBurbujas(reto.opciones);
  },

  _moverBurbuja(b, canvasW, canvasH, delta) {
    const s = this._state;
    const r = b.radio / canvasW; // radio normalizado
    const rY = b.radio / canvasH;

    if (s.patron === 'ondulante') {
      // Movimiento horizontal con onda suave en Y
      b.x += b.vx * delta;
      b.fase += b.faseDelta * delta;
      b.y = b.y + Math.sin(b.fase) * 0.0004 * delta;

      // Rebote horizontal
      if (b.x < r)      { b.x = r;      b.vx =  Math.abs(b.vx); }
      if (b.x > 1 - r)  { b.x = 1 - r;  b.vx = -Math.abs(b.vx); }
      // Mantener en zona media-alta
      if (b.y < 0.18)  { b.y = 0.18; }
      if (b.y > 0.82)  { b.y = 0.82; }

    } else if (s.patron === 'zigzag') {
      // Movimiento diagonal con rebotes en todos los bordes
      b.x += b.vx * delta;
      b.y += b.vy * delta;

      if (b.x < r)     { b.x = r;     b.vx =  Math.abs(b.vx); }
      if (b.x > 1 - r) { b.x = 1 - r; b.vx = -Math.abs(b.vx); }
      if (b.y < 0.15)  { b.y = 0.15;  b.vy =  Math.abs(b.vy); }
      if (b.y > 0.88)  { b.y = 0.88;  b.vy = -Math.abs(b.vy); }

    } else {
      // CAÓTICO: rebotes + cambios de dirección periódicos
      b.x += b.vx * delta;
      b.y += b.vy * delta;
      b.accelTick += delta;

      // Cada cierto tiempo cambia de dirección bruscamente
      if (b.accelTick >= b.accelMax) {
        b.accelTick = 0;
        b.accelMax  = 100 + Math.floor(Math.random() * 100);
        const ang = Math.random() * Math.PI * 2;
        const spd = s.velBase * (0.7 + Math.random() * 0.8);
        b.vx = Math.cos(ang) * spd;
        b.vy = Math.sin(ang) * spd * 0.7;
      }

      if (b.x < r)     { b.x = r;     b.vx =  Math.abs(b.vx) * (0.9 + Math.random() * 0.3); }
      if (b.x > 1 - r) { b.x = 1 - r; b.vx = -Math.abs(b.vx) * (0.9 + Math.random() * 0.3); }
      if (b.y < 0.14)  { b.y = 0.14;  b.vy =  Math.abs(b.vy) * (0.9 + Math.random() * 0.3); }
      if (b.y > 0.88)  { b.y = 0.88;  b.vy = -Math.abs(b.vy) * (0.9 + Math.random() * 0.3); }
    }
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s || s.enCooldown) return null;
    s.tick += delta;

    // Mover todas las burbujas
    s.burbujas.forEach(b => {
      if (!b.reventando) {
        this._moverBurbuja(b, canvasW, canvasH, delta);
      } else {
        b.reventTick++;
        b.particulas.forEach(p => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.vida--;
        });
        b.particulas = b.particulas.filter(p => p.vida > 0);
      }
    });

    if (!landmarks) return null;

    const getRX = (n) => (1 - n.x) * canvasW;
    const getRY = (n) => n.y * canvasH;
    const manos = [landmarks[15], landmarks[16], landmarks[19], landmarks[20]].filter(Boolean);

    for (const burbuja of s.burbujas) {
      if (burbuja.reventando) continue;
      const bx = burbuja.x * canvasW;
      const by = burbuja.y * canvasH;

      for (const mano of manos) {
        const dist = Math.hypot(getRX(mano) - bx, getRY(mano) - by);
        if (dist < burbuja.radio + 22) {
          burbuja.reventando  = true;
          burbuja.reventTick  = 0;
          burbuja.particulas  = Array.from({ length: 30 }, () => ({
            x: bx, y: by,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() - 0.5) * 12 - 3,
            vida: 30 + Math.random() * 20,
            color: burbuja.esCorrecto ? '#00FF41' : '#FF4444',
          }));

          s.enCooldown = true;
          SFX.pop();

          if (burbuja.esCorrecto) {
            SFX.acierto();
            setTimeout(() => this._nuevaRonda(), s.cooldown);
            return { acierto: true, fallo: false, puntos: s.puntosCorrecto };
          } else {
            SFX.error();
            setTimeout(() => this._nuevaRonda(), s.cooldown);
            return { acierto: false, fallo: true, puntos: s.puntosError };
          }
        }
      }
    }
    return null;
  },

  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;
    const W = canvasW, H = canvasH;

    // Pregunta
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(W * 0.04, 14, W * 0.92, 106, 12);
    else ctx.rect(W * 0.04, 14, W * 0.92, 106);
    ctx.fill();
    ctx.font        = 'bold 40px Orbitron, sans-serif';
    ctx.fillStyle   = '#FFFFFF';
    ctx.shadowBlur  = 14;
    ctx.shadowColor = s.colorTema;
    ctx.textAlign   = 'center';
    ctx.fillText(s.pregunta, W / 2, 72);
    ctx.font      = '18px Rajdhani, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.shadowBlur = 0;
    ctx.fillText('🫧 Pincha la burbuja correcta — ¡se mueven!', W / 2, 106);
    ctx.restore();

    s.burbujas.forEach(b => {
      const bx = b.x * W, by = b.y * H;

      if (b.reventando) {
        b.particulas.forEach(p => {
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.vida / 50);
          ctx.fillStyle   = p.color;
          ctx.shadowBlur  = 12; ctx.shadowColor = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        if (b.reventTick < 12) {
          ctx.save();
          ctx.globalAlpha = (12 - b.reventTick) / 12;
          ctx.fillStyle   = b.esCorrecto ? '#00FF41' : '#FF4444';
          ctx.shadowBlur  = 55; ctx.shadowColor = b.esCorrecto ? '#00FF41' : '#FF4444';
          ctx.beginPath(); ctx.arc(bx, by, b.radio * 2.8, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        return;
      }

      const pulso = Math.sin(s.tick * 0.07 + b.pulsoFase) * 0.5 + 0.5;
      const glow  = 14 + pulso * 18;

      ctx.save();

      // Aura exterior difusa
      ctx.shadowBlur  = glow * 2;
      ctx.shadowColor = b.color;
      ctx.globalAlpha = 0.18 + pulso * 0.12;
      ctx.beginPath(); ctx.arc(bx, by, b.radio * 1.45, 0, Math.PI * 2);
      const aura = ctx.createRadialGradient(bx, by, 0, bx, by, b.radio * 1.45);
      aura.addColorStop(0, b.color + '88');
      aura.addColorStop(1, 'transparent');
      ctx.fillStyle = aura; ctx.fill();
      ctx.globalAlpha = 1;

      // Cuerpo burbuja
      ctx.shadowBlur  = glow;
      ctx.shadowColor = b.color;
      const grad = ctx.createRadialGradient(
        bx - b.radio * 0.3, by - b.radio * 0.3, b.radio * 0.08,
        bx, by, b.radio
      );
      grad.addColorStop(0, 'rgba(255,255,255,0.75)');
      grad.addColorStop(0.35, b.color + 'AA');
      grad.addColorStop(1,    b.color + '33');
      ctx.beginPath(); ctx.arc(bx, by, b.radio, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();

      // Borde neón
      ctx.strokeStyle = b.color;
      ctx.lineWidth   = 2.5;
      ctx.stroke();

      // Brillo especular
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle   = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(bx - b.radio * 0.28, by - b.radio * 0.28,
                  b.radio * 0.18, b.radio * 0.10, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Texto centrado con wrap
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#FFFFFF';
      ctx.font       = `bold 20px Orbitron, sans-serif`;
      ctx.textAlign  = 'center';
      ctx.textBaseline = 'middle';

      const palabras = b.texto.split(' ');
      let lineas = [], linea = '';
      const maxW = b.radio * 1.55;
      palabras.forEach(p => {
        const test = linea + p + ' ';
        if (ctx.measureText(test).width > maxW && linea) {
          lineas.push(linea.trim()); linea = p + ' ';
        } else linea = test;
      });
      if (linea) lineas.push(linea.trim());
      lineas.forEach((l, i) =>
        ctx.fillText(l, bx, by + (i - (lineas.length - 1) / 2) * 22)
      );

      ctx.restore();
    });
  },

  getState() { return this._state; },
};