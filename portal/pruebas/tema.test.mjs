// Pruebas de src/tema.js: lo que venga de localStorage o de un JSON pegado
// tiene que terminar en un tema válido.
//
//   cd portal && npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizar, conPreset, contraste, sobre, variables, problemasDeContraste,
  POR_DEFECTO, PRESETS, RANGOS, COLORES,
} from '../src/tema.js'

test('sin nada guardado, el tema de siempre y sin quejas', () => {
  const { tema, problemas } = normalizar(null)
  assert.deepEqual(tema, POR_DEFECTO)
  assert.deepEqual(problemas, [])
})

test('basura en vez de un tema: el de por defecto, avisando', () => {
  for (const x of ['hola', 42, [1, 2], true]) {
    const { tema, problemas } = normalizar(x)
    assert.deepEqual(tema, POR_DEFECTO)
    assert.equal(problemas.length, 1)
  }
})

test('un tema válido pasa entero', () => {
  const entrada = conPreset(POR_DEFECTO, 'oceano')
  const { tema, problemas } = normalizar(entrada)
  assert.deepEqual(tema, entrada)
  assert.deepEqual(problemas, [])
})

test('colores: solo #rrggbb, en minúsculas; lo demás vuelve al de por defecto', () => {
  const { tema, problemas } = normalizar({
    colores: { fondo: '#ABCDEF', texto: 'red', acento: '#fff', tarjeta: 'url(x)', inventado: '#000000' },
  })
  assert.equal(tema.colores.fondo, '#abcdef')
  assert.equal(tema.colores.texto, POR_DEFECTO.colores.texto)
  assert.equal(tema.colores.acento, POR_DEFECTO.colores.acento)
  assert.equal(tema.colores.tarjeta, POR_DEFECTO.colores.tarjeta)
  assert.equal(tema.colores.inventado, undefined)
  assert.equal(problemas.length, 4)
})

test('nada de CSS inyectado por un color o una letra', () => {
  const { tema } = normalizar({
    colores: { fondo: '#000000; background: url(https://x)' },
    fuente: 'Arial; } body { display: none',
    degradadoColor: 'red) , url(x',
  })
  assert.equal(tema.colores.fondo, POR_DEFECTO.colores.fondo)
  assert.equal(tema.fuente, 'sistema')
  assert.equal(tema.degradadoColor, POR_DEFECTO.degradadoColor)
})

test('números fuera de rango se ajustan al borde; texto en vez de número se ignora', () => {
  const { tema, problemas } = normalizar({ tamano: 99, redondeo: -3, espacio: '2', ancho: NaN })
  assert.equal(tema.tamano, RANGOS.tamano.max)
  assert.equal(tema.redondeo, RANGOS.redondeo.min)
  assert.equal(tema.espacio, POR_DEFECTO.espacio)
  assert.equal(tema.ancho, POR_DEFECTO.ancho)
  assert.equal(problemas.length, 4)
})

test('sí/no tienen que ser booleanos', () => {
  const { tema, problemas } = normalizar({ sombra: 'true', animaciones: false, degradado: 1 })
  assert.equal(tema.sombra, false)
  assert.equal(tema.animaciones, false)
  assert.equal(tema.degradado, false)
  assert.equal(problemas.length, 2)
})

test('título: se limpia, se recorta a 30 y vacío vuelve a Nexus IoT', () => {
  assert.equal(normalizar({ titulo: '  Invernadero   de  Ana ' }).tema.titulo, 'Invernadero de Ana')
  assert.equal(normalizar({ titulo: 'x'.repeat(50) }).tema.titulo.length, 30)
  assert.equal(normalizar({ titulo: '   ' }).tema.titulo, 'Nexus IoT')
  assert.equal(normalizar({ titulo: 12 }).tema.titulo, 'Nexus IoT')
})

test('claves desconocidas se ignoran y se avisan', () => {
  const { tema, problemas } = normalizar({ fondoAnimado: true, __proto__x: 1 })
  assert.equal(tema.fondoAnimado, undefined)
  assert.equal(problemas.length, 2)
})

test('un preset conserva el título y marca de dónde salió', () => {
  const t = conPreset({ ...POR_DEFECTO, titulo: 'Mi huerta' }, 'claro')
  assert.equal(t.titulo, 'Mi huerta')
  assert.equal(t.preset, 'claro')
  assert.equal(t.colores.fondo, '#f3f4f6')
})

test('todos los presets son válidos y se leen bien', () => {
  for (const p of PRESETS) {
    const t = conPreset(POR_DEFECTO, p.id)
    assert.deepEqual(normalizar(t).problemas, [], p.id)
    assert.deepEqual(problemasDeContraste(t), [], `${p.id}: ${problemasDeContraste(t).join(' ')}`)
  }
})

test('el texto sobre el acento siempre se lee', () => {
  for (const hex of ['#4ade80', '#15803d', '#ffff00', '#1e3a8a', '#000000', '#ffffff', '#fb923c']) {
    assert.ok(contraste(hex, sobre(hex)) >= 4.5, hex)
  }
})

test('contraste: los extremos', () => {
  assert.equal(Math.round(contraste('#000000', '#ffffff')), 21)
  assert.equal(contraste('#777777', '#777777'), 1)
})

test('las variables CSS cubren todos los colores y usan el degradado solo si está activo', () => {
  const v = variables(POR_DEFECTO)
  for (const c of COLORES) assert.equal(v[c.css], POR_DEFECTO.colores[c.id])
  assert.equal(v['--degradado'], 'none')
  assert.match(variables({ ...POR_DEFECTO, degradado: true })['--degradado'], /^linear-gradient\(160deg, #0f1115, #1e293b\)$/)
})
