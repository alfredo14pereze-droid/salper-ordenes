-- =====================================================================
-- V173 — Hojas de operaciones impresas (2026-10-31)
-- =====================================================================
-- Pedido de Alfredo: que las hojas de operaciones que se imprimen (con su
-- título) queden guardadas, para no tener que volver a armarlas.
--
-- Cada vez que se toca "Imprimir" en la hoja de operaciones de una prenda
-- se guarda: prenda, título y una copia de las operaciones de la hoja.
-- Misma prenda + mismo título = la misma hoja: no se duplica, solo se
-- actualiza la copia, la fecha y cuántas veces se ha impreso.
--
-- Qué agrega:
--   · Tabla hojas_impresas.
--   · registrar_hoja_impresa(prenda, titulo, folios): guarda o actualiza.
--     La copia de las operaciones sale de prod_operaciones.
--   · quitar_hoja_impresa(id): la quita de la lista (queda con fecha de
--     borrado, no se borra de la base).
--
-- Quién: imprimir y ver la lista, los mismos que ven el catálogo de
-- operaciones (prod.capturar o prod.ver_lectura). Quitar, quien tiene
-- prod.capturar.
-- Aditivo: no toca nada existente.
--
-- Rollback:
--   drop function public.registrar_hoja_impresa(text, text, integer[]);
--   drop function public.quitar_hoja_impresa(uuid);
--   drop table public.hojas_impresas;
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regclass('public.prod_operaciones') is null or to_regprocedure('public.tiene_permiso(text)') is null then
    raise exception 'V173: falta prod_operaciones o tiene_permiso (V125). No se aplicó nada.';
  end if;
end $$;

-- 1) Tabla
create table if not exists public.hojas_impresas (
  id                uuid primary key default gen_random_uuid(),
  prenda            text not null,
  titulo            text not null check (btrim(titulo) <> ''),
  operaciones       jsonb not null check (jsonb_typeof(operaciones) = 'array' and jsonb_array_length(operaciones) > 0),
  veces             integer not null default 1,
  primera_en        timestamptz not null default now(),
  ultima_en         timestamptz not null default now(),
  ultima_por_nombre text,
  eliminada_en      timestamptz
);
create unique index if not exists hojas_impresas_unica_idx
  on public.hojas_impresas (prenda, lower(btrim(titulo))) where eliminada_en is null;
create index if not exists hojas_impresas_ultima_idx on public.hojas_impresas (ultima_en desc);

alter table public.hojas_impresas enable row level security;
drop policy if exists "Lectura hojas_impresas" on public.hojas_impresas;
create policy "Lectura hojas_impresas" on public.hojas_impresas
  for select to authenticated using (
    eliminada_en is null
    and (public.tiene_permiso('prod.capturar') or public.tiene_permiso('prod.ver_lectura'))
  );
-- Sin políticas de escritura: todo pasa por las funciones de abajo.
revoke all on public.hojas_impresas from public, anon, authenticated;
grant select on public.hojas_impresas to authenticated;

-- 2) Guardar al imprimir
create or replace function public.registrar_hoja_impresa(
  p_prenda text,
  p_titulo text,
  p_folios integer[]
) returns public.hojas_impresas
language plpgsql security definer set search_path = public as $$
declare
  v_ops jsonb;
  v_n integer;
  v_pedidas integer;
  v_nombre text;
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_row public.hojas_impresas;
begin
  if not (public.tiene_permiso('prod.capturar') or public.tiene_permiso('prod.ver_lectura')) then
    raise exception 'No tienes permiso para imprimir hojas de operaciones.';
  end if;
  if v_titulo = '' then
    v_titulo := btrim(coalesce(p_prenda, ''));
  end if;

  select count(distinct x) into v_pedidas from unnest(coalesce(p_folios, '{}')) as x where x is not null;
  if v_pedidas = 0 then
    raise exception 'La hoja no tiene operaciones.';
  end if;
  select jsonb_agg(jsonb_build_object('folio', folio, 'parte', parte, 'operacion', operacion, 'segundos', segundos) order by folio),
         count(*)
    into v_ops, v_n
    from public.prod_operaciones
   where prenda = p_prenda and folio = any(p_folios);
  if v_n <> v_pedidas then
    raise exception 'Algunas operaciones no son de %.', p_prenda;
  end if;

  select nullif(btrim(full_name), '') into v_nombre from public.profiles where id = auth.uid();

  update public.hojas_impresas set
    operaciones = v_ops,
    titulo = v_titulo,
    veces = veces + 1,
    ultima_en = now(),
    ultima_por_nombre = v_nombre
  where prenda = p_prenda and lower(btrim(titulo)) = lower(v_titulo) and eliminada_en is null
  returning * into v_row;

  if v_row.id is null then
    insert into public.hojas_impresas (prenda, titulo, operaciones, ultima_por_nombre)
    values (p_prenda, v_titulo, v_ops, v_nombre)
    returning * into v_row;
  end if;
  return v_row;
end; $$;
revoke execute on function public.registrar_hoja_impresa(text, text, integer[]) from public, anon;
grant execute on function public.registrar_hoja_impresa(text, text, integer[]) to authenticated;

-- 3) Quitar de la lista
create or replace function public.quitar_hoja_impresa(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.tiene_permiso('prod.capturar') then
    raise exception 'No tienes permiso para quitar hojas impresas.';
  end if;
  update public.hojas_impresas set eliminada_en = now()
   where id = p_id and eliminada_en is null;
  if not found then
    raise exception 'No encuentro la hoja.';
  end if;
end; $$;
revoke execute on function public.quitar_hoja_impresa(uuid) from public, anon;
grant execute on function public.quitar_hoja_impresa(uuid) to authenticated;

-- Verificación (solo lectura):
--   select count(*) from public.hojas_impresas;   -- 0
