-- =====================================================================
-- V120 — Perfil de sublimación (Samuel): etapa "Impresión" + diseños
-- =====================================================================
-- Pedido del usuario: el rol `sublimado` debe poder
--   - subir diseños a las órdenes que lo necesiten,
--   - subir propuestas de diseño a las órdenes de sublimación,
--   - reportar cuando una orden de sublimado quede impresa,
-- y ver un dashboard de órdenes de sublimado + las pendientes de impresión.
--
-- Decisiones confirmadas con el usuario antes de escribir esto:
--   1. Etapa NUEVA `impresion`, antes de `sublimado`, solo en las órdenes
--      de sublimación. La reporta el rol `sublimado` (Samuel). La etapa
--      `sublimado` pasa a reportarla el rol `corte` (Pancho).
--   2. Diseños SIN flujo de aprobación de ventas por ahora: solo se suben,
--      marcados como "propuesta" o "final".
--
-- Qué hace:
--   1) Amplía el CHECK de etapa en orden_etapas y plantillas_etapas para
--      aceptar 'impresion'.
--   2) Agrega 'impresion' a la plantilla de `sublimacion` con secuencia 0
--      (sublimado ya es 1, así que queda primero sin renumerar nada).
--      create_order ya copia la plantilla tal cual: las órdenes nuevas la
--      traen solas, sin tocar esa función.
--   3) Agrega la fila de `impresion` a las órdenes de sublimación que ya
--      existen: `completado` si la orden ya se entregó o si alguna otra
--      etapa ya arrancó (ya se imprimió, aunque nadie lo haya reportado);
--      `pendiente` en las demás.
--   4) update_orden_etapa: acepta 'impresion' y cambia el dueño de dos
--      etapas — impresion -> rol sublimado; sublimado -> rol corte. Misma
--      firma (uuid, text, text): CREATE OR REPLACE la reemplaza en su
--      lugar, sin overload nuevo.
--   5) Tabla nueva `orden_disenos` + add_orden_diseno / delete_orden_diseno
--      (roles sublimado, admin_fabrica, admin_general).
--
-- Qué NO toca, a propósito:
--   - orders.status ni su CHECK, ni recompute_order_status. Esa función
--     ya deja el status como está cuando la etapa más avanzada no es una
--     de las que conoce, así que una orden que solo lleva la impresión
--     arrancada se sigue viendo "Confirmado" en el Dashboard; el avance
--     real de la impresión vive en orden_etapas (detalle de la orden,
--     Control rápido y la vista de Samuel).
--   - Storage: los archivos van al bucket `order-photos` que ya existe
--     (mismo patrón que las fotos de bordado), bajo `disenos/<orden>/`.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez (es idempotente: se puede volver a correr sin duplicar).
--
-- ROLLBACK:
--   drop function if exists public.add_orden_diseno(uuid, text, text, text, text);
--   drop function if exists public.delete_orden_diseno(uuid);
--   drop table if exists public.orden_disenos;
--   delete from public.orden_etapas where etapa = 'impresion';
--   delete from public.plantillas_etapas where etapa = 'impresion';
--   y volver a pegar update_orden_etapa de schema_v111_roles_fabrica_parte1.sql.
--   (Los CHECK ampliados pueden quedarse: solo permiten un valor de más.)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) CHECK de etapa: se busca por definición, no por nombre, para no
--    depender de cómo se haya llamado el constraint en la base real.
-- ---------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass as tabla, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.orden_etapas'::regclass, 'public.plantillas_etapas'::regclass)
      and pg_get_constraintdef(oid) ilike '%etapa%'
      and pg_get_constraintdef(oid) ilike '%corte%'
  loop
    execute format('alter table %s drop constraint %I', c.tabla, c.conname);
  end loop;
end $$;

alter table public.orden_etapas add constraint orden_etapas_etapa_check
  check (etapa in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'terminado'));
alter table public.plantillas_etapas add constraint plantillas_etapas_etapa_check
  check (etapa in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'terminado'));

-- ---------------------------------------------------------------------
-- 2) Plantilla de sublimación: impresión va primero.
-- ---------------------------------------------------------------------
insert into public.plantillas_etapas (order_type_key, etapa, orden_secuencia)
values ('sublimacion', 'impresion', 0)
on conflict (order_type_key, etapa) do nothing;

-- ---------------------------------------------------------------------
-- 3) Órdenes de sublimación que ya existen.
-- ---------------------------------------------------------------------
insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia, iniciado_en, completado_en)
select
  o.id,
  'impresion',
  case when ya.impresa then 'completado' else 'pendiente' end,
  0,
  case when ya.impresa then now() else null end,
  case when ya.impresa then now() else null end
from public.orders o
cross join lateral (
  select o.status = 'completado'
    or exists (
      select 1 from public.orden_etapas e
      where e.order_id = o.id and e.estado in ('en_proceso', 'completado')
    ) as impresa
) ya
where o.order_type_key = 'sublimacion'
on conflict (order_id, etapa) do nothing;

-- ---------------------------------------------------------------------
-- 4) update_orden_etapa: mismo cuerpo de V111 + la etapa nueva y el
--    cambio de dueño (impresion -> sublimado, sublimado -> corte).
-- ---------------------------------------------------------------------
create or replace function public.update_orden_etapa(
  p_order_id uuid, p_etapa text, p_nuevo_estado text
) returns public.orden_etapas
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := coalesce(public.current_user_role(), '');
  v_row public.orden_etapas;
  v_permitido boolean;
begin
  if p_etapa not in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'terminado') then
    raise exception 'Etapa inválida: %', p_etapa;
  end if;
  if p_nuevo_estado not in ('pendiente', 'en_proceso', 'completado') then
    raise exception 'Estado inválido: %', p_nuevo_estado;
  end if;

  v_permitido := v_role in ('admin_fabrica', 'admin_general')
    or case p_etapa
         when 'impresion' then v_role = 'sublimado'
         when 'sublimado' then v_role = 'corte'
         when 'produccion' then v_role in ('produccion', 'costura')
         else v_role = p_etapa
       end;
  if not v_permitido then
    raise exception 'No tienes permiso para modificar la etapa %.', p_etapa;
  end if;

  update public.orden_etapas
  set estado = p_nuevo_estado,
      responsable_id = auth.uid(),
      iniciado_en = case
        when p_nuevo_estado = 'en_proceso' and iniciado_en is null then now()
        else iniciado_en
      end,
      completado_en = case
        when p_nuevo_estado = 'completado' then now()
        when p_nuevo_estado <> 'completado' then null
        else completado_en
      end,
      updated_at = now()
  where order_id = p_order_id and etapa = p_etapa
  returning * into v_row;

  if v_row.id is null then
    raise exception 'La orden % no tiene la etapa % en su flujo.', p_order_id, p_etapa;
  end if;

  perform public.recompute_order_status(p_order_id);
  return v_row;
end;
$function$;
revoke execute on function public.update_orden_etapa(uuid, text, text) from public;
grant execute on function public.update_orden_etapa(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5) orden_disenos: una fila por archivo de diseño de una orden.
--    Lectura con sesión; escritura solo por RPC.
-- ---------------------------------------------------------------------
create table if not exists public.orden_disenos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  tipo text not null check (tipo in ('propuesta', 'final')),
  url text not null,
  path text not null,
  nombre text,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);
create unique index if not exists orden_disenos_path_key on public.orden_disenos (path);
create index if not exists orden_disenos_order_idx on public.orden_disenos (order_id);

alter table public.orden_disenos enable row level security;
drop policy if exists "Lectura con sesión orden_disenos" on public.orden_disenos;
create policy "Lectura con sesión orden_disenos" on public.orden_disenos
  for select to authenticated using (true);
revoke all on public.orden_disenos from public, anon, authenticated;
grant select on public.orden_disenos to authenticated;

create or replace function public.add_orden_diseno(
  p_order_id uuid, p_tipo text, p_url text, p_path text, p_nombre text default null
) returns public.orden_disenos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := coalesce(public.current_user_role(), '');
  v_row public.orden_disenos;
  v_tipo_orden text;
  v_eliminada_en timestamptz;
  v_existe boolean := false;
begin
  if v_role not in ('sublimado', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo sublimado o administrador de fábrica pueden subir diseños.';
  end if;
  if p_tipo not in ('propuesta', 'final') then
    raise exception 'Tipo de diseño inválido: %', p_tipo;
  end if;
  if trim(coalesce(p_url, '')) = '' or trim(coalesce(p_path, '')) = '' then
    raise exception 'Falta el archivo del diseño.';
  end if;

  select true, order_type_key, eliminada_en into v_existe, v_tipo_orden, v_eliminada_en
  from public.orders where id = p_order_id;
  if not coalesce(v_existe, false) then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if p_tipo = 'propuesta' and v_tipo_orden is distinct from 'sublimacion' then
    raise exception 'Las propuestas de diseño solo aplican a órdenes de sublimación.';
  end if;

  insert into public.orden_disenos (order_id, tipo, url, path, nombre, creado_por)
  values (p_order_id, p_tipo, p_url, p_path, nullif(trim(coalesce(p_nombre, '')), ''), auth.uid())
  returning * into v_row;
  return v_row;
end;
$function$;
revoke execute on function public.add_orden_diseno(uuid, text, text, text, text) from public;
grant execute on function public.add_orden_diseno(uuid, text, text, text, text) to authenticated;

create or replace function public.delete_orden_diseno(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := coalesce(public.current_user_role(), '');
  v_eliminada_en timestamptz;
begin
  if v_role not in ('sublimado', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo sublimado o administrador de fábrica pueden borrar un diseño.';
  end if;
  select o.eliminada_en into v_eliminada_en
  from public.orden_disenos d join public.orders o on o.id = d.order_id
  where d.id = p_id;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  delete from public.orden_disenos where id = p_id;
end;
$function$;
revoke execute on function public.delete_orden_diseno(uuid) from public;
grant execute on function public.delete_orden_diseno(uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------
-- Verificación (correr después; solo lectura):
--   select etapa, estado, count(*) from public.orden_etapas
--     where etapa = 'impresion' group by 1, 2;
--   select proname, count(*) from pg_proc
--     where proname in ('update_orden_etapa', 'add_orden_diseno', 'delete_orden_diseno')
--     group by 1;   -- debe dar 1 por función
--   select has_function_privilege('anon', 'public.add_orden_diseno(uuid, text, text, text, text)', 'EXECUTE');  -- false
-- ---------------------------------------------------------------------
