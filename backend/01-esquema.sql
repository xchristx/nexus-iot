-- ===================================================================
--  Nexus IoT — esquema
--  Pegar en Supabase > SQL Editor y ejecutar, DESPUÉS de 00-borrar-todo.sql.
--
--  Cada alumno administra su propio hardware: cuántos sensores y cuántos
--  relés tiene, y las reglas de su modo automático. Es el equivalente a los
--  feeds de Adafruit, pero con un docente que ve toda la clase.
-- ===================================================================

-- pgcrypto genera las claves y guarda los PIN con bcrypt.
--
-- En Supabase ya viene instalada en el esquema "extensions", y esto no hace
-- nada. Localmente la instala en ese mismo esquema a propósito: así las
-- pruebas reproducen el problema que en producción rompería todo si una
-- función no tuviera "extensions" en su search_path.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Los helpers viven fuera de 'public' para que PostgREST no los publique.
-- Casi todos están en 02-funciones.sql; este va acá porque lo usa un índice.
create schema if not exists util;

-- -------------------------------------------------------------------
--  util.nombre_clave — para reconocer al mismo alumno escrito distinto
--
--  "Ana Pérez", "ana perez" y "ANA  PÉREZ" tienen que ser la misma persona.
--  Si no, un alumno que un día escribe sin tilde termina con una cuenta
--  nueva, vacía y con otra clave.
--
--  No alcanza con lower(): depende del locale de la base, y con algunos no
--  pasa "É" a minúscula. Por eso primero se sacan las tildes a mano (lo que
--  queda es ASCII, que cualquier locale sabe pasar a minúscula).
-- -------------------------------------------------------------------
create or replace function util.nombre_clave(p text)
returns text
language sql
immutable
as $$
  select lower(translate(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')),
                         'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç',
                         'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc'));
$$;

-- -------------------------------------------------------------------
--  cursos
--
--  El docente crea uno por comisión y reparte el código. La plantilla es lo
--  que recibe cada alumno NUEVO al darse de alta; a partir de ahí, ese
--  hardware es del alumno y lo cambia como quiere. Cambiar la plantilla no
--  toca a los que ya estaban.
--
--  Formato de la plantilla, el mismo que usan las funciones del portal:
--    {"sensores": [{id, nombre, unidad, pin, conexion, libreria}, ...],
--     "reles":    [{id, nombre, pin, nivel_activo, conexion}, ...],
--     "reglas":   [{rele, sensor, condicion, umbral, hist, activa}, ...]}
--
--  Un trigger (en 02-funciones.sql) rechaza el guardado si la plantilla
--  queda mal armada, con un mensaje que dice qué corregir.
-- -------------------------------------------------------------------
create table cursos (
  codigo    text primary key,
  nombre    text,
  abierto   boolean not null default true,   -- en false no se registra nadie NUEVO
  plantilla jsonb not null default '{
    "sensores": [
      {"id": "t", "nombre": "Temperatura", "unidad": "°C",
       "conexion": "DHT22, pin de datos en GPIO 4",
       "libreria": "DHT sensor library y Adafruit Unified Sensor, de Adafruit (DHT.h)"},
      {"id": "h", "nombre": "Humedad", "unidad": "%",
       "conexion": "el mismo DHT22 de la temperatura"}
    ],
    "reles": [
      {"id": "bomba", "nombre": "Bomba", "pin": 26, "nivel_activo": "LOW",
       "conexion": "IN1 del módulo de relés"},
      {"id": "vent", "nombre": "Ventilador", "pin": 27, "nivel_activo": "LOW",
       "conexion": "IN2 del módulo de relés"},
      {"id": "luz", "nombre": "Luz", "pin": 2, "nivel_activo": "HIGH",
       "conexion": "LED integrado de la placa, hasta tener un tercer relé"}
    ],
    "reglas": [
      {"rele": "vent",  "sensor": "t", "condicion": ">", "umbral": 28, "hist": 1.5, "activa": false},
      {"rele": "bomba", "sensor": "h", "condicion": "<", "umbral": 40, "hist": 1.5, "activa": false}
    ]
  }'::jsonb,
  creado    timestamptz not null default now(),

  -- entrar() pasa el código a mayúsculas; uno cargado en minúsculas a mano
  -- quedaría imposible de usar.
  constraint codigo_en_mayusculas check (codigo = upper(codigo))
);

-- -------------------------------------------------------------------
--  dispositivos — una fila por alumno
--
--  Dos claves con alcances distintos, a propósito:
--
--    clave        va en el firmware y en la app Kodular. Lee, sincroniza,
--                 manda comandos y ajusta reglas. Como viaja dentro del APK
--                 es extraíble, así que NO puede cambiar la estructura.
--
--    clave_admin  solo la tiene el portal, después de entrar con el PIN.
--                 Crea y borra sensores, relés y reglas.
--
--  Así un compañero que saca la clave de un APK puede, como mucho, prender
--  un relé: no puede borrarle la configuración a nadie.
-- -------------------------------------------------------------------
create sequence dispositivos_num;

create table dispositivos (
  device_id         text primary key,          -- 'iot2026-07'
  curso             text not null references cursos on delete cascade on update cascade,
  alumno            text not null,
  clave             text not null unique,
  clave_admin       text not null unique,
  pin_hash          text not null,             -- bcrypt; el PIN nunca se guarda
  intentos_fallidos integer not null default 0,
  bloqueado_hasta   timestamptz,               -- 5 PIN mal seguidos -> 15 minutos
  activo            boolean not null default true,
  creado            timestamptz not null default now()
);

-- "Ana Pérez", "ana perez" y "ANA PÉREZ" son la misma persona.
create unique index dispositivos_curso_alumno on dispositivos (curso, util.nombre_clave(alumno));

-- -------------------------------------------------------------------
--  canales — los sensores y relés de cada alumno
--
--  El id es el nombre que viaja en el JSON ("t", "bomba", "suelo"), y es
--  único por alumno entre sensores y relés juntos, porque en el JSON
--  comparten el mismo nivel.
--
--  Las funciones validan todo con mensajes claros; estos CHECK son la red de
--  seguridad para ediciones a mano desde el Table Editor.
-- -------------------------------------------------------------------
create table canales (
  device_id    text not null references dispositivos on delete cascade,
  id           text not null,
  tipo         text not null,
  nombre       text,
  unidad       text,
  pin          smallint,
  nivel_activo text,
  conexion     text,            -- texto libre: sale en el prompt tal cual
  libreria     text,            -- ídem, solo para sensores
  orden        integer not null default 0,
  creado       timestamptz not null default now(),

  primary key (device_id, id),

  -- 15 caracteres es el largo máximo de una clave de Preferences en el ESP32,
  -- donde el firmware guarda el estado de cada relé.
  constraint id_valido     check (id ~ '^[a-z][a-z0-9_]{0,14}$'),
  constraint tipo_valido   check (tipo in ('sensor', 'rele')),
  constraint pin_valido    check (pin between 0 and 39),
  constraint nivel_valido  check (nivel_activo in ('LOW', 'HIGH')),
  constraint rele_completo check (tipo <> 'rele' or (pin is not null and nivel_activo is not null)),
  constraint textos_cortos check (length(nombre)   <= 40  and length(unidad)   <= 10
                              and length(conexion) <= 120 and length(libreria) <= 120)
);

-- -------------------------------------------------------------------
--  reglas — el modo automático, UNA por relé
--
--  "el relé X se prende si el sensor Y está por encima (o por debajo) de un
--  umbral". Una sola por relé para que no existan dos reglas peleándose por
--  la misma salida. Las evalúa la placa, así sigue regulando sin internet.
--
--  Borrar el relé o el sensor borra la regla sola.
-- -------------------------------------------------------------------
create table reglas (
  device_id text not null,
  rele      text not null,
  sensor    text not null,
  condicion text not null,
  umbral    numeric not null,
  hist      numeric not null default 1,
  activa    boolean not null default false,

  primary key (device_id, rele),
  foreign key (device_id, rele)   references canales (device_id, id) on delete cascade,
  foreign key (device_id, sensor) references canales (device_id, id) on delete cascade,

  constraint condicion_valida check (condicion in ('>', '<')),
  constraint hist_valida      check (hist >= 0)
);

-- -------------------------------------------------------------------
--  estado — la última foto de cada placa
--
--  No acumula historial: se sobrescribe en cada sync. Si más adelante se
--  quieren gráficos, el lugar para engancharlo es sync(): un insert en una
--  tabla "lecturas", como mucho uno por minuto por placa.
-- -------------------------------------------------------------------
create table estado (
  device_id      text primary key references dispositivos on delete cascade,
  valores        jsonb not null default '{}',    -- lo que mandó la placa en el último sync válido
  avisos         text[] not null default '{}',   -- nombres que no coinciden con lo declarado
  visto_en       timestamptz,                    -- último sync VÁLIDO -> "edad"
  ultimo_intento timestamptz,                    -- último sync procesado, válido o no -> rate limit
  ultimo_error   text,                           -- por qué se rechazó el último, para el portal
  syncs          integer not null default 0
);

-- -------------------------------------------------------------------
--  comandos — cola. La app encola, sync() entrega y borra.
--  Formato 'rele=valor', el mismo desde la primera versión.
-- -------------------------------------------------------------------
create table comandos (
  id        bigserial primary key,
  device_id text not null references dispositivos on delete cascade,
  cmd       text not null,
  creado    timestamptz not null default now()
);

create index comandos_device on comandos (device_id, id);

-- ===================================================================
--  RLS: todo cerrado, sin ninguna política
--
--  Con RLS activo y cero políticas, la publishable key no puede tocar
--  ninguna tabla directamente. Todo pasa por las funciones de
--  02-funciones.sql, que son SECURITY DEFINER y corren como su dueño. Eso es
--  lo que hace seguro publicar esa clave en el portal y en 20 APKs.
--
--  OJO CON LOS NOMBRES: la clave se llama "publishable key"
--  (sb_publishable_...), pero el ROL de Postgres al que Supabase la mapea se
--  sigue llamando 'anon'. Acá y en los grants de 02 dice anon porque es el
--  rol, no la clave.
-- ===================================================================
alter table cursos       enable row level security;
alter table dispositivos enable row level security;
alter table canales      enable row level security;
alter table reglas       enable row level security;
alter table estado       enable row level security;
alter table comandos     enable row level security;

-- Por las dudas: sin permisos de tabla aunque alguien desactive RLS.
revoke all on cursos, dispositivos, canales, reglas, estado, comandos from anon, authenticated;
