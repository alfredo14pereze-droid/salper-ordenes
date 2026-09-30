-- =====================================================================
-- V101 — Consumos por prenda y cálculo de comprometido/disponible
-- (Fase 2, Parte 3)
-- =====================================================================
-- Objetivo: calcular automáticamente cuánta tela va a consumir cada
-- orden y compararlo contra el inventario disponible.
--
-- Diagnóstico previo (confirmado con el usuario antes de aplicar): no
-- existe un catálogo formal de "prendas" — `garment` en orders.items es
-- texto libre (o uno de 5 valores fijos de JS para sublimación). Por eso
-- `consumos_prenda.prenda` es texto normalizado (mismo patrón que
-- telas.nombre_normalizado), comparado contra item.garment. Todo aditivo:
-- tabla nueva + funciones nuevas + vista extendida (columnas nuevas AL
-- FINAL, no se quitan las de V100) — ninguna orden/tela existente se
-- rompe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) consumos_prenda
-- ---------------------------------------------------------------------
create table if not exists public.consumos_prenda (
  id uuid primary key default gen_random_uuid(),
  prenda text not null,
  prenda_normalizada text generated always as (lower(trim(prenda))) stored,
  tallas text[],
  consumo numeric not null check (consumo > 0),
  unidad text not null check (unidad in ('metro', 'kilo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists consumos_prenda_prenda_idx on public.consumos_prenda (prenda_normalizada);

alter table public.consumos_prenda enable row level security;
drop policy if exists "Lectura pública consumos_prenda" on public.consumos_prenda;
create policy "Lectura pública consumos_prenda" on public.consumos_prenda for select to anon, authenticated using (true);
grant select on public.consumos_prenda to anon, authenticated;

-- "Guardar" (alta o edición) con la validación de traslapes que pidió el
-- usuario: una misma talla no puede aparecer en dos filas de la misma
-- prenda, y solo puede haber un "promedio general" (tallas is null) por
-- prenda. No se puede expresar esto con un CHECK/constraint simple de
-- Postgres (necesita comparar contra OTRAS filas), así que vive aquí.
create or replace function public.guardar_consumo_prenda(
  p_id uuid, p_prenda text, p_tallas text[], p_consumo numeric, p_unidad text
) returns public.consumos_prenda
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.consumos_prenda;
  v_prenda_norm text := lower(trim(p_prenda));
  v_tallas text[];
  v_choque text[];
begin
  if coalesce(public.current_user_role(), '') not in ('admin_fabrica', 'admin_general') then
    raise exception 'No tienes permiso para editar consumos por prenda.';
  end if;
  if coalesce(trim(p_prenda), '') = '' then
    raise exception 'La prenda no puede estar vacía.';
  end if;
  if p_consumo is null or p_consumo <= 0 then
    raise exception 'El consumo debe ser mayor a cero.';
  end if;
  if p_unidad not in ('metro', 'kilo') then
    raise exception 'Unidad inválida: %. Debe ser metro o kilo.', p_unidad;
  end if;

  -- normaliza y quita duplicados/vacíos dentro del mismo arreglo
  if p_tallas is not null then
    select array_agg(distinct t) into v_tallas from unnest(p_tallas) as t where trim(t) <> '';
    if array_length(v_tallas, 1) is null then
      v_tallas := null;
    end if;
  end if;

  if v_tallas is null then
    if exists (
      select 1 from public.consumos_prenda
      where prenda_normalizada = v_prenda_norm and tallas is null and id is distinct from p_id
    ) then
      raise exception 'Ya existe un promedio general para "%".', p_prenda;
    end if;
  else
    select array_agg(distinct t) into v_choque
    from public.consumos_prenda c, unnest(c.tallas) as t
    where c.prenda_normalizada = v_prenda_norm and c.tallas is not null and c.id is distinct from p_id
      and t = any(v_tallas);
    if v_choque is not null then
      raise exception 'La(s) talla(s) % ya tienen un consumo definido para "%".', array_to_string(v_choque, ', '), p_prenda;
    end if;
  end if;

  if p_id is null then
    insert into public.consumos_prenda (prenda, tallas, consumo, unidad)
    values (trim(p_prenda), v_tallas, p_consumo, p_unidad)
    returning * into v_row;
  else
    update public.consumos_prenda
       set prenda = trim(p_prenda), tallas = v_tallas, consumo = p_consumo, unidad = p_unidad, updated_at = now()
     where id = p_id
    returning * into v_row;
    if v_row.id is null then
      raise exception 'El consumo no existe.';
    end if;
  end if;
  return v_row;
end;
$$;
revoke execute on function public.guardar_consumo_prenda(uuid, text, text[], numeric, text) from public;
grant execute on function public.guardar_consumo_prenda(uuid, text, text[], numeric, text) to authenticated;

create or replace function public.eliminar_consumo_prenda(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_user_role(), '') not in ('admin_fabrica', 'admin_general') then
    raise exception 'No tienes permiso para eliminar consumos por prenda.';
  end if;
  delete from public.consumos_prenda where id = p_id;
end;
$$;
revoke execute on function public.eliminar_consumo_prenda(uuid) from public;
grant execute on function public.eliminar_consumo_prenda(uuid) to authenticated;

-- Prendas ya usadas en órdenes reales — no hay catálogo formal de prendas
-- contra qué validar "prenda no encontrada" en el import de CSV, así que
-- se usa el histórico real como referencia (solo informativo).
create or replace function public.fetch_prendas_conocidas()
returns table (garment text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct trim(item->>'garment') as garment
  from public.orders, jsonb_array_elements(items) as item
  where trim(coalesce(item->>'garment', '')) <> '';
$$;
revoke execute on function public.fetch_prendas_conocidas() from public;
grant execute on function public.fetch_prendas_conocidas() to authenticated;

-- ---------------------------------------------------------------------
-- 2) calcular_consumo_orden — motor de cálculo (Paso 3). Recibe el
--    arreglo de prendas de una orden (guardada o el borrador que tienda
--    todavía está armando en pantalla, sin necesidad de guardar primero)
--    y regresa: consumo estimado por tela, renglones sin consumo
--    registrado, y renglones cuya unidad no coincide con la de su tela
--    (no se suman, solo se reportan).
-- ---------------------------------------------------------------------
create or replace function public.calcular_consumo_orden(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_size jsonb;
  v_tela_id text;
  v_tela_unidad text;
  v_garment text;
  v_talla text;
  v_cantidad numeric;
  v_consumo numeric;
  v_consumo_unidad text;
  v_por_tela jsonb := '{}'::jsonb;
  v_sin_consumo jsonb := '[]'::jsonb;
  v_no_coincide jsonb := '[]'::jsonb;
  v_acumulado numeric;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_tela_id := v_item->>'tela_id';
    if v_tela_id is null or v_tela_id = '' then
      continue;
    end if;
    select unidad into v_tela_unidad from public.telas where id = v_tela_id::uuid;
    v_garment := lower(trim(coalesce(v_item->>'garment', '')));

    for v_size in select * from jsonb_array_elements(coalesce(v_item->'sizes', '[]'::jsonb))
    loop
      v_talla := v_size->>'talla';
      v_cantidad := nullif(v_size->>'cantidad', '')::numeric;
      if v_cantidad is null or v_cantidad <= 0 then
        continue;
      end if;

      v_consumo := null;
      select consumo, unidad into v_consumo, v_consumo_unidad
      from public.consumos_prenda
      where prenda_normalizada = v_garment and tallas is not null and v_talla = any(tallas)
      limit 1;

      if v_consumo is null then
        select consumo, unidad into v_consumo, v_consumo_unidad
        from public.consumos_prenda
        where prenda_normalizada = v_garment and tallas is null
        limit 1;
      end if;

      if v_consumo is null then
        v_sin_consumo := v_sin_consumo || jsonb_build_object('garment', v_item->>'garment', 'talla', v_talla);
        continue;
      end if;

      if v_tela_unidad is not null and v_consumo_unidad <> v_tela_unidad then
        v_no_coincide := v_no_coincide || jsonb_build_object(
          'garment', v_item->>'garment', 'talla', v_talla,
          'consumo_unidad', v_consumo_unidad, 'tela_unidad', v_tela_unidad
        );
        continue;
      end if;

      v_acumulado := coalesce((v_por_tela->>v_tela_id)::numeric, 0) + (v_cantidad * v_consumo);
      v_por_tela := jsonb_set(v_por_tela, array[v_tela_id], to_jsonb(v_acumulado));
    end loop;
  end loop;

  return jsonb_build_object('por_tela', v_por_tela, 'sin_consumo', v_sin_consumo, 'unidad_no_coincide', v_no_coincide);
end;
$$;
revoke execute on function public.calcular_consumo_orden(jsonb) from public;
grant execute on function public.calcular_consumo_orden(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3) v_comprometido_telas — suma calcular_consumo_orden(items) de las
--    órdenes CONFIRMADAS (status <> 'en_confirmacion'), sin soft-delete
--    (cancelled_at is null) y cuya etapa de corte AÚN NO esté completada.
-- ---------------------------------------------------------------------
create or replace view public.v_comprometido_telas as
with ordenes_pendientes_corte as (
  select o.id, o.items
  from public.orders o
  join public.orden_etapas oe on oe.order_id = o.id and oe.etapa = 'corte'
  where o.cancelled_at is null
    and o.status <> 'en_confirmacion'
    and oe.estado <> 'completado'
),
consumo_por_orden as (
  select id, (public.calcular_consumo_orden(items) -> 'por_tela') as por_tela
  from ordenes_pendientes_corte
),
consumo_expandido as (
  select (kv.key)::uuid as tela_id, (kv.value)::numeric as consumo
  from consumo_por_orden, jsonb_each_text(por_tela) as kv
)
select tela_id, sum(consumo) as comprometido
from consumo_expandido
group by tela_id;

grant select on public.v_comprometido_telas to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) v_inventario_telas — se extiende (mismas columnas de V100 + 2
--    nuevas al final: comprometido/disponible). CREATE OR REPLACE VIEW
--    permite agregar columnas al final sin romper nada que ya la usaba.
-- ---------------------------------------------------------------------
create or replace view public.v_inventario_telas as
select
  t.id as tela_id,
  t.nombre,
  t.unidad,
  coalesce(sum(m.cantidad), 0) as inventario_actual,
  coalesce(comp.comprometido, 0) as comprometido,
  coalesce(sum(m.cantidad), 0) - coalesce(comp.comprometido, 0) as disponible
from public.telas t
left join public.movimientos_tela m on m.tela_id = t.id
left join public.v_comprometido_telas comp on comp.tela_id = t.id
group by t.id, t.nombre, t.unidad, comp.comprometido;

grant select on public.v_inventario_telas to anon, authenticated;
