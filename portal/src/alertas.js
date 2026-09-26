// Alertas de las entradas: "avisame si t supera 35". Las evalúa el portal (o
// la app Android) mientras está abierto, no la placa: no hay servidor que
// mande avisos con todo cerrado (plan Spark, sin Cloud Functions).
//
// Igual que las reglas de la placa, tienen histéresis: la alerta se prende al
// cruzar el umbral y se apaga recién al volver más allá de umbral ∓ hist, así
// un valor que ronda el umbral no avisa veinte veces.

import { useEffect, useRef, useState } from 'react'

// El estado nuevo de una alerta a partir del anterior y del valor.
export function evaluar(activa, valor, a) {
  if (typeof valor !== 'number') return activa
  if (a.condicion === '>') return activa ? valor >= a.umbral - a.hist : valor > a.umbral
  return activa ? valor <= a.umbral + a.hist : valor < a.umbral
}

// Sin memoria: para el docente, que mira una foto de toda la clase.
export const cruza = (valor, a) => evaluar(false, valor, a)

// "supera 35 °C"
export function textoAlerta(a, unidad = '') {
  return `${a.condicion === '>' ? 'supera' : 'baja de'} ${a.umbral}${unidad ? ' ' + unidad : ''}`
}

// Las alertas activas de la placa, en vivo. `onActivar(alerta, valor)` se
// llama una vez cada vez que una se prende. Con la placa desconectada no se
// evalúa nada: el valor que queda es viejo y no dice qué pasa ahora.
export function useAlertas(placa, conectada, onActivar) {
  const activas = useRef({})
  const [lista, setLista] = useState([])
  const avisar = useRef(onActivar)
  avisar.current = onActivar

  useEffect(() => {
    if (!conectada) return
    const antes = activas.current
    const ahora = {}
    for (const a of placa.alertas) {
      const v = placa.estado[a.entrada]
      if (!placa.canales.some(c => c.id === a.entrada)) continue
      ahora[a.entrada] = evaluar(Boolean(antes[a.entrada]), v, a)
      if (ahora[a.entrada] && !antes[a.entrada]) avisar.current?.(a, v)
    }
    activas.current = ahora
    setLista(placa.alertas.filter(a => ahora[a.entrada]))
  }, [placa, conectada])

  return conectada ? lista : []
}
