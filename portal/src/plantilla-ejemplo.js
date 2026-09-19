// Copia de la plantilla por defecto de backend/01-esquema.sql.
//
// El portal NO usa esto con los alumnos: a cada uno le muestra SU hardware,
// que pide al backend con leer_config(). Esta copia existe solo para generar
// PROMPT.md, que es un ejemplo versionado del prompt.
//
// Si cambiás la plantilla por defecto en el SQL, cambiala acá también y
// regenerá PROMPT.md con `npm run prompt`.

export const plantillaEjemplo = {
  sensores: [
    {
      id: 't', nombre: 'Temperatura', unidad: '°C',
      conexion: 'DHT22, pin de datos en GPIO 4',
      libreria: 'DHT sensor library y Adafruit Unified Sensor, de Adafruit (DHT.h)',
    },
    { id: 'h', nombre: 'Humedad', unidad: '%', conexion: 'el mismo DHT22 de la temperatura' },
  ],
  reles: [
    { id: 'bomba', nombre: 'Bomba', pin: 26, nivel_activo: 'LOW', conexion: 'IN1 del módulo de relés' },
    { id: 'vent', nombre: 'Ventilador', pin: 27, nivel_activo: 'LOW', conexion: 'IN2 del módulo de relés' },
    { id: 'luz', nombre: 'Luz', pin: 2, nivel_activo: 'HIGH', conexion: 'LED integrado de la placa, hasta tener un tercer relé' },
  ],
  reglas: [
    { rele: 'vent', sensor: 't', condicion: '>', umbral: 28, hist: 1.5, activa: false },
    { rele: 'bomba', sensor: 'h', condicion: '<', umbral: 40, hist: 1.5, activa: false },
  ],
}

// La plantilla en el formato en que leer_config() devuelve los canales.
export const canalesEjemplo = [
  ...plantillaEjemplo.sensores.map((s) => ({ ...s, tipo: 'sensor' })),
  ...plantillaEjemplo.reles.map((r) => ({ ...r, tipo: 'rele' })),
]
