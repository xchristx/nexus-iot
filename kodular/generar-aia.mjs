// Genera un proyecto de Kodular (.aia) con los bloques genéricos de Nexus IoT:
// entrar con el usuario del alumno, recibir el estado de la placa en tiempo
// real y mandarle comandos y el modo automático.
//
//   node kodular/generar-aia.mjs
//
// Escribe siempre kodular/NexusIoT.aia, SIN google-services.json: es el que
// se le puede pasar a cualquiera (hay que subirle ese archivo en Media). Si
// existe kodular/google-services.json (el de la app Android del proyecto
// Firebase, en .gitignore), escribe además kodular/NexusIoT_curso.aia con ese
// archivo adentro y el package que dice, listo para los alumnos del curso.
//
// El formato está copiado de proyectos exportados por Kodular Creator
// (YaVersion 247, julio de 2026). Lo que importa:
//
// - Desde Kodular 2026.05 el componente viejo FirebaseDB no compila. Se usan
//   KodularFirebaseDatabase (versión 1, una sola propiedad: ProjectPath) y
//   KodularFirebaseAuthentication (versión 4). Los dos leen el proyecto de
//   assets/google-services.json, cuyo package_name tiene que ser igual al
//   package de la app (packagename en project.properties).
//
// - Esos componentes NO andan en el Companion: para probar hay que compilar
//   el APK.
//
// - Kodular NO tiene diccionarios de App Inventor ni JsonTextDecodeWithDictionaries.
//   Lo que llega de la placa se guarda en un TinyDB con su propio Namespace
//   (TinyDBEstado), que hace de diccionario: StoreValue, GetValue, GetTags.
//
// - Las versiones de los componentes son las de Kodular, no las de App
//   Inventor. Una versión más nueva que la del servidor hace fallar la
//   importación.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const AQUI = dirname(fileURLToPath(import.meta.url))

const YA_VERSION = '247'
const LANGUAGE_VERSION = '34'
const VERSIONES = {
  Form: 46, Label: 10, Button: 13, TextBox: 13, PasswordTextBox: 6, Clock: 4, TinyDB: 2,
  VerticalArrangement: 10, HorizontalArrangement: 10,
  KodularFirebaseDatabase: 1, KodularFirebaseAuthentication: 4,
}

// Tiene que ser el mismo dominio que en firebase/database.rules.json, en el
// portal (src/firebase.js) y en el firmware.
const DOMINIO = '@nexus-iot.example.com'

// El package de la app Android que se registra en Firebase. Si hay un
// google-services.json, se usa el package que dice ese archivo.
const PAQUETE_POR_DEFECTO = 'io.nexusiot.app'


// ===================================================================
//  DISEÑADOR
// ===================================================================

// [tipo, nombre, propiedades, hijos]. Width "-2" = ocupar todo el ancho.
// Los nombres de los componentes son parte del contrato: los bloques los
// nombran, y un bloque pegado en otro proyecto queda en rojo si no existen.
const COMPONENTES = [
  ['VerticalArrangement', 'ArregloLogin', { Width: '-2' }, [
    ['Label', 'LabelLogin', { Text: 'Tu usuario y tu contraseña (los mismos del portal):' }],
    ['TextBox', 'TextBoxUsuario', { Hint: 'iot2026-tu_nombre', Width: '-2' }],
    ['PasswordTextBox', 'TextBoxContrasena', { Hint: 'tu contraseña', Width: '-2' }],
    ['Button', 'BotonEntrar', { Text: 'Entrar' }],
  ]],
  ['Label', 'LabelConexion', { FontBold: 'True', FontSize: '18', Text: 'Entrá con tu usuario.' }],
  ['VerticalArrangement', 'ArregloPlaca', { Width: '-2', Visible: 'False' }, [
    ['Label', 'LabelDatos', { FontSize: '16' }],
    ['Label', 'LabelModo', { FontSize: '16', Text: 'Modo automático: ?' }],
    ['Button', 'BotonModo', { Text: 'Cambiar modo', Width: '-2' }],
    ['Label', 'LabelBomba', { FontSize: '16', Text: 'Bomba: ?' }],
    ['HorizontalArrangement', 'ArregloBomba', { Width: '-2' }, [
      ['Button', 'BotonPrender', { Text: 'Prender bomba', Width: '-2' }],
      ['Button', 'BotonApagar', { Text: 'Apagar bomba', Width: '-2' }],
    ]],
    ['Button', 'BotonSalir', { Text: 'Cambiar de usuario' }],
  ]],
  ['KodularFirebaseAuthentication', 'FirebaseAuth', {}],
  // Tres "bases", una por rama: cada una escucha y escribe en su ProjectPath,
  // que se fija después de entrar (lleva el usuario).
  ['KodularFirebaseDatabase', 'DBEstado', {}],
  ['KodularFirebaseDatabase', 'DBControl', {}],
  ['KodularFirebaseDatabase', 'DBCmd', {}],
  // Solo actualiza el cartel de "conectada": no consulta nada por internet.
  ['Clock', 'RelojConexion', { TimerAlwaysFires: 'False', TimerInterval: '5000' }],
  ['TinyDB', 'TinyDB1', {}],
  ['TinyDB', 'TinyDBEstado', { Namespace: 'NexusEstado' }],
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
    .replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
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
// Igualdad que sirve para texto y números (el = de la sección Lógica).
const iguales = (a, b) => bloque('logic_compare', { campos: { OP: 'EQ' }, valores: { A: a, B: b } })
const restar = (a, b) => bloque('math_subtract', { valores: { A: a, B: b } })
const minusculas = t => bloque('text_changeCase', { campos: { OP: 'DOWNCASE' }, valores: { TEXT: t } })
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
  entrar: [],
  valor: ['id'],
  conectada: [],
  autoActivo: [],
  enviarComando: ['salida', 'prender'],
  modoAuto: ['activar'],
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

function programa() {
  const errorFirebase = () => llamar('mostrarError', parametroEvento('message'))
  const guardarDato = () => sec(
    metodo('TinyDBEstado', 'StoreValue', parametroEvento('tag'), parametroEvento('value')),
    llamar('mostrarEstado'))
  const ruta = (resto) => unir(texto('placas/'), global('USUARIO'), texto(resto))

  // ---------------- 1. configuración ----------------
  const configuracion = [
    comentar(declararGlobal('DOMINIO', texto(DOMINIO)),
      'Se agrega al usuario para armar el correo de Firebase. No lo cambies: es el mismo para todo el curso.'),
    comentar(declararGlobal('USUARIO', texto('')),
      'Tu usuario, por ejemplo iot2026-ana_perez. Dejalo vacío: la app lo pide y lo guarda.'),
    comentar(declararGlobal('CONTRASENA', texto('')),
      'Tu contraseña. Dejala vacía: la app la pide y la guarda en el teléfono.'),
    comentar(declararGlobal('AUTO', booleano(false)),
      'El modo automático, tal como llega de Firebase. Leelo con la función autoActivo.'),
  ]

  // ---------------- 2. bloques Nexus ----------------
  // Lo que la placa escribe en "estado" y no es una entrada ni una salida.
  const SISTEMA = ['visto', 'aviso']

  const nexus = [
    comentar(declararGlobal('SISTEMA', lista(...SISTEMA.map(texto))),
      'Lo que llega en "estado" que no es una entrada ni una salida. mostrarEstado lo saltea.'),

    comentar(procedimiento('entrar', sec(
      fijar('LabelConexion', 'Text', texto('Entrando…')),
      metodo('FirebaseAuth', 'EmailPasswordLogin', unir(global('USUARIO'), global('DOMINIO')), global('CONTRASENA')))),
      'Entra a Firebase con tu usuario. La respuesta llega en FirebaseAuth.LoginSuccess o LoginFailed.'),

    comentar(cuando('FirebaseAuth', 'LoginSuccess', sec(
      metodo('TinyDBEstado', 'ClearAll'),
      fijar('DBEstado', 'ProjectPath', ruta('/estado')),
      fijar('DBControl', 'ProjectPath', ruta('/control')),
      fijar('DBCmd', 'ProjectPath', ruta('/control/cmd')),
      fijar('ArregloLogin', 'Visible', booleano(false)),
      fijar('ArregloPlaca', 'Visible', booleano(true)),
      metodo('DBEstado', 'GetTagList'),
      metodo('DBControl', 'GetValue', texto('auto'), booleano(false)),
      llamar('mostrarEstado'))),
      'Ya adentro: cada base apunta a su rama de TU placa. Desde acá, todo lo que cambie llega solo en DataChanged.'),

    cuando('FirebaseAuth', 'LoginFailed', sec(
      fijar('ArregloLogin', 'Visible', booleano(true)),
      fijar('ArregloPlaca', 'Visible', booleano(false)),
      llamar('mostrarError', texto('No se pudo entrar. Revisá tu usuario y tu contraseña: son los mismos del portal.')))),

    comentar(cuando('DBEstado', 'DataChanged', guardarDato()),
      'Llega cada vez que la placa cambia algo: tag es el id ("t", "bomba", "visto"...) y value su valor.'),

    comentar(cuando('DBEstado', 'TagList',
      paraCada('tag', parametroEvento('value'), metodo('DBEstado', 'GetValue', local('tag'), texto('')))),
      'Al entrar, pide todos los valores que ya estaban.'),

    cuando('DBEstado', 'GotValue', guardarDato()),

    cuando('DBControl', 'DataChanged',
      si([[iguales(parametroEvento('tag'), texto('auto')),
           sec(fijarGlobal('AUTO', parametroEvento('value')), llamar('mostrarEstado'))]])),

    cuando('DBControl', 'GotValue',
      si([[iguales(parametroEvento('tag'), texto('auto')),
           sec(fijarGlobal('AUTO', parametroEvento('value')), llamar('mostrarEstado'))]])),

    comentar(funcion('valor',
      metodo('TinyDBEstado', 'GetValue', local('id'), numero(0))),
      'El valor de una entrada o salida, por su id: valor("t"), valor("bomba"). Si todavía no llegó, da 0.'),

    comentar(funcion('conectada',
      comparar(restar(metodo('RelojConexion', 'SystemTime'), llamarFuncion('valor', texto('visto'))), 'LT', numero(60000))),
      'Verdadero si la placa mandó noticias en el último minuto (manda un latido cada 15 segundos).'),

    comentar(funcion('autoActivo',
      estaEnLista(minusculas(unir(texto(''), global('AUTO'))), lista(texto('true'), texto('1')))),
      'Verdadero si el modo automático está activado. Acepta true, "true", 1 o "1".'),

    comentar(procedimiento('enviarComando',
      metodo('DBCmd', 'StoreValue', local('salida'), local('prender'))),
      'Prende (1) o apaga (0) una salida: enviarComando("bomba", 1). Llega a la placa en menos de un segundo. '
      + 'En modo automático, una salida con regla no obedece: la placa lo ignora y avisa.'),

    comentar(procedimiento('modoAuto',
      metodo('DBControl', 'StoreValue', texto('auto'), local('activar'))),
      'Activa (true) o desactiva (false) el modo automático de la placa.'),

    cuando('DBEstado', 'FirebaseError', errorFirebase()),
    cuando('DBControl', 'FirebaseError', errorFirebase()),
    cuando('DBCmd', 'FirebaseError', errorFirebase()),

    comentar(cuando('RelojConexion', 'Timer', llamar('mostrarEstado')),
      'Solo para que el cartel pase a "desconectada" si la placa deja de mandar. No usa internet.'),

    comentar(procedimiento('mostrarError',
      fijar('LabelConexion', 'Text', unir(texto('Error: '), local('mensaje')))),
      'Muestra el error en pantalla.'),

    comentar(cuando('Screen1', 'ErrorOccurred',
      llamar('mostrarError', unir(parametroEvento('functionName'), texto(': '), parametroEvento('message')))),
      'Sin esto, un error abre un cartel que hay que cerrar a mano.'),
  ]

  // ---------------- 3. la app de ejemplo ----------------
  const aviso = () => metodo('TinyDBEstado', 'GetValue', texto('aviso'), texto(''))

  const app = [
    cuando('Screen1', 'Initialize', sec(
      fijarGlobal('USUARIO', metodo('TinyDB1', 'GetValue', texto('usuario'), texto(''))),
      fijarGlobal('CONTRASENA', metodo('TinyDB1', 'GetValue', texto('contrasena'), texto(''))),
      fijar('TextBoxUsuario', 'Text', global('USUARIO')),
      si([[no(estaVacio(global('CONTRASENA'))), llamar('entrar')]]))),

    cuando('BotonEntrar', 'Click', sec(
      fijarGlobal('USUARIO', minusculas(recortar(leer('TextBoxUsuario', 'Text')))),
      fijarGlobal('CONTRASENA', leer('TextBoxContrasena', 'Text')),
      metodo('TinyDB1', 'StoreValue', texto('usuario'), global('USUARIO')),
      metodo('TinyDB1', 'StoreValue', texto('contrasena'), global('CONTRASENA')),
      metodo('TextBoxUsuario', 'HideKeyboard'),
      llamar('entrar'))),

    cuando('BotonSalir', 'Click', sec(
      metodo('FirebaseAuth', 'Logout'),
      metodo('TinyDB1', 'ClearTag', texto('contrasena')),
      fijarGlobal('CONTRASENA', texto('')),
      fijar('TextBoxContrasena', 'Text', texto('')),
      fijar('ArregloPlaca', 'Visible', booleano(false)),
      fijar('ArregloLogin', 'Visible', booleano(true)),
      fijar('LabelConexion', 'Text', texto('Entrá con tu usuario.')))),

    comentar(procedimiento('mostrarEstado', sec(
      si([[comparar(llamarFuncion('valor', texto('visto')), 'EQ', numero(0)),
           fijar('LabelConexion', 'Text', texto('La placa todavía no se conectó nunca.'))],
          [llamarFuncion('conectada'),
           fijar('LabelConexion', 'Text', texto('Placa conectada'))]],
         fijar('LabelConexion', 'Text', texto('Placa desconectada: estos son los últimos datos que mandó.'))),
      fijar('LabelDatos', 'Text', texto('')),
      paraCada('id', metodo('TinyDBEstado', 'GetTags'),
        si([[no(estaEnLista(local('id'), global('SISTEMA'))),
             fijar('LabelDatos', 'Text', unir(leer('LabelDatos', 'Text'), local('id'), texto(': '),
                                               llamarFuncion('valor', local('id')), texto('\\n')))]])),
      si([[no(estaVacio(aviso())),
           fijar('LabelDatos', 'Text', unir(leer('LabelDatos', 'Text'), texto('Aviso de la placa: '), aviso()))]]),
      si([[llamarFuncion('autoActivo'),
           sec(fijar('LabelModo', 'Text', texto('Modo automático: ACTIVADO')),
               fijar('BotonModo', 'Text', texto('Pasar a manual')))]],
         sec(fijar('LabelModo', 'Text', texto('Modo automático: DESACTIVADO')),
             fijar('BotonModo', 'Text', texto('Pasar a automático')))),
      si([[comparar(llamarFuncion('valor', texto('bomba')), 'EQ', numero(1)),
           fijar('LabelBomba', 'Text', texto('Bomba: prendida'))]],
         fijar('LabelBomba', 'Text', texto('Bomba: apagada'))))),
      'ESTE ES TUYO. Se llama cada vez que llega un dato nuevo. Cambialo para mostrar tus entradas y salidas: '
      + 'el ejemplo usa una salida "bomba"; poné el id de la tuya.'),

    cuando('BotonModo', 'Click', llamar('modoAuto', no(llamarFuncion('autoActivo')))),
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

function propiedades(nombre, paquete) {
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
    // Tiene que coincidir con el package_name de google-services.json.
    `packagename=${paquete}`,
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
function generar(nombre, paquete, googleServices) {
  const pantalla = scm(nombre)                 // primero: registra los tipos de componentes
  const bloques = bky(programa())
  const carpeta = `src/io/kodular/nexus/${nombre}`
  const destino = join(AQUI, nombre + '.aia')
  const archivos = [
    ['youngandroidproject/project.properties', propiedades(nombre, paquete)],
    [`${carpeta}/Screen1.scm`, pantalla],
    [`${carpeta}/Screen1.bky`, bloques],
  ]
  if (googleServices) archivos.push(['assets/google-services.json', googleServices])
  writeFileSync(destino, zip(archivos))
  console.log('escrito', destino, '(package ' + paquete + (googleServices ? ', con google-services.json)' : ', sin google-services.json)'))
}

// El package de la primera app Android del archivo.
function paqueteDe(googleServices) {
  const datos = JSON.parse(googleServices)
  const paquete = datos.client?.[0]?.client_info?.android_client_info?.package_name
  if (!paquete) throw new Error('kodular/google-services.json no tiene client[0].client_info.android_client_info.package_name')
  return paquete
}

generar('NexusIoT', PAQUETE_POR_DEFECTO, null)

const rutaServicios = join(AQUI, 'google-services.json')
if (existsSync(rutaServicios)) {
  const servicios = readFileSync(rutaServicios, 'utf8')
  generar('NexusIoT_curso', paqueteDe(servicios), servicios)
} else {
  console.log('No hay kodular/google-services.json: no se generó NexusIoT_curso.aia (ver firebase/LEEME.md).')
}
