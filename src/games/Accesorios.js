// ============================================================
//  SISTEMA DE ACCESORIOS POR XP (MOTOR GRÁFICO TIER 1)
//  Tiers desbloqueables según xp_total del alumno en Firebase.
//  Renderizado procedural de partículas y cabello ultra-realista.
// ============================================================

// ── 1. CONSTANTES Y CONFIGURACIÓN DE TIERS ─────────────────

export const TIERS_XP = [0, 500, 1500, 3000, 6000, 10000];

export const TIER_INFO = [
  { id: 0, nombre: 'Sin accesorio',    icono: '—',  desc: 'Comienza a jugar' },
  { id: 1, nombre: 'Chispa',           icono: '✨', desc: '500 XP' },
  { id: 2, nombre: 'Corona de energía',icono: '👑', desc: '1,500 XP' },
  { id: 3, nombre: 'Alas de plasma',   icono: '🔥', desc: '3,000 XP' },
  { id: 4, nombre: 'Armadura de luz',  icono: '⚡', desc: '6,000 XP' },
  { id: 5, nombre: 'Modo Dios',        icono: '🌟', desc: '10,000 XP' },
];

export const getTier = (xpTotal) => {
  let tier = 0;
  for (let i = TIERS_XP.length - 1; i >= 0; i--) {
    if (xpTotal >= TIERS_XP[i]) { tier = i; break; }
  }
  return tier;
};

// ── 2. POOL DE PARTÍCULAS (MOTOR GRÁFICO) ──────────────────

const _pools = new Map();

const _getPool = (key) => {
  if (!_pools.has(key)) _pools.set(key, { particulas: [], tick: 0 });
  return _pools.get(key);
};

export const resetPool = (key) => _pools.delete(key);

// ── 3. RENDER DE EFECTOS (TIERS) ───────────────────────────

export const renderAccesorio = (ctx, landmarks, canvasW, canvasH, tier, tick, key = 'default') => {
  if (!landmarks || tier === 0) return;

  const ex = n => (1 - n.x) * canvasW;
  const ey = n => n.y * canvasH;

  const nariz   = landmarks[0];
  const hDer    = landmarks[12], hIzq  = landmarks[11];
  const cadDer  = landmarks[24], cadIzq = landmarks[23];
  const munDer  = landmarks[16], munIzq = landmarks[15];
  const rodDer  = landmarks[26], rodIzq = landmarks[25];
  const tobiDer = landmarks[28], tobiIzq = landmarks[27];

  if (!nariz || !hDer || !hIzq) return;

  const nX     = ex(nariz), nY = ey(nariz);
  const hDX    = ex(hDer),  hDY = ey(hDer);
  const hIX    = ex(hIzq),  hIY = ey(hIzq);
  const anchoH = Math.hypot(hDX - hIX, hDY - hIY);
  const rc     = anchoH * 0.32;
  const cX     = (hDX + hIX) / 2;
  const cY     = (hDY + hIY) / 2;

  const pool = _getPool(key);
  pool.tick++;

  const COLORES = [
    null,
    ['#FFD700', '#FFA500', '#FFFF00'],
    ['#00FFFF', '#7B2FBE', '#FF00FF'],
    ['#FF4500', '#FF6B00', '#FF0000'],
    ['#00FF41', '#00FFFF', '#FFFFFF'],
    ['#FFFFFF', '#FFD700', '#FF00FF'],
  ];
  const palette = COLORES[tier] || COLORES[1];
  const c0 = palette[0], c1 = palette[1], c2 = palette[2];

  if (tier >= 1) {
    if (pool.tick % 4 === 0) {
      const ang = Math.random() * Math.PI * 2;
      const r   = rc * (1.1 + Math.random() * 0.5);
      pool.particulas.push({
        x: nX + Math.cos(ang) * r,
        y: nY + Math.sin(ang) * r,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -Math.random() * 1.5 - 0.5,
        vida: 20 + Math.random() * 20,
        vidaMax: 40,
        color: palette[Math.floor(Math.random() * palette.length)],
        tipo: 'chispa',
        size: 2 + Math.random() * 3,
      });
    }
  }

  if (tier >= 2) {
    ctx.save();
    ctx.translate(nX, nY - rc * 1.1);
    const pulso = 1 + Math.sin(pool.tick * 0.08) * 0.12;
    ctx.beginPath();
    ctx.arc(0, 0, rc * 0.85 * pulso, Math.PI, 0);
    ctx.strokeStyle = c0;
    ctx.lineWidth   = 4;
    ctx.shadowBlur  = 20; ctx.shadowColor = c0;
    ctx.stroke();
    [-0.9, -0.45, 0, 0.45, 0.9].forEach((t, i) => {
      const angPunta = Math.PI + t * Math.PI / 1.1;
      const rx = Math.cos(angPunta) * rc * 0.85 * pulso;
      const ry = Math.sin(angPunta) * rc * 0.85 * pulso;
      const altura = [18, 12, 22, 12, 18][i] * pulso;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(angPunta + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(-5, -altura); ctx.lineTo(5, -altura);
      ctx.closePath();
      ctx.fillStyle  = palette[i % palette.length];
      ctx.shadowBlur = 15; ctx.shadowColor = c1;
      ctx.fill();
      ctx.restore();
    });
    if (pool.tick % 3 === 0) {
      pool.particulas.push({
        x: nX + (Math.random() - 0.5) * rc * 1.8,
        y: nY - rc * 1.1 - Math.random() * rc * 0.8,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -Math.random() * 1.2,
        vida: 30, vidaMax: 30,
        color: palette[Math.floor(Math.random() * palette.length)],
        tipo: 'gema', size: 4,
      });
    }
    ctx.restore();
  }

  if (tier >= 3) {
    [{ hx: hDX, hy: hDY, dir: 1 }, { hx: hIX, hy: hIY, dir: -1 }].forEach(({ hx, hy, dir }) => {
      ctx.save();
      ctx.translate(hx, hy);
      const aleteo = Math.sin(pool.tick * 0.06) * 0.15;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(dir * 60, -40 + aleteo * 30, dir * 110, -90 + aleteo * 50, dir * 80, -140);
      ctx.bezierCurveTo(dir * 50, -100, dir * 30, -60, 0, 0);
      const gradAla = ctx.createLinearGradient(0, 0, dir * 80, -140);
      gradAla.addColorStop(0, c0 + 'CC');
      gradAla.addColorStop(0.5, c1 + '88');
      gradAla.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle   = gradAla;
      ctx.shadowBlur  = 25; ctx.shadowColor = c0;
      ctx.fill();
      ctx.strokeStyle = c0;
      ctx.lineWidth   = 2;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.restore();
      if (pool.tick % 3 === 0) {
        pool.particulas.push({
          x: hx + dir * (40 + Math.random() * 50),
          y: hy - 50 - Math.random() * 60,
          vx: dir * (0.5 + Math.random()),
          vy: -1.5 - Math.random(),
          vida: 25, vidaMax: 25,
          color: palette[Math.floor(Math.random() * palette.length)],
          tipo: 'llama', size: 5 + Math.random() * 5,
        });
      }
    });
  }

  if (tier >= 4) {
    const joints = [hDer, hIzq, cadDer, cadIzq, munDer, munIzq].filter(Boolean);
    const bones = [
      [11, 12], [11, 23], [12, 24], [23, 24],
      [11, 13], [13, 15], [12, 14], [14, 16],
      [23, 25], [25, 27], [24, 26], [26, 28],
    ];
    bones.forEach(([a, b]) => {
      if (!landmarks[a] || !landmarks[b]) return;
      const ax = ex(landmarks[a]), ay = ey(landmarks[a]);
      const bx = ex(landmarks[b]), by = ey(landmarks[b]);
      const pulso = 0.6 + Math.sin(pool.tick * 0.1 + a) * 0.4;
      ctx.save();
      ctx.strokeStyle = c0;
      ctx.lineWidth   = 6;
      ctx.globalAlpha = pulso * 0.7;
      ctx.shadowBlur  = 18; ctx.shadowColor = c1;
      ctx.lineCap     = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth   = 2;
      ctx.globalAlpha = pulso * 0.4;
      ctx.shadowBlur  = 0;
      ctx.stroke();
      ctx.restore();
    });
    joints.forEach((j, i) => {
      const p2 = 0.7 + Math.sin(pool.tick * 0.12 + i) * 0.3;
      ctx.save();
      ctx.beginPath(); ctx.arc(ex(j), ey(j), 7, 0, Math.PI * 2);
      ctx.fillStyle   = c1;
      ctx.globalAlpha = p2;
      ctx.shadowBlur  = 15; ctx.shadowColor = c0;
      ctx.fill();
      ctx.restore();
    });
  }

  if (tier >= 5) {
    if (pool.tick % 30 === 0) {
      for (let i = 0; i < 15; i++) {
        const ang   = (i / 15) * Math.PI * 2;
        const speed = 2 + Math.random() * 3;
        pool.particulas.push({
          x: cX + (Math.random() - 0.5) * anchoH,
          y: cY + (Math.random() - 0.5) * anchoH * 1.5,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed - 1,
          vida: 40, vidaMax: 40,
          color: palette[Math.floor(Math.random() * palette.length)],
          tipo: 'explosion', size: 3 + Math.random() * 5,
        });
      }
    }
    if (cadDer && cadIzq) {
      const cCadX    = (ex(cadDer) + ex(cadIzq)) / 2;
      const cCadY    = (ey(cadDer) + ey(cadIzq)) / 2;
      const altCuerpo = Math.hypot(cX - cCadX, cY - cCadY);
      const pulsoAura = 1 + Math.sin(pool.tick * 0.07) * 0.2;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse((cX + cCadX) / 2, (cY + cCadY) / 2, anchoH * 0.75 * pulsoAura, altCuerpo * 0.65 * pulsoAura, 0, 0, Math.PI * 2);
      ctx.strokeStyle = c2;
      ctx.lineWidth   = 3;
      ctx.globalAlpha = 0.4 + Math.sin(pool.tick * 0.07) * 0.2;
      ctx.shadowBlur  = 30; ctx.shadowColor = c2;
      ctx.stroke();
      ctx.restore();
    }
  }

  pool.particulas = pool.particulas.filter(p => p.vida > 0);
  pool.particulas.forEach(p => {
    p.x    += p.vx;
    p.y    += p.vy;
    p.vy   += 0.05;
    p.vida -= 1;

    const alpha = Math.max(0, p.vida / p.vidaMax);
    if (alpha <= 0) return;
    const radio = Math.max(0.1, p.size * alpha);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = p.color;
    ctx.shadowBlur  = 8; ctx.shadowColor = p.color;

    if (p.tipo === 'chispa' || p.tipo === 'gema') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, radio, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth   = 1;
      ctx.shadowBlur  = 0;
      ctx.beginPath();
      ctx.moveTo(p.x - p.size, p.y); ctx.lineTo(p.x + p.size, p.y);
      ctx.moveTo(p.x, p.y - p.size); ctx.lineTo(p.x, p.y + p.size);
      ctx.stroke();
    } else if (p.tipo === 'llama') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, radio, 0, Math.PI * 2);
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      grd.addColorStop(0, '#FFFFFF');
      grd.addColorStop(0.4, p.color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fill();
    } else {
      const r = Math.max(0.1, p.size);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  if (pool.particulas.length > 200) {
    pool.particulas = pool.particulas.slice(-200);
  }
};

export const infoProgreso = (xpTotal) => {
  const tier    = getTier(xpTotal);
  const nextTier = tier + 1;
  if (nextTier >= TIER_INFO.length) return { tier, nextTier: null, pct: 100, falta: 0 };
  const xpActual = TIERS_XP[tier];
  const xpSig    = TIERS_XP[nextTier];
  const pct      = Math.round(((xpTotal - xpActual) / (xpSig - xpActual)) * 100);
  const falta    = xpSig - xpTotal;
  return { tier, nextTier, pct: Math.min(100, pct), falta, nombreSig: TIER_INFO[nextTier].nombre };
};

// ── 4. ESTILOS DE PERSONAJE Y RENDERIZADO ──────────────────

export const ESTILOS_PERSONAJE = [
  { id: 0,  nombre: 'Base',            icono: '🧍', desc: 'Sin accesorio' },
  { id: 1,  nombre: 'Fedora',          icono: '🎩', desc: 'Sombrero + cadena' },
  { id: 2,  nombre: 'DJ',              icono: '🎧', desc: 'Audífonos grandes' },
  { id: 3,  nombre: 'Snapback',        icono: '🧢', desc: 'Gorra con visera' },
  { id: 4,  nombre: 'Bucket Hat',      icono: '🪣', desc: 'Sombrero bucket' },
  { id: 5,  nombre: 'Lentes Neon',     icono: '😎', desc: 'Lentes de sol neon' },
  { id: 6,  nombre: 'Bigote Italiano', icono: '🥸', desc: 'Bigote enroscado' },
  { id: 7,  nombre: 'Charro',          icono: '🤠', desc: 'Sombrero charro' },
  { id: 8,  nombre: 'Corona',          icono: '👑', desc: 'Corona real' },
  { id: 9,  nombre: 'Barba Mentón',    icono: '🧔', desc: 'Barba solo mentón' },
  { id: 11, nombre: 'Sombrero Mujer',  icono: '🎀', desc: 'Sombrero con pluma' },
  { id: 12, nombre: 'Sudadera Gorro',  icono: '🧥', desc: 'Hoodie con capucha' },
  { id: 13, nombre: 'Lentes Cat-Eye',  icono: '😻', desc: 'Lentes de mujer' },
  { id: 14, nombre: 'Pelo Largo',      icono: '👩', desc: 'Cabello liso realista' },
  { id: 15, nombre: 'Pelo Ondulado',   icono: '💇', desc: 'Ondas volumétricas' },
  { id: 16, nombre: 'Aretes Redondos', icono: '⭕', desc: 'Aretes simples' },
  { id: 17, nombre: 'Aretes Colgantes',icono: '💎', desc: 'Aretes largos' },
  { id: 18, nombre: 'Cara Simple',     icono: '👁️', desc: 'Ojos, nariz y boca' },
  { id: 19, nombre: 'Capa Superman',   icono: '🦸', desc: 'Capa en espalda' },
];

export const CATEGORIAS = {
  SOMBRERO: [1, 3, 4, 7, 8, 11, 12],
  LENTES:   [5, 13],
  VELLO:    [6, 9],
  CABELLO:  [14, 15],
  ARETES:   [16, 17],
  CARA:     [18],
  CUERPO:   [2, 19],
};

const _cabeza = (landmarks, W, H) => {
  const ex = n => (1 - n.x) * W;
  const ey = n => n.y * H;

  const nariz = landmarks[0], ojL = landmarks[2], ojR = landmarks[5];
  const homL  = landmarks[11], homR = landmarks[12];
  if (!nariz || !homL || !homR) return null;

  const nX     = ex(nariz), nY = ey(nariz);
  const anchoH = Math.hypot(ex(homL) - ex(homR), ey(homL) - ey(homR));
  const rc     = Math.max(22, anchoH * 0.35);

  let ang = 0, distOj = rc * 0.4;
  if (ojL && ojR) {
    ang    = Math.atan2(ey(ojR) - ey(ojL), ex(ojR) - ex(ojL));
    distOj = Math.hypot(ex(ojL) - ex(ojR), ey(ojL) - ey(ojR));
  }

  const hc        = distOj * 2.5;
  const centroOjX = ojL && ojR ? (ex(ojL) + ex(ojR)) / 2 : nX;
  const centroOjY = ojL && ojR ? (ey(ojL) + ey(ojR)) / 2 : nY - rc * 0.25;
  const techoX    = nX + Math.sin(ang)  * rc * 0.82;
  const techoY    = nY - Math.cos(ang)  * rc * 0.82;

  return { nX, nY, rc, hc, ang, centroOjX, centroOjY, techoX, techoY };
};

export const ESTILO_XP = {
  0:0, 18:0, 16:0, 19:0,
  5:100, 6:100, 9:100, 14:100,
  2:300, 3:300, 4:300, 15:300, 17:300,
  1:600, 7:600, 13:600,
  11:1000, 12:1000,
  8:2000,
};

export const PALETA_CABELLO = [
  { hex:'#1A1A1A', label:'Negro' },
  { hex:'#6B3A2A', label:'Castaño' },
  { hex:'#8B4513', label:'Café' },
  { hex:'#7B3F00', label:'Caoba' },
  { hex:'#C0392B', label:'Rojizo' },
  { hex:'#FFD700', label:'Rubio' },
  { hex:'#9E9E9E', label:'Gris' },
  { hex:'#F5F5F5', label:'Blanco' },
];

export const PALETA_LENTES_SOMB = [
  { hex:'#1C1C1E', label:'Negro' },
  { hex:'#FFFFFF', label:'Blanco' },
  { hex:'#FF69B4', label:'Rosa' },
  { hex:'#8B4513', label:'Café' },
  { hex:'#FFD700', label:'Dorado' },
  { hex:'#CC2200', label:'Rojo' },
  { hex:'#1565C0', label:'Azul' },
  { hex:'#2E7D32', label:'Verde' },
  { hex:'#9B59B6', label:'Lila' },
];

export const PALETA_ARETES = [
  { hex:'#FFD700', label:'Dorado' },
  { hex:'#C0C0C0', label:'Plata' },
  { hex:'#FF69B4', label:'Rosa' },
  { hex:'#E91E63', label:'Rubí' },
  { hex:'#1565C0', label:'Zafiro' },
  { hex:'#2E7D32', label:'Esmeralda' },
  { hex:'#FF6B6B', label:'Coral' },
  { hex:'#F5F0E8', label:'Perla' },
];

export function getPaletaParaEstilo(ids) {
  const arr            = Array.isArray(ids) ? ids : [ids];
  const tieneCabello   = arr.some(id => [14, 15].includes(id));
  const tieneAretes    = arr.some(id => [16, 17].includes(id));
  const tieneLenteSomb = arr.some(id => [1,3,4,5,7,8,11,12,13,19].includes(id));
  if (tieneCabello && tieneAretes) return [...PALETA_CABELLO, ...PALETA_ARETES];
  if (tieneCabello)                return PALETA_CABELLO;
  if (tieneAretes)                 return PALETA_ARETES;
  if (tieneLenteSomb)              return PALETA_LENTES_SOMB;
  return PALETA_LENTES_SOMB;
}

export const COLORES_ACCESORIO = [
  { id:'tema',    label:'Tema',    hex:null },
  { id:'#1C1C1E', label:'Negro',   hex:'#1C1C1E' },
  { id:'#F5F5F5', label:'Blanco',  hex:'#F5F5F5' },
  { id:'#FF69B4', label:'Rosa',    hex:'#FF69B4' },
  { id:'#8B4513', label:'Café',    hex:'#8B4513' },
  { id:'#FFD700', label:'Rubio',   hex:'#FFD700' },
  { id:'#6B3A2A', label:'Castaño', hex:'#6B3A2A' },
  { id:'#CC2200', label:'Rojo',    hex:'#CC2200' },
  { id:'#9B59B6', label:'Lila',    hex:'#9B59B6' },
];

export function resolverCapas(ids) {
  const lista     = Array.isArray(ids) ? [...ids] : (ids > 0 ? [ids] : []);
  const uniq      = [...new Set(lista)];
  const sombreros = uniq.filter(id => CATEGORIAS.SOMBRERO.includes(id));
  const lentes    = uniq.filter(id => CATEGORIAS.LENTES.includes(id));
  const activos   = uniq.filter(id => {
    if (CATEGORIAS.SOMBRERO.includes(id)) return id === sombreros[0];
    if (CATEGORIAS.LENTES.includes(id))   return id === lentes[0];
    return true;
  });
  const ORDEN = [
    ...CATEGORIAS.CABELLO, ...CATEGORIAS.CARA, ...CATEGORIAS.ARETES,
    ...CATEGORIAS.SOMBRERO, ...CATEGORIAS.CUERPO, ...CATEGORIAS.LENTES,
    ...CATEGORIAS.VELLO,
  ];
  return activos.sort((a, b) => {
    const ia = ORDEN.indexOf(a), ib = ORDEN.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

const _aplicarEfectoPremium = (ctx, tipo, colorEfectivo, rc, tick) => {
  if (tipo === 'tejido') {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    const limit = rc * 2.5;
    for (let i = -limit; i < limit; i += 16) {
      ctx.moveTo(i, -limit); ctx.lineTo(i + limit,  limit);
      ctx.moveTo(i,  limit); ctx.lineTo(i + limit, -limit);
    }
    ctx.stroke();
    ctx.restore();
  } else if (tipo === 'cristal') {
    ctx.globalCompositeOperation = 'screen';
    const grad = ctx.createLinearGradient(-rc, -rc, rc, rc);
    grad.addColorStop(0,   'rgba(255,255,255,0)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.05)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-rc * 2, -rc * 2, rc * 4, rc * 4);
    ctx.globalCompositeOperation = 'source-over';
  } else if (tipo === 'oro' || tipo === 'plata' || tipo === 'gema') {
    const destelloPulso = Math.sin(tick * 0.1) * 0.5 + 0.5;
    if (destelloPulso > 0.8) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle  = '#FFFFFF';
      ctx.shadowBlur = 15; ctx.shadowColor = colorEfectivo;
      const r = rc * 0.15 * destelloPulso;
      ctx.beginPath();
      ctx.moveTo(0, -r*2); ctx.quadraticCurveTo(0, 0,  r, 0);
      ctx.quadraticCurveTo(0, 0,  0, r*2);
      ctx.quadraticCurveTo(0, 0, -r, 0);
      ctx.quadraticCurveTo(0, 0,  0, -r*2);
      ctx.fill();
      ctx.restore();
    }
  } else if (tipo === 'pelo') {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(-rc*3, -rc*3, rc*6, rc*6);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(0, rc * 1.5, rc * 2, 0, Math.PI, true);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
};

// ══════════════════════════════════════════════════════════════
// HELPERS COMPARTIDOS PARA ESTILOS 14 y 15
// ══════════════════════════════════════════════════════════════

// Seed determinístico tipo golden-angle.
// Produce valores [0..1] estables entre frames — nunca Math.random() en render.
function _gs(i, f) {
  const k = [137.508, 198.234, 312.791, 451.103, 89.567, 253.918, 174.632];
  return Math.abs(Math.sin(i * k[f % k.length]));
}

// Triple-pass strand renderer — la técnica exacta de las referencias.
// Pasada 1: halo exterior amplio
// Pasada 2: trazo core definido
// Pasada 3: highlight blanco (efecto neón real)
function _triplePass(ctx, strands, color) {
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';

  // Pasada 1 — halo
  ctx.globalAlpha = 0.45;
  ctx.shadowColor = color;
  ctx.shadowBlur  = 32;
  for (const s of strands) {
    ctx.beginPath();
    ctx.moveTo(s.rx, s.ry);
    ctx.bezierCurveTo(s.c1x, s.c1y, s.c2x, s.c2y, s.ex, s.ey);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 4 + s.w * 3.5;
    ctx.stroke();
  }

  // Pasada 2 — core
  ctx.globalAlpha = 0.90;
  ctx.shadowBlur  = 14;
  for (const s of strands) {
    ctx.beginPath();
    ctx.moveTo(s.rx, s.ry);
    ctx.bezierCurveTo(s.c1x, s.c1y, s.c2x, s.c2y, s.ex, s.ey);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.4 + s.w * 1.8;
    ctx.stroke();
  }

  // Pasada 3 — highlight blanco (cada 3 mechones)
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#FFFFFF';
  ctx.shadowColor = '#FFFFFF';
  ctx.shadowBlur  = 5;
  for (let i = 0; i < strands.length; i++) {
    if (i % 3 !== 1) continue;
    const s = strands[i];
    ctx.beginPath();
    ctx.moveTo(s.rx, s.ry);
    ctx.bezierCurveTo(s.c1x, s.c1y, s.c2x, s.c2y, s.ex, s.ey);
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  ctx.globalAlpha = 1.0;
  ctx.shadowBlur  = 0;
}

export function renderEstiloPersonaje(ctx, landmarks, W, H, estilosInput, colorBase, tick = 0, colorAccesorio = null) {
  const capas = resolverCapas(estilosInput);
  for (const estiloId of capas) {
    _renderCapa(ctx, landmarks, W, H, estiloId, colorBase, tick, colorAccesorio);
  }
}

function _renderCapa(ctx, landmarks, W, H, estiloId, colorBase, tick, colorAccesorio) {
  if (!landmarks || estiloId === 0) return;
  const colorEfectivo = colorAccesorio || colorBase;
  const ex  = n => (1 - n.x) * W;
  const ey  = n => n.y * H;
  const cab = _cabeza(landmarks, W, H);
  if (!cab) return;

  const { nX, nY, rc, hc, ang, centroOjX, centroOjY, techoX, techoY } = cab;

  const _lentes = (forma = 'oval', color = colorEfectivo, opacidad = 0.5) => {
    ctx.save();
    ctx.translate(centroOjX, centroOjY);
    ctx.rotate(ang);
    ctx.strokeStyle = color;
    ctx.lineWidth   = rc * 0.07;
    ctx.shadowBlur  = 10; ctx.shadowColor = color;
    ctx.fillStyle   = color + Math.round(opacidad * 255).toString(16).padStart(2, '0');

    const rx = rc * 0.28, ry = rc * (forma === 'redondo' ? 0.28 : 0.17);
    const sep = rc * 0.40;

    ctx.beginPath();
    ctx.ellipse(-sep, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.moveTo(sep + rx, 0);
    ctx.ellipse( sep, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    ctx.save(); ctx.clip();
    _aplicarEfectoPremium(ctx, 'cristal', color, rc, tick);
    ctx.restore();

    ctx.beginPath(); ctx.moveTo(-sep + rx, 0); ctx.lineTo(sep - rx, 0);
    ctx.lineWidth = rc * 0.05; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-sep - rx, 0); ctx.lineTo(-sep - rx * 1.5, rc * 0.08); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( sep + rx, 0); ctx.lineTo( sep + rx * 1.5, rc * 0.08); ctx.stroke();

    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#FFF'; ctx.lineWidth = rc * 0.05;
    ctx.beginPath(); ctx.moveTo(-sep - rc * 0.12, -ry * 0.4); ctx.lineTo(-sep + rc * 0.0, -ry * 0.15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( sep - rc * 0.12, -ry * 0.4); ctx.lineTo( sep + rc * 0.0, -ry * 0.15); ctx.stroke();
    ctx.restore();
  };

  // ──────────────────────────────────────────────────────────
  // ESTILO 1: FEDORA
  // ──────────────────────────────────────────────────────────
  if (estiloId === 1) {
    ctx.save();
    ctx.translate(techoX, techoY); ctx.rotate(ang);
    ctx.strokeStyle = colorEfectivo; ctx.lineWidth = rc * 0.08;
    ctx.shadowBlur  = 12; ctx.shadowColor = colorEfectivo;

    ctx.beginPath();
    ctx.ellipse(0, 0, rc * 1.4, rc * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = colorEfectivo + 'E6';
    ctx.fill(); ctx.stroke();
    _aplicarEfectoPremium(ctx, 'tejido', colorEfectivo, rc, tick);

    ctx.beginPath();
    ctx.moveTo(-rc * 0.65, 0); ctx.lineTo(-rc * 0.52, -rc * 1.0);
    ctx.quadraticCurveTo(0, -rc * 1.2, rc * 0.52, -rc * 1.0); ctx.lineTo(rc * 0.65, 0);
    ctx.fillStyle = colorEfectivo; ctx.fill(); ctx.stroke();
    _aplicarEfectoPremium(ctx, 'tejido', colorEfectivo, rc, tick);

    ctx.beginPath();
    ctx.moveTo(-rc * 0.63, -rc * 0.25); ctx.lineTo(rc * 0.63, -rc * 0.25);
    ctx.lineWidth = rc * 0.12; ctx.strokeStyle = '#FFD700'; ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(nX, nY + rc * 1.1); ctx.rotate(ang);
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = rc * 0.06;
    ctx.shadowBlur  = 10; ctx.shadowColor = '#FFD700';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(i * rc * 0.16, Math.abs(i) * rc * 0.07, rc * 0.09, rc * 0.055, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font         = `bold ${Math.round(rc * 0.5)}px sans-serif`;
    ctx.fillStyle    = '#FFD700'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.shadowBlur   = 12; ctx.globalAlpha = 1;
    ctx.fillText('⚓', 0, rc * 0.22);
    ctx.restore();
    return;
  }

  // ──────────────────────────────────────────────────────────
  // ESTILO 2: DJ
  // ──────────────────────────────────────────────────────────
  if (estiloId === 2) {
    ctx.save();
    ctx.translate(nX, nY); ctx.rotate(ang);
    ctx.strokeStyle = colorEfectivo; ctx.lineWidth = rc * 0.1;
    ctx.shadowBlur  = 14; ctx.shadowColor = colorEfectivo;

    const arcoR = rc * 1.05;
    ctx.beginPath(); ctx.arc(0, -rc * 0.35, arcoR, Math.PI * 1.05, 0.05); ctx.stroke();
    const cYdj = -rc * 0.35;
    [-1, 1].forEach(lado => {
      const cx = lado * arcoR * 0.97;
      ctx.beginPath(); ctx.arc(cx, cYdj, rc * 0.40, 0, Math.PI * 2);
      ctx.fillStyle = colorEfectivo; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cYdj, rc * 0.22, 0, Math.PI * 2); ctx.fillStyle = '#C0C0C0'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cYdj, rc * 0.18, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cYdj - rc * 0.08, rc * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = '#00FF00'; ctx.shadowBlur = 15; ctx.shadowColor = '#00FF00'; ctx.fill();
      ctx.shadowBlur = 14; ctx.shadowColor = colorEfectivo;
    });
    ctx.restore();
    return;
  }

  // ──────────────────────────────────────────────────────────
  // ESTILO 3: SNAPBACK
  // ──────────────────────────────────────────────────────────
  if (estiloId === 3) {
    ctx.save();
    ctx.translate(techoX, techoY); ctx.rotate(ang);
    ctx.strokeStyle = colorEfectivo; ctx.lineWidth = rc * 0.08;
    ctx.shadowBlur  = 10; ctx.shadowColor = colorEfectivo;

    ctx.beginPath();
    ctx.moveTo(-rc * 0.80, 0); ctx.lineTo(-rc * 0.70, -rc * 0.9);
    ctx.arc(0, -rc * 0.9, rc * 0.70, Math.PI, 0); ctx.lineTo(rc * 0.80, 0); ctx.closePath();
    ctx.fillStyle = colorEfectivo; ctx.fill(); ctx.stroke();
    _aplicarEfectoPremium(ctx, 'tejido', colorEfectivo, rc, tick);

    ctx.beginPath();
    ctx.moveTo(-rc * 0.80, 0); ctx.quadraticCurveTo(0, rc * 0.25, rc * 0.80, 0);
    ctx.quadraticCurveTo(rc * 1.1, -rc * 0.05, rc * 1.2, -rc * 0.12);
    ctx.quadraticCurveTo(rc * 0.95, -rc * 0.25, rc * 0.80, 0);
    ctx.fillStyle = colorEfectivo; ctx.fill(); ctx.stroke();

    ctx.beginPath(); ctx.arc(0, -rc * 1.55, rc * 0.12, 0, Math.PI * 2); ctx.fillStyle = '#FFF'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-rc * 0.78, -rc * 0.15); ctx.lineTo(rc * 0.78, -rc * 0.15);
    ctx.lineWidth = rc * 0.06; ctx.stroke();
    ctx.restore();

    if (landmarks[16]) {
      const munX = ex(landmarks[16]), munY = ey(landmarks[16]);
      ctx.save(); ctx.translate(munX, munY);
      ctx.strokeStyle = colorEfectivo; ctx.lineWidth = 2.5;
      ctx.shadowBlur  = 8; ctx.shadowColor = colorEfectivo;
      ctx.beginPath(); ctx.rect(-rc * 0.2, -rc * 0.7, rc * 0.4, rc * 0.75);
      ctx.fillStyle = colorEfectivo; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(-rc * 0.14, -rc * 0.95, rc * 0.28, rc * 0.28);
      ctx.fillStyle = '#FFF'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rc * 0.14, -rc * 0.82); ctx.lineTo(rc * 0.4, -rc * 0.82);
      ctx.lineWidth = rc * 0.09; ctx.stroke();
      const pulso = 0.4 + 0.4 * Math.sin((tick || 0) * 0.2);
      ctx.globalAlpha = pulso;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(rc * (0.5 + i * 0.25), -rc * (0.78 + i * 0.05), rc * (0.12 + i * 0.04), 0, Math.PI * 2);
        ctx.fillStyle = colorEfectivo; ctx.fill();
      }
      ctx.restore();
    }
    return;
  }

  // ──────────────────────────────────────────────────────────
  // ESTILO 4: BUCKET HAT
  // ──────────────────────────────────────────────────────────
  if (estiloId === 4) {
    ctx.save();
    ctx.translate(techoX, techoY); ctx.rotate(ang);
    ctx.strokeStyle = colorEfectivo; ctx.lineWidth = rc * 0.08;
    ctx.shadowBlur  = 10; ctx.shadowColor = colorEfectivo;

    ctx.beginPath();
    ctx.ellipse(0, 0, rc * 1.30, rc * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = colorEfectivo + 'EE'; ctx.fill(); ctx.stroke();
    _aplicarEfectoPremium(ctx, 'tejido', colorEfectivo, rc, tick);

    ctx.beginPath();
    ctx.moveTo(-rc * 0.72, 0); ctx.lineTo(-rc * 0.58, -rc * 0.80);
    ctx.quadraticCurveTo(0, -rc * 1.05, rc * 0.58, -rc * 0.80); ctx.lineTo(rc * 0.72, 0);
    ctx.fillStyle = colorEfectivo; ctx.fill(); ctx.stroke();
    _aplicarEfectoPremium(ctx, 'tejido', colorEfectivo, rc, tick);

    ctx.beginPath(); ctx.moveTo(-rc * 0.70, -rc * 0.20); ctx.lineTo(rc * 0.70, -rc * 0.20);
    ctx.strokeStyle = '#111'; ctx.lineWidth = rc * 0.08; ctx.stroke();
    ctx.restore();

    _lentes('redondo', colorEfectivo, 0.8);
    return;
  }

  // ──────────────────────────────────────────────────────────
  // ESTILO 5: LENTES NEON
  // ──────────────────────────────────────────────────────────
  if (estiloId === 5) {
    _lentes('oval', colorEfectivo, 0.85);
    return;
  }

  const _posCaraY = (offsetRc) => nY + rc * offsetRc;

  const _dibujarBigote = () => {
    ctx.save(); ctx.translate(nX, _posCaraY(0.42)); ctx.rotate(ang);
    ctx.strokeStyle = '#111'; ctx.lineWidth = rc * 0.04;
    ctx.fillStyle   = colorEfectivo;
    ctx.shadowBlur  = 5; ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.lineCap     = 'round'; ctx.lineJoin = 'round';
    const dibujarMitad = (s) => {
      ctx.beginPath(); ctx.moveTo(s * rc * 0.06, rc * 0.02);
      ctx.bezierCurveTo( s*rc*0.22, -rc*0.18, s*rc*0.55, -rc*0.22, s*rc*0.72, -rc*0.10);
      ctx.bezierCurveTo( s*rc*0.85,  rc*0.04, s*rc*0.90,  rc*0.18, s*rc*0.82,  rc*0.28);
      ctx.bezierCurveTo( s*rc*0.68,  rc*0.42, s*rc*0.50,  rc*0.40, s*rc*0.55,  rc*0.24);
      ctx.bezierCurveTo( s*rc*0.60,  rc*0.12, s*rc*0.72,  rc*0.10, s*rc*0.68,  rc*0.22);
      ctx.fill(); ctx.stroke();
    };
    dibujarMitad(1); dibujarMitad(-1);
    ctx.beginPath(); ctx.arc(0, 0, rc * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  const _dibujarBarba = () => {
    ctx.save(); ctx.translate(nX, _posCaraY(0.85)); ctx.rotate(ang);
    ctx.strokeStyle = '#111'; ctx.lineWidth = rc * 0.04;
    ctx.fillStyle   = colorEfectivo;
    ctx.shadowBlur  = 5; ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const bw = rc * 0.42, bh = rc * 0.55;
    ctx.beginPath(); ctx.moveTo(-bw*0.70, -bh*0.10);
    ctx.bezierCurveTo(-bw*0.85, -bh*0.05, -bw,  bh*0.25, -bw*0.80, bh*0.70);
    ctx.bezierCurveTo(-bw*0.60,  bh*1.0,   0,   bh*1.05,  bw*0.60, bh*1.0);
    ctx.bezierCurveTo( bw*0.80,  bh*0.70,  bw,  bh*0.25,  bw*0.85, -bh*0.05);
    ctx.lineTo(bw*0.70, -bh*0.10);
    ctx.bezierCurveTo(bw*0.35, -bh*0.25, -bw*0.35, -bh*0.25, -bw*0.70, -bh*0.10);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = rc * 0.03;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * bw * 0.20, -bh * 0.05);
      ctx.bezierCurveTo(i*bw*0.22, bh*0.5, i*bw*0.18, bh*0.8, i*bw*0.20, bh*0.95);
      ctx.stroke();
    }
    ctx.restore();
  };

  if (estiloId === 6) { _dibujarBigote(); return; }

  // ──────────────────────────────────────────────────────────
  // ESTILO 7: CHARRO
  // ──────────────────────────────────────────────────────────
  if (estiloId === 7) {
    ctx.save(); ctx.translate(techoX, techoY); ctx.rotate(ang);
    ctx.strokeStyle = colorEfectivo; ctx.lineWidth = rc * 0.08;
    ctx.shadowBlur  = 12; ctx.shadowColor = colorEfectivo;

    ctx.beginPath();
    ctx.moveTo(-rc*1.9, rc*0.10);
    ctx.quadraticCurveTo(-rc*1.4, -rc*0.15, -rc*0.75, 0); ctx.lineTo(rc*0.75, 0);
    ctx.quadraticCurveTo( rc*1.4, -rc*0.15,  rc*1.9, rc*0.10);
    ctx.fillStyle = colorEfectivo; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, rc*0.75, rc*0.14, 0, 0, Math.PI*2);
    ctx.fillStyle = colorEfectivo; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-rc*0.68, 0); ctx.lineTo(-rc*0.50, -rc*1.15);
    ctx.quadraticCurveTo(0, -rc*1.35, rc*0.50, -rc*1.15); ctx.lineTo(rc*0.68, 0);
    ctx.fillStyle = colorEfectivo; ctx.fill(); ctx.stroke();
    _aplicarEfectoPremium(ctx, 'tejido', colorEfectivo, rc, tick);

    ctx.lineWidth = rc * 0.05;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.arc(i * rc*0.22, rc*0.06, rc*0.06, 0, Math.PI*2);
      ctx.fillStyle = '#FFD700'; ctx.shadowBlur = 5; ctx.shadowColor = '#FFD700'; ctx.fill();
    }
    ctx.restore();
    return;
  }

  // ──────────────────────────────────────────────────────────
  // ESTILO 8: CORONA
  // ──────────────────────────────────────────────────────────
  if (estiloId === 8) {
    ctx.save(); ctx.translate(techoX, techoY); ctx.rotate(ang);
    const grad = ctx.createLinearGradient(-rc, -rc, rc, rc);
    grad.addColorStop(0, '#FFD700'); grad.addColorStop(0.5, '#FFF8DC'); grad.addColorStop(1, '#DAA520');
    ctx.strokeStyle = '#B8860B'; ctx.lineWidth = rc * 0.05;
    ctx.shadowBlur  = 20; ctx.shadowColor = '#FFD700';

    const cW = rc * 1.1, cH = rc * 0.65;
    ctx.beginPath();
    ctx.moveTo(-cW, rc*0.08); ctx.lineTo(-cW, -rc*0.10);
    ctx.lineTo(-cW*0.65, -cH*0.8); ctx.lineTo(-cW*0.40, -rc*0.10); ctx.lineTo(0, -cH);
    ctx.lineTo( cW*0.40, -rc*0.10); ctx.lineTo( cW*0.65, -cH*0.8); ctx.lineTo( cW, -rc*0.10);
    ctx.lineTo(cW, rc*0.08); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill(); ctx.stroke();

    [[0, -cH], [-cW*0.65, -cH*0.8], [cW*0.65, -cH*0.8]].forEach(([jx, jy]) => {
      ctx.beginPath(); ctx.arc(jx, jy, rc*0.15, 0, Math.PI*2);
      ctx.fillStyle = '#FF0000'; ctx.shadowBlur = 10; ctx.shadowColor = '#FF0000'; ctx.fill();
      ctx.translate(jx, jy); _aplicarEfectoPremium(ctx, 'gema', '#FF0000', rc, tick); ctx.translate(-jx, -jy);
    });
    ctx.restore();
    return;
  }

  if (estiloId === 9) { _dibujarBarba(); return; }

  // ──────────────────────────────────────────────────────────
  // ESTILO 11: SOMBRERO MUJER
  // ──────────────────────────────────────────────────────────
  if (estiloId === 11) {
    ctx.save(); ctx.translate(techoX, techoY); ctx.rotate(ang);
    const cEf = colorEfectivo;
    ctx.beginPath(); ctx.ellipse(0, rc*0.12, rc*1.55, rc*0.24, 0, 0, Math.PI*2);
    ctx.fillStyle = cEf; ctx.shadowBlur = 10; ctx.shadowColor = cEf;
    ctx.fill(); ctx.strokeStyle = cEf; ctx.lineWidth = rc*0.06; ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-rc*0.52, rc*0.10);
    ctx.bezierCurveTo(-rc*0.55, -rc*0.60, rc*0.55, -rc*0.60, rc*0.52, rc*0.10);
    ctx.closePath(); ctx.fillStyle = cEf; ctx.fill(); ctx.stroke();
    _aplicarEfectoPremium(ctx, 'tejido', cEf, rc, tick);

    ctx.beginPath(); ctx.rect(-rc*0.50, -rc*0.05, rc*1.0, rc*0.14);
    ctx.fillStyle = '#FFD700'; ctx.shadowBlur = 5; ctx.shadowColor = '#FFD700'; ctx.fill();

    const wave = Math.sin(tick * 0.04) * rc * 0.06;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = rc*0.08;
    ctx.shadowBlur  = 15; ctx.shadowColor = '#FFFFFF'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(rc*0.38, -rc*0.08);
    ctx.bezierCurveTo(rc*0.55, -rc*0.55+wave, rc*0.75, -rc*0.80+wave, rc*0.60, -rc*1.10+wave);
    ctx.stroke();
    ctx.lineWidth = rc*0.03; ctx.strokeStyle = '#F0F8FF';
    for (let i = 0; i < 5; i++) {
      const t  = 0.2 + i * 0.15;
      const px = rc*0.38 + (rc*0.22)*t;
      const py = -rc*0.08 + (-rc*1.02 + rc*0.08)*t + wave*t;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + rc*(0.12-i*0.02), py - rc*0.18); ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // ──────────────────────────────────────────────────────────
  // ESTILO 12: SUDADERA GORRO
  // ──────────────────────────────────────────────────────────
  if (estiloId === 12) {
    ctx.save();
    ctx.translate(nX, nY); ctx.rotate(ang);
    const cEf = colorEfectivo;

    ctx.beginPath();
    ctx.arc(0, -rc*0.2, rc*1.0, Math.PI*0.7, Math.PI*2.3);
    ctx.strokeStyle = cEf; ctx.lineWidth = rc*0.30; ctx.lineCap = 'round';
    ctx.stroke();
    _aplicarEfectoPremium(ctx, 'tejido', cEf, rc*2, tick);

    ctx.strokeStyle = '#FFF'; ctx.lineWidth = rc*0.06;
    ctx.beginPath();
    ctx.moveTo(-rc*0.4, rc*0.3); ctx.lineTo(-rc*0.4, rc*0.9);
    ctx.moveTo( rc*0.4, rc*0.3); ctx.lineTo( rc*0.4, rc*0.9);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // ──────────────────────────────────────────────────────────
  // ESTILO 13: LENTES CAT-EYE
  // ──────────────────────────────────────────────────────────
  if (estiloId === 13) {
    ctx.save(); ctx.translate(centroOjX, centroOjY); ctx.rotate(ang);
    const cEf = colorEfectivo;
    const lw = rc*0.80, lh = rc*0.34;
    ctx.shadowBlur = 12; ctx.shadowColor = cEf;

    ctx.beginPath();
    const dibujarLenteCat = (s) => {
      ctx.moveTo(s*rc*0.04, 0);
      ctx.bezierCurveTo(s*rc*0.10,   lh*0.6,  s*lw*0.90,  lh*0.7,  s*lw,       lh*0.2);
      ctx.bezierCurveTo(s*lw*1.05,  -lh*0.5,  s*lw*0.95, -lh*0.9,  s*lw*0.80, -lh*0.95);
      ctx.bezierCurveTo(s*lw*0.50,  -lh*1.1,  s*rc*0.25, -lh*0.85, s*rc*0.04, -lh*0.10);
    };
    dibujarLenteCat(1); dibujarLenteCat(-1);
    ctx.fillStyle   = 'rgba(20,20,20,0.85)';
    ctx.strokeStyle = cEf; ctx.lineWidth = rc*0.12;
    ctx.fill(); ctx.stroke();

    ctx.save(); ctx.clip();
    _aplicarEfectoPremium(ctx, 'cristal', cEf, rc, tick);
    ctx.restore();

    ctx.beginPath(); ctx.moveTo(-rc*0.04, -lh*0.05); ctx.lineTo(rc*0.04, -lh*0.05);
    ctx.strokeStyle = cEf; ctx.lineWidth = rc*0.08; ctx.stroke();
    ctx.strokeStyle = '#111'; ctx.lineWidth = rc*0.06;
    ctx.beginPath(); ctx.moveTo(-lw*0.98,  lh*0.15); ctx.lineTo(-lw*1.25, lh*0.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( lw*0.98,  lh*0.15); ctx.lineTo( lw*1.25, lh*0.05); ctx.stroke();
    ctx.restore();
    return;
  }

  // ══════════════════════════════════════════════════════════
  // ESTILO 14: PELO LARGO LISO — Strand-based neón tier 1
  //
  // GEOMETRÍA CORRECTA (calco exacto de la referencia):
  //  • Raíces en BANDA HORIZONTAL ANCHA [−rc*1.08 … +rc*1.08]
  //  • Caída casi vertical — drift proporcional a posición lateral
  //  • Mechones centrales más cortos, laterales más largos
  //  • Triple-pass: halo → core → highlight blanco
  //  • Detección de sombrero: sube el ancla si hay capa alta
  // ══════════════════════════════════════════════════════════
  if (estiloId === 14) {
    ctx.save();
    const YELLOW = colorEfectivo;
    const CYAN   = '#00FFFF';
    const WHITE  = '#FFFFFF';
    const N      = 20;

    // Detección de sombrero activo — ancla dinámica
    const hayCapaAlta  = techoY < nY - rc * 1.2;
    const anclaOffsetY = hayCapaAlta ? rc * 1.05 : rc * 0.72;
    const ox = nX, oy = nY - anclaOffsetY;

    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    // Pre-calcula mechones
    const strands = [];
    for (let i = 0; i < N; i++) {
      const r0=_gs(i,0), r1=_gs(i,1), r2=_gs(i,2), r3=_gs(i,3), r4=_gs(i,4);

      // BANDA ANCHA — clave para no hacer forma de medusa
      const rx = ox - rc*1.08 + r0*rc*2.16;
      const ry = oy - rc*0.72 + r1*rc*0.16;

      const distFromCenter = Math.abs(rx - ox) / rc;
      const length = rc * (3.2 + r2*1.6 + distFromCenter*0.9);

      // Drift proporcional: exteriores se abren levemente, interiores bajan recto
      const drift = (rx - ox)*0.22 + (rx - ox > 0 ? 1 : -1)*r3*rc*0.08;

      // Ondulación sutil basada en tick
      const wave  = Math.sin((tick||0)*0.7  + i*0.45) * rc*0.045;
      const waveB = Math.sin((tick||0)*0.5  + i*0.35 + 1.2) * rc*0.03;

      strands.push({
        rx, ry,
        c1x: rx + drift*0.25 + wave,   c1y: ry + length*0.30,
        c2x: rx + drift*0.65 + waveB,  c2y: ry + length*0.65,
        ex:  rx + drift,                ey:  ry + length,
        w: r4,
      });
    }

    // Cúpula + fleco — 3 capas (core, cyan outline, white)
    const glow = (color, blur) => { ctx.shadowColor = color; ctx.shadowBlur = blur; };

    [[YELLOW, rc*0.14, 22], [CYAN, rc*0.06, 14], [WHITE, rc*0.025, 4]].forEach(([c, lw, b]) => {
      glow(c, b); ctx.strokeStyle = c; ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(ox - rc*1.0, oy - rc*0.28);
      ctx.bezierCurveTo(ox - rc*0.80, oy - rc*1.38, ox + rc*0.80, oy - rc*1.38, ox + rc*1.0, oy - rc*0.28);
      ctx.stroke();
    });

    const fw = Math.sin((tick||0)*0.6) * rc*0.025;
    [[YELLOW, rc*0.12, 20], [CYAN, rc*0.055, 12], [WHITE, rc*0.02, 3]].forEach(([c, lw, b]) => {
      glow(c, b); ctx.strokeStyle = c; ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(ox - rc*1.05, oy + rc*0.10 + fw);
      ctx.bezierCurveTo(ox - rc*0.15, oy - rc*0.58 + fw, ox + rc*0.15, oy - rc*0.48 + fw, ox + rc*1.05, oy + rc*0.10 + fw);
      ctx.stroke();
    });

    // Triple-pass con outline cyan
    const passes = [
      { color: YELLOW, alpha: 0.40, blur: 32, lwFn: w => 5.5 + w*3.5 },
      { color: YELLOW, alpha: 0.92, blur: 16, lwFn: w => 2.0 + w*2.0 },
      { color: CYAN,   alpha: 0.72, blur: 14, lwFn: w => 0.9 + w*0.7 },
      { color: WHITE,  alpha: 0.28, blur:  5, lwFn: () => 0.5, skip: 3 },
    ];
    for (const p of passes) {
      ctx.globalAlpha = p.alpha;
      glow(p.color, p.blur);
      ctx.strokeStyle = p.color;
      strands.forEach((s, i) => {
        if (p.skip && i % p.skip !== 1) return;
        ctx.lineWidth = p.lwFn(s.w);
        ctx.beginPath(); ctx.moveTo(s.rx, s.ry);
        ctx.bezierCurveTo(s.c1x, s.c1y, s.c2x, s.c2y, s.ex, s.ey);
        ctx.stroke();
      });
    }

    ctx.globalAlpha = 1.0;
    ctx.shadowBlur  = 0;
    ctx.restore();
    return;
  }

  // ══════════════════════════════════════════════════════════
  // ESTILO 15: PELO ONDULADO CHINO — Strand-based neón tier 1
  //
  // GEOMETRÍA CORRECTA (calco exacto de la referencia):
  //  • Distribución esférica 360° — volumen envolvente tipo rockera 80s
  //  • Rizos con VOLUTAS (espirales apretadas), NO zigzag recto
  //  • CP1 y CP2 alternados perpendiculares al eje radial
  //  • 36 mechones de densidad alta para textura de chino
  //  • Triple-pass: halo → core → highlight blanco
  //  • Detección de sombrero: sube el ancla si hay capa alta
  // ══════════════════════════════════════════════════════════
  if (estiloId === 15) {
    ctx.save();
    const YELLOW = colorEfectivo;
    const CYAN   = '#00FFFF';
    const WHITE  = '#FFFFFF';
    const N      = 36;

    const hayCapaAlta  = techoY < nY - rc * 1.2;
    const anclaOffsetY = hayCapaAlta ? rc * 1.05 : rc * 0.72;
    const ox = nX, oy = nY - anclaOffsetY;

    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    const strands = [];
    for (let i = 0; i < N; i++) {
      const r0=_gs(i,0), r1=_gs(i,1), r2=_gs(i,2), r3=_gs(i,3), r4=_gs(i,4);

      // Distribución esférica 360° — da el volumen envolvente
      const side = i < N/2 ? -1 : 1;
      const t    = (i < N/2 ? i : i - N/2) / (N/2 - 1);
      const spreadAng = t*Math.PI + (side < 0 ? Math.PI : 0);
      const rx = ox + Math.cos(spreadAng) * rc*(0.72 + r0*0.48);
      const ry = oy + Math.sin(spreadAng) * rc*(0.38 + r1*0.42) - rc*0.08;

      // Eje radial desde el centro de la cabeza
      const radAng = Math.atan2(ry - oy, rx - ox);
      const outX = Math.cos(radAng), outY = Math.sin(radAng);
      const perpX = -outY, perpY = outX;

      const length = rc*(1.4 + r2*1.5);

      // CLAVE: zigDir alternado + perpendicular → VOLUTAS, no rayos de sol
      const zigDir = (i % 2 === 0) ? 1 : -1;
      const zigAmp = rc*(0.32 + r3*0.36);
      const tw     = Math.sin((tick||0)*0.8 + i*0.7) * rc*0.04;

      strands.push({
        rx, ry,
        c1x: rx + outX*length*0.28 + perpX*zigDir*zigAmp*0.75 + tw,
        c1y: ry + outY*length*0.28 + perpY*zigDir*zigAmp*0.75,
        c2x: rx + outX*length*0.62 - perpX*zigDir*zigAmp*0.55 + tw*0.5,
        c2y: ry + outY*length*0.62 - perpY*zigDir*zigAmp*0.55,
        ex:  rx + outX*length + perpX*zigDir*zigAmp*0.22,
        ey:  ry + outY*length + perpY*zigDir*zigAmp*0.22,
        w: r4,
      });
    }

    const glow = (color, blur) => { ctx.shadowColor = color; ctx.shadowBlur = blur; };

    // Cúpula esférica amplia + fleco rizado
    [[YELLOW, rc*0.14, 24], [CYAN, rc*0.06, 14], [WHITE, rc*0.025, 4]].forEach(([c, lw, b]) => {
      glow(c, b); ctx.strokeStyle = c; ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(ox - rc*1.08, oy - rc*0.22);
      ctx.bezierCurveTo(ox - rc*0.88, oy - rc*1.58, ox + rc*0.88, oy - rc*1.58, ox + rc*1.08, oy - rc*0.22);
      ctx.stroke();
    });

    const fw = Math.sin((tick||0)*0.55) * rc*0.04;
    [[YELLOW, rc*0.12, 22], [CYAN, rc*0.055, 13], [WHITE, rc*0.022, 3]].forEach(([c, lw, b]) => {
      glow(c, b); ctx.strokeStyle = c; ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(ox - rc*1.08, oy + rc*0.05 + fw);
      ctx.bezierCurveTo(ox - rc*0.55, oy - rc*0.82 + fw, ox + rc*0.45, oy + rc*0.32 + fw, ox + rc*1.08, oy + rc*0.05 + fw);
      ctx.stroke();
    });

    // Triple-pass con outline cyan
    const passes = [
      { color: YELLOW, alpha: 0.42, blur: 34, lwFn: w => 5.0 + w*3.5 },
      { color: YELLOW, alpha: 0.94, blur: 15, lwFn: w => 1.8 + w*2.2 },
      { color: CYAN,   alpha: 0.68, blur: 13, lwFn: w => 0.85 + w*0.65 },
      { color: WHITE,  alpha: 0.26, blur:  4, lwFn: () => 0.5, skip: 4 },
    ];
    for (const p of passes) {
      ctx.globalAlpha = p.alpha;
      glow(p.color, p.blur);
      ctx.strokeStyle = p.color;
      strands.forEach((s, i) => {
        if (p.skip && i % p.skip !== 2) return;
        ctx.lineWidth = p.lwFn(s.w);
        ctx.beginPath(); ctx.moveTo(s.rx, s.ry);
        ctx.bezierCurveTo(s.c1x, s.c1y, s.c2x, s.c2y, s.ex, s.ey);
        ctx.stroke();
      });
    }

    ctx.globalAlpha = 1.0;
    ctx.shadowBlur  = 0;
    ctx.restore();
    return;
  }

  // ──────────────────────────────────────────────────────────
  // ESTILO 16: ARETES REDONDOS
  // ──────────────────────────────────────────────────────────
  if (estiloId === 16) {
    const cEf = colorEfectivo;
    ctx.save();
    ctx.shadowBlur = 10; ctx.shadowColor = cEf;

    const rOreja   = rc * 0.95;
    const orejaIzqX = centroOjX - Math.cos(ang) * rOreja;
    const orejaIzqY = centroOjY - Math.sin(ang) * rOreja;
    const orejaDetX = centroOjX + Math.cos(ang) * rOreja;
    const orejaDetY = centroOjY + Math.sin(ang) * rOreja;
    const swingX   = Math.sin(tick * 0.05) * 0.15;

    [[orejaIzqX, orejaIzqY, 1], [orejaDetX, orejaDetY, -1]].forEach(([ox, oy, dir]) => {
      ctx.beginPath(); ctx.arc(ox, oy, rc*0.11, 0, Math.PI*2);
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = rc*0.06; ctx.stroke();
      const ax = ox + (swingX * dir * rc), ay = oy + (rc * 0.45);
      ctx.beginPath(); ctx.arc(ax, ay, rc*0.20, 0, Math.PI*2);
      ctx.fillStyle = cEf; ctx.fill();
      ctx.translate(ax, ay); _aplicarEfectoPremium(ctx, 'gema', cEf, rc*1.5, tick); ctx.translate(-ax, -ay);
    });
    ctx.restore();
    return;
  }

  // ──────────────────────────────────────────────────────────
  // ESTILO 17: ARETES COLGANTES
  // ──────────────────────────────────────────────────────────
  if (estiloId === 17) {
    const cEf   = colorEfectivo;
    ctx.save();
    ctx.shadowBlur = 15; ctx.shadowColor = cEf;

    const rOreja = rc * 0.95;
    const orejas = [
      { x: centroOjX - Math.cos(ang)*rOreja, y: centroOjY - Math.sin(ang)*rOreja, s:  1 },
      { x: centroOjX + Math.cos(ang)*rOreja, y: centroOjY + Math.sin(ang)*rOreja, s: -1 },
    ];
    const swingX = Math.sin(tick * 0.04) * 0.20;

    orejas.forEach(({ x: ox, y: oy, s }) => {
      ctx.beginPath(); ctx.arc(ox, oy, rc*0.10, 0, Math.PI*2);
      ctx.strokeStyle = '#C0C0C0'; ctx.lineWidth = rc*0.06; ctx.stroke();

      const c2x = ox + (swingX * s * rc), c2y = oy + (rc * 0.9);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(c2x, c2y);
      ctx.strokeStyle = '#C0C0C0'; ctx.lineWidth = rc*0.05; ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(c2x, c2y - rc*0.22); ctx.lineTo(c2x + rc*0.14, c2y);
      ctx.lineTo(c2x, c2y + rc*0.22); ctx.lineTo(c2x - rc*0.14, c2y);
      ctx.closePath();
      ctx.fillStyle = cEf; ctx.fill();
      ctx.strokeStyle = '#FFF'; ctx.lineWidth = rc*0.02; ctx.stroke();

      ctx.translate(c2x, c2y); _aplicarEfectoPremium(ctx, 'gema', cEf, rc*1.5, tick); ctx.translate(-c2x, -c2y);
    });
    ctx.restore();
    return;
  }

  // ──────────────────────────────────────────────────────────
  // ESTILO 18: CARA SIMPLE
  // ──────────────────────────────────────────────────────────
  if (estiloId === 18) {
    const cEf = colorEfectivo;
    ctx.save();
    ctx.shadowBlur = 8; ctx.shadowColor = cEf;
    ctx.translate(nX, nY); ctx.rotate(ang);

    const distOj = rc * 0.35;
    [-1, 1].forEach(dir => {
      ctx.beginPath();
      ctx.arc(dir * distOj, -rc*0.20, rc*0.11, 0, Math.PI*2);
      ctx.fillStyle = cEf; ctx.fill();
      ctx.beginPath();
      ctx.arc(dir * distOj - rc*0.03, -rc*0.20 - rc*0.03, rc*0.04, 0, Math.PI*2);
      ctx.fillStyle = '#FFFFFF'; ctx.fill();
    });

    ctx.beginPath(); ctx.arc(0, rc*0.08, rc*0.05, 0, Math.PI*2);
    ctx.fillStyle = cEf + 'AA'; ctx.fill();

    ctx.beginPath(); ctx.arc(0, rc*0.35, rc*0.25, 0, Math.PI);
    ctx.strokeStyle = cEf; ctx.lineWidth = rc*0.08; ctx.lineCap = 'round'; ctx.stroke();

    ctx.restore();
    return;
  }

  // ──────────────────────────────────────────────────────────
  // ESTILO 19: CAPA SUPERMAN
  // ──────────────────────────────────────────────────────────
  if (estiloId === 19) {
    const h11 = landmarks[11], h12 = landmarks[12];
    if (!h11 || !h12) return;

    const cEf = colorEfectivo;
    const hLx = ex(h11), hLy = ey(h11);
    const hRx = ex(h12), hRy = ey(h12);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 15; ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.lineWidth  = rc*0.08; ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(hLx - rc*0.1, hLy + rc*0.5);
    ctx.quadraticCurveTo(hLx - rc*1.5, hLy + rc*3, (hLx+hRx)/2 - rc*0.8, hLy + rc*4.5);
    ctx.lineTo((hLx+hRx)/2 + rc*0.8, hLy + rc*4.5);
    ctx.quadraticCurveTo(hRx + rc*1.5, hRy + rc*3, hRx + rc*0.1, hRy + rc*0.5);
    ctx.quadraticCurveTo((hLx+hRx)/2, hLy + rc*1.0, hLx - rc*0.1, hLy + rc*0.5);

    const colorCapa = colorBase === '#111111' ? '#CC2200' : colorBase === '#FFFFFF' ? '#0000FF' : cEf;
    ctx.fillStyle = colorCapa; ctx.fill();

    ctx.shadowBlur  = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth   = rc*0.05;
    ctx.beginPath();
    ctx.moveTo(hLx + rc*0.3, hLy + rc*0.8);
    ctx.quadraticCurveTo(hLx, hLy + rc*2, (hLx+hRx)/2 - rc*0.4, hLy + rc*4);
    ctx.moveTo(hRx - rc*0.3, hRy + rc*0.8);
    ctx.quadraticCurveTo(hRx, hRy + rc*2, (hLx+hRx)/2 + rc*0.4, hLy + rc*4);
    ctx.stroke();

    ctx.restore();
    return;
  }

  ctx.restore();
}