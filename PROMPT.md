<!-- GENERADO AUTOMATICAMENTE — no editar a mano.
     Fuente: portal/src/prompt.js   ·   Regenerar: cd portal && npm run prompt -->

# Prompt para generar el firmware del ESP32

Este es el prompt que cada alumno le pega a una IA para que le genere su sketch.

**El portal lo arma con el usuario y el hardware que declaró cada alumno**, en la
pantalla "Mis datos", con un botón de copiar. Si el alumno agrega una entrada o una
salida en Configurar, su prompt la incluye sola. La contraseña nunca va en el
prompt: el alumno la escribe después en el código.

Esta copia usa un kit de ejemplo (un DHT22 como entradas; bomba, ventilador y
LED como salidas, con pulsadores) y está acá para poder versionarla, revisarla en
un diff y probarla sin levantar el portal. Los marcadores `TU_API_KEY`,
`TUPROYECTO` e `iot2026-tu_nombre` los reemplaza el portal.

---

Necesito el código completo para un ESP32 (Arduino / C++) que lea entradas
(sensores, botones), maneje salidas (relés, LEDs) con pulsadores locales y un
modo automático, y se comunique en tiempo real con Firebase Realtime Database.

## Hardware

Placa ESP32 DevKit v1.

Entradas (lo que la placa mide o lee y manda como número):
- "t": Temperatura, en °C. Conexión: DHT22, pin de datos en GPIO 4.
- "h": Humedad, en %. Conexión: el mismo DHT22 de la temperatura.

Salidas (lo que se prende y se apaga):
- "bomba": Bomba. GPIO 26, se activa con nivel LOW. IN1 del módulo de relés. Tiene un pulsador en GPIO 32 (entre el GPIO y GND) que la prende o la apaga.
- "vent": Ventilador. GPIO 27, se activa con nivel LOW. IN2 del módulo de relés. Tiene un pulsador en GPIO 33 (entre el GPIO y GND) que la prende o la apaga.
- "luz": Luz. GPIO 2, se activa con nivel HIGH. LED integrado de la placa. No tiene pulsador.

Pulsador de modo automático: GPIO 25 (entre el GPIO y GND). Cada pulsación activa o desactiva el modo automático.

Definí las entradas y las salidas como **tablas**, para que agregar una sea
agregar una fila:

- entradas: un arreglo de structs {id, función de lectura, último valor,
  último valor publicado}. Si una lectura falla (NaN), se conserva el valor
  anterior.
- salidas: un arreglo de structs {id, pin, nivel activo, pulsador, encendida,
  momento del último cambio}. Cada salida tiene su propia polaridad (LOW o
  HIGH): resolvela por salida, no con una constante global. El pulsador es un
  GPIO o -1 si no tiene.

Declará todos los structs arriba, antes de la primera función: el Arduino IDE
agrega las declaraciones de las funciones antes de la primera, y si un struct
que usan está más abajo, no compila.

No uses GPIO 0, 12, 14 ni 15 para salidas: emiten pulsos durante el arranque y
un relé haría un clic en cada reinicio. GPIO 6 a 11 son de la flash interna y
GPIO 34 a 39 solo sirven para entradas.

## Librerías a usar

- **FirebaseClient de Mobizt, versión 2.2 o mayor** (`#include <FirebaseClient.h>`).
  **No uses** "Firebase ESP32 Client" ni "Firebase Arduino Client Library for
  ESP8266 and ESP32" (Firebase_ESP_Client.h, FirebaseESP32.h): están
  discontinuadas y tienen otra API. Si no conocés bien FirebaseClient 2.x,
  copiá el esqueleto de abajo tal cual.
- ArduinoJson (versión 7), para leer y armar los JSON.
- WiFi.h, WiFiClientSecure.h y Preferences.h, que vienen con el ESP32.
- Para las entradas: DHT sensor library y Adafruit Unified Sensor, de Adafruit (DHT.h).

No uses ninguna otra.

## Dónde están los datos

La placa entra a Firebase con un usuario y contraseña, y trabaja SOLO dentro de
`/placas/iot2026-tu_nombre`:

- `/placas/iot2026-tu_nombre/estado`: lo escribe la placa. Un objeto con las
  entradas ("t", "h", números decimales con un decimal), las
  salidas ("bomba", "vent", "luz", 1 encendida o 0 apagada), `"visto"` (la
  hora del servidor, como latido) y `"aviso"` (un texto, opcional). Ejemplo:

  ```json
  {"t": 24.5, "h": 61.2, "bomba": 0, "vent": 0, "luz": 0, "visto": {".sv": "timestamp"}}
  ```

  Los ids son exactamente esos, sin traducirlos ni cambiar mayúsculas. Una
  entrada que todavía no tiene ninguna lectura buena no se manda.
- `/placas/iot2026-tu_nombre/control`: lo escriben la app y el portal; la placa lo
  lee. Ejemplo:

  ```json
  {"auto": true,
   "reglas": {"bomba": {"entrada": "t", "condicion": ">", "umbral": 28, "hist": 1.5}},
   "cmd": {"bomba": 1}}
  ```

  - `auto`: el modo automático (ver más abajo).
  - `reglas`: una por salida como mucho, con el id de la salida como clave.
  - `cmd`: pedidos de prender (1) o apagar (0) una salida. **La placa aplica
    cada uno y después lo BORRA** de la base, se haya aplicado o no.

**Los valores de "auto" y de "cmd" pueden llegar como booleano, como número o
como texto** ("1", "true", "on", e incluso con comillas adentro: "\"1\""),
porque la app de Kodular a veces los guarda así. Escribí una función que
acepte todas esas formas.

## Cómo conectarse (esqueleto de FirebaseClient 2.x)

Usá dos clientes: uno queda abierto escuchando `control` (el stream) y el
otro es para leer y escribir. Esta es la parte de Firebase; respetala:

```cpp
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
    Serial.printf("[firebase] %s: %s (codigo %d)\n", r.uid().c_str(),
                  r.error().message().c_str(), r.error().code());
    return;
  }
  if (!r.available()) return;
  if (r.uid() == "stream")       pedirControl = true;       // algo cambió en control
  else if (r.uid() == "control") procesarControl(r.c_str()); // control completo, en JSON
}

// Leer control completo (con el cliente normal, NO con el del stream):
Database.get(cliente, RAIZ + "/control", alResultado, false, "control");

// Publicar el estado: un JSON armado con ArduinoJson, como object_t.
Database.update(cliente, RAIZ + "/estado", object_t(cuerpoJson), alResultado, "publicar");

// Borrar un comando ya procesado:
Database.remove(cliente, RAIZ + "/control/cmd/" + id, alResultado, "borrar_cmd");

// Escribir el modo automático:
Database.set<bool>(cliente, RAIZ + "/control/auto", modoAuto, alResultado, "modo");
```

- **Ante cualquier evento del stream, no interpretes lo que trae**: marcá
  `pedirControl = true` y en el loop, si está marcado (y `app.ready()`),
  leé `control` completo con `Database.get` y procesalo entero. Así no hay
  que interpretar rutas parciales.
- `control` puede venir "null" si todavía está vacío: tratalo como vacío.
- Para "visto", mandá `{"visto": {".sv": "timestamp"}}` dentro del mismo
  update: la hora la pone el servidor.
- Si el pedido "entrar" da error, imprimí que se revisen USUARIO y CONTRASENA
  (son los mismos del portal). Al arrancar, el stream puede dar un error de
  permisos antes de terminar de entrar: es normal y se reconecta solo.
- **Armá los JSON con ArduinoJson (JsonDocument y serializeJson), no
  concatenando strings.**

## Qué hacer con "control"

Procesalo en este orden:

1. **"auto"**: activá o desactivá el modo automático. Excepción: si el
   pulsador de modo lo cambió y todavía no se pudo escribir en Firebase, ignorá
   el valor que llega (es viejo).
2. **"reglas"**: reemplazan completas a las anteriores (si no hay, no hay
   ninguna regla). Guardalas en Preferences como el texto JSON recibido,
   **solo si cambió**, y cargalas al arrancar.
3. **"cmd"**: por cada salida, aplicá el comando como una acción manual (ver
   "Modo automático") y borralo de la base. Si nombra una salida que la placa
   no tiene, avisá y borralo igual.

Después, evaluá las reglas.

## Modo automático y control local

Hay UN modo automático para toda la placa (`auto`), guardado en Preferences
para que sobreviva a un reinicio.

- **Modo automático activado**: las salidas que tienen regla las maneja la
  regla. Cualquier acción manual sobre ellas (un "cmd" de la app o del portal,
  o su pulsador) **se ignora**, y la placa escribe en "aviso" un texto como
  "bomba: pulsador ignorado, esta en modo automatico". Las salidas sin
  regla se siguen manejando a mano.
- **Modo automático desactivado**: las reglas no se evalúan; todo es manual.

Pulsadores (todos entre el GPIO y GND):

- Configuralos con `pinMode(pin, INPUT_PULLUP)`: suelto lee HIGH, apretado lee LOW.
- **Antirrebote obligatorio**: la lectura tiene que quedarse igual 50 ms antes
  de tomarla como cambio. Actuá una sola vez por pulsación, al apretar.
- El pulsador de una salida la alterna (si estaba prendida la apaga y
  viceversa), como acción manual.
- El pulsador de modo alterna el modo automático, lo guarda en Preferences, y
  lo escribe en `control/auto` (apenas haya conexión, si no la hay). Mientras
  no se haya escrito, el "auto" que llega de Firebase se ignora.
- Revisá los pulsadores en CADA vuelta del loop, con o sin internet.

Cada regla es:

```json
"bomba": {"entrada": "t", "condicion": ">", "umbral": 28, "hist": 1.5}
```

Qué significa, sin excepciones:

| condicion | la salida se PRENDE si | la salida se APAGA si      |
|-----------|------------------------|----------------------------|
| ">"       | entrada > umbral       | entrada < umbral - hist    |
| "<"       | entrada < umbral       | entrada > umbral + hist    |

Si no se cumple ninguna de las dos, la salida queda como está. Esa franja del
medio es la histéresis, y es obligatoria: sin ella, con el valor oscilando
alrededor del umbral, la salida conmuta en cada lectura y un relé se quema.

- Guardá hasta 10 reglas en un arreglo de structs {salida, entrada, condicion,
  umbral, hist}.
- Si una regla nombra una entrada o una salida que la placa no tiene, o la
  entrada todavía no tiene ninguna lectura buena, ignorala.
- Una misma salida no puede cambiar de estado por una regla más de una vez cada
  30 segundos.

## Cuándo publicar el estado

- Leé las entradas y evaluá las reglas una vez por segundo (con millis()).
- Una salida que cambia (por regla, comando o pulsador) se publica enseguida.
- Una entrada se publica cuando cambió al menos 0,1 respecto de lo último
  publicado, y como mucho una vez por segundo.
- Aunque nada cambie, publicá cada 15 segundos: es el latido ("visto") con el
  que el portal sabe que la placa está conectada.
- Al conectarse (o reconectarse) a Firebase, publicá todo enseguida.
- El "aviso" se manda en la siguiente publicación, y a los 20 segundos se
  borra mandando "aviso": "".

## Robustez

- **El WiFi no puede bloquear el loop.** Al arrancar, esperá la conexión como
  mucho 15 segundos y seguí. Si se cae, reintentá con WiFi.reconnect() cada 10
  segundos, sin esperar. Mientras no hay WiFi no llames a app.loop(), pero se
  siguen leyendo entradas, evaluando reglas y atendiendo los pulsadores.
- **No uses delay()** en el loop: con un delay los pulsadores no responden.
- Guardá en Preferences el estado de cada salida (una clave por id) y
  restauralo al arrancar, así un corte de luz no las deja en cualquier
  posición. Usá espacios de nombres separados para las salidas, las reglas y
  el modo.

## Configuración

Dejá arriba de todo, bien visibles, estas constantes, con estos nombres:

```cpp
const char *WIFI_SSID    = "";    // la red de 2.4 GHz de casa
const char *WIFI_PASS    = "";
const char *API_KEY      = "TU_API_KEY";
const char *DATABASE_URL = "https://TUPROYECTO-default-rtdb.firebaseio.com";
const char *USUARIO      = "iot2026-tu_nombre";
const char *CONTRASENA   = "";    // la completo yo: es la misma del portal
const int PIN_PULSADOR_MODO = 25;
```

Agregá un modo de prueba (una constante #define) que, cuando está activo,
invente los valores de las entradas con funciones seno en vez de leerlos, así
puedo probar sin cablear nada.

## Qué quiero de vos

El sketch completo en un solo archivo, que compile tal cual, con comentarios en
español explicando las partes que no son obvias. Imprimí por serie a 115200 lo
que va pasando (conexión, comandos, cambios de salidas, modo, avisos), para
poder seguirlo desde el monitor.
