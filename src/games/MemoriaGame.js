import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

// ============================================================
//  MEMORIA GAME
//  Se muestran 4 zonas en pantalla. El sistema genera una
//  secuencia de preguntas; el jugador debe tocar las zonas
//  en el orden correcto usando manos/muñecas.
//  Cada ronda la secuencia crece en 1.
// ============================================================

const ZONAS_LAYOUT = [
  { id: 0, nx: 0.22, ny: 0.38, etiqueta: 'A' },
  { id: 1, nx: 0.78, ny: 0.38, etiqueta: 'B' },
  { id: 2, nx: 0.22, ny: 0.72, etiqueta: 'C' },
  { id: 3, nx: 0.78, ny: 0.72, etiqueta: 'D' },
];

export const MemoriaGame = {
  _state: null,

  init(materia, colorTema, config = {}) {
    const dif = config.dificultad || 'medio';
    const tamMult = config.tamanoObjetivos ?? 1.0;

    const difMap = {
      facil:   { longitudInicial: 2, maxLongitud: 5, tiempoShow: 900,  puntosPorZona: 10, penalizacion: -5  },
      medio:   { longitudInicial: 3, maxLongitud: 7, tiempoShow: 700,  puntosPorZona: 15, penalizacion: -8  },
      dificil: { longitudInicial: 4, maxLongitud: 9, tiempoShow: 500,  puntosPorZona: 20, penalizacion: -12 },
    };
    const d = difMap[dif] || difMap.medio;

    this._state = {
      materia,
      colorTema,
      zonas: ZONAS_LAYOUT.map(z => ({ ...z, radioBase: 70 * tamMult })),
      fase: 'mostrando',       // 'mostrando' | 'respondiendo' | 'feedback'
      secuencia: [],           // [{zonaId, reto}]
      pasoActual: 0,           // índice en secuencia que espera input
      indiceShow: 0,           // para animación de mostrar
      longitudActual: d.longitudInicial,
      maxLongitud: d.maxLongitud,
      tiempoShow: d.tiempoShow,
      puntosPorZona: d.puntosPorZona,
      penalizacion: d.penalizacion,
      tick: 0,
      tickFaseInicio: 0,
      tickShowInicio: 0,
      particulas: [],
      feedbackZona: null,    // { zonaId, ok }
      destellos: [],
      ultimaColision: -999,
      colisionCooldown: 40,
      retos: [],             // pool de retos para esta ronda
    };

    this._generarSecuencia();
    return this._state;
  },

  _generarSecuencia() {
    const s = this._state;

    // Generar retos frescos
    s.retos = Array.from({ length: s.longitudActual }, () => generarReto(s.materia));

    // Asignar zonas en orden aleatorio sin repetir consecutivos
    s.secuencia = s.retos.map((reto, i) => {
      let zonaId;
      do { zonaId = Math.floor(Math.random() * 4); }
      while (i > 0 && zonaId === s.secuencia[i - 1]?.zonaId);
      return { zonaId, reto };
    });

    s.fase = 'mostrando';
    s.pasoActual = 0;
    s.indiceShow = 0;
    s.tickShowInicio = s.tick;
  },

  _emitirParticulas(x, y, color, cantidad = 12) {
    const s = this._state;
    for (let i = 0; i < cantidad; i++) {
      const ang = (Math.PI * 2 * i) / cantidad + Math.random() * 0.4;
      const vel = 2.5 + Math.random() * 4;
      s.particulas.push({
        x, y,
        vx: Math.cos(ang) * vel,
        vy: Math.sin(ang) * vel,
        vida: 35 + Math.random() * 20,
        vidaMax: 55,
        r: 2 + Math.random() * 3,
        color,
      });
    }
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;

    s.tick += delta;

    // Partículas
    s.particulas = s.particulas
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vida: p.vida - 1, vx: p.vx * 0.91, vy: p.vy * 0.91 }))
      .filter(p => p.vida > 0);

    // Destellos de zonas
    s.destellos = s.destellos.filter(d => d.vida > 0).map(d => ({ ...d, vida: d.vida - 1 }));

    // ── FASE: MOSTRANDO ──
    if (s.fase === 'mostrando') {
      const elapsed = (s.tick - s.tickShowInicio) * 16; // aprox ms
      const paso = Math.floor(elapsed / s.tiempoShow);

      if (paso !== s.indiceShow && paso < s.secuencia.length) {
        s.indiceShow = paso;
        SFX.pop();
      }

      if (elapsed >= s.tiempoShow * s.secuencia.length + 600) {
        s.fase = 'respondiendo';
        s.pasoActual = 0;
      }
      return null;
    }

    // ── FASE: RESPONDIENDO ──
    if (s.fase === 'respondiendo' && landmarks) {
      if (s.tick - s.ultimaColision < s.colisionCooldown) return null;

      const getRX = n => (1 - n.x) * canvasW;
      const getRY = n => n.y * canvasH;

      const puntos = [15, 16, 19, 20].map(i => landmarks[i]).filter(n => n && n.visibility > 0.3);

      for (const nodo of puntos) {
        const hx = getRX(nodo), hy = getRY(nodo);
        const esperado = s.secuencia[s.pasoActual];

        for (const zona of s.zonas) {
          const zx = zona.nx * canvasW, zy = zona.ny * canvasH;
          const dist = Math.hypot(hx - zx, hy - zy);

          if (dist < zona.radioBase + 15) {
            s.ultimaColision = s.tick;

            if (zona.id === esperado.zonaId) {
              // ✅ Zona correcta
              SFX.acierto();
              this._emitirParticulas(zx, zy, '#00FF41', 16);
              s.destellos.push({ zonaId: zona.id, ok: true, vida: 25 });
              s.pasoActual++;

              if (s.pasoActual >= s.secuencia.length) {
                // Ronda completada
                SFX.bonus();
                s.longitudActual = Math.min(s.longitudActual + 1, s.maxLongitud);
                setTimeout(() => this._generarSecuencia(), 900);
                s.fase = 'feedback';
                return { acierto: true, fallo: false, puntos: s.puntosPorZona * s.secuencia.length, msg: `🧠 SECUENCIA COMPLETA!` };
              }

              return { acierto: true, fallo: false, puntos: s.puntosPorZona, msg: `✅ +${s.puntosPorZona}` };

            } else {
              // ❌ Zona incorrecta
              SFX.error();
              this._emitirParticulas(zx, zy, '#FF4444', 12);
              s.destellos.push({ zonaId: zona.id, ok: false, vida: 25 });
              s.pasoActual = 0; // Reiniciar desde el principio
              s.fase = 'feedback';
              setTimeout(() => {
                s.fase = 'respondiendo';
                s.pasoActual = 0;
              }, 800);
              return { acierto: false, fallo: true, puntos: s.penalizacion, msg: `❌ ¡Orden incorrecto!` };
            }
          }
        }
      }
    }

    return null;
  },

  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    const tick = s.tick;

    // ── Header instrucción ──
    ctx.save();
    const gradH = ctx.createLinearGradient(0, 0, 0, 95);
    gradH.addColorStop(0, 'rgba(0,0,20,0.88)');
    gradH.addColorStop(1, 'rgba(0,0,20,0)');
    ctx.fillStyle = gradH;
    ctx.fillRect(0, 0, canvasW, 95);

    ctx.textAlign = 'center';
    ctx.font = `bold 24px Orbitron, sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowBlur = 10;
    ctx.shadowColor = s.colorTema;

    if (s.fase === 'mostrando') {
      ctx.fillText('🧠 MEMORIZA LA SECUENCIA', canvasW / 2, 36);
      ctx.font = `16px Rajdhani, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.shadowBlur = 0;
      ctx.fillText(`Longitud: ${s.longitudActual}  ·  Observa el orden de las zonas`, canvasW / 2, 64);
    } else if (s.fase === 'respondiendo') {
      const step = s.secuencia[s.pasoActual];
      const zona = s.zonas.find(z => z.id === step?.zonaId);
      ctx.fillText(`🎯 TOCA LA ZONA: ${zona?.etiqueta ?? '?'}`, canvasW / 2, 36);
      ctx.font = `16px Rajdhani, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.shadowBlur = 0;
      ctx.fillText(`Paso ${s.pasoActual + 1} de ${s.secuencia.length}`, canvasW / 2, 64);
    }
    ctx.restore();

    // ── Zonas ──
    s.zonas.forEach((zona, zi) => {
      const zx = zona.nx * canvasW;
      const zy = zona.ny * canvasH;
      const r = zona.radioBase;
      const pulso = 1 + Math.sin(tick * 0.07 + zi * 1.2) * 0.06;

      // Estado: ¿es la zona actualmente resaltada?
      let esActiva = false;
      let colorZona = s.colorTema;

      if (s.fase === 'mostrando') {
        const elapsed = (tick - s.tickShowInicio) * 16;
        const paso = Math.floor(elapsed / s.tiempoShow);
        if (paso < s.secuencia.length && s.secuencia[paso].zonaId === zona.id) {
          esActiva = true;
        }
      } else if (s.fase === 'respondiendo' && s.pasoActual < s.secuencia.length) {
        if (s.secuencia[s.pasoActual].zonaId === zona.id) {
          esActiva = true;
        }
      }

      // Destello de feedback
      const destello = s.destellos.find(d => d.zonaId === zona.id);
      if (destello) {
        colorZona = destello.ok ? '#00FF41' : '#FF3333';
        esActiva = true;
      }

      ctx.save();

      // Aura cuando activa
      if (esActiva) {
        const aura = ctx.createRadialGradient(zx, zy, r * 0.5, zx, zy, r * 2);
        aura.addColorStop(0, colorZona + '55');
        aura.addColorStop(1, colorZona + '00');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(zx, zy, r * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Círculo principal
      const gradZ = ctx.createRadialGradient(zx - r * 0.3, zy - r * 0.3, 4, zx, zy, r * pulso);
      gradZ.addColorStop(0, esActiva ? colorZona + 'CC' : 'rgba(255,255,255,0.08)');
      gradZ.addColorStop(0.6, esActiva ? colorZona + '44' : 'rgba(255,255,255,0.03)');
      gradZ.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradZ;
      ctx.shadowBlur = esActiva ? 30 : 8;
      ctx.shadowColor = colorZona;
      ctx.beginPath();
      ctx.arc(zx, zy, r * pulso, 0, Math.PI * 2);
      ctx.fill();

      // Borde
      ctx.strokeStyle = esActiva ? colorZona : (s.colorTema + '55');
      ctx.lineWidth = esActiva ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(zx, zy, r * pulso, 0, Math.PI * 2);
      ctx.stroke();

      // Etiqueta
      ctx.font = `bold ${Math.round(r * 0.55)}px Orbitron, sans-serif`;
      ctx.fillStyle = esActiva ? '#FFFFFF' : 'rgba(255,255,255,0.35)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = esActiva ? 12 : 0;
      ctx.fillText(zona.etiqueta, zx, zy);

      // Reto asociado si estamos en modo respondiendo y es la zona esperada
      if (s.fase === 'respondiendo' && s.pasoActual < s.secuencia.length) {
        const step = s.secuencia[s.pasoActual];
        if (step.zonaId === zona.id) {
          const reto = step.reto;
          // Opción correcta dentro de la zona
          const opCorr = reto.opciones.find(o => o.esCorrecto);
          if (opCorr) {
            ctx.font = `bold ${Math.max(10, Math.round(r * 0.3))}px Rajdhani, sans-serif`;
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowBlur = 6;
            ctx.shadowColor = s.colorTema;

            // Pregunta arriba de la zona
            ctx.font = `13px Orbitron, sans-serif`;
            ctx.fillStyle = s.colorTema;
            const qTxt = reto.pregunta.length > 30 ? reto.pregunta.substring(0, 28) + '…' : reto.pregunta;
            ctx.fillText(qTxt, zx, zy - r * pulso - 18);

            ctx.font = `bold 15px Rajdhani, sans-serif`;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(opCorr.texto, zx, zy + r * pulso + 18);
          }
        }
      }

      ctx.restore();
    });

    // ── Líneas de secuencia (modo mostrando) ──
    if (s.fase === 'mostrando' && s.secuencia.length > 1) {
      const elapsed = (tick - s.tickShowInicio) * 16;
      const pasoVisible = Math.min(Math.floor(elapsed / s.tiempoShow), s.secuencia.length - 1);

      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = s.colorTema;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);

      for (let i = 0; i < pasoVisible; i++) {
        const zA = s.zonas.find(z => z.id === s.secuencia[i].zonaId);
        const zB = s.zonas.find(z => z.id === s.secuencia[i + 1]?.zonaId);
        if (zA && zB) {
          ctx.beginPath();
          ctx.moveTo(zA.nx * canvasW, zA.ny * canvasH);
          ctx.lineTo(zB.nx * canvasW, zB.ny * canvasH);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── Indicadores de progreso (puntos) ──
    if (s.fase === 'respondiendo') {
      const totalPasos = s.secuencia.length;
      const anchoPuntos = totalPasos * 28;
      const startX = (canvasW - anchoPuntos) / 2;
      const baseY = canvasH - 30;

      for (let i = 0; i < totalPasos; i++) {
        const px = startX + i * 28 + 10;
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, baseY, 8, 0, Math.PI * 2);
        ctx.fillStyle = i < s.pasoActual ? '#00FF41' : (i === s.pasoActual ? s.colorTema : 'rgba(255,255,255,0.2)');
        ctx.shadowBlur = i === s.pasoActual ? 12 : 0;
        ctx.shadowColor = s.colorTema;
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Partículas ──
    s.particulas.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.vida / p.vidaMax;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  },
};