// ============================================================
//  SURF GAME v3 — Estilo Ubisoft
//  CONTROL: Posición X de cadera (landmarks 23+24) → movimiento directo
//  VISUAL:  Tabla luminosa + estela de agua + espuma + olas en capas
// ============================================================

import { generarRetoActivo as generarReto } from './preguntas.js';
import { SFX } from './SoundEngine.js';

const DIF_MAP = {
  facil:   { velBase: 0.005, spawnInterval: 80, puntosCorrecto: 15, puntosError: -3  },
  medio:   { velBase: 0.008, spawnInterval: 60, puntosCorrecto: 20, puntosError: -5  },
  dificil: { velBase: 0.012, spawnInterval: 45, puntosCorrecto: 30, puntosError: -10 },
};

// ── Partículas de espuma/agua ────────────────────────────────
const _crearEspuma = (x, y, vel, color) => ({
  x, y,
  vx: (Math.random()-0.5)*vel,
  vy: -Math.random()*vel*0.8,
  vida: 20+Math.random()*25, vidaMax: 45,
  tam: 3+Math.random()*6,
  color: color || '#AADDFF',
  rot: Math.random()*Math.PI*2,
});

export const SurfGame = {
  _state: null,

  init(materia, colorTema, config = {}) {
    const dif     = config.dificultad      || 'medio';
    const velMult = config.velocidad       ?? 1.0;
    const tamMult = config.tamanoObjetivos ?? 1.0;
    const d       = DIF_MAP[dif] || DIF_MAP.medio;
    const reto    = generarReto(materia);

    this._state = {
      materia, colorTema,
      pregunta:       reto.pregunta,
      tick:           0,
      spawnTimer:     0,
      spawnInterval:  d.spawnInterval,
      velBase:        d.velBase * velMult,
      radioBase:      52 * tamMult,
      puntosCorrecto: d.puntosCorrecto,
      puntosError:    d.puntosError,
      enCooldown:     false,

      // Surfista
      surfX:     0.5,   // posición actual (normalizada)
      surfXObj:  0.5,   // objetivo (sigue cadera)
      surfVelX:  0,
      surfTilt:  0,     // inclinación visual de la tabla

      // Efectos
      estela:    [],    // trail de la tabla
      espuma:    [],    // partículas de agua
      olas:      Array.from({length:5}, (_,i) => ({
        fase:  Math.random()*Math.PI*2,
        vel:   0.018+i*0.006,
        amp:   8+i*4,
        yBase: 0.62+i*0.055,
        alpha: 0.12+i*0.07,
        grosor: 1+i*0.8,
      })),

      objetos: [],
    };

    this._spawnObjeto(reto.opciones);
    return this._state;
  },

  _spawnObjeto(opciones) {
    const s = this._state;
    // Distribuir horizontalmente para que no se amontonen
    const posX = opciones.length === 2
      ? [0.28, 0.72]
      : opciones.length === 3
        ? [0.18, 0.50, 0.82]
        : opciones.map((_,i) => 0.1+i*(0.8/(opciones.length-1)));

    opciones.forEach((opc, i) => {
      s.objetos.push({
        x:           posX[i] + (Math.random()-0.5)*0.06,
        y:           -0.08 - i*0.18,
        radio:       s.radioBase,
        texto:       opc.texto,
        esCorrecto:  opc.esCorrecto,
        velocidad:   s.velBase + Math.random()*0.002,
        recogido:    false,
        recogidoTick: 0,
        rotacion:    0,
        velRot:      (Math.random()-0.5)*0.015,
        pulso:       Math.random()*Math.PI*2,
        // Ola que "lleva" el objeto — cada objeto cabalga su propia ola
        olaFase:     Math.random()*Math.PI*2,
        olaAmp:      4+Math.random()*8,
      });
    });
  },

  _nuevaRonda() {
    const s = this._state;
    const reto = generarReto(s.materia);
    s.pregunta   = reto.pregunta;
    s.enCooldown = false;
    this._spawnObjeto(reto.opciones);
  },

  update(landmarks, canvasW, canvasH, delta) {
    const s = this._state;
    if (!s) return null;
    s.tick += delta;
    s.spawnTimer++;

    // ── Control: posición X de la cadera ──────────────────
    if (landmarks) {
      const cad1 = landmarks[23], cad2 = landmarks[24];
      const hom1 = landmarks[11], hom2 = landmarks[12];
      // Promedio cadera + hombros para más estabilidad
      if (cad1 && cad2 && hom1 && hom2) {
        const cadX = (cad1.x + cad2.x) / 2;
        const homX = (hom1.x + hom2.x) / 2;
        const centroX = (cadX + homX) / 2;
        // Espejado: MediaPipe x=0 es derecha, x=1 es izquierda
        s.surfXObj = 1 - centroX;
      } else if (cad1 && cad2) {
        s.surfXObj = 1 - (cad1.x + cad2.x) / 2;
      }
    }

    // Interpolación suave hacia objetivo (lerp)
    const prevX  = s.surfX;
    s.surfX      = s.surfX + (s.surfXObj - s.surfX) * 0.18;
    s.surfX      = Math.max(0.05, Math.min(0.95, s.surfX));
    s.surfVelX   = s.surfX - prevX;
    s.surfTilt   = Math.max(-0.5, Math.min(0.5, s.surfVelX * 80)); // inclinación proporcional a velocidad

    // ── Estela de la tabla ────────────────────────────────
    const sy = canvasH * (0.72 + Math.sin(s.tick*0.04)*0.008);
    s.estela.unshift({ x: s.surfX, y: 0.72+Math.sin(s.tick*0.04)*0.008, vida: 22 });
    if (s.estela.length > 28) s.estela.pop();
    s.estela.forEach(e => e.vida--);
    s.estela = s.estela.filter(e => e.vida > 0);

    // ── Espuma continua bajo la tabla ────────────────────
    if (Math.abs(s.surfVelX) > 0.003 || s.tick % 4 === 0) {
      const ex = s.surfX*canvasW, ey = sy;
      for (let i=0; i<3; i++) {
        s.espuma.push(_crearEspuma(ex+(Math.random()-0.5)*80, ey+8, 2.5, '#C8EEFF'));
      }
      if (Math.abs(s.surfVelX) > 0.008) {
        // Espuma extra al girar rápido
        for (let i=0; i<5; i++) {
          s.espuma.push(_crearEspuma(ex+(Math.random()-0.5)*60, ey, 4, '#FFFFFF'));
        }
      }
    }
    s.espuma.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=0.12; p.vida--; p.tam*=0.96; });
    s.espuma = s.espuma.filter(p => p.vida > 0);

    // ── Olas ──────────────────────────────────────────────
    s.olas.forEach(o => { o.fase += o.vel; });

    // ── Objetos ───────────────────────────────────────────
    s.objetos.forEach(o => {
      if (!o.recogido) {
        o.y       += o.velocidad;
        o.rotacion += o.velRot;
        o.pulso   += 0.05;
        // Objeto "cabalga" la ola — movimiento X sinusoidal leve
        o.x += Math.sin(s.tick*0.02 + o.olaFase) * 0.0008;
        o.x  = Math.max(0.06, Math.min(0.94, o.x));
      } else {
        o.recogidoTick++;
      }
    });
    s.objetos = s.objetos.filter(o => o.y < 1.12 && !(o.recogido && o.recogidoTick > 30));
    if (s.objetos.filter(o => !o.recogido).length === 0) this._nuevaRonda();

    if (s.enCooldown) return null;

    // ── Colisión ──────────────────────────────────────────
    const surfX_px = s.surfX * canvasW;
    const surfY_px = sy;

    for (const obj of s.objetos) {
      if (obj.recogido) continue;
      const ox  = obj.x * canvasW;
      const oy  = obj.y * canvasH;
      const dist = Math.hypot(surfX_px - ox, surfY_px - oy);

      if (dist < obj.radio + 45) {
        obj.recogido  = true;
        s.enCooldown  = true;

        // Explosión de espuma en el punto de colisión
        for (let i=0; i<18; i++) {
          s.espuma.push(_crearEspuma(ox, oy, 5,
            obj.esCorrecto ? '#00FF88' : '#FF4444'));
        }

        if (obj.esCorrecto) {
          try { SFX.acierto(); SFX.ola?.(); } catch(_) {}
          setTimeout(() => { if(s) s.enCooldown=false; }, 900);
          return { acierto:true, fallo:false, puntos:s.puntosCorrecto };
        } else {
          try { SFX.error(); } catch(_) {}
          setTimeout(() => { if(s) s.enCooldown=false; }, 700);
          return { acierto:false, fallo:true, puntos:s.puntosError };
        }
      }
    }
    return null;
  },

  render(ctx, canvasW, canvasH) {
    const s = this._state;
    if (!s) return;

    const W = canvasW, H = canvasH;

    // ── Océano fondo ──────────────────────────────────────
    const oceano = ctx.createLinearGradient(0, H*0.55, 0, H);
    oceano.addColorStop(0, '#001828');
    oceano.addColorStop(0.4, '#002844');
    oceano.addColorStop(1, '#004466');
    ctx.save();
    ctx.fillStyle = oceano;
    ctx.fillRect(0, H*0.55, W, H*0.45);
    ctx.restore();

    // Reflejos de luz en el agua
    ctx.save();
    ctx.globalAlpha = 0.06;
    for (let i=0; i<8; i++) {
      const rx = (Math.sin(s.tick*0.02+i*1.3)*0.5+0.5)*W;
      const ry = H*(0.6+i*0.04);
      const rg = ctx.createRadialGradient(rx,ry,0,rx,ry,80+i*15);
      rg.addColorStop(0,'#66CCFF'); rg.addColorStop(1,'transparent');
      ctx.fillStyle=rg;
      ctx.fillRect(rx-100,ry-30,200,60);
    }
    ctx.restore();

    // ── Olas en capas ─────────────────────────────────────
    s.olas.forEach((ola, idx) => {
      ctx.save();
      ctx.globalAlpha = ola.alpha;

      // Relleno de agua de cada ola
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x=0; x<=W; x+=8) {
        const y = H*ola.yBase + Math.sin(x*0.012+ola.fase)*ola.amp
                              + Math.sin(x*0.007+ola.fase*0.7)*ola.amp*0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath();
      const wg = ctx.createLinearGradient(0,H*ola.yBase,0,H);
      wg.addColorStop(0, idx%2===0?'#1166AA':'#0D4477');
      wg.addColorStop(1, '#001122');
      ctx.fillStyle = wg; ctx.fill();

      // Línea de cresta luminosa
      ctx.beginPath();
      ctx.globalAlpha = ola.alpha*2.5;
      for (let x=0; x<=W; x+=8) {
        const y = H*ola.yBase + Math.sin(x*0.012+ola.fase)*ola.amp
                              + Math.sin(x*0.007+ola.fase*0.7)*ola.amp*0.4;
        x===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      ctx.strokeStyle='#44CCFF'; ctx.lineWidth=ola.grosor+1;
      ctx.shadowBlur=8; ctx.shadowColor='#22AAFF';
      ctx.stroke();
      ctx.restore();
    });

    // ── Pregunta ──────────────────────────────────────────
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.68)';
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(W*0.05,14,W*0.90,112,14);
    else ctx.rect(W*0.05,14,W*0.90,112);
    ctx.fill();
    ctx.textAlign='center';
    ctx.font='bold 40px Orbitron, sans-serif';
    ctx.fillStyle='#FFFFFF'; ctx.shadowBlur=14; ctx.shadowColor=s.colorTema;
    ctx.fillText(s.pregunta, W/2, 68);
    ctx.font='18px Rajdhani, sans-serif';
    ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.shadowBlur=0;
    ctx.fillText('🌊 Muévete izquierda/derecha para atrapar la respuesta', W/2, 108);
    ctx.restore();

    // ── Espuma (partículas) ───────────────────────────────
    s.espuma.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.vida/p.vidaMax) * 0.7;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 4; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5,p.tam), 0, Math.PI*2);
      ctx.fill(); ctx.restore();
    });

    // ── Estela de la tabla ────────────────────────────────
    if (s.estela.length > 2) {
      ctx.save();
      for (let i=1; i<s.estela.length; i++) {
        const t   = i/s.estela.length;
        const e0  = s.estela[i-1], e1 = s.estela[i];
        const ancho = (1-t) * 38;
        ctx.globalAlpha = (1-t)*0.45;
        ctx.strokeStyle = `hsl(${195+t*20},80%,${55+t*20}%)`;
        ctx.lineWidth   = ancho;
        ctx.lineCap     = 'round';
        ctx.shadowBlur  = 10; ctx.shadowColor='#44CCFF';
        ctx.beginPath();
        ctx.moveTo(e0.x*W, e0.y*H);
        ctx.lineTo(e1.x*W, e1.y*H);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── OBJETOS ───────────────────────────────────────────
    s.objetos.forEach(o => {
      const ox = o.x*W, oy = o.y*H;
      ctx.save();
      if (o.recogido) {
        ctx.globalAlpha = Math.max(0, 1-o.recogidoTick/30);
        ctx.shadowBlur  = 50;
        ctx.shadowColor = o.esCorrecto ? '#00FF88' : '#FF4444';
      }

      // Halo pulsante
      const pulso = 0.75 + Math.sin(o.pulso)*0.25;
      ctx.globalAlpha = (o.recogido ? Math.max(0,1-o.recogidoTick/30) : 1) * 0.25;
      ctx.beginPath(); ctx.arc(ox, oy, o.radio*1.5*pulso, 0, Math.PI*2);
      const halo = ctx.createRadialGradient(ox,oy,0,ox,oy,o.radio*1.5);
      halo.addColorStop(0, s.colorTema+'88');
      halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo; ctx.fill();

      ctx.globalAlpha = o.recogido ? Math.max(0,1-o.recogidoTick/30) : 1;

      // Bola de agua / burbuja luminosa
      ctx.translate(ox, oy); ctx.rotate(o.rotacion);
      const bola = ctx.createRadialGradient(-o.radio*0.3,-o.radio*0.35,3,0,0,o.radio);
      bola.addColorStop(0, '#FFFFFF');
      bola.addColorStop(0.2, '#88DDFF');
      bola.addColorStop(0.6, s.colorTema);
      bola.addColorStop(1, s.colorTema+'44');
      ctx.beginPath(); ctx.arc(0,0,o.radio,0,Math.PI*2);
      ctx.fillStyle = bola;
      ctx.shadowBlur = 20; ctx.shadowColor = s.colorTema;
      ctx.fill();

      // Anillo exterior
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.5;
      ctx.shadowBlur  = 12; ctx.shadowColor = '#FFFFFF';
      ctx.stroke();

      // Brillo especular
      ctx.beginPath(); ctx.arc(-o.radio*0.28, -o.radio*0.32, o.radio*0.22, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.shadowBlur=0; ctx.fill();

      ctx.restore();

      // Texto de respuesta
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font='bold 17px Orbitron, sans-serif';
      const palabras = o.texto.split(' ');
      let lineas=[], linea='';
      const maxW = o.radio*1.55;
      palabras.forEach(p => {
        const t = linea+p+' ';
        if(ctx.measureText(t).width>maxW&&linea){lineas.push(linea.trim());linea=p+' ';}
        else linea=t;
      });
      if(linea) lineas.push(linea.trim());
      const lH=20, bH=lineas.length*lH+10;
      const bW=Math.max(...lineas.map(l=>ctx.measureText(l).width))+18;
      ctx.fillStyle='rgba(0,0,0,0.75)';
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(ox-bW/2,oy-bH/2,bW,bH,6);
      else ctx.rect(ox-bW/2,oy-bH/2,bW,bH);
      ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1.2; ctx.stroke();
      ctx.fillStyle='#FFFFFF'; ctx.shadowBlur=3; ctx.shadowColor='#000';
      lineas.forEach((l,i) => ctx.fillText(l, ox, oy+(i-(lineas.length-1)/2)*lH));
      ctx.restore();
    });

    // ── TABLA DE SURF ─────────────────────────────────────
    const surfX  = s.surfX * W;
    const surfY  = H * 0.72 + Math.sin(s.tick*0.04)*6;
    const tilt   = s.surfTilt;

    ctx.save();
    ctx.translate(surfX, surfY);
    ctx.rotate(tilt);

    // Sombra en el agua
    ctx.save();
    ctx.globalAlpha=0.25; ctx.shadowBlur=0;
    ctx.fillStyle='#001122';
    ctx.beginPath(); ctx.ellipse(0,28,58,10,0,0,Math.PI*2); ctx.fill();
    ctx.restore();

    // ── Tabla de surf luminosa ──
    // Forma de tabla real: puntiaguda adelante, redondeada atrás
    const tL = 72, tW = 18;
    ctx.beginPath();
    ctx.moveTo(0, -tL);           // nose (punta)
    ctx.bezierCurveTo( tW*1.1, -tL*0.5,  tW*1.3,  tL*0.1,  tW*0.9,  tL*0.6);
    ctx.bezierCurveTo( tW*0.6,  tL*0.9, -tW*0.6,  tL*0.9, -tW*0.9,  tL*0.6);
    ctx.bezierCurveTo(-tW*1.3,  tL*0.1, -tW*1.1, -tL*0.5,  0,       -tL);
    ctx.closePath();

    // Gradiente de la tabla — neón vibrante
    const tg = ctx.createLinearGradient(-tW, -tL, tW, tL);
    tg.addColorStop(0,   '#00FFCC');
    tg.addColorStop(0.3, s.colorTema);
    tg.addColorStop(0.7, '#0055FF');
    tg.addColorStop(1,   '#002299');
    ctx.fillStyle   = tg;
    ctx.shadowBlur  = 28; ctx.shadowColor = s.colorTema;
    ctx.fill();

    // Líneas de diseño (stringer + rails)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
    ctx.shadowBlur  = 0;
    ctx.beginPath(); ctx.moveTo(0,-tL*0.9); ctx.lineTo(0,tL*0.5); ctx.stroke(); // stringer
    // Rails curvos
    ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=2.5;
    ctx.beginPath();
    ctx.moveTo(0,-tL); ctx.bezierCurveTo(tW*1.1,-tL*0.5, tW*1.3,tL*0.1, tW*0.9,tL*0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0,-tL); ctx.bezierCurveTo(-tW*1.1,-tL*0.5,-tW*1.3,tL*0.1,-tW*0.9,tL*0.6);
    ctx.stroke();

    // Brillo especular de la tabla
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-tW*0.3, -tL*0.35, tW*0.35, tL*0.22, -0.3, 0, Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.22)'; ctx.fill();
    ctx.restore();

    // Fin de tabla (tail) — detalle de color
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-tW*0.9,tL*0.6);
    ctx.bezierCurveTo(-tW*0.6,tL*0.9,tW*0.6,tL*0.9,tW*0.9,tL*0.6);
    ctx.lineTo(0,tL*0.75); ctx.closePath();
    ctx.fillStyle='#FF2266'; ctx.shadowBlur=8; ctx.shadowColor='#FF2266'; ctx.fill();
    ctx.restore();

    // ── Surfista (silueta estilizada) ──
    ctx.save();
    ctx.fillStyle   = '#111122';
    ctx.strokeStyle = s.colorTema;
    ctx.lineWidth   = 2.5;
    ctx.shadowBlur  = 10; ctx.shadowColor = s.colorTema;

    // Piernas
    ctx.beginPath();
    ctx.moveTo(-8, 8); ctx.lineTo(-10, 28);   // pierna izq
    ctx.moveTo( 8, 8); ctx.lineTo( 10, 28);   // pierna der
    ctx.stroke();

    // Cuerpo
    ctx.beginPath();
    ctx.moveTo(-8, 8); ctx.lineTo(0, -22);    // torso izq
    ctx.moveTo( 8, 8); ctx.lineTo(0, -22);    // torso der
    ctx.stroke();

    // Brazos extendidos (equilibrio)
    ctx.beginPath();
    ctx.moveTo(-26+tilt*10, -8); ctx.lineTo(26-tilt*10, -8);
    ctx.stroke();

    // Cabeza
    ctx.beginPath(); ctx.arc(0, -30, 9, 0, Math.PI*2);
    ctx.fillStyle = '#FFCC88'; ctx.fill();
    ctx.strokeStyle = s.colorTema; ctx.stroke();

    // Pelo (según tilt — el pelo vuela)
    ctx.beginPath();
    ctx.moveTo(-5,-38);
    ctx.quadraticCurveTo(-8-tilt*12,-48, 2-tilt*20,-45);
    ctx.strokeStyle='#442200'; ctx.lineWidth=3; ctx.shadowBlur=0; ctx.stroke();

    ctx.restore();
    ctx.restore(); // tabla completa

    // ── HUD de posición ───────────────────────────────────
    // Barra indicadora de posición del surfista en la parte inferior
    const barY = H - 22, barW = W*0.6, barX = W*0.2;
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.45)';
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(barX,barY,barW,8,4);
    else ctx.rect(barX,barY,barW,8);
    ctx.fill();
    const posX = barX + (s.surfX - 0.2) / 0.6 * barW;
    const pg = ctx.createRadialGradient(posX,barY+4,0,posX,barY+4,12);
    pg.addColorStop(0,'#FFFFFF'); pg.addColorStop(0.4,s.colorTema); pg.addColorStop(1,'transparent');
    ctx.fillStyle=pg; ctx.shadowBlur=12; ctx.shadowColor=s.colorTema;
    ctx.beginPath(); ctx.arc(posX,barY+4,6,0,Math.PI*2); ctx.fill();
    ctx.restore();
  },

  getState() { return this._state; },
};