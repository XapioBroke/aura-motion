import React, { useRef, useEffect, useState, useCallback } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from './firebase';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { BurbujaGame }   from './games/BurbujaGame.js';
import { MeteoritoGame } from './games/MeteoritoGame.js';
import { LaserGame }     from './games/LaserGame.js';
import { SurfGame }      from './games/SurfGame.js';
import { ConductorGame } from './games/ConductorGame.js';
import { EsquivaGame }   from './games/EsquivaGame.js';
import { MemoriaGame }   from './games/MemoriaGame.js';
import { SableGame }     from './games/SableGame.js';
import { KameGame }      from './games/KameGame.js';
import { PinataGame }    from './games/Pinatagame.js';
import { ArcoGame }        from './games/Arcogame.js';
import { PortalGame }      from './games/PortalGame.js';
import { SaltaCuerdaGame } from './games/SaltacuerdaGame.js';
import { BoxeoGame }       from './games/Boxeogame.js';
import { KienzanGame }     from './games/Kienzangame.js';
import { MuroInfernal }  from './games/Muroinfernal.js';
import { SFX }           from './games/SoundEngine.js';
import { PanelConfigJuego, defaultConfig, validateConfig, PRESETS } from './games/ConfiguracionJuegos';
import { PinDocente, PreguntasDocente, ModoPreguntas, MATERIAS_LABEL } from './games/PreguntasDocente';
import { setBancoDocente, generarRetoActivo as generarRetoVS } from './games/preguntas.js';
import './App.css';

// ─── CONSTANTES ──────────────────────────────────────────────
const TEMAS = {
  force:      '#00FF41',
  chronos:    '#FFD700',
  quantum:    '#00FFFF',
  bio_genesis:'#FF00FF',
  lingua:     '#FF4500',
};

// Solo minijuegos compatibles con 2 jugadores (sin Conductor ni Memoria que son muy individuales)
const MINIJUEGOS_VERSUS = [
  { id: 'burbujas',   nombre: 'Burbujas',    icono: '🫧',  motor: BurbujaGame   },
  { id: 'meteoritos', nombre: 'Meteoritos',  icono: '☄️',  motor: MeteoritoGame },
  { id: 'laser',      nombre: 'Láser',       icono: '🔫',  motor: LaserGame     },
  { id: 'surf',       nombre: 'Surf',        icono: '🌊',  motor: SurfGame      },
  { id: 'esquiva',    nombre: 'Esquiva',     icono: '🛡️', motor: EsquivaGame   },
  // Conductor y Memoria en modo Versus se juegan como "captura de objetivos compartidos"
  { id: 'conductor',  nombre: 'Conductor',   icono: '⚡',  motor: ConductorGame },
  { id: 'memoria',    nombre: 'Memoria',     icono: '🧠',  motor: MemoriaGame   },
  { id: 'sable', nombre: 'Sable', icono: '⚔️', desc: 'Corta las respuestas', motor: SableGame },
  { id: 'kame',  nombre: 'Kame-Hame-Ha', icono: '🔵', desc: 'Onda de energía', motor: KameGame  },
  { id: 'pinata', nombre: 'Piñata', icono: '🪅', desc: 'Rompe la piñata con el palo', motor: PinataGame },
  { id: 'arco',        nombre: 'Arco y Flecha',  icono: '🏹', motor: ArcoGame        },
  { id: 'portal',      nombre: 'Portal',         icono: '🌀', motor: PortalGame      },
  { id: 'saltacuerda', nombre: 'Salta Cuerda',   icono: '🪢', motor: SaltaCuerdaGame },
  { id: 'boxeo',    nombre: 'Boxeo',    icono: '🥊', motor: BoxeoGame   },
  { id: 'kienzan', nombre: 'Kienzan', icono: '🥏', motor: KienzanGame },
];

let poseLandmarkerVersus = null;

// ─── COMPONENTE ──────────────────────────────────────────────
const VersusSensor = ({ materia, onSalir, jugador1, jugador2, trimestreActivo = 'tri1' }) => {

  const vozIA = useCallback((texto) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-MX'; msg.pitch = 0.2; msg.rate = 0.9;
    window.speechSynthesis.speak(msg);
  }, []);

  const videoRef       = useRef(null);
  const canvasRef      = useRef(null);
  const contenedorRef  = useRef(null);
  const colorTema      = TEMAS[materia] || '#00FFFF';

  const [fase, setFase]        = useState('configuracion');
  const faseRef                = useRef('configuracion');
  const [estadoIA, setEstadoIA]= useState('esperando');
  const [conteo, setConteo]    = useState(3);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);

  // ── MINIJUEGO ──
  const [minijuegoId, setMinijuegoId]   = useState('burbujas');
  const minijuegoIdRef = useRef('burbujas');
  // En versus cada jugador tiene su instancia del motor
  const motorJ1Ref = useRef(null);
  const motorJ2Ref = useRef(null);

  // ── CONFIG DEL JUEGO ──
  const [juegoConfig, setJuegoConfig]     = useState(() => ({ ...defaultConfig('burbujas'), ...PRESETS.versus.config }));
  const juegoConfigRef = useRef(juegoConfig);

  // ── PESTAÑA ──
  const [pestanaMenu, setPestanaMenu] = useState('juego');
  // ── PREGUNTAS DOCENTE (mismo sistema que BodySensor) ──
  const [pinInput,      setPinInput]      = useState('');
  const [pinCrearA,     setPinCrearA]     = useState('');
  const [pinCrearB,     setPinCrearB]     = useState('');
  const [pinVerificado, setPinVerificado] = useState(false);
  const [pinExiste,     setPinExiste]     = useState(false);
  const [pinError,      setPinError]      = useState('');
  const [pregDocente,   setPregDocente]   = useState([]);
  const [modoPregunta,  setModoPregunta]  = useState(ModoPreguntas.obtener());
  const [cargandoPreg,  setCargandoPreg]  = useState(false);
  const [formPreg, setFormPreg] = useState({ pregunta:'', correcta:'', f1:'', f2:'', materia:[materia], editId:null });
  const [modoForm, setModoForm] = useState(null);

  const requestRef    = useRef();
  const enCooldown    = useRef(false);
  const historialJ1   = useRef(null);
  const historialJ2   = useRef(null);

  const [config, setConfig]           = useState({ modo: 'tiempo', cantidad: 30 });
  const configRef                     = useRef({ modo: 'tiempo', cantidad: 30 });
  const [tiempoRestante, setTiempoRestante] = useState(30);
  const tiempoRef                     = useRef(30);

  const [puntosJ1, setPuntosJ1]       = useState(0);
  const puntosJ1Ref                   = useRef(0);
  const [puntosJ2, setPuntosJ2]       = useState(0);
  const puntosJ2Ref                   = useRef(0);
  const [vidasJ1, setVidasJ1]         = useState(3);
  const vidasJ1Ref                    = useRef(3);
  const [vidasJ2, setVidasJ2]         = useState(3);
  const vidasJ2Ref                    = useRef(3);

  const [objetivoActual, setObjetivoActual] = useState(null);
  const objetivoRef                   = useRef(null);
  const [guardadoOK, setGuardadoOK]   = useState(false);

  // ── HELPERS ──
  const actualizarConfig = (c) => { setConfig(c); configRef.current = c; };
  const syncJ1 = (p, v) => { setPuntosJ1(p); puntosJ1Ref.current = p; setVidasJ1(v); vidasJ1Ref.current = v; };
  const syncJ2 = (p, v) => { setPuntosJ2(p); puntosJ2Ref.current = p; setVidasJ2(v); vidasJ2Ref.current = v; };

  const cambiarMinijuego = (id) => {
    setMinijuegoId(id);
    minijuegoIdRef.current = id;
    const cfg = { ...defaultConfig(id), ...PRESETS.versus.config };
    setJuegoConfig(cfg);
    juegoConfigRef.current = cfg;
  };

  const actualizarJuegoConfig = (cfg) => {
    const validada = validateConfig(cfg, minijuegoIdRef.current);
    setJuegoConfig(validada);
    juegoConfigRef.current = validada;
  };

  const alternarPantallaCompleta = () => {
    if (!document.fullscreenElement) {
      contenedorRef.current?.requestFullscreen().catch(() => {});
      setPantallaCompleta(true);
    } else {
      document.exitFullscreen();
      setPantallaCompleta(false);
    }
  };

  // ─── PREGUNTAS DOCENTE ───────────────────────────────────
  const cargarPreguntasDocente = async () => {
    setCargandoPreg(true);
    try {
      const data = await PreguntasDocente.obtener();
      setPregDocente(data);
      setBancoDocente(data, ModoPreguntas.obtener());
    } catch(e) {}
    finally { setCargandoPreg(false); }
  };

  const verificarPin = async () => {
    setPinError('');
    const ok = await PinDocente.verificar(pinInput);
    if (ok) { setPinVerificado(true); setPinInput(''); await cargarPreguntasDocente(); }
    else setPinError('PIN incorrecto');
  };

  const crearPin = async () => {
    if (pinCrearA.length < 4) { setPinError('Mínimo 4 dígitos'); return; }
    if (pinCrearA !== pinCrearB) { setPinError('Los PINs no coinciden'); return; }
    await PinDocente.crear(pinCrearA); setPinExiste(true); setPinCrearA(''); setPinCrearB('');
    setPinError('✅ PIN creado');
  };

  const abrirPestanaPreguntas = async () => {
    setPestanaMenu('preguntas');
    const existe = await PinDocente.existe(); setPinExiste(existe);
  };

  const cambiarModo = (modo) => { ModoPreguntas.guardar(modo); setModoPregunta(modo); setBancoDocente(pregDocente, modo); };

  const guardarPregunta = async () => {
    const { pregunta, correcta, f1, f2, materia: mat, editId } = formPreg;
    if (!pregunta.trim() || !correcta.trim() || !f1.trim() || !f2.trim()) { alert('Completa todos los campos'); return; }
    try {
      if (editId) await PreguntasDocente.editar(editId, { pregunta, correcta, falsas:[f1,f2], materia: mat });
      else        await PreguntasDocente.crear({ materia: mat, pregunta, correcta, falsas:[f1,f2] });
      setModoForm(null);
      setFormPreg({ pregunta:'', correcta:'', f1:'', f2:'', materia:[materia], editId:null });
      await cargarPreguntasDocente();
    } catch(e) { alert('Error al guardar'); }
  };

  const editarPregunta = (p) => {
    setFormPreg({ pregunta:p.pregunta, correcta:p.correcta, f1:p.falsas[0]||'', f2:p.falsas[1]||'', materia:p.materia, editId:p.id });
    setModoForm('editar');
  };
  const eliminarPregunta = async (id) => { if (!window.confirm('¿Eliminar?')) return; await PreguntasDocente.eliminar(id); await cargarPreguntasDocente(); };
  const toggleActiva = async (p) => { await PreguntasDocente.toggleActiva(p.id, !p.activa); await cargarPreguntasDocente(); };

  // ─── Cargar preguntas docente al montar ─────────────────
  useEffect(() => {
    const cargar = async () => {
      try {
        const data = await PreguntasDocente.obtener();
        setPregDocente(data);
        setBancoDocente(data, ModoPreguntas.obtener());
      } catch(e) {}
    };
    cargar();
  }, [materia]);

  // ─── INICIAR BATALLA ──────────────────────────────────────
  const iniciarBatalla = () => {
    // ✅ B1 FIX: Re-inyectar banco docente antes de iniciar
    setBancoDocente(pregDocente, ModoPreguntas.obtener());
    if (estadoIA === 'cargando') return;

    syncJ1(0, config.modo === 'vidas' ? config.cantidad : 0);
    syncJ2(0, config.modo === 'vidas' ? config.cantidad : 0);

    setTiempoRestante(config.modo === 'tiempo' ? config.cantidad : 0);
    tiempoRef.current = config.modo === 'tiempo' ? config.cantidad : 0;

    // Inicializar motores para cada jugador
    const juego = MINIJUEGOS_VERSUS.find(j => j.id === minijuegoIdRef.current);
    if (juego) {
      const cfgVal = validateConfig(juegoConfigRef.current, minijuegoIdRef.current);
      motorJ1Ref.current = Object.create(juego.motor);
      motorJ2Ref.current = Object.create(juego.motor);
      motorJ1Ref.current.init(materia, '#00FFFF', cfgVal);
      motorJ2Ref.current.init(materia, '#FF00FF', cfgVal);
    }

    SFX.inicio();
    setFase('preparacion');
    faseRef.current = 'preparacion';

    if (estadoIA === 'esperando') arrancarMotorIA();
  };

  // ─── GENERAR RETO VERSUS — pregunta compartida ──────────
  const generarRetoVersus = useCallback(() => {
    const reto = generarRetoVS(materia);
    // Opciones en 3 zonas fijas: izquierda, centro, derecha
    // Distribuidas en la mitad inferior para que ambos jugadores alcancen
    const zonas = [
      { x: 0.18, y: 0.65 },
      { x: 0.50, y: 0.60 },
      { x: 0.82, y: 0.65 },
    ];
    // Mezclar opciones aleatoriamente
    const opts = [...reto.opciones].sort(() => Math.random() - 0.5).slice(0, 3);
    const opciones = opts.map((o, i) => ({
      ...zonas[i],
      radio:      88,
      texto:      o.texto,
      esCorrecto: o.esCorrecto,
      pulso:      Math.random() * Math.PI * 2,
    }));
    const nuevoObj = { pregunta: reto.pregunta, opciones };
    setObjetivoActual(nuevoObj);
    objetivoRef.current = nuevoObj;
    enCooldown.current = true;
    setTimeout(() => { enCooldown.current = false; }, 1200);
  }, [materia]);

  // ─── TERMINAR JUEGO ───────────────────────────────────────
  const terminarJuego = useCallback(async () => {
    SFX.gameOver();
    setFase('game_over');
    faseRef.current = 'game_over';
    setGuardadoOK(false);

    const nomJ1 = jugador1?.nombre || jugador1 || 'Jugador 1';
    const nomJ2 = jugador2?.nombre || jugador2 || 'Jugador 2';
    const p1 = puntosJ1Ref.current, p2 = puntosJ2Ref.current;

    let ganadorStr = 'Empate';
    let mensajeVoz = 'La batalla ha terminado en empate.';
    if (p1 > p2) { ganadorStr = nomJ1; mensajeVoz = `¡Victoria absoluta para ${nomJ1}!`; }
    else if (p2 > p1) { ganadorStr = nomJ2; mensajeVoz = `¡Victoria absoluta para ${nomJ2}!`; }
    vozIA(mensajeVoz);

    try {
      await addDoc(collection(db, 'rankings_nexus'), {
        modo: '1 VS 1',
        materia,
        minijuego:     minijuegoIdRef.current,
        dificultad:    juegoConfigRef.current?.dificultad || 'medio',
        trimestre:     trimestreActivo,
        modoJuego:     configRef.current.modo,
        jugador1_Nombre: nomJ1, jugador1_ID: jugador1?.id || 'N/A',
        jugador2_Nombre: nomJ2, jugador2_ID: jugador2?.id || 'N/A',
        puntuacion_J1: p1, puntuacion_J2: p2,
        ganador: ganadorStr,
        fecha: serverTimestamp(),
      });

      if (jugador1?.id) await updateDoc(doc(db, 'alumnos', jugador1.id), { [trimestreActivo]: increment(p1), xp_total: increment(p1) });
      if (jugador2?.id) await updateDoc(doc(db, 'alumnos', jugador2.id), { [trimestreActivo]: increment(p2), xp_total: increment(p2) });

      setGuardadoOK(true);
    } catch (e) { console.error(e); }
  }, [jugador1, jugador2, materia, trimestreActivo, vozIA]);

  // ─── TIMER Y COUNTDOWN ────────────────────────────────────
  useEffect(() => {
    let timer;
    if (fase === 'preparacion' && estadoIA === 'lista') {
      let t = 3; setConteo(t);
      timer = setInterval(() => {
        t -= 1;
        if (t > 0) setConteo(t);
        else if (t === 0) { SFX.inicio(); setConteo('¡FIGHT!'); }
        else { clearInterval(timer); setFase('jugando'); faseRef.current = 'jugando'; generarRetoVersus(); }
      }, 1000);
    } else if (fase === 'jugando' && config.modo === 'tiempo') {
      timer = setInterval(() => {
        const nt = tiempoRef.current - 1;
        setTiempoRestante(nt); tiempoRef.current = nt;
        if (nt <= 0) terminarJuego();
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [fase, estadoIA, config.modo, generarRetoVersus, terminarJuego]);

  // ─── MOTOR IA VERSUS ──────────────────────────────────────
  const arrancarMotorIA = async () => {
    setEstadoIA('cargando');
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');

    try {
      if (!poseLandmarkerVersus) {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        poseLandmarkerVersus = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 2,
        });
      }

      // ✅ Fallback progresivo igual que BodySensor
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } });
      } catch (e1) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (e2) {
          const msg =
            e2.name === 'NotFoundError'    ? 'No se detectó ninguna cámara.' :
            e2.name === 'NotAllowedError'  ? 'Permiso de cámara denegado.' :
            e2.name === 'NotReadableError' ? 'Cámara en uso por otra app. Ciérrala y recarga.' :
            `Error de cámara: ${e2.message}`;
          setEstadoIA('error');
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#FF4444'; ctx.font = 'bold 28px Orbitron, sans-serif';
          ctx.fillText('⚠️ ' + msg, canvas.width / 2, canvas.height / 2);
          return;
        }
      }
      video.srcObject = stream;
      await new Promise(res => { video.onloadedmetadata = res; });
      video.play();
      setEstadoIA('lista');

      let lastVideoTime = -1;
      let lastTime = 0;

      const renderLoop = async (timestamp) => {
        const delta = (timestamp - lastTime) * 0.06;
        lastTime = timestamp;

        if (video.readyState >= 2) {
          const startMs = performance.now();
          if (lastVideoTime !== video.currentTime) {
            lastVideoTime = video.currentTime;
            const results = poseLandmarkerVersus.detectForVideo(video, startMs);

            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Fondo
            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Divisor central
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, 0);
            ctx.lineTo(canvas.width / 2, canvas.height);
            ctx.lineWidth = 4;
            ctx.setLineDash([12, 8]);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.stroke();
            ctx.setLineDash([]);

            // ── Pregunta compartida + opciones en pantalla completa ──
            if (faseRef.current === 'jugando' && objetivoRef.current?.pregunta) {
              const obj = objetivoRef.current;
              const W = canvas.width, H = canvas.height;
              const bloq = enCooldown.current;

              // Pregunta — fondo semitransparente arriba
              ctx.save();
              ctx.fillStyle = 'rgba(0,0,0,0.72)';
              ctx.beginPath();
              if (ctx.roundRect) ctx.roundRect(W*0.04, 8, W*0.92, 100, 12);
              else ctx.rect(W*0.04, 8, W*0.92, 100);
              ctx.fill();
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.font = 'bold 36px Orbitron, sans-serif';
              ctx.fillStyle = '#FFF'; ctx.shadowBlur = 12; ctx.shadowColor = colorTema;
              ctx.fillText(obj.pregunta, W/2, 52);
              ctx.font = '16px Rajdhani, sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.shadowBlur = 0;
              ctx.fillText('⚡ El más rápido gana — toca la respuesta correcta', W/2, 88);
              ctx.restore();

              // Opciones como esferas grandes
              obj.opciones?.forEach(opc => {
                const ox = opc.x * W, oy = opc.y * H;
                const r  = opc.radio;
                const pulso = bloq ? 1 : 1 + Math.sin(timestamp * 0.006 + opc.pulso) * 0.06;
                const rp = r * pulso;

                ctx.save();
                // Halo exterior
                ctx.globalAlpha = bloq ? 0.1 : 0.22;
                const halo = ctx.createRadialGradient(ox, oy, 0, ox, oy, rp * 1.6);
                halo.addColorStop(0, colorTema); halo.addColorStop(1, 'transparent');
                ctx.fillStyle = halo;
                ctx.beginPath(); ctx.arc(ox, oy, rp * 1.6, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;

                // Cuerpo
                const grd = ctx.createRadialGradient(ox - rp*0.3, oy - rp*0.3, rp*0.1, ox, oy, rp);
                grd.addColorStop(0, bloq ? '#333' : '#FFFFFF');
                grd.addColorStop(0.4, bloq ? '#222' : colorTema + 'AA');
                grd.addColorStop(1,   bloq ? '#111' : colorTema + '44');
                ctx.shadowBlur  = bloq ? 0 : 22; ctx.shadowColor = colorTema;
                ctx.fillStyle = grd;
                ctx.beginPath(); ctx.arc(ox, oy, rp, 0, Math.PI * 2); ctx.fill();

                // Borde
                ctx.strokeStyle = bloq ? '#444' : '#FFFFFF88';
                ctx.lineWidth = 2.5; ctx.stroke();

                // Brillo especular
                ctx.shadowBlur = 0; ctx.globalAlpha = 0.4;
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.ellipse(ox - rp*0.28, oy - rp*0.28, rp*0.18, rp*0.10, -0.5, 0, Math.PI*2);
                ctx.fill();
                ctx.globalAlpha = 1;

                // Texto con wrap
                ctx.shadowBlur = 0; ctx.fillStyle = bloq ? '#666' : '#FFF';
                ctx.font = 'bold 18px Orbitron, sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const palabras = opc.texto.split(' ');
                let lineas = [], linea = '';
                palabras.forEach(p => {
                  const t = linea + p + ' ';
                  if (ctx.measureText(t).width > rp*1.6 && linea) { lineas.push(linea.trim()); linea = p+' '; }
                  else linea = t;
                });
                if (linea) lineas.push(linea.trim());
                lineas.forEach((l, i) => ctx.fillText(l, ox, oy + (i-(lineas.length-1)/2)*22));
                ctx.restore();
              });
            }

            // ── Esqueletos (espejados) ──
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);

            let posesEstables = [];

            if (results.landmarks?.length > 0) {
              let p1Crudo = null, p2Crudo = null;
              results.landmarks.forEach(crudos => {
                if (crudos[0].x > 0.5) p1Crudo = crudos;
                else p2Crudo = crudos;
              });

              const lerp = (crudo, histRef) => {
                if (!crudo) { histRef.current = null; return null; }
                let estable = crudo;
                if (histRef.current?.length === crudo.length) {
                  estable = crudo.map((p, i) => ({
                    x: histRef.current[i].x + (p.x - histRef.current[i].x) * 0.8,
                    y: histRef.current[i].y + (p.y - histRef.current[i].y) * 0.8,
                    z: p.z, visibility: p.visibility,
                  }));
                }
                histRef.current = estable;
                return estable;
              };

              const p1E = lerp(p1Crudo, historialJ1);
              const p2E = lerp(p2Crudo, historialJ2);
              if (p1E) posesEstables.push({ landmarks: p1E, esJ1: true });
              if (p2E) posesEstables.push({ landmarks: p2E, esJ1: false });

              posesEstables.forEach(({ landmarks: lm, esJ1 }) => {
                const color = esJ1 ? '#00FFFF' : '#FF00FF';
                const W = canvas.width, H = canvas.height;
                ctx.shadowBlur = 10; ctx.shadowColor = color;
                ctx.strokeStyle = color; ctx.lineWidth = 8;
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';

                let anchoH = 100;
                if (lm[11] && lm[12]) anchoH = Math.hypot((lm[12].x - lm[11].x) * W, (lm[12].y - lm[11].y) * H);
                const rc = anchoH * 0.30;

                const tl = (i, j) => {
                  if (lm[i]?.visibility > 0.4 && lm[j]?.visibility > 0.4) {
                    ctx.moveTo(lm[i].x * W, lm[i].y * H);
                    ctx.lineTo(lm[j].x * W, lm[j].y * H);
                  }
                };

                ctx.beginPath();
                if (lm[11] && lm[12] && lm[23] && lm[24]) {
                  const hM = { x: (lm[11].x + lm[12].x) / 2 * W, y: (lm[11].y + lm[12].y) / 2 * H };
                  const cM = { x: (lm[23].x + lm[24].x) / 2 * W, y: (lm[23].y + lm[24].y) / 2 * H };
                  tl(11,12); tl(23,24);
                  ctx.moveTo(hM.x, hM.y); ctx.lineTo(cM.x, cM.y);
                  if (lm[0]) {
                    ctx.moveTo(hM.x, hM.y); ctx.lineTo(lm[0].x * W, lm[0].y * H + rc);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(lm[0].x * W, lm[0].y * H, Math.max(20, rc), 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fill(); ctx.stroke();
                  }
                }
                ctx.beginPath();
                tl(11,13); tl(13,15); tl(12,14); tl(14,16);
                tl(23,25); tl(25,27); tl(24,26); tl(26,28);
                ctx.stroke();
              });
            } else {
              historialJ1.current = null;
              historialJ2.current = null;
            }

            ctx.restore(); // fin espejo

            // ── Orbes y colisiones (fuera espejo) ──
            if (faseRef.current === 'jugando' && posesEstables.length > 0) {
              const W = canvas.width, H = canvas.height;

              posesEstables.forEach(({ landmarks: lm, esJ1 }) => {
                const colorJ = esJ1 ? '#00FFFF' : '#FF00FF';
                const getRX = n => (1 - n.x) * W;
                const getRY = n => n.y * H;

                const hombros = [lm[11], lm[12]].filter(Boolean);
                let anchoH = 100;
                if (hombros.length === 2) anchoH = Math.hypot(getRX(hombros[1]) - getRX(hombros[0]), getRY(hombros[1]) - getRY(hombros[0]));
                const tamProp = anchoH * 0.25;

                // Orbes en muñecas
                const orbe = (x, y, r, c) => {
                  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
                  g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.5, c); g.addColorStop(1, 'rgba(0,0,0,0)');
                  ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = c;
                  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
                  ctx.restore();
                };

                const m15 = lm[15], m16 = lm[16];
                if (m15) orbe(getRX(m15), getRY(m15), tamProp, colorJ);
                if (m16) orbe(getRX(m16), getRY(m16), tamProp, colorJ);

                // ── Motor de minijuego individual por jugador ──
                const motor = esJ1 ? motorJ1Ref.current : motorJ2Ref.current;
                if (motor) {
                  // ✅ FIX: update usa W/2 para sincronizar con el render clipado
                  const resultado = motor.update(lm, W / 2, H, delta);
                  if (resultado && resultado.puntos !== 0 && !resultado.esChoque) {
                    if (esJ1) syncJ1(Math.max(0, puntosJ1Ref.current + resultado.puntos), vidasJ1Ref.current);
                    else      syncJ2(Math.max(0, puntosJ2Ref.current + resultado.puntos), vidasJ2Ref.current);

                    // ✅ Rebote en LaserGame no quita vida
                    if (resultado.fallo && resultado.puntos < 0 && !resultado.esRebote && configRef.current.modo === 'vidas') {
                      if (esJ1) {
                        const nv = vidasJ1Ref.current - 1;
                        syncJ1(puntosJ1Ref.current, nv);
                        if (nv <= 0) terminarJuego();
                      } else {
                        const nv = vidasJ2Ref.current - 1;
                        syncJ2(puntosJ2Ref.current, nv);
                        if (nv <= 0) terminarJuego();
                      }
                    }
                  }
                }

                // ── Colisión con opciones de pregunta compartida ──
                if (!enCooldown.current && objetivoRef.current?.opciones && faseRef.current === 'jugando') {
                  const obj = objetivoRef.current;
                  const manos = [m15, m16, lm[19], lm[20]].filter(Boolean);

                  for (const opc of obj.opciones) {
                    const ox = opc.x * W, oy = opc.y * H;
                    const tocada = manos.some(n => Math.hypot(getRX(n) - ox, getRY(n) - oy) < opc.radio + 22);
                    if (!tocada) continue;

                    enCooldown.current = true;
                    const XP_CORRECTO = 50, XP_ERROR = -15;

                    if (opc.esCorrecto) {
                      SFX.acierto?.();
                      if (esJ1) syncJ1(puntosJ1Ref.current + XP_CORRECTO, vidasJ1Ref.current);
                      else      syncJ2(puntosJ2Ref.current + XP_CORRECTO, vidasJ2Ref.current);
                    } else {
                      SFX.error?.();
                      if (esJ1) {
                        syncJ1(Math.max(0, puntosJ1Ref.current + XP_ERROR), vidasJ1Ref.current);
                        if (configRef.current.modo === 'vidas') {
                          const nv = vidasJ1Ref.current - 1;
                          syncJ1(puntosJ1Ref.current, nv);
                          if (nv <= 0) { terminarJuego(); return; }
                        }
                      } else {
                        syncJ2(Math.max(0, puntosJ2Ref.current + XP_ERROR), vidasJ2Ref.current);
                        if (configRef.current.modo === 'vidas') {
                          const nv = vidasJ2Ref.current - 1;
                          syncJ2(puntosJ2Ref.current, nv);
                          if (nv <= 0) { terminarJuego(); return; }
                        }
                      }
                    }
                    setTimeout(() => generarRetoVersus(), 900);
                    break;
                  }
                }
              });

              // Render de motores (solo J1 en la mitad izquierda, J2 en la derecha)
              if (motorJ1Ref.current) {
                ctx.save();
                ctx.beginPath(); ctx.rect(0, 0, W / 2, H); ctx.clip();
                motorJ1Ref.current.render(ctx, W / 2, H);
                const lmJ1 = posesEstables.find(p => p.esJ1)?.landmarks;
                if (lmJ1 && typeof motorJ1Ref.current.renderBrazos === 'function')
                  motorJ1Ref.current.renderBrazos(ctx, lmJ1, W / 2, H);
                ctx.restore();
              }
              if (motorJ2Ref.current) {
                ctx.save();
                ctx.translate(W / 2, 0);
                ctx.beginPath(); ctx.rect(0, 0, W / 2, H); ctx.clip();
                motorJ2Ref.current.render(ctx, W / 2, H);
                const lmJ2 = posesEstables.find(p => !p.esJ1)?.landmarks;
                if (lmJ2 && typeof motorJ2Ref.current.renderBrazos === 'function')
                  motorJ2Ref.current.renderBrazos(ctx, lmJ2, W / 2, H);
                ctx.restore();
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
      setEstadoIA('error');
    }
  };

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ─── HELPERS UI ──────────────────────────────────────────
  const renderVidas = (vidasAct) =>
    Array.from({ length: config.cantidad }, (_, i) => (
      <span key={i} style={{ fontSize: '1.2rem', margin: '0 2px', filter: i < vidasAct ? 'none' : 'grayscale(100%) opacity(30%)' }}>❤️</span>
    ));

  const nomJ1 = jugador1?.nombre || jugador1 || 'J1';
  const nomJ2 = jugador2?.nombre || jugador2 || 'J2';

  // ─── JSX ────────────────────────────────────────────────
  return (
    <div className="aura-container" ref={contenedorRef} style={{ background: '#000', height: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* HEADER VERSUS */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 2rem', background: 'rgba(8,8,18,0.92)', borderBottom: `2px solid ${colorTema}33`, backdropFilter: 'blur(8px)' }}>

        {/* J1 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: '200px' }}>
          <div style={{ color: '#00FFFF', fontSize: '1.8rem', fontFamily: 'Orbitron', fontWeight: 'bold', textShadow: '0 0 12px #00FFFF88' }}>
            {nomJ1}: {puntosJ1} XP
          </div>
          {config.modo === 'vidas' && fase !== 'configuracion' && <div>{renderVidas(vidasJ1)}</div>}
        </div>

        {/* Centro */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <h1 style={{ fontFamily: 'Orbitron', color: '#FFF', margin: 0, fontSize: '1.3rem' }}>
            BATALLA <span style={{ color: colorTema }}>VERSUS</span>
          </h1>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'Orbitron', letterSpacing: '0.1em' }}>
            {trimestreActivo.replace('tri', 'TRIMESTRE ')} · {MINIJUEGOS_VERSUS.find(j => j.id === minijuegoId)?.icono} {MINIJUEGOS_VERSUS.find(j => j.id === minijuegoId)?.nombre}
          </div>
          {config.modo === 'tiempo' && fase !== 'configuracion' && (
            <div style={{ fontSize: '1.4rem', color: '#FFF', fontWeight: 'bold', fontFamily: 'Orbitron' }}>
              ⏱️ 00:{tiempoRestante.toString().padStart(2, '0')}
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button className="btn-cyber" onClick={alternarPantallaCompleta} style={{ '--tema-color': '#00FFFF', padding: '0.4rem 0.9rem', fontSize: '0.75rem' }}>
              {pantallaCompleta ? '⊠' : '⊡'} PANTALLA
            </button>
            <button className="btn-cyber" onClick={onSalir} style={{ '--tema-color': '#FF0844', padding: '0.4rem 0.9rem', fontSize: '0.75rem' }}>
              ✕ SALIR
            </button>
          </div>
        </div>

        {/* J2 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '200px' }}>
          <div style={{ color: '#FF00FF', fontSize: '1.8rem', fontFamily: 'Orbitron', fontWeight: 'bold', textShadow: '0 0 12px #FF00FF88' }}>
            {nomJ2}: {puntosJ2} XP
          </div>
          {config.modo === 'vidas' && fase !== 'configuracion' && <div style={{ textAlign: 'right' }}>{renderVidas(vidasJ2)}</div>}
        </div>
      </header>

      <main style={{ flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>

        {/* ── MENÚ CONFIGURACIÓN ── */}
        {fase === 'configuracion' && (
          <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.88)', padding: '2.5rem 3rem', borderRadius: '20px', border: `2px solid ${colorTema}44`, backdropFilter: 'blur(12px)', zIndex: 10, width: '90%', maxWidth: '760px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.2rem' }}>
            <h2 style={{ fontSize: '2rem', color: '#FFF', fontFamily: 'Orbitron', margin: 0 }}>CONFIGURACIÓN DEL COMBATE</h2>
            <p style={{ fontFamily: 'Rajdhani', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', margin: 0 }}>
              XP en: <span style={{ color: colorTema }}>{trimestreActivo.replace('tri', 'TRIMESTRE ')}</span>
            </p>

            {/* Pestañas */}
            <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '4px' }}>
              {[{ id: 'juego', label: '🎮 JUEGO' }, { id: 'config', label: '⚙️ CONFIG' }, { id: 'modo', label: '🕹️ MODO' }, { id: 'preguntas', label: '✏️ PREGUNTAS', onClick: abrirPestanaPreguntas }].map(tab => (
                <button key={tab.id} onClick={() => tab.onClick ? tab.onClick() : setPestanaMenu(tab.id)}
                  style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', padding: '0.4rem 1rem',
                    background: pestanaMenu === tab.id ? colorTema + '33' : 'transparent',
                    color: pestanaMenu === tab.id ? '#FFF' : 'rgba(255,255,255,0.4)',
                    border: `1px solid ${pestanaMenu === tab.id ? colorTema : 'transparent'}`,
                    borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Pestaña: Juego */}
            {pestanaMenu === 'juego' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem', width: '100%' }}>
                {MINIJUEGOS_VERSUS.map(j => (
                  <button key={j.id}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '0.7rem 0.4rem',
                      background: minijuegoId === j.id ? colorTema + '33' : 'rgba(0,0,0,0.5)',
                      border: `1px solid ${minijuegoId === j.id ? colorTema : 'rgba(255,255,255,0.12)'}`,
                      borderRadius: '10px', cursor: 'pointer', color: '#FFF',
                      boxShadow: minijuegoId === j.id ? `0 0 14px ${colorTema}55` : 'none', transition: 'all 0.2s',
                    }}
                    onClick={() => cambiarMinijuego(j.id)}>
                    <span style={{ fontSize: '1.6rem' }}>{j.icono}</span>
                    <span style={{ fontFamily: 'Orbitron', fontSize: '0.65rem', fontWeight: 'bold' }}>{j.nombre}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Pestaña: Config */}
            {pestanaMenu === 'config' && (
              <div style={{ width: '100%', maxWidth: '480px' }}>
                <PanelConfigJuego juegoId={minijuegoId} config={juegoConfig} onChange={actualizarJuegoConfig} colorTema={colorTema} />
              </div>
            )}

            {/* Pestaña: Modo */}
            {pestanaMenu === 'modo' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn-cyber"
                    style={{ background: config.modo === 'tiempo' ? colorTema : 'rgba(0,0,0,0.5)', color: config.modo === 'tiempo' ? '#000' : colorTema }}
                    onClick={() => actualizarConfig({ modo: 'tiempo', cantidad: 30 })}>⏱️ CONTRARRELOJ</button>
                  <button className="btn-cyber"
                    style={{ background: config.modo === 'vidas' ? colorTema : 'rgba(0,0,0,0.5)', color: config.modo === 'vidas' ? '#000' : colorTema }}
                    onClick={() => actualizarConfig({ modo: 'vidas', cantidad: 3 })}>❤️ SUPERVIVENCIA</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '1.8rem', fontFamily: 'Rajdhani', fontWeight: 'bold', color: '#FFF' }}>
                  <button className="btn-cyber" style={{ fontSize: '1.6rem', padding: '0.3rem 1rem' }}
                    onClick={() => actualizarConfig({ ...config, cantidad: Math.max(1, config.cantidad - (config.modo === 'tiempo' ? 10 : 1)) })}>−</button>
                  <span style={{ minWidth: '120px', textAlign: 'center', textShadow: `0 0 10px ${colorTema}` }}>
                    {config.cantidad} {config.modo === 'tiempo' ? 'Segs' : 'Vidas'}
                  </span>
                  <button className="btn-cyber" style={{ fontSize: '1.6rem', padding: '0.3rem 1rem' }}
                    onClick={() => actualizarConfig({ ...config, cantidad: config.cantidad + (config.modo === 'tiempo' ? 10 : 1) })}>+</button>
                </div>
              </div>
            )}

            {/* Pestaña: Preguntas Docente */}
            {pestanaMenu === 'preguntas' && (() => {
              const inputStyle = { background:'rgba(0,0,0,0.6)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'8px', color:'#FFF', padding:'0.5rem 0.8rem', fontFamily:'Rajdhani', fontSize:'0.95rem', outline:'none', width:'100%', boxSizing:'border-box' };
              const btn = (color='#00FFFF') => ({ fontFamily:'Orbitron', fontSize:'0.65rem', padding:'0.35rem 0.8rem', background:color+'22', border:`1px solid ${color}`, borderRadius:'8px', color, cursor:'pointer' });
              if (!pinExiste) return (
                <div style={{ display:'flex', flexDirection:'column', gap:'0.7rem', alignItems:'center', width:'100%', maxWidth:'360px' }}>
                  <div style={{ color:'rgba(255,255,255,0.5)', fontFamily:'Rajdhani', fontSize:'0.85rem', textAlign:'center' }}>Primera vez — crea un PIN de 4+ dígitos</div>
                  <input style={inputStyle} type="password" placeholder="Nuevo PIN" maxLength={8} value={pinCrearA} onChange={e => setPinCrearA(e.target.value.replace(/[^0-9]/g,'').slice(0,8))} />
                  <input style={inputStyle} type="password" placeholder="Confirmar PIN" maxLength={8} value={pinCrearB} onChange={e => setPinCrearB(e.target.value.replace(/[^0-9]/g,'').slice(0,8))} />
                  {pinError && <div style={{ color: pinError.startsWith('✅') ? '#00FF41':'#FF4444', fontFamily:'Rajdhani', fontSize:'0.8rem' }}>{pinError}</div>}
                  <button style={btn(colorTema)} onClick={crearPin}>🔐 CREAR PIN</button>
                </div>
              );
              if (!pinVerificado) return (
                <div style={{ display:'flex', flexDirection:'column', gap:'0.7rem', alignItems:'center', width:'100%', maxWidth:'320px' }}>
                  <div style={{ color:'rgba(255,255,255,0.4)', fontFamily:'Rajdhani', fontSize:'0.85rem' }}>🔒 Área del docente</div>
                  <input style={{ ...inputStyle, textAlign:'center', fontSize:'1.3rem', letterSpacing:'0.4em' }} type="password" placeholder="••••" maxLength={8}
                    value={pinInput} onChange={e => setPinInput(e.target.value.replace(/[^0-9]/g,'').slice(0,8))} onKeyDown={e => e.key==='Enter' && verificarPin()} />
                  {pinError && <div style={{ color:'#FF4444', fontFamily:'Rajdhani', fontSize:'0.8rem' }}>{pinError}</div>}
                  <button style={btn(colorTema)} onClick={verificarPin}>🔓 ENTRAR</button>
                </div>
              );
              const pregsFiltradas = pregDocente.filter(p => p.materia?.includes(materia));
              return (
                <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:'0.8rem' }}>
                  <div style={{ display:'flex', gap:'6px', justifyContent:'center' }}>
                    {[['banco','📚 Banco'],['mezcla','🔀 Mezcla'],['solo_docente','✏️ Solo docente']].map(([id,label]) => (
                      <button key={id} onClick={() => cambiarModo(id)} style={{ ...btn(modoPregunta===id ? colorTema:'rgba(255,255,255,0.25)'), background: modoPregunta===id ? colorTema+'33':'transparent', fontFamily:'Orbitron', fontSize:'0.62rem', boxShadow: modoPregunta===id ? `0 0 10px ${colorTema}55`:'none' }}>{label}</button>
                    ))}
                  </div>
                  {!modoForm ? (
                    <button style={{ ...btn(colorTema), alignSelf:'flex-start' }} onClick={() => setModoForm('crear')}>➕ NUEVA</button>
                  ) : (
                    <div style={{ background:'rgba(0,0,0,0.5)', border:`1px solid ${colorTema}44`, borderRadius:'10px', padding:'0.8rem', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                      <input style={inputStyle} placeholder="Pregunta" value={formPreg.pregunta} onChange={e => setFormPreg(f => ({...f, pregunta:e.target.value}))} />
                      <input style={{ ...inputStyle, borderColor:'#00FF4144' }} placeholder="✅ Correcta" value={formPreg.correcta} onChange={e => setFormPreg(f => ({...f, correcta:e.target.value}))} />
                      <div style={{ display:'flex', gap:'6px' }}>
                        <input style={{ ...inputStyle, borderColor:'#FF444444' }} placeholder="❌ Incorrecta 1" value={formPreg.f1} onChange={e => setFormPreg(f => ({...f, f1:e.target.value}))} />
                        <input style={{ ...inputStyle, borderColor:'#FF444444' }} placeholder="❌ Incorrecta 2" value={formPreg.f2} onChange={e => setFormPreg(f => ({...f, f2:e.target.value}))} />
                      </div>
                      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                        {Object.entries(MATERIAS_LABEL).map(([id,label]) => { const sel=formPreg.materia.includes(id); return <button key={id} onClick={() => setFormPreg(f => ({...f, materia: sel?f.materia.filter(m=>m!==id):[...f.materia,id]}))} style={{ ...btn(sel?colorTema:'rgba(255,255,255,0.2)'), fontSize:'0.6rem', padding:'0.25rem 0.6rem', background:sel?colorTema+'33':'transparent' }}>{label}</button>; })}
                      </div>
                      <div style={{ display:'flex', gap:'6px', justifyContent:'flex-end' }}>
                        <button style={btn('#888')} onClick={() => { setModoForm(null); setFormPreg({pregunta:'',correcta:'',f1:'',f2:'',materia:[materia],editId:null}); }}>CANCELAR</button>
                        <button style={btn(colorTema)} onClick={guardarPregunta}>💾 GUARDAR</button>
                      </div>
                    </div>
                  )}
                  <div style={{ display:'flex', flexDirection:'column', gap:'5px', maxHeight:'200px', overflowY:'auto' }}>
                    {cargandoPreg ? <div style={{ color:'rgba(255,255,255,0.3)', textAlign:'center', fontFamily:'Rajdhani', padding:'0.8rem' }}>Cargando...</div>
                    : pregsFiltradas.length === 0 ? <div style={{ color:'rgba(255,255,255,0.3)', fontFamily:'Rajdhani', fontSize:'0.8rem', textAlign:'center', padding:'0.8rem' }}>Sin preguntas para esta materia</div>
                    : pregsFiltradas.map(p => (
                      <div key={p.id} style={{ display:'flex', alignItems:'center', gap:'6px', background:p.activa?'rgba(0,255,65,0.04)':'rgba(255,255,255,0.03)', border:`1px solid ${p.activa?'#00FF4122':'rgba(255,255,255,0.08)'}`, borderRadius:'7px', padding:'0.4rem 0.7rem', opacity:p.activa?1:0.5 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontFamily:'Rajdhani', fontSize:'0.8rem', color:'#FFF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.pregunta}</div>
                          <div style={{ fontSize:'0.68rem', color:'rgba(255,255,255,0.35)', fontFamily:'Rajdhani' }}>✅ {p.correcta} | ❌ {p.falsas?.join(' · ')}</div>
                        </div>
                        <div style={{ display:'flex', gap:'4px' }}>
                          <button style={{ ...btn(p.activa?'#00FF41':'#888'), fontSize:'0.6rem', padding:'0.2rem 0.45rem' }} onClick={() => toggleActiva(p)}>{p.activa?'ON':'OFF'}</button>
                          <button style={{ ...btn('#FFD700'), fontSize:'0.6rem', padding:'0.2rem 0.45rem' }} onClick={() => editarPregunta(p)}>✏️</button>
                          <button style={{ ...btn('#FF4444'), fontSize:'0.6rem', padding:'0.2rem 0.45rem' }} onClick={() => eliminarPregunta(p.id)}>🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button style={{ ...btn('#FF4444'), alignSelf:'flex-end', fontSize:'0.6rem' }} onClick={() => { setPinVerificado(false); setPinInput(''); }}>🔒 Cerrar sesión</button>
                </div>
              );
            })()}

            {/* Resumen */}
            <div style={{ fontSize: '0.75rem', fontFamily: 'Rajdhani', color: 'rgba(255,255,255,0.4)', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.7rem', width: '100%', textAlign: 'center', display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <span>{MINIJUEGOS_VERSUS.find(j => j.id === minijuegoId)?.icono} {MINIJUEGOS_VERSUS.find(j => j.id === minijuegoId)?.nombre}</span>
              <span>•</span><span>⚡ {juegoConfig.dificultad?.toUpperCase()}</span>
              <span>•</span><span>🚀 {juegoConfig.velocidad?.toFixed(1)}×</span>
              <span>•</span><span>{config.modo === 'tiempo' ? `⏱️ ${config.cantidad}s` : `❤️ ${config.cantidad} vidas`}</span>
            </div>

            <button className="btn-cyber"
              style={{ fontSize: '1.6rem', padding: '0.8rem 3rem', '--tema-color': colorTema, boxShadow: `0 0 25px ${colorTema}` }}
              onClick={iniciarBatalla}>
              {estadoIA === 'cargando' ? '⏳ CARGANDO...' : '⚔️ INICIAR COMBATE'}
            </button>
          </div>
        )}

        {/* CUENTA REGRESIVA */}
        {fase === 'preparacion' && (
          <div className="countdown-overlay" style={{ zIndex: 20, color: conteo === '¡FIGHT!' ? '#FF00FF' : '#FFF' }}>{conteo}</div>
        )}

        {/* GAME OVER */}
        {fase === 'game_over' && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.88)', zIndex: 1000, backdropFilter: 'blur(10px)' }}>
            <h2 style={{ fontSize: '4rem', fontFamily: 'Orbitron', color: '#FFF', margin: 0, textShadow: `0 0 25px ${puntosJ1 > puntosJ2 ? '#00FFFF' : puntosJ2 > puntosJ1 ? '#FF00FF' : '#FFF'}` }}>
              {puntosJ1 > puntosJ2 ? `¡${nomJ1} GANA!` : puntosJ2 > puntosJ1 ? `¡${nomJ2} GANA!` : '¡EMPATE!'}
            </h2>

            <div style={{ display: 'flex', gap: '80px', margin: '35px 0' }}>
              <div style={{ textAlign: 'center', color: '#00FFFF', fontFamily: 'Orbitron' }}>
                <div style={{ fontSize: '1rem', marginBottom: '8px', opacity: 0.7 }}>{nomJ1}</div>
                <div style={{ fontSize: '3.5rem', fontWeight: 'bold', textShadow: '0 0 15px #00FFFF' }}>{puntosJ1} XP</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '3rem', opacity: 0.4 }}>⚔️</div>
              <div style={{ textAlign: 'center', color: '#FF00FF', fontFamily: 'Orbitron' }}>
                <div style={{ fontSize: '1rem', marginBottom: '8px', opacity: 0.7 }}>{nomJ2}</div>
                <div style={{ fontSize: '3.5rem', fontWeight: 'bold', textShadow: '0 0 15px #FF00FF' }}>{puntosJ2} XP</div>
              </div>
            </div>

            <div style={{ fontFamily: 'Rajdhani', fontSize: '1rem', color: guardadoOK ? '#00FF41' : 'rgba(255,255,255,0.35)', marginBottom: '25px', transition: 'color 0.5s' }}>
              {guardadoOK
                ? `✅ XP guardada en ${trimestreActivo.replace('tri', 'Trimestre ')} para ambos jugadores`
                : '⏳ Guardando resultados...'}
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <button className="btn-cyber" style={{ '--tema-color': colorTema, fontSize: '1rem', padding: '0.8rem 1.8rem' }}
                onClick={() => { setFase('configuracion'); setGuardadoOK(false); }}>
                🔄 VOLVER AL MENÚ
              </button>
              <button className="btn-cyber" style={{ '--tema-color': '#FF0844', fontSize: '1rem', padding: '0.8rem 1.8rem' }} onClick={onSalir}>
                🚀 SALIR AL LOBBY
              </button>
            </div>
          </div>
        )}

        {/* CANVAS */}
        <div style={{ display: (fase === 'jugando' || fase === 'preparacion') ? 'block' : 'none', width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
          <video ref={videoRef} style={{ display: 'none' }} playsInline />
          <canvas ref={canvasRef} width="1280" height="720" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </main>
    </div>
  );
};

export default VersusSensor;