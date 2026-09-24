-- ===================================================================
--  Nexus IoT — BORRAR TODO
--
--  ⚠️  ESTO BORRA TODOS LOS DATOS: cursos, alumnos, claves, entradas,
--  salidas, reglas y estados. No se puede deshacer.
--
--  Existe para pasar de las versiones anteriores (hardware fijo, por curso,
--  o con sensores y relés en vez de entradas y salidas) a esta. Se corre UNA
--  vez, antes de 01-esquema.sql, y solo mientras no haya alumnos usando el
--  sistema.
--
--  No toca la extensión pgcrypto: en Supabase la administra la plataforma.
-- ===================================================================

-- Las tablas arrastran sus triggers, índices y claves foráneas.
drop table if exists comandos, estado, reglas, canales, dispositivos, cursos cascade;
drop sequence if exists dispositivos_num;

-- Funciones públicas de todas las versiones.
drop function if exists public.registrar(text, text);
drop function if exists public.leer_perfil(text);
drop function if exists public.set_auto(text, json);
drop function if exists public.entrar(text, text, text);
drop function if exists public.leer_config(text);
drop function if exists public.guardar_canal(text, json);
drop function if exists public.borrar_canal(text, text);
drop function if exists public.guardar_regla(text, json);
drop function if exists public.borrar_regla(text, text);
drop function if exists public.ajustar_regla(text, text, json);
drop function if exists public.leer_estado(text);
drop function if exists public.enviar_comando(text, text);
drop function if exists public.sync(text, json);
drop function if exists public.salud();

-- Todos los helpers viven acá.
drop schema if exists util cascade;
