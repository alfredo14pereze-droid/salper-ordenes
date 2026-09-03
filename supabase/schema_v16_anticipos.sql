-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V16: anticipos por orden (control de pagos adelantados)
--
-- Tabla nueva (no columnas en orders): a diferencia de "creado el" o el
-- status, un anticipo es un evento de dinero — monto, método de pago
-- (efectivo/tarjeta/transferencia) y quién lo recibió — y puede haber más
-- de uno por orden (un anticipo inicial, luego un abono). Se guarda como
-- tabla separada, igual que order_status_history es la bitácora de
-- cambios de estado.
--
-- Privacidad a propósito: DISTINTO de orders/order_status_history/etc
-- (que sí son de lectura pública para invitados, ver schema_v10), esta
-- tabla NO se abre a `anon` — es información financiera (montos, quién
-- manejó el dinero), mismo criterio que cotización/orden de
-- compra/factura (bucket privado, ver schema_v11/schema_v15). Un
-- invitado con el link sigue viendo todo lo demás de la orden, pero no
-- los anticipos.
--
-- Aditivo: tabla nueva, no toca ninguna orden existente.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

create table if not exists public.anticipos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  monto numeric(10,2) not null check (monto > 0),
  metodo_pago text not null check (metodo_pago in ('efectivo', 'tarjeta', 'transferencia')),
  recibido_por text not null,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists anticipos_order_id_idx on public.anticipos (order_id);

alter table public.anticipos enable row level security;

drop policy if exists "Lectura autenticada de anticipos" on public.anticipos;
create policy "Lectura autenticada de anticipos" on public.anticipos
  for select to authenticated using (true);

-- Ver gotcha de siempre: las tablas creadas por SQL Editor no traen GRANT
-- automático.
grant select on public.anticipos to authenticated;

-- Registrar un anticipo: tienda o admin (mismo criterio que crear una
-- orden — es tienda quien cobra al cliente). Sin restricción por estado
-- de la orden: un anticipo puede llegar en cualquier momento del proceso.
create or replace function public.create_anticipo(
  p_order_id uuid,
  p_monto numeric,
  p_metodo_pago text,
  p_recibido_por text,
  p_notas text default null
) returns public.anticipos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_anticipo public.anticipos;
begin
  if coalesce(v_role, '') not in ('tienda', 'admin') then
    raise exception 'Solo tienda o administrador pueden registrar anticipos.';
  end if;
  if p_metodo_pago not in ('efectivo', 'tarjeta', 'transferencia') then
    raise exception 'Método de pago inválido: %', p_metodo_pago;
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;
  if trim(coalesce(p_recibido_por, '')) = '' then
    raise exception 'Falta indicar quién recibió el anticipo.';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  insert into public.anticipos (order_id, monto, metodo_pago, recibido_por, notas, created_by)
  values (p_order_id, p_monto, p_metodo_pago, trim(p_recibido_por), nullif(trim(coalesce(p_notas, '')), ''), auth.uid())
  returning * into v_anticipo;

  return v_anticipo;
end;
$$;

revoke execute on function public.create_anticipo(uuid, numeric, text, text, text) from public;
grant execute on function public.create_anticipo(uuid, numeric, text, text, text) to authenticated;

-- Borrar un anticipo (corregir un error de captura) — solo admin, mismo
-- criterio que cancelar una orden: mover dinero de más es decisión de
-- administrador, no de quien esté cobrando en el momento.
create or replace function public.delete_anticipo(p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
begin
  if coalesce(v_role, '') <> 'admin' then
    raise exception 'Solo un administrador puede borrar un anticipo.';
  end if;
  delete from public.anticipos where id = p_id;
end;
$$;

revoke execute on function public.delete_anticipo(uuid) from public;
grant execute on function public.delete_anticipo(uuid) to authenticated;
