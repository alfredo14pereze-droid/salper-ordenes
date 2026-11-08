-- =====================================================================
-- V194 — Pendientes: admin_fabrica también puede crear pendientes (2026-11-08)
-- =====================================================================
-- Pedido de Alfredo. Hasta hoy solo el lado tienda (pf.tienda) podía crear.
-- Se agrega el permiso pf.crear (solo crear; no da editar ni lo demás de
-- tienda) y se le da a admin_fabrica. pf_crear acepta pf.tienda O pf.crear.
-- Para no reescribir pf_crear (la viva es la de V129), se cambia SOLO su
-- chequeo de permiso sobre la definición que está en la base. Se puede
-- correr dos veces.
-- =====================================================================
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('pf.crear', 'Pendientes', 'Crear pendientes', 'Crear pendientes nuevos para fábrica (sin los demás permisos de tienda).', 'editar', 15)
on conflict (clave) do nothing;
insert into public.rol_permisos (rol, clave) values ('admin_fabrica', 'pf.crear') on conflict do nothing;

do $$
declare
  v_def text;
  v_n int;
begin
  select count(*) into v_n from pg_proc where proname = 'pf_crear' and pronamespace = 'public'::regnamespace;
  if v_n <> 1 then raise exception 'V194: se esperaba una sola pf_crear (hay %).', v_n; end if;
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.proname = 'pf_crear' and p.pronamespace = 'public'::regnamespace;
  if position('public.tiene_permiso(''pf.crear'')' in v_def) > 0 then
    raise notice 'V194: pf_crear ya acepta pf.crear.';
    return;
  end if;
  if position('if not public.pf_es_tienda() then' in v_def) = 0 then
    raise exception 'V194: pf_crear no tiene el chequeo esperado; no se cambió nada.';
  end if;
  v_def := replace(v_def, 'if not public.pf_es_tienda() then',
                          'if not (public.pf_es_tienda() or public.tiene_permiso(''pf.crear'')) then');
  execute v_def;
end $$;

-- Comprobación: pf_crear acepta pf.crear (1) y admin_fabrica lo tiene (1); además, si ve Pendientes (pf.ver).
select (select count(*) from pg_proc where proname = 'pf_crear' and pronamespace = 'public'::regnamespace
          and pg_get_functiondef(oid) like '%tiene_permiso(''pf.crear'')%') as pf_crear_acepta,
       (select count(*) from public.rol_permisos where rol = 'admin_fabrica' and clave = 'pf.crear') as admin_fabrica_crea,
       (select count(*) from public.rol_permisos where rol = 'admin_fabrica' and clave = 'pf.ver') as admin_fabrica_ve;
