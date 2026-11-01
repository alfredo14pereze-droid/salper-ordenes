-- =====================================================================
-- Datos 2026-11-01 — Quitar las operaciones copiadas a CHAMARRA DOMUS
-- =====================================================================
-- Pedido de Alfredo: deshacer la copia del 2026-10-31
-- (datos_2026-10-31_chamarra_domus.sql). Se borran las 88 operaciones de
-- CHAMARRA DOMUS (folios 1601–1688) y esos folios quedan libres.
-- CHAMARRA ESCOLAR no se toca.
--
-- Lo de V174 (campo "Operaciones" en la orden y hoja en el PDF) se queda.
--
-- También:
--   · Se quita CHAMARRA DOMUS de «Hojas impresas», si se llegó a imprimir.
--   · Si alguna orden quedó ligada a CHAMARRA DOMUS, se le quita esa liga
--     (vuelve a "sin escoger" y se sugerirá sola si algún día existe una
--     prenda que coincida).
--
-- Seguro: si ya se capturó producción con alguno de esos folios, no borra
-- nada y lo dice.
-- =====================================================================
do $$
declare
  v_ops integer;
  v_otros integer;
  v_hojas integer := 0;
  v_ordenes integer;
begin
  select count(*) into v_ops from public.prod_operaciones where prenda = 'CHAMARRA DOMUS';
  if v_ops = 0 then
    raise exception 'CHAMARRA DOMUS ya no tiene operaciones. No se hizo nada.';
  end if;
  select count(*) into v_otros from public.prod_operaciones
   where prenda = 'CHAMARRA DOMUS' and folio not between 1601 and 1688;
  if v_otros > 0 then
    raise exception 'CHAMARRA DOMUS tiene % operaciones fuera de 1601–1688 (no son de la copia). No se borró nada.', v_otros;
  end if;
  if exists (select 1 from public.prod_registros where folio_operacion between 1601 and 1688) then
    raise exception 'Ya hay producción capturada con folios 1601–1688. No se borró nada.';
  end if;

  if to_regclass('public.hojas_impresas') is not null then
    delete from public.hojas_impresas where prenda = 'CHAMARRA DOMUS';
    get diagnostics v_hojas = row_count;
  end if;

  update public.orders o
     set items = (
       select jsonb_agg(case when it->>'prenda_operaciones' = 'CHAMARRA DOMUS' then it - 'prenda_operaciones' else it end order by n)
         from jsonb_array_elements(o.items) with ordinality as e(it, n)
     )
   where jsonb_typeof(o.items) = 'array'
     and exists (select 1 from jsonb_array_elements(o.items) it where it->>'prenda_operaciones' = 'CHAMARRA DOMUS');
  get diagnostics v_ordenes = row_count;

  delete from public.prod_operaciones where prenda = 'CHAMARRA DOMUS' and folio between 1601 and 1688;

  raise notice 'Listo: % operaciones borradas (folios 1601–1688 libres), % hoja(s) impresa(s) quitada(s), % orden(es) desligada(s).',
    v_ops, v_hojas, v_ordenes;
end $$;

-- Verificación (solo lectura): DOMUS ya no sale; ESCOLAR sigue con sus 88.
select prenda, count(*) as operaciones, min(folio) as primer_folio, max(folio) as ultimo_folio
  from public.prod_operaciones
 where prenda in ('CHAMARRA DOMUS', 'CHAMARRA ESCOLAR')
 group by prenda;
