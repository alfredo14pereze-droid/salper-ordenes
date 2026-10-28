-- =====================================================================
-- V160 — Entregar orden: admin_tienda también, y "entregar de todos modos"
--        (forzar) con motivo obligatorio y registro.
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo una
-- vez. Todo va en una sola transacción. Se puede volver a correr sin daño.
-- =====================================================================
-- Solo AGREGA: 2 permisos, 1 tabla, 1 función. NO toca update_order_status
-- (la corrección manual de estado sigue igual: admin_fabrica/admin_general,
-- con el candado de V77/V159).
--
-- entregar_orden(orden, forzar, motivo):
--   * Quién: permiso 'orden.entregar' (admin_general, admin_tienda,
--     admin_fabrica; editable en "Roles y permisos").
--   * Revisa lo mismo que siempre (fin_validar_entrega: precios por línea,
--     datos de factura). Si algo falta:
--       - sin forzar → el mismo mensaje de siempre ("No se puede marcar como
--         entregada. Falta precio en …").
--       - forzando → necesita el permiso 'orden.entregar_forzado' y un motivo
--         (5+ letras). Queda una fila en orden_entregas_forzadas con qué
--         faltaba, el motivo, quién y cuándo, y una nota en el historial.
--   * No se puede entregar una orden eliminada, cancelada o ya entregada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guardas
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.fin_validar_entrega(uuid)') is null
     or to_regprocedure('public.orden_faltantes(uuid)') is null
     or to_regprocedure('public.tiene_permiso(text)') is null then
    raise exception 'V160: faltan funciones de V77/V125. No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Permisos (editables en "Roles y permisos")
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('orden.entregar',         'Entregas', 'Marcar orden como entregada',
   'Confirmar la entrega al cliente (la orden pasa a Órdenes pasadas).', 'editar', 60),
  ('orden.entregar_forzado', 'Entregas', 'Entregar aunque falten requisitos',
   'Entregar de todos modos cuando falta precio o datos de factura. Pide motivo y queda registrado.', 'editar', 61)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave)
select r.rol, s.clave
from (values
  ('orden.entregar',         array['admin_general','admin_tienda','admin_fabrica']),
  ('orden.entregar_forzado', array['admin_general','admin_tienda','admin_fabrica'])
) as s(clave, roles)
cross join lateral unnest(s.roles) as r(rol)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) Registro de entregas forzadas
-- ---------------------------------------------------------------------
create table if not exists public.orden_entregas_forzadas (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  bloqueo      text not null,                 -- el mensaje que impedía entregar
  faltantes    jsonb not null default '{}',   -- orden_faltantes() en ese momento
  motivo       text not null check (char_length(btrim(motivo)) >= 5),
  forzada_por  uuid,
  forzada_por_nombre text,
  rol          text,
  creada_en    timestamptz not null default now()
);
create index if not exists orden_entregas_forzadas_order_idx on public.orden_entregas_forzadas (order_id);

alter table public.orden_entregas_forzadas enable row level security;
drop policy if exists "lee entregas forzadas" on public.orden_entregas_forzadas;
create policy "lee entregas forzadas" on public.orden_entregas_forzadas
  for select to authenticated using (public.tiene_permiso('orden.entregar') or public.fin_puede_ver());
revoke all on public.orden_entregas_forzadas from public, anon, authenticated;
grant select on public.orden_entregas_forzadas to authenticated;

-- ---------------------------------------------------------------------
-- 3) entregar_orden
-- ---------------------------------------------------------------------
create or replace function public.entregar_orden(
  p_order_id uuid, p_forzar boolean default false, p_motivo text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_o public.orders;
  v_bloqueo text := null;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_nota text := null;
begin
  if not public.tiene_permiso('orden.entregar') then
    raise exception 'No tienes permiso para marcar órdenes como entregadas.';
  end if;
  select * into v_o from public.orders where id = p_order_id for update;
  if v_o.id is null then raise exception 'Orden no encontrada.'; end if;
  if v_o.eliminada_en is not null then raise exception 'Esta orden fue eliminada y ya no admite cambios.'; end if;
  if v_o.cancelled_at is not null then raise exception 'Esta orden está cancelada.'; end if;
  if v_o.status = 'completado' then raise exception 'Esta orden ya está entregada.'; end if;

  -- Mismas reglas de siempre (precios por línea, factura, excepción temporal).
  begin
    perform public.fin_validar_entrega(p_order_id);
  exception when others then
    v_bloqueo := sqlerrm;
  end;

  if v_bloqueo is not null then
    if not coalesce(p_forzar, false) then
      raise exception '%', v_bloqueo;
    end if;
    if not public.tiene_permiso('orden.entregar_forzado') then
      raise exception 'No tienes permiso para entregar una orden a la que le faltan requisitos. %', v_bloqueo;
    end if;
    if char_length(v_motivo) < 5 then
      raise exception 'Escribe el motivo para entregar de todos modos.';
    end if;
    insert into public.orden_entregas_forzadas (order_id, bloqueo, faltantes, motivo, forzada_por, forzada_por_nombre, rol)
    values (p_order_id, v_bloqueo, public.orden_faltantes(p_order_id), v_motivo, auth.uid(),
            (select full_name from public.profiles where id = auth.uid()), public.current_user_role());
    -- Ej.: "Entregada de todos modos (Falta precio en: Playera M.) Motivo: …"
    v_nota := 'Entregada de todos modos ('
              || btrim(regexp_replace(v_bloqueo, '^No se puede marcar como entregada\.\s*', ''))
              || ') Motivo: ' || v_motivo;
  end if;

  update public.orders set status = 'completado', updated_at = now()
  where id = p_order_id returning * into v_o;
  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (p_order_id, 'completado', v_nota, auth.uid());
  return v_o;
end; $$;

revoke execute on function public.entregar_orden(uuid, boolean, text) from public, anon;
grant execute on function public.entregar_orden(uuid, boolean, text) to authenticated;

-- =====================================================================
-- Verificación (solo lectura) después de aplicar:
--   select rol, clave from rol_permisos where clave like 'orden.entregar%' order by 2, 1;  -- 6 filas
--   select to_regclass('public.orden_entregas_forzadas');                                  -- no null
--   select to_regprocedure('public.entregar_orden(uuid, boolean, text)');                  -- no null
-- =====================================================================
