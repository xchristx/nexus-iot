// Pruebas de la Lambda de Alexa (alexa/lambda/) contra los emuladores.
//
//   cd firebase && npm test
//
// La Lambda entra como administrador (Bearer owner en el emulador). La placa
// de iot2026-ana es simular-placa.mjs, que hace lo mismo que el firmware: así
// se prueba que "Alexa, prende la bomba" anda sin tocar el ESP32.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

process.env.RTDB_EMULADOR = 'http://127.0.0.1:9000'
process.env.FIREBASE_DATABASE_URL = 'https://demo-nexus-default-rtdb.firebaseio.com'
process.env.SECRETO_TOKENS = 'secreto-de-prueba-'.repeat(3)
process.env.CLIENTE_ID = 'nexus-alexa'
process.env.CLIENTE_SECRETO = 'otro-secreto-de-prueba'
process.env.ESPERA_CONFIRMACION_MS = '1500'

const { handler } = await import('../../alexa/lambda/index.mjs')
const rtdb = await import('../../alexa/lambda/rtdb.mjs')
const { crear } = await import('../../alexa/lambda/tokens.mjs')
const { hashDe } = await import('../../alexa/lambda/vinculo.mjs')
const { catalogo, esTemperatura, dispositivosDe } = await import('../../alexa/lambda/placa.mjs')

const DOMINIO = '@nexus-iot.example.com'
const REDIRECT = 'https://pitangui.amazon.com/api/skill/link/M2PRUEBA'

const KIT = () => ({
  config: {
    entradas: {
      t: { nombre: 'Temperatura', unidad: '°C', orden: 0 },
      h: { nombre: 'Humedad', unidad: '%', orden: 1 },
    },
    salidas: {
      bomba: { nombre: 'Bomba de agua', pin: 26, nivel_activo: 'LOW', orden: 2 },
      luz: { nombre: 'Luz', pin: 27, nivel_activo: 'HIGH', orden: 3 },
    },
  },
  control: { auto: false, reglas: { bomba: { entrada: 't', condicion: '>', umbral: 28, hist: 1 } } },
  tablero: { luz: { widget: 'interruptor', icono: 'foco' } },
})

// --- ayudas ---------------------------------------------------------------

async function dejarCodigo(datos, creado = { '.sv': 'timestamp' }) {
  const codigo = randomBytes(32).toString('base64url')
  await rtdb.escribir('alexa/codigos/' + hashDe(codigo), { ...datos, redirect: REDIRECT, creado })
  return codigo
}

// Lo que manda Amazon a la Function URL.
function http(campos, { id = 'nexus-alexa', secreto = 'otro-secreto-de-prueba', metodo = 'POST' } = {}) {
  return handler({
    version: '2.0', rawPath: '/', isBase64Encoded: false,
    requestContext: { http: { method: metodo, path: '/' } },
    headers: {
      authorization: 'Basic ' + Buffer.from(id + ':' + secreto).toString('base64'),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(campos).toString(),
  })
}
const json = (res) => JSON.parse(res.body)

async function vincular(datos) {
  const code = await dejarCodigo(datos)
  const res = await http({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT })
  assert.equal(res.statusCode, 200, res.body)
  return json(res)
}

// Lo que manda Alexa por el disparador Smart Home.
function directiva(namespace, name, token, endpointId) {
  const header = { namespace, name, payloadVersion: '3', messageId: randomUUID(), ...(endpointId && { correlationToken: 'correlacion' }) }
  const scope = { type: 'BearerToken', token }
  return handler({
    directive: endpointId
      ? { header, endpoint: { scope, endpointId, cookie: {} }, payload: {} }
      : { header, payload: { scope } },
  })
}
const tipoError = (r) => r.event.header.name === 'ErrorResponse' ? r.event.payload.type : null
const prop = (r, name) => r.context?.properties.find(p => p.name === name)?.value

// --- la clase y la placa simulada -----------------------------------------

let placa

async function crearCuenta(usuario, contrasena) {
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: usuario + DOMINIO, password: contrasena, returnSecureToken: true }),
  })
}

before(async () => {
  const alumno = (nombre) => ({ curso: 'IOT2026', nombre, creado: 1 })
  await rtdb.escribir('', {
    docentes: { 'uid-docente': true },
    cursos: { IOT2026: { nombre: 'IoT' } },
    alumnos: {
      'iot2026-ana': alumno('Ana Pérez'),
      'iot2026-ana_2': alumno('Ana Pérez'),
      'iot2026-beto': alumno('Beto'),
      'iot2026-caro': alumno('Caro'),
    },
    placas: {
      'iot2026-ana': KIT(),
      'iot2026-ana_2': KIT(),
      'iot2026-beto': { ...KIT(), estado: { t: 21.5, bomba: 0, luz: 0, visto: Date.now() - 60000 } },
      'iot2026-caro': KIT(),
    },
  })

  await crearCuenta('iot2026-ana', 'rana-3051')
  const programa = fileURLToPath(new URL('./simular-placa.mjs', import.meta.url))
  placa = spawn(process.execPath, [programa, 'iot2026-ana', 'rana-3051', '--emulador'], { stdio: ['pipe', 'pipe', 'inherit'] })
  placa.stdout.on('data', () => {})
  for (let i = 0; i < 100 && typeof (await rtdb.leer('placas/iot2026-ana/estado/visto')) !== 'number'; i++) {
    await new Promise(r => setTimeout(r, 100))
  }
  assert.equal(typeof (await rtdb.leer('placas/iot2026-ana/estado/visto')), 'number', 'la placa simulada no arrancó')
})

after(() => { placa?.kill() })

// --- vincular: el canje del código que deja el portal ---------------------

test('canjear el código del portal da los tokens y marca la placa vinculada', async () => {
  const code = await dejarCodigo({ usuario: 'iot2026-ana' })
  const res = await http({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT })
  assert.equal(res.statusCode, 200, res.body)
  assert.equal(res.headers['cache-control'], 'no-store')
  const t = json(res)
  assert.equal(t.token_type, 'Bearer')
  assert.equal(t.expires_in, 3600)
  assert.ok(t.access_token && t.refresh_token)

  const marca = await rtdb.leer('placas/iot2026-ana/alexa')
  assert.equal(typeof marca.desde, 'number')
  assert.equal(await rtdb.leer('alexa/codigos/' + hashDe(code)), null, 'el código se borra')

  const otra = await http({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT })
  assert.equal(otra.statusCode, 400)
  assert.equal(json(otra).error, 'invalid_grant')

  // Otra cuenta de Amazon (el celular de la casa) no corta la primera.
  await vincular({ usuario: 'iot2026-ana' })
  assert.equal((await rtdb.leer('placas/iot2026-ana/alexa')).desde, marca.desde)
  assert.equal(tipoError(await directiva('Alexa.Discovery', 'Discover', t.access_token)), null)
})

test('el canje rechaza códigos vencidos, inventados o de otro lado, y clientes truchos', async () => {
  const canjear = async (code, extra = {}) => json(await http({ grant_type: 'authorization_code', code, ...extra })).error

  assert.equal(await canjear(await dejarCodigo({ usuario: 'iot2026-ana' }, Date.now() - 11 * 60000)), 'invalid_grant')
  assert.equal(await canjear(await dejarCodigo({ usuario: 'iot2026-ana' }), { redirect_uri: 'https://otro.example.com/x' }), 'invalid_grant')
  assert.equal(await canjear('inventado'), 'invalid_grant')

  const huerfano = await dejarCodigo({ usuario: 'iot2026-nadie' })
  assert.equal(await canjear(huerfano), 'invalid_grant')
  assert.equal(await rtdb.leer('placas/iot2026-nadie'), null, 'no se inventa una placa')

  const bueno = await dejarCodigo({ usuario: 'iot2026-ana' })
  const trucho = await http({ grant_type: 'authorization_code', code: bueno }, { secreto: 'adivinado' })
  assert.equal(trucho.statusCode, 401)
  assert.equal(json(trucho).error, 'invalid_client')
  assert.ok(await rtdb.leer('alexa/codigos/' + hashDe(bueno)), 'un cliente trucho no gasta el código')

  assert.equal(json(await http({ grant_type: 'password' })).error, 'unsupported_grant_type')
  assert.equal((await http({}, { metodo: 'GET' })).statusCode, 405)
})

test('los códigos que nadie canjeó se limpian en el próximo canje', async () => {
  const abandonado = 'alexa/codigos/' + hashDe('abandonado')
  await rtdb.escribir(abandonado, { usuario: 'iot2026-ana', redirect: REDIRECT, creado: Date.now() - 20 * 60000 })
  await vincular({ usuario: 'iot2026-ana' })
  assert.equal(await rtdb.leer(abandonado), null)
})

// --- lo que ve y hace Alexa -------------------------------------------------

test('descubrir: las salidas, el modo y las temperaturas, con los nombres del portal', async () => {
  const { access_token } = await vincular({ usuario: 'iot2026-ana' })
  const r = await directiva('Alexa.Discovery', 'Discover', access_token)
  assert.equal(r.event.header.name, 'Discover.Response')
  const eps = r.event.payload.endpoints
  assert.deepEqual(eps.map(e => [e.endpointId, e.friendlyName, e.displayCategories[0]]), [
    ['iot2026-ana:bomba', 'Bomba de agua', 'SWITCH'],
    ['iot2026-ana:luz', 'Luz', 'LIGHT'],
    ['iot2026-ana:auto', 'Modo automático', 'SWITCH'],
    ['iot2026-ana:t', 'Temperatura', 'TEMPERATURE_SENSOR'],
  ])
  const interfaces = (e) => e.capabilities.map(c => c.interface)
  assert.deepEqual(interfaces(eps[0]), ['Alexa.PowerController', 'Alexa.EndpointHealth', 'Alexa'])
  assert.deepEqual(interfaces(eps[2]), ['Alexa.PowerController', 'Alexa'])
  assert.deepEqual(interfaces(eps[3]), ['Alexa.TemperatureSensor', 'Alexa.EndpointHealth', 'Alexa'])
  assert.ok(eps.every(e => e.manufacturerName && e.description))
})

test('"Alexa, prende la bomba": la placa lo aplica y Alexa contesta cuando ya cambió', async () => {
  const { access_token } = await vincular({ usuario: 'iot2026-ana' })
  const t0 = Date.now()
  let r = await directiva('Alexa.PowerController', 'TurnOn', access_token, 'iot2026-ana:bomba')
  assert.equal(r.event.header.name, 'Response', JSON.stringify(r))
  assert.ok(Date.now() - t0 < 1500, 'contestó por la confirmación, no por la espera máxima')
  assert.equal(r.event.header.correlationToken, 'correlacion')
  assert.equal(r.event.endpoint.endpointId, 'iot2026-ana:bomba')
  assert.equal(prop(r, 'powerState'), 'ON')
  assert.deepEqual(prop(r, 'connectivity'), { value: 'OK' })
  assert.equal(await rtdb.leer('placas/iot2026-ana/estado/bomba'), 1)
  assert.equal(await rtdb.leer('placas/iot2026-ana/control/cmd/bomba'), null, 'la placa vació el buzón')

  r = await directiva('Alexa.PowerController', 'TurnOff', access_token, 'iot2026-ana:bomba')
  assert.equal(prop(r, 'powerState'), 'OFF')
  assert.equal(await rtdb.leer('placas/iot2026-ana/estado/bomba'), 0)

  r = await directiva('Alexa', 'ReportState', access_token, 'iot2026-ana:bomba')
  assert.equal(r.event.header.name, 'StateReport')
  assert.equal(prop(r, 'powerState'), 'OFF')
})

test('en modo automático, una salida con regla no se toca; una sin regla sí', async () => {
  const { access_token } = await vincular({ usuario: 'iot2026-ana' })
  await rtdb.escribir('placas/iot2026-ana/control/auto', '1')   // como lo guarda Kodular
  try {
    let r = await directiva('Alexa.PowerController', 'TurnOn', access_token, 'iot2026-ana:bomba')
    assert.equal(tipoError(r), 'NOT_SUPPORTED_IN_CURRENT_MODE')
    assert.equal(r.event.payload.currentDeviceMode, 'OTHER')
    assert.equal(await rtdb.leer('placas/iot2026-ana/control/cmd/bomba'), null)

    r = await directiva('Alexa.PowerController', 'TurnOn', access_token, 'iot2026-ana:luz')
    assert.equal(prop(r, 'powerState'), 'ON')
    assert.equal(await rtdb.leer('placas/iot2026-ana/estado/luz'), 1)

    r = await directiva('Alexa', 'ReportState', access_token, 'iot2026-ana:auto')
    assert.equal(prop(r, 'powerState'), 'ON')
  } finally {
    await rtdb.escribir('placas/iot2026-ana/control/auto', false)
  }
})

test('"¿qué temperatura hay?": la entrada en °C; la humedad no es un dispositivo', async () => {
  const { access_token } = await vincular({ usuario: 'iot2026-ana' })
  const r = await directiva('Alexa', 'ReportState', access_token, 'iot2026-ana:t')
  assert.equal(r.event.header.name, 'StateReport')
  const t = prop(r, 'temperature')
  assert.equal(t.scale, 'CELSIUS')
  assert.ok(t.value >= 14 && t.value <= 30, 'la placa simulada anda entre 14 y 30: ' + t.value)
  assert.equal(tipoError(await directiva('Alexa', 'ReportState', access_token, 'iot2026-ana:h')), 'NO_SUCH_ENDPOINT')
  assert.equal(tipoError(await directiva('Alexa.PowerController', 'TurnOn', access_token, 'iot2026-ana:t')), 'INVALID_DIRECTIVE')
})

test('con la placa desconectada, "no responde" y el comando no queda en cola; el modo se cambia igual', async () => {
  await rtdb.escribir('placas/iot2026-beto/estado/visto', Date.now() - 60000)
  const { access_token } = await vincular({ usuario: 'iot2026-beto' })
  let r = await directiva('Alexa.PowerController', 'TurnOn', access_token, 'iot2026-beto:bomba')
  assert.equal(tipoError(r), 'ENDPOINT_UNREACHABLE')
  assert.equal(await rtdb.leer('placas/iot2026-beto/control/cmd/bomba'), null)
  assert.equal(tipoError(await directiva('Alexa', 'ReportState', access_token, 'iot2026-beto:t')), 'ENDPOINT_UNREACHABLE')

  r = await directiva('Alexa.PowerController', 'TurnOn', access_token, 'iot2026-beto:auto')
  assert.equal(prop(r, 'powerState'), 'ON')
  assert.equal(await rtdb.leer('placas/iot2026-beto/control/auto'), true)
  await directiva('Alexa.PowerController', 'TurnOff', access_token, 'iot2026-beto:auto')
  assert.equal(await rtdb.leer('placas/iot2026-beto/control/auto'), false)
})

test('si la placa conectada no confirma a tiempo, contesta lo pedido y el comando queda', async () => {
  await rtdb.escribir('placas/iot2026-beto/estado/visto', Date.now())
  const { access_token } = await vincular({ usuario: 'iot2026-beto' })
  const r = await directiva('Alexa.PowerController', 'TurnOn', access_token, 'iot2026-beto:bomba')
  assert.equal(prop(r, 'powerState'), 'ON')
  assert.equal(await rtdb.leer('placas/iot2026-beto/control/cmd/bomba'), 1)
  await rtdb.borrar('placas/iot2026-beto/control/cmd/bomba')
})

// --- tokens ------------------------------------------------------------------

test('un token adulterado, vencido o de refresco no sirve para una directiva', async () => {
  const { access_token, refresh_token } = await vincular({ usuario: 'iot2026-ana' })
  const [cuerpo, firma] = access_token.split('.')
  const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString())
  const ajeno = Buffer.from(JSON.stringify({ ...datos, u: 'iot2026-beto' })).toString('base64url') + '.' + firma
  const descubrir = (token) => directiva('Alexa.Discovery', 'Discover', token)

  assert.equal(tipoError(await descubrir(ajeno)), 'INVALID_AUTHORIZATION_CREDENTIAL')
  assert.equal(tipoError(await descubrir(refresh_token)), 'INVALID_AUTHORIZATION_CREDENTIAL')
  assert.equal(tipoError(await descubrir(undefined)), 'INVALID_AUTHORIZATION_CREDENTIAL')
  assert.equal(tipoError(await descubrir(crear({ ...datos, exp: Date.now() - 1 }))), 'EXPIRED_AUTHORIZATION_CREDENTIAL')

  // La placa de otro alumno no existe para este token.
  const r = await directiva('Alexa.PowerController', 'TurnOn', access_token, 'iot2026-beto:bomba')
  assert.equal(tipoError(r), 'NO_SUCH_ENDPOINT')
  assert.equal(await rtdb.leer('placas/iot2026-beto/control/cmd/bomba'), null)
})

test('renovar el token, y "Desvincular" en el portal corta todo', async () => {
  const { refresh_token } = await vincular({ usuario: 'iot2026-beto' })
  const res = await http({ grant_type: 'refresh_token', refresh_token })
  assert.equal(res.statusCode, 200, res.body)
  const nuevo = json(res).access_token
  assert.equal(tipoError(await directiva('Alexa.Discovery', 'Discover', nuevo)), null)

  await rtdb.borrar('placas/iot2026-beto/alexa')
  assert.equal(tipoError(await directiva('Alexa.Discovery', 'Discover', nuevo)), 'INVALID_AUTHORIZATION_CREDENTIAL')
  assert.equal(json(await http({ grant_type: 'refresh_token', refresh_token })).error, 'invalid_grant')

  // Vincular de nuevo es otra generación: el refresco viejo sigue sin andar.
  await vincular({ usuario: 'iot2026-beto' })
  assert.equal(json(await http({ grant_type: 'refresh_token', refresh_token })).error, 'invalid_grant')
})

// --- el Echo del laboratorio ----------------------------------------------

test('docente: el Echo del laboratorio ve solo a los alumnos elegidos, con su nombre', async () => {
  await rtdb.actualizar('cursos/IOT2026/alexa/alumnos', { 'iot2026-ana': true, 'iot2026-ana_2': true, 'iot2026-beto': true })
  const { access_token } = await vincular({ curso: 'IOT2026', docente: 'uid-docente' })
  const marca = await rtdb.leer('cursos/IOT2026/alexa')
  assert.equal(marca.docente, 'uid-docente')
  assert.equal(Object.keys(marca.alumnos).length, 3, 'la elección no se pierde al vincular')

  const r = await directiva('Alexa.Discovery', 'Discover', access_token)
  const nombres = r.event.payload.endpoints.map(e => e.friendlyName)
  assert.equal(nombres.length, 12)
  assert.ok(nombres.includes('Bomba de agua de Ana Pérez'))
  assert.ok(nombres.includes('Bomba de agua de Ana Pérez 2'), 'dos alumnos con el mismo nombre')
  assert.ok(nombres.includes('Modo automático de Beto'))
  assert.ok(nombres.includes('Temperatura de Beto'))
  assert.ok(!nombres.some(n => n.endsWith('de Caro')))
  assert.deepEqual(r.event.payload.endpoints.slice(0, 6).map(e => e.endpointId.split(':')[1]),
    ['bomba', 'luz', 'bomba', 'luz', 'bomba', 'luz'], 'primero las salidas')

  assert.equal(tipoError(await directiva('Alexa.PowerController', 'TurnOn', access_token, 'iot2026-caro:bomba')), 'NO_SUCH_ENDPOINT')
  const luz = await directiva('Alexa.PowerController', 'TurnOff', access_token, 'iot2026-ana:luz')
  assert.equal(prop(luz, 'powerState'), 'OFF')

  await rtdb.borrar('cursos/IOT2026/alexa/alumnos/iot2026-beto')
  assert.equal(tipoError(await directiva('Alexa', 'ReportState', access_token, 'iot2026-beto:auto')), 'NO_SUCH_ENDPOINT')

  await rtdb.borrar('docentes/uid-docente')
  assert.equal(tipoError(await directiva('Alexa.Discovery', 'Discover', access_token)), 'INVALID_AUTHORIZATION_CREDENTIAL')
  await rtdb.escribir('docentes/uid-docente', true)

  // Desvincular el curso deja la elección para la próxima.
  await rtdb.actualizar('cursos/IOT2026/alexa', { desde: null, docente: null })
  assert.equal(tipoError(await directiva('Alexa.Discovery', 'Discover', access_token)), 'INVALID_AUTHORIZATION_CREDENTIAL')
  assert.ok(await rtdb.leer('cursos/IOT2026/alexa/alumnos/iot2026-ana'))
})

// --- de la placa a los dispositivos, sin base -----------------------------

test('se corta en 300 dispositivos, primero las salidas, sin nombres repetidos', () => {
  const placa = {
    config: {
      salidas: Object.fromEntries(Array.from({ length: 10 }, (_, i) => ['s' + i, { nombre: 'Salida', orden: i }])),
      entradas: { t: { unidad: 'ºC', orden: 0 } },
    },
  }
  const lista = catalogo(Array.from({ length: 26 }, (_, i) => ({ usuario: 'iot2026-a' + i, placa, alumno: 'Alumno ' + i })))
  const cuenta = (tipo) => lista.filter(d => d.tipo === tipo).length
  assert.equal(lista.length, 300)
  assert.deepEqual([cuenta('salida'), cuenta('auto'), cuenta('temperatura')], [260, 26, 14])
  assert.equal(new Set(lista.map(d => d.nombre.toLowerCase())).size, 300)
  assert.equal(lista[1].nombre, 'Salida de Alumno 0 2')
})

test('qué cuenta como temperatura, y el nombre cuando no hay', () => {
  for (const u of ['°C', 'ºC', 'C', ' °c ']) assert.ok(esTemperatura(u), u)
  for (const u of ['%', 'cm', '°F', '', undefined]) assert.ok(!esTemperatura(u), String(u))
  const [d] = dispositivosDe('iot2026-x', { config: { salidas: { luz_patio: { orden: 0 } } } })
  assert.equal(d.nombre, 'luz patio')
})

// --- sin emulador: el token de Google con la cuenta de servicio -----------

test('sin emulador, firma el pedido a Google con la cuenta de servicio y usa ese token', async () => {
  const { generateKeyPairSync, createVerify } = await import('node:crypto')
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const antes = { emulador: process.env.RTDB_EMULADOR, cuenta: process.env.CUENTA_SERVICIO, fetch: globalThis.fetch }
  process.env.RTDB_EMULADOR = ''
  process.env.CUENTA_SERVICIO = JSON.stringify({
    client_email: 'nexus@demo-nexus.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  })
  const pedidos = []
  globalThis.fetch = async (url, op) => {
    pedidos.push({ url: String(url), op })
    const google = String(url) === 'https://oauth2.googleapis.com/token'
    return new Response(JSON.stringify(google ? { access_token: 'token-de-google', expires_in: 3600 } : { hola: 1 }))
  }
  try {
    assert.deepEqual(await rtdb.leer('placas/iot2026-ana/estado'), { hola: 1 })
    await rtdb.leer('alexa/codigos', { orderBy: 'creado', endAt: 5 })
  } finally {
    process.env.RTDB_EMULADOR = antes.emulador
    if (antes.cuenta === undefined) delete process.env.CUENTA_SERVICIO
    else process.env.CUENTA_SERVICIO = antes.cuenta
    globalThis.fetch = antes.fetch
  }

  assert.equal(pedidos.length, 3, 'el token de Google se pide una vez y se reusa')
  const [google, base, consulta] = pedidos
  const [cabecera, cuerpo, firma] = new URLSearchParams(google.op.body).get('assertion').split('.')
  assert.ok(createVerify('RSA-SHA256').update(cabecera + '.' + cuerpo).verify(publicKey, firma, 'base64url'), 'firma RS256 válida')
  const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString())
  assert.equal(datos.iss, 'nexus@demo-nexus.iam.gserviceaccount.com')
  assert.equal(datos.aud, 'https://oauth2.googleapis.com/token')
  assert.match(datos.scope, /auth\/firebase\.database/)
  assert.equal(datos.exp - datos.iat, 3600)

  assert.equal(base.url, 'https://demo-nexus-default-rtdb.firebaseio.com/placas/iot2026-ana/estado.json')
  assert.equal(base.op.headers.authorization, 'Bearer token-de-google')
  assert.equal(consulta.url, 'https://demo-nexus-default-rtdb.firebaseio.com/alexa/codigos.json?orderBy=%22creado%22&endAt=5')
})
