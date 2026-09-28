import { useState, useRef } from 'react'
import {
  useTema, normalizar, conPreset, problemasDeContraste,
  COLORES, GRUPOS, FUENTES, RANGOS, PRESETS, POR_DEFECTO,
} from '../tema.js'
import { Copiar } from '../componentes/comunes.jsx'
import { WidgetEntrada, BotonSalida, Interruptor, varColor, COLORES as COLORES_WIDGET } from '../componentes/widgets.jsx'

// Todo se aplica y se guarda al instante, solo en este dispositivo.

function Deslizador({ id, tema, cambiar }) {
  const r = RANGOS[id]
  const v = tema[id]
  return (
    <label className="tema-fila">
      <span>{r.nombre}<span className="valor">{r.unidad === '×' ? v.toFixed(2) + '×' : v + r.unidad}</span></span>
      <input type="range" min={r.min} max={r.max} step={r.paso} value={v}
             onChange={e => cambiar({ [id]: Number(e.target.value) })} />
    </label>
  )
}

function SiNo({ nombre, valor, onCambiar }) {
  return (
    <label className="tema-fila">
      <span>{nombre}</span>
      <button type="button" className={'chico' + (valor ? ' activo' : '')} aria-pressed={valor}
              onClick={() => onCambiar(!valor)}>{valor ? 'SÍ' : 'NO'}</button>
    </label>
  )
}

function VistaPrevia({ tema }) {
  return (
    <div className="tarjeta">
      <h3>Vista previa</h3>
      <p className="ayuda">Así se ve con el tema actual. Todo el portal cambia a medida que tocás.</p>
      <div className="datos">
        <WidgetEntrada titulo="Temperatura" valor={27.4} unidad="°C"
                       w={{ widget: 'medidor', color: 'ambar', icono: 'termometro', min: 0, max: 50 }} />
        <WidgetEntrada titulo="Humedad" valor={48} unidad="%"
                       w={{ widget: 'numero', color: 'azul', icono: 'gota', min: 0, max: 100 }} />
        <WidgetEntrada titulo="Suelo" valor={12} unidad="%" alerta
                       w={{ widget: 'barra', color: 'verde', icono: 'planta', min: 0, max: 100 }} />
      </div>
      <div className="salidas" style={{ marginTop: 14 }}>
        <BotonSalida nombre="Bomba" icono="gota" valor={1} color="azul" onCambiar={() => {}} />
        <div className="salida-fila">
          <span>Ventilador</span>
          <Interruptor valor={0} color="violeta" onCambiar={() => {}} />
        </div>
      </div>
      <div className="colores" style={{ marginTop: 14 }} aria-label="Los seis colores de los widgets">
        {COLORES_WIDGET.map(c => <span key={c} className="color" title={c}
          style={{ '--c': varColor(c) }} />)}
      </div>
      <p className="error">Así se ve un error.</p>
      <button type="button" className="principal">Botón principal</button>
      <p className="pie">{tema.titulo}</p>
    </div>
  )
}

export default function Tema() {
  const [tema, fijar, guardado] = useTema()
  const inicial = useRef(tema)
  const [importar, setImportar] = useState('')
  const [resultado, setResultado] = useState(null)   // {ok, textos[]}
  const [abierto, setAbierto] = useState('base')
  // El título se edita aparte: vacío no es un título válido, pero hay que poder
  // borrarlo para escribir otro.
  const [titulo, setTitulo] = useState(tema.titulo)

  // Tocar cualquier cosa lo deja como "personalizado" (ya no es el preset tal cual).
  const cambiar = (parcial) => fijar({ ...tema, ...parcial, preset: null })
  const cambiarColor = (id, v) => fijar({ ...tema, colores: { ...tema.colores, [id]: v }, preset: null })
  const avisos = problemasDeContraste(tema)

  function hacerImport() {
    let datos
    try {
      datos = JSON.parse(importar)
    } catch {
      setResultado({ ok: false, textos: ['Eso no es un JSON válido: copiá el tema entero, con las llaves { }.'] })
      return
    }
    const { tema: t, problemas } = normalizar(datos)
    fijar(t)
    setTitulo(t.titulo)
    setResultado({ ok: true, textos: problemas.length ? problemas : ['Tema importado sin cambios.'] })
    setImportar('')
  }

  function restablecer() {
    if (!window.confirm('¿Volver al tema de siempre? Se pierde lo que cambiaste.')) return
    fijar(structuredClone(POR_DEFECTO))
    setTitulo(POR_DEFECTO.titulo)
    setResultado(null)
  }

  return (
    <>
      <p className="ayuda">
        El tema se guarda <strong>solo en este dispositivo</strong>: no cambia lo que
        ven tus compañeros ni el docente, y si entrás desde otro celular o navegador
        arranca con el de siempre. Para llevarlo, usá Compartir (abajo).
      </p>
      {!guardado && (
        <div className="tarjeta atencion">
          <p className="ayuda sin-margen">
            Este navegador no deja guardar (¿modo privado?): el tema vale hasta que lo cierres.
          </p>
        </div>
      )}

      <div className="tarjeta">
        <h3>Temas listos</h3>
        <div className="presets">
          {PRESETS.map(p => {
            const t = conPreset(tema, p.id)
            return (
              <button key={p.id} type="button" className={'preset' + (tema.preset === p.id ? ' activo' : '')}
                      aria-pressed={tema.preset === p.id} onClick={() => { fijar(t); setTitulo(t.titulo); setResultado(null) }}>
                <span className="preset-muestra">
                  {['fondo', 'tarjeta', 'acento', 'texto'].map(k => <span key={k} style={{ background: t.colores[k] }} />)}
                </span>
                {p.nombre}
              </button>
            )
          })}
        </div>
        {tema.preset == null && <p className="ayuda sin-margen" style={{ marginTop: 10 }}>Tema personalizado.</p>}
      </div>

      <VistaPrevia tema={tema} />

      <div className="tarjeta">
        <h3>Título</h3>
        <label>
          <span className="ayuda-campo">Lo que dice arriba de todo y en la pestaña del navegador.</span>
          <input value={titulo} maxLength={30} aria-label="Título"
                 onChange={e => { setTitulo(e.target.value); if (e.target.value.trim()) cambiar({ titulo: e.target.value }) }}
                 onBlur={() => setTitulo(tema.titulo)} />
        </label>
      </div>

      <div className="tarjeta">
        <h3>Colores</h3>
        {avisos.length > 0 && avisos.map(a => <p key={a} className="aviso-contraste">⚠ {a}</p>)}
        {GRUPOS.map(g => (
          <div key={g.id}>
            <button type="button" className="enlace" aria-expanded={abierto === g.id}
                    onClick={() => setAbierto(abierto === g.id ? null : g.id)}>
              {abierto === g.id ? '▾' : '▸'} {g.nombre}
            </button>
            {abierto === g.id && COLORES.filter(c => c.grupo === g.id).map(c => (
              <label key={c.id} className="tema-fila">
                <span>{c.nombre}<span className="valor">{tema.colores[c.id]}</span></span>
                <input type="color" value={tema.colores[c.id]} aria-label={c.nombre}
                       onChange={e => cambiarColor(c.id, e.target.value)} />
              </label>
            ))}
          </div>
        ))}
        <p className="ayuda" style={{ marginBottom: 0 }}>
          El texto de arriba del acento (el botón principal, un botón prendido) se elige
          solo, negro o blanco, el que más se lea.
        </p>
      </div>

      <div className="tarjeta">
        <h3>Fondo</h3>
        <SiNo nombre="Degradado" valor={tema.degradado} onCambiar={v => cambiar({ degradado: v })} />
        {tema.degradado && (
          <>
            <label className="tema-fila">
              <span>Segundo color</span>
              <input type="color" value={tema.degradadoColor} aria-label="Segundo color del degradado"
                     onChange={e => cambiar({ degradadoColor: e.target.value })} />
            </label>
            <Deslizador id="angulo" tema={tema} cambiar={cambiar} />
          </>
        )}
      </div>

      <div className="tarjeta">
        <h3>Letra</h3>
        <label className="tema-fila">
          <span>Tipo de letra</span>
          <select value={tema.fuente} aria-label="Tipo de letra" onChange={e => cambiar({ fuente: e.target.value })}>
            {FUENTES.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </label>
        <Deslizador id="tamano" tema={tema} cambiar={cambiar} />
        <Deslizador id="numero" tema={tema} cambiar={cambiar} />
      </div>

      <div className="tarjeta">
        <h3>Forma</h3>
        <Deslizador id="redondeo" tema={tema} cambiar={cambiar} />
        <Deslizador id="espacio" tema={tema} cambiar={cambiar} />
        <Deslizador id="widgetMin" tema={tema} cambiar={cambiar} />
        <Deslizador id="ancho" tema={tema} cambiar={cambiar} />
        <SiNo nombre="Sombra en las tarjetas" valor={tema.sombra} onCambiar={v => cambiar({ sombra: v })} />
        <SiNo nombre="Animaciones" valor={tema.animaciones} onCambiar={v => cambiar({ animaciones: v })} />
      </div>

      <div className="tarjeta">
        <div className="bloque-cab">
          <h3>Compartir</h3>
          <Copiar texto={JSON.stringify(tema, null, 2)}>copiar tema</Copiar>
        </div>
        <p className="ayuda">
          Copiá tu tema para pasarlo a otro dispositivo o a un compañero, o pegá uno acá.
        </p>
        <textarea className="tema-textarea" value={importar} placeholder='{ "titulo": "…", "colores": { … } }'
                  aria-label="Tema para importar" onChange={e => { setImportar(e.target.value); setResultado(null) }} />
        <div className="acciones" style={{ marginTop: 10 }}>
          <button type="button" disabled={!importar.trim()} onClick={hacerImport}>Importar</button>
        </div>
        {resultado && (
          <ul className={'lista-avisos' + (resultado.ok ? '' : ' error')} style={{ marginTop: 10 }}>
            {resultado.textos.map(t => <li key={t}>{t}</li>)}
          </ul>
        )}
      </div>

      <div className="acciones">
        <button type="button" onClick={() => { fijar(inicial.current); setTitulo(inicial.current.titulo); setResultado(null) }}
                disabled={inicial.current === tema}>Deshacer lo de ahora</button>
        <button type="button" className="peligro" onClick={restablecer}>Volver al de siempre</button>
      </div>
    </>
  )
}
