// ============================================================
//  ConfiguracionJuegos.js
//  Sistema de configuración INTERMEDIO para todos los minijuegos.
//  Expone: defaultConfig, validateConfig, renderConfigPanel (React)
// ============================================================

// ─── SCHEMA DE CONFIGURACIÓN POR JUEGO ───────────────────────
export const CONFIG_SCHEMA = {
  // Opciones comunes a TODOS los juegos
  _comun: {
    dificultad: {
      tipo: 'opciones',
      label: 'Dificultad',
      opciones: [
        { valor: 'facil',   label: 'Fácil',    desc: 'Más tiempo, menos elementos' },
        { valor: 'medio',   label: 'Medio',    desc: 'Balance desafiante' },
        { valor: 'dificil', label: 'Difícil',  desc: 'Rápido y exigente' },
      ],
      defecto: 'medio',
    },
    velocidad: {
      tipo: 'slider',
      label: 'Velocidad',
      min: 0.5, max: 2.0, paso: 0.1,
      defecto: 1.0,
      formatear: v => `${v.toFixed(1)}×`,
    },
    tamanoObjetivos: {
      tipo: 'slider',
      label: 'Tamaño de objetivos',
      min: 0.6, max: 1.6, paso: 0.1,
      defecto: 1.0,
      formatear: v => `${Math.round(v * 100)}%`,
    },
  },

  // Overrides por juego (si se necesitan campos extra)
  burbujas: {},
  meteoritos: {},
  laser: {},
  pisarocas: {},
  surf: {},
  conductor: {
    // El conductor no usa tamanoObjetivos (el orbe es fijo)
    tamanoObjetivos: null, // null = ocultar en UI
  },
  esquiva: {},
  memoria: {
    // La memoria no usa velocidad de la misma forma
    velocidad: null, // null = ocultar en UI
  },
};

// ─── CONFIG POR DEFECTO ──────────────────────────────────────
export const defaultConfig = (juegoId = 'burbujas') => {
  const schema = CONFIG_SCHEMA._comun;
  const overrides = CONFIG_SCHEMA[juegoId] || {};

  const config = {};
  Object.entries(schema).forEach(([key, def]) => {
    if (overrides[key] === null) return; // campo oculto para este juego
    config[key] = def.defecto;
  });

  return config;
};

// ─── VALIDAR / NORMALIZAR CONFIG ─────────────────────────────
export const validateConfig = (config, juegoId = 'burbujas') => {
  const schema = CONFIG_SCHEMA._comun;
  const overrides = CONFIG_SCHEMA[juegoId] || {};
  const resultado = { ...config };

  Object.entries(schema).forEach(([key, def]) => {
    if (overrides[key] === null) return;

    if (resultado[key] === undefined || resultado[key] === null) {
      resultado[key] = def.defecto;
      return;
    }

    if (def.tipo === 'slider') {
      resultado[key] = Math.max(def.min, Math.min(def.max, Number(resultado[key]) || def.defecto));
    }
    if (def.tipo === 'opciones') {
      const valid = def.opciones.map(o => o.valor);
      if (!valid.includes(resultado[key])) resultado[key] = def.defecto;
    }
  });

  return resultado;
};

// ─── PRESETS RÁPIDOS ─────────────────────────────────────────
export const PRESETS = {
  arcade: {
    label: '🕹️ Arcade',
    desc: 'Rápido, grande, adrenalina',
    config: { dificultad: 'dificil', velocidad: 1.6, tamanoObjetivos: 0.8 },
  },
  clasico: {
    label: '🎮 Clásico',
    desc: 'Balance perfecto',
    config: { dificultad: 'medio', velocidad: 1.0, tamanoObjetivos: 1.0 },
  },
  inclusivo: {
    label: '♿ Accesible',
    desc: 'Para todos los niveles',
    config: { dificultad: 'facil', velocidad: 0.7, tamanoObjetivos: 1.4 },
  },
  versus: {
    label: '⚔️ Versus',
    desc: 'Equilibrado para 2 jugadores',
    config: { dificultad: 'medio', velocidad: 1.2, tamanoObjetivos: 1.0 },
  },
};

// ─── HELPER: NOMBRE LEGIBLE DE JUEGO ─────────────────────────
export const NOMBRE_JUEGO = {
  burbujas:   'Burbujas',
  meteoritos: 'Meteoritos',
  laser:      'Láser',
  pisarocas:  'Pisarocas',
  surf:       'Surf',
  conductor:  'Conductor ⚡',
  esquiva:    'Esquiva 🛡️',
  memoria:    'Memoria 🧠',
};

// ─── RENDERIZADOR REACT (componente puro) ────────────────────
// Uso:  <PanelConfigJuego juegoId={id} config={cfg} onChange={setCfg} colorTema="#00FFFF" />
import React from 'react';

export function PanelConfigJuego({ juegoId, config, onChange, colorTema = '#00FFFF' }) {
  const schema = CONFIG_SCHEMA._comun;
  const overrides = CONFIG_SCHEMA[juegoId] || {};

  const campos = Object.entries(schema).filter(([key]) => overrides[key] !== null);

  const set = (key, valor) => onChange({ ...config, [key]: valor });

  const aplicarPreset = (preset) => {
    const nuevo = { ...config };
    Object.entries(preset.config).forEach(([k, v]) => {
      if (overrides[k] !== null) nuevo[k] = v;
    });
    onChange(nuevo);
  };

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.4rem',
      color: '#FFF',
    }}>
      {/* ── PRESETS ── */}
      <div>
        <p style={estilos.labelSeccion(colorTema)}>⚡ PRESETS RÁPIDOS</p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              style={estilos.btnPreset(colorTema)}
              onClick={() => aplicarPreset(preset)}
              title={preset.desc}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CAMPOS ── */}
      {campos.map(([key, def]) => (
        <div key={key} style={{ width: '100%', maxWidth: '500px', margin: '0 auto' }}>
          <p style={estilos.labelCampo(colorTema)}>
            {def.label}
            {def.tipo === 'slider' && (
              <span style={{ marginLeft: '10px', color: '#FFF', fontFamily: 'Orbitron' }}>
                {def.formatear(config[key] ?? def.defecto)}
              </span>
            )}
          </p>

          {def.tipo === 'opciones' && (
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              {def.opciones.map(op => (
                <button
                  key={op.valor}
                  style={estilos.btnOpcion(colorTema, (config[key] ?? def.defecto) === op.valor)}
                  onClick={() => set(key, op.valor)}
                  title={op.desc}
                >
                  {op.label}
                </button>
              ))}
            </div>
          )}

          {def.tipo === 'slider' && (
            <div style={{ position: 'relative', padding: '0.3rem 0' }}>
              <input
                type="range"
                min={def.min} max={def.max} step={def.paso}
                value={config[key] ?? def.defecto}
                onChange={e => set(key, parseFloat(e.target.value))}
                style={estilos.slider(colorTema)}
              />
              {/* Marcas min/max */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '0.7rem', opacity: 0.4 }}>{def.formatear(def.min)}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.4 }}>{def.formatear(def.max)}</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── ESTILOS INTERNOS ────────────────────────────────────────
const estilos = {
  labelSeccion: (c) => ({
    fontFamily: 'Orbitron, sans-serif',
    fontSize: '0.7rem',
    letterSpacing: '0.15em',
    color: c,
    margin: '0 0 0.5rem',
    textAlign: 'center',
    opacity: 0.8,
  }),
  labelCampo: (c) => ({
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '0.95rem',
    color: 'rgba(255,255,255,0.65)',
    margin: '0 0 0.4rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }),
  btnPreset: (c) => ({
    fontFamily: 'Rajdhani, sans-serif',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    padding: '0.4rem 1rem',
    background: 'rgba(0,0,0,0.4)',
    color: c,
    border: `1px solid ${c}55`,
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  }),
  btnOpcion: (c, activo) => ({
    fontFamily: 'Orbitron, sans-serif',
    fontSize: '0.78rem',
    padding: '0.4rem 1.1rem',
    background: activo ? c + '33' : 'rgba(0,0,0,0.4)',
    color: activo ? '#FFF' : 'rgba(255,255,255,0.5)',
    border: `1px solid ${activo ? c : 'rgba(255,255,255,0.15)'}`,
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: activo ? `0 0 12px ${c}66` : 'none',
    transition: 'all 0.15s',
  }),
  slider: (c) => ({
    width: '100%',
    appearance: 'none',
    height: '4px',
    borderRadius: '2px',
    background: `linear-gradient(to right, ${c}, ${c}44)`,
    outline: 'none',
    cursor: 'pointer',
    accentColor: c,
  }),
};