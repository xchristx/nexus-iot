// Capa de acceso al backend. Todo pasa por funciones RPC de Supabase: no hay
// acceso directo a tablas porque RLS está cerrado.
//
// Dos claves, con alcances distintos:
//   clave        la de la placa y la app: leer, comandos, ajustar reglas
//   clave_admin  la del portal, después de entrar con PIN: la estructura

const URL = import.meta.env.VITE_SUPABASE_URL
const PUBLICABLE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const configurado = Boolean(URL && PUBLICABLE)

// Las funciones nunca lanzan excepción del lado del servidor: siempre
// devuelven {ok:true|false, ...}. Acá solo hay que cubrir la caída de red.
async function rpc(nombre, args) {
  let r
  try {
    r = await fetch(`${URL}/rest/v1/rpc/${nombre}?apikey=${PUBLICABLE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
  } catch {
    return { ok: false, red: true, error: 'No se pudo conectar. Revisá tu internet.' }
  }

  if (!r.ok) {
    // Un 4xx/5xx de PostgREST significa que algo está mal en el backend, no
    // en lo que mandó el alumno.
    const texto = await r.text()
    return { ok: false, red: true, error: `Error del servidor (${r.status}). ${texto.slice(0, 200)}` }
  }

  return r.json()
}

// --- portal: sesión y estructura (clave_admin) ---
export const entrar       = (curso, alumno, pin) => rpc('entrar', { p_curso: curso, p_alumno: alumno, p_pin: pin })
export const leerConfig   = (admin)              => rpc('leer_config', { p_admin: admin })
export const guardarCanal = (admin, canal)       => rpc('guardar_canal', { p_admin: admin, p_canal: canal })
export const borrarCanal  = (admin, id)          => rpc('borrar_canal', { p_admin: admin, p_id: id })
export const guardarRegla = (admin, regla)       => rpc('guardar_regla', { p_admin: admin, p_regla: regla })
export const borrarRegla  = (admin, salida)      => rpc('borrar_regla', { p_admin: admin, p_salida: salida })

// --- placa y app: operación (clave) ---
export const leerEstado    = (clave)                => rpc('leer_estado', { p_clave: clave })
export const enviarComando = (clave, cmd)           => rpc('enviar_comando', { p_clave: clave, p_cmd: cmd })
export const ajustarRegla  = (clave, salida, cambios) => rpc('ajustar_regla', { p_clave: clave, p_salida: salida, p_cambios: cambios })

// La URL que el alumno pega en Web.Url de Kodular. Es GET y no lleva ningún
// header, que es justamente lo que la hace cómoda de usar en bloques.
export const urlKodularLeer = (clave) =>
  `${URL}/rest/v1/rpc/leer_estado?apikey=${PUBLICABLE}&p_clave=${clave}`

export const urlKodularPost = (funcion) =>
  `${URL}/rest/v1/rpc/${funcion}?apikey=${PUBLICABLE}`

export const datosSketch = { url: URL, publicable: PUBLICABLE }
