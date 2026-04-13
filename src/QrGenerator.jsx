// ============================================================
//  QR GENERATOR — Panel del docente
//  Con host:true en vite.config.js, el servidor ya escucha en
//  0.0.0.0 — el celular solo necesita la IP de la computadora.
//  Este componente detecta si está en localhost y muestra la
//  IP correcta para que el docente la comparta/escanee.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { generarToken } from './avatarpage';

const _qrImageUrl = (texto, size = 220) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(texto)}&margin=10&format=png`;

const _esLocalhost = () =>
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// ── Intenta obtener la IP de red desde el propio hostname
// Si el docente ya accedió por IP (192.168.x.x), la usa directamente.
// Si está en localhost, no puede saberla desde JS → pide al docente.
const _getBaseUrl = (ipManual = '') => {
  const h = window.location.hostname;
  if (!_esLocalhost()) {
    // Ya está accediendo por IP o dominio real → usar tal cual
    return window.location.origin;
  }
  // En localhost: usar la IP que el docente ingresó
  if (ipManual) {
    const port = window.location.port || '5173';
    return `http://${ipManual}:${port}`;
  }
  return null; // aún no tenemos IP
};

const QrGenerator = ({ alumno, colorTema, onCerrar }) => {
  const [qrUrl,    setQrUrl]    = useState('');
  const [imgSrc,   setImgSrc]   = useState('');
  const [expira,   setExpira]   = useState(null);
  const [segsLeft, setSegsLeft] = useState(300);
  const [cargando, setCargando] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [ipLocal,  setIpLocal]  = useState('');
  const [ipConfirmada, setIpConfirmada] = useState(!_esLocalhost());
  const timerRef = useRef(null);

  // ── Generar QR ──────────────────────────────────────────
  const generarQR = async (ipOverride) => {
    if (!alumno?.id) return;
    const base = _getBaseUrl(ipOverride ?? ipLocal);
    if (!base) return; // no tenemos URL todavía

    setCargando(true);
    setImgError(false);
    try {
      const token = generarToken(alumno.id); // síncrono — no requiere await
      // ✅ encodeURIComponent codifica +, =, / del base64 para que lleguen intactos al celular
      const url   = `${base}/avatar?token=${encodeURIComponent(token)}`;
      setQrUrl(url);
      setImgSrc(_qrImageUrl(url));
      const exp = Date.now() + 5 * 60 * 1000;
      setExpira(exp);
      setSegsLeft(300);
    } catch (e) {
      console.error('Error generando token:', e);
    } finally {
      setCargando(false);
    }
  };

  // Auto-generar al confirmar IP o al abrir si no es localhost
  useEffect(() => {
    if (ipConfirmada) generarQR();
  }, [ipConfirmada, alumno?.id]); // eslint-disable-line

  // Timer de expiración
  useEffect(() => {
    if (!expira) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.round((expira - Date.now()) / 1000));
      setSegsLeft(left);
      if (left === 0) clearInterval(timerRef.current);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [expira]);

  const mins     = Math.floor(segsLeft / 60);
  const segs     = segsLeft % 60;
  const expirado = segsLeft === 0;

  const btnStyle = (color) => ({
    fontFamily: 'Orbitron', fontSize: '0.72rem', padding: '0.5rem 1.1rem',
    background: color + '22', border: `1px solid ${color}`,
    borderRadius: '8px', color, cursor: 'pointer', transition: 'all 0.15s',
  });

  const confirmarIp = () => {
    if (!ipLocal) return;
    setIpConfirmada(true);
    // generarQR se llama via useEffect cuando ipConfirmada cambia a true
  };

  // ── RENDER ─────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#0a0a1a', border: `2px solid ${colorTema}66`,
        borderRadius: '20px', padding: '2rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
        maxWidth: '380px', width: '90%',
        boxShadow: `0 0 40px ${colorTema}33`,
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontFamily: 'Orbitron', color: colorTema, margin: '0 0 4px',
            fontSize: '1rem', textShadow: `0 0 10px ${colorTema}` }}>
            📱 QR AVATAR
          </h3>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', fontFamily: 'Rajdhani' }}>
            {alumno?.nombre || 'Alumno'} — escanea para personalizar
          </div>
        </div>

        {/* ── PASO 1: Pedir IP si es localhost ── */}
        {!ipConfirmada ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem',
            width: '100%', alignItems: 'center' }}>

            {/* Instrucción */}
            <div style={{
              background: 'rgba(255,200,0,0.08)', border: '1px solid #FFD70055',
              borderRadius: '10px', padding: '0.9rem 1rem',
              fontFamily: 'Rajdhani', fontSize: '0.83rem',
              color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, width: '100%',
              boxSizing: 'border-box',
            }}>
              <div style={{ marginBottom: '6px' }}>
                ⚠️ Estás en <b style={{ color: '#FFD700' }}>localhost</b> — el celular
                necesita la <b>IP de red de esta computadora</b>.
              </div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
                1. Abre <b style={{ color: '#00FFFF' }}>CMD</b> o <b style={{ color: '#00FFFF' }}>PowerShell</b><br/>
                2. Escribe <code style={{ color: '#FFD700', background: 'rgba(255,255,255,0.08)',
                  padding: '1px 5px', borderRadius: '4px' }}>ipconfig</code><br/>
                3. Copia la <b>"Dirección IPv4"</b> (ej: 192.168.1.X)<br/>
                4. Asegúrate de que el celular esté en el <b>mismo Wi-Fi</b>
              </div>
            </div>

            {/* Input IP */}
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <input
                type="text"
                placeholder="192.168.1.X"
                value={ipLocal}
                onChange={e => setIpLocal(e.target.value.trim())}
                onKeyDown={e => e.key === 'Enter' && confirmarIp()}
                autoFocus
                style={{
                  flex: 1, background: 'rgba(0,0,0,0.6)',
                  border: `1px solid ${colorTema}66`, borderRadius: '8px',
                  color: '#FFF', padding: '0.5rem 0.9rem',
                  fontFamily: 'monospace', fontSize: '1.1rem', outline: 'none',
                  letterSpacing: '0.05em',
                }}
              />
              <button
                onClick={confirmarIp}
                disabled={!ipLocal}
                style={{ ...btnStyle(colorTema), opacity: ipLocal ? 1 : 0.35 }}>
                ✓ OK
              </button>
            </div>

            {/* Puerto info */}
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)',
              fontFamily: 'Rajdhani', textAlign: 'center' }}>
              Puerto: {window.location.port || '5173'} &nbsp;·&nbsp;
              URL resultante: <span style={{ color: colorTema }}>
                http://{ipLocal || '192.168.1.X'}:{window.location.port || '5173'}
              </span>
            </div>

            <button onClick={onCerrar} style={btnStyle('#FF4444')}>✕ CANCELAR</button>
          </div>

        ) : (
          /* ── PASO 2: Mostrar QR ── */
          <>
            {/* Imagen QR */}
            <div style={{
              background: '#FFF', borderRadius: '12px', padding: '12px',
              width: 220, height: 220,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: expirado ? 0.3 : 1, transition: 'opacity 0.3s',
              position: 'relative', flexShrink: 0, boxSizing: 'content-box',
            }}>
              {cargando ? (
                <div style={{ color: '#555', fontFamily: 'Rajdhani',
                  fontSize: '0.9rem', textAlign: 'center' }}>
                  ⏳ Generando...
                </div>
              ) : imgError ? (
                /* Fallback: mostrar URL para copiar */
                <div style={{ color: '#333', fontSize: '0.56rem', fontFamily: 'monospace',
                  wordBreak: 'break-all', textAlign: 'center', padding: '8px' }}>
                  <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>📋</div>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Copia este enlace:</div>
                  <div>{qrUrl}</div>
                </div>
              ) : imgSrc ? (
                <img
                  src={imgSrc}
                  alt="QR Code"
                  width={220}
                  height={220}
                  style={{ display: 'block', borderRadius: '4px' }}
                  onError={() => { setCargando(false); setImgError(true); }}
                />
              ) : null}

              {expirado && !cargando && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.88)', borderRadius: '8px',
                }}>
                  <span style={{ color: '#FF4444', fontWeight: 'bold',
                    fontFamily: 'monospace', fontSize: '1.1rem' }}>
                    ⏰ EXPIRADO
                  </span>
                </div>
              )}
            </div>

            {/* Timer */}
            <div style={{
              fontFamily: 'Orbitron', fontSize: '1.6rem', fontWeight: 'bold',
              color: segsLeft < 60 ? '#FF4444' : segsLeft < 120 ? '#FFD700' : '#00FF41',
              textShadow: '0 0 10px currentColor',
            }}>
              ⏱ {mins}:{segs.toString().padStart(2, '0')}
            </div>

            {/* URL corta de referencia */}
            {qrUrl && (
              <div style={{
                fontSize: '0.58rem', color: 'rgba(255,255,255,0.25)',
                fontFamily: 'monospace', wordBreak: 'break-all',
                textAlign: 'center', maxWidth: '300px', lineHeight: 1.4,
              }}>
                {qrUrl.length > 70 ? qrUrl.substring(0, 70) + '…' : qrUrl}
              </div>
            )}

            {/* Botones */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={() => generarQR()} style={btnStyle(colorTema)}>
                🔄 NUEVO QR
              </button>
              {_esLocalhost() && (
                <button
                  onClick={() => { setIpConfirmada(false); setQrUrl(''); setImgSrc(''); }}
                  style={btnStyle('#FFD700')}>
                  ✎ CAMBIAR IP
                </button>
              )}
              <button onClick={onCerrar} style={btnStyle('#FF4444')}>
                ✕ CERRAR
              </button>
            </div>

            {/* Info del servidor */}
            {_esLocalhost() && ipLocal && (
              <div style={{
                fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)',
                fontFamily: 'Rajdhani', textAlign: 'center',
              }}>
                Servidor en: <span style={{ color: colorTema }}>
                  http://{ipLocal}:{window.location.port || '5173'}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default QrGenerator;