// Cómo se ve cada entrada y cada salida en "Mi placa". Lo elige el alumno en
// Configurar y se guarda en placas/{usuario}/tablero/{id}: la placa y la app
// Kodular no lo leen, es solo para el portal y la app Android.

export const WIDGETS_ENTRADA = [
  { id: 'numero', nombre: 'Número' },
  { id: 'medidor', nombre: 'Medidor' },
  { id: 'barra', nombre: 'Barra' },
  { id: 'indicador', nombre: 'Indicador (para 0 y 1: un botón, un sensor de presencia)' },
]

export const WIDGETS_SALIDA = [
  { id: 'interruptor', nombre: 'Interruptor ON / OFF' },
  { id: 'boton', nombre: 'Botón grande' },
]

// Los mismos valores que acepta database.rules.json.
export const COLORES = ['verde', 'azul', 'ambar', 'rojo', 'violeta', 'gris']

// Trazos de 24×24, dibujados con línea (stroke), sin relleno.
const TRAZOS = {
  termometro: 'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z',
  gota: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
  sol: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  foco: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2z',
  planta: 'M12 22V12M12 12C12 7 8.5 4 3 4c0 5.5 3.5 8 9 8zM12 12c0-4 3-7 8.5-7 0 4.5-3 7-8.5 7z',
  llama: 'M12 22c3.9 0 7-2.8 7-6.8 0-3.7-2.4-5.6-3.9-8.7-.9 2.3-2.2 3.5-3.4 3.9.2-3.1-.9-5.9-3.2-8.4.2 4.2-4.5 7-4.5 12.2C4 19 7.4 22 12 22z',
  ventilador: 'M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4M12 10c0-4 1-7 4-7 2 0 3 2 1 4l-3 3M14 12c4 0 7 1 7 4 0 2-2 3-4 1l-3-3M12 14c0 4-1 7-4 7-2 0-3-2-1-4l3-3M10 12c-4 0-7-1-7-4 0-2 2-3 4-1l3 3',
  viento: 'M9.59 4.59A2 2 0 1 1 11 8H2M12.59 19.41A2 2 0 1 0 14 16H2M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2',
  puerta: 'M3 22h18M6 22V3h12v19M14.5 12.5h.01',
  campana: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  rayo: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  enchufe: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4',
}

export const ICONOS = Object.keys(TRAZOS)

export function Icono({ nombre, tam = 18 }) {
  const d = TRAZOS[nombre]
  if (!d) return null
  return (
    <svg className="icono" width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

// Lo guardado más los valores por defecto. Si el widget guardado no
// corresponde al tipo (una entrada que pasó a salida), vuelve al de siempre.
export function widgetDe(canal, tablero) {
  const w = tablero?.[canal.id] || {}
  const lista = canal.tipo === 'salida' ? WIDGETS_SALIDA : WIDGETS_ENTRADA
  const widget = lista.some(x => x.id === w.widget) ? w.widget : lista[0].id
  return {
    widget,
    color: COLORES.includes(w.color) ? w.color : 'verde',
    icono: TRAZOS[w.icono] ? w.icono : null,
    min: typeof w.min === 'number' ? w.min : 0,
    max: typeof w.max === 'number' ? w.max : 100,
  }
}

// El color de un widget como variable CSS. ámbar y rojo tienen la suya propia
// (--ambar-w, --rojo-w) para que el tema los separe de avisos y alertas.
export const varColor = (color) => `var(--${color === 'ambar' || color === 'rojo' ? color + '-w' : color})`
const estiloColor = (color) => ({ '--c': varColor(color) })
const fraccion = (v, min, max) => Math.min(1, Math.max(0, (v - min) / (max - min)))
const numero = (v) => (typeof v === 'number' ? Number(v).toFixed(1) : '—')

// ===================================================================
//  Entradas
// ===================================================================

// Una tarjetita por entrada. `alerta` la pinta de rojo; `children` va abajo
// (la etiqueta "sin dato", el botón "no declarado · agregar").
export function WidgetEntrada({ titulo, valor, unidad, w, alerta, children }) {
  const hay = typeof valor === 'number'
  const clase = 'widget w-' + w.widget + (alerta ? ' en-alerta' : '')
  return (
    <div className={clase} style={alerta ? { '--c': 'var(--rojo)' } : estiloColor(w.color)}>
      <span className="widget-titulo">
        {w.icono && <Icono nombre={w.icono} tam={15} />}
        {titulo}
      </span>
      {w.widget === 'medidor' && <Medidor valor={valor} unidad={unidad} min={w.min} max={w.max} />}
      {w.widget === 'barra' && <Barra valor={valor} unidad={unidad} min={w.min} max={w.max} />}
      {w.widget === 'indicador' && <Indicador valor={valor} />}
      {w.widget === 'numero' && (
        <span className="dato-valor">{numero(valor)}<small>{hay ? unidad : ''}</small></span>
      )}
      {children}
    </div>
  )
}

function Medidor({ valor, unidad, min, max }) {
  const hay = typeof valor === 'number'
  const f = hay ? fraccion(valor, min, max) : 0
  // Medio círculo de 180°: pathLength=100 deja usar el porcentaje directo.
  const arco = 'M10 50 A40 40 0 0 1 90 50'
  return (
    <div className="medidor">
      <svg viewBox="0 0 100 56" role="img" aria-label={hay ? `${numero(valor)} ${unidad}` : 'sin dato'}>
        <path d={arco} className="medidor-fondo" pathLength="100" />
        {hay && <path d={arco} className="medidor-valor" pathLength="100" strokeDasharray={`${f * 100} 100`} />}
      </svg>
      <span className="medidor-numero">{numero(valor)}<small>{hay ? unidad : ''}</small></span>
      <span className="escala"><span>{min}</span><span>{max}</span></span>
    </div>
  )
}

function Barra({ valor, unidad, min, max }) {
  const hay = typeof valor === 'number'
  return (
    <div className="barra">
      <span className="dato-valor">{numero(valor)}<small>{hay ? unidad : ''}</small></span>
      <div className="barra-fondo">
        <div className="barra-valor" style={{ width: (hay ? fraccion(valor, min, max) * 100 : 0) + '%' }} />
      </div>
      <span className="escala"><span>{min}</span><span>{max}</span></span>
    </div>
  )
}

function Indicador({ valor }) {
  const hay = typeof valor === 'number'
  const activo = hay && valor >= 0.5
  return (
    <span className={'indicador' + (activo ? ' activo' : '')}>
      <span className="lampara" />
      {!hay ? '—' : activo ? 'ACTIVO' : 'INACTIVO'}
    </span>
  )
}

// ===================================================================
//  Salidas
// ===================================================================

// El botón relleno es lo que la placa informó; el que late es lo que se pidió
// y la placa todavía no recogió. Así nunca se muestra como hecho algo que no pasó.
export function Interruptor({ valor, pendiente, bloqueado, color = 'verde', onCambiar }) {
  const clase = (v) => [v === 1 ? 'on' : 'off', valor === v && 'activo', pendiente === v && 'pendiente']
    .filter(Boolean).join(' ')
  return (
    <div className="interruptor" style={estiloColor(color)}>
      <button className={clase(1)} disabled={bloqueado} aria-busy={pendiente === 1} onClick={() => onCambiar(1)}>ON</button>
      <button className={clase(0)} disabled={bloqueado} aria-busy={pendiente === 0} onClick={() => onCambiar(0)}>OFF</button>
    </div>
  )
}

// Un solo botón que alterna. Muestra lo que informó la placa; si hay un
// pedido sin recoger, late y dice a qué va a pasar.
export function BotonSalida({ nombre, icono, valor, pendiente, bloqueado, color = 'verde', onCambiar }) {
  const prendida = valor === 1
  const texto = pendiente != null
    ? (pendiente === 1 ? 'prendiendo…' : 'apagando…')
    : valor == null ? 'sin dato' : prendida ? 'ENCENDIDA' : 'APAGADA'
  return (
    <button className={'boton-salida' + (prendida ? ' activo' : '') + (pendiente != null ? ' pendiente' : '')}
            style={estiloColor(color)} disabled={bloqueado} aria-pressed={prendida}
            aria-busy={pendiente != null} onClick={() => onCambiar(prendida ? 0 : 1)}>
      {icono && <Icono nombre={icono} tam={22} />}
      <span className="boton-salida-nombre">{nombre}</span>
      <span className="boton-salida-estado">{texto}</span>
    </button>
  )
}
