// Pruebas de src/cuentas.js: la lista de alumnos que carga el docente y las
// contraseñas que se generan.
//
//   cd portal && npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generarContrasena, prepararLista, listaParaCopiar, PALABRAS } from '../src/cuentas.js'

test('contraseña: palabra-número, sin tildes ni mayúsculas, 6 caracteres o más', () => {
  for (let i = 0; i < 500; i++) {
    const c = generarContrasena()
    assert.match(c, /^[a-z]+-\d{4}$/)
    assert.ok(c.length >= 6, c)
    assert.ok(PALABRAS.includes(c.split('-')[0]))
  }
})

test('las palabras no tienen tildes, ñ ni mayúsculas, y no se repiten', () => {
  for (const p of PALABRAS) assert.match(p, /^[a-z]{2,8}$/, p)
  assert.equal(new Set(PALABRAS).size, PALABRAS.length)
})

test('contraseñas distintas (no es Math.random con semilla fija)', () => {
  const vistas = new Set(Array.from({ length: 200 }, generarContrasena))
  assert.ok(vistas.size > 190, `solo ${vistas.size} distintas de 200`)
})

test('un nombre por renglón, con el usuario de siempre', () => {
  const l = prepararLista('iot2026', 'Ana Pérez\n  Bruno   Díaz  \n\nMaría José Núñez\n')
  assert.deepEqual(l.map(f => f.usuario), ['iot2026-ana_perez', 'iot2026-bruno_diaz', 'iot2026-maria_jose_nunez'])
  assert.deepEqual(l.map(f => f.nombre), ['Ana Pérez', 'Bruno Díaz', 'María José Núñez'])
  assert.ok(l.every(f => !f.error))
})

test('dos con el mismo nombre no comparten cuenta', () => {
  const l = prepararLista('IOT2026', 'Ana Pérez\nana perez\nANA PÉREZ')
  assert.deepEqual(l.map(f => f.usuario), ['iot2026-ana_perez', 'iot2026-ana_perez_2', 'iot2026-ana_perez_3'])
  assert.deepEqual(l.map(f => Boolean(f.repetido)), [false, true, true])
})

test('respeta a los que ya están en el curso', () => {
  const l = prepararLista('IOT2026', 'Ana Pérez', ['iot2026-ana_perez', 'iot2026-ana_perez_2'])
  assert.equal(l[0].usuario, 'iot2026-ana_perez_3')
})

test('pegado desde una planilla: se queda con la primera columna', () => {
  const l = prepararLista('IOT2026', 'Ana Pérez\t4to B\t12\nBruno Díaz;4to B\nCarla Gómez, 4to A')
  assert.deepEqual(l.map(f => f.nombre), ['Ana Pérez', 'Bruno Díaz', 'Carla Gómez'])
})

test('nombres que no sirven quedan marcados, sin usuario', () => {
  const l = prepararLista('IOT2026', 'Al\n!!!\n' + 'x'.repeat(41) + '\nAna Pérez')
  assert.deepEqual(l.map(f => Boolean(f.error)), [true, true, true, false])
  assert.ok(l.slice(0, 3).every(f => f.usuario === null))
})

test('Windows: renglones con \\r\\n', () => {
  assert.deepEqual(prepararLista('IOT2026', 'Ana Pérez\r\nBruno Díaz\r\n').map(f => f.usuario),
    ['iot2026-ana_perez', 'iot2026-bruno_diaz'])
})

test('la lista para copiar tiene encabezado y una fila por alumno', () => {
  const t = listaParaCopiar([{ nombre: 'Ana Pérez', usuario: 'iot2026-ana_perez', contrasena: 'sol-4827' }])
  assert.equal(t, 'Nombre\tUsuario\tContraseña\nAna Pérez\tiot2026-ana_perez\tsol-4827')
})
