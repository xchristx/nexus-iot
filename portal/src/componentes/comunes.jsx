import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useTema } from '../tema.js'

export function Copiar({ texto, children }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      // navigator.clipboard no existe fuera de https ni en algunos WebView
      const ta = document.createElement('textarea')
      ta.value = texto
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1800)
  }

  return (
    <button type="button" className="copiar" onClick={copiar}>
      {copiado ? '✓ copiado' : (children || 'copiar')}
    </button>
  )
}

export function Bloque({ titulo, ayuda, texto, children }) {
  return (
    <div className="bloque">
      <div className="bloque-cab">
        <h3>{titulo}</h3>
        {texto != null && <Copiar texto={texto} />}
      </div>
      {ayuda && <p className="ayuda">{ayuda}</p>}
      {texto != null && <pre>{texto}</pre>}
      {children}
    </div>
  )
}

export function Etiqueta({ children, tenue }) {
  return <span className={'etiqueta' + (tenue ? ' tenue' : '')}>{children}</span>
}

// "prende si t > 28, histéresis 1.5"
export function textoRegla(g) {
  return `prende si ${g.entrada} ${g.condicion} ${g.umbral}, histéresis ${g.hist}`
}

export const esBinario = (v) => v === 0 || v === 1

// Link a la app Android (Play Store o el .apk), si está configurado en
// VITE_URL_APK. Dentro de la app no se muestra.
export function BajarApp() {
  const url = import.meta.env.VITE_URL_APK
  if (!url || Capacitor.isNativePlatform()) return null
  return <a className="descargar-app" href={url} target="_blank" rel="noopener">Bajar la app para Android</a>
}

// El título de arriba: el que eligió cada uno en su tema.
export function Titulo() {
  const [tema] = useTema()
  return <h1>{tema.titulo}</h1>
}
