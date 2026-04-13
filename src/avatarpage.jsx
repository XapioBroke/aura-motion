import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase'; // Ajusta esto a tu ruta real
import { TIERS_XP, TIER_INFO, getTier, infoProgreso } from './games/Accesorios';

// ── CONSTANTES DE UI ─────────────────

const SECRET = 'nexus-avatar-2024';
const _b64  = str => btoa(unescape(encodeURIComponent(str)));
const _db64 = str => { try { return JSON.parse(decodeURIComponent(escape(atob(str)))); } catch { return null; } };
const _hash = (str) => { let h=5381; for(let i=0;i<str.length;i++){h=((h<<5)+h)^str.charCodeAt(i);h=h>>>0;} return h.toString(36); };
const _firmar    = p64 => _hash(p64 + SECRET);
const _verificar = (p64,sig) => _hash(p64+SECRET)===sig;

export const generarToken = (alumnoId) => {
  const p = { alumnoId, exp: Date.now() + 5*60*1000 };
  const p64 = _b64(JSON.stringify(p));
  return `${p64}.${_firmar(p64)}`;
};

const _validarToken = (token) => {
  if (!token) return null;
  const limpio = token.replace(/ /g, '+');
  const idx = limpio.lastIndexOf('.');
  if (idx === -1) return null;
  const p64 = limpio.substring(0,idx), sig = limpio.substring(idx+1);
  if (!_verificar(p64,sig)) return null;
  const payload = _db64(p64);
  if (!payload || Date.now() > payload.exp) return null;
  return payload;
};

// ── COMPONENTES SELECTORES ─────────────────

const SelectorTiers = ({ tierActual, accesorioActivo, onSeleccionar, guardando }) => (
  <div style={{ width:'100%', maxWidth:'420px' }}>
    <div style={{ fontFamily:'monospace', fontSize:'0.7rem', color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:'10px', textAlign:'center' }}>
      ⚡ Efectos de energía
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'0.7rem' }}>
      {TIER_INFO.map(tier => {
        const desbloqueado = tierActual >= tier.id;
        const seleccionado = accesorioActivo === `tier_${tier.id}`;
        return (
          <button key={tier.id}
            disabled={!desbloqueado || guardando}
            onClick={() => onSeleccionar(`tier_${tier.id}`, tier.id)}
            style={{
              padding:'0.9rem 0.7rem', color:'#FFF', position:'relative',
              background: seleccionado ? 'rgba(0,255,255,0.12)' : desbloqueado ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.25)',
              border:`2px solid ${seleccionado?'#00FFFF':desbloqueado?'rgba(255,255,255,0.15)':'rgba(255,255,255,0.04)'}`,
              borderRadius:'14px', cursor:desbloqueado?'pointer':'default',
              display:'flex', flexDirection:'column', alignItems:'center', gap:'5px',
              opacity:desbloqueado?1:0.3,
              boxShadow:seleccionado?'0 0 18px rgba(0,255,255,0.35)':'none',
              transition:'all 0.2s',
            }}>
            <span style={{ fontSize:'1.8rem', lineHeight:1 }}>{tier.icono}</span>
            <span style={{ fontFamily:'monospace', fontSize:'0.72rem', fontWeight:'bold', color:seleccionado?'#00FFFF':'#FFF', textAlign:'center' }}>{tier.nombre}</span>
            <span style={{ fontSize:'0.6rem', color:'rgba(255,255,255,0.35)' }}>
              {tier.xpRequerido > 0 ? `${tier.xpRequerido.toLocaleString()} XP` : 'Gratis'}
            </span>
            {seleccionado && <div style={{ position:'absolute', top:'6px', right:'8px', fontSize:'0.58rem', color:'#00FFFF', fontFamily:'monospace' }}>✓ ON</div>}
            {!desbloqueado && <div style={{ fontSize:'0.58rem', color:'rgba(255,255,255,0.25)' }}>🔒</div>}
          </button>
        );
      })}
    </div>
  </div>
);

const SelectorPng = ({ accesoriosPng, xpTotal, accesorioActivo, onSeleccionar, guardando }) => {
  if (!accesoriosPng || accesoriosPng.length === 0) return null;
  return (
    <div style={{ width:'100%', maxWidth:'420px', marginTop:'1rem' }}>
      <div style={{ fontFamily:'monospace', fontSize:'0.7rem', color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:'10px', textAlign:'center' }}>
        🎨 Accesorios especiales
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'0.7rem' }}>
        {accesoriosPng.map(acc => {
          const desbloqueado = xpTotal >= (acc.xpRequerido || 0);
          const seleccionado = accesorioActivo === `png_${acc.id}`;
          return (
            <button key={acc.id}
              disabled={!desbloqueado || guardando}
              onClick={() => onSeleccionar(`png_${acc.id}`, null, acc.id)}
              style={{
                padding:'0.9rem 0.7rem', color:'#FFF', position:'relative',
                background: seleccionado ? 'rgba(255,215,0,0.12)' : desbloqueado ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.25)',
                border:`2px solid ${seleccionado?'#FFD700':desbloqueado?'rgba(255,255,255,0.15)':'rgba(255,255,255,0.04)'}`,
                borderRadius:'14px', cursor:desbloqueado?'pointer':'default',
                display:'flex', flexDirection:'column', alignItems:'center', gap:'6px',
                opacity:desbloqueado?1:0.3,
                boxShadow:seleccionado?'0 0 18px rgba(255,215,0,0.35)':'none',
                transition:'all 0.2s',
              }}>
              {acc.imagen ? (
                <img src={acc.imagen} alt={acc.nombre}
                  style={{ width:'52px', height:'52px', objectFit:'contain', filter:desbloqueado?'none':'grayscale(100%) opacity(40%)' }} 
                  onError={(e) => { e.target.style.display = 'none'; console.warn('Error cargando imagen:', acc.imagen); }}
                />
              ) : (
                <span style={{ fontSize:'2rem' }}>{acc.icono || '🎭'}</span>
              )}
              <span style={{ fontFamily:'monospace', fontSize:'0.72rem', fontWeight:'bold', color:seleccionado?'#FFD700':'#FFF', textAlign:'center' }}>{acc.nombre}</span>
              {acc.materia && (
                <span style={{ fontSize:'0.58rem', color:'rgba(255,255,255,0.3)', background:'rgba(255,255,255,0.07)', padding:'2px 6px', borderRadius:'4px' }}>
                  {acc.materia}
                </span>
              )}
              <span style={{ fontSize:'0.6rem', color:'rgba(255,255,255,0.35)' }}>
                {(acc.xpRequerido||0).toLocaleString()} XP
              </span>
              {seleccionado && <div style={{ position:'absolute', top:'6px', right:'8px', fontSize:'0.58rem', color:'#FFD700', fontFamily:'monospace' }}>✓ ON</div>}
              {!desbloqueado && <div style={{ fontSize:'0.58rem', color:'rgba(255,255,255,0.25)' }}>🔒</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── 5. SELECCIÓN DE COLORES DE STICKMAN (Blanco, Negro) ─────────────────

export const COLORES_STICKMAN = [
  { id: 'tema',   label: 'Tema',   hex: null }, // Usar color del tema actual de la UI
  { id: 'blanco', label: 'Blanco', hex: '#FFFFFF' }, // Stickman blanco
  { id: 'negro',  label: 'Negro',  hex: '#111111' }, // Stickman negro (no puro, sutil)
];

const SelectorColoresStickman = ({ colorStickmanActivo, onSeleccionarStickman, guardando }) => (
    <div style={{ width: '100%', maxWidth: '420px', marginBottom: '1.2rem' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '10px', textAlign: 'center' }}>
            🎨 Color del Personaje
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            {COLORES_STICKMAN.map(col => {
                const seleccionado = colorStickmanActivo === col.id;
                return (
                    <button key={col.id}
                        disabled={guardando}
                        onClick={() => onSeleccionarStickman(col.id)}
                        style={{
                            padding: '0.6rem 1rem', position: 'relative',
                            background: seleccionado ? 'rgba(0,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                            border: `2px solid ${seleccionado ? '#00FFFF' : 'rgba(255,255,255,0.15)'}`,
                            borderRadius: '12px', cursor: 'pointer',
                            color: seleccionado ? '#00FFFF' : '#FFF',
                            fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 'bold',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            boxShadow: seleccionado ? '0 0 18px rgba(0,255,255,0.35)' : 'none',
                            transition: 'all 0.2s',
                        }}>
                        {col.id !== 'tema' && (
                            <div style={{ width: '14px', height: '14px', background: col.hex, borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)' }} />
                        )}
                        {col.label}
                        {seleccionado && <span style={{ fontSize: '0.58rem', color: '#00FFFF' }}>✓</span>}
                    </button>
                );
            })}
        </div>
    </div>
);

// ── COMPONENTE PRINCIPAL AVATAR PAGE ─────────────────

const AvatarPage = () => {
  const [estado,          setEstado]          = useState('validando');
  const [alumno,          setAlumno]          = useState(null);
  const [tierActual,      setTierActual]      = useState(0);
  const [accesorioActivo, setAccesorioActivo] = useState('tier_0');
  const [accesoriosPng,   setAccesoriosPng]   = useState([]);
  const [colorStickman,   setColorStickman]   = useState('tema'); 
  const [guardando,       setGuardando]       = useState(false);
  const [guardado,        setGuardado]        = useState(false);
  const [errorMsg,        setErrorMsg]        = useState('');
  const [pestana,         setPestana]         = useState('tiers');

  const token = (() => {
    try {
      const m = window.location.search.match(/[?&]token=([^&]*)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { 
      console.error('Error parseando token:', e);
      return new URLSearchParams(window.location.search).get('token'); 
    }
  })();

  useEffect(() => {
    if (!token) { 
      setEstado('error'); 
      setErrorMsg('No se encontró token en la URL'); 
      return; 
    }
    
    const init = async () => {
      try {
        const payload = _validarToken(token);
        if (!payload) { 
          setEstado('expirado'); 
          return; 
        }

        const snap = await getDoc(doc(db, 'alumnos', payload.alumnoId));
        if (!snap.exists()) { 
          setEstado('error'); 
          setErrorMsg('Alumno no encontrado'); 
          return; 
        }

        const data = snap.data();
        setAlumno({ id: snap.id, ...data });
        setTierActual(getTier(data.xp_total || 0));
        setAccesorioActivo(data.accesorio_activo ?? 'tier_0');
        setColorStickman(data.color_stickman ?? 'tema'); 
        setEstado('ok');

        try {
          const pngSnap = await getDocs(collection(db, 'accesorios_png'));
          if (pngSnap && !pngSnap.empty) {
            const pngs = pngSnap.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(a => a.activo !== false)
              .sort((a,b) => (a.xpRequerido||0) - (b.xpRequerido||0));
            
            setAccesoriosPng(pngs);
          } else {
            setAccesoriosPng([]);
          }
        } catch (pngError) { 
          setAccesoriosPng([]);
        }

      } catch (e) {
        setEstado('error'); 
        setErrorMsg(e.message || 'Error de conexión');
      }
    };
    
    init();
  }, [token]);

  const seleccionar = async (accesorioId, tierId = null, pngId = null) => {
    if (!alumno || guardando) return;
    setGuardando(true);
    
    try {
      await updateDoc(doc(db, 'alumnos', alumno.id), {
        accesorio_activo: accesorioId,
        accesorio_tier:   tierId ?? -1,
        accesorio_png_id: pngId  ?? null,
      });
      
      setAccesorioActivo(accesorioId);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
      alert('Error al guardar. Verifica tu conexión.');
    } finally { 
      setGuardando(false); 
    }
  };

  const seleccionarStickman = async (colorId) => {
    if (!alumno || guardando) return;
    setGuardando(true);
    try {
        await updateDoc(doc(db, 'alumnos', alumno.id), {
            color_stickman: colorId,
        });
        setColorStickman(colorId);
        setGuardado(true);
        setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
        alert('Error al guardar color. Verifica tu conexión.');
    } finally {
        setGuardando(false);
    }
  };

  const progreso = alumno ? infoProgreso(alumno.xp_total || 0) : null;

  const base = {
    minHeight:'100vh', background:'#050510',
    display:'flex', flexDirection:'column', alignItems:'center',
    padding:'1.5rem 1rem 3rem', boxSizing:'border-box',
    fontFamily:'system-ui, sans-serif', color:'#FFF',
  };

  if (estado === 'validando') return (
    <div style={base}>
      <div style={{ marginTop:'40vh', textAlign:'center' }}>
        <div style={{ fontSize:'2rem', marginBottom:'1rem' }}>⏳</div>
        <div style={{ fontSize:'1.1rem', color:'rgba(255,255,255,0.5)' }}>Verificando...</div>
      </div>
    </div>
  );

  if (estado === 'expirado') return (
    <div style={base}>
      <div style={{ marginTop:'30vh', textAlign:'center' }}>
        <div style={{ fontSize:'3rem' }}>⏰</div>
        <h2 style={{ color:'#FF4444', fontFamily:'monospace' }}>QR Expirado</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.9rem', lineHeight:1.6 }}>
          Pide al docente un nuevo QR.<br/>Son válidos por <b>5 minutos</b>.
        </p>
      </div>
    </div>
  );

  if (estado === 'error') return (
    <div style={base}>
      <div style={{ marginTop:'30vh', textAlign:'center' }}>
        <div style={{ fontSize:'3rem' }}>❌</div>
        <h2 style={{ color:'#FF4444', fontFamily:'monospace' }}>Error</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.9rem' }}>
          Escanea el QR nuevamente.
        </p>
        {errorMsg && (
          <p style={{ color:'rgba(255,100,100,0.6)', fontSize:'0.72rem', fontFamily:'monospace', marginTop:'8px' }}>
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div style={base}>
      <div style={{ textAlign:'center', marginBottom:'1.2rem' }}>
        <h1 style={{ fontFamily:'monospace', fontSize:'1.4rem', color:'#00FFFF', textShadow:'0 0 15px #00FFFF88', margin:'0 0 4px' }}>
          NEXUS AVATAR
        </h1>
        <div style={{ fontSize:'1rem', color:'rgba(255,255,255,0.7)' }}>
          {alumno?.nombre}
        </div>
        <div style={{ fontSize:'0.85rem', color:'#FFD700', marginTop:'4px' }}>
          ⭐ {(alumno?.xp_total||0).toLocaleString()} XP
        </div>
      </div>

      {progreso?.nextTier && (
        <div style={{ width:'100%', maxWidth:'420px', marginBottom:'1.2rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.72rem', color:'rgba(255,255,255,0.4)', marginBottom:'5px' }}>
            <span>{TIER_INFO[progreso.tier]?.icono} {TIER_INFO[progreso.tier]?.nombre}</span>
            <span>Siguiente: {TIER_INFO[progreso.nextTier]?.nombre} — faltan {progreso.falta.toLocaleString()} XP</span>
          </div>
          <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:'10px', height:'7px', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${progreso.pct}%`, background:'linear-gradient(90deg,#00FFFF,#FFD700)', borderRadius:'10px', transition:'width 0.5s ease' }} />
          </div>
        </div>
      )}

      {/* Selector de Colores de Stickman */}
      <SelectorColoresStickman colorStickmanActivo={colorStickman} onSeleccionarStickman={seleccionarStickman} guardando={guardando} />

      {accesoriosPng.length > 0 && (
        <div style={{ display:'flex', gap:'6px', marginBottom:'1rem', background:'rgba(0,0,0,0.3)', borderRadius:'10px', padding:'4px' }}>
          {[['tiers','⚡ Efectos'],['png','🎨 Especiales']].map(([id,label]) => (
            <button key={id} onClick={() => setPestana(id)} style={{
              fontFamily:'monospace', fontSize:'0.72rem', padding:'0.4rem 1rem',
              background: pestana===id ? 'rgba(0,255,255,0.15)' : 'transparent',
              border:`1px solid ${pestana===id?'#00FFFF':'transparent'}`,
              borderRadius:'8px', color: pestana===id?'#00FFFF':'rgba(255,255,255,0.4)',
              cursor:'pointer', transition:'all 0.2s',
            }}>{label}</button>
          ))}
        </div>
      )}

      {pestana === 'tiers' && (
        <SelectorTiers tierActual={tierActual} accesorioActivo={accesorioActivo} onSeleccionar={seleccionar} guardando={guardando} />
      )}
      {pestana === 'png' && (
        <SelectorPng accesoriosPng={accesoriosPng} xpTotal={alumno?.xp_total||0} accesorioActivo={accesorioActivo} onSeleccionar={seleccionar} guardando={guardando} />
      )}

      {guardado && (
        <div style={{ marginTop:'1.2rem', padding:'0.6rem 1.5rem', background:'rgba(0,255,65,0.12)', border:'1px solid #00FF41', borderRadius:'20px', color:'#00FF41', fontFamily:'monospace', fontSize:'0.9rem' }}>
          ✅ ¡Cambios guardados!
        </div>
      )}

      <div style={{ marginTop:'2rem', fontSize:'0.68rem', color:'rgba(255,255,255,0.18)', textAlign:'center' }}>
        El cambio se aplica en la pantalla del docente
      </div>
    </div>
  );
};

export default AvatarPage;