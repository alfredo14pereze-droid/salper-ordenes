-- =====================================================================
-- V58 — Documentos de la orden: varios por tipo, y ventas/contabilidad
--       pueden subirlos aunque la orden ya esté confirmada
-- =====================================================================
-- Pedido del usuario: "quiero que las personas de ventas y contabilidad
-- puedan subir las cotizaciones y órdenes de compra una vez que está
-- creada la orden también, y quiero que se pueda subir más de una."
--
-- Antes: una sola columna por tipo en `orders` (cotizacion_pdf_path,
-- orden_compra_pdf_path, factura_pdf_path) — un PDF por tipo, y ventas/
-- contabilidad solo podían subir cotización/orden de compra mientras la
-- orden seguía `en_confirmacion` (set_order_document).
--
-- Ahora: tabla `order_documentos` (una fila por archivo, cualquier
-- cantidad por tipo). ADITIVO — las 3 columnas viejas y set_order_document
-- NO se borran:
--   - Los PDFs que ya existían se COPIAN a la tabla nueva (no se pierde
--     ninguno).
--   - set_order_document (que un navegador con la página vieja abierta
--     todavía puede llamar) ahora también refleja el archivo en la tabla
--     nueva, para que nada subido desde una pestaña desactualizada quede
--     invisible.
--
-- Reglas de quién sube/borra (mismo criterio en add/delete):
--   cotización y orden de compra: ventas, contabilidad, admin_tienda,
--     admin_general — SIN tope de estado de la orden (antes ventas/
--     contabilidad solo mientras `en_confirmacion`).
--   factura: contabilidad, admin_tienda, admin_general (ventas nunca) —
--     igual que antes.
-- Una orden eliminada (soft-delete) ya no admite cambios de nadie.
--
-- Acceso de lectura: solo con sesión (los PDFs pueden traer precios; el
-- bucket `orden-documentos` ya es privado). Escritura: solo por RPC
-- SECURITY DEFINER con revoke ... from public + grant ... to authenticated.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. add_order_documento / delete_order_documento son NUEVAS
-- (sin overloads que limpiar); set_order_document conserva su firma
-- (uuid, text, text), así que CREATE OR REPLACE la reemplaza en su lugar
-- y conserva sus GRANTs.
-- =====================================================================

create table if not exists public.order_documentos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('cotizacion', 'orden_compra', 'factura')),
  path text not null,
  nombre text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);
create unique index if not exists order_documentos_path_key on public.order_documentos (path);
create index if not exists order_documentos_order_kind_idx on public.order_documentos (order_id, kind);

alter table public.order_documentos enable row level security;
drop policy if exists "Lectura con sesión order_documentos" on public.order_documentos;
create policy "Lectura con sesión order_documentos" on public.order_documentos
  for select to authenticated using (true);
revoke all on public.order_documentos from public, anon, authenticated;
grant select on public.order_documentos to authenticated;

-- Copia de lo que ya existía en las columnas viejas (idempotente).
insert into public.order_documentos (order_id, kind, path)
select id, 'cotizacion', cotizacion_pdf_path from public.orders where cotizacion_pdf_path is not null
union all
select id, 'orden_compra', orden_compra_pdf_path from public.orders where orden_compra_pdf_path is not null
union all
select id, 'factura', factura_pdf_path from public.orders where factura_pdf_path is not null
on conflict (path) do nothing;

create or replace function public.add_order_documento(
  p_order_id uuid,
  p_kind text,
  p_path text,
  p_nombre text default null
)
returns public.order_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.order_documentos;
  v_role text := public.current_user_role();
  v_eliminada_en timestamptz;
begin
  if p_kind not in ('cotizacion', 'orden_compra', 'factura') then
    raise exception 'Tipo de documento inválido: %', p_kind;
  end if;
  if p_kind = 'factura' then
    if coalesce(v_role, '') not in ('contabilidad', 'admin_tienda', 'admin_general') then
      raise exception 'Solo contabilidad o administrador pueden subir la factura.';
    end if;
  elsif coalesce(v_role, '') not in ('ventas', 'contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para subir documentos de esta orden.';
  end if;

  select eliminada_en into v_eliminada_en from public.orders where id = p_order_id;
  if not found then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if coalesce(p_path, '') = '' or p_path not like p_order_id::text || '/%' then
    raise exception 'La ruta del archivo no corresponde a esta orden.';
  end if;

  insert into public.order_documentos (order_id, kind, path, nombre, created_by)
  values (p_order_id, p_kind, p_path, nullif(btrim(coalesce(p_nombre, '')), ''), auth.uid())
  returning * into v_doc;
  return v_doc;
end;
$$;

create or replace function public.delete_order_documento(p_documento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.order_documentos;
  v_role text := public.current_user_role();
  v_eliminada_en timestamptz;
begin
  select * into v_doc from public.order_documentos where id = p_documento_id;
  if not found then
    raise exception 'Documento % no encontrado', p_documento_id;
  end if;
  if v_doc.kind = 'factura' then
    if coalesce(v_role, '') not in ('contabilidad', 'admin_tienda', 'admin_general') then
      raise exception 'Solo contabilidad o administrador pueden quitar la factura.';
    end if;
  elsif coalesce(v_role, '') not in ('ventas', 'contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para quitar documentos de esta orden.';
  end if;

  select eliminada_en into v_eliminada_en from public.orders where id = v_doc.order_id;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;

  delete from public.order_documentos where id = p_documento_id;
end;
$$;

revoke execute on function public.add_order_documento(uuid, text, text, text) from public;
revoke execute on function public.delete_order_documento(uuid) from public;
grant execute on function public.add_order_documento(uuid, text, text, text) to authenticated;
grant execute on function public.delete_order_documento(uuid) to authenticated;

-- Compatibilidad con una pestaña desactualizada: mismo cuerpo de V24 (mismas
-- reglas de siempre) + refleja el archivo nuevo en order_documentos.
create or replace function public.set_order_document(p_order_id uuid, p_kind text, p_path text)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_current_status text;
  v_eliminada_en timestamptz;
begin
  if coalesce(v_role, '') not in ('ventas', 'contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar los documentos de esta orden.';
  end if;
  if p_kind not in ('cotizacion', 'orden_compra', 'factura') then
    raise exception 'Tipo de documento inválido: %', p_kind;
  end if;
  if v_role = 'ventas' and p_kind = 'factura' then
    raise exception 'Solo contabilidad o administrador pueden subir la factura.';
  end if;
  select status, eliminada_en into v_current_status, v_eliminada_en from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if v_role in ('ventas', 'contabilidad') and p_kind <> 'factura' and v_current_status <> 'en_confirmacion' then
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se pueden editar sus documentos.';
  end if;
  if p_kind = 'cotizacion' then
    update public.orders set cotizacion_pdf_path = p_path, updated_at = now()
    where id = p_order_id returning * into v_order;
  elsif p_kind = 'orden_compra' then
    update public.orders set orden_compra_pdf_path = p_path, updated_at = now()
    where id = p_order_id returning * into v_order;
  else
    update public.orders set factura_pdf_path = p_path, updated_at = now()
    where id = p_order_id returning * into v_order;
  end if;
  if p_path is not null then
    insert into public.order_documentos (order_id, kind, path, created_by)
    values (p_order_id, p_kind, p_path, auth.uid())
    on conflict (path) do nothing;
  end if;
  return v_order;
end;
$function$;

-- Verificación (correr después y confirmar):
--   select count(*) from public.order_documentos;   -- = PDFs que ya existían (cotización + orden de compra + factura)
--   select proname, count(*) from pg_proc where proname in ('add_order_documento','delete_order_documento','set_order_document') group by 1;  -- 1 fila (count=1) por función
--   select has_function_privilege('anon','public.add_order_documento(uuid,text,text,text)','EXECUTE');   -- false
--   select has_function_privilege('anon','public.set_order_document(uuid,text,text)','EXECUTE');         -- false
--   select has_table_privilege('anon','public.order_documentos','SELECT');                              -- false
