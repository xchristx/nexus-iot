# Nexus IoT — contexto para una conversación nueva

Responde en español de Bolivia (tuteo, sin voseo), que es como escribe el usuario.

## Qué es y para quién

El usuario (Christian) le arma la infraestructura a un amigo docente. Una clase de
~20 alumnos practica **Kodular** contra un backend real, con un ESP32 por alumno.
Los alumnos no aprenden backend ni firmware: se dan de alta en un portal, generan
el sketch con una IA a partir de un prompt, y hacen su app Kodular desde una
plantilla. La plantilla propia del docente NO está en el repo; la que generamos
nosotros está en `kodular/` (ver abajo). El docente tiene poco tiempo: todo tiene
que andar sin que él toque código.

Historia: Adafruit IO (30 datos/min para toda la cuenta) → Supabase con HTTP y
polling (v1–v3, hasta 10 s de demora) → **v4: Firebase, en tiempo real**.

**Estado (2026-09-25):** v5 implementada y verificada local. v5 = **tablero
personalizable** (widget por canal), **alertas en entradas** y **app Android propia**
(el portal empaquetado con Capacitor, `portal/android/`), porque muchos alumnos no
van a tener tiempo de hacer la app en Kodular. Todavía nadie la usó contra un
Firebase real ni con una placa.

**Alexa (2026-10-01), opcional:** skill **Smart Home** ("Alexa, prende la bomba")
en una Lambda de AWS (`alexa/`), implementada y verificada contra los emuladores.
Alumno vincula su placa; docente vincula un "Echo del laboratorio" con un curso y
elige placas. Solo algunos alumnos la van a usar: sin `VITE_ALEXA_CLIENTE_ID` el
portal no muestra nada. Nada de Amazon se probó todavía.

Pedidos que motivaron v4:

- **Tiempo real** en vez de cada 5 s.
- **Control local**: un pulsador por salida (alterna) y un **pulsador de modo**.
- **Modo automático UNO por placa** (`control/auto`). En AUTO, las salidas con
  regla las maneja la regla y **se ignora todo lo manual** (app, portal, pulsador;
  la placa escribe un `aviso`). Las salidas sin regla siguen manuales. El usuario
  lo eligió así; reemplaza el "comando manual desactiva la regla" de v3.
- Todo pasó a Firebase, Supabase se eliminó (el usuario lo eligió).

Vocabulario (pedido del usuario, 2026-09-23): **entradas** (lo que la placa mide o
lee) y **salidas** (lo que prende y apaga), nunca "sensores"/"relés" salvo como
ejemplo de componente físico ("módulo de relés", "DHT sensor library").

Idioma (pedido del usuario, 2026-10-01): **todos los textos en español de Bolivia**,
con tuteo ("toca", "tienes", "bórralo"), nunca voseo ("tocá", "tenés", "borralo"):
portal, app, prompt, Kodular, firmware, guías y comentarios. Ojo con las formas
cortas (`usá`, `leé`) y las de raíz que cambia (`elige`, `vuelve`, `prueba`, `pídele`).

Es un repo git (rama `main`, remoto `github.com/xchristx/nexus-iot`).

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `firebase/database.rules.json` | Reglas de RTDB: aislamiento por usuario, docente, validación de forma |
| `firebase/pruebas/reglas.test.mjs` | 34 pruebas de las reglas (`cd firebase && npm test`, necesita Java 21+) |
| `firebase/pruebas/alexa.test.mjs` | 15 pruebas de la Lambda contra el emulador, con `simular-placa.mjs` de hijo (mismo `npm test`, archivos en serie: `--test-concurrency=1`) |
| `firebase/pruebas/simular-placa.mjs` | Placa de mentira en Node (misma lógica que `main.cpp`); `p <salida>` y `m` simulan pulsadores |
| `firebase/curso-ejemplo.json`, `plantilla-kit-ejemplo.json` | Curso vacío y kit de ejemplo, para importar en la consola |
| `firebase/LEEME.md` | Puesta en marcha en Firebase, recetas del docente, límites, emuladores |
| `portal/` | React + Vite, para Netlify. `src/firebase.js` (toda la capa de datos), `src/validar.js`, `src/pantallas/` (Entrar, MiPlaca, Configurar, MisDatos, Clase = docente) |
| `portal/src/componentes/widgets.jsx` | Widgets (número, medidor, barra, indicador; interruptor, botón grande), íconos SVG, `widgetDe` (valores por defecto) |
| `portal/src/tema.js`, `pantallas/Tema.jsx` | Tema local (localStorage `nexus-iot:tema`, NO Firebase): presets, colores, letra, forma, título; `normalizar()` valida todo; `aplicar()` pisa las variables CSS de `<html>`. Pruebas: `portal/pruebas/tema.test.mjs` (`cd portal && npm test`) |
| `portal/src/cuentas.js`, `nombres.js` | Sin Firebase: contraseñas, lista de altas, usuario a partir del nombre (`nombres.js` lo reexporta `firebase.js`) |
| `portal/src/alertas.js`, `avisar.js` | Evaluación de alertas con histéresis (`useAlertas`, `cruza` para el docente); pitido y notificación web o nativa |
| `portal/android/`, `capacitor.config.json`, `ANDROID.md` | App Android (Capacitor 7). `ANDROID.md`: compilar, firmar, Play Store (prueba interna), emuladores |
| `portal/public/sw.js`, `privacidad.html` | Service worker mínimo (solo notificaciones en Chrome Android) y la política de privacidad que pide Play |
| `portal/assets/` | `icono.svg` → PNG (`generar-iconos.mjs`) → `npx capacitor-assets generate --android` |
| `portal/src/prompt.js` | Genera el prompt del firmware con el hardware del alumno. **Única fuente** de `PROMPT.md` (`cd portal && npm run prompt`) |
| `portal/src/plantilla-ejemplo.js` | Kit de ejemplo; solo para `PROMPT.md`. Igual a `plantilla-kit-ejemplo.json` y a las tablas de `main.cpp` |
| `src/main.cpp` | Firmware de referencia (PlatformIO, FirebaseClient 2.2.13). Tablas de entradas y salidas (con pulsador), reglas, modo |
| `arduino/NexusIoT/NexusIoT.ino` | Mismo firmware para Arduino IDE = `arduino/cabecera.txt` + `main.cpp` con `USAR_DHT 0` y WiFi/contraseña vacíos |
| `NexusIoT-arduino.zip` | Lo que se reparte: el `.ino` + `arduino/LEEME.txt` |
| `kodular/generar-aia.mjs` | Genera `NexusIoT.aia` (sin google-services) y `NexusIoT_curso.aia` (con `kodular/google-services.json`, en `.gitignore`). Node sin dependencias |
| `kodular/GUIA.md` | Importar, compilar el APK (el Companion NO anda), usar los bloques, armarlo a mano |
| `alexa/lambda/` | Lambda Smart Home, Node sin dependencias: `index` (enruta), `hogar` (directivas), `oauth` (canje por Function URL), `vinculo` (códigos y marcas), `placa` (placa → dispositivos, puro), `tokens` (HMAC), `rtdb` (REST como admin; `RTDB_EMULADOR` usa `Bearer owner`) |
| `alexa/LEEME.md`, `skill.json`, `icono-*.png` | Puesta en marcha (AWS us-east-1, consola de Alexa, account linking, beta), manifiesto de referencia, íconos |
| `portal/src/alexa.js`, `pantallas/AutorizarAlexa.jsx` | `/alexa` = Authorization URI: valida el pedido de Amazon (solo `pitangui`/`layla`/`alexa.amazon.co.jp`), genera el código y su SHA-256. Pruebas: `portal/pruebas/alexa.test.mjs` |
| `README.md` | Portada de GitHub. Corta, sin duplicar `LEEME.md` |
| `LEEME.md` | Documentación general, modelo, decisiones, firmware, qué falta probar |

## ⚠️ Secretos

Todo lo versionado lleva **marcadores**: `WIFI_SSID`/`WIFI_PASS`/`CONTRASENA`
vacíos, `"PEGA_ACA_LA_API_KEY"`, `https://TUPROYECTO-default-rtdb.firebaseio.com`,
`"PEGA_ACA_TU_USUARIO"`. Nunca los reemplaces por los del usuario en algo que se
commitee, ni copies sus datos a documentación, prompts o al `.ino`/zip.

Sus datos reales viven en archivos que están en `.gitignore` — no los leas salvo
que haga falta, y no los cites:

- `src/secretos.h` — sus seis constantes reales; `main.cpp` lo usa si existe.
- `src/main.local.cpp` — una copia vieja del firmware con datos (de antes de `secretos.h`).
- `portal/.env` — hoy todavía tiene las variables VIEJAS de Supabase; hay que
  cambiarlas por las `VITE_FIREBASE_*` (ver `portal/.env.example`).
- `kodular/google-services.json` y `kodular/NexusIoT_curso.aia`.
- `portal/android/keystore.properties`, `*.jks`, `*.apk`, `*.aab`: la firma de la app
  y lo compilado (el APK lleva adentro las `VITE_FIREBASE_*` del `.env`).
- `portal/android/app/src/main/assets/public`: copia del build web (gitignore de Capacitor).
- Alexa: la **cuenta de servicio** de Firebase (`*firebase-adminsdk*.json`, acceso
  total), `CLIENTE_SECRETO` y `SECRETO_TOKENS` van SOLO en las variables de la Lambda.
  `alexa/*.zip` en `.gitignore`. `VITE_ALEXA_CLIENTE_ID` es público.

⚠️ El commit `1223146` ("labels renombrados", ya pusheado) tiene su contraseña de
WiFi real en `src/main.cpp`. Se le avisó el 2026-09-24; reescribir el historial
es decisión suya.

⚠️ Entre `f60a15a` ("firebase version") y `846bd6c` (v7), `src/main.cpp` se
pusheó con TODOS sus datos reales (WiFi, API key, URL de la base, usuario y
contraseña de una cuenta de alumno): siguen en el historial. Se le avisó el
2026-10-01 (cambiar las contraseñas; reescribir el historial es decisión suya).
Desde entonces `main.cpp` vuelve a tener marcadores y **sus datos viven en
`src/secretos.h`** (gitignore): `main.cpp` lo incluye con `#if
__has_include("secretos.h")`, así `pio run` compila con sus datos sin tocar
`main.cpp`. Las líneas de ese bloque llevan `// secretos.h` y el comando del
`.ino` (`LEEME.md`) las borra y pone los seis marcadores. Nunca citar los valores.

Antes de cualquier `git add`, si tocaste `src/main.cpp`, el `.ino` o el `.aia`,
verifica que sigan con los marcadores.

## Modelo de datos (RTDB)

```text
cursos/{CODIGO}      {nombre, plantilla:{entradas[], salidas[], reglas[], pulsador_modo, tablero, alertas}}
credenciales/{usuario} {contrasena, creado}   SOLO el docente lee y escribe (v6)
docentes/{uid}       true        (se crea a mano en la consola)
alumnos/{usuario}    {curso, nombre, creado}
placas/{usuario}/
  config/entradas/{id}   {nombre, unidad, conexion, libreria, pin, orden}
  config/salidas/{id}    {nombre, pin (0-33), nivel_activo LOW|HIGH, pulsador (0-33), conexion, orden}
  config/pulsador_modo   GPIO
  control/auto           bool (o "1"/"true"… si lo escribe Kodular)
  control/reglas/{salida} {entrada, condicion >|<, umbral, hist}
  control/cmd/{salida}   1|0 (o texto); la placa lo aplica y lo BORRA
  estado/{id}            número o 0/1; estado/visto (timestamp servidor); estado/aviso (texto)
  tablero/{id}           {widget, color, icono, min, max}  solo portal/app (v5)
  alertas/{entrada}      {condicion >|<, umbral, hist}     solo portal/app (v5)
  alexa                  {desde}  vinculada; solo la Lambda escribe, alumno/docente BORRAN = desvincular
cursos/{C}/alexa       {desde, docente}  Echo del laboratorio (Lambda); alumnos/{u}: true lo elige el docente
alexa/codigos/{sha256} {usuario} | {curso, docente}, redirect, creado(= now)  lo deja el portal, la Lambda lo canjea (10 min)
```

- `tablero` y `alertas` están **fuera de `config` a propósito**: la placa, el prompt y
  Kodular no los leen, así que se cambian sin tocar el contrato con ellos. Widgets
  de entrada `numero|medidor|barra|indicador`, de salida `interruptor|boton`; colores
  `verde|azul|ambar|rojo|violeta|gris` (en las reglas y en `COLORES` de widgets.jsx).
  La plantilla del curso puede traer `tablero` (mapa) y `alertas` (lista); el alta
  descarta lo que nombre un canal inexistente. `borrarCanal` borra también ambos.

- **Usuario** = `curso.toLowerCase() + '-' + nombre normalizado` (sin tildes,
  minúsculas, espacios→`_`): `iot2026-ana_perez`. **Correo** = usuario +
  `@nexus-iot.example.com` (no existe). Las reglas comparan
  `auth.token.email === $usuario + DOMINIO`. Ese dominio está en: reglas, portal,
  prompt, `main.cpp`, placa simulada, generador del `.aia`.
- Una cuenta por alumno, para portal, placa y app. Contraseña ≥ 6 (mínimo de Firebase).
- Ids `^[a-z][a-z0-9_]{0,14}$`, reservados `visto, aviso, auto, cmd, reglas`. Máx.
  10 entradas y 10 salidas: lo controla el portal (las reglas de RTDB no cuentan hijos).
- **Alta (v6): la hace el docente**, no el alumno. `crearAlumnos()` en `firebase.js`,
  con la lista de `prepararLista()` (`cuentas.js`: un nombre por renglón, repetidos
  → `_2`, `_3`). Por cada uno: guarda `credenciales/{u}` PRIMERO (así un reintento
  reconoce la cuenta), crea la cuenta en una **segunda instancia de Auth en memoria**
  (`auxiliar()`, no le cierra la sesión al docente) y escribe `alumnos` + `placas`
  (copia de la plantilla). `nuevaContrasena()` y `borrarAlumno()` entran como el
  alumno con la guardada (`comoAlumno()`) para `updatePassword` / `deleteUser`.
  Contraseñas `palabra-1234` (`generarContrasena`, crypto). El alumno entra con el
  **usuario** de la tarjeta (no con curso + nombre). El curso se crea desde el
  portal; `abierto` ya no existe (las reglas lo aceptan por compatibilidad).

## Firmware (src/main.cpp)

- FirebaseClient (Mobizt) 2.2.x con `UserAuth`; dos `AsyncClientClass`: uno para
  el stream de `control`, otro para get/update/remove/set.
- **Ante cualquier evento del stream, relee `control` completo** y lo procesa:
  auto → reglas → cmd (aplica como manual y borra). No interpretar rutas del SSE.
- Publica `estado` con `update`: salidas al instante, entradas si cambian ≥ 0,1 y a
  lo sumo 1/s, latido cada 15 s, todo al reconectar. `aviso` se borra a los 20 s.
- Pulsadores `INPUT_PULLUP` a GND, antirrebote 50 ms. Pulsador de modo: cambia
  `modoAuto`, lo guarda y lo escribe en `control/auto` (flag `modoLocal`: mientras
  no se escribió, se ignora el `auto` remoto).
- Sin WiFi no llama a `app.loop()` pero sigue leyendo, regulando y atendiendo
  pulsadores.
- **Los structs van antes de cualquier función**: el convertidor de `.ino` inserta
  prototipos antes de la primera función (falló así; el prompt también lo pide).
- ~73 % de la flash.

## Decisiones tomadas (no revertir sin hablarlo con el usuario)

1. **Firebase RTDB + Auth**, todo ahí. Se descartaron WebSocket propio (Kodular no
   tiene) y MQTT (extensión en Kodular, aislamiento flojo en brokers gratis).
2. **Modo automático por placa** que bloquea lo manual en salidas con regla (ver arriba).
3. **Reglas evaluadas en la placa**, acotadas: una por salida, `>`/`<`,
   histéresis siempre, 30 s mínimo entre conmutaciones por regla.
4. **`cmd` es un buzón** que la placa vacía; el portal muestra "esperando a la
   placa…" mientras exista.
5. **Tolerancia a cómo guarda Kodular**: reglas y placa aceptan bool/número/texto
   (`"1"`, `"true"`, `"\"1\""`, `on/off`) en `auto` y `cmd`.
6. **La contraseña nunca va en el prompt**; el alumno la escribe en el código.
7. **El firmware arma el JSON con ArduinoJson**, nunca concatenando strings.
8. **El WiFi no bloquea el loop.**
9. **La ruta en Kodular se arma con el usuario tipeado**, no con el uid de
   `LoginSuccess` (no se pudo verificar el nombre de ese parámetro).
10. Historial y gráficos: **pospuestos** (`placas/{u}/lecturas`, 1/min, borrar > 24 h).
11. **Alertas evaluadas en el cliente** (portal/app), sin push: solo avisan con el
    portal o la app abiertos o recién minimizados. El usuario lo eligió así
    (2026-09-25). Descartadas por ahora: la placa manda push por Expo Push, una
    Netlify Function programada, Cloud Functions (Blaze).
14. **Cuentas administradas por el docente** (2026-09-26, pedido del usuario): lista por
    curso, contraseñas generadas `palabra-1234` **guardadas** en `credenciales/`
    (solo docente) para reimprimir, regenerar y borrar desde el portal sin la
    consola. Los alumnos ya no se registran ni cambian su contraseña.
13. **Tema solo local** (2026-09-26, pedido del usuario): `localStorage`, por
    dispositivo y no por usuario (la pantalla de entrada también lo usa). Todo el
    CSS sale de variables: letra en rem (el tamaño base va en `<html>`),
    `--redondeo`, `--espacio`, `--numero`, `--widget-min`, `--ancho`, `--sombra`,
    `--degradado`, `--fuente`. Los widgets "ámbar" y "rojo" usan `--ambar-w` y
    `--rojo-w` (`varColor` en widgets.jsx), separados de avisos y alertas. El texto
    sobre el acento (`--sobre-acento`) se calcula, no se elige. **Primero se validó
    en web; falta la app Android**: barras del sistema (hoy fijas en #0f1115 en
    `styles.xml`) con `@capacitor/status-bar` según el fondo, y confirmar que el
    WebView conserva el localStorage.
12. **App Android = el portal con Capacitor** (no Expo/React Native: habría que
    reescribir la interfaz). Reparto: Play Store, prueba interna (el usuario tiene
    cuenta de desarrollador); plan B, un `.apk` en una release. Link en `VITE_URL_APK`.
15. **Alexa = skill Smart Home en AWS Lambda** (2026-09-30, el usuario eligió Smart
    Home sobre una custom skill "pide a laboratorio que…", y alumno + docente).
    Smart Home exige Lambda (no Alexa-hosted) y OAuth: la misma Lambda es el token
    endpoint (Function URL) y `/alexa` del portal es la página de autorización; así
    Firebase sigue en Spark y Netlify sin funciones. Tokens **sin estado** (HMAC con
    `g` = `desde` de la marca: borrar la marca revoca todo). Antes de un `cmd`:
    placa desconectada → `ENDPOINT_UNREACHABLE` sin escribir (no queda en cola);
    AUTO + regla → `NOT_SUPPORTED_IN_CURRENT_MODE` sin escribir; si no, escribe y
    espera ≤ 3 s a `estado`. Sin eventos proactivos (`proactivelyReported: false`).
    Reparto por **beta** (90 días, no se extiende; 500 testers). Alexa no tiene es-BO: es-US/es-MX.

Presupuesto: Spark gratis. Techo real = **100 conexiones simultáneas** (~3 por
alumno: placa, app, portal). Descarga estimada 1,5–3 GB/mes de 10. RTDB no se
pausa: no hay keep-alive.

## Kodular (lo verificado para generar el `.aia`)

Kodular Creator no se puede abrir desde acá. Formato sacado de proyectos reales
exportados (`gh search code ... extension:bky`) y de un proyecto de julio 2026 con
ESP32 + Firebase (`KPSP-28P23W00645/KPSP_NSC_DOORBELL-32`).

- `YaVersion` 247, `language-version` 34, Form 46. Label 10, Button 13, TextBox
  13, PasswordTextBox 6, Clock 4, TinyDB 2, arrangements 10.
- Desde **Kodular 2026.05** el `FirebaseDB` viejo **rompe el build**. Se usa
  `KodularFirebaseDatabase` v1 (propiedad `ProjectPath`; eventos DataChanged,
  GotValue, TagList, FirebaseError; métodos StoreValue, GetValue, GetTagList) y
  `KodularFirebaseAuthentication` v4 (EmailPasswordLogin, LoginSuccess,
  LoginFailed, Logout). Necesitan `assets/google-services.json` cuyo
  `package_name` = `packagename=` en `project.properties`. **No andan en el
  Companion**: hay que compilar el APK.
- Sin diccionarios: lo que llega se guarda en `TinyDBEstado` (Namespace propio).
- Verificados en `.bky` reales: `text_changeCase` (OP DOWNCASE), `math_subtract`,
  `Clock.SystemTime`, `TinyDB.GetTags/ClearAll`, `logic_compare`.
- `aia-kit` lee el `.aia`; da "nonVisible" en los componentes Firebase porque su
  catálogo es viejo (no es un error del archivo).
- Kodular importa PNG de bloques arrastrándolos; la mochila es solo entre
  proyectos del mismo usuario.

## Si cambia el contrato

Tocar juntos: `firebase/database.rules.json` (+ `npm test`), `portal/src/firebase.js`
y pantallas (+ recompilar y repartir la app Android), `portal/src/prompt.js` (+ `npm run prompt`), `src/main.cpp` (+ `.ino` y
zip), `firebase/pruebas/simular-placa.mjs`, `kodular/generar-aia.mjs` y `GUIA.md`
(+ `node kodular/generar-aia.mjs`), y los `LEEME`. Si la placa suma una clave a
`estado` que no es entrada ni salida, va en `RESERVADOS` (firebase.js), en las
reglas y en `SISTEMA` del generador. El kit de ejemplo está en tres lugares iguales.
La Lambda de Alexa lee `config`, `control`, `estado` y `tablero/{id}/icono`:
`alexa/lambda/placa.mjs` (con `aBool`/`LATIDO_MAX`/`esTemperatura` copiados del
portal) y `hogar.mjs`, + `npm test` y volver a subir el zip.

Regenerar el `.ino`: comando en `LEEME.md`, sección Firmware (vacía WiFi y
contraseña por si `main.cpp` tiene los del usuario).

Regenerar el zip con **PowerShell 7** (herramienta PowerShell, no `powershell.exe`:
el 5.1 escribe las rutas con `\`):
`Compress-Archive -Path arduino\NexusIoT, arduino\LEEME.txt -DestinationPath NexusIoT-arduino.zip -Force`

## Cómo se verificó (y cómo repetirlo)

- **Java**: la máquina tiene Java 8; firebase-tools pide 21. Sirve el JDK 25 de
  Android Studio: `export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"` y
  `PATH="$JAVA_HOME/bin:$PATH"` (formato `/c/...`: con `C:/` los dos puntos rompen el
  PATH de bash).
- **Reglas y Lambda**: 34 + 15 pruebas, `cd firebase && npm test` (o `npx firebase
  emulators:start --project demo-nexus` en segundo plano y `node --test
  --test-concurrency=1 pruebas/`: en paralelo, `clearDatabase` de las reglas borra
  lo que siembra la de Alexa). Un `creado: Date.now()` puede coincidir al ms con el
  `now` del emulador: para probar "reloj del cliente" usa uno atrasado.
- **Sembrar el emulador**: `curl` con `Authorization: Bearer owner` contra
  `http://127.0.0.1:9000/<ruta>.json?ns=demo-nexus-default-rtdb`; usuarios con
  `POST http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`
  y borrar todos con `DELETE .../emulator/v1/projects/demo-nexus/accounts`.
- **Portal contra emuladores**: build con `VITE_USAR_EMULADOR=1`,
  `VITE_FIREBASE_API_KEY=fake`, `VITE_FIREBASE_PROJECT_ID=demo-nexus`,
  `VITE_FIREBASE_DATABASE_URL=https://demo-nexus-default-rtdb.firebaseio.com`,
  `--outDir` en el scratchpad (no pisar `portal/dist`), y `vite preview`.
- **Navegador**: `playwright-core` con Edge
  (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`), headless,
  390×844, lanzando `simular-placa.mjs` como proceso hijo y escribiéndole `p bomba`
  / `m` por stdin. 27 chequeos pasaron (alta, errores, plantilla, validación de
  GPIO, comando en ~50 ms, AUTO bloquea, pulsadores, prompt sin contraseña,
  docente).
- **v5 en el navegador**: 33 chequeos (widgets, vista previa, min ≥ max, orden ↑↓,
  alerta con histéresis y "Entendido", botón grande con pendiente y AUTO, docente
  ve la alerta, borrar limpia tablero/alertas). En vez de la placa simulada se
  escribió `estado` directo por REST (con `visto: {".sv":"timestamp"}`) para
  controlar los valores.
- **App Android**: la máquina tiene Android Studio (JDK 25 en `jbr`, sirve para
  Gradle) y SDK 35/36 con un AVD `Medium_Phone`, **que suele estar abierto** (no
  lanzar otro: falla). Build con emuladores (ver ANDROID.md), `adb install`,
  `adb reverse` 9000 y 9099, `pm grant ... POST_NOTIFICATIONS`, y Playwright con
  `connectOverCDP` tras `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`
  (el pid sale de `/proc/net/unix`). La notificación se verifica con
  `dumpsys notification --noredact`; capturas con `adb exec-out screencap -p`.
- **Cuentas en el navegador**: 35 chequeos (crear curso, cargar lista con repetido,
  inválido y una cuenta vieja de Auth, credenciales y cuentas creadas, sesión del
  docente intacta, ver, tarjetas al imprimir, login con usuario, nueva contraseña,
  borrar y volver a cargar). `portal/pruebas/cuentas.test.mjs`: 10 unitarias. Las
  reglas: 29 pruebas. Lista de cuentas del emulador: `POST
  .../v1/projects/demo-nexus/accounts:query` con `Bearer owner`.
- **Tema en el navegador**: 39 chequeos (localStorage roto o con valores inválidos
  o CSS inyectado, presets, título, colores, contraste, letra, redondeo, degradado,
  persistencia al recargar, widget con el tono del tema, nada en Firebase, otra
  pestaña se sincroniza, importar con errores, restablecer, sin scroll horizontal).
- **Alexa en el navegador**: 33 chequeos con dos builds (con y sin
  `VITE_ALEXA_CLIENTE_ID`): sin ella no aparece nada; `/alexa?…` sin sesión → entrar
  → Autorizar → la vuelta a `pitangui.amazon.com` (interceptada con `page.route`)
  lleva `code` y `state`; el código se canjea importando `alexa/lambda/index.mjs`
  en el mismo script; Mis datos vinculada/desvincular; cancelar → `access_denied`;
  `redirect_uri` ajeno; docente elige alumnos, casillas en la clase, desvincular el
  Echo conserva la elección; borrar alumno lo saca del Echo. Ojo: el portal pinta
  el cambio antes de que confirme el servidor; esperar ~300 ms antes de leer por REST.
- **Firmware**: `~/.platformio/penv/Scripts/pio.exe run`, y el `.ino` con
  `pio ci --project-conf platformio.ini arduino/NexusIoT/NexusIoT.ino`.

## Trampas del entorno (Windows + Git Bash)

- **Las tildes se rompen en argumentos de línea de comando** (`curl -d`, `node -e`
  con acentos). Pasa texto con acentos por archivo o por stdin.
- **No hay Python.** Para ediciones con script, `node -e`.
- Heredocs largos con comillas simples adentro pueden romper el parseo de bash:
  usa la herramienta de escritura de archivos.
- `vite preview` escucha en `localhost` (IPv6), no en `127.0.0.1`.
- Playwright `getByRole({name})` busca por substring ("DESACTIVADO" contiene
  "ACTIVADO"): usa `exact: true`.
- **Node 20**: Capacitor 8 pide Node 22, por eso se usa Capacitor 7.
- **Un plugin de Capacitor no se puede devolver desde un `.then()`** ni un `async`:
  es un proxy que responde a `then` ("LocalNotifications.then() is not
  implemented"). Se devuelve el módulo (`avisar.js`).
- En `node -e` con `s.replace(a, b)`, un `$'` o `$&` en `b` se interpreta: usa
  `replace(a, () => b)`. Y en XML de Android, `--` no puede ir en un comentario.
- Un `max` en un `<input type=number>` hace que el navegador bloquee el submit con
  su propio aviso antes de nuestras validaciones: en los GPIO no se usa.

## Pendiente de probar en el mundo real

- Un proyecto Firebase real (apps web y Android registradas, reglas publicadas).
- La placa real con FirebaseClient: auth, stream, pulsadores, cortar el WiFi.
- El `.aia` en Kodular: importar, compilar con `google-services.json`, y **cómo
  codifica los valores `KodularFirebaseDatabase`** (código cerrado). También si
  cambiar `ProjectPath` por bloques re-engancha el listener (por las dudas, al
  entrar se piden los valores con `GetTagList`/`GetValue`).
- El prompt (`PROMPT.md`) en dos IA distintas, compilando lo que salga sin retocar.
- La app Android en un celular real, desde Play Store (prueba interna), contra el
  Firebase real; y cuánto sigue llegando la notificación minimizada.
- Alexa entera (`alexa/LEEME.md`): Lambda en us-east-1 y skill en la consola,
  account linking desde la app Alexa, Discovery, prender con la placa real, qué
  dice Alexa con `NOT_SUPPORTED_IN_CURRENT_MODE` y con `ENDPOINT_UNREACHABLE`, la
  frase en español para el modo automático (PowerController sobre "Modo automático")
  y para la temperatura, el Echo del laboratorio, y la firma del token de Google con
  una cuenta de servicio real (probada solo con una clave generada y `fetch` falso).
  La app Android muestra el bloque de Alexa recién al recompilar con la variable.
