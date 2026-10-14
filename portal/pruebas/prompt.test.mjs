// Pruebas de src/prompt.js: que el prompt del firmware cambie según el
// hardware del alumno (chip, pulsador o llave de modo, pantalla).
//
//   cd portal && npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generarPrompt } from '../src/prompt.js'
import { canalesEjemplo } from '../src/plantilla-ejemplo.js'

const prompt = (extra = {}) => generarPrompt({
  apiKey: 'CLAVE', databaseURL: 'https://demo.firebaseio.com', usuario: 'iot2026-ana',
  canales: canalesEjemplo, pulsadorModo: 25, ...extra,
})

test('con pulsador de modo: lo alterna y nada de llave', () => {
  const p = prompt()
  assert.match(p, /Pulsador de modo automático: GPIO 25/)
  assert.match(p, /const int PIN_PULSADOR_MODO = 25;/)
  assert.doesNotMatch(p, /llave/i)
})

test('con llave: la llave manda y la constante es PIN_LLAVE_MODO', () => {
  const p = prompt({ pulsadorModo: null, llaveModo: 14 })
  assert.match(p, /Llave selectora de modo automático: GPIO 14/)
  assert.match(p, /Cerrada \(lee LOW\) = modo automático/)
  assert.match(p, /modo: lo elige la llave de la placa/)
  assert.match(p, /const int PIN_LLAVE_MODO = 14;/)
  assert.doesNotMatch(p, /PIN_PULSADOR_MODO/)
  assert.doesNotMatch(p, /El pulsador de modo alterna/)
})

test('si llegaran los dos, gana la llave', () => {
  const p = prompt({ pulsadorModo: 25, llaveModo: 14 })
  assert.match(p, /PIN_LLAVE_MODO = 14/)
  assert.doesNotMatch(p, /PIN_PULSADOR_MODO/)
})

test('sin pantalla no hay sección de pantalla', () => {
  const p = prompt()
  assert.doesNotMatch(p, /## Pantalla/)
  assert.doesNotMatch(p, /SSD1306|LiquidCrystal|Wire\.h/)
})

test('OLED: su librería, sus direcciones y sus pines', () => {
  const p = prompt({ pantalla: 'oled' })
  assert.match(p, /## Pantalla/)
  assert.match(p, /OLED 0\.96" SSD1306/)
  assert.match(p, /"Adafruit SSD1306" y "Adafruit GFX Library"/)
  assert.match(p, /0x3C y 0x3D/)
  assert.match(p, /SDA en GPIO 21, SCL en GPIO 22/)
  assert.doesNotMatch(p, /LiquidCrystal/)
})

test('LCD: su librería y sus direcciones', () => {
  const p = prompt({ pantalla: 'lcd' })
  assert.match(p, /LCD de 16x2 con módulo I2C/)
  assert.match(p, /"LiquidCrystal I2C" de Frank de Brabander/)
  assert.match(p, /0x27 y 0x3F/)
  assert.doesNotMatch(p, /SSD1306/)
})

test('publica y borra los comandos en un solo update sobre la placa', () => {
  const p = prompt()
  assert.match(p, /Database\.update\(cliente, RAIZ, object_t\(cuerpoJson\)/)
  assert.match(p, /"control\/cmd\/bomba": null/)
  assert.match(p, /"estado\/visto": \{"\.sv": "timestamp"\}/)
  assert.doesNotMatch(p, /Database\.remove\(|RAIZ \+ "\/estado"\), object_t/)
  assert.match(p, /WiFi\.setSleep\(false\)/)
})

test('la contraseña nunca va en el prompt', () => {
  for (const extra of [{}, { llaveModo: 14, pulsadorModo: null, pantalla: 'lcd' }]) {
    assert.match(prompt(extra), /const char \*CONTRASENA {3}= "";/)
  }
})

test('ESP32 clásico: DevKit v1, pantalla en 21 y 22, analógicas entre 32 y 39', () => {
  const p = prompt({ pantalla: 'oled' })
  assert.match(p, /código completo para un ESP32 \(Arduino/)
  assert.match(p, /Placa ESP32 DevKit v1\./)
  assert.match(p, /GPIO 34 a 39 solo sirven para entradas/)
  assert.match(p, /entre GPIO 32 y 39/)
  assert.match(p, /Wire\.begin\(21, 22\)/)
})

test('ESP32-S3: su placa, sus pines y la pantalla en 8 y 9', () => {
  const p = prompt({ chip: 'esp32s3', pantalla: 'lcd' })
  assert.match(p, /código completo para un ESP32-S3 \(Arduino/)
  assert.match(p, /Placa ESP32-S3 DevKitC-1 o compatible\./)
  assert.match(p, /GPIO 22 a 25 no existen, 26 a 32 son de la flash/)
  assert.match(p, /entre GPIO 1 y 10/)
  assert.match(p, /SDA en GPIO 8, SCL en GPIO 9/)
  assert.match(p, /Wire\.begin\(8, 9\)/)
  assert.doesNotMatch(p, /DevKit v1|GPIO 21|34 a 39/)
})
