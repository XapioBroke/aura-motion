import React, { useRef, useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
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

const ModoDemo = ({ rol, onSalir }) => {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const iaIniciada = useRef(false);
  const requestRef = useRef();
  const motorRef   = useRef(null);
  const historial  = useRef(null);
  const faseRef    = useRef('selector');
  const puntosRef  = useRef(0);

  const [fase, setFase]         = useState('selector'); // selector | jugando | metricas
  const [juegoActual, setJuego] = useState(null);
  const [estado, setEstado]     = useState('calibrando');
  const [puntos, setPuntos]     = useState(0);
  const [flash, setFlash]       = useState(null);

  // ── Métricas ──────────────────────────────────────────────
  const [alumnos, setAlumnos]         = useState([]);
  const [cargandoMetricas, setCargando] = useState(false);
  const [periodoVista, setPeriodo]    = useState('xp_total');

  const esAlumno   = rol === 'alumno';
  const grupo      = localStorage.getItem('iapprende_grupo')   || '';
  const escuela    = localStorage.getItem('iapprende_escuela') || '';

  // ── Cargar métricas del grupo desde Firestore ─────────────
  const cargarMetricas = async () => {
    if (!grupo || !escuela) return;
    setCargando(true);
    try {
      const q = query(
        collection(db, 'alumnos'),
        where('escuelaNombre', '==', escuela),
        where('grupo', '==', grupo)
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAlumnos(data.sort((a, b) => (b[periodoVista] || 0) - (a[periodoVista] || 0)));
    } catch(e) {
      console.error('Error cargando métricas:', e);
    } finally {
      setCargando(false);
    }
  };

  const verMetricas = () => {
    faseRef.current = 'metricas';
    setFase('metricas');
    cargarMetricas();
  };

  const mostrarFlash = (texto, color = '#00FF41') => {
    setFlash({ texto, color });
    setTimeout(() => setFlash(null), 1500);
  };

  const iniciarJuego = (juego) => {
    setJuego(juego);
    puntosRef.current = 0;
    setPuntos(0);
    motorRef.current = juego.motor;
    motorRef.current.init(juego.materia, juego.color, { dificultad: 'facil' });
    faseRef.current = 'jugando';
    setFase('jugando');
    try { SFX.inicio?.(); } catch(_) {}
  };

  const volverAlSelector = () => {
    faseRef.current = 'selector';
    setFase('selector');
    motorRef.current = null;
    setJuego(null);
    puntosRef.current = 0;
    setPuntos(0);
  };

  const cerrarSesion = async () => {
    await signOut(auth);
    ['iapprende_rol','iapprende_codigo','iapprende_grupo','iapprende_escuela','iapprende_proyecto']
      .forEach(k => localStorage.removeItem(k));
    window.location.replace('https://iapprende.com');
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

        const renderLoop = (timestamp) => {
          const delta = (timestamp - lastTime) * 0.06;
          lastTime = timestamp;
          const W = canvasEl.width, H = canvasEl.height;

          if (videoEl.readyState >= 2) {
            if (lastVideoTime !== videoEl.currentTime) {
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
                  lm = crudos.map((p, i) => ({
                    x: historial.current[i].x + (p.x - historial.current[i].x) * 0.8,
                    y: historial.current[i].y + (p.y - historial.current[i].y) * 0.8,
                    z: p.z, visibility: p.visibility,
                  }));
                }
                historial.current = lm;
              } else {
                historial.current = null;
              }

              // Esqueleto
              if (lm) {
                const color = juegoActual?.color || '#00FFFF';
                ctx.save();
                ctx.translate(W, 0); ctx.scale(-1, 1);
                ctx.shadowBlur = 15; ctx.shadowColor = color;
                ctx.strokeStyle = color; ctx.lineWidth = 8;
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';

                let anchoH = 100;
                if (lm[11] && lm[12])
                  anchoH = Math.hypot((lm[12].x-lm[11].x)*W, (lm[12].y-lm[11].y)*H);
                const rc = anchoH * 0.30;

                const linea = (i, j) => {
                  if (lm[i]?.visibility > 0.3 && lm[j]?.visibility > 0.3) {
                    ctx.moveTo(lm[i].x*W, lm[i].y*H);
                    ctx.lineTo(lm[j].x*W, lm[j].y*H);
                  }
                };

                ctx.beginPath();
                if (lm[11] && lm[12] && lm[23] && lm[24]) {
                  const hM = { x:(lm[11].x+lm[12].x)/2*W, y:(lm[11].y+lm[12].y)/2*H };
                  const cM = { x:(lm[23].x+lm[24].x)/2*W, y:(lm[23].y+lm[24].y)/2*H };
                  linea(11,12); linea(23,24);
                  ctx.moveTo(hM.x,hM.y); ctx.lineTo(cM.x,cM.y);
                  if (lm[0]) {
                    ctx.moveTo(hM.x,hM.y);
                    ctx.lineTo(lm[0].x*W, lm[0].y*H+rc);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(lm[0].x*W, lm[0].y*H, Math.max(20,rc), 0, Math.PI*2);
                    ctx.stroke();
                  }
                }
                ctx.beginPath();
                linea(11,13); linea(13,15); linea(12,14); linea(14,16);
                linea(23,25); linea(25,27); linea(24,26); linea(26,28);
                ctx.stroke();
                ctx.restore();
              }

              // Juego activo
              if (faseRef.current === 'jugando' && motorRef.current) {
                const resultado = motorRef.current.update(lm, W, H, delta);
                if (resultado) {
                  puntosRef.current = Math.max(0, puntosRef.current + (resultado.puntos || 0));
                  setPuntos(puntosRef.current);
                  mostrarFlash(
                    resultado.acierto ? `+${resultado.puntos} XP ✅` : `${resultado.puntos} XP ❌`,
                    resultado.acierto ? '#00FF41' : '#FF4444'
                  );
                }
                motorRef.current.render(ctx, W, H);
                if (lm && motorRef.current.renderBrazos)
                  motorRef.current.renderBrazos(ctx, lm, W, H);
              }

              ctx.restore();
            }
          }
          requestRef.current = requestAnimationFrame(renderLoop);
        };
        renderLoop(0);
      } catch(err) {
        console.error(err);
        setEstado('error');
      }
    };

    arrancar();
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (videoRef.current?.srcObject)
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      iaIniciada.current = false;
    };
  }, []);

  // ── COLOR DE TEMA ACTUAL ──────────────────────────────────
  const colorTema = juegoActual?.color || (esAlumno ? '#00FF41' : '#00FFFF');

  // ── RENDER ────────────────────────────────────────────────
  return (
    <div style={{ background:'#000', minHeight:'100vh', display:'flex', flexDirection:'column', position:'relative' }}>

      {/* Header */}
      <header style={{
        display:'flex', alignItems:'center', gap:'8px',
        padding:'6px 16px', background:'rgba(0,0,0,0.85)',
        borderBottom:`1px solid ${colorTema}44`, zIndex:10, flexShrink:0,
      }}>
        <span style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.75rem', color:colorTema, fontWeight:'bold' }}>
          NEXUS {esAlumno ? '— ALUMNO' : '— INVITADO'}
        </span>
        {esAlumno && grupo && (
          <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif' }}>
            · {escuela} / Grupo {grupo}
          </span>
        )}
        <div style={{ flex:1 }}/>
        {fase === 'jugando' && (
          <span style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.85rem', color:'#FFD700', fontWeight:'bold' }}>
            ⭐ {puntos} XP
          </span>
        )}
        {fase === 'jugando' && (
          <button onClick={volverAlSelector} style={{ background:'rgba(255,200,0,0.15)', border:'1px solid #FFC80055', borderRadius:'6px', color:'#FFC800', fontSize:'0.7rem', padding:'3px 10px', cursor:'pointer', fontFamily:'Orbitron, sans-serif' }}>
            ← Juegos
          </button>
        )}
        {fase === 'metricas' && (
          <button onClick={volverAlSelector} style={{ background:'rgba(255,200,0,0.15)', border:'1px solid #FFC80055', borderRadius:'6px', color:'#FFC800', fontSize:'0.7rem', padding:'3px 10px', cursor:'pointer', fontFamily:'Orbitron, sans-serif' }}>
            ← Volver
          </button>
        )}
        <button onClick={cerrarSesion} style={{ background:'rgba(255,8,68,0.18)', border:'1px solid #FF084455', borderRadius:'6px', color:'#FF0844', fontSize:'0.7rem', padding:'3px 10px', cursor:'pointer', fontFamily:'Orbitron, sans-serif' }}>
          Salir
        </button>
        <span style={{ fontSize:'0.65rem', color: estado==='activo' ? '#00FF41' : '#888' }}>
          {estado==='activo' ? '⚡' : '⏳'}
        </span>
      </header>

      {/* Canvas (siempre activo en background) */}
      <div style={{ position:'relative', flex:1, display:'flex', justifyContent:'center', alignItems:'center' }}>
        <video ref={videoRef} style={{ display:'none' }} playsInline />
        <canvas ref={canvasRef} width="1280" height="720"
          style={{ width:'100%', height:'auto', maxHeight:'calc(100vh - 52px)', objectFit:'cover' }} />

        {flash && (
          <div style={{ position:'absolute', top:'20%', left:'50%', transform:'translateX(-50%)', fontFamily:'Orbitron, sans-serif', fontSize:'2rem', fontWeight:'bold', color:flash.color, textShadow:`0 0 30px ${flash.color}`, pointerEvents:'none' }}>
            {flash.texto}
          </div>
        )}

        {/* ══════════ PANTALLA DE CARGA ══════════ */}
        {estado === 'calibrando' && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.9)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'16px' }}>
            <div style={{ fontFamily:'Orbitron, sans-serif', color:'#00FFFF', fontSize:'1.2rem' }}>⚡ Iniciando cámara...</div>
            <div style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.9rem' }}>Asegúrate de permitir acceso a la cámara</div>
          </div>
        )}

        {estado === 'error' && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.9)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'16px' }}>
            <div style={{ fontFamily:'Orbitron, sans-serif', color:'#FF4444', fontSize:'1.2rem' }}>❌ Error de cámara</div>
            <button onClick={() => window.location.reload()} style={{ background:'rgba(0,255,65,0.15)', border:'1px solid #00FF41', borderRadius:'8px', color:'#00FF41', padding:'10px 24px', cursor:'pointer', fontFamily:'Orbitron, sans-serif', fontSize:'0.85rem' }}>🔄 Reintentar</button>
          </div>
        )}

        {/* ══════════ SELECTOR DE JUEGOS ══════════ */}
        {fase === 'selector' && estado === 'activo' && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.88)', backdropFilter:'blur(12px)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'24px', padding:'24px' }}>

            {/* Badge de rol */}
            <div style={{ display:'flex', alignItems:'center', gap:'8px', background: esAlumno ? 'rgba(0,255,65,0.1)' : 'rgba(0,255,255,0.1)', border:`1px solid ${esAlumno ? '#00FF41' : '#00FFFF'}44`, borderRadius:'100px', padding:'6px 18px' }}>
              <span style={{ fontSize:'20px' }}>{esAlumno ? '🎒' : '🌐'}</span>
              <span style={{ fontFamily:'Orbitron, sans-serif', fontSize:'0.75rem', color: esAlumno ? '#00FF41' : '#00FFFF', fontWeight:'600' }}>
                {esAlumno ? `ALUMNO — Grupo ${grupo || '?'}` : 'MODO INVITADO'}
              </span>
            </div>

            <div style={{ textAlign:'center' }}>
              <h2 style={{ fontFamily:'Orbitron, sans-serif', color:'#FFF', fontSize:'clamp(1.2rem,3vw,2rem)', margin:'0 0 8px' }}>⚡ ELIGE TU JUEGO</h2>
              <p style={{ color:'rgba(255,255,255,0.45)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.95rem', margin:0 }}>
                {esAlumno ? 'Practica con estos mini juegos en modo demo.' : 'Explora la plataforma sin registro. Sin guardado de estadísticas.'}
              </p>
            </div>

            {/* Cards de juegos */}
            <div style={{ display:'flex', gap:'16px', flexWrap:'wrap', justifyContent:'center', maxWidth:'800px' }}>
              {JUEGOS_DEMO.map(j => (
                <button key={j.id} onClick={() => iniciarJuego(j)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', padding:'28px 24px', width:'200px', background:`rgba(0,0,0,0.5)`, border:`2px solid ${j.color}44`, borderRadius:'20px', cursor:'pointer', color:'#FFF', transition:'all .25s', fontFamily:'Orbitron, sans-serif' }}
                  onMouseOver={e => { e.currentTarget.style.borderColor=j.color; e.currentTarget.style.transform='translateY(-6px)'; e.currentTarget.style.boxShadow=`0 12px 32px ${j.color}44`; }}
                  onMouseOut={e  => { e.currentTarget.style.borderColor=j.color+'44'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none'; }}>
                  <span style={{ fontSize:'3rem' }}>{j.icono}</span>
                  <div>
                    <div style={{ fontWeight:'700', fontSize:'1rem', color:j.color, marginBottom:'4px' }}>{j.nombre}</div>
                    <div style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.5)', fontFamily:'Rajdhani, sans-serif', textAlign:'center' }}>{j.desc}</div>
                  </div>
                  <div style={{ background:j.color, color:'#000', fontSize:'0.65rem', fontWeight:'700', padding:'4px 12px', borderRadius:'100px' }}>JUGAR →</div>
                </button>
              ))}
            </div>

            {/* Botón métricas — SOLO ALUMNO */}
            {esAlumno && grupo && (
              <button onClick={verMetricas}
                style={{ display:'flex', alignItems:'center', gap:'10px', background:'rgba(0,255,65,0.08)', border:'2px solid #00FF4166', borderRadius:'14px', padding:'14px 28px', cursor:'pointer', color:'#00FF41', fontFamily:'Orbitron, sans-serif', fontSize:'0.85rem', fontWeight:'700', transition:'all .2s' }}
                onMouseOver={e => { e.currentTarget.style.background='rgba(0,255,65,0.18)'; e.currentTarget.style.borderColor='#00FF41'; }}
                onMouseOut={e  => { e.currentTarget.style.background='rgba(0,255,65,0.08)'; e.currentTarget.style.borderColor='#00FF4166'; }}>
                <span style={{ fontSize:'1.4rem' }}>📊</span>
                Ver métricas de mi grupo
              </button>
            )}

            {/* Info invitado */}
            {!esAlumno && (
              <div style={{ background:'rgba(0,255,255,0.05)', border:'1px solid rgba(0,255,255,0.2)', borderRadius:'12px', padding:'14px 20px', maxWidth:'480px', textAlign:'center' }}>
                <p style={{ color:'rgba(255,255,255,0.5)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.85rem', margin:0 }}>
                  💡 Para acceder a métricas y seguimiento de progreso, solicita un código de acceso a tu docente.
                </p>
              </div>
            )}

            <button onClick={cerrarSesion} style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'8px', color:'rgba(255,255,255,0.4)', fontSize:'0.75rem', padding:'8px 20px', cursor:'pointer', fontFamily:'Rajdhani, sans-serif' }}>
              ← Volver al inicio
            </button>
          </div>
        )}

        {/* ══════════ MÉTRICAS DEL GRUPO (solo alumno) ══════════ */}
        {fase === 'metricas' && esAlumno && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.92)', backdropFilter:'blur(12px)', display:'flex', flexDirection:'column', alignItems:'center', padding:'32px 24px', overflowY:'auto', gap:'20px' }}>

            <div style={{ textAlign:'center' }}>
              <h2 style={{ fontFamily:'Orbitron, sans-serif', color:'#00FF41', fontSize:'clamp(1.2rem,3vw,1.8rem)', margin:'0 0 6px' }}>
                📊 MÉTRICAS DEL GRUPO
              </h2>
              <p style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.9rem', margin:0 }}>
                {escuela} · Grupo {grupo} · Solo lectura
              </p>
            </div>

            {/* Selector de periodo */}
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', justifyContent:'center' }}>
              {[
                { id:'tri1',     label:'📅 Trimestre 1' },
                { id:'tri2',     label:'📅 Trimestre 2' },
                { id:'tri3',     label:'📅 Trimestre 3' },
                { id:'xp_total', label:'🌟 Acumulado' },
              ].map(p => (
                <button key={p.id} onClick={() => { setPeriodo(p.id); setAlumnos(prev => [...prev].sort((a,b) => (b[p.id]||0)-(a[p.id]||0))); }}
                  style={{ padding:'6px 16px', borderRadius:'100px', border:`1px solid ${periodoVista===p.id ? '#00FF41' : 'rgba(255,255,255,0.2)'}`, background: periodoVista===p.id ? 'rgba(0,255,65,0.2)' : 'transparent', color: periodoVista===p.id ? '#00FF41' : 'rgba(255,255,255,0.5)', cursor:'pointer', fontFamily:'Orbitron, sans-serif', fontSize:'0.7rem', transition:'all .2s' }}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* Tabla */}
            {cargandoMetricas ? (
              <div style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani, sans-serif', padding:'2rem' }}>Cargando...</div>
            ) : alumnos.length === 0 ? (
              <div style={{ color:'rgba(255,255,255,0.3)', fontFamily:'Rajdhani, sans-serif', padding:'2rem', textAlign:'center' }}>
                No se encontraron alumnos para este grupo.<br/>Verifica con tu docente.
              </div>
            ) : (
              <div style={{ width:'100%', maxWidth:'600px' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'Rajdhani, sans-serif', fontSize:'1rem' }}>
                  <thead>
                    <tr style={{ background:'rgba(0,255,65,0.1)', color:'#00FF41', textAlign:'left' }}>
                      <th style={{ padding:'10px 14px', borderBottom:'2px solid #00FF4144' }}>#</th>
                      <th style={{ padding:'10px 14px', borderBottom:'2px solid #00FF4144' }}>Alumno</th>
                      <th style={{ padding:'10px 14px', borderBottom:'2px solid #00FF4144', textAlign:'right' }}>XP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alumnos.map((a, i) => (
                      <tr key={a.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                        <td style={{ padding:'10px 14px', color: i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'#fff', fontWeight:'bold' }}>#{i+1}</td>
                        <td style={{ padding:'10px 14px', color:'#fff' }}>{a.nombre}</td>
                        <td style={{ padding:'10px 14px', color:'#00FF41', fontFamily:'Orbitron, sans-serif', textAlign:'right' }}>{a[periodoVista] || 0} XP</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ color:'rgba(255,255,255,0.25)', fontFamily:'Rajdhani, sans-serif', fontSize:'0.75rem', textAlign:'center', marginTop:'16px' }}>
                  🔒 Modo solo lectura — no puedes editar estas métricas
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModoDemo;
