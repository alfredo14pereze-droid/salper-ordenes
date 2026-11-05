-- =====================================================================
-- V183 — Playeras compradas (2026-11-05)
-- =====================================================================
-- Pedido de Alfredo: en una orden, cada playera es "Fabricada" (como hasta
-- hoy) o "Comprada" (se compra hecha y solo se le pone reflejante, etc.).
-- Si es comprada: no le aparece a corte y no consume tela.
--
-- La marca vive en la prenda: orders.items[].comprada = true (sin la clave
-- = fabricada). La pantalla quita la tela de una prenda comprada, así que
-- tampoco cuenta en el consumo estimado ni en lo comprometido.
--
-- Qué cambia en la base:
--   1) orders_tela_obligatoria (V154): una prenda comprada ya no exige tela.
--   2) Nuevo: orden_todo_comprado(items) y el disparador
--      orders_corte_compradas_trg. Si TODAS las prendas de la orden son
--      compradas, la orden no lleva corte: se quita su etapa de corte
--      mientras siga pendiente (igual que bordado desde V25). Si después se
--      vuelve a poner una prenda fabricada, la etapa de corte regresa.
--      Corte ya empezado o terminado no se toca. No aplica a Maquila,
--      Bordado ni Frisa (tienen sus propias reglas).
-- No reemplaza create_order, set_order_items ni ninguna otra función de
-- órdenes: el disparador corre al final de la transacción, cuando la orden
-- ya tiene sus etapas.
--
-- Candado: orders_tela_obligatoria debe ser exactamente la de V154 (md5).
--
-- Rollback:
--   drop trigger orders_corte_compradas_trg on public.orders;
--   drop function public.orders_corte_compradas();
--   drop function public.orden_todo_comprado(jsonb);
--   y volver a correr schema_v154_tela_obligatoria.sql.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
declare
  v_md5 text;
begin
  if to_regclass('public.orden_etapas') is null or to_regclass('public.plantillas_etapas') is null then
    raise exception 'V183: falta orden_etapas o plantillas_etapas. No se aplicó nada.';
  end if;
  select md5(prosrc) into v_md5 from pg_proc where oid = to_regprocedure('public.orders_tela_obligatoria()');
  if v_md5 is null then
    raise exception 'V183: falta orders_tela_obligatoria (V154). No se aplicó nada.';
  end if;
  -- V154 original, o V183 ya aplicada (se puede volver a correr).
  if v_md5 not in ('9c3e77690da5836e4a1d10f1d00cef07', '4388fea55313a149832ea5ef2f845c67') then
    raise exception 'V183: orders_tela_obligatoria no es la de V154 (alguien la cambió). No se aplicó nada.';
  end if;
end $$;

-- 1) ¿Todas las prendas (con contenido) son compradas? Sin prendas → false.
create or replace function public.orden_todo_comprado(p_items jsonb)
returns boolean
language sql immutable set search_path = public as $$
  with prendas as (
    select it
      from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) it
     where jsonb_typeof(it) = 'object'
       and (btrim(coalesce(it->>'garment', '')) <> ''
            or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(it->'sizes') = 'array' then it->'sizes' else '[]'::jsonb end) sz
                        where jsonb_typeof(sz) = 'object' and btrim(coalesce(sz->>'talla', '')) <> ''))
  )
  select count(*) > 0 and bool_and(coalesce(it->>'comprada', '') = 'true')
    from prendas
$$;
revoke execute on function public.orden_todo_comprado(jsonb) from public, anon;
grant execute on function public.orden_todo_comprado(jsonb) to authenticated;

-- 2) Tela obligatoria (V154): igual, pero una prenda comprada no la exige.
create or replace function public.orders_tela_obligatoria()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_prenda text;
begin
  if new.order_type_key in ('maquila', 'bordado')
     or not exists (select 1 from public.plantillas_etapas where order_type_key = new.order_type_key and etapa = 'corte') then
    return new;
  end if;

  select coalesce(nullif(btrim(it->>'garment'), ''), 'Una prenda') into v_prenda
  from jsonb_array_elements(case when jsonb_typeof(new.items) = 'array' then new.items else '[]'::jsonb end) it
  where jsonb_typeof(it) = 'object'
    and (btrim(coalesce(it->>'garment', '')) <> ''
         or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(it->'sizes') = 'array' then it->'sizes' else '[]'::jsonb end) sz
                    where jsonb_typeof(sz) = 'object' and btrim(coalesce(sz->>'talla', '')) <> ''))
    and btrim(coalesce(it->>'tela_id', '')) = ''
    and coalesce(it->>'comprada', '') <> 'true'
  limit 1;

  if v_prenda is not null then
    raise exception '%: falta elegir la tela. Es obligatoria para que corte pueda registrar lo que usa.', v_prenda;
  end if;
  return new;
end;
$$;
revoke execute on function public.orders_tela_obligatoria() from public, anon, authenticated;

-- 3) Etapa de corte según si todo es comprado
create or replace function public.orders_corte_compradas()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ahora boolean;
  v_antes boolean;
  v_sec integer;
begin
  if new.order_type_key in ('maquila', 'bordado', 'frisa') or new.eliminada_en is not null then
    return null;
  end if;
  select orden_secuencia into v_sec
    from public.plantillas_etapas
   where order_type_key = new.order_type_key and etapa = 'corte';
  if not found then
    return null; -- este tipo de orden no pasa por corte
  end if;

  v_ahora := public.orden_todo_comprado(new.items);
  v_antes := tg_op = 'UPDATE' and public.orden_todo_comprado(old.items);

  if v_ahora then
    delete from public.orden_etapas
     where order_id = new.id and etapa = 'corte' and estado = 'pendiente';
  elsif v_antes then
    -- Volvió a haber una prenda fabricada: regresa la etapa de corte.
    insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
    select new.id, 'corte', 'pendiente', coalesce(v_sec, 1)
     where not exists (select 1 from public.orden_etapas where order_id = new.id and etapa = 'corte');
  end if;
  return null;
end; $$;
revoke execute on function public.orders_corte_compradas() from public, anon, authenticated;

drop trigger if exists orders_corte_compradas_trg on public.orders;
create constraint trigger orders_corte_compradas_trg
  after insert or update of items on public.orders
  deferrable initially deferred
  for each row execute function public.orders_corte_compradas();

-- Verificación (solo lectura): 3 renglones.
select 'orden_todo_comprado' as que, to_regprocedure('public.orden_todo_comprado(jsonb)') is not null as ok
union all
select 'tela_obligatoria acepta compradas', position('comprada' in prosrc) > 0
  from pg_proc where oid = to_regprocedure('public.orders_tela_obligatoria()')
union all
select 'disparador de corte', exists (select 1 from pg_trigger where tgname = 'orders_corte_compradas_trg');
