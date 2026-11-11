-- =====================================================================
-- V206 — Frisa: precio de compra del pantalón y de la playera lisa (2026-11-11)
-- =====================================================================
-- Pedido de Alfredo: "agrega el precio del pantalón (133) y de la playera lisa
-- para saber cuánto nos va a costar cada pedido".
--   · frisa_productos_niveles.precio_compra: lo que se compra hecho (pantalón $133).
--   · frisa_lisas.precio: playera lisa por manga y talla.
--       Manga corta: S a XL $39.37 · 2XL $48.26 · 3XL $55.50
--       Manga larga: S a XL $64.40 · 2XL $75.69 · 3XL (sin precio todavía)
--   · Cada renglón de pedido guarda el precio que tenía al hacerse (si después
--     cambia el precio, los pedidos viejos no cambian). Los pedidos que ya
--     existen toman el precio de hoy.
-- Aditivo; se puede correr dos veces. Requiere V186, V187.
-- =====================================================================

alter table public.frisa_productos_niveles add column if not exists precio_compra numeric(10,2) check (precio_compra is null or precio_compra >= 0);
alter table public.frisa_lisas add column if not exists precio numeric(10,2) check (precio is null or precio >= 0);
alter table public.frisa_compra_lineas add column if not exists precio numeric(10,2);
alter table public.frisa_compra_lineas_lisa add column if not exists precio numeric(10,2);

-- Precios de hoy.
update public.frisa_productos_niveles set precio_compra = 133 where clave ilike 'PANFR-%';
update public.frisa_lisas set precio = case
    when manga = 'MC' and upper(talla) = '2XL' then 48.26
    when manga = 'MC' and upper(talla) = '3XL' then 55.50
    when manga = 'MC' then 39.37
    when manga = 'ML' and upper(talla) = '2XL' then 75.69
    when manga = 'ML' and upper(talla) = '3XL' then null
    when manga = 'ML' then 64.40
  end;

-- Cada renglón nuevo de pedido toma el precio de hoy.
create or replace function public.frisa_compra_linea_precio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.precio is null then
    select precio_compra into new.precio from public.frisa_productos_niveles where id = new.producto_id;
  end if;
  return new;
end $$;
revoke execute on function public.frisa_compra_linea_precio() from public, anon, authenticated;
drop trigger if exists frisa_compra_linea_precio_trg on public.frisa_compra_lineas;
create trigger frisa_compra_linea_precio_trg before insert on public.frisa_compra_lineas
  for each row execute function public.frisa_compra_linea_precio();

create or replace function public.frisa_compra_linea_lisa_precio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.precio is null then
    select precio into new.precio from public.frisa_lisas where id = new.lisa_id;
  end if;
  return new;
end $$;
revoke execute on function public.frisa_compra_linea_lisa_precio() from public, anon, authenticated;
drop trigger if exists frisa_compra_linea_lisa_precio_trg on public.frisa_compra_lineas_lisa;
create trigger frisa_compra_linea_lisa_precio_trg before insert on public.frisa_compra_lineas_lisa
  for each row execute function public.frisa_compra_linea_lisa_precio();

-- Los pedidos que ya existen: precio de hoy.
update public.frisa_compra_lineas l set precio = p.precio_compra
  from public.frisa_productos_niveles p where p.id = l.producto_id and l.precio is null;
update public.frisa_compra_lineas_lisa l set precio = s.precio
  from public.frisa_lisas s where s.id = l.lisa_id and l.precio is null;

-- Comprobación: precios cargados y cuánto costaron los pedidos.
select (select count(*) from public.frisa_productos_niveles where precio_compra is not null) as pantalones_con_precio,
       (select count(*) from public.frisa_lisas where precio is not null) as lisas_con_precio,
       (select string_agg(color || ' ' || manga || ' ' || talla, ', ') from public.frisa_lisas where precio is null) as lisas_sin_precio,
       (select string_agg('#' || c.folio || ' $' || to_char(coalesce((select sum(l.cantidad * l.precio) from public.frisa_compra_lineas l where l.compra_id = c.id), 0)
                                                     + coalesce((select sum(l.cantidad * l.precio) from public.frisa_compra_lineas_lisa l where l.compra_id = c.id), 0), 'FM999,999,990.00'), ' · ' order by c.folio)
          from public.frisa_compras c where c.estado <> 'cancelada') as pedidos;
