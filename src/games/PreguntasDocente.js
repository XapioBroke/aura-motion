// ============================================================
//  PREGUNTAS DOCENTE — Módulo Firebase + estado global
//  
//  Colección Firebase: "preguntas_docente"
//  Documento: { materia[], pregunta, correcta, falsas[2],
//               activa, pin_hash, createdAt, updatedAt }
//
//  Modos de banco:
//    'banco'        → solo preguntas originales
//    'mezcla'       → originales + docente activas (50/50)
//    'solo_docente' → solo preguntas docente activas
//
//  PIN: 4 dígitos, hash simple guardado en localStorage
// ============================================================

import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

const COLECCION = 'preguntas_docente';
const PIN_KEY   = 'nexus_docente_pin';

// ── Hash simple (no criptográfico — solo para UX básica) ──
const _hash = async (str) => {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// ── PIN ──────────────────────────────────────────────────
export const PinDocente = {
  async existe() {
    return !!localStorage.getItem(PIN_KEY);
  },

  async verificar(pin) {
    const guardado = localStorage.getItem(PIN_KEY);
    if (!guardado) return false;
    const hash = await _hash(String(pin));
    return hash === guardado;
  },

  async crear(pin) {
    const hash = await _hash(String(pin));
    localStorage.setItem(PIN_KEY, hash);
  },

  async cambiar(pinViejo, pinNuevo) {
    const ok = await this.verificar(pinViejo);
    if (!ok) throw new Error('PIN incorrecto');
    await this.crear(pinNuevo);
  },

  limpiar() {
    localStorage.removeItem(PIN_KEY);
  },
};

// ── CRUD Preguntas ────────────────────────────────────────
export const PreguntasDocente = {

  // Obtener todas las preguntas (opcionalmente filtrar por materia)
  async obtener(materia = null) {
    try {
      let q;
      if (materia) {
        q = query(collection(db, COLECCION), where('materia', 'array-contains', materia));
      } else {
        q = collection(db, COLECCION);
      }
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error('PreguntasDocente.obtener:', e);
      return [];
    }
  },

  // Crear nueva pregunta
  async crear({ materia, pregunta, correcta, falsas, activa = true }) {
    try {
      const ref = await addDoc(collection(db, COLECCION), {
        materia:   Array.isArray(materia) ? materia : [materia],
        pregunta:  pregunta.trim(),
        correcta:  correcta.trim(),
        falsas:    falsas.map(f => f.trim()).filter(Boolean).slice(0, 2),
        activa,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (e) {
      console.error('PreguntasDocente.crear:', e);
      throw e;
    }
  },

  // Editar pregunta existente
  async editar(id, campos) {
    try {
      await updateDoc(doc(db, COLECCION, id), {
        ...campos,
        materia: Array.isArray(campos.materia) ? campos.materia : [campos.materia],
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('PreguntasDocente.editar:', e);
      throw e;
    }
  },

  // Toggle activa/inactiva
  async toggleActiva(id, activa) {
    try {
      await updateDoc(doc(db, COLECCION, id), { activa, updatedAt: serverTimestamp() });
    } catch (e) {
      console.error('PreguntasDocente.toggleActiva:', e);
      throw e;
    }
  },

  // Eliminar
  async eliminar(id) {
    try {
      await deleteDoc(doc(db, COLECCION, id));
    } catch (e) {
      console.error('PreguntasDocente.eliminar:', e);
      throw e;
    }
  },
};

// ── Estado global del modo activo ────────────────────────
// Se guarda en localStorage para persistir entre sesiones
const MODO_KEY   = 'nexus_modo_preguntas';
const MODOS = ['banco', 'mezcla', 'solo_docente'];

export const ModoPreguntas = {
  obtener: ()      => localStorage.getItem(MODO_KEY) || 'banco',
  guardar: (modo)  => { if (MODOS.includes(modo)) localStorage.setItem(MODO_KEY, modo); },
  reset:   ()      => localStorage.removeItem(MODO_KEY),
};

// ── generarRetoDocente — función principal ─────────────────
// Reemplaza a generarReto() cuando hay preguntas del docente activas.
// Recibe el banco original como parámetro para no crear dependencia circular.
export const generarRetoConDocente = async (materia, bancoOriginal, preguntasDocente) => {
  const modo = ModoPreguntas.obtener();

  // Filtrar preguntas docente activas para esta materia
  const activas = preguntasDocente.filter(p =>
    p.activa && Array.isArray(p.materia) && p.materia.includes(materia)
  );

  let pool = [];

  if (modo === 'banco' || activas.length === 0) {
    pool = bancoOriginal;
  } else if (modo === 'solo_docente') {
    pool = activas.map(p => ({ p: p.pregunta, c: p.correcta, f: p.falsas }));
  } else {
    // mezcla — 50% docente si hay suficientes, si no más banco
    const usarDocente = Math.random() < 0.5 && activas.length > 0;
    if (usarDocente) {
      pool = activas.map(p => ({ p: p.pregunta, c: p.correcta, f: p.falsas }));
    } else {
      pool = bancoOriginal;
    }
  }

  if (pool.length === 0) pool = bancoOriginal; // fallback

  const item = pool[Math.floor(Math.random() * pool.length)];
  const opciones = [
    { texto: item.c, esCorrecto: true },
    ...item.f.map(f => ({ texto: f, esCorrecto: false })),
  ].sort(() => Math.random() - 0.5);

  return { pregunta: item.p, opciones };
};

export const MATERIAS_LABEL = {
  force:       '🏃 Fuerza',
  chronos:     '📜 Chronos',
  quantum:     '🔢 Quantum',
  bio_genesis: '🧬 Bio',
  lingua:      '📝 Lingua',
};