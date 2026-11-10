-- =====================================================================
-- V199 — Frisa: al confirmar la entrega se suma a la planta (2026-11-09)
-- =====================================================================
-- Pedido de Alfredo: "cada vez que el chofer entregue, que se le agreguen
-- esas prendas al inventario de la planta; con las facturas se va descontando".
--   · "Ya entregó el chofer" (frisa_surtido_entregar) ahora, además de bajar
--     la bodega, suma las piezas a la planta de la OC como REMISIÓN, con el
--     folio de remisión que se escribe, y deja ese folio como ya contado.
--   · Así, al subir después los Diarios de Microsip, esa remisión se salta
--     (no se cuenta doble). Las facturas se siguen subiendo y restan.
--   · La planta se reconoce por el nombre de la OC (sin acentos, sin "Frisa",
--     "Planta" ni "de"): "FRISA VILLA DE GARCIA" = Villa García.
--   · Si la planta no se reconoce o ese folio ya estaba en plantas, la entrega
--     se hace igual (baja la bodega) y el historial dice que no se sumó.
-- Requiere V185, V189 y V195. Se puede correr dos veces.
-- =====================================================================

create or replace function public.frisa_planta_de(p_texto text)
returns uuid
language sql stable security definer set search_path = public as $$
  with n as (
    select btrim(regexp_replace(regexp_replace(
             upper(translate(coalesce(p_texto, ''), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUAEIOUU')),
             '\m(FRISA|PLANTA|DE|DEL|LA)\M', ' ', 'g'), '\s+', ' ', 'g')) as k
  )
  select pl.id from public.frisa_pl_plantas pl, n
  where n.k <> '' and n.k in (
    btrim(regexp_replace(regexp_replace(upper(translate(pl.nombre, 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUAEIOUU')), '\m(FRISA|PLANTA|DE|DEL|LA)\M', ' ', 'g'), '\s+', ' ', 'g')),
    btrim(regexp_replace(regexp_replace(upper(translate(pl.nombre_microsip, 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUAEIOUU')), '\m(FRISA|PLANTA|DE|DEL|LA)\M', ' ', 'g'), '\s+', ' ', 'g')))
  limit 1
$$;
revoke execute on function public.frisa_planta_de(text) from public, anon;
grant execute on function public.frisa_planta_de(text) to authenticated;

create or replace function public.frisa_surtido_entregar(p_id uuid, p_remision text, p_fecha date default null)
returns public.frisa_surtidos
language plpgsql security definer set search_path = public as $$
declare
  v_s public.frisa_surtidos;
  v_nombre text := public.frisa_niveles_nombre_usuario();
  v_planta uuid;
  v_planta_nombre text;
  v_folio text := upper(btrim(coalesce(p_remision, '')));
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Monterrey')::date);
  v_nota text;
begin
  if not public.tiene_permiso('fs.entregar') then
    raise exception 'No tienes permiso para marcar entregas de Frisa.' using errcode = '42501';
  end if;
  if v_folio = '' then
    raise exception 'Falta el folio de la remisión de Microsip.';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_inventario'));
  select * into v_s from public.frisa_surtidos where id = p_id for update;
  if not found then raise exception 'No existe la orden de surtido.'; end if;
  if v_s.estado <> 'surtida' then
    raise exception 'Primero hay que surtir la orden (está %).', v_s.estado;
  end if;

  -- 1) Baja la bodega de la fábrica (igual que antes).
  insert into public.frisa_inv_movimientos (producto_id, clave, tipo, cantidad, surtido_id, referencia, creado_por, creado_por_nombre)
  select l.producto_id, l.clave, 'entrega', -l.cantidad, p_id,
         format('Rem. %s · OC %s · %s', btrim(p_remision), v_s.numero_oc, v_s.planta), auth.uid(), v_nombre
  from public.frisa_surtido_lineas l where l.surtido_id = p_id;

  -- 2) Sube la planta de Frisa (remisión), si se reconoce la planta y el folio no estaba.
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
    select v_planta, l.producto_id, l.clave, 'remision', l.cantidad, v_folio, v_fecha, v_s.numero_oc,
           'Entrega confirmada en la página', auth.uid(), v_nombre
    from public.frisa_surtido_lineas l where l.surtido_id = p_id and l.cantidad > 0;
    v_nota := ' · sumado a la planta ' || v_planta_nombre;
  end if;

  update public.frisa_surtidos set estado = 'entregada', remision = btrim(p_remision),
         fecha_entrega = v_fecha, entregado_por_nombre = v_nombre, entregado_en = now()
   where id = p_id returning * into v_s;
  perform public.frisa_surtido_evento(p_id, 'entregada', 'Entregada por el chofer · Rem. ' || btrim(p_remision) || v_nota);
  return v_s;
end $$;
revoke execute on function public.frisa_surtido_entregar(uuid, text, date) from public, anon;
grant execute on function public.frisa_surtido_entregar(uuid, text, date) to authenticated;

-- Comprobación: cómo reconoce las plantas de las OC que hay (debe salir una planta en cada una).
select s.planta as planta_de_la_oc, pl.nombre as planta_frisa, count(*) as ordenes
from public.frisa_surtidos s
left join public.frisa_pl_plantas pl on pl.id = public.frisa_planta_de(s.planta)
where s.estado <> 'cancelada'
group by s.planta, pl.nombre order by 1;
