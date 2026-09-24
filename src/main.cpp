/*
 * Nexus IoT — ESP32 <-> Firebase Realtime Database, en tiempo real
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
 * La placa escucha "control" con un stream: apenas alguien toca un botón en
 * la app, llega un evento. Ante CUALQUIER evento la placa vuelve a leer
 * "control" completo y lo procesa entero. Así no hay que interpretar las
 * rutas parciales que manda el stream, que es donde más se equivoca uno.
 *
 * Control local, sin app:
 *   - Un pulsador por salida (opcional) la prende o la apaga.
 *   - Un pulsador de modo (opcional) activa o desactiva el modo automático.
 *   - En modo automático, las salidas que tienen regla las maneja la regla:
 *     se ignora todo lo manual (app, portal o pulsador) y se avisa.
 *
 * Todo sigue funcionando sin internet: lecturas, reglas y pulsadores. Al
 * volver la conexión, la placa publica cómo quedó todo.
 *
 * Las filas de las tablas son un EJEMPLO (DHT22 + bomba, ventilador y LED):
 * cambialas por tu hardware, con los mismos ids que declaraste en el portal.
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

const char *WIFI_SSID = "HS";           // tu red de 2.4 GHz (el ESP32 no ve las de 5 GHz)
const char *WIFI_PASS = "hannita1610";

// API_KEY y DATABASE_URL son del proyecto: los mismos para toda la clase, y
// no son secretos. Los sacás del portal, en "Mis datos".
// USUARIO y CONTRASENA son los tuyos, los mismos con los que entrás al portal.
const char *API_KEY      = "AIzaSyB1nBPyHbGdL4YO2WHod0LS6Kk9i0a_Q3s";
const char *DATABASE_URL = "https://nexus-iot-b0c95-default-rtdb.firebaseio.com";
const char *USUARIO      = "iot2026-chris";
const char *CONTRASENA   = "12345678";

// Firebase pide un correo: se arma con el usuario y este dominio, que no
// existe ni recibe mails. No lo cambies.
#define DOMINIO "@nexus-iot.example.com"

// 0 = inventa los valores del DHT22, para probar sin cablear nada
#define USAR_DHT 1
#define PIN_DHT 4

// Pulsador que activa y desactiva el modo automático, entre el GPIO y GND.
// -1 si no hay.
const int PIN_PULSADOR_MODO = 25;

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

// Los tipos van antes de cualquier función: el Arduino IDE agrega solo las
// declaraciones de las funciones arriba de la primera, y si los tipos
// estuvieran más abajo no compilaría.

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
// HIGH, apretado lee LOW. No sirven los GPIO 34 a 39, que no tienen
// resistencia interna.
//
// El antirrebote es obligatorio: al apretar, el contacto rebota varias veces
// en pocos milisegundos y sin esto un solo toque prende y apaga.

void iniciarPulsador(Pulsador &p) {
  if (p.pin < 0) return;
  pinMode(p.pin, INPUT_PULLUP);
  p.estable = p.lectura = digitalRead(p.pin);
  p.cambio  = millis();
}

// true una sola vez por pulsación, en el momento de apretar.
bool seApreto(Pulsador &p) {
  if (p.pin < 0) return false;
  bool ahora = digitalRead(p.pin);
  if (ahora != p.lectura) { p.lectura = ahora; p.cambio = millis(); }
  if (millis() - p.cambio >= ANTIRREBOTE && p.lectura != p.estable) {
    p.estable = p.lectura;
    return p.estable == LOW;
  }
  return false;
}

Pulsador pulsadorModo = { PIN_PULSADOR_MODO, true, true, 0 };

// ===================================================================
//  4. Salidas — una fila por salida
// ===================================================================
//
// Una salida es cualquier cosa que se prende y se apaga: un relé, un LED, un
// buzzer. Viaja como 1 o 0.
//
// GPIO 26, 27 y 25 son salidas "limpias": no hacen nada raro durante el
// arranque. Evitá 0, 12, 14 y 15: emiten pulsos al encender la placa y un
// relé haría un clic en cada reinicio. 6 a 11 son de la flash interna y 34 a
// 39 solo sirven para entradas.
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
bool   modoLocal        = false;   // el pulsador cambió el modo y falta avisarle a Firebase
bool   enviandoModo     = false;
String avisoTexto       = "";      // último aviso, para verlo en el portal
bool   avisoPendiente   = false;
unsigned long avisoEn   = 0;
unsigned long ultimaPublicacion = 0;
unsigned long ultimaLectura     = 0;
bool   estabaLista      = false;
String reglasGuardadas  = "{}";    // el JSON tal como llegó: se compara para no escribir la flash de más

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

  // 1. El modo. Si el pulsador lo cambió y todavía no se avisó a Firebase,
  //    manda el pulsador: lo que hay en la base es viejo.
  bool nuevoModo;
  if (!modoLocal && aBool(doc["auto"], nuevoModo)) fijarModo(nuevoModo);

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
  //    Cada uno se BORRA de la base al procesarlo, se haya aplicado o no.
  for (JsonPairConst par : doc["cmd"].as<JsonObjectConst>()) {
    const char *id = par.key().c_str();
    bool encender;
    Salida *s = buscarSalida(id);
    if (!s)                                 avisar(String("la placa no tiene la salida ") + id);
    else if (!aBool(par.value(), encender)) avisar(String(id) + ": valor de comando invalido");
    else                                    aplicarManual(*s, encender, "comando");
    Database.remove(cliente, RAIZ + "/control/cmd/" + id, alResultado, "borrar_cmd");
  }

  evaluarReglas();   // por si se acaba de activar el modo o cambió una regla
}

// Todos los resultados de Firebase pasan por acá. Cada pedido lleva un nombre
// (el último parámetro) para saber de cuál es la respuesta.
void alResultado(AsyncResult &r) {
  if (r.isError()) {
    Serial.printf("[firebase] %s: %s (codigo %d)\n", r.uid().c_str(), r.error().message().c_str(), r.error().code());
    if (r.uid() == "entrar")
      Serial.println("   Revisa USUARIO y CONTRASENA: son los mismos con los que entras al portal.");
    if (r.uid() == "modo") enviandoModo = false;
    return;
  }
  if (!r.available()) return;

  if (r.uid() == "stream") {
    // No importa qué cambió: se vuelve a leer "control" entero.
    pedirControl = true;
  } else if (r.uid() == "control") {
    procesarControl(r.c_str());
  } else if (r.uid() == "modo") {
    enviandoModo = false;
    modoLocal    = false;
  }
}

// ===================================================================
//  11. Lo que se manda a Firebase
// ===================================================================

void publicar() {
  // El JSON se arma con ArduinoJson y no concatenando strings: una coma de
  // menos arma un JSON inválido que Firebase rechaza.
  JsonDocument doc;
  for (int i = 0; i < N_ENTRADAS; i++) {
    // Una entrada que todavía no leyó nada no se manda: el portal la muestra "sin dato".
    if (isnan(entradas[i].valor)) continue;
    doc[entradas[i].id] = round(entradas[i].valor * 10) / 10.0;
    entradas[i].publicado = entradas[i].valor;
  }
  for (int i = 0; i < N_SALIDAS; i++)
    doc[salidas[i].id] = salidas[i].encendido ? 1 : 0;
  doc["visto"][".sv"] = "timestamp";   // la hora la pone el servidor
  if (avisoPendiente) doc["aviso"] = avisoTexto;

  String cuerpo;
  serializeJson(doc, cuerpo);
  Database.update(cliente, RAIZ + "/estado", object_t(cuerpo), alResultado, "publicar");

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
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) { delay(500); Serial.print("."); }

  if (WiFi.status() == WL_CONNECTED)
    Serial.printf("\n[wifi] listo, IP %s\n", WiFi.localIP().toString().c_str());
  else
    Serial.println("\n[wifi] sin conexion por ahora: reglas y pulsadores siguen funcionando");
}

unsigned long ultimoIntentoWiFi = 0;

// ===================================================================
//  14. setup / loop
// ===================================================================

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n== Nexus IoT ==");

  // Restaurar cómo estaba cada salida antes del último apagón
  memoria.begin("salidas", true);
  for (int i = 0; i < N_SALIDAS; i++) {
    pinMode(salidas[i].pin, OUTPUT);
    salidas[i].encendido = memoria.getBool(salidas[i].id, false);
    escribirPin(salidas[i]);
    iniciarPulsador(salidas[i].pulsador);
    Serial.printf("[flash] %s = %d\n", salidas[i].id, salidas[i].encendido);
  }
  memoria.end();
  iniciarPulsador(pulsadorModo);

  // Y el modo y las últimas reglas, para regular aunque arranque sin red
  memoria.begin("control", true);
  modoAuto = memoria.getBool("auto", false);
  memoria.end();
  memoria.begin("reglas", true);
  reglasGuardadas = memoria.getString("json", "{}");
  memoria.end();

  JsonDocument guardadas;
  if (!deserializeJson(guardadas, reglasGuardadas)) cargarReglas(guardadas.as<JsonObjectConst>());
  Serial.printf("[flash] modo automatico %s, %d reglas\n", modoAuto ? "activado" : "desactivado", nReglas);

#if USAR_DHT
  dht.begin();
#else
  Serial.println("[info] modo simulado: valores del DHT22 inventados");
#endif

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
    Database.set<bool>(cliente, RAIZ + "/control/auto", modoAuto, alResultado, "modo");
  }

  if (pedirControl) {
    pedirControl = false;
    Database.get(cliente, RAIZ + "/control", alResultado, false, "control");
  }

  // Una salida que cambió se publica ya; un valor que cambió, a lo sumo una
  // vez por segundo; y aunque nada cambie, un latido cada 15 s.
  unsigned long desde = millis() - ultimaPublicacion;
  if ((publicarPendiente && (hayUrgente || desde >= 1000)) || desde >= LATIDO_CADA)
    publicar();
}
