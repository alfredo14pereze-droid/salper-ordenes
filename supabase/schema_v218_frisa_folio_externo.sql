-- =====================================================================
-- V218 — Frisa: "Folio externo" en las órdenes de taller (2026-11-23)
-- =====================================================================
-- Pedido de Alfredo: al crear o editar una orden de taller de Frisa, capturar
-- el folio de nuestro control interno de órdenes (texto libre, cualquier
-- formato, opcional). También en órdenes FR que ya existen.
--
-- La columna `orders.folio_externo` (text, NULL, sin default) YA EXISTE desde
-- V32 y nadie la usa desde V42 (V42 pasó el "folio del control anterior" a
-- `folios_externos text[]`, que se queda igual). Se reusa aquí, solo para
-- órdenes Frisa. Las 2 filas viejas que la traen (SUB-001, SUB-002) no son
-- Frisa: no se tocan y la app no las muestra.
--
-- 100% compatible hacia atrás:
--   · No cambia ninguna tabla (el ADD COLUMN IF NOT EXISTS no hace nada si
--     ya existe), ni create_order, ni create_order_frisa, ni update_order_details.
--   · Solo agrega UNA función nueva. La app de hoy sigue igual aunque no
--     se suba el frontend nuevo.
-- Se puede correr dos veces. Rollback al final.
-- =====================================================================

alter table public.orders add column if not exists folio_externo text;

-- Guardar / cambiar / quitar el folio externo de una orden Frisa.
-- Quién: los mismos que crean órdenes Frisa (ventas, admin_tienda,
-- admin_general = create_order_frisa) o quien tenga fr.ordenes (Restock).
-- Vacío = se quita (NULL). Se guarda sin espacios al inicio ni al final.
create or replace function public.frisa_set_folio_externo(p_order_id uuid, p_folio text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o public.orders;
  v_folio text := nullif(btrim(coalesce(p_folio, '')), '');
begin
  if not (coalesce(public.current_user_role(), '') in ('ventas', 'admin_tienda', 'admin_general')
          or public.tiene_permiso('fr.ordenes')) then
    raise exception 'No tienes permiso para cambiar el folio externo de órdenes de Frisa.' using errcode = '42501';
  end if;
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'No existe la orden.'; end if;
  if v_o.order_type_key <> 'frisa' then raise exception 'La orden % no es de Frisa.', v_o.order_number; end if;
  if v_o.eliminada_en is not null then raise exception 'La orden % está eliminada.', v_o.order_number; end if;
  if length(v_folio) > 60 then raise exception 'El folio externo es muy largo (máximo 60 caracteres).'; end if;

  if v_o.folio_externo is not distinct from v_folio then
    return v_o;
  end if;

  update public.orders set folio_externo = v_folio, updated_at = now()
  where id = p_order_id
  returning * into v_o;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (p_order_id, v_o.status,
          case when v_folio is null then 'Se quitó el folio externo.'
               else format('Folio externo: %s', v_folio) end,
          auth.uid());
  return v_o;
end $$;

revoke execute on function public.frisa_set_folio_externo(uuid, text) from public, anon;
grant execute on function public.frisa_set_folio_externo(uuid, text) to authenticated;

-- Comprobación (debe dar: 1 · true · false · 2)
select (select count(*) from pg_proc where proname = 'frisa_set_folio_externo') as versiones,
       has_function_privilege('authenticated', 'public.frisa_set_folio_externo(uuid, text)', 'EXECUTE') as authenticated_puede,
       has_function_privilege('anon', 'public.frisa_set_folio_externo(uuid, text)', 'EXECUTE') as anon_puede,
       (select count(*) from public.orders where folio_externo is not null) as filas_con_folio_externo;

-- ---------------------------------------------------------------------
-- Rollback (no borra la columna: ya existía desde V32):
--   drop function if exists public.frisa_set_folio_externo(uuid, text);
-- ---------------------------------------------------------------------
