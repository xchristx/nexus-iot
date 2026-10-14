/*
 * ====================================================================
 *  VERSION PARA ARDUINO IDE
 * ====================================================================
 *  Antes de compilar, una sola vez:
 *
 *  1) Soporte para ESP32
 *     Archivo > Preferencias > "URLs adicionales de gestor de tarjetas":
 *       https://espressif.github.io/arduino-esp32/package_esp32_index.json
 *     Despues: Herramientas > Placa > Gestor de tarjetas > buscar "esp32"
 *     (de Espressif Systems) > Instalar.
 *
 *  2) Librerias
 *     Programa > Incluir libreria > Administrar bibliotecas...
 *       - "FirebaseClient" de Mobizt  (version 2.2 o mayor). Cuando pregunte
 *         si instala tambien ESP_SSLClient, elige "Install all".
 *       - "ArduinoJson" de Benoit Blanchon  (version 7 o mayor)
 *     Solo si vas a usar el DHT22 de verdad (USAR_DHT 1), instala tambien:
 *       - "DHT sensor library" de Adafruit
 *       - "Adafruit Unified Sensor" de Adafruit
 *     Solo si tienes pantalla (PANTALLA 1 o 2):
 *       - OLED (PANTALLA 1): "Adafruit SSD1306" de Adafruit. Cuando pregunte
 *         si instala tambien Adafruit GFX y BusIO, elige "Install all".
 *       - LCD 16x2 (PANTALLA 2): "LiquidCrystal I2C" de Frank de Brabander.
 *         Si avisa que es para otra arquitectura, compila igual.
 *     WiFi, WiFiClientSecure y Preferences ya vienen con el paquete ESP32:
 *     no se instalan.
 *
 *  3) Al compilar
 *     Herramientas > Placa > esp32 > "ESP32 Dev Module"
 *       (con un ESP32-S3: "ESP32S3 Dev Module". Si el Monitor Serie no
 *       muestra nada, pon "USB CDC On Boot" en "Enabled" o enchufa el
 *       cable en el otro USB de la placa)
 *     Herramientas > Partition Scheme > "Huge APP (3MB No OTA)" si dice
 *     que no entra en la memoria
 *     Herramientas > Puerto > el COM que aparezca al enchufar la placa
 *     Monitor Serie a 115200 baudios
 *
 *  Si la placa no es una DevKit generica, prueba con "DOIT ESP32 DEVKIT V1"
 *  o "NodeMCU-32S". Para una ESP32-C3, "ESP32C3 Dev Module".
 *
 *  Las tablas de ejemplo usan GPIO del ESP32 clasico: con un ESP32-S3,
 *  cambialos por los que declaraste en el portal. Si alguno no sirve en tu
 *  placa, el Monitor Serie lo dice al arrancar y queda sin usar.
 * ====================================================================
 */

/*
 * Nexus IoT — ESP32 o ESP32-S3 <-> Firebase Realtime Database, en tiempo real
 *
 * La placa entra a Firebase con el usuario y la contraseña del alumno (los
 * mismos del portal) y trabaja sobre su rama de la base:
 *
 *   /placas/<USUARIO>/estado    lo escribe la placa: entradas, salidas,
 *                               "visto" (latido) y "aviso"
 *   /placas/<USUARIO>/control   lo escriben la app y el portal:
 *                                 auto     true/false: modo automático
 *                                 reglas   {salida: {entrada, condicion, umbral, hist}}
 *                                 cmd      {salida: 1|0}  la placa lo aplica y lo BORRA
 *
 * La placa publica con un solo "update" sobre /placas/<USUARIO>, con rutas:
 * "estado/t", "estado/visto"... y "control/cmd/bomba": null para borrar los
 * comandos que ya aplicó. Así el cambio y el borrado viajan juntos.
 *
 * La placa escucha "control" con un stream: apenas alguien toca un botón en
 * la app, llega un evento. Ante CUALQUIER evento la placa vuelve a leer
 * "control" completo y lo procesa entero. Así no hay que interpretar las
 * rutas parciales que manda el stream, que es donde más se equivoca uno.
 *
 * Control local, sin app:
 *   - Un pulsador por salida (opcional) la prende o la apaga.
 *   - Un pulsador de modo o una llave selectora (opcionales) eligen el modo
 *     automático. La llave manda: con llave, el modo no se cambia desde la app.
 *   - En modo automático, las salidas que tienen regla las maneja la regla:
 *     se ignora todo lo manual (app, portal o pulsador) y se avisa.
 *   - Una pantalla (opcional) muestra el modo y si la placa está conectada.
 *
 * Todo sigue funcionando sin internet: lecturas, reglas y pulsadores. Al
 * volver la conexión, la placa publica cómo quedó todo.
 *
 * Las filas de las tablas son un EJEMPLO (DHT22 + bomba, ventilador y LED):
 * cámbialas por tu hardware, con los mismos ids que declaraste en el portal.
 */

#define ENABLE_USER_AUTH
#define ENABLE_DATABASE

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <FirebaseClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ===================================================================
//  1. CONFIGURACIÓN
// ===================================================================

const char *WIFI_SSID = "";           // tu red de 2.4 GHz (el ESP32 no ve las de 5 GHz)
const char *WIFI_PASS = "";

// API_KEY y DATABASE_URL son del proyecto: los mismos para toda la clase, y
// no son secretos. Los sacas del portal, en "Mis datos".
// USUARIO y CONTRASENA son los tuyos, los mismos con los que entras al portal.
const char *API_KEY      = "PEGA_ACA_LA_API_KEY";
const char *DATABASE_URL = "https://TUPROYECTO-default-rtdb.firebaseio.com";
const char *USUARIO      = "PEGA_ACA_TU_USUARIO";
const char *CONTRASENA   = "";

// Firebase pide un correo: se arma con el usuario y este dominio, que no
// existe ni recibe mails. No lo cambies.
#define DOMINIO "@nexus-iot.example.com"

// 0 = inventa los valores del DHT22, para probar sin cablear nada
#define USAR_DHT 0
#define PIN_DHT 4

// Pulsador que activa y desactiva el modo automático, entre el GPIO y GND.
// -1 si no hay.
const int PIN_PULSADOR_MODO = 25;

// O una llave selectora de dos posiciones, entre el GPIO y GND: cerrada =
// automático, abierta = manual. La llave manda: si cambian el modo desde la
// app o el portal, la placa vuelve a poner el de la llave y avisa. -1 si no
// hay. Va el pulsador o la llave, no los dos.
const int PIN_LLAVE_MODO = -1;

// Pantalla para ver el modo y la conexión, por I2C (SDA en GPIO 21, SCL en
// GPIO 22; en el ESP32-S3, SDA en 8 y SCL en 9): 0 = ninguna, 1 = OLED 0.96"
// (SSD1306), 2 = LCD 16x2 con módulo I2C.
#define PANTALLA 0

// Una salida no puede conmutar por una regla más seguido que esto. Junto con
// la histéresis, es lo que evita que un relé quede haciendo clic-clic y se queme.
const unsigned long MIN_ENTRE_CAMBIOS = 30000;   // 30 s

const unsigned long LEER_CADA   = 1000;    // leer entradas y evaluar reglas
const unsigned long LATIDO_CADA = 15000;   // publicar aunque nada cambie: "sigo viva"
const unsigned long ANTIRREBOTE = 50;      // ms que un pulsador tiene que quedarse quieto

#if USAR_DHT
  #include <DHT.h>
  DHT dht(PIN_DHT, DHT22);
#endif

#if PANTALLA
  #include <Wire.h>
  // Los pines I2C dependen del chip, que lo elige la placa con la que compilas.
  #if CONFIG_IDF_TARGET_ESP32S3
    const int PIN_SDA = 8, PIN_SCL = 9;
  #else
    const int PIN_SDA = 21, PIN_SCL = 22;
  #endif
#endif
#if PANTALLA == 1
  #include <Adafruit_SSD1306.h>
  Adafruit_SSD1306 oled(128, 64, &Wire, -1);
#elif PANTALLA == 2
  #include <LiquidCrystal_I2C.h>
  LiquidCrystal_I2C *lcd = nullptr;   // se crea al encontrar su dirección
#endif

// Los tipos van antes de cualquier función: el Arduino IDE agrega solo las
// declaraciones de las funciones arriba de la primera, y si los tipos
// estuvieran más abajo no compilaría.

enum Conexion { SIN_WIFI, CONECTANDO, EN_LINEA };   // lo que muestra la pantalla

struct Entrada {
  const char *id;
  float     (*leer)();
  float       valor;       // NAN hasta la primera lectura buena
  float       publicado;   // lo último que se mandó, para publicar solo si cambia
};

struct Pulsador {
  int           pin;           // -1 = no hay
  bool          estable;       // último estado firme (true = suelto)
  bool          lectura;       // última lectura cruda
  unsigned long cambio;        // cuándo cambió la lectura cruda
};

struct Salida {
  const char   *id;
  int           pin;
  int           nivelActivo;     // LOW o HIGH: el nivel que lo prende
  Pulsador      pulsador;        // pin -1 = sin pulsador
  bool          encendido;
  unsigned long ultimoCambio;    // para el tiempo mínimo entre conmutaciones
};

// ===================================================================
//  2. Entradas — una fila por entrada
// ===================================================================
//
// Una entrada es cualquier cosa que la placa mide o lee y manda como número:
// un sensor, un LDR, un botón (1/0). Cada una es un id y una función que
// devuelve su valor. Si la lectura falla, la función devuelve NAN y se
// conserva el valor anterior.

float leerTemperatura() {
#if USAR_DHT
  return dht.readTemperature();
#else
  return 22.0 + 4.0 * sin(millis() / 60000.0);
#endif
}

float leerHumedad() {
#if USAR_DHT
  return dht.readHumidity();
#else
  return 55.0 + 10.0 * cos(millis() / 60000.0 * 0.7);
#endif
}

// {id, función de lectura, NAN, NAN}
Entrada entradas[] = {
  { "t", leerTemperatura, NAN, NAN },
  { "h", leerHumedad,     NAN, NAN },
};

const int N_ENTRADAS = sizeof(entradas) / sizeof(entradas[0]);

// ===================================================================
//  3. Pulsadores
// ===================================================================
//
// Entre el GPIO y GND, con la resistencia interna (INPUT_PULLUP): suelto lee
// HIGH, apretado lee LOW. En el ESP32 no sirven los GPIO 34 a 39, que no
// tienen resistencia interna; en el ESP32-S3 la tienen todos.
//
// El antirrebote es obligatorio: al apretar, el contacto rebota varias veces
// en pocos milisegundos y sin esto un solo toque prende y apaga.
//
// La llave selectora se cablea y se lee igual, pero lo que cuenta es su
// posición y no el momento de apretar.

void iniciarPulsador(Pulsador &p) {
  if (p.pin < 0) return;
  pinMode(p.pin, INPUT_PULLUP);
  p.estable = p.lectura = digitalRead(p.pin);
  p.cambio  = millis();
}

// true una vez cada vez que la lectura cambia y se queda quieta: al apretar
// o soltar un pulsador, o al girar una llave.
bool cambioFirme(Pulsador &p) {
  if (p.pin < 0) return false;
  bool ahora = digitalRead(p.pin);
  if (ahora != p.lectura) { p.lectura = ahora; p.cambio = millis(); }
  if (millis() - p.cambio >= ANTIRREBOTE && p.lectura != p.estable) {
    p.estable = p.lectura;
    return true;
  }
  return false;
}

// true una sola vez por pulsación, en el momento de apretar.
bool seApreto(Pulsador &p) {
  return cambioFirme(p) && p.estable == LOW;
}

Pulsador pulsadorModo = { PIN_PULSADOR_MODO, true, true, 0 };
Pulsador llaveModo    = { PIN_LLAVE_MODO,    true, true, 0 };

// Cerrada (LOW) es automático. Con un cable suelto queda abierta: manual.
bool llaveEnAuto() { return llaveModo.estable == LOW; }

// ===================================================================
//  4. Salidas — una fila por salida
// ===================================================================
//
// Una salida es cualquier cosa que se prende y se apaga: un relé, un LED, un
// buzzer. Viaja como 1 o 0.
//
// GPIO 26, 27 y 25 son salidas "limpias": no hacen nada raro durante el
// arranque. Evita 0, 12, 14 y 15: emiten pulsos al encender la placa y un
// relé haría un clic en cada reinicio. 6 a 11 son de la flash interna y 34 a
// 39 solo sirven para entradas.
//
// Con un ESP32-S3 los GPIO cambian, y este ejemplo no sirve tal cual: no
// tiene del 22 al 25, y del 26 al 32 son de su flash. Al arrancar, la placa
// revisa los pines (gpioNoSirve, más abajo) y deja sin usar el que no sirve.
// En el S3 el LED de la placa no está en el GPIO 2: es uno de colores, en el
// 48 o en el 38.
//
// La mayoría de los módulos de relé se activan con LOW; un LED, con HIGH.
// Por eso el nivel va por fila y no es una constante global.
//
// {id, pin, nivel activo, {GPIO del pulsador o -1, true, true, 0}, false, 0}
Salida salidas[] = {
  { "bomba", 26, LOW,  { 32, true, true, 0 }, false, 0 },   // IN1 del módulo de relés
  { "vent",  27, LOW,  { 33, true, true, 0 }, false, 0 },   // IN2 del módulo de relés
  { "luz",    2, HIGH, { -1, true, true, 0 }, false, 0 },   // LED integrado de la placa
};

const int N_SALIDAS = sizeof(salidas) / sizeof(salidas[0]);

// ===================================================================
//  5. Reglas del modo automático
// ===================================================================
//
// Llegan en control/reglas, una por salida como mucho. La lista reemplaza
// completa a la anterior. Se guardan en la flash para seguir regulando sin red.
// Solo se aplican con el modo automático activado.
//
//   condicion ">"  prende si entrada > umbral,  apaga si entrada < umbral - hist
//   condicion "<"  prende si entrada < umbral,  apaga si entrada > umbral + hist

const int MAX_REGLAS = 10;

struct Regla {
  char  salida[16];
  char  entrada[16];
  char  condicion;               // '>' o '<'
  float umbral;
  float hist;
};

Regla reglas[MAX_REGLAS];
int   nReglas = 0;
bool  modoAuto = false;

// ===================================================================
//  6. Firebase
// ===================================================================

// Dos conexiones: una queda abierta escuchando "control" (el stream) y la
// otra es para leer y escribir. El stream no se puede usar para otra cosa.
WiFiClientSecure ssl, sslStream;
AsyncClientClass cliente(ssl), clienteStream(sslStream);

UserAuth    usuarioAuth(API_KEY, String(USUARIO) + DOMINIO, CONTRASENA, 3000);
FirebaseApp app;
RealtimeDatabase Database;

const String RAIZ = String("/placas/") + USUARIO;

void alResultado(AsyncResult &r);   // más abajo: ahí llegan todas las respuestas

Preferences memoria;

// Lo que pasó y todavía no se mandó. El loop lo resuelve cuando hay conexión.
bool   pedirControl     = false;   // llegó un evento del stream
bool   publicarPendiente = true;   // cambió algún valor
bool   hayUrgente       = true;    // cambió una salida: publicar ya, sin esperar
bool   modoLocal        = false;   // el pulsador o la llave cambiaron el modo y falta avisarle a Firebase
bool   enviandoModo     = false;
bool   modoEnviado      = false;   // lo que se mandó: si el modo cambió mientras viajaba, se manda de nuevo
String avisoTexto       = "";      // último aviso, para verlo en el portal
bool   avisoPendiente   = false;
unsigned long avisoEn   = 0;
unsigned long ultimaPublicacion = 0;
unsigned long ultimaLectura     = 0;
bool   estabaLista      = false;
String reglasGuardadas  = "{}";    // el JSON tal como llegó: se compara para no escribir la flash de más
JsonDocument cmdPorBorrar;         // comandos ya procesados: se borran en la próxima publicación
bool   releer           = false;   // falló leer control o borrar un comando: se reintenta
unsigned long releerDesde = 0;

// Para ver en el monitor serie cuánto tarda un comando del portal o la app.
unsigned long eventoEn    = 0;     // cuándo avisó el stream; 0 = no hay aviso esperando
unsigned long comandoEn   = 0;     // el aviso del último comando, para medir el borrado
size_t        colaAlPedir = 0;     // pedidos que había delante de la lectura de control

// ===================================================================
//  7. Buscar por id
// ===================================================================

Entrada *buscarEntrada(const char *id) {
  for (int i = 0; i < N_ENTRADAS; i++)
    if (strcmp(entradas[i].id, id) == 0) return &entradas[i];
  return nullptr;
}

Salida *buscarSalida(const char *id) {
  for (int i = 0; i < N_SALIDAS; i++)
    if (strcmp(salidas[i].id, id) == 0) return &salidas[i];
  return nullptr;
}

bool tieneRegla(const char *salida) {
  for (int i = 0; i < nReglas; i++)
    if (strcmp(reglas[i].salida, salida) == 0) return true;
  return false;
}

// La app Kodular puede guardar los valores como número, como booleano o como
// texto ("1", "true", incluso con comillas: "\"1\""). Todo eso significa lo mismo.
bool aBool(JsonVariantConst v, bool &resultado) {
  if (v.is<bool>())  { resultado = v.as<bool>(); return true; }
  if (v.is<int>())   { resultado = v.as<int>() == 1; return true; }
  if (v.is<const char *>()) {
    String s = v.as<const char *>();
    s.replace("\"", "");
    s.trim();
    s.toLowerCase();
    if (s == "1" || s == "true"  || s == "on")  { resultado = true;  return true; }
    if (s == "0" || s == "false" || s == "off") { resultado = false; return true; }
  }
  return false;
}

void avisar(const String &texto) {
  Serial.printf("[aviso] %s\n", texto.c_str());
  avisoTexto        = texto;
  avisoPendiente    = true;
  avisoEn           = millis();
  publicarPendiente = true;
}

// ===================================================================
//  8. Salidas: escribir, guardar y aplicar
// ===================================================================

void escribirPin(const Salida &s) {
  if (s.pin < 0) return;   // su GPIO no servía (ver revisarPines)
  digitalWrite(s.pin, s.encendido ? s.nivelActivo : !s.nivelActivo);
}

// Sobrevive a un corte de luz: al arrancar se restaura cómo estaba cada salida.
void guardarSalidas() {
  memoria.begin("salidas", false);
  for (int i = 0; i < N_SALIDAS; i++)
    memoria.putBool(salidas[i].id, salidas[i].encendido);
  memoria.end();
}

void aplicarSalida(Salida &s, bool encender) {
  if (s.encendido == encender) return;
  s.encendido    = encender;
  s.ultimoCambio = millis();
  escribirPin(s);
  Serial.printf("[salida] %s = %s\n", s.id, encender ? "ON" : "OFF");
  guardarSalidas();
  publicarPendiente = true;
  hayUrgente        = true;
}

// Lo manual (app, portal o pulsador). En modo automático, una salida con
// regla no se toca a mano: se avisa y no se hace nada.
void aplicarManual(Salida &s, bool encender, const char *origen) {
  if (modoAuto && tieneRegla(s.id)) {
    avisar(String(s.id) + ": " + origen + " ignorado, esta en modo automatico");
    return;
  }
  aplicarSalida(s, encender);
}

// ===================================================================
//  9. Modo automático y reglas
// ===================================================================

void fijarModo(bool activar) {
  if (modoAuto == activar) return;
  modoAuto = activar;
  memoria.begin("control", false);
  memoria.putBool("auto", modoAuto);
  memoria.end();
  Serial.printf("[modo] automatico %s\n", modoAuto ? "ACTIVADO" : "DESACTIVADO");
}

void cargarReglas(JsonObjectConst lista) {
  nReglas = 0;
  for (JsonPairConst par : lista) {
    if (nReglas >= MAX_REGLAS) break;
    JsonObjectConst r = par.value();

    const char *entrada   = r["entrada"]   | "";
    const char *condicion = r["condicion"] | "";
    if (!*entrada || (condicion[0] != '>' && condicion[0] != '<')) continue;

    Regla &g = reglas[nReglas++];
    strlcpy(g.salida,  par.key().c_str(), sizeof(g.salida));
    strlcpy(g.entrada, entrada,           sizeof(g.entrada));
    g.condicion = condicion[0];
    g.umbral    = r["umbral"] | 0.0f;
    g.hist      = r["hist"]   | 1.0f;
  }
}

void conmutarPorRegla(Salida &s, bool encender) {
  // El tiempo mínimo corta el ciclado rápido que la histéresis no alcance a
  // filtrar. ultimoCambio en 0 significa que todavía no conmutó nunca.
  if (s.ultimoCambio != 0 && millis() - s.ultimoCambio < MIN_ENTRE_CAMBIOS) return;
  Serial.printf("[regla] %s -> %s\n", s.id, encender ? "ON" : "OFF");
  aplicarSalida(s, encender);
}

void evaluarReglas() {
  if (!modoAuto) return;
  for (int i = 0; i < nReglas; i++) {
    const Regla &g = reglas[i];
    Entrada *e = buscarEntrada(g.entrada);
    Salida  *s = buscarSalida(g.salida);

    // La placa no tiene esa entrada o esa salida, o la entrada todavía no
    // leyó nada: la regla no se aplica.
    if (!e || !s || isnan(e->valor)) continue;

    // La histéresis evita el chattering: se prende al cruzar el umbral, pero
    // para apagar hay que volver "hist" más atrás. Sin esto, con el valor
    // oscilando justo en el umbral, la salida conmuta en cada lectura.
    bool prender, apagar;
    if (g.condicion == '>') {
      prender = e->valor > g.umbral;
      apagar  = e->valor < g.umbral - g.hist;
    } else {
      prender = e->valor < g.umbral;
      apagar  = e->valor > g.umbral + g.hist;
    }

    if (!s->encendido && prender)     conmutarPorRegla(*s, true);
    else if (s->encendido && apagar)  conmutarPorRegla(*s, false);
  }
}

// ===================================================================
//  10. Lo que llega de Firebase
// ===================================================================

// "control" completo, tal como está en la base. Puede venir "null" si todavía
// no hay nada.
void procesarControl(const char *json) {
  JsonDocument doc;
  if (deserializeJson(doc, json)) {
    Serial.printf("[control] no se pudo leer: %s\n", json);
    return;
  }

  // 1. El modo. Si el pulsador o la llave lo cambiaron y todavía no se avisó
  //    a Firebase, manda la placa: lo que hay en la base es viejo.
  bool nuevoModo;
  bool llegoModo = aBool(doc["auto"], nuevoModo);
  if (llaveModo.pin >= 0) {
    // Con llave, el modo lo elige la llave. Si en la base dice otra cosa (lo
    // cambiaron desde la app), se vuelve a escribir la posición de la llave.
    if (!modoLocal && (!llegoModo || nuevoModo != modoAuto)) {
      if (llegoModo) avisar("modo: lo elige la llave de la placa");
      modoLocal = true;
    }
  } else if (!modoLocal && llegoModo) {
    fijarModo(nuevoModo);
  }

  // 2. Las reglas: la lista reemplaza completa a la anterior. Solo se toca
  //    la flash si cambiaron.
  String nuevas;
  serializeJson(doc["reglas"], nuevas);
  if (nuevas == "null") nuevas = "{}";   // sin reglas
  if (nuevas != reglasGuardadas) {
    cargarReglas(doc["reglas"].as<JsonObjectConst>());
    memoria.begin("reglas", false);
    memoria.putString("json", nuevas);
    memoria.end();
    reglasGuardadas = nuevas;
    Serial.printf("[reglas] %d: %s\n", nReglas, nuevas.c_str());
  }

  // 3. Los comandos, después del modo: si en la app apagaron el automático y
  //    enseguida prendieron algo, el comando ya encuentra el modo manual.
  //    Cada uno se BORRA de la base, se haya aplicado o no: el borrado va en
  //    la publicación que sale enseguida, junto con el estado nuevo.
  bool habiaCmd = false;
  for (JsonPairConst par : doc["cmd"].as<JsonObjectConst>()) {
    habiaCmd = true;
    const char *id = par.key().c_str();
    bool encender;
    Salida *s = buscarSalida(id);
    if (!s)                                 avisar(String("la placa no tiene la salida ") + id);
    else if (!aBool(par.value(), encender)) avisar(String(id) + ": valor de comando invalido");
    else                                    aplicarManual(*s, encender, "comando");
    cmdPorBorrar[String(id)] = true;
    publicarPendiente = hayUrgente = true;
  }
  if (habiaCmd && eventoEn) {
    Serial.printf("[cmd] leido a los %lu ms del aviso (%u pedidos delante en la cola)\n",
                  millis() - eventoEn, (unsigned)colaAlPedir);
    comandoEn = eventoEn;
  }
  eventoEn = 0;

  evaluarReglas();   // por si se acaba de activar el modo o cambió una regla
}

// Todos los resultados de Firebase pasan por acá. Cada pedido lleva un nombre
// (el último parámetro) para saber de cuál es la respuesta.
void alResultado(AsyncResult &r) {
  // Así avisa la librería que abre una conexión nueva: cada una tarda 1 a 3 s
  // en el ESP32. Con la placa ya conectada no debería pasar seguido.
  if (r.isDebug() && r.debug().startsWith("Connecting"))
    Serial.printf("[firebase] %s: conexion nueva con el servidor\n", r.uid().c_str());

  if (r.isError()) {
    Serial.printf("[firebase] %s: %s (codigo %d)\n", r.uid().c_str(), r.error().message().c_str(), r.error().code());
    if (r.uid() == "entrar")
      Serial.println("   Revisa USUARIO y CONTRASENA: son los mismos con los que entras al portal.");
    if (r.uid() == "modo") enviandoModo = false;
    // Si no se leyó control o no se borró un comando, el portal se quedaría
    // "esperando a la placa…": se vuelve a leer control en un rato.
    if (r.uid() == "control" || r.uid() == "publicar_cmd") {
      releer      = true;
      releerDesde = millis();
    }
    return;
  }
  if (!r.available()) return;

  if (r.uid() == "stream") {
    // No importa qué cambió: se vuelve a leer "control" entero.
    if (!eventoEn) eventoEn = millis();
    pedirControl = true;
  } else if (r.uid() == "control") {
    procesarControl(r.c_str());
  } else if (r.uid() == "publicar_cmd") {
    Serial.printf("[cmd] borrado a los %lu ms del aviso\n", millis() - comandoEn);
  } else if (r.uid() == "modo") {
    enviandoModo = false;
    // Si el modo volvió a cambiar mientras viajaba, sigue pendiente.
    if (modoEnviado == modoAuto) modoLocal = false;
  }
}

// ===================================================================
//  11. Lo que se manda a Firebase
// ===================================================================

void publicar() {
  // El JSON se arma con ArduinoJson y no concatenando strings: una coma de
  // menos arma un JSON inválido que Firebase rechaza.
  //
  // Va sobre la raíz de la placa, con rutas ("estado/t", "control/cmd/bomba"),
  // para borrar los comandos en el mismo viaje. Es todo o nada: si una ruta
  // no pasa las reglas de la base, no se escribe ninguna.
  JsonDocument doc;
  for (int i = 0; i < N_ENTRADAS; i++) {
    // Una entrada que todavía no leyó nada no se manda: el portal la muestra "sin dato".
    if (isnan(entradas[i].valor)) continue;
    doc[String("estado/") + entradas[i].id] = round(entradas[i].valor * 10) / 10.0;
    entradas[i].publicado = entradas[i].valor;
  }
  for (int i = 0; i < N_SALIDAS; i++)
    doc[String("estado/") + salidas[i].id] = salidas[i].encendido ? 1 : 0;
  doc["estado/visto"][".sv"] = "timestamp";   // la hora la pone el servidor
  if (avisoPendiente) doc["estado/aviso"] = avisoTexto;

  bool conCmd = false;
  for (JsonPairConst par : cmdPorBorrar.as<JsonObjectConst>()) {
    doc[String("control/cmd/") + par.key().c_str()] = nullptr;   // null = borrar
    conCmd = true;
  }
  cmdPorBorrar.clear();

  String cuerpo;
  serializeJson(doc, cuerpo);
  Database.update(cliente, RAIZ, object_t(cuerpo), alResultado, conCmd ? "publicar_cmd" : "publicar");

  avisoPendiente    = false;
  publicarPendiente = false;
  hayUrgente        = false;
  ultimaPublicacion = millis();
}

// ===================================================================
//  12. Entradas
// ===================================================================

void leerEntradas() {
  for (int i = 0; i < N_ENTRADAS; i++) {
    float v = entradas[i].leer();
    if (isnan(v)) continue;   // lectura inválida: se conserva la anterior
    entradas[i].valor = v;
    // Se publica si cambió al menos una décima: con más resolución, el
    // ruido del sensor haría publicar cada segundo.
    if (isnan(entradas[i].publicado) || fabs(v - entradas[i].publicado) >= 0.1)
      publicarPendiente = true;
  }
}

// ===================================================================
//  13. WiFi
// ===================================================================

// Nunca espera indefinidamente. Si esperara hasta conectar, con el router
// apagado la placa quedaría trabada acá y las reglas y los pulsadores
// dejarían de funcionar, que es justo lo que tienen que seguir haciendo sin red.
void conectarWiFi() {
  Serial.printf("[wifi] conectando a %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  // Sin el ahorro de energía: con él, la radio duerme entre los avisos del
  // router y cada paquete que llega puede esperar cientos de ms. Un comando
  // del portal son varios viajes y se nota. Gasta un poco más (nada, con USB).
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) { delay(500); Serial.print("."); }

  // La señal: de -30 a -67 dBm, bien; por debajo de -75, la placa está lejos del router.
  if (WiFi.status() == WL_CONNECTED)
    Serial.printf("\n[wifi] listo, IP %s, senal %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  else
    Serial.println("\n[wifi] sin conexion por ahora: reglas y pulsadores siguen funcionando");
}

unsigned long ultimoIntentoWiFi = 0;

// ===================================================================
//  14. Pantalla (opcional)
// ===================================================================
//
// Muestra el modo y si la placa está conectada. Va por I2C: SDA en GPIO 21 y
// SCL en GPIO 22 (en el ESP32-S3, 8 y 9). La dirección cambia según el
// módulo, así que la busca sola.
// Si no la encuentra, la placa sigue andando igual, sin pantalla.

bool hayPantalla      = false;
int  pantallaModo     = -1;   // lo que muestra ahora, para redibujar solo si cambia
int  pantallaConexion = -1;

#if PANTALLA
// true si algo contesta en esa dirección del bus I2C
bool responde(uint8_t direccion) {
  Wire.beginTransmission(direccion);
  return Wire.endTransmission() == 0;
}
#endif

void iniciarPantalla() {
#if PANTALLA
  Wire.begin(PIN_SDA, PIN_SCL);
  #if PANTALLA == 1
    uint8_t dir = responde(0x3C) ? 0x3C : responde(0x3D) ? 0x3D : 0;
    hayPantalla = dir && oled.begin(SSD1306_SWITCHCAPVCC, dir);
  #else
    uint8_t dir = responde(0x27) ? 0x27 : responde(0x3F) ? 0x3F : 0;
    if (dir) {
      lcd = new LiquidCrystal_I2C(dir, 16, 2);
      lcd->init();
      lcd->backlight();
      hayPantalla = true;
    }
  #endif
  if (hayPantalla) Serial.printf("[pantalla] lista, direccion 0x%02X\n", dir);
  else Serial.printf("[pantalla] no responde: revisa SDA (GPIO %d), SCL (GPIO %d) y la alimentacion. Sigo sin pantalla\n",
                     PIN_SDA, PIN_SCL);
#endif
}

// Sin tildes: la LCD no las tiene. Solo redibuja si algo cambió: escribir la
// pantalla tarda, y una LCD que se borra a cada rato parpadea.
void mostrarPantalla(Conexion conexion) {
#if PANTALLA
  if (!hayPantalla || (pantallaModo == modoAuto && pantallaConexion == conexion)) return;
  pantallaModo     = modoAuto;
  pantallaConexion = conexion;
  const char *texto = conexion == EN_LINEA ? "En linea" : conexion == CONECTANDO ? "Conectando..." : "Sin WiFi";
  #if PANTALLA == 1
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(1);
    oled.setCursor(0, 0);
    oled.print("Modo");
    oled.setTextSize(2);   // 12 px por letra: "AUTOMATICO" entra justo en 128
    oled.setCursor(0, 16);
    oled.print(modoAuto ? "AUTOMATICO" : "MANUAL");
    oled.setTextSize(1);
    oled.setCursor(0, 52);
    oled.print(texto);
    oled.display();
  #else
    // Cada renglón se rellena hasta 16 letras: tapa lo anterior sin borrar.
    lcd->setCursor(0, 0);
    lcd->printf("%-16s", modoAuto ? "Modo: AUTOMATICO" : "Modo: MANUAL");
    lcd->setCursor(0, 1);
    lcd->printf("%-16s", texto);
  #endif
#endif
}

// ===================================================================
//  15. setup / loop
// ===================================================================

// El ESP32 y el ESP32-S3 no tienen los mismos GPIO, y configurar uno que es
// de la memoria cuelga la placa: se reinicia sin parar y no se entiende por
// qué. Por eso, antes de usarlos, se revisan los pines de las tablas. El chip
// es el de la placa que elegiste al compilar. El portal controla lo mismo
// (CHIPS en validar.js).
const char *gpioNoSirve(int pin) {
#if CONFIG_IDF_TARGET_ESP32S3
  if (pin > 48 || (pin >= 22 && pin <= 25)) return "no existe en el ESP32-S3";
  if (pin >= 26 && pin <= 32) return "es de la memoria flash";
  if (pin >= 35 && pin <= 37) return "es de la memoria PSRAM (en las placas N8R8 y N16R8)";
  if (pin == 19 || pin == 20) return "es del USB";
  if (pin == 45 || pin == 46) return "decide como arranca la placa";
#else
  if (pin > 39 || pin == 20 || pin == 24 || (pin >= 28 && pin <= 31)) return "no existe en el ESP32";
  if (pin >= 6 && pin <= 11) return "es de la memoria flash";
  if (pin >= 34) return "solo sirve de entrada, sin resistencia interna";
#endif
  return nullptr;
}

// Si el GPIO no sirve, lo deja en -1 (sin usar) y lo dice por el monitor.
void revisarPin(int &pin, const String &que) {
  const char *motivo = pin >= 0 ? gpioNoSirve(pin) : nullptr;
  if (!motivo) return;
  Serial.printf("[error] %s: GPIO %d %s. Queda sin usar: cambialo en el sketch y en el portal\n",
                que.c_str(), pin, motivo);
  pin = -1;
}

void revisarPines() {
  for (int i = 0; i < N_SALIDAS; i++) {
    revisarPin(salidas[i].pin, String("salida ") + salidas[i].id);
    revisarPin(salidas[i].pulsador.pin, String("pulsador de ") + salidas[i].id);
  }
  revisarPin(pulsadorModo.pin, "pulsador de modo");
  revisarPin(llaveModo.pin, "llave de modo");
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n== Nexus IoT ==");
  revisarPines();

  // Restaurar cómo estaba cada salida antes del último apagón
  memoria.begin("salidas", true);
  for (int i = 0; i < N_SALIDAS; i++) {
    if (salidas[i].pin >= 0) pinMode(salidas[i].pin, OUTPUT);
    salidas[i].encendido = memoria.getBool(salidas[i].id, false);
    escribirPin(salidas[i]);
    iniciarPulsador(salidas[i].pulsador);
    Serial.printf("[flash] %s = %d\n", salidas[i].id, salidas[i].encendido);
  }
  memoria.end();
  iniciarPulsador(pulsadorModo);
  iniciarPulsador(llaveModo);

  // Y el modo y las últimas reglas, para regular aunque arranque sin red
  memoria.begin("control", true);
  modoAuto = memoria.getBool("auto", false);
  memoria.end();
  memoria.begin("reglas", true);
  reglasGuardadas = memoria.getString("json", "{}");
  memoria.end();

  // Con llave, el modo es el de la llave, y se escribe en Firebase apenas se pueda.
  if (llaveModo.pin >= 0) {
    fijarModo(llaveEnAuto());
    modoLocal = true;
  }

  JsonDocument guardadas;
  if (!deserializeJson(guardadas, reglasGuardadas)) cargarReglas(guardadas.as<JsonObjectConst>());
  Serial.printf("[flash] modo automatico %s%s, %d reglas\n", modoAuto ? "activado" : "desactivado",
                llaveModo.pin >= 0 ? " (lo da la llave)" : "", nReglas);

#if USAR_DHT
  dht.begin();
#else
  Serial.println("[info] modo simulado: valores del DHT22 inventados");
#endif

  iniciarPantalla();
  mostrarPantalla(CONECTANDO);
  conectarWiFi();

  // Sin validar el certificado: lo que autentica es el usuario y la
  // contraseña. Validarlo de verdad obliga a fijar el certificado raíz y a
  // sincronizar la hora por NTP, dos cosas más que se rompen solas.
  ssl.setInsecure();
  sslStream.setInsecure();

  initializeApp(cliente, app, getAuth(usuarioAuth), alResultado, "entrar");
  app.getApp<RealtimeDatabase>(Database);
  Database.url(DATABASE_URL);

  // El stream se reconecta solo si se corta. Si arranca antes de que la
  // placa termine de entrar, da un error de permisos y reintenta: es normal.
  clienteStream.setSSEFilters("get,put,patch,cancel,auth_revoked");
  Database.get(clienteStream, RAIZ + "/control", alResultado, true /* stream */, "stream");

  leerEntradas();
}

void loop() {
  // Nada de delay(): el loop tiene que quedar libre para los pulsadores.

  // Pulsadores: en cada vuelta, con o sin internet
  for (int i = 0; i < N_SALIDAS; i++) {
    if (seApreto(salidas[i].pulsador))
      aplicarManual(salidas[i], !salidas[i].encendido, "pulsador");
  }
  if (seApreto(pulsadorModo)) {
    fijarModo(!modoAuto);
    modoLocal = true;           // avisarle a Firebase apenas se pueda
    publicarPendiente = true;
    evaluarReglas();
  }
  if (cambioFirme(llaveModo)) {
    fijarModo(llaveEnAuto());
    modoLocal = true;
    publicarPendiente = true;
    evaluarReglas();
  }

  // Entradas y reglas, una vez por segundo
  if (millis() - ultimaLectura >= LEER_CADA) {
    ultimaLectura = millis();
    leerEntradas();
    evaluarReglas();
    // El aviso se borra solo a los 20 s, para que el portal no lo muestre para siempre.
    if (avisoTexto.length() && millis() - avisoEn > 20000) {
      avisoTexto = "";
      avisoPendiente = true;
      publicarPendiente = true;
    }
  }

  // La pantalla también sin internet: justo ahí sirve para saber que no hay.
  mostrarPantalla(WiFi.status() != WL_CONNECTED ? SIN_WIFI : app.ready() ? EN_LINEA : CONECTANDO);

  if (WiFi.status() != WL_CONNECTED) {
    estabaLista = false;
    if (millis() - ultimoIntentoWiFi >= 10000) {
      ultimoIntentoWiFi = millis();
      Serial.println("[wifi] sin conexion, reintentando (reglas y pulsadores siguen funcionando)");
      WiFi.reconnect();
    }
    return;
  }

  app.loop();   // mantiene la sesión, el stream y los pedidos en curso
  if (!app.ready()) return;

  // Recién conectada (o reconectada): publicar cómo quedó todo
  if (!estabaLista) {
    estabaLista = true;
    publicarPendiente = hayUrgente = true;
    Serial.println("[firebase] conectada");
  }

  if (modoLocal && !enviandoModo) {
    enviandoModo = true;
    modoEnviado  = modoAuto;
    Database.set<bool>(cliente, RAIZ + "/control/auto", modoAuto, alResultado, "modo");
  }

  if (releer && millis() - releerDesde >= 2000) {
    releer       = false;
    pedirControl = true;
  }

  if (pedirControl) {
    pedirControl = false;
    colaAlPedir  = cliente.taskCount();
    Database.get(cliente, RAIZ + "/control", alResultado, false, "control");
  }

  // Una salida que cambió se publica ya; un valor que cambió, a lo sumo una
  // vez por segundo; y aunque nada cambie, un latido cada 15 s.
  unsigned long desde = millis() - ultimaPublicacion;
  if ((publicarPendiente && (hayUrgente || desde >= 1000)) || desde >= LATIDO_CADA)
    publicar();
}
