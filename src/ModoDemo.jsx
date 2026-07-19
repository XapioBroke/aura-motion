import React, { useRef, useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { ArponGame }  from './games/ArponGame.js';
import { PinataGame } from './games/Pinatagame.js';
import { LaserGame }  from './games/LaserGame.js';
import { SFX }        from './games/SoundEngine.js';

const JUEGOS_DEMO = [
  { id: 'arpon',  nombre: 'Arpón',  icono: '🐋', desc: 'Lanza el arpón con precisión', motor: ArponGame,  materia: 'quantum', color: '#00FFFF' },
  { id: 'pinata', nombre: 'Piñata', icono: '🎉', desc: 'Rompe las piñatas correctas',  motor: PinataGame, materia: 'force',   color: '#00FF41' },
  { id: 'laser',  nombre: 'Láser',  icono: '🔫', desc: 'Revienta globos con rayos',    motor: LaserGame,  materia: 'chronos', color: '#FFD700' },
];

const DIFICULTADES = [
  { id: 'facil',   label: '🟢 Fácil'   },
  { id: 'medio',   label: '🟡 Medio'   },
  { id: 'dificil', label: '🔴 Difícil' },
];

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

  const [fase, setFase]           = useState('selector');
  const [juegoActual, setJuego]   = useState(null);
  const [estado, setEstado]       = useState('calibrando');
  const [puntos, setPuntos]       = useState(0);
  const [flash, setFlash]         = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [conteo, setConteo]       = useState(null);

  // ── Config de partida ─────────────────────────────────────
  const [juegoSel, setJuegoSel]   = useState(null); // juego pendiente de configurar
  const [dificultad, setDificultad] = useState('medio');
  const [modoPartida, setModo]    = useState('libre'); // libre | vidas | tiempo
  const [cantidad, setCantidad]   = useState(3);
  const [vidas, setVidas]         = useState(3);
  const [tiempo, setTiempo]       = useState(30);
  const vidasRef  = useRef(3);
  const tiempoRef = useRef(30);
  const timerRef  = useRef(null);

  // ── Métricas ──────────────────────────────────────────────
  const [alumnos, setAlumnos]       = useState([]);
  const [cargandoMet, setCargandoMet] = useState(false);
  const [periodoVista, setPeriodo]  = useState('xp_total');

  // BUG 2 FIX — leer rol directamente del localStorage en caso de que prop llegue tarde
  const rolEfectivo = rol || localStorage.getItem('iapprende_rol') || 'invitado';
  const esAlumno    = rolEfectivo === 'alumno';
  const grupo       = localStorage.getItem('iapprende_grupo')   || '';
  const escuela     = localStorage.getItem('iapprende_escuela') || '';

  const mostrarFlash = (texto, color = '#00FF41') => {
    setFlash({ texto, color });
    setTimeout(() => setFlash(null), 1500);
  };

  // ── Métricas ──────────────────────────────────────────────
  const cargarMetricas = async () => {
    if (!grupo || !escuela) return;
    setCargandoMet(true);
    try {
      const q = query(collection(db, 'alumnos'), where('escuelaNombre', '==', escuela), where('grupo', '==', grupo));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAlumnos(data.sort((a,b) => (b[periodoVista]||0) - (a[periodoVista]||0)));
    } catch(e) { console.error(e); }
    finally { setCargandoMet(false); }
  };

  const verMetricas = () => { faseRef.current = 'metricas'; setFase('metricas'); cargarMetricas(); };

  // ── Configurar juego antes de iniciar ─────────────────────
  const abrirConfig = (juego) => { setJuegoSel(juego); faseRef.current = 'config'; setFase('config'); };

  const iniciarJuego = () => {
    const juego = juegoSel;
    const cfg = { dificultad, modo: modoPartida, cantidad };
    configRef.current = cfg;
    puntosRef.current = 0;
    setPuntos(0);
    const v = modoPartida === 'vidas' ? cantidad : 3;
    const t = modoPartida === 'tiempo' ? cantidad : 30;
    vidasRef.current  = v; setVidas(v);
    tiempoRef.current = t; setTiempo(t);
    setJuego(juego);
    motorRef.current = juego.motor;
    motorRef.current.init(juego.materia, juego.color, { dificultad });
    faseRef.current = 'preparacion';
    setFase('preparacion');
    try { SFX.inicio?.(); } catch(_) {}

    // Cuenta regresiva
    let c = 3;
    setConteo(c);
    const iv = setInterval(() => {
      c--;
      if (c > 0) setConteo(c);
      else if (c === 0) setConteo('¡GO!');
      else {
        clearInterval(iv);
        setConteo(null);
        faseRef.current = 'jugando';
        setFase('jugando');
        // Timer contrarreloj
        if (modoPartida === 'tiempo') {
          timerRef.current = setInterval(() => {
            tiempoRef.current -= 1;
            setTiempo(tiempoRef.current);
            if (tiempoRef.current <= 0) terminarJuego();
          }, 1000);
        }
      }
    }, 1000);
  };

  const terminarJuego = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    faseRef.current = 'fin';
    setFase('fin');
    try { SFX.gameOver?.(); } catch(_) {}
  };

  const volverAlSelector = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    faseRef.current = 'selector';
    setFase('selector');
    motorRef.current = null;
    setJuego(null);
    setJuegoSel(null);
    puntosRef.current = 0;
    setPuntos(0);
    setConteo(null);
  };

  const cerrarSesion = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await signOut(auth);
    ['iapprende_rol','iapprende_codigo','iapprende_grupo','iapprende_escuela','iapprende_proyecto']
      .forEach(k => localStorage.removeItem(k));
    window.location.replace('https://iapprende.com');
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      contenedorRef.current?.requestFullscreen().catch(()=>{});
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  // ── Motor de cámara ───────────────────────────────────────
  useEffect(() => {
    if (iaIniciada.current) return;
    iaIniciada.current = true;

    const videoEl  = videoRef.current;
    const canvasEl = canvasRef.current;
    const ctx      = canvasEl.getContext('2d');
    let lastTime   = 0;

    const arrancar = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        });

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoEl.srcObject = stream;
        await new Promise(res => { videoEl.onloadedmetadata = res; });
        videoEl.play();
        setEstado('activo');

        let lastVideoTime = -1;

        const renderLoop = (ts) => {
          const delta = (ts - lastTime) * 0.06;
          lastTime = ts;
          const W = canvasEl.width, H = canvasEl.height;

          if (videoEl.readyState >= 2 && lastVideoTime !== videoEl.currentTime) {
            lastVideoTime = videoEl.currentTime;
            const results = poseLandmarker.detectForVideo(videoEl, performance.now());

            ctx.save();
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, W, H);

            let lm = null;
            if (results.landmarks?.length > 0) {
              const crudos = results.landmarks[0];
              lm = crudos;
              if (historial.current?.length === crudos.length) {
                lm = crudos.map((p,i) => ({
                  x: historial.current[i].x + (p.x - historial.current[i].x) * 0.8,
                  y: historial.current[i].y + (p.y - historial.current[i].y) * 0.8,
                  z: p.z, visibility: p.visibility,
                }));
              }
              historial.current = lm;
            } else { historial.current = null; }

            // Esqueleto
            if (lm) {
              const color = juegoActual?.color || '#00FFFF';
              ctx.save();
              ctx.translate(W,0); ctx.scale(-1,1);
              ctx.shadowBlur=15; ctx.shadowColor=color;
              ctx.strokeStyle=color; ctx.lineWidth=8;
              ctx.lineCap='round'; ctx.lineJoin='round';
              let anchoH=100;
              if(lm[11]&&lm[12]) anchoH=Math.hypot((lm[12].x-lm[11].x)*W,(lm[12].y-lm[11].y)*H);
              const rc=anchoH*0.30;
              const linea=(i,j)=>{if(lm[i]?.visibility>0.3&&lm[j]?.visibility>0.3){ctx.moveTo(lm[i].x*W,lm[i].y*H);ctx.lineTo(lm[j].x*W,lm[j].y*H);}};
              ctx.beginPath();
              if(lm[11]&&lm[12]&&lm[23]&&lm[24]){
                const hM={x:(lm[11].x+lm[12].x)/2*W,y:(lm[11].y+lm[12].y)/2*H};
                const cM={x:(lm[23].x+lm[24].x)/2*W,y:(lm[23].y+lm[24].y)/2*H};
                linea(11,12);linea(23,24);
                ctx.moveTo(hM.x,hM.y);ctx.lineTo(cM.x,cM.y);
                if(lm[0]){ctx.moveTo(hM.x,hM.y);ctx.lineTo(lm[0].x*W,lm[0].y*H+rc);ctx.stroke();ctx.beginPath();ctx.arc(lm[0].x*W,lm[0].y*H,Math.max(20,rc),0,Math.PI*2);ctx.stroke();}
              }
              ctx.beginPath();
              linea(11,13);linea(13,15);linea(12,14);linea(14,16);
              linea(23,25);linea(25,27);linea(24,26);linea(26,28);
              ctx.stroke();
              ctx.restore();
            }

            // Juego activo
            if ((faseRef.current==='jugando'||faseRef.current==='preparacion') && motorRef.current) {
              if (faseRef.current==='jugando') {
                const resultado = motorRef.current.update(lm, W, H, delta);
                if (resultado) {
                  puntosRef.current = Math.max(0, puntosRef.current + (resultado.puntos||0));
                  setPuntos(puntosRef.current);
                  mostrarFlash(resultado.acierto?`+${resultado.puntos} XP ✅`:`${resultado.puntos} XP ❌`, resultado.acierto?'#00FF41':'#FF4444');
                  // Vidas
                  if (resultado.fallo && configRef.current.modo==='vidas') {
                    vidasRef.current = Math.max(0, vidasRef.current - 1);
                    setVidas(vidasRef.current);
                    if (vidasRef.current <= 0) terminarJuego();
                  }
                }
              }
              motorRef.current.render(ctx, W, H);
              if (lm && motorRef.current.renderBrazos) motorRef.current.renderBrazos(ctx, lm, W, H);
            }

            ctx.restore();
          }
          requestRef.current = requestAnimationFrame(renderLoop);
        };
        renderLoop(0);
      } catch(err) { console.error(err); setEstado('error'); }
    };

    arrancar();
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t=>t.stop());
      iaIniciada.current = false;
    };
  }, []);

  const colorTema = juegoActual?.color || juegoSel?.color || (esAlumno ? '#00FF41' : '#00FFFF');

  // ── OVERLAYS ──────────────────────────────────────────────
  const Overlay = ({ children }) => (
    <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.90)', backdropFilter:'blur(12px)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'20px', padding:'24px', overflowY:'auto', zIndex:10 }}>
      {children}
    </div>
  );

  return (
    // BUG 3 FIX — contenedor ocupa 100% del viewport
    <div ref={contenedorRef} style={{ background:'#000', width:'100vw', height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden', position:'fixed', inset:0 }}>

      {/* Header compacto */}
      <header style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 14px', background:'rgba(0,0,0,0.85)', borderBottom:`1px solid ${colorTema}44`, zIndex:20, flexShrink:0, height:'40px' }}>
        <span style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.72rem', color:colorTema, fontWeight:'bold' }}>
          NEXUS {esAlumno ? '— ALUMNO' : '— INVITADO'}
        </span>
        {esAlumno && grupo && (
          <span style={{ fontSize:'0.68rem', color:'rgba(255,255,255,0.35)', fontFamily:'Rajdhani, sans-serif' }}>· {escuela} / Gpo {grupo}</span>
        )}
        <div style={{ flex:1 }}/>
        {(fase==='jugando'||fase==='preparacion') && (
          <>
            {modoPartida==='vidas' && <span style={{ fontSize:'0.85rem' }}>{'❤️'.repeat(vidas)}</span>}
            {modoPartida==='tiempo' && <span style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.85rem', color:'#FFD700' }}>⏱ {tiempo}s</span>}
            <span style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.85rem', color:'#FFD700', fontWeight:'bold' }}>⭐ {puntos}</span>
            <button onClick={volverAlSelector} style={{ background:'rgba(255,200,0,0.15)', border:'1px solid #FFC80055', borderRadius:'6px', color:'#FFC800', fontSize:'0.65rem', padding:'3px 8px', cursor:'pointer', fontFamily:'Orbitron, sans-serif' }}>← Juegos</button>
          </>
        )}
        {fase==='metricas' && (
          <button onClick={volverAlSelector} style={{ background:'rgba(255,200,0,0.15)', border:'1px solid #FFC80055', borderRadius:'6px', color:'#FFC800', fontSize:'0.65rem', padding:'3px 8px', cursor:'pointer', fontFamily:'Orbitron, sans-serif' }}>← Volver</button>
        )}
        {fase==='config' && (
          <button onClick={volverAlSelector} style={{ background:'rgba(255,200,0,0.15)', border:'1px solid #FFC80055', borderRadius:'6px', color:'#FFC800', fontSize:'0.65rem', padding:'3px 8px', cursor:'pointer', fontFamily:'Orbitron, sans-serif' }}>← Juegos</button>
        )}
        <button onClick={toggleFullscreen} style={{ background:'rgba(0,255,255,0.1)', border:'1px solid #00FFFF33', borderRadius:'6px', color:'#00FFFF', fontSize:'0.8rem', padding:'3px 8px', cursor:'pointer' }}>
          {fullscreen ? '⊡' : '⛶'}
        </button>
        <button onClick={cerrarSesion} style={{ background:'rgba(255,8,68,0.18)', border:'1px solid #FF084455', borderRadius:'6px', color:'#FF0844', fontSize:'0.65rem', padding:'3px 8px', cursor:'pointer', fontFamily:'Orbitron, sans-serif' }}>Salir</button>
        <span style={{ fontSize:'0.65rem', color:estado==='activo'?'#00FF41':'#888' }}>{estado==='activo'?'⚡':'⏳'}</span>
      </header>

      {/* Canvas — ocupa todo el espacio restante */}
      <div style={{ position:'relative', flex:1, overflow:'hidden' }}>
        <video ref={videoRef} style={{ display:'none' }} playsInline />
        <canvas ref={canvasRef} width="1280" height="720"
          style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />

        {flash && (
          <div style={{ position:'absolute', top:'18%', left:'50%', transform:'translateX(-50%)', fontFamily:'Orbitron, sans-serif', fontSize:'2rem', fontWeight:'bold', color:flash.color, textShadow:`0 0 30px ${flash.color}`, pointerEvents:'none', zIndex:5 }}>
            {flash.texto}
          </div>
        )}

        {/* Cuenta regresiva */}
        {fase==='preparacion' && conteo !== null && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:15, pointerEvents:'none' }}>
            <div style={{ fontFamily:'Orbitron, sans-serif', fontSize:'8rem', fontWeight:'900', color:colorTema, textShadow:`0 0 60px ${colorTema}` }}>{conteo}</div>
          </div>
        )}

        {/* ══ CARGA ══ */}
        {estado==='calibrando' && (
          <Overlay>
            <div style={{ fontFamily:'Orbitron, sans-serif', color:'#00FFFF', fontSize:'1.2rem' }}>⚡ Iniciando cámara...</div>
            <div style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif' }}>Permite el acceso a la cámara</div>
          </Overlay>
        )}

        {estado==='error' && (
          <Overlay>
            <div style={{ fontFamily:'Orbitron, sans-serif', color:'#FF4444', fontSize:'1.2rem' }}>❌ Error de cámara</div>
            <button onClick={()=>window.location.reload()} style={{ background:'rgba(0,255,65,0.15)', border:'1px solid #00FF41', borderRadius:'8px', color:'#00FF41', padding:'10px 24px', cursor:'pointer', fontFamily:'Orbitron, sans-serif' }}>🔄 Reintentar</button>
          </Overlay>
        )}

        {/* ══ SELECTOR DE JUEGOS ══ */}
        {fase==='selector' && estado==='activo' && (
          <Overlay>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', background:esAlumno?'rgba(0,255,65,0.1)':'rgba(0,255,255,0.1)', border:`1px solid ${esAlumno?'#00FF41':'#00FFFF'}44`, borderRadius:'100px', padding:'6px 18px' }}>
              <span style={{ fontSize:'18px' }}>{esAlumno?'🎒':'🌐'}</span>
              <span style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.72rem', color:esAlumno?'#00FF41':'#00FFFF', fontWeight:'600' }}>
                {esAlumno ? `ALUMNO — Grupo ${grupo||'?'}` : 'MODO INVITADO'}
              </span>
            </div>

            <div style={{ textAlign:'center' }}>
              <h2 style={{ fontFamily:'Orbitron, sans-serif', color:'#FFF', fontSize:'clamp(1.2rem,3vw,1.8rem)', margin:'0 0 6px' }}>⚡ ELIGE TU JUEGO</h2>
              <p style={{ color:'rgba(255,255,255,0.45)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.9rem', margin:0 }}>
                {esAlumno ? 'Practica en modo demo. Sin guardado de XP.' : 'Explora sin registro. Sin guardado de estadísticas.'}
              </p>
            </div>

            <div style={{ display:'flex', gap:'14px', flexWrap:'wrap', justifyContent:'center' }}>
              {JUEGOS_DEMO.map(j => (
                <button key={j.id} onClick={()=>abrirConfig(j)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'10px', padding:'22px 20px', width:'180px', background:'rgba(0,0,0,0.5)', border:`2px solid ${j.color}44`, borderRadius:'18px', cursor:'pointer', color:'#FFF', transition:'all .2s', fontFamily:'Orbitron, sans-serif' }}
                  onMouseOver={e=>{e.currentTarget.style.borderColor=j.color;e.currentTarget.style.transform='translateY(-5px)';e.currentTarget.style.boxShadow=`0 10px 28px ${j.color}44`;}}
                  onMouseOut={e=>{e.currentTarget.style.borderColor=j.color+'44';e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='none';}}>
                  <span style={{ fontSize:'2.5rem' }}>{j.icono}</span>
                  <div style={{ fontWeight:'700', fontSize:'0.9rem', color:j.color }}>{j.nombre}</div>
                  <div style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.45)', fontFamily:'Rajdhani, sans-serif', textAlign:'center' }}>{j.desc}</div>
                  <div style={{ background:j.color, color:'#000', fontSize:'0.6rem', fontWeight:'700', padding:'3px 10px', borderRadius:'100px' }}>CONFIGURAR →</div>
                </button>
              ))}
            </div>

            {esAlumno && grupo && (
              <button onClick={verMetricas}
                style={{ display:'flex', alignItems:'center', gap:'10px', background:'rgba(0,255,65,0.08)', border:'2px solid #00FF4155', borderRadius:'12px', padding:'12px 24px', cursor:'pointer', color:'#00FF41', fontFamily:'Orbitron, sans-serif', fontSize:'0.82rem', fontWeight:'700', transition:'all .2s' }}
                onMouseOver={e=>{e.currentTarget.style.background='rgba(0,255,65,0.18)';e.currentTarget.style.borderColor='#00FF41';}}
                onMouseOut={e=>{e.currentTarget.style.background='rgba(0,255,65,0.08)';e.currentTarget.style.borderColor='#00FF4155';}}>
                <span style={{ fontSize:'1.2rem' }}>📊</span>
                Ver métricas de mi grupo
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

        {/* ══ CONFIGURACIÓN DE PARTIDA (BUG 4 FIX) ══ */}
        {fase==='config' && juegoSel && (
          <Overlay>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'3rem', marginBottom:'4px' }}>{juegoSel.icono}</div>
              <h2 style={{ fontFamily:'Orbitron, sans-serif', color:juegoSel.color, fontSize:'1.5rem', margin:'0 0 4px', textShadow:`0 0 20px ${juegoSel.color}` }}>{juegoSel.nombre}</h2>
              <p style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.85rem', margin:0 }}>Configura tu partida</p>
            </div>

            {/* Dificultad */}
            <div style={{ width:'100%', maxWidth:'420px' }}>
              <p style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.7rem', color:'rgba(255,255,255,0.5)', margin:'0 0 8px', letterSpacing:'2px' }}>DIFICULTAD</p>
              <div style={{ display:'flex', gap:'8px' }}>
                {DIFICULTADES.map(d => (
                  <button key={d.id} onClick={()=>setDificultad(d.id)}
                    style={{ flex:1, padding:'10px', background:dificultad===d.id?`${juegoSel.color}22`:'rgba(0,0,0,0.5)', border:`2px solid ${dificultad===d.id?juegoSel.color:'rgba(255,255,255,0.15)'}`, borderRadius:'10px', cursor:'pointer', color:dificultad===d.id?juegoSel.color:'rgba(255,255,255,0.5)', fontFamily:'Orbitron, sans-serif', fontSize:'0.7rem', fontWeight:'700', transition:'all .2s' }}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Modo de partida */}
            <div style={{ width:'100%', maxWidth:'420px' }}>
              <p style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.7rem', color:'rgba(255,255,255,0.5)', margin:'0 0 8px', letterSpacing:'2px' }}>MODO DE PARTIDA</p>
              <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
                {[
                  { id:'libre',  label:'🎮 Libre',        desc:'Sin límites' },
                  { id:'vidas',  label:'❤️ Supervivencia', desc:'N° de vidas' },
                  { id:'tiempo', label:'⏱ Contrarreloj',  desc:'Segundos' },
                ].map(m => (
                  <button key={m.id} onClick={()=>setModo(m.id)}
                    style={{ flex:1, padding:'10px 6px', background:modoPartida===m.id?`${juegoSel.color}22`:'rgba(0,0,0,0.5)', border:`2px solid ${modoPartida===m.id?juegoSel.color:'rgba(255,255,255,0.15)'}`, borderRadius:'10px', cursor:'pointer', color:modoPartida===m.id?juegoSel.color:'rgba(255,255,255,0.5)', fontFamily:'Orbitron, sans-serif', fontSize:'0.65rem', fontWeight:'700', transition:'all .2s', display:'flex', flexDirection:'column', gap:'2px', alignItems:'center' }}>
                    <span>{m.label}</span>
                    <span style={{ fontSize:'0.55rem', opacity:0.6, fontFamily:'Rajdhani, sans-serif' }}>{m.desc}</span>
                  </button>
                ))}
              </div>

              {modoPartida !== 'libre' && (
                <div style={{ display:'flex', alignItems:'center', gap:'16px', justifyContent:'center', fontFamily:'Orbitron, sans-serif' }}>
                  <button onClick={()=>setCantidad(c=>Math.max(1,c-(modoPartida==='tiempo'?10:1)))}
                    style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'8px', color:'#fff', fontSize:'1.4rem', width:'40px', height:'40px', cursor:'pointer' }}>−</button>
                  <span style={{ minWidth:'100px', textAlign:'center', fontSize:'1.6rem', fontWeight:'bold', color:juegoSel.color }}>
                    {cantidad} {modoPartida==='tiempo' ? 'seg' : '♥'}
                  </span>
                  <button onClick={()=>setCantidad(c=>c+(modoPartida==='tiempo'?10:1))}
                    style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'8px', color:'#fff', fontSize:'1.4rem', width:'40px', height:'40px', cursor:'pointer' }}>+</button>
                </div>
              )}
            </div>

            <button onClick={iniciarJuego}
              style={{ background:juegoSel.color, color:'#000', fontFamily:'Orbitron, sans-serif', fontSize:'1.1rem', fontWeight:'800', padding:'14px 48px', borderRadius:'12px', border:'none', cursor:'pointer', boxShadow:`0 0 24px ${juegoSel.color}66`, transition:'all .2s' }}
              onMouseOver={e=>{e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.boxShadow=`0 8px 32px ${juegoSel.color}88`;}}
              onMouseOut={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow=`0 0 24px ${juegoSel.color}66`;}}>
              🚀 INICIAR RETO
            </button>
          </Overlay>
        )}

        {/* ══ PANTALLA FIN ══ */}
        {fase==='fin' && juegoActual && (
          <Overlay>
            <h2 style={{ fontFamily:'Orbitron, sans-serif', color:colorTema, fontSize:'2.5rem', margin:0, textShadow:`0 0 20px ${colorTema}` }}>
              {modoPartida==='tiempo' ? '¡TIEMPO!' : '¡GAME OVER!'}
            </h2>
            <p style={{ fontFamily:'Rajdhani, sans-serif', color:'rgba(255,255,255,0.6)', fontSize:'1rem', margin:'4px 0 0' }}>
              {juegoActual.icono} {juegoActual.nombre} · {dificultad.toUpperCase()}
            </p>
            <div style={{ fontFamily:'Orbitron, sans-serif', fontSize:'1rem', color:'rgba(255,255,255,0.5)' }}>XP TOTAL</div>
            <div style={{ fontFamily:'Orbitron, sans-serif', fontSize:'4rem', fontWeight:'900', color:colorTema, textShadow:`0 0 30px ${colorTema}` }}>{puntos}</div>
            {esAlumno && <p style={{ color:'rgba(255,255,255,0.3)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.82rem', margin:0 }}>Modo demo — XP no guardado en el sistema</p>}
            <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', justifyContent:'center', marginTop:'8px' }}>
              <button onClick={()=>{ faseRef.current='config'; setFase('config'); puntosRef.current=0; setPuntos(0); }}
                style={{ background:`${colorTema}22`, border:`2px solid ${colorTema}`, borderRadius:'10px', color:colorTema, fontFamily:'Orbitron, sans-serif', fontSize:'0.85rem', padding:'12px 24px', cursor:'pointer' }}>
                🔄 Jugar de nuevo
              </button>
              <button onClick={volverAlSelector}
                style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'10px', color:'#fff', fontFamily:'Orbitron, sans-serif', fontSize:'0.85rem', padding:'12px 24px', cursor:'pointer' }}>
                🎮 Otros juegos
              </button>
            </div>
          </Overlay>
        )}

        {/* ══ MÉTRICAS (solo alumno) ══ */}
        {fase==='metricas' && esAlumno && (
          <Overlay>
            <div style={{ textAlign:'center' }}>
              <h2 style={{ fontFamily:'Orbitron, sans-serif', color:'#00FF41', fontSize:'1.6rem', margin:'0 0 4px' }}>📊 MÉTRICAS DEL GRUPO</h2>
              <p style={{ color:'rgba(255,255,255,0.35)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.85rem', margin:0 }}>{escuela} · Grupo {grupo} · Solo lectura</p>
            </div>

            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', justifyContent:'center' }}>
              {[{id:'tri1',label:'📅 Tri 1'},{id:'tri2',label:'📅 Tri 2'},{id:'tri3',label:'📅 Tri 3'},{id:'xp_total',label:'🌟 Total'}].map(p => (
                <button key={p.id} onClick={()=>{setPeriodo(p.id);setAlumnos(prev=>[...prev].sort((a,b)=>(b[p.id]||0)-(a[p.id]||0)));}}
                  style={{ padding:'6px 14px', borderRadius:'100px', border:`1px solid ${periodoVista===p.id?'#00FF41':'rgba(255,255,255,0.2)'}`, background:periodoVista===p.id?'rgba(0,255,65,0.2)':'transparent', color:periodoVista===p.id?'#00FF41':'rgba(255,255,255,0.45)', cursor:'pointer', fontFamily:'Orbitron, sans-serif', fontSize:'0.65rem', transition:'all .2s' }}>
                  {p.label}
                </button>
              ))}
            </div>

            {cargandoMet ? (
              <div style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif' }}>Cargando...</div>
            ) : alumnos.length === 0 ? (
              <div style={{ color:'rgba(255,255,255,0.3)', fontFamily:'Rajdhani, sans-serif', textAlign:'center' }}>No se encontraron alumnos.<br/>Verifica con tu docente.</div>
            ) : (
              <div style={{ width:'100%', maxWidth:'560px', maxHeight:'50vh', overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'Rajdhani, sans-serif', fontSize:'1rem' }}>
                  <thead>
                    <tr style={{ background:'rgba(0,255,65,0.1)', color:'#00FF41', textAlign:'left' }}>
                      <th style={{ padding:'10px 12px', borderBottom:'2px solid #00FF4144' }}>#</th>
                      <th style={{ padding:'10px 12px', borderBottom:'2px solid #00FF4144' }}>Alumno</th>
                      <th style={{ padding:'10px 12px', borderBottom:'2px solid #00FF4144', textAlign:'right' }}>XP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alumnos.map((a,i) => (
                      <tr key={a.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding:'9px 12px', color:i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'#fff', fontWeight:'bold' }}>#{i+1}</td>
                        <td style={{ padding:'9px 12px', color:'#fff' }}>{a.nombre}</td>
                        <td style={{ padding:'9px 12px', color:'#00FF41', fontFamily:'Orbitron, sans-serif', textAlign:'right' }}>{a[periodoVista]||0} XP</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ color:'rgba(255,255,255,0.2)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.72rem', textAlign:'center', marginTop:'12px' }}>🔒 Solo lectura</p>
              </div>
            )}
          </Overlay>
        )}
      </div>
    </div>
  );
};

export default ModoDemo;
