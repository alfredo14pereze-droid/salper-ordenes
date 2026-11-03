-- =====================================================================
-- V178 — Cambios de la orden: qué cambió, quién y cuándo, y quién lo aceptó
-- =====================================================================
-- Pedido de Alfredo: "Cuando se modifica una orden, quiero que se guarden
-- esos cambios, que diga qué fue lo que cambió y que lo tengan que aceptar,
-- como con las notas. Que diga cuáles fueron los cambios, quién los hizo y
-- cuándo."
--
-- Decisiones de Alfredo (2026-11-03):
--   1A — una sola persona de fábrica acepta y se quita para todos (como hoy
--        con "Confirmar cambios", V38).
--   2  — las estaciones ven los cambios solo si la orden ya les aparece
--        (eso es pantalla, no SQL).
--   3A — los cambios antes de que fábrica confirme se guardan, pero no hay
--        que aceptarlos.
--   4A — cuentan los mismos de hoy: datos generales (update_order_details)
--        y prendas/tallas (set_order_items).
--
-- Qué hace:
--   1. Tabla orden_cambios: un renglón por cada guardado que sí cambió algo,
--      con los campos antes/después, las prendas antes/después, quién y
--      cuándo; y si hay que aceptarlo, quién lo aceptó y cuándo.
--   2. Trigger en orders que llena esa tabla SOLO cuando el cambio viene de
--      update_order_details o set_order_items (no de surtido, etapas, corte,
--      etc.). No se modifica ninguna de esas dos funciones.
--      Si se guardó sin cambiar nada, no se registra y no se pinta de azul.
--   3. Al pulsar "Confirmar cambios" (confirm_order_changes, V38, la misma
--      de hoy) los cambios pendientes quedan como aceptados por esa persona.
--   4. confirm_order_changes acepta también al rol costura (la pantalla ya
--      le mostraba el botón pero la base se lo rechazaba).
--
-- Aditivo: una tabla, una función de trigger, un trigger y un parche de una
-- línea a confirm_order_changes. Compatible con la app actual (la app vieja
-- sigue funcionando igual; solo no muestra el detalle).
--
-- Rollback: drop trigger orders_cambios_trg on public.orders;
--   drop function public.orders_registrar_cambios();
--   (la tabla puede quedarse).
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez. Se
-- puede volver a correr sin daño.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabla
-- ---------------------------------------------------------------------
create table if not exists public.orden_cambios (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  order_number text,
  -- {"requested_delivery_date": {"antes": "2026-11-10", "despues": "2026-11-14"}, ...}
  campos jsonb not null default '{}'::jsonb,
  -- solo si cambiaron las prendas (si no, null)
  items_antes jsonb,
  items_despues jsonb,
  requiere_aceptar boolean not null default false,
  hecho_por uuid,
  hecho_por_nombre text,
  hecho_en timestamptz not null default now(),
  aceptado_en timestamptz,
  aceptado_por uuid,
  aceptado_por_nombre text
);
create index if not exists orden_cambios_orden_idx on public.orden_cambios (order_id, hecho_en desc);

alter table public.orden_cambios enable row level security;
drop policy if exists "Lectura orden_cambios" on public.orden_cambios;
create policy "Lectura orden_cambios" on public.orden_cambios
  for select to authenticated
  using (public.current_user_role() is not null);
revoke all on public.orden_cambios from public, anon, authenticated;
grant select on public.orden_cambios to authenticated;

-- ---------------------------------------------------------------------
-- 2) Trigger que registra y acepta
-- ---------------------------------------------------------------------
create or replace function public.orders_registrar_cambios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx text;
  v_campos jsonb := '{}'::jsonb;
  v_items boolean;
  v_nombre text;
begin
  get diagnostics v_ctx = pg_context;

  -- a) "Confirmar cambios": la bandera se apaga → lo pendiente queda aceptado.
  if old.pending_reconfirmation_at is not null and new.pending_reconfirmation_at is null then
    select full_name into v_nombre from public.profiles where id = auth.uid();
    update public.orden_cambios
       set aceptado_en = now(), aceptado_por = auth.uid(), aceptado_por_nombre = v_nombre
     where order_id = new.id and requiere_aceptar and aceptado_en is null;
    return new;
  end if;

  -- b) Solo se registran las ediciones de la orden, no los demás procesos.
  if v_ctx not like '%function update_order_details(%' and v_ctx not like '%function set_order_items(%' then
    return new;
  end if;

  if old.client_name is distinct from new.client_name then
    v_campos := v_campos || jsonb_build_object('client_name', jsonb_build_object('antes', old.client_name, 'despues', new.client_name));
  end if;
  if old.order_type_key is distinct from new.order_type_key then
    v_campos := v_campos || jsonb_build_object('order_type_key', jsonb_build_object('antes', old.order_type_key, 'despues', new.order_type_key));
  end if;
  if old.description is distinct from new.description then
    v_campos := v_campos || jsonb_build_object('description', jsonb_build_object('antes', old.description, 'despues', new.description));
  end if;
  if old.requested_delivery_date is distinct from new.requested_delivery_date then
    v_campos := v_campos || jsonb_build_object('requested_delivery_date', jsonb_build_object('antes', old.requested_delivery_date, 'despues', new.requested_delivery_date));
  end if;
  if old.client_telefono is distinct from new.client_telefono then
    v_campos := v_campos || jsonb_build_object('client_telefono', jsonb_build_object('antes', old.client_telefono, 'despues', new.client_telefono));
  end if;
  if old.client_correo is distinct from new.client_correo then
    v_campos := v_campos || jsonb_build_object('client_correo', jsonb_build_object('antes', old.client_correo, 'despues', new.client_correo));
  end if;
  if old.folios_externos is distinct from new.folios_externos then
    v_campos := v_campos || jsonb_build_object('folios_externos', jsonb_build_object('antes', to_jsonb(old.folios_externos), 'despues', to_jsonb(new.folios_externos)));
  end if;
  v_items := old.items is distinct from new.items;

  -- Se guardó sin cambiar nada: no se registra ni se pide aceptar.
  if v_campos = '{}'::jsonb and not v_items then
    new.pending_reconfirmation_at := old.pending_reconfirmation_at;
    return new;
  end if;

  select full_name into v_nombre from public.profiles where id = auth.uid();
  insert into public.orden_cambios (order_id, order_number, campos, items_antes, items_despues,
                                    requiere_aceptar, hecho_por, hecho_por_nombre)
  values (new.id, new.order_number, v_campos,
          case when v_items then old.items end, case when v_items then new.items end,
          -- las dos funciones ya deciden si hay que reconfirmar (V38): orden
          -- confirmada, no completada ni cancelada → mueven la bandera.
          new.pending_reconfirmation_at is distinct from old.pending_reconfirmation_at,
          auth.uid(), v_nombre);
  return new;
end;
$$;
revoke execute on function public.orders_registrar_cambios() from public, anon, authenticated;

drop trigger if exists orders_cambios_trg on public.orders;
create trigger orders_cambios_trg
  before update on public.orders
  for each row execute function public.orders_registrar_cambios();

-- ---------------------------------------------------------------------
-- 3) confirm_order_changes: también costura (parche de una línea sobre la
--    función viva, con guarda).
-- ---------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p where p.proname = 'confirm_order_changes' and p.pronamespace = 'public'::regnamespace;
  if v_def is null then
    raise exception 'No existe confirm_order_changes: avisa antes de seguir.';
  end if;
  if v_def like '%''costura''%' then
    raise notice 'confirm_order_changes ya incluye costura; no se cambia.';
  elsif v_def like '%''terminado'', ''admin_fabrica''%' then
    execute replace(v_def, '''terminado'', ''admin_fabrica''', '''terminado'', ''costura'', ''admin_fabrica''');
  else
    raise exception 'confirm_order_changes no es la esperada (V38): no se cambió nada. Avisa antes de seguir.';
  end if;
end $$;
revoke execute on function public.confirm_order_changes(uuid) from public;
grant execute on function public.confirm_order_changes(uuid) to authenticated;

-- Verificación sugerida después de aplicar:
--   select tgname from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'orders_cambios_trg'; -- 1 fila
--   select has_table_privilege('anon', 'public.orden_cambios', 'SELECT');              -- false
--   select prosrc like '%costura%' from pg_proc where proname = 'confirm_order_changes'; -- true
