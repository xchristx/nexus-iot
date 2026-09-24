// Kit de ejemplo, solo para generar PROMPT.md.
//
// Un curso sin plantilla (firebase/curso-ejemplo.json) arranca
// VACÍO, y el portal NO usa esto con los alumnos: a cada uno le muestra SU
// hardware. Esto es el mismo kit que firebase/plantilla-kit-ejemplo.json y
// que las tablas de src/main.cpp, para que PROMPT.md muestre un prompt
// completo.
//
// Si cambiás el kit, cambialo en los tres lugares y regenerá PROMPT.md con
// `npm run prompt`.

export const plantillaEjemplo = {
  entradas: [
    {
      id: 't', nombre: 'Temperatura', unidad: '°C',
      conexion: 'DHT22, pin de datos en GPIO 4',
      libreria: 'DHT sensor library y Adafruit Unified Sensor, de Adafruit (DHT.h)',
    },
    { id: 'h', nombre: 'Humedad', unidad: '%', conexion: 'el mismo DHT22 de la temperatura' },
  ],
  salidas: [
    { id: 'bomba', nombre: 'Bomba', pin: 26, nivel_activo: 'LOW', conexion: 'IN1 del módulo de relés', pulsador: 32 },
    { id: 'vent', nombre: 'Ventilador', pin: 27, nivel_activo: 'LOW', conexion: 'IN2 del módulo de relés', pulsador: 33 },
    { id: 'luz', nombre: 'Luz', pin: 2, nivel_activo: 'HIGH', conexion: 'LED integrado de la placa' },
  ],
  pulsador_modo: 25,
  reglas: [
    { salida: 'vent', entrada: 't', condicion: '>', umbral: 28, hist: 1.5 },
    { salida: 'bomba', entrada: 'h', condicion: '<', umbral: 40, hist: 1.5 },
  ],
}

// El kit en el formato en que el portal maneja los canales.
export const canalesEjemplo = [
  ...plantillaEjemplo.entradas.map((e) => ({ ...e, tipo: 'entrada' })),
  ...plantillaEjemplo.salidas.map((s) => ({ ...s, tipo: 'salida' })),
]
