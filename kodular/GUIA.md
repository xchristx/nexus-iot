# App Kodular de Nexus IoT

Un proyecto de Kodular que ya lee los datos de la placa y le manda comandos. Los
bloques que hablan con el servidor están hechos y comentados: el alumno solo arma
su pantalla y usa tres funciones, `valor`, `enviarComando` y `enviando`.

Hay dos maneras de tenerlo:

1. **Importar el `.aia`** (lo recomendado): en dos minutos está andando.
2. **Armarlo a mano** siguiendo la sección 5. Sirve si la importación falla o si
   la idea es que los alumnos entiendan cada bloque.

## 1. Qué archivo usar

| Archivo | Para quién | Qué hay que cambiar |
|---|---|---|
| `NexusIoT_curso.aia` | los alumnos del curso | nada: ya trae la URL y la publishable key del curso |
| `NexusIoT.aia` | otro docente, con su propio Supabase | `URL_BASE` y `PUBLICABLE`, dos bloques de texto |

`NexusIoT_curso.aia` no se sube al repo: se genera con los datos de
`portal/.env` (ver sección 6).

Antes de repartirlo, importalo vos y probalo una vez con una placa.

## 2. Importar y probar

1. En Kodular Creator, en la lista de proyectos, elegí **Import project** y
   subí el `.aia`. Si ya tenés un proyecto con ese nombre, poné otro en el
   diálogo.
2. Solo con `NexusIoT.aia`: en **Blocks**, cambiá el texto de
   `initialize global URL_BASE` por `https://<tu-proyecto>.supabase.co/rest/v1/rpc/`
   (con la barra del final) y el de `PUBLICABLE` por tu `sb_publishable_...`.
3. Abrilo en el teléfono con Kodular Companion, o generá el APK.
4. Pegá la clave de la placa (la del portal, en **Mis datos**; no es el PIN) y
   tocá **Guardar clave**. Queda guardada en el teléfono.

Con la placa andando, la pantalla muestra "Placa conectada", la lista de valores
(`t: 24.5`, `bomba: 0`, ...) y el estado de la bomba. Los botones la prenden y la
apagan.

Si algo está mal, el error aparece arriba, donde dice si la placa está
conectada. Los mensajes del servidor dicen qué corregir (por ejemplo, "Clave
inválida. Sacá la tuya del portal.").

## 3. Cómo se usa desde tus bloques

En el editor de bloques hay dos columnas:

- **Izquierda, lo tuyo:** la configuración, `Screen1.Initialize`, los botones y
  `mostrarEstado`.
- **Derecha, lo de Nexus:** no hace falta tocarlo. Cada bloque tiene un signo de
  pregunta con una explicación.

| Bloque | Qué hace | Ejemplo |
|---|---|---|
| `valor(id)` | El último valor de un sensor o relé. Da 0 si todavía no llegó. | `valor("t")`, `valor("bomba")` |
| `enviarComando(rele, prender)` | Prende (1) o apaga (0) un relé. | `enviarComando("vent", 1)` |
| `enviando(rele)` | Verdadero mientras la placa todavía no recogió el comando. | mostrar "enviando…" |
| `mostrarEstado` | **Lo escribís vos.** Se llama solo cada vez que llegan datos nuevos. | poner valores en labels |
| `mostrarError(mensaje)` | Muestra un error arriba. | |
| `valor("edad")` | Segundos desde el último dato de la placa: -1 si nunca se conectó; más de 30, desconectada. | |

Los `id` son los del portal (**Configurar**): `t`, `h`, `bomba`, `vent`, `luz` en el
kit del curso, o los que cada alumno haya declarado.

### Ejemplo: sumar el ventilador

1. **Designer:** agregá un Label `LabelVent` y dos botones, `BotonPrenderVent` y
   `BotonApagarVent`.
2. **Blocks:** `when BotonPrenderVent.Click` → `call enviarComando` con
   `rele = "vent"` y `prender = 1`. Lo mismo con 0 para apagar.
3. En `mostrarEstado`, duplicá el `if` de la bomba (clic derecho → **Duplicate**)
   y cambiá `"bomba"` por `"vent"` y `LabelBomba` por `LabelVent`.

### Lo que conviene saber

- **La respuesta no vuelve en el mismo bloque.** `pedirEstado` hace el pedido y
  la respuesta llega después, en `WebEstado.GotText`. Por eso existe
  `mostrarEstado`: todo lo que dependa de los datos va ahí adentro.
- **Un comando tarda unos 5 segundos** en llegar al relé, porque la placa lo
  recoge en su próximo sync. Mientras tanto, `enviando(rele)` da verdadero:
  mostrá "enviando…" para que no parezca que el botón no anduvo.
- **Apretar un botón apaga el modo automático de ese relé**, y solo de ese. Si
  no, la regla lo revertiría a los pocos segundos. Se vuelve a activar desde el
  portal.
- **No bajes el reloj de 5000 ms.** Cada lectura gasta transferencia del plan
  gratuito, que es una sola para toda la clase. Con la app en segundo plano el
  reloj se frena solo.
- **En Kodular no existe `JsonTextDecodeWithDictionaries`.** Los tutoriales de
  App Inventor lo usan, pero Kodular no lo tiene. Acá la respuesta se decodifica
  con `JsonTextDecode`, que da una lista de pares, y se lee con
  `look up in pairs`. Eso es lo que hace `valor`.
- **La clave de la app no es el PIN.** Con la clave se leen datos y se prenden
  relés, pero no se cambia la configuración. Aun así, conviene no compartirla.

## 4. Pasar los bloques a otro proyecto

Para sumarle Nexus a un proyecto que ya existe, sin importar el `.aia`:

1. **En el proyecto destino, creá primero los componentes** con estos nombres
   exactos. Si falta uno, los bloques que lo usan aparecen en rojo.

   | Componente | Nombre | Lo usa |
   |---|---|---|
   | Web | `WebEstado` | `pedirEstado`, `WebEstado.GotText` |
   | Web | `WebComando` | `enviarComando`, `WebComando.GotText` |
   | Clock | `RelojEstado` | lee cada 5 s (`TimerInterval` 5000, `TimerAlwaysFires` sin tildar) |
   | Label | `LabelConexion` | `pedirEstado`, `mostrarError` |
   | TinyDB | `TinyDB1` | guardar la clave (solo si usás `Screen1.Initialize` y el botón) |

2. **En el proyecto de origen**, clic derecho sobre cada bloque →
   **Download Blocks as PNG**. La imagen lleva los bloques adentro.
3. **Arrastrá cada PNG** al editor de bloques del proyecto destino y los bloques
   aparecen.

Pasá también las variables globales `URL_BASE`, `PUBLICABLE`, `CLAVE`, `estado` y
`SISTEMA`. La **mochila** (Backpack) sirve para lo mismo, pero solo entre tus
propios proyectos: para pasárselo a otra persona, usá los PNG o el `.aia`.

## 5. Armarlo a mano

### Componentes

| Componente | Nombre | Propiedades |
|---|---|---|
| TextBox | `TextBoxClave` | Hint: `pegá acá tu clave` |
| Button | `BotonGuardarClave` | Text: `Guardar clave` |
| Label | `LabelConexion` | FontBold, FontSize 18 |
| Label | `LabelDatos` | |
| Label | `LabelBomba` | |
| Button | `BotonPrender`, `BotonApagar` | |
| Web | `WebEstado`, `WebComando` | |
| Clock | `RelojEstado` | TimerInterval `5000`, TimerAlwaysFires sin tildar |
| TinyDB | `TinyDB1` | |

### Bloques

Los nombres de bloques están como aparecen en Kodular en inglés. Dónde está
cada uno:

- **Text:** `" "`, `join`, `is empty`, `trim`.
- **Lists:** `create empty list`, `make a list`, `look up in pairs`,
  `is in list?`, `select list item`.
- **Control:** `if` y `for each item in list`. Para agregar `else if` o `else`,
  tocá el engranaje azul del `if`.
- **Logic:** `true`, `false`, `not`, `or`.
- **Math:** los números y el comparador (`=`, `≠`, `<`, `>`).
- **Variables:** `initialize global`, `initialize local`, `get`, `set`.
- **Procedures:** `to … do`, y `to … result` para las que devuelven un valor.
  Los parámetros se agregan con el engranaje azul.

`join` tiene dos lugares: para agregar más, usá el engranaje azul.

**Variables globales:**

```
initialize global URL_BASE   to "https://TUPROYECTO.supabase.co/rest/v1/rpc/"
initialize global PUBLICABLE to "sb_publishable_PEGA_ACA_LA_TUYA"
initialize global CLAVE      to ""
initialize global estado     to create empty list
initialize global SISTEMA    to make a list "ok" "device_id" "alumno" "detectados"
                                  "faltan" "pendientes" "reglas" "edad" "avisos"
                                  "ultimo_error" "syncs"
```

**Leer el estado:**

```
to pedirEstado
  if is empty (get global CLAVE)
    set LabelConexion.Text to "Pegá la clave de tu placa y tocá \"Guardar clave\"."
  else
    set WebEstado.Url to join (get global URL_BASE) "leer_estado?apikey="
                              (get global PUBLICABLE) "&p_clave=" (get global CLAVE)
    call WebEstado.Get

when RelojEstado.Timer
  call pedirEstado

when WebEstado.GotText
  if responseCode ≠ 200
    call mostrarError join "El servidor respondió " responseCode ": " responseContent
  else
    set global estado to call WebEstado.JsonTextDecode jsonText: responseContent
    if look up in pairs  key "ok"  pairs (get global estado)  notFound false
      call mostrarEstado
    else
      call mostrarError (look up in pairs  key "error"  pairs (get global estado)
                                           notFound "respuesta inesperada")

to valor (id)  result
  look up in pairs  key (get id)  pairs (get global estado)  notFound 0

to enviando (rele)  result
  (is in list? thing join (get rele) "=1"
               list look up in pairs key "pendientes" pairs (get global estado) notFound create empty list)
  or
  (is in list? thing join (get rele) "=0"
               list look up in pairs key "pendientes" pairs (get global estado) notFound create empty list)
```

**Mandar comandos.** El texto del `PostText` se arma con un `join` de 7 partes.
Las comillas van adentro de los bloques de texto:

```
to enviarComando (rele, prender)
  set WebComando.Url to join (get global URL_BASE) "enviar_comando?apikey=" (get global PUBLICABLE)
  set WebComando.RequestHeaders to make a list (make a list "Content-Type" "application/json")
  call WebComando.PostText text: join  {"p_clave":"   (get global CLAVE)   ","p_cmd":"
                                       (get rele)   =   (get prender)   "}

when WebComando.GotText
  if responseCode ≠ 200
    call mostrarError join "El servidor respondió " responseCode ": " responseContent
  else
    initialize local respuesta to call WebComando.JsonTextDecode jsonText: responseContent
    in
      if look up in pairs  key "ok"  pairs (get respuesta)  notFound false
        call pedirEstado
      else
        call mostrarError (look up in pairs key "error" pairs (get respuesta)
                                            notFound "respuesta inesperada")
```

**Errores:**

```
to mostrarError (mensaje)
  set LabelConexion.Text to join "Error: " (get mensaje)

when Screen1.ErrorOccurred
  call mostrarError join functionName ": " message
```

Sin `Screen1.ErrorOccurred`, un corte de internet abre un cartel cada 5 segundos.

**La app de ejemplo:**

```
when Screen1.Initialize
  set global CLAVE to call TinyDB1.GetValue tag "clave" valueIfTagNotThere (get global CLAVE)
  set TextBoxClave.Text to get global CLAVE
  call pedirEstado

when BotonGuardarClave.Click
  set global CLAVE to trim TextBoxClave.Text
  call TinyDB1.StoreValue tag "clave" valueToStore (get global CLAVE)
  call TextBoxClave.HideKeyboard
  call pedirEstado

to mostrarEstado
  if valor("edad") < 0
    set LabelConexion.Text to "La placa todavía no se conectó nunca."
  else if valor("edad") > 30
    set LabelConexion.Text to join "Placa desconectada: el último dato es de hace "
                                   valor("edad") " segundos."
  else
    set LabelConexion.Text to "Placa conectada"

  set LabelDatos.Text to ""
  for each par in list (get global estado)
    if not (is in list? thing (select list item list (get par) index 1)
                        list (get global SISTEMA))
      set LabelDatos.Text to join LabelDatos.Text
                                  (select list item list (get par) index 1) ": "
                                  (select list item list (get par) index 2) "\n"

  if enviando("bomba")
    set LabelBomba.Text to "Bomba: enviando…"
  else if valor("bomba") = 1
    set LabelBomba.Text to "Bomba: prendida"
  else
    set LabelBomba.Text to "Bomba: apagada"

when BotonPrender.Click
  call enviarComando rele "bomba" prender 1

when BotonApagar.Click
  call enviarComando rele "bomba" prender 0
```

En `for each item in list`, cambiá `item` por `par`. El `"\n"` es una barra
invertida y una n, escritas en el bloque de texto: Kodular lo convierte en un
salto de línea.

## 6. Regenerar el `.aia`

El `.aia` no se edita a mano: lo arma `kodular/generar-aia.mjs`, sin dependencias.

```bash
node kodular/generar-aia.mjs
```

Escribe `kodular/NexusIoT.aia` con marcadores. Si `portal/.env` tiene
`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, escribe también
`kodular/NexusIoT_curso.aia` con esos valores (está en `.gitignore`). Dos
corridas sin cambios dan el mismo archivo.

El formato está copiado de proyectos exportados por Kodular Creator
(`YaVersion` 242, con las versiones de componentes de Kodular, que no son las de
App Inventor). Hay dos cosas que el generador evita a propósito:

- `JsonTextDecodeWithDictionaries`, que Kodular no tiene.
- El bloque `is number?`, que en Kodular no tiene el desplegable de App Inventor.

**Si `leer_estado` suma una clave del sistema** (en `util.reservados()` de
`backend/02-funciones.sql`), agregala a `SISTEMA` en el generador y en esta guía.
Si no, `mostrarEstado` la muestra como si fuera un sensor.
