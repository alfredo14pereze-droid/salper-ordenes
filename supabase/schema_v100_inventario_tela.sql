-- =====================================================================
-- V100 — Inventario de tela (Fase 2, Parte 2)
-- =====================================================================
-- Objetivo: llevar el inventario de cada tela del catálogo (V12) como la
-- suma de sus movimientos, no como un número editable a mano.
--
-- Todo aditivo: una columna nullable en telas + una tabla nueva + una
-- vista + RPCs nuevos. Ninguna tela/orden existente se rompe.
--
-- CRITERIO DE SIGNO en movimientos_tela.cantidad (elegido para que el
-- inventario sea una suma simple, sin CASE por tipo):
--   - 'entrada'        siempre positiva (recepción de proveedor).
--   - 'consumo_corte'  siempre negativa (se resta del inventario). No se
--                       genera todavía desde esta Parte 2 — la tabla ya
--                       queda lista para que la Parte 3 (consumo real por
--                       orden, ver el placeholder "Reporte de consumo" en
--                       EstacionOrderPage.jsx para el rol `corte`) inserte
--                       aquí con orden_id.
--   - 'ajuste'          puede ser + o -, según si el conteo físico salió
--                       arriba o abajo de lo esperado (nota obligatoria).
-- inventario_actual de una tela = sum(cantidad) de sus movimientos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) telas.unidad — nullable, y RPC de edición (no existía ninguna: solo
--    había alta y baja). create_tela gana p_unidad opcional al final —
--    cambia la lista de tipos, así que hace falta el DROP de la firma
--    vieja (gotcha ya documentado en SALPER_Contexto.md).
-- ---------------------------------------------------------------------
alter table public.telas add column if not exists unidad text check (unidad in ('metro', 'kilo'));

drop function if exists public.create_tela(text);

create or replace function public.create_tela(p_nombre text, p_unidad text default null)
returns public.telas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tela public.telas;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo ventas, administrador de fábrica o administrador general pueden dar de alta telas.';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre de la tela no puede estar vacío.';
  end if;
  if p_unidad is not null and p_unidad not in ('metro', 'kilo') then
    raise exception 'Unidad inválida: %. Debe ser metro o kilo.', p_unidad;
  end if;

  insert into public.telas (nombre, unidad) values (trim(p_nombre), p_unidad)
  on conflict (nombre_normalizado) do nothing;

  select * into v_tela from public.telas where nombre_normalizado = lower(trim(p_nombre));
  return v_tela;
end;
$$;
revoke execute on function public.create_tela(text, text) from public;
grant execute on function public.create_tela(text, text) to authenticated;

create or replace function public.update_tela(p_id uuid, p_nombre text, p_unidad text)
returns public.telas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tela public.telas;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo ventas, administrador de fábrica o administrador general pueden editar telas.';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre de la tela no puede estar vacío.';
  end if;
  if p_unidad is not null and p_unidad not in ('metro', 'kilo') then
    raise exception 'Unidad inválida: %. Debe ser metro o kilo.', p_unidad;
  end if;

  update public.telas set nombre = trim(p_nombre), unidad = p_unidad where id = p_id
  returning * into v_tela;

  if v_tela.id is null then
    raise exception 'La tela no existe.';
  end if;
  return v_tela;
end;
$$;
revoke execute on function public.update_tela(uuid, text, text) from public;
grant execute on function public.update_tela(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2) movimientos_tela
-- ---------------------------------------------------------------------
create table if not exists public.movimientos_tela (
  id uuid primary key default gen_random_uuid(),
  tela_id uuid not null references public.telas(id) on delete restrict,
  tipo text not null check (tipo in ('entrada', 'consumo_corte', 'ajuste')),
  cantidad numeric not null check (cantidad <> 0),
  unidad text not null,
  orden_id uuid references public.orders(id) on delete set null,
  usuario_id uuid references auth.users(id) on delete set null,
  fecha timestamptz not null default now(),
  nota text
);
create index if not exists movimientos_tela_tela_idx on public.movimientos_tela (tela_id, fecha desc);
create index if not exists movimientos_tela_orden_idx on public.movimientos_tela (orden_id) where orden_id is not null;

alter table public.movimientos_tela enable row level security;
drop policy if exists "Lectura pública movimientos_tela" on public.movimientos_tela;
create policy "Lectura pública movimientos_tela" on public.movimientos_tela for select to anon, authenticated using (true);
grant select on public.movimientos_tela to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) v_inventario_telas — inventario calculado, lectura tan abierta como
--    telas (el catálogo ya es público en modo invitado).
-- ---------------------------------------------------------------------
create or replace view public.v_inventario_telas as
select
  t.id as tela_id,
  t.nombre,
  t.unidad,
  coalesce(sum(m.cantidad), 0) as inventario_actual
from public.telas t
left join public.movimientos_tela m on m.tela_id = t.id
group by t.id, t.nombre, t.unidad;

grant select on public.v_inventario_telas to anon, authenticated;

-- movimientos_tela.usuario_id apunta a auth.users, no a profiles — igual
-- que orden_etapas.responsable_id ya hacía (mismo patrón) — así que
-- PostgREST no puede resolver el nombre con un embed directo, y
-- `profiles` tiene RLS (solo tu propio perfil, o admin_general ve todos):
-- cualquier otro rol viendo el historial no vería el nombre de nadie más.
-- Esta vista corre con los privilegios de quien la crea (no
-- security_invoker), así que sí puede leer todos los profiles y exponer
-- SOLO full_name — nada más sensible del perfil.
create or replace view public.v_movimientos_tela as
select
  m.id, m.tela_id, m.tipo, m.cantidad, m.unidad, m.orden_id, m.nota, m.fecha,
  m.usuario_id, p.full_name as usuario_nombre
from public.movimientos_tela m
left join public.profiles p on p.id = m.usuario_id;

grant select on public.v_movimientos_tela to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) RPCs de escritura — exclusivas admin_fabrica/admin_general (pedido
--    explícito del usuario; "super_admin" no existe como rol, se usa
--    admin_general).
-- ---------------------------------------------------------------------
create or replace function public.registrar_entrada_tela(p_tela_id uuid, p_cantidad numeric, p_nota text default null)
returns public.movimientos_tela
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidad text;
  v_row public.movimientos_tela;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_fabrica', 'admin_general') then
    raise exception 'No tienes permiso para registrar entradas de tela.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;

  select unidad into v_unidad from public.telas where id = p_tela_id;
  if v_unidad is null then
    raise exception 'Esta tela no tiene una unidad de medida definida. Configúrala en Catálogos antes de registrar movimientos.';
  end if;

  insert into public.movimientos_tela (tela_id, tipo, cantidad, unidad, usuario_id, nota)
  values (p_tela_id, 'entrada', p_cantidad, v_unidad, auth.uid(), nullif(trim(coalesce(p_nota, '')), ''))
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.registrar_entrada_tela(uuid, numeric, text) from public;
grant execute on function public.registrar_entrada_tela(uuid, numeric, text) to authenticated;

create or replace function public.registrar_ajuste_tela(p_tela_id uuid, p_cantidad numeric, p_nota text)
returns public.movimientos_tela
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidad text;
  v_row public.movimientos_tela;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_fabrica', 'admin_general') then
    raise exception 'No tienes permiso para registrar ajustes de inventario.';
  end if;
  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'La cantidad del ajuste no puede ser cero.';
  end if;
  if coalesce(trim(p_nota), '') = '' then
    raise exception 'Explica el motivo del ajuste en la nota.';
  end if;

  select unidad into v_unidad from public.telas where id = p_tela_id;
  if v_unidad is null then
    raise exception 'Esta tela no tiene una unidad de medida definida. Configúrala en Catálogos antes de registrar movimientos.';
  end if;

  insert into public.movimientos_tela (tela_id, tipo, cantidad, unidad, usuario_id, nota)
  values (p_tela_id, 'ajuste', p_cantidad, v_unidad, auth.uid(), trim(p_nota))
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.registrar_ajuste_tela(uuid, numeric, text) from public;
grant execute on function public.registrar_ajuste_tela(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5) get_tela_delete_impact / delete_tela — ahora también cuentan/bloquean
--    por movimientos_tela (antes solo avisaban de productos). Cambia el
--    tipo de retorno de get_tela_delete_impact, así que también necesita
--    el DROP.
-- ---------------------------------------------------------------------
drop function if exists public.get_tela_delete_impact(uuid);

create or replace function public.get_tela_delete_impact(p_id uuid)
returns table (productos_count bigint, movimientos_count bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
begin
  if coalesce(v_role, '') <> 'admin_general' then
    raise exception 'Solo un administrador general puede consultar esto.';
  end if;
  return query select
    (select count(*) from public.productos where tela_id = p_id),
    (select count(*) from public.movimientos_tela where tela_id = p_id);
end;
$function$;
revoke execute on function public.get_tela_delete_impact(uuid) from public;
grant execute on function public.get_tela_delete_impact(uuid) to authenticated;

create or replace function public.delete_tela(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo un administrador general puede eliminar una tela.';
  end if;
  if exists (select 1 from public.movimientos_tela where tela_id = p_id) then
    raise exception 'Esta tela ya tiene movimientos de inventario registrados y no se puede eliminar.';
  end if;
  delete from public.telas where id = p_id;
end;
$function$;
revoke execute on function public.delete_tela(uuid) from public;
grant execute on function public.delete_tela(uuid) to authenticated;
