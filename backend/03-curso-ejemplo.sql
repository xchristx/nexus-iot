-- ===================================================================
--  Nexus IoT — crear un curso
--  Ejecutar DESPUÉS de 01 y 02. Cambiá el código y el nombre.
--
--  El código es lo único que el docente reparte: con eso, su nombre y un
--  PIN que eligen ellos, los alumnos entran solos al portal.
--
--  El curso se crea con la plantilla por defecto (DHT22 + bomba, ventilador
--  y luz, con dos reglas apagadas). Cada alumno recibe una COPIA al darse de
--  alta y después la cambia como quiere.
-- ===================================================================

insert into cursos (codigo, nombre)
values ('IOT2026', 'Internet de las Cosas — 2026')
on conflict (codigo) do nothing;


-- ===================================================================
--  Plantilla del curso (correr sueltas cuando haga falta)
--
--  Cambiar la plantilla afecta SOLO a los alumnos que se registren después.
--  Los que ya están tienen su propia copia.
--
--  Si la plantilla queda mal armada, el trigger la rechaza con un mensaje
--  que dice qué corregir, y no se guarda nada.
-- ===================================================================

-- Ver la plantilla:
--   select jsonb_pretty(plantilla) from cursos where codigo = 'IOT2026';

-- Plantilla vacía, para que cada alumno arme todo desde cero:
--   update cursos set plantilla = '{"sensores": [], "reles": [], "reglas": []}'
--    where codigo = 'IOT2026';

-- Agregar un relé a la plantilla (lo reciben los alumnos NUEVOS):
--   update cursos
--      set plantilla = jsonb_set(plantilla, '{reles}', plantilla -> 'reles' ||
--          '{"id":"riego","nombre":"Riego","pin":25,"nivel_activo":"LOW",
--            "conexion":"IN1 de un segundo módulo de relés"}')
--    where codigo = 'IOT2026';

-- Agregarle un sensor a TODOS los alumnos que ya están (si alguno ya tenía
-- uno con ese id, se lo deja como estaba):
--   insert into canales (device_id, id, tipo, nombre, unidad, conexion, orden)
--   select device_id, 'suelo', 'sensor', 'Humedad de suelo', '%',
--          'sensor capacitivo, salida analógica en GPIO 34', 99
--     from dispositivos where curso = 'IOT2026'
--   on conflict (device_id, id) do nothing;


-- ===================================================================
--  Alumnos
-- ===================================================================

-- Resetear el PIN de un alumno que se lo olvidó. Le queda '0000' hasta que
-- entre; conviene decirle que lo cambie... o elegir otro acá.
-- Además rota clave_admin, así cualquier sesión abierta en otro navegador
-- deja de servir. La clave de la placa y la app NO cambia.
--   update dispositivos
--      set pin_hash = extensions.crypt('0000', extensions.gen_salt('bf', 8)),
--          clave_admin = encode(extensions.gen_random_bytes(12), 'hex'),
--          intentos_fallidos = 0,
--          bloqueado_hasta = null
--    where device_id = 'iot2026-07';

-- Desbloquear a alguien que se equivocó 5 veces, sin cambiarle el PIN:
--   update dispositivos set intentos_fallidos = 0, bloqueado_hasta = null
--    where device_id = 'iot2026-07';

-- Blanquear la clave de la placa y la app de un alumno que la filtró.
-- Tiene que volver al portal a buscar la nueva y reconfigurar sketch y app:
--   update dispositivos set clave = encode(extensions.gen_random_bytes(12), 'hex')
--    where device_id = 'iot2026-07';

-- Cortarle el acceso a uno solo, sin tocar a los demás:
--   update dispositivos set activo = false where device_id = 'iot2026-07';

-- Borrar a un alumno (por ejemplo, se anotó con el nombre mal escrito).
-- Borra en cascada su hardware, reglas, estado y comandos:
--   delete from dispositivos where device_id = 'iot2026-07';

-- Cerrar las inscripciones: los que ya están pueden seguir entrando.
--   update cursos set abierto = false where codigo = 'IOT2026';


-- ===================================================================
--  Ver cómo viene la clase
-- ===================================================================

-- Todo de un vistazo:
--   select d.alumno, d.device_id,
--          (select count(*) from canales c where c.device_id = d.device_id and c.tipo = 'sensor') as sensores,
--          (select count(*) from canales c where c.device_id = d.device_id and c.tipo = 'rele')   as reles,
--          (select count(*) from reglas  r where r.device_id = d.device_id and r.activa)         as reglas_activas,
--          case when e.visto_en is null then 'nunca se conectó'
--               when e.visto_en > now() - interval '30 seconds' then 'conectada'
--               else 'desconectada hace ' || age(now(), e.visto_en)::text end as placa,
--          e.valores, e.avisos, e.ultimo_error
--     from dispositivos d
--     left join estado e using (device_id)
--    where d.curso = 'IOT2026'
--    order by d.device_id;

-- Lo más útil antes de una clase: quién tiene la placa mandando algo mal,
-- y quién tiene nombres que no coinciden con lo que declaró.
--   select d.alumno, d.device_id, e.ultimo_error, e.avisos
--     from dispositivos d join estado e using (device_id)
--    where e.ultimo_error is not null or cardinality(e.avisos) > 0;
