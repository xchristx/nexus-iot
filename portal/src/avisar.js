// Avisos fuera de la pantalla: un pitido y una notificación del sistema.
//
// - En la app Android (Capacitor) la notificación es nativa
//   (@capacitor/local-notifications).
// - En el navegador se usa la del service worker (public/sw.js): Chrome en
//   Android no deja crear `new Notification()` desde la página.
//
// En los dos casos solo funciona con el portal o la app abiertos, o recién
// minimizados: nadie los manda con todo cerrado.

import { Capacitor } from '@capacitor/core'

const nativo = Capacitor.isNativePlatform()
export const esApp = nativo
// Se devuelve el módulo y no el plugin: el plugin es un proxy que responde a
// cualquier método, incluido then(), y una promesa que lo devuelve intenta esperarlo.
const nativas = () => import('@capacitor/local-notifications')

let registro = null
if (!nativo && 'serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').then(r => { registro = r }).catch(() => {})
}

// 'si' | 'no' | 'preguntar' | 'imposible'
export async function permisoAvisos() {
  if (nativo) {
    const { display } = await (await nativas()).LocalNotifications.checkPermissions()
    return display === 'granted' ? 'si' : display === 'denied' ? 'no' : 'preguntar'
  }
  if (!('Notification' in window)) return 'imposible'
  return { granted: 'si', denied: 'no' }[Notification.permission] || 'preguntar'
}

// Solo desde un toque del alumno: los navegadores ignoran el pedido si no.
export async function pedirAvisos() {
  if (nativo) {
    const { display } = await (await nativas()).LocalNotifications.requestPermissions()
    return display === 'granted' ? 'si' : 'no'
  }
  if (!('Notification' in window)) return 'imposible'
  const r = await Notification.requestPermission()
  return r === 'granted' ? 'si' : r === 'denied' ? 'no' : 'preguntar'
}

// Un número estable por entrada: una alerta nueva reemplaza a la anterior de
// la misma entrada en vez de apilarse.
const idDe = (clave) => [...clave].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) & 0x7fffffff

export async function notificar(clave, titulo, texto) {
  try {
    if (nativo) {
      await (await nativas()).LocalNotifications.schedule({ notifications: [{ id: idDe(clave), title: titulo, body: texto }] })
      return
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (registro) await registro.showNotification(titulo, { body: texto, tag: clave, renotify: true })
    else new Notification(titulo, { body: texto, tag: clave })
  } catch {
    // Sin notificación queda el pitido y la tarjeta roja: no vale la pena cortar nada.
  }
}

// Dos pitidos cortos. El navegador solo deja sonar después de que el alumno
// tocó algo en la página; si todavía no, simplemente no suena.
let audio = null
export function pitido() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)()
    if (audio.state === 'suspended') audio.resume()
    for (const t of [0, 0.25]) {
      const osc = audio.createOscillator()
      const vol = audio.createGain()
      osc.frequency.value = 880
      vol.gain.setValueAtTime(0.15, audio.currentTime + t)
      vol.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + t + 0.18)
      osc.connect(vol).connect(audio.destination)
      osc.start(audio.currentTime + t)
      osc.stop(audio.currentTime + t + 0.2)
    }
  } catch {
    // sin audio
  }
}
