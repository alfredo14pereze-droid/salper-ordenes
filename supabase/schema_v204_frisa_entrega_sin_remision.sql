-- =====================================================================
-- V204 — Frisa: confirmar entregas sin remisión, con entrega parcial (2026-11-10)
-- =====================================================================
-- Pedido de Alfredo: "que no se tenga que poner una remisión por cada OC (eso
-- se saca después con un resumen); para confirmar solo poner todo entregado, y
-- poder marcar si alguna no se entregó completa o no se entregó".
--   · frisa_surtido_entregar: la remisión es opcional. Sin p_lineas entrega
--     todo lo que falta; con p_lineas [{linea_id, cantidad}] entrega solo eso.
--     Si queda algo, la orden SIGUE en Surtidas (lo que falta sigue apartado)
--     y se puede entregar en otro viaje. Cada entrega baja la bodega y suma a
--     la planta (folio de la remisión si se escribió; si no, "OC <número>").
--   · frisa_surtido_cerrar_parcial: si lo que faltó ya no se va a entregar, se
--     cierra la orden con lo entregado y lo demás regresa a disponible.
--   · Regresar a pendiente / cancelar ya no se puede si hubo entrega parcial.
--   · Plantas Frisa: al subir los Diarios de Microsip ya SOLO cuentan las
--     facturas; las remisiones entran solas al confirmar la entrega.
-- Requiere V185, V189, V199, V202. Se puede correr dos veces.
-- =====================================================================

alter table public.frisa_surtido_lineas add column if not exists entregada integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'frisa_surtido_lineas_entregada_ck') then
    alter table public.frisa_surtido_lineas add constraint frisa_surtido_lineas_entregada_ck check (entregada >= 0 and entregada <= cantidad);
  end if;
end $$;
update public.frisa_surtido_lineas l set entregada = l.cantidad
  from public.frisa_surtidos s where s.id = l.surtido_id and s.estado = 'entregada' and l.entregada = 0;

-- Apartado: surtidas (lo que falta por entregar) + pendientes (lo apartado).
create or replace function public.frisa_apartado_clave(p_producto uuid, p_excepto uuid default null)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when s.estado = 'surtida' then l.cantidad - l.entregada else l.apartada end), 0)::int
  from public.frisa_surtido_lineas l
  join public.frisa_surtidos s on s.id = l.surtido_id
  where l.producto_id = p_producto and s.estado in ('surtida', 'pendiente')
    and (p_excepto is null or s.id <> p_excepto);
$$;
revoke execute on function public.frisa_apartado_clave(uuid, uuid) from public, anon, authenticated;

drop function if exists public.frisa_surtido_entregar(uuid, text, date);
create or replace function public.frisa_surtido_entregar(p_id uuid, p_remision text default null, p_fecha date default null, p_lineas jsonb default null)
returns public.frisa_surtidos
language plpgsql security definer set search_path = public as $$
declare
  v_s public.frisa_surtidos;
  v_nombre text := public.frisa_niveles_nombre_usuario();
  v_rem text := nullif(upper(btrim(coalesce(p_remision, ''))), '');
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Monterrey')::date);
  v_planta uuid;
  v_planta_nombre text;
  v_folio text;
  v_previas integer;
  v_total integer;
  v_falta integer;
  v_nota text;
begin
  if not public.tiene_permiso('fs.entregar') then
    raise exception 'No tienes permiso para marcar entregas de Frisa.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_s from public.frisa_surtidos where id = p_id for update;
  if not found then raise exception 'No existe la orden de surtido.'; end if;
  if v_s.estado <> 'surtida' then
    raise exception 'Primero hay que surtir la orden (está %).', v_s.estado;
  end if;

  -- Lo que se entrega ahora, por renglón (sin p_lineas = todo lo que falta).
  drop table if exists pg_temp.frisa_entrega_ahora;
  create temp table frisa_entrega_ahora on commit drop as
  select l.id, l.producto_id, l.clave,
         case when p_lineas is null then l.cantidad - l.entregada
              else coalesce((select (e->>'cantidad')::int from jsonb_array_elements(p_lineas) e where (e->>'linea_id')::uuid = l.id limit 1), 0) end as cant,
         l.cantidad - l.entregada as resta
  from public.frisa_surtido_lineas l where l.surtido_id = p_id;
  if exists (select 1 from frisa_entrega_ahora where cant < 0 or cant > resta) then
    raise exception 'Revisa las piezas: de cada renglón se puede entregar de 0 a lo que falta.';
  end if;
  select coalesce(sum(cant), 0) into v_total from frisa_entrega_ahora;
  if v_total = 0 then raise exception 'No hay piezas para entregar.'; end if;

  -- 1) Baja la bodega.
  insert into public.frisa_inv_movimientos (producto_id, clave, tipo, cantidad, surtido_id, referencia, creado_por, creado_por_nombre)
  select a.producto_id, a.clave, 'entrega', -a.cant, p_id,
         concat_ws(' · ', 'Rem. ' || v_rem, 'OC ' || v_s.numero_oc, v_s.planta), auth.uid(), v_nombre
  from frisa_entrega_ahora a where a.cant > 0;
  update public.frisa_surtido_lineas l set entregada = l.entregada + a.cant
    from frisa_entrega_ahora a where a.id = l.id and a.cant > 0;

  -- 2) Sube la planta (como remisión). Folio: el de la remisión o "OC <número>" (con -2, -3… si hay más viajes).
  select count(*) into v_previas from public.frisa_surtido_eventos where surtido_id = p_id and evento in ('entregada', 'entrega parcial');
  v_folio := coalesce(v_rem, 'OC ' || v_s.numero_oc) || case when v_rem is null and v_previas > 0 then '-' || (v_previas + 1) else '' end;
  v_planta := public.frisa_planta_de(v_s.planta);
  if v_planta is null then
    v_nota := ' · no se reconoció la planta: no se sumó a Plantas Frisa';
  elsif exists (select 1 from public.frisa_pl_folios where tipo = 'remision' and folio = v_folio) then
    v_nota := ' · esa remisión ya estaba en Plantas Frisa: no se sumó otra vez';
  else
    select nombre into v_planta_nombre from public.frisa_pl_plantas where id = v_planta;
    insert into public.frisa_pl_folios (tipo, folio, planta_id, fecha, orden_compra, importacion_id)
    values ('remision', v_folio, v_planta, v_fecha, v_s.numero_oc, null);
    insert into public.frisa_pl_movimientos (planta_id, producto_id, clave, tipo, cantidad, folio, fecha, orden_compra, notas, creado_por, creado_por_nombre)
    select v_planta, a.producto_id, a.clave, 'remision', a.cant, v_folio, v_fecha, v_s.numero_oc,
           'Entrega confirmada en la página', auth.uid(), v_nombre
    from frisa_entrega_ahora a where a.cant > 0;
    v_nota := ' · sumado a la planta ' || v_planta_nombre;
  end if;

  select coalesce(sum(cantidad - entregada), 0) into v_falta from public.frisa_surtido_lineas where surtido_id = p_id;
  if v_falta = 0 then
    update public.frisa_surtidos set estado = 'entregada', remision = coalesce(v_rem, remision),
           fecha_entrega = v_fecha, entregado_por_nombre = v_nombre, entregado_en = now()
     where id = p_id returning * into v_s;
    perform public.frisa_surtido_evento(p_id, 'entregada',
      concat_ws(' · ', 'Entregada por el chofer', 'Rem. ' || v_rem, v_total || ' pzas') || v_nota);
  else
    update public.frisa_surtidos set remision = coalesce(v_rem, remision) where id = p_id returning * into v_s;
    perform public.frisa_surtido_evento(p_id, 'entrega parcial',
      concat_ws(' · ', 'Rem. ' || v_rem, 'se entregaron ' || v_total || ' pzas', 'faltan ' || v_falta) || v_nota);
  end if;
  return v_s;
end $$;
revoke execute on function public.frisa_surtido_entregar(uuid, text, date, jsonb) from public, anon;
grant execute on function public.frisa_surtido_entregar(uuid, text, date, jsonb) to authenticated;

-- Cerrar con lo entregado: lo que faltó ya no se va a entregar y regresa a disponible.
create or replace function public.frisa_surtido_cerrar_parcial(p_id uuid, p_motivo text)
returns public.frisa_surtidos
language plpgsql security definer set search_path = public as $$
declare
  v_s public.frisa_surtidos;
  v_ent integer;
  v_falta integer;
begin
  if not public.tiene_permiso('fs.entregar') then
    raise exception 'No tienes permiso para marcar entregas de Frisa.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Escribe por qué no se entregó lo que faltó.'; end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_s from public.frisa_surtidos where id = p_id for update;
  if not found then raise exception 'No existe la orden de surtido.'; end if;
  if v_s.estado <> 'surtida' then raise exception 'Solo se puede cerrar una orden surtida.'; end if;
  select coalesce(sum(entregada), 0), coalesce(sum(cantidad - entregada), 0) into v_ent, v_falta
    from public.frisa_surtido_lineas where surtido_id = p_id;
  if v_ent = 0 then raise exception 'No se ha entregado nada de esta orden: regrésala a pendiente o cancélala.'; end if;
  update public.frisa_surtidos set estado = 'entregada', entregado_por_nombre = public.frisa_niveles_nombre_usuario(),
         entregado_en = now(), fecha_entrega = coalesce(fecha_entrega, (now() at time zone 'America/Monterrey')::date)
   where id = p_id returning * into v_s;
  perform public.frisa_surtido_evento(p_id, 'cerrada con entrega parcial',
    format('Se entregaron %s pzas; %s no se entregaron y regresan a disponible · %s', v_ent, v_falta, btrim(p_motivo)));
  return v_s;
end $$;
revoke execute on function public.frisa_surtido_cerrar_parcial(uuid, text) from public, anon;
grant execute on function public.frisa_surtido_cerrar_parcial(uuid, text) to authenticated;

-- Regresar a pendiente y cancelar: no si ya se entregó una parte.
do $$
declare
  f text;
  v_def text;
  v_guarda text := E'  if exists (select 1 from public.frisa_surtido_lineas where surtido_id = p_id and entregada > 0) then\n    raise exception ''Ya se entregó una parte de esta orden: entrega lo que falta o ciérrala con lo entregado.'';\n  end if;\n';
begin
  foreach f in array array['public.frisa_surtido_regresar(uuid, text)', 'public.frisa_surtido_cancelar(uuid, text)'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    if position('Ya se entregó una parte' in v_def) = 0 then
      v_def := regexp_replace(v_def, '(if not found then raise exception ''No existe la orden de surtido.''; end if;\n)', E'\\1' || v_guarda);
      if position('Ya se entregó una parte' in v_def) = 0 then raise exception 'No se pudo parchar %', f; end if;
      execute v_def;
    end if;
  end loop;
end $$;

-- Plantas Frisa: del Excel de Microsip solo cuentan las facturas.
do $$
declare
  v_def text := pg_get_functiondef('public.frisa_pl_importar(text, jsonb, integer, text)'::regprocedure);
  v_viejo text := $v$if v_tipo not in ('remision', 'factura') then raise exception 'Tipo de documento inválido: %.', v_tipo; end if;$v$;
begin
  if position('V204: remisiones' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then raise exception 'No se encontró dónde parchar frisa_pl_importar'; end if;
    v_def := replace(v_def, v_viejo, v_viejo || E'\n    -- V204: remisiones del Excel no cuentan (entran al confirmar la entrega).\n    if v_tipo = ''remision'' then continue; end if;');
    execute v_def;
  end if;
end $$;

-- Comprobación.
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'frisa_surtido_lineas' and column_name = 'entregada') as columna,
       (select count(*) from pg_proc where proname = 'frisa_surtido_entregar') as funciones_entregar,
       (select count(*) from pg_proc where proname = 'frisa_surtido_cerrar_parcial') as cerrar_parcial,
       (select position('V204: remisiones' in pg_get_functiondef('public.frisa_pl_importar(text, jsonb, integer, text)'::regprocedure)) > 0) as plantas_solo_facturas,
       (select coalesce(sum(public.frisa_apartado_clave(id)), 0) from public.frisa_productos_niveles) as piezas_apartadas;
