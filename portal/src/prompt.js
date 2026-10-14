// El prompt que el alumno le pega a una IA para que le genere su firmware.
//
// Se arma con el hardware que el alumno declaró en el portal: si agrega una
// entrada, su prompt la incluye sola.
//
// PROMPT.md (en la raíz del repo) se genera desde acá con `npm run prompt`,
// usando el kit de ejemplo. Si cambia el contrato con Firebase, se cambia este
// archivo, src/main.cpp y se regenera PROMPT.md.
//
// La contraseña del alumno NUNCA va en el prompt: queda "" y la completa él.

import { chipDe } from './validar.js'

const numeroEjemplo = [24.5, 61.2]

function lineaEntrada(e) {
  const unidad = e.unidad ? `, en ${e.unidad}` : ''
  const pin = e.pin != null ? ` GPIO ${e.pin}.` : ''
  const conexion = e.conexion ? ` Conexión: ${e.conexion}.` : ''
  return `- "${e.id}": ${e.nombre || e.id}${unidad}.${pin}${conexion}`
}

function lineaSalida(s) {
  const conexion = s.conexion ? ` ${s.conexion}.` : ''
  const pulsador = s.pulsador != null
    ? ` Tiene un pulsador en GPIO ${s.pulsador} (entre el GPIO y GND) que la prende o la apaga.`
    : ' No tiene pulsador.'
  return `- "${s.id}": ${s.nombre || s.id}. GPIO ${s.pin}, se activa con nivel ${s.nivel_activo}.${conexion}${pulsador}`
}

function lineaModo(pulsadorModo, llaveModo) {
  if (llaveModo != null) {
    return `Llave selectora de modo automático: GPIO ${llaveModo} (dos posiciones, entre el GPIO y GND).
Cerrada (lee LOW) = modo automático; abierta (lee HIGH) = manual. No hay pulsador de modo.`
  }
  return `Pulsador de modo automático: ${pulsadorModo != null
    ? `GPIO ${pulsadorModo} (entre el GPIO y GND). Cada pulsación activa o desactiva el modo automático.`
    : 'no hay. Deja la constante PIN_PULSADOR_MODO en -1.'}`
}

const PANTALLA = {
  oled: {
    hardware: 'OLED 0.96" SSD1306 de 128x64',
    libreria: '"Adafruit SSD1306" y "Adafruit GFX Library", de Adafruit',
    direcciones: '0x3C y 0x3D',
    dibujo: `arriba "Modo" en tamaño de texto 1; en el medio "AUTOMATICO" o "MANUAL"
  en tamaño 2; abajo, en tamaño 1, la conexión. Llama a display() una vez,
  al terminar de dibujar.`,
  },
  lcd: {
    hardware: 'LCD de 16x2 con módulo I2C (PCF8574)',
    libreria: '"LiquidCrystal I2C" de Frank de Brabander (`#include <LiquidCrystal_I2C.h>`)',
    direcciones: '0x27 y 0x3F',
    dibujo: `renglón 1 "Modo: AUTOMATICO" o "Modo: MANUAL"; renglón 2 la conexión.
  En vez de borrar la pantalla, rellena cada renglón con espacios hasta las 16
  letras: borrarla la hace parpadear.`,
  },
}

// Lo que la IA tiene que saber de los GPIO de cada chip. Los mismos datos que
// CHIPS en validar.js, que es lo que el portal deja guardar.
const PINES = {
  esp32: `No uses GPIO 0, 12, 14 ni 15 para salidas: emiten pulsos durante el arranque y
un relé haría un clic en cada reinicio. GPIO 6 a 11 son de la flash interna,
GPIO 34 a 39 solo sirven para entradas y GPIO 20, 24 y 28 a 31 no existen.`,
  esp32s3: `Es un ESP32-S3: sus GPIO no son los del ESP32 clásico. Usa exactamente los de
las listas de arriba. No uses GPIO 0 ni 3 para salidas: deciden cómo arranca la
placa. GPIO 22 a 25 no existen, 26 a 32 son de la flash, 35 a 37 de la PSRAM
(en las placas N8R8 y N16R8), 19 y 20 del USB, y 45 y 46 también deciden el
arranque.`,
}

const lista = (items) => items.map((x) => `"${x.id}"`).join(', ')

function estadoEjemplo(entradas, salidas) {
  const estado = {}
  entradas.forEach((e, i) => { estado[e.id] = numeroEjemplo[i] ?? 10.5 })
  salidas.forEach((s) => { estado[s.id] = 0 })
  estado.visto = { '.sv': 'timestamp' }
  return JSON.stringify(estado).replace(/,/g, ', ').replace(/:/g, ': ')
}

// pulsadorModo / llaveModo: GPIO o null (uno o el otro). pantalla: 'oled' | 'lcd' | null.
// chip: 'esp32' (si falta) | 'esp32s3'.
export function generarPrompt({ apiKey, databaseURL, usuario, canales, pulsadorModo, llaveModo, pantalla, chip }) {
  const entradas = canales.filter((c) => c.tipo === 'entrada')
  const salidas = canales.filter((c) => c.tipo === 'salida')
  const librerias = [...new Set(entradas.map((e) => e.libreria).filter(Boolean))]
  const llave = llaveModo != null
  if (llave) pulsadorModo = null
  const hayPulsadores = salidas.some((s) => s.pulsador != null) || pulsadorModo != null || llave
  const p = PANTALLA[pantalla]
  const c = chipDe(chip)

  const salidaEj = salidas[0]?.id ?? 'vent'
  const entradaEj = entradas[0]?.id ?? 't'

  const s = []

  s.push(`Necesito el código completo para un ${c.nombre} (Arduino / C++) que lea entradas
(sensores, botones), maneje salidas (relés, LEDs) con pulsadores locales y un
modo automático, y se comunique en tiempo real con Firebase Realtime Database.`)

  s.push(`## Hardware

Placa ${c.placa}.

Entradas (lo que la placa mide o lee y manda como número):
${entradas.map(lineaEntrada).join('\n') || '(ninguna por ahora)'}

Salidas (lo que se prende y se apaga):
${salidas.map(lineaSalida).join('\n') || '(ninguna por ahora)'}

${lineaModo(pulsadorModo, llaveModo)}
${p ? `
Pantalla: ${p.hardware}, por I2C: SDA en GPIO ${c.sda}, SCL en GPIO ${c.scl}.
` : ''}
Define las entradas y las salidas como **tablas**, para que agregar una sea
agregar una fila:

- entradas: un arreglo de structs {id, función de lectura, umbral de cambio,
  último valor, último valor publicado}. Si una lectura falla (NaN), se
  conserva el valor anterior.
- salidas: un arreglo de structs {id, pin, nivel activo, pulsador, encendida,
  momento del último cambio}. Cada salida tiene su propia polaridad (LOW o
  HIGH): resuélvela por salida, no con una constante global. El pulsador es un
  GPIO o -1 si no tiene.

Declara todos los structs arriba, antes de la primera función: el Arduino IDE
agrega las declaraciones de las funciones antes de la primera, y si un struct
que usan está más abajo, no compila.

${PINES[chip] || PINES.esp32}

Una entrada que se lee con analogRead tiene que estar entre GPIO ${c.adc1[0]} y ${c.adc1[1]}
(el ADC1): los demás pines analógicos son del ADC2, que con el WiFi prendido no
lee bien. Si alguna de la lista está en otro GPIO, avísame al principio de tu
respuesta.`)

  s.push(`## Librerías a usar

- **FirebaseClient de Mobizt, versión 2.2 o mayor** (\`#include <FirebaseClient.h>\`).
  **No uses** "Firebase ESP32 Client" ni "Firebase Arduino Client Library for
  ESP8266 and ESP32" (Firebase_ESP_Client.h, FirebaseESP32.h): están
  discontinuadas y tienen otra API. Si no conoces bien FirebaseClient 2.x,
  copia el esqueleto de abajo tal cual.
- ArduinoJson (versión 7), para leer y armar los JSON.
- WiFi.h, WiFiClientSecure.h y Preferences.h, que vienen con el ESP32.${librerias.length ? `\n- Para las entradas: ${librerias.join('; ')}.` : ''}${p ? `\n- Para la pantalla: Wire.h (viene con el ESP32) y ${p.libreria}.` : ''}

Si una entrada necesita una librería que no nombré, usa la más conocida para
ese sensor (una que esté en el Gestor de librerías del Arduino IDE) y, al
principio de tu respuesta, dime su nombre exacto para instalarla. Fuera de
eso, no uses ninguna otra.`)

  s.push(`## Dónde están los datos

La placa entra a Firebase con un usuario y contraseña, y trabaja SOLO dentro de
\`/placas/${usuario}\`:

- \`/placas/${usuario}/estado\`: lo escribe la placa. Un objeto con las
  entradas (${lista(entradas) || 'ninguna'}, números decimales con un decimal), las
  salidas (${lista(salidas) || 'ninguna'}, 1 encendida o 0 apagada), \`"visto"\` (la
  hora del servidor, como latido) y \`"aviso"\` (un texto, opcional). Ejemplo:

  \`\`\`json
  ${estadoEjemplo(entradas, salidas)}
  \`\`\`

  Los ids son exactamente esos, sin traducirlos ni cambiar mayúsculas. Una
  entrada que todavía no tiene ninguna lectura buena no se manda. Cómo se
  escribe (con rutas, junto con el borrado de los comandos) está en el
  esqueleto de más abajo.
- \`/placas/${usuario}/control\`: lo escriben la app y el portal; la placa lo
  lee. Ejemplo:

  \`\`\`json
  {"auto": true,
   "reglas": {"${salidaEj}": {"entrada": "${entradaEj}", "condicion": ">", "umbral": 28, "hist": 1.5}},
   "cmd": {"${salidaEj}": 1}}
  \`\`\`

  - \`auto\`: el modo automático (ver más abajo).
  - \`reglas\`: una por salida como mucho, con el id de la salida como clave.
  - \`cmd\`: pedidos de prender (1) o apagar (0) una salida. **La placa aplica
    cada uno y después lo BORRA** de la base, se haya aplicado o no.

**Los valores de "auto" y de "cmd" pueden llegar como booleano, como número o
como texto** ("1", "true", "on", e incluso con comillas adentro: "\\"1\\""),
porque la app de Kodular a veces los guarda así. Escribe una función que
acepte todas esas formas.`)

  s.push(`## Cómo conectarse (esqueleto de FirebaseClient 2.x)

Usa dos clientes: uno queda abierto escuchando \`control\` (el stream) y el
otro es para leer y escribir. Esta es la parte de Firebase; respétala:

\`\`\`cpp
#define ENABLE_USER_AUTH
#define ENABLE_DATABASE
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <FirebaseClient.h>
#include <ArduinoJson.h>

WiFiClientSecure ssl, sslStream;
AsyncClientClass cliente(ssl), clienteStream(sslStream);
UserAuth usuarioAuth(API_KEY, String(USUARIO) + "@nexus-iot.example.com", CONTRASENA, 3000);
FirebaseApp app;
RealtimeDatabase Database;
const String RAIZ = String("/placas/") + USUARIO;

void alResultado(AsyncResult &r);

// en setup(), después de intentar el WiFi:
ssl.setInsecure();
sslStream.setInsecure();
initializeApp(cliente, app, getAuth(usuarioAuth), alResultado, "entrar");
app.getApp<RealtimeDatabase>(Database);
Database.url(DATABASE_URL);
clienteStream.setSSEFilters("get,put,patch,cancel,auth_revoked");
Database.get(clienteStream, RAIZ + "/control", alResultado, true /* stream */, "stream");

// en loop(), solo si hay WiFi:
app.loop();
if (app.ready()) { /* acá se lee y se escribe */ }

// Todas las respuestas llegan acá; el último parámetro de cada pedido es su nombre.
void alResultado(AsyncResult &r) {
  if (r.isError()) {
    Serial.printf("[firebase] %s: %s (codigo %d)\\n", r.uid().c_str(),
                  r.error().message().c_str(), r.error().code());
    if (r.uid() == "control" || r.uid() == "publicar_cmd") { releer = true; releerDesde = millis(); }
    return;
  }
  if (!r.available()) return;
  if (r.uid() == "stream")       pedirControl = true;       // algo cambió en control
  else if (r.uid() == "control") procesarControl(r.c_str()); // control completo, en JSON
}

// Leer control completo (con el cliente normal, NO con el del stream):
Database.get(cliente, RAIZ + "/control", alResultado, false, "control");

// Publicar: UN solo update sobre RAIZ (no sobre RAIZ + "/estado"), con rutas
// como claves. Lleva el estado y borra los comandos ya procesados (null = borrar):
//   {"estado/${entradaEj}": 24.5, "estado/${salidaEj}": 1, "estado/visto": {".sv": "timestamp"},
//    "control/cmd/${salidaEj}": null}
Database.update(cliente, RAIZ, object_t(cuerpoJson), alResultado, hayCmd ? "publicar_cmd" : "publicar");

// Escribir el modo automático:
Database.set<bool>(cliente, RAIZ + "/control/auto", modoAuto, alResultado, "modo");
\`\`\`

- **Ante cualquier evento del stream, no interpretes lo que trae**: marca
  \`pedirControl = true\` y en el loop, si está marcado (y \`app.ready()\`),
  lee \`control\` completo con \`Database.get\` y procésalo entero. Así no hay
  que interpretar rutas parciales.
- \`control\` puede venir "null" si todavía está vacío: trátalo como vacío.
- **Los comandos se borran en la publicación, no con \`Database.remove\`**: al
  procesar un cmd, guarda su id en una lista; la publicación que sale enseguida
  agrega \`"control/cmd/<id>": null\` por cada uno (con ArduinoJson:
  \`doc[String("control/cmd/") + id] = nullptr;\`) y vacía la lista. Un remove
  aparte sería un viaje más a Firebase y el portal tardaría más en ver el cambio.
- Todas las claves de la publicación empiezan con \`estado/\` o \`control/cmd/\`.
  El update es todo o nada: una clave fuera de lugar (por ejemplo \`"${entradaEj}"\` sin
  \`estado/\`) hace que Firebase rechace la publicación entera.
- Para "visto", manda \`"estado/visto": {".sv": "timestamp"}\` dentro del mismo
  update: la hora la pone el servidor.
- Si da error la lectura de control ("control") o una publicación que borraba
  comandos ("publicar_cmd"), vuelve a leer control a los 2 segundos (con
  millis(), sin delay). Si no, el comando queda en la base y el portal sigue
  "esperando a la placa".
- Si el pedido "entrar" da error, imprime que se revisen USUARIO y CONTRASENA
  (son los mismos del portal). Al arrancar, el stream puede dar un error de
  permisos antes de terminar de entrar: es normal y se reconecta solo.
- **Arma los JSON con ArduinoJson (JsonDocument y serializeJson), no
  concatenando strings.**`)

  s.push(`## Qué hacer con "control"

Procésalo en este orden:

${llave ? `1. **"auto"**: el modo lo elige la llave, no lo que llegue. Si "auto" falta o
   no coincide con la posición de la llave, no lo apliques: vuelve a escribir
   la posición en \`control/auto\` y, si llegó un valor distinto, escribe en
   "aviso" "modo: lo elige la llave de la placa". Excepción: mientras la placa
   no terminó de escribir la posición, ignora el valor que llega (es viejo).` : `1. **"auto"**: activa o desactiva el modo automático. Excepción: si el
   pulsador de modo lo cambió y todavía no se pudo escribir en Firebase, ignora
   el valor que llega (es viejo).`}
2. **"reglas"**: reemplazan completas a las anteriores (si no hay, no hay
   ninguna regla). Guárdalas en Preferences como el texto JSON recibido,
   **solo si cambió**, y cárgalas al arrancar.
3. **"cmd"**: por cada salida, aplica el comando como una acción manual (ver
   "Modo automático") y anótalo para borrarlo en la publicación que sale
   enseguida. Si nombra una salida que la placa no tiene, avisa y bórralo igual.

Después, evalúa las reglas.`)

  s.push(`## Modo automático y control local

${llave ? `Hay UN modo automático para toda la placa (\`auto\`), y lo elige la llave
selectora: al arrancar, lee su posición y úsala (no hace falta guardar el
modo en Preferences).` : `Hay UN modo automático para toda la placa (\`auto\`), guardado en Preferences
para que sobreviva a un reinicio.`}

- **Modo automático activado**: las salidas que tienen regla las maneja la
  regla. Cualquier acción manual sobre ellas (un "cmd" de la app o del portal,
  o su pulsador) **se ignora**, y la placa escribe en "aviso" un texto como
  "${salidaEj}: pulsador ignorado, esta en modo automatico". Las salidas sin
  regla se siguen manejando a mano.
- **Modo automático desactivado**: las reglas no se evalúan; todo es manual.
${hayPulsadores ? `
${llave ? 'Pulsadores y llave' : 'Pulsadores'} (todos entre el GPIO y GND):

- Configúralos con \`pinMode(pin, INPUT_PULLUP)\`: suelto lee HIGH, apretado lee LOW.
- **Antirrebote obligatorio**: la lectura tiene que quedarse igual 50 ms antes
  de tomarla como cambio. Actúa una sola vez por pulsación, al apretar:
  guarda el último estado estable de cada pulsador y actúa cuando pasa de HIGH
  a LOW. Nada de un \`while\` que espere a que lo suelten.
- El pulsador de una salida la alterna (si estaba prendida la apaga y
  viceversa), como acción manual.
${llave ? `- La llave de modo usa el mismo antirrebote, pero actúa en los dos cambios:
  al pasar a LOW activa el modo automático y al pasar a HIGH lo desactiva. Al
  arrancar y en cada cambio, escribe el modo en \`control/auto\` (apenas haya
  conexión, si no la hay). Mientras no se haya escrito, el "auto" que llega de
  Firebase se ignora.` : `- El pulsador de modo alterna el modo automático, lo guarda en Preferences, y
  lo escribe en \`control/auto\` (apenas haya conexión, si no la hay). Mientras
  no se haya escrito, el "auto" que llega de Firebase se ignora.`}
- Revisa ${llave ? 'los pulsadores y la llave' : 'los pulsadores'} en CADA vuelta del loop, con o sin internet.
` : ''}
Cada regla es:

\`\`\`json
"${salidaEj}": {"entrada": "${entradaEj}", "condicion": ">", "umbral": 28, "hist": 1.5}
\`\`\`

Qué significa, sin excepciones:

| condicion | la salida se PRENDE si | la salida se APAGA si      |
|-----------|------------------------|----------------------------|
| ">"       | entrada > umbral       | entrada < umbral - hist    |
| "<"       | entrada < umbral       | entrada > umbral + hist    |

Si no se cumple ninguna de las dos, la salida queda como está. Esa franja del
medio es la histéresis, y es obligatoria: sin ella, con el valor oscilando
alrededor del umbral, la salida conmuta en cada lectura y un relé se quema.

- Guarda hasta 10 reglas en un arreglo de structs {salida, entrada, condicion,
  umbral, hist}.
- Si una regla nombra una entrada o una salida que la placa no tiene, o la
  entrada todavía no tiene ninguna lectura buena, ignórala.
- Una misma salida no puede cambiar de estado por una regla más de una vez cada
  30 segundos.`)

  if (p) s.push(`## Pantalla

Muestra el modo y la conexión, sin tildes (la pantalla no las tiene):

- ${p.dibujo}
- La conexión es "En linea" con WiFi y \`app.ready()\`, "Conectando..." con
  WiFi pero todavía sin \`app.ready()\` (y al arrancar, antes de intentar el
  WiFi), y "Sin WiFi" sin WiFi.
- \`Wire.begin(${c.sda}, ${c.scl})\`. La dirección cambia según el módulo: al arrancar,
  prueba ${p.direcciones} con \`Wire.beginTransmission\` y
  \`Wire.endTransmission\`, y usa la que conteste. Si no contesta ninguna,
  imprime por serie que se revisen SDA, SCL y la alimentación, y sigue sin
  pantalla: todo lo demás tiene que andar igual.
- Redibújala solo cuando cambia el modo o la conexión, nunca en cada vuelta.
- Actualízala en cada vuelta del loop ANTES de revisar el WiFi: así también
  muestra "Sin WiFi".`)

  s.push(`## Cuándo publicar el estado

- Lee las entradas y evalúa las reglas una vez por segundo (con millis()).
- Una salida que cambia (por regla, comando o pulsador) se publica enseguida.
  Después de procesar un cmd también, aunque la salida no haya cambiado: esa
  publicación es la que lo borra.
- Una entrada se publica cuando cambió al menos su umbral respecto de lo
  último publicado, y como mucho una vez por segundo: no esperes al latido
  para mandarla. El umbral va en la tabla de entradas:
  - 0,1 para un sensor digital, que ya da un valor estable (DS18B20, BME280,
    DHT…);
  - alrededor del 1 % de su escala para una lectura analógica (potenciómetro,
    LDR, humedad de suelo; todo lo que use analogRead): 1 si va de 0 a 100.

  Compara con float (\`fabs(valor - publicado) >= umbral\`); un 0.1 guardado
  en un entero vale 0.
- El ADC del ESP32 tiene ruido: cada lectura analógica es el promedio de 16
  analogRead seguidos. Sin promedio ni un umbral acorde, el valor cambia en
  cada lectura y la placa publica cada segundo para siempre.
- Aunque nada cambie, publica cada 15 segundos: es el latido ("visto") con el
  que el portal sabe que la placa está conectada.
- Al conectarse (o reconectarse) a Firebase, publica todo enseguida.
- El "aviso" se manda en la siguiente publicación, y a los 20 segundos se
  borra mandando "aviso": "".`)

  s.push(`## Robustez

- **El WiFi no puede bloquear el loop.** Al arrancar, espera la conexión como
  mucho 15 segundos y sigue. Si se cae, reintenta con WiFi.reconnect() cada 10
  segundos, sin esperar. Mientras no hay WiFi no llames a app.loop(), pero se
  siguen leyendo entradas, evaluando reglas y atendiendo los pulsadores.
- Después de \`WiFi.mode(WIFI_STA)\`, llama a \`WiFi.setSleep(false)\`: con el
  ahorro de energía, la radio duerme entre los avisos del router y cada
  comando del portal tarda cientos de ms más.
- **No uses delay()** en el loop, ni un \`while\` que espere algo (que suelten
  un pulsador, una respuesta): mientras espera, nada más responde. Además,
  FirebaseClient solo avanza sus pedidos cuando el loop llama a \`app.loop()\`:
  si una vuelta tarda 1 segundo, cada comando del portal tarda varios.
- **Leer un sensor tampoco puede frenar el loop.** Algunas librerías esperan
  por dentro: un DS18B20 tarda unos 750 ms por lectura (usa
  \`setWaitForConversion(false)\`: pide la conversión y lee el resultado en la
  lectura siguiente), un \`pulseIn\` (HC-SR04) necesita un tiempo máximo (30000
  µs alcanza), y un DHT no se lee más de una vez cada 2 segundos.
- **Los pedidos a Firebase son asíncronos**: \`update\`, \`get\`, \`set\` y
  \`remove\` vuelven enseguida y la respuesta llega después a \`alResultado\`.
  Al mandar una publicación, anota \`millis()\` y baja las banderas en ese
  mismo momento, no en \`alResultado\`; para escribir el modo, usa una bandera
  "enviando" que se baja con la respuesta. Si no, el loop repite el pedido en
  cada vuelta hasta que llega la respuesta, llena la cola de FirebaseClient
  (20 pedidos) y la librería **descarta sin avisar** los que siguen, entre
  ellos la lectura de control y el borrado de los cmd.
- Guarda en Preferences el estado de cada salida (una clave por id) y
  restáuralo al arrancar, así un corte de luz no las deja en cualquier
  posición. Usa espacios de nombres separados para las salidas, las reglas y
  el modo.`)

  s.push(`## Configuración

Deja arriba de todo, bien visibles, estas constantes, con estos nombres:

\`\`\`cpp
const char *WIFI_SSID    = "";    // la red de 2.4 GHz de casa
const char *WIFI_PASS    = "";
const char *API_KEY      = "${apiKey}";
const char *DATABASE_URL = "${databaseURL}";
const char *USUARIO      = "${usuario}";
const char *CONTRASENA   = "";    // la completo yo: es la misma del portal
${llave ? `const int PIN_LLAVE_MODO = ${llaveModo};` : `const int PIN_PULSADOR_MODO = ${pulsadorModo ?? -1};`}
\`\`\``)

  s.push(`## Qué quiero de ti

El sketch completo en un solo archivo, que compile tal cual, con comentarios en
español explicando las partes que no son obvias. Imprime por serie a 115200 lo
que va pasando (conexión, comandos, cambios de salidas, modo, avisos), para
poder seguirlo desde el monitor.

Es para usarlo con todo conectado: lee siempre las entradas de verdad. No
agregues un modo de prueba ni valores inventados.`)

  return s.join('\n\n')
}
