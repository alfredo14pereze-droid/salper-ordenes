-- =====================================================================
-- V45 — Categorías de cliente (escolar / industrial / sublimación) y
-- listas de clientes filtradas por tipo de orden
-- =====================================================================
-- Pedido del usuario: "quiero que sean diferentes listas de clientes
-- para cada tipo de orden. Por ejemplo, para lo escolar, que solo salga
-- la lista de clientes que sean colegios, también, que a la hora de
-- agregar un cliente nuevo en catálogos, puedan poner si es escolar,
-- industrial, o de sublimación".
--
-- Decisión confirmada con el usuario (AskUserQuestion): un cliente PUEDE
-- tener varias categorías a la vez (ej. una fábrica que es "industrial"
-- pero también pide playeras sublimadas de vez en cuando) — no es
-- excluyente. Por eso es un array (text[]), no un solo valor.
--
-- clientes.tipo_orden: array de 0 a 3 valores fijos
-- ('escolar'|'industrial'|'sublimacion' — los mismos 3 `key` que ya
-- existen en order_types desde schema_v5_folios.sql). Se valida ese
-- conjunto fijo en el propio RPC (no con un FK: order_types es una tabla
-- dinámica donde se pueden agregar tipos nuevos con create_order_type, y
-- esta categorización de clientes es explícitamente solo de estos 3).
--
-- Clientes ya existentes (los 3 reales de antes de este cambio) quedan
-- con tipo_orden = '{}' (vacío) — un cliente sin categoría asignada
-- aparece en TODAS las listas filtradas (ver create_cliente/fetchClientes
-- del lado del cliente: el filtro en ClienteSelect.jsx trata "sin
-- categoría" como "no lo escondas todavía"), hasta que alguien le ponga
-- categoría desde Catálogos con set_cliente_tipo_orden. Así no se le
-- esconde a nadie un cliente real de la noche a la mañana.
--
-- create_cliente cambia de firma (gana un 4º parámetro) — por el gotcha
-- ya conocido de esta base, hace falta DROP FUNCTION con la firma vieja
-- antes del CREATE OR REPLACE, o el REVOKE/GRANT de abajo no alcanza al
-- overload viejo. set_cliente_tipo_orden es nueva, para poder editar la
-- categoría de un cliente que ya existe (los 3 reales de antes de V45).
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez.
-- =====================================================================

alter table public.clientes
  add column if not exists tipo_orden text[] not null default '{}'::text[];

drop function if exists public.create_cliente(text, text, text);

create or replace function public.create_cliente(
  p_nombre text,
  p_telefono text default null,
  p_correo text default null,
  p_tipo_orden text[] default '{}'::text[]
)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
  v_telefono text := nullif(trim(coalesce(p_telefono, '')), '');
  v_correo text := nullif(trim(coalesce(p_correo, '')), '');
  v_tipo_orden text[] := coalesce(p_tipo_orden, '{}'::text[]);
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_general') then
    raise exception 'Solo ventas o administrador general pueden dar de alta clientes.';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre del cliente no puede estar vacío.';
  end if;

  if exists (
    select 1 from unnest(v_tipo_orden) t where t not in ('escolar', 'industrial', 'sublimacion')
  ) then
    raise exception 'Categoría de cliente inválida — solo escolar, industrial o sublimación.';
  end if;

  insert into public.clientes (nombre, telefono, correo, tipo_orden)
  values (trim(p_nombre), v_telefono, v_correo, v_tipo_orden)
  on conflict (nombre_normalizado) do update
    set telefono = coalesce(v_telefono, public.clientes.telefono),
        correo = coalesce(v_correo, public.clientes.correo),
        tipo_orden = case
          when coalesce(array_length(v_tipo_orden, 1), 0) > 0 then v_tipo_orden
          else public.clientes.tipo_orden
        end
  returning * into v_cliente;

  return v_cliente;
end;
$$;

revoke execute on function public.create_cliente(text, text, text, text[]) from public;
grant execute on function public.create_cliente(text, text, text, text[]) to authenticated;

create or replace function public.set_cliente_tipo_orden(p_cliente_id uuid, p_tipo_orden text[])
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
  v_tipo_orden text[] := coalesce(p_tipo_orden, '{}'::text[]);
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_general') then
    raise exception 'Solo ventas o administrador general pueden editar la categoría de un cliente.';
  end if;

  if exists (
    select 1 from unnest(v_tipo_orden) t where t not in ('escolar', 'industrial', 'sublimacion')
  ) then
    raise exception 'Categoría de cliente inválida — solo escolar, industrial o sublimación.';
  end if;

  update public.clientes
  set tipo_orden = v_tipo_orden
  where id = p_cliente_id
  returning * into v_cliente;

  if v_cliente is null then
    raise exception 'Cliente % no encontrado', p_cliente_id;
  end if;

  return v_cliente;
end;
$$;

revoke execute on function public.set_cliente_tipo_orden(uuid, text[]) from public;
grant execute on function public.set_cliente_tipo_orden(uuid, text[]) to authenticated;

-- Verificación (correr después y confirmar el resultado esperado):
--   select proname, pg_get_function_identity_arguments(oid)
--   from pg_proc where proname in ('create_cliente', 'set_cliente_tipo_orden');
--   -- esperado: exactamente 1 fila para cada nombre.
--   select has_function_privilege('anon', 'public.create_cliente(text,text,text,text[])', 'EXECUTE');
--   -- esperado: false
--   select has_function_privilege('anon', 'public.set_cliente_tipo_orden(uuid,text[])', 'EXECUTE');
--   -- esperado: false
