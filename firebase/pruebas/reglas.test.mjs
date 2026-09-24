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
        IOT2026: { nombre: 'IoT', abierto: true, plantilla: { entradas: [], salidas: [], reglas: [] } },
        CERRADO: { nombre: 'Viejo', abierto: false },
      },
      alumnos: { 'iot2026-beto': { curso: 'IOT2026', nombre: 'Beto', creado: 1 } },
      placas: { 'iot2026-beto': KIT },
    })
  })
})

after(async () => { await env?.cleanup() })

// --- alta ------------------------------------------------------------

test('alta en un curso abierto, junto con su placa', async () => {
  const db = alumno('iot2026-ana')
  await assertSucceeds(update(ref(db), {
    'alumnos/iot2026-ana': { curso: 'IOT2026', nombre: 'Ana Pérez', creado: Date.now() },
    'placas/iot2026-ana': KIT,
  }))
})

test('no hay alta en un curso cerrado', async () => {
  const db = alumno('cerrado-ana')
  await assertFails(set(ref(db, 'alumnos/cerrado-ana'), { curso: 'CERRADO', nombre: 'Ana', creado: 1 }))
})

test('el usuario tiene que empezar con el curso', async () => {
  const db = alumno('otro-ana')
  await assertFails(set(ref(db, 'alumnos/otro-ana'), { curso: 'IOT2026', nombre: 'Ana', creado: 1 }))
})

test('no se puede registrar a nombre de otro', async () => {
  const db = alumno('iot2026-ana')
  await assertFails(set(ref(db, 'alumnos/iot2026-caro'), { curso: 'IOT2026', nombre: 'Caro', creado: 1 }))
})

test('sin alta en alumnos/ no se puede crear una placa', async () => {
  const db = alumno('iot2026-ana')
  await assertFails(set(ref(db, 'placas/iot2026-ana'), KIT))
})

test('el alta no pisa a alguien que ya existe', async () => {
  const db = alumno('iot2026-beto')
  await assertFails(set(ref(db, 'alumnos/iot2026-beto'), { curso: 'IOT2026', nombre: 'Beto 2', creado: 2 }))
})

test('sin sesión se ve si el curso está abierto, pero no la plantilla', async () => {
  const db = env.unauthenticatedContext().database()
  await assertSucceeds(get(ref(db, 'cursos/IOT2026/abierto')))
  await assertFails(get(ref(db, 'cursos/IOT2026/plantilla')))
  await assertFails(get(ref(db, 'cursos')))
})

// --- aislamiento -----------------------------------------------------

test('un alumno no lee ni escribe la placa de otro', async () => {
  const db = alumno('iot2026-ana')
  await assertFails(get(ref(db, 'placas/iot2026-beto')))
  await assertFails(set(ref(db, 'placas/iot2026-beto/control/cmd/bomba'), 1))
  await assertFails(get(ref(db, 'placas')))
  await assertFails(get(ref(db, 'alumnos')))
})

test('el docente lee todo y abre o cierra el curso', async () => {
  const db = docente()
  await assertSucceeds(get(ref(db, 'placas')))
  await assertSucceeds(get(ref(db, 'alumnos')))
  await assertSucceeds(get(ref(db, 'cursos')))
  await assertSucceeds(set(ref(db, 'cursos/IOT2026/abierto'), false))
})

test('un alumno no puede tocar el curso', async () => {
  const db = alumno('iot2026-beto')
  await assertFails(set(ref(db, 'cursos/IOT2026/abierto'), true))
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
