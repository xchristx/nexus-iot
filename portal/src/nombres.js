// Cómo se arma el usuario de un alumno a partir del curso y su nombre.
//
//   curso IOT2026 + "Ana Pérez"  ->  usuario  iot2026-ana_perez
//                                ->  correo   iot2026-ana_perez@nexus-iot.example.com
//
// Sin dependencias: lo usan firebase.js, cuentas.js y las pruebas.

// Tiene que ser el mismo dominio que en database.rules.json, en el prompt del
// firmware y en la app Kodular.
export const DOMINIO = '@nexus-iot.example.com'

// Sin tildes, sin mayúsculas, y los espacios (o cualquier otro signo) como
// "_": "  Ana   Pérez " y "ana perez" son la misma persona.
export function normalizarNombre(nombre) {
  return (nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export const normalizarCurso = (curso) => (curso || '').trim().toUpperCase()
export const usuarioDe = (curso, nombre) => normalizarCurso(curso).toLowerCase() + '-' + normalizarNombre(nombre)
export const correoDe = (usuario) => usuario + DOMINIO
export const usuarioDeCorreo = (correo) =>
  correo && correo.toLowerCase().endsWith(DOMINIO) ? correo.toLowerCase().slice(0, -DOMINIO.length) : null
