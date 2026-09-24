# Nexus IoT — contexto para una conversación nueva

Respondé en español rioplatense (voseo), que es como escribe el usuario.

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

**Estado (2026-09-24):** v4 implementada y verificada local (emuladores + placa
simulada + navegador + compilación). Todavía nadie la usó contra un Firebase real
ni con una placa. Pedidos que la motivaron:

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

Es un repo git (rama `main`, remoto `github.com/xchristx/nexus-iot`).

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `firebase/database.rules.json` | Reglas de RTDB: aislamiento por usuario, docente, validación de forma |
| `firebase/pruebas/reglas.test.mjs` | 21 pruebas de las reglas (`cd firebase && npm test`, necesita Java 21+) |
| `firebase/pruebas/simular-placa.mjs` | Placa de mentira en Node (misma lógica que `main.cpp`); `p <salida>` y `m` simulan pulsadores |
| `firebase/curso-ejemplo.json`, `plantilla-kit-ejemplo.json` | Curso vacío y kit de ejemplo, para importar en la consola |
| `firebase/LEEME.md` | Puesta en marcha en Firebase, recetas del docente, límites, emuladores |
| `portal/` | React + Vite, para Netlify. `src/firebase.js` (toda la capa de datos), `src/validar.js`, `src/pantallas/` (Entrar, MiPlaca, Configurar, MisDatos, Clase = docente) |
| `portal/src/prompt.js` | Genera el prompt del firmware con el hardware del alumno. **Única fuente** de `PROMPT.md` (`cd portal && npm run prompt`) |
| `portal/src/plantilla-ejemplo.js` | Kit de ejemplo; solo para `PROMPT.md`. Igual a `plantilla-kit-ejemplo.json` y a las tablas de `main.cpp` |
| `src/main.cpp` | Firmware de referencia (PlatformIO, FirebaseClient 2.2.13). Tablas de entradas y salidas (con pulsador), reglas, modo |
| `arduino/NexusIoT/NexusIoT.ino` | Mismo firmware para Arduino IDE = `arduino/cabecera.txt` + `main.cpp` con `USAR_DHT 0` y WiFi/contraseña vacíos |
| `NexusIoT-arduino.zip` | Lo que se reparte: el `.ino` + `arduino/LEEME.txt` |
| `kodular/generar-aia.mjs` | Genera `NexusIoT.aia` (sin google-services) y `NexusIoT_curso.aia` (con `kodular/google-services.json`, en `.gitignore`). Node sin dependencias |
| `kodular/GUIA.md` | Importar, compilar el APK (el Companion NO anda), usar los bloques, armarlo a mano |
| `README.md` | Portada de GitHub. Corta, sin duplicar `LEEME.md` |
| `LEEME.md` | Documentación general, modelo, decisiones, firmware, qué falta probar |

## ⚠️ Secretos

Todo lo versionado lleva **marcadores**: `WIFI_SSID`/`WIFI_PASS`/`CONTRASENA`
vacíos, `"PEGA_ACA_LA_API_KEY"`, `https://TUPROYECTO-default-rtdb.firebaseio.com`,
`"PEGA_ACA_TU_USUARIO"`. Nunca los reemplaces por los del usuario en algo que se
commitee, ni copies sus datos a documentación, prompts o al `.ino`/zip.

Sus datos reales viven en archivos que están en `.gitignore` — no los leas salvo
que haga falta, y no los cites:

- `src/main.local.cpp` — su copia del firmware con datos cargados.
- `portal/.env` — hoy todavía tiene las variables VIEJAS de Supabase; hay que
  cambiarlas por las `VITE_FIREBASE_*` (ver `portal/.env.example`).
- `kodular/google-services.json` y `kodular/NexusIoT_curso.aia`.

⚠️ El commit `1223146` ("labels renombrados", ya pusheado) tiene su contraseña de
WiFi real en `src/main.cpp`. Se le avisó el 2026-09-24; reescribir el historial
es decisión suya.

Antes de cualquier `git add`, si tocaste `src/main.cpp`, el `.ino` o el `.aia`,
verificá que sigan con los marcadores.

## Modelo de datos (RTDB)

```text
cursos/{CODIGO}      {nombre, abierto, plantilla:{entradas[], salidas[], reglas[], pulsador_modo}}
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
```

- **Usuario** = `curso.toLowerCase() + '-' + nombre normalizado` (sin tildes,
  minúsculas, espacios→`_`): `iot2026-ana_perez`. **Correo** = usuario +
  `@nexus-iot.example.com` (no existe). Las reglas comparan
  `auth.token.email === $usuario + DOMINIO`. Ese dominio está en: reglas, portal,
  prompt, `main.cpp`, placa simulada, generador del `.aia`.
- Una cuenta por alumno, para portal, placa y app. Contraseña ≥ 6 (mínimo de Firebase).
- Ids `^[a-z][a-z0-9_]{0,14}$`, reservados `visto, aviso, auto, cmd, reglas`. Máx.
  10 entradas y 10 salidas: lo controla el portal (las reglas de RTDB no cuentan hijos).
- Alta: `registrar()` en `firebase.js` crea la cuenta (o entra si ya existe con esa
  contraseña), y si falta `alumnos/{usuario}` escribe alta + copia de la plantilla
  en un solo `update`. Si el alta ya existía (el docente borró la cuenta en Auth
  por olvido de contraseña) conserva todo.

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
y pantallas, `portal/src/prompt.js` (+ `npm run prompt`), `src/main.cpp` (+ `.ino` y
zip), `firebase/pruebas/simular-placa.mjs`, `kodular/generar-aia.mjs` y `GUIA.md`
(+ `node kodular/generar-aia.mjs`), y los `LEEME`. Si la placa suma una clave a
`estado` que no es entrada ni salida, va en `RESERVADOS` (firebase.js), en las
reglas y en `SISTEMA` del generador. El kit de ejemplo está en tres lugares iguales.

Regenerar el `.ino`: comando en `LEEME.md`, sección Firmware (vacía WiFi y
contraseña por si `main.cpp` tiene los del usuario).

Regenerar el zip con **PowerShell 7** (herramienta PowerShell, no `powershell.exe`:
el 5.1 escribe las rutas con `\`):
`Compress-Archive -Path arduino\NexusIoT, arduino\LEEME.txt -DestinationPath NexusIoT-arduino.zip -Force`

## Cómo se verificó (y cómo repetirlo)

- **Java**: la máquina tiene Java 8; firebase-tools pide 21. Se usó un JDK 21
  portable (Adoptium zip) en el scratchpad, con `JAVA_HOME` y `PATH` en formato
  `/c/...` (con `C:/` los dos puntos rompen el PATH de bash).
- **Reglas**: `cd firebase && npm test` (o `npx firebase emulators:start --project
  demo-nexus` en segundo plano y `node --test pruebas/`).
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
- **Firmware**: `~/.platformio/penv/Scripts/pio.exe run`, y el `.ino` con
  `pio ci --project-conf platformio.ini arduino/NexusIoT/NexusIoT.ino`.

## Trampas del entorno (Windows + Git Bash)

- **Las tildes se rompen en argumentos de línea de comando** (`curl -d`, `node -e`
  con acentos). Pasá texto con acentos por archivo o por stdin.
- **No hay Python.** Para ediciones con script, `node -e`.
- Heredocs largos con comillas simples adentro pueden romper el parseo de bash:
  usá la herramienta de escritura de archivos.
- `vite preview` escucha en `localhost` (IPv6), no en `127.0.0.1`.
- Playwright `getByRole({name})` busca por substring ("DESACTIVADO" contiene
  "ACTIVADO"): usá `exact: true`.
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
