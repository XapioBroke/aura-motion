import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import BodySensor from './BodySensor';
import Lobby from './Lobby';
import NexusDashboard from './NexusDashboard';
import VersusSensor from './VersusSensor';
import AlumnoSelector from './AlumnoSelector';
import AvatarPage from './avatarpage';
import ModoDemo from './ModoDemo';

function getRol(user) {
  if (!user) return null;
  if (user.isAnonymous) return localStorage.getItem('iapprende_rol') || 'invitado';
  if (user.email?.endsWith('@jaliscoedu.mx')) return 'docente';
  return 'invitado';
}

// ── Detectar rol desde el token de Firebase ──────────────────
// El rol se guarda en Firestore pero para Aura Motion
// lo determinamos por el dominio del correo:
// @jaliscoedu.mx → docente (acceso total)
// sesión anónima con metadata → alumno (solo juego, sin panel)
// sesión anónima sin metadata → invitado (solo lobby, sin panel)

function getRolDesdeUser(user) {
  if (!user) return null;
  if (user.isAnonymous) {
    // El rol específico (alumno/invitado) viene en localStorage
    // puesto por el landing al redirigir
    return localStorage.getItem('iapprende_rol') || 'invitado';
  }
  if (user.email && user.email.endsWith('@jaliscoedu.mx')) return 'docente';
  return 'invitado'; // correo que no es institucional
}

function App() {
  const [trimestreActivo, setTrimestreActivo] = useState('tri1');

  // ── Auth + Rol ────────────────────────────────────────────
  const [user, setUser]       = useState(null);
  const [rol, setRol]         = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setRol(getRol(u));
      setCargando(false);
    });
    return unsub;
  }, []);
  const [pantallaActual, setPantallaActual]       = useState('lobby');
  const [materiaActiva, setMateriaActiva]         = useState(null);
  const [modoJuego, setModoJuego]                 = useState(null);
  const [alumnosSeleccionados, setAlumnosSeleccionados] = useState([]);

  // ── Auth state ────────────────────────────────────────────
  const [user, setUser]   = useState(null);
  const [rol, setRol]     = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setRol(getRolDesdeUser(u));
      setCargando(false);
    });
    return unsub;
  }, []);

  // ── Ruta /avatar — alumno personaliza desde su celular ──
  // ── Ruta /avatar ──────────────────────────────────────────
  if (window.location.pathname === '/avatar') return <AvatarPage />;

  // ── Pantalla de carga mientras Firebase resuelve sesión ──
  if (cargando) return (
    <div style={{ background:'#000', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <p style={{ color:'#00FFFF', fontFamily:'Orbitron, sans-serif', fontSize:'1.2rem' }}>⚡ Inicializando NEXUS...</p>
    </div>
  );

  // ── ALUMNO / INVITADO → ModoDemo (sin panel docente) ─────
  if (rol === 'alumno' || rol === 'invitado') {
    return <ModoDemo rol={rol} onSalir={() => window.location.replace('https://iapprende.com')} />;
  }

  // ── DOCENTE → flujo normal completo ──────────────────────
  // (todo lo que sigue abajo queda exactamente igual)
  if (window.location.pathname === '/avatar') {
    return <AvatarPage />;
  }

  // ── Pantalla de carga ─────────────────────────────────────
  if (cargando) {
    return (
      <div style={{ background: '#000', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#00FFFF', fontFamily: 'Orbitron, sans-serif', fontSize: '1.2rem' }}>
          ⚡ Inicializando NEXUS...
        </p>
      </div>
    );
  }

  // ── Helpers de navegación ─────────────────────────────────
  const manejarSeleccion = (idMateria) => {
    setMateriaActiva(idMateria);
    setPantallaActual('seleccion-modo');
  };

  const irASeleccionAlumnos = () => setPantallaActual('seleccion-alumnos');

  const volverAlLobby = () => {
    setPantallaActual('lobby');
    setMateriaActiva(null);
    setModoJuego(null);
    setAlumnosSeleccionados([]);
  };

  const manejarSeleccionModo = (modo) => {
    setModoJuego(modo);
    setPantallaActual('seleccion-alumnos');
  };

  const manejarConfirmarAlumnos = (alumnos) => {
    setAlumnosSeleccionados(alumnos);
    setPantallaActual(modoJuego === 'versus' ? 'versus-sensor' : 'actividad-sensor');
  };

  const cancelarSeleccion = () => {
    setPantallaActual('seleccion-modo');
    setAlumnosSeleccionados([]);
  };

  const activarModoVersus = (materia) => {
    setMateriaActiva(materia);
    setModoJuego('versus');
    setPantallaActual('seleccion-alumnos');
  };

  const getMateriaInfo = (materia) => {
    const info = {
      force:      { color: '#00FF41', nombre: 'FORCE TRAINING',     icono: '⚡' },
      chronos:    { color: '#FFD700', nombre: 'CRÓNICAS DEL TIEMPO', icono: '🏛️' },
      quantum:    { color: '#00FFFF', nombre: 'QUANTUM LOGIC',       icono: '📐' },
      bio_genesis:{ color: '#FF00FF', nombre: 'BIO GÉNESIS',         icono: '🧬' },
      lingua:     { color: '#FF4500', nombre: 'NEXO LINGÜÍSTICO',    icono: '🗣️' }
    };
    return info[materia] || info.quantum;
  };

  const materiaInfo = getMateriaInfo(materiaActiva);

  // ── El botón de panel docente solo aparece si es docente ──
  const puedeVerPanel = rol === 'docente';

  return (
    <div style={{ background: '#000', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* DASHBOARD — solo docentes */}
      {pantallaActual === 'dashboard' && puedeVerPanel && (
        <NexusDashboard
          onVolver={volverAlLobby}
          trimestreActivo={trimestreActivo}
          setTrimestreActivo={setTrimestreActivo}
          docenteUid={user?.uid}
          docenteEmail={user?.email}
        />
      )}

      {/* LOBBY */}
      {pantallaActual === 'lobby' && (
        <>
          {/* Botón panel docente — solo si es docente */}
          {puedeVerPanel && (
            <div style={{ position: 'absolute', top: '20px', right: '30px', zIndex: 100 }}>
              <button
                className="btn-cyber"
                style={{ '--tema-color': '#FFD700', fontSize: '1rem', padding: '0.8rem 1.5rem', boxShadow: '0 0 15px rgba(255,215,0,0.3)' }}
                onClick={() => setPantallaActual('dashboard')}
              >
                👑 PANEL DOCENTE
              </button>
            </div>
          )}

          {/* Badge de rol para alumno/invitado */}
          {!puedeVerPanel && (
            <div style={{ position: 'absolute', top: '20px', right: '30px', zIndex: 100, display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{
                background: rol === 'alumno' ? 'rgba(0,255,65,0.15)' : 'rgba(0,255,255,0.1)',
                border: `1px solid ${rol === 'alumno' ? '#00FF41' : '#00FFFF'}`,
                color: rol === 'alumno' ? '#00FF41' : '#00FFFF',
                padding: '6px 16px', borderRadius: '20px',
                fontFamily: 'Orbitron, sans-serif', fontSize: '0.75rem',
              }}>
                {rol === 'alumno' ? '🎒 ALUMNO' : '🌐 INVITADO'}
              </span>
              <button
                className="btn-cyber"
                style={{ '--tema-color': '#FF0844', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                onClick={async () => { await signOut(auth); localStorage.removeItem('iapprende_rol'); window.location.replace('https://iapprende.com'); }}
              >
                Salir
              </button>
            </div>
          )}

          <Lobby onSeleccionar={manejarSeleccion} rol={rol} />
        </>
      )}

      {/* SELECCIÓN DE MODO */}
      {pantallaActual === 'seleccion-modo' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)',
            border: `3px solid ${materiaInfo.color}`, borderRadius: '20px',
            width: '90%', maxWidth: '600px', boxShadow: `0 0 50px ${materiaInfo.color}`,
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '1.5rem 2rem', background: 'rgba(0,0,0,0.6)', borderBottom: `2px solid ${materiaInfo.color}`
            }}>
              <div>
                <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.8rem', color: materiaInfo.color, margin: 0, textShadow: `0 0 20px ${materiaInfo.color}` }}>
                  {materiaInfo.icono} {materiaInfo.nombre}
                </h2>
                <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', color: '#aaa', margin: '0.3rem 0 0 0' }}>
                  Selecciona el modo de juego
                </p>
              </div>
              <button onClick={volverAlLobby} style={{ background: 'rgba(255,8,68,0.2)', border: '2px solid #FF0844', color: '#FF0844', fontSize: '1.5rem', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: '3rem 2rem', display: 'grid', gap: '1.5rem' }}>
              <button onClick={() => manejarSeleccionModo('individual')}
                style={{ padding: '2rem', background: 'rgba(0,255,65,0.1)', border: '3px solid #00FF41', borderRadius: '15px', cursor: 'pointer', transition: 'all 0.3s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 10px 30px #00FF41'; }}
                onMouseOut={e  => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = 'none'; }}>
                <span style={{ fontSize: '3rem' }}>👤</span>
                <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.5rem', color: '#00FF41', margin: 0 }}>MODO INDIVIDUAL</h3>
                <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', color: '#aaa', margin: 0 }}>Un alumno juega solo contra el sistema</p>
              </button>

              <button onClick={() => manejarSeleccionModo('versus')}
                style={{ padding: '2rem', background: 'rgba(255,8,68,0.1)', border: '3px solid #FF0844', borderRadius: '15px', cursor: 'pointer', transition: 'all 0.3s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 10px 30px #FF0844'; }}
                onMouseOut={e  => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = 'none'; }}>
                <span style={{ fontSize: '3rem' }}>⚔️</span>
                <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.5rem', color: '#FF0844', margin: 0 }}>MODO VERSUS</h3>
                <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', color: '#aaa', margin: 0 }}>Dos alumnos compiten en tiempo real</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELECTOR DE ALUMNOS */}
      {pantallaActual === 'seleccion-alumnos' && (
        <AlumnoSelector
          modoJuego={modoJuego}
          materia={materiaActiva}
          onConfirmar={manejarConfirmarAlumnos}
          onCancelar={cancelarSeleccion}
        />
      )}

      {/* JUEGO INDIVIDUAL */}
      {pantallaActual === 'actividad-sensor' && (
        <BodySensor
          materia={materiaActiva}
          alumno={alumnosSeleccionados[0]}
          onSalir={volverAlLobby}
          onCambiarAlumno={irASeleccionAlumnos}
          onVersus={activarModoVersus}
          trimestreActivo={trimestreActivo}
        />
      )}

      {/* JUEGO VERSUS */}
      {pantallaActual === 'versus-sensor' && (
        <VersusSensor
          materia={materiaActiva}
          jugador1={alumnosSeleccionados[0]}
          jugador2={alumnosSeleccionados[1]}
          onSalir={volverAlLobby}
          trimestreActivo={trimestreActivo}
        />
      )}

    </div>
  );
}

export default App;
