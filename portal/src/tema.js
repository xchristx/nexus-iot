// Tema del portal: colores, letra, forma y título. Se guarda SOLO en este
// dispositivo (localStorage), nunca en Firebase: es una preferencia de quien
// mira, no un dato de la placa. En la app Android, el WebView también guarda
// localStorage entre sesiones.
//
// Todo lo que se lee (de localStorage o de un JSON importado) pasa por
// normalizar(): cualquier valor raro vuelve al de por defecto, así un tema roto
// nunca deja el portal ilegible.

import { useSyncExternalStore } from 'react'

export const CLAVE = 'nexus-iot:tema'
export const VERSION = 1

// ===================================================================
//  Qué se puede cambiar
// ===================================================================

// Colores, con el nombre que ve el alumno y la variable CSS que pisan.
export const COLORES = [
  { id: 'fondo', nombre: 'Fondo', css: '--fondo', grupo: 'base' },
  { id: 'tarjeta', nombre: 'Tarjetas', css: '--tarjeta', grupo: 'base' },
  { id: 'campo', nombre: 'Campos y widgets', css: '--campo', grupo: 'base' },
  { id: 'boton', nombre: 'Botones', css: '--boton', grupo: 'base' },
  { id: 'borde', nombre: 'Bordes', css: '--borde', grupo: 'base' },
  { id: 'bordeFuerte', nombre: 'Bordes marcados', css: '--borde-fuerte', grupo: 'base' },
  { id: 'texto', nombre: 'Texto', css: '--texto', grupo: 'texto' },
  { id: 'tenue', nombre: 'Texto secundario', css: '--tenue', grupo: 'texto' },
  { id: 'acento', nombre: 'Acento (botón principal, conectado)', css: '--acento', grupo: 'acento' },
  { id: 'rojo', nombre: 'Alertas y errores', css: '--rojo', grupo: 'acento' },
  { id: 'ambar', nombre: 'Avisos', css: '--ambar', grupo: 'acento' },
  // Los seis que eligen los widgets en Configurar (los nombres son fijos
  // porque están en la base; lo que cambia es qué tono es cada uno).
  { id: 'verde', nombre: 'Widget "verde"', css: '--verde', grupo: 'widgets' },
  { id: 'azul', nombre: 'Widget "azul"', css: '--azul', grupo: 'widgets' },
  { id: 'ambarW', nombre: 'Widget "ámbar"', css: '--ambar-w', grupo: 'widgets' },
  { id: 'rojoW', nombre: 'Widget "rojo"', css: '--rojo-w', grupo: 'widgets' },
  { id: 'violeta', nombre: 'Widget "violeta"', css: '--violeta', grupo: 'widgets' },
  { id: 'gris', nombre: 'Widget "gris"', css: '--gris', grupo: 'widgets' },
]

export const GRUPOS = [
  { id: 'base', nombre: 'Superficies' },
  { id: 'texto', nombre: 'Texto' },
  { id: 'acento', nombre: 'Acentos' },
  { id: 'widgets', nombre: 'Colores de los widgets' },
]

// Solo letras del sistema: nada que bajar de internet (la app Android tiene
// que verse igual sin conexión). Si una no está, el navegador usa la siguiente.
export const FUENTES = [
  { id: 'sistema', nombre: 'Del sistema', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'condensada', nombre: 'Condensada', css: '"Roboto Condensed", "Arial Narrow", sans-serif-condensed, system-ui, sans-serif' },
  { id: 'ancha', nombre: 'Ancha (muy legible)', css: 'Verdana, "DejaVu Sans", Tahoma, system-ui, sans-serif' },
  { id: 'serif', nombre: 'Con serifa', css: 'Georgia, "Noto Serif", "Times New Roman", serif' },
  { id: 'mono', nombre: 'Monoespaciada', css: 'ui-monospace, "Cascadia Mono", "Roboto Mono", Consolas, monospace' },
]

// Números con su rango: lo que se sale se ajusta al borde.
export const RANGOS = {
  tamano: { min: 13, max: 22, paso: 1, nombre: 'Tamaño de la letra', unidad: 'px' },
  numero: { min: 0.7, max: 1.6, paso: 0.05, nombre: 'Tamaño de los números', unidad: '×' },
  redondeo: { min: 0, max: 2, paso: 0.1, nombre: 'Redondeo de las esquinas', unidad: '×' },
  espacio: { min: 0.6, max: 1.5, paso: 0.05, nombre: 'Espacio entre cosas', unidad: '×' },
  widgetMin: { min: 110, max: 260, paso: 5, nombre: 'Ancho mínimo de cada widget', unidad: 'px' },
  ancho: { min: 480, max: 1400, paso: 20, nombre: 'Ancho máximo de la página', unidad: 'px' },
  angulo: { min: 0, max: 360, paso: 5, nombre: 'Dirección del degradado', unidad: '°' },
}

export const POR_DEFECTO = {
  version: VERSION,
  preset: 'oscuro',
  titulo: 'Nexus IoT',
  colores: {
    fondo: '#0f1115', tarjeta: '#171a21', campo: '#0d0f13', boton: '#21262f',
    borde: '#262b36', bordeFuerte: '#3a4150', texto: '#e6e9ef', tenue: '#8b93a3',
    acento: '#4ade80', rojo: '#f87171', ambar: '#fbbf24',
    verde: '#4ade80', azul: '#60a5fa', ambarW: '#fbbf24', rojoW: '#f87171', violeta: '#a78bfa', gris: '#9ca3af',
  },
  degradado: false,
  degradadoColor: '#1e293b',
  angulo: 160,
  fuente: 'sistema',
  tamano: 16,
  numero: 1,
  redondeo: 1,
  espacio: 1,
  widgetMin: 150,
  ancho: 720,
  sombra: false,
  animaciones: true,
}

// Cada preset pisa solo lo que cambia; el resto sale de POR_DEFECTO.
export const PRESETS = [
  { id: 'oscuro', nombre: 'Oscuro', tema: {} },
  {
    id: 'claro', nombre: 'Claro', tema: {
      colores: {
        fondo: '#f3f4f6', tarjeta: '#ffffff', campo: '#f8f9fb', boton: '#eceef2',
        borde: '#dfe3e9', bordeFuerte: '#c3c9d3', texto: '#1a1d23', tenue: '#5b6270',
        acento: '#15803d', rojo: '#dc2626', ambar: '#b45309',
        verde: '#16a34a', azul: '#2563eb', ambarW: '#d97706', rojoW: '#dc2626', violeta: '#7c3aed', gris: '#6b7280',
      },
      sombra: true,
    },
  },
  {
    id: 'contraste', nombre: 'Alto contraste', tema: {
      colores: {
        fondo: '#000000', tarjeta: '#000000', campo: '#000000', boton: '#000000',
        borde: '#ffffff', bordeFuerte: '#ffffff', texto: '#ffffff', tenue: '#e6e6e6',
        acento: '#ffff00', rojo: '#ff5c5c', ambar: '#ffd000',
        verde: '#00ff66', azul: '#4dc3ff', ambarW: '#ffd000', rojoW: '#ff5c5c', violeta: '#e0a3ff', gris: '#d0d0d0',
      },
      tamano: 18, numero: 1.15, animaciones: false,
    },
  },
  {
    id: 'oceano', nombre: 'Océano', tema: {
      colores: {
        fondo: '#0a1622', tarjeta: '#0f2030', campo: '#091420', boton: '#15293b',
        borde: '#1c3549', bordeFuerte: '#2b4b65', texto: '#e2eef8', tenue: '#86a1b7',
        acento: '#38bdf8', rojo: '#fb7185', ambar: '#fcd34d',
        verde: '#34d399', azul: '#38bdf8', ambarW: '#fcd34d', rojoW: '#fb7185', violeta: '#a5b4fc', gris: '#94a3b8',
      },
      degradado: true, degradadoColor: '#0e3350', angulo: 180, redondeo: 1.4,
    },
  },
  {
    id: 'atardecer', nombre: 'Atardecer', tema: {
      colores: {
        fondo: '#1a0f1f', tarjeta: '#24152b', campo: '#150c19', boton: '#2e1b36',
        borde: '#3b2544', bordeFuerte: '#58375f', texto: '#f7e9ef', tenue: '#b594a8',
        acento: '#fb923c', rojo: '#f43f5e', ambar: '#facc15',
        verde: '#a3e635', azul: '#818cf8', ambarW: '#fb923c', rojoW: '#f43f5e', violeta: '#e879f9', gris: '#a8a29e',
      },
      degradado: true, degradadoColor: '#43172f', angulo: 200, redondeo: 1.6,
    },
  },
  {
    id: 'terminal', nombre: 'Terminal', tema: {
      colores: {
        fondo: '#000000', tarjeta: '#030803', campo: '#000000', boton: '#061208',
        borde: '#0f3d1a', bordeFuerte: '#1c6b30', texto: '#39ff14', tenue: '#26a83c',
        acento: '#39ff14', rojo: '#ff3b3b', ambar: '#e5ff00',
        verde: '#39ff14', azul: '#00e5ff', ambarW: '#e5ff00', rojoW: '#ff3b3b', violeta: '#c77dff', gris: '#7a9b7f',
      },
      fuente: 'mono', redondeo: 0, animaciones: false,
    },
  },
]

// ===================================================================
//  Validar
// ===================================================================

const HEX = /^#[0-9a-f]{6}$/i
const esHex = (v) => typeof v === 'string' && HEX.test(v)

// {tema, problemas}. `tema` siempre es válido y completo; `problemas` dice qué
// se corrigió, para mostrarlo al importar.
export function normalizar(entrada) {
  const problemas = []
  const t = structuredClone(POR_DEFECTO)
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    if (entrada != null) problemas.push('No es un tema: se usó el de por defecto.')
    return { tema: t, problemas }
  }

  const conocidas = new Set([...Object.keys(POR_DEFECTO)])
  for (const k of Object.keys(entrada)) if (!conocidas.has(k)) problemas.push(`Se ignoró "${k}": no es parte del tema.`)

  if (typeof entrada.preset === 'string' && PRESETS.some(p => p.id === entrada.preset)) t.preset = entrada.preset
  else if (entrada.preset !== undefined) t.preset = null

  if (entrada.titulo !== undefined) {
    const titulo = typeof entrada.titulo === 'string' ? entrada.titulo.replace(/\s+/g, ' ').trim() : ''
    if (!titulo) problemas.push('El título estaba vacío: queda "Nexus IoT".')
    else if (titulo.length > 30) { t.titulo = titulo.slice(0, 30); problemas.push('El título se recortó a 30 letras.') }
    else t.titulo = titulo
  }

  if (entrada.colores !== undefined) {
    if (!entrada.colores || typeof entrada.colores !== 'object') problemas.push('"colores" no es una lista de colores.')
    else {
      for (const [k, v] of Object.entries(entrada.colores)) {
        if (!(k in t.colores)) problemas.push(`Se ignoró el color "${k}".`)
        else if (!esHex(v)) problemas.push(`El color "${k}" no es un color #rrggbb: queda el de por defecto.`)
        else t.colores[k] = v.toLowerCase()
      }
    }
  }

  if (entrada.degradadoColor !== undefined) {
    if (esHex(entrada.degradadoColor)) t.degradadoColor = entrada.degradadoColor.toLowerCase()
    else problemas.push('El color del degradado no es un color #rrggbb.')
  }

  for (const k of ['degradado', 'sombra', 'animaciones']) {
    if (entrada[k] === undefined) continue
    if (typeof entrada[k] === 'boolean') t[k] = entrada[k]
    else problemas.push(`"${k}" tiene que ser true o false.`)
  }

  if (entrada.fuente !== undefined) {
    if (FUENTES.some(f => f.id === entrada.fuente)) t.fuente = entrada.fuente
    else problemas.push(`No hay una letra "${entrada.fuente}": queda la del sistema.`)
  }

  for (const [k, r] of Object.entries(RANGOS)) {
    const v = entrada[k]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) { problemas.push(`"${k}" tiene que ser un número.`); continue }
    const ajustado = Math.min(r.max, Math.max(r.min, v))
    if (ajustado !== v) problemas.push(`"${k}" va de ${r.min} a ${r.max}: se ajustó a ${ajustado}.`)
    t[k] = ajustado
  }

  return { tema: t, problemas }
}

// Un preset aplicado sobre el tema actual, conservando el título.
export function conPreset(tema, id) {
  const p = PRESETS.find(x => x.id === id) || PRESETS[0]
  const base = structuredClone(POR_DEFECTO)
  const nuevo = { ...base, ...structuredClone(p.tema), colores: { ...base.colores, ...(p.tema.colores || {}) } }
  return normalizar({ ...nuevo, preset: p.id, titulo: tema.titulo }).tema
}

// ===================================================================
//  Contraste (WCAG)
// ===================================================================

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

// El texto que va arriba del acento (el botón principal, un botón prendido):
// negro o blanco, el que más se lea. No se elige a mano para que nunca quede
// ilegible.
export const sobre = (hex) => (contraste(hex, '#0b0d11') >= contraste(hex, '#ffffff') ? '#0b0d11' : '#ffffff')

export const esOscuro = (hex) => luminancia(hex) < 0.2

// Combinaciones que conviene revisar: [texto, fondo, mínimo, qué es].
export function problemasDeContraste(t) {
  const c = t.colores
  return [
    [c.texto, c.tarjeta, 4.5, 'El texto sobre las tarjetas'],
    [c.texto, c.fondo, 4.5, 'El texto sobre el fondo'],
    [c.tenue, c.tarjeta, 3, 'El texto secundario sobre las tarjetas'],
    [c.texto, c.boton, 4.5, 'El texto de los botones'],
    [c.rojo, c.tarjeta, 3, 'Las alertas sobre las tarjetas'],
  ].filter(([a, b, min]) => contraste(a, b) < min)
    .map(([a, b, min, que]) => `${que} se lee poco (contraste ${contraste(a, b).toFixed(1)}, conviene ${min} o más).`)
}

// ===================================================================
//  Guardar y aplicar
// ===================================================================

function leer() {
  try {
    const crudo = localStorage.getItem(CLAVE)
    return crudo ? normalizar(JSON.parse(crudo)).tema : structuredClone(POR_DEFECTO)
  } catch {
    // JSON roto o localStorage bloqueado: el de siempre.
    return structuredClone(POR_DEFECTO)
  }
}

function escribir(t) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(t))
    return true
  } catch {
    return false
  }
}

// Las variables CSS de un tema, para <html>.
export function variables(t) {
  const v = {}
  for (const c of COLORES) v[c.css] = t.colores[c.id]
  v['--sobre-acento'] = sobre(t.colores.acento)
  v['--fuente'] = (FUENTES.find(f => f.id === t.fuente) || FUENTES[0]).css
  v['--numero'] = String(t.numero)
  v['--redondeo'] = String(t.redondeo)
  v['--espacio'] = String(t.espacio)
  v['--widget-min'] = t.widgetMin + 'px'
  v['--ancho'] = t.ancho + 'px'
  v['--sombra'] = t.sombra ? '0 1px 2px rgba(0, 0, 0, .12), 0 4px 16px rgba(0, 0, 0, .10)' : 'none'
  v['--degradado'] = t.degradado ? `linear-gradient(${t.angulo}deg, ${t.colores.fondo}, ${t.degradadoColor})` : 'none'
  return v
}

export function aplicar(t) {
  if (typeof document === 'undefined') return
  const raiz = document.documentElement
  for (const [k, val] of Object.entries(variables(t))) raiz.style.setProperty(k, val)
  raiz.style.fontSize = t.tamano + 'px'
  raiz.style.colorScheme = esOscuro(t.colores.fondo) ? 'dark' : 'light'
  raiz.dataset.animaciones = t.animaciones ? 'si' : 'no'
  // La barra del navegador en Chrome para Android toma este color.
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta) }
  meta.content = t.colores.fondo
  document.title = t.titulo
}

// Un "store" chiquito: el tema actual y quién lo escucha.
let actual = null
let guardado = true
const oyentes = new Set()

export function iniciarTema() {
  actual = leer()
  aplicar(actual)
  // Otra pestaña del portal cambió el tema: se aplica acá también.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== CLAVE) return
      actual = leer()
      aplicar(actual)
      oyentes.forEach(f => f())
    })
  }
}

export function fijarTema(t) {
  actual = normalizar(t).tema
  aplicar(actual)
  guardado = escribir(actual)
  oyentes.forEach(f => f())
}

const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f) }
const foto = () => actual || (actual = leer())

// [tema, fijarTema, guardado]. `guardado` es false si el navegador no deja
// guardar (modo privado estricto): el tema vale hasta cerrar.
export function useTema() {
  const t = useSyncExternalStore(suscribir, foto)
  return [t, fijarTema, guardado]
}
