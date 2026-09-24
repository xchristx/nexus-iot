# App Kodular de Nexus IoT

Un proyecto de Kodular que ya entra con el usuario del alumno, recibe los datos de
la placa **en tiempo real** y le manda comandos y el modo automático. Los bloques
que hablan con Firebase están hechos y comentados: el alumno solo arma su pantalla
y usa cuatro funciones: `valor`, `enviarComando`, `modoAuto` y `autoActivo`.

Hay dos maneras de tenerlo:

1. **Importar el `.aia`** (lo recomendado).
2. **Armarlo a mano** siguiendo la sección 5. Sirve si la importación falla o si
   la idea es que los alumnos entiendan cada bloque.

> **Importante: el Companion no sirve.** Los componentes de Firebase de Kodular
> solo andan en un APK compilado (**Export → Android App (.apk)**). Para probar
> cada cambio hay que compilar e instalar el APK; tarda alrededor de un minuto.

## 1. Qué archivo usar

| Archivo | Para quién | Qué trae |
|---|---|---|
| `NexusIoT_curso.aia` | los alumnos del curso | todo: el `google-services.json` del proyecto y el package que le corresponde |
| `NexusIoT.aia` | otro docente, con su propio Firebase | los bloques; hay que subirle su `google-services.json` |

`NexusIoT_curso.aia` no se sube al repo: se genera a partir de
`kodular/google-services.json` (ver sección 6 y `firebase/LEEME.md`).

Antes de repartirlo, importalo vos, compilalo y probalo una vez con una placa.

## 2. Importar y probar

1. En Kodular Creator, en la lista de proyectos, elegí **Import project** y subí el
   `.aia`. Si ya tenés un proyecto con ese nombre, poné otro en el diálogo.
2. Solo con `NexusIoT.aia`:
   - En **Media**, subí el `google-services.json` de la app Android de tu
     proyecto Firebase.
   - En **Project Properties**, poné en **Package Name** el mismo package que
     registraste en Firebase (`io.nexusiot.app` si seguiste `firebase/LEEME.md`).
     Si no coinciden, no compila.
3. Compilá el APK e instalalo en el teléfono.
4. Escribí tu usuario (el del portal, por ejemplo `iot2026-ana_perez`) y tu
   contraseña, y tocá **Entrar**. Quedan guardados en el teléfono.

Con la placa andando, la pantalla muestra "Placa conectada", la lista de valores
(`t: 24.5`, `bomba: 0`, ...), el modo automático y el estado de la bomba. Los
botones la prenden y la apagan, y el cambio se ve en menos de un segundo.

El ejemplo usa una salida con id `bomba`. Como cada alumno arranca sin nada
configurado, o declara una salida `bomba` en el portal para probar, o cambia
`"bomba"` por el id de su salida en `mostrarEstado` y en los dos botones.

## 3. Cómo se usa desde tus bloques

En el editor de bloques hay dos columnas:

- **Izquierda, lo tuyo:** la configuración, `Screen1.Initialize`, los botones y
  `mostrarEstado`.
- **Derecha, lo de Nexus:** no hace falta tocarlo. Cada bloque tiene un signo de
  pregunta con una explicación.

| Bloque | Qué hace | Ejemplo |
|---|---|---|
| `valor(id)` | El último valor de una entrada o salida. Da 0 si todavía no llegó. | `valor("t")`, `valor("bomba")` |
| `enviarComando(salida, prender)` | Prende (1) o apaga (0) una salida. | `enviarComando("vent", 1)` |
| `modoAuto(activar)` | Activa (`true`) o desactiva (`false`) el modo automático. | `modoAuto(true)` |
| `autoActivo()` | Verdadero si el modo automático está activado. | cambiar el texto de un botón |
| `conectada()` | Verdadero si la placa mandó noticias en el último minuto. | |
| `mostrarEstado` | **Lo escribís vos.** Se llama solo cada vez que llega un dato. | poner valores en labels |
| `mostrarError(mensaje)` | Muestra un error arriba. | |

Los `id` son los que cada alumno declaró en el portal (**Configurar**): sus
entradas (lo que la placa mide o lee) y sus salidas (lo que prende y apaga).

### Ejemplo: sumar otra salida (un ventilador, `vent`)

1. **Designer:** adentro de `ArregloPlaca`, agregá un Label `LabelVent` y dos
   botones, `BotonPrenderVent` y `BotonApagarVent`.
2. **Blocks:** `when BotonPrenderVent.Click` → `call enviarComando` con
   `salida = "vent"` y `prender = 1`. Lo mismo con 0 para apagar.
3. En `mostrarEstado`, duplicá el `if` de la bomba (clic derecho → **Duplicate**)
   y cambiá `"bomba"` por `"vent"` y `LabelBomba` por `LabelVent`.

### Lo que conviene saber

- **No hay que pedir los datos: llegan solos.** Cada vez que la placa cambia algo,
  se dispara `DBEstado.DataChanged`, que lo guarda y llama a `mostrarEstado`. Por
  eso todo lo que dependa de los datos va ahí adentro.
- **En modo automático, una salida con regla no obedece.** La placa ignora el
  comando (y el pulsador) y deja un aviso, que la app muestra al final de la
  lista. Para manejarla a mano, primero `modoAuto(false)`.
- **Los pulsadores de la placa se ven solos:** cuando alguien aprieta uno, la
  salida cambia y la app se entera igual que con cualquier otro dato.
- **El reloj `RelojConexion` no usa internet.** Solo vuelve a llamar a
  `mostrarEstado` cada 5 s para que el cartel pase a "desconectada" si la placa
  deja de mandar.
- **Lo que llega se guarda en `TinyDBEstado`**, un TinyDB con su propio
  Namespace que hace de diccionario: `valor` lo lee con `GetValue`, y
  `mostrarEstado` recorre todo con `GetTags`. Kodular no tiene los diccionarios de
  App Inventor.
- **Usuario y contraseña quedan guardados en el teléfono** (en `TinyDB1`) para no
  pedirlos cada vez. **Cambiar de usuario** borra la contraseña guardada.

## 4. Pasar los bloques a otro proyecto

1. **En el proyecto destino, creá primero los componentes** con estos nombres
   exactos, y subí el `google-services.json` en Media. Si falta uno, los bloques
   que lo usan aparecen en rojo.

   | Componente | Nombre | Para qué |
   |---|---|---|
   | Firebase Authentication | `FirebaseAuth` | entrar con el usuario |
   | Firebase Realtime Database | `DBEstado` | escuchar lo que manda la placa |
   | Firebase Realtime Database | `DBControl` | el modo automático |
   | Firebase Realtime Database | `DBCmd` | los comandos |
   | TinyDB | `TinyDBEstado` | lo que llega (`Namespace`: `NexusEstado`) |
   | TinyDB | `TinyDB1` | usuario y contraseña |
   | Clock | `RelojConexion` | el cartel de conectada (`TimerInterval` 5000) |
   | Label | `LabelConexion` | mensajes y errores |
   | VerticalArrangement | `ArregloLogin`, `ArregloPlaca` | mostrar y esconder |

2. **En el proyecto de origen**, clic derecho sobre cada bloque →
   **Download Blocks as PNG**. La imagen lleva los bloques adentro.
3. **Arrastrá cada PNG** al editor de bloques del proyecto destino y los bloques
   aparecen.

Pasá también las variables globales `DOMINIO`, `USUARIO`, `CONTRASENA`, `AUTO` y
`SISTEMA`. La **mochila** (Backpack) sirve para lo mismo, pero solo entre tus
propios proyectos.

## 5. Armarlo a mano

### Componentes

En `Screen1`, en este orden:

- `ArregloLogin` (VerticalArrangement, Width *Fill parent*) con:
  `LabelLogin`, `TextBoxUsuario` (TextBox), `TextBoxContrasena` (PasswordTextBox)
  y `BotonEntrar`.
- `LabelConexion` (Label, negrita, 18).
- `ArregloPlaca` (VerticalArrangement, Width *Fill parent*, **Visible sin tildar**)
  con: `LabelDatos`, `LabelModo`, `BotonModo`, `LabelBomba`, `ArregloBomba`
  (HorizontalArrangement con `BotonPrender` y `BotonApagar`) y `BotonSalir`.
- No visibles: los de la tabla de la sección 4.

### Bloques

Globales: `DOMINIO` = `"@nexus-iot.example.com"`, `USUARIO` = `""`,
`CONTRASENA` = `""`, `AUTO` = `false`, `SISTEMA` = lista `"visto"`, `"aviso"`.

```text
procedimiento entrar
  LabelConexion.Text ← "Entrando…"
  FirebaseAuth.EmailPasswordLogin(une(USUARIO, DOMINIO), CONTRASENA)

cuando FirebaseAuth.LoginSuccess
  TinyDBEstado.ClearAll
  DBEstado.ProjectPath  ← une("placas/", USUARIO, "/estado")
  DBControl.ProjectPath ← une("placas/", USUARIO, "/control")
  DBCmd.ProjectPath     ← une("placas/", USUARIO, "/control/cmd")
  ArregloLogin.Visible ← falso ; ArregloPlaca.Visible ← verdadero
  DBEstado.GetTagList
  DBControl.GetValue("auto", falso)
  mostrarEstado

cuando FirebaseAuth.LoginFailed
  mostrarError("No se pudo entrar. Revisá tu usuario y tu contraseña…")

cuando DBEstado.DataChanged(tag, value)     y también DBEstado.GotValue(tag, value)
  TinyDBEstado.StoreValue(tag, value) ; mostrarEstado

cuando DBEstado.TagList(value)
  para cada tag en value: DBEstado.GetValue(tag, "")

cuando DBControl.DataChanged(tag, value)    y también DBControl.GotValue(tag, value)
  si tag = "auto": AUTO ← value ; mostrarEstado

función valor(id)       = TinyDBEstado.GetValue(id, 0)
función conectada()     = RelojConexion.SystemTime − valor("visto") < 60000
función autoActivo()    = está en la lista (minúsculas(une("", AUTO)), ["true", "1"])
procedimiento enviarComando(salida, prender) = DBCmd.StoreValue(salida, prender)
procedimiento modoAuto(activar)              = DBControl.StoreValue("auto", activar)
```

Los botones: `BotonEntrar` guarda `minúsculas(recortar(TextBoxUsuario.Text))` en
`USUARIO` y la contraseña en `CONTRASENA`, los guarda en `TinyDB1` y llama a
`entrar`. `Screen1.Initialize` los lee de `TinyDB1` y, si hay contraseña, llama a
`entrar`. `BotonModo` hace `modoAuto(no autoActivo())`.

En `mostrarEstado`, el `"\n"` es una barra invertida y una n, escritas en el
bloque de texto: Kodular lo convierte en un salto de línea.

## 6. Regenerar el `.aia`

El `.aia` no se edita a mano: lo arma `kodular/generar-aia.mjs`, sin dependencias.

```bash
node kodular/generar-aia.mjs
```

Escribe `kodular/NexusIoT.aia` sin `google-services.json` y con el package
`io.nexusiot.app`. Si existe `kodular/google-services.json`, escribe también
`kodular/NexusIoT_curso.aia` con ese archivo adentro y el package que dice (está en
`.gitignore`). Dos corridas sin cambios dan el mismo archivo.

El formato está copiado de proyectos exportados por Kodular Creator (`YaVersion`
247, julio de 2026, con las versiones de componentes de Kodular, que no son las de
App Inventor). Lo que el generador evita a propósito:

- El componente viejo `FirebaseDB`: desde Kodular 2026.05 no compila.
- Los diccionarios y `JsonTextDecodeWithDictionaries`, que Kodular no tiene.
- Los parámetros de `LoginSuccess` (el uid, por ejemplo): la ruta de la placa se
  arma con el usuario que escribió el alumno, que es la clave de su rama.

**Si la placa suma una clave a `estado` que no es una entrada ni una salida**
(hoy `visto` y `aviso`), agregala a `SISTEMA` en el generador y en esta guía. Si
no, `mostrarEstado` la muestra como si fuera una entrada.
