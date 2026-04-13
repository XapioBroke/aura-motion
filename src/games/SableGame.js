// ============================================================
//  SABLE GAME — Corta las barras correctas
//  Mecánica: barras caen de arriba. Detecta velocidad de
//  muñeca entre frames. Corte rápido = destruye la barra.
//  Correcto: +XP. Incorrecto: -XP/vida.
//  Síntesis de sonido FM tipo sable de luz incluida.
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

// ── Config por dificultad ──────────────────────────────────
const DIF_MAP = {
  facil:   { velBase: 0.004, spawnInterval: 90,  puntosCorrecto: 20, puntosError: -5,  velUmbral: 0.018 },
  medio:   { velBase: 0.007, spawnInterval: 65,  puntosCorrecto: 30, puntosError: -10, velUmbral: 0.015 },
  dificil: { velBase: 0.011, spawnInterval: 45,  puntosCorrecto: 40, puntosError: -15, velUmbral: 0.012 },
};

// ── Sonido sable FM procedural ─────────────────────────────
const _sableSFX = (() => {
  let ctx = null;
  return {
    corte() {
      try {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        const t   = ctx.currentTime;
        const osc = ctx.createOscillator();
        const mod = ctx.createOscillator();
        const gain    = ctx.createGain();
        const modGain = ctx.createGain();
        // FM: modulador → frecuencia del portador
        mod.type      = 'sine';
        mod.frequency.setValueAtTime(180, t);
        mod.frequency.linearRampToValueAtTime(80, t + 0.18);
        modGain.gain.setValueAtTime(400, t);
        modGain.gain.linearRampToValueAtTime(0, t + 0.18);
        mod.connect(modGain);
        modGain.connect(osc.frequency);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.linearRampToValueAtTime(140, t + 0.18);
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.25);
        mod.start(t); mod.stop(t + 0.25);
      } catch (_) {}
    },
    zumbido(activo) {
      // Zumbido continuo cuando el sable está activo (velocidad alta)
      // Omitido para no saturar — solo el corte
    },
  };
})();

export const SableGame = {
  _state: null,

  init(materia, colorTema, config = {}) {
    const dif     = config.dificultad      || 'medio';
    const velMult = config.velocidad       ?? 1.0;
    const tamMult = config.tamanoObjetivos ?? 1.0;
    const d       = DIF_MAP[dif] || DIF_MAP.medio;

    const reto = generarReto(materia);
    this._state = {
      materia, colorTema,
      barras:       [],
      pregunta:     reto.pregunta,
      opciones:     reto.opciones,
      tick:         0,
      spawnTimer:   0,
      spawnInterval: d.spawnInterval,
      velBase:      d.velBase * velMult,
      anchoBase:    110 * tamMult,
      altoBase:     52  * tamMult,
      puntosCorrecto: d.puntosCorrecto,
      puntosError:    d.puntosError,
      velUmbral:      d.velUmbral,     // velocidad mínima de muñeca para contar como corte
      // Estado de muñecas (para calcular delta velocidad)
      munPrev: { L: null, R: null },
      // Trail del sable (posiciones recientes de muñecas)
      trailL: [], trailR: [],
      // Flash de corte
      cortesActivos: [], // { x, y, angulo, vida, color }
    };
    this._spawnBarra(true); // spawn inmediato de la correcta para empezar
    return this._state;
  },

  _nuevaPregunta() {
    if (!this._state) return;
    const s = this._state;
    const reto = generarReto(s.materia);
    s.pregunta  = reto.pregunta;
    s.opciones  = reto.opciones;
    // Limpiar TODAS las barras de la ronda anterior (correctas e incorrectas)
    s.barras    = [];
    s.spawnTimer = s.spawnInterval; // forzar spawn inmediato en el próximo frame
  },

  _spawnBarra(forzarCorrecta = false) {
    const s = this._state;
    if (!s.opciones) return;

    // Elegir opción — si forzar correcta o aleatoria
    const pool = forzarCorrecta
      ? s.opciones.filter(o => o.esCorrecto)
      : s.opciones;
    if (!pool.length) return;

    const opcion = pool[Math.floor(Math.random() * pool.length)];
    // Evitar duplicados activos solo si ya hay 2+ barras del mismo texto
    const conteo = s.barras.filter(b => !b.cortada && b.texto === opcion.texto).length;
    if (conteo >= 1) return;

    const ancho = s.anchoBase + (Math.random() - 0.5) * 20;
    const alto  = s.altoBase;
    const x     = 0.08 + Math.random() * 0.84;
    const angulo = (Math.random() - 0.5) * 0.3; // ligera inclinación

    s.barras.push({
      x, y: -0.08,
      ancho, alto,
      texto:       opcion.texto,
      esCorrecto:  opcion.esCorrecto,
      velocidad:   s.velBase + Math.random() * 0.003,
      angulo,
      cortada:     false,
      cortaTick:   0,
      mitades:     null, // tras corte: [{dx,dy,rot,rotVel}×2]
    });
  },

  // ── Detectar corte de una barra por velocidad de muñeca ───
  _intentarCorte(mx, my, vx, vy, canvasW, canvasH) {
    const s = this._state;
    const vel = Math.hypot(vx, vy); // velocidad normalizada
    if (vel < s.velUmbral) return null;

    for (const b of s.barras) {
      if (b.cortada) continue;
      const bx = b.x * canvasW;
      const by = b.y * canvasH;
      // Bounding box simple con rotación ignorada (suficientemente preciso)
      const hw = b.ancho / 2 + 15, hh = b.alto / 2 + 15;
      if (mx > bx - hw && mx < bx + hw && my > by - hh && my < by + hh) {
        return b;
      }
    }
    return null;
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;
    s.tick += delta;
    s.spawnTimer++;

    // Spawn periódico
    if (s.spawnTimer >= s.spawnInterval) {
      s.spawnTimer = 0;

      const hayCorrecta   = s.barras.some(b => !b.cortada && b.esCorrecto);
      const totalActivas  = s.barras.filter(b => !b.cortada).length;

      // Si no hay correcta (nueva ronda o se fue por la pantalla), spawn correcta primero
      if (!hayCorrecta) {
        this._spawnBarra(true);
      }
      // Spawn incorrecta si hay pocas barras en pantalla
      if (totalActivas < 3) {
        this._spawnBarra(false);
      }
    }

    // Mover barras y limpiar
    s.barras.forEach(b => {
      if (!b.cortada) {
        b.y += b.velocidad;
      } else {
        b.cortaTick++;
        if (b.mitades) {
          b.mitades.forEach(m => {
            m.dx += m.vx; m.dy += m.vy; m.vy += 0.4;
            m.rot += m.rotVel;
          });
        }
      }
    });
    s.barras = s.barras.filter(b => b.y < 1.15 && !(b.cortada && b.cortaTick > 35));

    // Actualizar trails y flashes
    s.trailL = s.trailL.map(p => ({ ...p, vida: p.vida - 1 })).filter(p => p.vida > 0);
    s.trailR = s.trailR.map(p => ({ ...p, vida: p.vida - 1 })).filter(p => p.vida > 0);
    s.cortesActivos = s.cortesActivos.map(c => ({ ...c, vida: c.vida - 1 })).filter(c => c.vida > 0);

    if (!landmarks) return null;

    const getRX = n => (1 - n.x) * canvasW;
    const getRY = n => n.y * canvasH;

    const munecas = [
      { id: 'L', lm: landmarks[15], prev: s.munPrev.L, trail: s.trailL },
      { id: 'R', lm: landmarks[16], prev: s.munPrev.R, trail: s.trailR },
    ];

    let resultado = null;

    munecas.forEach(({ id, lm, prev, trail }) => {
      if (!lm) return;
      const mx = getRX(lm), my = getRY(lm);

      // Añadir al trail
      trail.push({ x: mx, y: my, vida: 8 });
      if (trail.length > 12) trail.shift();

      if (prev) {
        // Velocidad normalizada (independiente del tamaño de canvas)
        const vx = (mx - prev.x) / canvasW;
        const vy = (my - prev.y) / canvasH;

        const barra = this._intentarCorte(mx, my, vx, vy, canvasW, canvasH);
        if (barra && !resultado) {
          barra.cortada   = true;
          barra.cortaTick = 0;
          // Calcular ángulo del corte para las mitades
          const angCorte = Math.atan2(vy, vx);
          barra.mitades = [
            { dx: 0, dy: 0, vx: Math.cos(angCorte + Math.PI/2) * 3, vy: -4, rotVel:  0.12, rot: 0 },
            { dx: 0, dy: 0, vx: Math.cos(angCorte - Math.PI/2) * 3, vy: -3, rotVel: -0.10, rot: 0 },
          ];

          // Flash de corte en posición de la barra
          s.cortesActivos.push({
            x: barra.x * canvasW, y: barra.y * canvasH,
            angulo: angCorte, vida: 18,
            color: barra.esCorrecto ? '#00FF41' : '#FF4444',
          });

          _sableSFX.corte();

          if (barra.esCorrecto) {
            this._nuevaPregunta();
            s.spawnTimer = s.spawnInterval; // spawn inmediato de la nueva ronda
            resultado = { acierto: true, fallo: false, puntos: s.puntosCorrecto };
          } else {
            resultado = { acierto: false, fallo: true, puntos: s.puntosError };
          }
        }
      }

      // Actualizar prev
      if (id === 'L') s.munPrev.L = { x: mx, y: my };
      else            s.munPrev.R = { x: mx, y: my };
    });

    return resultado;
  },

  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    // Fondo oscuro detrás de la pregunta para legibilidad desde lejos
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect?.(canvasW * 0.05, 18, canvasW * 0.90, 110, 12) 
      ?? ctx.rect(canvasW * 0.05, 18, canvasW * 0.90, 110);
    ctx.fill();
    ctx.restore();
    // ── Pregunta ──
    ctx.save();
    ctx.textAlign  = 'center';
    ctx.font = `bold 42px Orbitron, sans-serif`;
    ctx.fillStyle  = '#FFFFFF';
    ctx.shadowBlur = 14; ctx.shadowColor = s.colorTema;
    ctx.fillText(s.pregunta, canvasW / 2, 72);
    ctx.font = `20px Rajdhani, sans-serif`;
    ctx.fillStyle  = 'rgba(255,255,255,0.5)'; ctx.shadowBlur = 0;
    ctx.fillText('⚔️ Mueve la mano RÁPIDO sobre la respuesta correcta', canvasW / 2, 106);
    ctx.restore();

    // ── Barras ──
    s.barras.forEach(b => {
      const bx = b.x * canvasW, by = b.y * canvasH;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(b.angulo);

      if (b.cortada && b.mitades) {
        // Dos mitades volando
        b.mitades.forEach((m, idx) => {
          ctx.save();
          ctx.translate(m.dx, m.dy);
          ctx.rotate(m.rot);
          ctx.globalAlpha = Math.max(0, 1 - b.cortaTick / 35);
          const color = b.esCorrecto ? '#00FF41' : '#FF4444';
          // Mitad superior o inferior
          ctx.beginPath();
          const hw = b.ancho / 2, hh = b.alto / 2;
          if (idx === 0) {
            ctx.rect(-hw, -hh, b.ancho, hh);
          } else {
            ctx.rect(-hw, 0, b.ancho, hh);
          }
          ctx.fillStyle = color + '88';
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.fill(); ctx.stroke();
          ctx.restore();
        });
        ctx.restore();
        return;
      }

      // Barra normal
      const hw = b.ancho / 2, hh = b.alto / 2;
      const color = b.esCorrecto ? s.colorTema : '#CC4444';
      const colorBg = b.esCorrecto ? s.colorTema + '33' : '#CC444422';

      // Glow exterior
      ctx.shadowBlur  = b.esCorrecto ? 20 : 8;
      ctx.shadowColor = color;

      // Cuerpo
      ctx.beginPath();
      ctx.roundRect?.(-hw, -hh, b.ancho, b.alto, 8) ?? ctx.rect(-hw, -hh, b.ancho, b.alto);
      ctx.fillStyle   = colorBg; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = b.esCorrecto ? 3 : 2; ctx.stroke();

      // Barra de energía interna (efecto neón)
      ctx.beginPath();
      ctx.roundRect?.(-hw + 4, -3, b.ancho - 8, 6, 3) ?? ctx.rect(-hw + 4, -3, b.ancho - 8, 6);
      ctx.fillStyle = color + '66'; ctx.shadowBlur = 10; ctx.fill();

      // Texto
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#FFFFFF';
      ctx.font = `bold 20px Orbitron, sans-serif`;
      ctx.textAlign  = 'center'; ctx.textBaseline = 'middle';
      // Wrap si es largo
      const palabras = b.texto.split(' ');
      let lineas = [], linea = '';
      const maxW = b.ancho - 20;
      palabras.forEach(p => {
        const t = linea + p + ' ';
        if (ctx.measureText(t).width > maxW && linea) { lineas.push(linea.trim()); linea = p + ' '; }
        else linea = t;
      });
      if (linea) lineas.push(linea.trim());
      lineas.forEach((l, i) => ctx.fillText(l, 0, (i - (lineas.length - 1) / 2) * 20));

      ctx.restore();
    });

    // ── ESPADAS DE PLASMA VIVIENTE ──────────────────────────
    // Renderizar ANTES del trail para que el trail quede encima
    const SABLES = [
      { trail: s.trailL, color: s.colorTema,  colorInner: '#FFFFFF', lado: 'L' },
      { trail: s.trailR, color: '#FF00FF',     colorInner: '#FFD0FF', lado: 'R' },
    ];

    SABLES.forEach(({ trail, color, colorInner }) => {
      if (trail.length < 2) return;

      const tip  = trail[trail.length - 1]; // punta del sable (más reciente)
      const base = trail[0];                // base del sable (más antigua)

      // ── 1. AURA EXTERIOR — capa más gruesa y difusa ──
      for (let i = 1; i < trail.length; i++) {
        const t = i / trail.length;
        ctx.save();
        ctx.globalAlpha = t * 0.25;
        ctx.strokeStyle = color;
        ctx.lineWidth   = t * 38;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.shadowBlur  = 40; ctx.shadowColor = color;
        ctx.filter      = `blur(${Math.round((1-t)*6)}px)`;
        ctx.beginPath();
        ctx.moveTo(trail[i-1].x, trail[i-1].y);
        ctx.lineTo(trail[i].x,   trail[i].y);
        ctx.stroke();
        ctx.restore();
      }

      // ── 2. CUERPO PRINCIPAL — gradiente de energía ──
      for (let i = 1; i < trail.length; i++) {
        const t = i / trail.length;
        ctx.save();
        ctx.globalAlpha = t * 0.85;
        ctx.strokeStyle = color;
        ctx.lineWidth   = t * 16;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.shadowBlur  = 25; ctx.shadowColor = color;
        ctx.beginPath();
        ctx.moveTo(trail[i-1].x, trail[i-1].y);
        ctx.lineTo(trail[i].x,   trail[i].y);
        ctx.stroke();
        ctx.restore();
      }

      // ── 3. NÚCLEO BLANCO — filo de energía pura ──
      for (let i = 1; i < trail.length; i++) {
        const t = i / trail.length;
        ctx.save();
        ctx.globalAlpha = t * 0.95;
        ctx.strokeStyle = colorInner;
        ctx.lineWidth   = t * 5;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.shadowBlur  = 8; ctx.shadowColor = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(trail[i-1].x, trail[i-1].y);
        ctx.lineTo(trail[i].x,   trail[i].y);
        ctx.stroke();
        ctx.restore();
      }

      // ── 4. DESTELLO EN LA PUNTA ──
      if (tip) {
        const pulso = 0.7 + Math.sin(s.tick * 0.3) * 0.3;
        ctx.save();
        ctx.globalAlpha = pulso;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, Math.max(0.5, 10 * pulso), 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 14 * pulso);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.4, color);
        grad.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle  = grad;
        ctx.shadowBlur = 20; ctx.shadowColor = color;
        ctx.fill();
        ctx.restore();

        // Cruz de destello en la punta
        ctx.save();
        ctx.globalAlpha = pulso * 0.8;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth   = 2;
        ctx.shadowBlur  = 12; ctx.shadowColor = color;
        const sz = 14 * pulso;
        ctx.beginPath();
        ctx.moveTo(tip.x - sz, tip.y); ctx.lineTo(tip.x + sz, tip.y);
        ctx.moveTo(tip.x, tip.y - sz); ctx.lineTo(tip.x, tip.y + sz);
        ctx.stroke();
        ctx.restore();
      }

      // ── 5. PARTÍCULAS DE PLASMA emanando del sable ──
      if (tip && trail.length > 3 && !s._plasmaParticulas) s._plasmaParticulas = { L: [], R: [] };
      if (tip && s._plasmaParticulas) {
        const key = trail === s.trailL ? 'L' : 'R';
        const pool = s._plasmaParticulas[key];

        // Emitir partículas desde posiciones aleatorias del trail
        if (s.tick % 2 === 0 && trail.length > 4) {
          const idx = Math.floor(Math.random() * trail.length);
          const src = trail[idx];
          pool.push({
            x: src.x + (Math.random()-0.5)*8,
            y: src.y + (Math.random()-0.5)*8,
            vx: (Math.random()-0.5)*2.5,
            vy: (Math.random()-0.5)*2.5 - 1,
            vida: 12 + Math.random()*10,
            vidaMax: 22,
            size: 1.5 + Math.random()*3,
          });
        }

        // Renderizar y actualizar partículas
        for (let i = pool.length-1; i >= 0; i--) {
          const p = pool[i];
          p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.vida--;
          if (p.vida <= 0) { pool.splice(i,1); continue; }
          const a = Math.max(0, p.vida / p.vidaMax);
          const r = Math.max(0.1, p.size * a);
          ctx.save();
          ctx.globalAlpha = a * 0.9;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI*2);
          const pg = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,r*2);
          pg.addColorStop(0, '#FFFFFF');
          pg.addColorStop(0.5, color);
          pg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle  = pg;
          ctx.shadowBlur = 8; ctx.shadowColor = color;
          ctx.fill();
          ctx.restore();
        }
        // Limitar pool
        if (pool.length > 60) pool.splice(0, pool.length-60);
      }
    });

    // ── Flashes de corte ──
    s.cortesActivos.forEach(c => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angulo);
      ctx.globalAlpha  = c.vida / 18;
      ctx.strokeStyle  = c.color;
      ctx.lineWidth    = 6;
      ctx.shadowBlur   = 30; ctx.shadowColor = c.color;
      ctx.beginPath();
      ctx.moveTo(-80, 0); ctx.lineTo(80, 0);
      ctx.stroke();
      // Destellos perpendiculares
      ctx.lineWidth = 3;
      [-25, 0, 25].forEach(offset => {
        ctx.beginPath();
        ctx.moveTo(offset, -18); ctx.lineTo(offset, 18);
        ctx.stroke();
      });
      ctx.restore();
    });
  },

  // ── Orbes de plasma en muñecas — siempre visibles ──────
  renderBrazos(ctx, landmarks, canvasW, canvasH) {
    const s = this._state;
    if (!s || !landmarks) return;

    const ex = n => (1 - n.x) * canvasW;
    const ey = n => n.y * canvasH;

    const BRAZOS = [
      { lm: landmarks[15], color: s.colorTema,  prevKey: 'L' },
      { lm: landmarks[16], color: '#FF00FF',     prevKey: 'R' },
    ];

    BRAZOS.forEach(({ lm, color }) => {
      if (!lm) return;
      const mx = ex(lm), my = ey(lm);
      const pulso = 0.75 + Math.sin(s.tick * 0.12) * 0.25;
      const radio = 20 * pulso;

      // Aura exterior difusa
      ctx.save();
      ctx.globalAlpha = 0.25 * pulso;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(0.5, radio * 2.2), 0, Math.PI * 2);
      const aura = ctx.createRadialGradient(mx, my, 0, mx, my, radio * 2.2);
      aura.addColorStop(0, color);
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle  = aura;
      ctx.shadowBlur = 30; ctx.shadowColor = color;
      ctx.fill();
      ctx.restore();

      // Orbe central pulsante
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(0.5, radio), 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(mx, my, 0, mx, my, radio);
      grad.addColorStop(0,   '#FFFFFF');
      grad.addColorStop(0.35, color);
      grad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle  = grad;
      ctx.shadowBlur = 20; ctx.shadowColor = color;
      ctx.fill();
      ctx.restore();

      // Anillo de energía rotante
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(s.tick * 0.05);
      ctx.globalAlpha = 0.6 * pulso;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 12; ctx.shadowColor = color;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0.5, radio * 1.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });
  },

  getState() { return this._state; },
};