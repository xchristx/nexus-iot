// El vínculo entre una cuenta de Amazon y Nexus IoT, que se guarda en la base:
//
//   alexa/codigos/{sha256}   lo deja el portal al tocar "Autorizar"; se canjea una vez, dura 10 min
//   placas/{u}/alexa         {desde}            un alumno vinculó su placa
//   cursos/{C}/alexa         {desde, docente}   un docente vinculó el Echo del laboratorio
//   cursos/{C}/alexa/alumnos/{u}: true          las placas que maneja ese Echo (las elige el docente)
//
// `desde` es la generación que va dentro de los tokens (tokens.mjs).

import { createHash } from 'node:crypto'
import { leer, escribir, actualizar, borrar } from './rtdb.mjs'

export const VIGENCIA_CODIGO = 10 * 60 * 1000

export const hashDe = (codigo) => createHash('sha256').update(codigo).digest('hex')

// Canjea el código del portal por los datos del token ({u, g} o {c, d, g}),
// o null. El código se borra aunque no sirva: es de un solo uso.
export async function canjear(codigo, redirect) {
  if (typeof codigo !== 'string' || !codigo) return null
  const ruta = 'alexa/codigos/' + hashDe(codigo)
  const c = await leer(ruta)
  if (!c) return null
  await borrar(ruta)
  if (typeof c.creado !== 'number' || Date.now() - c.creado > VIGENCIA_CODIGO) return null
  if (redirect && redirect !== c.redirect) return null

  if (c.usuario) {
    if (!(await leer('alumnos/' + c.usuario))) return null
    // Si ya estaba vinculada (otra cuenta de Amazon, o volvió a vincular),
    // se sigue con la misma generación: no se corta a nadie.
    const marca = await leer(`placas/${c.usuario}/alexa`)
    if (marca?.desde) return { u: c.usuario, g: marca.desde }
    const desde = Date.now()
    await escribir(`placas/${c.usuario}/alexa`, { desde })
    return { u: c.usuario, g: desde }
  }

  const [esDocente, nombre, marca] = await Promise.all([
    leer('docentes/' + c.docente), leer(`cursos/${c.curso}/nombre`), leer(`cursos/${c.curso}/alexa`),
  ])
  if (!esDocente || nombre == null) return null
  if (marca?.desde && marca.docente === c.docente) return { c: c.curso, d: c.docente, g: marca.desde }
  const desde = Date.now()
  await actualizar(`cursos/${c.curso}/alexa`, { desde, docente: c.docente })
  return { c: c.curso, d: c.docente, g: desde }
}

// Los códigos que nadie canjeó (el alumno tocó Autorizar y Amazon falló, o
// cerró la ventana) no se pueden usar, pero ocupan lugar.
export async function limpiarCodigos() {
  const viejos = await leer('alexa/codigos', { orderBy: 'creado', endAt: Date.now() - VIGENCIA_CODIGO })
  const cambios = Object.fromEntries(Object.keys(viejos || {}).map(h => [h, null]))
  if (Object.keys(cambios).length) await actualizar('alexa/codigos', cambios)
}

// ¿Sigue vinculado? (para renovar el token)
export async function vigente(datos) {
  if (datos.u) return (await leer(`placas/${datos.u}/alexa/desde`)) === datos.g
  const [marca, esDocente] = await Promise.all([leer(`cursos/${datos.c}/alexa`), leer('docentes/' + datos.d)])
  return Boolean(esDocente) && marca?.desde === datos.g && marca.docente === datos.d
}

// Las placas que puede manejar el dueño del token: {placas: {usuario: {placa, alumno}}},
// o null si el vínculo ya no existe. Con `solo`, únicamente esa (si le toca).
export async function cargar(datos, solo) {
  if (datos.u) {
    if (solo && solo !== datos.u) return { placas: {} }
    const placa = await leer('placas/' + datos.u)
    if (placa?.alexa?.desde !== datos.g) return null
    return { placas: { [datos.u]: { placa } } }
  }

  const [marca, esDocente] = await Promise.all([leer(`cursos/${datos.c}/alexa`), leer('docentes/' + datos.d)])
  if (!esDocente || marca?.desde !== datos.g || marca.docente !== datos.d) return null
  const usuarios = Object.keys(marca.alumnos || {}).filter(u => !solo || u === solo)
  const filas = await Promise.all(usuarios.map(async (u) => {
    const [alumno, placa] = await Promise.all([leer('alumnos/' + u), leer('placas/' + u)])
    return alumno?.curso === datos.c && placa ? [u, { placa, alumno: alumno.nombre }] : null
  }))
  return { placas: Object.fromEntries(filas.filter(Boolean)) }
}
