-- =====================================================================
-- V66 — Módulo Producción y Premios · FASE 1: esquema
-- =====================================================================
-- Reemplaza el Excel de producción por operadora (Salper_Produccion.xlsm).
-- Esta fase solo crea la estructura; los catálogos (operaciones,
-- operadoras, reglas, configuración) se cargan con el script de importación
-- (scripts/import_produccion_fase1.py). El motor de premios llega en Fase 2.
--
-- ADITIVO: 8 tablas nuevas con prefijo `prod_`, 2 funciones helper y el
-- ROL NUEVO `captura_produccion`. Lo único que toca cosas existentes son
-- ajustes para admitir/bloquear ese rol (ver "CAMBIOS A COSAS EXISTENTES").
--
-- TERMINOLOGÍA: "valor generado", nunca "sueldo".
--
-- PERMISOS (confirmados con el usuario):
--   Montos (valor, precios, premios, reglas, config): admin_general y
--     admin_fabrica. NADIE más los lee, ni por SELECT directo.
--   Captura (Juanis): ROL NUEVO `captura_produccion`. Solo puede capturar
--     producción (fases 3-4) y VER las órdenes (como cualquier rol de solo
--     consulta) — nada más: sin anuncios, pendientes, fotos, notas,
--     talleros ni montos. Ve catálogos de operaciones/operadoras/semanas
--     pero NO montos: `prod_registros` guarda `valor` y el precio, así que
--     su lectura de registros irá por un RPC que omite esas columnas
--     (Fase 3), nunca por SELECT directo.
--   Escritura: SIEMPRE por RPC SECURITY DEFINER (patrón de siempre).
--   anon: nada.
--
-- CAMBIOS A COSAS EXISTENTES (todos "ensanchar", ninguno quita nada):
--   1. profiles_role_check: se agrega 'captura_produccion' (misma lista
--      que hoy + 1).
--   2. admin_update_user_role: acepta el rol nuevo (se parchea la
--      definición VIVA, no una copia).
--   3. Las 7 funciones que bloquean roles POR LISTA (create/delete_
--      announcement, add/remove_order_photo, create_pending_item,
--      update_pending_item_status, set_order_notas_internas) — un rol
--      nuevo se colaría — se parchean (definición viva) para bloquear
--      también 'captura_produccion'. Si algún parche no aplica, el script
--      se detiene con error y NO cambia nada.
--   4. Las 3 políticas de lectura de Talleros (V63) excluyen al rol nuevo.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase, una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) Rol nuevo + helpers
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
  'ventas', 'contabilidad', 'admin_tienda',
  'corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica',
  'admin_general',
  'captura_produccion'
));

create or replace function public.prod_puede_ver_montos()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in ('admin_general', 'admin_fabrica')
$$;

create or replace function public.prod_puede_capturar()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in ('admin_general', 'admin_fabrica', 'captura_produccion')
$$;

revoke execute on function public.prod_puede_ver_montos() from public;
revoke execute on function public.prod_puede_capturar() from public;
grant execute on function public.prod_puede_ver_montos() to authenticated;
grant execute on function public.prod_puede_capturar() to authenticated;

-- ---------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------
-- Clave/valor: precio_por_segundo, segundos_jornada.
create table if not exists public.prod_config (
  clave text primary key,
  valor numeric not null,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.prod_operaciones (
  folio integer primary key check (folio >= 0),
  prenda text not null check (btrim(prenda) <> ''),
  parte text not null check (btrim(parte) <> ''),
  operacion text not null check (btrim(operacion) <> ''),
  segundos numeric not null check (segundos > 0),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prod_operaciones_prenda_idx on public.prod_operaciones (prenda);

create table if not exists public.prod_operadoras (
  id uuid primary key default gen_random_uuid(),
  folio_empleado text not null unique check (btrim(folio_empleado) <> ''),
  numero_operadora integer unique,
  nombre text not null check (btrim(nombre) <> ''),
  puesto text,
  participa_bonos boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prod_reglas_premios (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('meta', 'lugar', 'mejora')),
  desde numeric not null,
  bono numeric not null check (bono >= 0),
  activa boolean not null default true,
  unique (tipo, desde)
);

-- La semana es una entidad ÚNICA (miércoles a martes): UNIQUE(fecha_inicio).
-- Corregir un dato = editar la semana existente, nunca crear otra.
create table if not exists public.prod_semanas (
  id uuid primary key default gen_random_uuid(),
  fecha_inicio date not null unique check (extract(dow from fecha_inicio) = 3),
  fecha_fin date not null check (extract(dow from fecha_fin) = 2 and fecha_fin = fecha_inicio + 6),
  estado text not null default 'abierta' check (estado in ('abierta', 'en_revision', 'aprobada')),
  aprobada_por uuid references public.profiles(id) on delete set null,
  aprobada_en timestamptz,
  importada boolean not null default false,
  notas text,
  created_at timestamptz not null default now()
);

-- `valor` y los snapshots son MONTOS: solo admin_general/admin_fabrica los
-- leen. Snapshot = segundaje y precio vigentes al capturar, para que cambiar
-- el catálogo no altere semanas ya capturadas.
create table if not exists public.prod_registros (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references public.prod_semanas(id),
  operadora_id uuid not null references public.prod_operadoras(id),
  fecha date not null,
  folio_operacion integer not null references public.prod_operaciones(folio),
  piezas integer not null check (piezas > 0),
  segundos_snapshot numeric not null check (segundos_snapshot > 0),
  precio_segundo_snapshot numeric not null check (precio_segundo_snapshot >= 0),
  valor numeric not null check (valor >= 0),
  orden_id uuid references public.orders(id) on delete set null, -- futuro; NO se muestra en la UI
  capturado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prod_registros_semana_operadora_idx on public.prod_registros (semana_id, operadora_id);
create index if not exists prod_registros_fecha_idx on public.prod_registros (fecha);

-- Semanas nuevas: se calcula desde prod_registros. Semanas importadas: viene
-- directo del historial (no tienen registros por operación).
create table if not exists public.prod_valor_semana (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references public.prod_semanas(id),
  operadora_id uuid not null references public.prod_operadoras(id),
  valor_generado numeric not null default 0 check (valor_generado >= 0),
  unique (semana_id, operadora_id)
);

-- Snapshot congelado al aprobar la semana.
create table if not exists public.prod_premios_semana (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references public.prod_semanas(id),
  operadora_id uuid not null references public.prod_operadoras(id),
  valor_generado numeric not null,
  valor_anterior numeric,
  lugar integer not null,
  mejora_pct numeric,            -- null = "Sin base"
  bono_meta numeric not null default 0,
  bono_lugar numeric not null default 0,
  bono_mejora numeric not null default 0,
  total_premio numeric not null default 0,
  unique (semana_id, operadora_id)
);

-- ---------------------------------------------------------------------
-- 2) Acceso: RLS + SELECT solo para quien corresponde; nadie escribe directo
-- ---------------------------------------------------------------------
alter table public.prod_config enable row level security;
alter table public.prod_operaciones enable row level security;
alter table public.prod_operadoras enable row level security;
alter table public.prod_reglas_premios enable row level security;
alter table public.prod_semanas enable row level security;
alter table public.prod_registros enable row level security;
alter table public.prod_valor_semana enable row level security;
alter table public.prod_premios_semana enable row level security;

-- Solo montos (admin_general / admin_fabrica):
drop policy if exists "prod montos config" on public.prod_config;
create policy "prod montos config" on public.prod_config
  for select to authenticated using (public.prod_puede_ver_montos());
drop policy if exists "prod montos reglas" on public.prod_reglas_premios;
create policy "prod montos reglas" on public.prod_reglas_premios
  for select to authenticated using (public.prod_puede_ver_montos());
drop policy if exists "prod montos registros" on public.prod_registros;
create policy "prod montos registros" on public.prod_registros
  for select to authenticated using (public.prod_puede_ver_montos());
drop policy if exists "prod montos valor semana" on public.prod_valor_semana;
create policy "prod montos valor semana" on public.prod_valor_semana
  for select to authenticated using (public.prod_puede_ver_montos());
drop policy if exists "prod montos premios" on public.prod_premios_semana;
create policy "prod montos premios" on public.prod_premios_semana
  for select to authenticated using (public.prod_puede_ver_montos());

-- Catálogos sin montos (también los ve quien captura):
drop policy if exists "prod catalogo operaciones" on public.prod_operaciones;
create policy "prod catalogo operaciones" on public.prod_operaciones
  for select to authenticated using (public.prod_puede_capturar());
drop policy if exists "prod catalogo operadoras" on public.prod_operadoras;
create policy "prod catalogo operadoras" on public.prod_operadoras
  for select to authenticated using (public.prod_puede_capturar());
drop policy if exists "prod catalogo semanas" on public.prod_semanas;
create policy "prod catalogo semanas" on public.prod_semanas
  for select to authenticated using (public.prod_puede_capturar());

revoke all on
  public.prod_config, public.prod_operaciones, public.prod_operadoras, public.prod_reglas_premios,
  public.prod_semanas, public.prod_registros, public.prod_valor_semana, public.prod_premios_semana
from public, anon, authenticated;
grant select on
  public.prod_config, public.prod_operaciones, public.prod_operadoras, public.prod_reglas_premios,
  public.prod_semanas, public.prod_registros, public.prod_valor_semana, public.prod_premios_semana
to authenticated;

-- ---------------------------------------------------------------------
-- 3) Parches a funciones existentes (definición VIVA + verificación)
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  d text;
  nuevo text;
begin
  -- 3a) admin_update_user_role: aceptar el rol nuevo en su lista de roles válidos.
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'admin_update_user_role' loop
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d, E'''admin_fabrica'',\n    ''admin_general''\n  )', E'''admin_fabrica'',\n    ''admin_general'',\n    ''captura_produccion''\n  )');
    if nuevo = d or position('captura_produccion' in nuevo) = 0 then
      raise exception 'No pude parchear admin_update_user_role (la lista de roles cambió). No se aplicó nada.';
    end if;
    execute nuevo;
  end loop;

  -- 3b) Funciones que bloquean roles por lista: bloquear también al rol nuevo.
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('add_order_photos', 'create_announcement', 'create_pending_item', 'delete_announcement',
                               'remove_order_photo', 'set_order_notas_internas', 'update_pending_item_status') loop
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d, '(''lectura'', ''tienda'')', '(''lectura'', ''tienda'', ''captura_produccion'')');
    nuevo := replace(nuevo, '= ''lectura''', 'in (''lectura'', ''captura_produccion'')');
    if nuevo = d or position('captura_produccion' in nuevo) = 0 then
      raise exception 'No pude parchear % (no encontré su bloqueo por lista). No se aplicó nada.', r.proname;
    end if;
    execute nuevo;
  end loop;
end $$;

-- 3c) Talleros (V63): el rol nuevo NO ve el módulo.
drop policy if exists "Lectura talleros productos" on public.mt_productos;
create policy "Lectura talleros productos" on public.mt_productos
  for select to authenticated using (coalesce(public.current_user_role(), '') not in ('', 'tienda', 'captura_produccion'));
drop policy if exists "Lectura talleros contenedores" on public.mt_contenedores;
create policy "Lectura talleros contenedores" on public.mt_contenedores
  for select to authenticated using (coalesce(public.current_user_role(), '') not in ('', 'tienda', 'captura_produccion'));
drop policy if exists "Lectura talleros movimientos" on public.mt_movimientos;
create policy "Lectura talleros movimientos" on public.mt_movimientos
  for select to authenticated using (coalesce(public.current_user_role(), '') not in ('', 'tienda', 'captura_produccion'));

-- Verificación final (si falla, se revierte todo): las 7 funciones + la de roles mencionan el rol nuevo.
do $$
declare faltan text;
begin
  select string_agg(p.proname, ', ') into faltan
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('admin_update_user_role', 'add_order_photos', 'create_announcement', 'create_pending_item',
                      'delete_announcement', 'remove_order_photo', 'set_order_notas_internas', 'update_pending_item_status')
    and position('captura_produccion' in p.prosrc) = 0;
  if faltan is not null then raise exception 'Sin parchear: %', faltan; end if;
end $$;

commit;
