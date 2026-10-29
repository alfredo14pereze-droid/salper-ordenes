-- =====================================================================
-- V165 — Sublimación: "Diseño autorizado" (2026-10-29)
-- =====================================================================
-- Pedido de Alfredo para la pantalla de Samuel (rol sublimado). Las órdenes
-- de sublimación van en secuencia:
--   1. Pendientes de diseño     (diseño sin autorizar — el estado por omisión)
--   2. Pendientes de impresión  (diseño autorizado, etapa impresion sin terminar)
--   3. Pendientes de sublimado  (impresa, etapa sublimado sin terminar)
-- Al presionar "Diseño autorizado" la orden pasa a impresión.
--
-- Decisiones de Alfredo:
--   · Autorizan sublimado (Samuel), admin_fabrica y admin_general
--     (permiso nuevo dis.autorizar, editable en "Roles y permisos").
--   · No se exige tener un diseño final subido (la pantalla solo avisa).
--   · Las órdenes cuya impresión ya empezó o terminó quedan autorizadas
--     (con la hora en que empezó la impresión, sin "quién").
--
-- Aditivo: 3 columnas en orders, 1 permiso, 1 función nueva. NO toca
-- orden_etapas, update_orden_etapa, reportar_impresion ni orders.status:
-- autorizar no cambia el estado de la orden.
--
-- Rollback: drop function public.autorizar_diseno(uuid, boolean);
--           delete from public.rol_permisos where clave = 'dis.autorizar';
--           delete from public.permisos_catalogo where clave = 'dis.autorizar';
--           alter table public.orders drop column diseno_autorizado_en,
--             drop column diseno_autorizado_por, drop column diseno_autorizado_nombre;
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regprocedure('public.tiene_permiso(text)') is null then
    raise exception 'V165: no encuentro tiene_permiso(text). No se aplicó nada.';
  end if;
end $$;

-- 1) Columnas
alter table public.orders
  add column if not exists diseno_autorizado_en timestamptz,
  add column if not exists diseno_autorizado_por uuid,
  add column if not exists diseno_autorizado_nombre text;

-- 2) Permiso
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('dis.autorizar', 'Sublimación', 'Autorizar diseños',
   'Marcar el diseño de una orden de sublimación como autorizado (pasa a pendientes de impresión) o quitar la autorización.',
   'editar', 80)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave)
select r.rol, 'dis.autorizar'
from unnest(array['sublimado', 'admin_fabrica', 'admin_general']) as r(rol)
on conflict do nothing;

-- 3) Función: autorizar (p_autorizado = true) o quitar la autorización (false)
create or replace function public.autorizar_diseno(p_order_id uuid, p_autorizado boolean default true)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden public.orders;
  v_imp text;
  v_nombre text;
begin
  if not public.tiene_permiso('dis.autorizar') then
    raise exception 'No tienes permiso para autorizar diseños.';
  end if;

  select * into v_orden from public.orders where id = p_order_id for update;
  if v_orden.id is null then
    raise exception 'No encuentro la orden.';
  end if;
  if v_orden.order_type_key <> 'sublimacion' then
    raise exception 'Solo las órdenes de sublimación llevan autorización de diseño.';
  end if;
  if v_orden.cancelled_at is not null or v_orden.eliminada_en is not null then
    raise exception 'La orden está cancelada.';
  end if;

  if p_autorizado then
    if v_orden.diseno_autorizado_en is not null then
      return v_orden;  -- ya estaba autorizado: no se cambia quién ni cuándo
    end if;
    select nullif(trim(full_name), '') into v_nombre
      from public.profiles where id = auth.uid();
    update public.orders set
      diseno_autorizado_en = now(),
      diseno_autorizado_por = auth.uid(),
      diseno_autorizado_nombre = v_nombre
    where id = p_order_id
    returning * into v_orden;
  else
    select estado into v_imp from public.orden_etapas
      where order_id = p_order_id and etapa = 'impresion';
    if coalesce(v_imp, 'pendiente') <> 'pendiente' then
      raise exception 'La impresión ya empezó; ya no se puede quitar la autorización del diseño.';
    end if;
    update public.orders set
      diseno_autorizado_en = null,
      diseno_autorizado_por = null,
      diseno_autorizado_nombre = null
    where id = p_order_id
    returning * into v_orden;
  end if;
  return v_orden;
end;
$$;
revoke execute on function public.autorizar_diseno(uuid, boolean) from public, anon;
grant execute on function public.autorizar_diseno(uuid, boolean) to authenticated;

-- 4) Órdenes que ya empezaron o terminaron su impresión: autorizadas
update public.orders o set
  diseno_autorizado_en = coalesce(e.iniciado_en, e.completado_en, e.estado_cambiado_en, now())
from public.orden_etapas e
where e.order_id = o.id
  and e.etapa = 'impresion'
  and e.estado in ('en_proceso', 'completado')
  and o.order_type_key = 'sublimacion'
  and o.diseno_autorizado_en is null;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'orders' and column_name like 'diseno\_autorizado%';
--   -- 3 filas
--   select rol from public.rol_permisos where clave = 'dis.autorizar' order by 1;
--   -- admin_fabrica, admin_general, sublimado
--   select has_function_privilege('anon', 'public.autorizar_diseno(uuid,boolean)', 'execute') as anon_puede,
--          has_function_privilege('authenticated', 'public.autorizar_diseno(uuid,boolean)', 'execute') as sesion_puede;
--   -- false | true
--   select count(*) filter (where diseno_autorizado_en is not null) as autorizadas,
--          count(*) filter (where diseno_autorizado_en is null) as sin_autorizar
--   from public.orders where order_type_key = 'sublimacion' and cancelled_at is null and status <> 'completado';
-- =====================================================================
