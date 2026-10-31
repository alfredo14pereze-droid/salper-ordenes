-- =====================================================================
-- Datos 2026-10-31 — Copiar las operaciones de la chamarra del Vasco a
-- CHAMARRA DOMUS
-- =====================================================================
-- Pedido de Alfredo: la chamarra de Domus lleva las mismas operaciones que
-- la del Vasco. Se copian las operaciones ACTIVAS (parte, operación y
-- segundos) a la prenda nueva CHAMARRA DOMUS. La del Vasco no cambia.
--
-- Folios: como toda prenda nueva, en la primera centena libre (x01, x02…),
-- en el mismo orden que los folios del Vasco. Un folio nunca se reutiliza.
--
-- Solo datos: no cambia tablas ni funciones.
-- Seguro: si no encuentra exactamente UNA chamarra del Vasco, o si ya hay una
-- chamarra de Domus en el catálogo, no carga nada y dice por qué.
--
-- Rollback (solo si todavía no se ha capturado producción con esos folios):
--   delete from public.prod_operaciones where prenda = 'CHAMARRA DOMUS';
-- =====================================================================
do $$
declare
  v_origen  text;
  v_nombres text;
  v_n       integer;
  v_ops     integer;
  v_c       integer := 0;
  v_destino constant text := 'CHAMARRA DOMUS';
begin
  select count(distinct prenda), min(prenda), string_agg(distinct prenda, ', ')
    into v_n, v_origen, v_nombres
    from public.prod_operaciones
   where prenda ilike '%chamarra%' and prenda ilike '%vasco%';
  if v_n = 0 then
    raise exception 'No encuentro ninguna chamarra del Vasco en el catálogo. No se cargó nada.';
  elsif v_n > 1 then
    raise exception 'Hay varias chamarras del Vasco (%). No se cargó nada.', v_nombres;
  end if;

  select string_agg(distinct prenda, ', ') into v_nombres
    from public.prod_operaciones
   where prenda ilike '%chamarra%' and prenda ilike '%domus%';
  if v_nombres is not null then
    raise exception 'Ya existe % en el catálogo. No se cargó nada.', v_nombres;
  end if;

  select count(*) into v_ops from public.prod_operaciones where prenda = v_origen and activa;
  if v_ops = 0 then
    raise exception '% no tiene operaciones activas. No se cargó nada.', v_origen;
  elsif v_ops > 99 then
    raise exception '% tiene % operaciones; no caben en una centena. No se cargó nada.', v_origen, v_ops;
  end if;

  -- Primera centena sin ningún folio usado.
  while exists (select 1 from public.prod_operaciones where folio between v_c * 100 and v_c * 100 + 99) loop
    v_c := v_c + 1;
  end loop;

  insert into public.prod_operaciones (folio, prenda, parte, operacion, segundos, activa)
  select v_c * 100 + row_number() over (order by folio), v_destino, parte, operacion, segundos, true
    from public.prod_operaciones
   where prenda = v_origen and activa;

  raise notice 'Listo: % operaciones de % copiadas a % (folios % a %).',
    v_ops, v_origen, v_destino, v_c * 100 + 1, v_c * 100 + v_ops;
end $$;

-- Verificación (solo lectura): debe salir la misma cantidad y los mismos segundos.
select prenda, count(*) as operaciones, sum(segundos) as segundos, min(folio) as primer_folio, max(folio) as ultimo_folio
  from public.prod_operaciones
 where activa and prenda ilike '%chamarra%' and (prenda ilike '%vasco%' or prenda ilike '%domus%')
 group by prenda
 order by prenda;
