-- 2026-11-17 — ATR: el color "Verde Jade" se llama "Verde Supervisor" (pedido de Alfredo).
-- Solo cambia nombre y color del producto; el id (y su inventario) se queda igual.
update public.productos p
set nombre = 'Bata con bolsa Verde Supervisor',
    color  = 'Verde Supervisor'
from public.clientes c
where c.id = p.cliente_id
  and c.nombre_normalizado = 'atr'
  and p.nombre = 'Bata con bolsa Verde Jade';

-- Comprobación (debe dar: 1 · 0)
select
  (select count(*) from public.productos p join public.clientes c on c.id = p.cliente_id
     where c.nombre_normalizado = 'atr' and p.nombre = 'Bata con bolsa Verde Supervisor') as verde_supervisor,
  (select count(*) from public.productos p join public.clientes c on c.id = p.cliente_id
     where c.nombre_normalizado = 'atr' and p.color ilike '%jade%')                      as quedan_jade;
