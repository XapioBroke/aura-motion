import React, { useRef, useEffect, useState, useCallback } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, onSnapshot, doc as fsDoc } from 'firebase/firestore';
import { db } from './firebase';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { BurbujaGame }   from './games/BurbujaGame.js';
import { MeteoritoGame } from './games/MeteoritoGame.js';
import { LaserGame }     from './games/LaserGame.js';
import { SurfGame }      from './games/SurfGame.js';
import { ConductorGame } from './games/ConductorGame.js';
import { EsquivaGame }   from './games/EsquivaGame.js';
import { MemoriaGame }   from './games/MemoriaGame.js';
import { ArcoGame }      from './games/Arcogame.js';
import { ArponGame }     from './games/ArponGame.js';
import { BoxeoGame }     from './games/Boxeogame.js';
import { KameGame }      from './games/KameGame.js';
import { KienzanGame }   from './games/Kienzangame.js';
import { PinataGame }    from './games/Pinatagame.js';
import { SableGame }     from './games/SableGame.js';
import { SaltaCuerdaGame } from './games/SaltacuerdaGame.js';
import { PortalGame }    from './games/PortalGame.js';
import { MuroInfernal }  from './games/MuroInfernal.js';
import { SFX }           from './games/SoundEngine.js';
import { PanelConfigJuego, defaultConfig, validateConfig } from './games/ConfiguracionJuegos';
import { PinDocente, PreguntasDocente, ModoPreguntas, MATERIAS_LABEL } from './games/PreguntasDocente';
import { setBancoDocente } from './games/preguntas.js';
import QrGenerator from './QrGenerator';
import {
  renderAccesorio, getTier, resetPool, TIER_INFO, infoProgreso,
  ESTILOS_PERSONAJE, renderEstiloPersonaje, resolverCapas,
  CATEGORIAS, COLORES_ACCESORIO, getPaletaParaEstilo,
} from './games/Accesorios';
import './App.css';

// ─── CONSTANTES ──────────────────────────────────────────────
const TEMAS = {
  force:       '#00FF41',
  chronos:     '#FFD700',
  quantum:     '#00FFFF',
  bio_genesis: '#FF00FF',
  lingua:      '#FF4500',
};

const COLORES_STICKMAN = [
  { id: 'tema',    label: 'Tema',    hex: null },
  { id: '#00C8FF', label: 'Cyan',    hex: '#00C8FF' },
  { id: '#FF6600', label: 'Naranja', hex: '#FF6600' },
  { id: '#FF00CC', label: 'Magenta', hex: '#FF00CC' },
  { id: '#00FF88', label: 'Verde',   hex: '#00FF88' },
  { id: '#FFD700', label: 'Dorado',  hex: '#FFD700' },
];

// PALETA BRILLANTE PARA ACCESORIOS
const PALETA_ACCESORIOS_BRILLANTES = [
  { id: 'tema',    label: 'Tema',    hex: null },
  { id: '#00FFFF', label: 'Cyan',    hex: '#00FFFF' },
  { id: '#FF3300', label: 'Naranja', hex: '#FF3300' },
  { id: '#FF00CC', label: 'Magenta', hex: '#FF00CC' },
  { id: '#00FF41', label: 'Verde',   hex: '#00FF41' },
  { id: '#FFE000', label: 'Dorado',  hex: '#FFE000' },
  { id: '#FFFFFF', label: 'Blanco',  hex: '#FFFFFF' },
  { id: '#111111', label: 'Negro',   hex: '#111111' },
];

const MINIJUEGOS = [
  { id: 'burbujas',    nombre: 'Burbujas',    icono: '🫧',  desc: 'Pincha la burbuja correcta',         motor: BurbujaGame    },
  { id: 'meteoritos',  nombre: 'Meteoritos',  icono: '☄️',  desc: 'Esquiva lo falso, atrapa lo cierto', motor: MeteoritoGame  },
  { id: 'laser',       nombre: 'Láser',        icono: '🔫',  desc: 'Revienta globos con rayos',          motor: LaserGame      },
  { id: 'surf',        nombre: 'Surf',         icono: '🌊',  desc: 'Inclínate para surfear',             motor: SurfGame       },
  { id: 'conductor',   nombre: 'Conductor',    icono: '⚡',  desc: 'Guía el orbe por el canal',          motor: ConductorGame  },
  { id: 'esquiva',     nombre: 'Esquiva',      icono: '🛡️', desc: 'Toca correctas, esquiva incorrectas', motor: EsquivaGame    },
  { id: 'memoria',     nombre: 'Memoria',      icono: '🧠',  desc: 'Memoriza y repite la secuencia',      motor: MemoriaGame    },
  { id: 'arco',        nombre: 'Arco',         icono: '🏹',  desc: 'Apunta y dispara al objetivo',        motor: ArcoGame       },
  { id: 'arpon',       nombre: 'Arpón',        icono: '🐋',  desc: 'Lanza el arpón con precisión',        motor: ArponGame      },
  { id: 'boxeo',       nombre: 'Boxeo',        icono: '🥊',  desc: 'Golpea la respuesta correcta',        motor: BoxeoGame      },
  { id: 'kame',        nombre: 'Kame',         icono: '🔵',  desc: 'Carga y lanza la esfera',             motor: KameGame       },
  { id: 'kienzan',     nombre: 'Kienzan',      icono: '⭕',  desc: 'Lanza el disco certero',              motor: KienzanGame    },
  { id: 'pinata',      nombre: 'Piñata',       icono: '🎉',  desc: 'Rompe las piñatas correctas',         motor: PinataGame     },
  { id: 'sable',       nombre: 'Sable',        icono: '⚔️', desc: 'Corta con el sable láser',            motor: SableGame      },
  { id: 'saltacuerda', nombre: 'Tormenta Láser',icono: '🪢',  desc: 'Salta y esquiva la cuerda',           motor: SaltaCuerdaGame},
  { id: 'portal',      nombre: 'Portal',       icono: '🌀',  desc: 'Entra al portal correcto',            motor: PortalGame     },
];

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
const BodySensor = ({ materia, onSalir, onCambiarAlumno, onVersus, alumno, trimestreActivo = 'tri1' }) => {

  // ── TTS ──
  const vozIA = useCallback((texto) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang  = 'es-MX';
    msg.pitch = 0.2;
    msg.rate  = 0.9;
    window.speechSynthesis.speak(msg);
  }, []);

  // ── REFS DOM ──
  const videoRef       = useRef(null);
  const canvasRef      = useRef(null);
  const contenedorRef  = useRef(null);

  // ── MOTOR IA ──
  const iaIniciada     = useRef(false);
  const requestRef     = useRef();
  const historialPoses = useRef(null);
  const lastDelta      = useRef(0);
  const frameCount     = useRef(0);

  // ── PUNTUACIÓN + TEMA ──
  const puntuacion     = useRef(0);
  const [puntuacionUI, setPuntuacionUI] = useState(0);
  const colorTema      = TEMAS[materia] || '#00FFFF';
  const colorTemaRef   = useRef(colorTema);
  useEffect(() => { colorTemaRef.current = colorTema; }, [colorTema]);

  // ── ESTADO DE JUEGO ──
  const [fase, setFase]   = useState('configuracion');
  const faseRef           = useRef('configuracion');
  const [estado, setEstado]   = useState('inicializando');
  const [conteo, setConteo]   = useState(3);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [pestanaMenu, setPestanaMenu] = useState('juego');

  // ── MODALES EN PARTIDA ──
  const [mostrarSelectorJuego, setMostrarSelectorJuego] = useState(false);
  const [mostrarEditorAcc,     setMostrarEditorAcc]     = useState(false);
  const [mostrarQR,            setMostrarQR]            = useState(false);

  // ── SISTEMA DE PREGUNTAS DEL DOCENTE ──
  const [pinInput,      setPinInput]      = useState('');
  const [pinCrearA,     setPinCrearA]     = useState('');
  const [pinCrearB,     setPinCrearB]     = useState('');
  const [pinVerificado, setPinVerificado] = useState(false);
  const [pinExiste,     setPinExiste]     = useState(false);
  const [pinError,      setPinError]      = useState('');
  const [pregDocente,   setPregDocente]   = useState([]);
  const [modoPregunta,  setModoPregunta]  = useState(ModoPreguntas.obtener());
  const [cargandoPreg,  setCargandoPreg]  = useState(false);
  const [formPreg, setFormPreg] = useState({ pregunta:'', correcta:'', opciones:[], inputOpc:'', materia:[materia], editId:null });
  const [modoForm, setModoForm] = useState(null); 
  const _formReset = () => setFormPreg({ pregunta:'', correcta:'', opciones:[], inputOpc:'', materia:[materia], editId:null });

  // ── MINIJUEGO ──
  const [minijuegoId, setMinijuegoId] = useState('burbujas');
  const minijuegoIdRef = useRef('burbujas');
  const minijuegoRef   = useRef(null);

  // ── CONFIG JUEGO ──
  const [juegoConfig, setJuegoConfig]   = useState(defaultConfig('burbujas'));
  const juegoConfigRef = useRef(juegoConfig);

  // ── MODO / VIDAS / TIEMPO ──
  const [config, setConfig]     = useState({ modo: 'vidas', cantidad: 3 });
  const configRef               = useRef({ modo: 'vidas', cantidad: 3 });
  const [vidas, setVidas]       = useState(3);
  const vidasRef                = useRef(3);
  const [tiempoRestante, setTiempoRestante] = useState(30);
  const tiempoRef               = useRef(30);

  // ── FLASH ──
  const [mensajeFlash, setMensajeFlash] = useState(null);

  // ── PROPS VISUALES ──
  const propConfigRef = useRef(Math.random() > 0.5);
  const bgImage       = useRef(new Image());
  const crownImg      = useRef(new Image());
  const [varianteFondo] = useState(1);
  const muroCanvasRef   = useRef(null);
  const muroRef         = useRef(null);

  // ── ACCESORIOS XP + TIER ──
  const [tierAlumno,  setTierAlumno]  = useState(0);
  const [accesorioId, setAccesorioId] = useState(0);
  const tierRef       = useRef(0);
  const accesorioRef  = useRef(0);
  const [accesorioUI, setAccesorioUI] = useState(0);

  // ── MOSTRAR RESPUESTA CORRECTA ──
  const [mostrarCorrecta, setMostrarCorrecta] = useState(false);
  useEffect(() => { window._nexusMostrarCorrecta = mostrarCorrecta; }, [mostrarCorrecta]);

  // ── ESTADO GUARDADO ──
  const [guardadoOK, setGuardadoOK] = useState(false);

  // ── COLOR DEL STICKMAN ──
  const colorStickRef = useRef(null);
  const [colorStickman, setColorStickman] = useState(null);
  const setColorStick = useCallback((hex) => {
    colorStickRef.current = hex;
    setColorStickman(hex);
    window._nexusColorStickman = hex || 'tema';
  }, []);

  // ── ESTILO PERSONAJE (multi-selección) ──
  const estiloRef = useRef([]);
  const [estiloPersonaje, setEstiloPersonajeUI] = useState([]);

  const setEstilo = useCallback((val) => {
    const arr = Array.isArray(val) ? val
              : (typeof val === 'number' && val > 0) ? [val]
              : [];
    const capas = resolverCapas(arr);
    estiloRef.current = capas;
    setEstiloPersonajeUI(capas);
  }, []);

  const toggleEstilo = useCallback((id) => {
    const prev = estiloRef.current;
    const nuevo = prev.includes(id)
      ? prev.filter(x => x !== id)
      : [...prev, id];
    const capas = resolverCapas(nuevo);
    estiloRef.current = capas;
    setEstiloPersonajeUI(capas);
  }, []);

  // ── COLOR ACCESORIO INDIVIDUAL (DICCIONARIO) ──
  const colorAccRef = useRef({});
  const [colorAccUI, setColorAccUI] = useState({});

  const setColorAcc = useCallback((idOrObj, hex) => {
    if (typeof idOrObj === 'object' && idOrObj !== null) {
      colorAccRef.current = idOrObj;
      setColorAccUI(idOrObj);
    } else {
      setColorAccUI(prev => {
        const n = {...prev, [idOrObj]: hex};
        colorAccRef.current = n;
        return n;
      });
    }
  }, []);

  // ── PROP PNG (estrella/orbe/lentes naranja) ──
  const [mostrarPropPNG, setMostrarPropPNG] = useState(true);
  const mostrarPropRef = useRef(true);
  const togglePropPNG = useCallback(() => {
    const next = !mostrarPropRef.current;
    mostrarPropRef.current = next;
    setMostrarPropPNG(next);
  }, []);

  // ── HELPERS SYNC ──
  const actualizarConfig = (c) => { setConfig(c); configRef.current = c; };
  const setVidasSync  = (v) => { setVidas(v);  vidasRef.current = v;  };
  const setTiempoSync = (v) => { setTiempoRestante(v); tiempoRef.current = v; };

  const mostrarFlash = useCallback((texto, color = '#00FF41') => {
    setMensajeFlash({ texto, color });
    setTimeout(() => setMensajeFlash(null), 1500);
  }, []);

  const alternarPantallaCompleta = () => {
    if (!document.fullscreenElement) {
      contenedorRef.current?.requestFullscreen().catch(() => {});
      setPantallaCompleta(true);
    } else {
      document.exitFullscreen();
      setPantallaCompleta(false);
    }
  };

  const cambiarMinijuego = (id) => {
    setMinijuegoId(id);
    minijuegoIdRef.current = id;
    const c = defaultConfig(id);
    setJuegoConfig(c);
    juegoConfigRef.current = c;
  };

  const actualizarJuegoConfig = (cfg) => {
    const v = validateConfig(cfg, minijuegoIdRef.current);
    setJuegoConfig(v);
    juegoConfigRef.current = v;
  };

  // ── PREGUNTAS DOCENTE ──
  const cargarPreguntasDocente = async () => {
    setCargandoPreg(true);
    try {
      const data = await PreguntasDocente.obtener();
      setPregDocente(data);
      setBancoDocente(data, ModoPreguntas.obtener());
    } catch(e) { console.error(e); }
    finally { setCargandoPreg(false); }
  };
  const verificarPin = async () => {
    setPinError('');
    const existe = await PinDocente.existe();
    if (!existe) { setPinError('Sin PIN'); return; }
    const ok = await PinDocente.verificar(pinInput);
    if (ok) { setPinVerificado(true); setPinInput(''); await cargarPreguntasDocente(); }
    else { setPinError('PIN incorrecto'); }
  };
  const crearPin = async () => {
    if (pinCrearA.length < 4) { setPinError('Mínimo 4 dígitos'); return; }
    if (pinCrearA !== pinCrearB) { setPinError('Los PINs no coinciden'); return; }
    await PinDocente.crear(pinCrearA);
    setPinExiste(true); setPinCrearA(''); setPinCrearB(''); setPinError('✅ PIN creado');
  };
  const abrirPestanaPreguntas = async () => {
    setPestanaMenu('preguntas');
    const existe = await PinDocente.existe();
    setPinExiste(existe);
  };
  const cambiarModo = (modo) => {
    ModoPreguntas.guardar(modo); setModoPregunta(modo); setBancoDocente(pregDocente, modo);
  };
  const guardarPregunta = async () => {
    const { pregunta, correcta, opciones, materia: mat, editId } = formPreg;
    if (!pregunta.trim() || !correcta.trim() || opciones.length < 2) {
      alert('Completa todos los campos y añade al menos 2 opciones incorrectas'); return;
    }
    try {
      if (editId) await PreguntasDocente.editar(editId, { pregunta, correcta, falsas: opciones, materia: mat });
      else        await PreguntasDocente.crear({ materia: mat, pregunta, correcta, falsas: opciones });
      setModoForm(null); _formReset(); await cargarPreguntasDocente();
    } catch(e) { alert('Error al guardar'); }
  };
  const editarPregunta = (p) => {
    setFormPreg({ pregunta: p.pregunta, correcta: p.correcta, opciones: p.falsas||[], inputOpc:'', materia: p.materia, editId: p.id });
    setModoForm('editar');
  };
  const eliminarPregunta = async (id) => {
    if (!window.confirm('¿Eliminar esta pregunta?')) return;
    await PreguntasDocente.eliminar(id); await cargarPreguntasDocente();
  };
  const toggleActiva = async (p) => {
    await PreguntasDocente.toggleActiva(p.id, !p.activa); await cargarPreguntasDocente();
  };

  // ─── CARGA DE ASSETS ──────────────────────────────────────
  useEffect(() => {
    propConfigRef.current = Math.random() > 0.5;
    crownImg.current.src = '/assets/propts/chronos/crown.png';
    const fondos = {
      chronos:     `/assets/bg-chronos${varianteFondo}.jpeg`,
      force:       `/assets/bg-force${varianteFondo}.jpeg`,
      quantum:     `/assets/bg-quantum.jpeg`,
      bio_genesis: `/assets/bg-bio1.jpeg`,
      lingua:      `/assets/bg-nexo1.jpeg`,
    };
    bgImage.current.src = fondos[materia] || '';
  }, [materia, varianteFondo]);

  // ─── FIREBASE — cargar datos del alumno ──────────────────
  useEffect(() => {
    if (!alumno?.id) return;
    const ref = fsDoc(db, 'alumnos', alumno.id);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();

      // XP → tier → accesorio
      const xp   = (d.tri1 || 0) + (d.tri2 || 0) + (d.tri3 || 0) + (d.xp_total || 0);
      const tier  = getTier(xp);
      const acc   = d.accesorio_activo ?? tier;
      setTierAlumno(tier);
      setAccesorioId(acc);
      tierRef.current      = tier;
      accesorioRef.current = acc;
      setAccesorioUI(acc);

      // Color stickman
      if (d.color_stickman && d.color_stickman !== 'tema') {
        setColorStick(d.color_stickman);
      }

      // Estilo personaje
      if (d.estilo_personaje !== undefined) {
        setEstilo(d.estilo_personaje);
      }

      // Color accesorio separado (Objeto)
      if (d.color_accesorio) {
        setColorAcc(typeof d.color_accesorio === 'object' ? d.color_accesorio : {});
      }
    });
    return () => unsub();
  }, [alumno?.id, setColorStick, setEstilo, setColorAcc]);

  // ─── TIMER CONTRARRELOJ ───────────────────────────────────
  useEffect(() => {
    if (fase !== 'jugando' || config.modo !== 'tiempo') return;
    const timer = setInterval(() => {
      const nt = tiempoRef.current - 1;
      setTiempoSync(nt);
      if (nt <= 0) terminarJuego();
    }, 1000);
    return () => clearInterval(timer);
  }, [fase, config.modo]);

  // ─── FINALIZAR JUEGO ──────────────────────────────────────
  const terminarJuego = useCallback(async () => {
    SFX.gameOver();
    setFase('game_over');
    faseRef.current = 'game_over';
    const nombre = alumno?.nombre || 'Jugador';
    vozIA(`Simulación terminada. ${nombre}, has recolectado ${puntuacion.current} puntos.`);
    try {
      if (alumno?.id) {
        await addDoc(collection(db, 'rankings_nexus'), {
          alumno:     alumno.nombre || 'Jugador',
          alumnoId:   alumno.id,
          materia,
          minijuego:  minijuegoIdRef.current,
          dificultad: juegoConfigRef.current?.dificultad || 'medio',
          modoJuego:  configRef.current.modo,
          puntuacion: puntuacion.current,
          fecha:      serverTimestamp(),
        });
        await updateDoc(fsDoc(db, 'alumnos', alumno.id), {
          [trimestreActivo]: increment(puntuacion.current),
          xp_total:          increment(puntuacion.current),
        });
        setGuardadoOK(true);
        setTimeout(() => setGuardadoOK(false), 3000);
      }
    } catch (e) { console.error(e); }
  }, [alumno, trimestreActivo, vozIA]);

  // ─── INICIAR SIMULACIÓN ───────────────────────────────────
  const iniciarSimulacion = () => {
    puntuacion.current = 0;
    setPuntuacionUI(0);
    setVidasSync(config.modo === 'vidas' ? config.cantidad : 0);
    setTiempoSync(config.modo === 'tiempo' ? config.cantidad : 0);
    const juego = MINIJUEGOS.find(j => j.id === minijuegoIdRef.current);
    if (juego) {
      minijuegoRef.current = juego.motor;
      const cfgV = validateConfig(juegoConfigRef.current, minijuegoIdRef.current);
      minijuegoRef.current.init(materia, colorTema, cfgV);
    }
    SFX.inicio();
    setFase('preparacion');
    faseRef.current = 'preparacion';
  };

  // ─── CUENTA REGRESIVA ─────────────────────────────────────
  useEffect(() => {
    if (estado !== 'activo' || fase !== 'preparacion') return;
    let t = 3;
    setConteo(t);
    const iv = setInterval(() => {
      t -= 1;
      if (t > 0) setConteo(t);
      else if (t === 0) setConteo('¡GO!');
      else {
        clearInterval(iv);
        setFase('jugando');
        faseRef.current = 'jugando';
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [estado, fase]);

  // ─── MOTOR IA / CÁMARA (el grande) ───────────────────────
  useEffect(() => {
    if (iaIniciada.current) return;
    iaIniciada.current = true;
    setEstado('calibrando');

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

        let lastVideoTime = -1;

        const renderLoop = (timestamp) => {
          const delta = timestamp - lastTime;
          lastTime = timestamp;
          lastDelta.current = delta * 0.06;
          frameCount.current = (frameCount.current || 0) + 1;

          if (videoEl.readyState >= 2) {
            const startMs = performance.now();
            if (lastVideoTime !== videoEl.currentTime) {
              lastVideoTime = videoEl.currentTime;
              const results = poseLandmarker.detectForVideo(videoEl, startMs);
              setEstado(prev => prev !== 'activo' ? 'activo' : prev);

              ctx.save();
              ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
              const W = canvasEl.width, H = canvasEl.height;

              // ── 1. FONDO ──
              if (bgImage.current.complete && bgImage.current.naturalWidth > 0) {
                ctx.drawImage(bgImage.current, 0, 0, W, H);
                ctx.fillStyle = faseRef.current === 'jugando' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.7)';
              } else {
                ctx.fillStyle = '#000';
              }
              ctx.fillRect(0, 0, W, H);

              let lmEstable = null;

              // ── 1b. MODO MURO (SaltaCuerda / juegos de pared) ──
              if (faseRef.current === 'muro' && muroRef.current) {
                if (results.landmarks?.length > 0) {
                  const crudos = results.landmarks[0];
                  lmEstable = crudos;
                  if (historialPoses.current?.length === crudos.length) {
                    lmEstable = crudos.map((p, i) => ({
                      x: historialPoses.current[i].x + (p.x - historialPoses.current[i].x) * 0.8,
                      y: historialPoses.current[i].y + (p.y - historialPoses.current[i].y) * 0.8,
                      z: p.z, visibility: p.visibility,
                    }));
                  }
                  historialPoses.current = lmEstable;

                  ctx.save();
                  ctx.translate(W, 0); ctx.scale(-1, 1);
                  const _colSk = colorStickRef.current || colorTemaRef.current;
                  ctx.shadowBlur = 15; ctx.shadowColor = _colSk;
                  ctx.strokeStyle = _colSk; ctx.lineWidth = 8;
                  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                  let anchoHm = 100;
                  if (lmEstable[11] && lmEstable[12])
                    anchoHm = Math.hypot((lmEstable[12].x - lmEstable[11].x) * W, (lmEstable[12].y - lmEstable[11].y) * H);
                  const rCabezaM = anchoHm * 0.30;
                  const lineaM = (i, j) => {
                    if (lmEstable[i]?.visibility > 0.3 && lmEstable[j]?.visibility > 0.3) {
                      ctx.moveTo(lmEstable[i].x * W, lmEstable[i].y * H);
                      ctx.lineTo(lmEstable[j].x * W, lmEstable[j].y * H);
                    }
                  };
                  ctx.beginPath();
                  if (lmEstable[11] && lmEstable[12] && lmEstable[23] && lmEstable[24]) {
                    const hMm = { x: (lmEstable[11].x + lmEstable[12].x) / 2 * W, y: (lmEstable[11].y + lmEstable[12].y) / 2 * H };
                    const cMm = { x: (lmEstable[23].x + lmEstable[24].x) / 2 * W, y: (lmEstable[23].y + lmEstable[24].y) / 2 * H };
                    lineaM(11, 12); lineaM(23, 24);
                    ctx.moveTo(hMm.x, hMm.y); ctx.lineTo(cMm.x, cMm.y);
                    if (lmEstable[0]) {
                      ctx.moveTo(hMm.x, hMm.y);
                      ctx.lineTo(lmEstable[0].x * W, lmEstable[0].y * H + rCabezaM);
                      ctx.stroke();
                      ctx.beginPath();
                      ctx.arc(lmEstable[0].x * W, lmEstable[0].y * H, Math.max(20, rCabezaM), 0, Math.PI * 2);
                      ctx.stroke();
                    }
                  }
                  ctx.beginPath();
                  lineaM(11, 13); lineaM(13, 15); lineaM(12, 14); lineaM(14, 16);
                  lineaM(23, 25); lineaM(25, 27); lineaM(24, 26); lineaM(26, 28);
                  ctx.stroke();
                  ctx.restore();
                } else {
                  historialPoses.current = null;
                }

                if (!muroCanvasRef.current) muroCanvasRef.current = document.createElement('canvas');
                const mc = muroCanvasRef.current;
                mc.width = W; mc.height = H;
                const mCtx = mc.getContext('2d');
                mCtx.clearRect(0, 0, W, H);
                muroRef.current.update(lmEstable, W, H, lastDelta.current);
                muroRef.current.render(mCtx, W, H);
                ctx.drawImage(mc, 0, 0);

                if (lmEstable) {
                  const state = muroRef.current.getState?.();
                  if (state?.puntosCuerpo?.length > 0) {
                    state.puntosCuerpo.forEach(p => {
                      const sx = (1 - p.nx) * W;
                      const sy = p.ny * H;
                      const col = p.dentro ? '#00FF41' : '#FF2D55';
                      ctx.save();
                      ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2);
                      ctx.fillStyle = col; ctx.shadowBlur = 18; ctx.shadowColor = col;
                      ctx.fill(); ctx.restore();
                    });
                  }
                }

                ctx.restore();
                requestRef.current = requestAnimationFrame(renderLoop);
                return;
              }

              if (faseRef.current === 'jugando' || faseRef.current === 'preparacion') {

                // ── 2. ESQUELETO (espejado) ──
                ctx.save();
                ctx.translate(W, 0);
                ctx.scale(-1, 1);

                if (results.landmarks?.length > 0) {
                  const crudos = results.landmarks[0];
                  const suav   = 0.8;
                  lmEstable = crudos;

                  if (historialPoses.current?.length === crudos.length) {
                    lmEstable = crudos.map((p, i) => ({
                      x: historialPoses.current[i].x + (p.x - historialPoses.current[i].x) * suav,
                      y: historialPoses.current[i].y + (p.y - historialPoses.current[i].y) * suav,
                      z: p.z,
                      visibility: p.visibility,
                    }));
                  }
                  historialPoses.current = lmEstable;

                  const _colSk = colorStickRef.current || colorTemaRef.current;
                  ctx.shadowBlur  = 15;
                  ctx.shadowColor = _colSk;
                  ctx.strokeStyle = _colSk;
                  ctx.lineWidth   = 8;
                  ctx.lineCap     = 'round';
                  ctx.lineJoin    = 'round';

                  let anchoH = 100;
                  if (lmEstable[11] && lmEstable[12])
                    anchoH = Math.hypot((lmEstable[12].x - lmEstable[11].x) * W, (lmEstable[12].y - lmEstable[11].y) * H);
                  const rCabeza = anchoH * 0.30;

                  const linea = (i, j) => {
                    if (lmEstable[i]?.visibility > 0.3 && lmEstable[j]?.visibility > 0.3) {
                      ctx.moveTo(lmEstable[i].x * W, lmEstable[i].y * H);
                      ctx.lineTo(lmEstable[j].x * W, lmEstable[j].y * H);
                    }
                  };

                  ctx.beginPath();
                  if (lmEstable[11] && lmEstable[12] && lmEstable[23] && lmEstable[24]) {
                    const hM = { x: (lmEstable[11].x + lmEstable[12].x) / 2 * W, y: (lmEstable[11].y + lmEstable[12].y) / 2 * H };
                    const cM = { x: (lmEstable[23].x + lmEstable[24].x) / 2 * W, y: (lmEstable[23].y + lmEstable[24].y) / 2 * H };
                    linea(11, 12); linea(23, 24);
                    ctx.moveTo(hM.x, hM.y); ctx.lineTo(cM.x, cM.y);
                    if (lmEstable[0]) {
                      ctx.moveTo(hM.x, hM.y);
                      ctx.lineTo(lmEstable[0].x * W, lmEstable[0].y * H + rCabeza);
                      ctx.stroke();
                      ctx.beginPath();
                      ctx.arc(lmEstable[0].x * W, lmEstable[0].y * H, Math.max(20, rCabeza), 0, Math.PI * 2);
                      ctx.stroke();
                    }
                  }

                  ctx.beginPath();
                  linea(11, 13); linea(13, 15); linea(12, 14); linea(14, 16);
                  linea(23, 25); linea(25, 27); linea(24, 26); linea(26, 28);
                  ctx.stroke();

                  [[13,6],[14,6],[25,6],[26,6],[15,10],[16,10],[19,8],[20,8]].forEach(([idx, r]) => {
                    if (lmEstable[idx]?.visibility > 0.3) {
                      ctx.beginPath();
                      ctx.arc(lmEstable[idx].x * W, lmEstable[idx].y * H, r, 0, Math.PI * 2);
                      ctx.fillStyle = '#FFF'; ctx.fill();
                    }
                  });
                } else {
                  historialPoses.current = null;
                }

                ctx.restore(); 

                // ── 3. PROPS EN MANOS (Orbes tenues) ──
                if (lmEstable && mostrarPropRef.current) {
                  const getRX = n => (1 - n.x) * W;
                  const getRY = n => n.y * H;
                  const hombroDer = lmEstable[11], hombroIzq = lmEstable[12];
                  const munecaIzq = lmEstable[15], munecaDer = lmEstable[16];

                  let anchoHombros = 100;
                  if (hombroDer && hombroIzq)
                    anchoHombros = Math.hypot(getRX(hombroIzq) - getRX(hombroDer), getRY(hombroIzq) - getRY(hombroDer));

                  const tamanoProp = anchoHombros * 0.25;

                  const dibujarOrbe = (x, y, radio, color) => {
                    const g = ctx.createRadialGradient(x, y, radio * 0.2, x, y, radio);
                    g.addColorStop(0, 'rgba(255,255,255,0.3)');
                    g.addColorStop(0.5, color + '66'); 
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.save();
                    ctx.globalAlpha = 0.5; // Efecto tenue 
                    ctx.shadowBlur = 15; ctx.shadowColor = color;
                    ctx.fillStyle = g;
                    ctx.beginPath(); ctx.arc(x, y, radio, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                  };

                  if (munecaDer) dibujarOrbe(getRX(munecaDer), getRY(munecaDer), tamanoProp, colorTemaRef.current);
                  if (munecaIzq) dibujarOrbe(getRX(munecaIzq), getRY(munecaIzq), tamanoProp, colorTemaRef.current);
                }

                // ── 4. MINIJUEGO: update + render ──
                if (faseRef.current === 'jugando' && minijuegoRef.current) {
                  const resultado = minijuegoRef.current.update(
                    lmEstable, W, H, lastDelta.current
                  );

                  if (resultado) {
                    if (resultado.puntos !== 0 && !resultado.esChoque) {
                      puntuacion.current = Math.max(0, puntuacion.current + resultado.puntos);
                      setPuntuacionUI(puntuacion.current);
                      mostrarFlash(
                        resultado.msg || (resultado.puntos > 0 ? `+${resultado.puntos} XP ✅` : `${resultado.puntos} XP ❌`),
                        resultado.acierto ? '#00FF41' : '#FF4444'
                      );
                    }
                    if (resultado.fallo && resultado.puntos < 0 && configRef.current.modo === 'vidas') {
                      const nv = vidasRef.current - 1;
                      setVidasSync(nv);
                      if (nv <= 0) terminarJuego();
                    }
                  }
                  minijuegoRef.current.render(ctx, W, H);
                }

                // ── 4b. REDIBUJO STICKMAN ENCIMA del minijuego ──
                if (lmEstable) {
                  ctx.save();
                  ctx.translate(W, 0);
                  ctx.scale(-1, 1);
                  const _colSk2 = colorStickRef.current || colorTemaRef.current;
                  ctx.shadowBlur  = 12;
                  ctx.shadowColor = _colSk2;
                  ctx.strokeStyle = _colSk2;
                  ctx.lineWidth   = 7;
                  ctx.lineCap     = 'round';
                  ctx.lineJoin    = 'round';

                  let anchoH2 = 100;
                  if (lmEstable[11] && lmEstable[12])
                    anchoH2 = Math.hypot((lmEstable[12].x - lmEstable[11].x) * W, (lmEstable[12].y - lmEstable[11].y) * H);
                  const rc2 = anchoH2 * 0.30;

                  const linea2 = (i, j) => {
                    if (lmEstable[i]?.visibility > 0.3 && lmEstable[j]?.visibility > 0.3) {
                      ctx.moveTo(lmEstable[i].x * W, lmEstable[i].y * H);
                      ctx.lineTo(lmEstable[j].x * W, lmEstable[j].y * H);
                    }
                  };

                  ctx.beginPath();
                  if (lmEstable[11] && lmEstable[12] && lmEstable[23] && lmEstable[24]) {
                    const hM2 = { x: (lmEstable[11].x + lmEstable[12].x) / 2 * W, y: (lmEstable[11].y + lmEstable[12].y) / 2 * H };
                    const cM2 = { x: (lmEstable[23].x + lmEstable[24].x) / 2 * W, y: (lmEstable[23].y + lmEstable[24].y) / 2 * H };
                    linea2(11, 12); linea2(23, 24);
                    ctx.moveTo(hM2.x, hM2.y); ctx.lineTo(cM2.x, cM2.y);
                    if (lmEstable[0]) {
                      ctx.moveTo(hM2.x, hM2.y);
                      ctx.lineTo(lmEstable[0].x * W, lmEstable[0].y * H + rc2);
                      ctx.stroke();
                      ctx.beginPath();
                      ctx.arc(lmEstable[0].x * W, lmEstable[0].y * H, Math.max(20, rc2), 0, Math.PI * 2);
                      ctx.stroke();
                    }
                  }
                  ctx.beginPath();
                  linea2(11, 13); linea2(13, 15); linea2(12, 14); linea2(14, 16);
                  linea2(23, 25); linea2(25, 27); linea2(24, 26); linea2(26, 28);
                  ctx.stroke();
                  ctx.restore();
                }

                // ── 4c. ACCESORIOS XP + ESTILO PERSONAJE (siempre encima) ──
                if (lmEstable) {
                  if (accesorioRef.current > 0) {
                    renderAccesorio(ctx, lmEstable, W, H, accesorioRef.current, lastDelta.current, alumno?.id || 'default');
                  }

                  const capas = resolverCapas(estiloRef.current);
                  if (capas.length > 0) {
                    const ex = n => (1 - n.x) * W;
                    const ey = n => n.y * H;
                    const nariz = lmEstable[0];
                    let anchoHc = 100;
                    if (lmEstable[11] && lmEstable[12])
                      anchoHc = Math.hypot(ex(lmEstable[12]) - ex(lmEstable[11]), ey(lmEstable[12]) - ey(lmEstable[11]));
                    const rc   = anchoHc * 0.30;
                    const nX   = nariz ? ex(nariz) : W / 2;
                    const nY   = nariz ? ey(nariz) : H * 0.25;
                    let ang = 0;
                    if (lmEstable[11] && lmEstable[12] && nariz) {
                      const hX = (ex(lmEstable[11]) + ex(lmEstable[12])) / 2;
                      const hY = (ey(lmEstable[11]) + ey(lmEstable[12])) / 2;
                      ang = Math.atan2(nY - hY, nX - hX) + Math.PI / 2;
                    }
                    capas.forEach(id => {
                      const colorEfectivo = colorAccRef.current[id] || colorStickRef.current || colorTemaRef.current;
                      renderEstiloPersonaje(ctx, lmEstable, W, H, id, colorEfectivo, frameCount.current);
                    });
                  }

                  // Crown PNG (chronos / Lentes Naranjas) controlada por el Toggle
                  if (mostrarPropRef.current && materia === 'chronos' && lmEstable[0] && crownImg.current.complete && crownImg.current.naturalWidth > 0) {
                    const getRX = n => (1 - n.x) * W;
                    const getRY = n => n.y * H;
                    const nariz2 = lmEstable[0];
                    const hDer = lmEstable[11], hIzq = lmEstable[12];
                    let angC = 0;
                    if (hDer && hIzq) {
                      const cHx = (getRX(hDer) + getRX(hIzq)) / 2;
                      const cHy = (getRY(hDer) + getRY(hIzq)) / 2;
                      angC = Math.atan2(getRY(nariz2) - cHy, getRX(nariz2) - cHx) + Math.PI / 2;
                    }
                    let anchoHc = 100;
                    if (hDer && hIzq) anchoHc = Math.hypot(getRX(hIzq) - getRX(hDer), getRY(hIzq) - getRY(hDer));
                    const esc = anchoHc * 0.4;
                    ctx.save();
                    ctx.translate(getRX(nariz2), getRY(nariz2));
                    ctx.rotate(angC);
                    ctx.drawImage(crownImg.current, -esc * 1.5, -esc * 1.5, esc * 3, esc * 3);
                    ctx.restore();
                  }
                }

                // ── 5. HUD XP ──
                ctx.save();
                ctx.font = 'bold 22px Orbitron, sans-serif';
                const _colHud = colorStickRef.current || colorTema;
                ctx.fillStyle  = _colHud;
                ctx.shadowBlur = 10; ctx.shadowColor = _colHud;
                ctx.textAlign  = 'left';
                ctx.fillText(`${(alumno?.nombre || 'JUGADOR').toUpperCase()} — XP: ${puntuacion.current}`, 20, 40);
                ctx.restore();
              }

              // ── MODO CALIBRANDO (sin juego activo) ──
              if (faseRef.current !== 'jugando' && faseRef.current !== 'preparacion') {
                if (results.landmarks?.length > 0) {
                  lmEstable = results.landmarks[0];
                  historialPoses.current = lmEstable;

                  ctx.save();
                  ctx.translate(W, 0);
                  ctx.scale(-1, 1);
                  const _colSk0 = colorStickRef.current || colorTemaRef.current;
                  ctx.shadowBlur = 12; ctx.shadowColor = _colSk0;
                  ctx.strokeStyle = _colSk0; ctx.lineWidth = 6;
                  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

                  let anchoH0 = 100;
                  if (lmEstable[11] && lmEstable[12])
                    anchoH0 = Math.hypot((lmEstable[12].x - lmEstable[11].x) * W, (lmEstable[12].y - lmEstable[11].y) * H);
                  const rc0 = anchoH0 * 0.30;
                  const linea0 = (i, j) => {
                    if (lmEstable[i]?.visibility > 0.3 && lmEstable[j]?.visibility > 0.3) {
                      ctx.moveTo(lmEstable[i].x * W, lmEstable[i].y * H);
                      ctx.lineTo(lmEstable[j].x * W, lmEstable[j].y * H);
                    }
                  };
                  ctx.beginPath();
                  if (lmEstable[11] && lmEstable[12] && lmEstable[23] && lmEstable[24]) {
                    const hM0 = { x: (lmEstable[11].x + lmEstable[12].x) / 2 * W, y: (lmEstable[11].y + lmEstable[12].y) / 2 * H };
                    const cM0 = { x: (lmEstable[23].x + lmEstable[24].x) / 2 * W, y: (lmEstable[23].y + lmEstable[24].y) / 2 * H };
                    linea0(11, 12); linea0(23, 24);
                    ctx.moveTo(hM0.x, hM0.y); ctx.lineTo(cM0.x, cM0.y);
                    if (lmEstable[0]) {
                      ctx.moveTo(hM0.x, hM0.y);
                      ctx.lineTo(lmEstable[0].x * W, lmEstable[0].y * H + rc0);
                      ctx.stroke();
                      ctx.beginPath();
                      ctx.arc(lmEstable[0].x * W, lmEstable[0].y * H, Math.max(20, rc0), 0, Math.PI * 2);
                      ctx.stroke(); 
                    }
                  }
                  ctx.beginPath();
                  linea0(11, 13); linea0(13, 15); linea0(12, 14); linea0(14, 16);
                  linea0(23, 25); linea0(25, 27); linea0(24, 26); linea0(26, 28);
                  ctx.stroke();
                  ctx.restore();

                  if (lmEstable) {
                    if (accesorioRef.current > 0)
                      renderAccesorio(ctx, lmEstable, W, H, accesorioRef.current, lastDelta.current, alumno?.id || 'default');

                    const capas0 = resolverCapas(estiloRef.current);
                    if (capas0.length > 0) {
                      capas0.forEach(id => {
                        const colorEfectivo0 = colorAccRef.current[id] || colorStickRef.current || colorTemaRef.current;
                        renderEstiloPersonaje(ctx, lmEstable, W, H, id, colorEfectivo0, frameCount.current);
                      });
                    }

                    if (mostrarPropRef.current && materia === 'chronos' && lmEstable[0] && crownImg.current.complete && crownImg.current.naturalWidth > 0) {
                      const getRXc = n => (1 - n.x) * W;
                      const getRYc = n => n.y * H;
                      const n0 = lmEstable[0], hD0 = lmEstable[11], hI0 = lmEstable[12];
                      let angC0 = 0;
                      if (hD0 && hI0) {
                        const cHx0 = (getRXc(hD0) + getRXc(hI0)) / 2;
                        const cHy0 = (getRYc(hD0) + getRYc(hI0)) / 2;
                        angC0 = Math.atan2(getRYc(n0) - cHy0, getRXc(n0) - cHx0) + Math.PI / 2;
                      }
                      let anchoHc0 = 100;
                      if (hD0 && hI0) anchoHc0 = Math.hypot(getRXc(hI0) - getRXc(hD0), getRYc(hI0) - getRYc(hD0));
                      const esc0 = anchoHc0 * 0.4;
                      ctx.save();
                      ctx.translate(getRXc(n0), getRYc(n0));
                      ctx.rotate(angC0);
                      ctx.drawImage(crownImg.current, -esc0 * 1.5, -esc0 * 1.5, esc0 * 3, esc0 * 3);
                      ctx.restore();
                    }
                  }
                } else {
                  historialPoses.current = null;
                }
              }

              ctx.restore();
            }
          }
          requestRef.current = requestAnimationFrame(renderLoop);
        };
        renderLoop(0);

      } catch (err) {
        console.error(err);
        setEstado('error');
      }
    };

    arrancar();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      iaIniciada.current = false;
    };
  }, []);

  // ─── HELPERS UI ───────────────────────────────────────────
  const renderVidas = () =>
    Array.from({ length: config.cantidad }, (_, i) => (
      <span key={i} style={{ fontSize: '1.2rem', margin: '0 3px', filter: i < vidas ? 'none' : 'grayscale(100%) opacity(30%)' }}>
        {i < vidas ? '❤️' : '🤍'}
      </span>
    ));

  // ─── MENÚ DE CONFIGURACIÓN ────────────────────────────────
  const MenuConfiguracion = () => {
    return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(12px)',
      zIndex: 1000, color: '#FFF', gap: '1rem', padding: '1rem 1.2rem',
      boxSizing: 'border-box', overflowY: 'auto',
    }}>
      <h2 style={{ fontFamily: 'Orbitron', fontSize: 'clamp(1rem, 3vw, 1.6rem)', color: colorTema, margin: 0, textShadow: `0 0 20px ${colorTema}` }}>
        PARÁMETROS DE SIMULACIÓN
      </h2>

      {/* ── PESTAÑAS ── */}
      <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { id: 'juego',      label: '🎮 JUEGO' },
          { id: 'config',     label: '⚙️ CONFIG' },
          { id: 'modo',       label: '🕹️ MODO' },
          { id: 'personaje',  label: '🧍 PERSONAJE' },
        ].map(tab => (
          <button key={tab.id}
            onClick={() => setPestanaMenu(tab.id)}
            style={{
              fontFamily: 'Orbitron', fontSize: 'clamp(0.55rem, 1.5vw, 0.7rem)', padding: '0.4rem 0.9rem',
              background: pestanaMenu === tab.id ? colorTema + '33' : 'transparent',
              color: pestanaMenu === tab.id ? '#FFF' : 'rgba(255,255,255,0.4)',
              border: `1px solid ${pestanaMenu === tab.id ? colorTema : 'transparent'}`,
              borderRadius: '8px', cursor: 'pointer',
              boxShadow: pestanaMenu === tab.id ? `0 0 10px ${colorTema}55` : 'none',
              transition: 'all 0.2s',
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* ── PESTAÑA: MINIJUEGO ── */}
      {pestanaMenu === 'juego' && (
        <div style={{ width: '100%', maxWidth: '900px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.6rem' }}>
            {MINIJUEGOS.map(j => (
              <button key={j.id}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                  padding: '0.7rem 0.4rem',
                  background: minijuegoId === j.id ? colorTema + '33' : 'rgba(0,0,0,0.5)',
                  border: `1px solid ${minijuegoId === j.id ? colorTema : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: '12px', cursor: 'pointer', color: '#FFF',
                  boxShadow: minijuegoId === j.id ? `0 0 15px ${colorTema}66` : 'none',
                  transition: 'all 0.2s',
                }}
                onClick={() => cambiarMinijuego(j.id)}>
                <span style={{ fontSize: '1.6rem' }}>{j.icono}</span>
                <span style={{ fontWeight: 'bold', fontFamily: 'Orbitron', fontSize: '0.65rem' }}>{j.nombre}</span>
                <span style={{ fontSize: '0.6rem', opacity: 0.5, fontFamily: 'Rajdhani', textAlign: 'center' }}>{j.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── PESTAÑA: CONFIG DEL JUEGO ── */}
      {pestanaMenu === 'config' && (
        <div style={{ width: '100%', maxWidth: '550px' }}>
          <PanelConfigJuego
            juegoId={minijuegoId}
            config={juegoConfig}
            onChange={actualizarJuegoConfig}
            colorTema={colorTema}
          />

          <div style={{ marginTop: '1.2rem', padding: '1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <div style={{ fontFamily: 'Orbitron', fontSize: '0.78rem', color: '#FFF', marginBottom: '0.25rem' }}>
                  🎯 MOSTRAR RESPUESTA CORRECTA
                </div>
                <div style={{ fontFamily: 'Rajdhani', fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
                  Colorea la opción correcta en verde desde el inicio de la ronda
                </div>
              </div>
              <button
                onClick={() => setMostrarCorrecta(v => !v)}
                style={{
                  minWidth: '56px', height: '28px', borderRadius: '14px',
                  background: mostrarCorrecta ? '#00FF41' : 'rgba(255,255,255,0.15)',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute', top: '3px',
                  left: mostrarCorrecta ? '31px' : '3px',
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: '#FFF', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PESTAÑA: MODO DE PARTIDA ── */}
      {pestanaMenu === 'modo' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%', maxWidth: '600px' }}>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn-cyber"
              style={{ background: config.modo === 'tiempo' ? colorTema : 'rgba(0,0,0,0.5)', color: config.modo === 'tiempo' ? '#000' : colorTema, fontSize: 'clamp(0.7rem,1.8vw,0.9rem)' }}
              onClick={() => actualizarConfig({ modo: 'tiempo', cantidad: 30 })}>⏱️ CONTRARRELOJ</button>
            <button className="btn-cyber"
              style={{ background: config.modo === 'vidas' ? colorTema : 'rgba(0,0,0,0.5)', color: config.modo === 'vidas' ? '#000' : colorTema, fontSize: 'clamp(0.7rem,1.8vw,0.9rem)' }}
              onClick={() => actualizarConfig({ modo: 'vidas', cantidad: 3 })}>❤️ SUPERVIVENCIA</button>
            <button className="btn-cyber"
              style={{ background: 'rgba(0,0,0,0.5)', color: '#FF00FF', borderColor: '#FF00FF', boxShadow: '0 0 15px rgba(255,0,255,0.4)', fontSize: 'clamp(0.7rem,1.8vw,0.9rem)' }}
              onClick={() => onVersus(materia)}>⚔️ MODO 1 VS 1</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '1.8rem', fontFamily: 'Rajdhani', fontWeight: 'bold' }}>
            <button className="btn-cyber" style={{ fontSize: '1.5rem', padding: '0.4rem 1rem' }}
              onClick={() => actualizarConfig({ ...config, cantidad: Math.max(1, config.cantidad - (config.modo === 'tiempo' ? 10 : 1)) })}>−</button>
            <span style={{ minWidth: '120px', textAlign: 'center', textShadow: `0 0 15px ${colorTema}` }}>
              {config.cantidad} {config.modo === 'tiempo' ? 'Segs' : 'Vidas'}
            </span>
            <button className="btn-cyber" style={{ fontSize: '1.5rem', padding: '0.4rem 1rem' }}
              onClick={() => actualizarConfig({ ...config, cantidad: config.cantidad + (config.modo === 'tiempo' ? 10 : 1) })}>+</button>
          </div>
        </div>
      )}

      {/* ── PESTAÑA: PERSONAJE ── */}
      {pestanaMenu === 'personaje' && (
        <div style={{ width: '100%', maxWidth: '700px' }}>

          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* ── Columna izquierda: grid de estilos ── */}
            <div style={{ flex: '1 1 55%', minWidth: '200px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <p style={{ fontFamily: 'Orbitron', fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)', margin: 0, textTransform: 'uppercase', letterSpacing: '2px' }}>Estilo</p>
                {estiloPersonaje.length > 0 && (
                  <button onClick={() => { setEstilo([]); setColorAcc({}); }}
                    style={{ fontFamily: 'Orbitron', fontSize: '0.55rem', background: 'rgba(255,50,50,0.12)',
                      border: '1px solid rgba(255,50,50,0.3)', borderRadius: '6px', color: '#ff6b6b',
                      padding: '2px 8px', cursor: 'pointer' }}>✕ limpiar</button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.3rem' }}>
                {ESTILOS_PERSONAJE.filter(e => e.id !== 0).map(e => {
                  const activo = estiloPersonaje.includes(e.id);
                  return (
                    <button key={e.id}
                      onClick={() => toggleEstilo(e.id)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                        padding: '0.5rem 0.3rem',
                        background: activo ? colorTema + '28' : 'rgba(0,0,0,0.45)',
                        border: `1px solid ${activo ? colorTema : 'rgba(255,255,255,0.12)'}`,
                        borderRadius: '10px', cursor: 'pointer', color: '#FFF',
                        boxShadow: activo ? `0 0 12px ${colorTema}55` : 'none',
                        transition: 'all 0.15s',
                      }}>
                      <span style={{ fontSize: '1.3rem' }}>{e.icono}</span>
                      <span style={{ fontFamily: 'Orbitron', fontSize: '0.55rem', fontWeight: 700 }}>{e.nombre}</span>
                      <span style={{ fontSize: '0.52rem', opacity: 0.5 }}>{e.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Columna derecha: colores individuales + stickman + lentes ── */}
            <div style={{ flex: '0 1 38%', minWidth: '140px', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>

              {/* LENTES / CROWN TOGGLE */}
              <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '12px', padding: '0.7rem', border: `1px solid ${colorTema}22` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontFamily: 'Orbitron', fontSize: '0.6rem', color: '#FFF', margin: 0, textTransform: 'uppercase' }}>😎 Lentes / Crown</p>
                  <button onClick={togglePropPNG} style={{
                    background: mostrarPropPNG ? '#00FF41' : 'rgba(255,255,255,0.2)',
                    border: 'none', borderRadius: '12px', width: '36px', height: '18px', cursor: 'pointer', position: 'relative', transition: '0.2s'
                  }}>
                    <div style={{
                      background: '#FFF', borderRadius: '50%', width: '14px', height: '14px',
                      position: 'absolute', top: '2px', left: mostrarPropPNG ? '20px' : '2px', transition: '0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                    }}/>
                  </button>
                </div>
              </div>

              {/* COLORES INDIVIDUALES POR ACCESORIO */}
              {estiloPersonaje.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {estiloPersonaje.map(idAcc => {
                    const accInfo = ESTILOS_PERSONAJE.find(e => e.id === idAcc);
                    if (!accInfo) return null;
                    return (
                      <div key={idAcc} style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '12px', padding: '0.7rem', border: `1px solid ${colorTema}22` }}>
                        <p style={{ fontFamily: 'Orbitron', fontSize: '0.55rem', color: colorTema, margin: '0 0 0.4rem', textTransform: 'uppercase' }}>
                          🎨 Color {accInfo.nombre}
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'flex-start' }}>
                          {PALETA_ACCESORIOS_BRILLANTES.map(col => {
                            const isSelected = (colorAccUI[idAcc] || null) === col.hex;
                            return (
                              <button key={col.id || col.hex} onClick={() => setColorAcc(idAcc, col.hex)} title={col.label} style={{
                                width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer', background: col.hex || colorTema,
                                border: isSelected ? `2px solid #fff` : `1px solid rgba(255,255,255,0.2)`,
                                boxShadow: isSelected ? `0 0 8px ${col.hex || colorTema}` : 'none',
                                transform: isSelected ? 'scale(1.15)' : 'scale(1)', transition: 'all 0.15s', flexShrink: 0
                              }} />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* COLOR STICKMAN */}
              <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '12px', padding: '0.7rem', border: `1px solid ${colorTema}22` }}>
                <p style={{ fontFamily: 'Orbitron', fontSize: '0.6rem', color: 'rgba(255,255,255,0.55)', margin: '0 0 0.5rem', textTransform: 'uppercase' }}>🎨 Stickman</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {COLORES_STICKMAN.map(col => {
                    const isActive = col.hex === null ? !colorStickman : colorStickman === col.hex;
                    return (
                      <button key={col.id}
                        onClick={() => setColorStick(col.hex)}
                        title={col.label}
                        style={{
                          width: '26px', height: '26px', borderRadius: '50%', cursor: 'pointer',
                          background: col.hex || colorTema,
                          border: isActive ? '3px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                          boxShadow: isActive ? `0 0 8px ${col.hex || colorTema}` : 'none',
                          transform: isActive ? 'scale(1.2)' : 'scale(1)',
                          transition: 'all 0.15s',
                          flexShrink: 0,
                        }} />
                    );
                  })}
                </div>
              </div>

              {/* PREVIEW MINI */}
              <div style={{
                background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '0.5rem',
                border: `1px solid ${colorTema}33`, textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>
                  {estiloPersonaje.length > 0
                    ? estiloPersonaje.map(id => ESTILOS_PERSONAJE.find(e => e.id === id)?.icono || '').join('')
                    : '🧍'}
                </div>
                <div style={{ fontFamily: 'Orbitron', fontSize: '0.55rem', color: colorTema, fontWeight: 700 }}>
                  {estiloPersonaje.length > 0
                    ? estiloPersonaje.map(id => ESTILOS_PERSONAJE.find(e => e.id === id)?.nombre || '').filter(Boolean).join(' + ')
                    : 'Base'}
                </div>
              </div>

            </div>{/* fin columna derecha */}
          </div>{/* fin layout 2 col */}

        </div>
      )}

      {/* ── PESTAÑA: PREGUNTAS DEL DOCENTE ── */}
      {pestanaMenu === 'preguntas' && (() => {
        const inputStyle = {
          background: 'rgba(0,0,0,0.6)', border: `1px solid rgba(255,255,255,0.2)`,
          borderRadius: '8px', color: '#FFF', padding: '0.5rem 0.8rem',
          fontFamily: 'Rajdhani', fontSize: '1rem', outline: 'none', width: '100%', boxSizing: 'border-box',
        };
        const btnStyle = (color='#00FFFF') => ({
          fontFamily: 'Orbitron', fontSize: '0.7rem', padding: '0.4rem 0.9rem',
          background: color + '22', border: `1px solid ${color}`, borderRadius: '8px',
          color, cursor: 'pointer', transition: 'all 0.15s',
        });
        if (!pinExiste) return (
          <div style={{ width:'100%', maxWidth:'420px', display:'flex', flexDirection:'column', gap:'0.8rem', alignItems:'center' }}>
            <div style={{ textAlign:'center', color:'rgba(255,255,255,0.6)', fontFamily:'Rajdhani', fontSize:'0.9rem' }}>
              Primera vez — crea un PIN de 4+ dígitos para proteger tus preguntas
            </div>
            <input style={inputStyle} type="password" placeholder="Nuevo PIN" maxLength={8}
              value={pinCrearA} onChange={e => setPinCrearA(e.target.value.replace(/\D/,'').slice(0,8))} />
            <input style={inputStyle} type="password" placeholder="Confirmar PIN" maxLength={8}
              value={pinCrearB} onChange={e => setPinCrearB(e.target.value.replace(/\D/,'').slice(0,8))} />
            {pinError && <div style={{ color: pinError.startsWith('✅') ? '#00FF41' : '#FF4444', fontFamily:'Rajdhani', fontSize:'0.85rem' }}>{pinError}</div>}
            <button style={btnStyle(colorTema)} onClick={crearPin}>🔐 CREAR PIN</button>
          </div>
        );
        if (!pinVerificado) return (
          <div style={{ width:'100%', maxWidth:'360px', display:'flex', flexDirection:'column', gap:'0.8rem', alignItems:'center' }}>
            <div style={{ color:'rgba(255,255,255,0.5)', fontFamily:'Rajdhani', fontSize:'0.9rem' }}>
              🔒 Área del docente — ingresa tu PIN
            </div>
            <input style={{ ...inputStyle, textAlign:'center', fontSize:'1.4rem', letterSpacing:'0.4em' }}
              type="password" placeholder="••••" maxLength={8}
              value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/,'').slice(0,8))}
              onKeyDown={e => e.key === 'Enter' && verificarPin()} />
            {pinError && <div style={{ color:'#FF4444', fontFamily:'Rajdhani', fontSize:'0.85rem' }}>{pinError}</div>}
            <button style={btnStyle(colorTema)} onClick={verificarPin}>🔓 ENTRAR</button>
          </div>
        );
        const pregsFiltradas = pregDocente.filter(p => p.materia?.includes(materia));
        const pregsOtras     = pregDocente.filter(p => !p.materia?.includes(materia));
        return (
          <div style={{ width:'100%', maxWidth:'780px', display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div style={{ display:'flex', gap:'8px', justifyContent:'center', flexWrap:'wrap' }}>
              {[
                { id:'banco', label:'📚 Solo banco', desc:'Preguntas originales' },
                { id:'mezcla', label:'🔀 Mezcla', desc:'Banco + tus preguntas' },
                { id:'solo_docente', label:'✏️ Solo docente', desc:'Solo tus preguntas' },
              ].map(m => (
                <button key={m.id} onClick={() => cambiarModo(m.id)} style={{
                  ...btnStyle(modoPregunta === m.id ? colorTema : 'rgba(255,255,255,0.3)'),
                  background: modoPregunta === m.id ? colorTema + '33' : 'rgba(0,0,0,0.4)',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', padding:'0.5rem 1.2rem',
                  fontFamily:'Orbitron', fontSize:'0.68rem',
                  boxShadow: modoPregunta === m.id ? `0 0 12px ${colorTema}55` : 'none',
                }}>
                  <span>{m.label}</span>
                  <span style={{ fontSize:'0.58rem', opacity:0.6, fontFamily:'Rajdhani' }}>{m.desc}</span>
                </button>
              ))}
            </div>
            {modoForm ? (
              <div style={{ background:'rgba(0,0,0,0.6)', border:`2px solid ${colorTema}55`, borderRadius:'14px', padding:'1.2rem', display:'flex', flexDirection:'column', gap:'0.8rem' }}>
                <div style={{ fontFamily:'Orbitron', fontSize:'0.85rem', color:colorTema }}>{modoForm === 'editar' ? '✏️ EDITAR PREGUNTA' : '➕ NUEVA PREGUNTA'}</div>
                <div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:'0.75rem', color:'rgba(255,255,255,0.5)', marginBottom:'4px' }}>PREGUNTA</div>
                  <textarea rows={2} style={{ ...inputStyle, resize:'vertical' }} placeholder="Escribe o pega la pregunta aquí..."
                    value={formPreg.pregunta} onChange={e => setFormPreg(f => ({ ...f, pregunta: e.target.value }))} />
                </div>
                <div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:'0.75rem', color:'#00FF41', marginBottom:'4px' }}>✅ RESPUESTA CORRECTA</div>
                  <input style={{ ...inputStyle, borderColor:'#00FF4188', background:'rgba(0,255,65,0.06)' }}
                    placeholder="Respuesta correcta..." value={formPreg.correcta}
                    onChange={e => setFormPreg(f => ({ ...f, correcta: e.target.value }))} />
                </div>
                <div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:'0.75rem', color:'#FF4444', marginBottom:'6px' }}>❌ OPCIONES INCORRECTAS ({formPreg.opciones.length}) — mínimo 2</div>
                  {formPreg.opciones.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'8px' }}>
                      {formPreg.opciones.map((opc, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:'5px', background:'rgba(255,68,68,0.15)', border:'1px solid #FF444466', borderRadius:'20px', padding:'3px 10px 3px 12px', fontFamily:'Rajdhani', fontSize:'0.85rem', color:'#FFF' }}>
                          <span>{opc}</span>
                          <button onClick={() => setFormPreg(f => ({ ...f, opciones: f.opciones.filter((_,j) => j !== i) }))}
                            style={{ background:'none', border:'none', color:'#FF4444', cursor:'pointer', fontSize:'0.9rem', lineHeight:1, padding:0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:'6px' }}>
                    <input style={{ ...inputStyle, borderColor:'#FF444466', flex:1 }} placeholder="Opción incorrecta (Enter para añadir)"
                      value={formPreg.inputOpc} onChange={e => setFormPreg(f => ({ ...f, inputOpc: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && formPreg.inputOpc.trim()) { e.preventDefault(); setFormPreg(f => ({ ...f, opciones: [...f.opciones, f.inputOpc.trim()], inputOpc:'' })); } }} />
                    <button onClick={() => { if (formPreg.inputOpc.trim()) setFormPreg(f => ({ ...f, opciones: [...f.opciones, f.inputOpc.trim()], inputOpc:'' })); }}
                      style={{ ...btnStyle('#FF4444'), padding:'0 1rem', fontSize:'1.2rem' }}>+</button>
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:'0.75rem', color:'rgba(255,255,255,0.5)', marginBottom:'6px' }}>MATERIAS</div>
                  <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                    {Object.entries(MATERIAS_LABEL).map(([id, label]) => {
                      const sel = formPreg.materia.includes(id);
                      return <button key={id} onClick={() => setFormPreg(f => ({ ...f, materia: sel ? f.materia.filter(m => m !== id) : [...f.materia, id] }))}
                        style={{ ...btnStyle(sel ? colorTema : 'rgba(255,255,255,0.2)'), fontSize:'0.7rem', padding:'0.3rem 0.8rem', background: sel ? colorTema + '33' : 'rgba(255,255,255,0.05)' }}>{label}</button>;
                    })}
                  </div>
                </div>
                <div style={{ display:'flex', gap:'0.6rem', justifyContent:'flex-end', borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:'0.8rem' }}>
                  <button style={btnStyle('#666')} onClick={() => { setModoForm(null); _formReset(); }}>CANCELAR</button>
                  <button disabled={!formPreg.pregunta.trim() || !formPreg.correcta.trim() || formPreg.opciones.length < 2}
                    style={{ ...btnStyle(colorTema), opacity: (!formPreg.pregunta.trim() || !formPreg.correcta.trim() || formPreg.opciones.length < 2) ? 0.4 : 1 }}
                    onClick={guardarPregunta}>💾 GUARDAR</button>
                </div>
              </div>
            ) : (
              <button style={{ ...btnStyle(colorTema), alignSelf:'flex-start', padding:'0.55rem 1.4rem', fontSize:'0.8rem' }}
                onClick={() => setModoForm('crear')}>➕ NUEVA PREGUNTA</button>
            )}
            {cargandoPreg ? (
              <div style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani', textAlign:'center', padding:'1rem' }}>Cargando...</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'6px', maxHeight:'260px', overflowY:'auto' }}>
                {pregsFiltradas.length === 0 ? (
                  <div style={{ color:'rgba(255,255,255,0.3)', fontFamily:'Rajdhani', fontSize:'0.85rem', textAlign:'center', padding:'1rem' }}>
                    No hay preguntas para {MATERIAS_LABEL[materia] || materia}
                  </div>
                ) : pregsFiltradas.map(p => (
                  <div key={p.id} style={{ display:'flex', alignItems:'center', gap:'8px', background: p.activa ? 'rgba(0,255,65,0.05)' : 'rgba(255,255,255,0.04)', border:`1px solid ${p.activa ? '#00FF4133' : 'rgba(255,255,255,0.1)'}`, borderRadius:'8px', padding:'0.5rem 0.8rem', opacity: p.activa ? 1 : 0.5 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontFamily:'Rajdhani', fontSize:'0.85rem', color:'#FFF', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.pregunta}</div>
                      <div style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani' }}>✅ {p.correcta} | ❌ {p.falsas?.join(' · ')}</div>
                    </div>
                    <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
                      <button style={{ ...btnStyle(p.activa ? '#00FF41' : '#888'), fontSize:'0.65rem', padding:'0.25rem 0.5rem' }} onClick={() => toggleActiva(p)}>{p.activa ? '✓ ON' : '○ OFF'}</button>
                      <button style={{ ...btnStyle('#FFD700'), fontSize:'0.65rem', padding:'0.25rem 0.5rem' }} onClick={() => editarPregunta(p)}>✏️</button>
                      <button style={{ ...btnStyle('#FF4444'), fontSize:'0.65rem', padding:'0.25rem 0.5rem' }} onClick={() => eliminarPregunta(p.id)}>🗑</button>
                    </div>
                  </div>
                ))}
                {pregsOtras.length > 0 && (
                  <div style={{ marginTop:'8px', borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:'8px', color:'rgba(255,255,255,0.35)', fontFamily:'Rajdhani', fontSize:'0.75rem', textAlign:'center' }}>
                    + {pregsOtras.length} pregunta(s) asignadas a otras materias
                  </div>
                )}
              </div>
            )}
            <button style={{ ...btnStyle('#FF4444'), alignSelf:'flex-end', fontSize:'0.62rem', padding:'0.3rem 0.7rem' }}
              onClick={() => { setPinVerificado(false); setPinInput(''); }}>🔒 Cerrar sesión</button>
          </div>
        );
      })()}

      {/* ── RESUMEN + BOTÓN INICIAR ── */}
      <div style={{
        display: 'flex', gap: '0.8rem', flexWrap: 'wrap', justifyContent: 'center',
        fontSize: '0.75rem', fontFamily: 'Rajdhani', color: 'rgba(255,255,255,0.5)',
        borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.6rem', width: '100%', maxWidth: '700px',
      }}>
        <span>🎮 {MINIJUEGOS.find(j => j.id === minijuegoId)?.nombre}</span>
        <span>•</span>
        <span>⚡ {juegoConfig.dificultad?.toUpperCase()}</span>
        <span>•</span>
        <span>🚀 {juegoConfig.velocidad?.toFixed(1)}× velocidad</span>
        <span>•</span>
        <span>🎯 {Math.round((juegoConfig.tamanoObjetivos ?? 1) * 100)}% tamaño</span>
        <span>•</span>
        <span>{config.modo === 'tiempo' ? `⏱️ ${config.cantidad}s` : `❤️ ${config.cantidad} vidas`}</span>
      </div>

      <button className="btn-cyber"
        style={{ fontSize: 'clamp(1rem, 2.5vw, 1.4rem)', padding: '0.8rem 3rem', boxShadow: `0 0 25px ${colorTema}`, '--tema-color': colorTema }}
        onClick={iniciarSimulacion}>
        🚀 INICIAR RETO
      </button>
    </div>
  );};

  // ─── JSX PRINCIPAL ────────────────────────────────────────
  return (
    <div className="aura-container" ref={contenedorRef} style={{ background: '#000' }}>

      {/* ── BARRA MINI — máximo espacio para el juego ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '3px 8px', height: '36px', minHeight: '36px',
        background: 'rgba(0,0,0,0.75)', borderBottom: `1px solid ${colorTema}44`,
        flexShrink: 0, overflow: 'hidden',
      }}>
        <span style={{ fontFamily:'Orbitron', fontSize:'0.65rem', fontWeight:'bold',
          color: colorTema, whiteSpace:'nowrap', letterSpacing:'1px', marginRight:'4px' }}>
          NEXUS
        </span>

        {fase !== 'configuracion' && (
          <div style={{ background:'rgba(0,0,0,0.6)', border:`1px solid ${colorTema}66`,
            borderRadius:'10px', padding:'1px 8px', fontSize:'0.72rem',
            fontFamily:'Orbitron', color:'#fff', whiteSpace:'nowrap' }}>
            {config.modo === 'tiempo'
              ? `⏱ ${tiempoRestante.toString().padStart(2,'0')}s`
              : renderVidas()
            }
          </div>
        )}

        {alumno && tierAlumno > 0 && (
          <span style={{ fontSize:'0.68rem', fontFamily:'Orbitron',
            color: colorTema, whiteSpace:'nowrap' }}>
            {TIER_INFO[tierAlumno]?.icono}
          </span>
        )}

        <div style={{ flex:1 }} />

        <button onClick={alternarPantallaCompleta} title={pantallaCompleta?'Minimizar':'Pantalla completa'}
          style={{ background:'rgba(0,255,255,0.12)', border:'1px solid #00FFFF55',
            borderRadius:'6px', color:'#00FFFF', fontSize:'0.7rem', padding:'2px 7px',
            cursor:'pointer', fontFamily:'Orbitron', whiteSpace:'nowrap' }}>
          {pantallaCompleta ? '⊡' : '⛶'}
        </button>

        {alumno && (
          <button onClick={() => setMostrarQR(true)} title="QR Avatar"
            style={{ background:'rgba(167,139,250,0.15)', border:'1px solid #A78BFA55',
              borderRadius:'6px', color:'#A78BFA', fontSize:'0.85rem', padding:'2px 6px',
              cursor:'pointer' }}>
            📱
          </button>
        )}

        {alumno && (
          <button onClick={() => setMostrarEditorAcc(true)} title="Accesorios"
            style={{ background:'rgba(52,211,153,0.15)', border:'1px solid #34D39955',
              borderRadius:'6px', color:'#34D399', fontSize:'0.85rem', padding:'2px 6px',
              cursor:'pointer' }}>
            🎽
          </button>
        )}

        {fase === 'jugando' && (<>
          <button onClick={() => setMostrarSelectorJuego(true)} title="Cambiar minijuego"
            style={{ background:'rgba(0,255,200,0.15)', border:'1px solid #00FFC855',
              borderRadius:'6px', color:'#00FFC8', fontSize:'0.75rem', padding:'2px 7px',
              cursor:'pointer', fontFamily:'Orbitron' }}>
            🎮
          </button>
          <button onClick={() => { if(window.confirm('¿Terminar? Se guardará el XP.')) terminarJuego(); }}
            title="Terminar partida"
            style={{ background:'rgba(255,102,0,0.18)', border:'1px solid #FF660055',
              borderRadius:'6px', color:'#FF6600', fontSize:'0.7rem', padding:'2px 7px',
              cursor:'pointer', fontFamily:'Orbitron' }}>
            ⏹
          </button>
        </>)}

        {onCambiarAlumno && (
          <button onClick={onCambiarAlumno} title="Cambiar alumno"
            style={{ background:'rgba(255,200,0,0.15)', border:'1px solid #FFC80055',
              borderRadius:'6px', color:'#FFC800', fontSize:'0.75rem', padding:'2px 7px',
              cursor:'pointer', fontFamily:'Orbitron' }}>
            👤
          </button>
        )}
        <button onClick={onSalir} title="Salir al lobby"
          style={{ background:'rgba(255,8,68,0.18)', border:'1px solid #FF084455',
            borderRadius:'6px', color:'#FF0844', fontSize:'0.7rem', padding:'2px 7px',
            cursor:'pointer', fontFamily:'Orbitron' }}>
          ✕
        </button>

        <span style={{ fontSize:'0.62rem', fontFamily:'Orbitron',
          color: estado==='activo' ? '#00FF41' : '#888', whiteSpace:'nowrap', marginLeft:'2px' }}>
          {estado==='activo' ? '⚡' : '⏳'}
        </span>
      </header>

      <main className="aura-main">
        <div className="video-panel" style={{ height: pantallaCompleta ? '100vh' : 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          <div className="video-container" style={{ '--tema-color': colorTema, width: '100%', maxWidth: pantallaCompleta ? 'none' : '1280px', position: 'relative' }}>
            <video ref={videoRef} style={{ display: 'none' }} playsInline />

            {estado === 'error' && (
              <div style={{
                position:'absolute', bottom:'2rem', left:'50%', transform:'translateX(-50%)',
                zIndex:100, display:'flex', flexDirection:'column', alignItems:'center', gap:'12px'
              }}>
                <button className="btn-cyber"
                  style={{ '--tema-color':'#00FF41', fontSize:'0.9rem', padding:'0.6rem 1.6rem' }}
                  onClick={() => {
                    iaIniciada.current = false;
                    setEstado('calibrando');
                    setTimeout(() => {
                      if (streamRef.current) {
                        streamRef.current.getTracks().forEach(t => t.stop());
                        streamRef.current = null;
                      }
                      if (videoRef.current) videoRef.current.srcObject = null;
                      iaIniciada.current = false;
                      setEstado(prev => { iaIniciada.current = false; return 'calibrando'; });
                    }, 100);
                  }}>
                  🔄 REINTENTAR CÁMARA
                </button>
                <span style={{ color:'#aaa', fontSize:'0.72rem', fontFamily:'sans-serif' }}>
                  Si no funciona: recarga la página (F5)
                </span>
              </div>
            )}

            <canvas ref={canvasRef} className="video-canvas" width="1280" height="720"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

            {mensajeFlash && (
              <div style={{
                position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
                fontFamily: 'Orbitron', fontSize: '2.5rem', fontWeight: 'bold',
                color: mensajeFlash.color, textShadow: `0 0 30px ${mensajeFlash.color}`,
                pointerEvents: 'none', animation: 'fadeIn 0.2s ease',
              }}>
                {mensajeFlash.texto}
              </div>
            )}

            {fase === 'configuracion' && estado === 'activo' && <MenuConfiguracion />}

            {fase === 'preparacion' && estado === 'activo' && (
              <div key={conteo} className="countdown-overlay">{conteo}</div>
            )}

            {fase === 'game_over' && (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', zIndex: 1000, color: '#FFF' }}>
                <h2 style={{ fontSize: '3.5rem', fontFamily: 'Orbitron', color: colorTema, textShadow: `0 0 20px ${colorTema}`, margin: 0 }}>
                  {config.modo === 'tiempo' ? '¡TIEMPO TERMINADO!' : '¡MISIÓN FALLIDA!'}
                </h2>
                <p style={{ fontSize: '1.8rem', fontFamily: 'Rajdhani', margin: '20px 0' }}>
                  XP RECOLECTADA: <span style={{ fontWeight: 'bold', fontSize: '2.8rem' }}>{puntuacion.current}</span>
                </p>
                <div style={{ fontSize: '0.9rem', fontFamily: 'Rajdhani', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>
                  {MINIJUEGOS.find(j => j.id === minijuegoIdRef.current)?.icono} {MINIJUEGOS.find(j => j.id === minijuegoIdRef.current)?.nombre}
                  {' · '}{juegoConfigRef.current.dificultad?.toUpperCase()}
                </div>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="btn-cyber"
                    style={{ '--tema-color': colorTema, fontSize: '1.1rem', padding: '0.9rem 2rem' }}
                    onClick={() => { setFase('configuracion'); faseRef.current = 'configuracion'; setPuntuacionUI(0); puntuacion.current = 0; }}>
                    🔄 VOLVER AL MENÚ
                  </button>
                  {onCambiarAlumno && (
                    <button className="btn-cyber"
                      style={{ '--tema-color': '#FFC800', fontSize: '1.1rem', padding: '0.9rem 2rem' }}
                      onClick={onCambiarAlumno}>
                      👤 CAMBIAR ALUMNO
                    </button>
                  )}
                  <button className="btn-cyber"
                    style={{ '--tema-color': '#FF0844', fontSize: '1.1rem', padding: '0.9rem 2rem' }}
                    onClick={onSalir}>
                    🚀 SALIR AL LOBBY
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Selector de minijuego en partida ── */}
      {mostrarSelectorJuego && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.88)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:9999, backdropFilter:'blur(8px)'
        }}>
          <div style={{
            background:'linear-gradient(135deg,#0a0a1a,#1a1a2e)',
            border:`1px solid ${colorTema}66`, borderRadius:'16px',
            padding:'1.5rem', minWidth:'360px', maxWidth:'520px',
            fontFamily:'Orbitron', color:'#fff', boxShadow:`0 0 40px ${colorTema}33`
          }}>
            <h2 style={{ margin:'0 0 0.4rem', color: colorTema, fontSize:'1rem', letterSpacing:'2px' }}>
              🎮 CAMBIAR MINIJUEGO
            </h2>
            <p style={{ margin:'0 0 1rem', fontSize:'0.7rem', color:'#aaa', fontFamily:'sans-serif' }}>
              El alumno puede seguir acumulando XP con otro juego sin salir al lobby.
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'1.2rem' }}>
              {MINIJUEGOS.map(j => {
                const sel = j.id === minijuegoId;
                return (
                  <button key={j.id}
                    onClick={() => { cambiarMinijuego(j.id); setMostrarSelectorJuego(false); }}
                    style={{
                      background: sel ? `${colorTema}22` : 'rgba(255,255,255,0.05)',
                      border: sel ? `2px solid ${colorTema}` : '1px solid rgba(255,255,255,0.12)',
                      borderRadius:'10px', padding:'0.6rem 0.5rem',
                      color:'#fff', fontFamily:'Orbitron', fontSize:'0.7rem',
                      cursor:'pointer', transition:'all 0.2s',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:'3px'
                    }}>
                    <span style={{ fontSize:'1.3rem' }}>{j.icono}</span>
                    <span>{j.nombre}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button className="btn-cyber"
                style={{ '--tema-color':'#888', fontSize:'0.75rem', padding:'0.4rem 1rem' }}
                onClick={() => setMostrarSelectorJuego(false)}>
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Editor de accesorios manual ── */}
      {mostrarEditorAcc && alumno && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.85)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:9999, backdropFilter:'blur(8px)'
        }}>
          <div style={{
            background:'linear-gradient(135deg,#0a0a1a,#1a1a2e)',
            border:'1px solid #34D39966', borderRadius:'16px',
            padding:'2rem', minWidth:'340px', maxWidth:'480px',
            fontFamily:'Orbitron', color:'#fff', boxShadow:'0 0 40px #34D39944'
          }}>
            <h2 style={{ margin:'0 0 0.5rem', color:'#34D399', fontSize:'1.1rem', letterSpacing:'2px' }}>
              🎽 EDITAR ACCESORIO
            </h2>
            <p style={{ margin:'0 0 1.5rem', fontSize:'0.72rem', color:'#aaa', fontFamily:'sans-serif' }}>
              Nivel desbloqueado: <strong style={{color:'#FFE000'}}>Tier {tierAlumno} — {TIER_INFO[tierAlumno]?.nombre}</strong>
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'1.5rem' }}>
              {TIER_INFO.map((t, i) => {
                const bloqueado = i > tierAlumno;
                const seleccionado = i === accesorioId;
                return (
                  <button key={i}
                    disabled={bloqueado}
                    onClick={() => {
                      if (!bloqueado) {
                        setAccesorioId(i);
                        accesorioRef.current = i;
                      }
                    }}
                    style={{
                      background: seleccionado ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.05)',
                      border: seleccionado ? '2px solid #34D399' : '1px solid rgba(255,255,255,0.15)',
                      borderRadius:'10px', padding:'0.75rem 0.5rem',
                      color: bloqueado ? '#444' : '#fff',
                      fontFamily:'Orbitron', fontSize:'0.72rem',
                      cursor: bloqueado ? 'not-allowed' : 'pointer',
                      transition:'all 0.2s',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:'4px'
                    }}>
                    <span style={{ fontSize:'1.4rem' }}>{t.icono}</span>
                    <span>{t.nombre}</span>
                    <span style={{ fontSize:'0.62rem', color: bloqueado ? '#333' : '#aaa' }}>
                      {bloqueado ? `🔒 ${t.desc}` : t.desc}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px' }}>
              <button className="btn-cyber"
                style={{ '--tema-color':'#34D399', fontSize:'0.8rem', padding:'0.5rem 1.2rem' }}
                onClick={() => setMostrarEditorAcc(false)}>
                ✅ LISTO
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarQR && alumno && (
        <QrGenerator
          alumno={alumno}
          colorTema={colorTema}
          onCerrar={() => setMostrarQR(false)}
        />
      )}
    </div>
  );
};

export default BodySensor;