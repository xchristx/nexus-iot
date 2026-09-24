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
import { canalesEjemplo } from './src/plantilla-ejemplo.js'

const cuerpo = generarPrompt({
  url:        'https://TUPROYECTO.supabase.co',
  publicable: 'TU_PUBLISHABLE_KEY',
  clave:      'TU_CLAVE',
  canales:    canalesEjemplo,
})

const encabezado = `<!-- GENERADO AUTOMATICAMENTE — no editar a mano.
     Fuente: portal/src/prompt.js   ·   Regenerar: cd portal && npm run prompt -->

# Prompt para generar el firmware del ESP32

Este es el prompt que cada alumno le pega a una IA para que le genere su sketch.

**El portal lo arma con la clave y el hardware que declaró cada alumno**, en la
pantalla "Mis datos", con un botón de copiar. Si el alumno agrega una entrada o una
salida en Configurar, su prompt la incluye sola.

Esta copia usa un kit de ejemplo (un DHT22 como entradas; bomba, ventilador y
LED como salidas) y está acá para poder versionarla, revisarla en un diff y probarla sin
levantar el portal. Los marcadores \`TUPROYECTO\`, \`TU_PUBLISHABLE_KEY\` y
\`TU_CLAVE\` los reemplaza el portal.

---

`

writeFileSync(new URL('../PROMPT.md', import.meta.url), encabezado + cuerpo + '\n')
console.log('PROMPT.md regenerado')
