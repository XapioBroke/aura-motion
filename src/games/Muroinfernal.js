// ============================================================
//  MURO INFERNAL v1.0
//  Pre-minijuego opcional activado por el docente.
//  Una pared con silueta recortada avanza hacia el alumno.
//  Al llegar al punto crítico: si el cuerpo cabe → minijuego.
//  3 vidas por turno. Si falla 3 veces → turno perdido.
// ============================================================

// ── Sonido FM ───────────────────────────────────────────────
const _sfxMuro = (() => {
  let actx = null;
  const ctx = () => {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  };
  return {
    // Tensión mientras la pared avanza — tono grave pulsante
    avanzando() {
      try {
        const c = ctx(), t = c.currentTime;
        const osc = c.createOscillator(), gain = c.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(55, t);
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(t); osc.stop(t + 0.32);
      } catch(_) {}
    },
    // Fallo — buzzer
    fallo() {
      try {
        const c = ctx(), t = c.currentTime;
        const osc = c.createOscillator(), gain = c.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.setValueAtTime(120, t + 0.15);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(t); osc.stop(t + 0.5);
      } catch(_) {}
    },
    // Estadio — multitud que corea
    estadio() {
      try {
        const c = ctx(), t = c.currentTime;
        // Oleada de ruido blanco + notas ascendentes
        const bufSize = c.sampleRate * 1.5;
        const buf = c.createBuffer(1, bufSize, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random()*2-1) * 0.15;
        const noise = c.createBufferSource();
        noise.buffer = buf;
        const gainN = c.createGain();
        const filter = c.createBiquadFilter();
        filter.type = 'bandpass'; filter.frequency.value = 1200; filter.Q.value = 0.5;
        gainN.gain.setValueAtTime(0, t);
        gainN.gain.linearRampToValueAtTime(0.4, t + 0.2);
        gainN.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        noise.connect(filter); filter.connect(gainN); gainN.connect(c.destination);
        noise.start(t); noise.stop(t + 1.6);
        // Fanfarria
        [523,659,784,1047].forEach((freq, i) => {
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(freq, t + i*0.1);
          g.gain.setValueAtTime(0.18, t + i*0.1);
          g.gain.exponentialRampToValueAtTime(0.001, t + i*0.1 + 0.5);
          o.connect(g); g.connect(c.destination);
          o.start(t + i*0.1); o.stop(t + i*0.1 + 0.55);
        });
      } catch(_) {}
    },
    // Turno perdido
    perdido() {
      try {
        const c = ctx(), t = c.currentTime;
        [440, 370, 311, 261].forEach((freq, i) => {
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(freq, t + i*0.12);
          g.gain.setValueAtTime(0.15, t + i*0.12);
          g.gain.exponentialRampToValueAtTime(0.001, t + i*0.12 + 0.25);
          o.connect(g); g.connect(c.destination);
          o.start(t + i*0.12); o.stop(t + i*0.12 + 0.28);
        });
      } catch(_) {}
    },
  };
})();

// ── Formas disponibles ──────────────────────────────────────
// Cada forma define un "hueco" como polígono normalizado (0-1)
// y la postura que el alumno debe adoptar.
// La colisión se evalúa en los 17 landmarks principales.

const FORMAS = [
  // ── CLÁSICAS mejoradas ──────────────────────────────────
  {
    id: 'T', nombre: 'LA T LOCA', instruccion: '✋ ¡BRAZOS EN T AHORA!', icono: '🅃',
    tipo: 'compuesta',
    rects: [
      { x: 0.01, y: 0.18, w: 0.98, h: 0.28 },
      { x: 0.38, y: 0.05, w: 0.24, h: 0.92 },
    ],
  },
  {
    id: 'agachado', nombre: '¡AL SUELO!', instruccion: '🦆 ¡AGÁCHATE TODO LO QUE PUEDAS!', icono: '⬇️',
    tipo: 'compuesta',
    rects: [{ x: 0.10, y: 0.55, w: 0.80, h: 0.43 }],
  },
  {
    id: 'estrella', nombre: 'MODO ESTRELLA', instruccion: '⭐ ¡BRAZOS Y PIERNAS ABIERTAS!', icono: '⭐',
    tipo: 'compuesta',
    rects: [
      { x: 0.01, y: 0.18, w: 0.98, h: 0.24 },
      { x: 0.36, y: 0.04, w: 0.28, h: 0.92 },
      { x: 0.05, y: 0.62, w: 0.28, h: 0.36 },
      { x: 0.67, y: 0.62, w: 0.28, h: 0.36 },
    ],
  },
  // ── LOCAS LOGRADAS ──────────────────────────────────────
  {
    id: 'L_gigante', nombre: '¡SOY UNA L!', instruccion: '↙️ Brazo izq ARRIBA, pierna der ABIERTA', icono: '🫠',
    tipo: 'compuesta',
    rects: [
      { x: 0.04, y: 0.04, w: 0.22, h: 0.92 }, // brazo izq arriba
      { x: 0.04, y: 0.72, w: 0.80, h: 0.24 }, // pierna der abierta
    ],
  },
  {
    id: 'zigzag_humano', nombre: 'EL RAYO', instruccion: '⚡ Brazo der arriba, cuerpo al centro, pierna izq abajo', icono: '⚡',
    tipo: 'compuesta',
    rects: [
      { x: 0.55, y: 0.03, w: 0.38, h: 0.30 }, // brazo der arriba derecha
      { x: 0.28, y: 0.30, w: 0.44, h: 0.30 }, // torso centro
      { x: 0.08, y: 0.60, w: 0.38, h: 0.37 }, // pierna izq abajo izquierda
    ],
  },
  {
    id: 'silla', nombre: 'SENTADO EN EL AIRE', instruccion: '🪑 ¡Dobla las rodillas como si estuvieras sentado!', icono: '🪑',
    tipo: 'compuesta',
    rects: [
      { x: 0.22, y: 0.04, w: 0.56, h: 0.45 }, // torso vertical
      { x: 0.08, y: 0.46, w: 0.84, h: 0.24 }, // piernas horizontales dobladas
    ],
  },
  {
    id: 'ninja', nombre: 'POSE NINJA', instruccion: '🥷 Brazo izq arriba diagonal, pierna der hacia el lado', icono: '🥷',
    tipo: 'compuesta',
    rects: [
      { x: 0.04, y: 0.04, w: 0.36, h: 0.52 }, // brazo izq diagonal
      { x: 0.30, y: 0.28, w: 0.32, h: 0.68 }, // tronco
      { x: 0.52, y: 0.58, w: 0.44, h: 0.28 }, // pierna der horizontal
    ],
  },
  {
    id: 'canguro', nombre: '¡SOY CANGURO!', instruccion: '🦘 ¡Salta y junta los pies con brazos arriba!', icono: '🦘',
    tipo: 'compuesta',
    rects: [
      { x: 0.08, y: 0.02, w: 0.22, h: 0.44 }, // brazo izq arriba
      { x: 0.70, y: 0.02, w: 0.22, h: 0.44 }, // brazo der arriba
      { x: 0.34, y: 0.04, w: 0.32, h: 0.56 }, // cuerpo
      { x: 0.38, y: 0.60, w: 0.24, h: 0.38 }, // piernas juntas
    ],
  },
  {
    id: 'crucifijo_loco', nombre: 'EL AVIÓN', instruccion: '✈️ ¡Brazos horizontales MUY ABIERTOS y piernas juntas!', icono: '✈️',
    tipo: 'compuesta',
    rects: [
      { x: 0.01, y: 0.22, w: 0.98, h: 0.20 }, // brazos mega abiertos
      { x: 0.40, y: 0.04, w: 0.20, h: 0.92 }, // cuerpo angosto
    ],
  },
  {
    id: 'bailarin', nombre: 'MODO BAILARÍN', instruccion: '💃 Brazo der arriba, pierna izq a un lado', icono: '💃',
    tipo: 'compuesta',
    rects: [
      { x: 0.50, y: 0.02, w: 0.38, h: 0.38 }, // brazo der arriba derecha
      { x: 0.24, y: 0.22, w: 0.36, h: 0.56 }, // torso
      { x: 0.02, y: 0.58, w: 0.36, h: 0.30 }, // pierna izq horizontal
    ],
  },
  {
    id: 'cuadrado_humano', nombre: '¡SÉ UN CUADRADO!', instruccion: '⬜ Codos doblados 90°, manos a la altura de la cabeza', icono: '⬜',
    tipo: 'compuesta',
    rects: [
      { x: 0.06, y: 0.08, w: 0.22, h: 0.55 }, // brazo izq doblado
      { x: 0.72, y: 0.08, w: 0.22, h: 0.55 }, // brazo der doblado
      { x: 0.06, y: 0.08, w: 0.88, h: 0.22 }, // barra superior
      { x: 0.06, y: 0.44, w: 0.88, h: 0.22 }, // barra inferior brazos
      { x: 0.34, y: 0.04, w: 0.32, h: 0.92 }, // cuerpo centro
    ],
  },
  {
    id: 'angosto_extremo', nombre: '¡DESAPARECE!', instruccion: '🪄 ¡Pégalo TODO al cuerpo, vuélvete invisible!', icono: '🫥',
    tipo: 'compuesta',
    rects: [{ x: 0.37, y: 0.03, w: 0.26, h: 0.94 }],
  },
  {
    id: 'ovalo_esquina', nombre: 'ÓVALO LOCO', instruccion: '⭕ ¡Enróllate en la esquina superior izquierda!', icono: '🌀',
    tipo: 'elipse',
    cx: 0.32, cy: 0.38, rx: 0.30, ry: 0.36,
  },
  {
    id: 'columpio', nombre: 'EL COLUMPIO', instruccion: '🎢 Brazo izq y pierna der hacia el mismo lado', icono: '🎢',
    tipo: 'compuesta',
    rects: [
      { x: 0.02, y: 0.10, w: 0.50, h: 0.28 }, // brazo izq
      { x: 0.26, y: 0.10, w: 0.26, h: 0.78 }, // tronco
      { x: 0.02, y: 0.62, w: 0.50, h: 0.26 }, // pierna der misma dirección
    ],
  },
  {
    id: 'robot', nombre: 'MODO ROBOT', instruccion: '🤖 Codos perfectamente a 90°, pies separados exacto', icono: '🤖',
    tipo: 'compuesta',
    rects: [
      { x: 0.02, y: 0.20, w: 0.26, h: 0.24 }, // brazo izq horizontal
      { x: 0.72, y: 0.20, w: 0.26, h: 0.24 }, // brazo der horizontal
      { x: 0.02, y: 0.04, w: 0.26, h: 0.22 }, // antebrazo izq arriba
      { x: 0.72, y: 0.04, w: 0.26, h: 0.22 }, // antebrazo der arriba
      { x: 0.36, y: 0.04, w: 0.28, h: 0.88 }, // torso
      { x: 0.06, y: 0.68, w: 0.28, h: 0.28 }, // pierna izq
      { x: 0.66, y: 0.68, w: 0.28, h: 0.28 }, // pierna der
    ],
  },
];

// Landmarks a verificar (índices MediaPipe Pose)
const LM_VERIFICAR = [0,11,12,13,14,15,16,23,24,25,26,27,28];

// ── Verificar si un punto está dentro de la forma ──────────
const _dentroDe = (forma, nx, ny) => {
  if (forma.tipo === 'elipse') {
    const dx = (nx - forma.cx) / forma.rx;
    const dy = (ny - forma.cy) / forma.ry;
    return (dx*dx + dy*dy) <= 1;
  }
  // compuesta: basta con que esté en ALGÚN rect
  return forma.rects.some(r =>
    nx >= r.x && nx <= r.x+r.w &&
    ny >= r.y && ny <= r.y+r.h
  );
};

// ── Dibujar el hueco de la forma en el canvas ──────────────
const _dibujarHueco = (ctx, forma, canvasW, canvasH, alpha) => {
  ctx.save();
  ctx.globalAlpha = alpha;

  if (forma.tipo === 'elipse') {
    const cx = forma.cx * canvasW, cy = forma.cy * canvasH;
    const rx = forma.rx * canvasW, ry = forma.ry * canvasH;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2);
    ctx.clip();
    ctx.clearRect(0, 0, canvasW, canvasH);
  } else {
    forma.rects.forEach(r => {
      const x=r.x*canvasW, y=r.y*canvasH, w=r.w*canvasW, h=r.h*canvasH;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x,y,w,h,18);
      else ctx.rect(x,y,w,h);
      ctx.save(); ctx.clip(); ctx.clearRect(0,0,canvasW,canvasH); ctx.restore();
    });
  }

  ctx.restore();
};

// ── Dibujar borde neón del hueco ───────────────────────────
const _dibujarBordeHueco = (ctx, forma, canvasW, canvasH, color, lineW) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = lineW || 4;
  ctx.shadowBlur  = 18; ctx.shadowColor = color;
  ctx.globalAlpha = 0.9;

  if (forma.tipo === 'elipse') {
    ctx.beginPath();
    ctx.ellipse(forma.cx*canvasW, forma.cy*canvasH, forma.rx*canvasW, forma.ry*canvasH, 0, 0, Math.PI*2);
    ctx.stroke();
  } else {
    forma.rects.forEach(r => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(r.x*canvasW, r.y*canvasH, r.w*canvasW, r.h*canvasH, 18);
      else ctx.rect(r.x*canvasW, r.y*canvasH, r.w*canvasW, r.h*canvasH);
      ctx.stroke();
    });
  }
  ctx.restore();
};

// ════════════════════════════════════════════════════════════
export const MuroInfernal = {
  _state: null,
  _timers: [],
  _onExito:  null, // callback cuando pasa
  _onFallo:  null, // callback cuando pierde turno

  // ── Iniciar ─────────────────────────────────────────────
  init({ onExito, onFallo, vidas = 3, velocidad = 1.0 } = {}) {
    this._timers.forEach(t => clearTimeout(t)); this._timers = [];
    this._onExito = onExito;
    this._onFallo = onFallo;

    // Elegir forma aleatoria
    const forma = FORMAS[Math.floor(Math.random() * FORMAS.length)];

    this._state = {
      forma,
      vidasMax:    vidas,
      vidas,
      velocidad,   // multiplicador de velocidad (1.0 = normal)

      // Posición Z de la pared: 0.0 = lejos, 1.0 = punto crítico
      z:           0.0,
      velZ:        0.0006 * velocidad,

      // Caos — la pared se desplaza mientras avanza
      caosX:       0,        // desplazamiento horizontal actual (-0.3 a 0.3)
      caosY:       0,        // desplazamiento vertical actual (-0.15 a 0.15)
      caosVelX:    (Math.random()-0.5) * 0.004,
      caosVelY:    (Math.random()-0.5) * 0.002,
      caosAmpX:    0.22 + Math.random()*0.12,
      caosAmpY:    0.10 + Math.random()*0.08,
      caosFaseX:   Math.random()*Math.PI*2,
      caosFaseY:   Math.random()*Math.PI*2,
      caosFreqX:   0.018 + Math.random()*0.014,
      caosFreqY:   0.012 + Math.random()*0.010,

      // Fase: 'instruccion' | 'avanzando' | 'critico' | 'exito' | 'fallo' | 'perdido'
      fase:        'instruccion',
      instruccionTick: 0,
      instruccionMax:  160, // ~2.7s mostrando instrucción

      todosDentro:     false,
      puntosCuerpo:    [], // [{lm, nx, ny, dentro}]

      // Efectos
      particulas:  [],
      flashTick:   0,
      flashColor:  '#00FF41',
      textoGrande: null,
      tick:        0,

      // Selección de nueva forma entre intentos
      cambioForma: false,
    };

    return this._state;
  },

  // ── Update ───────────────────────────────────────────────
  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return;
    s.tick += delta;

    // Efectos
    s.particulas.forEach(p => {
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.08; p.vida--;
      p.vx *= 0.97;
    });
    s.particulas = s.particulas.filter(p=>p.vida>0);
    if (s.flashTick>0) s.flashTick--;

    if (s.fase === 'instruccion') {
      s.instruccionTick++;
      if (s.instruccionTick >= s.instruccionMax) {
        s.fase = 'avanzando';
      }
      return;
    }

    if (s.fase === 'avanzando') {
      s.z += s.velZ * delta;

      // Movimiento caótico de la pared (zigzag sinusoidal)
      // Se calma al llegar al punto crítico (z>0.85) para dar chance de encajar
      const calmFactor = s.z > 0.85 ? Math.max(0, (1.0 - s.z) / 0.15) : 1.0;
      s.caosX = Math.sin(s.tick * s.caosFreqX + s.caosFaseX) * s.caosAmpX * calmFactor;
      s.caosY = Math.cos(s.tick * s.caosFreqY + s.caosFaseY) * s.caosAmpY * calmFactor;

      // Sonido de tensión cada ~90 frames
      if (Math.floor(s.tick/90) !== Math.floor((s.tick-delta)/90)) {
        _sfxMuro.avanzando();
      }

      // Evaluar posición del cuerpo vs forma
      if (landmarks) {
        const ex = lm => (1-lm.x); // espejado
        const ey = lm => lm.y;

        s.puntosCuerpo = LM_VERIFICAR
          .filter(i => landmarks[i])
          .map(i => {
            const lm = landmarks[i];
            const nx = ex(lm), ny = ey(lm);
            return { i, nx, ny, dentro: _dentroDe(s.forma, nx, ny) };
          });

        s.todosDentro = s.puntosCuerpo.length > 0 &&
                        s.puntosCuerpo.every(p => p.dentro);
      }

      // Punto crítico: z >= 1.0
      if (s.z >= 1.0) {
        s.z = 1.0;
        this._evaluarImpacto();
      }
      return;
    }

    if (s.fase === 'exito' || s.fase === 'fallo' || s.fase === 'perdido') {
      // Esperar a que el callback/timer maneje la transición
      return;
    }
  },

  _evaluarImpacto() {
    const s = this._state;
    if (s.todosDentro) {
      // ✅ ÉXITO
      s.fase = 'exito';
      s.flashTick  = 90;
      s.flashColor = '#00FF41';
      s.textoGrande = { texto: '⚡ ¡MINIJUEGO DESBLOQUEADO!', color: '#FFD700', tick: 0 };
      _sfxMuro.estadio();
      this._explotar(true);
      const t = setTimeout(() => {
        if (this._onExito) this._onExito();
      }, 2200);
      this._timers.push(t);
    } else {
      // ❌ FALLO
      s.vidas--;
      _sfxMuro.fallo();
      s.flashTick  = 30;
      s.flashColor = '#FF2D55';
      this._explotar(false);

      if (s.vidas <= 0) {
        s.fase = 'perdido';
        s.textoGrande = { texto: '💀 TURNO PERDIDO', color: '#FF2D55', tick: 0 };
        _sfxMuro.perdido();
        const t = setTimeout(() => {
          if (this._onFallo) this._onFallo();
        }, 2000);
        this._timers.push(t);
      } else {
        s.fase = 'fallo';
        s.textoGrande = { texto: `❌ -1 VIDA  (${s.vidas} restantes)`, color: '#FF4444', tick: 0 };
        // Nueva forma tras 1.5s y reiniciar
        const t = setTimeout(() => {
          const nuevaForma = FORMAS[Math.floor(Math.random() * FORMAS.length)];
          s.forma          = nuevaForma;
          s.z              = 0.0;
          s.fase           = 'instruccion';
          s.instruccionTick = 0;
          s.textoGrande    = null;
          s.flashTick      = 0;
          s.puntosCuerpo   = [];
        }, 1600);
        this._timers.push(t);
      }
    }
  },

  _explotar(exito) {
    const s = this._state;
    const cx = 0.5, cy = 0.5; // relativo, se escala en render
    const n = exito ? 80 : 30;
    const colores = exito
      ? ['#FFD700','#00FF41','#00C8FF','#FF2D55','#FFFFFF']
      : ['#FF2D55','#FF6B35','#FF4444'];
    for (let i=0; i<n; i++) {
      const ang = Math.random()*Math.PI*2;
      const spd = exito ? 4+Math.random()*12 : 2+Math.random()*6;
      s.particulas.push({
        x: cx, y: cy, // normalizado
        vx: Math.cos(ang)*spd*0.003, vy: Math.sin(ang)*spd*0.003-0.01,
        vida: 50+Math.random()*40, vidaMax:90,
        color: colores[Math.floor(Math.random()*colores.length)],
        size: exito ? 3+Math.random()*5 : 2+Math.random()*3,
      });
    }
  },

  // ── Render ───────────────────────────────────────────────
  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    const { z, forma, fase } = s;

    // Fondo oscuro dramático
    const bgGrad = ctx.createLinearGradient(0,0,0,canvasH);
    bgGrad.addColorStop(0,'#0a0015');
    bgGrad.addColorStop(1,'#00050f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0,0,canvasW,canvasH);

    // ── FASE INSTRUCCIÓN ──
    if (fase === 'instruccion') {
      const prog = s.instruccionTick / s.instruccionMax;
      const pulso = 0.7 + Math.sin(s.tick*0.12)*0.3;

      // Vista previa de la forma (wireframe)
      ctx.save();
      ctx.globalAlpha = 0.25 + prog*0.3;
      ctx.fillStyle = 'rgba(0, 200, 255, 0.08)';
      ctx.strokeStyle = '#00C8FF';
      ctx.lineWidth = 3; ctx.setLineDash([8,6]);
      ctx.shadowBlur = 12; ctx.shadowColor = '#00C8FF';
      if (forma.tipo === 'elipse') {
        ctx.beginPath();
        ctx.ellipse(forma.cx*canvasW,forma.cy*canvasH,forma.rx*canvasW,forma.ry*canvasH,0,0,Math.PI*2);
        ctx.fill(); ctx.stroke();
      } else {
        forma.rects.forEach(r=>{
          ctx.beginPath();
          if(ctx.roundRect) ctx.roundRect(r.x*canvasW,r.y*canvasH,r.w*canvasW,r.h*canvasH,18);
          else ctx.rect(r.x*canvasW,r.y*canvasH,r.w*canvasW,r.h*canvasH);
          ctx.fill(); ctx.stroke();
        });
      }
      ctx.setLineDash([]); ctx.restore();

      // Texto instrucción
      ctx.save();
      ctx.textAlign='center';
      ctx.font='bold 56px Orbitron, sans-serif';
      ctx.fillStyle='#FFFFFF';
      ctx.shadowBlur=20; ctx.shadowColor='#00C8FF';
      ctx.globalAlpha=pulso;
      ctx.fillText(forma.icono + ' ' + forma.nombre, canvasW/2, canvasH*0.36);
      ctx.font='bold 28px Rajdhani, sans-serif';
      ctx.fillStyle='#00C8FF'; ctx.shadowBlur=10;
      ctx.fillText(forma.instruccion, canvasW/2, canvasH*0.36+55);
      ctx.globalAlpha=1;

      // Barra de cuenta regresiva
      const barW = canvasW*0.55, barX = canvasW/2-barW/2, barY = canvasH*0.72;
      ctx.fillStyle='rgba(255,255,255,0.1)';
      ctx.beginPath(); if(ctx.roundRect)ctx.roundRect(barX,barY,barW,12,6); else ctx.rect(barX,barY,barW,12); ctx.fill();
      ctx.fillStyle='#00C8FF'; ctx.shadowBlur=12; ctx.shadowColor='#00C8FF';
      ctx.beginPath(); if(ctx.roundRect)ctx.roundRect(barX,barY,barW*prog,12,6); else ctx.rect(barX,barY,barW*prog,12); ctx.fill();
      ctx.shadowBlur=0;

      // Vidas
      this._renderVidas(ctx, canvasW, canvasH, s);
      ctx.restore();
      return;
    }

    // ── PARED AVANZANDO ──
    // Efecto de perspectiva: la pared escala según z
    const escala = 0.3 + z * 0.7;
    // Caos: la pared se desplaza pero se centra al llegar
    const offsetX = canvasW*(1-escala)/2 + (s.caosX||0)*canvasW*escala;
    const offsetY = canvasH*(1-escala)/2 + (s.caosY||0)*canvasH*escala;
    const pW = canvasW*escala, pH = canvasH*escala;

    // Líneas de perspectiva (tubo)
    ctx.save();
    ctx.strokeStyle='rgba(0,200,255,0.12)'; ctx.lineWidth=1;
    [[0,0],[1,0],[0,1],[1,1]].forEach(([fx,fy])=>{
      ctx.beginPath();
      ctx.moveTo(canvasW/2, canvasH/2);
      ctx.lineTo(offsetX+pW*fx, offsetY+pH*fy);
      ctx.stroke();
    });
    ctx.restore();

    // Pared sólida (con hueco recortado)
    ctx.save();
    // Guardar contexto y usar compositing para hacer el hueco
    const pared = ctx.createLinearGradient(offsetX,offsetY,offsetX+pW,offsetY+pH);
    const colorBase = z>0.85 ? (s.todosDentro?'rgba(0,80,0,0.92)':'rgba(80,0,0,0.92)')
                              : 'rgba(10,10,30,0.92)';
    pared.addColorStop(0, colorBase);
    pared.addColorStop(1, z>0.85?(s.todosDentro?'rgba(0,120,0,0.88)':'rgba(120,0,0,0.88)'):'rgba(20,10,50,0.88)');

    // Pintar pared completa
    ctx.fillStyle = pared;
    ctx.shadowBlur=0;
    ctx.fillRect(offsetX,offsetY,pW,pH);

    // Recortar el hueco (destination-out)
    ctx.globalCompositeOperation = 'destination-out';

    // Transformar coordenadas de la forma según la escala de perspectiva
    ctx.save();
    ctx.translate(offsetX,offsetY);
    ctx.scale(escala,escala);
    _dibujarHueco(ctx, forma, canvasW, canvasH, 1);
    ctx.restore();

    ctx.globalCompositeOperation = 'source-over';

    // Borde neón del hueco (color según estado)
    const colorBorde = z>0.85
      ? (s.todosDentro ? '#00FF41' : '#FF2D55')
      : '#00C8FF';
    ctx.save();
    ctx.translate(offsetX,offsetY);
    ctx.scale(escala,escala);
    _dibujarBordeHueco(ctx, forma, canvasW, canvasH, colorBorde, 5/escala);
    ctx.restore();
    ctx.restore();

    // Borde exterior de la pared (neón)
    ctx.save();
    ctx.strokeStyle = colorBorde;
    ctx.lineWidth   = 3+z*4;
    ctx.shadowBlur  = 12+z*20; ctx.shadowColor=colorBorde;
    ctx.strokeRect(offsetX,offsetY,pW,pH);
    ctx.restore();

    // ── PUNTOS DEL CUERPO sobre la pared ──
    s.puntosCuerpo.forEach(p => {
      const sx = offsetX + p.nx*canvasW*escala;
      const sy = offsetY + p.ny*canvasH*escala;
      const col = p.dentro ? '#00FF41' : '#FF2D55';
      ctx.save();
      ctx.beginPath(); ctx.arc(sx,sy,7+z*4,0,Math.PI*2);
      ctx.fillStyle=col; ctx.shadowBlur=14+z*10; ctx.shadowColor=col; ctx.fill();
      ctx.restore();
    });

    // Instrucción flotante
    if (fase==='avanzando' && z < 0.6) {
      ctx.save();
      ctx.textAlign='center';
      ctx.font='bold 22px Rajdhani, sans-serif';
      ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.shadowBlur=8; ctx.shadowColor='#00C8FF';
      ctx.fillText(forma.instruccion, canvasW/2, canvasH*0.06);
      ctx.restore();
    }

    // Indicador de peligro cuando está cerca
    if (z > 0.75) {
      const danger = (z-0.75)/0.25;
      ctx.save();
      ctx.globalAlpha=danger*0.15*(0.5+Math.sin(s.tick*0.25)*0.5);
      ctx.fillStyle = s.todosDentro ? '#00FF41' : '#FF2D55';
      ctx.fillRect(0,0,canvasW,canvasH);
      ctx.restore();
    }

    // Flash de éxito/fallo
    if (s.flashTick>0) {
      ctx.save();
      ctx.globalAlpha=(s.flashTick/90)*0.45;
      ctx.fillStyle=s.flashColor;
      ctx.fillRect(0,0,canvasW,canvasH);
      ctx.restore();
    }

    // Partículas
    s.particulas.forEach(p => {
      const px=p.x*canvasW, py=p.y*canvasH;
      ctx.save();
      ctx.globalAlpha=Math.max(0,p.vida/p.vidaMax);
      ctx.beginPath(); ctx.arc(px,py,p.size,0,Math.PI*2);
      ctx.fillStyle=p.color; ctx.shadowBlur=8; ctx.shadowColor=p.color; ctx.fill();
      ctx.restore();
    });

    // Texto grande (éxito / fallo / perdido)
    if (s.textoGrande) {
      s.textoGrande.tick = (s.textoGrande.tick||0)+1;
      const pulso=0.85+Math.sin(s.textoGrande.tick*0.18)*0.15;
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font=`bold ${Math.round(52*pulso)}px Orbitron, sans-serif`;
      ctx.fillStyle=s.textoGrande.color;
      ctx.shadowBlur=30; ctx.shadowColor=s.textoGrande.color;
      ctx.fillText(s.textoGrande.texto, canvasW/2, canvasH*0.45);
      if (fase==='exito') {
        ctx.font='bold 28px Rajdhani, sans-serif';
        ctx.fillStyle='#FFFFFF'; ctx.shadowBlur=12; ctx.shadowColor='#FFFFFF';
        ctx.fillText('¡A jugar!', canvasW/2, canvasH*0.45+65);
      }
      ctx.restore();
    }

    this._renderVidas(ctx, canvasW, canvasH, s);
  },

  _renderVidas(ctx, canvasW, canvasH, s) {
    // Corazones de vida en la esquina superior izquierda
    ctx.save();
    ctx.font='bold 28px serif';
    ctx.textBaseline='top';
    for (let i=0; i<s.vidasMax; i++) {
      ctx.globalAlpha=i<s.vidas?1:0.2;
      ctx.shadowBlur=i<s.vidas?10:0; ctx.shadowColor='#FF2D55';
      ctx.fillText('❤️', 22+i*38, 22);
    }
    ctx.restore();
  },

  getState() { return this._state; },
  destroy()  { this._timers.forEach(t=>clearTimeout(t)); this._timers=[]; this._state=null; },
};