-- =====================================================================
-- V88 — Nuevo rol `admin_fabrica_lectura`: ve todo lo que ve admin_fabrica,
-- no puede escribir NADA. (aplicado 2026-09-27)
-- =====================================================================
-- Principio: nunca se agrega el rol nuevo a una función de ESCRITURA. Para
-- cada superficie que admin_fabrica puede ver, se revisó si su guarda
-- (prod_puede_ver_montos, prod_puede_capturar, fin_puede_ver) también protege
-- alguna escritura:
--   - Si la guarda es 100% de lectura (fin_puede_ver, RLS de SELECT) -> se
--     amplía la MISMA función/policy.
--   - Si la guarda protege lectura Y escritura a la vez (prod_puede_ver_montos,
--     prod_puede_capturar) -> se crean helpers NUEVOS (prod_puede_ver_lectura,
--     prod_puede_ver_captura) y se cambian SOLO las funciones/policies que son
--     puramente de lectura (calcular/listar/revisar/estadísticas) a usarlos.
--     Ninguna función que guarda/aprueba/cierra/borra se toca — siguen
--     exigiendo prod_puede_ver_montos()/prod_puede_capturar() tal cual, que
--     no incluyen este rol.
-- Además se cierran 6 candados de "denylist" (creados para 'lectura'/
-- 'captura_produccion') que de otro modo dejarían escribir al rol nuevo por
-- omisión: anuncios, fotos de referencia, notas internas, y el módulo viejo
-- de pendientes (ya sin uso). Se parchea la definición VIVA (pg_get_functiondef
-- + reemplazo de texto), igual que V66b, para no arriesgar perder ningún
-- cambio posterior a estas funciones.
-- También se corrige admin_update_user_role: a su lista le faltaban 'lectura'
-- y 'tienda' desde que se crearon en V30 (no se podía asignar ese rol desde
-- Usuarios) — se agregan junto con el rol nuevo.
-- =====================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
  'ventas', 'contabilidad', 'admin_tienda',
  'corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica',
  'admin_general',
  'lectura', 'tienda',
  'captura_produccion',
  'admin_fabrica_lectura'
));

create or replace function public.admin_update_user_role(
  p_user_id uuid, p_role text, p_full_name text default null
) returns public.profiles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_profile public.profiles;
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo un administrador puede cambiar roles de usuario.';
  end if;
  if p_role not in (
    'ventas', 'contabilidad', 'admin_tienda',
    'corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica',
    'admin_general',
    'captura_produccion',
    'lectura', 'tienda',
    'admin_fabrica_lectura'
  ) then
    raise exception 'Rol inválido: %', p_role;
  end if;
  update public.profiles set role = p_role, full_name = coalesce(p_full_name, full_name)
  where id = p_user_id returning * into v_profile;
  if v_profile.id is null then
    raise exception 'Usuario % no encontrado', p_user_id;
  end if;
  return v_profile;
end;
$function$;

-- ---------------------------------------------------------------------
-- Producción: helpers de SOLO LECTURA nuevos (no tocan los de escritura).
-- ---------------------------------------------------------------------
create or replace function public.prod_puede_ver_lectura() returns boolean
language sql stable security definer set search_path = public as $$
  select public.prod_puede_ver_montos() or coalesce(public.current_user_role(), '') = 'admin_fabrica_lectura'
$$;
revoke execute on function public.prod_puede_ver_lectura() from public;
grant execute on function public.prod_puede_ver_lectura() to authenticated;

create or replace function public.prod_puede_ver_captura() returns boolean
language sql stable security definer set search_path = public as $$
  select public.prod_puede_capturar() or coalesce(public.current_user_role(), '') = 'admin_fabrica_lectura'
$$;
revoke execute on function public.prod_puede_ver_captura() from public;
grant execute on function public.prod_puede_ver_captura() to authenticated;

-- Swap de guarda SOLO en funciones que nunca escriben nada (parcheando la
-- definición viva, para no perder ningún fix posterior a día de hoy).
do $$
declare r record; d text; nuevo text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in (
               'prod_calcular_premios', 'prod_revision_semana', 'prod_listar_semanas',
               'prod_historial_valores', 'prod_stats_info', 'prod_stats_semanas',
               'prod_stats_distribucion_meta', 'prod_stats_destacados', 'prod_stats_prendas',
               'prod_stats_operaciones', 'prod_stats_dias') loop
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d, 'public.prod_puede_ver_montos()', 'public.prod_puede_ver_lectura()');
    if nuevo = d then raise exception 'No pude parchear % (no encontré prod_puede_ver_montos()).', r.proname; end if;
    execute nuevo;
  end loop;

  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('prod_listar_registros', 'prod_resumen_captura') loop
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d, 'public.prod_puede_capturar()', 'public.prod_puede_ver_captura()');
    if nuevo = d then raise exception 'No pude parchear % (no encontré prod_puede_capturar()).', r.proname; end if;
    execute nuevo;
  end loop;
end $$;

-- RLS de SELECT: mismas tablas, ahora también visibles para el rol nuevo.
drop policy if exists "prod montos config" on public.prod_config;
create policy "prod montos config" on public.prod_config for select to authenticated using (public.prod_puede_ver_lectura());
drop policy if exists "prod montos reglas" on public.prod_reglas_premios;
create policy "prod montos reglas" on public.prod_reglas_premios for select to authenticated using (public.prod_puede_ver_lectura());
drop policy if exists "prod montos registros" on public.prod_registros;
create policy "prod montos registros" on public.prod_registros for select to authenticated using (public.prod_puede_ver_lectura());
drop policy if exists "prod montos valor semana" on public.prod_valor_semana;
create policy "prod montos valor semana" on public.prod_valor_semana for select to authenticated using (public.prod_puede_ver_lectura());
drop policy if exists "prod montos premios" on public.prod_premios_semana;
create policy "prod montos premios" on public.prod_premios_semana for select to authenticated using (public.prod_puede_ver_lectura());
drop policy if exists "prod catalogo operaciones" on public.prod_operaciones;
create policy "prod catalogo operaciones" on public.prod_operaciones for select to authenticated using (public.prod_puede_ver_captura());
drop policy if exists "prod catalogo operadoras" on public.prod_operadoras;
create policy "prod catalogo operadoras" on public.prod_operadoras for select to authenticated using (public.prod_puede_ver_captura());
drop policy if exists "prod catalogo semanas" on public.prod_semanas;
create policy "prod catalogo semanas" on public.prod_semanas for select to authenticated using (public.prod_puede_ver_captura());

-- ---------------------------------------------------------------------
-- Precios y facturación (V77): fin_puede_ver() es 100% de lectura (RLS +
-- RPC de consulta); fin_puede_editar()/fin_puede_editar_razones() NO se tocan.
-- ---------------------------------------------------------------------
create or replace function public.fin_puede_ver() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in
    ('admin_general', 'admin_tienda', 'admin_fabrica', 'ventas', 'contabilidad', 'admin_fabrica_lectura');
$$;

-- ---------------------------------------------------------------------
-- Candados "denylist" que de otro modo dejarían escribir al rol nuevo por
-- omisión (no están en la lista = pasan): anuncios, fotos de referencia,
-- notas internas, módulo viejo de pendientes (sin uso hoy).
-- ---------------------------------------------------------------------
do $$
declare r record; d text; nuevo text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('create_announcement', 'delete_announcement', 'add_order_photos', 'remove_order_photo') loop
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d, $q$in ('lectura', 'tienda', 'captura_produccion')$q$, $q$in ('lectura', 'tienda', 'captura_produccion', 'admin_fabrica_lectura')$q$);
    if nuevo = d then raise exception 'No pude parchear % (no encontré el denylist esperado).', r.proname; end if;
    execute nuevo;
  end loop;

  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'update_pending_item_status' loop
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d, $q$in ('lectura', 'captura_produccion')$q$, $q$in ('lectura', 'captura_produccion', 'admin_fabrica_lectura')$q$);
    if nuevo = d then raise exception 'No pude parchear update_pending_item_status.'; end if;
    execute nuevo;
  end loop;

  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'set_order_notas_internas' loop
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d, $q$v_role in ('lectura', 'captura_produccion')$q$, $q$v_role in ('lectura', 'captura_produccion', 'admin_fabrica_lectura')$q$);
    if nuevo = d then raise exception 'No pude parchear set_order_notas_internas.'; end if;
    execute nuevo;
  end loop;
end $$;
