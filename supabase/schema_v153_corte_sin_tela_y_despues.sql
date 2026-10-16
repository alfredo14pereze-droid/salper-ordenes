-- =====================================================================
-- V153 — Corte: registrar la tela aunque la orden no la traiga, y después
-- =====================================================================
-- Pancho no pudo capturar hojas/trazo en VEN-004 e IND-007: sus prendas no
-- tienen tela asignada, y desde V142 la pantalla de corte en ese caso solo
-- ofrece "Cortado" sin registrar tela (marcar_corte rechazaba la orden sin
-- tela). Al 2026-10-16 hay 9 órdenes pendientes de corte sin tela.
--
-- Cambios en marcar_corte (parche con guarda sobre la función viva, misma
-- firma):
--   1. Una orden SIN tela en sus prendas ya no se rechaza: se registra la
--      tela que elija corte (en la pantalla). Si la orden no trae tela, el
--      corte tiene que traer al menos una tela con cantidad.
--   2. No se puede registrar dos veces el corte de una orden (si ya tiene
--      movimientos de corte, se rechaza). Así se puede capturar el corte
--      DESPUÉS de haberla marcado cortada sin duplicar el consumo de tela.
--      (Si la etapa ya estaba completada, se queda completada; sus horas no
--      cambian.)
--
-- Rollback: volver a correr el bloque cambiando viejo por nuevo en los dos
-- pares.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================
do $$
declare
  v_viejo_1 constant text := $q$  if v_telas_orden is null or array_length(v_telas_orden, 1) = 0 then
    raise exception 'Esta orden no tiene ninguna tela asignada a sus prendas.';
  end if;$q$;
  v_nuevo_1 constant text := $q$  -- V153: una orden sin tela en sus prendas se puede cortar registrando la
  -- tela que elija corte; y el corte de una orden no se registra dos veces.
  v_telas_orden := coalesce(v_telas_orden, '{}'::uuid[]);
  if exists (select 1 from public.movimientos_tela where orden_id = p_orden_id and tipo = 'consumo_corte') then
    raise exception 'El corte de esta orden ya se registró. Si hay un error en la tela usada, se corrige con un ajuste en Inventario de tela.';
  end if;
  if cardinality(v_telas_orden) = 0 and not exists (
    select 1 from jsonb_array_elements(coalesce(p_consumos, '[]'::jsonb)) e
    where coalesce(e->>'tela_id', '') <> '' and coalesce(nullif(e->>'cantidad', '')::numeric, 0) > 0
  ) then
    raise exception 'Esta orden no tiene tela en sus prendas: elige la tela que se usó y captura el corte.';
  end if;$q$;
  v_viejo_2 constant text := $q$  foreach v_tela_id in array v_telas
  loop$q$;
  v_nuevo_2 constant text := $q$  foreach v_tela_id in array coalesce(v_telas, '{}'::uuid[])
  loop$q$;
  r record;
  d text;
  nuevo text;
  n int;
begin
  select count(*) into n from pg_proc where proname = 'marcar_corte' and pronamespace = 'public'::regnamespace;
  if n <> 1 then
    raise exception 'V153: se esperaba una sola copia de marcar_corte, hay %. No se aplicó nada.', n;
  end if;
  select p.oid, p.prosrc into r from pg_proc p where p.proname = 'marcar_corte' and p.pronamespace = 'public'::regnamespace;
  if position('V153' in r.prosrc) > 0 then
    return;  -- ya parcheada
  end if;
  if position(v_viejo_1 in r.prosrc) = 0 or position(v_viejo_2 in r.prosrc) = 0 then
    raise exception 'V153: marcar_corte viva no tiene el texto esperado (md5 %). No se aplicó nada.', md5(r.prosrc);
  end if;
  d := pg_get_functiondef(r.oid);
  nuevo := replace(replace(d, v_viejo_1, v_nuevo_1), v_viejo_2, v_nuevo_2);
  if position(v_nuevo_1 in nuevo) = 0 or position(v_nuevo_2 in nuevo) = 0 then
    raise exception 'V153: no pude parchear marcar_corte. No se aplicó nada.';
  end if;
  execute nuevo;
end $$;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select position('V153' in prosrc) > 0 from pg_proc
--   where proname = 'marcar_corte' and pronamespace = 'public'::regnamespace;   -- true
-- =====================================================================
