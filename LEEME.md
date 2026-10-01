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
| `portal/android/` | El mismo portal como app Android (Capacitor), con notificaciones: ver [portal/ANDROID.md](portal/ANDROID.md) | el alumno que no arma su app en Kodular |
| `src/`, `arduino/` | Firmware de referencia del ESP32 | el alumno que se traba |
| `PROMPT.md` | Prompt para generar el firmware con IA | el alumno que lo genera |
| `kodular/` | Proyecto Kodular (`.aia`) con los bloques para leer y comandar, y su guía | el alumno, como base de su app |
| `alexa/` | Skill Smart Home de Alexa (opcional): la Lambda y su guía, [alexa/LEEME.md](alexa/LEEME.md) | quien la monta, una vez; después, alumnos y docente por voz |

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
  tablero/   cómo se ve cada entrada y salida en el portal: {widget, color, icono, min, max}
  alertas/   una por entrada: {condicion, umbral, hist}; avisan, no prenden nada
  alexa/     {desde} si el alumno vinculó Alexa (lo escribe la Lambda; borrarlo la desvincula)
```

`tablero`, `alertas` y `alexa` los usan solo el portal, la app Android y la Lambda
de Alexa: la placa, el prompt y la app Kodular no los leen, así que se pueden
cambiar sin tocar el firmware.

**Una cuenta por alumno**, que usan el portal, la placa y la app. El alumno se da
de alta con el código del curso, su nombre y una contraseña; su usuario es el
curso más su nombre sin tildes: `iot2026-ana_perez`. Firebase pide un correo, así
que por dentro es `iot2026-ana_perez@nexus-iot.example.com`, un correo que no
existe ni recibe mails. Las reglas de la base solo dejan a cada alumno leer y
escribir su propia rama.

### Tablero y alertas

Muchos alumnos no llegan a armar su app en Kodular y se quedan con el portal. Para
que igual sea "su" tablero, en **Configurar** cada entrada elige cómo se ve
(**número**, **medidor**, **barra** o **indicador** para 0/1) y cada salida,
**interruptor ON/OFF** o **botón grande**; con color, ícono y orden (↑ ↓).

Cada entrada puede tener una **alerta**: "avisar si `t` supera 35", con histéresis
como las reglas. Al cruzarse, Mi placa muestra una tarjeta roja, pinta el widget,
suena un pitido y llega una notificación (del navegador o nativa en la app
Android). El docente ve "⚠ alerta" en la fila del alumno. **Solo avisa con el
portal o la app abiertos**: ver Decisiones.

### Cuentas: las crea el docente

Los alumnos no se registran solos. El docente crea el curso y carga la lista de
nombres desde el portal; cada uno recibe una cuenta con una contraseña generada
(palabra y número: `rana-3051`) y la plantilla del curso. Desde la misma pantalla
imprime las tarjetas para repartir, ve la contraseña de cualquiera, le da una
nueva o lo borra.

Firebase, sin servidor (plan Spark), no deja que alguien cree, cambie o borre la
cuenta de otro. El portal lo resuelve con una **segunda instancia de Auth en
memoria**: crea la cuenta, o entra como ese alumno para cambiarle la contraseña o
borrarla, y sale, sin tocar la sesión del docente. Para poder volver a entrar, la
contraseña se guarda en `credenciales/{usuario}`, que **solo lee el docente**.
Es una concesión consciente, igual que la contraseña que va en el sketch: en una
clase, el peor caso es una broma entre compañeros.

### Tema (solo en el dispositivo)

La pestaña **Tema** cambia cómo se ve todo el portal: seis temas listos (Oscuro,
Claro, Alto contraste, Océano, Atardecer, Terminal), el título de arriba, los 17
colores (superficies, texto, acentos y el tono de cada color de widget), fondo con
degradado, tipo y tamaño de letra, tamaño de los números, redondeo, espaciado,
ancho de los widgets y de la página, sombras y animaciones. Avisa si una
combinación se lee poco, y se puede copiar y pegar como JSON para llevarlo a otro
dispositivo.

Se guarda en `localStorage` (`nexus-iot:tema`), **nunca en Firebase**: es una
preferencia de quien mira, no un dato de la placa, y no gasta la cuota del plan
gratuito. Todo lo que se lee pasa por `normalizar()` (`portal/src/tema.js`): un
valor raro vuelve al de por defecto, así un tema roto o pegado a mano nunca deja el
portal ilegible ni mete CSS. Las pruebas: `cd portal && npm test`.

### Alexa (opcional)

Una skill **Smart Home**: "Alexa, prende la bomba", "Alexa, ¿está prendida la luz?",
"Alexa, prende el modo automático". Cada salida es un dispositivo de la app Alexa,
el modo automático es otro y cada entrada en °C es un termómetro. Un alumno vincula
su propia cuenta de Amazon con su placa; el docente puede vincular un **Echo del
laboratorio** con un curso y elegir qué placas maneja ("Alexa, prende la bomba de
Ana Pérez").

Alexa escribe en `control/cmd` y `control/auto` como el portal, así que **la placa
no cambia**. Con la placa desconectada, contesta que no responde (en vez de dejar
el comando en cola), y en modo automático no toca una salida con regla. Sin
`VITE_ALEXA_CLIENTE_ID`, el portal no muestra nada de esto. Cómo montarla:
[alexa/LEEME.md](alexa/LEEME.md).

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

1. Recibe una tarjeta del docente con su usuario (`iot2026-ana_perez`) y una
   contraseña generada (`rana-3051`), y entra al portal con eso. Los alumnos no
   se registran solos: el docente carga la lista del curso.
2. Arranca sin nada configurado (salvo que el docente le haya cargado un kit al
   curso), y en **Configurar** declara sus entradas, salidas, pulsadores y reglas.
3. En **Mis datos** copia su usuario y un prompt ya armado con su hardware, que le
   pega a una IA para generar el sketch. La contraseña la escribe él en el código:
   nunca va en el prompt.
4. Flashea la placa. **Mi placa** muestra en vivo si está conectada, sus valores,
   sus avisos y si manda algo que no declaró (con un botón para agregarlo).
5. Importa el `.aia` en Kodular, compila el APK y entra con el mismo usuario. O,
   si no le da el tiempo, usa el portal o la app Android de Nexus IoT, que hacen lo
   mismo, y personaliza su tablero en Configurar.

## Puesta en marcha (una sola vez)

1. **Firebase:** seguir [firebase/LEEME.md](firebase/LEEME.md). Al terminar tienes
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
   en su lugar. Importa `kodular/NexusIoT_curso.aia` en Kodular, compila el APK y
   pruébalo una vez con una placa antes de repartirlo.
4. **Repartir:**

   ```text
   1. Entra a <tu-portal>.netlify.app con el usuario y la contraseña de tu
      tarjeta. Guárdala: la vas a usar en el portal, en tu placa y en tu app.
   2. En "Configurar" declara tus entradas (lo que tu placa mide o lee), tus
      salidas (lo que prende y apaga), sus pulsadores y las reglas del modo
      automático.
   3. En "Mis datos" copia el prompt y pégalo en una IA para generar el código
      del ESP32. Completa tu WiFi y tu contraseña en el código.
   4. Importa NexusIoT_curso.aia en Kodular y compila el APK (el Companion no
      funciona con Firebase). Entra con tu usuario y tu contraseña.
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

**Las alertas las evalúa el portal (o la app), no un servidor.** Por eso solo
avisan con el portal o la app abiertos, o recién minimizados. Mandar un aviso con
todo cerrado necesita a alguien despierto que lo mande, y se descartaron las tres
opciones: Cloud Functions (pide el plan Blaze, con tarjeta), que la placa mande un
push por Expo Push (otra cosa más que la IA tiene que meter en el firmware) y una
Netlify Function programada cada minuto (una clave de administrador de Firebase en
Netlify). Cualquiera de las tres se puede sumar después sin cambiar el modelo.

**La app Android es el portal empaquetado con Capacitor**, no una segunda app: una
sola interfaz, y cada arreglo llega a las dos. Se descartó React Native / Expo porque
obligaba a reescribir todas las pantallas.

**Alexa es una skill Smart Home en una Lambda de AWS, aparte de Firebase.** Smart
Home ("Alexa, prende la bomba") en vez de una skill propia ("Alexa, pide a
laboratorio que…"): no hay frase de invocación, los dispositivos aparecen en la
app Alexa y sirven en rutinas. Amazon exige para eso una Lambda y OAuth; la Lambda
hace también de servidor de OAuth y el portal pone la página de login, así que
Firebase sigue en Spark y Netlify sin funciones. La clave de administrador de
Firebase vive solo en la Lambda. Los tokens no se guardan: van firmados y tienen que
coincidir con una marca en la base; desvincular borra esa marca y los corta a todos.

## Costos

Todo entra en planes gratuitos (Firebase Spark y Netlify). El detalle de los
límites está en [firebase/LEEME.md](firebase/LEEME.md#6-límites-del-plan-gratuito):
lo que puede acercarse al techo son las 100 conexiones simultáneas, no la
transferencia.

Alexa (opcional) suma una cuenta de AWS, que pide tarjeta, pero la Lambda entra en
la capa gratuita permanente (1 millón de pedidos por mes). Entra a la base por REST,
así que no ocupa conexiones simultáneas.

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

Si tocas `src/main.cpp`, regenera el `.ino` y el zip que se reparte:

```bash
# 1. el sketch de Arduino IDE (desde la raíz del repo). La primera expresión
#    saca el bloque de src/secretos.h (el .ino no lo necesita); las últimas seis
#    ponen los marcadores, por si alguien escribió sus datos en src/main.cpp.
cat arduino/cabecera.txt src/main.cpp \
  | sed -e '/secretos\.h/d' \
        -e 's/^#define USAR_DHT 1\(\r\?\)$/#define USAR_DHT 0\1/' \
        -e 's/^const char \*WIFI_SSID = "[^"]*";/const char *WIFI_SSID = "";/' \
        -e 's/^const char \*WIFI_PASS = "[^"]*";/const char *WIFI_PASS = "";/' \
        -e 's/^const char \*CONTRASENA   = "[^"]*";/const char *CONTRASENA   = "";/' \
        -e 's#^const char \*API_KEY      = "[^"]*";#const char *API_KEY      = "PEGA_ACA_LA_API_KEY";#' \
        -e 's#^const char \*DATABASE_URL = "[^"]*";#const char *DATABASE_URL = "https://TUPROYECTO-default-rtdb.firebaseio.com";#' \
        -e 's#^const char \*USUARIO      = "[^"]*";#const char *USUARIO      = "PEGA_ACA_TU_USUARIO";#' \
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
   (y la app Android: `cd portal && npm run android`, recompilar y repartir)
6. `kodular/generar-aia.mjs` y `kodular/GUIA.md` → y regenerar los `.aia`
7. `alexa/lambda/placa.mjs` y `hogar.mjs` (y sus pruebas en `firebase/pruebas/alexa.test.mjs`),
   si cambia algo de `config`, `control` o `estado` → y volver a subir el zip a la Lambda

El dominio de los correos (`@nexus-iot.example.com`) está en las reglas, el portal,
el prompt, el firmware, la placa simulada y el generador del `.aia`.

El kit de ejemplo vive en tres lugares que conviene mantener iguales:
`firebase/plantilla-kit-ejemplo.json`, `portal/src/plantilla-ejemplo.js` (de donde
sale `PROMPT.md`) y las tablas de `src/main.cpp`.

## Lo que falta probar en el mundo real

Verificado: las reglas de la base con 34 pruebas contra el emulador; la Lambda de
Alexa con 15 (canje, Discovery, prender con la placa simulada, modo automático,
placa desconectada, tokens, Echo del docente); el portal
recorrido en un navegador contra los emuladores, con una placa simulada (alta,
configurar, comandos, modo automático, pulsadores, vista del docente, widgets y
alertas con histéresis); la app Android en un emulador de Android contra los de
Firebase (alta, tiempo real, alerta con notificación nativa, comandos); el firmware
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
- **La app Android en un celular** contra el Firebase real, instalada desde la
  prueba interna de Play Store: login, tiempo real, y hasta cuándo sigue llegando
  la notificación con la app minimizada (cada fabricante corta el segundo plano
  distinto).
- **Alexa**, entera: crear la skill y la Lambda, vincular desde la app Alexa,
  descubrir, prender con una placa real, qué dice en modo automático y con la placa
  desenchufada, las frases del modo y de la temperatura en español, y el Echo del
  laboratorio (ver [alexa/LEEME.md](alexa/LEEME.md)).
