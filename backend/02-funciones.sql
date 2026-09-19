-- ===================================================================
--  Nexus IoT — funciones RPC
--  Ejecutar DESPUÉS de 01-esquema.sql. Se puede volver a correr.
--
--  Reglas que valen para todas:
--
--  - Son SECURITY DEFINER: corren como su dueño y por eso ven las tablas
--    aunque RLS esté cerrado para anon.
--
--  - Nunca lanzan excepción. Siempre devuelven 200 con {"ok":true|false,...}.
--    El firmware lo escribe una IA a pedido de cada alumno, y código generado
--    tiende a mirar solo el body: una única forma de respuesta es mucho más
--    fácil de manejar que mezclar 200 con 400 y dos formatos de error.
--
--  - search_path incluye "extensions", porque en Supabase ahí vive pgcrypto.
--    Sin eso, crypt() y gen_random_bytes() no existen en producción aunque
--    anden en una base local.
--
--  - Hay dos claves con alcances distintos (ver 01-esquema.sql):
--      clave        -> leer_estado, enviar_comando, ajustar_regla, sync
--      clave_admin  -> leer_config, guardar_canal, borrar_canal,
--                      guardar_regla, borrar_regla
-- ===================================================================

-- Los helpers viven fuera de 'public' para que PostgREST no los publique.
create schema if not exists util;


-- ===================================================================
--  NOMBRES
-- ===================================================================

-- Claves que usa la respuesta de leer_estado. Un sensor con uno de estos
-- nombres pisaría un dato del sistema.
create or replace function util.reservados()
returns text[]
language sql
immutable
as $$
  select array['ok', 'error', 'device_id', 'alumno', 'detectados', 'faltan',
               'pendientes', 'reglas', 'edad', 'avisos', 'ultimo_error', 'syncs',
               'cmd', 'p_clave', 'p_estado'];
$$;

-- Minúsculas, números y guión bajo, empezando con letra, hasta 15
-- caracteres: el largo máximo de una clave de Preferences en el ESP32.
create or replace function util.nombre_valido(p text)
returns boolean
language sql
immutable
as $$
  select coalesce(p ~ '^[a-z][a-z0-9_]{0,14}$', false) and not (p = any(util.reservados()));
$$;

create or replace function util.tipo_es(p text)
returns text
language sql
immutable
as $$
  select case p
           when 'boolean' then 'booleano'
           when 'string'  then 'texto'
           when 'object'  then 'objeto'
           when 'array'   then 'arreglo'
           else coalesce(p, 'nada')
         end;
$$;

create or replace function util.nueva_clave()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select encode(gen_random_bytes(12), 'hex');
$$;


-- ===================================================================
--  BUSCAR AL ALUMNO POR SU CLAVE
--  Devuelven la fila, o una fila vacía (device_id null) si no existe.
-- ===================================================================

create or replace function util.por_clave(p text)
returns public.dispositivos
language sql
stable
as $$
  select * from public.dispositivos where clave = btrim(coalesce(p, ''));
$$;

create or replace function util.por_admin(p text)
returns public.dispositivos
language sql
stable
as $$
  select * from public.dispositivos where clave_admin = btrim(coalesce(p, ''));
$$;


-- ===================================================================
--  VALIDACIÓN DE SENSORES, RELÉS, REGLAS Y PLANTILLAS
--
--  Devuelven null si está bien, o un texto que dice qué corregir. Las usan
--  tanto las funciones del portal como el trigger que protege la plantilla
--  del curso, así que el alumno y el docente ven los mismos mensajes.
-- ===================================================================

create or replace function util.error_canal(c jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_id    text;
  v_tipo  text;
  v_campo text;
  v_max   int;
  v_pin   numeric;
begin
  if c is null or jsonb_typeof(c) <> 'object' then
    return 'el sensor o relé tiene que ser un objeto JSON';
  end if;

  if jsonb_typeof(c -> 'id') is distinct from 'string' then
    return 'falta "id": el nombre corto que viaja en el JSON, por ejemplo "suelo"';
  end if;

  v_id := c ->> 'id';

  if v_id = any(util.reservados()) then
    return format('"%s" es un nombre reservado del sistema, elegí otro', v_id);
  end if;

  if not util.nombre_valido(v_id) then
    return format('"%s" no es un id válido: usá minúsculas, números y _, empezando con letra, '
                  'hasta 15 caracteres (por ejemplo "suelo" o "rele_2")', v_id);
  end if;

  v_tipo := c ->> 'tipo';
  if v_tipo is null or v_tipo not in ('sensor', 'rele') then
    return format('"%s": "tipo" tiene que ser "sensor" o "rele"', v_id);
  end if;

  for v_campo, v_max in
    select * from (values ('nombre', 40), ('unidad', 10), ('conexion', 120), ('libreria', 120)) as t(campo, largo)
  loop
    if jsonb_typeof(c -> v_campo) not in ('string', 'null') then
      return format('"%s": "%s" tiene que ser texto', v_id, v_campo);
    end if;
    if length(c ->> v_campo) > v_max then
      return format('"%s": "%s" puede tener hasta %s caracteres', v_id, v_campo, v_max);
    end if;
  end loop;

  if jsonb_typeof(c -> 'pin') is not null and jsonb_typeof(c -> 'pin') <> 'null' then
    -- IFs separados y no un OR: SQL no garantiza cortocircuito, y un
    -- "pin":"abc" haría fallar el cast en vez de dar este mensaje.
    if jsonb_typeof(c -> 'pin') <> 'number' then
      return format('"%s": "pin" tiene que ser un número de GPIO entre 0 y 39, sin comillas', v_id);
    end if;
    v_pin := (c ->> 'pin')::numeric;
    if v_pin not between 0 and 39 or v_pin <> trunc(v_pin) then
      return format('"%s": "pin" tiene que ser un número de GPIO entre 0 y 39', v_id);
    end if;
  elsif v_tipo = 'rele' then
    return format('"%s": un relé necesita "pin", el GPIO al que está conectado', v_id);
  end if;

  if v_tipo = 'rele' and coalesce(c ->> 'nivel_activo', '') not in ('LOW', 'HIGH') then
    return format('"%s": "nivel_activo" tiene que ser "LOW" o "HIGH" (la mayoría de los '
                  'módulos de relé son LOW; el LED de la placa es HIGH)', v_id);
  end if;

  return null;
end;
$$;

-- p_sensores y p_reles: los ids que tiene el alumno (o la plantilla).
create or replace function util.error_regla(r jsonb, p_sensores text[], p_reles text[])
returns text
language plpgsql
immutable
as $$
declare
  v_rele   text;
  v_sensor text;
begin
  if r is null or jsonb_typeof(r) <> 'object' then
    return 'la regla tiene que ser un objeto JSON';
  end if;

  v_rele := r ->> 'rele';
  if jsonb_typeof(r -> 'rele') is distinct from 'string' then
    return 'falta "rele": el id del relé que controla la regla';
  end if;
  if not (v_rele = any(p_reles)) then
    return case when v_rele = any(p_sensores)
                then format('"%s" es un sensor, no un relé', v_rele)
                else format('"%s" no es uno de tus relés', v_rele) end;
  end if;

  v_sensor := r ->> 'sensor';
  if jsonb_typeof(r -> 'sensor') is distinct from 'string' then
    return 'falta "sensor": el id del sensor que mira la regla';
  end if;
  if not (v_sensor = any(p_sensores)) then
    return case when v_sensor = any(p_reles)
                then format('"%s" es un relé, no un sensor', v_sensor)
                else format('"%s" no es uno de tus sensores', v_sensor) end;
  end if;

  if coalesce(r ->> 'condicion', '') not in ('>', '<') then
    return '"condicion" tiene que ser ">" (prende si el sensor supera el umbral) '
        || 'o "<" (prende si baja del umbral)';
  end if;

  if jsonb_typeof(r -> 'umbral') is distinct from 'number' then
    return '"umbral" tiene que ser un número, sin comillas';
  end if;

  if jsonb_typeof(r -> 'hist') not in ('number', 'null') then
    return '"hist" tiene que ser un número, sin comillas';
  end if;
  if (r ->> 'hist')::numeric < 0 then
    return '"hist" no puede ser negativa';
  end if;

  if jsonb_typeof(r -> 'activa') not in ('boolean', 'null') then
    return '"activa" tiene que ser true o false, sin comillas';
  end if;

  return null;
end;
$$;

create or replace function util.error_plantilla(p jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_lista    text;
  v_tipo     text;
  v_item     jsonb;
  v_n        bigint;
  v_err      text;
  v_ids      text[] := '{}';
  v_sensores text[] := '{}';
  v_reles    text[] := '{}';
  v_con_regla text[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return 'la plantilla tiene que ser un objeto JSON con "sensores", "reles" y "reglas"';
  end if;

  foreach v_lista in array array['sensores', 'reles'] loop
    if jsonb_typeof(p -> v_lista) is distinct from 'array' then
      return format('falta el arreglo "%s" (si no hay ninguno, poné "%s": [])', v_lista, v_lista);
    end if;

    if jsonb_array_length(p -> v_lista) > 10 then
      return format('"%s" puede tener hasta 10 elementos', v_lista);
    end if;

    v_tipo := case v_lista when 'sensores' then 'sensor' else 'rele' end;

    for v_item, v_n in
      select e, n from jsonb_array_elements(p -> v_lista) with ordinality as a(e, n)
    loop
      if jsonb_typeof(v_item) <> 'object' then
        return format('%s[%s] tiene que ser un objeto {...}', v_lista, v_n);
      end if;

      v_err := util.error_canal(v_item || jsonb_build_object('tipo', v_tipo));
      if v_err is not null then
        return format('%s[%s]: %s', v_lista, v_n, v_err);
      end if;

      if (v_item ->> 'id') = any(v_ids) then
        return format('el id "%s" está repetido', v_item ->> 'id');
      end if;

      v_ids := v_ids || (v_item ->> 'id');
      if v_tipo = 'sensor' then
        v_sensores := v_sensores || (v_item ->> 'id');
      else
        v_reles := v_reles || (v_item ->> 'id');
      end if;
    end loop;
  end loop;

  if jsonb_typeof(p -> 'reglas') is not null and jsonb_typeof(p -> 'reglas') <> 'null' then
    if jsonb_typeof(p -> 'reglas') <> 'array' then
      return '"reglas" tiene que ser un arreglo';
    end if;

    for v_item, v_n in
      select e, n from jsonb_array_elements(p -> 'reglas') with ordinality as a(e, n)
    loop
      v_err := util.error_regla(v_item, v_sensores, v_reles);
      if v_err is not null then
        return format('reglas[%s]: %s', v_n, v_err);
      end if;

      if (v_item ->> 'rele') = any(v_con_regla) then
        return format('reglas[%s]: el relé "%s" ya tiene una regla, y se permite una por relé',
                      v_n, v_item ->> 'rele');
      end if;
      v_con_regla := v_con_regla || (v_item ->> 'rele');
    end loop;
  end if;

  return null;
end;
$$;

create or replace function util.validar_plantilla_trigger()
returns trigger
language plpgsql
as $$
declare
  v_err text := util.error_plantilla(new.plantilla);
begin
  if v_err is not null then
    raise exception 'Plantilla inválida en el curso %: %', new.codigo, v_err
      using hint = 'No se guardó nada. Ver backend/LEEME.md, sección "Plantilla del curso".';
  end if;
  return new;
end;
$$;

drop trigger if exists cursos_plantilla_valida on cursos;
create trigger cursos_plantilla_valida
  before insert or update of plantilla on cursos
  for each row execute function util.validar_plantilla_trigger();


-- ===================================================================
--  ARMADO DE RESPUESTAS
-- ===================================================================

create or replace function util.canal_json(c public.canales)
returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', c.id, 'tipo', c.tipo, 'nombre', c.nombre, 'unidad', c.unidad, 'pin', c.pin,
    'nivel_activo', c.nivel_activo, 'conexion', c.conexion, 'libreria', c.libreria));
$$;

-- Sensores primero, después relés, cada grupo en el orden en que se crearon.
create or replace function util.canales_json(p_device text)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(util.canal_json(c) order by c.tipo desc, c.orden, c.id), '[]')
    from public.canales c
   where c.device_id = p_device;
$$;

-- A la placa le llegan SOLO las activas, y sin el campo "activa". Así, si el
-- firmware generado se olvida de mirar ese campo, igual no puede ejecutar
-- una regla que el alumno apagó. La app y el portal reciben todas.
create or replace function util.reglas_json(p_device text, p_solo_activas boolean)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('rele', r.rele, 'sensor', r.sensor, 'condicion', r.condicion,
                              'umbral', r.umbral, 'hist', r.hist)
           || case when p_solo_activas then '{}'::jsonb
                   else jsonb_build_object('activa', r.activa) end
           order by r.rele), '[]')
    from public.reglas r
   where r.device_id = p_device
     and (r.activa or not p_solo_activas);
$$;

-- Cómo se ve un p_estado correcto para este alumno. Va en cada rechazo, para
-- que el ejemplo esté al lado del problema.
create or replace function util.estado_esperado(p_device text)
returns json
language sql
stable
as $$
  select coalesce(
           json_object_agg(id, valor order by tipo desc, orden, id),
           '{"t": 24.5, "bomba": 0}'::json)
    from (select c.id, c.tipo, c.orden,
                 case when c.tipo = 'rele' then '0'::json
                      else to_json(case row_number() over (partition by c.tipo order by c.orden, c.id)
                                     when 1 then 24.5 when 2 then 61.2 else 10.5 end)
                 end as valor
            from public.canales c
           where c.device_id = p_device) as ejemplo;
$$;


-- ===================================================================
--  VALIDACIÓN DE LO QUE MANDA LA PLACA
--
--  Forma incorrecta -> rechazo: un valor como texto, un relé en 2, un nombre
--  inválido. Eso es un error del sketch y conviene que sea ruidoso.
--
--  Los nombres que no coinciden con lo declarado NO se validan acá: los
--  resuelve sync() como avisos, sin rechazar.
--
--  Un null se trata como "no llegó valor" y se saltea. Importa: ArduinoJson
--  serializa NaN como null, y un DHT22 que falla una lectura devuelve NaN.
--  Rechazar por eso dejaría la placa desconectada por un cable flojo.
-- ===================================================================
create or replace function util.validar_estado(p_estado json, p_sensores text[], p_reles text[],
                                               out valores jsonb, out error text)
language plpgsql
immutable
as $$
declare
  c_max_detectados constant int := 10;

  v_id         text;
  v_val        jsonb;
  v_tipo       text;
  v_detectados int := 0;
begin
  valores := '{}'::jsonb;

  if p_estado is null or json_typeof(p_estado) <> 'object' then
    error := format('p_estado tiene que ser un objeto JSON, llegó %s', util.tipo_es(json_typeof(p_estado)));
    return;
  end if;

  for v_id, v_val in select key, value from jsonb_each(p_estado::jsonb) order by key loop
    v_tipo := jsonb_typeof(v_val);
    continue when v_tipo = 'null';

    if v_id = any(util.reservados()) then
      error := format('''%s'' es un nombre reservado del sistema, no se puede usar para un dato', v_id);
      return;
    end if;

    if not util.nombre_valido(v_id) then
      error := format('''%s'' no es un nombre válido. Usá minúsculas, números y _, empezando con letra, '
                      'hasta 15 caracteres', v_id);
      return;
    end if;

    if v_id = any(p_sensores) then
      if v_tipo = 'number' then
        valores := valores || jsonb_build_object(v_id, v_val);
      elsif v_tipo = 'string' then
        error := format('''%s'' llegó como texto (%s). Tiene que ir como número, sin comillas: "%s":24.5',
                        v_id, v_val::text, v_id);
        return;
      else
        error := format('''%s'' es un sensor: tiene que ser un número, llegó un %s', v_id, util.tipo_es(v_tipo));
        return;
      end if;

    elsif v_id = any(p_reles) then
      if v_tipo = 'boolean' then
        valores := valores || jsonb_build_object(v_id, case when v_val = 'true'::jsonb then 1 else 0 end);
      elsif v_tipo = 'number' and v_val in ('0'::jsonb, '1'::jsonb) then
        valores := valores || jsonb_build_object(v_id, (v_val #>> '{}')::numeric::int);
      elsif v_tipo = 'string' then
        error := format('''%s'' llegó como texto (%s). Tiene que ir como número, sin comillas: "%s":1',
                        v_id, v_val::text, v_id);
        return;
      else
        error := format('''%s'' es un relé: tiene que ser 1 o 0, llegó %s', v_id, v_val::text);
        return;
      end if;

    else
      v_detectados := v_detectados + 1;
      if v_detectados > c_max_detectados then
        error := format('llegaron más de %s datos que no están declarados. Declaralos en el portal '
                        'o sacalos del sketch.', c_max_detectados);
        return;
      end if;

      if v_tipo = 'number' then
        valores := valores || jsonb_build_object(v_id, v_val);
      elsif v_tipo = 'boolean' then
        valores := valores || jsonb_build_object(v_id, case when v_val = 'true'::jsonb then 1 else 0 end);
      elsif v_tipo = 'string' then
        error := format('''%s'' llegó como texto (%s). Tiene que ir como número, sin comillas',
                        v_id, v_val::text);
        return;
      else
        error := format('''%s'' tiene que ser un número, llegó un %s', v_id, util.tipo_es(v_tipo));
        return;
      end if;
    end if;
  end loop;
end;
$$;


-- ===================================================================
--  PORTAL — entrar con PIN
-- ===================================================================

-- -------------------------------------------------------------------
--  entrar(curso, alumno, pin)
--
--  La primera vez crea al alumno con la plantilla del curso. Las siguientes
--  verifica el PIN y devuelve las mismas claves.
--
--  5 PIN incorrectos seguidos bloquean 15 minutos: un PIN de 4 números son
--  10.000 combinaciones, y sin freno se prueban todas en un rato.
-- -------------------------------------------------------------------
create or replace function public.entrar(p_curso text, p_alumno text, p_pin text)
returns json
language plpgsql
volatile
security definer
set search_path = public, util, extensions
as $$
declare
  c_max_intentos constant int := 5;

  v_codigo text := upper(btrim(coalesce(p_curso, '')));
  v_alumno text := btrim(regexp_replace(coalesce(p_alumno, ''), '\s+', ' ', 'g'));
  v_pin    text := btrim(coalesce(p_pin, ''));
  v_curso  cursos%rowtype;
  v_disp   dispositivos%rowtype;
  v_quedan int;
begin
  if length(v_alumno) < 3 then
    return json_build_object('ok', false, 'error', 'Escribí tu nombre y apellido (al menos 3 letras).');
  end if;

  if v_pin !~ '^[0-9]{4,8}$' then
    return json_build_object('ok', false, 'error', 'El PIN tiene que tener entre 4 y 8 números.');
  end if;

  select * into v_curso from cursos where codigo = v_codigo;
  if not found then
    return json_build_object('ok', false,
      'error', format('El código "%s" no existe. Revisá que esté bien escrito.', v_codigo));
  end if;

  select * into v_disp
    from dispositivos
   where curso = v_curso.codigo and util.nombre_clave(alumno) = util.nombre_clave(v_alumno);

  -- ---- ya existe: verificar el PIN ----
  if found then
    if not v_disp.activo then
      return json_build_object('ok', false, 'error', 'Tu cuenta está desactivada. Hablá con el docente.');
    end if;

    if v_disp.bloqueado_hasta > now() then
      return json_build_object('ok', false,
        'error', format('Demasiados PIN incorrectos. Probá de nuevo en %s minutos.',
                        ceil(extract(epoch from v_disp.bloqueado_hasta - now()) / 60)));
    end if;

    if crypt(v_pin, v_disp.pin_hash) <> v_disp.pin_hash then
      v_quedan := c_max_intentos - (v_disp.intentos_fallidos + 1);

      update dispositivos
         set intentos_fallidos = case when v_quedan <= 0 then 0 else intentos_fallidos + 1 end,
             bloqueado_hasta   = case when v_quedan <= 0 then now() + interval '15 minutes' end
       where device_id = v_disp.device_id;

      return json_build_object('ok', false,
        'error', case when v_quedan <= 0
                      then 'PIN incorrecto. Por seguridad, la cuenta queda bloqueada 15 minutos.'
                      else format('PIN incorrecto. %s antes de un bloqueo de 15 minutos. '
                                  'Si te olvidaste el PIN, pedile al docente que lo resetee.',
                                  case when v_quedan = 1 then 'Te queda 1 intento'
                                       else format('Te quedan %s intentos', v_quedan) end)
                 end);
    end if;

    update dispositivos
       set intentos_fallidos = 0, bloqueado_hasta = null
     where device_id = v_disp.device_id;

    return json_build_object('ok', true, 'nuevo', false,
      'device_id', v_disp.device_id, 'alumno', v_disp.alumno,
      'clave', v_disp.clave, 'clave_admin', v_disp.clave_admin);
  end if;

  -- ---- alumno nuevo ----
  if not v_curso.abierto then
    return json_build_object('ok', false,
      'error', 'Este curso ya cerró las inscripciones. Hablá con el docente.');
  end if;

  begin
    insert into dispositivos (device_id, curso, alumno, clave, clave_admin, pin_hash)
    values (lower(v_curso.codigo) || '-' || lpad(nextval('dispositivos_num')::text, 2, '0'),
            v_curso.codigo, v_alumno, util.nueva_clave(), util.nueva_clave(),
            crypt(v_pin, gen_salt('bf', 8)))
    returning * into v_disp;
  exception when unique_violation then
    -- dos altas simultáneas con el mismo nombre
    return json_build_object('ok', false, 'error', 'Ese nombre se acaba de registrar. Probá entrar de nuevo.');
  end;

  insert into estado (device_id) values (v_disp.device_id);

  -- La plantilla ya viene validada por el trigger de cursos.
  insert into canales (device_id, id, tipo, nombre, unidad, pin, conexion, libreria, orden)
  select v_disp.device_id, x ->> 'id', 'sensor', x ->> 'nombre', x ->> 'unidad',
         (x ->> 'pin')::numeric::smallint, x ->> 'conexion', x ->> 'libreria', n
    from jsonb_array_elements(v_curso.plantilla -> 'sensores') with ordinality as s(x, n);

  insert into canales (device_id, id, tipo, nombre, pin, nivel_activo, conexion, orden)
  select v_disp.device_id, x ->> 'id', 'rele', x ->> 'nombre',
         (x ->> 'pin')::numeric::smallint, x ->> 'nivel_activo', x ->> 'conexion', n
    from jsonb_array_elements(v_curso.plantilla -> 'reles') with ordinality as s(x, n);

  insert into reglas (device_id, rele, sensor, condicion, umbral, hist, activa)
  select v_disp.device_id, x ->> 'rele', x ->> 'sensor', x ->> 'condicion',
         (x ->> 'umbral')::numeric, coalesce((x ->> 'hist')::numeric, 1),
         coalesce((x ->> 'activa')::boolean, false)
    from jsonb_array_elements(coalesce(v_curso.plantilla -> 'reglas', '[]')) as s(x);

  return json_build_object('ok', true, 'nuevo', true,
    'device_id', v_disp.device_id, 'alumno', v_disp.alumno,
    'clave', v_disp.clave, 'clave_admin', v_disp.clave_admin);
end;
$$;


-- ===================================================================
--  PORTAL — estructura (con clave_admin)
-- ===================================================================

create or replace function public.leer_config(p_admin text)
returns json
language plpgsql
stable
security definer
set search_path = public, util, extensions
as $$
declare
  v_disp dispositivos%rowtype := util.por_admin(p_admin);
  v_curso cursos%rowtype;
begin
  if v_disp.device_id is null or not v_disp.activo then
    return json_build_object('ok', false, 'error', 'Tu sesión no es válida. Volvé a entrar con tu PIN.');
  end if;

  select * into v_curso from cursos where codigo = v_disp.curso;

  return json_build_object(
    'ok', true,
    'device_id', v_disp.device_id,
    'alumno', v_disp.alumno,
    'curso', v_curso.codigo,
    'nombre_curso', v_curso.nombre,
    'clave', v_disp.clave,
    'canales', util.canales_json(v_disp.device_id),
    'reglas', util.reglas_json(v_disp.device_id, false));
end;
$$;

-- -------------------------------------------------------------------
--  guardar_canal(admin, {id, tipo, nombre, unidad, pin, nivel_activo, ...})
--
--  Alta si el id no existe, edición si existe. El id no se puede renombrar:
--  es lo que viaja en el JSON, y cambiarlo rompe el sketch igual. Para
--  renombrar, se borra y se crea de nuevo.
-- -------------------------------------------------------------------
create or replace function public.guardar_canal(p_admin text, p_canal json)
returns json
language plpgsql
volatile
security definer
set search_path = public, util, extensions
as $$
declare
  c_max constant int := 10;

  v_disp    dispositivos%rowtype := util.por_admin(p_admin);
  v_c       jsonb := p_canal::jsonb;
  v_err     text;
  v_id      text;
  v_tipo    text;
  v_prev    canales%rowtype;
  v_existia boolean;
  v_cuantos int;
  v_borradas int := 0;
  v_nuevo   canales%rowtype;
begin
  if v_disp.device_id is null or not v_disp.activo then
    return json_build_object('ok', false, 'error', 'Tu sesión no es válida. Volvé a entrar con tu PIN.');
  end if;

  v_err := util.error_canal(v_c);
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;

  v_id   := v_c ->> 'id';
  v_tipo := v_c ->> 'tipo';

  select * into v_prev from canales where device_id = v_disp.device_id and id = v_id;
  v_existia := found;

  if not v_existia or v_prev.tipo <> v_tipo then
    select count(*) into v_cuantos from canales where device_id = v_disp.device_id and tipo = v_tipo;
    if v_cuantos >= c_max then
      return json_build_object('ok', false,
        'error', format('Ya tenés %s %s, que es el máximo.', c_max,
                        case v_tipo when 'sensor' then 'sensores' else 'relés' end));
    end if;
  end if;

  -- Si pasa de sensor a relé (o al revés), sus reglas dejan de tener sentido.
  if v_existia and v_prev.tipo <> v_tipo then
    delete from reglas where device_id = v_disp.device_id and (rele = v_id or sensor = v_id);
    get diagnostics v_borradas = row_count;
  end if;

  insert into canales as c (device_id, id, tipo, nombre, unidad, pin, nivel_activo, conexion, libreria, orden)
  values (v_disp.device_id, v_id, v_tipo,
          nullif(btrim(v_c ->> 'nombre'), ''),
          case when v_tipo = 'sensor' then nullif(btrim(v_c ->> 'unidad'), '') end,
          (v_c ->> 'pin')::numeric::smallint,
          case when v_tipo = 'rele' then v_c ->> 'nivel_activo' end,
          nullif(btrim(v_c ->> 'conexion'), ''),
          case when v_tipo = 'sensor' then nullif(btrim(v_c ->> 'libreria'), '') end,
          coalesce((select max(orden) + 1 from canales
                     where device_id = v_disp.device_id and tipo = v_tipo), 1))
  on conflict (device_id, id) do update
     set tipo = excluded.tipo, nombre = excluded.nombre, unidad = excluded.unidad,
         pin = excluded.pin, nivel_activo = excluded.nivel_activo,
         conexion = excluded.conexion, libreria = excluded.libreria,
         orden = case when c.tipo = excluded.tipo then c.orden else excluded.orden end
  returning * into v_nuevo;

  return json_build_object('ok', true, 'nuevo', not v_existia,
    'canal', util.canal_json(v_nuevo), 'reglas_borradas', v_borradas);
end;
$$;

create or replace function public.borrar_canal(p_admin text, p_id text)
returns json
language plpgsql
volatile
security definer
set search_path = public, util, extensions
as $$
declare
  v_disp     dispositivos%rowtype := util.por_admin(p_admin);
  v_id       text := lower(btrim(coalesce(p_id, '')));
  v_reglas   int;
begin
  if v_disp.device_id is null or not v_disp.activo then
    return json_build_object('ok', false, 'error', 'Tu sesión no es válida. Volvé a entrar con tu PIN.');
  end if;

  select count(*) into v_reglas
    from reglas where device_id = v_disp.device_id and (rele = v_id or sensor = v_id);

  delete from canales where device_id = v_disp.device_id and id = v_id;
  if not found then
    return json_build_object('ok', false, 'error', format('No tenés ningún sensor ni relé "%s".', v_id));
  end if;

  -- Si la placa lo sigue mandando, pasa a aparecer como "detectado".
  return json_build_object('ok', true, 'borrado', v_id, 'reglas_borradas', v_reglas);
end;
$$;

-- -------------------------------------------------------------------
--  guardar_regla(admin, {rele, sensor, condicion, umbral, hist, activa})
--
--  Una por relé: si el relé ya tiene regla, se reemplaza. "hist" y "activa"
--  son opcionales; si no vienen, se conserva lo que había (o 1 y false).
-- -------------------------------------------------------------------
create or replace function public.guardar_regla(p_admin text, p_regla json)
returns json
language plpgsql
volatile
security definer
set search_path = public, util, extensions
as $$
declare
  v_disp     dispositivos%rowtype := util.por_admin(p_admin);
  v_r        jsonb := p_regla::jsonb;
  v_sensores text[];
  v_reles    text[];
  v_err      text;
  v_trae_hist   boolean;
  v_trae_activa boolean;
begin
  if v_disp.device_id is null or not v_disp.activo then
    return json_build_object('ok', false, 'error', 'Tu sesión no es válida. Volvé a entrar con tu PIN.');
  end if;

  select coalesce(array_agg(id) filter (where tipo = 'sensor'), '{}'),
         coalesce(array_agg(id) filter (where tipo = 'rele'), '{}')
    into v_sensores, v_reles
    from canales where device_id = v_disp.device_id;

  v_err := util.error_regla(v_r, v_sensores, v_reles);
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;

  v_trae_hist   := coalesce(jsonb_typeof(v_r -> 'hist'), 'null') <> 'null';
  v_trae_activa := coalesce(jsonb_typeof(v_r -> 'activa'), 'null') <> 'null';

  insert into reglas as g (device_id, rele, sensor, condicion, umbral, hist, activa)
  values (v_disp.device_id, v_r ->> 'rele', v_r ->> 'sensor', v_r ->> 'condicion',
          (v_r ->> 'umbral')::numeric,
          coalesce((v_r ->> 'hist')::numeric, 1),
          coalesce((v_r ->> 'activa')::boolean, false))
  on conflict (device_id, rele) do update
     set sensor    = excluded.sensor,
         condicion = excluded.condicion,
         umbral    = excluded.umbral,
         hist      = case when v_trae_hist   then excluded.hist   else g.hist   end,
         activa    = case when v_trae_activa then excluded.activa else g.activa end;

  return json_build_object('ok', true, 'reglas', util.reglas_json(v_disp.device_id, false));
end;
$$;

create or replace function public.borrar_regla(p_admin text, p_rele text)
returns json
language plpgsql
volatile
security definer
set search_path = public, util, extensions
as $$
declare
  v_disp dispositivos%rowtype := util.por_admin(p_admin);
  v_rele text := lower(btrim(coalesce(p_rele, '')));
begin
  if v_disp.device_id is null or not v_disp.activo then
    return json_build_object('ok', false, 'error', 'Tu sesión no es válida. Volvé a entrar con tu PIN.');
  end if;

  delete from reglas where device_id = v_disp.device_id and rele = v_rele;
  if not found then
    return json_build_object('ok', false, 'error', format('El relé "%s" no tiene regla.', v_rele));
  end if;

  return json_build_object('ok', true, 'borrada', v_rele);
end;
$$;


-- ===================================================================
--  APP KODULAR (con clave)
-- ===================================================================

-- -------------------------------------------------------------------
--  leer_estado(clave)
--
--  STABLE a propósito: eso permite llamarla por GET con los parámetros en
--  la URL, y por lo tanto SIN HEADERS desde el componente Web de Kodular.
--
--  Los valores van en el primer nivel ("t", "bomba", "suelo") porque así se
--  leen con un solo bloque de diccionario. Lo declarado está SIEMPRE, con 0
--  si todavía no llegó, para que la app nunca pida una clave que no existe;
--  "faltan" dice cuáles de esos ceros no son datos reales.
--
--  "pendientes" son los comandos que la placa todavía no recogió. Con eso la
--  app puede mostrar "enviando…" en vez de un botón que parece no responder.
--
--  Las claves salen en orden fijo (sistema, sensores, relés, detectados,
--  estado) para que el JSON se pueda leer a ojo en el navegador.
-- -------------------------------------------------------------------
create or replace function public.leer_estado(p_clave text)
returns json
language plpgsql
stable
security definer
set search_path = public, util, extensions
as $$
declare
  v_disp       dispositivos%rowtype := util.por_clave(p_clave);
  v_e          estado%rowtype;
  v_valores    jsonb;
  v_ids        text[];
  v_detectados text[];
  v_faltan     text[] := '{}';
  v_pendientes text[];
  v_res        json;
begin
  if v_disp.device_id is null then
    return json_build_object('ok', false, 'error', 'Clave inválida. Sacá la tuya del portal.');
  end if;

  if not v_disp.activo then
    return json_build_object('ok', false, 'error', 'Dispositivo desactivado. Hablá con el docente.');
  end if;

  select * into v_e from estado where device_id = v_disp.device_id;
  v_valores := coalesce(v_e.valores, '{}');

  select coalesce(array_agg(id), '{}') into v_ids from canales where device_id = v_disp.device_id;

  select coalesce(array_agg(k order by k), '{}') into v_detectados
    from jsonb_object_keys(v_valores) as k
   where not (k = any(v_ids));

  -- Antes del primer sync no "falta" nada: la placa todavía no habló.
  if v_e.visto_en is not null then
    select coalesce(array_agg(c.id order by c.tipo desc, c.orden, c.id), '{}') into v_faltan
      from canales c
     where c.device_id = v_disp.device_id and not (v_valores ? c.id);
  end if;

  select coalesce(array_agg(cmd order by id), '{}') into v_pendientes
    from comandos where device_id = v_disp.device_id;

  with pares(ord, k, v) as (
    select 1::bigint, 'ok'::text, 'true'::json
    union all select 2, 'device_id', to_json(v_disp.device_id)
    union all select 3, 'alumno',    to_json(v_disp.alumno)

    union all
    select 100 + row_number() over (order by c.tipo desc, c.orden, c.id), c.id,
           coalesce((v_valores -> c.id)::json, '0'::json)
      from canales c
     where c.device_id = v_disp.device_id

    union all
    select 900 + n, k, (v_valores -> k)::json
      from unnest(v_detectados) with ordinality as d(k, n)

    union all select 2000, 'detectados', to_json(v_detectados)
    union all select 2001, 'faltan',     to_json(v_faltan)
    union all select 2002, 'pendientes', to_json(v_pendientes)
    union all select 2003, 'reglas',     util.reglas_json(v_disp.device_id, false)::json
    -- segundos desde el último sync válido; -1 = la placa nunca se conectó.
    -- Si pasa de ~30 la app tiene que mostrar "desconectada" en vez de
    -- datos viejos que parecen vivos.
    union all select 2004, 'edad',
           to_json(case when v_e.visto_en is null then -1
                        else floor(extract(epoch from now() - v_e.visto_en))::int end)
    union all select 2005, 'avisos',       to_json(coalesce(v_e.avisos, '{}'))
    union all select 2006, 'ultimo_error', coalesce(to_json(v_e.ultimo_error), 'null'::json)
    union all select 2007, 'syncs',        to_json(coalesce(v_e.syncs, 0))
  )
  select json_object_agg(k, v order by ord) into v_res from pares;

  return v_res;
end;
$$;

-- -------------------------------------------------------------------
--  enviar_comando(clave, 'rele=1')
--
--  Se pueden comandar los relés declarados y los detectados que valen 1 o 0
--  (un relé que el alumno sumó al sketch y todavía no declaró).
--
--  Un comando manual desactiva la regla de ESE relé, y solo esa. Si no, el
--  alumno aprieta un botón y cinco segundos después la regla lo revierte:
--  la app parecería rota cuando en realidad hace lo que le dijeron.
-- -------------------------------------------------------------------
create or replace function public.enviar_comando(p_clave text, p_cmd text)
returns json
language plpgsql
volatile
security definer
set search_path = public, util, extensions
as $$
declare
  v_disp     dispositivos%rowtype := util.por_clave(p_clave);
  v_valores  jsonb;
  v_ids      text[];
  v_validas  text[];
  v_cmd      text := lower(btrim(coalesce(p_cmd, '')));
  v_rele     text;
  v_valor    text;
  v_corte    int;
  v_cola     int;
  v_apagadas int;
begin
  if v_disp.device_id is null or not v_disp.activo then
    return json_build_object('ok', false, 'error', 'Clave inválida o dispositivo desactivado.');
  end if;

  select coalesce(valores, '{}') into v_valores from estado where device_id = v_disp.device_id;
  select coalesce(array_agg(id), '{}') into v_ids from canales where device_id = v_disp.device_id;

  select coalesce(array_agg(id order by orden, id), '{}') into v_validas
    from canales where device_id = v_disp.device_id and tipo = 'rele';

  v_validas := v_validas || coalesce(
    (select array_agg(key order by key) from jsonb_each(coalesce(v_valores, '{}'))
      where not (key = any(v_ids)) and value in ('0'::jsonb, '1'::jsonb)), '{}');

  v_corte := position('=' in v_cmd);
  if v_corte < 2 then
    return json_build_object('ok', false,
      'error', format('Comando inválido: "%s". El formato es rele=valor, por ejemplo %s=1.',
                      p_cmd, coalesce(v_validas[1], 'bomba')),
      'reles_validos', to_json(v_validas));
  end if;

  v_rele  := btrim(substring(v_cmd from 1 for v_corte - 1));
  v_valor := btrim(substring(v_cmd from v_corte + 1));

  if not (v_rele = any(v_validas)) then
    return json_build_object('ok', false,
      'error', format('No tenés ningún relé "%s".', v_rele),
      'reles_validos', to_json(v_validas));
  end if;

  if v_valor not in ('0', '1', 'on', 'off', 'true', 'false') then
    return json_build_object('ok', false,
      'error', format('Valor inválido: "%s". Usá 1 para prender y 0 para apagar.', v_valor));
  end if;

  v_valor := case when v_valor in ('1', 'on', 'true') then '1' else '0' end;

  -- Un botón trabado o un bucle en la app no pueden llenar la cola.
  select count(*) into v_cola from comandos where device_id = v_disp.device_id;
  if v_cola >= 20 then
    delete from comandos
     where id in (select id from comandos where device_id = v_disp.device_id
                   order by id limit (v_cola - 19));
  end if;

  insert into comandos (device_id, cmd) values (v_disp.device_id, v_rele || '=' || v_valor);

  update reglas set activa = false
   where device_id = v_disp.device_id and rele = v_rele and activa;
  get diagnostics v_apagadas = row_count;

  return json_build_object('ok', true, 'cmd', v_rele || '=' || v_valor,
                           'regla_desactivada', v_apagadas > 0);
end;
$$;

-- -------------------------------------------------------------------
--  ajustar_regla(clave, rele, {activa, umbral, hist})
--
--  Lo que la app Kodular puede tocar del modo automático: prenderlo,
--  apagarlo y mover el umbral. Crear o borrar reglas, o cambiar qué sensor
--  mira, es estructura y se hace desde el portal con el PIN.
-- -------------------------------------------------------------------
create or replace function public.ajustar_regla(p_clave text, p_rele text, p_cambios json)
returns json
language plpgsql
volatile
security definer
set search_path = public, util, extensions
as $$
declare
  v_disp   dispositivos%rowtype := util.por_clave(p_clave);
  v_rele   text := lower(btrim(coalesce(p_rele, '')));
  v_c      jsonb := p_cambios::jsonb;
  v_regla  reglas%rowtype;
  v_extra  text;
  v_activa boolean;
begin
  if v_disp.device_id is null or not v_disp.activo then
    return json_build_object('ok', false, 'error', 'Clave inválida o dispositivo desactivado.');
  end if;

  select * into v_regla from reglas where device_id = v_disp.device_id and rele = v_rele;
  if not found then
    return json_build_object('ok', false,
      'error', format('El relé "%s" no tiene regla. Las reglas se crean en el portal, en Configurar.', v_rele));
  end if;

  if v_c is null or jsonb_typeof(v_c) <> 'object' or v_c = '{}'::jsonb then
    return json_build_object('ok', false,
      'error', 'p_cambios tiene que ser un objeto JSON con lo que cambia, por ejemplo {"activa": true, "umbral": 30}');
  end if;

  select k into v_extra from jsonb_object_keys(v_c) as k where k not in ('activa', 'umbral', 'hist') limit 1;
  if v_extra is not null then
    return json_build_object('ok', false,
      'error', format('Desde la app solo se puede cambiar "activa", "umbral" e "hist", no "%s". '
                      'Para cambiar el sensor o la condición, usá el portal.', v_extra));
  end if;

  -- "activa" acepta true/false y también 1/0, porque en bloques de Kodular
  -- a veces es más fácil mandar un número.
  if v_c ? 'activa' then
    v_activa := case
                  when jsonb_typeof(v_c -> 'activa') = 'boolean' then (v_c ->> 'activa')::boolean
                  when v_c -> 'activa' in ('0'::jsonb, '1'::jsonb) then (v_c ->> 'activa') = '1'
                end;
    if v_activa is null then
      return json_build_object('ok', false, 'error', '"activa" tiene que ser true o false (o 1 o 0), sin comillas');
    end if;
  end if;

  if v_c ? 'umbral' and jsonb_typeof(v_c -> 'umbral') <> 'number' then
    return json_build_object('ok', false, 'error', '"umbral" tiene que ser un número, sin comillas');
  end if;

  if v_c ? 'hist' and (jsonb_typeof(v_c -> 'hist') <> 'number' or (v_c ->> 'hist')::numeric < 0) then
    return json_build_object('ok', false, 'error', '"hist" tiene que ser un número mayor o igual a 0, sin comillas');
  end if;

  update reglas
     set activa = coalesce(v_activa, activa),
         umbral = coalesce((v_c ->> 'umbral')::numeric, umbral),
         hist   = coalesce((v_c ->> 'hist')::numeric, hist)
   where device_id = v_disp.device_id and rele = v_rele
  returning * into v_regla;

  return json_build_object('ok', true, 'regla', json_build_object(
    'rele', v_regla.rele, 'sensor', v_regla.sensor, 'condicion', v_regla.condicion,
    'umbral', v_regla.umbral, 'hist', v_regla.hist, 'activa', v_regla.activa));
end;
$$;


-- ===================================================================
--  ESP32 (con clave)
-- ===================================================================

-- -------------------------------------------------------------------
--  sync(clave, estado) -> {cmd, reglas, avisos}
--
--  Una sola llamada manda el estado y recibe los comandos pendientes y las
--  reglas activas. Agregar un sensor más no cuesta una request más.
-- -------------------------------------------------------------------
create or replace function public.sync(p_clave text, p_estado json)
returns json
language plpgsql
volatile
security definer
set search_path = public, util, extensions
as $$
declare
  v_disp     dispositivos%rowtype := util.por_clave(p_clave);
  v_e        estado%rowtype;
  v_sensores text[];
  v_reles    text[];
  v_res      record;
  v_avisos    text[];
  v_cmds      json;
  v_aplicados jsonb;
begin
  -- 1. identificar
  if v_disp.device_id is null then
    return json_build_object('ok', false,
      'error', 'Clave inválida. Revisá la constante CLAVE de tu sketch; sacala del portal.');
  end if;

  if not v_disp.activo then
    return json_build_object('ok', false, 'error', 'Dispositivo desactivado. Hablá con el docente.');
  end if;

  select * into v_e from estado where device_id = v_disp.device_id;
  if not found then
    insert into estado (device_id) values (v_disp.device_id) returning * into v_e;
  end if;

  -- 2. rate limit
  --    Código generado por IA a veces sale con el POST dentro del loop sin
  --    ningún delay. Se mide contra ultimo_intento y no contra visto_en: si
  --    no, una placa que manda JSON inválido en un loop nunca se frenaría,
  --    porque sus syncs nunca son válidos.
  if v_e.ultimo_intento is not null and now() - v_e.ultimo_intento < interval '3 seconds' then
    return json_build_object('ok', false,
      'error', 'Demasiado rápido: esperá al menos 3 segundos entre syncs. '
            || 'En el loop usá millis() para espaciarlos, no llames a sync() en cada vuelta.');
  end if;

  -- 3. forma: lo que está mal armado se rechaza
  select coalesce(array_agg(id) filter (where tipo = 'sensor'), '{}'),
         coalesce(array_agg(id) filter (where tipo = 'rele'), '{}')
    into v_sensores, v_reles
    from canales where device_id = v_disp.device_id;

  select * into v_res from util.validar_estado(p_estado, v_sensores, v_reles);

  if v_res.error is not null then
    -- se guarda para que el alumno lo vea en el portal, sin monitor serie
    update estado set ultimo_error = v_res.error, ultimo_intento = now()
     where device_id = v_disp.device_id;

    return json_build_object('ok', false, 'error', v_res.error,
      'recibido', p_estado, 'esperado', util.estado_esperado(v_disp.device_id));
  end if;

  -- 4. nombres: lo que no coincide con lo declarado se avisa, sin rechazar.
  --    El alumno cambia el portal y el sketch por separado; rechazar acá
  --    dejaría la placa desconectada cada vez que declara algo antes de
  --    reflashear.
  -- Mismo orden que leer_estado: sensores, relés, y después los no declarados.
  select coalesce(array_agg(mensaje order by grupo, tipo desc, orden, id), '{}') into v_avisos
    from (
      select 1 as grupo, c.tipo, c.orden, c.id,
             format('no llegó un valor para ''%s''%s, que está declarado',
                    c.id, coalesce(' (' || c.nombre || ')', '')) as mensaje
        from canales c
       where c.device_id = v_disp.device_id and not (v_res.valores ? c.id)
      union all
      select 2, '', 0, k,
             format('llegó ''%s'', que no está declarado. Si es nuevo, agregalo en el portal; '
                    'si es un error de nombre, corregilo en el sketch.', k)
        from jsonb_object_keys(v_res.valores) as k
       where not (k = any(v_sensores || v_reles))
    ) as a;

  -- 5. guardar
  update estado
     set valores = v_res.valores,
         avisos = v_avisos,
         visto_en = now(),
         ultimo_intento = now(),
         ultimo_error = null,
         syncs = syncs + 1
   where device_id = v_disp.device_id;

  -- 6. entregar los comandos pendientes y vaciarlos en el mismo paso.
  --    De paso se calcula cómo queda cada relé comandado (si hubo dos
  --    comandos para el mismo, gana el último).
  with entregados as (
    delete from comandos where device_id = v_disp.device_id returning id, cmd
  ), ultimos as (
    select distinct on (split_part(cmd, '=', 1))
           split_part(cmd, '=', 1) as rele, split_part(cmd, '=', 2)::int as valor
      from entregados
     order by split_part(cmd, '=', 1), id desc
  )
  select coalesce((select json_agg(cmd order by id) from entregados), '[]'::json),
         coalesce((select jsonb_object_agg(rele, valor) from ultimos), '{}'::jsonb)
    into v_cmds, v_aplicados;

  -- 7. reflejar ya lo que se acaba de entregar.
  --    La placa aplica los comandos apenas recibe esta respuesta, pero lo que
  --    reportó en ESTE sync es el estado de antes. Sin esto, la app mostraría
  --    el relé viejo hasta el sync siguiente: un ciclo entero de demora, que
  --    es justo lo que se nota al apretar ON y ver que el botón no cambia. Si
  --    la placa no lo aplicara, su próximo sync lo corrige solo.
  if v_aplicados <> '{}'::jsonb then
    update estado set valores = valores || v_aplicados where device_id = v_disp.device_id;
  end if;

  return json_build_object(
    'ok', true,
    'cmd', v_cmds,
    'reglas', util.reglas_json(v_disp.device_id, true),
    'avisos', to_json(v_avisos));
end;
$$;


-- -------------------------------------------------------------------
--  salud() — para el cron diario que evita la pausa por inactividad,
--  y para mirar de un vistazo cómo viene la clase.
-- -------------------------------------------------------------------
create or replace function public.salud()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'ok', true,
    'ts', now(),
    'dispositivos', (select count(*) from dispositivos),
    'conectados', (select count(*) from estado where visto_en > now() - interval '30 seconds'),
    'con_error', (select count(*) from estado where ultimo_error is not null),
    'con_avisos', (select count(*) from estado where cardinality(avisos) > 0)
  );
$$;


-- ===================================================================
--  Permisos: estas once funciones son toda la API pública.
--
--  'anon' es el ROL de Postgres, no la clave: Supabase mapea la publishable
--  key (sb_publishable_...) a este rol. El nombre del rol no cambió con las
--  claves nuevas.
-- ===================================================================
grant usage on schema public to anon;

grant execute on function public.entrar(text, text, text)           to anon;
grant execute on function public.leer_config(text)                  to anon;
grant execute on function public.guardar_canal(text, json)          to anon;
grant execute on function public.borrar_canal(text, text)           to anon;
grant execute on function public.guardar_regla(text, json)          to anon;
grant execute on function public.borrar_regla(text, text)           to anon;
grant execute on function public.leer_estado(text)                  to anon;
grant execute on function public.enviar_comando(text, text)         to anon;
grant execute on function public.ajustar_regla(text, text, json)    to anon;
grant execute on function public.sync(text, json)                   to anon;
grant execute on function public.salud()                            to anon;
