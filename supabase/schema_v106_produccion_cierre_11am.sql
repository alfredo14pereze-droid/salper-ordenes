-- =====================================================================
-- V106 — Producción: el cierre del jueves es a las 11 AM, no "todo el día"
-- =====================================================================
-- V104 movió el cierre automático de "en cuanto termina el martes" a
-- "desde el jueves" — pero seguía siendo una comparación de FECHA nada
-- más, así que en la práctica cerraba desde la medianoche del jueves.
-- El usuario precisó la hora real: el cierre es a las 11 AM del jueves
-- (la revisión para definir premios de nómina es a mediodía) — antes de
-- esa hora, si algún admin abre "Revisión producción" por cualquier
-- motivo, la semana debe seguir abierta para que Juanis termine de
-- capturar los papelitos del martes.
--
-- Único cambio: la comparación pasa de fecha a fecha+hora exacta
-- (fecha_fin + 2 días, a las 11:00 hora Torreón). Mismo nombre/firma,
-- sin tocar tablas ni otras funciones.
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
   where estado = 'abierta'
     and (fecha_fin + 2)::timestamp + interval '11 hours' <= (now() at time zone 'America/Monterrey');
  get diagnostics n = row_count;
  return n;
end; $$;
revoke execute on function public.prod_cerrar_vencidas() from public;
