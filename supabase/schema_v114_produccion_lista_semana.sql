-- =====================================================================
-- V114 — Captura de producción: la lista de "ya capturado" muestra toda la
-- semana de la operadora elegida, no solo el día seleccionado en el picker.
-- Aditivo: RPC nuevo, prod_listar_registros (por día) se queda intacta.
-- =====================================================================

create or replace function public.prod_listar_registros_semana(p_fecha date, p_operadora_id uuid)
returns table (id uuid, folio integer, prenda text, parte text, operacion text, piezas integer,
               fecha date, semana_estado text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_ini date;
begin
  if not public.prod_puede_capturar() then
    raise exception 'No tienes permiso para capturar producción.';
  end if;
  v_ini := p_fecha - ((extract(dow from p_fecha)::int - 3 + 7) % 7);
  return query
  select r.id, r.folio_operacion, o.prenda, o.parte, o.operacion, r.piezas, r.fecha, s.estado, r.created_at
  from public.prod_registros r
  join public.prod_operaciones o on o.folio = r.folio_operacion
  join public.prod_semanas s on s.id = r.semana_id
  where r.operadora_id = p_operadora_id and r.fecha between v_ini and v_ini + 6
  order by r.fecha, r.created_at;
end; $$;
revoke execute on function public.prod_listar_registros_semana(date, uuid) from public;
grant execute on function public.prod_listar_registros_semana(date, uuid) to authenticated;
