-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V17: "Inventariado" / "No inventariado" en Orden de reparación
--
-- Nueva columna nullable en pending_items (un pendiente "general" no la
-- usa, se queda en null). Para el tipo "Orden de reparación", el
-- frontend exige elegir uno de los dos botones antes de poder crear el
-- pendiente — aquí solo se guarda el valor, la obligatoriedad vive en
-- PendingItemForm.jsx (mismo criterio que "prenda" para ese tipo).
--
-- create_pending_item gana un parámetro nuevo → cambia la lista de tipos,
-- así que hace falta tirar la firma vieja primero (ver gotcha de firmas
-- de RPC en SALPER_Contexto.md).
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

alter table public.pending_items
  add column if not exists inventariado boolean;

drop function if exists public.create_pending_item(text, text, text, text, text, integer, text, text);

create or replace function public.create_pending_item(
  p_title text,
  p_description text,
  p_category text,
  p_garment text default null,
  p_talla text default null,
  p_cantidad integer default null,
  p_foto_url text default null,
  p_foto_path text default null,
  p_inventariado boolean default null
) returns public.pending_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.pending_items;
begin
  insert into public.pending_items (title, description, category, garment, talla, cantidad, foto_url, foto_path, inventariado)
  values (p_title, p_description, p_category, p_garment, p_talla, p_cantidad, p_foto_url, p_foto_path, p_inventariado)
  returning * into v_item;

  return v_item;
end;
$$;

revoke execute on function public.create_pending_item(text, text, text, text, text, integer, text, text, boolean) from public;
grant execute on function public.create_pending_item(text, text, text, text, text, integer, text, text, boolean) to authenticated;
