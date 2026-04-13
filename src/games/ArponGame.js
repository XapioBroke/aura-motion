// ============================================================
//  ARPÓN GAME v2.0
//
//  GESTO 1 — APARECER ARPÓN:
//    Manos juntas (muñecas < 20% canvas de distancia) → 0.4s
//    → arpón/colmillo aparece brillando en la mano derecha
//
//  GESTO 2 — LANZAR:
//    Brazo derecho levantado por encima del hombro (muñeca Y < hombro Y - 8%)
//    con brazo relativamente extendido (ángulo codo > 110°)
//    → arpón se lanza en dirección del brazo
//
//  SI FALLA: arpón se retrae, puede repetir gesto lanzar
//  SI ACIERTA: cofre cae al suelo → explota → oro/ánimas
//    Alumno debe juntar manos de nuevo para siguiente arpón
//
//  RACHA: cada 4 correctos → cofre plateado extra (300-1000 XP)
//  BONO: +10% XP por consecutivo, tope 50%
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

// ── Helper roundRect compatible ───────────────────────────
const _rrect = (ctx, x, y, w, h, r = 8) => {
  const R = typeof r === 'number' ? [r,r,r,r] : (r.length===4?r:[r[0],r[0],r[0],r[0]]);
  ctx.beginPath();
  ctx.moveTo(x+R[0],y); ctx.lineTo(x+w-R[1],y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+R[1]);
  ctx.lineTo(x+w,y+h-R[2]);
  ctx.quadraticCurveTo(x+w,y+h,x+w-R[2],y+h);
  ctx.lineTo(x+R[3],y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-R[3]);
  ctx.lineTo(x,y+R[0]);
  ctx.quadraticCurveTo(x,y,x+R[0],y);
  ctx.closePath();
};

// ── XP por intento ────────────────────────────────────────
const XP_INTENTO = [150, 100, 50];
const BONO_PCT   = 0.10;
const BONO_MAX   = 0.50;

// ── Config por dificultad ─────────────────────────────────
const DIF_MAP = {
  facil:   { velArpon: 0.10,  numCofres: 2, puntosError: -10, tamCofre: 1.2 },
  medio:   { velArpon: 0.13,  numCofres: 3, puntosError: -12, tamCofre: 1.0 },
  dificil: { velArpon: 0.17,  numCofres: 3, puntosError: -15, tamCofre: 0.85 },
};

const COLORES_CADENA = ['#FFD700','#FF6600','#00FFCC','#FF00CC'];

// ── Ángulos ───────────────────────────────────────────────
const _ang3 = (a, b, c) => {
  if (!a||!b||!c) return 180;
  const ab={x:a.x-b.x,y:a.y-b.y}, cb={x:c.x-b.x,y:c.y-b.y};
  const dot=ab.x*cb.x+ab.y*cb.y;
  const mag=Math.hypot(ab.x,ab.y)*Math.hypot(cb.x,cb.y);
  return mag===0?180:(Math.acos(Math.max(-1,Math.min(1,dot/mag)))*180)/Math.PI;
};

// ── Sonidos ───────────────────────────────────────────────
const _sfx = (() => {
  let actx = null;
  const ac = () => {
    if (!actx) actx = new (window.AudioContext||window.webkitAudioContext)();
    if (actx.state==='suspended') actx.resume();
    return actx;
  };
  return {
    aparecer() {
      try {
        const c=ac(),t=c.currentTime;
        [300,600,900].forEach((f,i)=>{
          const o=c.createOscillator(),g=c.createGain();
          o.type='triangle'; o.frequency.setValueAtTime(f,t+i*0.04);
          g.gain.setValueAtTime(0.12,t+i*0.04); g.gain.exponentialRampToValueAtTime(0.001,t+i*0.04+0.15);
          o.connect(g); g.connect(c.destination); o.start(t+i*0.04); o.stop(t+i*0.04+0.18);
        });
      } catch(_){}
    },
    lanzar() {
      try {
        const c=ac(),t=c.currentTime;
        const o=c.createOscillator(),g=c.createGain();
        o.type='sawtooth'; o.frequency.setValueAtTime(700,t);
        o.frequency.exponentialRampToValueAtTime(150,t+0.22);
        g.gain.setValueAtTime(0.22,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.25);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+0.28);
      } catch(_){}
    },
    retractar() {
      try {
        const c=ac(),t=c.currentTime;
        const o=c.createOscillator(),g=c.createGain();
        o.type='sine'; o.frequency.setValueAtTime(200,t);
        o.frequency.linearRampToValueAtTime(400,t+0.12);
        g.gain.setValueAtTime(0.10,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.15);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+0.18);
      } catch(_){}
    },
    encaje() {
      try {
        const c=ac(),t=c.currentTime;
        const o=c.createOscillator(),g=c.createGain();
        o.type='square'; o.frequency.setValueAtTime(350,t);
        o.frequency.linearRampToValueAtTime(200,t+0.12);
        g.gain.setValueAtTime(0.25,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.18);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+0.2);
      } catch(_){}
    },
    impactoSuelo() {
      try {
        const c=ac(),t=c.currentTime;
        const o=c.createOscillator(),g=c.createGain();
        o.type='sawtooth'; o.frequency.setValueAtTime(120,t);
        o.frequency.exponentialRampToValueAtTime(30,t+0.35);
        g.gain.setValueAtTime(0.4,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.4);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+0.45);
      } catch(_){}
    },
    monedas() {
      try {
        const c=ac(),t=c.currentTime;
        [800,1000,1200,900,1100,700,1300].forEach((f,i)=>{
          const o=c.createOscillator(),g=c.createGain();
          o.type='triangle'; o.frequency.setValueAtTime(f,t+i*0.06);
          g.gain.setValueAtTime(0.12,t+i*0.06); g.gain.exponentialRampToValueAtTime(0.001,t+i*0.06+0.15);
          o.connect(g); g.connect(c.destination); o.start(t+i*0.06); o.stop(t+i*0.06+0.18);
        });
      } catch(_){}
    },
    animas() {
      try {
        const c=ac(),t=c.currentTime;
        const o=c.createOscillator(),g=c.createGain();
        o.type='sine'; o.frequency.setValueAtTime(220,t);
        o.frequency.setValueAtTime(180,t+0.3); o.frequency.setValueAtTime(200,t+0.6);
        g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.18,t+0.2);
        g.gain.exponentialRampToValueAtTime(0.001,t+1.5);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+1.6);
      } catch(_){}
    },
    cofrePlateado() {
      try {
        const c=ac(),t=c.currentTime;
        [523,659,784,1047].forEach((f,i)=>{
          const o=c.createOscillator(),g=c.createGain();
          o.type='sine'; o.frequency.setValueAtTime(f,t+i*0.08);
          g.gain.setValueAtTime(0.18,t+i*0.08); g.gain.exponentialRampToValueAtTime(0.001,t+i*0.08+0.4);
          o.connect(g); g.connect(c.destination); o.start(t+i*0.08); o.stop(t+i*0.08+0.45);
        });
      } catch(_){}
    },
  };
})();

// ── Generar cofres ────────────────────────────────────────
const _generarCofres = (reto, num, W, H) => {
  const opts  = reto.opciones.slice(0, num);
  const zonas = [
    { x: 0.22, y: 0.16 },
    { x: 0.50, y: 0.14 },
    { x: 0.78, y: 0.16 },
  ].slice(0, num);
  return opts.map((opc, i) => ({
    x: zonas[i].x * W,
    y: zonas[i].y * H,
    yBase: zonas[i].y * H,
    w: 110, h: 80,
    texto:    opc.texto,
    correcto: opc.esCorrecto,
    estado:   'flotando',   // flotando|cayendo|suelo|muerto|animas
    vy:       0,            // velocidad caída
    jalones:  0,
    shakeX:   0, shakeY: 0, shakeTick: 0,
    animasTick: 0,
    particulas: [],
    floatFase: Math.random()*Math.PI*2,
  }));
};

// ══════════════════════════════════════════════════════════
export const ArponGame = {
  _state:  null,
  _timers: [],

  init(materia, colorTema, config = {}) {
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
    const dif = config.dificultad || 'medio';
    const d   = DIF_MAP[dif] || DIF_MAP.medio;

    this._state = {
      materia, colorTema, dif,
      velArpon:    d.velArpon,
      numCofres:   d.numCofres,
      puntosError: d.puntosError,
      tamCofre:    d.tamCofre,

      pregunta: '',
      cofres:   null,
      inicializado: false,

      // ── Estado arpón ──────────────────────────────────
      faseArpon: 'sinArpon',
      // sinArpon → juntando → listo → volando → encajado → retractando

      // Juntar manos
      juntandoTick: 0,
      FRAMES_JUNTAR: 20,   // ~0.33s — más rápido de activar
      lastLanzado: 0,      // cooldown entre lanzamientos

      // Arpón en vuelo / encajado
      arpon: null,
      // { x,y, vx,vy, trail[], encajadoEn, encajadoPlateado, origenX, origenY }

      // Retracción
      retractando: false,
      retractTick: 0,

      // Jalón (muñeca baja rápido)
      munY_prev: null, munY_t: 0,
      UMBRAL_JALON: 0.06,
      lastJalon: 0,        // cooldown entre jalones
      COOLDOWN_JALON: 400, // ms mínimo entre jalones

      // Intentos
      intentoActual: 0,

      // Racha / bono
      rachaCons: 0,
      bonoPct:   0,

      // Cofre plateado
      cofrePlateado:  null,
      relampago: false, relTick: 0,

      // Flash
      flashColor: null, flashTick: 0,

      // Posición muñeca derecha para dibujar colmillo
      munRX: 0.5, munRY: 0.5,

      tick: 0,
      fase: 'jugando',
    };
    return this._state;
  },

  _nuevaRonda(W, H) {
    const s = this._state;
    const reto = generarReto(s.materia);
    s.pregunta      = reto.pregunta;
    s._reto         = reto;
    s.cofres        = _generarCofres(reto, s.numCofres, W, H);
    s.arpon         = null;
    s.faseArpon     = 'sinArpon';
    s.juntandoTick  = 0;
    s.retractando   = false;
    s.intentoActual = 0;
    s.munY_prev     = null;
  },

  _checkCofrePlateado(W, H) {
    const s = this._state;
    if (s.rachaCons > 0 && s.rachaCons % 4 === 0 && !s.cofrePlateado) {
      const xp = Math.floor(Math.random()*701)+300;
      s.cofrePlateado = {
        x: W*0.50, y: H*0.12,
        yBase: H*0.12,
        w: 130, h: 95,
        xp, jalones: 0,
        estado: 'flotando',
        shakeX:0, shakeY:0, shakeTick:0,
        floatFase:0, particulas:[],
        vy: 0,
      };
      _sfx.cofrePlateado();
    }
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s || s.fase==='fin') return null;
    const W = canvasW, H = canvasH;
    s.tick += delta;
    s._landmarks = landmarks;

    // ── Init primera vez ─────────────────────────────────
    if (!s.inicializado) {
      const reto = generarReto(s.materia);
      s.pregunta = reto.pregunta;
      s._reto    = reto;
      s.cofres   = _generarCofres(reto, s.numCofres, W, H);
      s.inicializado = true;
      return null;
    }

    // ── Flash / relámpago fade ────────────────────────────
    if (s.relampago) { s.relTick+=delta; if(s.relTick>45){s.relampago=false;s.relTick=0;} }
    if (s.flashColor){ s.flashTick+=delta; if(s.flashTick>25){s.flashColor=null;s.flashTick=0;} }

    // ── Animar cofres ─────────────────────────────────────
    s.cofres?.forEach(cf => {
      if (!cf) return;
      // Flotar
      if (cf.estado==='flotando') {
        cf.floatFase += 0.025*delta;
        cf.y = cf.yBase + Math.sin(cf.floatFase)*8;
      }
      // Caer con gravedad
      if (cf.estado==='cayendo') {
        cf.vy += 4.5 * delta * 0.06;
        cf.y  += cf.vy;
        if (cf.y + cf.h * s.tamCofre / 2 >= H*0.88) {
          cf.y      = H*0.88 - cf.h*s.tamCofre/2;
          cf.estado = 'suelo';
          cf.vy     = 0;
          _sfx.impactoSuelo();
          // Generar partículas al estrellarse
          if (cf.correcto) this._generarOro(cf, W, H);
          else             this._generarAnimas(cf);
          if (cf.correcto) _sfx.monedas();
          else             _sfx.animas();
          // Limpiar después de 2s
          this._timers.push(setTimeout(()=>{ if(cf) cf.estado='muerto'; }, 1800));
        }
      }
      // Ánimas evaporar
      if (cf.estado==='animas') {
        cf.animasTick+=delta;
        if (cf.animasTick>150) {
          cf.estado='muerto';
          this._verificarReinicio(W,H);
        }
      }
      // Shake
      if (cf.shakeTick>0) {
        cf.shakeTick-=delta;
        cf.shakeX = Math.sin(s.tick*0.9)*9*(cf.shakeTick/20);
        if (cf.shakeTick<=0){cf.shakeX=0;cf.shakeY=0;}
      }
      // Partículas
      cf.particulas = cf.particulas.filter(p=>p.vida>0);
      cf.particulas.forEach(p=>{
        p.x+=p.vx*delta*0.06; p.y+=p.vy*delta*0.06;
        p.vy+=0.4*delta*0.06; p.vida-=delta*0.05; p.rot+=p.rotVel;
      });
    });

    // Cofre plateado
    if (s.cofrePlateado) {
      const cp = s.cofrePlateado;
      if (cp.estado==='flotando') {
        cp.floatFase+=0.03*delta;
        cp.y = cp.yBase + Math.sin(cp.floatFase)*10;
        if(cp.shakeTick>0){cp.shakeTick-=delta;cp.shakeX=Math.sin(s.tick*0.9)*10*(cp.shakeTick/20);}
      }
      if (cp.estado==='cayendo') {
        cp.vy+=4.5*delta*0.06; cp.y+=cp.vy;
        if (cp.y+cp.h/2>=H*0.88) {
          cp.y=H*0.88-cp.h/2; cp.estado='suelo'; cp.vy=0;
          _sfx.impactoSuelo();
          this._generarOroEpico(cp,W,H);
          _sfx.monedas(); _sfx.monedas();
          s.relampago=true; s.relTick=0;
          this._timers.push(setTimeout(()=>{ if(s) s.cofrePlateado=null; },2500));
          s.flashColor='#FFFFFF'; s.flashTick=0;
          return { acierto:true, fallo:false, puntos:cp.xp, mensaje:`⚡ ¡COFRE LEGENDARIO! +${cp.xp} XP` };
        }
      }
      cp.particulas = cp.particulas.filter(p=>p.vida>0);
      cp.particulas.forEach(p=>{
        p.x+=p.vx*delta*0.06; p.y+=p.vy*delta*0.06;
        p.vy+=0.4*delta*0.06; p.vida-=delta*0.05; p.rot+=p.rotVel;
      });
    }

    if (!landmarks) return null;

    const ex  = n => (1-n.x);
    const ey  = n => n.y;
    const toW = n => ex(n)*W;
    const toH = n => ey(n)*H;

    const homL=landmarks[11], homR=landmarks[12];
    const codR=landmarks[14];
    const munL=landmarks[15], munR=landmarks[16];

    // Guardar posición muñeca der para dibujar colmillo
    if (munR) { s.munRX=ex(munR); s.munRY=ey(munR); }

    // ── GESTO 1: JUNTAR MANOS → aparecer arpón ────────────
    if (s.faseArpon==='sinArpon') {
      if (munL && munR) {
        // Usar coords en pixeles para distancia consistente en cualquier pantalla
        const mx1 = ex(munL)*W, my1 = ey(munL)*H;
        const mx2 = ex(munR)*W, my2 = ey(munR)*H;
        const distPx = Math.hypot(mx1-mx2, my1-my2);
        const umbralPx = W * 0.22;  // 22% del ancho de pantalla
        if (distPx < umbralPx) {
          s.juntandoTick += delta;
          if (s.juntandoTick >= s.FRAMES_JUNTAR) {
            s.faseArpon    = 'listo';
            s.juntandoTick = 0;
            _sfx.aparecer();
          }
        } else {
          s.juntandoTick = Math.max(0, s.juntandoTick - delta*0.8);
        }
      }
      return null;
    }

    // ── Retracción ────────────────────────────────────────
    if (s.retractando) {
      s.retractTick += delta;
      if (s.arpon) {
        // Regresar hacia origen
        const ox = s.arpon.origenX, oy = s.arpon.origenY;
        const dx = ox - s.arpon.x, dy = oy - s.arpon.y;
        const dist = Math.hypot(dx,dy);
        if (dist < 15 || s.retractTick > 40) {
          s.arpon       = null;
          s.retractando = false;
          s.retractTick = 0;
          s.faseArpon   = 'listo';  // puede lanzar de nuevo sin juntar
        } else {
          const vel = 0.28;
          s.arpon.x += (dx/dist)*dist*vel;
          s.arpon.y += (dy/dist)*dist*vel;
        }
      } else {
        s.retractando=false; s.retractTick=0; s.faseArpon='listo';
      }
      return null;
    }

    // ── GESTO 2: LANZAR — brazo der encima del hombro ─────
    if (s.faseArpon==='listo' && !s.arpon) {
      if (homR && munR && codR) {
        const angCodoDer = _ang3(homR, codR, munR);
        const brazoExtendido = angCodoDer > 100;   // más tolerante
        // Muñeca por encima del hombro — umbral en píxeles
        const munRpx = ey(munR)*H, homRpx = ey(homR)*H;
        const encimaDElHombro = munRpx < homRpx - H*0.04;  // 4% altura

        const ahora = performance.now();
        const coolOk = (ahora - (s.lastLanzado||0)) > 600;
        if (brazoExtendido && encimaDElHombro && coolOk) {
          s.lastLanzado = ahora;
          // Dirección: hombro der → muñeca der (espejado)
          const dx = ex(munR) - ex(homR);
          const dy = ey(munR) - ey(homR);
          const len = Math.hypot(dx,dy) || 1;
          const vel = s.velArpon;

          s.arpon = {
            x: toW(munR), y: toH(munR),
            vx: (dx/len)*vel*W,
            vy: (dy/len)*vel*H,
            trail: [],
            encajadoEn:       null,
            encajadoPlateado: false,
            origenX: toW(munR),
            origenY: toH(munR),
          };
          s.faseArpon = 'volando';
          _sfx.lanzar();
        }
      }
    }

    // ── MOVER ARPÓN ───────────────────────────────────────
    if (s.arpon && s.faseArpon==='volando') {
      s.arpon.trail.push({x:s.arpon.x, y:s.arpon.y});
      if (s.arpon.trail.length>16) s.arpon.trail.shift();

      s.arpon.x += s.arpon.vx*delta*0.06;
      s.arpon.y += s.arpon.vy*delta*0.06;

      // Fuera de pantalla → retraer
      if (s.arpon.x<-50||s.arpon.x>W+50||s.arpon.y<-50||s.arpon.y>H+50) {
        _sfx.retractar();
        s.retractando=true; s.retractTick=0;
        s.faseArpon='retractando';
        return null;
      }

      // Colisión cofres normales
      for (const cf of s.cofres) {
        if (cf.estado!=='flotando') continue;
        const hw=(cf.w*s.tamCofre)/2, hh=(cf.h*s.tamCofre)/2;
        if (s.arpon.x>cf.x-hw&&s.arpon.x<cf.x+hw&&s.arpon.y>cf.y-hh&&s.arpon.y<cf.y+hh) {
          s.arpon.encajadoEn = cf;
          cf.estado = 'encajado';
          s.faseArpon = 'encajado';
          _sfx.encaje();
          break;
        }
      }

      // Colisión cofre plateado
      if (!s.arpon.encajadoEn && s.cofrePlateado?.estado==='flotando') {
        const cp=s.cofrePlateado;
        if (s.arpon.x>cp.x-cp.w/2&&s.arpon.x<cp.x+cp.w/2&&s.arpon.y>cp.y-cp.h/2&&s.arpon.y<cp.y+cp.h/2) {
          s.arpon.encajadoPlateado=true;
          cp.estado='encajado'; s.faseArpon='encajado';
          _sfx.encaje();
        }
      }
    }

    // Arpón encajado sigue al cofre
    if (s.arpon?.encajadoEn) {
      const cf=s.arpon.encajadoEn;
      s.arpon.x=cf.x; s.arpon.y=cf.y-(cf.h*s.tamCofre)/2;
    }
    if (s.arpon?.encajadoPlateado&&s.cofrePlateado) {
      s.arpon.x=s.cofrePlateado.x; s.arpon.y=s.cofrePlateado.y-s.cofrePlateado.h/2;
    }

    // ── JALÓN: muñeca baja rápido ─────────────────────────
    if (s.faseArpon==='encajado' && munR) {
      const munYN  = ey(munR);
      const tAhora = performance.now();
      if (s.munY_prev!==null) {
        const dY = munYN - s.munY_prev;
        const dT = (tAhora - s.munY_t)/1000;
        const ahoraJ = performance.now();
        const jalonOk = (ahoraJ - (s.lastJalon||0)) > s.COOLDOWN_JALON;
        if (dT<0.4 && dY>s.UMBRAL_JALON && jalonOk) {
          s.lastJalon = ahoraJ;
          _sfx.encaje();
          if (s.arpon?.encajadoPlateado) {
            const cp=s.cofrePlateado;
            cp.jalones++;
            cp.shakeTick=22;
            if (cp.jalones>=3) {
              cp.estado='cayendo'; cp.vy=0;
              s.arpon=null; s.faseArpon='sinArpon';
              s.munY_prev=null;
            }
          } else if (s.arpon?.encajadoEn) {
            const cf=s.arpon.encajadoEn;
            cf.jalones++;
            cf.shakeTick=20;
            if (cf.jalones>=3) {
              return this._derribarCofre(cf,W,H);
            }
          }
          s.munY_prev = munYN - s.UMBRAL_JALON*1.5;
        }
      }
      s.munY_prev=munYN; s.munY_t=tAhora;
    } else {
      s.munY_prev=null;
    }

    return null;
  },

  _derribarCofre(cf, W, H) {
    const s = this._state;
    cf.estado = 'cayendo'; cf.vy=0;
    s.arpon   = null;
    s.faseArpon = 'sinArpon';  // debe juntar manos de nuevo
    s.munY_prev = null;

    if (cf.correcto) {
      const xpBase  = XP_INTENTO[Math.min(s.intentoActual,2)];
      s.bonoPct     = Math.min(BONO_MAX, s.rachaCons*BONO_PCT);
      const xpFinal = Math.round(xpBase*(1+s.bonoPct));
      s.rachaCons++;
      s.intentoActual=0;
      this._checkCofrePlateado(W,H);
      // Nueva ronda con delay para ver el cofre caer
      this._timers.push(setTimeout(()=>this._nuevaRonda(W,H), 2800));
      s.flashColor='#FFD700'; s.flashTick=0;
      return {
        acierto:true, fallo:false,
        puntos: xpFinal,
        mensaje:`💰 +${xpFinal} XP${s.bonoPct>0?` (+${Math.round(s.bonoPct*100)}% racha)`:''}`,
      };
    } else {
      cf.estado='cayendo'; cf.vy=0;
      s.rachaCons=0; s.bonoPct=0;
      s.intentoActual++;
      if (s.intentoActual>=3) {
        this._timers.push(setTimeout(()=>this._nuevaRonda(W,H), 2800));
      }
      return {
        acierto:false, fallo:true,
        puntos: s.puntosError,
        mensaje:`👻 Incorrecto${s.intentoActual<3?` — Quedan ${s.numCofres-s.intentoActual} cofres`:''}`,
      };
    }
  },

  _verificarReinicio(W, H) {
    const s = this._state;
    const vivos = s.cofres.filter(cf=>cf.estado==='flotando'||cf.estado==='encajado');
    if (vivos.length===0) this._timers.push(setTimeout(()=>this._nuevaRonda(W,H),1200));
  },

  _generarOro(cf, W, H) {
    for (let i=0;i<22;i++) {
      const ang=Math.random()*Math.PI*2, vel=2+Math.random()*4;
      cf.particulas.push({ x:cf.x,y:cf.y, vx:Math.cos(ang)*vel, vy:Math.sin(ang)*vel-4,
        tipo:'oro', vida:1, rot:Math.random()*Math.PI*2, rotVel:(Math.random()-0.5)*0.3, r:5+Math.random()*6 });
    }
    for (let i=0;i<8;i++) {
      const ang=Math.random()*Math.PI*2, vel=3+Math.random()*5;
      cf.particulas.push({ x:cf.x,y:cf.y, vx:Math.cos(ang)*vel, vy:Math.sin(ang)*vel-5,
        tipo:'diamante', vida:1, rot:Math.random()*Math.PI*2, rotVel:(Math.random()-0.5)*0.2, r:7+Math.random()*5 });
    }
  },

  _generarOroEpico(cp, W, H) {
    for (let i=0;i<55;i++) {
      const ang=Math.random()*Math.PI*2, vel=3+Math.random()*7;
      cp.particulas.push({ x:cp.x,y:cp.y, vx:Math.cos(ang)*vel, vy:Math.sin(ang)*vel-5,
        tipo:i%3===0?'diamante':'oro', vida:1, rot:Math.random()*Math.PI*2,
        rotVel:(Math.random()-0.5)*0.35, r:6+Math.random()*9 });
    }
  },

  _generarAnimas(cf) {
    for (let i=0;i<12;i++) {
      cf.particulas.push({
        x:cf.x+(Math.random()-0.5)*60, y:cf.y+(Math.random()-0.5)*40,
        vx:(Math.random()-0.5)*1.5, vy:-0.8-Math.random()*1.2,
        tipo:'anima', vida:1, rot:Math.random()*Math.PI*2,
        rotVel:(Math.random()-0.5)*0.15, r:10+Math.random()*14,
      });
    }
  },

  // ══════════════════════════════════════════════════════
  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s||!s.inicializado) return;
    const W=canvasW, H=canvasH;
    const lm=s._landmarks;

    // ── Fondo noche semitransparente ─────────────────────
    const bgG=ctx.createLinearGradient(0,0,0,H);
    bgG.addColorStop(0,'rgba(5,5,16,0.80)'); bgG.addColorStop(1,'rgba(10,8,32,0.80)');
    ctx.fillStyle=bgG; ctx.fillRect(0,0,W,H);

    // Estrellas
    ctx.save();
    const rng={n:42};
    const pseudo=()=>{ rng.n=(rng.n*1664525+1013904223)&0xffffffff; return Math.abs(rng.n)/0xffffffff; };
    for (let i=0;i<45;i++) {
      const sx=pseudo()*W, sy=pseudo()*H*0.5, sr=0.5+pseudo()*1.5;
      ctx.globalAlpha=0.2+pseudo()*0.6;
      ctx.fillStyle='#FFFFFF';
      ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // Suelo
    ctx.save();
    const sueloG=ctx.createLinearGradient(0,H*0.85,0,H);
    sueloG.addColorStop(0,'rgba(13,11,30,0.9)'); sueloG.addColorStop(1,'rgba(21,18,40,0.95)');
    ctx.fillStyle=sueloG; ctx.fillRect(0,H*0.85,W,H*0.15);
    ctx.strokeStyle='rgba(100,80,200,0.25)'; ctx.lineWidth=1;
    for(let i=0;i<=6;i++){
      ctx.beginPath(); ctx.moveTo((i/6)*W,H*0.85); ctx.lineTo(W/2,H*0.65); ctx.stroke();
    }
    ctx.restore();

    // Flash
    if (s.flashColor&&s.flashTick<15) {
      ctx.save(); ctx.globalAlpha=0.3*(1-s.flashTick/15);
      ctx.fillStyle=s.flashColor; ctx.fillRect(0,0,W,H); ctx.restore();
    }

    // ── Cofres ───────────────────────────────────────────
    s.cofres?.forEach(cf => cf && this._renderCofre(ctx,cf,s,H));

    // ── Cofre plateado ───────────────────────────────────
    if (s.cofrePlateado&&s.cofrePlateado.estado!=='muerto')
      this._renderCofrePlateado(ctx,s.cofrePlateado,s);

    // ── Arpón + cadena ───────────────────────────────────
    if (s.arpon) this._renderArpon(ctx,s,lm,W,H);

    // ── Colmillo en mano (si faseArpon = listo/sinArpon) ─
    this._renderColmillo(ctx,s,lm,W,H);

    // ── Indicador juntar manos ───────────────────────────
    this._renderGestoHint(ctx,s,lm,W,H);

    // ── Relámpago ────────────────────────────────────────
    if (s.relampago&&s.relTick<8) {
      ctx.save(); ctx.strokeStyle='#FFFF88'; ctx.lineWidth=3;
      ctx.shadowBlur=30; ctx.shadowColor='#FFFF00';
      ctx.globalAlpha=0.8*(1-s.relTick/8);
      [[W*0.3,0,W*0.35,H*0.4,W*0.28,H],[W*0.6,0,W*0.65,H*0.35,W*0.58,H*0.7]].forEach(pts=>{
        ctx.beginPath(); ctx.moveTo(pts[0],pts[1]); ctx.lineTo(pts[2],pts[3]); ctx.lineTo(pts[4],pts[5]); ctx.stroke();
      });
      ctx.restore();
    }

    // ── HUD ──────────────────────────────────────────────
    this._renderHUD(ctx,W,H);
  },

  _renderColmillo(ctx, s, lm, W, H) {
    // Colmillo/daga visible en mano derecha cuando faseArpon = listo
    const mostrar = s.faseArpon==='listo'||s.faseArpon==='sinArpon';
    if (!mostrar) return;

    const mx = s.munRX*W, my = s.munRY*H;
    const pulso = 0.6+0.4*Math.sin(s.tick*0.08);
    const alpha = s.faseArpon==='listo' ? 1.0 : 0.45;
    const color = s.faseArpon==='listo' ? '#FFD700' : 'rgba(180,180,255,0.6)';

    ctx.save();
    ctx.globalAlpha = alpha * pulso;
    ctx.translate(mx, my);
    ctx.rotate(-Math.PI*0.3);
    // Hoja del colmillo/daga
    ctx.shadowBlur=s.faseArpon==='listo'?22:10;
    ctx.shadowColor=color;
    ctx.strokeStyle=color; ctx.lineWidth=3;
    ctx.fillStyle=color;
    ctx.beginPath();
    ctx.moveTo(0,-22);    // punta
    ctx.lineTo(6,0);
    ctx.lineTo(3,12);
    ctx.lineTo(0,8);
    ctx.lineTo(-3,12);
    ctx.lineTo(-6,0);
    ctx.closePath();
    ctx.fill();
    // Brillo núcleo
    ctx.fillStyle='rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.moveTo(0,-18); ctx.lineTo(2,-4); ctx.lineTo(0,-2); ctx.lineTo(-2,-4); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Texto indicador cuando está listo
    if (s.faseArpon==='listo') {
      ctx.save();
      ctx.textAlign='center'; ctx.font='bold 14px Orbitron, sans-serif';
      ctx.fillStyle='#FFD700'; ctx.shadowBlur=10; ctx.shadowColor='#FFD700';
      ctx.globalAlpha=pulso;
      ctx.fillText('¡LANZA!', mx, my-38);
      ctx.restore();
    }
  },

  _renderGestoHint(ctx, s, lm, W, H) {
    if (!lm) return;

    // Indicador visual de juntar manos (cuando faseArpon = sinArpon)
    if (s.faseArpon==='sinArpon') {
      const munL=lm[15], munR=lm[16];
      if (!munL||!munR) return;
      const x1=(1-munL.x)*W, y1=munL.y*H;
      const x2=(1-munR.x)*W, y2=munR.y*H;
      const distPx=Math.hypot(x1-x2,y1-y2);
      const umbralPx=W*0.22;
      const prog=Math.max(0,Math.min(1,1-(distPx/umbralPx)));

      // Siempre mostrar las dos muñecas con puntos
      ctx.save();
      [[x1,y1],[x2,y2]].forEach(([mx,my])=>{
        ctx.fillStyle='#00FF88'; ctx.globalAlpha=0.7;
        ctx.shadowBlur=14; ctx.shadowColor='#00FF88';
        ctx.beginPath(); ctx.arc(mx,my,10,0,Math.PI*2); ctx.fill();
      });
      ctx.restore();

      if (prog > 0.05) {
        ctx.save();
        ctx.globalAlpha=prog*0.9;
        ctx.strokeStyle='#00FF88'; ctx.lineWidth=3;
        ctx.shadowBlur=15; ctx.shadowColor='#00FF88';
        ctx.setLineDash([6,4]);
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        ctx.setLineDash([]);
        // Barra circular de progreso
        const cx=(x1+x2)/2, cy=(y1+y2)/2;
        ctx.globalAlpha=1;
        ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=7;
        ctx.beginPath(); ctx.arc(cx,cy,26,0,Math.PI*2); ctx.stroke();
        ctx.strokeStyle='#00FF88'; ctx.lineWidth=7;
        ctx.shadowBlur=18; ctx.shadowColor='#00FF88';
        ctx.beginPath(); ctx.arc(cx,cy,26,-Math.PI/2,-Math.PI/2+Math.PI*2*prog); ctx.stroke();
        ctx.restore();
      }
    }
  },

  _renderArpon(ctx, s, lm, W, H) {
    const arpon=s.arpon;
    const color=COLORES_CADENA[s.rachaCons%COLORES_CADENA.length];

    // Origen cadena: muñeca derecha
    let origenX=s.munRX*W, origenY=s.munRY*H;

    ctx.save();
    // Cadena eslabonada
    const puntos=[{x:origenX,y:origenY},...arpon.trail,{x:arpon.x,y:arpon.y}];
    if (puntos.length>1) {
      ctx.strokeStyle=color; ctx.lineWidth=3.5;
      ctx.shadowBlur=12; ctx.shadowColor=color;
      ctx.setLineDash([8,5]);
      ctx.beginPath(); ctx.moveTo(puntos[0].x,puntos[0].y);
      puntos.forEach(p=>ctx.lineTo(p.x,p.y));
      ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1; ctx.shadowBlur=4;
      ctx.beginPath(); ctx.moveTo(puntos[0].x,puntos[0].y);
      puntos.forEach(p=>ctx.lineTo(p.x,p.y));
      ctx.stroke();
    }

    // Punta gancho
    const ang = Math.atan2(arpon.vy||0, arpon.vx||0);
    ctx.shadowBlur=18; ctx.shadowColor=color;
    ctx.strokeStyle=color; ctx.lineWidth=4; ctx.fillStyle=color;
    ctx.save();
    ctx.translate(arpon.x,arpon.y); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(-18,0); ctx.lineTo(8,0); ctx.lineTo(14,-4); ctx.lineTo(8,0); ctx.lineTo(12,6);
    ctx.strokeStyle=color; ctx.lineWidth=4; ctx.stroke();
    ctx.fillStyle='#FFFFFF'; ctx.beginPath(); ctx.arc(14,-4,3,0,Math.PI*2); ctx.fill();
    ctx.restore();

    // Jalones pendientes si encajado
    if (s.faseArpon==='encajado' && arpon.encajadoEn) {
      const cf=arpon.encajadoEn;
      const jalLeft=3-cf.jalones;
      ctx.textAlign='center'; ctx.font='bold 17px Orbitron, sans-serif';
      ctx.fillStyle='#FFF'; ctx.shadowBlur=8; ctx.shadowColor='#FFF';
      ctx.fillText(`${jalLeft} ↓ JALA`, arpon.x, arpon.y-30);
    }

    ctx.restore();
  },

  _renderCofre(ctx, cf, s, H) {
    if (cf.estado==='muerto') { this._renderParticulas(ctx,cf.particulas); return; }

    const W_C=cf.w*s.tamCofre, H_C=cf.h*s.tamCofre;
    const cx=cf.x+cf.shakeX, cy=cf.y+cf.shakeY;
    const x=cx-W_C/2, y=cy-H_C/2;

    ctx.save();
    ctx.globalAlpha=cf.estado==='animas'?Math.max(0.1,1-cf.animasTick/150):1;
    ctx.shadowBlur=cf.estado==='encajado'?30:12;
    ctx.shadowColor=cf.correcto?'#FFD700':'#7700BB';

    // Cuerpo
    // Todos los cofres mismo color — el alumno no sabe cuál es correcto
    const cofreG=ctx.createLinearGradient(x,y,x,y+H_C);
    cofreG.addColorStop(0,'#1A2A4A');
    cofreG.addColorStop(0.5,'#243560');
    cofreG.addColorStop(1,'#0F1A30');
    ctx.fillStyle=cofreG;
    _rrect(ctx,x,y+H_C*0.35,W_C,H_C*0.65,5); ctx.fill();

    // Tapa
    const tapaG=ctx.createLinearGradient(x,y,x,y+H_C*0.4);
    tapaG.addColorStop(0,'#2E4A7A');
    tapaG.addColorStop(1,'#1A2A50');
    ctx.fillStyle=tapaG;
    _rrect(ctx,x-4,y,W_C+8,H_C*0.42,[8,8,0,0]); ctx.fill();

    // Cerradura — igual en todos
    ctx.fillStyle='#4488CC';
    ctx.shadowBlur=8; ctx.shadowColor='#66AAFF';
    ctx.beginPath(); ctx.arc(cx,y+H_C*0.38,8,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#88CCFF'; ctx.lineWidth=2; ctx.stroke();

    // Texto
    ctx.shadowBlur=0; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='bold 14px Orbitron, sans-serif';
    ctx.fillStyle='#AACCFF';  // mismo color en todos los cofres
    const maxW=W_C-16;
    const pals=cf.texto.split(' '); let lins=[],lin='';
    pals.forEach(p=>{const t=lin+p+' ';if(ctx.measureText(t).width>maxW&&lin){lins.push(lin.trim());lin=p+' ';}else lin=t;});
    if(lin) lins.push(lin.trim());
    lins.forEach((l,i)=>ctx.fillText(l,cx,y+H_C*0.72+(i-(lins.length-1)/2)*18));

    ctx.restore();
    if(cf.estado==='animas') this._renderAnimasFlotando(ctx,cf,s);
    this._renderParticulas(ctx,cf.particulas);
  },

  _renderCofrePlateado(ctx, cp, s) {
    const x=cp.x+cp.shakeX-cp.w/2, y=cp.y+cp.shakeY-cp.h/2;
    const pulso=1+Math.sin(s.tick*0.05)*0.04;
    ctx.save();
    ctx.globalAlpha=0.25+Math.sin(s.tick*0.05)*0.1;
    const halo=ctx.createRadialGradient(cp.x,cp.y,0,cp.x,cp.y,cp.w*0.9);
    halo.addColorStop(0,'#FFFFFF'); halo.addColorStop(0.5,'#88DDFF'); halo.addColorStop(1,'transparent');
    ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(cp.x,cp.y,cp.w*0.9,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
    ctx.shadowBlur=35; ctx.shadowColor='#88EEFF';
    ctx.scale(pulso,pulso); ctx.translate(cp.x*(1-pulso),cp.y*(1-pulso));
    const platG=ctx.createLinearGradient(x,y,x,y+cp.h);
    platG.addColorStop(0,'#FFFFFF'); platG.addColorStop(0.3,'#AADDFF');
    platG.addColorStop(0.7,'#6699CC'); platG.addColorStop(1,'#334466');
    ctx.fillStyle=platG; _rrect(ctx,x,y+cp.h*0.35,cp.w,cp.h*0.65,6); ctx.fill();
    const tapG=ctx.createLinearGradient(x,y,x,y+cp.h*0.4);
    tapG.addColorStop(0,'#FFFFFF'); tapG.addColorStop(1,'#88BBDD');
    ctx.fillStyle=tapG; _rrect(ctx,x-5,y,cp.w+10,cp.h*0.42,[10,10,0,0]); ctx.fill();
    if(cp.estado==='encajado'){
      ctx.textAlign='center'; ctx.font='bold 20px Orbitron, sans-serif';
      ctx.fillStyle='#FFD700'; ctx.shadowBlur=12; ctx.shadowColor='#FFD700';
      ctx.fillText(`${3-cp.jalones} ↓`,cp.x,y-20);
    }
    ctx.textAlign='center'; ctx.font='bold 22px Orbitron, sans-serif';
    ctx.fillStyle='#FFD700'; ctx.shadowBlur=15; ctx.shadowColor='#FFD700';
    ctx.fillText(`${cp.xp} XP`,cp.x,cp.y+cp.h*0.1);
    ctx.restore();
    this._renderParticulas(ctx,cp.particulas);
  },

  _renderAnimasFlotando(ctx, cf, s) {
    const alpha=Math.max(0,1-cf.animasTick/150);
    for(let i=0;i<4;i++){
      const ang=(s.tick*0.03+i*Math.PI/2)%(Math.PI*2);
      const dist=30+Math.sin(s.tick*0.04+i)*15;
      const ax=cf.x+Math.cos(ang)*dist, ay=cf.y+Math.sin(ang)*dist-cf.animasTick*0.3;
      ctx.save(); ctx.globalAlpha=alpha*(0.5+Math.sin(s.tick*0.07+i)*0.3);
      ctx.font='24px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('👻',ax,ay); ctx.restore();
    }
  },

  _renderParticulas(ctx, particulas) {
    particulas?.forEach(p=>{
      ctx.save(); ctx.globalAlpha=p.vida*0.9;
      ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      if(p.tipo==='oro'){
        ctx.fillStyle='#FFD700'; ctx.shadowBlur=10; ctx.shadowColor='#FFB700';
        ctx.fillRect(-p.r/2,-p.r/3,p.r,p.r*0.6);
        ctx.strokeStyle='#FFF8A0'; ctx.lineWidth=1; ctx.stroke();
      } else if(p.tipo==='diamante'){
        ctx.fillStyle='#88EEFF'; ctx.shadowBlur=14; ctx.shadowColor='#00DDFF';
        ctx.beginPath(); ctx.moveTo(0,-p.r); ctx.lineTo(p.r*0.6,0);
        ctx.lineTo(0,p.r); ctx.lineTo(-p.r*0.6,0); ctx.closePath(); ctx.fill();
      } else if(p.tipo==='anima'){
        ctx.fillStyle='rgba(180,255,210,0.7)'; ctx.shadowBlur=18; ctx.shadowColor='#AAFFCC';
        ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    });
  },

  _renderHUD(ctx, W, H) {
    const s=this._state;
    // Pregunta
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.80)';
    _rrect(ctx,W*0.02,6,W*0.96,56,8); ctx.fill();
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='bold 20px Orbitron, sans-serif';
    ctx.fillStyle='#FFF'; ctx.shadowBlur=10; ctx.shadowColor='#FFD700';
    ctx.fillText(s.pregunta,W/2,34,W*0.92);
    ctx.restore();

    // Estado arpón
    ctx.save();
    ctx.textAlign='center'; ctx.font='bold 14px Orbitron, sans-serif';
    let hint='', color='rgba(255,255,255,0.5)';
    if      (s.faseArpon==='sinArpon')  { hint='👐 Junta las manos para activar arpón'; color='#00FF88'; }
    else if (s.faseArpon==='listo')     { hint='🏹 Levanta el brazo por encima del hombro para lanzar'; color='#FFD700'; }
    else if (s.faseArpon==='encajado')  { hint='↓ Jala el brazo rápido hacia abajo × 3'; color='#FF8800'; }
    else if (s.faseArpon==='volando')   { hint=''; }
    ctx.fillStyle=color; ctx.shadowBlur=8; ctx.shadowColor=color;
    if(hint) ctx.fillText(hint,W/2,H-22);
    ctx.restore();

    // Racha
    if (s.rachaCons>0) {
      ctx.save(); ctx.textAlign='right';
      ctx.font='bold 16px Orbitron, sans-serif';
      ctx.fillStyle='#FFD700'; ctx.shadowBlur=10; ctx.shadowColor='#FFD700';
      ctx.fillText(`🔥 ×${s.rachaCons}  +${Math.round(s.bonoPct*100)}%`,W-16,H-22);
      ctx.restore();
    }
  },

  getState() { return this._state; },
};