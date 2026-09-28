// Las cuentas de los alumnos las crea el docente a partir de una lista de
// nombres. Esto es la parte que no toca Firebase: armar los usuarios y las
// contraseñas. La otra mitad (crear las cuentas) está en firebase.js.

import { normalizarNombre, normalizarCurso } from './nombres.js'

// Palabras cortas, sin tildes ni ñ, fáciles de dictar y de tipear en el sketch
// y en el celular. Con 4 cifras dan unas 580.000 contraseñas posibles: para una
// clase alcanza, porque Firebase frena los intentos seguidos.
export const PALABRAS = [
  'sol', 'luna', 'rana', 'gato', 'pato', 'mesa', 'nube', 'flor', 'roca', 'lago',
  'mar', 'rio', 'pan', 'uva', 'kiwi', 'oso', 'lobo', 'puma', 'foca', 'loro',
  'sapo', 'taza', 'vaso', 'faro', 'tren', 'auto', 'moto', 'bote', 'isla', 'pino',
  'roble', 'trigo', 'maiz', 'miel', 'limon', 'mango', 'pera', 'coco', 'lima', 'tigre',
  'cebra', 'burro', 'vaca', 'cabra', 'perro', 'raton', 'pez', 'ola', 'viento', 'hielo',
  'fuego', 'rayo', 'nieve', 'bosque', 'campo', 'cielo', 'lapiz', 'libro', 'radio', 'robot',
  'volcan', 'cometa', 'planeta', 'delfin',
]

// Un entero al azar en [0, n), con el generador criptográfico (no Math.random).
function azar(n) {
  const x = new Uint32Array(1)
  crypto.getRandomValues(x)
  return x[0] % n
}

// "rana-3051"
export function generarContrasena() {
  return PALABRAS[azar(PALABRAS.length)] + '-' + (1000 + azar(9000))
}

export function errorNombre(nombre) {
  const limpio = (nombre || '').trim().replace(/\s+/g, ' ')
  if (limpio.length < 3 || normalizarNombre(nombre).length < 2) return 'muy corto: poné nombre y apellido'
  if (limpio.length > 40) return 'muy largo: hasta 40 letras'
  return null
}

// De lo que pegó el docente (un nombre por renglón) a la lista de altas:
//   [{nombre, usuario, error}]
// `existentes`: los usuarios que ya tiene el curso. Dos alumnos con el mismo
// nombre no pueden compartir cuenta: al segundo se le agrega _2, al tercero _3.
export function prepararLista(curso, texto, existentes = []) {
  const codigo = normalizarCurso(curso).toLowerCase()
  const usados = new Set(existentes)
  const lista = []
  for (const renglon of (texto || '').split(/\r?\n/)) {
    // Admite pegar desde una planilla: se queda con la primera columna.
    const nombre = renglon.split(/\t|;|,/)[0].trim().replace(/\s+/g, ' ')
    if (!nombre) continue
    const error = errorNombre(nombre)
    if (error) { lista.push({ nombre, usuario: null, error }); continue }
    const base = codigo + '-' + normalizarNombre(nombre)
    let usuario = base
    for (let n = 2; usados.has(usuario); n++) usuario = base + '_' + n
    usados.add(usuario)
    lista.push({ nombre, usuario, error: null, repetido: usuario !== base })
  }
  return lista
}

// Para copiar a una planilla o un mensaje: una fila por alumno.
export function listaParaCopiar(filas) {
  return ['Nombre\tUsuario\tContraseña', ...filas.map(f => `${f.nombre}\t${f.usuario}\t${f.contrasena || ''}`)].join('\n')
}
