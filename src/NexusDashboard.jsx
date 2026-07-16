import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, increment, query, orderBy, writeBatch, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import './App.css';

// ── Generador de código alfanumérico de 6 caracteres ─────────
function generarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const DURACIONES = [
  { label: '1 hora',       horas: 1 },
  { label: '1 día',        horas: 24 },
  { label: '1 semana',     horas: 168 },
  { label: '1 mes',        horas: 720 },
  { label: '1 trimestre',  horas: 2160 },
  { label: '1 ciclo escolar', horas: 6480 },
  { label: 'Sin expiración', horas: null },
];

const NexusDashboard = ({ onVolver, trimestreActivo, setTrimestreActivo, docenteUid, docenteEmail }) => {
  const [pestaña, setPestaña]                   = useState('rankings');
  const [escuelaSeleccionada, setEscuelaSeleccionada] = useState('');
  const [grupoSeleccionado, setGrupoSeleccionado]     = useState('');
  const [periodoVisualizado, setPeriodoVisualizado]   = useState('tri1');
  const [alumnos, setAlumnos]                   = useState([]);
  const [rankings, setRankings]                 = useState([]);
  const [escuelas, setEscuelas]                 = useState([]);
  const [nuevoNombre, setNuevoNombre]           = useState('');
  const [nuevaEscuela, setNuevaEscuela]         = useState('');
  const [nuevoGrupo, setNuevoGrupo]             = useState('');

  // ── Estado del generador de códigos ──────────────────────
  const [mostrarGenerador, setMostrarGenerador] = useState(false);
  const [duracionSeleccionada, setDuracionSeleccionada] = useState(DURACIONES[1]);
  const [duracionPersonalizada, setDuracionPersonalizada] = useState('');
  const [usarPersonalizada, setUsarPersonalizada] = useState(false);
  const [codigosActivos, setCodigosActivos]     = useState([]);
  const [generandoCodigo, setGenerandoCodigo]   = useState(false);
  const [codigoRecienGenerado, setCodigoRecienGenerado] = useState(null);

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
      setRankings(rankingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error al cargar datos:", error);
    }
  };

  const cargarCodigos = async () => {
    try {
      const snap = await getDocs(collection(db, "codigos_acceso"));
      const ahora = Date.now();
      const activos = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.docenteUid === docenteUid && c.proyecto === 'motion')
        .filter(c => !c.expiraEn || c.expiraEn.toMillis() > ahora);
      setCodigosActivos(activos);
    } catch (e) {
      console.error("Error cargando códigos:", e);
    }
  };

  useEffect(() => { cargarDatos(); cargarCodigos(); }, []);

  useEffect(() => {
    if (escuelaSeleccionada) {
      const grupos = [...new Set(alumnos.filter(a => a.escuelaNombre === escuelaSeleccionada).map(a => a.grupo).filter(Boolean))].sort();
      if (grupos.length > 0 && !grupos.includes(grupoSeleccionado)) setGrupoSeleccionado(grupos[0]);
      else if (grupos.length === 0) setGrupoSeleccionado('');
    }
  }, [escuelaSeleccionada, alumnos]);

  // ── Generar nuevo código ──────────────────────────────────
  const handleGenerarCodigo = async () => {
    if (!grupoSeleccionado || !escuelaSeleccionada) {
      alert('Selecciona una escuela y grupo primero.');
      return;
    }
    setGenerandoCodigo(true);
    try {
      const codigo = generarCodigo();
      let horasFinales = usarPersonalizada
        ? parseFloat(duracionPersonalizada) || 24
        : duracionSeleccionada.horas;

      const data = {
        codigo,
        docenteUid,
        docenteEmail,
        escuela: escuelaSeleccionada,
        grupo: grupoSeleccionado,
        proyecto: 'motion',
        creadoEn: serverTimestamp(),
        expiraEn: horasFinales
          ? Timestamp.fromDate(new Date(Date.now() + horasFinales * 3600000))
          : null,
        activo: true,
      };

      await setDoc(doc(db, "codigos_acceso", codigo), data);
      setCodigoRecienGenerado(codigo);
      await cargarCodigos();
    } catch (e) {
      console.error("Error generando código:", e);
      alert('Error al generar código. Intenta de nuevo.');
    } finally {
      setGenerandoCodigo(false);
    }
  };

  const handleRevocarCodigo = async (codigo) => {
    if (!window.confirm(`¿Revocar el código ${codigo}? Los alumnos con este código perderán acceso.`)) return;
    try {
      await deleteDoc(doc(db, "codigos_acceso", codigo));
      await cargarCodigos();
      if (codigoRecienGenerado === codigo) setCodigoRecienGenerado(null);
    } catch (e) {
      console.error("Error revocando código:", e);
    }
  };

  const copiarCodigo = (codigo) => {
    navigator.clipboard.writeText(codigo);
  };

  // ── CRUD alumnos ──────────────────────────────────────────
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
    } catch (e) { console.error(e); }
  };

  const handleEliminarAlumno = async (id) => {
    if (window.confirm("¿Eliminar a este alumno?")) {
      try { await deleteDoc(doc(db, "alumnos", id)); cargarDatos(); }
      catch (e) { console.error(e); }
    }
  };

  const handleModificarXP = async (alumnoId, cantidad) => {
    if (periodoVisualizado === 'xp_total') return alert("Selecciona un Trimestre específico.");
    try {
      await updateDoc(doc(db, "alumnos", alumnoId), {
        [periodoVisualizado]: increment(cantidad),
        xp_total: increment(cantidad)
      });
      cargarDatos();
    } catch (e) { console.error(e); }
  };

  const handleResetearGrupo = async () => {
    if (periodoVisualizado === 'xp_total') return alert("Selecciona un Trimestre específico.");
    if (!window.confirm(`⚠️ ¿Poner en 0 la XP del ${periodoVisualizado.toUpperCase()} de TODO el Grupo ${grupoSeleccionado}?`)) return;
    try {
      const batch = writeBatch(db);
      alumnosDelGrupo.forEach(alumno => {
        const ref = doc(db, "alumnos", alumno.id);
        const xpARestar = alumno[periodoVisualizado] || 0;
        batch.update(ref, { [periodoVisualizado]: 0, xp_total: increment(-xpARestar) });
      });
      await batch.commit();
      cargarDatos();
    } catch (e) { console.error(e); }
  };

  const gruposDeLaEscuela = [...new Set(alumnos.filter(a => a.escuelaNombre === escuelaSeleccionada).map(a => a.grupo).filter(Boolean))].sort();
  const alumnosDelGrupo   = alumnos.filter(a => a.escuelaNombre === escuelaSeleccionada && a.grupo === grupoSeleccionado);
  const leaderboard       = alumnosDelGrupo.map(a => ({ ...a, scoreOficial: a[periodoVisualizado] || 0 })).sort((a, b) => b.scoreOficial - a.scoreOficial);

  // ── Formato de expiración legible ────────────────────────
  const formatExpiracion = (expiraEn) => {
    if (!expiraEn) return 'Sin expiración';
    const d = expiraEn.toDate();
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="aura-container" style={{ background: '#050510', color: '#FFF', padding: '1.5rem', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>

      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(0,255,255,0.3)', paddingBottom: '0.8rem' }}>
        <h1 style={{ fontFamily: 'Orbitron', fontSize: '1.8rem', color: '#00FFFF', margin: 0 }}>
          NEXUS / CENTRO DE COMANDO
        </h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ background: 'rgba(0,255,255,0.1)', padding: '0.4rem 1rem', borderRadius: '8px', border: '1px solid #00FFFF', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: '#00FFFF', fontFamily: 'Orbitron', marginRight: '10px', fontSize: '0.9rem' }}>🎯 PERIODO:</span>
            <select className="btn-cyber" style={{ background: '#000', color: '#FFF', border: '1px solid #555', padding: '0.3rem', fontSize: '0.9rem', outline: 'none' }}
              value={trimestreActivo} onChange={(e) => setTrimestreActivo(e.target.value)}>
              <option value="tri1">TRIMESTRE 1</option>
              <option value="tri2">TRIMESTRE 2</option>
              <option value="tri3">TRIMESTRE 3</option>
            </select>
          </div>
          <button className="btn-cyber" style={{ '--tema-color': '#00FF41', padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            onClick={() => { setMostrarGenerador(true); }}>
            🔑 CÓDIGOS ALUMNOS
          </button>
          <button className="btn-cyber" style={{ '--tema-color': '#FF0844', padding: '0.5rem 1rem', fontSize: '0.9rem' }} onClick={onVolver}>
            CERRAR PANEL
          </button>
        </div>
      </header>

      {/* CUERPO */}
      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0 }}>

        {/* COLUMNA IZQUIERDA: ESCUELAS */}
        <div style={{ width: '20%', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', overflowY: 'auto' }}>
          <h3 style={{ fontFamily: 'Rajdhani', fontSize: '1.2rem', borderBottom: '1px solid #555', paddingBottom: '0.5rem', marginTop: 0 }}>📂 ESCUELAS</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '1rem' }}>
            {escuelas.map((escuela, i) => (
              <button key={i} className="btn-cyber"
                style={{ textAlign: 'left', padding: '0.6rem', fontSize: '0.9rem', background: escuelaSeleccionada === escuela ? 'rgba(0,255,255,0.2)' : 'transparent', borderColor: escuelaSeleccionada === escuela ? '#00FFFF' : 'rgba(255,255,255,0.2)' }}
                onClick={() => setEscuelaSeleccionada(escuela)}>
                🏫 {escuela}
              </button>
            ))}
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div style={{ width: '80%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.6)', borderRadius: '10px', padding: '0.8rem 1rem', border: '1px solid rgba(0,255,255,0.2)' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Rajdhani', color: '#AAA', marginRight: '10px' }}>📁 GRUPO:</span>
              {gruposDeLaEscuela.map(grupo => (
                <button key={grupo} className="btn-cyber"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', background: grupoSeleccionado === grupo ? 'rgba(0,255,255,0.4)' : 'rgba(0,0,0,0.5)', color: grupoSeleccionado === grupo ? '#FFF' : '#00FFFF', borderColor: grupoSeleccionado === grupo ? '#00FFFF' : 'rgba(255,255,255,0.2)' }}
                  onClick={() => setGrupoSeleccionado(grupo)}>
                  {grupo}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-cyber" style={{ fontSize: '0.9rem', padding: '0.4rem 1rem', background: pestaña === 'rankings' ? '#00FFFF' : 'transparent', color: pestaña === 'rankings' ? '#000' : '#00FFFF' }} onClick={() => setPestaña('rankings')}>🏆 RANKINGS</button>
              <button className="btn-cyber" style={{ fontSize: '0.9rem', padding: '0.4rem 1rem', background: pestaña === 'gestion' ? '#FFD700' : 'transparent', color: pestaña === 'gestion' ? '#000' : '#FFD700', '--tema-color': '#FFD700' }} onClick={() => setPestaña('gestion')}>⚙️ GESTIÓN</button>
            </div>
          </div>

          <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '1.5rem', border: '1px solid rgba(0,255,255,0.2)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '1rem' }}>
              {['tri1', 'tri2', 'tri3', 'xp_total'].map(periodo => (
                <button key={periodo} className="btn-cyber"
                  style={{ fontSize: '0.9rem', background: periodoVisualizado === periodo ? '#FFF' : '#222', color: periodoVisualizado === periodo ? '#000' : '#FFF', borderColor: periodoVisualizado === periodo ? '#FFF' : '#555', padding: '0.4rem 1.5rem' }}
                  onClick={() => setPeriodoVisualizado(periodo)}>
                  {periodo === 'xp_total' ? '🌟 ACUMULADO' : `📅 TRI ${periodo.replace('tri', '')}`}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
              {pestaña === 'rankings' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Rajdhani', fontSize: '1.1rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,255,255,0.1)', color: '#00FFFF', textAlign: 'left' }}>
                      <th style={{ padding: '0.8rem', borderBottom: '2px solid #00FFFF' }}>POSICIÓN</th>
                      <th style={{ padding: '0.8rem', borderBottom: '2px solid #00FFFF' }}>ALUMNO</th>
                      <th style={{ padding: '0.8rem', borderBottom: '2px solid #00FFFF' }}>XP</th>
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
                    <input type="text" placeholder="Nombre" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} style={{ flex: 2, padding: '0.6rem', background: 'rgba(0,0,0,0.5)', border: '1px solid #555', color: '#FFF', borderRadius: '5px', fontFamily: 'Rajdhani' }} />
                    <input type="text" placeholder="Escuela" value={nuevaEscuela} onChange={e => setNuevaEscuela(e.target.value)} style={{ flex: 1, padding: '0.6rem', background: 'rgba(0,0,0,0.5)', border: '1px solid #555', color: '#FFF', borderRadius: '5px', fontFamily: 'Rajdhani' }} />
                    <input type="text" placeholder="Grupo (ej. 2A)" value={nuevoGrupo} onChange={e => setNuevoGrupo(e.target.value)} style={{ flex: 1, padding: '0.6rem', background: 'rgba(0,0,0,0.5)', border: '1px solid #555', color: '#FFF', borderRadius: '5px', fontFamily: 'Rajdhani' }} />
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

      {/* ══════════ MODAL GENERADOR DE CÓDIGOS ══════════ */}
      {mostrarGenerador && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'linear-gradient(135deg, #050510, #0a0e27)', border: '2px solid #00FF41', borderRadius: '16px', width: '100%', maxWidth: '560px', padding: '2rem', boxShadow: '0 0 40px rgba(0,255,65,0.3)' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'Orbitron', color: '#00FF41', margin: 0, fontSize: '1.4rem' }}>🔑 CÓDIGOS DE ACCESO</h2>
              <button onClick={() => { setMostrarGenerador(false); setCodigoRecienGenerado(null); }}
                style={{ background: 'rgba(255,8,68,0.2)', border: '2px solid #FF0844', color: '#FF0844', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            {/* Grupo activo */}
            <div style={{ background: 'rgba(0,255,65,0.08)', border: '1px solid rgba(0,255,65,0.3)', borderRadius: '8px', padding: '0.8rem 1rem', marginBottom: '1.2rem', fontFamily: 'Rajdhani', fontSize: '1rem', color: '#aaa' }}>
              📁 Grupo activo: <strong style={{ color: '#00FF41' }}>{escuelaSeleccionada || '—'} / {grupoSeleccionado || '—'}</strong>
              <br/><span style={{ fontSize: '0.85rem' }}>El código generado dará acceso a este grupo.</span>
            </div>

            {/* Selector de duración */}
            <p style={{ fontFamily: 'Rajdhani', color: '#aaa', margin: '0 0 8px 0', fontSize: '0.95rem' }}>⏱ DURACIÓN DEL CÓDIGO:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '1rem' }}>
              {DURACIONES.map((d, i) => (
                <button key={i} onClick={() => { setDuracionSeleccionada(d); setUsarPersonalizada(false); }}
                  className="btn-cyber"
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: !usarPersonalizada && duracionSeleccionada.label === d.label ? 'rgba(0,255,65,0.3)' : 'transparent', borderColor: !usarPersonalizada && duracionSeleccionada.label === d.label ? '#00FF41' : 'rgba(255,255,255,0.2)', color: !usarPersonalizada && duracionSeleccionada.label === d.label ? '#00FF41' : '#aaa', '--tema-color': '#00FF41' }}>
                  {d.label}
                </button>
              ))}
              <button onClick={() => setUsarPersonalizada(true)} className="btn-cyber"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: usarPersonalizada ? 'rgba(255,215,0,0.2)' : 'transparent', borderColor: usarPersonalizada ? '#FFD700' : 'rgba(255,255,255,0.2)', color: usarPersonalizada ? '#FFD700' : '#aaa', '--tema-color': '#FFD700' }}>
                ✏️ Personalizar
              </button>
            </div>

            {usarPersonalizada && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                <input type="number" min="1" placeholder="Horas" value={duracionPersonalizada}
                  onChange={e => setDuracionPersonalizada(e.target.value)}
                  style={{ width: '100px', padding: '0.5rem', background: 'rgba(0,0,0,0.5)', border: '1px solid #FFD700', color: '#FFF', borderRadius: '6px', fontFamily: 'Rajdhani', fontSize: '1rem' }} />
                <span style={{ color: '#aaa', fontFamily: 'Rajdhani' }}>horas de acceso</span>
              </div>
            )}

            {/* Botón generar */}
            <button onClick={handleGenerarCodigo} disabled={generandoCodigo || !grupoSeleccionado}
              className="btn-cyber"
              style={{ width: '100%', padding: '0.9rem', fontSize: '1rem', '--tema-color': '#00FF41', marginBottom: '1.2rem', opacity: (!grupoSeleccionado || generandoCodigo) ? 0.5 : 1 }}>
              {generandoCodigo ? '⏳ Generando...' : '⚡ GENERAR CÓDIGO'}
            </button>

            {/* Código recién generado */}
            {codigoRecienGenerado && (
              <div style={{ background: 'rgba(0,255,65,0.1)', border: '2px solid #00FF41', borderRadius: '10px', padding: '1rem', marginBottom: '1.2rem', textAlign: 'center' }}>
                <p style={{ fontFamily: 'Rajdhani', color: '#aaa', margin: '0 0 8px 0', fontSize: '0.85rem' }}>CÓDIGO GENERADO — COMPARTE CON TUS ALUMNOS</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                  <span style={{ fontFamily: 'Orbitron', fontSize: '2.5rem', color: '#00FF41', letterSpacing: '6px', textShadow: '0 0 20px #00FF41' }}>{codigoRecienGenerado}</span>
                  <button onClick={() => copiarCodigo(codigoRecienGenerado)} className="btn-cyber"
                    style={{ '--tema-color': '#00FF41', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>📋 Copiar</button>
                </div>
              </div>
            )}

            {/* Códigos activos */}
            {codigosActivos.length > 0 && (
              <div>
                <p style={{ fontFamily: 'Rajdhani', color: '#aaa', margin: '0 0 8px 0', fontSize: '0.9rem' }}>📋 CÓDIGOS ACTIVOS:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {codigosActivos.map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem 0.8rem' }}>
                      <div>
                        <span style={{ fontFamily: 'Orbitron', color: '#00FF41', fontSize: '1rem', letterSpacing: '3px' }}>{c.id}</span>
                        <span style={{ fontFamily: 'Rajdhani', color: '#555', fontSize: '0.8rem', marginLeft: '10px' }}>{c.grupo}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: 'Rajdhani', color: '#555', fontSize: '0.75rem' }}>{formatExpiracion(c.expiraEn)}</span>
                        <button onClick={() => copiarCodigo(c.id)} className="btn-cyber" style={{ '--tema-color': '#00FFFF', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>📋</button>
                        <button onClick={() => handleRevocarCodigo(c.id)} className="btn-cyber" style={{ '--tema-color': '#FF0844', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NexusDashboard;
