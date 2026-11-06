-- =====================================================================
-- V188 — Frisa fase 3: revisión contra Microsip (2026-11-06)
-- =====================================================================
-- Cada 10 días se exporta de Microsip el reporte "Existencia y valor del
-- inventario" (línea FRISA) y se sube a la página. La pantalla lo lee, liga
-- cada artículo con su clave (por el código de Microsip aprendido, por la
-- clave o por el nombre) y muestra las diferencias. Se guarda la revisión y,
-- en las claves que se elijan, se ajusta la página a lo que dice Microsip
-- (movimiento 'ajuste' por la diferencia contra el stock AL GUARDAR).
--
-- Permiso nuevo: fm.revisar (admin_general, admin_fabrica, admin_tienda).
-- Aditivo: 2 tablas, 1 permiso, 1 función. Se puede correr dos veces.
-- Rollback al final. Requiere V185.
-- =====================================================================

insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('fm.revisar', 'Frisa niveles', 'Revisión contra Microsip', 'Subir las existencias de Microsip, guardar la revisión y ajustar el inventario de la página a Microsip.', 'editar', 100)
on conflict (clave) do nothing;
insert into public.rol_permisos (rol, clave)
select r, 'fm.revisar' from unnest(array['admin_general', 'admin_fabrica', 'admin_tienda']) r
on conflict do nothing;

-- Código de Microsip (ej. 1027930) → clave. Se aprende al guardar una revisión.
create table if not exists public.frisa_clave_microsip (
  codigo          text primary key check (btrim(codigo) <> ''),
  producto_id     uuid not null references public.frisa_productos_niveles(id) on delete cascade,
  actualizado_en  timestamptz not null default now()
);

-- Cada revisión guardada (con su detalle por clave).
create table if not exists public.frisa_revisiones_microsip (
  id                 uuid primary key default gen_random_uuid(),
  fecha_corte        date not null,
  archivo            text,
  claves             integer not null default 0,   -- claves ligadas en el archivo
  diferencias        integer not null default 0,   -- claves con diferencia al guardar
  ajustadas          integer not null default 0,   -- claves que se ajustaron a Microsip
  piezas_pagina      integer not null default 0,
  piezas_microsip    integer not null default 0,
  sin_ligar          integer not null default 0,   -- artículos del archivo sin clave
  detalle            jsonb not null default '[]'::jsonb,  -- [{producto_id, clave, codigo, pagina, microsip, ajustada}]
  notas              text,
  creado_por         uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_por_nombre  text,
  creado_en          timestamptz not null default now()
);
create index if not exists frisa_revisiones_microsip_idx on public.frisa_revisiones_microsip (creado_en desc);

alter table public.frisa_clave_microsip       enable row level security;
alter table public.frisa_revisiones_microsip  enable row level security;
drop policy if exists frisa_clave_microsip_select on public.frisa_clave_microsip;
create policy frisa_clave_microsip_select on public.frisa_clave_microsip for select to authenticated using (public.tiene_permiso('fn.ver'));
drop policy if exists frisa_revisiones_microsip_select on public.frisa_revisiones_microsip;
create policy frisa_revisiones_microsip_select on public.frisa_revisiones_microsip for select to authenticated using (public.tiene_permiso('fn.ver'));
revoke all on public.frisa_clave_microsip, public.frisa_revisiones_microsip from anon, public;
revoke insert, update, delete, truncate on public.frisa_clave_microsip, public.frisa_revisiones_microsip from authenticated;
grant select on public.frisa_clave_microsip, public.frisa_revisiones_microsip to authenticated;

-- Guardar una revisión. p_lineas: [{producto_id, codigo, existencia}] (lo del archivo ya ligado);
-- p_ajustar: claves (producto_id) que se ajustan a Microsip; p_sin_ligar: cuántos artículos no se ligaron.
create or replace function public.frisa_microsip_guardar(
  p_fecha_corte date, p_archivo text, p_lineas jsonb, p_ajustar uuid[] default '{}'::uuid[],
  p_sin_ligar integer default 0, p_notas text default null)
returns public.frisa_revisiones_microsip
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := public.frisa_niveles_nombre_usuario();
  v_rev public.frisa_revisiones_microsip;
  v_l jsonb;
  v_p public.frisa_productos_niveles;
  v_ex integer;
  v_cod text;
  v_det jsonb := '[]'::jsonb;
  v_dif integer := 0;
  v_aj integer := 0;
  v_pp integer := 0;
  v_pm integer := 0;
  v_n integer := 0;
  v_ajustar boolean;
begin
  if not public.tiene_permiso('fm.revisar') then
    raise exception 'No tienes permiso para la revisión contra Microsip.' using errcode = '42501';
  end if;
  if p_fecha_corte is null then raise exception 'Falta la fecha de las existencias de Microsip.'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El archivo no trae artículos ligados a una clave.';
  end if;
  if (select count(*) <> count(distinct e->>'producto_id') from jsonb_array_elements(p_lineas) e) then
    raise exception 'Dos artículos de Microsip quedaron ligados a la misma clave: revisa la liga.';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));

  for v_l in select * from jsonb_array_elements(p_lineas) loop
    select * into v_p from public.frisa_productos_niveles where id = nullif(v_l->>'producto_id', '')::uuid for update;
    if not found then raise exception 'Una de las claves ya no existe.'; end if;
    v_ex := (v_l->>'existencia')::int;
    if v_ex is null or v_ex < 0 then raise exception 'Existencia inválida para %.', v_p.clave; end if;
    v_cod := nullif(btrim(coalesce(v_l->>'codigo', '')), '');
    v_ajustar := v_p.id = any(coalesce(p_ajustar, '{}'::uuid[])) and v_p.stock_actual <> v_ex;
    v_n := v_n + 1;
    v_pp := v_pp + v_p.stock_actual;
    v_pm := v_pm + v_ex;
    if v_p.stock_actual <> v_ex then v_dif := v_dif + 1; end if;
    v_det := v_det || jsonb_build_object('producto_id', v_p.id, 'clave', v_p.clave, 'codigo', v_cod,
                                         'pagina', v_p.stock_actual, 'microsip', v_ex, 'ajustada', v_ajustar);
    if v_ajustar then
      insert into public.frisa_conteos_stock (producto_id, clave, stock_anterior, stock_nuevo, origen, usuario_id, usuario_nombre, comentario)
      values (v_p.id, v_p.clave, v_p.stock_actual, v_ex, 'captura', auth.uid(), v_nombre,
              format('Revisión Microsip del %s', to_char(p_fecha_corte, 'DD/MM/YYYY')));
      insert into public.frisa_inv_movimientos (producto_id, clave, tipo, cantidad, referencia, notas, creado_por, creado_por_nombre)
      values (v_p.id, v_p.clave, 'ajuste', v_ex - v_p.stock_actual, format('Revisión Microsip del %s', to_char(p_fecha_corte, 'DD/MM/YYYY')),
              case when v_cod is not null then 'Código Microsip ' || v_cod end, auth.uid(), v_nombre);
      update public.frisa_productos_niveles set stock_actualizado_en = now(), stock_actualizado_por = auth.uid(),
             stock_actualizado_por_nombre = v_nombre where id = v_p.id;
      v_aj := v_aj + 1;
    end if;
    -- Aprende el código de Microsip de la clave.
    if v_cod is not null then
      insert into public.frisa_clave_microsip (codigo, producto_id) values (upper(v_cod), v_p.id)
      on conflict (codigo) do update set producto_id = excluded.producto_id, actualizado_en = now();
    end if;
  end loop;

  insert into public.frisa_revisiones_microsip (fecha_corte, archivo, claves, diferencias, ajustadas, piezas_pagina, piezas_microsip,
         sin_ligar, detalle, notas, creado_por, creado_por_nombre)
  values (p_fecha_corte, nullif(btrim(coalesce(p_archivo, '')), ''), v_n, v_dif, v_aj, v_pp, v_pm, greatest(coalesce(p_sin_ligar, 0), 0),
          v_det, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_nombre)
  returning * into v_rev;
  return v_rev;
end $$;

revoke execute on function public.frisa_microsip_guardar(date, text, jsonb, uuid[], integer, text) from public, anon;
grant execute on function public.frisa_microsip_guardar(date, text, jsonb, uuid[], integer, text) to authenticated;

-- Comprobación: el permiso y la función existen.
select (select count(*) from public.rol_permisos where clave = 'fm.revisar') as roles_con_permiso,
       (select count(*) from pg_proc where proname = 'frisa_microsip_guardar') as funciones;

-- ---------------------------------------------------------------------
-- Rollback (NO correr salvo que se quiera quitar todo V188):
--   drop function if exists public.frisa_microsip_guardar(date, text, jsonb, uuid[], integer, text);
--   drop table if exists public.frisa_revisiones_microsip, public.frisa_clave_microsip;
--   delete from public.rol_permisos where clave = 'fm.revisar';
--   delete from public.permisos_catalogo where clave = 'fm.revisar';
-- ---------------------------------------------------------------------
