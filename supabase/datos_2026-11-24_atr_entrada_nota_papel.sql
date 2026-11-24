-- =====================================================================
-- Datos 2026-11-24 — ATR: entrada de batas de una nota en papel (171 batas)
-- =====================================================================
-- Batas que ya estaban surtidas parcialmente a OCs cargadas y no estaban en
-- el inventario del sistema. Pedido y números confirmados por Alfredo el
-- 24-nov (Blanca S/B: M 16, L 16; Negra C/B: XL 1). "Ch" = S.
-- Entran como AJUSTE (+) con nota; no se pone el usuario de nadie (se
-- capturó desde una nota en papel). Se puede correr dos veces: si ya se
-- registró (misma nota), no vuelve a sumar.
-- =====================================================================
do $$
declare
  v_nota text := 'Entrada de nota en papel 24-nov-2026: batas surtidas parcialmente a OCs ya cargadas';
  v_faltan text;
  v_n int;
begin
  if exists (select 1 from public.atr_movimientos where tipo = 'ajuste' and nota = v_nota) then
    raise notice 'Ya estaba registrada esta nota; no se sumó otra vez.';
    return;
  end if;

  create temp table nota_atr (bata text, talla text, cantidad int) on commit drop;
  insert into nota_atr values
    ('Bata sin bolsa Beige', 'S', 1), ('Bata sin bolsa Beige', 'M', 4), ('Bata sin bolsa Beige', 'L', 5),
    ('Bata sin bolsa Azul Cielo', 'S', 38), ('Bata sin bolsa Azul Cielo', 'M', 21),
    ('Bata sin bolsa Azul Cielo', 'L', 25), ('Bata sin bolsa Azul Cielo', 'XL', 6),
    ('Bata sin bolsa Blanca', 'M', 16), ('Bata sin bolsa Blanca', 'L', 16), ('Bata sin bolsa Blanca', 'XL', 7),
    ('Bata sin bolsa Naranja', 'S', 6), ('Bata sin bolsa Naranja', 'M', 6), ('Bata sin bolsa Naranja', 'L', 6),
    ('Bata con bolsa Café', 'XL', 1),
    ('Bata con bolsa Azul Rey', 'S', 3), ('Bata con bolsa Azul Rey', 'M', 3), ('Bata con bolsa Azul Rey', 'L', 2),
    ('Bata con bolsa Azul Rey', 'XL', 2), ('Bata con bolsa Azul Rey', '2XL', 1),
    ('Bata con bolsa Negra', 'XL', 1), ('Bata con bolsa Negra', '2XL', 1);

  -- Todas las batas deben existir en el catálogo de ATR
  select string_agg(distinct n.bata, ', ') into v_faltan
  from nota_atr n
  where not exists (select 1 from public.productos p
                    where p.cliente_id = public.atr_cliente_id() and lower(p.nombre) = lower(n.bata));
  if v_faltan is not null then
    raise exception 'No encontré en el catálogo de ATR: %. No se sumó nada.', v_faltan;
  end if;

  insert into public.atr_movimientos (producto_id, talla, tipo, cantidad, nota, usuario_id, usuario_nombre)
  select p.id, n.talla, 'ajuste', n.cantidad, v_nota, null, 'Captura de nota en papel'
  from nota_atr n
  join public.productos p on p.cliente_id = public.atr_cliente_id() and lower(p.nombre) = lower(n.bata);
  get diagnostics v_n = row_count;
  raise notice 'Se registraron % renglones.', v_n;
end $$;

-- Comprobación (debe dar: 21 renglones · 171 batas)
select count(*) as renglones, sum(cantidad) as batas
from public.atr_movimientos
where tipo = 'ajuste' and nota = 'Entrada de nota en papel 24-nov-2026: batas surtidas parcialmente a OCs ya cargadas';
