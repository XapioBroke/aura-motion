// ============================================================
//  PIÑATA GAME v2.0
//  CAMBIOS vs v1:
//  ✅ Palo serpentino = ÚNICO detector de golpe (landmark 19/20)
//  ✅ Piñatas elevadas a y=0.20 — el alumno brinca
//  ✅ XP progresivo: golpe 1=20, golpe 2=20, último=60
//  ✅ Penalización progresiva incorrecta: -10/-10/-40
//  ✅ Formas: burrito / llama Fortnite / estrella (aleatorio por ronda)
//  ✅ Palo dibujado en renderBrazos con serpentina de colores
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

// ── Detección — palo único con colisión en toda su longitud ─
const DIST_PALO      = 38;   // px — radio de colisión del palo
const VEL_MINIMA     = 4.5;  // px/frame
const COOLDOWN_GOLPE = 350;  // ms entre golpes

// Notas musicales para materialización (frecuencias de marimba)
const NOTAS_PALO = [261,294,330,349,392,440,494,523,587,659,698,784]; // Do→Sol

// ── Config por dificultad ───────────────────────────────────
const DIF_MAP = {
  facil:   { golpesNecesarios: 2, cooldown: 1800, numPinatas: 2 },
  medio:   { golpesNecesarios: 3, cooldown: 1400, numPinatas: 3 },
  dificil: { golpesNecesarios: 4, cooldown: 1000, numPinatas: 3 },
};

// XP por golpe (índice = número de golpe - 1)
const XP_GOLPE_CORRECTO   = [20, 20, 60, 60]; // golpe 1, 2, 3+
const PENALIZACION_GOLPE  = [-10, -10, -40, -40];

const PALETA_PINATAS = [
  { cuerpo: '#FF2D55', flecos: '#FF6B9D', oscuro: '#CC0033' },
  { cuerpo: '#FFD700', flecos: '#FFA500', oscuro: '#CC8800' },
  { cuerpo: '#00C8FF', flecos: '#66E0FF', oscuro: '#0088BB' },
  { cuerpo: '#A259FF', flecos: '#C990FF', oscuro: '#6A1FB5' },
  { cuerpo: '#00E676', flecos: '#69F0AE', oscuro: '#00A047' },
];

const FORMAS = ['burrito', 'llama', 'estrella'];

const _vel = (prev, curr, W, H) => {
  if (!prev || !curr) return 0;
  return Math.hypot((curr.x - prev.x) * W, (curr.y - prev.y) * H);
};

// ── Dibujar formas procedurales ────────────────────────────
const _dibujarForma = (ctx, forma, r, paleta, tick, dañoRatio) => {
  const deformX = 1 + dañoRatio * 0.18;
  const deformY = 1 - dañoRatio * 0.12;

  const grad = ctx.createRadialGradient(-r*0.25, -r*0.3, 4, 0, 0, r*1.2);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(0.3, paleta.flecos);
  grad.addColorStop(0.7, paleta.cuerpo);
  grad.addColorStop(1,   paleta.oscuro);

  ctx.save();
  ctx.scale(deformX, deformY);

  if (forma === 'estrella') {
    // Estrella de 7 puntas con flecos
    const puntas = 7;
    ctx.beginPath();
    for (let i = 0; i < puntas * 2; i++) {
      const ang  = (i / (puntas * 2)) * Math.PI * 2 - Math.PI / 2;
      const rad  = i % 2 === 0 ? r : r * 0.48;
      const x    = Math.cos(ang) * rad;
      const y    = Math.sin(ang) * rad;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle   = grad;
    ctx.shadowBlur  = 18; ctx.shadowColor = paleta.cuerpo;
    ctx.fill();
    ctx.strokeStyle = paleta.oscuro; ctx.lineWidth = 2; ctx.stroke();

    // Flecos en las puntas
    for (let i = 0; i < puntas; i++) {
      const ang   = (i / puntas) * Math.PI * 2 - Math.PI / 2;
      const fx    = Math.cos(ang) * r;
      const fy    = Math.sin(ang) * r;
      const ondu  = Math.sin(tick * 0.12 + i) * 5;
      ctx.strokeStyle = i % 2 === 0 ? paleta.flecos : '#FFFFFF';
      ctx.lineWidth   = 5;
      ctx.shadowBlur  = 6; ctx.shadowColor = paleta.flecos;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(ang)*(18+ondu), fy + Math.sin(ang)*(18+ondu));
      ctx.stroke();
    }

  } else if (forma === 'burrito') {
    // Cuerpo rectangular redondeado — burro/donkey
    const bw = r * 1.6, bh = r * 1.2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-bw/2, -bh/2, bw, bh, r*0.3);
    else ctx.rect(-bw/2, -bh/2, bw, bh);
    ctx.fillStyle   = grad;
    ctx.shadowBlur  = 18; ctx.shadowColor = paleta.cuerpo;
    ctx.fill();
    ctx.strokeStyle = paleta.oscuro; ctx.lineWidth = 2.5; ctx.stroke();

    // Cabeza
    ctx.beginPath(); ctx.arc(bw*0.38, -bh*0.3, r*0.38, 0, Math.PI*2);
    ctx.fillStyle = paleta.flecos; ctx.fill();

    // Oreja
    ctx.beginPath();
    ctx.ellipse(bw*0.42, -bh*0.62, r*0.1, r*0.22, 0.2, 0, Math.PI*2);
    ctx.fillStyle = paleta.oscuro; ctx.fill();

    // Ojo
    ctx.beginPath(); ctx.arc(bw*0.46, -bh*0.32, 4, 0, Math.PI*2);
    ctx.fillStyle = '#111'; ctx.fill();

    // Patas (4 rectángulos)
    [-0.35, -0.1, 0.15, 0.4].forEach(ox => {
      ctx.fillStyle = paleta.oscuro;
      ctx.fillRect(-bw/2 + bw*(ox+0.5) - 8, bh/2-2, 14, r*0.35);
    });

    // Franjas horizontales de colores
    const nFranjas = 5;
    const coloresFranja = [paleta.flecos, '#FFFFFF', paleta.cuerpo, '#FFFFFF', paleta.flecos];
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-bw/2, -bh/2, bw, bh, r*0.3);
    else ctx.rect(-bw/2, -bh/2, bw, bh);
    ctx.clip();
    coloresFranja.forEach((col, i) => {
      ctx.fillStyle   = col;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(-bw/2, -bh/2 + (i/nFranjas)*bh, bw, bh/nFranjas);
    });
    ctx.restore();

  } else {
    // LLAMA estilo Fortnite — forma rectangular con cuello/cabeza
    const bw = r * 1.4, bh = r * 1.3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-bw/2, -bh/2, bw, bh, r*0.15);
    else ctx.rect(-bw/2, -bh/2, bw, bh);
    ctx.fillStyle   = grad;
    ctx.shadowBlur  = 18; ctx.shadowColor = paleta.cuerpo;
    ctx.fill();
    ctx.strokeStyle = paleta.oscuro; ctx.lineWidth = 2.5; ctx.stroke();

    // Cuello largo
    ctx.fillStyle = paleta.flecos;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bw*0.15, -bh*0.85, bw*0.22, bh*0.5, 6);
    else ctx.rect(bw*0.15, -bh*0.85, bw*0.22, bh*0.5);
    ctx.fill();

    // Cabeza
    ctx.beginPath(); ctx.arc(bw*0.26, -bh*0.88, r*0.32, 0, Math.PI*2);
    ctx.fillStyle = paleta.flecos; ctx.fill();

    // Orejas largas
    ctx.fillStyle = paleta.oscuro;
    ctx.beginPath(); ctx.ellipse(bw*0.18, -bh*1.05, r*0.08, r*0.22, -0.3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(bw*0.34, -bh*1.08, r*0.08, r*0.22, 0.3, 0, Math.PI*2);  ctx.fill();

    // Ojo
    ctx.beginPath(); ctx.arc(bw*0.3, -bh*0.88, 5, 0, Math.PI*2);
    ctx.fillStyle = '#111'; ctx.fill();
    // Shine
    ctx.beginPath(); ctx.arc(bw*0.33, -bh*0.91, 2, 0, Math.PI*2);
    ctx.fillStyle = '#FFF'; ctx.fill();

    // Patas
    [-0.3, 0, 0.3].forEach(ox => {
      ctx.fillStyle = paleta.oscuro;
      ctx.fillRect(-bw/2 + bw*(ox+0.5) - 7, bh*0.48, 13, r*0.32);
    });

    // Flequillo morado icónico
    ctx.strokeStyle = '#9B59B6'; ctx.lineWidth = 5;
    ctx.shadowBlur  = 8; ctx.shadowColor = '#9B59B6';
    for (let i = 0; i < 5; i++) {
      const fx = bw*0.1 + i*8;
      ctx.beginPath();
      ctx.moveTo(fx, -bh*0.78);
      ctx.quadraticCurveTo(fx+4, -bh*0.7, fx+2, -bh*0.6);
      ctx.stroke();
    }

    // Franjas de colores en el cuerpo
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-bw/2, -bh/2, bw, bh, r*0.15);
    else ctx.rect(-bw/2, -bh/2, bw, bh);
    ctx.clip();
    ['#E74C3C','#F39C12','#2ECC71','#3498DB','#9B59B6'].forEach((col, i) => {
      ctx.fillStyle = col; ctx.globalAlpha = 0.3;
      ctx.fillRect(-bw/2, -bh/2 + i*(bh/5), bw, bh/5);
    });
    ctx.restore();
  }

  ctx.restore(); // deformación
};

// ── Sonido de materialización por segmento ─────────────────
const _sfxPalo = (() => {
  let actx = null;
  const ctx = () => {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  };
  return {
    segmento(idx) {
      try {
        const c = ctx(), t = c.currentTime;
        const freq = NOTAS_PALO[Math.min(idx, NOTAS_PALO.length-1)];
        const osc  = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.setValueAtTime(freq * 1.02, t + 0.04);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(t); osc.stop(t + 0.25);
      } catch(_) {}
    },
    completo() {
      try {
        const c = ctx(), t = c.currentTime;
        // Acorde final brillante
        [523, 659, 784].forEach((freq, i) => {
          const osc = c.createOscillator(), gain = c.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.12, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
          osc.connect(gain); gain.connect(c.destination);
          osc.start(t + i*0.04); osc.stop(t + 0.55);
        });
      } catch(_) {}
    },
    desvanecer() {
      try {
        const c = ctx(), t = c.currentTime;
        const osc = c.createOscillator(), gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(392, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(t); osc.stop(t + 0.32);
      } catch(_) {}
    },
  };
})();

export const PinataGame = {
  _state: null,
  _timers: [],

  init(materia, colorTema, config = {}) {
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];

    const dif     = config.dificultad      || 'medio';
    const tamMult = config.tamanoObjetivos ?? 1.0;
    const velMult = config.velocidad        ?? 1.0;
    const d       = DIF_MAP[dif] || DIF_MAP.medio;
    const reto    = generarReto(materia);

    // Elegir forma aleatoria para esta ronda
    const forma = FORMAS[Math.floor(Math.random() * FORMAS.length)];

    this._state = {
      materia, colorTema,
      pregunta:        reto.pregunta,
      tick:            0,
      forma,
      golpesNecesarios: d.golpesNecesarios,
      cooldown:         d.cooldown,
      radioBase:        72 * tamMult,
      velMult,
      enCooldown:       false,
      combo:            0,
      manoL:  { prev: null, lastGolpe: 0 },
      manoR:  { prev: null, lastGolpe: 0 },
      textos:   [],
      confetti: [],
      pinatas:  [],

      // ── Palo único mágico ──
      palo: {
        activo:       false,   // palo completamente materializado
        segmentos:    0,       // cuántos segmentos han aparecido (0-12)
        segMax:       12,
        materialTick: 0,       // frames desde último segmento
        materialInterval: 8,   // frames entre segmentos (~125ms a 60fps)
        fadeAlpha:    0,       // 0=invisible 1=completo
        // Posición y dirección (calculadas en renderBrazos)
        cx: 0, cy: 0,          // punto de origen (manos juntas)
        dirX: 1, dirY: 0,      // dirección del palo
        longitud: 0,           // longitud actual del palo
        longitudMax: 220,      // longitud objetivo
        manoAnclada: null,     // 'L' | 'R' — mano a la que está anclado cuando se separan
        lastGolpe: 0,          // timestamp último golpe
      },
    };

    this._generarPinatas(reto.opciones, d.numPinatas, tamMult);
    return this._state;
  },

  _generarPinatas(opciones, num, tamMult) {
    const s = this._state;
    // ELEVADAS — y entre 0.15 y 0.25 para que el alumno deba brincar
    const posX = num === 2 ? [0.28, 0.72] : [0.18, 0.50, 0.82];
    const posY = [0.20, 0.17, 0.22]; // variadas para naturalidad

    s.pinatas = opciones.slice(0, num).map((opc, i) => {
      const paleta = PALETA_PINATAS[i % PALETA_PINATAS.length];
      const anclaY = 0.0; // cuelgan del techo
      const longitud = posY[i] * (600) + 40; // longitud de cuerda según altura objetivo
      return {
        anclaX:   posX[i] ?? (0.2+i*0.3),
        anclaY,
        angulo:   (Math.random()-0.5)*0.5,
        velAng:   (Math.random()-0.5)*0.015,
        longitud,
        radio:    s.radioBase,
        texto:    opc.texto,
        esCorrecto: opc.esCorrecto,
        paleta,
        golpesRecibidos: 0,
        golpesMax:       s.golpesNecesarios,
        estado:          'intacta',
        flashTick:       0,
        rompiendo:       false,
        rompiendoTick:   0,
        fragmentos:      [],
        // Cada piñata tiene su propia forma aleatoria
        forma: FORMAS[Math.floor(Math.random() * FORMAS.length)],
      };
    });
  },

  _nuevaRonda() {
    if (!this._state) return;
    const s = this._state;
    const reto = generarReto(s.materia);
    s.pregunta   = reto.pregunta;
    s.enCooldown = false;
    s.combo      = 0;
    const dif = s.golpesNecesarios === 2 ? 'facil' : s.golpesNecesarios === 3 ? 'medio' : 'dificil';
    const d   = DIF_MAP[dif];
    this._generarPinatas(reto.opciones, d.numPinatas, s.radioBase/72);
  },

  _agregarTexto(x, y, texto, color) {
    this._state.textos.push({ x, y, texto, color, vida:65, vy:-2.8 });
  },

  _explotar(cx, cy, paleta, cantidad) {
    const s = this._state;
    const n = cantidad || 70;
    for (let i = 0; i < n; i++) {
      const ang   = Math.random()*Math.PI*2;
      const fuerza = 4+Math.random()*10;
      s.confetti.push({
        x:cx, y:cy,
        vx: Math.cos(ang)*fuerza, vy: Math.sin(ang)*fuerza-7,
        ancho: 6+Math.random()*9, alto: 3+Math.random()*5,
        rot: Math.random()*Math.PI*2, velRot:(Math.random()-0.5)*0.32,
        color: [paleta.cuerpo,paleta.flecos,'#FFFFFF','#FFD700'][Math.floor(Math.random()*4)],
        vida: 75+Math.random()*50, vidaMax:75+Math.random()*50,
        gravedad: 0.18+Math.random()*0.12,
      });
    }
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;
    s.tick += delta;

    // Física péndulo
    s.pinatas.forEach(p => {
      if (p.rompiendo) {
        p.rompiendoTick++;
        p.fragmentos.forEach(f => { f.x+=f.vx; f.y+=f.vy; f.vy+=0.4; f.rot+=f.velRot; f.vida--; });
        p.fragmentos = p.fragmentos.filter(f => f.vida>0);
        return;
      }
      const aceleracion = -0.0005*(canvasH/p.longitud)*Math.sin(p.angulo);
      p.velAng  = (p.velAng+aceleracion)*0.993;
      p.angulo += p.velAng;
      if (p.flashTick>0) p.flashTick--;
    });

    s.confetti.forEach(c => { c.x+=c.vx*0.96; c.y+=c.vy; c.vy+=c.gravedad; c.rot+=c.velRot; c.vida--; });
    s.confetti = s.confetti.filter(c=>c.vida>0);
    s.textos.forEach(t => { t.y+=t.vy; t.vy*=0.94; t.vida--; });
    s.textos = s.textos.filter(t=>t.vida>0);

    if (!landmarks) return null;

    const ahora  = performance.now();
    const getRX  = n => (1-n.x)*canvasW;
    const getRY  = n =>  n.y   *canvasH;

    const munL = landmarks[15], munR = landmarks[16];
    const palo = s.palo;

    // ── Lógica de materialización del palo ──
    if (munL && munR) {
      const mlx = getRX(munL), mly = getRY(munL);
      const mrx = getRX(munR), mry = getRY(munR);
      const distManos = Math.hypot(mlx-mrx, mly-mry) / canvasW;
      const manasJuntas = distManos < 0.17;

      if (manasJuntas) {
        // Centro entre las manos
        palo.cx = (mlx+mrx)/2;
        palo.cy = (mly+mry)/2;
        palo.manoAnclada = null; // vuelven a unirse — resetear anclaje

        // Dirección: promedio hombro→muñeca de ambos brazos
        const homL = landmarks[11], homR = landmarks[12];
        if (homL && homR) {
          const dxL = mlx - getRX(homL), dyL = mly - getRY(homL);
          const dxR = mrx - getRX(homR), dyR = mry - getRY(homR);
          const dx  = (dxL+dxR)/2, dy = (dyL+dyR)/2;
          const len = Math.hypot(dx,dy)||1;
          palo.dirX = dx/len; palo.dirY = dy/len;
        }

        // Materializar segmento a segmento
        if (palo.segmentos < palo.segMax) {
          palo.materialTick++;
          if (palo.materialTick >= palo.materialInterval) {
            palo.materialTick = 0;
            palo.segmentos++;
            palo.longitud = (palo.segmentos / palo.segMax) * palo.longitudMax;
            _sfxPalo.segmento(palo.segmentos - 1);
            if (palo.segmentos === palo.segMax) {
              palo.activo = true;
              _sfxPalo.completo();
            }
          }
        }
        // Fade in
        palo.fadeAlpha = Math.min(1, palo.fadeAlpha + 0.12);

      } else {
        // Manos separadas
        if (palo.activo) {
          // Transferir a mano aleatoria si acaba de separarse
          if (!palo.manoAnclada) {
            palo.manoAnclada = Math.random() < 0.5 ? 'L' : 'R';
          }
          // Actualizar posición y dirección según la mano anclada
          const munAnc = palo.manoAnclada === 'L' ? munL : munR;
          const homAnc = palo.manoAnclada === 'L' ? landmarks[11] : landmarks[12];
          if (munAnc && homAnc) {
            palo.cx  = getRX(munAnc);
            palo.cy  = getRY(munAnc);
            const dxA = palo.cx - getRX(homAnc), dyA = palo.cy - getRY(homAnc);
            const lenA = Math.hypot(dxA, dyA) || 1;
            palo.dirX = dxA/lenA; palo.dirY = dyA/lenA;
          }
          palo.fadeAlpha = 1;
        } else {
          // Aún materializando y se soltaron — reiniciar
          palo.fadeAlpha    = Math.max(0, palo.fadeAlpha - 0.08);
          palo.segmentos    = 0;
          palo.longitud     = 0;
          palo.materialTick = 0;
          palo.manoAnclada  = null;
        }
      }
    }

    // Velocidad del centro de las manos (para detectar golpe)
    const velManos = _vel(s.manoL.prev, munL, canvasW, canvasH);
    s.manoL.prev = munL ? {...munL} : null;
    s.manoR.prev = munR ? {...munR} : null;

    if (s.enCooldown) return null;

    let resultado = null;

    // ── Detección de golpe con palo único ──
    if (!palo.activo || palo.fadeAlpha < 0.5) return null; // palo no materializado

    for (const pinata of s.pinatas) {
      if (pinata.rompiendo) continue;

      const pivX = pinata.anclaX*canvasW;
      const pivY = pinata.anclaY*canvasH;
      const px   = pivX + Math.sin(pinata.angulo)*pinata.longitud;
      const py   = pivY + Math.cos(pinata.angulo)*pinata.longitud;

      // Colisión con cualquier punto del palo (segmento línea → círculo)
      const N_CHECKS = 8;
      let distMin = Infinity;
      for (let i = 0; i <= N_CHECKS; i++) {
        const t   = i / N_CHECKS;
        const ptx = palo.cx + palo.dirX * palo.longitud * t;
        const pty = palo.cy + palo.dirY * palo.longitud * t;
        distMin = Math.min(distMin, Math.hypot(ptx-px, pty-py));
      }

      const distOk = distMin < pinata.radio + DIST_PALO;
      const velOk  = velManos > VEL_MINIMA;
      const coolOk = (ahora - palo.lastGolpe) > COOLDOWN_GOLPE;

      if (distOk && velOk && coolOk) {
        palo.lastGolpe = ahora;

        // Impulso al péndulo según dirección del palo
        pinata.velAng += palo.dirX * 0.03;
        pinata.flashTick = 8;

        const golpeIdx = pinata.golpesRecibidos;

        if (pinata.esCorrecto) {
          pinata.golpesRecibidos++;
          s.combo++;
          try { SFX.impacto?.(); } catch(_){}

          const xpEsteGolpe = XP_GOLPE_CORRECTO[Math.min(golpeIdx, XP_GOLPE_CORRECTO.length-1)];
          const esUltimo    = pinata.golpesRecibidos >= pinata.golpesMax;
          const xpReal      = esUltimo ? XP_GOLPE_CORRECTO[XP_GOLPE_CORRECTO.length-1] : xpEsteGolpe;

          const dañoRatio = pinata.golpesRecibidos / pinata.golpesMax;
          pinata.estado   = dañoRatio < 0.4 ? 'dañada' : 'casi_rota';

          this._agregarTexto(px, py-pinata.radio-25,
            esUltimo ? `🎉 +${xpReal} XP ¡ROTA!` : `💥 +${xpReal} XP (${pinata.golpesRecibidos}/${pinata.golpesMax})`,
            esUltimo ? '#FFD700' : '#00FF41'
          );

          if (esUltimo) {
            pinata.rompiendo = true; pinata.rompiendoTick = 0; pinata.estado = 'rota';
            pinata.fragmentos = Array.from({length:22},()=>({
              x:px,y:py,
              vx:(Math.random()-0.5)*15, vy:-Math.random()*11-3,
              rot:Math.random()*Math.PI*2, velRot:(Math.random()-0.5)*0.4,
              vida:45+Math.random()*25, color:pinata.paleta.cuerpo,
              w:18+Math.random()*20, h:12+Math.random()*10,
            }));
            this._explotar(px, py, pinata.paleta, 90);
            try { SFX.explosion?.(); SFX.bonus?.(); } catch(_){}
            s.enCooldown = true;
            const t = setTimeout(()=>this._nuevaRonda(), s.cooldown);
            this._timers.push(t);
            resultado = { acierto:true, fallo:false, puntos:xpReal };
          } else {
            resultado = { acierto:true, fallo:false, puntos:xpEsteGolpe };
          }
        } else {
          // Golpe incorrecto
          s.combo = 0;
          pinata.golpesRecibidos = Math.min(pinata.golpesRecibidos+1, PENALIZACION_GOLPE.length-1);
          const penalizacion = PENALIZACION_GOLPE[Math.min(golpeIdx, PENALIZACION_GOLPE.length-1)];
          try { SFX.error?.(); } catch(_){}
          this._agregarTexto(px, py-pinata.radio-25, `❌ ${penalizacion} XP`, '#FF4444');
          s.enCooldown = true;
          const t = setTimeout(()=>{ if(s) s.enCooldown=false; }, 700);
          this._timers.push(t);
          resultado = { acierto:false, fallo:true, puntos:penalizacion };
        }
        break;
      }
      if (resultado) break;
    }

    return resultado;
  },

  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    // Confetti
    s.confetti.forEach(c => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, c.vida/c.vidaMax);
      ctx.translate(c.x,c.y); ctx.rotate(c.rot);
      ctx.fillStyle = c.color; ctx.shadowBlur=4; ctx.shadowColor=c.color;
      ctx.fillRect(-c.ancho/2,-c.alto/2,c.ancho,c.alto);
      ctx.restore();
    });

    // Fondo pregunta
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.70)';
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(canvasW*0.05,14,canvasW*0.90,112,14);
    else ctx.rect(canvasW*0.05,14,canvasW*0.90,112);
    ctx.fill(); ctx.restore();

    ctx.save();
    ctx.textAlign='center';
    ctx.shadowBlur=14; ctx.shadowColor=s.colorTema;
    ctx.font='bold 40px Orbitron, sans-serif';
    ctx.fillStyle='#FFFFFF';
    ctx.fillText(s.pregunta, canvasW/2, 70);
    ctx.font='18px Rajdhani, sans-serif';
    ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.shadowBlur=0;
    ctx.fillText('🪅 Golpea con el PALO la piñata correcta — ¡Brinca!', canvasW/2, 108);
    ctx.restore();

    // Combo HUD
    if (s.combo>=2) {
      ctx.save();
      ctx.textAlign='center';
      ctx.font=`bold ${28+s.combo*2}px Orbitron`;
      ctx.fillStyle='#FFD700'; ctx.shadowBlur=20; ctx.shadowColor='#FFD700';
      ctx.fillText(`🔥 COMBO ×${s.combo}`, canvasW/2, canvasH-28);
      ctx.restore();
    }

    // Piñatas
    s.pinatas.forEach(p => {
      const pivX = p.anclaX*canvasW;
      const pivY = p.anclaY*canvasH;
      const px   = pivX + Math.sin(p.angulo)*p.longitud;
      const py   = pivY + Math.cos(p.angulo)*p.longitud;

      if (p.rompiendo) {
        p.fragmentos.forEach(f => {
          ctx.save(); ctx.globalAlpha=Math.max(0,f.vida/65);
          ctx.translate(f.x,f.y); ctx.rotate(f.rot);
          ctx.fillStyle=f.color; ctx.shadowBlur=8; ctx.shadowColor=f.color;
          ctx.fillRect(-f.w/2,-f.h/2,f.w,f.h); ctx.restore();
        });
        if (p.rompiendoTick<14) {
          ctx.save(); ctx.globalAlpha=(14-p.rompiendoTick)/14;
          ctx.fillStyle='#FFD700'; ctx.shadowBlur=70; ctx.shadowColor='#FFD700';
          ctx.beginPath(); ctx.arc(px,py,p.radio*3,0,Math.PI*2); ctx.fill(); ctx.restore();
        }
        return;
      }

      // Cuerda
      ctx.save();
      ctx.strokeStyle='rgba(180,140,80,0.85)'; ctx.lineWidth=3;
      ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.moveTo(pivX,pivY); ctx.lineTo(px,py-p.radio); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();

      // Cuerpo piñata
      ctx.save();
      ctx.translate(px,py);
      ctx.rotate(p.angulo*0.5);
      ctx.shadowBlur  = 20+(p.flashTick*4);
      ctx.shadowColor = p.flashTick>0?'#FFFFFF':p.paleta.cuerpo;

      const dañoRatio = p.golpesRecibidos/p.golpesMax;
      _dibujarForma(ctx, p.forma, p.radio, p.paleta, s.tick, dañoRatio);

      // Flash blanco al golpear
      if (p.flashTick>0) {
        ctx.globalAlpha = (p.flashTick/8)*0.45;
        ctx.fillStyle='#FFFFFF';
        ctx.beginPath(); ctx.arc(0,0,p.radio,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha=1;
      }

      // Grietas
      if (dañoRatio>=0.33) {
        ctx.strokeStyle=`rgba(0,0,0,${dañoRatio*0.7})`; ctx.lineWidth=2; ctx.shadowBlur=0;
        ctx.beginPath(); ctx.moveTo(-10,-p.radio*0.4); ctx.lineTo(5,-p.radio*0.1); ctx.lineTo(-5,p.radio*0.3); ctx.stroke();
      }
      if (dañoRatio>=0.67) {
        ctx.strokeStyle='rgba(0,0,0,0.8)'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(15,-p.radio*0.5); ctx.lineTo(-8,p.radio*0.1); ctx.lineTo(10,p.radio*0.4); ctx.stroke();
        ctx.fillStyle='rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(2,-5,12,8,0.3,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();

      // Barra de resistencia
      if (p.golpesRecibidos>0) {
        const bw=p.radio*2, bx=px-p.radio, by=py+p.radio+16;
        const ratio=1-(p.golpesRecibidos/p.golpesMax);
        ctx.save();
        ctx.fillStyle='rgba(0,0,0,0.6)';
        ctx.beginPath(); if(ctx.roundRect)ctx.roundRect(bx,by,bw,10,5);else ctx.rect(bx,by,bw,10); ctx.fill();
        const col=ratio>0.5?'#00FF41':ratio>0.25?'#FFD700':'#FF4444';
        ctx.fillStyle=col; ctx.shadowBlur=8; ctx.shadowColor=col;
        ctx.beginPath(); if(ctx.roundRect)ctx.roundRect(bx,by,bw*ratio,10,5);else ctx.rect(bx,by,bw*ratio,10); ctx.fill();
        ctx.restore();
      }

      // Texto respuesta
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font='bold 19px Orbitron, sans-serif';
      const palabras=p.texto.split(' ');
      let lineas=[],linea='';
      const maxW=p.radio*1.55;
      palabras.forEach(w => {
        const t=linea+w+' ';
        if(ctx.measureText(t).width>maxW&&linea){lineas.push(linea.trim());linea=w+' ';}else linea=t;
      });
      if(linea) lineas.push(linea.trim());
      const lineH=21, bH=lineas.length*lineH+12;
      const bW=Math.min(p.radio*1.9, Math.max(...lineas.map(l=>ctx.measureText(l).width))+20);
      ctx.fillStyle='rgba(0,0,0,0.72)'; ctx.shadowBlur=0;
      ctx.beginPath(); if(ctx.roundRect)ctx.roundRect(px-bW/2,py-bH/2,bW,bH,7);else ctx.rect(px-bW/2,py-bH/2,bW,bH); ctx.fill();
      ctx.fillStyle='#FFFFFF'; ctx.shadowBlur=4; ctx.shadowColor='#FFF';
      lineas.forEach((l,i)=>ctx.fillText(l,px,py+(i-(lineas.length-1)/2)*lineH));
      ctx.restore();

      // Indicador de golpes (círculos)
      ctx.save();
      const iconY=py-p.radio-22;
      for(let g=0;g<p.golpesMax;g++) {
        const gx=px-(p.golpesMax-1)*12+g*24;
        ctx.beginPath(); ctx.arc(gx,iconY,8,0,Math.PI*2);
        ctx.fillStyle=g<p.golpesRecibidos?(p.esCorrecto?'#00FF41':'#FF4444'):'rgba(255,255,255,0.2)';
        ctx.shadowBlur=g<p.golpesRecibidos?12:0; ctx.shadowColor='#00FF41';
        ctx.fill();
      }
      ctx.restore();
    });

    // Textos flotantes
    s.textos.forEach(t => {
      ctx.save();
      ctx.globalAlpha=Math.min(1,t.vida/20);
      ctx.textAlign='center';
      ctx.font='bold 24px Orbitron, sans-serif';
      ctx.fillStyle=t.color; ctx.shadowBlur=14; ctx.shadowColor=t.color;
      ctx.fillText(t.texto,t.x,t.y);
      ctx.restore();
    });
  },

  // ── Render palo único mágico ───────────────────────────
  renderBrazos(ctx, landmarks, canvasW, canvasH) {
    const s = this._state;
    if (!s || !landmarks) return;

    const palo = s.palo;
    if (palo.fadeAlpha <= 0) {
      // Sin palo — mostrar hint si las manos están cerca
      const munL = landmarks[15], munR = landmarks[16];
      if (munL && munR) {
        const getRX = n => (1-n.x)*canvasW;
        const getRY = n => n.y*canvasH;
        const mlx=getRX(munL),mly=getRY(munL),mrx=getRX(munR),mry=getRY(munR);
        const dist = Math.hypot(mlx-mrx,mly-mry)/canvasW;
        if (dist < 0.35) {
          // Hint pulsante: "junta las manos"
          const cx=(mlx+mrx)/2, cy=(mly+mry)/2;
          const pulso = 0.4 + Math.sin(s.tick*0.1)*0.3;
          ctx.save();
          ctx.globalAlpha = pulso;
          ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2.5;
          ctx.setLineDash([5,5]);
          ctx.shadowBlur = 12; ctx.shadowColor = '#FFD700';
          ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI*2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = 'bold 13px Orbitron';
          ctx.fillStyle = '#FFD700'; ctx.textAlign = 'center';
          ctx.fillText('🪅 JUNTA', cx, cy-36);
          ctx.restore();
        }
      }
      return;
    }

    const SERPENTINA = ['#FF2D55','#FFD700','#00C8FF','#A259FF','#00E676','#FF6B35','#FFFFFF'];
    const segActivos = palo.segmentos; // cuántos segmentos han aparecido

    // ── Mango (origen del palo) — siempre en el centro de las manos ──
    ctx.save();
    ctx.globalAlpha = palo.fadeAlpha;
    ctx.beginPath(); ctx.arc(palo.cx, palo.cy, 12, 0, Math.PI*2);
    ctx.fillStyle = '#8B4513';
    ctx.shadowBlur = 10; ctx.shadowColor = '#FFD700';
    ctx.fill();
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();

    // ── Segmentos del palo (solo los que han aparecido) ──
    for (let i = 0; i < segActivos; i++) {
      const t0 = i / palo.segMax;
      const t1 = (i+1) / palo.segMax;

      // Longitud progresiva: solo hasta el segmento actual
      const lonActual = (segActivos / palo.segMax) * palo.longitudMax;

      // Ondulación serpentina suave
      const onda0 = Math.sin(s.tick*0.07 + i*0.65) * 4;
      const onda1 = Math.sin(s.tick*0.07 + (i+1)*0.65) * 4;

      // Perpendicular a la dirección del palo
      const px0 = palo.cx + palo.dirX*lonActual*t0 - palo.dirY*onda0;
      const py0 = palo.cy + palo.dirY*lonActual*t0 + palo.dirX*onda0;
      const px1 = palo.cx + palo.dirX*lonActual*t1 - palo.dirY*onda1;
      const py1 = palo.cy + palo.dirY*lonActual*t1 + palo.dirX*onda1;

      const color = SERPENTINA[i % SERPENTINA.length];

      // Es el último segmento materializado — efecto de aparición
      const esNuevo = (i === segActivos - 1);

      ctx.save();
      ctx.globalAlpha = palo.fadeAlpha * (esNuevo ? 0.5 + Math.sin(s.tick*0.4)*0.5 : 1);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 16 - i*0;
      ctx.lineCap     = 'round';
      ctx.shadowBlur  = esNuevo ? 20 : 8;
      ctx.shadowColor = color;
      ctx.beginPath(); ctx.moveTo(px0,py0); ctx.lineTo(px1,py1);
      ctx.stroke();

      // Brillo blanco sobre el segmento (especular)
      ctx.globalAlpha = palo.fadeAlpha * 0.25;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 0;
      ctx.beginPath(); ctx.moveTo(px0,py0); ctx.lineTo(px1,py1);
      ctx.stroke();
      ctx.restore();

      // Partícula de aparición en el frente del segmento nuevo
      if (esNuevo && s.tick % 3 === 0) {
        s.confetti.push({
          x: px1, y: py1,
          vx: (Math.random()-0.5)*3, vy: -Math.random()*3,
          ancho:4, alto:4, rot:0, velRot:0.2,
          color, vida:12, vidaMax:12, gravedad:0.1,
        });
      }
    }

    // ── Punta del palo — destello pulsante si está completo ──
    if (palo.activo) {
      const lonActual = palo.longitudMax;
      const onda = Math.sin(s.tick*0.07 + (palo.segMax-1)*0.65) * 4;
      const puntaX = palo.cx + palo.dirX*lonActual - palo.dirY*onda;
      const puntaY = palo.cy + palo.dirY*lonActual + palo.dirX*onda;
      const pulso  = 0.7 + Math.sin(s.tick*0.15)*0.3;

      ctx.save();
      ctx.globalAlpha = palo.fadeAlpha;
      // Aura pulsante
      ctx.beginPath(); ctx.arc(puntaX, puntaY, 18*pulso, 0, Math.PI*2);
      const aura = ctx.createRadialGradient(puntaX,puntaY,0, puntaX,puntaY,18*pulso);
      aura.addColorStop(0,'rgba(255,255,255,0.8)');
      aura.addColorStop(1,'rgba(255,215,0,0)');
      ctx.fillStyle = aura; ctx.shadowBlur=20; ctx.shadowColor='#FFD700';
      ctx.fill();
      // Centro brillante
      ctx.beginPath(); ctx.arc(puntaX, puntaY, 7, 0, Math.PI*2);
      ctx.fillStyle='#FFFFFF'; ctx.shadowBlur=15; ctx.shadowColor='#FFD700';
      ctx.fill();
      ctx.restore();
    }

    // ── Indicador de materialización (solo durante proceso) ──
    if (segActivos > 0 && segActivos < palo.segMax) {
      const pct = segActivos / palo.segMax;
      const barW = 120, barX = palo.cx - barW/2, barY = palo.cy + 30;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(barX,barY,barW,8,4);
      else ctx.rect(barX,barY,barW,8);
      ctx.fill();
      ctx.fillStyle = SERPENTINA[segActivos % SERPENTINA.length];
      ctx.shadowBlur = 8; ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(barX,barY,barW*pct,8,4);
      else ctx.rect(barX,barY,barW*pct,8);
      ctx.fill();
      ctx.restore();
    }
  },

  getState() { return this._state; },
};