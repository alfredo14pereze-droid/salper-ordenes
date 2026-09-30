-- =====================================================================
-- V111 — Roles de fábrica, Parte 1: roles, ruteo y accesos
-- =====================================================================
-- Pedido del usuario a partir de un documento de 5 partes ("Correr en
-- orden: Parte 1 → validar → Parte 2…"). Esta migración es SOLO la
-- Parte 1. Diagnóstico mostrado y confirmado antes de aplicar:
--
-- - Ninguno de los 6 operadores de piso (Pancho/Toño/Carmen/Samuel/
--   Adriana/Jackie) tiene cuenta todavía — así que no hay ninguna fila
--   de `produccion` que migrar a `costura` hoy. Solo se deja el rol
--   disponible para cuando se creen esas cuentas.
-- - `captura_produccion` ya existía desde V66 — no es nuevo, solo se le
--   amplían permisos (ver abajo).
-- - "super_admin" no existe como rol — se usa `admin_general`.
-- - "[ROL DE PAPÁ]" confirmado = `admin_general` (ya podía aprobar
--   premios; sin cambio).
-- - Para Juanis: "Revisión y ranking" = solo el ranking que ya tiene
--   desde V103 (sin montos reales) — sin cambio ahí. "Inventario de
--   insumos" confirmado = el mismo "Inventario de tela" (V100) con otro
--   nombre en el documento, no un catálogo nuevo.
--
-- Todo aditivo: el catálogo de roles gana un valor nuevo (`costura`),
-- `produccion` se queda como deprecated (sin borrarlo — puede que
-- alguna fila vieja de auditoría lo referencie). La etapa en
-- `orden_etapas`/`plantillas_etapas` SIGUE llamándose 'produccion' — no
-- se renombra (eso sería un cambio mucho más grande, y la Parte 2 todavía
-- no confirma la secuencia final de etapas) — en su lugar,
-- `update_orden_etapa` aprende un caso especial: rol `costura` puede
-- tocar la etapa `produccion`, igual que hoy el rol `produccion` podría
-- si alguna vez se usara.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) profiles_role_check: agrega 'costura'.
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
  'ventas', 'contabilidad', 'admin_tienda',
  'corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica',
  'admin_general',
  'lectura', 'tienda',
  'captura_produccion',
  'admin_fabrica_lectura',
  'costura'
));

-- ---------------------------------------------------------------------
-- 2) update_orden_etapa: mismo cuerpo de siempre, con el caso especial
--    costura -> etapa 'produccion'. Misma firma, sin DROP.
-- ---------------------------------------------------------------------
create or replace function public.update_orden_etapa(
  p_order_id uuid, p_etapa text, p_nuevo_estado text
) returns public.orden_etapas
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_row public.orden_etapas;
begin
  if p_etapa not in ('corte', 'sublimado', 'produccion', 'bordado', 'terminado') then
    raise exception 'Etapa inválida: %', p_etapa;
  end if;
  if p_nuevo_estado not in ('pendiente', 'en_proceso', 'completado') then
    raise exception 'Estado inválido: %', p_nuevo_estado;
  end if;
  if coalesce(v_role, '') not in (p_etapa, 'admin_fabrica', 'admin_general')
     and not (p_etapa = 'produccion' and v_role = 'costura') then
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
-- 3) registrar_entrada_tela: se amplía a captura_produccion (Juanis) —
--    SOLO entradas. registrar_ajuste_tela NO se toca, sigue exclusiva
--    admin_fabrica/admin_general.
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
  if coalesce(public.current_user_role(), '') not in ('admin_fabrica', 'admin_general', 'captura_produccion') then
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

-- ---------------------------------------------------------------------
-- 4) create_announcement/delete_announcement: hueco encontrado al revisar
--    esto — el servidor solo bloqueaba 'lectura'/'tienda' (V30); el
--    cliente ya escondía el botón para captura_produccion/
--    admin_fabrica_lectura también, pero el servidor nunca lo exigía —
--    quien llamara el RPC directo sí podía publicar. Se cierra parejo con
--    lo que el cliente ya asumía, y se agregan los roles de estación +
--    costura (regla 4 del documento: permisos reales en Supabase, no solo
--    escondidos en el menú).
-- ---------------------------------------------------------------------
create or replace function public.create_announcement(
  p_title text, p_body text, p_pinned boolean default false
) returns public.announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_announcement public.announcements;
begin
  if coalesce(public.current_user_role(), '') in (
    'lectura', 'tienda', 'captura_produccion', 'admin_fabrica_lectura',
    'corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'costura'
  ) then
    raise exception 'No tienes permiso para publicar anuncios.';
  end if;
  insert into public.announcements (title, body, pinned)
  values (p_title, p_body, coalesce(p_pinned, false))
  returning * into v_announcement;
  return v_announcement;
end;
$$;

create or replace function public.delete_announcement(p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_user_role(), '') in (
    'lectura', 'tienda', 'captura_produccion', 'admin_fabrica_lectura',
    'corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'costura'
  ) then
    raise exception 'No tienes permiso para borrar anuncios.';
  end if;
  delete from public.announcements where id = p_id;
end;
$$;
