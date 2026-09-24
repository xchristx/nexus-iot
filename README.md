# Nexus IoT

Backend, portal y firmware para que una clase de ~20 alumnos practique **Kodular**
contra un servidor real, con un ESP32 cada uno. Cada alumno declara su propio
hardware (entradas, salidas y las reglas de su modo automático) desde un portal, saca
de ahí la clave de su placa y el prompt para generar su sketch, y arma su app.

Corre entero sobre el plan gratuito de Supabase y Netlify.

## Por dónde empezar

| Si querés… | Leé |
|---|---|
| entender el proyecto, la API y las decisiones | [LEEME.md](LEEME.md) |
| montarlo en tu propio Supabase | [backend/LEEME.md](backend/LEEME.md) |
| ver el prompt que genera el firmware | [PROMPT.md](PROMPT.md) |
| armar la app en Kodular | [kodular/GUIA.md](kodular/GUIA.md) |
| cargar el sketch desde el Arduino IDE | [arduino/LEEME.txt](arduino/LEEME.txt) |

## Las piezas

- `backend/` — esquema y funciones RPC de Supabase (SQL para pegar en el editor).
- `portal/` — portal React + Vite que se publica en Netlify.
- `src/`, `arduino/` — firmware de referencia del ESP32 (PlatformIO y Arduino IDE).
- `kodular/` — proyecto `.aia` con los bloques para leer y comandar, y su guía.

## Claves

Nada de lo que está acá tiene credenciales adentro: el firmware y el `.aia`
versionados llevan marcadores (`PEGA_ACA_TU_CLAVE`, `TUPROYECTO.supabase.co`) que
cada uno reemplaza por lo suyo. El portal toma las suyas de `portal/.env`, que no
se sube; está [portal/.env.example](portal/.env.example) como molde.

La *publishable key* de Supabase sí es pública por diseño y termina dentro del
bundle del portal y de la app: el acceso está cerrado con RLS y todo pasa por las
funciones RPC. La que nunca va a ningún lado es la *secret key*.

## Licencia

[MIT](LICENSE). Si te sirve para tu curso, llevátelo.
