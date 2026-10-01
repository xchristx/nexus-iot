// Pruebas de src/alexa.js: el pedido con el que Amazon abre /alexa y el código
// que se le devuelve.
//
//   cd portal && npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { leerPedido, urlDeVuelta, nuevoCodigo, hashCodigo, dispositivosDe, esTemperatura } from '../src/alexa.js'

const CLIENTE = 'nexus-alexa'
const VUELTA = 'https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA'
const pedido = (campos) => '?' + new URLSearchParams({
  client_id: CLIENTE, response_type: 'code', state: 'abc 123', redirect_uri: VUELTA, scope: 'placa', ...campos,
})

test('un pedido de Amazon bien formado', () => {
  assert.deepEqual(leerPedido(pedido(), CLIENTE), { redirect: VUELTA, state: 'abc 123' })
  for (const host of ['layla.amazon.com', 'alexa.amazon.co.jp']) {
    const r = leerPedido(pedido({ redirect_uri: `https://${host}/api/skill/link/X` }), CLIENTE)
    assert.ok(!r.error, host)
  }
})

test('se rechaza todo lo que no vuelve a Amazon o no es de nuestra skill', () => {
  const malos = [
    { redirect_uri: 'https://ladron.example.com/api/skill/link/X' },
    { redirect_uri: 'https://pitangui.amazon.com.ladron.example.com/api/skill/link/X' },
    { redirect_uri: 'http://pitangui.amazon.com/api/skill/link/X' },
    { redirect_uri: 'https://pitangui.amazon.com/otra/cosa' },
    { redirect_uri: 'no es una url' },
    { client_id: 'otra-skill' },
    { response_type: 'token' },
  ]
  for (const m of malos) assert.ok(leerPedido(pedido(m), CLIENTE).error, JSON.stringify(m))
  assert.ok(leerPedido(pedido(), '').error, 'sin Alexa configurada')
})

test('la vuelta lleva el código o el rechazo, y el state tal cual', () => {
  const p = leerPedido(pedido(), CLIENTE)
  const ok = new URL(urlDeVuelta(p, { code: 'xyz' }))
  assert.equal(ok.origin + ok.pathname, VUELTA)
  assert.equal(ok.searchParams.get('code'), 'xyz')
  assert.equal(ok.searchParams.get('state'), 'abc 123')
  const no = new URL(urlDeVuelta(p, { error: 'access_denied' }))
  assert.equal(no.searchParams.get('error'), 'access_denied')
  assert.equal(no.searchParams.get('code'), null)
})

test('el código es largo, al azar y se guarda con el mismo hash que usa la Lambda', async () => {
  const codigos = new Set(Array.from({ length: 100 }, nuevoCodigo))
  assert.equal(codigos.size, 100)
  for (const c of codigos) assert.match(c, /^[A-Za-z0-9_-]{43}$/)
  const c = nuevoCodigo()
  assert.equal(await hashCodigo(c), createHash('sha256').update(c).digest('hex'))
})

test('cuántos dispositivos ve Alexa de una placa', () => {
  const placa = (canales) => ({ canales })
  assert.equal(dispositivosDe(placa([])), 0)
  assert.equal(dispositivosDe(placa([
    { tipo: 'entrada', unidad: '°C' }, { tipo: 'entrada', unidad: '%' },
    { tipo: 'salida' }, { tipo: 'salida' },
  ])), 4)
  assert.equal(dispositivosDe(placa([{ tipo: 'entrada', unidad: 'ºC' }])), 1)
  assert.ok(esTemperatura('C') && !esTemperatura('cm'))
})
