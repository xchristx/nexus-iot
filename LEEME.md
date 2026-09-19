# Nexus IoT

Infraestructura para que una clase de ~20 alumnos practique **Kodular** contra un
backend real, con un ESP32 por alumno. Cada alumno administra su propio hardware
(cuántos sensores y cuántos relés tiene, y las reglas de su modo automático),
parecido a los feeds de Adafruit, pero con un docente que ve toda la clase.

## Las piezas

| Carpeta | Qué es | Quién lo usa |
|---|---|---|
| `backend/` | Esquema y funciones de Supabase | nadie lo ve; es la API |
| `portal/` | Portal React que se publica en Netlify | el alumno, para entrar, configurar y diagnosticar |
| `src/`, `arduino/` | Firmware de referencia del ESP32 | el alumno que se traba |
| `PROMPT.md` | Prompt para generar el firmware con IA | el alumno que lo genera |
| `kodular/` | Proyecto Kodular (`.aia`) con los bloques para leer y comandar, y su guía | el alumno, como base de su app |

## Por qué no Adafruit IO (ni otra plataforma hecha)

El plan gratuito de Adafruit IO tiene un techo de **30 datos por minuto para toda
la cuenta**, contando HTTP y MQTT juntos. Con 20 alumnos, eso obliga a tener 20
cuentas separadas o a un choque permanente entre la placa que publica y la app
que lee.

Las alternativas hechas (ThingSpeak, Blynk, Arduino Cloud) tienen el mismo tipo
de problema: una cuenta por alumno, techos propios (ThingSpeak gratis exige 15 s
entre envíos), relés incómodos y ninguna vista central para el docente.

Este backend no tiene esos límites, y además da algo que ninguna de ellas da:
cuando la placa de un alumno manda algo mal, **el portal le dice exactamente qué**.

## Cómo lo usa un alumno

1. Entra al portal con el código del curso, su nombre y un PIN que elige.
2. Recibe una copia del kit del curso, y en **Configurar** agrega, cambia o
   borra sensores, relés y reglas.
3. En **Mis datos** copia la clave de su placa, las URLs para Kodular y un prompt
   ya armado con su hardware, que le pega a una IA para generar el sketch.
4. Flashea la placa. Si manda algo mal, o con un nombre distinto del declarado,
   **Mi placa** se lo dice; y si manda algo que no declaró, se lo ofrece para
   agregarlo con un clic.

## Puesta en marcha (el docente, una sola vez)

### 1. Backend

Seguir `backend/LEEME.md`. Son cuatro archivos SQL pegados en el editor de
Supabase y un cron diario, unos 15 minutos. Al terminar tenés la **Project URL**
y la **publishable key**.

### 2. Portal

```bash
cd portal
npm install
cp .env.example .env     # completar con la URL y la publishable key
npm run dev              # probar en local
```

Para publicarlo en Netlify: conectar el repo, o arrastrar la carpeta `dist`
después de `npm run build`. Las dos variables van en **Site settings >
Environment variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

`netlify.toml` ya tiene el resto configurado.

### 3. Repartir

```text
1. Entrá a <tu-portal>.netlify.app con el código IOT2026, tu nombre y un PIN
   de 4 a 8 números. Anotá el PIN: si te lo olvidás, lo resetea el docente.
2. En "Configurar" revisá tus sensores y relés. Agregá, cambiá o borrá lo que
   necesites, y armá las reglas del modo automático.
3. En "Mis datos" tenés todo listo para copiar:
   - la clave de tu placa
   - la URL para leer datos desde Kodular (Web.Get, sin headers)
   - cómo prender un relé y cómo manejar el modo automático (Web.PostText)
   - el prompt para que una IA te genere el código del ESP32
4. Si tu placa manda algo mal, "Mi placa" te lo dice. No hace falta el monitor
   serie.
```

## La API

Once funciones, en dos grupos según la clave que usan.

**Portal** (con `clave_admin`, que se obtiene entrando con el PIN):

```text
POST rpc/entrar          {"p_curso":"IOT2026","p_alumno":"Ana Pérez","p_pin":"1234"}
                         -> {"clave":"...","clave_admin":"...","nuevo":true}
POST rpc/leer_config     {"p_admin":"..."}  -> canales y reglas
POST rpc/guardar_canal   {"p_admin":"...","p_canal":{"id":"suelo","tipo":"sensor","unidad":"%"}}
POST rpc/borrar_canal    {"p_admin":"...","p_id":"suelo"}
POST rpc/guardar_regla   {"p_admin":"...","p_regla":{"rele":"bomba","sensor":"suelo","condicion":"<","umbral":35,"hist":2}}
POST rpc/borrar_regla    {"p_admin":"...","p_rele":"bomba"}
```

**Placa y app Kodular** (con `clave`):

```text
GET  rpc/leer_estado?apikey=PUBLISHABLE_KEY&p_clave=CLAVE
     -> {"ok":true,"t":24.5,"h":61.2,"suelo":43.2,"bomba":1,"vent":0,
         "detectados":[],"faltan":[],"pendientes":[],"reglas":[...],"edad":3,
         "avisos":[],"ultimo_error":null,"syncs":120}

POST rpc/enviar_comando  {"p_clave":"...","p_cmd":"bomba=1"}
POST rpc/ajustar_regla   {"p_clave":"...","p_rele":"bomba","p_cambios":{"activa":true,"umbral":30}}
POST rpc/sync            {"p_clave":"...","p_estado":{"t":24.5,"bomba":0}}   (la placa)
GET  rpc/salud           (el cron diario)
```

`leer_estado` pone los valores en el primer nivel, así en Kodular se leen con un
solo `look up in pairs` sobre lo que devuelve `JsonTextDecode` (Kodular no tiene
`JsonTextDecodeWithDictionaries`; ver `kodular/GUIA.md`). Lo declarado aparece siempre (0 si todavía no llegó
nada); `faltan` dice cuáles de esos ceros no son datos reales. `edad` son los
segundos desde el último sync (-1 si la placa nunca se conectó): si pasa de 30,
la app debería mostrar "desconectada". `pendientes` son los comandos que la placa
todavía no recogió: mientras un relé aparezca ahí, la app debería mostrar
"enviando…".

Los POST llevan un solo header: `Content-Type: application/json`.

### Decisiones que conviene conocer antes de tocar nada

**Las funciones nunca lanzan excepción.** Siempre devuelven 200 con
`{"ok":true|false, ...}`. El firmware lo genera una IA a pedido de cada alumno, y
código generado tiende a mirar solo el body: una única forma de respuesta es mucho
más fácil de manejar que mezclar 200 con 400.

**Los errores son documentación ejecutable.** No devuelven "400 Bad Request" sino
qué falta, cómo llegó y cómo tiene que ir. El alumno le pega ese texto a la IA y
se corrige solo.

**Si la forma está mal, se rechaza; si los nombres no coinciden, solo se avisa.**
Un valor como texto se rechaza. Un sensor declarado que no llega, o algo que llega
sin declarar, se acepta con `avisos`: el alumno cambia el portal y el sketch por
separado, y rechazar por nombres dejaría la placa desconectada cada vez que
declara algo antes de reflashear.

**Un comando se refleja en el estado apenas se le entrega a la placa.** La placa
lo aplica al recibir la respuesta del sync, pero lo que reportó en ese mismo sync
era el estado de antes; sin este atajo, la app vería el relé viejo durante un
ciclo entero más. Medido con una placa simulada: la pantalla pasó de unos 8,6 s
promedio a 2,6 s, y queda a menos de 0,7 s de que la placa lo aplica. El resto de
la demora es el ciclo de 5 s de la placa. Si la placa no lo aplicara, su próximo
sync lo corrige solo.

**Con PIN se cambia la estructura; con la clave, la operación.** La clave de la
placa va dentro del APK y es extraíble, así que solo puede leer, prender relés y
ajustar reglas. Crear o borrar sensores, relés y reglas exige entrar al portal con
el PIN.

**Las reglas corren en la placa, acotadas.** Así la placa sigue regulando sin
internet. Para que la IA las implemente bien: una sola por relé, solo `>` o `<`,
siempre con histéresis, y a la placa le llegan **solo las activas**. Si el
firmware generado se olvida de mirar un campo `activa`, igual no puede ejecutar
una regla apagada.

**`sync` rechaza lo que llegue a menos de 3 segundos del anterior**, aunque el
anterior haya sido inválido. Un sketch generado con el POST dentro del loop sin
`delay` se comería el egress de toda la clase.

**Las claves viajan en la URL, y es una concesión consciente.** Supabase
recomienda mandarlas en el header `apikey`, porque las URLs suelen quedar en logs.
Acá se usa el parámetro igual, porque es lo único que permite leer datos desde
Kodular con un `Web.Get` pelado, sin armar headers. Lo que queda expuesto es la
publishable key, que ya es pública, y la clave de la placa, que va dentro del APK
igual y no puede cambiar la configuración. En una clase, el peor caso es una broma
entre compañeros; para algo real, habría que mover la clave al header.

## Costos

Todo entra en planes gratuitos. El límite que importa es el **egress de Supabase:
5 GB/mes**. En semana pico, con 20 placas prendidas unas 3 h por día y las apps con
un Clock de 2 s, da **~2,8 GB/mes**. Las reglas, que viajan en cada sync y en cada
`leer_estado`, son unos 0,7 GB de ese total.

Si alguna vez se dispara, el sospechoso es un Clock demasiado rápido en alguna app
o una placa que quedó enchufada semanas. Se arregla subiendo `INTERVALO_SYNC` en el
firmware, que es una sola constante.

## Firmware

`src/main.cpp` (PlatformIO) y `arduino/NexusIoT/NexusIoT.ino` (Arduino IDE) son **el
mismo código**. El `.ino` tiene además un encabezado con las instrucciones de
instalación y viene con `USAR_SENSOR 0` para probar sin cablear.

Todo es de tablas: sensores, relés y reglas. Agregar un sensor o un relé es agregar
una fila. Las reglas se guardan en la flash para seguir regulando al arrancar sin
red, y el WiFi nunca bloquea el loop: si se corta, se siguen leyendo sensores y
evaluando reglas.

Si tocás `src/main.cpp`, regenerá el `.ino` y el zip que se reparte:

```bash
# 1. el sketch de Arduino IDE (desde la raíz del repo)
cat arduino/cabecera.txt src/main.cpp \
  | sed 's/^#define USAR_SENSOR 1$/#define USAR_SENSOR 0/' \
  > arduino/NexusIoT/NexusIoT.ino
```

```powershell
# 2. el zip (en PowerShell: el comando `zip` no viene en Windows)
Compress-Archive -Path arduino\NexusIoT, arduino\LEEME.txt `
                 -DestinationPath NexusIoT-arduino.zip -Force
```

## Historial y gráficos: más adelante

No está implementado. El lugar para engancharlo es `sync()`: un insert en una tabla
`lecturas`, como mucho uno por minuto por placa, con borrado de lo que tenga más de
24 horas.

## Si cambia el contrato de la API

Hay que tocar cuatro lugares juntos:

1. `backend/02-funciones.sql`
2. `portal/src/prompt.js` → y regenerar `PROMPT.md` con `cd portal && npm run prompt`
3. `src/main.cpp` → y regenerar el `.ino` y el zip
4. si cambia `leer_estado` o `enviar_comando`: `kodular/generar-aia.mjs` y
   `kodular/GUIA.md` → y regenerar los `.aia` con `node kodular/generar-aia.mjs`

Si cambia la plantilla por defecto del curso (en `backend/01-esquema.sql`), hay que
copiarla también en `portal/src/plantilla-ejemplo.js`.

## Lo que falta probar en el mundo real

Todo lo de arriba está verificado contra un Postgres local (con pgcrypto en el
esquema `extensions`, igual que Supabase), compilado y recorrido en un navegador.
Lo que no se puede probar desde ahí:

- **Un Supabase de verdad**, sobre todo el GET sin headers de `leer_estado` y que
  `entrar` encuentre pgcrypto (pasos 2 y 6 de `backend/LEEME.md`).
- **Una placa real** con el firmware de referencia, incluido cortar el WiFi y ver
  que las reglas siguen andando.
- **El prompt en dos IA distintas**, compilando lo que salga sin retocarlo. Es lo
  que más importa: el motor de reglas lo escribe la IA.
- **El `.aia` en Kodular Creator.** Está generado con el formato de proyectos
  exportados por Kodular y lo lee `aia-kit` (la librería de Kodular), pero falta
  importarlo en Kodular y correrlo contra una placa.
