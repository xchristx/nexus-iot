# Alexa: puesta en marcha (opcional)

Una skill **Smart Home** para manejar las placas por voz: "Alexa, prende la bomba",
"Alexa, ¿está prendida la luz?", "Alexa, prende el modo automático". Cada salida
aparece como un dispositivo en la app Alexa (con su interruptor, y se puede usar en
rutinas) y cada entrada en °C, como un termómetro.

Es **opcional**: mientras el portal no tenga `VITE_ALEXA_CLIENTE_ID`, no muestra nada
de Alexa. **La placa, el firmware, el prompt y Kodular no cambian**: Alexa escribe
en `control/cmd` y `control/auto`, igual que el portal.

- **Un alumno** vincula su cuenta de Amazon (su Echo o la app Alexa del celular) con
  su placa, desde la app Alexa.
- **El docente** vincula un Echo del laboratorio con un curso y elige qué placas
  maneja: "Alexa, prende la bomba de Ana Pérez".

| Archivo                              | Qué es                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `lambda/`                          | La Lambda (Node, sin dependencias): directivas de Alexa (`hogar.mjs`) y canje de tokens (`oauth.mjs`) |
| `skill.json`                       | El manifiesto de la skill: textos, idiomas y endpoint, para copiar en la consola                          |
| `icono-108.png`, `icono-512.png` | Los íconos que pide la consola (salen de`portal/assets/generar-iconos.mjs`)                            |

## Cómo funciona

```text
App Alexa ── "Activar" ──> portal /alexa: el alumno (o el docente) entra y autoriza
                           el portal deja un código de un solo uso en alexa/codigos/{sha256}
                           y vuelve a Amazon con ?code=
Amazon ── code ──> Lambda (Function URL): lo canjea por tokens y marca el vínculo
                   en placas/{u}/alexa o cursos/{C}/alexa
Echo ── "prende la bomba" ──> Lambda: escribe placas/{u}/control/cmd/bomba = 1
                              la placa lo aplica y lo borra, como siempre
```

- Amazon exige que una skill Smart Home sea una **Lambda de AWS** y que se vincule
  con **OAuth 2.0**. El servidor de OAuth es esta misma Lambda (por su Function URL)
  y la página de login es el portal: no hace falta nada más.
- Firebase sigue en el plan Spark y Netlify, sin funciones. La Lambda entra a la
  base como administrador con una **cuenta de servicio**: es el único lugar donde
  está esa clave.
- Los tokens que guarda Amazon no se guardan en la base: van firmados y llevan de
  quién son. **Desvincular** (desde el portal) borra la marca del vínculo y todos
  esos tokens dejan de andar.

Antes de prender una salida, la Lambda mira la placa:

- **Desconectada** (más de 40 s sin latido): Alexa dice que el dispositivo no
  responde y **no** deja el comando en cola. Por voz, una bomba que arranca horas
  después es peor que un "no responde".
- **En modo automático, y la salida tiene regla:** Alexa dice que no se puede ahora
  y no escribe nada (la placa lo ignoraría igual).
- Si no, escribe el comando, espera hasta 3 s a que la placa lo aplique y contesta
  con el estado real.

El modo automático se cambia aunque la placa esté desconectada, como en el portal.

## Qué hace falta

- Una cuenta de **AWS**. Pide tarjeta, pero la Lambda entra en la capa gratuita
  permanente (1 millón de pedidos por mes): una clase usa unos pocos miles.
- Una cuenta de **Amazon Developer** (gratis, [https://developer.amazon.com](https://developer.amazon.com)). Puede
  ser la misma cuenta de Amazon de siempre.
- El proyecto Firebase andando, **con las reglas de este repo publicadas** (tienen
  `alexa/` y el índice que usa la Lambda), y el portal publicado en Netlify.

## 1. La cuenta de servicio de Firebase

En la consola de Firebase: **Configuración del proyecto → Cuentas de servicio →
Generar nueva clave privada**. Baja un `.json`.

Esa clave da acceso **total** al proyecto. No va al repo (el `.gitignore` ignora
`*firebase-adminsdk*.json`), ni al portal, ni a Netlify: solo a la Lambda. Para
cargarla hay que pasarla a una sola línea:

```bash
node -e "console.log(JSON.stringify(require('./TU-CLAVE-firebase-adminsdk.json')))"
```

## 2. Los secretos

| Variable            | Qué poner                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `CLIENTE_ID`      | Un nombre cualquiera, por ejemplo`nexus-alexa`. No es secreto: también va en Netlify          |
| `CLIENTE_SECRETO` | Uno al azar:`node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`   |
| `SECRETO_TOKENS`  | Otro al azar, igual que el anterior (32 caracteres o más). Si lo cambiás, se desvinculan todos |

## 3. La Lambda (AWS, región us-east-1)

1. **Armar el zip** (PowerShell 7, desde la raíz del repo; el zip no se sube al repo):

   ```powershell
   Compress-Archive -Path alexa\lambda\* -DestinationPath alexa\nexus-alexa.zip -Force
   ```
2. En la consola de AWS, arriba a la derecha, elegí la región **US East (N.
   Virginia) us-east-1**: es la que atiende a Alexa en español de Estados Unidos y
   de México.
3. **Lambda → Create function → Author from scratch**: nombre `nexus-alexa`, runtime
   **Node.js 22.x**.
4. **Code → Upload from → .zip file** → `alexa/nexus-alexa.zip`. El handler queda
   `index.handler`.
5. **Configuration → General configuration → Edit**: **Timeout 8 s** (el de fábrica,
   3 s, no alcanza para esperar a la placa) y **Memory 256 MB**.
6. **Configuration → Environment variables**: `FIREBASE_DATABASE_URL`
   (`https://TUPROYECTO-default-rtdb.firebaseio.com`), `CUENTA_SERVICIO` (la línea del
   paso 1), `CLIENTE_ID`, `CLIENTE_SECRETO` y `SECRETO_TOKENS`. Entre todas tienen
   que pesar menos de 4 KB: la clave ocupa unos 2,4.
7. **Configuration → Function URL → Create**: Auth type **NONE** (el canje se protege
   con `CLIENTE_SECRETO`). Copiá la URL (`https://….lambda-url.us-east-1.on.aws/`):
   es la **Access Token URI** del paso 4.
8. Arriba, copiá el **ARN** de la función (`arn:aws:lambda:us-east-1:…:function:nexus-alexa`).

## 4. La skill

En [https://developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask):

1. **Create Skill**: nombre **Nexus IoT**, idioma **Spanish (US)**, modelo **Smart
   Home** (no Custom), hosting **Provision your own**.
2. En la página **Smart Home** de la skill, copiá el **Skill ID**
   (`amzn1.ask.skill.…`). Todavía no guardes el endpoint: la consola rechaza un ARN
   que no tenga el disparador del paso 3.
3. En AWS, en la Lambda: **Agregar desencadenador → Alexa → Alexa Smart Home**, con
   la **verificación del Skill ID** activada y el Skill ID. Así nadie más puede
   llamarla como Alexa. Después, en la skill: **Default endpoint** = el ARN de la
   Lambda → **Save**.
4. En la skill, **Language settings → Add**: **Spanish (MX)**, con el mismo endpoint.
5. **Account Linking**:

   | Campo                                | Valor                                   |
   | ------------------------------------ | --------------------------------------- |
   | Authorization grant type             | Auth Code Grant                         |
   | Your Web Authorization URI           | `https://TU-PORTAL.netlify.app/alexa` |
   | Access Token URI                     | la Function URL                         |
   | Your Client ID                       | `CLIENTE_ID`                          |
   | Your Secret                          | `CLIENTE_SECRETO`                     |
   | Your Authentication Scheme           | HTTP Basic (Recommended)                |
   | Scope                                | `placa`                               |
   | Default Access Token Expiration Time | 3600                                    |

   Las "Alexa Redirect URLs" que muestra la consola no se cargan en ningún lado: el
   portal ya acepta las de Amazon (y ninguna otra).
6. **Distribution**: los textos están en `skill.json`; los íconos, `icono-108.png` e
   `icono-512.png`; la política de privacidad, `https://TU-PORTAL.netlify.app/privacidad.html`
   (ya explica qué pasa con Alexa).
7. **Netlify**: agregá `VITE_ALEXA_CLIENTE_ID` = `CLIENTE_ID` en las variables de
   entorno y volvé a desplegar. Recién ahí el portal muestra Alexa. La app Android
   lo muestra cuando se recompila con esa variable en `portal/.env`.

## 5. Probarla

Con la cuenta de desarrollador: en la app Alexa, **Más → Skills y juegos → Tus skills
→ Desarrollo → Nexus IoT → Activar**. Se abre el portal: entrá con un usuario de
prueba, tocá **Autorizar** y después decile **"Alexa, descubre dispositivos"**.

Si algo falla, los registros están en AWS: **Lambda → Monitor → View CloudWatch
logs**. Cada pedido deja una línea (`Alexa.PowerController TurnOn iot2026-ana:bomba`)
y cada vinculación, otra (`vinculada: iot2026-ana`). Los tokens no se registran
nunca.

## 6. Los alumnos: prueba beta

La skill no se publica: se reparte como **beta**. En **Distribution → Availability →
Beta Test**, cargá los correos de las cuentas de Amazon de los alumnos que la quieran.
Les llega una invitación con el link para activarla.

- Hasta 500 personas. **La beta dura 90 días y no se puede extender**: después hay
  que crear otra e invitarlos de nuevo.
- Un Echo registrado en la cuenta de desarrollador (el del laboratorio, por
  ejemplo) la usa sin beta y sin vencimiento.
- **Alexa no tiene español de Argentina**: el Echo o la app tienen que estar en
  español de Estados Unidos o de México.

## El día a día

- **Alumno:** en el portal, **Mis datos → Alexa** tiene los pasos y, ya vinculada,
  el botón **Desvincular**. Si cambia sus entradas o salidas: "Alexa, descubre
  dispositivos". Los nombres son los que puso en Configurar, y en la app Alexa los
  puede cambiar.
- **Docente, Echo del laboratorio:** en la app Alexa de la cuenta del Echo, activá la
  skill y entrá **como docente**: elegís el curso y las placas. Después se cambia
  desde la lista del curso en el portal (casilla "en el Echo del laboratorio") y se
  le dice "Alexa, descubre dispositivos". Los nombres son "Bomba de Ana Pérez".
- **Límite:** Alexa acepta hasta 300 dispositivos por cuenta. El portal los cuenta;
  si se pasa, quedan afuera primero los termómetros y después los modos.

## Si se filtra un secreto

| Qué                  | Qué hacer                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| La cuenta de servicio | En Google Cloud (Firebase → Cuentas de servicio → "Administrar permisos"), borrar esa clave; generar otra y cargarla en la Lambda |
| `CLIENTE_SECRETO`   | Cambiarlo en la Lambda y en Account Linking                                                                                         |
| `SECRETO_TOKENS`    | Cambiarlo en la Lambda: todos tienen que vincular de nuevo                                                                          |

## Probar sin AWS

`cd firebase && npm test` corre las pruebas de la Lambda contra los emuladores
(`firebase/pruebas/alexa.test.mjs`): el canje, Discovery, prender con la placa
simulada, el modo automático, la placa desconectada, los tokens, el Echo del
docente y la firma del token de Google.

## Lo que falta probar en el mundo real

Todo lo de Amazon: crear la skill, vincular desde la app Alexa, descubrir, prender y
apagar con una placa real, cómo lo dice Alexa en modo automático y con la placa
desenchufada, la frase exacta para el modo automático y para preguntar la
temperatura, el Echo del laboratorio con la cuenta del docente y una rutina.
