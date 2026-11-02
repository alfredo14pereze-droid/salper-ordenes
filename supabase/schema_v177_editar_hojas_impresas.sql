-- =====================================================================
-- V177 — Editar hojas impresas + admin fábrica siempre las ve (2026-11-02)
-- =====================================================================
-- Pedido de Alfredo:
--   1) Que admin fábrica también pueda ver las hojas impresas.
--   2) Que una hoja impresa se pueda editar: agregar o quitar operaciones
--      (y cambiarle el título).
--
-- Hoy (V173) las ve quien tenga el permiso prod.capturar o prod.ver_lectura.
-- admin_fabrica los tiene por defecto, pero si alguien le quita esos
-- permisos en «Roles y permisos» deja de verlas. Desde aquí, además de esos
-- permisos, las ven siempre admin_general, admin_fabrica y
-- admin_fabrica_lectura (este último solo las ve, no edita).
--
-- Qué cambia:
--   · puede_ver_hojas_impresas() / puede_editar_hojas_impresas(): quién.
--   · La política de lectura de hojas_impresas usa puede_ver_hojas_impresas().
--   · registrar_hoja_impresa(): igual que V173, con la misma regla de quién.
--   · editar_hoja_impresa(id, titulo, folios[]) NUEVA: reemplaza las
--     operaciones de la hoja (solo de su misma prenda) y el título. No
--     cuenta como impresión: no cambia «veces» ni la fecha de impresión.
--     Edita: prod.capturar, admin_general o admin_fabrica.
-- No se crean operaciones ni folios. Las órdenes que ya escogieron la hoja
-- toman las operaciones nuevas la próxima vez que se genere su PDF.
--
-- Rollback:
--   drop function public.editar_hoja_impresa(uuid, text, integer[]);
--   y volver a correr schema_v173_hojas_impresas.sql (deja la política y
--   registrar_hoja_impresa como antes); luego
--   drop function public.puede_ver_hojas_impresas();
--   drop function public.puede_editar_hojas_impresas();
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regclass('public.hojas_impresas') is null or to_regprocedure('public.tiene_permiso(text)') is null
     or to_regprocedure('public.current_user_role()') is null then
    raise exception 'V177: falta hojas_impresas (V173), tiene_permiso o current_user_role. No se aplicó nada.';
  end if;
end $$;

-- 1) Quién
create or replace function public.puede_ver_hojas_impresas() returns boolean
language sql stable security definer set search_path = public as $$
  select public.tiene_permiso('prod.capturar')
      or public.tiene_permiso('prod.ver_lectura')
      or coalesce(public.current_user_role(), '') in ('admin_general', 'admin_fabrica', 'admin_fabrica_lectura')
$$;
revoke execute on function public.puede_ver_hojas_impresas() from public, anon;
grant execute on function public.puede_ver_hojas_impresas() to authenticated;

create or replace function public.puede_editar_hojas_impresas() returns boolean
language sql stable security definer set search_path = public as $$
  select public.tiene_permiso('prod.capturar')
      or coalesce(public.current_user_role(), '') in ('admin_general', 'admin_fabrica')
$$;
revoke execute on function public.puede_editar_hojas_impresas() from public, anon;
grant execute on function public.puede_editar_hojas_impresas() to authenticated;

-- 2) Lectura
drop policy if exists "Lectura hojas_impresas" on public.hojas_impresas;
create policy "Lectura hojas_impresas" on public.hojas_impresas
  for select to authenticated using (eliminada_en is null and public.puede_ver_hojas_impresas());

-- 3) Guardar al imprimir (igual que V173, con la regla de arriba)
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
  if not public.puede_ver_hojas_impresas() then
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

-- 4) Editar una hoja
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
  select jsonb_agg(jsonb_build_object('folio', folio, 'parte', parte, 'operacion', operacion, 'segundos', segundos) order by folio),
         count(*)
    into v_ops, v_n
    from public.prod_operaciones
   where prenda = v_hoja.prenda and folio = any(p_folios);
  if v_n <> v_pedidas then
    raise exception 'Algunas operaciones no son de %.', v_hoja.prenda;
  end if;

  update public.hojas_impresas set operaciones = v_ops, titulo = v_titulo
   where id = p_id
  returning * into v_hoja;
  return v_hoja;
end; $$;
revoke execute on function public.editar_hoja_impresa(uuid, text, integer[]) from public, anon;
grant execute on function public.editar_hoja_impresa(uuid, text, integer[]) to authenticated;

-- Verificación (solo lectura):
select proname from pg_proc
 where proname in ('puede_ver_hojas_impresas', 'puede_editar_hojas_impresas', 'editar_hoja_impresa', 'registrar_hoja_impresa')
 order by 1;
-- 4 renglones
