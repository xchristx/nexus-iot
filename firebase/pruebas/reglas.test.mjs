// Pruebas de database.rules.json contra el emulador.
//
//   cd firebase && npm test        (levanta los emuladores, corre y los baja)
//
// Necesita Java 21 o más en el PATH: el emulador de la base es un .jar.

import { readFileSync } from 'node:fs'
import { test, before, beforeEach, after } from 'node:test'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { ref, set, update, get, remove } from 'firebase/database'

const DOMINIO = '@nexus-iot.example.com'
let env

const alumno = (usuario) => env.authenticatedContext('uid-' + usuario, { email: usuario + DOMINIO }).database()
const docente = () => env.authenticatedContext('uid-docente', { email: 'profe@escuela.edu.ar' }).database()

const KIT = {
  config: {
    entradas: { t: { nombre: 'Temperatura', unidad: '°C', orden: 0 } },
    salidas: { bomba: { nombre: 'Bomba', pin: 26, nivel_activo: 'LOW', pulsador: 32, orden: 1 } },
    pulsador_modo: 25,
  },
  control: {
    auto: false,
    reglas: { bomba: { entrada: 't', condicion: '>', umbral: 28, hist: 1.5 } },
  },
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nexus',
    database: {
      rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 9000,
    },
  })
})

beforeEach(async () => {
  await env.clearDatabase()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database()), {
      docentes: { 'uid-docente': true },
      cursos: {
        IOT2026: { nombre: 'IoT', plantilla: { entradas: [], salidas: [], reglas: [] } },
      },
      alumnos: { 'iot2026-beto': { curso: 'IOT2026', nombre: 'Beto', creado: 1 } },
      placas: { 'iot2026-beto': KIT },
      credenciales: { 'iot2026-beto': { contrasena: 'sol-4827', creado: 1 } },
    })
  })
})

after(async () => { await env?.cleanup() })

// --- alta: la hace el docente ------------------------------------------

const ALTA = (usuario, nombre) => ({
  ['alumnos/' + usuario]: { curso: 'IOT2026', nombre, creado: Date.now() },
  ['placas/' + usuario]: KIT,
  ['credenciales/' + usuario]: { contrasena: 'rana-3051', creado: Date.now() },
})

test('el docente da de alta a un alumno con su placa y su contraseña', async () => {
  await assertSucceeds(update(ref(docente()), ALTA('iot2026-ana', 'Ana Pérez')))
})

test('un alumno no se puede dar de alta solo', async () => {
  const db = alumno('iot2026-ana')
  await assertFails(update(ref(db), ALTA('iot2026-ana', 'Ana Pérez')))
  await assertFails(set(ref(db, 'alumnos/iot2026-ana'), { curso: 'IOT2026', nombre: 'Ana Pérez', creado: 1 }))
})

test('sin alta en alumnos/ no se puede crear una placa', async () => {
  const db = alumno('iot2026-ana')
  await assertFails(set(ref(db, 'placas/iot2026-ana'), KIT))
})

test('el usuario tiene que empezar con el curso', async () => {
  await assertFails(set(ref(docente(), 'alumnos/otro-ana'), { curso: 'IOT2026', nombre: 'Ana', creado: 1 }))
})

test('un alumno no puede tocar su alta ni la de otro', async () => {
  const db = alumno('iot2026-beto')
  await assertFails(set(ref(db, 'alumnos/iot2026-beto/nombre'), 'Beto Cambiado'))
  await assertFails(set(ref(db, 'alumnos/iot2026-caro'), { curso: 'IOT2026', nombre: 'Caro', creado: 1 }))
  await assertSucceeds(get(ref(db, 'alumnos/iot2026-beto')))
})

// --- contraseñas: solo el docente ---------------------------------------

test('las contraseñas guardadas las lee y escribe solo el docente', async () => {
  const beto = alumno('iot2026-beto')
  await assertFails(get(ref(beto, 'credenciales/iot2026-beto')))
  await assertFails(get(ref(beto, 'credenciales')))
  await assertFails(set(ref(beto, 'credenciales/iot2026-beto'), { contrasena: 'mia-1234', creado: 2 }))
  await assertFails(get(ref(env.unauthenticatedContext().database(), 'credenciales')))
  const prof = docente()
  await assertSucceeds(get(ref(prof, 'credenciales')))
  await assertSucceeds(set(ref(prof, 'credenciales/iot2026-beto'), { contrasena: 'luna-9913', creado: 2 }))
})

test('una contraseña guardada tiene forma', async () => {
  const prof = docente()
  const c = (u, v) => set(ref(prof, 'credenciales/' + u), v)
  await assertFails(c('iot2026-beto', { contrasena: 'corta', creado: 1 }))
  await assertFails(c('iot2026-beto', { contrasena: 'sol-4827' }))
  await assertFails(c('iot2026-beto', { contrasena: 'sol-4827', creado: 1, extra: 1 }))
  await assertFails(c('NoValido', { contrasena: 'sol-4827', creado: 1 }))
})

test('borrar a un alumno se lleva su alta, su placa y su contraseña', async () => {
  await assertSucceeds(update(ref(docente()), {
    'alumnos/iot2026-beto': null, 'placas/iot2026-beto': null, 'credenciales/iot2026-beto': null,
  }))
})

// --- cursos --------------------------------------------------------------

test('sin sesión se ve el nombre del curso, pero no la plantilla ni la lista', async () => {
  const db = env.unauthenticatedContext().database()
  await assertSucceeds(get(ref(db, 'cursos/IOT2026/nombre')))
  await assertFails(get(ref(db, 'cursos/IOT2026/plantilla')))
  await assertFails(get(ref(db, 'cursos')))
})

test('un alumno no lee la plantilla ni toca el curso', async () => {
  const db = alumno('iot2026-beto')
  await assertFails(get(ref(db, 'cursos/IOT2026/plantilla')))
  await assertFails(set(ref(db, 'cursos/IOT2026/nombre'), 'Otro'))
})

test('el docente crea un curso nuevo', async () => {
  const db = docente()
  await assertSucceeds(set(ref(db, 'cursos/ROBOT26'), { nombre: 'Robótica' }))
  await assertFails(set(ref(db, 'cursos/robot 26'), { nombre: 'Mal' }))
  await assertFails(set(ref(db, 'cursos/SINNOMBRE'), { plantilla: { pulsador_modo: 25 } }))
})

// --- aislamiento -----------------------------------------------------

test('un alumno no lee ni escribe la placa de otro', async () => {
  const db = alumno('iot2026-ana')
  await assertFails(get(ref(db, 'placas/iot2026-beto')))
  await assertFails(set(ref(db, 'placas/iot2026-beto/control/cmd/bomba'), 1))
  await assertFails(get(ref(db, 'placas')))
  await assertFails(get(ref(db, 'alumnos')))
})

test('el docente lee todo', async () => {
  const db = docente()
  await assertSucceeds(get(ref(db, 'placas')))
  await assertSucceeds(get(ref(db, 'alumnos')))
  await assertSucceeds(get(ref(db, 'cursos')))
})

// --- comandos y modo: como llegan desde Kodular ------------------------

test('cmd acepta 1, true, "1" y "\\"1\\"" en una salida declarada', async () => {
  const db = alumno('iot2026-beto')
  for (const v of [1, 0, true, false, '1', '0', '"1"', 'on', 'OFF']) {
    await assertSucceeds(set(ref(db, 'placas/iot2026-beto/control/cmd/bomba'), v))
  }
})

test('cmd rechaza valores raros y salidas no declaradas', async () => {
  const db = alumno('iot2026-beto')
  await assertFails(set(ref(db, 'placas/iot2026-beto/control/cmd/bomba'), 2))
  await assertFails(set(ref(db, 'placas/iot2026-beto/control/cmd/bomba'), 'prender'))
  await assertFails(set(ref(db, 'placas/iot2026-beto/control/cmd/riego'), 1))
  await assertFails(set(ref(db, 'placas/iot2026-beto/control/cmd/t'), 1))
})

test('la placa borra el cmd después de aplicarlo', async () => {
  const db = alumno('iot2026-beto')
  await assertSucceeds(set(ref(db, 'placas/iot2026-beto/control/cmd/bomba'), 1))
  await assertSucceeds(remove(ref(db, 'placas/iot2026-beto/control/cmd/bomba')))
})

test('auto acepta bool, 0/1 y texto', async () => {
  const db = alumno('iot2026-beto')
  for (const v of [true, false, 1, 0, 'true', '"false"']) {
    await assertSucceeds(set(ref(db, 'placas/iot2026-beto/control/auto'), v))
  }
  await assertFails(set(ref(db, 'placas/iot2026-beto/control/auto'), 'quizas'))
})

// --- configuración -----------------------------------------------------

test('ids inválidos o reservados', async () => {
  const db = alumno('iot2026-beto')
  const base = 'placas/iot2026-beto/config/entradas/'
  await assertSucceeds(set(ref(db, base + 'suelo_2'), { orden: 3 }))
  for (const id of ['Suelo', '2suelo', 'suelo-2', 'abcdefghijklmnop', 'visto', 'aviso']) {
    await assertFails(set(ref(db, base + id), { orden: 3 }))
  }
})

test('una salida exige pin y nivel, y no puede estar en 34-39', async () => {
  const db = alumno('iot2026-beto')
  const base = 'placas/iot2026-beto/config/salidas/'
  await assertFails(set(ref(db, base + 'luz'), { orden: 2, nivel_activo: 'HIGH' }))
  await assertFails(set(ref(db, base + 'luz'), { orden: 2, pin: 2, nivel_activo: 'high' }))
  await assertFails(set(ref(db, base + 'luz'), { orden: 2, pin: 35, nivel_activo: 'HIGH' }))
  await assertFails(set(ref(db, base + 'luz'), { orden: 2, pin: 2, nivel_activo: 'HIGH', pulsador: 36 }))
  await assertSucceeds(set(ref(db, base + 'luz'), { orden: 2, pin: 2, nivel_activo: 'HIGH', pulsador: 33 }))
})

test('un mismo id no puede ser entrada y salida', async () => {
  const db = alumno('iot2026-beto')
  await assertFails(set(ref(db, 'placas/iot2026-beto/config/salidas/t'), { orden: 2, pin: 2, nivel_activo: 'HIGH' }))
})

test('campos desconocidos se rechazan', async () => {
  const db = alumno('iot2026-beto')
  await assertFails(set(ref(db, 'placas/iot2026-beto/config/entradas/t/color'), 'rojo'))
  await assertFails(set(ref(db, 'placas/iot2026-beto/basura'), 1))
})

test('una regla tiene que nombrar una salida y una entrada que existan', async () => {
  const db = alumno('iot2026-beto')
  const r = (salida, g) => set(ref(db, 'placas/iot2026-beto/control/reglas/' + salida), g)
  await assertSucceeds(r('bomba', { entrada: 't', condicion: '<', umbral: 20, hist: 0 }))
  await assertFails(r('bomba', { entrada: 'h', condicion: '<', umbral: 20, hist: 1 }))
  await assertFails(r('riego', { entrada: 't', condicion: '<', umbral: 20, hist: 1 }))
  await assertFails(r('bomba', { entrada: 't', condicion: '=', umbral: 20, hist: 1 }))
  await assertFails(r('bomba', { entrada: 't', condicion: '<', umbral: 20, hist: -1 }))
  await assertFails(r('bomba', { entrada: 't', condicion: '<', umbral: 20 }))
})

test('borrar una salida junto con su regla', async () => {
  const db = alumno('iot2026-beto')
  await assertSucceeds(update(ref(db, 'placas/iot2026-beto'), {
    'config/salidas/bomba': null,
    'control/reglas/bomba': null,
  }))
})

// --- tablero y alertas: solo los usan el portal y la app ---------------

test('cada canal elige su widget, según sea entrada o salida', async () => {
  const db = alumno('iot2026-beto')
  const w = (id, v) => set(ref(db, 'placas/iot2026-beto/tablero/' + id), v)
  await assertSucceeds(w('t', { widget: 'medidor', min: 0, max: 50, color: 'ambar', icono: 'termometro' }))
  await assertSucceeds(w('bomba', { widget: 'boton', color: 'azul' }))
  await assertFails(w('t', { widget: 'boton' }))
  await assertFails(w('bomba', { widget: 'medidor' }))
  await assertFails(w('riego', { widget: 'interruptor' }))
  await assertFails(w('t', { widget: 'barra', min: 50, max: 10 }))
  await assertFails(w('t', { widget: 'numero', color: 'fucsia' }))
  await assertFails(w('t', { widget: 'numero', tamano: 3 }))
  await assertFails(w('t', { color: 'verde' }))
})

test('una alerta va sobre una entrada que existe', async () => {
  const db = alumno('iot2026-beto')
  const a = (id, v) => set(ref(db, 'placas/iot2026-beto/alertas/' + id), v)
  await assertSucceeds(a('t', { condicion: '>', umbral: 35, hist: 1 }))
  await assertFails(a('bomba', { condicion: '>', umbral: 35, hist: 1 }))
  await assertFails(a('h', { condicion: '>', umbral: 35, hist: 1 }))
  await assertFails(a('t', { condicion: '>=', umbral: 35, hist: 1 }))
  await assertFails(a('t', { condicion: '>', umbral: 35, hist: -1 }))
  await assertFails(a('t', { condicion: '>', umbral: 35 }))
})

test('tablero y alertas son privados de cada alumno', async () => {
  const db = alumno('iot2026-ana')
  await assertFails(set(ref(db, 'placas/iot2026-beto/tablero/t'), { widget: 'numero' }))
  await assertFails(set(ref(db, 'placas/iot2026-beto/alertas/t'), { condicion: '>', umbral: 1, hist: 0 }))
})

test('el alta copia tablero y alertas de la plantilla', async () => {
  const db = docente()
  await assertSucceeds(update(ref(db), {
    'alumnos/iot2026-ana': { curso: 'IOT2026', nombre: 'Ana Pérez', creado: Date.now() },
    'placas/iot2026-ana': {
      ...KIT,
      tablero: { t: { widget: 'medidor', min: 0, max: 50 }, bomba: { widget: 'boton' } },
      alertas: { t: { condicion: '>', umbral: 35, hist: 1 } },
    },
  }))
})

test('borrar una entrada junto con su widget y su alerta', async () => {
  const db = alumno('iot2026-beto')
  await assertSucceeds(set(ref(db, 'placas/iot2026-beto/tablero/t'), { widget: 'barra', min: 0, max: 50 }))
  await assertSucceeds(set(ref(db, 'placas/iot2026-beto/alertas/t'), { condicion: '>', umbral: 35, hist: 1 }))
  await assertSucceeds(update(ref(db, 'placas/iot2026-beto'), {
    'config/entradas/t': null,
    'control/reglas/bomba': null,
    'tablero/t': null,
    'alertas/t': null,
  }))
})

// --- estado: lo escribe la placa --------------------------------------

test('la placa publica valores, visto y aviso', async () => {
  const db = alumno('iot2026-beto')
  await assertSucceeds(update(ref(db, 'placas/iot2026-beto/estado'), {
    t: 24.5, bomba: 1, suelo: 40, visto: Date.now(), aviso: 'bomba=1 ignorado: modo automático',
  }))
  await assertFails(set(ref(db, 'placas/iot2026-beto/estado/t'), 'caliente'))
  await assertFails(set(ref(db, 'placas/iot2026-beto/estado/visto'), 'ayer'))
  await assertFails(set(ref(db, 'placas/iot2026-beto/estado/T'), 1))
})
