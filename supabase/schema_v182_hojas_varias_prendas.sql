-- =====================================================================
-- V182 — Hojas de operaciones con operaciones de varias prendas (2026-11-05)
-- =====================================================================
-- Pedido de Alfredo: al imprimir la hoja de operaciones de una prenda (por
-- ejemplo CAMISOLA), poder agregarle operaciones de otra prenda (por ejemplo
-- PLAYERA) cuando es la misma operación. Ej.: 7 de camisola + 2 de playera
-- en una sola hoja, con su título, guardada en «Hojas impresas».
--
-- Hoy registrar_hoja_impresa y editar_hoja_impresa (V177) rechazan la hoja
-- con «Algunas operaciones no son de CAMISOLA».
--
-- Qué cambia (solo esas dos funciones):
--   · Aceptan folios de cualquier prenda. La hoja sigue siendo "de" una
--     prenda (columna prenda = la prenda principal que se escoge al
--     imprimir); el folio es único en todo el catálogo, así que no hay
--     confusión.
--   · La copia de cada operación guarda también su prenda (clave "prenda"
--     en el jsonb), para mostrar de qué prenda viene.
--   · Error nuevo si un folio ya no existe en el catálogo.
--   · Todo lo demás igual que V177 (permisos, título único por prenda,
--     veces / fecha, no cuenta como impresión al editar).
-- No toca tablas, ni permisos, ni operaciones, ni folios. Las hojas que ya
-- existen siguen igual.
--
-- Candado: antes de reemplazar, revisa que las dos funciones en la base
-- sean exactamente las de V177 (md5). Si alguien las cambió después, no
-- aplica nada y avisa.
--
-- Rollback: volver a correr schema_v177_editar_hojas_impresas.sql.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
declare
  v_reg text;
  v_edi text;
begin
  select md5(prosrc) into v_reg from pg_proc
   where oid = to_regprocedure('public.registrar_hoja_impresa(text, text, integer[])');
  select md5(prosrc) into v_edi from pg_proc
   where oid = to_regprocedure('public.editar_hoja_impresa(uuid, text, integer[])');
  if v_reg is null or v_edi is null then
    raise exception 'V182: faltan registrar_hoja_impresa / editar_hoja_impresa (V177). No se aplicó nada.';
  end if;
  -- V177 original, o V182 ya aplicada (se puede volver a correr).
  if v_reg not in ('60a3deaca47572f169d8776c47006a74', 'b2f7eff9b61d9cc7aac499cb03f6a3a1')
     or v_edi not in ('c9b05d671e6de45782120f68d5ae1ea3', 'e817bc7c9695085efb201b80060331a6') then
    raise exception 'V182: registrar_hoja_impresa o editar_hoja_impresa no son las de V177 (alguien las cambió). No se aplicó nada.';
  end if;
end $$;

-- 1) Guardar al imprimir: operaciones de cualquier prenda
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
  v_prenda text := btrim(coalesce(p_prenda, ''));
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_row public.hojas_impresas;
begin
  if not public.puede_ver_hojas_impresas() then
    raise exception 'No tienes permiso para imprimir hojas de operaciones.';
  end if;
  if v_prenda = '' then
    raise exception 'Falta la prenda de la hoja.';
  end if;
  if v_titulo = '' then
    v_titulo := v_prenda;
  end if;

  select count(distinct x) into v_pedidas from unnest(coalesce(p_folios, '{}')) as x where x is not null;
  if v_pedidas = 0 then
    raise exception 'La hoja no tiene operaciones.';
  end if;
  select jsonb_agg(jsonb_build_object('folio', folio, 'prenda', prenda, 'parte', parte, 'operacion', operacion, 'segundos', segundos) order by folio),
         count(*)
    into v_ops, v_n
    from public.prod_operaciones
   where folio = any(p_folios);
  if v_n <> v_pedidas then
    raise exception 'Algunas operaciones ya no están en el catálogo.';
  end if;

  select nullif(btrim(full_name), '') into v_nombre from public.profiles where id = auth.uid();

  update public.hojas_impresas set
    operaciones = v_ops,
    titulo = v_titulo,
    veces = veces + 1,
    ultima_en = now(),
    ultima_por_nombre = v_nombre
  where prenda = v_prenda and lower(btrim(titulo)) = lower(v_titulo) and eliminada_en is null
  returning * into v_row;

  if v_row.id is null then
    insert into public.hojas_impresas (prenda, titulo, operaciones, ultima_por_nombre)
    values (v_prenda, v_titulo, v_ops, v_nombre)
    returning * into v_row;
  end if;
  return v_row;
end; $$;
revoke execute on function public.registrar_hoja_impresa(text, text, integer[]) from public, anon;
grant execute on function public.registrar_hoja_impresa(text, text, integer[]) to authenticated;

-- 2) Editar una hoja: operaciones de cualquier prenda
create or replace function public.editar_hoja_impresa(
  p_id uuid,
  p_titulo text,
  p_folios integer[]
) returns public.hojas_impresas
language plpgsql security definer set search_path = public as $$
declare
  v_hoja public.hojas_impresas;
  v_ops jsonb;
  v_n integer;
  v_pedidas integer;
  v_titulo text := btrim(coalesce(p_titulo, ''));
begin
  if not public.puede_editar_hojas_impresas() then
    raise exception 'No tienes permiso para editar hojas impresas.';
  end if;
  select * into v_hoja from public.hojas_impresas where id = p_id and eliminada_en is null for update;
  if v_hoja.id is null then
    raise exception 'No encuentro la hoja.';
  end if;
  if v_titulo = '' then
    raise exception 'La hoja necesita un título.';
  end if;
  if exists (
    select 1 from public.hojas_impresas
     where prenda = v_hoja.prenda and lower(btrim(titulo)) = lower(v_titulo)
       and eliminada_en is null and id <> p_id
  ) then
    raise exception 'Ya hay otra hoja de % con el título «%».', v_hoja.prenda, v_titulo;
  end if;

  select count(distinct x) into v_pedidas from unnest(coalesce(p_folios, '{}')) as x where x is not null;
  if v_pedidas = 0 then
    raise exception 'La hoja tiene que llevar al menos una operación.';
  end if;
  select jsonb_agg(jsonb_build_object('folio', folio, 'prenda', prenda, 'parte', parte, 'operacion', operacion, 'segundos', segundos) order by folio),
         count(*)
    into v_ops, v_n
    from public.prod_operaciones
   where folio = any(p_folios);
  if v_n <> v_pedidas then
    raise exception 'Algunas operaciones ya no están en el catálogo.';
  end if;

  update public.hojas_impresas set operaciones = v_ops, titulo = v_titulo
   where id = p_id
  returning * into v_hoja;
  return v_hoja;
end; $$;
revoke execute on function public.editar_hoja_impresa(uuid, text, integer[]) from public, anon;
grant execute on function public.editar_hoja_impresa(uuid, text, integer[]) to authenticated;

-- Verificación (solo lectura): debe decir "prenda" en las dos.
select proname, position('''prenda'', prenda' in prosrc) > 0 as acepta_varias_prendas
  from pg_proc
 where proname in ('registrar_hoja_impresa', 'editar_hoja_impresa')
 order by 1;
-- 2 renglones, los dos en true
