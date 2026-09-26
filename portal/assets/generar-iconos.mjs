// Pasa icono.svg a los PNG que pide @capacitor/assets, con Edge (playwright-core).
//   node generar-iconos.mjs <ruta a playwright-core>  &&  npx capacitor-assets generate --android
import { readFileSync } from 'node:fs'
const pw = await import(process.argv[2] || 'playwright-core')
const svg = readFileSync(new URL('./icono.svg', import.meta.url), 'utf8')
const FONDO = '#0f1115'
const browser = await pw.chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
})

// escala: qué fracción del lado ocupa el dibujo (el ícono adaptativo recorta los bordes)
async function png(archivo, lado, escala, fondo) {
  const page = await browser.newPage({ viewport: { width: lado, height: lado } })
  const d = Math.round(lado * escala)
  await page.setContent(`<body style="margin:0;background:${fondo || 'transparent'};display:grid;place-items:center;height:${lado}px">
    <div style="width:${d}px;height:${d}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`)
  await page.screenshot({ path: new URL('./' + archivo, import.meta.url).pathname.slice(1), omitBackground: !fondo })
  await page.close()
}

await png('icon-only.png', 1024, 1, FONDO)
await png('icon-foreground.png', 1024, 0.72)
await png('icon-background.png', 1024, 0, FONDO)
await png('splash.png', 2732, 0.3, FONDO)
await png('splash-dark.png', 2732, 0.3, FONDO)
await browser.close()
console.log('listo')
