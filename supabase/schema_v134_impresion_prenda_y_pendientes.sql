-- =====================================================================
-- SALPER · Esquema V134
--
-- A) Etapa "Impresión" de una prenda (escolar / industrial / basquetbol):
--    cuando alguna prenda de la orden se marca "Lleva impresión", la orden
--    gana la etapa `impresion_prenda`, que reporta el rol `terminado`.
--    Es una etapa DISTINTA de `impresion` (V120), que es la impresión del
--    papel en las órdenes de sublimación y la reporta el rol `sublimado`.
--
-- B) Pendientes tienda ↔ fábrica, dos tipos de trabajo nuevos:
--    · "Arreglo y bordado": lleva las dos cosas; le aparece a bordado y a
--      costura, cada quien marca su parte y cuando están las dos pasa solo
--      a "Listo para regresar".
--    · "Envío de mercancía": solo se manda a fábrica; al confirmar que se
--      recibió, se cierra (estado nuevo `mercancia_recibida`).
--
-- Aditivo: columnas nuevas con default, un valor más en dos CHECK, dos
-- triggers nuevos, una función nueva (pf_marcar_parte) y un parche de dos
-- líneas a update_orden_etapa (misma técnica con guarda que V131). No se
-- tocan create_order, set_order_items, pf_aplicar ni pf_crear.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez. Si la
-- guarda del paso 0 falla, no se aplica nada.
-- =====================================================================

-- 0) Guarda de deriva: las funciones vivas deben ser las que se esperan.
do $$
declare v_src text;
begin
  if (select count(*) from pg_proc where proname = 'update_orden_etapa' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'V134: se esperaba una sola copia de update_orden_etapa. No se aplicó nada.';
  end if;
  select prosrc into v_src from pg_proc where proname = 'update_orden_etapa' and pronamespace = 'public'::regnamespace;
  if position('impresion_prenda' in v_src) = 0 and (
       position($q$if p_etapa not in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'terminado') then$q$ in v_src) = 0
       or position($q$when 'impresion' then v_role = 'sublimado'$q$ in v_src) = 0
     ) then
    raise exception 'V134: update_orden_etapa viva no es la esperada (V120/V131). No se aplicó nada.';
  end if;
  if to_regprocedure('public.pf_aplicar(uuid, text, text)') is null
     or to_regprocedure('public.pf_es_fabrica()') is null
     or to_regprocedure('public.pf_nombre_actual()') is null then
    raise exception 'V134: faltan funciones de Pendientes (pf_aplicar / pf_es_fabrica / pf_nombre_actual). No se aplicó nada.';
  end if;
end $$;

-- =====================================================================
-- A) Etapa impresion_prenda
-- =====================================================================

-- A1) CHECK de etapa (se busca por definición, igual que en V120).
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tabla, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.orden_etapas'::regclass, 'public.plantillas_etapas'::regclass)
      and pg_get_constraintdef(oid) ilike '%etapa%'
      and pg_get_constraintdef(oid) ilike '%corte%'
  loop
    execute format('alter table %s drop constraint %I', c.tabla, c.conname);
  end loop;
end $$;

alter table public.orden_etapas add constraint orden_etapas_etapa_check
  check (etapa in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'impresion_prenda', 'terminado'));
alter table public.plantillas_etapas add constraint plantillas_etapas_etapa_check
  check (etapa in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'impresion_prenda', 'terminado'));

-- A2) update_orden_etapa: acepta la etapa nueva y la reporta `terminado`.
do $$
declare r record; d text; nuevo text;
begin
  for r in select p.oid, p.prosrc from pg_proc p where p.proname = 'update_orden_etapa' and p.pronamespace = 'public'::regnamespace loop
    continue when position('impresion_prenda' in r.prosrc) > 0;  -- ya parcheada
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d,
      $q$if p_etapa not in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'terminado') then$q$,
      $q$if p_etapa not in ('impresion', 'corte', 'sublimado', 'produccion', 'bordado', 'impresion_prenda', 'terminado') then$q$);
    nuevo := replace(nuevo,
      $q$when 'impresion' then v_role = 'sublimado'$q$,
      $q$when 'impresion' then v_role = 'sublimado'
         when 'impresion_prenda' then v_role = 'terminado'$q$);
    if nuevo = d or position('impresion_prenda' in nuevo) = 0 then
      raise exception 'V134: no pude parchear update_orden_etapa.';
    end if;
    execute nuevo;
  end loop;
end $$;

-- A3) La etapa se crea (o se quita, si aún no arranca) sola según las
--     prendas: basta que una traiga "lleva_impresion": true. Va con la misma
--     secuencia que bordado (antes de terminado). Es un trigger sobre
--     orders.items para no redefinir create_order ni set_order_items.
create or replace function public.sync_etapa_impresion_prenda() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_necesita boolean := false;
  v_estado text;
begin
  if jsonb_typeof(new.items) = 'array' then
    select exists (
      select 1 from jsonb_array_elements(new.items) it where it->>'lleva_impresion' = 'true'
    ) into v_necesita;
  end if;

  select estado into v_estado from public.orden_etapas where order_id = new.id and etapa = 'impresion_prenda';

  if v_necesita and v_estado is null then
    insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
    values (
      new.id, 'impresion_prenda', 'pendiente',
      coalesce((select orden_secuencia from public.plantillas_etapas where order_type_key = new.order_type_key and etapa = 'bordado'), 3)
    )
    on conflict (order_id, etapa) do nothing;
  elsif not v_necesita and v_estado = 'pendiente' then
    delete from public.orden_etapas where order_id = new.id and etapa = 'impresion_prenda';
  end if;

  return null;
end;
$$;
revoke execute on function public.sync_etapa_impresion_prenda() from public;

drop trigger if exists orders_sync_impresion_prenda on public.orders;
create trigger orders_sync_impresion_prenda
  after insert or update of items on public.orders
  for each row execute function public.sync_etapa_impresion_prenda();

-- =====================================================================
-- B) Pendientes: "Arreglo y bordado" y "Envío de mercancía"
-- =====================================================================

-- B1) Columnas nuevas.
--     · pf_tipos_trabajo.partes: trabajos que componen el tipo (vacío = uno solo).
--     · pf_tipos_trabajo.solo_envio: no se le hace nada, solo se recibe.
--     · pf_pendientes.partes_listas: qué partes ya se marcaron listas.
alter table public.pf_tipos_trabajo
  add column if not exists partes text[] not null default '{}'::text[],
  add column if not exists solo_envio boolean not null default false;

alter table public.pf_pendientes
  add column if not exists partes_listas text[] not null default '{}'::text[];

-- B2) Estado nuevo de cierre para los envíos de mercancía.
alter table public.pf_pendientes drop constraint if exists pf_pendientes_estado_check;
alter table public.pf_pendientes add constraint pf_pendientes_estado_check check (estado in (
  'enviado_a_fabrica', 'recibido_en_fabrica', 'listo_para_regresar',
  'enviado_a_tienda', 'recibido_en_tienda', 'con_problema', 'entregado', 'mercancia_recibida'));

-- B3) Los dos tipos (si ya existieran con ese nombre, se reactivan).
insert into public.pf_tipos_trabajo (nombre, orden, activo, partes, solo_envio) values
  ('Arreglo y bordado', 3, true, array['Arreglo', 'Bordado'], false),
  ('Envío de mercancía', 4, true, '{}'::text[], true)
on conflict (nombre_normalizado) do update
  set activo = true, partes = excluded.partes, solo_envio = excluded.solo_envio;

-- B4) Envío de mercancía: al confirmar "recibido en fábrica" se cierra.
--     Trigger en vez de tocar pf_aplicar: la transición sigue validándose
--     ahí (rol de fábrica); aquí solo se cambia el estado final.
create or replace function public.pf_cerrar_envio_mercancia() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'recibido_en_fabrica' and old.estado = 'enviado_a_fabrica'
     and exists (select 1 from public.pf_tipos_trabajo t where t.id = new.tipo_id and t.solo_envio) then
    new.estado := 'mercancia_recibida';
    new.cerrado_en := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.pf_cerrar_envio_mercancia() from public;

drop trigger if exists pf_pendientes_cerrar_envio on public.pf_pendientes;
create trigger pf_pendientes_cerrar_envio
  before update of estado on public.pf_pendientes
  for each row execute function public.pf_cerrar_envio_mercancia();

-- B5) Arreglo y bordado: cada estación marca su parte; con todas listas el
--     pendiente pasa a "listo para regresar" (por pf_aplicar, como siempre).
create or replace function public.pf_marcar_parte(p_id uuid, p_parte text)
returns public.pf_pendientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.pf_pendientes;
  v_partes text[];
begin
  if not public.pf_es_fabrica() then raise exception 'No tienes permiso.'; end if;

  select * into v from public.pf_pendientes where id = p_id for update;
  if v.id is null then raise exception 'Pendiente no encontrado.'; end if;
  if v.estado <> 'recibido_en_fabrica' then raise exception 'Este pendiente no está por hacer.'; end if;

  select partes into v_partes from public.pf_tipos_trabajo where id = v.tipo_id;
  if p_parte is null or not (p_parte = any (coalesce(v_partes, '{}'::text[]))) then
    raise exception 'Este pendiente no lleva "%".', p_parte;
  end if;
  if p_parte = any (v.partes_listas) then return v; end if;

  update public.pf_pendientes
     set partes_listas = partes_listas || p_parte, updated_at = now()
   where id = p_id returning * into v;

  insert into public.pf_historial (pendiente_id, estado_anterior, estado_nuevo, nota, cambiado_por, cambiado_por_nombre, rol)
  values (p_id, v.estado, v.estado, p_parte || ' listo', auth.uid(), public.pf_nombre_actual(), coalesce(public.current_user_role(), ''));

  if v.partes_listas @> v_partes then
    v := public.pf_aplicar(p_id, 'listo_para_regresar', null);
  end if;
  return v;
end;
$$;
revoke execute on function public.pf_marcar_parte(uuid, text) from public;
grant execute on function public.pf_marcar_parte(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Verificación sugerida después de aplicar (solo lectura):
--
--   select position($q$when 'impresion_prenda' then v_role = 'terminado'$q$ in prosrc) > 0 as etapa_ok,
--          (select count(*) from pg_proc where proname = 'update_orden_etapa') as copias
--   from pg_proc where proname = 'update_orden_etapa';                      -- true, 1
--
--   select tgname from pg_trigger
--   where tgname in ('orders_sync_impresion_prenda', 'pf_pendientes_cerrar_envio');  -- 2 filas
--
--   select nombre, activo, partes, solo_envio from public.pf_tipos_trabajo order by orden, nombre;
--
--   select has_function_privilege('anon', 'public.pf_marcar_parte(uuid, text)', 'EXECUTE');  -- false
-- ---------------------------------------------------------------------
