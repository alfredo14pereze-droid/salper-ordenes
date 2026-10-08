-- =====================================================================
-- V144 — "Requiere factura" en órdenes de un cliente NO registrado
-- =====================================================================
-- Hasta hoy solo se podía pedir factura en órdenes de un cliente del
-- catálogo, porque la razón social se elige de las del cliente (V77). Las
-- órdenes con "Otro cliente (no registrado)" (frecuentes en sublimación)
-- no tienen client_id y la casilla quedaba bloqueada.
--
-- Ahora esas órdenes pueden marcarse con factura y llevar sus datos
-- fiscales capturados a mano, guardados en la propia orden
-- (orden_facturacion.fiscal_snapshot, que ya existía; razon_social_id
-- queda vacío). No se da de alta nada en el catálogo.
--
-- Los datos fiscales se pueden capturar después: marcar "requiere factura"
-- no los exige. El candado de entrega (V77) sí: una orden con factura no
-- se puede marcar entregada sin razón social, RFC, régimen, código postal
-- y uso de CFDI — vengan del catálogo o capturados a mano.
--
-- Cambios (aditivo):
--   * fin_fiscal_completo(jsonb)            — nueva, interna.
--   * set_orden_facturacion_manual(...)     — nueva.
--   * orden_faltantes                       — parche de una línea, con
--     guarda, sobre la función viva (técnica de V131/V141).
-- No se tocan set_orden_facturacion, orden_totales ni fin_validar_entrega.
--
-- Rollback: volver a correr el bloque del parche cambiando el orden de
-- v_viejo y v_nuevo; drop function public.set_orden_facturacion_manual(uuid, boolean, boolean, jsonb);
-- drop function public.fin_fiscal_completo(jsonb);
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================

create or replace function public.fin_fiscal_completo(p_fiscal jsonb)
returns boolean
language sql immutable
as $$
  select p_fiscal is not null
     and btrim(coalesce(p_fiscal->>'razon_social', '')) <> ''
     and btrim(coalesce(p_fiscal->>'rfc', '')) <> ''
     and btrim(coalesce(p_fiscal->>'regimen_fiscal', '')) <> ''
     and btrim(coalesce(p_fiscal->>'cp_fiscal', '')) <> ''
     and btrim(coalesce(p_fiscal->>'uso_cfdi', '')) <> '';
$$;
revoke execute on function public.fin_fiscal_completo(jsonb) from public, anon;
grant execute on function public.fin_fiscal_completo(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Facturación de una orden sin cliente del catálogo
-- ---------------------------------------------------------------------
create or replace function public.set_orden_facturacion_manual(
  p_order_id uuid, p_requiere boolean, p_incluye_iva boolean, p_fiscal jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_o public.orders;
  v_req boolean := coalesce(p_requiere, false);
  v_f jsonb := coalesce(p_fiscal, '{}'::jsonb);
  v_snap jsonb := null;
begin
  if not public.fin_puede_editar() then
    raise exception 'No tienes permiso para editar la facturación.';
  end if;
  select * into v_o from public.orders o where o.id = p_order_id;
  if v_o.id is null then raise exception 'Orden no encontrada.'; end if;
  if v_o.eliminada_en is not null then raise exception 'Esta orden fue eliminada y ya no admite cambios.'; end if;
  if v_o.status = 'completado' then raise exception 'La orden ya fue entregada; su facturación ya no se puede cambiar.'; end if;
  if v_o.client_id is not null then
    raise exception 'Esta orden es de un cliente del catálogo: elige una de sus razones sociales.';
  end if;

  if v_req then
    v_snap := jsonb_build_object(
      'razon_social_id', null,
      'razon_social', btrim(coalesce(v_f->>'razon_social', '')),
      'rfc', upper(btrim(coalesce(v_f->>'rfc', ''))),
      'regimen_fiscal', btrim(coalesce(v_f->>'regimen_fiscal', '')),
      'cp_fiscal', btrim(coalesce(v_f->>'cp_fiscal', '')),
      'uso_cfdi', btrim(coalesce(v_f->>'uso_cfdi', '')),
      'correo_factura', nullif(btrim(coalesce(v_f->>'correo_factura', '')), ''),
      'manual', true, 'capturado_en', now());
  end if;

  insert into public.orden_facturacion (order_id, requiere_factura, precios_incluyen_iva, razon_social_id, fiscal_snapshot)
  values (p_order_id, v_req, coalesce(p_incluye_iva, true), null, v_snap)
  on conflict (order_id) do update
    set requiere_factura = excluded.requiere_factura, precios_incluyen_iva = excluded.precios_incluyen_iva,
        razon_social_id = null, fiscal_snapshot = excluded.fiscal_snapshot, updated_at = now();
  return public.orden_totales(p_order_id);
end; $$;
revoke execute on function public.set_orden_facturacion_manual(uuid, boolean, boolean, jsonb) from public, anon;
grant execute on function public.set_orden_facturacion_manual(uuid, boolean, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- orden_faltantes: con factura, lo que falta son los DATOS FISCALES (del
-- catálogo o a mano), no forzosamente una razón social del catálogo.
-- ---------------------------------------------------------------------
do $$
declare
  v_viejo constant text := $q$coalesce(v_fact.requiere_factura, false) and v_fact.razon_social_id is null);$q$;
  v_nuevo constant text := $q$coalesce(v_fact.requiere_factura, false) and v_fact.razon_social_id is null and not public.fin_fiscal_completo(v_fact.fiscal_snapshot)); -- V144$q$;
  r record;
  d text;
  nuevo text;
  n int;
begin
  select count(*) into n from pg_proc where proname = 'orden_faltantes' and pronamespace = 'public'::regnamespace;
  if n <> 1 then
    raise exception 'V144: se esperaba una sola copia de orden_faltantes, hay %. No se aplicó el parche.', n;
  end if;
  select p.oid, p.prosrc into r from pg_proc p where p.proname = 'orden_faltantes' and p.pronamespace = 'public'::regnamespace;
  if position(v_nuevo in r.prosrc) > 0 then
    return;  -- ya parcheada
  end if;
  if position(v_viejo in r.prosrc) = 0 then
    raise exception 'V144: orden_faltantes viva no tiene la línea esperada. No se aplicó el parche.';
  end if;
  d := pg_get_functiondef(r.oid);
  nuevo := replace(d, v_viejo, v_nuevo);
  if nuevo = d then
    raise exception 'V144: no pude parchear orden_faltantes.';
  end if;
  execute nuevo;
end $$;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select proname, position('V144' in prosrc) > 0 as parcheada
--   from pg_proc where pronamespace = 'public'::regnamespace and proname = 'orden_faltantes';
--   -- 1 fila: true
--   select has_function_privilege('anon', 'public.set_orden_facturacion_manual(uuid,boolean,boolean,jsonb)', 'execute') as anon_puede,
--          has_function_privilege('authenticated', 'public.set_orden_facturacion_manual(uuid,boolean,boolean,jsonb)', 'execute') as sesion_puede;
--   -- false | true
--   -- Ninguna orden cambia de situación: las que ya tenían razón social siguen completas.
--   select count(*) from public.orden_facturacion where requiere_factura and razon_social_id is null;
-- =====================================================================
