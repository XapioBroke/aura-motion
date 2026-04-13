// ============================================================
//  ARCO GAME v1.0 — Tiro con arco y flecha de luz
//
//  POSTURA:  Brazo izq extendido al frente (sostiene el arco)
//  CARGA:    Mano derecha se flexiona hacia atrás (codo dobla)
//            Más ángulo de flexión = más carga (0→100%)
//  DISPARO:  Mano derecha se extiende de vuelta → flecha sale
//            Dirección: hombro izq → muñeca izq
//            Velocidad proporcional a carga acumulada
//  IMPACTO:  Centro (headshot) > Medio > Exterior → XP proporcional
//  BLANCOS:  Solo en mitad superior (y: 0.08 → 0.50)
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

// ── Ángulos de detección ────────────────────────────────────
const ANG_BRAZO_EXTENDIDO  = 140;  // grados — brazo izq listo (más tolerante)
const ANG_CARGA_INICIO     = 110;  // flexión mín derecha para empezar carga
const ANG_CARGA_MAX        = 35;   // flexión máx derecha (carga 100%)
const ANG_DISPARO_DELTA    = 30;   // extensión acumulada en ventana de tiempo para disparar
const VENTANA_DISPARO_MS   = 300;  // ms de ventana para medir la extensión

// ── XP por zona de impacto ──────────────────────────────────
const XP_ZONA = {
  headshot: 60,   // centro < 25% radio
  medio:    35,   // 25-65% radio
  exterior: 15,   // 65-100% radio
};

// ── Config por dificultad ───────────────────────────────────
const DIF_MAP = {
  facil:   { puntosError: -5,  cooldown: 1800, numDianas: 2, velBase: 0.020, tamDiana: 1.2 },
  medio:   { puntosError: -10, cooldown: 1400, numDianas: 3, velBase: 0.026, tamDiana: 1.0 },
  dificil: { puntosError: -15, cooldown: 1100, numDianas: 3, velBase: 0.032, tamDiana: 0.85 },
};

const TRAYECTORIAS = ['hover', 'horizontal', 'circular', 'zigzag'];

// ── Sonido FM del arco ──────────────────────────────────────
const _sfxArco = (() => {
  let actx = null;
  const ctx = () => {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  };
  return {
    cargando(pct) {
      try {
        const c = ctx(), t = c.currentTime;
        const osc = c.createOscillator(), gain = c.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180 + pct * 320, t);
        gain.gain.setValueAtTime(0.06 * pct, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(t); osc.stop(t + 0.1);
      } catch(_) {}
    },
    disparo(pct) {
      try {
        const c = ctx(), t = c.currentTime;
        // Whoosh de flecha
        const osc = c.createOscillator(), gain = c.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800 + pct * 400, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.18);
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain); gain.connect(c.destination);
        osc.start(t); osc.stop(t + 0.25);
      } catch(_) {}
    },
    impacto(esHeadshot) {
      try {
        const c = ctx(), t = c.currentTime;
        if (esHeadshot) {
          // Acorde brillante
          [523, 659, 784].forEach((f, i) => {
            const o = c.createOscillator(), g = c.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.5);
            o.connect(g); g.connect(c.destination);
            o.start(t + i*0.04); o.stop(t + 0.55);
          });
        } else {
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'triangle'; o.frequency.setValueAtTime(440, t);
          g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.25);
          o.connect(g); g.connect(c.destination);
          o.start(t); o.stop(t+0.28);
        }
      } catch(_) {}
    },
  };
})();

// ── Helper: ángulo entre 3 landmarks ───────────────────────
const _angulo3 = (a, b, c) => {
  if (!a||!b||!c) return 180;
  const ab = { x: a.x-b.x, y: a.y-b.y };
  const cb = { x: c.x-b.x, y: c.y-b.y };
  const dot = ab.x*cb.x + ab.y*cb.y;
  const mag = Math.hypot(ab.x,ab.y) * Math.hypot(cb.x,cb.y);
  return mag===0 ? 180 : (Math.acos(Math.max(-1,Math.min(1,dot/mag)))*180)/Math.PI;
};

export const ArcoGame = {
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

    this._state = {
      materia, colorTema,
      pregunta: reto.pregunta,
      tick:     0,

      // Config
      puntosError:  d.puntosError,
      cooldown:     d.cooldown,
      velBase:      d.velBase * velMult,
      radioDiana:   62 * tamMult * d.tamDiana,
      numDianas:    d.numDianas,

      // Estado del arco
      arco: {
        // Fase: 'espera' | 'cargando' | 'listo' | 'disparando'
        fase:        'espera',
        carga:       0,      // 0.0 → 1.0
        angPrevDer:  180,
        lastDisparo: 0,
        cooldownMs:  600,
        // Historial de ángulos para medir extensión en ventana de tiempo
        histAngulos: [],     // [{ ang, t }] — últimos 300ms
        cargaMax:    0,      // carga máxima alcanzada en esta tensión
      },

      // Flechas en vuelo
      flechas: [],

      // Dianas
      dianas: [],

      // Efectos
      explosiones: [],
      textos:      [],
      particulas:  [],

      enCooldown: false,
    };

    this._generarDianas(reto.opciones, d.numDianas, tamMult * d.tamDiana);
    return this._state;
  },

  _generarDianas(opciones, num, tamMult) {
    const s = this._state;
    // Solo mitad SUPERIOR — y entre 0.08 y 0.48
    const posX = num === 2 ? [0.28, 0.72] : [0.18, 0.50, 0.82];
    const posY = [0.28, 0.22, 0.32];

    s.dianas = opciones.slice(0, num).map((opc, i) => {
      const tray = TRAYECTORIAS[i % TRAYECTORIAS.length];
      return {
        x:     posX[i] ?? (0.2+i*0.3),
        y:     posY[i] ?? 0.25,
        xBase: posX[i] ?? (0.2+i*0.3),
        yBase: posY[i] ?? 0.25,
        radio: s.radioDiana,
        texto: opc.texto,
        esCorrecto: opc.esCorrecto,
        trayectoria: tray,
        fase: Math.random()*Math.PI*2,
        velX: (Math.random()-0.5)*0.003,
        velY: 0,
        angCircular: Math.random()*Math.PI*2,
        rotacion: 0,
        velRot: (Math.random()-0.5)*0.012,
        destruida:   false,
        destroyTick: 0,
        fragmentos:  [],
        impactoTick: 0,
      };
    });
  },

  _nuevaRonda() {
    if (!this._state) return;
    const s = this._state;
    const reto = generarReto(s.materia);
    s.pregunta   = reto.pregunta;
    s.enCooldown = false;
    s.flechas    = [];
    this._generarDianas(reto.opciones, s.numDianas, s.radioDiana/62);
  },

  _agregarTexto(x, y, texto, color, tam) {
    this._state.textos.push({ x, y, texto, color, tam:tam||24, vida:70, vy:-2.5 });
  },

  _explotar(cx, cy, color, n) {
    const s = this._state;
    for (let i=0; i<(n||20); i++) {
      const ang = Math.random()*Math.PI*2;
      const spd = 2+Math.random()*6;
      s.particulas.push({
        x:cx, y:cy, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd-2,
        vida:30+Math.random()*20, vidaMax:50,
        color, size:2+Math.random()*4,
      });
    }
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;
    s.tick += delta;

    // Mover dianas
    s.dianas.forEach(d => {
      if (d.destruida) { d.destroyTick++; d.fragmentos.forEach(f => { f.x+=f.vx; f.y+=f.vy; f.vy+=0.2; f.vida--; }); d.fragmentos=d.fragmentos.filter(f=>f.vida>0); return; }
      if (d.impactoTick>0) d.impactoTick--;
      d.rotacion += d.velRot;
      switch(d.trayectoria) {
        case 'horizontal': d.x+=d.velX; if(d.x<0.08||d.x>0.92)d.velX*=-1; break;
        case 'circular':
          d.angCircular+=0.013;
          d.x=d.xBase+Math.cos(d.angCircular)*0.13;
          d.y=d.yBase+Math.sin(d.angCircular)*0.07;
          // Mantener en mitad superior
          d.y=Math.min(0.48, Math.max(0.08, d.y));
          break;
        case 'zigzag':
          d.x+=d.velX; if(d.x<0.08||d.x>0.92)d.velX*=-1;
          d.y=d.yBase+Math.sin(s.tick*0.03+d.fase)*0.06;
          d.y=Math.min(0.48, Math.max(0.08, d.y));
          break;
        case 'hover':
          d.x=d.xBase+Math.sin(s.tick*0.018+d.fase)*0.07;
          d.y=d.yBase+Math.cos(s.tick*0.014+d.fase)*0.04;
          d.y=Math.min(0.48, Math.max(0.08, d.y));
          break;
      }
    });

    // Actualizar partículas y efectos
    s.particulas.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=0.1; p.vida--; });
    s.particulas = s.particulas.filter(p=>p.vida>0);
    s.explosiones.forEach(e => { e.radio+=(e.maxRadio-e.radio)*0.2; e.vida--; });
    s.explosiones = s.explosiones.filter(e=>e.vida>0);
    s.textos.forEach(t => { t.y+=t.vy; t.vy*=0.93; t.vida--; });
    s.textos = s.textos.filter(t=>t.vida>0);

    // Mover flechas y detectar impacto
    let resultado = null;
    for (let fi=s.flechas.length-1; fi>=0; fi--) {
      const f = s.flechas[fi];
      f.trail.push({x:f.x, y:f.y});
      if (f.trail.length>14) f.trail.shift();
      f.x += f.vx;
      f.y += f.vy;
      f.vida--;

      if (f.x<-0.05||f.x>1.05||f.y<-0.05||f.y>1.05||f.vida<=0) {
        s.flechas.splice(fi,1); continue;
      }

      for (const diana of s.dianas) {
        if (diana.destruida) continue;
        const dist = Math.hypot(f.x-diana.x, f.y-diana.y);
        const radioN = diana.radio/canvasW;

        if (dist < radioN) {
          const pctDist = dist/radioN;
          const zona = pctDist < 0.25 ? 'headshot' : pctDist < 0.65 ? 'medio' : 'exterior';
          const xp   = XP_ZONA[zona];
          const esHS = zona === 'headshot';

          // Explosión en el punto de impacto
          const ix = f.x*canvasW, iy = f.y*canvasH;
          s.explosiones.push({ x:ix, y:iy, radio:0, maxRadio:diana.radio*(esHS?3:2), color:esHS?'#FFD700':diana.esCorrecto?'#00FF41':'#FF4444', vida:30, vidaMax:30 });

          diana.destruida = true;
          diana.fragmentos = Array.from({length:18},(_,i)=>{
            const ang=(i/18)*Math.PI*2;
            return { x:diana.x*canvasW, y:diana.y*canvasH, vx:Math.cos(ang)*(3+Math.random()*5), vy:Math.sin(ang)*(3+Math.random()*5)-2, vida:35+Math.random()*20, color:diana.esCorrecto?'#00FF41':'#FF4444', radio:diana.radio*0.12 };
          });

          s.flechas.splice(fi,1);
          _sfxArco.impacto(esHS);

          if (diana.esCorrecto) {
            this._explotar(ix,iy,'#FFD700',esHS?30:18);
            this._explotar(ix,iy,'#00FF41',12);
            this._agregarTexto(ix, iy-70,
              esHS ? `🎯 HEADSHOT! +${xp} XP` : zona==='medio' ? `✅ +${xp} XP` : `🏹 +${xp} XP`,
              esHS ? '#FFD700' : '#00FF41',
              esHS ? 30 : 24
            );
            try { SFX.acierto?.(); if(esHS) SFX.bonus?.(); } catch(_){}
            s.enCooldown = true;
            const t = setTimeout(()=>this._nuevaRonda(), s.cooldown);
            this._timers.push(t);
            resultado = { acierto:true, fallo:false, puntos:xp };
          } else {
            this._explotar(ix,iy,'#FF4444',15);
            this._agregarTexto(ix, iy-60, '❌ ¡Incorrecta!', '#FF4444');
            try { SFX.error?.(); } catch(_){}
            s.enCooldown = true;
            const t = setTimeout(()=>{ if(s) s.enCooldown=false; }, 700);
            this._timers.push(t);
            resultado = { acierto:false, fallo:true, puntos:s.puntosError };
          }
          break;
        }
      }
      if (resultado) break;
    }

    if (!landmarks) return resultado;

    const arco  = s.arco;
    const ahora = performance.now();

    // Landmarks relevantes
    const homL = landmarks[11], codL = landmarks[13], munL = landmarks[15];
    const homR = landmarks[12], codR = landmarks[14], munR = landmarks[16];
    if (!homL||!codL||!munL||!homR||!codR||!munR) return resultado;

    // Ángulos clave
    const angBrazoIzq = _angulo3(homL, codL, munL);
    const angCodoDer  = _angulo3(homR, codR, munR);

    // Brazo izq extendido = sosteniendo el arco (tolerante: 140°)
    const brazoIzqExtendido = angBrazoIzq > ANG_BRAZO_EXTENDIDO;

    // Carga: cuánto dobla el codo derecho
    const cargaRaw = brazoIzqExtendido
      ? Math.max(0, Math.min(1, (ANG_CARGA_INICIO - angCodoDer) / (ANG_CARGA_INICIO - ANG_CARGA_MAX)))
      : 0;

    if (!s.enCooldown) {
      if (brazoIzqExtendido && cargaRaw > 0.08) {
        // ── Cargando ──
        // Suavizar carga: no bajar bruscamente por 1 frame malo
        arco.carga = Math.max(arco.carga * 0.85, cargaRaw);
        arco.fase  = arco.carga > 0.92 ? 'listo' : 'cargando';
        if (arco.carga > arco.cargaMax) arco.cargaMax = arco.carga;

        // Sonido de carga progresivo
        const prevPct = Math.floor((arco.angPrevDer || 0) * 6);
        const currPct = Math.floor(arco.carga * 6);
        if (currPct > prevPct) _sfxArco.cargando(arco.carga);

        // ── Historial de ángulos: ventana deslizante ──
        arco.histAngulos.push({ ang: angCodoDer, t: ahora });
        // Eliminar entradas fuera de la ventana
        arco.histAngulos = arco.histAngulos.filter(e => ahora - e.t < VENTANA_DISPARO_MS);

        // Detectar disparo: ángulo mín en la ventana vs actual
        // Si en los últimos 300ms el codo pasó de doblado → extendido en ≥30°
        const coolOk = (ahora - arco.lastDisparo) > arco.cooldownMs;
        const cargaSuficiente = arco.cargaMax >= 0.25;

        if (coolOk && cargaSuficiente && arco.histAngulos.length >= 2) {
          const angMin = Math.min(...arco.histAngulos.map(e => e.ang));
          const extensionVentana = angCodoDer - angMin; // cuánto se extendió en la ventana

          if (extensionVentana >= ANG_DISPARO_DELTA) {
            // ¡DISPARAR! — usar la carga máxima acumulada
            const cargaDisparo = arco.cargaMax;
            arco.lastDisparo = ahora;
            arco.histAngulos = [];
            arco.cargaMax    = 0;

            const vel = s.velBase * (0.55 + cargaDisparo * 0.9);

            // Dirección: hombro izq → muñeca izq (espejado)
            const ex = n => (1-n.x);
            const ey = n => n.y;
            const dx = ex(munL) - ex(homL);
            const dy = ey(munL) - ey(homL);
            const len = Math.hypot(dx,dy) || 1;

            s.flechas.push({
              x: ex(munL), y: ey(munL),
              vx: (dx/len)*vel, vy: (dy/len)*vel,
              vida: 90, vidaMax: 90,
              trail: [],
              carga: cargaDisparo,
            });

            _sfxArco.disparo(cargaDisparo);
            arco.carga = 0;
            arco.fase  = 'disparando';
          }
        }

      } else {
        // Sin carga — decrementar suavemente (no reseteo brusco por frame malo)
        arco.carga = Math.max(0, arco.carga - 0.04);
        if (arco.carga < 0.05) {
          arco.carga    = 0;
          arco.cargaMax = 0;
          arco.histAngulos = [];
          arco.fase = 'espera';
        }
      }
    }

    arco.angPrevDer = arco.carga; // guardar % carga previo para sonido
    return resultado;
  },

  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    // Fondo pregunta
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.68)';
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(canvasW*0.05,14,canvasW*0.90,112,14);
    else ctx.rect(canvasW*0.05,14,canvasW*0.90,112);
    ctx.fill(); ctx.restore();

    ctx.save();
    ctx.textAlign='center';
    ctx.font='bold 40px Orbitron, sans-serif';
    ctx.fillStyle='#FFFFFF'; ctx.shadowBlur=14; ctx.shadowColor=s.colorTema;
    ctx.fillText(s.pregunta, canvasW/2, 70);
    ctx.font='18px Rajdhani, sans-serif';
    ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.shadowBlur=0;
    const instr = s.arco.fase==='espera'   ? '🏹 Extiende el brazo izquierdo y tensa con el derecho' :
                  s.arco.fase==='cargando' ? `⚡ Tensando... ${Math.round(s.arco.carga*100)}%` :
                  s.arco.fase==='listo'    ? '🔥 ¡CARGA MÁXIMA! Suelta' : '💨 ...';
    ctx.fillText(instr, canvasW/2, 108);
    ctx.restore();

    // Explosiones
    s.explosiones.forEach(e => {
      ctx.save();
      ctx.globalAlpha = e.vida/e.vidaMax;
      ctx.strokeStyle = e.color; ctx.lineWidth=3;
      ctx.shadowBlur=20; ctx.shadowColor=e.color;
      ctx.beginPath(); ctx.arc(e.x,e.y,Math.max(0.5,e.radio),0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha = (e.vida/e.vidaMax)*0.3;
      ctx.fillStyle=e.color;
      ctx.beginPath(); ctx.arc(e.x,e.y,Math.max(0.5,e.radio*0.6),0,Math.PI*2); ctx.fill();
      ctx.restore();
    });

    // Partículas
    s.particulas.forEach(p => {
      const a=Math.max(0,p.vida/p.vidaMax);
      ctx.save(); ctx.globalAlpha=a;
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0.1,p.size*a),0,Math.PI*2);
      ctx.fillStyle=p.color; ctx.shadowBlur=6; ctx.shadowColor=p.color; ctx.fill(); ctx.restore();
    });

    // Flechas
    s.flechas.forEach(f => {
      const fx=f.x*canvasW, fy=f.y*canvasH;
      const ang = Math.atan2(f.vy, f.vx);
      const potencia = f.carga;

      // Trail
      if (f.trail.length>1) {
        for (let i=1;i<f.trail.length;i++) {
          const t=i/f.trail.length;
          ctx.save();
          ctx.globalAlpha=t*0.5*(f.vida/f.vidaMax);
          ctx.strokeStyle=potencia>0.7?'#FFD700':'#00CCFF';
          ctx.lineWidth=t*(6+potencia*6);
          ctx.lineCap='round';
          ctx.shadowBlur=12; ctx.shadowColor=potencia>0.7?'#FFD700':'#00CCFF';
          ctx.beginPath();
          ctx.moveTo(f.trail[i-1].x*canvasW,f.trail[i-1].y*canvasH);
          ctx.lineTo(f.trail[i].x*canvasW,f.trail[i].y*canvasH);
          ctx.stroke(); ctx.restore();
        }
      }

      // Cuerpo de la flecha
      ctx.save();
      ctx.translate(fx,fy); ctx.rotate(ang);
      const alpha=f.vida/f.vidaMax;
      ctx.globalAlpha=alpha;

      // Halo exterior
      ctx.shadowBlur=20; ctx.shadowColor=potencia>0.7?'#FFD700':'#00AAFF';

      // Asta (cuerpo)
      const largo=32+potencia*20;
      const grad=ctx.createLinearGradient(-largo,0,10,0);
      grad.addColorStop(0,'rgba(0,200,255,0)');
      grad.addColorStop(0.4,potencia>0.7?'#FFD700':'#00AAFF');
      grad.addColorStop(1,'#FFFFFF');
      ctx.strokeStyle=grad; ctx.lineWidth=3+potencia*3; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-largo,0); ctx.lineTo(8,0); ctx.stroke();

      // Punta (triángulo)
      ctx.fillStyle='#FFFFFF';
      ctx.shadowBlur=15; ctx.shadowColor=potencia>0.7?'#FFD700':'#00AAFF';
      ctx.beginPath();
      ctx.moveTo(14,0); ctx.lineTo(4,-5); ctx.lineTo(4,5); ctx.closePath();
      ctx.fill();

      // Plumas traseras
      ctx.strokeStyle=potencia>0.7?'#FFD700':'#00AAFF';
      ctx.lineWidth=2; ctx.shadowBlur=8;
      [[-largo+5,-8],[-largo+5,8],[-largo+12,-6],[-largo+12,6]].forEach(([x,y])=>{
        ctx.beginPath(); ctx.moveTo(-largo,0); ctx.lineTo(x,y); ctx.stroke();
      });

      ctx.restore();
    });

    // Dianas
    s.dianas.forEach(diana => {
      const dx=diana.x*canvasW, dy=diana.y*canvasH, r=diana.radio;

      if (diana.destruida) {
        diana.fragmentos.forEach(f => {
          ctx.save(); ctx.globalAlpha=Math.max(0,f.vida/55);
          ctx.fillStyle=f.color; ctx.shadowBlur=6; ctx.shadowColor=f.color;
          ctx.beginPath(); ctx.arc(f.x,f.y,f.radio,0,Math.PI*2); ctx.fill(); ctx.restore();
        });
        return;
      }

      ctx.save();
      ctx.translate(dx,dy); ctx.rotate(diana.rotacion);

      // Anillos concéntricos estilo diana
      const coloresAnillos = ['#E63946','#FFFFFF','#2196F3','#FFD700','#E63946'];
      const fracRadios     = [1, 0.76, 0.54, 0.32, 0.14];
      fracRadios.forEach((fr,i) => {
        const ar = Math.max(0.5,r*fr);
        ctx.beginPath(); ctx.arc(0,0,ar,0,Math.PI*2);
        ctx.fillStyle=coloresAnillos[i];
        ctx.shadowBlur=i===0?14:0; ctx.shadowColor=coloresAnillos[0];
        ctx.fill();
      });

      // Borde con color según correcto/incorrecto
      ctx.strokeStyle=diana.esCorrecto?'#00FF41AA':'rgba(255,255,255,0.2)';
      ctx.lineWidth=diana.esCorrecto?3:1.5;
      ctx.shadowBlur=diana.esCorrecto?18:0; ctx.shadowColor='#00FF41';
      ctx.beginPath(); ctx.arc(0,0,r+5,0,Math.PI*2); ctx.stroke();

      // Retícula
      ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1.5; ctx.shadowBlur=0;
      ctx.beginPath();
      ctx.moveTo(-r*1.1,0); ctx.lineTo(-r*0.18,0);
      ctx.moveTo(r*0.18,0); ctx.lineTo(r*1.1,0);
      ctx.moveTo(0,-r*1.1); ctx.lineTo(0,-r*0.18);
      ctx.moveTo(0,r*0.18); ctx.lineTo(0,r*1.1);
      ctx.stroke();

      ctx.restore();

      // Texto respuesta sobre la diana
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font='bold 18px Orbitron, sans-serif';
      const palabras=diana.texto.split(' ');
      let lineas=[],linea='';
      const maxW=r*1.4;
      palabras.forEach(w=>{
        const t=linea+w+' ';
        if(ctx.measureText(t).width>maxW&&linea){lineas.push(linea.trim());linea=w+' ';}else linea=t;
      });
      if(linea) lineas.push(linea.trim());
      const lineH=20, bH=lineas.length*lineH+10;
      const bW=Math.min(r*1.9,Math.max(...lineas.map(l=>ctx.measureText(l).width))+18);
      ctx.fillStyle='rgba(0,0,0,0.72)'; ctx.shadowBlur=0;
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(dx-bW/2,dy-bH/2,bW,bH,6);
      else ctx.rect(dx-bW/2,dy-bH/2,bW,bH);
      ctx.fill();
      ctx.fillStyle='#FFFFFF'; ctx.shadowBlur=4; ctx.shadowColor='#FFF';
      lineas.forEach((l,i)=>ctx.fillText(l,dx,dy+(i-(lineas.length-1)/2)*lineH));
      ctx.restore();

      // Indicadores de zona XP (solo en diana correcta)
      if (diana.esCorrecto) {
        ctx.save();
        ctx.globalAlpha=0.25+Math.sin(s.tick*0.06)*0.1;
        ctx.strokeStyle='#FFD700'; ctx.lineWidth=1.5; ctx.setLineDash([3,4]);
        ctx.shadowBlur=8; ctx.shadowColor='#FFD700';
        ctx.beginPath(); ctx.arc(dx,dy,r*0.25,0,Math.PI*2); ctx.stroke(); // headshot
        ctx.strokeStyle='rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(dx,dy,r*0.65,0,Math.PI*2); ctx.stroke(); // medio
        ctx.setLineDash([]);
        ctx.restore();
      }
    });

    // Textos flotantes
    s.textos.forEach(t => {
      ctx.save();
      ctx.globalAlpha=Math.min(1,t.vida/20);
      ctx.textAlign='center';
      ctx.font=`bold ${t.tam}px Orbitron, sans-serif`;
      ctx.fillStyle=t.color; ctx.shadowBlur=16; ctx.shadowColor=t.color;
      ctx.fillText(t.texto,t.x,t.y);
      ctx.restore();
    });
  },

  // ── Render del arco de luz en los brazos ───────────────
  renderBrazos(ctx, landmarks, canvasW, canvasH) {
    const s = this._state;
    if (!s||!landmarks) return;

    const arco  = s.arco;
    const ex    = n => (1-n.x)*canvasW;
    const ey    = n => n.y*canvasH;

    const homL=landmarks[11], codL=landmarks[13], munL=landmarks[15];
    const homR=landmarks[12], codR=landmarks[14], munR=landmarks[16];
    if (!homL||!munL) return;

    const hLx=ex(homL),hLy=ey(homL);
    const mLx=ex(munL),mLy=ey(munL);
    const carga=arco.carga;

    // ── Arco de luz (mano izquierda) ──
    // Dirección del brazo izq
    const dirX=mLx-hLx, dirY=mLy-hLy;
    const len=Math.hypot(dirX,dirY)||1;
    const ux=dirX/len, uy=dirY/len;
    // Perpendicular
    const px=-uy, py=ux;

    const arcR = 55 + carga*20; // radio del arco

    // Centro del arco = en la muñeca izq
    const acx=mLx, acy=mLy;

    // Puntas del arco (arriba y abajo del eje del brazo)
    const p1x=acx+px*arcR, p1y=acy+py*arcR;
    const p2x=acx-px*arcR, p2y=acy-py*arcR;

    // Color del arco según carga
    const colorArco = carga>0.7
      ? `hsl(${45-carga*45},100%,60%)` // dorado al rojo
      : `hsl(${200+carga*20},100%,60%)`; // azul→cian

    // Halo del arco
    ctx.save();
    ctx.globalAlpha=0.3+carga*0.3;
    ctx.strokeStyle=colorArco; ctx.lineWidth=18+carga*12;
    ctx.lineCap='round';
    ctx.shadowBlur=25+carga*20; ctx.shadowColor=colorArco;
    ctx.beginPath();
    ctx.moveTo(p1x,p1y);
    ctx.quadraticCurveTo(acx-ux*arcR*0.6, acy-uy*arcR*0.6, p2x,p2y);
    ctx.stroke(); ctx.restore();

    // Cuerpo del arco
    ctx.save();
    ctx.strokeStyle=colorArco; ctx.lineWidth=6+carga*4;
    ctx.lineCap='round';
    ctx.shadowBlur=15; ctx.shadowColor=colorArco;
    ctx.beginPath();
    ctx.moveTo(p1x,p1y);
    ctx.quadraticCurveTo(acx-ux*arcR*0.6, acy-uy*arcR*0.6, p2x,p2y);
    ctx.stroke(); ctx.restore();

    // ── Cuerda tensada ──
    if (carga > 0.05) {
      // Punto de tensión = muñeca derecha
      const mRx = munR ? ex(munR) : acx;
      const mRy = munR ? ey(munR) : acy;

      // La cuerda va de p1 → muñeca derecha → p2
      ctx.save();
      ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=2+carga*3;
      ctx.globalAlpha=0.6+carga*0.4;
      ctx.shadowBlur=10+carga*15; ctx.shadowColor=colorArco;
      ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(p1x,p1y);
      ctx.lineTo(mRx,mRy);
      ctx.lineTo(p2x,p2y);
      ctx.stroke();

      // Flecha en la cuerda (pre-vuelo)
      const fAngulo=Math.atan2(mLy-hLy, mLx-hLx);
      ctx.save();
      ctx.translate(mRx,mRy); ctx.rotate(fAngulo);
      ctx.globalAlpha=carga;
      ctx.strokeStyle=carga>0.7?'#FFD700':'#00AAFF';
      ctx.lineWidth=3+carga*4; ctx.lineCap='round';
      ctx.shadowBlur=14; ctx.shadowColor=ctx.strokeStyle;
      const fLen=28+carga*22;
      ctx.beginPath(); ctx.moveTo(-fLen,0); ctx.lineTo(8,0); ctx.stroke();
      // Punta
      ctx.fillStyle='#FFFFFF'; ctx.shadowBlur=10;
      ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(4,-4); ctx.lineTo(4,4); ctx.closePath(); ctx.fill();
      ctx.restore();

      ctx.restore();

      // Barra de carga
      if (carga>0.08) {
        const barW=canvasW*0.35, barX=canvasW/2-barW/2, barY=canvasH*0.87;
        ctx.save();
        ctx.fillStyle='rgba(0,0,0,0.6)';
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(barX-2,barY-2,barW+4,18,8);
        else ctx.rect(barX-2,barY-2,barW+4,18);
        ctx.fill();
        ctx.fillStyle=colorArco; ctx.shadowBlur=12; ctx.shadowColor=colorArco;
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(barX,barY,Math.max(0,barW*carga),14,6);
        else ctx.rect(barX,barY,Math.max(0,barW*carga),14);
        ctx.fill();
        ctx.fillStyle='#FFFFFF'; ctx.font='bold 11px Orbitron'; ctx.textAlign='center';
        ctx.shadowBlur=0; ctx.textBaseline='middle';
        ctx.fillText(carga>=0.95?'⚡ ¡SUELTA!': `${Math.round(carga*100)}%`, canvasW/2, barY+7);
        ctx.restore();
      }
    } else {
      // Sin carga — cuerda relajada (curva suave)
      ctx.save();
      ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(p1x,p1y); ctx.lineTo(p2x,p2y); ctx.stroke();
      ctx.restore();
    }

    // Orbe en muñeca izquierda (punto de apoyo del arco)
    ctx.save();
    const pulso=0.8+Math.sin(s.tick*0.12)*0.2;
    const orbR=Math.max(0.5,10*pulso);
    ctx.globalAlpha=0.85;
    ctx.beginPath(); ctx.arc(mLx,mLy,orbR,0,Math.PI*2);
    const og=ctx.createRadialGradient(mLx,mLy,0,mLx,mLy,orbR);
    og.addColorStop(0,'#FFFFFF'); og.addColorStop(0.5,colorArco); og.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=og; ctx.shadowBlur=14; ctx.shadowColor=colorArco; ctx.fill(); ctx.restore();
  },

  getState() { return this._state; },
};