// Kit de ejemplo, solo para generar PROMPT.md.
//
// La plantilla por defecto del curso (backend/01-esquema.sql) está VACÍA, y
// el portal NO usa esto con los alumnos: a cada uno le muestra SU hardware,
// que pide al backend con leer_config(). Esto es el mismo kit que la receta
// "Cargar un kit" de backend/03-curso-ejemplo.sql y que las tablas de
// src/main.cpp, para que PROMPT.md muestre un prompt completo.
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
    { id: 'bomba', nombre: 'Bomba', pin: 26, nivel_activo: 'LOW', conexion: 'IN1 del módulo de relés' },
    { id: 'vent', nombre: 'Ventilador', pin: 27, nivel_activo: 'LOW', conexion: 'IN2 del módulo de relés' },
    { id: 'luz', nombre: 'Luz', pin: 2, nivel_activo: 'HIGH', conexion: 'LED integrado de la placa' },
  ],
  reglas: [
    { salida: 'vent', entrada: 't', condicion: '>', umbral: 28, hist: 1.5, activa: false },
    { salida: 'bomba', entrada: 'h', condicion: '<', umbral: 40, hist: 1.5, activa: false },
  ],
}

// El kit en el formato en que leer_config() devuelve los canales.
export const canalesEjemplo = [
  ...plantillaEjemplo.entradas.map((e) => ({ ...e, tipo: 'entrada' })),
  ...plantillaEjemplo.salidas.map((s) => ({ ...s, tipo: 'salida' })),
]
