import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, increment, query, orderBy, writeBatch } from 'firebase/firestore';
import { db } from './firebase'; 
import './App.css';

// 👇 Recibimos los cables del trimestre global del juego
const NexusDashboard = ({ onVolver, trimestreActivo, setTrimestreActivo }) => {
  const [pestaña, setPestaña] = useState('rankings'); 
  const [escuelaSeleccionada, setEscuelaSeleccionada] = useState('');
  const [grupoSeleccionado, setGrupoSeleccionado] = useState(''); 
  
  // Este periodo es solo para saber qué tabla estamos "viendo"
  const [periodoVisualizado, setPeriodoVisualizado] = useState('tri1'); 
  
  const [alumnos, setAlumnos] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [escuelas, setEscuelas] = useState([]);

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevaEscuela, setNuevaEscuela] = useState('');
  const [nuevoGrupo, setNuevoGrupo] = useState(''); 

  const cargarDatos = async () => {
    try {
      const alumnosQuery = query(collection(db, "alumnos"), orderBy("nombre", "asc"));
      const alumnosSnapshot = await getDocs(alumnosQuery);
      const alumnosData = alumnosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAlumnos(alumnosData);

      const escuelasUnicas = [...new Set(alumnosData.map(a => a.escuelaNombre).filter(Boolean))].sort();
      setEscuelas(escuelasUnicas);
      
      if (escuelasUnicas.length > 0 && !escuelaSeleccionada) {
        setEscuelaSeleccionada(escuelasUnicas[0]);
      }

      const rankingsSnapshot = await getDocs(collection(db, "rankings_nexus"));
      const rankingsData = rankingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRankings(rankingsData);
    } catch (error) {
      console.error("Error al cargar datos:", error);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    if (escuelaSeleccionada) {
      const gruposDeEstaEscuela = [...new Set(alumnos.filter(a => a.escuelaNombre === escuelaSeleccionada).map(a => a.grupo).filter(Boolean))].sort();
      if (gruposDeEstaEscuela.length > 0) {
        if (!gruposDeEstaEscuela.includes(grupoSeleccionado)) {
          setGrupoSeleccionado(gruposDeEstaEscuela[0]);
        }
      } else {
        setGrupoSeleccionado('');
      }
    }
  }, [escuelaSeleccionada, alumnos]);

  const handleAgregarAlumno = async (e) => {
    e.preventDefault();
    if (!nuevoNombre || !nuevaEscuela || !nuevoGrupo) return alert("Llena todos los campos");
    try {
      await addDoc(collection(db, "alumnos"), {
        nombre: nuevoNombre.toUpperCase(),
        escuelaNombre: nuevaEscuela.toUpperCase(),
        grupo: nuevoGrupo.toUpperCase(), 
        avatarId: 1, 
        tri1: 0, tri2: 0, tri3: 0, xp_total: 0
      });
      setNuevoNombre('');
      cargarDatos(); 
    } catch (error) {
      console.error("Error al agregar:", error);
    }
  };

  const handleEliminarAlumno = async (id) => {
    if (window.confirm("¿Eliminar a este alumno de la base de datos?")) {
      try {
        await deleteDoc(doc(db, "alumnos", id));
        cargarDatos();
      } catch (error) {
        console.error("Error al eliminar:", error);
      }
    }
  };

  const handleModificarXP = async (alumnoId, cantidad) => {
    if (periodoVisualizado === 'xp_total') return alert("Selecciona un Trimestre específico para modificar la XP.");
    try {
      const refAlumno = doc(db, "alumnos", alumnoId);
      await updateDoc(refAlumno, {
        [periodoVisualizado]: increment(cantidad),
        xp_total: increment(cantidad) 
      });
      cargarDatos();
    } catch (error) {
      console.error("Error al modificar XP:", error);
    }
  };

  const handleResetearGrupo = async () => {
    if (periodoVisualizado === 'xp_total') return alert("Selecciona un Trimestre específico para resetear.");
    if (!window.confirm(`⚠️ ¿Poner en 0 la XP del ${periodoVisualizado.toUpperCase()} de TODO el Grupo ${grupoSeleccionado}?`)) return;
    try {
      const batch = writeBatch(db);
      alumnosDelGrupo.forEach(alumno => {
        const ref = doc(db, "alumnos", alumno.id);
        const xpARestar = alumno[periodoVisualizado] || 0; 
        batch.update(ref, {
          [periodoVisualizado]: 0,
          xp_total: increment(-xpARestar) 
        });
      });
      await batch.commit();
      cargarDatos();
    } catch (error) {
      console.error("Error al resetear grupo:", error);
    }
  };

  const gruposDeLaEscuela = [...new Set(alumnos.filter(a => a.escuelaNombre === escuelaSeleccionada).map(a => a.grupo).filter(Boolean))].sort();
  const alumnosDelGrupo = alumnos.filter(a => a.escuelaNombre === escuelaSeleccionada && a.grupo === grupoSeleccionado);
  
  const leaderboard = alumnosDelGrupo.map(alumno => {
    const scoreOficial = alumno[periodoVisualizado] || 0;
    return { ...alumno, scoreOficial };
  }).sort((a, b) => b.scoreOficial - a.scoreOficial);

  return (
    // CONTENEDOR MAESTRO: Pantalla completa, flexbox para estirar el contenido
    <div className="aura-container" style={{ background: '#050510', color: '#FFF', padding: '1.5rem', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      
      {/* HEADER COMPACTO CON SELECTOR DE JUEGO */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(0,255,255,0.3)', paddingBottom: '0.8rem' }}>
        <h1 style={{ fontFamily: 'Orbitron', fontSize: '1.8rem', color: '#00FFFF', margin: 0 }}>
          NEXUS / CENTRO DE COMANDO
        </h1>
        
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {/* 👇 AQUÍ VIVE AHORA EL CONTROL DEL JUEGO 👇 */}
          <div style={{ background: 'rgba(0,255,255,0.1)', padding: '0.4rem 1rem', borderRadius: '8px', border: '1px solid #00FFFF', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: '#00FFFF', fontFamily: 'Orbitron', marginRight: '10px', fontSize: '0.9rem' }}>🎯 PERIODO DEL JUEGO:</span>
            <select 
              className="btn-cyber"
              style={{ background: '#000', color: '#FFF', border: '1px solid #555', padding: '0.3rem', fontSize: '0.9rem', outline: 'none' }}
              value={trimestreActivo}
              onChange={(e) => setTrimestreActivo(e.target.value)}
            >
              <option value="tri1">TRIMESTRE 1</option>
              <option value="tri2">TRIMESTRE 2</option>
              <option value="tri3">TRIMESTRE 3</option>
            </select>
          </div>

          <button className="btn-cyber" style={{ '--tema-color': '#FF0844', padding: '0.5rem 1rem', fontSize: '0.9rem' }} onClick={onVolver}>
            CERRAR PANEL
          </button>
        </div>
      </header>

      {/* CUERPO PRINCIPAL ESTIRABLE */}
      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0 }}>
        
        {/* COLUMNA IZQUIERDA: ESCUELAS (Más angosta) */}
        <div style={{ width: '20%', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', overflowY: 'auto' }}>
          <h3 style={{ fontFamily: 'Rajdhani', fontSize: '1.2rem', borderBottom: '1px solid #555', paddingBottom: '0.5rem', marginTop: 0 }}>📂 ESCUELAS</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '1rem' }}>
            {escuelas.map((escuela, index) => (
              <button key={index} className="btn-cyber" 
                style={{ textAlign: 'left', padding: '0.6rem', fontSize: '0.9rem', background: escuelaSeleccionada === escuela ? 'rgba(0, 255, 255, 0.2)' : 'transparent', borderColor: escuelaSeleccionada === escuela ? '#00FFFF' : 'rgba(255,255,255,0.2)' }}
                onClick={() => setEscuelaSeleccionada(escuela)}>
                🏫 {escuela}
              </button>
            ))}
          </div>
        </div>

        {/* COLUMNA DERECHA: GESTIÓN DE ALUMNOS (75%) */}
        <div style={{ width: '80%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* BARRA DE CONTROLES SUPERIORES (Todo en una sola línea) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.6)', borderRadius: '10px', padding: '0.8rem 1rem', border: '1px solid rgba(0,255,255,0.2)' }}>
            
            {/* Pestañas de Grupos */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Rajdhani', color: '#AAA', marginRight: '10px' }}>📁 GRUPO:</span>
              {gruposDeLaEscuela.map((grupo) => (
                <button key={grupo} className="btn-cyber"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', background: grupoSeleccionado === grupo ? 'rgba(0, 255, 255, 0.4)' : 'rgba(0,0,0,0.5)', color: grupoSeleccionado === grupo ? '#FFF' : '#00FFFF', borderColor: grupoSeleccionado === grupo ? '#00FFFF' : 'rgba(255,255,255,0.2)' }}
                  onClick={() => setGrupoSeleccionado(grupo)}>
                  {grupo}
                </button>
              ))}
            </div>

            {/* Pestañas de Tabla vs Gestión */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-cyber" style={{ fontSize: '0.9rem', padding: '0.4rem 1rem', background: pestaña === 'rankings' ? '#00FFFF' : 'transparent', color: pestaña === 'rankings' ? '#000' : '#00FFFF' }} onClick={() => setPestaña('rankings')}>
                🏆 RANKINGS
              </button>
              <button className="btn-cyber" style={{ fontSize: '0.9rem', padding: '0.4rem 1rem', background: pestaña === 'gestion' ? '#FFD700' : 'transparent', color: pestaña === 'gestion' ? '#000' : '#FFD700', '--tema-color': '#FFD700' }} onClick={() => setPestaña('gestion')}>
                ⚙️ GESTIÓN
              </button>
            </div>
          </div>

          {/* CAJA PRINCIPAL QUE SE ESTIRA HASTA EL FONDO (flex: 1) */}
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '1.5rem', border: '1px solid rgba(0,255,255,0.2)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            
            {/* SELECTOR VISUAL DE TRIMESTRE (Para saber qué puntos ver) */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '1rem' }}>
              {['tri1', 'tri2', 'tri3', 'xp_total'].map(periodo => (
                <button key={periodo} className="btn-cyber" 
                  style={{ fontSize: '0.9rem', background: periodoVisualizado === periodo ? '#FFF' : '#222', color: periodoVisualizado === periodo ? '#000' : '#FFF', borderColor: periodoVisualizado === periodo ? '#FFF' : '#555', padding: '0.4rem 1.5rem' }}
                  onClick={() => setPeriodoVisualizado(periodo)}>
                  {periodo === 'xp_total' ? '🌟 ACUMULADO' : `📅 TRI ${periodo.replace('tri', '')}`}
                </button>
              ))}
            </div>

            {/* ZONA DE TABLA Y ALUMNOS (CON SCROLL INTERNO) */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
              
              {pestaña === 'rankings' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Rajdhani', fontSize: '1.1rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,255,255,0.1)', color: '#00FFFF', textAlign: 'left' }}>
                      <th style={{ padding: '0.8rem', borderBottom: '2px solid #00FFFF' }}>POSICIÓN</th>
                      <th style={{ padding: '0.8rem', borderBottom: '2px solid #00FFFF' }}>ALUMNO</th>
                      <th style={{ padding: '0.8rem', borderBottom: '2px solid #00FFFF' }}>XP ({periodoVisualizado.replace('tri', 'T')})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((alumno, index) => (
                      <tr key={alumno.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '0.8rem', fontWeight: 'bold', color: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#FFF' }}>#{index + 1}</td>
                        <td style={{ padding: '0.8rem' }}>{alumno.nombre}</td>
                        <td style={{ padding: '0.8rem', color: '#00FF41', fontFamily: 'Orbitron' }}>{alumno.scoreOficial} XP</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {pestaña === 'gestion' && (
                <>
                  <form onSubmit={handleAgregarAlumno} style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', background: 'rgba(255,215,0,0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,215,0,0.3)' }}>
                    <input type="text" placeholder="Nombre" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} style={{ flex: 2, padding: '0.6rem', background: 'rgba(0,0,0,0.5)', border: '1px solid #555', color: '#FFF', borderRadius: '5px', fontFamily: 'Rajdhani' }} />
                    <input type="text" placeholder="Escuela" value={nuevaEscuela} onChange={(e) => setNuevaEscuela(e.target.value)} style={{ flex: 1, padding: '0.6rem', background: 'rgba(0,0,0,0.5)', border: '1px solid #555', color: '#FFF', borderRadius: '5px', fontFamily: 'Rajdhani' }} />
                    <input type="text" placeholder="Grupo (ej. 2A)" value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)} style={{ flex: 1, padding: '0.6rem', background: 'rgba(0,0,0,0.5)', border: '1px solid #555', color: '#FFF', borderRadius: '5px', fontFamily: 'Rajdhani' }} />
                    <button type="submit" className="btn-cyber" style={{ '--tema-color': '#FFD700', padding: '0 1rem', fontSize: '0.9rem' }}>➕ AÑADIR</button>
                    {periodoVisualizado !== 'xp_total' && (
                      <button type="button" className="btn-cyber" style={{ '--tema-color': '#FF0844', padding: '0 1rem', fontSize: '0.9rem' }} onClick={handleResetearGrupo}>⚠️ RESET</button>
                    )}
                  </form>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {alumnosDelGrupo.map(alumno => (
                      <div key={alumno.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 1rem', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ fontFamily: 'Rajdhani', fontSize: '1.1rem' }}>👤 {alumno.nombre}</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ color: '#00FF41', fontFamily: 'Orbitron', fontSize: '1rem', width: '60px', textAlign: 'right', marginRight: '10px' }}>{alumno[periodoVisualizado] || 0} XP</span>
                          <button className="btn-cyber" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', '--tema-color': '#FF0844' }} onClick={() => handleModificarXP(alumno.id, -20)}>- 20</button>
                          <button className="btn-cyber" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', '--tema-color': '#00FF41' }} onClick={() => handleModificarXP(alumno.id, 20)}>+ 20</button>
                          <button className="btn-cyber" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', '--tema-color': '#FF00FF', marginLeft: '5px' }} onClick={() => handleEliminarAlumno(alumno.id)}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NexusDashboard;