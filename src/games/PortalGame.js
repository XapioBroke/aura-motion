// ============================================================
//  PORTAL GAME v1.0
//  CONTROL: Cuerpo completo — muévete hacia el portal correcto
//  VISUAL:  Portales dimensionales con distorsión, luz, partículas
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

const DIF_MAP = {
  facil:   { tiempoPortal: 320, spawnDelay: 90,  puntosCorrecto: 15, puntosError: -3,  maxPortales: 2 },
  medio:   { tiempoPortal: 220, spawnDelay: 70,  puntosCorrecto: 25, puntosError: -7,  maxPortales: 3 },
  dificil: { tiempoPortal: 150, spawnDelay: 50,  puntosCorrecto: 40, puntosError: -12, maxPortales: 4 },
};

// Paleta de colores por portal — cada uno tiene identidad visual única
const PORTAL_COLORES = [
  { inner: '#00FFFF', outer: '#0044FF', glow: '#00AAFF' },
  { inner: '#FF00FF', outer: '#8800FF', glow: '#CC00FF' },
  { inner: '#00FF88', outer: '#006633', glow: '#00FF44' },
  { inner: '#FF6600', outer: '#FF0000', glow: '#FF3300' },
];

// Posiciones fijas para portales — distribuidas en la pantalla
const POSICIONES = [
  { x: 0.18, y: 0.45 }, // izquierda centro
  { x: 0.82, y: 0.45 }, // derecha centro
  { x: 0.50, y: 0.22 }, // centro arriba (brazos arriba)
  { x: 0.50, y: 0.72 }, // centro abajo (agachado)
  { x: 0.18, y: 0.22 }, // izquierda arriba
  { x: 0.82, y: 0.22 }, // derecha arriba
];

// Instrucción según posición
const _instruccionPosicion = (x, y) => {
  if (y < 0.35) {
    if (x < 0.35) return '↖ ¡Izquierda y ARRIBA!';
    if (x > 0.65) return '↗ ¡Derecha y ARRIBA!';
    return '⬆ ¡Levanta los BRAZOS!';
  }
  if (y > 0.60) return '⬇ ¡AGÁCHATE!';
  if (x < 0.35) return '⬅ ¡Muévete a la IZQUIERDA!';
  if (x > 0.65) return '➡ ¡Muévete a la DERECHA!';
  return '⭕ ¡Centra el cuerpo!';
};

const _crearParticula = (x, y, color) => ({
  x, y,
  vx: (Math.random() - 0.5) * 3,
  vy: (Math.random() - 0.5) * 3 - 1,
  vida: 25 + Math.random() * 20,
  vidaMax: 45,
  tam: 2 + Math.random() * 4,
  color,
});

export const PortalGame = {
  _state: null,

  init(materia, colorTema, config = {}) {
    const dif     = config.dificultad      || 'medio';
    const tamMult = config.tamanoObjetivos ?? 1.0;
    const d       = DIF_MAP[dif] || DIF_MAP.medio;

    const reto = generarReto(materia);
    this._state = {
      materia, colorTema,
      pregunta:       reto.pregunta,
      tick:           0,
      spawnTimer:     0,
      spawnDelay:     d.spawnDelay,
      tiempoPortal:   d.tiempoPortal,
      maxPortales:    d.maxPortales,
      radioBase:      72 * tamMult,
      puntosCorrecto: d.puntosCorrecto,
      puntosError:    d.puntosError,
      enCooldown:     false,
      cooldownTick:   0,

      portales:       [],
      particulas:     [],

      // Centro del cuerpo del alumno (normalizado)
      cuerpoX:        0.5,
      cuerpoY:        0.5,

      // Efecto de entrada al portal
      portalActivado: null,
      activadoTick:   0,

      // Animación de advertencia cuando el tiempo se acaba
      urgencia:       false,
    };

    this._spawnRonda(reto.opciones);
    return this._state;
  },

  _spawnRonda(opciones) {
    const s = this._state;
    // Mezclar posiciones aleatoriamente
    const posicionesDisp = [...POSICIONES].sort(() => Math.random() - 0.5);

    opciones.forEach((opc, i) => {
      if (i >= s.maxPortales && !opc.esCorrecto) return; // limitar portales en fácil
      const pos    = posicionesDisp[i % posicionesDisp.length];
      const color  = PORTAL_COLORES[i % PORTAL_COLORES.length];

      s.portales.push({
        id:          Math.random(),
        x:           pos.x,
        y:           pos.y,
        radio:       s.radioBase,
        texto:       opc.texto,
        esCorrecto:  opc.esCorrecto,
        color,
        instruccion: _instruccionPosicion(pos.x, pos.y),

        // Vida del portal — cuenta regresiva
        vidaMax:     s.tiempoPortal,
        vida:        s.tiempoPortal,

        // Animación
        fase:        Math.random() * Math.PI * 2,
        rotacion:    0,
        velRot:      0.02 + Math.random() * 0.02,
        activado:    false,
        activadoTick: 0,

        // Movimiento sutil del portal (flota)
        flotaAmp:    0.015 + Math.random() * 0.02,
        flotaFase:   Math.random() * Math.PI * 2,
        flotaVel:    0.015 + Math.random() * 0.01,
        xBase:       pos.x,
        yBase:       pos.y,
      });
    });
  },

  _nuevaRonda() {
    const s = this._state;
    const reto    = generarReto(s.materia);
    s.pregunta    = reto.pregunta;
    s.enCooldown  = false;
    s.portales    = [];
    this._spawnRonda(reto.opciones);
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;
    s.tick += delta;

    // ── Posición del cuerpo ──────────────────────────────
    if (landmarks) {
      // Centro: promedio de hombros + caderas
      const puntos = [11, 12, 23, 24].map(i => landmarks[i]).filter(Boolean);
      if (puntos.length >= 2) {
        const avgX = puntos.reduce((a, p) => a + p.x, 0) / puntos.length;
        const avgY = puntos.reduce((a, p) => a + p.y, 0) / puntos.length;
        // Espejado + lerp suave
        s.cuerpoX = s.cuerpoX + ((1 - avgX) - s.cuerpoX) * 0.20;
        s.cuerpoY = s.cuerpoY + (avgY - s.cuerpoY) * 0.20;
      }

      // Detectar brazos arriba — muñecas sobre hombros
      const hom1 = landmarks[11], hom2 = landmarks[12];
      const mun1 = landmarks[15], mun2 = landmarks[16];
      if (hom1 && hom2 && mun1 && mun2) {
        const brazosArriba = mun1.y < hom1.y - 0.08 || mun2.y < hom2.y - 0.08;
        if (brazosArriba) s.cuerpoY = s.cuerpoY + (0.18 - s.cuerpoY) * 0.25;
      }

      // Detectar agachado — caderas bajas
      const cad1 = landmarks[23], cad2 = landmarks[24];
      const rod1 = landmarks[25], rod2 = landmarks[26];
      if (cad1 && rod1) {
        const distCadRod = Math.abs(rod1.y - cad1.y);
        if (distCadRod < 0.15) s.cuerpoY = s.cuerpoY + (0.75 - s.cuerpoY) * 0.25;
      }
    }

    // ── Actualizar portales ──────────────────────────────
    s.portales.forEach(p => {
      if (!p.activado) {
        p.vida--;
        p.rotacion += p.velRot;
        p.fase     += 0.04;
        // Flotación suave
        p.x = p.xBase + Math.sin(s.tick * p.flotaVel + p.flotaFase) * p.flotaAmp;
        p.y = p.yBase + Math.cos(s.tick * p.flotaVel * 0.7 + p.flotaFase) * p.flotaAmp * 0.5;

        // Urgencia cuando queda poca vida
        if (p.vida < p.vidaMax * 0.3) s.urgencia = true;

        // Emitir partículas del borde del portal
        if (s.tick % 3 === 0) {
          const ang = Math.random() * Math.PI * 2;
          const px  = (p.x + Math.cos(ang) * 0.06) * canvasW;
          const py  = (p.y + Math.sin(ang) * 0.04) * canvasH;
          s.particulas.push(_crearParticula(px, py, p.color.inner));
        }
      } else {
        p.activadoTick++;
      }
    });

    // Limpiar portales expirados o activados
    const antesPortales = s.portales.length;
    s.portales = s.portales.filter(p => p.vida > 0 && !(p.activado && p.activadoTick > 35));

    // Si todos los portales expiraron sin activar → nueva ronda
    if (s.portales.filter(p => !p.activado).length === 0 && !s.enCooldown) {
      this._nuevaRonda();
      s.urgencia = false;
    }

    // ── Partículas ───────────────────────────────────────
    s.particulas.forEach(p => {
      p.x   += p.vx; p.y += p.vy;
      p.vy  += 0.05;
      p.tam *= 0.96;
      p.vida--;
    });
    s.particulas = s.particulas.filter(p => p.vida > 0 && p.tam > 0.3);

    if (s.enCooldown) return null;

    // ── Colisión cuerpo → portal ─────────────────────────
    const cx = s.cuerpoX * canvasW;
    const cy = s.cuerpoY * canvasH;

    for (const portal of s.portales) {
      if (portal.activado) continue;
      const px   = portal.x * canvasW;
      const py   = portal.y * canvasH;
      const dist = Math.hypot(cx - px, cy - py);

      if (dist < portal.radio * 0.75) {
        portal.activado  = true;
        s.enCooldown     = true;
        s.urgencia       = false;

        // Explosión de partículas al entrar
        for (let i = 0; i < 24; i++) {
          s.particulas.push(_crearParticula(px, py,
            portal.esCorrecto ? '#00FF88' : '#FF3333'));
        }

        if (portal.esCorrecto) {
          try { SFX.bonus(); } catch(_) {}
          setTimeout(() => { if(s) { this._nuevaRonda(); } }, 900);
          return { acierto: true, fallo: false, puntos: s.puntosCorrecto,
                   mensaje: `⭐ +${s.puntosCorrecto} XP` };
        } else {
          try { SFX.impacto(); } catch(_) {}
          setTimeout(() => { if(s) s.enCooldown = false; }, 700);
          return { acierto: false, fallo: true, puntos: s.puntosError,
                   mensaje: `💥 Portal equivocado -${Math.abs(s.puntosError)} XP` };
        }
      }
    }
    return null;
  },

  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;
    const W = canvasW, H = canvasH;

    // ── Pregunta ──────────────────────────────────────────
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.70)';
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(W*0.05, 14, W*0.90, 112, 14);
    else ctx.rect(W*0.05, 14, W*0.90, 112);
    ctx.fill();
    ctx.textAlign  = 'center';
    ctx.font       = 'bold 38px Orbitron, sans-serif';
    ctx.fillStyle  = s.urgencia
      ? `hsl(${(s.tick*8)%360},100%,65%)`  // arcoíris pulsante en urgencia
      : '#FFFFFF';
    ctx.shadowBlur  = s.urgencia ? 20 : 12;
    ctx.shadowColor = s.urgencia ? '#FF0000' : s.colorTema;
    ctx.fillText(s.pregunta, W/2, 66);
    ctx.font = '17px Rajdhani, sans-serif';
    ctx.fillStyle  = 'rgba(255,255,255,0.55)'; ctx.shadowBlur = 0;
    ctx.fillText('🌀 Entra al PORTAL con la respuesta correcta', W/2, 106);
    ctx.restore();

    // ── Partículas ────────────────────────────────────────
    s.particulas.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.vida / p.vidaMax) * 0.8;
      ctx.fillStyle   = p.color;
      ctx.shadowBlur  = 6; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.3, p.tam), 0, Math.PI*2);
      ctx.fill(); ctx.restore();
    });

    // ── Portales ──────────────────────────────────────────
    s.portales.forEach(portal => {
      const px  = portal.x * W;
      const py  = portal.y * H;
      const r   = portal.radio;
      const col = portal.color;

      // Progreso de vida — barra circular alrededor del portal
      const progVida = portal.vida / portal.vidaMax;

      ctx.save();
      if (portal.activado) {
        ctx.globalAlpha = Math.max(0, 1 - portal.activadoTick / 35);
      }

      // ── Halo exterior pulsante ──
      const pulso = 1 + Math.sin(portal.fase) * 0.12;
      ctx.save();
      ctx.globalAlpha *= 0.2;
      const halo = ctx.createRadialGradient(px, py, r*0.5, px, py, r*2.2*pulso);
      halo.addColorStop(0, col.glow);
      halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(px, py, r*2.2*pulso, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      // ── Anillo de cuenta regresiva ──
      ctx.save();
      // Fondo del anillo
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth   = 6; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(px, py, r + 14, 0, Math.PI*2); ctx.stroke();
      // Arco de progreso
      const color = progVida > 0.5 ? col.inner
                  : progVida > 0.25 ? '#FFAA00'
                  : '#FF2200';
      ctx.strokeStyle = color;
      ctx.lineWidth   = 6;
      ctx.shadowBlur  = 8; ctx.shadowColor = color;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.arc(px, py, r+14, -Math.PI/2, -Math.PI/2 + progVida*Math.PI*2);
      ctx.stroke();
      ctx.restore();

      // ── Cuerpo del portal (elipse giratoria) ──
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(portal.rotacion);

      // Sombra de profundidad
      ctx.shadowBlur  = 30; ctx.shadowColor = col.glow;

      // Elipse exterior (marco)
      ctx.strokeStyle = col.outer; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r*0.55, 0, 0, Math.PI*2);
      ctx.stroke();

      // Relleno del portal — efecto de profundidad dimensional
      const portalGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, r*0.9);
      portalGrad.addColorStop(0, '#000000');
      portalGrad.addColorStop(0.3, col.outer + 'AA');
      portalGrad.addColorStop(0.7, col.inner + '66');
      portalGrad.addColorStop(1, col.inner + '22');
      ctx.fillStyle   = portalGrad;
      ctx.beginPath(); ctx.ellipse(0, 0, r*0.92, r*0.50, 0, 0, Math.PI*2);
      ctx.fill();

      // Anillo interno giratorio (contrarotación)
      ctx.rotate(-portal.rotacion * 2.2);
      ctx.strokeStyle = col.inner + 'BB'; ctx.lineWidth = 2.5;
      ctx.shadowBlur  = 15; ctx.shadowColor = col.inner;
      ctx.setLineDash([12, 8]);
      ctx.beginPath(); ctx.ellipse(0, 0, r*0.65, r*0.36, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Núcleo brillante central
      const nucleo = ctx.createRadialGradient(0, 0, 0, 0, 0, r*0.22);
      nucleo.addColorStop(0, '#FFFFFF');
      nucleo.addColorStop(0.5, col.inner);
      nucleo.addColorStop(1, 'transparent');
      ctx.fillStyle = nucleo; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.ellipse(0, 0, r*0.22, r*0.12, 0, 0, Math.PI*2);
      ctx.fill();

      ctx.restore(); // fin rotación portal

      // ── Instrucción de movimiento (sobre el portal) ──
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font         = 'bold 14px Rajdhani, sans-serif';
      ctx.fillStyle    = col.inner;
      ctx.shadowBlur   = 8; ctx.shadowColor = col.inner;
      ctx.fillText(portal.instruccion, px, py - r - 22);
      ctx.restore();

      // ── Texto de respuesta ──
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font         = 'bold 16px Orbitron, sans-serif';

      const palabras = portal.texto.split(' ');
      let lineas = [], linea = '';
      const maxW = r * 1.5;
      palabras.forEach(p => {
        const t = linea + p + ' ';
        if (ctx.measureText(t).width > maxW && linea) {
          lineas.push(linea.trim()); linea = p + ' ';
        } else linea = t;
      });
      if (linea) lineas.push(linea.trim());

      const lH = 20, bH = lineas.length * lH + 10;
      const bW = Math.max(...lineas.map(l => ctx.measureText(l).width)) + 18;

      ctx.fillStyle = 'rgba(0,0,0,0.80)';
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(px-bW/2, py-bH/2, bW, bH, 6);
      else ctx.rect(px-bW/2, py-bH/2, bW, bH);
      ctx.fill();
      ctx.strokeStyle = col.inner + '66'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#FFFFFF'; ctx.shadowBlur = 4; ctx.shadowColor = col.glow;
      lineas.forEach((l, i) =>
        ctx.fillText(l, px, py + (i - (lineas.length-1)/2) * lH)
      );
      ctx.restore();

      ctx.restore(); // fin portal completo
    });

    // ── Cursor del cuerpo del alumno ──────────────────────
    const cx = s.cuerpoX * W, cy = s.cuerpoY * H;
    ctx.save();
    // Halo
    const haloC = ctx.createRadialGradient(cx, cy, 0, cx, cy, 38);
    haloC.addColorStop(0, s.colorTema + 'AA');
    haloC.addColorStop(1, 'transparent');
    ctx.fillStyle = haloC;
    ctx.beginPath(); ctx.arc(cx, cy, 38, 0, Math.PI*2); ctx.fill();
    // Cruz de mira
    ctx.strokeStyle = s.colorTema; ctx.lineWidth = 2.5;
    ctx.shadowBlur  = 10; ctx.shadowColor = s.colorTema;
    const miraSize = 18;
    ctx.beginPath();
    ctx.moveTo(cx - miraSize, cy); ctx.lineTo(cx + miraSize, cy);
    ctx.moveTo(cx, cy - miraSize); ctx.lineTo(cx, cy + miraSize);
    ctx.stroke();
    // Círculo central
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI*2);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  },

  getState() { return this._state; },
};