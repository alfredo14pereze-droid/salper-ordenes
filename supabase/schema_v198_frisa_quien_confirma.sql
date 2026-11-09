-- =====================================================================
-- V198 — Frisa: quién confirma cada cosa (2026-11-09)
-- =====================================================================
-- Pedido de Alfredo:
--   · Pedido de pantalón → lo recibe Gis (ventas)            [fr.recibir_pantalon]
--   · Pedido de playera lisa → Jackie o Adriana               [fr.recibir_lisa]
--   · Subir a bodega lo del taller → Jackie o Adriana         [fr.bodega]
--   · Entrega de Leo ("Ya entregó el chofer") → Gis (ventas)  [fs.entregar]
-- Los permisos son por ROL: se busca el rol de Jackie y de Adriana en
-- profiles y se le da a ese rol. Nadie más (salvo admin_general) se queda
-- con esos permisos. Si no encuentra a Jackie ni a Adriana, no cambia nada.
-- Se puede correr dos veces.
-- =====================================================================
do $$
declare
  v_roles text[];
begin
  select array_agg(distinct role) into v_roles
  from public.profiles
  where suspended_at is null and role is not null
    and (full_name ilike '%jack%' or full_name ilike '%jaq%' or full_name ilike '%adriana%');
  if v_roles is null then
    raise exception 'V198: no encontré a Jackie ni a Adriana en los usuarios. No se cambió nada.';
  end if;
  if v_roles && array['chofer', 'ventas'] then
    raise exception 'V198: Jackie o Adriana tienen rol % (no esperado). No se cambió nada.', v_roles;
  end if;

  -- Jackie / Adriana: subir a bodega y recibir playera lisa
  insert into public.rol_permisos (rol, clave)
  select r, c from unnest(v_roles) r, unnest(array['fr.bodega', 'fr.recibir_lisa', 'fn.ver', 'fs.ver', 'fx.restock']) c
  on conflict do nothing;
  delete from public.rol_permisos
   where clave in ('fr.bodega', 'fr.recibir_lisa') and rol <> 'admin_general' and not (rol = any(v_roles));

  -- Gis: confirma las entregas y recibe el pantalón
  insert into public.rol_permisos (rol, clave) values
    ('ventas', 'fs.entregar'), ('ventas', 'fr.recibir_pantalon'), ('admin_general', 'fs.entregar')
  on conflict do nothing;
  delete from public.rol_permisos where clave = 'fs.entregar' and rol not in ('ventas', 'admin_general');
  delete from public.rol_permisos where clave = 'fr.recibir_pantalon' and rol not in ('ventas', 'admin_general');
end $$;

-- Comprobación: a quién encontró y quién tiene cada permiso.
select (select string_agg(full_name || ' = ' || role, ', ' order by full_name) from public.profiles
         where suspended_at is null and (full_name ilike '%jack%' or full_name ilike '%jaq%' or full_name ilike '%adriana%')) as jackie_y_adriana,
       (select string_agg(rol, ', ' order by rol) from public.rol_permisos where clave = 'fr.bodega') as suben_a_bodega,
       (select string_agg(rol, ', ' order by rol) from public.rol_permisos where clave = 'fr.recibir_lisa') as reciben_lisa,
       (select string_agg(rol, ', ' order by rol) from public.rol_permisos where clave = 'fr.recibir_pantalon') as reciben_pantalon,
       (select string_agg(rol, ', ' order by rol) from public.rol_permisos where clave = 'fs.entregar') as confirman_entregas;
