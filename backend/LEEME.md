# Backend — puesta en marcha

Se hace una sola vez y lleva unos 15 minutos. No hace falta instalar nada: todo
se hace desde la web de Supabase.

## 1. Crear el proyecto

1. Entrar a [supabase.com](https://supabase.com) y crear un proyecto (plan Free).
2. Elegir la región más cercana.
3. Guardar la contraseña de la base que pide al crearlo: acá no se usa, pero sin
   ella no se puede entrar por Postgres directo si alguna vez hace falta.

## 2. Cargar la base

En **SQL Editor**, pegar y ejecutar **en este orden**:

| Archivo | Qué hace |
|---|---|
| `00-borrar-todo.sql` | ⚠️ borra todo lo de versiones anteriores. Solo si ya habías cargado una |
| `01-esquema.sql` | tablas, índices y RLS |
| `02-funciones.sql` | las once funciones de la API |
| `03-curso-ejemplo.sql` | crea el curso `IOT2026` |

Antes de correr el `03`, cambiá el código y el nombre del curso por los de la
comisión de verdad. El `02` se puede volver a correr sin romper nada.

> **El `00` borra todos los datos**, alumnos incluidos. Existe para pasar de las
> versiones anteriores a esta, y solo tiene sentido mientras nadie esté usando el
> sistema.

## 3. Anotar las dos claves

En **Project Settings > API Keys**:

- **Project URL** → `https://xxxxx.supabase.co`
- **Publishable key** → la que empieza con `sb_publishable_...`

Esas dos van al portal (como variables de entorno) y al sketch del ESP32.

> **Usá la publishable key, no la legacy `anon` key.** Hoy funcionan las dos,
> pero Supabase deshabilita las legacy a fines de 2026, y esto tiene que seguir
> andando el cuatrimestre que viene.
>
> La publishable key es **pública por diseño**: va dentro del bundle del portal y
> de 20 APKs. Es seguro porque RLS está cerrado sin ninguna política: esa clave
> sola no puede leer ni escribir ninguna tabla, todo pasa por las funciones.
>
> La que **nunca** sale de acá es la **secret key** (`sb_secret_...`), que saltea
> RLS por completo.

> **Trampa de nombres.** La clave se llama *publishable*, pero el **rol** de
> Postgres al que Supabase la mapea se sigue llamando `anon`. Por eso los
> `grant ... to anon` de `02-funciones.sql` están bien: ahí `anon` es el rol, no
> la clave.

## 4. Probar que quedó bien

```bash
URL=https://xxxxx.supabase.co
PUB=sb_publishable_...

# 1. el backend responde
curl "$URL/rest/v1/rpc/salud?apikey=$PUB"

# 2. un alumno de prueba entra por primera vez: se crea con la plantilla
curl -X POST "$URL/rest/v1/rpc/entrar?apikey=$PUB" \
  -H "Content-Type: application/json" \
  -d '{"p_curso":"IOT2026","p_alumno":"Prueba Uno","p_pin":"1234"}'
#    -> guardá "clave" y "clave_admin"
#    Esta llamada es la que prueba que pgcrypto se encuentra (ver punto 7).

# 3. entra de nuevo con el mismo PIN: tienen que volver LAS MISMAS claves
#    y "nuevo": false. Con otro PIN tiene que rechazar.

CLAVE=la_clave
ADMIN=la_clave_admin

# 4. la configuración, desde el portal
curl -X POST "$URL/rest/v1/rpc/leer_config?apikey=$PUB" \
  -H "Content-Type: application/json" -d "{\"p_admin\":\"$ADMIN\"}"

# 5. la placa sincroniza
curl -X POST "$URL/rest/v1/rpc/sync?apikey=$PUB" \
  -H "Content-Type: application/json" \
  -d "{\"p_clave\":\"$CLAVE\",\"p_estado\":{\"t\":24.5,\"h\":61.2,\"bomba\":0,\"vent\":0,\"luz\":0}}"

# 6. la app lee, por GET y SIN HEADERS (así la usa Kodular)
curl "$URL/rest/v1/rpc/leer_estado?apikey=$PUB&p_clave=$CLAVE"

# 7. forma incorrecta: se rechaza explicando qué corregir (esperá 3 s antes)
curl -X POST "$URL/rest/v1/rpc/sync?apikey=$PUB" \
  -H "Content-Type: application/json" \
  -d "{\"p_clave\":\"$CLAVE\",\"p_estado\":{\"t\":\"24.5\"}}"

# 8. nombres que no coinciden: se acepta, con avisos (esperá 3 s antes)
curl -X POST "$URL/rest/v1/rpc/sync?apikey=$PUB" \
  -H "Content-Type: application/json" \
  -d "{\"p_clave\":\"$CLAVE\",\"p_estado\":{\"temp\":24.5,\"h\":61.2}}"

# 9. las tablas están cerradas
curl "$URL/rest/v1/dispositivos?apikey=$PUB"
#    -> vacío o 401. Si devuelve filas, RLS quedó mal.
```

Borrar después el alumno de prueba:

```sql
delete from dispositivos where alumno = 'Prueba Uno';
```

## 5. Dejar andando el cron que evita la pausa

**Este paso no es opcional.** Supabase pausa los proyectos gratuitos tras 7 días
de baja actividad, y este sistema queda quieto meses entre cuatrimestres. Pasados
90 días pausado se pierde el restore de un clic: hay que restaurar un backup en
un proyecto nuevo, con URL y claves nuevas, y todos los alumnos tienen que
reconfigurar placa y app.

Una request por día lo evita. Está resuelto en
`.github/workflows/mantener-vivo.yml`: subí el repo a GitHub y cargá dos secretos
en **Settings > Secrets and variables > Actions**:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Si no usás GitHub, cualquier cron externo sirve (cron-job.org, por ejemplo)
apuntando a `https://xxxxx.supabase.co/rest/v1/rpc/salud?apikey=PUBLISHABLE_KEY`.

## 6. Cómo está pensado

### Cada alumno tiene su hardware

Los sensores y relés de cada alumno están en la tabla `canales` (el equivalente
a los feeds de Adafruit), y las reglas del modo automático en `reglas`, una por
relé. El alumno los administra desde el portal, en **Configurar**.

### Plantilla del curso

Cuando un alumno entra por primera vez, recibe una **copia** de la plantilla del
curso. Por defecto es el kit de siempre (DHT22 + bomba, ventilador y luz) con dos
reglas apagadas, así la plantilla de Kodular funciona de entrada. Después ese
hardware es del alumno.

Cambiar la plantilla afecta solo a los alumnos que entren después. Las recetas
(plantilla vacía, agregar un relé, agregarle un sensor a todos los que ya están)
están en `03-curso-ejemplo.sql`. Si la plantilla queda mal armada, un trigger la
rechaza con un mensaje que dice qué corregir, y no se guarda nada.

### PIN y dos claves

Cada alumno entra al portal con curso, nombre y un **PIN** que elige la primera
vez. Nombre con o sin tildes, en mayúsculas o minúsculas: es la misma cuenta.
Cinco PIN incorrectos seguidos bloquean 15 minutos.

Entrar devuelve dos claves con alcances distintos:

| Clave | Dónde va | Qué puede hacer |
|---|---|---|
| `clave` | sketch del ESP32 y app Kodular | leer, sincronizar, prender relés, activar reglas y mover umbrales |
| `clave_admin` | solo el portal | crear, editar y borrar sensores, relés y reglas |

La `clave` va dentro del APK y es extraíble, por eso **no** puede cambiar la
estructura: quien la saque de una app puede como mucho prender un relé, no
borrarle la configuración a nadie.

Si un alumno se olvida el PIN, la receta para resetearlo está en
`03-curso-ejemplo.sql`. Además rota su `clave_admin`, así cualquier sesión abierta
en otro navegador deja de servir. La clave de la placa no cambia.

### Qué se rechaza y qué solo se avisa

- **Forma incorrecta → rechazo.** Un valor como texto, un relé en 2, un nombre
  inválido. Es un error del sketch y conviene que sea ruidoso. Queda guardado en
  `estado.ultimo_error` y el alumno lo ve en el portal.
- **Nombres que no coinciden → aviso.** Un sensor declarado que no llega, o algo
  que llega sin declarar. El sync se acepta y vuelve con `avisos`. Si no, la placa
  quedaría desconectada cada vez que el alumno declara algo antes de reflashear.
- **Un `null` es "no llegó valor".** ArduinoJson manda `NaN` como `null`, y un
  DHT22 que falla una lectura devuelve `NaN`. Rechazar por eso dejaría la placa
  desconectada por un cable flojo.

### `extensions` en el `search_path`

En Supabase, pgcrypto (que genera las claves y guarda los PIN) vive en el esquema
`extensions`. Todas las funciones tienen `extensions` en su `search_path`; sin
eso, `entrar` fallaría en producción aunque anduviera en una base local. La prueba
2 del punto 4 es la que lo confirma.

## Uso diario

`03-curso-ejemplo.sql` tiene, comentadas, las consultas del día a día: ver cómo
viene la clase, resetear un PIN, desbloquear, desactivar a alguien, cambiar la
plantilla y cerrar las inscripciones.

La más útil antes de una clase:

```sql
select d.alumno, d.device_id, e.ultimo_error, e.avisos
  from dispositivos d join estado e using (device_id)
 where e.ultimo_error is not null or cardinality(e.avisos) > 0;
```
