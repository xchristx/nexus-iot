// Genera PROMPT.md (en la raiz del repo) a partir de portal/src/prompt.js,
// que es la unica fuente de verdad del prompt.
//
// Correr con:  npm run prompt
//
// El portal arma el prompt de cada alumno con SU hardware declarado. Este
// archivo usa un kit de ejemplo (src/plantilla-ejemplo.js), asi que PROMPT.md
// muestra como sale el prompt para un alumno que declaro ese hardware.

import { writeFileSync } from 'node:fs'
import { generarPrompt } from './src/prompt.js'
import { canalesEjemplo, plantillaEjemplo } from './src/plantilla-ejemplo.js'

const cuerpo = generarPrompt({
  apiKey:       'TU_API_KEY',
  databaseURL:  'https://TUPROYECTO-default-rtdb.firebaseio.com',
  usuario:      'iot2026-tu_nombre',
  canales:      canalesEjemplo,
  pulsadorModo: plantillaEjemplo.pulsador_modo,
})

const encabezado = `<!-- GENERADO AUTOMATICAMENTE — no editar a mano.
     Fuente: portal/src/prompt.js   ·   Regenerar: cd portal && npm run prompt -->

# Prompt para generar el firmware del ESP32

Este es el prompt que cada alumno le pega a una IA para que le genere su sketch.

**El portal lo arma con el usuario y el hardware que declaró cada alumno**, en la
pantalla "Mis datos", con un botón de copiar. Si el alumno agrega una entrada o una
salida en Configurar, su prompt la incluye sola. La contraseña nunca va en el
prompt: el alumno la escribe después en el código.

Esta copia usa un kit de ejemplo (un DHT22 como entradas; bomba, ventilador y
LED como salidas, con pulsadores) y está acá para poder versionarla, revisarla en
un diff y probarla sin levantar el portal. Los marcadores \`TU_API_KEY\`,
\`TUPROYECTO\` e \`iot2026-tu_nombre\` los reemplaza el portal.

---

`

writeFileSync(new URL('../PROMPT.md', import.meta.url), encabezado + cuerpo + '\n')
console.log('PROMPT.md regenerado')
