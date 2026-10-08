-- =====================================================================
-- V142 — Corte: una tela sin unidad de medida ya no bloquea el corte
-- =====================================================================
-- Ninguna tela del catálogo tiene unidad (metro/kilo) todavía y marcar_corte
-- rechazaba TODO corte con "Una de las telas de esta orden no tiene unidad
-- de medida definida". Las unidades se van a ir cargando poco a poco; mientras
-- tanto corte tiene que poder terminar.
--
-- 1) movimientos_tela.unidad deja de ser obligatoria (null = "la tela aún no
--    tenía unidad cuando se registró").
-- 2) marcar_corte: se quita solo ese rechazo en la función viva (parche con
--    guarda, técnica de V131/V134). El movimiento se guarda con la cantidad
--    capturada y unidad null.
-- 3) Trigger en telas: cuando a una tela se le define la unidad, sus
--    movimientos que quedaron sin unidad la reciben. (No cambia cantidades.)
--
-- No cambia: entradas y ajustes de inventario siguen exigiendo unidad.
--
-- Rollback (solo si no quedan movimientos sin unidad):
--   drop trigger if exists telas_unidad_a_movimientos_trg on public.telas;
--   drop function if exists public.telas_unidad_a_movimientos();
--   alter table public.movimientos_tela alter column unidad set not null;
--   y volver a pegar marcar_corte de schema_v131_corte_multiple_sublimado_samuel.sql.
-- =====================================================================

-- 0) Guarda: una sola marcar_corte, con el rechazo esperado (o ya parcheada).
do $$
declare
  v_viejo constant text := $q$if v_tela_unidad is null then$q$;
  v_nuevo constant text := $q$if false then -- V142: una tela sin unidad ya no bloquea el corte$q$;
  n int;
begin
  select count(*) into n from pg_proc where proname = 'marcar_corte' and pronamespace = 'public'::regnamespace;
  if n <> 1 then
    raise exception 'V142: se esperaba una sola copia de marcar_corte, hay %. No se aplicó nada.', n;
  end if;
  select count(*) into n from pg_proc
  where proname = 'marcar_corte' and pronamespace = 'public'::regnamespace
    and (position(v_viejo in prosrc) > 0 or position(v_nuevo in prosrc) > 0);
  if n <> 1 then
    raise exception 'V142: marcar_corte viva no es la esperada (V131). No se aplicó nada.';
  end if;
end $$;

-- 1) La unidad del movimiento puede quedar pendiente.
alter table public.movimientos_tela alter column unidad drop not null;

-- 2) marcar_corte sin el rechazo por unidad.
do $$
declare
  v_viejo constant text := $q$if v_tela_unidad is null then$q$;
  v_nuevo constant text := $q$if false then -- V142: una tela sin unidad ya no bloquea el corte$q$;
  r record;
  d text;
  nuevo text;
begin
  for r in select p.oid, p.prosrc from pg_proc p where p.proname = 'marcar_corte' and p.pronamespace = 'public'::regnamespace loop
    continue when position(v_nuevo in r.prosrc) > 0;  -- ya parcheada
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d, v_viejo, v_nuevo);
    if nuevo = d or position(v_viejo in nuevo) > 0 then
      raise exception 'V142: no pude parchear marcar_corte.';
    end if;
    execute nuevo;
  end loop;
end $$;

-- 3) Al definir la unidad de una tela, se completan sus movimientos pendientes.
create or replace function public.telas_unidad_a_movimientos() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.unidad is not null then
    update public.movimientos_tela
    set unidad = new.unidad
    where tela_id = new.id and unidad is null;
  end if;
  return new;
end;
$function$;
revoke execute on function public.telas_unidad_a_movimientos() from public, anon, authenticated;

drop trigger if exists telas_unidad_a_movimientos_trg on public.telas;
create trigger telas_unidad_a_movimientos_trg
  after update of unidad on public.telas
  for each row execute function public.telas_unidad_a_movimientos();

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select position('V142' in prosrc) > 0 as parcheada,
--          has_function_privilege('anon', oid, 'execute') as anon_puede,
--          has_function_privilege('authenticated', oid, 'execute') as sesion_puede
--   from pg_proc where proname = 'marcar_corte';                                   -- true, false, true
--   select is_nullable from information_schema.columns
--   where table_name = 'movimientos_tela' and column_name = 'unidad';              -- YES
--   select tgname, tgenabled from pg_trigger where tgname = 'telas_unidad_a_movimientos_trg';  -- 1 fila, 'O'
-- =====================================================================
