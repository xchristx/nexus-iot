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
 *  2) Libreria
 *     Programa > Incluir libreria > Administrar bibliotecas...
 *       - "ArduinoJson" de Benoit Blanchon  (version 7 o mayor)
 *     Solo si vas a usar el DHT22 de verdad (USAR_DHT 1), instala tambien:
 *       - "DHT sensor library" de Adafruit
 *       - "Adafruit Unified Sensor" de Adafruit
 *     WiFi, WiFiClientSecure, HTTPClient y Preferences ya vienen con el
 *     paquete ESP32: no se instalan.
 *
 *  3) Al compilar
 *     Herramientas > Placa > esp32 > "ESP32 Dev Module"
 *     Herramientas > Puerto > el COM que aparezca al enchufar la placa
 *     Monitor Serie a 115200 baudios
 *
 *  Si la placa no es una DevKit generica, proba con "DOIT ESP32 DEVKIT V1"
 *  o "NodeMCU-32S". Para una ESP32-C3, "ESP32C3 Dev Module".
 * ====================================================================
 */

/*
 * Nexus IoT — ESP32 <-> backend propio (Supabase)
 *
 * Cada 5 segundos la placa manda todos sus valores y en la MISMA respuesta
 * recibe los comandos pendientes y las reglas del modo automático:
 *
 *   POST /rest/v1/rpc/sync?apikey=...
 *     ->  {"p_clave":"...","p_estado":{"t":24.5,"h":61.2,"bomba":0,"vent":1}}
 *     <-  {"ok":true,"cmd":["bomba=1"],
 *          "reglas":[{"salida":"vent","entrada":"t","condicion":">","umbral":28,"hist":1.5}],
 *          "avisos":[]}
 *
 * Todo es de tablas: agregar una entrada (algo que la placa mide o lee) o una
 * salida (algo que prende y apaga) es agregar una fila. Los ids tienen que
 * coincidir con los que declaraste en el portal; si mandás algo que no
 * declaraste, el backend lo acepta igual y te avisa en el portal para que lo
 * agregues.
 *
 * Las filas de abajo son un EJEMPLO (DHT22 + bomba, ventilador y LED):
 * cambialas por tu hardware.
 *
 * Las reglas corren ACÁ y no en el servidor, a propósito: así la placa sigue
 * regulando con la app cerrada, el celular apagado y sin internet.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ===================================================================
//  1. CONFIGURACIÓN
// ===================================================================

const char *WIFI_SSID = "";           // tu red de 2.4 GHz (el ESP32 no ve las de 5 GHz)
const char *WIFI_PASS = "";

// Estos tres los sacás del portal, en "Mis datos".
//
// PUBLISHABLE_KEY es la clave pública del proyecto, la que empieza con
// "sb_publishable_". Es la misma para toda la clase y no es secreta.
// CLAVE es la de tu placa y no se comparte: con ella se controlan tus salidas.
const char *SUPABASE_URL    = "https://TUPROYECTO.supabase.co";
const char *PUBLISHABLE_KEY = "sb_publishable_PEGA_ACA_LA_TUYA";
const char *CLAVE           = "PEGA_ACA_TU_CLAVE";

// 0 = inventa los valores del DHT22, para probar sin cablear nada
#define USAR_DHT 0
#define PIN_DHT 4

// El servidor rechaza los syncs que llegan a menos de 3 s del anterior, así
// que 5000 deja margen. No lo bajes de 3000.
const unsigned long INTERVALO_SYNC = 5000;

// Una salida no puede conmutar por una regla más seguido que esto. Junto con
// la histéresis, es lo que evita que un relé quede haciendo clic-clic y se queme.
const unsigned long MIN_ENTRE_CAMBIOS = 30000;   // 30 s

#if USAR_DHT
  #include <DHT.h>
  DHT dht(PIN_DHT, DHT22);
#endif

// ===================================================================
//  2. Entradas — una fila por entrada
// ===================================================================
//
// Una entrada es cualquier cosa que la placa mide o lee y manda como número:
// un sensor, un LDR, un botón (1/0). Cada una es un id y una función que
// devuelve su valor. Si la lectura falla, la función devuelve NAN y se
// conserva el valor anterior.
//
// Para agregar uno: escribí su función de lectura y sumá la fila, con el
// mismo id que le pusiste en el portal.

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

struct Entrada {
  const char *id;
  float     (*leer)();
  float       valor;       // NAN hasta la primera lectura buena
};

Entrada entradas[] = {
  { "t", leerTemperatura, NAN },
  { "h", leerHumedad,     NAN },
};

const int N_ENTRADAS = sizeof(entradas) / sizeof(entradas[0]);

// ===================================================================
//  3. Salidas — una fila por salida
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

struct Salida {
  const char   *id;
  int           pin;
  int           nivelActivo;     // LOW o HIGH: el nivel que lo prende
  bool          encendido;
  unsigned long ultimoCambio;    // para el tiempo mínimo entre conmutaciones
};

Salida salidas[] = {
  { "bomba", 26, LOW,  false, 0 },   // IN1 del módulo de relés
  { "vent",  27, LOW,  false, 0 },   // IN2 del módulo de relés
  { "luz",    2, HIGH, false, 0 },   // LED integrado de la placa
};

const int N_SALIDAS = sizeof(salidas) / sizeof(salidas[0]);

// ===================================================================
//  4. Reglas del modo automático
// ===================================================================
//
// Llegan del servidor en cada sync: SOLO las activas, una por salida como
// mucho. La lista reemplaza completa a la anterior; si llega vacía, no hay
// ninguna regla. Se guardan en la flash para seguir regulando sin red.
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

// ===================================================================
//  5. Estado
// ===================================================================

WiFiClientSecure tls;
HTTPClient       http;
Preferences      memoria;

unsigned long ultimoSync = 0;
String reglasGuardadas = "[]";   // el JSON tal como llegó: se compara para no escribir la flash de más
String ultimosAvisos   = "[]";   // para no repetir los mismos avisos cada 5 segundos

// ===================================================================
//  6. Buscar por id
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

// ===================================================================
//  7. Salidas: escribir, guardar y aplicar
// ===================================================================

void escribirPin(const Salida &r) {
  digitalWrite(r.pin, r.encendido ? r.nivelActivo : !r.nivelActivo);
}

// Sobrevive a un corte de luz: al arrancar se restaura cómo estaba cada salida.
void guardarSalidas() {
  memoria.begin("salidas", false);
  for (int i = 0; i < N_SALIDAS; i++)
    memoria.putBool(salidas[i].id, salidas[i].encendido);
  memoria.end();
}

void aplicarSalida(Salida &r, bool encender) {
  r.encendido    = encender;
  r.ultimoCambio = millis();
  escribirPin(r);
  Serial.printf("[salida] %s = %s\n", r.id, encender ? "ON" : "OFF");
  guardarSalidas();
}

// Formato "salida=valor", el mismo que usa la app. No hace falta apagar ninguna
// regla acá: el servidor ya la apagó, y en esta misma respuesta llegan las
// reglas activas sin ella.
void aplicarComando(String cmd) {
  cmd.trim();
  int corte = cmd.indexOf('=');
  if (corte <= 0) { Serial.printf("[cmd] formato invalido: %s\n", cmd.c_str()); return; }

  String id = cmd.substring(0, corte);
  String v  = cmd.substring(corte + 1);
  id.trim(); v.trim();

  Salida *r = buscarSalida(id.c_str());
  if (!r) { Serial.printf("[cmd] esta placa no tiene la salida '%s'\n", id.c_str()); return; }

  aplicarSalida(*r, v == "1" || v.equalsIgnoreCase("ON"));
}

// ===================================================================
//  8. Reglas: cargar, guardar y evaluar
// ===================================================================

void cargarReglas(JsonArrayConst lista) {
  nReglas = 0;
  for (JsonObjectConst r : lista) {
    if (nReglas >= MAX_REGLAS) break;

    const char *salida    = r["salida"]    | "";
    const char *entrada   = r["entrada"]   | "";
    const char *condicion = r["condicion"] | "";
    if (!*salida || !*entrada || (condicion[0] != '>' && condicion[0] != '<')) continue;

    Regla &g = reglas[nReglas++];
    strlcpy(g.salida,  salida,  sizeof(g.salida));
    strlcpy(g.entrada, entrada, sizeof(g.entrada));
    g.condicion = condicion[0];
    g.umbral    = r["umbral"] | 0.0f;
    g.hist      = r["hist"]   | 1.0f;
  }
}

void conmutarPorRegla(Salida &r, bool encender) {
  // El tiempo mínimo corta el ciclado rápido que la histéresis no alcance a
  // filtrar. ultimoCambio en 0 significa que todavía no conmutó nunca.
  if (r.ultimoCambio != 0 && millis() - r.ultimoCambio < MIN_ENTRE_CAMBIOS) return;
  Serial.printf("[regla] %s -> %s\n", r.id, encender ? "ON" : "OFF");
  aplicarSalida(r, encender);
}

void evaluarReglas() {
  for (int i = 0; i < nReglas; i++) {
    const Regla &g = reglas[i];
    Entrada *s = buscarEntrada(g.entrada);
    Salida   *r = buscarSalida(g.salida);

    // La placa no tiene esa entrada o esa salida, o la entrada todavía no
    // leyó nada: la regla no se aplica.
    if (!s || !r || isnan(s->valor)) continue;

    // La histéresis evita el chattering: se prende al cruzar el umbral, pero
    // para apagar hay que volver "hist" más atrás. Sin esto, con el valor
    // oscilando justo en el umbral, la salida conmuta en cada lectura.
    bool prender, apagar;
    if (g.condicion == '>') {
      prender = s->valor > g.umbral;
      apagar  = s->valor < g.umbral - g.hist;
    } else {
      prender = s->valor < g.umbral;
      apagar  = s->valor > g.umbral + g.hist;
    }

    if (!r->encendido && prender)     conmutarPorRegla(*r, true);
    else if (r->encendido && apagar)  conmutarPorRegla(*r, false);
  }
}

// ===================================================================
//  9. Entradas
// ===================================================================

void leerEntradas() {
  for (int i = 0; i < N_ENTRADAS; i++) {
    float v = entradas[i].leer();
    if (isnan(v)) Serial.printf("[entrada] %s: lectura invalida, se conserva la anterior\n", entradas[i].id);
    else          entradas[i].valor = v;
  }
}

// ===================================================================
//  10. Sincronización con el backend
// ===================================================================

void sincronizar() {
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/sync?apikey=" + PUBLISHABLE_KEY;

  if (!http.begin(tls, url)) { Serial.println("[http] no se pudo abrir la conexion"); return; }
  http.addHeader("Content-Type", "application/json");   // el único header que hace falta
  http.setTimeout(8000);

  // El JSON se arma con ArduinoJson y no concatenando strings. Con strings,
  // una coma de menos produce un JSON inválido que Supabase rechaza ANTES de
  // llegar a sync(): no pasa por los mensajes de error útiles y el portal no
  // lo muestra.
  //
  // Una entrada que todavía no leyó nada vale NAN, y ArduinoJson lo manda como
  // null: el backend lo toma como "no llegó valor" y avisa, sin rechazar.
  JsonDocument pedido;
  pedido["p_clave"] = CLAVE;
  JsonObject estado = pedido["p_estado"].to<JsonObject>();
  for (int i = 0; i < N_ENTRADAS; i++)
    estado[entradas[i].id] = round(entradas[i].valor * 10) / 10.0;
  for (int i = 0; i < N_SALIDAS; i++)
    estado[salidas[i].id] = salidas[i].encendido ? 1 : 0;

  String cuerpo;
  serializeJson(pedido, cuerpo);

  int codigo = http.POST(cuerpo);

  if (codigo <= 0) {
    Serial.printf("[http] fallo de red: %s\n", http.errorToString(codigo).c_str());
    http.end();
    return;
  }

  String respuesta = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, respuesta)) {
    Serial.printf("[http] respuesta ilegible (HTTP %d): %s\n", codigo, respuesta.c_str());
    return;
  }

  // Se pregunta por "ok es true" y no por "ok es false": si el pedido ni
  // siquiera llega a sync() (URL mal escrita, clave pública equivocada), la
  // respuesta es de Supabase y no trae "ok". Tratarla como éxito escondería
  // justo los errores más difíciles de ver.
  if (!(doc["ok"] | false)) {
    const char *motivo = doc["error"] | (doc["message"] | "respuesta inesperada");
    Serial.printf("\n!! EL SERVIDOR RECHAZO EL SYNC (HTTP %d) !!\n   %s\n", codigo, motivo);
    Serial.printf("   respuesta completa: %s\n\n", respuesta.c_str());
    return;
  }

  Serial.print("[sync] ");
  serializeJson(estado, Serial);
  Serial.println();

  // Los avisos son nombres que no coinciden con lo declarado en el portal.
  // No impiden nada, pero casi siempre son un error de tipeo en el sketch.
  String avisos;
  serializeJson(doc["avisos"], avisos);
  if (avisos != ultimosAvisos) {
    for (JsonVariantConst a : doc["avisos"].as<JsonArrayConst>())
      Serial.printf("[aviso] %s\n", a.as<const char *>());
    ultimosAvisos = avisos;
  }

  // Primero los comandos...
  for (JsonVariantConst c : doc["cmd"].as<JsonArrayConst>())
    aplicarComando(c.as<String>());

  // ...después las reglas, que ya vienen sin la de la salida que se acaba de
  // comandar a mano. Solo se toca la flash si cambiaron.
  JsonArrayConst lista = doc["reglas"];
  if (!lista.isNull()) {
    String nuevas;
    serializeJson(lista, nuevas);
    if (nuevas != reglasGuardadas) {
      cargarReglas(lista);
      memoria.begin("reglas", false);
      memoria.putString("json", nuevas);
      memoria.end();
      reglasGuardadas = nuevas;
      Serial.printf("[reglas] %d activas: %s\n", nReglas, nuevas.c_str());
    }
  }
}

// ===================================================================
//  11. WiFi
// ===================================================================

// Nunca espera indefinidamente. Si esperara hasta conectar, con el router
// apagado la placa quedaría trabada acá y las reglas dejarían de evaluarse,
// que es justo lo que tienen que seguir haciendo sin red.
void conectarWiFi() {
  Serial.printf("[wifi] conectando a %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) { delay(500); Serial.print("."); }

  if (WiFi.status() == WL_CONNECTED)
    Serial.printf("\n[wifi] listo, IP %s\n", WiFi.localIP().toString().c_str());
  else
    Serial.println("\n[wifi] sin conexion por ahora: las reglas guardadas siguen funcionando");
}

unsigned long ultimoIntentoWiFi = 0;

// ===================================================================
//  12. setup / loop
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
    Serial.printf("[flash] %s = %d\n", salidas[i].id, salidas[i].encendido);
  }
  memoria.end();

  // Y las últimas reglas recibidas, para regular aunque arranque sin red
  memoria.begin("reglas", true);
  reglasGuardadas = memoria.getString("json", "[]");
  memoria.end();

  JsonDocument guardadas;
  if (!deserializeJson(guardadas, reglasGuardadas)) cargarReglas(guardadas.as<JsonArrayConst>());
  Serial.printf("[flash] %d reglas activas\n", nReglas);

#if USAR_DHT
  dht.begin();
#else
  Serial.println("[info] modo simulado: valores del DHT22 inventados");
#endif

  conectarWiFi();

  // Sin validar el certificado: lo que autentica es CLAVE. Validarlo de
  // verdad obliga a fijar el CA root y a sincronizar la hora por NTP, dos
  // cosas más que se rompen solas.
  tls.setInsecure();

  // Keep-alive. Sin esto, un handshake TLS completo cada 5 s tarda uno o dos
  // segundos y la placa no hace otra cosa que negociar conexiones.
  http.setReuse(true);

  leerEntradas();
  sincronizar();
}

void loop() {
  // Nada de delay() largo: el loop tiene que quedar libre.
  if (millis() - ultimoSync >= INTERVALO_SYNC) {
    ultimoSync = millis();
    leerEntradas();
    evaluarReglas();   // primero regula, después informa el estado ya corregido

    if (WiFi.status() == WL_CONNECTED) {
      sincronizar();
    } else if (millis() - ultimoIntentoWiFi >= 10000) {
      ultimoIntentoWiFi = millis();
      Serial.println("[wifi] sin conexion, reintentando (las reglas siguen funcionando)");
      WiFi.reconnect();
    }
  }
}
