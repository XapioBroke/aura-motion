// ============================================================
//  KAME-HAME-HA GAME  v4 — MECÁNICA CORRECTA (ESTILO GOKU)
//  ✅ Manos SIEMPRE juntas (no se separan)
//  ✅ Disparo al EXTENDER brazos (ángulo > 145°)
//  ✅ Dirección: hacia donde apuntan los brazos extendidos
//  ✅ Energía intensa tipo anime
//  ✅ Rayo grueso y poderoso
//
//  FASE 1 — CARGA
//    Muñecas juntas → orbe crece, energía intensa
//    Aura de energía envuelve el cuerpo completo
//
//  FASE 2 — DISPARO (carga ≥ 50%)
//    Manos juntas + brazos extendidos → ¡KAME-HAME-HA!
//    Puede dispararse en CUALQUIER dirección
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

const DIF_MAP = {
  facil:   { tiempoCarga: 2.5, puntosCorrecto: 25, puntosError: -5,  angExtension: 140, velRayo: 22 },
  medio:   { tiempoCarga: 2.0, puntosCorrecto: 35, puntosError: -10, angExtension: 145, velRayo: 28 },
  dificil: { tiempoCarga: 1.5, puntosCorrecto: 50, puntosError: -15, angExtension: 150, velRayo: 35 },
};

// ── Audio Kame-Hame-Ha ────────────────────────────────────
const _kameSFX = (() => {
  let ctx = null;
  const _ctx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  let _cargaOsc = null;
  let _cargaGain = null;

  return {
    iniciarCarga() {
      try {
        const c = _ctx(), t = c.currentTime;
        _cargaOsc  = c.createOscillator();
        _cargaGain = c.createGain();
        _cargaOsc.type = 'sine';
        _cargaOsc.frequency.setValueAtTime(90, t);
        _cargaOsc.frequency.linearRampToValueAtTime(320, t + 2.8);
        _cargaGain.gain.setValueAtTime(0, t);
        _cargaGain.gain.linearRampToValueAtTime(0.18, t + 0.4);
        _cargaOsc.connect(_cargaGain);
        _cargaGain.connect(c.destination);
        _cargaOsc.start(t);
      } catch(_) {}
    },
    detenerCarga() {
      try {
        if (_cargaGain) {
          _cargaGain.gain.linearRampToValueAtTime(0, _ctx().currentTime + 0.15);
          setTimeout(() => { try { _cargaOsc?.stop(); } catch(_){} _cargaOsc = null; _cargaGain = null; }, 200);
        }
      } catch(_) {}
    },
    disparar() {
      try {
        const c = _ctx(), t = c.currentTime;
        const osc1 = c.createOscillator();
        const osc2 = c.createOscillator();
        const gain = c.createGain();
        osc1.type = 'sawtooth'; osc1.frequency.setValueAtTime(120, t); osc1.frequency.exponentialRampToValueAtTime(35, t+0.8);
        osc2.type = 'sine';     osc2.frequency.setValueAtTime(280, t); osc2.frequency.exponentialRampToValueAtTime(55, t+0.8);
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
        osc1.connect(gain); osc2.connect(gain); gain.connect(c.destination);
        osc1.start(t); osc1.stop(t + 0.9);
        osc2.start(t); osc2.stop(t + 0.9);
      } catch(_) {}
    },
    impacto(correcto) {
      try {
        const c = _ctx(), t = c.currentTime;
        if (correcto) {
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = 'sine'; osc.frequency.setValueAtTime(440, t); osc.frequency.exponentialRampToValueAtTime(880, t+0.1); osc.frequency.exponentialRampToValueAtTime(220, t+0.5);
          gain.gain.setValueAtTime(0.4, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.5);
          osc.connect(gain); gain.connect(c.destination); osc.start(t); osc.stop(t+0.55);
        }
        const buf = c.createBuffer(1, c.sampleRate * 0.35, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random()*2-1) * Math.exp(-i/5000);
        const src = c.createBufferSource();
        const gain2 = c.createGain();
        src.buffer = buf;
        gain2.gain.setValueAtTime(correcto ? 0.35 : 0.2, t);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        src.connect(gain2); gain2.connect(c.destination); src.start(t);
      } catch(_) {}
    },
  };
})();

// ── Helper geométrico ─────────────────────────────────────
const _angulo3pts = (a, m, b) => {
  const dx1 = a.x - m.x, dy1 = a.y - m.y;
  const dx2 = b.x - m.x, dy2 = b.y - m.y;
  const dot  = dx1*dx2 + dy1*dy2;
  const mag  = Math.hypot(dx1,dy1) * Math.hypot(dx2,dy2);
  if (mag < 0.0001) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot/mag))) * (180/Math.PI);
};

// ═══════════════════════════════════════════════════════════
export const KameGame = {
  _state: null,
  _screenShake: 0,
  _shakeAmt:    0,

  init(materia, colorTema, config = {}) {
    const dif = config.dificultad || 'medio';
    const tamMult = config.tamanoObjetivos ?? 1.0;
    const d = DIF_MAP[dif] || DIF_MAP.medio;
    const reto = generarReto(materia);

    this._screenShake = 0;
    this._shakeAmt    = 0;

    this._state = {
      materia, colorTema,
      pregunta:  reto.pregunta,
      esferas:   [],
      tick:      0,

      fase:         'espera',
      cargaTick:    0,
      cargaMax:     d.tiempoCarga * 60,
      cooldownTick: 0,

      rayo: null,
      particulas: [],
      aurasLandmarks: null,

      radioEsfera:    62 * tamMult,
      puntosCorrecto: d.puntosCorrecto,
      puntosError:    d.puntosError,
      umbralManos:    0.17,      // Distancia para considerar manos "juntas"
      angExtension:   d.angExtension, // Ángulo mínimo para considerar brazo "extendido"
      velRayo:        d.velRayo,
    };

    this._spawnEsferas(reto.opciones);
    return this._state;
  },

  _spawnEsferas(opciones) {
    const s = this._state;
    const correcta    = opciones.find(o => o.esCorrecto);
    const incorrectas = opciones.filter(o => !o.esCorrecto)
      .sort(() => Math.random()-0.5)
      .slice(0, 2);
    while (incorrectas.length < 2) incorrectas.push({ texto:'???', esCorrecto:false });

    const tres = [correcta || { texto:'???', esCorrecto:true }, ...incorrectas]
      .sort(() => Math.random()-0.5);

    const POS = [
      { x:0.20, y:0.35 },
      { x:0.50, y:0.27 },
      { x:0.80, y:0.35 },
    ];

    s.esferas = tres.map((opc, i) => ({
      x:          POS[i].x,
      y:          POS[i].y,
      baseY:      POS[i].y,
      fase:       Math.random() * Math.PI * 2,
      radio:      s.radioEsfera,
      texto:      opc.texto,
      esCorrecto: opc.esCorrecto,
      destruida:  false,
      destroyTick:0,
    }));
  },

  _nuevaRonda() {
    const s = this._state;
    const reto = generarReto(s.materia);
    s.pregunta = reto.pregunta;
    s.fase = 'espera';
    s.cargaTick = 0;
    s.rayo = null;
    s.cooldownTick = 0;
    this._spawnEsferas(reto.opciones);
    _kameSFX.detenerCarga();
  },

  _emitirExplosion(cx, cy, color, cantidad = 24) {
    const s = this._state;
    for (let i = 0; i < cantidad; i++) {
      const ang = (i / cantidad) * Math.PI * 2 + Math.random() * 0.5;
      const sp  = 3 + Math.random() * 8;
      s.particulas.push({
        x: cx, y: cy,
        vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp - 2,
        vida: 35 + Math.random()*25, vidaMax: 60,
        color, size: 3 + Math.random()*6,
      });
    }
    s.particulas.push({ tipo:'onda', x:cx, y:cy, radio:8, maxRadio:120, vida:20, vidaMax:20, color });
  },

  _iniciarScreenShake(intensidad) {
    this._screenShake = 18;
    this._shakeAmt    = intensidad;
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;
    s.tick++;

    if (this._screenShake > 0) this._screenShake--;

    s.particulas = s.particulas.filter(p => p.vida > 0);
    s.particulas.forEach(p => {
      if (p.tipo === 'onda') { p.radio += (p.maxRadio - p.radio) * 0.15; p.vida--; return; }
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.12; p.vx *= 0.93;
      p.vida--;
    });

    s.esferas.forEach(e => {
      if (!e.destruida) e.y = e.baseY + Math.sin(s.tick*0.025 + e.fase) * 0.018;
      else e.destroyTick++;
    });
    s.esferas = s.esferas.filter(e => !e.destruida || e.destroyTick < 45);

    let resultado = null;
    if (s.rayo) {
      const r = s.rayo;

      if (r.rastro.length === 0 || Math.hypot(r.cabezaX - r.rastro[r.rastro.length-1].x, r.cabezaY - r.rastro[r.rastro.length-1].y) > 8) {
        r.rastro.push({ x: r.cabezaX, y: r.cabezaY, alpha: 1 });
      }
      r.rastro.forEach(p => { p.alpha -= 0.04; });
      r.rastro = r.rastro.filter(p => p.alpha > 0);

      r.cabezaX += r.dx * r.vel;
      r.cabezaY += r.dy * r.vel;
      r.vida--;

      let impacto = null;
      let distMin = Infinity;
      s.esferas.forEach(e => {
        if (e.destruida) return;
        const ex = e.x * canvasW, ey = e.y * canvasH;
        const dist = Math.hypot(r.cabezaX - ex, r.cabezaY - ey);
        if (dist < e.radio + 20 && dist < distMin) {
          distMin = dist;
          impacto = e;
        }
      });

      if (impacto) {
        const ix = impacto.x * canvasW, iy = impacto.y * canvasH;
        impacto.destruida = true;

        if (impacto.esCorrecto) {
          resultado = { acierto:true, fallo:false, puntos: s.puntosCorrecto };
          this._emitirExplosion(ix, iy, '#00FF41', 35);
          this._emitirExplosion(ix, iy, '#FFFFFF', 15);
          this._iniciarScreenShake(12);
          _kameSFX.impacto(true);
          SFX.acierto?.();
          s.rayo = null;
          s.fase = 'cooldown';
          s.cooldownTick = 0;
        } else {
          resultado = { acierto:false, fallo:true, puntos: s.puntosError };
          this._emitirExplosion(ix, iy, '#FF4444', 25);
          this._emitirExplosion(ix, iy, '#FF8800', 12);
          this._iniciarScreenShake(7);
          _kameSFX.impacto(false);
          SFX.error?.();
          s.rayo = null;
          s.fase = 'cooldown';
          s.cooldownTick = 0;
        }
      } else if (r.vida <= 0 || r.cabezaX < -80 || r.cabezaX > canvasW+80 || r.cabezaY < -80 || r.cabezaY > canvasH+80) {
        s.rayo = null;
        s.fase = 'espera';
        s.cargaTick = 0;
      }
    }

    if (s.fase === 'cooldown') {
      s.cooldownTick++;
      if (s.cooldownTick > 55) this._nuevaRonda();
    }

    if (!landmarks) return resultado;

    const ex2 = n => (1 - n.x) * canvasW;
    const ey2 = n => n.y * canvasH;

    const munL  = landmarks[15], munR  = landmarks[16];
    const codL  = landmarks[13], codR  = landmarks[14];
    const homL  = landmarks[11], homR  = landmarks[12];

    s.aurasLandmarks = landmarks;

    if (!munL || !munR) return resultado;

    const mlx = ex2(munL), mly = ey2(munL);
    const mrx = ex2(munR), mry = ey2(munR);

    // Distancia normalizada entre muñecas
    const distManos = Math.hypot(mlx-mrx, mly-mry) / canvasW;
    const manosJuntas = distManos < s.umbralManos;

    // ✅ Ángulos de extensión de cada brazo
    let angBrazoL = 0, angBrazoR = 0;
    if (codL && homL) angBrazoL = _angulo3pts({x:ex2(homL),y:ey2(homL)}, {x:ex2(codL),y:ey2(codL)}, {x:mlx,y:mly});
    if (codR && homR) angBrazoR = _angulo3pts({x:ex2(homR),y:ey2(homR)}, {x:ex2(codR),y:ey2(codR)}, {x:mrx,y:mry});
    
    // ✅ Brazos extendidos = AMBOS ángulos > umbral
    const brazosExtendidos = angBrazoL > s.angExtension && angBrazoR > s.angExtension;

    // ── Máquina de estados ──
    if (s.fase === 'espera') {
      if (manosJuntas) {
        s.fase = 'cargando';
        s.cargaTick = 0;
        _kameSFX.iniciarCarga();
      }

    } else if (s.fase === 'cargando') {
      if (!manosJuntas && s.cargaTick < s.cargaMax * 0.25) {
        // Soltó manos muy pronto — cancelar
        s.fase = 'espera';
        s.cargaTick = 0;
        _kameSFX.detenerCarga();
      } else {
        s.cargaTick = Math.min(s.cargaTick + 1, s.cargaMax);
        const cargaSuficiente = s.cargaTick >= s.cargaMax * 0.5;

        // ✅ DISPARO CORRECTO: Manos juntas + brazos extendidos
        if (cargaSuficiente && manosJuntas && brazosExtendidos) {
          // Dirección = promedio de vectores de ambos antebrazos
          const dirLx = mlx - (codL ? ex2(codL) : mrx);
          const dirLy = mly - (codL ? ey2(codL) : mry);
          const dirRx = mrx - (codR ? ex2(codR) : mlx);
          const dirRy = mry - (codR ? ey2(codR) : mly);

          let dx = (dirLx + dirRx) / 2;
          let dy = (dirLy + dirRy) / 2;
          const mag = Math.hypot(dx, dy);
          if (mag < 0.001) { dx = 1; dy = 0; } else { dx /= mag; dy /= mag; }

          // Origen del rayo = punto medio entre las manos
          const ox = (mlx + mrx) / 2;
          const oy = (mly + mry) / 2;

          s.rayo = {
            ox, oy, dx, dy,
            cabezaX: ox, cabezaY: oy,
            vel:     s.velRayo,
            vida:    80, vidaMax: 80,
            rastro:  [],
            pct:     s.cargaTick / s.cargaMax,
          };
          s.fase = 'disparando';
          s.cargaTick = 0;
          _kameSFX.detenerCarga();
          _kameSFX.disparar();
        }
      }

    } else if (s.fase === 'disparando') {
      // El rayo ya está volando
    }

    return resultado;
  },

  // ─── RENDER PRINCIPAL ────────────────────────────────────
  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    let shakeX = 0, shakeY = 0;
    if (this._screenShake > 0) {
      const mag = this._shakeAmt * (this._screenShake / 18);
      shakeX = (Math.random()-0.5) * mag;
      shakeY = (Math.random()-0.5) * mag;
      ctx.save();
      ctx.translate(shakeX, shakeY);
    }

    if ((s.fase === 'cargando') && s.aurasLandmarks) {
      const pct = Math.min(1, s.cargaTick / s.cargaMax);
      this._renderAuraCuerpo(ctx, s.aurasLandmarks, canvasW, canvasH, pct, s.colorTema);
    }

    // ── Pregunta ──
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(canvasW*0.05, 14, canvasW*0.90, 106, 12);
    else ctx.rect(canvasW*0.05, 14, canvasW*0.90, 106);
    ctx.fill();

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `bold 40px Orbitron, sans-serif`;
    ctx.fillStyle = '#FFFFFF'; ctx.shadowBlur = 16; ctx.shadowColor = s.colorTema;
    ctx.fillText(s.pregunta, canvasW/2, 68);

    ctx.font = `18px Rajdhani, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.shadowBlur = 0;
    const instruccion =
      s.fase === 'espera'      ? '🔵 Une las manos para cargar la energía' :
      s.fase === 'cargando'    ? (s.cargaTick >= s.cargaMax*0.5 ? '⚡ ¡Listo! Extiende los brazos para disparar' : '🌀 Cargando... mantén las manos juntas') :
      s.fase === 'disparando'  ? '' :
      s.fase === 'cooldown'    ? '💥 ¡Impacto!' : '';
    if (instruccion) ctx.fillText(instruccion, canvasW/2, 100);
    ctx.restore();

    // ✅ ESFERAS CON COLOR NEUTRO
    s.esferas.forEach(e => {
      const bx = e.x * canvasW, by = e.y * canvasH;

      if (e.destruida) {
        const alpha = Math.max(0, 1 - e.destroyTick / 30);
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(bx, by, e.radio*(1+e.destroyTick*0.07), 0, Math.PI*2);
        ctx.strokeStyle = e.esCorrecto ? '#00FF41' : '#FF4444';
        ctx.lineWidth = 4; ctx.shadowBlur = 30; ctx.shadowColor = ctx.strokeStyle;
        ctx.stroke(); ctx.restore();
        return;
      }

      const pulso = 1 + Math.sin(s.tick*0.06+e.fase)*0.06;
      const color = '#9966FF'; // Color neutro para TODAS
      const r = Math.max(1, e.radio * pulso);

      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.arc(bx, by, r*1.6, 0, Math.PI*2);
      const aura = ctx.createRadialGradient(bx,by,0,bx,by,r*1.6);
      aura.addColorStop(0, color); aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aura; ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath(); ctx.arc(bx,by,r,0,Math.PI*2);
      const g = ctx.createRadialGradient(bx-r*0.28,by-r*0.28,0,bx,by,r);
      g.addColorStop(0, 'rgba(255,255,255,0.65)');
      g.addColorStop(0.35, color+'CC');
      g.addColorStop(1,   color+'33');
      ctx.fillStyle = g; ctx.shadowBlur = 20; ctx.shadowColor = color; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(bx,by); ctx.rotate(s.tick*0.04);
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1.5;
      ctx.setLineDash([5,7]); ctx.shadowBlur = 6; ctx.shadowColor = '#FFF';
      ctx.beginPath(); ctx.arc(0,0,r*0.62,0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();

      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font=`bold 19px Orbitron, sans-serif`;
      ctx.fillStyle='#FFF'; ctx.shadowBlur=10; ctx.shadowColor=color;
      const maxW = e.radio * 1.6;
      const palabras = e.texto.split(' ');
      let lineas=[], linea='';
      palabras.forEach(p => {
        const t2 = linea+p+' ';
        if (ctx.measureText(t2).width > maxW && linea) { lineas.push(linea.trim()); linea=p+' '; }
        else linea=t2;
      });
      if (linea) lineas.push(linea.trim());
      lineas.forEach((l,i) => ctx.fillText(l, bx, by+(i-(lineas.length-1)/2)*22));
      ctx.restore();
    });

    if (s.rayo) this._renderRayo(ctx, s.rayo, s.tick, s.colorTema);

    s.particulas.forEach(p => {
      if (p.tipo === 'onda') {
        const alpha = Math.max(0, p.vida/p.vidaMax);
        ctx.save();
        ctx.globalAlpha = alpha * 0.7;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.radio), 0, Math.PI*2);
        ctx.strokeStyle = p.color; ctx.lineWidth = 3*(1-p.radio/p.maxRadio)+1;
        ctx.shadowBlur = 20; ctx.shadowColor = p.color; ctx.stroke();
        ctx.restore();
        return;
      }
      const alpha = Math.max(0, p.vida/p.vidaMax);
      const r = Math.max(0.2, p.size*alpha);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2);
      ctx.fillStyle = p.color; ctx.shadowBlur=8; ctx.shadowColor=p.color; ctx.fill();
      ctx.restore();
    });

    if (this._screenShake > 0) ctx.restore();
  },

  // ✅ RAYO MÁS GRUESO
  _renderRayo(ctx, r, tick, colorTema) {
    const ox = r.ox, oy = r.oy;
    const cx = r.cabezaX, cy = r.cabezaY;
    const alpha = Math.min(1, r.vida / r.vidaMax);

    r.rastro.forEach((pt, i) => {
      if (i === 0) return;
      const prev = r.rastro[i-1];
      ctx.save();
      ctx.globalAlpha = pt.alpha * 0.55 * alpha;
      ctx.strokeStyle = '#00AAFF';
      ctx.lineWidth   = 10 * pt.alpha;
      ctx.lineCap     = 'round';
      ctx.shadowBlur  = 20; ctx.shadowColor = '#00AAFF';
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
      ctx.restore();
    });

    const len = Math.hypot(cx-ox, cy-oy);
    if (len > 5) {
      const rayGrad = ctx.createLinearGradient(ox,oy,cx,cy);
      rayGrad.addColorStop(0,   'rgba(0,180,255,0)');
      rayGrad.addColorStop(0.3, '#00AAFF');
      rayGrad.addColorStop(0.8, '#AAEEFF');
      rayGrad.addColorStop(1,   '#FFFFFF');

      ctx.save();
      ctx.globalAlpha = alpha * 0.4;
      ctx.strokeStyle = '#00AAFF';
      ctx.lineWidth   = 45;
      ctx.lineCap     = 'round';
      ctx.shadowBlur  = 50; ctx.shadowColor = '#00AAFF';
      ctx.beginPath(); ctx.moveTo(ox,oy); ctx.lineTo(cx,cy); ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = rayGrad;
      ctx.lineWidth   = 24;
      ctx.lineCap     = 'round';
      ctx.shadowBlur  = 30; ctx.shadowColor = '#00CCFF';
      ctx.beginPath(); ctx.moveTo(ox,oy); ctx.lineTo(cx,cy); ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth   = 8;
      ctx.lineCap     = 'round';
      ctx.shadowBlur  = 18; ctx.shadowColor = '#FFFFFF';
      ctx.beginPath(); ctx.moveTo(ox,oy); ctx.lineTo(cx,cy); ctx.stroke();
      ctx.restore();

      const N_DISTORSION = 8;
      for (let i = 0; i < N_DISTORSION; i++) {
        const t = (i+1) / (N_DISTORSION+1);
        const px = ox + (cx-ox)*t;
        const py = oy + (cy-oy)*t;
        const perpX = -(cy-oy)/len, perpY = (cx-ox)/len;
        const amp  = 12 + Math.sin(tick*0.3 + i*1.3)*8;
        ctx.save();
        ctx.globalAlpha = alpha * 0.35;
        ctx.strokeStyle = '#88DDFF';
        ctx.lineWidth   = 3;
        ctx.shadowBlur  = 12; ctx.shadowColor = '#00AAFF';
        ctx.beginPath();
        ctx.moveTo(px + perpX*(amp),  py + perpY*(amp));
        ctx.lineTo(px - perpX*(amp), py - perpY*(amp));
        ctx.stroke();
        ctx.restore();
      }
    }

    const headR = 28 + (r.pct ?? 1) * 18;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, headR), 0, Math.PI*2);
    const hg = ctx.createRadialGradient(cx,cy,0,cx,cy,headR);
    hg.addColorStop(0,   '#FFFFFF');
    hg.addColorStop(0.3, '#88EEFF');
    hg.addColorStop(0.7, '#0044FF88');
    hg.addColorStop(1,   'rgba(0,0,100,0)');
    ctx.fillStyle  = hg;
    ctx.shadowBlur = 60; ctx.shadowColor = '#00AAFF';
    ctx.fill();
    ctx.restore();

    const pulsoR = headR * (1.5 + Math.sin(tick*0.25)*0.25);
    ctx.save();
    ctx.globalAlpha = alpha * 0.6;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1,pulsoR), 0, Math.PI*2);
    ctx.strokeStyle = '#00AAFF'; ctx.lineWidth = 3;
    ctx.shadowBlur  = 20; ctx.shadowColor = '#00AAFF';
    ctx.stroke(); ctx.restore();
  },

  _renderAuraCuerpo(ctx, lm, canvasW, canvasH, pct, colorTema) {
    const ex = n => (1-n.x)*canvasW;
    const ey = n =>  n.y *canvasH;

    const BONES = [
      [11,12],[11,23],[12,24],[23,24],
      [11,13],[13,15],[12,14],[14,16],
      [23,25],[25,27],[24,26],[26,28],
    ];

    ctx.save();
    ctx.globalAlpha = 0.25 + pct * 0.35;
    ctx.strokeStyle = '#00AAFF';
    ctx.lineWidth   = 8 + pct * 16;
    ctx.lineCap     = 'round';
    ctx.shadowBlur  = 25 + pct * 35; ctx.shadowColor = '#00AAFF';
    BONES.forEach(([a,b]) => {
      if (!lm[a]||!lm[b]) return;
      ctx.beginPath();
      ctx.moveTo(ex(lm[a]),ey(lm[a]));
      ctx.lineTo(ex(lm[b]),ey(lm[b]));
      ctx.stroke();
    });
    ctx.restore();

    [11,12,13,14,15,16,23,24,25,26].forEach((i,idx) => {
      if (!lm[i]) return;
      const px = ex(lm[i]), py = ey(lm[i]);
      const pulso = 0.7 + Math.sin(this._state.tick*0.12+idx)*0.3;
      const r = (5 + pct*12) * pulso;
      ctx.save();
      ctx.globalAlpha = 0.5 + pct*0.4;
      ctx.beginPath(); ctx.arc(px,py,Math.max(1,r),0,Math.PI*2);
      ctx.fillStyle  = '#00CCFF';
      ctx.shadowBlur = 20; ctx.shadowColor = '#00AAFF';
      ctx.fill(); ctx.restore();
    });

    if (pct >= 0.4 && this._state.tick % 4 === 0) {
      const bones2 = [[11,23],[12,24],[11,12],[15,16]];
      const [a,b] = bones2[Math.floor(Math.random()*bones2.length)];
      if (lm[a]&&lm[b]) {
        const t2 = Math.random();
        const px = ex(lm[a])*(1-t2) + ex(lm[b])*t2 + (Math.random()-0.5)*30;
        const py = ey(lm[a])*(1-t2) + ey(lm[b])*t2 + (Math.random()-0.5)*30;
        this._state.particulas.push({
          x:px, y:py,
          vx:(Math.random()-0.5)*1.5, vy:-1.5-Math.random()*2,
          vida:20+Math.random()*15, vidaMax:35,
          color:'#00AAFF', size:3+Math.random()*4,
        });
      }
    }
  },

  // ✅ ENERGÍA EN MANOS - ESTILO ELÉCTRICO (como el rayo)
  renderBrazos(ctx, landmarks, canvasW, canvasH) {
    const s = this._state;
    if (!s || !landmarks) return;

    const ex = n => (1-n.x)*canvasW;
    const ey = n =>  n.y *canvasH;

    const munL = landmarks[15], munR = landmarks[16];
    if (!munL || !munR) return;

    const mlx=ex(munL), mly=ey(munL);
    const mrx=ex(munR), mry=ey(munR);
    const centroX=(mlx+mrx)/2, centroY=(mly+mry)/2;
    const pct = Math.min(1, s.cargaTick / s.cargaMax);

    // ✅ ENERGÍA EN MUÑECAS - ESTILO RAYO ELÉCTRICO
    [[mlx,mly],[mrx,mry]].forEach(([mx,my]) => {
      const pulso = 0.85 + Math.sin(s.tick*0.2)*0.15;
      const baseR = s.fase==='cargando' ? 20+pct*25 : 16;
      const r = Math.max(1, baseR * pulso);

      // Capa 1: Aura exterior brillante (estilo rayo)
      ctx.save();
      ctx.globalAlpha = 0.4 * pct;
      ctx.beginPath(); ctx.arc(mx, my, r*2.2, 0, Math.PI*2);
      ctx.fillStyle = '#00AAFF';
      ctx.shadowBlur = 50 + pct*30;
      ctx.shadowColor = '#00AAFF';
      ctx.fill();
      ctx.restore();

      // Capa 2: Cuerpo medio con gradiente (estilo rayo)
      ctx.save();
      ctx.globalAlpha = 0.7 * pct;
      ctx.beginPath(); ctx.arc(mx, my, r*1.4, 0, Math.PI*2);
      const cuerpo = ctx.createRadialGradient(mx, my, 0, mx, my, r*1.4);
      cuerpo.addColorStop(0, '#FFFFFF');
      cuerpo.addColorStop(0.4, '#00DDFF');
      cuerpo.addColorStop(1, '#0044FF88');
      ctx.fillStyle = cuerpo;
      ctx.shadowBlur = 35 + pct*25;
      ctx.shadowColor = '#00CCFF';
      ctx.fill();
      ctx.restore();

      // Capa 3: Núcleo blanco brillante (estilo rayo)
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(mx, my, r*0.6, 0, Math.PI*2);
      const nucleo = ctx.createRadialGradient(mx, my, 0, mx, my, r*0.6);
      nucleo.addColorStop(0, '#FFFFFF');
      nucleo.addColorStop(0.6, '#88EEFF');
      nucleo.addColorStop(1, '#00AAFF');
      ctx.fillStyle = nucleo;
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#FFFFFF';
      ctx.fill();
      ctx.restore();

      // ✅ ONDAS DE DISTORSIÓN RADIALES (como el rayo pero en círculo)
      if (s.fase === 'cargando') {
        const nDistorsion = 8;
        for (let i=0; i<nDistorsion; i++) {
          const angBase = (i/nDistorsion) * Math.PI * 2;
          const ang = angBase + s.tick*0.15;
          
          // Amplitud oscilante (simula electricidad)
          const amp = 8 + Math.sin(s.tick*0.3 + i*1.5) * 6;
          const distBase = r * 1.2;
          
          // Punto inicial (cerca del orbe)
          const x1 = mx + Math.cos(ang) * distBase;
          const y1 = my + Math.sin(ang) * distBase;
          
          // Punto final (más lejos, con distorsión)
          const x2 = mx + Math.cos(ang) * (distBase + amp);
          const y2 = my + Math.sin(ang) * (distBase + amp);
          
          ctx.save();
          ctx.globalAlpha = 0.4 * pct;
          ctx.strokeStyle = '#88DDFF';
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#00AAFF';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.restore();
        }

        // ✅ Relámpagos aleatorios (efecto eléctrico extra)
        if (s.tick % 3 === 0 && Math.random() > 0.7) {
          const angRandom = Math.random() * Math.PI * 2;
          const dist1 = r * 1.3;
          const dist2 = r * 1.8;
          const x1 = mx + Math.cos(angRandom) * dist1;
          const y1 = my + Math.sin(angRandom) * dist1;
          const x2 = mx + Math.cos(angRandom) * dist2;
          const y2 = my + Math.sin(angRandom) * dist2;
          
          ctx.save();
          ctx.globalAlpha = 0.8;
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#00FFFF';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.restore();
        }
      }
    });

    if (s.fase === 'cargando') {
      // ✅ HILO DE ENERGÍA ENTRE MANOS - ESTILO RAYO
      ctx.save();
      
      // Capa exterior (aura gruesa)
      ctx.globalAlpha = 0.4 * pct;
      ctx.strokeStyle = '#00AAFF';
      ctx.lineWidth = 8 + pct*16;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 40 + pct*30;
      ctx.shadowColor = '#00AAFF';
      ctx.beginPath();
      ctx.moveTo(mlx, mly);
      ctx.lineTo(mrx, mry);
      ctx.stroke();
      
      // Capa media (gradiente)
      ctx.globalAlpha = 0.7 * pct;
      const grd = ctx.createLinearGradient(mlx, mly, mrx, mry);
      grd.addColorStop(0, '#00AAFF');
      grd.addColorStop(0.5, '#FFFFFF');
      grd.addColorStop(1, '#00AAFF');
      ctx.strokeStyle = grd;
      ctx.lineWidth = 5 + pct*10;
      ctx.shadowBlur = 25 + pct*25;
      ctx.shadowColor = '#00CCFF';
      ctx.beginPath();
      ctx.moveTo(mlx, mly);
      ctx.lineTo(mrx, mry);
      ctx.stroke();
      
      // Núcleo blanco
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2 + pct*4;
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(mlx, mly);
      ctx.lineTo(mrx, mry);
      ctx.stroke();
      
      ctx.restore();
      
      // ✅ Ondas de distorsión perpendiculares al hilo (estilo rayo)
      const len = Math.hypot(mrx-mlx, mry-mly);
      if (len > 10) {
        const nOndas = 6;
        for (let i=0; i<nOndas; i++) {
          const t = (i+1) / (nOndas+1);
          const px = mlx + (mrx-mlx)*t;
          const py = mly + (mry-mly)*t;
          
          // Vector perpendicular
          const perpX = -(mry-mly)/len;
          const perpY = (mrx-mlx)/len;
          
          // Amplitud oscilante
          const amp = 10 + Math.sin(s.tick*0.3 + i*1.3) * 7;
          
          ctx.save();
          ctx.globalAlpha = 0.35 * pct;
          ctx.strokeStyle = '#88DDFF';
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#00AAFF';
          ctx.beginPath();
          ctx.moveTo(px + perpX*amp, py + perpY*amp);
          ctx.lineTo(px - perpX*amp, py - perpY*amp);
          ctx.stroke();
          ctx.restore();
        }
      }

      // ✅ ORBE CENTRAL - ESTILO RAYO ELÉCTRICO
      const orbeR = Math.max(1, 25 + pct*70);
      
      // Aura exterior brillante
      ctx.save();
      ctx.globalAlpha = 0.45 * pct;
      ctx.beginPath();
      ctx.arc(centroX, centroY, orbeR*1.8, 0, Math.PI*2);
      ctx.fillStyle = '#00AAFF';
      ctx.shadowBlur = 60 + pct*50;
      ctx.shadowColor = '#00AAFF';
      ctx.fill();
      ctx.restore();
      
      // Capa media con gradiente
      ctx.save();
      ctx.globalAlpha = 0.7 * pct;
      ctx.beginPath();
      ctx.arc(centroX, centroY, orbeR*1.2, 0, Math.PI*2);
      const ogMedio = ctx.createRadialGradient(centroX, centroY, 0, centroX, centroY, orbeR*1.2);
      ogMedio.addColorStop(0, '#FFFFFF');
      ogMedio.addColorStop(0.4, '#88EEFF');
      ogMedio.addColorStop(1, '#0044FF88');
      ctx.fillStyle = ogMedio;
      ctx.shadowBlur = 45 + pct*45;
      ctx.shadowColor = '#00CCFF';
      ctx.fill();
      ctx.restore();
      
      // Núcleo blanco brillante
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(centroX, centroY, orbeR*0.5, 0, Math.PI*2);
      const ogNucleo = ctx.createRadialGradient(centroX, centroY, 0, centroX, centroY, orbeR*0.5);
      ogNucleo.addColorStop(0, '#FFFFFF');
      ogNucleo.addColorStop(0.7, '#AAEEFF');
      ogNucleo.addColorStop(1, '#00AAFF');
      ctx.fillStyle = ogNucleo;
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#FFFFFF';
      ctx.fill();
      ctx.restore();

      // ✅ Ondas de distorsión radiales del orbe (estilo rayo)
      const nDistorsionOrbe = 12;
      for (let i=0; i<nDistorsionOrbe; i++) {
        const angBase = (i/nDistorsionOrbe) * Math.PI * 2;
        const ang = angBase + s.tick*0.12;
        
        const amp = 12 + Math.sin(s.tick*0.35 + i*1.2) * 9;
        const dist1 = orbeR * 1.1;
        const dist2 = orbeR * 1.1 + amp;
        
        const x1 = centroX + Math.cos(ang) * dist1;
        const y1 = centroY + Math.sin(ang) * dist1;
        const x2 = centroX + Math.cos(ang) * dist2;
        const y2 = centroY + Math.sin(ang) * dist2;
        
        ctx.save();
        ctx.globalAlpha = 0.4 * pct;
        ctx.strokeStyle = '#88DDFF';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00AAFF';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      }

      // ✅ Anillos eléctricos (reemplazan líneas punteadas)
      [0.7, 1.0, 1.3].forEach((esc, idx) => {
        const r2 = Math.max(1, orbeR*esc);
        const nSegmentos = 16;
        
        for (let i=0; i<nSegmentos; i++) {
          const ang1 = (i/nSegmentos) * Math.PI * 2 + s.tick*(0.05+idx*0.02)*(idx%2===0?1:-1);
          const ang2 = ang1 + (Math.PI*2)/(nSegmentos*1.8);
          
          ctx.save();
          ctx.globalAlpha = pct * 0.6;
          ctx.strokeStyle = '#00AAFF';
          ctx.lineWidth = 3;
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#00AAFF';
          ctx.beginPath();
          ctx.arc(centroX, centroY, r2, ang1, ang2);
          ctx.stroke();
          ctx.restore();
        }
      });

      // Barra de carga
      const bW=canvasW*0.42, bX=canvasW/2-bW/2, bY=canvasH*0.875;
      ctx.save();
      ctx.fillStyle='rgba(0,0,0,0.55)';
      if (ctx.roundRect) ctx.roundRect(bX-2,bY-2,bW+4,22,10);
      else ctx.rect(bX-2,bY-2,bW+4,22);
      ctx.fill();

      const barColor = pct>=1 ? '#FFD700' : '#00AAFF';
      ctx.fillStyle=barColor; ctx.shadowBlur=pct>=1?22:10; ctx.shadowColor=barColor;
      const relleno = Math.max(0, bW*pct);
      if (relleno > 0) {
        if (ctx.roundRect) ctx.roundRect(bX,bY,relleno,18,8);
        else ctx.rect(bX,bY,relleno,18);
        ctx.fill();
      }

      ctx.fillStyle='#FFF'; ctx.font=`bold 12px Orbitron, sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.shadowBlur=0;
      ctx.fillText(
        pct>=1 ? '⚡ ¡EXTIENDE LOS BRAZOS!' : `CARGANDO ${Math.round(pct*100)}%`,
        canvasW/2, bY+9
      );
      ctx.restore();

    } else if (s.fase === 'espera') {
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font=`bold 15px Orbitron, sans-serif`;
      ctx.fillStyle='rgba(0,180,255,0.65)';
      ctx.shadowBlur=8; ctx.shadowColor='#00AAFF';
      ctx.fillText('🔵 Une tus manos', centroX, centroY-55);
      ctx.restore();
    }
  },

  getState() { return this._state; },
};