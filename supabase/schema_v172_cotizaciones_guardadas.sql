-- =====================================================================
-- V172 — Cotizaciones de destajo guardadas (2026-10-31)
-- =====================================================================
-- Pedido de Alfredo: el Cotizador calcula y no guarda nada, así que hay que
-- rehacer cada cotización. Ahora se puede guardar con un nombre y
-- consultarla, imprimir su hoja de operaciones o volver a cotizarla.
--
-- Qué agrega:
--   · Tabla cotizaciones_destajo: nombre, nota, prenda, piezas, operadoras,
--     precio por segundo y minutos por día usados, y una copia de las
--     operaciones elegidas tal como estaban ese día (folio, parte,
--     operación, segundos). Si el catálogo cambia después, la cotización
--     guardada no cambia.
--   · guardar_cotizacion_destajo(...): toma la copia de las operaciones
--     desde prod_operaciones (no confía en lo que mande la pantalla).
--   · borrar_cotizacion_destajo(id): la quita de la lista (no se borra
--     de la base; queda con fecha de borrado).
--
-- Quién: los mismos que usan el Cotizador (admin_general y admin_fabrica).
-- Aditivo: no toca prod_operaciones ni nada existente.
--
-- Rollback:
--   drop function public.guardar_cotizacion_destajo(text, text, text, integer[], integer, integer, numeric, numeric);
--   drop function public.borrar_cotizacion_destajo(uuid);
--   drop table public.cotizaciones_destajo;
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regclass('public.prod_operaciones') is null then
    raise exception 'V172: no encuentro prod_operaciones. No se aplicó nada.';
  end if;
end $$;

-- 1) Tabla
create table if not exists public.cotizaciones_destajo (
  id                uuid primary key default gen_random_uuid(),
  creado_en         timestamptz not null default now(),
  creado_por        uuid default auth.uid(),
  creado_por_nombre text,
  nombre            text not null check (btrim(nombre) <> ''),
  nota              text,
  prenda            text not null,
  piezas            integer not null check (piezas > 0),
  operadoras        integer not null check (operadoras between 1 and 60),
  costo_por_segundo numeric(10,5) not null check (costo_por_segundo > 0),
  minutos_dia       numeric(8,2) not null check (minutos_dia > 0),
  operaciones       jsonb not null check (jsonb_typeof(operaciones) = 'array' and jsonb_array_length(operaciones) > 0),
  eliminada_en      timestamptz
);
create index if not exists cotizaciones_destajo_creado_idx on public.cotizaciones_destajo (creado_en desc);

alter table public.cotizaciones_destajo enable row level security;
drop policy if exists "Lectura cotizaciones_destajo" on public.cotizaciones_destajo;
create policy "Lectura cotizaciones_destajo" on public.cotizaciones_destajo
  for select to authenticated using (
    eliminada_en is null
    and coalesce(public.current_user_role(), '') in ('admin_general', 'admin_fabrica')
  );
-- Sin políticas de escritura: todo pasa por las funciones de abajo.
revoke all on public.cotizaciones_destajo from public, anon, authenticated;
grant select on public.cotizaciones_destajo to authenticated;

-- 2) Guardar
create or replace function public.guardar_cotizacion_destajo(
  p_nombre text,
  p_nota text,
  p_prenda text,
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

  select count(distinct x) into v_pedidas from unnest(coalesce(p_folios, '{}')) as x where x is not null;
  if v_pedidas = 0 then
    raise exception 'Marca al menos una operación.';
  end if;

  select jsonb_agg(jsonb_build_object('folio', folio, 'parte', parte, 'operacion', operacion, 'segundos', segundos) order by folio),
         count(*)
    into v_ops, v_n
    from public.prod_operaciones
   where prenda = p_prenda and folio = any(p_folios);
  if v_n <> v_pedidas then
    raise exception 'Algunas operaciones ya no están en el catálogo de %. Recarga la página.', p_prenda;
  end if;

  insert into public.cotizaciones_destajo (
    creado_por, creado_por_nombre, nombre, nota, prenda, piezas, operadoras,
    costo_por_segundo, minutos_dia, operaciones
  ) values (
    auth.uid(),
    (select nullif(btrim(full_name), '') from public.profiles where id = auth.uid()),
    btrim(p_nombre),
    nullif(btrim(coalesce(p_nota, '')), ''),
    p_prenda, p_piezas, p_operadoras,
    p_costo_por_segundo, p_minutos_dia, v_ops
  ) returning * into v_row;
  return v_row;
end; $$;
revoke execute on function public.guardar_cotizacion_destajo(text, text, text, integer[], integer, integer, numeric, numeric) from public, anon;
grant execute on function public.guardar_cotizacion_destajo(text, text, text, integer[], integer, integer, numeric, numeric) to authenticated;

-- 3) Quitar de la lista
create or replace function public.borrar_cotizacion_destajo(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.current_user_role(), '') not in ('admin_general', 'admin_fabrica') then
    raise exception 'Solo el administrador general o de fábrica pueden borrar cotizaciones.';
  end if;
  update public.cotizaciones_destajo set eliminada_en = now()
   where id = p_id and eliminada_en is null;
  if not found then
    raise exception 'No encuentro la cotización.';
  end if;
end; $$;
revoke execute on function public.borrar_cotizacion_destajo(uuid) from public, anon;
grant execute on function public.borrar_cotizacion_destajo(uuid) to authenticated;

-- Verificación (solo lectura):
--   select count(*) from public.cotizaciones_destajo;   -- 0
