-- =====================================================================
-- V137 — Órdenes: nombre de quien creó la orden ("Creada por")
-- =====================================================================
-- orders.created_by ya guarda el id del usuario, pero profiles solo lo puede
-- leer el propio usuario o un administrador, así que el resto de los roles no
-- podía ver el nombre. Se guarda el nombre en la orden (igual que
-- pf_pendientes.creado_por_nombre en Pendientes).
--
-- Aditivo: una columna nueva, su relleno para las órdenes que ya existen y un
-- trigger que la llena al crear. No se redefine create_order.
-- =====================================================================
begin;

alter table public.orders add column if not exists created_by_nombre text;

update public.orders o
set created_by_nombre = nullif(trim(p.full_name), '')
from public.profiles p
where p.id = o.created_by and o.created_by_nombre is null;

create or replace function public.orders_llenar_creado_por()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by_nombre is null then
    select nullif(trim(full_name), '') into new.created_by_nombre
    from public.profiles where id = coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists orders_llenar_creado_por_trg on public.orders;
create trigger orders_llenar_creado_por_trg
  before insert on public.orders
  for each row execute function public.orders_llenar_creado_por();

commit;

-- Verificación (solo lectura):
--   select count(*) filter (where created_by_nombre is not null) as con_nombre,
--          count(*) filter (where created_by_nombre is null and created_by is not null) as sin_nombre_con_usuario,
--          count(*) filter (where created_by is null) as sin_usuario
--   from public.orders;
