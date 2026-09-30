-- =====================================================================
-- V104 — Producción: el cierre automático de semana espera un día más
-- =====================================================================
-- Pedido del usuario: la producción de una semana (miércoles a martes)
-- se sigue capturando el MIÉRCOLES siguiente (los papelitos del martes se
-- meten al sistema hasta el día después) — la revisión de verdad, para
-- definir premios de nómina, es hasta el JUEVES.
--
-- El diseño original (V69) cerraba la semana apenas terminaba el martes
-- ("en cuanto termina el martes, a las 00:00"), lo cual es un día
-- demasiado pronto: si un admin abría "Revisión producción" el miércoles
-- (por cualquier motivo, no necesariamente para esa semana), la semana
-- que Juanis seguía llenando se cerraba de golpe (en_revision) y ella se
-- quedaba sin poder seguir capturando esos papelitos — solo
-- admin_general/admin_fabrica pueden capturar en una semana en_revision.
--
-- Único cambio: mover el umbral un día (cierra a partir del jueves, no
-- del miércoles). Misma firma, sin tocar tablas ni otras funciones — el
-- botón manual "Cerrar semana" no se toca, sigue disponible si algún
-- admin quiere cerrarla antes a propósito.
-- =====================================================================

create or replace function public.prod_cerrar_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.prod_semanas
     set estado = 'en_revision'
   where estado = 'abierta' and fecha_fin < (now() at time zone 'America/Monterrey')::date - 1;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke execute on function public.prod_cerrar_vencidas() from public;
