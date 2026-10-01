# App Android (Capacitor)

La app Android **es el mismo portal**, empaquetado con [Capacitor](https://capacitorjs.com/)
en `portal/android/`. No hay una segunda interfaz que mantener: lo que cambia en
`portal/src/` llega a la web y a la app. Lo que suma la app frente al portal en el
navegador:

- un ícono propio, pantalla completa, sin barra del navegador;
- **notificaciones nativas** cuando una entrada cruza una alerta.

**Límite importante:** las alertas las evalúa la app mientras está abierta o recién
minimizada. **Con la app cerrada no llegan**, porque no hay un servidor que mande
avisos (plan Spark de Firebase, sin Cloud Functions). Se eligió así a propósito.
Si alguna vez hace falta, las alternativas son que la placa mande un push por
Expo Push o una Netlify Function programada (ver `LEEME.md`, Decisiones).

## Qué hace falta en la máquina

- **Node 20** o más (Capacitor 7; Capacitor 8 pide Node 22).
- **Android Studio**, que trae el JDK (`jbr`) y el SDK. Con el SDK Manager: Android
  SDK Platform 36 y Build-Tools 35 o más.
- En Git Bash:
  ```bash
  export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
  export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
  ```

## Compilar

La app lleva adentro la config de Firebase de `portal/.env` (las mismas
`VITE_FIREBASE_*` del portal). Revisa que estén bien **antes** de compilar: si
cambian, hay que compilar y repartir de nuevo.

```bash
cd portal
npm run android          # vite build + copia la web a android/
cd android
./gradlew assembleDebug  # app/build/outputs/apk/debug/app-debug.apk (para probar)
```

Para Play Store, en cambio, `npm run aab`, que deja
`android/app/build/outputs/bundle/release/app-release.aab` firmado (ver abajo).
Para un `.apk` firmado suelto, `npm run apk`.

Nada de lo compilado (`.apk`, `.aab`) va al repo: está en `.gitignore`.

## Firma (una sola vez)

Play Store pide que todas las versiones se firmen con la misma clave. Si se
pierde, no se puede actualizar la app: **guárdala junto con sus contraseñas fuera
del repo** (un gestor de contraseñas o un pendrive).

```bash
"$JAVA_HOME/bin/keytool" -genkeypair -v -keystore C:/claves/nexus-iot.jks \
  -alias nexus-iot -keyalg RSA -keysize 2048 -validity 10000
```

Y crea `portal/android/keystore.properties` (está en `.gitignore`):

```properties
storeFile=C:/claves/nexus-iot.jks
storePassword=...
keyAlias=nexus-iot
keyPassword=...
```

Con ese archivo, `bundleRelease` y `assembleRelease` firman solos; sin él, el
release sale sin firmar.

## Repartirla

### Play Store, prueba interna (recomendado)

La prueba interna llega a hasta 100 personas por correo, está disponible en minutos
y no tiene la espera que pide producción (12 testers durante 14 días, en cuentas
personales nuevas). Para una clase, alcanza y sobra.

1. [Play Console](https://play.google.com/console) → **Crear app**: nombre "Nexus
   IoT", app, gratuita.
2. **Política de privacidad**: `https://<tu-sitio>.netlify.app/privacidad.html`
   (es `portal/public/privacidad.html`, se publica sola con el portal).
3. Completa los cuestionarios de **Contenido de la app**:
   - seguridad de los datos: nombre y contraseña para la cuenta, sin compartir con
     terceros, borrado a pedido;
   - sin anuncios;
   - público: mayores de 13 o la edad del curso.
4. **Pruebas → Prueba interna → Crear versión** → sube el `.aab`. Play Console
   te va a ofrecer que Google administre la clave de la app (*Play App Signing*):
   acepta, y la tuya queda como clave de subida.
5. **Testers**: una lista con los correos de Gmail de los alumnos. Cópiales el
   **link de participación**: lo abren desde el celular y instalan desde Play Store.
6. Pon ese link en la variable `VITE_URL_APK` de Netlify: el portal muestra
   "Bajar la app para Android" en la pantalla de entrada y en Mis datos.

### Plan B: el `.apk` suelto

`npm run apk`, sube `app-release.apk` a una *release* de GitHub y usa ese link en
`VITE_URL_APK`. Al instalarlo, Android pide permitir "orígenes desconocidos".

## Publicar una versión nueva

1. En `android/app/build.gradle`, sube `versionCode` (1 → 2 → 3…; Play lo exige) y
   `versionName` ("1.1").
2. `npm run aab` y súbela en Play Console, en la misma pista de prueba interna.

Si lo único que cambió es la web (`portal/src/`), igual hay que recompilar: la app
no descarga el portal, lo lleva adentro. Eso permite que abra sin internet (aunque
sin internet no hay datos).

## Ícono

Sale de `portal/assets/icono.svg`. Si lo cambias:

```bash
cd portal/assets && node generar-iconos.mjs <ruta a playwright-core>
cd .. && npx capacitor-assets generate --android --iconBackgroundColor '#0f1115' --splashBackgroundColor '#0f1115'
```

## Probar la app contra los emuladores de Firebase

Con un emulador de Android abierto (Android Studio → Device Manager) y los de
Firebase corriendo (`cd firebase && npm run emuladores`):

```bash
cd portal
VITE_USAR_EMULADOR=1 VITE_FIREBASE_API_KEY=fake VITE_FIREBASE_PROJECT_ID=demo-nexus \
  VITE_FIREBASE_DATABASE_URL=https://demo-nexus-default-rtdb.firebaseio.com npm run android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:9000 tcp:9000 && adb reverse tcp:9099 tcp:9099   # el 127.0.0.1 del teléfono = la PC
```

Con la app debug abierta, `chrome://inspect` en Chrome o Edge muestra su WebView
para ver la consola.

**Después, recompila con el `.env` real** (`npm run android`) antes de repartir: la
build de emuladores no anda con el proyecto de verdad.

## Detalles técnicos

- En el WebView, Firebase Auth se inicializa con `initializeAuth` e IndexedDB, no con
  `getAuth` (`src/firebase.js`): `getAuth` carga un iframe de inicio con redirección
  que en Capacitor puede no terminar nunca.
- Las notificaciones usan `@capacitor/local-notifications` (`src/avisar.js`). En
  Android 13+ el permiso se pide con el botón "Activar avisos" de Mi placa.
- `targetSdk 36`: Play Store exige apuntar a la versión de Android del año.
- El tema (`android/app/src/main/res/values/styles.xml`) es oscuro, porque desde
  Android 15 la app se dibuja detrás de las barras del sistema.
- Si la API key de Firebase tiene restricción por *referrer* HTTP, agrega
  `https://localhost` (el origen de la app).
