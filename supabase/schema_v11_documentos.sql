-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V11: documentos por orden (PDF de cotización / orden de compra)
--
-- A diferencia de reference_photos (bucket público order-photos), estos
-- documentos pueden traer precios/info comercial — el bucket es PRIVADO
-- (solo lectura/escritura con sesión). Por eso guardamos solo el "path"
-- en Storage, no una URL: para un bucket privado la URL se genera al
-- vuelo con una signed URL (ver src/services/documentsService.js),
-- nunca es fija.
--
-- Aditivo: columnas nullable, no rompe ninguna orden existente.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

alter table public.orders
  add column if not exists cotizacion_pdf_path text,
  add column if not exists orden_compra_pdf_path text;

insert into storage.buckets (id, name, public)
values ('orden-documentos', 'orden-documentos', false)
on conflict (id) do nothing;

drop policy if exists "Lectura autenticada orden-documentos" on storage.objects;
create policy "Lectura autenticada orden-documentos" on storage.objects
  for select to authenticated using (bucket_id = 'orden-documentos');

drop policy if exists "Subida autenticada orden-documentos" on storage.objects;
create policy "Subida autenticada orden-documentos" on storage.objects
  for insert to authenticated with check (bucket_id = 'orden-documentos');

drop policy if exists "Borrado autenticado orden-documentos" on storage.objects;
create policy "Borrado autenticado orden-documentos" on storage.objects
  for delete to authenticated using (bucket_id = 'orden-documentos');

-- set_order_document: mismas reglas que editar la orden (tienda solo
-- mientras sigue en_confirmacion; admin siempre). p_kind es 'cotizacion'
-- u 'orden_compra'; p_path en null quita el documento (permite
-- "reemplazar": primero se sube el nuevo archivo a Storage, luego se
-- llama esto con el path nuevo — el archivo viejo se borra aparte desde
-- el frontend).
create or replace function public.set_order_document(
  p_order_id uuid,
  p_kind text,
  p_path text
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_current_status text;
begin
  if coalesce(v_role, '') not in ('tienda', 'admin') then
    raise exception 'No tienes permiso para editar los documentos de esta orden.';
  end if;
  if p_kind not in ('cotizacion', 'orden_compra') then
    raise exception 'Tipo de documento inválido: %', p_kind;
  end if;

  select status into v_current_status from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_role = 'tienda' and v_current_status <> 'en_confirmacion' then
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se pueden editar sus documentos.';
  end if;

  if p_kind = 'cotizacion' then
    update public.orders set cotizacion_pdf_path = p_path, updated_at = now()
    where id = p_order_id returning * into v_order;
  else
    update public.orders set orden_compra_pdf_path = p_path, updated_at = now()
    where id = p_order_id returning * into v_order;
  end if;

  return v_order;
end;
$$;

-- Ver SALPER_Contexto.md: revoke de PUBLIC explícito, no solo de anon.
revoke execute on function public.set_order_document(uuid, text, text) from public;
grant execute on function public.set_order_document(uuid, text, text) to authenticated;
