// ============================================================
//  METEORITO GAME v5
//  ✅ Sin ayuda visual — todos los meteoritos del mismo tamaño
//  ✅ Forma realista: roca irregular + cráteres + cola de fuego
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

const DIF_MAP = {
  facil:   { velBase: 0.008, spawnInterval: 70, puntosCorrecto: 20, puntosError: -8  },
  medio:   { velBase: 0.013, spawnInterval: 50, puntosCorrecto: 30, puntosError: -10 },
  dificil: { velBase: 0.019, spawnInterval: 32, puntosCorrecto: 40, puntosError: -15 },
};

// Genera los vértices irregulares de la roca — se fijan al spawnear
const _generarVertices = (n, radio) => {
  return Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * Math.PI * 2;
    const r   = radio * (0.68 + Math.random() * 0.38);
    return { ang, r };
  });
};

// Genera posiciones de cráteres relativas al centro
const _generarCrateres = (radio) => {
  const n = 2 + Math.floor(Math.random() * 3);
  return Array.from({ length: n }, () => ({
    x:  (Math.random() - 0.5) * radio * 1.1,
    y:  (Math.random() - 0.5) * radio * 1.1,
    r:  radio * (0.10 + Math.random() * 0.14),
  }));
};

export const MeteoritoGame = {
  _state: null,

  init(materia, colorTema, config = {}) {
    const dif     = config.dificultad      || 'medio';
    const velMult = config.velocidad       ?? 1.0;
    const tamMult = config.tamanoObjetivos ?? 1.0;
    const d       = DIF_MAP[dif] || DIF_MAP.medio;

    this._state = {
      materia, colorTema,
      meteoritos:     [],
      preguntaActual: null,
      tick: 0, spawnTimer: 0,
      spawnInterval:  d.spawnInterval,
      velBase:        d.velBase * velMult,
      radioBase:      62 * tamMult,   // mismo radio para todos
      puntosCorrecto: d.puntosCorrecto,
      puntosError:    d.puntosError,
    };
    this._nuevaPregunta();
    return this._state;
  },

  _nuevaPregunta() {
    const s = this._state;
    s.preguntaActual = generarReto(s.materia);
    s.meteoritos = (s.meteoritos || []).filter(m => !m.esCorrecto && !m.impactado);
  },

  _spawnMeteorito() {
    const s = this._state;
    if (!s.preguntaActual) return;

    const opcion = s.preguntaActual.opciones[
      Math.floor(Math.random() * s.preguntaActual.opciones.length)
    ];
    if (s.meteoritos.some(m => !m.impactado && m.texto === opcion.texto)) return;

    const radio = s.radioBase; // igual para todos — sin pista visual
    s.meteoritos.push({
      x:            0.1 + Math.random() * 0.8,
      y:            -0.14,
      radio,
      vertices:     _generarVertices(11, radio),  // forma fija
      crateres:     _generarCrateres(radio),
      texto:        opcion.texto,
      esCorrecto:   opcion.esCorrecto,
      velocidad:    s.velBase + Math.random() * 0.004,
      rotacion:     Math.random() * Math.PI * 2,
      velocidadRot: (Math.random() - 0.5) * 0.06,
      impactado:    false,
      impactTick:   0,
      // Cola de partículas de fuego
      particulas:   [],
      spawnTick:    0,
    });
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;
    s.tick += delta;
    s.spawnTimer++;

    if (s.spawnTimer >= s.spawnInterval) {
      s.spawnTimer = 0;
      this._spawnMeteorito();
    }

    s.meteoritos.forEach(m => {
      if (!m.impactado) {
        m.y         += m.velocidad;
        m.rotacion  += m.velocidadRot;
        m.spawnTick++;

        // Emitir partículas de fuego cada 2 frames
        if (m.spawnTick % 2 === 0) {
          const nParticulas = 3 + Math.floor(Math.random() * 3);
          for (let i = 0; i < nParticulas; i++) {
            const angBase   = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
            const speed     = 0.003 + Math.random() * 0.005;
            const colores   = ['#FF2200', '#FF6600', '#FFAA00', '#FFDD00', '#FF4400'];
            m.particulas.push({
              x:     m.x + (Math.random() - 0.5) * 0.04,
              y:     m.y - m.radio / canvasH * 0.5,
              vx:    Math.cos(angBase) * speed * (Math.random() - 0.5),
              vy:    Math.sin(angBase) * speed - 0.002,
              vida:  18 + Math.random() * 20,
              vidaMax: 38,
              tam:   m.radio * (0.15 + Math.random() * 0.35),
              color: colores[Math.floor(Math.random() * colores.length)],
            });
          }
        }
      } else {
        m.impactTick++;
      }

      // Actualizar partículas
      m.particulas.forEach(p => {
        p.x   += p.vx;
        p.y   += p.vy;
        p.vy  -= 0.0001; // gravedad inversa (sube)
        p.tam *= 0.94;
        p.vida--;
      });
      m.particulas = m.particulas.filter(p => p.vida > 0 && p.tam > 0.5);
    });

    s.meteoritos = s.meteoritos.filter(m =>
      m.y < 1.15 && !(m.impactado && m.impactTick > 30)
    );

    if (!landmarks) return null;

    const getRX = n => (1 - n.x) * canvasW;
    const getRY = n => n.y * canvasH;

    const puntosColision = [0, 11, 12, 23, 24, 15, 16, 19, 20]
      .map(i => landmarks[i]).filter(Boolean);

    for (const m of s.meteoritos) {
      if (m.impactado) continue;
      const mx = m.x * canvasW, my = m.y * canvasH;

      for (const punto of puntosColision) {
        const dist = Math.hypot(getRX(punto) - mx, getRY(punto) - my);
        if (dist < m.radio + 22) {
          m.impactado = true;
          if (m.esCorrecto) {
            try { SFX.bonus(); } catch (_) {}
            this._nuevaPregunta();
            return { acierto: true, fallo: false, puntos: s.puntosCorrecto, mensaje: `⭐ +${s.puntosCorrecto} XP` };
          } else {
            try { SFX.impacto(); } catch (_) {}
            return { acierto: false, fallo: true, puntos: s.puntosError, mensaje: `💥 ¡Golpeado! -${Math.abs(s.puntosError)} XP` };
          }
        }
      }
    }
    return null;
  },

  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    // Pregunta
    if (s.preguntaActual) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.roundRect?.(canvasW*0.05, 18, canvasW*0.90, 110, 12)
        ?? ctx.rect(canvasW*0.05, 18, canvasW*0.90, 110);
      ctx.fill();
      ctx.textAlign  = 'center';
      ctx.font       = 'bold 30px Orbitron, sans-serif';
      ctx.fillStyle  = '#FFFFFF'; ctx.shadowBlur = 12; ctx.shadowColor = s.colorTema;
      ctx.fillText(s.preguntaActual.pregunta, canvasW/2, 70);
      ctx.font = '20px Rajdhani, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.shadowBlur = 0;
      ctx.fillText('☄️ ESQUIVA los incorrectos · ATRAPA el correcto', canvasW/2, 105);
      ctx.restore();
    }

    s.meteoritos.forEach(m => {
      const mx = m.x * canvasW, my = m.y * canvasH;

      // ── Cola de partículas de fuego ──
      m.particulas.forEach(p => {
        const px = p.x * canvasW, py = p.y * canvasH;
        const alpha = (p.vida / p.vidaMax) * 0.85;
        ctx.save();
        ctx.globalAlpha = alpha;
        // Gradiente radial por partícula
        const g = ctx.createRadialGradient(px, py, 0, px, py, p.tam);
        g.addColorStop(0,   '#FFFFFF');
        g.addColorStop(0.2, p.color);
        g.addColorStop(0.7, p.color + '88');
        g.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.shadowBlur  = 8; ctx.shadowColor = p.color;
        ctx.beginPath(); ctx.arc(px, py, p.tam, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      });

      // ── Halo de calor alrededor de la roca ──
      if (!m.impactado) {
        ctx.save();
        ctx.globalAlpha = 0.18 + Math.sin(s.tick * 0.15 + m.x * 10) * 0.08;
        const halo = ctx.createRadialGradient(mx, my, m.radio*0.6, mx, my, m.radio*1.7);
        halo.addColorStop(0, '#FF4400');
        halo.addColorStop(0.5, '#FF220044');
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(mx, my, m.radio*1.7, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(m.rotacion);

      // ── Explosión al impactar ──
      if (m.impactado) {
        const prog = m.impactTick / 30;
        ctx.globalAlpha = Math.max(0, 1 - prog);
        const fc = m.esCorrecto ? '#FFD700' : '#FF4444';
        ctx.shadowBlur = 60; ctx.shadowColor = fc;
        ctx.beginPath(); ctx.arc(0, 0, m.radio * (1.5 + prog * 2), 0, Math.PI*2);
        ctx.fillStyle = fc + '99'; ctx.fill();
        ctx.restore();
        return;
      }

      // ── Roca con vértices fijos irregulares ──
      ctx.shadowBlur = 6; ctx.shadowColor = '#FF4400';
      ctx.beginPath();
      m.vertices.forEach((v, i) => {
        const x = Math.cos(v.ang) * v.r;
        const y = Math.sin(v.ang) * v.r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();

      // Gradiente de la roca — iluminada por el fuego desde arriba
      const gr = ctx.createRadialGradient(
        -m.radio*0.3, -m.radio*0.4, 2,
         0, 0, m.radio * 1.1
      );
      gr.addColorStop(0,   '#CC8844');  // naranja caliente (lado del fuego)
      gr.addColorStop(0.3, '#886644');
      gr.addColorStop(0.6, '#554433');
      gr.addColorStop(1,   '#221100');  // oscuro en el borde
      ctx.fillStyle = gr; ctx.fill();

      // Borde rugoso
      ctx.strokeStyle = '#FF6622'; ctx.lineWidth = 2.5;
      ctx.shadowBlur  = 10; ctx.shadowColor = '#FF4400';
      ctx.stroke();

      // ── Cráteres ──
      m.crateres.forEach(c => {
        ctx.save();
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
        // Cráter oscuro con borde más claro
        ctx.fillStyle = '#1A0D00';
        ctx.shadowBlur = 0;
        ctx.fill();
        ctx.strokeStyle = '#664422'; ctx.lineWidth = 1.2; ctx.stroke();
        // Brillo en el borde superior del cráter
        ctx.beginPath(); ctx.arc(c.x - c.r*0.25, c.y - c.r*0.25, c.r*0.45, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(180,100,40,0.3)'; ctx.fill();
        ctx.restore();
      });

      // ── Líneas de tensión / grietas ──
      ctx.strokeStyle = 'rgba(255,80,0,0.4)'; ctx.lineWidth = 1;
      ctx.shadowBlur  = 0;
      for (let g = 0; g < 3; g++) {
        const ax = (Math.random()-0.5)*m.radio, ay = (Math.random()-0.5)*m.radio;
        const bx = ax + (Math.random()-0.5)*m.radio*0.6;
        const by = ay + (Math.random()-0.5)*m.radio*0.6;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }

      ctx.restore();

      // ── Texto de respuesta ──
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 17px Orbitron, sans-serif';
      const palabras = m.texto.split(' ');
      let lineas = [], linea = '';
      const maxW = m.radio * 1.6;
      palabras.forEach(p => {
        const test = linea + p + ' ';
        if (ctx.measureText(test).width > maxW && linea) {
          lineas.push(linea.trim()); linea = p + ' ';
        } else { linea = test; }
      });
      if (linea) lineas.push(linea.trim());

      const lineH = 21;
      const boxH  = lineas.length * lineH + 12;
      const boxW  = Math.max(...lineas.map(l => ctx.measureText(l).width)) + 20;

      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.beginPath();
      ctx.roundRect?.(mx - boxW/2, my - boxH/2, boxW, boxH, 6)
        ?? ctx.rect(mx - boxW/2, my - boxH/2, boxW, boxH);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.2; ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.shadowBlur = 3; ctx.shadowColor = '#000';
      lineas.forEach((l, i) =>
        ctx.fillText(l, mx, my + (i - (lineas.length-1)/2) * lineH)
      );
      ctx.restore();
    });
  },

  getState() { return this._state; },
};