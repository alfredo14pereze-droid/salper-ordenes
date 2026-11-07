-- =====================================================================
-- V191 — Cotizar desde una hoja de operaciones impresa (2026-11-07)
-- =====================================================================
-- Pedido de Alfredo: en el Cotizador, subir la foto o el PDF de una hoja de
-- operaciones (la que imprime la página) y que calcule el costo de mano de
-- obra con esas operaciones. La lectura y el cálculo son en la página; aquí
-- solo hace falta poder GUARDAR esa cotización.
--
-- guardar_cotizacion_destajo (V172) solo acepta operaciones de UNA prenda, y
-- una hoja puede traer operaciones de varias (V182). Por eso:
--
-- Qué agrega (solo una función nueva; no toca tablas ni lo que ya existe):
--   · guardar_cotizacion_hoja(...): igual que guardar_cotizacion_destajo pero
--     acepta folios de cualquier prenda (el folio es único en todo el
--     catálogo). La copia de cada operación guarda también su prenda. La
--     "prenda" de la cotización es la que tiene más operaciones (empate: la
--     del folio más chico). Copia los datos desde prod_operaciones (no confía
--     en lo que mande la pantalla).
--   · Se guarda en la misma tabla cotizaciones_destajo, así sale en la
--     pestaña «Guardadas» como las demás.
--
-- Quién: los mismos que usan el Cotizador (admin_general y admin_fabrica).
--
-- Rollback:
--   drop function public.guardar_cotizacion_hoja(text, text, integer[], integer, integer, numeric, numeric);
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez (todo
-- el bloque, sin seleccionar nada). Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regclass('public.cotizaciones_destajo') is null or to_regclass('public.prod_operaciones') is null then
    raise exception 'V191: no encuentro cotizaciones_destajo o prod_operaciones (falta V172). No se aplicó nada.';
  end if;
end $$;

create or replace function public.guardar_cotizacion_hoja(
  p_nombre text,
  p_nota text,
  p_folios integer[],
  p_piezas integer,
  p_operadoras integer,
  p_costo_por_segundo numeric,
  p_minutos_dia numeric
) returns public.cotizaciones_destajo
language plpgsql security definer set search_path = public as $$
declare
  v_ops jsonb;
  v_n integer;
  v_pedidas integer;
  v_prenda text;
  v_row public.cotizaciones_destajo;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_general', 'admin_fabrica') then
    raise exception 'Solo el administrador general o de fábrica pueden guardar cotizaciones.';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'Ponle un nombre a la cotización.';
  end if;
  if p_piezas is null or p_piezas <= 0 then
    raise exception 'Captura las piezas.';
  end if;
  if p_operadoras is null or p_operadoras < 1 or p_operadoras > 60 then
    raise exception 'Las operadoras deben ser de 1 a 60.';
  end if;
  if p_costo_por_segundo is null or p_costo_por_segundo <= 0 or p_minutos_dia is null or p_minutos_dia <= 0 then
    raise exception 'Faltan el precio por segundo o los minutos por día.';
  end if;

  select count(distinct x) into v_pedidas from unnest(coalesce(p_folios, '{}')) as x where x is not null;
  if v_pedidas = 0 then
    raise exception 'La hoja no tiene ninguna operación que cuente.';
  end if;

  select jsonb_agg(jsonb_build_object('folio', folio, 'prenda', prenda, 'parte', parte, 'operacion', operacion, 'segundos', segundos) order by folio),
         count(*)
    into v_ops, v_n
    from public.prod_operaciones
   where folio = any(p_folios);
  if v_n <> v_pedidas then
    raise exception 'Algunos folios ya no están en el catálogo. Recarga la página.';
  end if;

  select prenda into v_prenda
    from public.prod_operaciones
   where folio = any(p_folios)
   group by prenda
   order by count(*) desc, min(folio)
   limit 1;

  insert into public.cotizaciones_destajo (
    creado_por, creado_por_nombre, nombre, nota, prenda, piezas, operadoras,
    costo_por_segundo, minutos_dia, operaciones
  ) values (
    auth.uid(),
    (select nullif(btrim(full_name), '') from public.profiles where id = auth.uid()),
    btrim(p_nombre),
    nullif(btrim(coalesce(p_nota, '')), ''),
    v_prenda, p_piezas, p_operadoras,
    p_costo_por_segundo, p_minutos_dia, v_ops
  ) returning * into v_row;
  return v_row;
end; $$;
revoke execute on function public.guardar_cotizacion_hoja(text, text, integer[], integer, integer, numeric, numeric) from public, anon;
grant execute on function public.guardar_cotizacion_hoja(text, text, integer[], integer, integer, numeric, numeric) to authenticated;

-- Comprobación (solo lectura): debe salir 1.
select count(*) as v191_lista
  from pg_proc
 where oid = to_regprocedure('public.guardar_cotizacion_hoja(text, text, integer[], integer, integer, numeric, numeric)');
