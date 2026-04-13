// ============================================================
//  TORMENTA LÁSER v2.0
//  Mecánica:
//    • Rayos láser caen verticalmente de arriba hacia abajo
//    • Al tocar el suelo explotan con efecto de electricidad
//    • El alumno se mueve libremente para esquivarlos
//    • 3 opciones en panel derecho — mano ~0.6s para responder
//    • Sin impactos + correcto = 500 XP
//    • Cada impacto recibido -100 XP de la ronda (mín 0)
//    • Dificultad: 1 rayo/2s | 1 rayo/1.5s | 1 rayo/1s
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

const DIF_MAP = {
  facil:   { intervalo: 110, velRayo: 0.085, puntosCorrecto: 500, puntosError: -10, grosorRayo: 20 },
  medio:   { intervalo: 80,  velRayo: 0.130, puntosCorrecto: 500, puntosError: -12, grosorRayo: 17 },
  dificil: { intervalo: 52,  velRayo: 0.190, puntosCorrecto: 500, puntosError: -15, grosorRayo: 14 },
};

const COLORES_RAYO = [
  '#FF0044','#FF6600','#FFCC00','#00FF88','#00CCFF','#CC00FF','#FF00CC','#FFFFFF',
];

const BODY_POINTS = [0, 11, 12, 15, 16, 23, 24, 25, 26];

// ── Sonido relámpago ──────────────────────────────────────
const _sfxRayo = (() => {
  let actx = null;
  const ac = () => {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  };
  return {
    impacto() {
      try {
        const c = ac(), t = c.currentTime;
        const buf = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++)
          d[i] = (Math.random()*2-1) * Math.exp(-i/(c.sampleRate*0.06));
        const src = c.createBufferSource(), g = c.createGain();
        src.buffer = buf; g.gain.setValueAtTime(0.4, t);
        src.connect(g); g.connect(c.destination); src.start(t);
      } catch(_) {}
    },
    electricidad() {
      try {
        const c = ac(), t = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(80, t);
        o.frequency.linearRampToValueAtTime(40, t+0.2);
        g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.25);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+0.28);
      } catch(_) {}
    },
    advertencia() {
      try {
        const c = ac(), t = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(440, t);
        g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.15);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+0.18);
      } catch(_) {}
    },
  };
})();

export const SaltaCuerdaGame = {
  _state:  null,
  _timers: [],

  init(materia, colorTema, config = {}) {
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
    const dif  = config.dificultad || 'medio';
    const d    = DIF_MAP[dif] || DIF_MAP.medio;
    const reto = generarReto(materia);

    this._state = {
      materia, colorTema, dif,
      intervalo:      d.intervalo,
      velRayo:        d.velRayo,
      puntosCorrecto: d.puntosCorrecto,
      puntosError:    d.puntosError,
      grosorRayo:     d.grosorRayo,

      pregunta: reto.pregunta,
      opciones: reto.opciones.slice(0, 3),

      rayos:      [],   // rayos cayendo activos
      explosiones:[],   // efectos electricidad en suelo
      tickSpawn:  0,    // contador para spawn de rayo
      impactosRonda: 0, // impactos recibidos en esta ronda

      // Invencibilidad post-impacto
      invencible:     false,
      invencibleTick: 0,

      // Selección opción
      enCooldownOpc: false,
      opcionHover:   -1,
      opcionTick:    0,
      FRAMES_SELEC:  35,

      // Conteo inicial con advertencia
      fase:      'conteo',  // 'conteo' | 'jugando' | 'fin'
      conteoTick: 0,
      conteoNum:  3,
      advertenciaPulso: 0,

      tick: 0,
      inicializado: false,
    };
    return this._state;
  },

  _nuevaRonda(W, H) {
    const s = this._state;
    const reto = generarReto(s.materia);
    s.pregunta      = reto.pregunta;
    s.opciones      = reto.opciones.slice(0, 3);
    s.enCooldownOpc = false;
    s.opcionHover   = -1;
    s.opcionTick    = 0;
    s.impactosRonda = 0;
    s.rayos         = [];
    s.explosiones   = [];
    s.tickSpawn     = 0;
    s.fase          = 'conteo';
    s.conteoTick    = 0;
    s.conteoNum     = 3;
  },

  _spawnRayo(W, H) {
    const s = this._state;
    const PANEL_X = W * 0.78;
    // Posición X aleatoria dentro de la zona de juego
    const x = 30 + Math.random() * (PANEL_X - 60);
    const color = COLORES_RAYO[Math.floor(Math.random() * COLORES_RAYO.length)];
    // Advertencia primero (marca en suelo 0.4s antes)
    s.rayos.push({
      x,
      y:      -20,          // empieza arriba
      vy:     H * s.velRayo,  // velocidad por dificultad
      color,
      grosor: s.grosorRayo,
      estado: 'advirtiendo',// 'advirtiendo' | 'cayendo' | 'muerto'
      advTick: 0,
      longitud: H * 0.35,   // largo del rayo
      particulas: [],
    });
    _sfxRayo.advertencia();
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;
    const W = canvasW, H = canvasH;
    s.tick += delta;
    s._landmarks = landmarks;

    if (!s.inicializado) s.inicializado = true;

    // ── FASE CONTEO ──────────────────────────────────────
    if (s.fase === 'conteo') {
      s.conteoTick += delta;
      s.advertenciaPulso += delta;
      const num = 3 - Math.floor(s.conteoTick / 55);
      s.conteoNum = Math.max(0, num);
      if (s.conteoTick >= 55 * 4) {
        s.fase = 'jugando';
        s.tickSpawn = s.intervalo; // spawn inmediato al empezar
      }
      return null;
    }

    if (s.fase === 'fin') return null;

    // ── Invencibilidad ───────────────────────────────────
    if (s.invencible) {
      s.invencibleTick += delta;
      if (s.invencibleTick > 55) { s.invencible = false; s.invencibleTick = 0; }
    }

    // ── Spawn de rayos ───────────────────────────────────
    s.tickSpawn += delta;
    if (s.tickSpawn >= s.intervalo) {
      s.tickSpawn = 0;
      this._spawnRayo(W, H);
    }

    // ── Mover rayos ──────────────────────────────────────
    s.rayos.forEach(r => {
      if (r.estado === 'advirtiendo') {
        r.advTick += delta;
        if (r.advTick > 18) r.estado = 'cayendo';
        return;
      }
      if (r.estado !== 'cayendo') return;
      r.y += r.vy * delta * 0.06;
      // Tocar suelo
      if (r.y + r.longitud > H * 0.92) {
        r.estado = 'muerto';
        _sfxRayo.electricidad();
        // Explosión electricidad en suelo
        for (let i = 0; i < 14; i++) {
          const ang = Math.random() * Math.PI;
          const vel = 2 + Math.random() * 5;
          r.particulas.push({
            x: r.x, y: H * 0.92,
            vx: Math.cos(ang) * vel * (Math.random()>0.5?1:-1),
            vy: -Math.random() * vel,
            vida: 1, color: r.color,
            len: 8 + Math.random() * 18,
          });
        }
        s.explosiones.push({ x: r.x, y: H*0.92, color: r.color, tick: 0 });
      }
    });

    // Limpiar rayos muertos (después de que partículas mueran)
    s.rayos = s.rayos.filter(r => {
      if (r.estado !== 'muerto') return true;
      r.particulas = r.particulas.filter(p => {
        p.x += p.vx * delta * 0.06;
        p.y += p.vy * delta * 0.06;
        p.vy += 0.3 * delta * 0.06;
        p.vida -= delta * 0.06;
        return p.vida > 0;
      });
      return r.particulas.length > 0;
    });

    s.explosiones = s.explosiones.filter(e => {
      e.tick += delta;
      return e.tick < 30;
    });

    // ── Colisión cuerpo-rayos ────────────────────────────
    if (!s.invencible && !s.enCooldownOpc && landmarks) {
      const coords = BODY_POINTS.map(idx => {
        const lm = landmarks[idx];
        if (!lm || lm.visibility < 0.35) return null;
        return { x: (1-lm.x)*W, y: lm.y*H };
      }).filter(Boolean);

      for (const r of s.rayos) {
        if (r.estado !== 'cayendo') continue;
        const rx = r.x, ry = r.y, rb = r.y + r.longitud;
        const margen = r.grosor / 2 + 12;
        for (const pt of coords) {
          if (Math.abs(pt.x - rx) < margen && pt.y > ry && pt.y < rb) {
            // Impacto
            s.impactosRonda++;
            s.invencible     = true;
            s.invencibleTick = 0;
            _sfxRayo.impacto();
            return {
              acierto: false, fallo: true,
              puntos: -100,
              mensaje: `⚡ ¡Impacto! -100 XP (total impactos: ${s.impactosRonda})`,
            };
          }
        }
      }
    }

    // ── Detección mano en panel opciones ─────────────────
    if (!s.enCooldownOpc && landmarks) {
      const PANEL_X = W * 0.78;
      let manoEnPanel = null;
      for (const idx of [15, 16]) {
        const lm = landmarks[idx];
        if (!lm || lm.visibility < 0.4) continue;
        const mx = (1-lm.x)*W, my = lm.y*H;
        if (mx > PANEL_X) { manoEnPanel = { x: mx, y: my }; break; }
      }
      if (manoEnPanel) {
        const OPC_H = H*0.18, OPC_Y0 = H*0.28;
        const idx = Math.floor((manoEnPanel.y - OPC_Y0) / OPC_H);
        if (idx >= 0 && idx < s.opciones.length) {
          if (s.opcionHover === idx) {
            s.opcionTick += delta;
            if (s.opcionTick >= s.FRAMES_SELEC) return this._evaluarOpcion(idx, W, H);
          } else { s.opcionHover = idx; s.opcionTick = 0; }
        } else { s.opcionHover = -1; s.opcionTick = 0; }
      } else { s.opcionHover = -1; s.opcionTick = 0; }
    }

    return null;
  },

  _evaluarOpcion(idx, W, H) {
    const s = this._state;
    const opc = s.opciones[idx];
    s.enCooldownOpc = true; s.opcionHover = -1; s.opcionTick = 0;

    const xpBase  = s.puntosCorrecto - s.impactosRonda * 100;
    const xpFinal = Math.max(0, xpBase);

    if (opc.esCorrecto) {
      try { SFX.acierto?.() ?? SFX.bonus?.(); } catch(_) {}
      this._timers.push(setTimeout(() => this._nuevaRonda(W, H), 1000));
      const bonus = s.impactosRonda === 0 ? ' 🏆 ¡Sin impactos!' : '';
      return {
        acierto: true, fallo: false,
        puntos: xpFinal,
        mensaje: `✅ +${xpFinal} XP${bonus}`,
      };
    } else {
      try { SFX.impacto?.(); } catch(_) {}
      this._timers.push(setTimeout(() => { if(s) s.enCooldownOpc = false; }, 900));
      return {
        acierto: false, fallo: true,
        puntos: s.puntosError,
        mensaje: `❌ Incorrecto`,
      };
    }
  },

  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;
    const W = canvasW, H = canvasH;
    const lm = s._landmarks;
    const PANEL_X = W * 0.78;

    // ── Fondo semitransparente ───────────────────────────
    ctx.fillStyle = 'rgba(2,2,12,0.72)';
    ctx.fillRect(0, 0, W, H);

    // Suelo integrado — línea neón sin rectángulo sólido
    ctx.save();
    ctx.strokeStyle = 'rgba(0,200,255,0.20)';
    ctx.lineWidth = 1.5;
    const sueloGrad = ctx.createLinearGradient(0, 0, PANEL_X, 0);
    sueloGrad.addColorStop(0,'rgba(0,200,255,0)');
    sueloGrad.addColorStop(0.3,'rgba(0,200,255,0.25)');
    sueloGrad.addColorStop(0.7,'rgba(0,200,255,0.25)');
    sueloGrad.addColorStop(1,'rgba(0,200,255,0)');
    ctx.strokeStyle = sueloGrad;
    ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(0,200,255,0.4)';
    ctx.beginPath(); ctx.moveTo(0, H*0.90); ctx.lineTo(PANEL_X, H*0.90); ctx.stroke();
    ctx.restore();

    // ── FASE CONTEO ──────────────────────────────────────
    if (s.fase === 'conteo') {
      // Advertencia pulsante
      const pulso = 0.5 + 0.5 * Math.sin(s.advertenciaPulso * 0.18);
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(80 + pulso*20)}px sans-serif`;
      ctx.globalAlpha = 0.4 + pulso * 0.6;
      ctx.fillStyle = '#FF0000';
      ctx.shadowBlur = 40; ctx.shadowColor = '#FF0000';
      ctx.fillText('⚠️', W*0.35, H*0.5);
      ctx.globalAlpha = 1;

      // Número conteo
      if (s.conteoNum > 0) {
        ctx.font = `bold ${Math.round(160 + pulso*20)}px Orbitron, sans-serif`;
        ctx.fillStyle = s.conteoNum===1?'#FF2200':s.conteoNum===2?'#FFAA00':'#00FF88';
        ctx.shadowBlur = 50; ctx.shadowColor = ctx.fillStyle;
        ctx.fillText(s.conteoNum, W*0.35, H*0.5);
      } else {
        ctx.font = 'bold 80px Orbitron, sans-serif';
        ctx.fillStyle = '#FFFF00'; ctx.shadowBlur = 50; ctx.shadowColor = '#FFFF00';
        ctx.fillText('¡ESQUIVA!', W*0.35, H*0.5);
      }
      ctx.restore();

      // Panel opciones visible desde el conteo
      this._renderPanel(ctx, W, H);
      this._renderHUD(ctx, W, H);
      return;
    }

    // ── Rayos cayendo ────────────────────────────────────
    s.rayos.forEach(r => {
      if (r.estado === 'advirtiendo') {
        // Marca de advertencia en suelo
        const pulso = 0.5 + 0.5 * Math.sin(s.tick * 0.25);
        ctx.save();
        ctx.globalAlpha = pulso * 0.8;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.grosor;
        ctx.shadowBlur = 20; ctx.shadowColor = r.color;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(r.x, H * 0.1);
        ctx.lineTo(r.x, H * 0.88);
        ctx.stroke();
        ctx.setLineDash([]);
        // Triángulo en suelo
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.moveTo(r.x - 12, H*0.88);
        ctx.lineTo(r.x + 12, H*0.88);
        ctx.lineTo(r.x, H*0.78);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        return;
      }

      if (r.estado !== 'cayendo') {
        // Partículas de explosión
        this._renderParticulas(ctx, r.particulas);
        return;
      }

      const pulso = 0.9 + Math.sin(s.tick * 0.12) * 0.1;
      ctx.save();

      // Halo exterior
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.grosor * 3;
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x, r.y + r.longitud); ctx.stroke();

      // Cuerpo principal
      ctx.globalAlpha = 0.95 * pulso;
      ctx.lineWidth = r.grosor;
      ctx.shadowBlur = 22; ctx.shadowColor = r.color;
      ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x, r.y + r.longitud); ctx.stroke();

      // Zigzag eléctrico encima
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = r.grosor * 0.35;
      ctx.shadowBlur = 8; ctx.shadowColor = '#FFFFFF';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      const segs = 10;
      ctx.moveTo(r.x, r.y);
      for (let i = 1; i <= segs; i++) {
        const py = r.y + (r.longitud / segs) * i;
        const px = r.x + (Math.random() - 0.5) * r.grosor * 1.5;
        ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.restore();
      this._renderParticulas(ctx, r.particulas);
    });

    // Explosiones en suelo
    s.explosiones.forEach(e => {
      const alpha = 1 - e.tick / 30;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = e.color;
      ctx.lineWidth   = 3;
      ctx.shadowBlur  = 20; ctx.shadowColor = e.color;
      for (let i = 0; i < 8; i++) {
        const ang = (i/8)*Math.PI*2;
        const len = 15 + Math.random()*20;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(ang)*len, e.y + Math.sin(ang)*len*0.5);
        ctx.stroke();
      }
      ctx.restore();
    });

    // Flash de impacto
    if (s.invencible && s.invencibleTick < 12) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,0,0,0.3)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Panel y HUD
    this._renderPanel(ctx, W, H);
    if (lm) this._renderManoIndicador(ctx, W, H, lm);
    this._renderHUD(ctx, W, H);
  },

  _renderPanel(ctx, W, H) {
    const s = this._state;
    const PANEL_X = W*0.78, PANEL_W = W*0.21;
    ctx.save();
    const panelG = ctx.createLinearGradient(PANEL_X, 0, W, 0);
    panelG.addColorStop(0,'rgba(0,20,40,0.96)'); panelG.addColorStop(1,'rgba(0,10,30,0.99)');
    ctx.fillStyle = panelG; ctx.fillRect(PANEL_X, 0, PANEL_W, H);
    ctx.strokeStyle='rgba(0,200,255,0.35)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(PANEL_X,0); ctx.lineTo(PANEL_X,H); ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='bold 13px Orbitron, sans-serif';
    ctx.fillStyle='rgba(0,200,255,0.75)'; ctx.shadowBlur=8; ctx.shadowColor='#00CCFF';
    ctx.fillText('RESPONDE', PANEL_X+PANEL_W/2, H*0.10);
    ctx.font='11px Rajdhani, sans-serif'; ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.shadowBlur=0;
    ctx.fillText('Mantén mano ~0.6s', PANEL_X+PANEL_W/2, H*0.16);
    ctx.restore();

    const OPC_H=H*0.18, OPC_Y0=H*0.28, OPC_PAD=8;
    s.opciones.forEach((opc, i) => {
      const oy=OPC_Y0+i*OPC_H, cx=PANEL_X+PANEL_W/2;
      const esHover=s.opcionHover===i;
      const prog=esHover?s.opcionTick/s.FRAMES_SELEC:0;
      ctx.save();
      ctx.fillStyle=esHover?'rgba(0,200,255,0.45)':'rgba(255,255,255,0.10)';
      ctx.shadowBlur=esHover?22:0; ctx.shadowColor='#00CCFF';
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(PANEL_X+OPC_PAD,oy+OPC_PAD,PANEL_W-OPC_PAD*2,OPC_H-OPC_PAD*2,8)
        : ctx.rect(PANEL_X+OPC_PAD,oy+OPC_PAD,PANEL_W-OPC_PAD*2,OPC_H-OPC_PAD*2);
      ctx.fill();
      ctx.strokeStyle=esHover?'#00FFFF':'rgba(255,255,255,0.2)'; ctx.lineWidth=esHover?2:1; ctx.stroke();
      if (esHover && prog>0) {
        ctx.fillStyle='rgba(0,255,200,0.4)'; ctx.shadowBlur=0;
        ctx.fillRect(PANEL_X+OPC_PAD,oy+OPC_H-OPC_PAD-6,(PANEL_W-OPC_PAD*2)*prog,5);
      }
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font=`bold ${esHover?16:14}px Orbitron, sans-serif`;
      ctx.fillStyle=esHover?'#FFF':'rgba(255,255,255,0.75)';
      ctx.shadowBlur=esHover?10:0; ctx.shadowColor='#00FFFF';
      const maxW=PANEL_W-OPC_PAD*2-10;
      const pals=opc.texto.split(' '); let lins=[],lin='';
      pals.forEach(p=>{const t=lin+p+' ';if(ctx.measureText(t).width>maxW&&lin){lins.push(lin.trim());lin=p+' ';}else lin=t;});
      if(lin) lins.push(lin.trim());
      lins.forEach((l,li)=>ctx.fillText(l,cx,oy+OPC_H/2+(li-(lins.length-1)/2)*20));
      ctx.restore();
    });
  },

  _renderManoIndicador(ctx, W, H, landmarks) {
    const PANEL_X = W*0.70;
    for (const idx of [15,16]) {
      const lm = landmarks[idx];
      if (!lm||lm.visibility<0.4) continue;
      const mx=(1-lm.x)*W, my=lm.y*H;
      if (mx < PANEL_X) continue;
      ctx.save();
      ctx.globalAlpha=0.85; ctx.fillStyle='#00FFFF';
      ctx.shadowBlur=22; ctx.shadowColor='#00FFFF';
      ctx.beginPath(); ctx.arc(mx,my,14,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=0.3; ctx.beginPath(); ctx.arc(mx,my,26,0,Math.PI*2); ctx.fill();
      ctx.restore(); break;
    }
  },

  _renderParticulas(ctx, particulas) {
    particulas.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.vida * 0.9;
      ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.shadowBlur = 8; ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * p.len * 0.3, p.y + p.vy * p.len * 0.3);
      ctx.stroke();
      ctx.restore();
    });
  },

  _renderHUD(ctx, W, H) {
    const s = this._state;
    const ZONA_W = W*0.68;

    // Pregunta
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.80)';
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(W*0.02,6,ZONA_W-W*0.04,56,8)
      : ctx.rect(W*0.02,6,ZONA_W-W*0.04,56);
    ctx.fill();
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='bold 20px Orbitron, sans-serif';
    ctx.fillStyle='#FFF'; ctx.shadowBlur=10; ctx.shadowColor='#00CCFF';
    ctx.fillText(s.pregunta, ZONA_W/2, 34, ZONA_W-30);
    ctx.restore();

    // XP disponible esta ronda
    const xpDisp = Math.max(0, s.puntosCorrecto - s.impactosRonda*100);
    ctx.save();
    ctx.textAlign='left'; ctx.font='bold 16px Orbitron, sans-serif';
    ctx.fillStyle = xpDisp===500?'#FFD700':'#FF8800';
    ctx.shadowBlur=8; ctx.shadowColor=ctx.fillStyle;
    ctx.fillText(`⚡ ${xpDisp} XP disponibles`, 12, H-22);
    ctx.restore();

    // Impactos
    if (s.impactosRonda > 0) {
      ctx.save();
      ctx.textAlign='center'; ctx.font='bold 15px Orbitron, sans-serif';
      ctx.fillStyle='#FF4444'; ctx.shadowBlur=6; ctx.shadowColor='#FF0000';
      ctx.fillText(`Impactos: ${s.impactosRonda}  (-${s.impactosRonda*100} XP)`, ZONA_W/2, H-22);
      ctx.restore();
    }
  },

  getState() { return this._state; },
};