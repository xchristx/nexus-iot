# Nexus IoT

Portal, firmware y app para que una clase de ~20 alumnos practique **Kodular**
contra un backend real, con un ESP32 cada uno, **en tiempo real** y con control
local (pulsadores en la placa y un modo automático). Cada alumno declara su propio
hardware (entradas, salidas, pulsadores y reglas) desde un portal, saca de ahí el
prompt para generar su sketch, y arma su app.

Corre entero sobre el plan gratuito de Firebase y Netlify.

## Por dónde empezar

| Si querés… | Leé |
|---|---|
| entender el proyecto y las decisiones | [LEEME.md](LEEME.md) |
| montarlo en tu propio Firebase | [firebase/LEEME.md](firebase/LEEME.md) |
| ver el prompt que genera el firmware | [PROMPT.md](PROMPT.md) |
| armar la app en Kodular | [kodular/GUIA.md](kodular/GUIA.md) |
| cargar el sketch desde el Arduino IDE | [arduino/LEEME.txt](arduino/LEEME.txt) |

## Las piezas

- `firebase/` — reglas de Realtime Database, curso y kit de ejemplo, pruebas y una
  placa simulada.
- `portal/` — portal React + Vite que se publica en Netlify.
- `src/`, `arduino/` — firmware de referencia del ESP32 (PlatformIO y Arduino IDE).
- `kodular/` — proyecto `.aia` con los bloques para leer y comandar, y su guía.

## Claves

Nada de lo que está acá tiene credenciales adentro: el firmware y el `.aia`
versionados llevan marcadores (`PEGA_ACA_LA_API_KEY`, `TUPROYECTO`) y la contraseña
vacía. El portal toma su configuración de `portal/.env`, y el `.aia` del curso, de
`kodular/google-services.json`; ninguno de los dos se sube. Está
[portal/.env.example](portal/.env.example) como molde.

La configuración de Firebase (API key incluida) es pública por diseño y termina
dentro del portal y de la app: identifica al proyecto, no da permisos. Lo que
protege los datos son las reglas de la base
([firebase/database.rules.json](firebase/database.rules.json)).

## Licencia

[MIT](LICENSE). Si te sirve para tu curso, llevátelo.
