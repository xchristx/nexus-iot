// Genera un proyecto de Kodular (.aia) con los bloques genéricos de Nexus IoT:
// leer el estado de la placa y mandarle comandos.
//
//   node kodular/generar-aia.mjs
//
// Escribe siempre kodular/NexusIoT.aia, con marcadores en URL_BASE y
// PUBLICABLE: es el que se le puede pasar a cualquiera. Si portal/.env tiene
// VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY, escribe además
// kodular/NexusIoT_curso.aia con esos valores, listo para los alumnos del
// curso (está en .gitignore).
//
// El formato está copiado de proyectos exportados por Kodular Creator
// (YaVersion 242, de 2022 a 2025). Dos cosas que importan:
//
// - Kodular NO tiene Web.JsonTextDecodeWithDictionaries: eso es de App
//   Inventor. Por eso el JSON se decodifica con JsonTextDecode, que da una
//   lista de pares, y se lee con "look up in pairs".
//
// - Las versiones de los componentes son las de Kodular, no las de App
//   Inventor (Web es 6 en Kodular y 9 en App Inventor). Una versión más nueva
//   que la del servidor hace fallar la importación.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const AQUI = dirname(fileURLToPath(import.meta.url))

const YA_VERSION = '242'
const LANGUAGE_VERSION = '34'
const VERSIONES = {
  Form: 44, Label: 10, Button: 13, TextBox: 13, Web: 6, Clock: 4, TinyDB: 2,
  VerticalArrangement: 10, HorizontalArrangement: 10,
}

const MARCADOR_URL = 'https://TUPROYECTO.supabase.co'
const MARCADOR_PUBLICABLE = 'sb_publishable_PEGA_ACA_LA_TUYA'


// ===================================================================
//  DISEÑADOR
// ===================================================================

// [tipo, nombre, propiedades, hijos]. Width "-2" = ocupar todo el ancho.
// Los nombres de los componentes son parte del contrato: los bloques los
// nombran, y un bloque pegado en otro proyecto queda en rojo si no existen.
const COMPONENTES = [
  ['VerticalArrangement', 'ArregloClave', { Width: '-2' }, [
    ['Label', 'LabelClave', { Text: 'Clave de tu placa (la sacás del portal, en Mis datos):' }],
    ['TextBox', 'TextBoxClave', { Hint: 'pegá acá tu clave', Width: '-2' }],
    ['Button', 'BotonGuardarClave', { Text: 'Guardar clave' }],
  ]],
  ['Label', 'LabelConexion', { FontBold: 'True', FontSize: '18', Text: 'Conectando…' }],
  ['Label', 'LabelDatos', { FontSize: '16' }],
  ['Label', 'LabelBomba', { FontSize: '16', Text: 'Bomba: ?' }],
  ['HorizontalArrangement', 'ArregloBomba', { Width: '-2' }, [
    ['Button', 'BotonPrender', { Text: 'Prender bomba', Width: '-2' }],
    ['Button', 'BotonApagar', { Text: 'Apagar bomba', Width: '-2' }],
  ]],
  ['Web', 'WebEstado', {}],
  ['Web', 'WebComando', {}],
  // TimerAlwaysFires en False: con la app en segundo plano no sigue leyendo.
  // Veinte teléfonos en el bolsillo gastarían la transferencia del plan gratuito.
  ['Clock', 'RelojEstado', { TimerAlwaysFires: 'False', TimerInterval: '5000' }],
  ['TinyDB', 'TinyDB1', {}],
]

const TIPOS = { Screen1: 'Form' }

function componentesScm(lista) {
  return lista.map(([tipo, nombre, props, hijos]) => {
    TIPOS[nombre] = tipo
    const c = { $Name: nombre, $Type: tipo, $Version: String(VERSIONES[tipo]), ...props, Uuid: uuid(nombre) }
    if (hijos) c.$Components = componentesScm(hijos)
    return c
  })
}

// Estable entre corridas, para que regenerar sin cambios dé el mismo archivo.
function uuid(nombre) {
  let h = 0
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) | 0
  return String(h)
}

function scm(nombreApp) {
  const form = {
    $Name: 'Screen1', $Type: 'Form', $Version: String(VERSIONES.Form),
    AppName: nombreApp, ReceiveSharedText: 'none', Scrollable: 'True', Title: 'Nexus IoT', Uuid: '0',
    $Components: componentesScm(COMPONENTES),
  }
  // Kodular escribe los caracteres no ASCII como \uXXXX.
  const json = JSON.stringify({ authURL: ['creator.kodular.io'], YaVersion: YA_VERSION, Source: 'Form', Properties: form })
    .replace(/[-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
  return `#|\n$JSON\n${json}\n|#`
}


// ===================================================================
//  BLOQUES — constructores
// ===================================================================

const bloque = (tipo, { mutacion = '', campos = {}, valores = {}, sentencias = {} } = {}) =>
  ({ tipo, mutacion, campos, valores, sentencias, sig: null, comentario: null })

// Encadena bloques de sentencia uno abajo del otro.
function sec(...bloques) {
  for (let i = 0; i < bloques.length - 1; i++) {
    let b = bloques[i]
    while (b.sig) b = b.sig
    b.sig = bloques[i + 1]
  }
  return bloques[0]
}

const comentar = (b, texto) => Object.assign(b, { comentario: texto })

const indexados = (prefijo, items) => Object.fromEntries(items.map((v, i) => [prefijo + i, v]))

// --- valores básicos ---
const texto = t => bloque('text', { campos: { TEXT: t } })
const numero = n => bloque('math_number', { campos: { NUM: String(n) } })
const booleano = v => bloque('logic_boolean', { campos: { BOOL: v ? 'TRUE' : 'FALSE' } })

// --- variables ---
const declararGlobal = (nombre, valor) => bloque('global_declaration', { campos: { NAME: nombre }, valores: { VALUE: valor } })
const global = nombre => bloque('lexical_variable_get', { campos: { VAR: 'global ' + nombre } })
const fijarGlobal = (nombre, valor) => bloque('lexical_variable_set', { campos: { VAR: 'global ' + nombre }, valores: { VALUE: valor } })
// parámetros de procedimiento, variables de "for each" y locales
const local = nombre => bloque('lexical_variable_get', { campos: { VAR: nombre } })
const parametroEvento = nombre => bloque('lexical_variable_get', {
  mutacion: `<mutation><eventparam name="${nombre}"></eventparam></mutation>`, campos: { VAR: nombre },
})
const conLocal = (nombre, valor, cuerpo) => bloque('local_declaration_statement', {
  mutacion: `<mutation><localname name="${nombre}"></localname></mutation>`,
  campos: { VAR0: nombre }, valores: { DECL0: valor }, sentencias: { STACK: cuerpo },
})

// --- texto, listas, lógica, matemática ---
const unir = (...partes) => bloque('text_join', { mutacion: `<mutation items="${partes.length}"></mutation>`, valores: indexados('ADD', partes) })
const estaVacio = t => bloque('text_isEmpty', { valores: { VALUE: t } })
const recortar = t => bloque('text_trim', { valores: { TEXT: t } })
const lista = (...items) => bloque('lists_create_with', { mutacion: `<mutation items="${items.length}"></mutation>`, valores: indexados('ADD', items) })
const buscarEnPares = (clave, pares, siNoEsta) => bloque('lists_lookup_in_pairs', { valores: { KEY: clave, LIST: pares, NOTFOUND: siNoEsta } })
const estaEnLista = (cosa, l) => bloque('lists_is_in', { valores: { ITEM: cosa, LIST: l } })
const elemento = (l, i) => bloque('lists_select_item', { valores: { LIST: l, NUM: numero(i) } })
const logica = (op, a, b) => bloque('logic_operation', { mutacion: '<mutation items="2"></mutation>', campos: { OP: op }, valores: { A: a, B: b } })
const no = v => bloque('logic_negate', { valores: { BOOL: v } })
const comparar = (a, op, b) => bloque('math_compare', { campos: { OP: op }, valores: { A: a, B: b } })
// Sin math_is_a_number: en App Inventor tiene un desplegable (campo OP) que
// según la documentación de Kodular allá no existe, y un campo desconocido
// puede hacer fallar la importación.

// --- control ---
// si([[condición, cuerpo], [condición, cuerpo]...], sino)
function si(casos, sino) {
  const valores = {}
  const sentencias = {}
  casos.forEach(([cond, cuerpo], i) => { valores['IF' + i] = cond; sentencias['DO' + i] = cuerpo })
  if (sino) sentencias.ELSE = sino
  const attrs = [casos.length > 1 && `elseif="${casos.length - 1}"`, sino && 'else="1"'].filter(Boolean)
  return bloque('controls_if', { mutacion: attrs.length ? `<mutation ${attrs.join(' ')}></mutation>` : '', valores, sentencias })
}
const paraCada = (variable, l, cuerpo) => bloque('controls_forEach', { campos: { VAR: variable }, valores: { LIST: l }, sentencias: { DO: cuerpo } })

// --- componentes ---
function tipoDe(comp) {
  if (!TIPOS[comp]) throw new Error(`El componente "${comp}" no está en el diseñador`)
  return TIPOS[comp]
}
const selector = comp => ({ COMPONENT_SELECTOR: comp })
const fijar = (comp, prop, valor) => bloque('component_set_get', {
  mutacion: `<mutation component_type="${tipoDe(comp)}" set_or_get="set" property_name="${prop}" is_generic="false" instance_name="${comp}"></mutation>`,
  campos: { ...selector(comp), PROP: prop }, valores: { VALUE: valor },
})
const leer = (comp, prop) => bloque('component_set_get', {
  mutacion: `<mutation component_type="${tipoDe(comp)}" set_or_get="get" property_name="${prop}" is_generic="false" instance_name="${comp}"></mutation>`,
  campos: { ...selector(comp), PROP: prop },
})
const metodo = (comp, nombre, ...args) => bloque('component_method', {
  mutacion: `<mutation component_type="${tipoDe(comp)}" method_name="${nombre}" is_generic="false" instance_name="${comp}"></mutation>`,
  campos: selector(comp), valores: indexados('ARG', args),
})
const cuando = (comp, evento, cuerpo) => bloque('component_event', {
  mutacion: `<mutation component_type="${tipoDe(comp)}" is_generic="false" instance_name="${comp}" event_name="${evento}"></mutation>`,
  campos: selector(comp), sentencias: { DO: cuerpo },
})

// --- procedimientos ---
// Las firmas van acá arriba porque un procedimiento se puede llamar antes de
// estar definido en el archivo (mostrarEstado, por ejemplo).
const FIRMAS = {
  pedirEstado: [],
  valor: ['id'],
  enviando: ['salida'],
  enviarComando: ['salida', 'prender'],
  mostrarError: ['mensaje'],
  mostrarEstado: [],
}

function firma(nombre, n) {
  const params = FIRMAS[nombre]
  if (!params) throw new Error(`Falta la firma de "${nombre}"`)
  if (n !== undefined && n !== params.length) throw new Error(`"${nombre}" lleva ${params.length} argumentos, no ${n}`)
  return params
}
const mutacionArgs = (params, extra = '') =>
  `<mutation${extra}>${params.map(p => `<arg name="${p}"></arg>`).join('')}</mutation>`

function procedimiento(nombre, cuerpo) {
  const params = firma(nombre)
  return bloque('procedures_defnoreturn', {
    mutacion: params.length ? mutacionArgs(params) : '',
    campos: { NAME: nombre, ...indexados('VAR', params) },
    sentencias: { STACK: cuerpo },
  })
}
function funcion(nombre, resultado) {
  const params = firma(nombre)
  return bloque('procedures_defreturn', {
    mutacion: params.length ? mutacionArgs(params) : '',
    campos: { NAME: nombre, ...indexados('VAR', params) },
    valores: { RETURN: resultado },
  })
}
const llamar = (nombre, ...args) => bloque('procedures_callnoreturn', {
  mutacion: mutacionArgs(firma(nombre, args.length), ` name="${nombre}"`),
  campos: { PROCNAME: nombre }, valores: indexados('ARG', args),
})
const llamarFuncion = (nombre, ...args) => bloque('procedures_callreturn', {
  mutacion: mutacionArgs(firma(nombre, args.length), ` name="${nombre}"`),
  campos: { PROCNAME: nombre }, valores: indexados('ARG', args),
})


// ===================================================================
//  BLOQUES — el programa
// ===================================================================

function programa(urlBase, publicable) {
  const errorHttp = () => llamar('mostrarError',
    unir(texto('El servidor respondió '), parametroEvento('responseCode'), texto(': '), parametroEvento('responseContent')))

  // ---------------- 1. configuración ----------------
  const configuracion = [
    comentar(declararGlobal('URL_BASE', texto(urlBase)),
      'La URL de tu proyecto de Supabase + /rest/v1/rpc/. Es la misma para todo el curso.'),
    comentar(declararGlobal('PUBLICABLE', texto(publicable)),
      'La publishable key del proyecto (sb_publishable_...). Es la misma para todo el curso.'),
    comentar(declararGlobal('CLAVE', texto('')),
      'La clave de la placa. Dejala vacía: la app la pide y la guarda en TinyDB. '
      + 'Si la escribís acá, se usa hasta que alguien guarde otra desde la app.'),
    comentar(declararGlobal('estado', lista()),
      'Lo último que devolvió leer_estado, como lista de pares. Leelo con la función valor.'),
  ]

  // ---------------- 2. bloques Nexus ----------------
  // Las claves de leer_estado que no son entradas ni salidas (util.reservados()
  // en backend/02-funciones.sql, sin las que no vienen en esa respuesta).
  const SISTEMA = ['ok', 'device_id', 'alumno', 'detectados', 'faltan', 'pendientes',
                   'reglas', 'edad', 'avisos', 'ultimo_error', 'syncs']

  const nexus = [
    comentar(declararGlobal('SISTEMA', lista(...SISTEMA.map(texto))),
      'Las claves de la respuesta que no son entradas ni salidas. mostrarEstado las saltea.'),

    comentar(procedimiento('pedirEstado',
      si([[estaVacio(global('CLAVE')),
           fijar('LabelConexion', 'Text', texto('Pegá la clave de tu placa y tocá "Guardar clave".'))]],
         sec(
           fijar('WebEstado', 'Url', unir(global('URL_BASE'), texto('leer_estado?apikey='), global('PUBLICABLE'),
                                           texto('&p_clave='), global('CLAVE'))),
           metodo('WebEstado', 'Get')))),
      'Pide el estado de la placa. La respuesta NO vuelve acá: llega en WebEstado.GotText.'),

    comentar(cuando('WebEstado', 'GotText',
      si([[comparar(parametroEvento('responseCode'), 'NEQ', numero(200)), errorHttp()]],
         sec(
           fijarGlobal('estado', metodo('WebEstado', 'JsonTextDecode', parametroEvento('responseContent'))),
           si([[buscarEnPares(texto('ok'), global('estado'), booleano(false)), llamar('mostrarEstado')]],
              llamar('mostrarError', buscarEnPares(texto('error'), global('estado'), texto('respuesta inesperada'))))))),
      'Guarda la respuesta en la variable estado y llama a mostrarEstado.'),

    comentar(funcion('valor',
      buscarEnPares(local('id'), global('estado'), numero(0))),
      'El valor de una entrada o salida, por su id: valor("t"), valor("bomba"). Si todavía no llegó, da 0.'),

    comentar(funcion('enviando',
      logica('OR',
        estaEnLista(unir(local('salida'), texto('=1')), buscarEnPares(texto('pendientes'), global('estado'), lista())),
        estaEnLista(unir(local('salida'), texto('=0')), buscarEnPares(texto('pendientes'), global('estado'), lista())))),
      'Verdadero mientras la placa todavía no recogió el último comando para esa salida (tarda unos 5 segundos).'),

    comentar(procedimiento('enviarComando', sec(
      fijar('WebComando', 'Url', unir(global('URL_BASE'), texto('enviar_comando?apikey='), global('PUBLICABLE'))),
      fijar('WebComando', 'RequestHeaders', lista(lista(texto('Content-Type'), texto('application/json')))),
      metodo('WebComando', 'PostText',
        unir(texto('{"p_clave":"'), global('CLAVE'), texto('","p_cmd":"'), local('salida'), texto('='), local('prender'), texto('"}'))))),
      'Prende (1) o apaga (0) una salida: enviarComando("bomba", 1). Si la salida tenía modo automático, se desactiva.'),

    cuando('WebComando', 'GotText',
      si([[comparar(parametroEvento('responseCode'), 'NEQ', numero(200)), errorHttp()]],
         conLocal('respuesta', metodo('WebComando', 'JsonTextDecode', parametroEvento('responseContent')),
           si([[buscarEnPares(texto('ok'), local('respuesta'), booleano(false)), llamar('pedirEstado')]],
              llamar('mostrarError', buscarEnPares(texto('error'), local('respuesta'), texto('respuesta inesperada'))))))),

    cuando('RelojEstado', 'Timer', llamar('pedirEstado')),

    comentar(procedimiento('mostrarError',
      fijar('LabelConexion', 'Text', unir(texto('Error: '), local('mensaje')))),
      'Muestra el error en pantalla. Los mensajes del servidor dicen qué corregir.'),

    comentar(cuando('Screen1', 'ErrorOccurred',
      llamar('mostrarError', unir(parametroEvento('functionName'), texto(': '), parametroEvento('message')))),
      'Sin esto, un corte de internet abre un cartel cada 5 segundos.'),
  ]

  // ---------------- 3. la app de ejemplo ----------------
  const edad = () => llamarFuncion('valor', texto('edad'))
  const par = i => elemento(local('par'), i)

  const app = [
    cuando('Screen1', 'Initialize', sec(
      fijarGlobal('CLAVE', metodo('TinyDB1', 'GetValue', texto('clave'), global('CLAVE'))),
      fijar('TextBoxClave', 'Text', global('CLAVE')),
      llamar('pedirEstado'))),

    cuando('BotonGuardarClave', 'Click', sec(
      fijarGlobal('CLAVE', recortar(leer('TextBoxClave', 'Text'))),
      metodo('TinyDB1', 'StoreValue', texto('clave'), global('CLAVE')),
      metodo('TextBoxClave', 'HideKeyboard'),
      llamar('pedirEstado'))),

    comentar(procedimiento('mostrarEstado', sec(
      si([[comparar(edad(), 'LT', numero(0)),
           fijar('LabelConexion', 'Text', texto('La placa todavía no se conectó nunca.'))],
          [comparar(edad(), 'GT', numero(30)),
           fijar('LabelConexion', 'Text', unir(texto('Placa desconectada: el último dato es de hace '), edad(), texto(' segundos.')))]],
         fijar('LabelConexion', 'Text', texto('Placa conectada'))),
      fijar('LabelDatos', 'Text', texto('')),
      paraCada('par', global('estado'),
        si([[no(estaEnLista(par(1), global('SISTEMA'))),
             fijar('LabelDatos', 'Text', unir(leer('LabelDatos', 'Text'), par(1), texto(': '), par(2), texto('\\n')))]])),
      si([[llamarFuncion('enviando', texto('bomba')),
           fijar('LabelBomba', 'Text', texto('Bomba: enviando…'))],
          [comparar(llamarFuncion('valor', texto('bomba')), 'EQ', numero(1)),
           fijar('LabelBomba', 'Text', texto('Bomba: prendida'))]],
         fijar('LabelBomba', 'Text', texto('Bomba: apagada'))))),
      'ESTE ES TUYO. Se llama cada vez que llegan datos nuevos. Cambialo para mostrar tus entradas y salidas: '
      + 'el ejemplo usa una salida "bomba"; poné el id de la tuya.'),

    cuando('BotonPrender', 'Click', llamar('enviarComando', texto('bomba'), numero(1))),
    cuando('BotonApagar', 'Click', llamar('enviarComando', texto('bomba'), numero(0))),
  ]

  // Dos columnas: a la izquierda lo que el alumno toca, a la derecha lo que no.
  return [[...configuracion, ...app], nexus]
}


// ===================================================================
//  BLOQUES — a XML
// ===================================================================

const escapar = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function bky(columnas) {
  let ultimoId = 0
  const nuevoId = () => 'nexus' + String(++ultimoId).padStart(4, '0')

  function xml(b, sangria, pos = '') {
    const s = ' '.repeat(sangria)
    let out = `${s}<block type="${b.tipo}" id="${nuevoId()}"${pos}>\n`
    if (b.mutacion) out += `${s}  ${b.mutacion}\n`
    for (const [k, v] of Object.entries(b.campos)) out += `${s}  <field name="${k}">${escapar(v)}</field>\n`
    if (b.comentario) out += `${s}  <comment pinned="false" h="100" w="280">${escapar(b.comentario)}</comment>\n`
    for (const [k, v] of Object.entries(b.valores)) out += `${s}  <value name="${k}">\n${xml(v, sangria + 4)}${s}  </value>\n`
    for (const [k, v] of Object.entries(b.sentencias)) out += `${s}  <statement name="${k}">\n${xml(v, sangria + 4)}${s}  </statement>\n`
    if (b.sig) out += `${s}  <next>\n${xml(b.sig, sangria + 4)}${s}  </next>\n`
    return out + `${s}</block>\n`
  }

  // Posiciones aproximadas: Kodular no necesita que sean exactas, y con clic
  // derecho > "Arrange Blocks Vertically" se reacomodan.
  const cuenta = b => 1 + [...Object.values(b.valores), ...Object.values(b.sentencias)].reduce((n, h) => n + cuenta(h), 0)
    + (b.sig ? cuenta(b.sig) : 0)

  let out = '<xml xmlns="http://www.w3.org/1999/xhtml">\n'
  columnas.forEach((bloques, col) => {
    let y = 0
    for (const b of bloques) {
      out += xml(b, 2, ` x="${col * 1000}" y="${y}"`)
      y += 60 + cuenta(b) * 18
    }
  })
  return out + `  <yacodeblocks ya-version="${YA_VERSION}" language-version="${LANGUAGE_VERSION}"></yacodeblocks>\n</xml>\n`
}


// ===================================================================
//  ZIP (sin dependencias)
// ===================================================================

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(archivos) {
  const locales = []
  const centrales = []
  let offset = 0
  // fecha fija (2026-01-01 00:00) para que regenerar sin cambios dé el mismo archivo
  const hora = 0
  const fecha = ((2026 - 1980) << 9) | (1 << 5) | 1

  for (const [nombre, contenido] of archivos) {
    const nombreBuf = Buffer.from(nombre, 'utf8')
    const datos = Buffer.from(contenido, 'utf8')
    const comprimido = deflateRawSync(datos, { level: 9 })
    const crc = crc32(datos)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)          // nombres en UTF-8
    local.writeUInt16LE(8, 8)               // deflate
    local.writeUInt16LE(hora, 10)
    local.writeUInt16LE(fecha, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(datos.length, 22)
    local.writeUInt16LE(nombreBuf.length, 26)
    local.writeUInt16LE(0, 28)
    locales.push(local, nombreBuf, comprimido)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(hora, 12)
    central.writeUInt16LE(fecha, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(comprimido.length, 20)
    central.writeUInt32LE(datos.length, 24)
    central.writeUInt16LE(nombreBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrales.push(central, nombreBuf)

    offset += local.length + nombreBuf.length + comprimido.length
  }

  const directorio = Buffer.concat(centrales)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(archivos.length, 8)
  fin.writeUInt16LE(archivos.length, 10)
  fin.writeUInt32LE(directorio.length, 12)
  fin.writeUInt32LE(offset, 16)
  return Buffer.concat([...locales, directorio, fin])
}


// ===================================================================
//  ARMADO
// ===================================================================

function propiedades(nombre) {
  return [
    `main=io.kodular.nexus.${nombre}.Screen1`,
    `name=${nombre}`,
    'assets=../assets',
    'source=../src',
    'build=../build',
    'versioncode=1',
    'versionname=1.0',
    'useslocation=False',
    'aname=Nexus IoT',
    'sizing=Responsive',
    'showlistsasjson=False',
    'theme=AppTheme',
    'color.primary=&HFF3F51B5',
    'color.primary.dark=&HFF303F9F',
    'color.accent=&HFFFF4081',
    'splashEnabled=True',
    'minSdk=21',
    'rtlSupport=False',
    'receiveSharedText=none',
    'screenNames=Screen1',
  ].join('\n') + '\n'
}

// Kodular toma el nombre del proyecto del nombre del archivo, y solo acepta
// letras, números y guión bajo.
function generar(nombre, url, publicable) {
  const pantalla = scm(nombre)                 // primero: registra los tipos de componentes
  const bloques = bky(programa(url.replace(/\/+$/, '') + '/rest/v1/rpc/', publicable))
  const carpeta = `src/io/kodular/nexus/${nombre}`
  const destino = join(AQUI, nombre + '.aia')
  writeFileSync(destino, zip([
    ['youngandroidproject/project.properties', propiedades(nombre)],
    [`${carpeta}/Screen1.scm`, pantalla],
    [`${carpeta}/Screen1.bky`, bloques],
  ]))
  console.log('escrito', destino)
}

function leerEnv(ruta) {
  if (!existsSync(ruta)) return {}
  return Object.fromEntries(readFileSync(ruta, 'utf8').split(/\r?\n/)
    .map(l => l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^(['"])(.*)\1$/, '$2')]))
}

generar('NexusIoT', MARCADOR_URL, MARCADOR_PUBLICABLE)

const env = leerEnv(join(AQUI, '..', 'portal', '.env'))
if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  generar('NexusIoT_curso', env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
} else {
  console.log('portal/.env no tiene VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY: no se generó NexusIoT_curso.aia')
}
