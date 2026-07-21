import React, { useRef, useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { SFX } from './games/SoundEngine.js';
import { TEMAS_DEMO, generarRetoDemo } from './preguntasDemo.js';

// ── Importar motores de juego ─────────────────────────────────
import { ArponGame }  from './games/ArponGame.js';
import { PinataGame } from './games/Pinatagame.js';
import { LaserGame }  from './games/LaserGame.js';

const JUEGOS_DEMO = [
  { id: 'arpon',  nombre: 'Arpón',  icono: '🐋', desc: 'Lanza el arpón con precisión', Motor: ArponGame,  color: '#00FFFF' },
  { id: 'pinata', nombre: 'Piñata', icono: '🎉', desc: 'Rompe las piñatas correctas',  Motor: PinataGame, color: '#00FF41' },
  { id: 'laser',  nombre: 'Láser',  icono: '🔫', desc: 'Revienta globos con rayos',    Motor: LaserGame,  color: '#FFD700' },
];

const DIFICULTADES = [
  { id: 'facil',   label: '🟢 Fácil'   },
  { id: 'medio',   label: '🟡 Medio'   },
  { id: 'dificil', label: '🔴 Difícil' },
];

// ── Parche: inyectar generador demo en los juegos ─────────────
function parchearMotor(Motor, temaId) {
  const motorClone = Object.create(Motor);
  // Sobrescribir init para inyectar el generador de preguntas del tema
  const initOriginal = Motor.init.bind(Motor);
  motorClone.init = function(materia, colorTema, config) {
    // Guardar tema globalmente para que preguntas.js lo use
    window._demTema = temaId;
    return initOriginal(materia, colorTema, config);
  };
  motorClone.update  = Motor.update.bind(Motor);
  motorClone.render  = Motor.render.bind(Motor);
  if (Motor.renderBrazos) motorClone.renderBrazos = Motor.renderBrazos.bind(Motor);
  motorClone.getState = Motor.getState?.bind(Motor);
  return motorClone;
}

const ModoDemo = ({ rol, onSalir }) => {
  const videoRef      = useRef(null);
  const canvasRef     = useRef(null);
  const contenedorRef = useRef(null);
  const iaIniciada    = useRef(false);
  const requestRef    = useRef();
  const motorRef      = useRef(null);
  const historial     = useRef(null);
  const faseRef       = useRef('selector');
  const puntosRef     = useRef(0);
  const configRef     = useRef({ dificultad: 'medio', modo: 'libre', cantidad: 3 });
  const timerRef      = useRef(null);
  const vidasRef      = useRef(3);
  const tiempoRef     = useRef(30);

  // ── Estado UI ─────────────────────────────────────────────
  const [fase, setFase]           = useState('selector');  // selector|tema|config|preparacion|jugando|fin|metricas
  const [juegoSel, setJuegoSel]   = useState(null);
  const [temaSel, setTemaSel]     = useState(null);
  const [juegoActual, setJuego]   = useState(null);
  const [estado, setEstado]       = useState('calibrando');
  const [puntos, setPuntos]       = useState(0);
  const [flash, setFlash]         = useState(null);
  const [fullscreen, setFull]     = useState(false);
  const [conteo, setConteo]       = useState(null);
  const [dificultad, setDif]      = useState('medio');
  const [modoPartida, setModo]    = useState('libre');
  const [cantidad, setCantidad]   = useState(3);
  const [vidas, setVidas]         = useState(3);
  const [tiempo, setTiempo]       = useState(30);

  // Métricas
  const [alumnos, setAlumnos]     = useState([]);
  const [cargMet, setCargMet]     = useState(false);
  const [periodo, setPeriodo]     = useState('xp_total');

  // ── Rol efectivo ──────────────────────────────────────────
  const rolEfectivo = rol || localStorage.getItem('iapprende_rol') || 'invitado';
  const esAlumno    = rolEfectivo === 'alumno';
  const grupo       = localStorage.getItem('iapprende_grupo')   || '';
  const escuela     = localStorage.getItem('iapprende_escuela') || '';

  const mostrarFlash = (txt, col='#00FF41') => {
    setFlash({ txt, col });
    setTimeout(() => setFlash(null), 1500);
  };

  // ── Métricas ──────────────────────────────────────────────
  const cargarMetricas = async () => {
    if (!grupo || !escuela) return;
    setCargMet(true);
    try {
      const q = query(collection(db,'alumnos'), where('escuelaNombre','==',escuela), where('grupo','==',grupo));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      setAlumnos(data.sort((a,b) => (b[periodo]||0)-(a[periodo]||0)));
    } catch(e) { console.error(e); }
    finally { setCargMet(false); }
  };

  // ── Flujo de navegación ───────────────────────────────────
  const elegirJuego   = (j) => { setJuegoSel(j); setFase('tema'); faseRef.current='tema'; };
  const elegirTema    = (t) => { setTemaSel(t);  setFase('config'); faseRef.current='config'; };
  const verMetricas   = () => { setFase('metricas'); faseRef.current='metricas'; cargarMetricas(); };
  const volverSelector= () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current=null; }
    faseRef.current='selector'; setFase('selector');
    motorRef.current=null; setJuego(null); setJuegoSel(null); setTemaSel(null);
    puntosRef.current=0; setPuntos(0); setConteo(null);
  };

  const iniciarJuego = () => {
    const cfg = { dificultad, modo:modoPartida, cantidad };
    configRef.current = cfg;
    puntosRef.current = 0; setPuntos(0);
    const v = modoPartida==='vidas' ? cantidad : 3;
    const t = modoPartida==='tiempo' ? cantidad : 30;
    vidasRef.current=v; setVidas(v);
    tiempoRef.current=t; setTiempo(t);

    // Inyectar generador de preguntas del tema seleccionado
    window._demoGenerarReto = () => generarRetoDemo(temaSel.id);

    // Parchear el motor para usar preguntas del tema
    const motor = juegoSel.Motor;
    // Guardamos referencia directa al motor (singleton)
    motorRef.current = motor;
    motor.init(temaSel.id, juegoSel.color, { dificultad });

    setJuego(juegoSel);
    faseRef.current='preparacion'; setFase('preparacion');
    try { SFX.inicio?.(); } catch(_) {}

    let c=3; setConteo(c);
    const iv = setInterval(() => {
      c--;
      if (c>0) setConteo(c);
      else if (c===0) setConteo('¡GO!');
      else {
        clearInterval(iv); setConteo(null);
        faseRef.current='jugando'; setFase('jugando');
        if (modoPartida==='tiempo') {
          timerRef.current = setInterval(() => {
            tiempoRef.current--;
            setTiempo(tiempoRef.current);
            if (tiempoRef.current<=0) terminarJuego();
          }, 1000);
        }
      }
    }, 1000);
  };

  const terminarJuego = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current=null; }
    faseRef.current='fin'; setFase('fin');
    try { SFX.gameOver?.(); } catch(_) {}
  };

  const cerrarSesion = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await signOut(auth);
    ['iapprende_rol','iapprende_codigo','iapprende_grupo','iapprende_escuela','iapprende_proyecto']
      .forEach(k => localStorage.removeItem(k));
    window.location.replace('https://iapprende.com');
  };

  const toggleFS = () => {
    if (!document.fullscreenElement) {
      contenedorRef.current?.requestFullscreen().catch(()=>{});
      setFull(true);
    } else { document.exitFullscreen(); setFull(false); }
  };

  // ── Motor MediaPipe ───────────────────────────────────────
  useEffect(() => {
    if (iaIniciada.current) return;
    iaIniciada.current = true;
    const videoEl=videoRef.current, canvasEl=canvasRef.current, ctx=canvasEl.getContext('2d');
    let lastTime=0;

    const arrancar = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');
        const pose = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task', delegate:'GPU' },
          runningMode:'VIDEO', numPoses:1,
        });
        const stream = await navigator.mediaDevices.getUserMedia({ video:true });
        videoEl.srcObject=stream;
        await new Promise(res => { videoEl.onloadedmetadata=res; });
        videoEl.play(); setEstado('activo');

        let lastVT=-1;
        const loop = (ts) => {
          const delta=(ts-lastTime)*0.06; lastTime=ts;
          const W=canvasEl.width, H=canvasEl.height;
          if (videoEl.readyState>=2 && lastVT!==videoEl.currentTime) {
            lastVT=videoEl.currentTime;
            const res=pose.detectForVideo(videoEl,performance.now());
            ctx.save(); ctx.clearRect(0,0,W,H);
            ctx.fillStyle='#050510'; ctx.fillRect(0,0,W,H);
            let lm=null;
            if (res.landmarks?.length>0) {
              const cr=res.landmarks[0]; lm=cr;
              if (historial.current?.length===cr.length) lm=cr.map((p,i)=>({x:historial.current[i].x+(p.x-historial.current[i].x)*0.8,y:historial.current[i].y+(p.y-historial.current[i].y)*0.8,z:p.z,visibility:p.visibility}));
              historial.current=lm;
            } else { historial.current=null; }

            // Esqueleto
            if (lm) {
              const col=juegoActual?.color||'#00FFFF';
              ctx.save(); ctx.translate(W,0); ctx.scale(-1,1);
              ctx.shadowBlur=15; ctx.shadowColor=col; ctx.strokeStyle=col; ctx.lineWidth=8; ctx.lineCap='round'; ctx.lineJoin='round';
              let aH=100;
              if(lm[11]&&lm[12]) aH=Math.hypot((lm[12].x-lm[11].x)*W,(lm[12].y-lm[11].y)*H);
              const rc=aH*0.3;
              const L=(i,j)=>{if(lm[i]?.visibility>0.3&&lm[j]?.visibility>0.3){ctx.moveTo(lm[i].x*W,lm[i].y*H);ctx.lineTo(lm[j].x*W,lm[j].y*H);}};
              ctx.beginPath();
              if(lm[11]&&lm[12]&&lm[23]&&lm[24]){const hM={x:(lm[11].x+lm[12].x)/2*W,y:(lm[11].y+lm[12].y)/2*H},cM={x:(lm[23].x+lm[24].x)/2*W,y:(lm[23].y+lm[24].y)/2*H};L(11,12);L(23,24);ctx.moveTo(hM.x,hM.y);ctx.lineTo(cM.x,cM.y);if(lm[0]){ctx.moveTo(hM.x,hM.y);ctx.lineTo(lm[0].x*W,lm[0].y*H+rc);ctx.stroke();ctx.beginPath();ctx.arc(lm[0].x*W,lm[0].y*H,Math.max(20,rc),0,Math.PI*2);ctx.stroke();}}
              ctx.beginPath();L(11,13);L(13,15);L(12,14);L(14,16);L(23,25);L(25,27);L(24,26);L(26,28);ctx.stroke();
              ctx.restore();
            }

            // Juego
            if ((faseRef.current==='jugando'||faseRef.current==='preparacion')&&motorRef.current) {
              if (faseRef.current==='jugando') {
                const r=motorRef.current.update(lm,W,H,delta);
                if(r){
                  puntosRef.current=Math.max(0,puntosRef.current+(r.puntos||0)); setPuntos(puntosRef.current);
                  mostrarFlash(r.acierto?`+${r.puntos} XP ✅`:`${r.puntos} XP ❌`,r.acierto?'#00FF41':'#FF4444');
                  if(r.fallo&&configRef.current.modo==='vidas'){vidasRef.current=Math.max(0,vidasRef.current-1);setVidas(vidasRef.current);if(vidasRef.current<=0)terminarJuego();}
                }
              }
              motorRef.current.render(ctx,W,H);
              if(lm&&motorRef.current.renderBrazos) motorRef.current.renderBrazos(ctx,lm,W,H);
            }
            ctx.restore();
          }
          requestRef.current=requestAnimationFrame(loop);
        };
        loop(0);
      } catch(e) { console.error(e); setEstado('error'); }
    };
    arrancar();
    return () => {
      if(requestRef.current) cancelAnimationFrame(requestRef.current);
      if(timerRef.current) clearInterval(timerRef.current);
      if(videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t=>t.stop());
      iaIniciada.current=false;
    };
  }, []);

  // ── Necesitamos parchear preguntas.js para usar banco demo ──
  // Esto se hace importando generarRetoDemo y asignándolo globalmente
  useEffect(() => {
    // Monkey-patch: cuando el juego llame a generarRetoActivo, usamos el banco demo
    const orig = window._demoGenerarReto;
    return () => { window._demoGenerarReto = orig; };
  }, []);

  const colorTema = juegoSel?.color || juegoActual?.color || (esAlumno?'#00FF41':'#00FFFF');

  const Overlay = ({ children, scroll }) => (
    <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.90)', backdropFilter:'blur(12px)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'18px', padding:'20px', overflowY:scroll?'auto':'hidden', zIndex:10 }}>
      {children}
    </div>
  );

  const BtnBack = ({ label='← Volver', onClick }) => (
    <button onClick={onClick} style={{ background:'rgba(255,200,0,0.12)', border:'1px solid #FFC80044', borderRadius:'6px', color:'#FFC800', fontSize:'0.65rem', padding:'3px 10px', cursor:'pointer', fontFamily:'Orbitron, sans-serif' }}>{label}</button>
  );

  return (
    <div ref={contenedorRef} style={{ background:'#000', width:'100vw', height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden', position:'fixed', inset:0 }}>

      {/* ── HEADER ── */}
      <header style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 14px', background:'rgba(0,0,0,0.85)', borderBottom:`1px solid ${colorTema}44`, zIndex:20, flexShrink:0, height:'40px' }}>
        <span style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.72rem', color:colorTema, fontWeight:'bold' }}>
          NEXUS {esAlumno?'— ALUMNO':'— INVITADO'}
        </span>
        {esAlumno && grupo && <span style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.35)', fontFamily:'Rajdhani, sans-serif' }}>· {escuela} / Gpo {grupo}</span>}
        <div style={{ flex:1 }}/>
        {(fase==='jugando'||fase==='preparacion') && <>
          {modoPartida==='vidas'  && <span style={{ fontSize:'0.85rem' }}>{'❤️'.repeat(Math.max(0,vidas))}</span>}
          {modoPartida==='tiempo' && <span style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.8rem', color:'#FFD700' }}>⏱ {tiempo}s</span>}
          <span style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.8rem', color:'#FFD700', fontWeight:'bold' }}>⭐ {puntos}</span>
          <BtnBack label='← Juegos' onClick={volverSelector}/>
        </>}
        {['metricas','tema','config'].includes(fase) && <BtnBack onClick={volverSelector}/>}
        <button onClick={toggleFS} style={{ background:'rgba(0,255,255,0.1)', border:'1px solid #00FFFF33', borderRadius:'6px', color:'#00FFFF', fontSize:'0.8rem', padding:'3px 8px', cursor:'pointer' }}>{fullscreen?'⊡':'⛶'}</button>
        <button onClick={cerrarSesion} style={{ background:'rgba(255,8,68,0.18)', border:'1px solid #FF084455', borderRadius:'6px', color:'#FF0844', fontSize:'0.65rem', padding:'3px 8px', cursor:'pointer', fontFamily:'Orbitron, sans-serif' }}>Salir</button>
        <span style={{ fontSize:'0.65rem', color:estado==='activo'?'#00FF41':'#888' }}>{estado==='activo'?'⚡':'⏳'}</span>
      </header>

      {/* ── CANVAS ── */}
      <div style={{ position:'relative', flex:1, overflow:'hidden' }}>
        <video ref={videoRef} style={{ display:'none' }} playsInline/>
        <canvas ref={canvasRef} width="1280" height="720" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>

        {flash && <div style={{ position:'absolute', top:'18%', left:'50%', transform:'translateX(-50%)', fontFamily:'Orbitron, sans-serif', fontSize:'2rem', fontWeight:'bold', color:flash.col, textShadow:`0 0 30px ${flash.col}`, pointerEvents:'none', zIndex:5 }}>{flash.txt}</div>}

        {fase==='preparacion' && conteo!==null && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:15, pointerEvents:'none' }}>
            <div style={{ fontFamily:'Orbitron, sans-serif', fontSize:'8rem', fontWeight:'900', color:colorTema, textShadow:`0 0 60px ${colorTema}` }}>{conteo}</div>
          </div>
        )}

        {/* ── ESTADOS DE CARGA ── */}
        {estado==='calibrando' && <Overlay><div style={{ fontFamily:'Orbitron, sans-serif', color:'#00FFFF', fontSize:'1.2rem' }}>⚡ Iniciando cámara...</div><div style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif' }}>Permite el acceso a la cámara</div></Overlay>}
        {estado==='error' && <Overlay><div style={{ fontFamily:'Orbitron, sans-serif', color:'#FF4444', fontSize:'1.2rem' }}>❌ Error de cámara</div><button onClick={()=>window.location.reload()} style={{ background:'rgba(0,255,65,0.15)', border:'1px solid #00FF41', borderRadius:'8px', color:'#00FF41', padding:'10px 24px', cursor:'pointer', fontFamily:'Orbitron, sans-serif' }}>🔄 Reintentar</button></Overlay>}

        {/* ══ 1. SELECTOR DE JUEGOS ══ */}
        {fase==='selector' && estado==='activo' && (
          <Overlay>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', background:esAlumno?'rgba(0,255,65,0.1)':'rgba(0,255,255,0.1)', border:`1px solid ${esAlumno?'#00FF41':'#00FFFF'}44`, borderRadius:'100px', padding:'6px 18px' }}>
              <span>{esAlumno?'🎒':'🌐'}</span>
              <span style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.72rem', color:esAlumno?'#00FF41':'#00FFFF', fontWeight:'600' }}>
                {esAlumno?`ALUMNO — Grupo ${grupo||'?'}`:'MODO INVITADO'}
              </span>
            </div>

            <div style={{ textAlign:'center' }}>
              <h2 style={{ fontFamily:'Orbitron, sans-serif', color:'#FFF', fontSize:'clamp(1.1rem,3vw,1.7rem)', margin:'0 0 6px' }}>⚡ ELIGE TU JUEGO</h2>
              <p style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.9rem', margin:0 }}>
                {esAlumno?'Modo demo. Elige un juego y un tema.':'Explora sin registro. Sin guardado de estadísticas.'}
              </p>
            </div>

            <div style={{ display:'flex', gap:'14px', flexWrap:'wrap', justifyContent:'center' }}>
              {JUEGOS_DEMO.map(j => (
                <button key={j.id} onClick={()=>elegirJuego(j)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'10px', padding:'22px 20px', width:'170px', background:'rgba(0,0,0,0.5)', border:`2px solid ${j.color}44`, borderRadius:'18px', cursor:'pointer', color:'#FFF', transition:'all .2s', fontFamily:'Orbitron, sans-serif' }}
                  onMouseOver={e=>{e.currentTarget.style.borderColor=j.color;e.currentTarget.style.transform='translateY(-5px)';e.currentTarget.style.boxShadow=`0 10px 28px ${j.color}44`;}}
                  onMouseOut={e=>{e.currentTarget.style.borderColor=j.color+'44';e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='none';}}>
                  <span style={{ fontSize:'2.5rem' }}>{j.icono}</span>
                  <div style={{ fontWeight:'700', fontSize:'0.9rem', color:j.color }}>{j.nombre}</div>
                  <div style={{ fontSize:'0.62rem', color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif', textAlign:'center' }}>{j.desc}</div>
                  <div style={{ background:j.color, color:'#000', fontSize:'0.6rem', fontWeight:'700', padding:'3px 10px', borderRadius:'100px' }}>ELEGIR →</div>
                </button>
              ))}
            </div>

            {esAlumno && grupo && (
              <button onClick={verMetricas}
                style={{ display:'flex', alignItems:'center', gap:'10px', background:'rgba(0,255,65,0.08)', border:'2px solid #00FF4155', borderRadius:'12px', padding:'12px 24px', cursor:'pointer', color:'#00FF41', fontFamily:'Orbitron, sans-serif', fontSize:'0.82rem', fontWeight:'700', transition:'all .2s' }}
                onMouseOver={e=>{e.currentTarget.style.background='rgba(0,255,65,0.18)';e.currentTarget.style.borderColor='#00FF41';}}
                onMouseOut={e=>{e.currentTarget.style.background='rgba(0,255,65,0.08)';e.currentTarget.style.borderColor='#00FF4155';}}>
                <span style={{ fontSize:'1.2rem' }}>📊</span> Ver métricas de mi grupo
              </button>
            )}

            {!esAlumno && (
              <div style={{ background:'rgba(0,255,255,0.05)', border:'1px solid rgba(0,255,255,0.15)', borderRadius:'10px', padding:'12px 18px', maxWidth:'420px', textAlign:'center' }}>
                <p style={{ color:'rgba(255,255,255,0.45)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.82rem', margin:0 }}>
                  💡 Solicita un código a tu docente para acceder a métricas y seguimiento de progreso.
                </p>
              </div>
            )}

            <button onClick={cerrarSesion} style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'8px', color:'rgba(255,255,255,0.35)', fontSize:'0.72rem', padding:'7px 18px', cursor:'pointer', fontFamily:'Rajdhani, sans-serif' }}>
              ← Volver al inicio
            </button>
          </Overlay>
        )}

        {/* ══ 2. SELECTOR DE TEMA ══ */}
        {fase==='tema' && juegoSel && (
          <Overlay>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'2.5rem', marginBottom:'4px' }}>{juegoSel.icono}</div>
              <h2 style={{ fontFamily:'Orbitron, sans-serif', color:juegoSel.color, fontSize:'1.4rem', margin:'0 0 4px' }}>{juegoSel.nombre}</h2>
              <p style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.85rem', margin:0 }}>Elige el tema de las preguntas</p>
            </div>

            <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', justifyContent:'center', maxWidth:'700px' }}>
              {TEMAS_DEMO.map(t => (
                <button key={t.id} onClick={()=>elegirTema(t)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', padding:'18px 16px', width:'150px', background:'rgba(0,0,0,0.5)', border:`2px solid ${t.color}44`, borderRadius:'16px', cursor:'pointer', color:'#FFF', transition:'all .2s', fontFamily:'Orbitron, sans-serif' }}
                  onMouseOver={e=>{e.currentTarget.style.borderColor=t.color;e.currentTarget.style.transform='translateY(-4px)';e.currentTarget.style.boxShadow=`0 8px 24px ${t.color}44`;}}
                  onMouseOut={e=>{e.currentTarget.style.borderColor=t.color+'44';e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='none';}}>
                  <span style={{ fontSize:'2rem' }}>{t.icono}</span>
                  <div style={{ fontWeight:'700', fontSize:'0.75rem', color:t.color, textAlign:'center', lineHeight:'1.2' }}>{t.label}</div>
                  <div style={{ background:t.color, color:'#000', fontSize:'0.55rem', fontWeight:'700', padding:'2px 8px', borderRadius:'100px' }}>ELEGIR</div>
                </button>
              ))}
            </div>
          </Overlay>
        )}

        {/* ══ 3. CONFIGURACIÓN DE PARTIDA ══ */}
        {fase==='config' && juegoSel && temaSel && (
          <Overlay>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'1.8rem', marginBottom:'2px' }}>{juegoSel.icono} + {temaSel.icono}</div>
              <h2 style={{ fontFamily:'Orbitron, sans-serif', color:juegoSel.color, fontSize:'1.3rem', margin:'0 0 2px' }}>{juegoSel.nombre} · {temaSel.label}</h2>
              <p style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.82rem', margin:0 }}>Configura tu partida</p>
            </div>

            <div style={{ width:'100%', maxWidth:'420px' }}>
              <p style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.65rem', color:'rgba(255,255,255,0.45)', margin:'0 0 8px', letterSpacing:'2px' }}>DIFICULTAD</p>
              <div style={{ display:'flex', gap:'8px' }}>
                {DIFICULTADES.map(d => (
                  <button key={d.id} onClick={()=>setDif(d.id)}
                    style={{ flex:1, padding:'10px', background:dificultad===d.id?`${juegoSel.color}22`:'rgba(0,0,0,0.5)', border:`2px solid ${dificultad===d.id?juegoSel.color:'rgba(255,255,255,0.15)'}`, borderRadius:'10px', cursor:'pointer', color:dificultad===d.id?juegoSel.color:'rgba(255,255,255,0.45)', fontFamily:'Orbitron, sans-serif', fontSize:'0.68rem', fontWeight:'700', transition:'all .2s' }}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ width:'100%', maxWidth:'420px' }}>
              <p style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.65rem', color:'rgba(255,255,255,0.45)', margin:'0 0 8px', letterSpacing:'2px' }}>MODO DE PARTIDA</p>
              <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
                {[{id:'libre',label:'🎮 Libre',desc:'Sin límites'},{id:'vidas',label:'❤️ Vidas',desc:'N° de vidas'},{id:'tiempo',label:'⏱ Tiempo',desc:'Segundos'}].map(m => (
                  <button key={m.id} onClick={()=>setModo(m.id)}
                    style={{ flex:1, padding:'10px 6px', background:modoPartida===m.id?`${juegoSel.color}22`:'rgba(0,0,0,0.5)', border:`2px solid ${modoPartida===m.id?juegoSel.color:'rgba(255,255,255,0.15)'}`, borderRadius:'10px', cursor:'pointer', color:modoPartida===m.id?juegoSel.color:'rgba(255,255,255,0.45)', fontFamily:'Orbitron, sans-serif', fontSize:'0.62rem', fontWeight:'700', transition:'all .2s', display:'flex', flexDirection:'column', gap:'2px', alignItems:'center' }}>
                    <span>{m.label}</span>
                    <span style={{ fontSize:'0.52rem', opacity:0.6, fontFamily:'Rajdhani, sans-serif' }}>{m.desc}</span>
                  </button>
                ))}
              </div>
              {modoPartida!=='libre' && (
                <div style={{ display:'flex', alignItems:'center', gap:'16px', justifyContent:'center', fontFamily:'Orbitron, sans-serif' }}>
                  <button onClick={()=>setCantidad(c=>Math.max(1,c-(modoPartida==='tiempo'?10:1)))} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'8px', color:'#fff', fontSize:'1.4rem', width:'40px', height:'40px', cursor:'pointer' }}>−</button>
                  <span style={{ minWidth:'90px', textAlign:'center', fontSize:'1.5rem', fontWeight:'bold', color:juegoSel.color }}>{cantidad} {modoPartida==='tiempo'?'seg':'♥'}</span>
                  <button onClick={()=>setCantidad(c=>c+(modoPartida==='tiempo'?10:1))} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'8px', color:'#fff', fontSize:'1.4rem', width:'40px', height:'40px', cursor:'pointer' }}>+</button>
                </div>
              )}
            </div>

            <button onClick={iniciarJuego}
              style={{ background:juegoSel.color, color:'#000', fontFamily:'Orbitron, sans-serif', fontSize:'1.1rem', fontWeight:'800', padding:'14px 48px', borderRadius:'12px', border:'none', cursor:'pointer', boxShadow:`0 0 24px ${juegoSel.color}66`, transition:'all .2s' }}
              onMouseOver={e=>{e.currentTarget.style.transform='translateY(-3px)';}}
              onMouseOut={e=>{e.currentTarget.style.transform='translateY(0)';}}>
              🚀 INICIAR RETO
            </button>
          </Overlay>
        )}

        {/* ══ 4. FIN DE PARTIDA ══ */}
        {fase==='fin' && juegoActual && (
          <Overlay>
            <h2 style={{ fontFamily:'Orbitron, sans-serif', color:colorTema, fontSize:'2.5rem', margin:0, textShadow:`0 0 20px ${colorTema}` }}>
              {modoPartida==='tiempo'?'¡TIEMPO!':modoPartida==='vidas'?'¡GAME OVER!':'¡RONDA COMPLETA!'}
            </h2>
            <p style={{ fontFamily:'Rajdhani, sans-serif', color:'rgba(255,255,255,0.5)', fontSize:'0.95rem', margin:'2px 0 0' }}>
              {juegoActual.icono} {juegoActual.nombre} · {temaSel?.icono} {temaSel?.label} · {dificultad.toUpperCase()}
            </p>
            <div style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.85rem', color:'rgba(255,255,255,0.4)' }}>XP OBTENIDA</div>
            <div style={{ fontFamily:'Orbitron, sans-serif', fontSize:'4rem', fontWeight:'900', color:colorTema, textShadow:`0 0 30px ${colorTema}` }}>{puntos}</div>
            {esAlumno && <p style={{ color:'rgba(255,255,255,0.25)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.78rem', margin:0 }}>Modo demo — XP no guardado en el sistema</p>}
            <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', justifyContent:'center' }}>
              <button onClick={()=>{ faseRef.current='config'; setFase('config'); puntosRef.current=0; setPuntos(0); }}
                style={{ background:`${colorTema}22`, border:`2px solid ${colorTema}`, borderRadius:'10px', color:colorTema, fontFamily:'Orbitron, sans-serif', fontSize:'0.85rem', padding:'12px 24px', cursor:'pointer' }}>
                🔄 Jugar de nuevo
              </button>
              <button onClick={volverSelector}
                style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'10px', color:'#fff', fontFamily:'Orbitron, sans-serif', fontSize:'0.85rem', padding:'12px 24px', cursor:'pointer' }}>
                🎮 Otros juegos
              </button>
            </div>
          </Overlay>
        )}

        {/* ══ 5. MÉTRICAS (solo alumno) ══ */}
        {fase==='metricas' && esAlumno && (
          <Overlay scroll>
            <div style={{ textAlign:'center' }}>
              <h2 style={{ fontFamily:'Orbitron, sans-serif', color:'#00FF41', fontSize:'1.5rem', margin:'0 0 4px' }}>📊 MÉTRICAS DEL GRUPO</h2>
              <p style={{ color:'rgba(255,255,255,0.35)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.82rem', margin:0 }}>{escuela} · Grupo {grupo} · Solo lectura</p>
            </div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', justifyContent:'center' }}>
              {[{id:'tri1',label:'📅 Tri 1'},{id:'tri2',label:'📅 Tri 2'},{id:'tri3',label:'📅 Tri 3'},{id:'xp_total',label:'🌟 Total'}].map(p => (
                <button key={p.id} onClick={()=>{setPeriodo(p.id);setAlumnos(prev=>[...prev].sort((a,b)=>(b[p.id]||0)-(a[p.id]||0)));}}
                  style={{ padding:'5px 12px', borderRadius:'100px', border:`1px solid ${periodo===p.id?'#00FF41':'rgba(255,255,255,0.2)'}`, background:periodo===p.id?'rgba(0,255,65,0.2)':'transparent', color:periodo===p.id?'#00FF41':'rgba(255,255,255,0.4)', cursor:'pointer', fontFamily:'Orbitron, sans-serif', fontSize:'0.62rem', transition:'all .2s' }}>
                  {p.label}
                </button>
              ))}
            </div>
            {cargMet ? (
              <div style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif' }}>Cargando...</div>
            ) : alumnos.length===0 ? (
              <div style={{ color:'rgba(255,255,255,0.3)', fontFamily:'Rajdhani, sans-serif', textAlign:'center' }}>No se encontraron alumnos.<br/>Verifica con tu docente.</div>
            ) : (
              <div style={{ width:'100%', maxWidth:'520px', maxHeight:'45vh', overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'Rajdhani, sans-serif', fontSize:'1rem' }}>
                  <thead>
                    <tr style={{ background:'rgba(0,255,65,0.1)', color:'#00FF41', textAlign:'left' }}>
                      <th style={{ padding:'8px 12px', borderBottom:'2px solid #00FF4144' }}>#</th>
                      <th style={{ padding:'8px 12px', borderBottom:'2px solid #00FF4144' }}>Alumno</th>
                      <th style={{ padding:'8px 12px', borderBottom:'2px solid #00FF4144', textAlign:'right' }}>XP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alumnos.map((a,i) => (
                      <tr key={a.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding:'8px 12px', color:i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'#fff', fontWeight:'bold' }}>#{i+1}</td>
                        <td style={{ padding:'8px 12px', color:'#fff' }}>{a.nombre}</td>
                        <td style={{ padding:'8px 12px', color:'#00FF41', fontFamily:'Orbitron, sans-serif', textAlign:'right' }}>{a[periodo]||0} XP</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ color:'rgba(255,255,255,0.2)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.7rem', textAlign:'center', marginTop:'10px' }}>🔒 Solo lectura</p>
              </div>
            )}
          </Overlay>
        )}
      </div>
    </div>
  );
};

export default ModoDemo;
