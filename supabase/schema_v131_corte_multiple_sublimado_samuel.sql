-- =====================================================================
-- V131 — Corte con varios cortes + la etapa "sublimado" pasa de corte a sublimado
-- =====================================================================
-- 1) update_orden_etapa: la etapa 'sublimado' (la sublimada de las órdenes de
--    sublimación) la reportaba el rol 'corte' (V120). Ahora la reporta el rol
--    'sublimado' (Samuel), que ya reporta 'impresion'. admin_fabrica y
--    admin_general siguen pudiendo todas. Se parchea la definición VIVA con un
--    solo reemplazo (así no se pierde nada de lo que tenga hoy) y aborta si no
--    encuentra el texto esperado.
-- 2) marcar_corte: ahora acepta VARIOS cortes por tela y cortes de telas que no
--    están asignadas a las prendas (p. ej. vivos): cada elemento de p_consumos
--    puede traer su `nota` ("Manta para pantalón: 12.50 m"). Por cada tela se
--    SUMAN sus cortes y se guarda un solo movimiento consumo_corte con la
--    cantidad total y las notas juntas en movimientos_tela.nota (columna que ya
--    existe y se muestra en v_movimientos_tela). Las telas de las prendas
--    siguen siendo obligatorias. Misma firma (uuid, jsonb), mismos permisos; una
--    llamada vieja (un elemento por tela, sin nota) funciona igual que antes.
-- Aditivo en datos: no se agrega ni se cambia ninguna tabla ni columna.
-- =====================================================================

-- 0) Guarda de deriva
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where proname = 'update_orden_etapa' and pronamespace = 'public'::regnamespace;
  if v_src is null or position($q$when 'sublimado' then v_role = 'corte'$q$ in v_src) = 0 then
    raise exception 'V131: update_orden_etapa viva ya no tiene el caso sublimado->corte esperado. No se aplicó nada.';
  end if;
  select prosrc into v_src from pg_proc where proname = 'marcar_corte' and pronamespace = 'public'::regnamespace;
  if v_src is null or position('Falta capturar la tela usada' in v_src) = 0 or position('v_telas_orden' in v_src) = 0 then
    raise exception 'V131: marcar_corte viva ya no es la de V102. No se aplicó nada.';
  end if;
  if (select count(*) from pg_proc where proname in ('update_orden_etapa', 'marcar_corte') and pronamespace = 'public'::regnamespace) <> 2 then
    raise exception 'V131: se esperaba una sola copia de cada función.';
  end if;
end $$;

-- 1) update_orden_etapa: sublimado lo reporta el rol sublimado
do $$
declare r record; d text; nuevo text;
begin
  for r in select p.oid from pg_proc p where p.proname = 'update_orden_etapa' and p.pronamespace = 'public'::regnamespace loop
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d, $q$when 'sublimado' then v_role = 'corte'$q$, $q$when 'sublimado' then v_role = 'sublimado'$q$);
    if nuevo = d then raise exception 'V131: no pude parchear update_orden_etapa.'; end if;
    execute nuevo;
  end loop;
end $$;

-- 2) marcar_corte con varios cortes
create or replace function public.marcar_corte(p_orden_id uuid, p_consumos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_items jsonb;
  v_telas_orden uuid[];
  v_telas uuid[];
  v_tela_id uuid;
  v_tela_unidad text;
  v_cantidad numeric;
  v_nota text;
  v_snapshot jsonb;
  v_estimado_total numeric;
  v_entry jsonb;
begin
  if coalesce(v_role, '') not in ('corte', 'admin_fabrica', 'admin_general') then
    raise exception 'No tienes permiso para marcar el corte de esta orden.';
  end if;

  select items into v_items from public.orders where id = p_orden_id;
  if v_items is null then
    raise exception 'Orden % no encontrada.', p_orden_id;
  end if;

  select array_agg(distinct (item->>'tela_id')::uuid) into v_telas_orden
  from jsonb_array_elements(v_items) as item
  where item->>'tela_id' is not null and item->>'tela_id' <> '';

  if v_telas_orden is null or array_length(v_telas_orden, 1) = 0 then
    raise exception 'Esta orden no tiene ninguna tela asignada a sus prendas.';
  end if;

  -- Telas de las prendas + las demás telas que traiga algún corte (vivos, etc.)
  select array_agg(distinct t) into v_telas from (
    select unnest(v_telas_orden) as t
    union
    select (e->>'tela_id')::uuid from jsonb_array_elements(coalesce(p_consumos, '[]'::jsonb)) e
    where e->>'tela_id' is not null and e->>'tela_id' <> ''
  ) x;

  foreach v_tela_id in array v_telas
  loop
    v_cantidad := 0;
    v_nota := null;
    for v_entry in select * from jsonb_array_elements(coalesce(p_consumos, '[]'::jsonb))
    loop
      if (v_entry->>'tela_id')::uuid = v_tela_id then
        v_cantidad := v_cantidad + coalesce(nullif(v_entry->>'cantidad', '')::numeric, 0);
        if btrim(coalesce(v_entry->>'nota', '')) <> '' then
          v_nota := case when v_nota is null then btrim(v_entry->>'nota') else v_nota || ' · ' || btrim(v_entry->>'nota') end;
        end if;
      end if;
    end loop;

    if v_cantidad <= 0 then
      if v_tela_id = any(v_telas_orden) then
        raise exception 'Falta capturar la tela usada para una de las telas de esta orden.';
      end if;
      continue; -- una tela extra sin cantidad no se registra
    end if;

    select unidad into v_tela_unidad from public.telas where id = v_tela_id;
    if not exists (select 1 from public.telas where id = v_tela_id) then
      raise exception 'Una de las telas del corte no existe.';
    end if;
    if v_tela_unidad is null then
      raise exception 'Una de las telas de esta orden no tiene unidad de medida definida. Pide que la configuren en Catálogos.';
    end if;

    v_snapshot := '[]'::jsonb;
    v_estimado_total := null;
    if v_tela_id = any(v_telas_orden) then
      select coalesce(jsonb_agg(jsonb_build_object('garment', d.garment, 'talla', d.talla, 'estimado', d.estimado)), '[]'::jsonb),
             sum(d.estimado)
        into v_snapshot, v_estimado_total
        from public.calcular_consumo_detalle(v_items) d
       where d.tela_id = v_tela_id and d.estimado is not null;
    end if;

    insert into public.movimientos_tela (
      tela_id, tipo, cantidad, unidad, orden_id, usuario_id, nota, consumo_estimado, orden_prendas_snapshot
    ) values (
      v_tela_id, 'consumo_corte', -abs(v_cantidad), v_tela_unidad, p_orden_id, auth.uid(), v_nota, v_estimado_total, v_snapshot
    );
  end loop;

  perform public.update_orden_etapa(p_orden_id, 'corte', 'completado');
end;
$$;
revoke execute on function public.marcar_corte(uuid, jsonb) from public;
grant execute on function public.marcar_corte(uuid, jsonb) to authenticated;

-- Verificación (después de correr):
--   select position($q$when 'sublimado' then v_role = 'sublimado'$q$ in prosrc) > 0 from pg_proc where proname = 'update_orden_etapa';  -- true
--   select count(*) from pg_proc where proname in ('update_orden_etapa','marcar_corte');                                                -- 2
--   select has_function_privilege('anon', 'public.marcar_corte(uuid,jsonb)', 'EXECUTE');                                                -- false
