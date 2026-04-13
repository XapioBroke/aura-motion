import React, { useState } from 'react';
import BodySensor from './BodySensor';
import Lobby from './Lobby';
import NexusDashboard from './NexusDashboard';
import VersusSensor from './VersusSensor';
import AlumnoSelector from './AlumnoSelector';
import AvatarPage from './avatarpage';

function App() {
  const [trimestreActivo, setTrimestreActivo] = useState('tri1');
  const [pantallaActual, setPantallaActual] = useState('lobby');
  const [materiaActiva, setMateriaActiva] = useState(null);
  const [modoJuego, setModoJuego] = useState(null);
  const [alumnosSeleccionados, setAlumnosSeleccionados] = useState([]);

  // ── Ruta /avatar — alumno personaliza desde su celular ──
  if (window.location.pathname === '/avatar') {
    return <AvatarPage />;
  }

  const manejarSeleccion = (idMateria) => {
    setMateriaActiva(idMateria);
    setPantallaActual('seleccion-modo');
  };

  const irASeleccionAlumnos = () => {
    // Vuelve a elegir alumno sin pasar por el lobby completo
    setPantallaActual('seleccion-alumnos');
  };

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
    if (modoJuego === 'versus') {
      setPantallaActual('versus-sensor');
    } else {
      setPantallaActual('actividad-sensor');
    }
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
      force:      { color: '#00FF41', nombre: 'FORCE TRAINING',       icono: '⚡' },
      chronos:    { color: '#FFD700', nombre: 'CRÓNICAS DEL TIEMPO',   icono: '🏛️' },
      quantum:    { color: '#00FFFF', nombre: 'QUANTUM LOGIC',         icono: '📐' },
      bio_genesis:{ color: '#FF00FF', nombre: 'BIO GÉNESIS',           icono: '🧬' },
      lingua:     { color: '#FF4500', nombre: 'NEXO LINGÜÍSTICO',      icono: '🗣️' }
    };
    return info[materia] || info.quantum;
  };

  const materiaInfo = getMateriaInfo(materiaActiva);

  return (
    <div style={{ background: '#000', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* DASHBOARD */}
      {pantallaActual === 'dashboard' && (
        <NexusDashboard
          onVolver={volverAlLobby}
          trimestreActivo={trimestreActivo}
          setTrimestreActivo={setTrimestreActivo}
        />
      )}

      {/* LOBBY */}
      {pantallaActual === 'lobby' && (
        <>
          <div style={{ position: 'absolute', top: '20px', right: '30px', zIndex: 100 }}>
            <button
              className="btn-cyber"
              style={{ '--tema-color': '#FFD700', fontSize: '1rem', padding: '0.8rem 1.5rem', boxShadow: '0 0 15px rgba(255, 215, 0, 0.3)' }}
              onClick={() => setPantallaActual('dashboard')}
            >
              👑 PANEL DOCENTE
            </button>
          </div>
          <Lobby onSeleccionar={manejarSeleccion} />
        </>
      )}

      {/* SELECCIÓN DE MODO */}
      {pantallaActual === 'seleccion-modo' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.95)', backdropFilter: 'blur(10px)',
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
              padding: '1.5rem 2rem', background: 'rgba(0, 0, 0, 0.6)', borderBottom: `2px solid ${materiaInfo.color}`
            }}>
              <div>
                <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.8rem', color: materiaInfo.color, margin: 0, textShadow: `0 0 20px ${materiaInfo.color}` }}>
                  {materiaInfo.icono} {materiaInfo.nombre}
                </h2>
                <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', color: '#aaa', margin: '0.3rem 0 0 0' }}>
                  Selecciona el modo de juego
                </p>
              </div>
              <button onClick={volverAlLobby} style={{ background: 'rgba(255, 8, 68, 0.2)', border: '2px solid #FF0844', color: '#FF0844', fontSize: '1.5rem', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', fontFamily: 'Orbitron, sans-serif' }}>
                ✕
              </button>
            </div>

            <div style={{ padding: '3rem 2rem', display: 'grid', gap: '1.5rem' }}>
              <button onClick={() => manejarSeleccionModo('individual')}
                style={{ padding: '2rem', background: 'rgba(0, 255, 65, 0.1)', border: '3px solid #00FF41', borderRadius: '15px', cursor: 'pointer', transition: 'all 0.3s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 10px 30px #00FF41'; }}
                onMouseOut={e  => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = 'none'; }}>
                <span style={{ fontSize: '3rem' }}>👤</span>
                <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.5rem', color: '#00FF41', margin: 0 }}>MODO INDIVIDUAL</h3>
                <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', color: '#aaa', margin: 0 }}>Un alumno juega solo contra el sistema</p>
              </button>

              <button onClick={() => manejarSeleccionModo('versus')}
                style={{ padding: '2rem', background: 'rgba(255, 8, 68, 0.1)', border: '3px solid #FF0844', borderRadius: '15px', cursor: 'pointer', transition: 'all 0.3s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
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