-- =====================================================================
-- V57 — Módulo "Pedidos Colegio" (beta, acceso EXCLUSIVO admin_general)
-- =====================================================================
-- Ventas de uniformes escolares levantadas en campo que hoy se controlan
-- en papel + Microsip, sin visibilidad de qué falta surtir. Esta beta
-- cubre: alta de colegios, pedidos individuales con sus prendas, folio
-- por colegio (IT1, IT2, CDB1...), anticipo y abonos posteriores. El
-- surtido / cortes / resumen de faltantes / correo son la SIGUIENTE fase
-- (no van aquí; `colegio_pedido_articulos` se diseñó para poder agregarle
-- `cantidad_surtida` después sin reestructurar nada).
--
-- Módulo NUEVO y AISLADO: 4 tablas con prefijo `colegio_` (más
-- `colegios`) que no tocan `orders`, `orden_etapas` ni ningún flujo de
-- producción existente.
--
-- Ajustes respecto al prompt original (confirmados con el usuario antes
-- de aplicar):
--   - "super_admin" es `admin_general` (mismo concepto, ya así desde V22).
--   - `creado_por`/`registrado_por` apuntan a `profiles(id)` (este
--     proyecto no tiene una tabla `users`; `profiles` es la que se
--     vincula a auth.users).
--   - `colegios.ultimo_folio`: contador por colegio, incrementado de
--     forma atómica DENTRO de create_colegio_pedido (el UPDATE toma un
--     candado de fila, dos capturas simultáneas no pueden sacar el mismo
--     número). Solo sube — nunca se reutiliza un folio aunque el pedido
--     se elimine, mismo criterio que los folios de órdenes de producción.
--   - `codigo_folio` solo LETRAS (1-6): así "A"+"11" nunca choca con
--     "A1"+"1" — el folio completo es único sin ambigüedad.
--   - `colegio_pedido_articulos.posicion`: orden de captura de las
--     líneas (para que el recibo salga en el mismo orden que se capturó).
--   - Subtotal, importes, porcentaje/monto de anticipo los calcula el
--     SERVIDOR (create_colegio_pedido), nunca se confía en lo que mande
--     el navegador.
--
-- SEGURIDAD — a diferencia del resto de la app (lectura pública para
-- invitados, ver schema_v10_guest_read.sql), aquí NADA es público: hay
-- teléfonos de clientes y dinero. RLS activo en las 4 tablas + SELECT
-- solo para authenticated con current_user_role() = 'admin_general';
-- `anon` sin ningún privilegio. Escritura: solo vía RPC SECURITY DEFINER
-- (patrón de siempre) con revoke ... from public + grant ... to
-- authenticated, y el chequeo de rol adentro con coalesce(v_role,'').
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Todas las funciones son NUEVAS (no hay overloads que
-- limpiar con DROP FUNCTION).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------
create table if not exists public.colegios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  codigo_folio text not null check (codigo_folio ~ '^[A-Z]{1,6}$'),
  ultimo_folio integer not null default 0 check (ultimo_folio >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index if not exists colegios_codigo_folio_key on public.colegios (codigo_folio);

create table if not exists public.colegio_pedidos (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references public.colegios(id),
  folio text not null,
  cliente_nombre text not null check (btrim(cliente_nombre) <> ''),
  cliente_referencia text,
  cliente_telefono text,
  fecha_pedido timestamptz not null default now(),
  anticipo_porcentaje numeric(6,2) not null default 100 check (anticipo_porcentaje >= 0 and anticipo_porcentaje <= 100),
  anticipo_monto numeric(12,2) not null default 0 check (anticipo_monto >= 0),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  eliminado_en timestamptz,
  creado_por uuid references public.profiles(id) on delete set null
);
create unique index if not exists colegio_pedidos_folio_key on public.colegio_pedidos (folio);
create index if not exists colegio_pedidos_colegio_idx on public.colegio_pedidos (colegio_id);

create table if not exists public.colegio_pedido_articulos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.colegio_pedidos(id) on delete cascade,
  posicion integer not null default 0,
  articulo text not null check (btrim(articulo) <> ''),
  talla text,
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  importe numeric(12,2) not null check (importe >= 0)
  -- Siguiente fase: cantidad_surtida integer (NO agregar todavía).
);
create index if not exists colegio_pedido_articulos_pedido_idx on public.colegio_pedido_articulos (pedido_id);

create table if not exists public.colegio_pedido_abonos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.colegio_pedidos(id) on delete cascade,
  fecha timestamptz not null default now(),
  monto numeric(12,2) not null check (monto > 0),
  nota text,
  registrado_por uuid references public.profiles(id) on delete set null
);
create index if not exists colegio_pedido_abonos_pedido_idx on public.colegio_pedido_abonos (pedido_id);

-- ---------------------------------------------------------------------
-- 2) Acceso: RLS + solo admin_general lee, anon NADA, nadie escribe directo
-- ---------------------------------------------------------------------
alter table public.colegios enable row level security;
alter table public.colegio_pedidos enable row level security;
alter table public.colegio_pedido_articulos enable row level security;
alter table public.colegio_pedido_abonos enable row level security;

drop policy if exists "Solo admin_general lee colegios" on public.colegios;
create policy "Solo admin_general lee colegios" on public.colegios
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');

drop policy if exists "Solo admin_general lee colegio_pedidos" on public.colegio_pedidos;
create policy "Solo admin_general lee colegio_pedidos" on public.colegio_pedidos
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');

drop policy if exists "Solo admin_general lee colegio_pedido_articulos" on public.colegio_pedido_articulos;
create policy "Solo admin_general lee colegio_pedido_articulos" on public.colegio_pedido_articulos
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');

drop policy if exists "Solo admin_general lee colegio_pedido_abonos" on public.colegio_pedido_abonos;
create policy "Solo admin_general lee colegio_pedido_abonos" on public.colegio_pedido_abonos
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');

revoke all on public.colegios, public.colegio_pedidos, public.colegio_pedido_articulos, public.colegio_pedido_abonos from public, anon, authenticated;
grant select on public.colegios, public.colegio_pedidos, public.colegio_pedido_articulos, public.colegio_pedido_abonos to authenticated;

-- ---------------------------------------------------------------------
-- 3) Seed — colegios iniciales (idempotente)
-- ---------------------------------------------------------------------
insert into public.colegios (nombre, codigo_folio)
select v.nombre, v.codigo
from (values
  ('Instituto Tricio', 'IT'),
  ('Colegio Doris Beckman', 'CDB'),
  ('Colegio Juan Beckman', 'CJB'),
  ('Colegio Echavarría', 'CJE'),
  ('Sistema Educativo Nexus', 'SEN'),
  ('Avenue School', 'AS')  -- no venía en la lista original; sale en el PDF de ejemplo (folio AS1)
) as v(nombre, codigo)
where not exists (select 1 from public.colegios c where c.codigo_folio = v.codigo);

-- ---------------------------------------------------------------------
-- 4) RPC — alta de colegio
-- ---------------------------------------------------------------------
create or replace function public.create_colegio(p_nombre text, p_codigo_folio text)
returns public.colegios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_colegio public.colegios;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_codigo text := upper(btrim(coalesce(p_codigo_folio, '')));
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo el administrador general puede dar de alta colegios.';
  end if;
  if v_nombre = '' then
    raise exception 'El nombre del colegio no puede estar vacío.';
  end if;
  if v_codigo !~ '^[A-Z]{1,6}$' then
    raise exception 'El código de folio debe ser de 1 a 6 letras (sin números ni espacios).';
  end if;
  if exists (select 1 from public.colegios where codigo_folio = v_codigo) then
    raise exception 'Ya existe un colegio con el código de folio %.', v_codigo;
  end if;

  insert into public.colegios (nombre, codigo_folio) values (v_nombre, v_codigo)
  returning * into v_colegio;
  return v_colegio;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) RPC — alta de pedido (folio + líneas + anticipo, todo en una sola
--    transacción; subtotal/importes/anticipo los calcula el servidor)
--    p_articulos: [{ "articulo": text, "talla": text, "cantidad": int,
--                    "precio_unitario": numeric }, ...]
--    Anticipo: si viene p_anticipo_monto manda el monto; si no, el
--    porcentaje; si no viene ninguno, 100% (default del módulo).
-- ---------------------------------------------------------------------
create or replace function public.create_colegio_pedido(
  p_colegio_id uuid,
  p_cliente_nombre text,
  p_cliente_referencia text,
  p_cliente_telefono text,
  p_anticipo_porcentaje numeric,
  p_anticipo_monto numeric,
  p_articulos jsonb
)
returns public.colegio_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.colegio_pedidos;
  v_colegio_activo boolean;
  v_codigo text;
  v_n integer;
  v_cliente text := btrim(coalesce(p_cliente_nombre, ''));
  v_art jsonb;
  v_pos integer := 0;
  v_cantidad integer;
  v_precio numeric;
  v_importe numeric;
  v_subtotal numeric := 0;
  v_pct numeric;
  v_monto numeric;
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo el administrador general puede capturar pedidos de colegio.';
  end if;
  if v_cliente = '' then
    raise exception 'Falta el nombre de quien hace el pedido.';
  end if;
  if p_articulos is null or jsonb_typeof(p_articulos) <> 'array' or jsonb_array_length(p_articulos) = 0 then
    raise exception 'El pedido necesita al menos un artículo.';
  end if;

  select activo into v_colegio_activo from public.colegios where id = p_colegio_id;
  if not found then
    raise exception 'Colegio % no encontrado.', p_colegio_id;
  end if;
  if not v_colegio_activo then
    raise exception 'Ese colegio está inactivo.';
  end if;

  -- Primera pasada: validar las líneas y sumar el subtotal (antes de
  -- consumir un folio, para no quemar un consecutivo con un pedido inválido).
  for v_art in select * from jsonb_array_elements(p_articulos) loop
    if btrim(coalesce(v_art->>'articulo', '')) = '' then
      raise exception 'Hay una línea sin nombre de artículo.';
    end if;
    begin
      v_cantidad := (v_art->>'cantidad')::integer;
      v_precio := (v_art->>'precio_unitario')::numeric;
    exception when others then
      raise exception 'Cantidad o precio inválido en el artículo "%".', v_art->>'articulo';
    end;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de "%" debe ser mayor a cero.', v_art->>'articulo';
    end if;
    if v_precio is null or v_precio < 0 then
      raise exception 'El precio de "%" no puede ser negativo.', v_art->>'articulo';
    end if;
    v_subtotal := v_subtotal + round(v_cantidad * v_precio, 2);
  end loop;

  if p_anticipo_monto is not null then
    v_monto := round(p_anticipo_monto, 2);
    if v_monto < 0 or v_monto > v_subtotal then
      raise exception 'El anticipo debe estar entre 0 y el subtotal (%).', v_subtotal;
    end if;
    v_pct := case when v_subtotal > 0 then round(v_monto / v_subtotal * 100, 2) else 100 end;
  else
    v_pct := coalesce(p_anticipo_porcentaje, 100);
    if v_pct < 0 or v_pct > 100 then
      raise exception 'El porcentaje de anticipo debe estar entre 0 y 100.';
    end if;
    v_monto := round(v_subtotal * v_pct / 100, 2);
  end if;

  -- Folio: el UPDATE toma el candado de la fila del colegio hasta el fin
  -- de la transacción — dos capturas simultáneas se serializan aquí.
  update public.colegios set ultimo_folio = ultimo_folio + 1
  where id = p_colegio_id
  returning ultimo_folio, codigo_folio into v_n, v_codigo;

  insert into public.colegio_pedidos (
    colegio_id, folio, cliente_nombre, cliente_referencia, cliente_telefono,
    anticipo_porcentaje, anticipo_monto, subtotal, creado_por
  ) values (
    p_colegio_id, v_codigo || v_n, v_cliente,
    nullif(btrim(coalesce(p_cliente_referencia, '')), ''),
    nullif(btrim(coalesce(p_cliente_telefono, '')), ''),
    v_pct, v_monto, v_subtotal, auth.uid()
  ) returning * into v_pedido;

  for v_art in select * from jsonb_array_elements(p_articulos) loop
    v_cantidad := (v_art->>'cantidad')::integer;
    v_precio := (v_art->>'precio_unitario')::numeric;
    v_importe := round(v_cantidad * v_precio, 2);
    insert into public.colegio_pedido_articulos (pedido_id, posicion, articulo, talla, cantidad, precio_unitario, importe)
    values (
      v_pedido.id, v_pos, btrim(v_art->>'articulo'),
      nullif(btrim(coalesce(v_art->>'talla', '')), ''),
      v_cantidad, round(v_precio, 2), v_importe
    );
    v_pos := v_pos + 1;
  end loop;

  return v_pedido;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) RPC — abonos posteriores al anticipo (alta / baja) y baja lógica de
--    pedido. Un abono no puede pasarse del saldo pendiente.
-- ---------------------------------------------------------------------
create or replace function public.add_colegio_abono(
  p_pedido_id uuid,
  p_monto numeric,
  p_nota text default null,
  p_fecha timestamptz default null
)
returns public.colegio_pedido_abonos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abono public.colegio_pedido_abonos;
  v_pedido public.colegio_pedidos;
  v_abonado numeric;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo el administrador general puede registrar abonos.';
  end if;
  if v_monto <= 0 then
    raise exception 'El monto del abono debe ser mayor a cero.';
  end if;

  select * into v_pedido from public.colegio_pedidos where id = p_pedido_id;
  if not found then
    raise exception 'Pedido % no encontrado.', p_pedido_id;
  end if;
  if v_pedido.eliminado_en is not null then
    raise exception 'Este pedido fue eliminado y ya no admite abonos.';
  end if;

  select coalesce(sum(monto), 0) into v_abonado from public.colegio_pedido_abonos where pedido_id = p_pedido_id;
  if v_pedido.anticipo_monto + v_abonado + v_monto > v_pedido.subtotal then
    raise exception 'El abono excede el saldo pendiente (%).', v_pedido.subtotal - v_pedido.anticipo_monto - v_abonado;
  end if;

  insert into public.colegio_pedido_abonos (pedido_id, fecha, monto, nota, registrado_por)
  values (p_pedido_id, coalesce(p_fecha, now()), v_monto, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
  returning * into v_abono;
  return v_abono;
end;
$$;

create or replace function public.delete_colegio_abono(p_abono_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo el administrador general puede borrar abonos.';
  end if;
  delete from public.colegio_pedido_abonos where id = p_abono_id;
  if not found then
    raise exception 'Abono % no encontrado.', p_abono_id;
  end if;
end;
$$;

create or replace function public.soft_delete_colegio_pedido(p_pedido_id uuid)
returns public.colegio_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.colegio_pedidos;
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo el administrador general puede eliminar pedidos.';
  end if;
  update public.colegio_pedidos set eliminado_en = now()
  where id = p_pedido_id and eliminado_en is null
  returning * into v_pedido;
  if not found then
    raise exception 'Pedido % no encontrado o ya eliminado.', p_pedido_id;
  end if;
  return v_pedido;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) Privilegios de las funciones (checklist de schema_v9_security_fix)
-- ---------------------------------------------------------------------
revoke execute on function public.create_colegio(text, text) from public;
revoke execute on function public.create_colegio_pedido(uuid, text, text, text, numeric, numeric, jsonb) from public;
revoke execute on function public.add_colegio_abono(uuid, numeric, text, timestamptz) from public;
revoke execute on function public.delete_colegio_abono(uuid) from public;
revoke execute on function public.soft_delete_colegio_pedido(uuid) from public;

grant execute on function public.create_colegio(text, text) to authenticated;
grant execute on function public.create_colegio_pedido(uuid, text, text, text, numeric, numeric, jsonb) to authenticated;
grant execute on function public.add_colegio_abono(uuid, numeric, text, timestamptz) to authenticated;
grant execute on function public.delete_colegio_abono(uuid) to authenticated;
grant execute on function public.soft_delete_colegio_pedido(uuid) to authenticated;

-- Verificación (correr después y confirmar):
--   select count(*) from public.colegios;                     -- 6
--   select proname, count(*) from pg_proc
--     where proname in ('create_colegio','create_colegio_pedido','add_colegio_abono',
--                       'delete_colegio_abono','soft_delete_colegio_pedido')
--     group by 1;                                             -- 1 fila (count=1) por función
--   select has_function_privilege('anon', 'public.create_colegio_pedido(uuid,text,text,text,numeric,numeric,jsonb)', 'EXECUTE');  -- false
--   select has_table_privilege('anon', 'public.colegio_pedidos', 'SELECT');                                                      -- false
--   select has_table_privilege('authenticated', 'public.colegio_pedidos', 'INSERT');                                             -- false
