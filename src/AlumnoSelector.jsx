import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import './AlumnoSelector.css';

const AlumnoSelector = ({ modoJuego, materia, onConfirmar, onCancelar }) => {
  const [paso, setPaso] = useState('escuela'); // 'escuela' -> 'grupo' -> 'alumnos'
  const [escuelas, setEscuelas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  
  const [escuelaSeleccionada, setEscuelaSeleccionada] = useState(null);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState(null);
  const [alumnosSeleccionados, setAlumnosSeleccionados] = useState([]);
  
  const [cargando, setCargando] = useState(false);

  const maxAlumnos = modoJuego === 'versus' ? 2 : 1;

  // ============================================
  // 📥 CARGAR ESCUELAS
  // ============================================
  useEffect(() => {
    const cargarEscuelas = async () => {
      setCargando(true);
      try {
        const alumnosSnapshot = await getDocs(collection(db, 'alumnos'));
        const alumnosData = alumnosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const escuelasUnicas = [...new Set(
          alumnosData.map(a => a.escuelaNombre).filter(Boolean)
        )].sort();
        
        setEscuelas(escuelasUnicas);
      } catch (error) {
        console.error('Error cargando escuelas:', error);
      }
      setCargando(false);
    };

    cargarEscuelas();
  }, []);

  // ============================================
  // 📥 CARGAR GRUPOS DE LA ESCUELA
  // ============================================
  const cargarGrupos = async (escuela) => {
    setCargando(true);
    try {
      const alumnosSnapshot = await getDocs(
        query(collection(db, 'alumnos'), where('escuelaNombre', '==', escuela))
      );
      
      const alumnosData = alumnosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const gruposUnicos = [...new Set(
        alumnosData.map(a => a.grupo).filter(Boolean)
      )].sort();
      
      setGrupos(gruposUnicos);
      setEscuelaSeleccionada(escuela);
      setPaso('grupo');
    } catch (error) {
      console.error('Error cargando grupos:', error);
    }
    setCargando(false);
  };

  // ============================================
  // 📥 CARGAR ALUMNOS DEL GRUPO
  // ============================================
  const cargarAlumnos = async (grupo) => {
    setCargando(true);
    try {
      const alumnosSnapshot = await getDocs(
        query(
          collection(db, 'alumnos'),
          where('escuelaNombre', '==', escuelaSeleccionada),
          where('grupo', '==', grupo)
        )
      );
      
      const alumnosData = alumnosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => a.nombre.localeCompare(b.nombre));
      
      setAlumnos(alumnosData);
      setGrupoSeleccionado(grupo);
      setPaso('alumnos');
    } catch (error) {
      console.error('Error cargando alumnos:', error);
    }
    setCargando(false);
  };

  // ============================================
  // ✅ SELECCIONAR/DESELECCIONAR ALUMNO
  // ============================================
  const toggleAlumno = (alumno) => {
    if (alumnosSeleccionados.find(a => a.id === alumno.id)) {
      setAlumnosSeleccionados(alumnosSeleccionados.filter(a => a.id !== alumno.id));
    } else {
      if (alumnosSeleccionados.length < maxAlumnos) {
        setAlumnosSeleccionados([...alumnosSeleccionados, alumno]);
      }
    }
  };

  // ============================================
  // 🚀 CONFIRMAR Y COMENZAR
  // ============================================
  const handleConfirmar = () => {
    if (alumnosSeleccionados.length === 0) {
      alert('Selecciona al menos un alumno');
      return;
    }

    if (modoJuego === 'versus' && alumnosSeleccionados.length !== 2) {
      alert('Debes seleccionar exactamente 2 alumnos para el modo Versus');
      return;
    }

    onConfirmar(alumnosSeleccionados);
  };

  // ============================================
  // 🎨 RENDER
  // ============================================
  const getMateriaInfo = () => {
    const materias = {
      force: { color: '#00FF41', nombre: 'FORCE TRAINING', icono: '⚡' },
      chronos: { color: '#FFD700', nombre: 'CRÓNICAS DEL TIEMPO', icono: '🏛️' },
      quantum: { color: '#00FFFF', nombre: 'QUANTUM LOGIC', icono: '📐' },
      bio_genesis: { color: '#FF00FF', nombre: 'BIO GÉNESIS', icono: '🧬' },
      lingua: { color: '#FF4500', nombre: 'NEXO LINGÜÍSTICO', icono: '🗣️' }
    };
    return materias[materia] || materias.quantum;
  };

  const materiaInfo = getMateriaInfo();

  return (
    <div className="selector-overlay">
      <div className="selector-modal" style={{ '--tema-color': materiaInfo.color }}>
        
        {/* HEADER */}
        <div className="selector-header">
          <div>
            <h2 className="selector-titulo">
              {materiaInfo.icono} {materiaInfo.nombre}
            </h2>
            <p className="selector-subtitulo">
              Modo: {modoJuego === 'versus' ? '⚔️ VERSUS (2 jugadores)' : '👤 INDIVIDUAL (1 jugador)'}
            </p>
          </div>
          <button className="btn-cerrar" onClick={onCancelar}>✕</button>
        </div>

        {/* BREADCRUMB */}
        <div className="selector-breadcrumb">
          <span className={paso === 'escuela' ? 'activo' : 'completado'}>
            {escuelaSeleccionada ? '✓' : '1'} Escuela
          </span>
          <span className="separador">→</span>
          <span className={paso === 'grupo' ? 'activo' : paso === 'alumnos' ? 'completado' : ''}>
            {grupoSeleccionado ? '✓' : '2'} Grupo
          </span>
          <span className="separador">→</span>
          <span className={paso === 'alumnos' ? 'activo' : ''}>
            3 Alumnos
          </span>
        </div>

        {/* CONTENIDO */}
        <div className="selector-contenido">
          {cargando && (
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Cargando...</p>
            </div>
          )}

          {/* PASO 1: ESCUELAS */}
          {paso === 'escuela' && !cargando && (
            <>
              <h3 className="paso-titulo">📂 Selecciona una Escuela</h3>
              <div className="opciones-grid">
                {escuelas.length === 0 && (
                  <p className="mensaje-vacio">No hay escuelas registradas en el sistema</p>
                )}
                {escuelas.map(escuela => (
                  <button
                    key={escuela}
                    className="opcion-card"
                    onClick={() => cargarGrupos(escuela)}
                  >
                    <span className="opcion-icono">🏫</span>
                    <span className="opcion-texto">{escuela}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* PASO 2: GRUPOS */}
          {paso === 'grupo' && !cargando && (
            <>
              <h3 className="paso-titulo">
                📁 Grupos de {escuelaSeleccionada}
              </h3>
              <div className="opciones-grid">
                {grupos.length === 0 && (
                  <p className="mensaje-vacio">No hay grupos en esta escuela</p>
                )}
                {grupos.map(grupo => (
                  <button
                    key={grupo}
                    className="opcion-card"
                    onClick={() => cargarAlumnos(grupo)}
                  >
                    <span className="opcion-icono">👥</span>
                    <span className="opcion-texto">GRUPO {grupo}</span>
                  </button>
                ))}
              </div>
              <button className="btn-volver" onClick={() => {
                setPaso('escuela');
                setEscuelaSeleccionada(null);
                setGrupos([]);
              }}>
                ← Cambiar Escuela
              </button>
            </>
          )}

          {/* PASO 3: ALUMNOS */}
          {paso === 'alumnos' && !cargando && (
            <>
              <h3 className="paso-titulo">
                👤 Alumnos del Grupo {grupoSeleccionado}
                <span className="contador-seleccion">
                  {alumnosSeleccionados.length}/{maxAlumnos} seleccionados
                </span>
              </h3>
              
              <div className="alumnos-grid">
                {alumnos.length === 0 && (
                  <p className="mensaje-vacio">No hay alumnos en este grupo</p>
                )}
                {alumnos.map(alumno => {
                  const estaSeleccionado = alumnosSeleccionados.find(a => a.id === alumno.id);
                  const puedeSeleccionar = alumnosSeleccionados.length < maxAlumnos || estaSeleccionado;
                  
                  return (
                    <button
                      key={alumno.id}
                      className={`alumno-card ${estaSeleccionado ? 'seleccionado' : ''} ${!puedeSeleccionar ? 'deshabilitado' : ''}`}
                      onClick={() => puedeSeleccionar && toggleAlumno(alumno)}
                      disabled={!puedeSeleccionar}
                    >
                      <div className="alumno-avatar">
                        {estaSeleccionado ? '✓' : '👤'}
                      </div>
                      <div className="alumno-info">
                        <span className="alumno-nombre">{alumno.nombre}</span>
                        <span className="alumno-puntos">
                          ⭐ {alumno.puntosClase || 0} XP
                        </span>
                      </div>
                      {estaSeleccionado && (
                        <div className="posicion-badge">
                          {modoJuego === 'versus' ? `J${alumnosSeleccionados.indexOf(alumno) + 1}` : '✓'}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="botones-footer">
                <button className="btn-volver" onClick={() => {
                  setPaso('grupo');
                  setGrupoSeleccionado(null);
                  setAlumnos([]);
                  setAlumnosSeleccionados([]);
                }}>
                  ← Cambiar Grupo
                </button>
                
                <button 
                  className="btn-confirmar"
                  onClick={handleConfirmar}
                  disabled={alumnosSeleccionados.length === 0}
                >
                  🚀 COMENZAR PARTIDA
                </button>
              </div>
            </>
          )}
        </div>

        {/* ALUMNOS SELECCIONADOS (PREVIEW) */}
        {alumnosSeleccionados.length > 0 && paso === 'alumnos' && (
          <div className="seleccion-preview">
            <h4>Jugadores seleccionados:</h4>
            <div className="preview-lista">
              {alumnosSeleccionados.map((alumno, index) => (
                <div key={alumno.id} className="preview-item">
                  <span className="preview-numero">
                    {modoJuego === 'versus' ? `J${index + 1}` : '✓'}
                  </span>
                  <span className="preview-nombre">{alumno.nombre}</span>
                  <button 
                    className="preview-quitar"
                    onClick={() => toggleAlumno(alumno)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlumnoSelector;