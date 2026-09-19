// El prompt que el alumno le pega a una IA para que le genere su firmware.
//
// Se arma con el hardware que el alumno declaró en el portal: si agrega un
// sensor, su prompt lo incluye solo.
//
// PROMPT.md (en la raíz del repo) se genera desde acá con `npm run prompt`,
// usando la plantilla de ejemplo. Si cambia el contrato de la API, se cambia
// este archivo y se regenera aquel.

const numeroEjemplo = [24.5, 61.2]

function lineaSensor(s) {
  const unidad = s.unidad ? `, en ${s.unidad}` : ''
  const pin = s.pin != null ? ` GPIO ${s.pin}.` : ''
  const conexion = s.conexion ? ` Conexión: ${s.conexion}.` : ''
  return `- "${s.id}": ${s.nombre || s.id}${unidad}.${pin}${conexion}`
}

function lineaRele(r) {
  const conexion = r.conexion ? ` ${r.conexion}.` : ''
  return `- "${r.id}": ${r.nombre || r.id}. GPIO ${r.pin}, se activa con nivel ${r.nivel_activo}.${conexion}`
}

const lista = (items) => items.map((x) => `"${x.id}"`).join(', ')

function cuerpoEjemplo(sensores, reles) {
  const estado = {}
  sensores.forEach((s, i) => { estado[s.id] = numeroEjemplo[i] ?? 10.5 })
  reles.forEach((r) => { estado[r.id] = 0 })
  return JSON.stringify(estado).replace(/,/g, ', ').replace(/:/g, ': ')
}

export function generarPrompt({ url, publicable, clave, canales }) {
  const sensores = canales.filter((c) => c.tipo === 'sensor')
  const reles = canales.filter((c) => c.tipo === 'rele')
  const librerias = [...new Set(sensores.map((s) => s.libreria).filter(Boolean))]

  const releEj = reles[0]?.id ?? 'vent'
  const sensorEj = sensores[0]?.id ?? 't'

  const s = []

  s.push(`Necesito el código completo para un ESP32 (Arduino / C++) que lea sensores,
controle relés y se comunique con un backend por HTTPS.`)

  s.push(`## Hardware

Placa ESP32 DevKit v1.

Sensores:
${sensores.map(lineaSensor).join('\n') || '(ninguno por ahora)'}

Relés:
${reles.map(lineaRele).join('\n') || '(ninguno por ahora)'}

Definí los sensores y los relés como **tablas**, para que agregar uno sea
agregar una fila:

- sensores: un arreglo de structs {id, función de lectura, último valor}. Si
  una lectura falla (NaN), se conserva el valor anterior.
- relés: un arreglo de structs {id, pin, nivel activo, encendido, momento del
  último cambio}. Cada relé tiene su propia polaridad (LOW o HIGH): resolvela
  por relé, no con una constante global.

No uses GPIO 0, 12, 14 ni 15 para relés: emiten pulsos durante el arranque y el
relé haría un clic en cada reinicio. GPIO 6 a 11 son de la flash interna y GPIO
34 a 39 son solo entrada.`)

  s.push(`## Librerías a usar

WiFi.h, WiFiClientSecure.h, HTTPClient.h, ArduinoJson.h (versión 7) y
Preferences.h.${librerias.length ? `\nPara los sensores: ${librerias.join('; ')}.` : ''}
No uses ninguna otra.`)

  s.push(`## Comunicación con el backend

Cada 5 segundos, mandar todos los valores y recibir en la MISMA respuesta los
comandos pendientes y las reglas del modo automático.

### La llamada

POST ${url}/rest/v1/rpc/sync?apikey=${publicable}

El único header que hace falta es: Content-Type: application/json

Cuerpo:

\`\`\`json
{
  "p_clave": "${clave}",
  "p_estado": ${cuerpoEjemplo(sensores, reles)}
}
\`\`\`

${[
    sensores.length ? `Los sensores (${lista(sensores)}) van como números decimales.` : '',
    reles.length ? `Los relés (${lista(reles)}) van como 1 (encendido) o 0 (apagado).` : '',
  ].filter(Boolean).join(' ')} Los nombres son exactamente esos, sin
traducirlos ni cambiar mayúsculas. Si un sensor todavía no tiene ninguna
lectura buena, su valor NaN se manda como null (ArduinoJson ya lo hace solo) y
el servidor lo acepta.

**Armá el cuerpo con ArduinoJson (JsonDocument y serializeJson), no
concatenando strings.** Con strings, una coma o una comilla de menos arma un
JSON inválido que el servidor rechaza antes de poder decir qué está mal.

### La respuesta

Cuando sale bien:

\`\`\`json
{"ok": true,
 "cmd": ["${releEj}=1"],
 "reglas": [{"rele": "${releEj}", "sensor": "${sensorEj}", "condicion": ">", "umbral": 28, "hist": 1.5}],
 "avisos": []}
\`\`\`

Procesala en este orden:

1. **"cmd"**: lista de comandos "rele=valor" (valor 1 o 0). Aplicá cada uno a
   su relé. Si llega un relé que la placa no tiene, ignoralo e imprimí un aviso.
2. **"reglas"**: ver "Modo automático" más abajo.
3. **"avisos"**: textos que avisan que un nombre no coincide con lo declarado
   (casi siempre un error de tipeo). Imprimilos por serie, pero solo cuando
   cambian respecto de la respuesta anterior, para no repetirlos cada 5 segundos.

Cuando algo está mal, la respuesta trae "ok": false y un "error" que dice
exactamente qué corregir. **Si la respuesta no trae "ok": true, imprimí la
respuesta COMPLETA en el monitor serie.** No preguntes solo por "ok": false: si
la URL o la clave pública están mal, la respuesta viene de otro lado y no trae
"ok".`)

  s.push(`## Modo automático: reglas

Las reglas las arma el usuario desde una app y llegan en cada respuesta. La
placa las evalúa ella misma, así sigue regulando aunque se corte internet.

Cada regla es:

\`\`\`json
{"rele": "${releEj}", "sensor": "${sensorEj}", "condicion": ">", "umbral": 28, "hist": 1.5}
\`\`\`

Qué significa, sin excepciones:

| condicion | se PRENDE si       | se APAGA si               |
|-----------|--------------------|---------------------------|
| ">"       | sensor > umbral    | sensor < umbral - hist    |
| "<"       | sensor < umbral    | sensor > umbral + hist    |

Si no se cumple ninguna de las dos, el relé queda como está. Esa franja del
medio es la histéresis, y es obligatoria: sin ella, con el valor oscilando
alrededor del umbral, el relé conmuta en cada lectura y se quema.

Reglas de implementación, todas obligatorias:

- Llegan **solo las reglas activas**, como mucho una por relé. No hay que
  chequear ningún campo "activa".
- La lista **reemplaza completa** a la anterior. Si llega vacía ([]), no hay
  ninguna regla.
- Guardá hasta 10 reglas en un arreglo de structs {rele, sensor, condicion,
  umbral, hist}.
- Si una regla nombra un sensor o un relé que la placa no tiene, o el sensor
  todavía no tiene ninguna lectura buena, ignorala.
- Un mismo relé no puede cambiar de estado por una regla más de una vez cada
  30 segundos.
- Guardá la lista en Preferences como el texto JSON recibido, **solo si cambió**
  respecto de la guardada, y cargala al arrancar. Así la placa regula aunque
  arranque sin internet.
- En cada ciclo de 5 segundos, el orden es: leer sensores → evaluar reglas →
  sincronizar con el backend.`)

  s.push(`## Robustez

- **El WiFi no puede bloquear el loop.** Al arrancar, esperá la conexión como
  mucho 15 segundos y seguí. Si se cae, reintentá con WiFi.reconnect() cada 10
  segundos, sin esperar. Mientras no hay WiFi, se siguen leyendo sensores y
  evaluando reglas; solo se saltea la sincronización.
- El servidor rechaza los envíos a menos de 3 segundos del anterior, aunque el
  anterior haya sido rechazado. Usá millis() para espaciarlos cada 5 segundos;
  **no uses delay() largo** ni llames a la sincronización en cada vuelta del loop.
- Para que el handshake TLS no se repita en cada llamada, usá una sola
  instancia global de WiFiClientSecure con setInsecure(), y HTTPClient con
  setReuse(true).
- Guardá en Preferences el estado de cada relé (una clave por id) y
  restauralo al arrancar, así un corte de luz no los deja en cualquier
  posición. Usá espacios de nombres separados para los relés y las reglas.`)

  s.push(`## Configuración

Dejá arriba de todo, bien visibles, estas constantes, con estos nombres:

\`\`\`cpp
const char *WIFI_SSID       = "";    // la red de 2.4 GHz de casa
const char *WIFI_PASS       = "";
const char *SUPABASE_URL    = "${url}";
const char *PUBLISHABLE_KEY = "${publicable}";
const char *CLAVE           = "${clave}";
\`\`\`

Agregá un modo de prueba (una constante #define) que, cuando está activo,
invente los valores de los sensores con funciones seno en vez de leerlos, así
puedo probar sin cablear nada.`)

  s.push(`## Qué quiero de vos

El sketch completo en un solo archivo, que compile tal cual, con comentarios en
español explicando las partes que no son obvias. Imprimí por serie a 115200 lo
que va pasando, para poder seguirlo desde el monitor.`)

  return s.join('\n\n')
}
