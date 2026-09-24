# Nexus IoT — contexto para una conversación nueva

Respondé en español rioplatense (voseo), que es como escribe el usuario.

## Qué es y para quién

El usuario (Christian) le arma la infraestructura a un amigo docente. Una clase de
~20 alumnos practica **Kodular** contra un backend real, con un ESP32 por alumno.
Los alumnos no aprenden backend ni firmware: sacan su clave de un portal, generan
el sketch con una IA a partir de un prompt, y hacen su app Kodular desde una
plantilla. La plantilla propia del docente NO está en el repo; la que generamos
nosotros está en `kodular/` (ver abajo).

Empezó como un ESP32 contra Adafruit IO; se reemplazó porque el plan gratuito
tiene 30 datos por minuto para toda la cuenta.

**Estado (2026-09-16):** versión 3, "hardware dinámico por alumno", implementada y
verificada localmente. El usuario ya la está probando con su Supabase real y una
placa. Lo último que se hizo: el ON/OFF del portal tardaba en reflejarse; se
agregó `pendientes` en `leer_estado`, el reflejo inmediato del comando al
entregarlo en `sync`, y un estado "enviando… / esperando a la placa…" en el portal.
Para llevar eso a su Supabase alcanza con volver a correr `backend/02-funciones.sql`
(no hace falta `00`).

El 2026-09-19 se preparó el repo para GitHub: se sacaron las claves reales de
`src/main.cpp` (quedaron en `src/main.local.cpp`, ignorado), se agregaron
`README.md` y `.gitattributes`, y se hizo el commit inicial en `main`.

El 2026-09-23, a pedido del usuario: **no se dice "sensores" ni "relés"** sino
**entradas** (lo que la placa mide o lee: un sensor, un botón) y **salidas** (lo
que prende y apaga: un relé, un LED). El renombre llega al contrato: `tipo`
`entrada`/`salida`, plantilla `{entradas, salidas, reglas}`, reglas
`{salida, entrada, ...}`, parámetros `p_salida`, firmware `USAR_DHT`. "Relé" o
"sensor" solo quedan como ejemplos de componentes físicos ("módulo de relés",
"DHT sensor library"). Además, **la plantilla por defecto está vacía**: cada
alumno arranca sin nada. Para llevarlo a Supabase hay que correr `00`→`03`
(cambiaron columnas de `reglas`).

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `backend/00-borrar-todo.sql` | Borra TODO (datos incluidos). Solo para pasar desde versiones viejas |
| `backend/01-esquema.sql` | Tablas, RLS cerrado, `util.nombre_clave`, plantilla por defecto del curso (vacía) |
| `backend/02-funciones.sql` | Las 11 funciones RPC y los helpers en `util`. Re-ejecutable sin perder datos |
| `backend/03-curso-ejemplo.sql` | Crea el curso `IOT2026` (vacío) + recetas del docente comentadas, incluida "Cargar un kit" |
| `backend/LEEME.md` | Puesta en marcha en Supabase, pruebas con curl, decisiones |
| `portal/` | React + Vite, para Netlify. `src/pantallas/` (Entrar, MiPlaca, Configurar, MisDatos), `src/componentes/comunes.jsx`, `src/api.js`, `src/prompt.js` |
| `portal/src/prompt.js` | Genera el prompt del firmware con el hardware del alumno. **Única fuente** de `PROMPT.md` (`cd portal && npm run prompt`) |
| `portal/src/plantilla-ejemplo.js` | Kit de ejemplo (DHT22 + bomba, vent, luz); solo para generar `PROMPT.md`. Igual a la receta de `03` y a las tablas de `main.cpp` |
| `src/main.cpp` | Firmware de referencia (PlatformIO). Entradas, salidas y reglas en tablas, con el kit de ejemplo |
| `arduino/NexusIoT/NexusIoT.ino` | Mismo firmware para Arduino IDE = `arduino/cabecera.txt` + `main.cpp` con `USAR_DHT 0` y WiFi vacío |
| `NexusIoT-arduino.zip` | Lo que se reparte: el `.ino` + `arduino/LEEME.txt` |
| `kodular/generar-aia.mjs` | Genera `NexusIoT.aia` (marcadores) y `NexusIoT_curso.aia` (con `portal/.env`, en `.gitignore`). Node sin dependencias |
| `kodular/GUIA.md` | Importar el `.aia`, usar `valor`/`enviarComando`/`enviando`, pasar bloques por PNG, armarlo a mano |
| `README.md` | Portada de GitHub: qué es y a qué documento ir. Corta, sin duplicar `LEEME.md` |
| `LEEME.md` | Documentación general, API, decisiones, costos |
| `.github/workflows/mantener-vivo.yml` | Ping diario a `salud()` para que Supabase no pause el proyecto |

Es un repo git desde el 2026-09-19 (rama `main`).

## ⚠️ Secretos

Todo lo versionado lleva **marcadores**, no datos reales: `WIFI_SSID`/`WIFI_PASS`
vacíos, `https://TUPROYECTO.supabase.co`, `"sb_publishable_PEGA_ACA_LA_TUYA"`,
`"PEGA_ACA_TU_CLAVE"`. Nunca los reemplaces por los del usuario en algo que se
commitee, ni copies sus datos a documentación, prompts o al `.ino`/zip.

Sus datos reales viven en tres archivos que están en `.gitignore` — no los leas
salvo que haga falta, y no los cites:

- `src/main.local.cpp` — su copia del firmware con WiFi y claves cargadas.
  PlatformIO no la compila (`build_src_filter` en `platformio.ini`). Para
  flashear, él la copia sobre `src/main.cpp` y después restaura los marcadores.
- `portal/.env` — URL y publishable key de su proyecto Supabase.
- `kodular/NexusIoT_curso.aia` — el `.aia` generado con esos datos adentro.

Antes de cualquier `git add`, si tocaste `src/main.cpp`, el `.ino` o el `.aia`,
verificá que sigan con los marcadores.

## Modelo de datos

- `cursos` — `codigo` en mayúsculas, `abierto`, `plantilla` jsonb
  `{entradas, salidas, reglas}` que se COPIA a cada alumno nuevo. Por defecto
  vacía. Trigger que la valida.
- `dispositivos` — un alumno. `clave` (placa + app), `clave_admin` (portal),
  `pin_hash` (bcrypt), bloqueo tras 5 PIN mal (15 min). Único por
  `(curso, util.nombre_clave(alumno))`: ignora tildes, mayúsculas y espacios.
- `canales` — entradas y salidas del alumno (los "feeds"), `tipo`
  `'entrada'`/`'salida'`. PK `(device_id, id)`.
  `id` `^[a-z][a-z0-9_]{0,14}$` (15 = largo máximo de clave de Preferences).
  Salidas exigen `pin` y `nivel_activo` LOW/HIGH. Máximo 10 entradas y 10 salidas.
  Orden: `order by tipo` ascendente = entradas primero.
- `reglas` — UNA por salida. Columnas `salida` (PK con device_id), `entrada`,
  `condicion` `>`/`<`, `umbral`, `hist`, `activa`. FK a canales con cascade.
- `estado` — `valores` jsonb (último sync), `avisos`, `visto_en` (último válido),
  `ultimo_intento` (rate limit), `ultimo_error`, `syncs`.
- `comandos` — cola `salida=1|0` (ej. `bomba=1`), tope 20 por dispositivo.

## API (11 funciones, todas SECURITY DEFINER)

Con `clave_admin` (portal): `entrar(curso, alumno, pin)`, `leer_config`,
`guardar_canal`, `borrar_canal`, `guardar_regla`, `borrar_regla(p_admin, p_salida)`.

Con `clave` (placa y Kodular): `leer_estado` (STABLE → GET sin headers),
`enviar_comando`, `ajustar_regla(p_clave, p_salida, p_cambios)` (solo
`activa`/`umbral`/`hist`), `sync`.
Además `salud()`.

`sync` responde `{ok, cmd:[...], reglas:[solo activas, sin campo activa], avisos:[...]}`.
`leer_estado` pone los valores en el primer nivel y agrega `detectados`, `faltan`,
`pendientes`, `reglas` (todas, con `activa`), `edad`, `avisos`, `ultimo_error`,
`syncs`. Esos nombres están en `util.reservados()`.

## Decisiones tomadas (no revertir sin hablarlo con el usuario)

1. **Nunca lanzan excepción**: siempre 200 + `{ok:true|false,...}`. El firmware lo
   genera una IA y suele mirar solo el body.
2. **Errores que dicen qué falta, cómo llegó y cómo va.** Se guardan en
   `ultimo_error` y el portal los muestra (el alumno no necesita monitor serie).
3. **Forma incorrecta → rechazo; nombres que no coinciden → aviso.** Un canal
   declarado ausente o uno no declarado presente NO rechazan el sync.
4. **`null` = "no llegó valor"**, no error: ArduinoJson serializa NaN como null y
   un DHT22 que falla devuelve NaN.
5. **Rate limit de 3 s contra `ultimo_intento`**, no contra `visto_en`: si no, un
   sketch que manda JSON inválido en loop nunca se frena.
6. **Dos claves**: la del APK es extraíble, así que no puede cambiar la estructura.
7. **Reglas evaluadas en la placa** (el usuario lo eligió, para que regule sin
   internet), acotadas para que la IA no se equivoque: una por salida, `>`/`<`,
   histéresis siempre, a la placa solo le llegan las activas, la lista reemplaza
   completa a la anterior. Un comando manual desactiva la regla de ESA salida.
8. **El comando se refleja en `estado.valores` al entregarse en `sync`**; si la
   placa no lo aplica, el sync siguiente lo corrige.
9. **Claves en la URL (`?apikey=`)**: concesión consciente para que Kodular lea
   con un `Web.Get` sin headers. Documentado en `LEEME.md`.
10. **Publishable key (`sb_publishable_...`), no la legacy anon.** Pero el ROL de
    Postgres se sigue llamando `anon`: los `grant ... to anon` están bien.
11. **`search_path = public, util, extensions`** en las funciones: en Supabase
    pgcrypto vive en `extensions`.
12. **El firmware arma el JSON con ArduinoJson**, nunca concatenando strings: un
    JSON inválido lo rechaza Supabase antes de llegar a `sync` y no deja rastro.
13. **El WiFi no bloquea el loop** en el firmware: sin red se siguen leyendo
    entradas y evaluando reglas.
14. Historial y gráficos: **pospuestos**. Se engancharían en `sync` con una tabla
    `lecturas` (máx. 1 por minuto por placa, borrar > 24 h).

Presupuesto: free tier de Supabase, límite real = 5 GB/mes de egress; estimado
~2,8 GB en semana pico.

## Si cambia el contrato

Tocar juntos: `backend/02-funciones.sql`, `portal/src/prompt.js` (+ `npm run prompt`),
`src/main.cpp` (+ regenerar `.ino` y zip), `kodular/generar-aia.mjs` y `kodular/GUIA.md`
(+ `node kodular/generar-aia.mjs`), y los `LEEME`. Si `leer_estado` suma una clave
del sistema, va también en la lista `SISTEMA` del generador. Si cambia la plantilla por
defecto en `01-esquema.sql` (hoy vacía), revisar `LEEME.md` y `backend/LEEME.md`. El
kit de ejemplo está en tres lugares iguales: receta de `03`, `plantilla-ejemplo.js`
y tablas de `main.cpp`.

Regenerar el `.ino` (bash, desde la raíz): el comando está en `LEEME.md`, sección
Firmware. Además de `USAR_DHT 1`→`0`, vacía `WIFI_SSID`/`WIFI_PASS` por si
`src/main.cpp` tiene cargado el WiFi del usuario (pasa: lo carga para flashear).

Regenerar el zip (PowerShell; `zip` no existe en este Windows):
`Compress-Archive -Path arduino\NexusIoT, arduino\LEEME.txt -DestinationPath NexusIoT-arduino.zip -Force`

## Cómo se verificó (y cómo repetirlo)

Los scripts de prueba vivían en el scratchpad de la conversación anterior y ya no
están; esto es lo necesario para rearmarlos.

- **Postgres local**: binarios de scoop en `C:/Users/chris/scoop/apps/postgresql/current/bin`
  (no hay servidor corriendo). `initdb` en el scratchpad con `-U postgres -E UTF8 --no-locale`,
  levantar con `pg_ctl ... -o "-p 55434" start` **en segundo plano** (si no, bloquea la
  terminal), crear roles `anon` y `authenticated`, correr `00`→`03`. El `01` instala
  pgcrypto en el esquema `extensions`, igual que Supabase: si una función no tiene
  `extensions` en el `search_path`, falla también local.
- **Probar como Supabase**: `set role anon;` antes de llamar las funciones (tablas y
  `util` tienen que dar permission denied).
- **API falsa para el portal**: un server Node en :8787 que recibe
  `/rest/v1/rpc/<fn>` y ejecuta `set role anon; select public.<fn>(...)` por psql,
  pasando los valores **por stdin con dollar-quoting** (ver trampas).
- **Navegador**: `playwright-core` (sin navegadores descargados) con Edge en
  `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, headless, viewport
  390×844. Build del portal con `VITE_SUPABASE_URL=http://127.0.0.1:8787`.
- **Firmware**: `~/.platformio/penv/Scripts/pio.exe run` (compila; no hay placa).

## Trampas del entorno (Windows + Git Bash)

- **Las tildes se rompen en argumentos de línea de comando** (`psql -c`, `psql -v`,
  `curl -d` desde bash). Pasá texto con acentos por archivo o por stdin.
- `echo $?`/`${PIPESTATUS}` después de `$(... | grep)` mide el `grep`, no psql.
- En una misma consulta SQL, `sync(...)` y `leer_estado(...)` comparten foto: lo que
  escribe una no lo ve la otra. Separá en consultas distintas.
- Playwright `getByRole({name})` busca por substring: "desactivado" contiene
  "activado". Usá `exact: true`.
- Después de un build de prueba, `portal/dist` queda con la URL de prueba: rearmalo
  con `env -u VITE_SUPABASE_URL -u VITE_SUPABASE_PUBLISHABLE_KEY npm run build` para
  que tome el `.env` del usuario.
- Heredocs con JSX largo pueden romper el parseo de bash: usá la herramienta de
  escritura de archivos.

## Pendiente de probar en el mundo real

- Supabase real: el GET sin headers de `leer_estado` y que `entrar` encuentre pgcrypto.
- La placa real, incluido cortar el WiFi y ver que las reglas siguen andando.
- El prompt (`PROMPT.md`) en dos IA distintas, compilando lo que salga sin retocar:
  el motor de reglas lo escribe la IA.
- El GitHub Action necesita que el repo esté en GitHub con los secretos
  `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`.
- El `.aia` importado en Kodular Creator y corriendo contra la placa.

## Kodular: lo que se verificó para generar el `.aia`

Kodular Creator no se puede abrir desde acá (es web y con login). El formato se sacó
de proyectos reales exportados por Kodular en GitHub (buscar con
`gh search code '"creator.kodular.io"'`) y de `github.com/Kodular/aia-kit`
(`src/environments/kodular-creator/simple_components.json` tiene métodos y eventos).

- `YaVersion` 242, `language-version` 34, desde 2022 hasta 2025. Versiones de
  componentes de Kodular, **no** las de App Inventor: Form 44, Label 10, Button 13,
  TextBox 13, Web 6, Clock 4, TinyDB 2, arrangements 10.
- Kodular **no tiene** `Web.JsonTextDecodeWithDictionaries` ni `JsonObjectEncode`:
  se usa `JsonTextDecode` (lista de pares) + `lists_lookup_in_pairs`.
- `math_is_a_number` no se usa: en Kodular no tiene el desplegable (campo `OP`).
- Todo tipo de bloque y nombre de entrada del generador aparece en `.bky` reales
  de Kodular. El `npm` `aia-kit` (`AIAReader.parse`) lee el `.aia` generado.
- Kodular importa PNG de bloques arrastrándolos (desde la versión Eagle); la
  mochila es solo entre proyectos del mismo usuario.
