# Firebase: puesta en marcha

Todo Nexus IoT corre sobre un proyecto de Firebase en el plan gratuito (Spark, sin
tarjeta): **Authentication** para las cuentas y **Realtime Database** para todo lo
demás. Se hace una sola vez y lleva unos 20 minutos.

| Archivo | Qué es |
|---|---|
| `database.rules.json` | Las reglas de la base: quién lee y escribe qué, y la forma de los datos |
| `curso-ejemplo.json` | Un curso vacío, para crear el primero |
| `plantilla-kit-ejemplo.json` | El kit de ejemplo (DHT22 + bomba, ventilador y LED, con pulsadores), para cargárselo a un curso |
| `pruebas/reglas.test.mjs` | Pruebas de las reglas contra el emulador (`npm test`) |
| `pruebas/alexa.test.mjs` | Pruebas de la Lambda de Alexa (`alexa/`) contra el emulador, con la placa simulada (también `npm test`) |
| `pruebas/simular-placa.mjs` | Una placa de mentira en Node, para probar sin ESP32 |

## 1. Crear el proyecto

1. Entra a <https://console.firebase.google.com> y crea un proyecto. Google
   Analytics no hace falta.
2. **Compilación → Realtime Database → Crear una base de datos.**
   - Ubicación: la que quieras. Con **Estados Unidos (us-central1)** la URL
     termina en `firebaseio.com`; con otras, en `firebasedatabase.app`. Las dos
     funcionan.
   - Arranca en **modo bloqueado**.
3. En la pestaña **Reglas**, borra lo que hay, pega el contenido de
   `database.rules.json` y toca **Publicar**. **Cada vez que se actualiza el
   repo, repite este paso**: si el portal nuevo escribe algo que las reglas
   publicadas no conocen (en v5, `tablero` y `alertas`; con Alexa, `alexa/`),
   Firebase lo rechaza con `permission_denied`.
4. **Compilación → Authentication → Comenzar.** En **Método de acceso**, habilita
   **Correo electrónico/contraseña** (solo el primer interruptor, sin "vínculo de
   correo electrónico").

## 2. Las apps: portal (web) y Kodular (Android)

En **Configuración del proyecto** (el engranaje) → **General** → **Tus apps**:

**App web, para el portal.** Toca `</>`, ponle un nombre (por ejemplo "portal") y
regístrala; Hosting no hace falta. Firebase te muestra un `firebaseConfig`: esos
valores van en `portal/.env` (copiando `portal/.env.example`) y en las variables de
entorno de Netlify:

| En `firebaseConfig` | Variable |
|---|---|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `databaseURL` | `VITE_FIREBASE_DATABASE_URL` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |

Estos valores no son secretos: terminan dentro del portal publicado, y la API key
de Firebase identifica al proyecto, no da permisos. Lo que protege los datos son
las reglas.

**App Android, para Kodular.** Toca el ícono de Android:

1. Nombre del paquete: `io.nexusiot.app` (o el que quieras; es el `package` de la
   app de los alumnos). El SHA-1 no hace falta.
2. Descarga `google-services.json` y guárdalo como `kodular/google-services.json`
   (está en `.gitignore`: no se sube).
3. Corre `node kodular/generar-aia.mjs`: genera `kodular/NexusIoT_curso.aia` con
   ese archivo adentro y el mismo package. Ese `.aia` es el que se reparte.

## 3. La cuenta del docente

Es la única cuenta que se crea a mano, y se hace una sola vez. Con ella se entra
al portal como docente, y desde ahí se crean los cursos y las cuentas de los
alumnos.

1. **Compilación → Authentication → Usuarios → Agregar usuario.** Pon tu correo
   (el real, el de todos los días) y una contraseña de al menos 6 caracteres. Toca
   **Agregar usuario**.
2. En la lista aparece tu correo con una columna **UID de usuario** (una cadena
   larga como `Xk3pQ9…`). Pasa el mouse por encima y toca el ícono de copiar.
3. **Compilación → Realtime Database → Datos.** Pasa el mouse sobre la raíz (la
   primera línea, con la URL de la base) y toca **+**:
   - **Clave:** `docentes`, y sin escribir valor toca el **+** de al lado para
     agregarle un hijo;
   - **Clave del hijo:** el UID que copiaste; **valor:** `true` (sin comillas).
   - **Agregar.** Tiene que quedar así:

   ```text
   docentes
     Xk3pQ9…: true
   ```

4. En el portal, **Soy docente** → tu correo y tu contraseña.

Si el portal dice "Esa cuenta no está marcada como docente", el UID de
`docentes` no es el de tu usuario, o el valor quedó como texto `"true"` en vez
de `true`. Para sumar otro docente, se repiten los tres pasos con su correo.

## 4. El primer curso y los alumnos

Todo desde el portal, con la cuenta de docente:

1. **Crear el curso:** la primera vez, el portal pide un **código** (de 3 a 12
   letras o números: `IOT2026`) y un nombre. El código va al principio de cada
   usuario (`iot2026-ana_perez`).
2. **Cargar alumnos:** en la tarjeta **Cargar alumnos**, un nombre y apellido por
   renglón (o una columna pegada de una planilla), y **Crear N cuentas**. A cada
   uno se le crea una cuenta con una contraseña del estilo `rana-3051`, y
   arranca con la plantilla del curso, si tiene. Dos alumnos con el mismo nombre
   quedan como `…_perez` y `…_perez_2`.
3. **Repartir:** **imprimir tarjetas** (una por alumno, para recortar, con el
   usuario, la contraseña y la dirección del portal) o **copiar lista** (para
   pegar en una planilla o un mensaje).

Los alumnos **no se pueden registrar solos**: entran con el usuario y la
contraseña de su tarjeta, que son los mismos que ponen en la placa y en la app.

Las contraseñas quedan guardadas en `credenciales/`, que **solo lee el docente**
(las reglas lo impiden a cualquier otro). Es lo que permite volver a verlas y
cambiarlas desde el portal: Firebase, sin un servidor, no deja que alguien le
cambie la contraseña a otro.

### Plantilla: que todos arranquen con el mismo kit (opcional)

Por defecto cada alumno arranca sin entradas, salidas ni reglas. Para que arranquen
con un kit, **antes de cargar la lista**:

1. En **Realtime Database → Datos**, abre `cursos/IOT2026`, toca **+** y crea un
   hijo `plantilla` con cualquier valor (por ejemplo `0`): la consola solo
   importa en un nodo que ya existe.
2. Haz clic en `plantilla` para entrar a ese nodo (arriba tiene que decir
   `…/cursos/IOT2026/plantilla`).
3. Menú `⋮` → **Importar JSON** → `plantilla-kit-ejemplo.json` (o uno tuyo con la
   misma forma). Reemplaza el `0`.

Cada alumno recibe una **copia** al crearse su cuenta, y después la cambia como
quiere. Cambiar la plantilla afecta solo a los que se carguen después.

Si la plantilla tiene un error (un GPIO inválido, una regla que nombra una entrada
que no existe), crear las cuentas falla con un aviso.

La plantilla también puede traer cómo se ve cada canal (`tablero`, un mapa por id)
y alertas (`alertas`, una lista), como el kit de ejemplo. Lo que nombre un canal
que el kit no tiene se ignora.

## 5. Recetas del docente

**Un alumno se olvidó la contraseña.** En el portal, en su fila, **ver** muestra
la que tiene, y **Nueva contraseña** le da otra (la vieja deja de andar: la tiene
que cambiar también en su sketch y en su app). No pierde nada de lo que configuró.

**Borrar a un alumno** (se cargó con el nombre mal escrito, dejó el curso): en el
portal, **Borrar** en su fila. Se lleva su cuenta, su hardware, sus reglas y su
contraseña. Si el portal avisa que no pudo borrar la cuenta (una creada a mano, o
de antes de este sistema), bórrala en **Authentication → Usuarios**.

**Cortarle el acceso a uno solo:** en **Authentication**, menú `⋮` del usuario →
**Inhabilitar cuenta**.


## 6. Límites del plan gratuito

| Límite | Spark | Con una clase de 20 |
|---|---|---|
| Conexiones simultáneas | 100 | ~3 por alumno con todo abierto (placa, app, portal): ~60 |
| Descarga | 10 GB/mes | estimado 1,5 a 3 GB/mes en semana pico |
| Almacenamiento | 1 GB | unos pocos MB |

Lo que puede acercarse al techo son las **conexiones**: dos clases de 20 a la vez,
con el portal abierto en varias pestañas, pasan de 100. Pasado el límite, las
conexiones nuevas se rechazan hasta que se libere alguna. Si hace falta, el plan
Blaze (pago por uso) sube el límite a 200.000 y sigue sin costo para este volumen.

RTDB en Spark **no se pausa** por inactividad (Supabase sí), así que no hace falta
ningún ping.

## 7. Probar en local, sin tocar el proyecto real

Hace falta **Java 21 o más** en el PATH (el emulador de la base es un `.jar`).

```bash
cd firebase
npm install
npm test                  # las pruebas de las reglas y de la Lambda de Alexa (levanta y baja los emuladores)
npm run emuladores        # los deja corriendo: auth en :9099, database en :9000
```

Con los emuladores corriendo:

- **Portal:** en `portal/`, con un `.env.local` que tenga `VITE_USAR_EMULADOR=1`,
  `VITE_FIREBASE_API_KEY=fake`, `VITE_FIREBASE_PROJECT_ID=demo-nexus` y
  `VITE_FIREBASE_DATABASE_URL=https://demo-nexus-default-rtdb.firebaseio.com`,
  `npm run dev`.
- **Un curso:** los emuladores arrancan vacíos. Se carga con
  `curl -X PATCH -H "Authorization: Bearer owner" -d @curso-ejemplo.json "http://127.0.0.1:9000/.json?ns=demo-nexus-default-rtdb"`.
- **Una placa:** `node pruebas/simular-placa.mjs iot2026-tu_nombre tucontraseña --emulador`.
  Escribiendo `p bomba` se simula el pulsador de la bomba, y `m` el de modo.

La placa simulada también sirve contra el proyecto real, para mostrar la app en
clase antes de tener el hardware (ver el encabezado del archivo).
