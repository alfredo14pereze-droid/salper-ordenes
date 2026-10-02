-- =====================================================================
-- V125 — Roles y permisos editables desde la app (Fase 1: lo central)
-- =====================================================================
-- Hasta hoy "qué puede hacer cada rol" estaba escrito a mano en 16 funciones
-- SQL (inventario, finanzas, pendientes, producción) y en permissions.js.
-- Esta migración las convierte en datos: una tabla rol_permisos (rol ×
-- permiso) que se edita desde la pantalla "Roles y permisos" (solo
-- admin_general). Las 16 funciones conservan nombre, firma y grants — solo
-- cambia su cuerpo: ahora consultan la tabla. Así todas las políticas RLS y
-- RPC que ya las llaman siguen funcionando sin tocarse.
--
-- Comportamiento: sembrado para reproducir EXACTO lo que hay hoy, con UNA
-- excepción deliberada (marcada abajo): 'costura' se agrega a pf.fabrica.
-- pf_es_fabrica() la dejaba fuera por omisión (el frontend sí la incluía),
-- así que Carmen veía Pendientes pero el servidor le rechazaba confirmar.
--
-- Aditivo: 3 tablas nuevas + 2 funciones nuevas; las 16 funciones se
-- reescriben con create or replace (mismo nombre/firma/grants). Nada se
-- borra. Sin cambios en perfiles, órdenes ni datos.
--
-- Fase 2+ (después): el resto de los ~200 chequeos de rol de otros módulos
-- se migran módulo por módulo a esta misma tabla.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guarda de deriva: aborta si alguna función viva ya no coincide con lo
--    que se va a sembrar (alguien la cambió a mano). Compara los roles que
--    aparecen como literales en el cuerpo vivo contra el conjunto esperado.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_src text;
  v_found text[];
  v_roles text[] := array['ventas','contabilidad','admin_tienda','corte','bordado','sublimado','produccion',
    'terminado','admin_fabrica','admin_general','lectura','tienda','captura_produccion',
    'admin_fabrica_lectura','costura','consulta_tienda'];
  v_rol text;
begin
  for r in
    select * from (values
      ('fin_puede_ver',          array['admin_general','admin_tienda','admin_fabrica','ventas','contabilidad','admin_fabrica_lectura']),
      ('fin_puede_editar',       array['admin_general','admin_tienda','ventas']),
      ('fin_puede_editar_razones', array['admin_general','admin_tienda','ventas','contabilidad']),
      ('inv_puede_ver',          array['admin_general','admin_tienda','admin_fabrica','ventas','tienda','consulta_tienda']),
      ('inv_puede_mover',        array['admin_tienda','admin_general','tienda']),
      ('inv_puede_editar',       array['admin_tienda','admin_general']),
      ('pf_es_tienda',           array['ventas','contabilidad','admin_tienda','tienda','admin_general']),
      ('pf_es_fabrica',          array['corte','bordado','sublimado','produccion','terminado','admin_fabrica','admin_general']),
      ('pf_puede_ver',           array['captura_produccion']),
      ('pf_puede_entregar',      array['ventas','admin_tienda','admin_general','tienda']),
      ('prod_puede_ver_montos',  array['admin_general','admin_fabrica']),
      ('prod_puede_capturar',    array['admin_general','admin_fabrica','captura_produccion']),
      ('prod_puede_ver_captura', array['admin_fabrica_lectura']),
      ('prod_puede_ver_lectura', array['admin_fabrica_lectura']),
      ('prod_puede_ver_ranking', array['captura_produccion'])
    ) as t(fn, esperado)
  loop
    select p.prosrc into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.fn and p.pronargs = 0;
    if v_src is null then
      raise exception 'V125: no existe la función public.%()', r.fn;
    end if;
    v_found := '{}';
    foreach v_rol in array v_roles loop
      if position('''' || v_rol || '''' in v_src) > 0 then
        v_found := v_found || v_rol;
      end if;
    end loop;
    if (select array_agg(x order by x) from unnest(v_found) x)
       is distinct from (select array_agg(x order by x) from unnest(r.esperado::text[]) x) then
      raise exception 'V125: la función viva %() ya no coincide con lo esperado (vivo: %, esperado: %). No se aplicó nada.',
        r.fn, v_found, r.esperado;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------
create table if not exists public.permisos_catalogo (
  clave       text primary key,
  modulo      text not null,
  etiqueta    text not null,
  descripcion text,
  nivel       text not null check (nivel in ('ver', 'editar')),
  orden       integer not null default 0
);

create table if not exists public.rol_permisos (
  rol   text not null,
  clave text not null references public.permisos_catalogo(clave) on delete cascade,
  primary key (rol, clave)
);

create table if not exists public.rol_permisos_log (
  id                 bigint generated always as identity primary key,
  cambiado_en        timestamptz not null default now(),
  cambiado_por       uuid,
  cambiado_por_nombre text,
  rol                text not null,
  clave              text not null,
  permitido          boolean not null
);

alter table public.permisos_catalogo enable row level security;
alter table public.rol_permisos enable row level security;
alter table public.rol_permisos_log enable row level security;

drop policy if exists "Lectura catalogo permisos" on public.permisos_catalogo;
create policy "Lectura catalogo permisos" on public.permisos_catalogo
  for select to authenticated using (true);
drop policy if exists "Lectura rol_permisos" on public.rol_permisos;
create policy "Lectura rol_permisos" on public.rol_permisos
  for select to authenticated using (true);
drop policy if exists "Lectura log permisos solo admin_general" on public.rol_permisos_log;
create policy "Lectura log permisos solo admin_general" on public.rol_permisos_log
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');

-- Sin políticas de escritura: todo cambio pasa por admin_set_rol_permiso().
revoke all on public.permisos_catalogo, public.rol_permisos, public.rol_permisos_log from public, anon, authenticated;
grant select on public.permisos_catalogo, public.rol_permisos, public.rol_permisos_log to authenticated;

-- ---------------------------------------------------------------------
-- 2) Catálogo de permisos (Fase 1)
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('inv.ver',         'Inventario de tienda', 'Ver inventario',            'Entrar al módulo y consultar artículos, existencias y movimientos.', 'ver',    10),
  ('inv.mover',       'Inventario de tienda', 'Registrar movimientos',     'Entradas, salidas, traspasos y conteos.',                           'editar', 11),
  ('inv.editar',      'Inventario de tienda', 'Editar catálogos',          'Artículos, secciones, ubicaciones, motivos, modelos y tallas.',     'editar', 12),
  ('fin.ver',         'Precios y facturación', 'Ver precios y facturación', 'Ver precios, totales, facturas y razones sociales.',               'ver',    20),
  ('fin.editar',      'Precios y facturación', 'Editar precios',           'Capturar y cambiar precios y datos de facturación de una orden.',   'editar', 21),
  ('fin.editar_razones','Precios y facturación','Editar razones sociales', 'Crear y editar razones sociales de facturación.',                  'editar', 22),
  ('pf.ver',          'Pendientes', 'Ver Pendientes',                      'Entrar a Pendientes tienda ↔ fábrica.',                             'ver',    30),
  ('pf.tienda',       'Pendientes', 'Actuar como tienda',                  'Crear pendientes y confirmar/recibir del lado de tienda.',          'editar', 31),
  ('pf.fabrica',      'Pendientes', 'Actuar como fábrica',                 'Confirmar y avanzar pendientes del lado de fábrica.',               'editar', 32),
  ('pf.entregar',     'Pendientes', 'Marcar como entregado',               'Marcar un pendiente de cliente como entregado.',                    'editar', 33),
  ('prod.capturar',   'Producción', 'Capturar producción',                 'Capturar, editar y borrar registros diarios de producción.',        'editar', 40),
  ('prod.ver_captura','Producción', 'Ver catálogos de captura',            'Ver operadoras, operaciones y semanas en la pantalla de captura.',  'ver',    41),
  ('prod.ver_ranking','Producción', 'Ver ranking de operadoras',           'Ver el valor generado por operadora e imprimir el ranking.',        'ver',    42),
  ('prod.ver_lectura','Producción', 'Ver Revisión / Dashboard / Estadísticas', 'Entrar de solo lectura a Revisión, Dashboard y Estadísticas de producción (incluye montos).', 'ver', 43),
  ('prod.ver_montos', 'Producción', 'Administrar producción (montos)',     'Aprobar/cerrar/reabrir semanas, editar catálogos y reglas de premios. Es el permiso más fuerte.', 'editar', 44)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 3) Siembra: reproduce el comportamiento actual (ver cabecera)
-- ---------------------------------------------------------------------
insert into public.rol_permisos (rol, clave)
select r.rol, s.clave
from (values
  ('fin.ver',          array['admin_general','admin_tienda','admin_fabrica','ventas','contabilidad','admin_fabrica_lectura']),
  ('fin.editar',       array['admin_general','admin_tienda','ventas']),
  ('fin.editar_razones', array['admin_general','admin_tienda','ventas','contabilidad']),
  ('inv.ver',          array['admin_general','admin_tienda','admin_fabrica','ventas','tienda','consulta_tienda']),
  ('inv.mover',        array['admin_tienda','admin_general','tienda']),
  ('inv.editar',       array['admin_tienda','admin_general']),
  ('pf.tienda',        array['ventas','contabilidad','admin_tienda','tienda','admin_general']),
  -- DELIBERADO: 'costura' se agrega (hoy el servidor la deja fuera por omisión
  -- aunque el frontend la trata como fábrica). Se puede desmarcar desde la pantalla.
  ('pf.fabrica',       array['corte','bordado','sublimado','produccion','terminado','costura','admin_fabrica','admin_general']),
  -- pf_puede_ver era "todos menos captura_produccion": se vuelve lista explícita.
  ('pf.ver',           array['ventas','contabilidad','admin_tienda','corte','bordado','sublimado','produccion',
                             'terminado','admin_fabrica','admin_general','lectura','tienda','admin_fabrica_lectura',
                             'costura','consulta_tienda']),
  ('pf.entregar',      array['ventas','admin_tienda','admin_general','tienda']),
  ('prod.capturar',    array['admin_general','admin_fabrica','captura_produccion']),
  ('prod.ver_captura', array['admin_general','admin_fabrica','captura_produccion','admin_fabrica_lectura']),
  ('prod.ver_ranking', array['admin_general','admin_fabrica','captura_produccion']),
  ('prod.ver_lectura', array['admin_general','admin_fabrica','admin_fabrica_lectura']),
  ('prod.ver_montos',  array['admin_general','admin_fabrica'])
) as s(clave, roles)
cross join lateral unnest(s.roles) as r(rol)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4) Consulta central + cambio (solo admin_general)
-- ---------------------------------------------------------------------
create or replace function public.tiene_permiso(p_clave text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rol_permisos
    where rol = coalesce(public.current_user_role(), '') and clave = p_clave
  )
$$;
revoke execute on function public.tiene_permiso(text) from public;
grant execute on function public.tiene_permiso(text) to authenticated;

create or replace function public.admin_set_rol_permiso(p_rol text, p_clave text, p_permitido boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_filas integer;
  v_nombre text;
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo admin_general puede cambiar permisos.';
  end if;
  if p_rol = 'admin_general' then
    raise exception 'Los permisos de admin_general no se pueden cambiar (evita quedarte sin acceso).';
  end if;
  -- El rol debe existir en el CHECK de profiles (única lista de roles válidos).
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check'
      and position(quote_literal(p_rol) in pg_get_constraintdef(oid)) > 0
  ) then
    raise exception 'Rol inválido: %', p_rol;
  end if;
  if not exists (select 1 from public.permisos_catalogo where clave = p_clave) then
    raise exception 'Permiso inválido: %', p_clave;
  end if;

  if p_permitido then
    insert into public.rol_permisos (rol, clave) values (p_rol, p_clave) on conflict do nothing;
  else
    delete from public.rol_permisos where rol = p_rol and clave = p_clave;
  end if;
  get diagnostics v_filas = row_count;

  -- Solo se registra si de verdad cambió algo.
  if v_filas > 0 then
    select full_name into v_nombre from public.profiles where id = auth.uid();
    insert into public.rol_permisos_log (cambiado_por, cambiado_por_nombre, rol, clave, permitido)
    values (auth.uid(), v_nombre, p_rol, p_clave, p_permitido);
  end if;
end;
$$;
revoke execute on function public.admin_set_rol_permiso(text, text, boolean) from public;
grant execute on function public.admin_set_rol_permiso(text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Las 15 funciones auxiliares ahora leen la tabla
--    (mismo nombre, firma y grants; prod_puede_editar_semana NO se toca:
--    mezcla rol con estado/fecha y se migra en una fase posterior)
-- ---------------------------------------------------------------------
create or replace function public.fin_puede_ver() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('fin.ver') $$;
create or replace function public.fin_puede_editar() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('fin.editar') $$;
create or replace function public.fin_puede_editar_razones() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('fin.editar_razones') $$;

create or replace function public.inv_puede_ver() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('inv.ver') $$;
create or replace function public.inv_puede_mover() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('inv.mover') $$;
create or replace function public.inv_puede_editar() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('inv.editar') $$;

create or replace function public.pf_es_tienda() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('pf.tienda') $$;
create or replace function public.pf_es_fabrica() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('pf.fabrica') $$;
create or replace function public.pf_puede_ver() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('pf.ver') $$;
create or replace function public.pf_puede_entregar() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('pf.entregar') $$;

create or replace function public.prod_puede_capturar() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('prod.capturar') $$;
create or replace function public.prod_puede_ver_captura() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('prod.ver_captura') $$;
create or replace function public.prod_puede_ver_ranking() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('prod.ver_ranking') $$;
create or replace function public.prod_puede_ver_lectura() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('prod.ver_lectura') $$;
create or replace function public.prod_puede_ver_montos() returns boolean
language sql stable security definer set search_path = public as $$ select public.tiene_permiso('prod.ver_montos') $$;

-- create or replace conserva los grants existentes; se reafirman por seguridad.
revoke execute on function
  public.fin_puede_ver(), public.fin_puede_editar(), public.fin_puede_editar_razones(),
  public.inv_puede_ver(), public.inv_puede_mover(), public.inv_puede_editar(),
  public.pf_es_tienda(), public.pf_es_fabrica(), public.pf_puede_ver(), public.pf_puede_entregar(),
  public.prod_puede_capturar(), public.prod_puede_ver_captura(), public.prod_puede_ver_ranking(),
  public.prod_puede_ver_lectura(), public.prod_puede_ver_montos()
from public;
grant execute on function
  public.fin_puede_ver(), public.fin_puede_editar(), public.fin_puede_editar_razones(),
  public.inv_puede_ver(), public.inv_puede_mover(), public.inv_puede_editar(),
  public.pf_es_tienda(), public.pf_es_fabrica(), public.pf_puede_ver(), public.pf_puede_entregar(),
  public.prod_puede_capturar(), public.prod_puede_ver_captura(), public.prod_puede_ver_ranking(),
  public.prod_puede_ver_lectura(), public.prod_puede_ver_montos()
to authenticated;
