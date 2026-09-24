# Nexus IoT

Infraestructura para que una clase de ~20 alumnos practique **Kodular** contra un
backend real, con un ESP32 por alumno, **en tiempo real** y con **control local**
(pulsadores en la placa). Cada alumno administra su propio hardware (sus entradas
y salidas, y las reglas de su modo automático), y el docente ve toda la clase.

- **Entrada**: lo que la placa mide o lee y manda como número. Un DHT22, un
  LDR, un sensor de suelo, un botón (1/0).
- **Salida**: lo que se prende y se apaga desde la app, desde el portal, con un
  pulsador de la placa o por una regla. Un relé, un LED, un buzzer. Viaja como 1 o 0.

## Las piezas

| Carpeta | Qué es | Quién lo usa |
|---|---|---|
| `firebase/` | Reglas de la base, curso y kit de ejemplo, pruebas y una placa simulada | el docente, una vez |
| `portal/` | Portal React que se publica en Netlify | el alumno, para entrar, configurar y ver su placa; el docente, para ver la clase |
| `src/`, `arduino/` | Firmware de referencia del ESP32 | el alumno que se traba |
| `PROMPT.md` | Prompt para generar el firmware con IA | el alumno que lo genera |
| `kodular/` | Proyecto Kodular (`.aia`) con los bloques para leer y comandar, y su guía | el alumno, como base de su app |

## Cómo funciona

Todo pasa por un proyecto de **Firebase**: Authentication para las cuentas y
Realtime Database para los datos. La placa, la app y el portal escuchan la base y
se enteran de cada cambio **al instante**, sin consultar cada tantos segundos:
un botón de la app llega al relé en menos de un segundo, y un pulsador de la placa
se ve en la app igual de rápido.

```text
placas/<usuario>/
  config/    lo que el alumno declaró en el portal: entradas, salidas, pulsadores
  control/   lo que escriben la app y el portal:
               auto     el modo automático (true/false)
               reglas   una por salida: {entrada, condicion, umbral, hist}
               cmd      {salida: 1|0}; la placa lo aplica y lo borra
  estado/    lo que escribe la placa: los valores, "visto" (latido) y "aviso"
```

**Una cuenta por alumno**, que usan el portal, la placa y la app. El alumno se da
de alta con el código del curso, su nombre y una contraseña; su usuario es el
curso más su nombre sin tildes: `iot2026-ana_perez`. Firebase pide un correo, así
que por dentro es `iot2026-ana_perez@nexus-iot.example.com`, un correo que no
existe ni recibe mails. Las reglas de la base solo dejan a cada alumno leer y
escribir su propia rama.

### Modo automático y control local

- **Un solo modo por placa.** Activado: las salidas que tienen regla las maneja
  la regla, y **se ignora todo lo manual** sobre ellas (app, portal o pulsador; la
  placa avisa en el portal que lo ignoró). Las salidas sin regla siguen siendo
  manuales. Desactivado: todo es manual.
- Se cambia desde la app, desde el portal o con el **pulsador de modo** de la placa.
- Cada salida puede tener un **pulsador** que la alterna.
- **Todo lo local anda sin internet**: lecturas, reglas y pulsadores. Al volver la
  conexión, la placa publica cómo quedó todo.

## Cómo lo usa un alumno

1. Entra al portal con el código del curso, su nombre y una contraseña que elige
   ("Es mi primera vez").
2. Arranca sin nada configurado (salvo que el docente le haya cargado un kit al
   curso), y en **Configurar** declara sus entradas, salidas, pulsadores y reglas.
3. En **Mis datos** copia su usuario y un prompt ya armado con su hardware, que le
   pega a una IA para generar el sketch. La contraseña la escribe él en el código:
   nunca va en el prompt.
4. Flashea la placa. **Mi placa** muestra en vivo si está conectada, sus valores,
   sus avisos y si manda algo que no declaró (con un botón para agregarlo).
5. Importa el `.aia` en Kodular, compila el APK y entra con el mismo usuario.

## Puesta en marcha (una sola vez)

1. **Firebase:** seguir [firebase/LEEME.md](firebase/LEEME.md). Al terminar tenés
   la config de la app web, el `google-services.json` de la app Android, el primer
   curso y tu cuenta de docente.
2. **Portal:**

   ```bash
   cd portal
   npm install
   cp .env.example .env     # completar con la config de la app web
   npm run dev              # probar en local
   ```

   Para publicarlo en Netlify: conectar el repo. Las cinco variables
   `VITE_FIREBASE_…` van en **Site settings > Environment variables**.
   `netlify.toml` (en la raíz, porque ahí lo busca Netlify) ya tiene el resto.
3. **Kodular:** `node kodular/generar-aia.mjs` con `kodular/google-services.json`
   en su lugar. Importá `kodular/NexusIoT_curso.aia` en Kodular, compilá el APK y
   probalo una vez con una placa antes de repartirlo.
4. **Repartir:**

   ```text
   1. Entrá a <tu-portal>.netlify.app, tocá "Es mi primera vez" y poné el código
      IOT2026, tu nombre y una contraseña (al menos 6 caracteres). Anotala: la vas
      a usar en el portal, en tu placa y en tu app.
   2. En "Configurar" declará tus entradas (lo que tu placa mide o lee), tus
      salidas (lo que prende y apaga), sus pulsadores y las reglas del modo
      automático.
   3. En "Mis datos" copiá el prompt y pegalo en una IA para generar el código
      del ESP32. Completá tu WiFi y tu contraseña en el código.
   4. Importá NexusIoT_curso.aia en Kodular y compilá el APK (el Companion no
      funciona con Firebase). Entrá con tu usuario y tu contraseña.
   ```

## Decisiones que conviene conocer antes de tocar nada

**Firebase y no un servidor propio.** El pedido era tiempo real. Con HTTP, la
placa y la app tenían que preguntar cada tantos segundos (con Supabase eran hasta
10 s entre tocar un botón y ver el relé). Firebase empuja cada cambio a quien lo
escucha, Kodular tiene un componente propio para leerlo, y el ESP32 tiene una
librería mantenida (FirebaseClient, de Mobizt). Se evaluaron WebSockets propios
(Kodular no tiene WebSocket sin extensiones) y MQTT (Kodular necesita una extensión
y el plan gratuito de los brokers no aísla bien a un alumno de otro).

**Adafruit IO y parecidas quedaron descartadas desde el principio:** 30 datos por
minuto para toda la cuenta, y ninguna vista central para el docente.

**La placa relee `control` entero ante cualquier cambio.** El stream de Firebase
manda rutas parciales (`/cmd/bomba`, `/auto`, `/reglas/vent`...) y ahí es donde el
firmware generado por IA más se equivoca. Relee todo y lo procesa con una sola
función: un pedido más, mucha menos lógica.

**Los comandos se borran al procesarlos.** `control/cmd/<salida>` es un buzón: la
placa aplica y borra. Mientras el comando sigue ahí, el portal muestra "esperando a
la placa…". Si la placa está apagada, el comando espera y se aplica al volver.

**La app de Kodular puede guardar los valores como texto** ("1", "true", o con
comillas adentro). Las reglas de la base y la placa aceptan todas esas formas para
`auto` y `cmd`: es más barato que depender de cómo codifica un componente cerrado.

**Las reglas corren en la placa, acotadas.** Así sigue regulando sin internet.
Para que la IA las implemente bien: una sola por salida, solo `>` o `<`, siempre
con histéresis, y como mucho un cambio cada 30 s por salida. Lo que decide si se
aplican es el modo automático de la placa, no un campo por regla.

**La contraseña del alumno está en la placa y en la app.** Es la concesión de usar
una sola cuenta: quien desarme el APK o lea el sketch ve la contraseña de ESE
alumno, y con ella solo puede tocar la placa de ese alumno. En una clase, el peor
caso es una broma entre compañeros.

**Lo que antes validaba el servidor ahora lo valida el portal** (con mensajes que
dicen qué corregir) y lo vuelven a controlar las reglas de la base (que rechazan
sin explicar). La placa no puede recibir un mensaje de error de la base: si algo
no llega, el portal muestra qué declaraste que la placa no manda, y la placa avisa
en "aviso" cuando ignora un comando.

## Costos

Todo entra en planes gratuitos (Firebase Spark y Netlify). El detalle de los
límites está en [firebase/LEEME.md](firebase/LEEME.md#6-límites-del-plan-gratuito):
lo que puede acercarse al techo son las 100 conexiones simultáneas, no la
transferencia.

## Firmware

`src/main.cpp` (PlatformIO) y `arduino/NexusIoT/NexusIoT.ino` (Arduino IDE) son **el
mismo código**. El `.ino` tiene además un encabezado con las instrucciones de
instalación y viene con `USAR_DHT 0` para probar sin cablear.

Todo es de tablas: entradas y salidas (con su pulsador). Las tablas traen un kit de
EJEMPLO (DHT22 + bomba, ventilador y LED, pulsadores en GPIO 32, 33 y 25), el mismo
de `PROMPT.md`: cada alumno las cambia por lo que declaró. Las reglas y el modo se
guardan en la flash para seguir regulando al arrancar sin red, y el WiFi nunca
bloquea el loop.

Los structs van arriba de todo, antes de cualquier función: el Arduino IDE agrega
las declaraciones de las funciones antes de la primera, y si un tipo está más
abajo, no compila.

Si tocás `src/main.cpp`, regenerá el `.ino` y el zip que se reparte:

```bash
# 1. el sketch de Arduino IDE (desde la raíz del repo). Las últimas tres
#    expresiones vacían el WiFi y la contraseña, por si src/main.cpp tiene los tuyos.
cat arduino/cabecera.txt src/main.cpp \
  | sed -e 's/^#define USAR_DHT 1$/#define USAR_DHT 0/' \
        -e 's/^const char \*WIFI_SSID = "[^"]*";/const char *WIFI_SSID = "";/' \
        -e 's/^const char \*WIFI_PASS = "[^"]*";/const char *WIFI_PASS = "";/' \
        -e 's/^const char \*CONTRASENA   = "[^"]*";/const char *CONTRASENA   = "";/' \
  > arduino/NexusIoT/NexusIoT.ino
```

```powershell
# 2. el zip (en PowerShell: el comando `zip` no viene en Windows)
Compress-Archive -Path arduino\NexusIoT, arduino\LEEME.txt `
                 -DestinationPath NexusIoT-arduino.zip -Force
```

## Historial y gráficos: más adelante

No está implementado. Lo natural sería que la placa haga un `push` a
`placas/<usuario>/lecturas` como mucho una vez por minuto, y que el portal borre lo
que tenga más de 24 horas.

## Si cambia el contrato

Hay que tocar juntos:

1. `firebase/database.rules.json` (y sus pruebas, `cd firebase && npm test`)
2. `portal/src/firebase.js` y las pantallas
3. `portal/src/prompt.js` → y regenerar `PROMPT.md` con `cd portal && npm run prompt`
4. `src/main.cpp` → y regenerar el `.ino` y el zip
5. `firebase/pruebas/simular-placa.mjs`
6. `kodular/generar-aia.mjs` y `kodular/GUIA.md` → y regenerar los `.aia`

El dominio de los correos (`@nexus-iot.example.com`) está en las reglas, el portal,
el prompt, el firmware, la placa simulada y el generador del `.aia`.

El kit de ejemplo vive en tres lugares que conviene mantener iguales:
`firebase/plantilla-kit-ejemplo.json`, `portal/src/plantilla-ejemplo.js` (de donde
sale `PROMPT.md`) y las tablas de `src/main.cpp`.

## Lo que falta probar en el mundo real

Verificado: las reglas de la base con 21 pruebas contra el emulador; el portal
recorrido en un navegador contra los emuladores, con una placa simulada (alta,
configurar, comandos, modo automático, pulsadores, vista del docente); el firmware
compilado en PlatformIO y como `.ino`; el `.aia` leído por `aia-kit`. Lo que no se
puede probar desde ahí:

- **Un proyecto Firebase de verdad**, con la app web y la Android registradas.
- **Una placa real** con FirebaseClient: que entre, que el stream reciba los
  cambios, los pulsadores y cortar el WiFi para ver que todo lo local sigue andando.
- **El `.aia` en Kodular Creator**: que importe, que compile con el
  `google-services.json` y, sobre todo, **cómo guarda los valores** el componente
  nuevo (`KodularFirebaseDatabase`, de código cerrado). La placa y las reglas
  aceptan número, booleano o texto, pero hay que verlo.
- **El prompt en dos IA distintas**, compilando lo que salga sin retocarlo.
