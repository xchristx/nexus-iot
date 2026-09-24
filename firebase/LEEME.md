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
| `pruebas/simular-placa.mjs` | Una placa de mentira en Node, para probar sin ESP32 |

## 1. Crear el proyecto

1. Entrá a <https://console.firebase.google.com> y creá un proyecto. Google
   Analytics no hace falta.
2. **Compilación → Realtime Database → Crear una base de datos.**
   - Ubicación: la que quieras. Con **Estados Unidos (us-central1)** la URL
     termina en `firebaseio.com`; con otras, en `firebasedatabase.app`. Las dos
     funcionan.
   - Arrancá en **modo bloqueado**.
3. En la pestaña **Reglas**, borrá lo que hay, pegá el contenido de
   `database.rules.json` y tocá **Publicar**.
4. **Compilación → Authentication → Comenzar.** En **Método de acceso**, habilitá
   **Correo electrónico/contraseña** (solo el primer interruptor, sin "vínculo de
   correo electrónico").

## 2. Las apps: portal (web) y Kodular (Android)

En **Configuración del proyecto** (el engranaje) → **General** → **Tus apps**:

**App web, para el portal.** Tocá `</>`, ponele un nombre (por ejemplo "portal") y
registrala; Hosting no hace falta. Firebase te muestra un `firebaseConfig`: esos
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

**App Android, para Kodular.** Tocá el ícono de Android:

1. Nombre del paquete: `io.nexusiot.app` (o el que quieras; es el `package` de la
   app de los alumnos). El SHA-1 no hace falta.
2. Descargá `google-services.json` y guardalo como `kodular/google-services.json`
   (está en `.gitignore`: no se sube).
3. Corré `node kodular/generar-aia.mjs`: genera `kodular/NexusIoT_curso.aia` con
   ese archivo adentro y el mismo package. Ese `.aia` es el que se reparte.

## 3. El primer curso

En **Realtime Database → Datos**, pasá el mouse sobre la raíz y tocá **+**:

```text
cursos
  IOT2026
    nombre:  "Internet de las Cosas — 2026"
    abierto: true
```

El código del curso va en mayúsculas, de 3 a 12 letras o números. Es lo único que
el docente reparte: con eso, su nombre y una contraseña que eligen ellos, los
alumnos se dan de alta solos en el portal. `abierto: true` (sin comillas) permite
altas nuevas; con `false`, los que ya están siguen entrando.

Otra forma, **solo con la base vacía**: en la raíz, menú `⋮` → **Importar JSON**
y subí `curso-ejemplo.json` (ya trae la ruta `cursos/IOT2026` adentro). **Ojo:**
importar reemplaza TODO el nodo donde estás parado; con alumnos adentro, nunca
importes en la raíz: agregá los cursos nuevos a mano con **+**.

### Plantilla: que todos arranquen con el mismo kit (opcional)

Por defecto cada alumno arranca sin entradas, salidas ni reglas. Para que arranquen
con un kit:

1. En `cursos/IOT2026`, tocá **+** y creá un hijo `plantilla` con cualquier valor
   (por ejemplo `0`): la consola solo importa en un nodo que ya existe.
2. Hacé clic en `plantilla` para entrar a ese nodo (arriba tiene que decir
   `…/cursos/IOT2026/plantilla`).
3. Menú `⋮` → **Importar JSON** → `plantilla-kit-ejemplo.json` (o uno tuyo con la
   misma forma). Reemplaza el `0`.

Cada alumno recibe una
**copia** al darse de alta, y después la cambia como quiere. Cambiar la plantilla
afecta solo a los que se registren después.

Si la plantilla tiene un error (un GPIO inválido, una regla que nombra una entrada
que no existe), el alta falla y el portal le dice al alumno que avise al docente.

## 4. La cuenta del docente

1. **Authentication → Usuarios → Agregar usuario:** tu correo real y una
   contraseña.
2. Copiá el **UID** de ese usuario.
3. En **Realtime Database → Datos**, agregá en la raíz:

   ```text
   docentes
     <el UID>: true
   ```

En el portal, "Soy docente" entra con ese correo. La pantalla **Clase** muestra a
todos los alumnos del curso en vivo (placa conectada o no, valores, avisos) y abre
o cierra la inscripción.

## 5. Recetas del docente

**Un alumno se olvidó la contraseña.** En **Authentication → Usuarios**, buscá su
usuario (por ejemplo `iot2026-ana_perez@nexus-iot.example.com`) y borralo. El
alumno toca **Es mi primera vez** con el mismo nombre y una contraseña nueva:
conserva todo lo que había configurado. Tiene que cambiarla también en su sketch y
en su app. (Firebase no deja ponerle una contraseña a otra persona desde la
consola, y el correo no existe para mandarle un mail de recuperación.)

**Borrar a un alumno** (por ejemplo, se anotó con el nombre mal escrito): en el
portal, **Clase → Borrar** (se lleva su hardware, reglas y datos), y después en
**Authentication** borrá su usuario.

**Cortarle el acceso a uno solo:** en **Authentication**, menú `⋮` del usuario →
**Inhabilitar cuenta**.

**Cerrar las inscripciones:** en el portal, **Clase → Cerrar**.

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
npm test                  # las pruebas de las reglas (levanta y baja los emuladores)
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
