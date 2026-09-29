-- =====================================================================
-- V94 — Pendientes: estado "entregado" (solo pendientes de cliente)
-- =====================================================================
-- Hoy el ciclo de un pendiente termina en "recibido_en_tienda" (cerrado_en
-- se llena ahí sin importar si es de cliente o no). Si el pendiente es
-- para un cliente, falta un paso: registrar cuándo se le entregó. Los
-- pendientes que se quedan en la tienda (es_para_cliente = false) siguen
-- cerrándose exactamente igual que hoy, en "recibido_en_tienda".
--
-- Todo aditivo: columnas nuevas nullable, un estado nuevo en el check
-- existente (drop + recreate del mismo constraint), un RPC nuevo, y un
-- ajuste a la lógica de cerrado_en en pf_aplicar/pf_resolver_problema.
-- =====================================================================

alter table public.pf_pendientes
  add column if not exists entregado_en timestamptz,
  add column if not exists entregado_por uuid references public.profiles(id) on delete set null,
  add column if not exists entregado_por_nombre text,
  add column if not exists recogio text;

alter table public.pf_pendientes drop constraint if exists pf_pendientes_estado_check;
alter table public.pf_pendientes add constraint pf_pendientes_estado_check check (estado in (
  'enviado_a_fabrica', 'recibido_en_fabrica', 'listo_para_regresar',
  'enviado_a_tienda', 'recibido_en_tienda', 'con_problema', 'entregado'));

-- Solo estos 3 roles pueden marcar la entrega — más angosto que
-- pf_es_tienda() (que también incluye contabilidad y el rol básico
-- 'tienda'), por pedido explícito del usuario.
create or replace function public.pf_puede_entregar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in ('ventas', 'admin_tienda', 'admin_general');
$$;
revoke execute on function public.pf_puede_entregar() from public;
grant execute on function public.pf_puede_entregar() to authenticated;

-- cerrado_en ya no se llena en recibido_en_tienda para pendientes de
-- cliente (se llena hasta pf_marcar_entregado); para los que se quedan en
-- la tienda, sigue exactamente igual que antes.
create or replace function public.pf_aplicar(p_id uuid, p_nuevo text, p_nota text)
returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
declare v public.pf_pendientes; v_rol text := coalesce(public.current_user_role(), ''); ok boolean := false; v_ant text;
begin
  select * into v from public.pf_pendientes where id = p_id for update;
  if v.id is null then raise exception 'Pendiente no encontrado.'; end if;
  v_ant := v.estado;

  if p_nuevo = 'con_problema' then
    if not (public.pf_es_tienda() or public.pf_es_fabrica()) then raise exception 'No tienes permiso.'; end if;
    if v.estado = 'con_problema' then raise exception 'Ya está marcado con problema.'; end if;
    if btrim(coalesce(p_nota, '')) = '' then raise exception 'Escribe una nota explicando el problema.'; end if;
    update public.pf_pendientes set estado = 'con_problema', estado_previo = v.estado, estado_desde = now(), updated_at = now()
     where id = p_id returning * into v;
  else
    if v.estado = 'con_problema' then raise exception 'Está con problema: primero resuélvelo.'; end if;
    ok := case
      when v.estado = 'enviado_a_fabrica'   and p_nuevo = 'recibido_en_fabrica' then public.pf_es_fabrica()
      when v.estado = 'recibido_en_fabrica' and p_nuevo = 'listo_para_regresar' then public.pf_es_fabrica()
      when v.estado = 'listo_para_regresar' and p_nuevo = 'enviado_a_tienda'    then public.pf_es_fabrica()
      when v.estado = 'enviado_a_tienda'    and p_nuevo = 'recibido_en_tienda'  then public.pf_es_tienda()
      else false end;
    if not ok then
      raise exception 'No puedes pasar este pendiente de "%" a "%" con tu rol.', v.estado, p_nuevo;
    end if;
    update public.pf_pendientes
       set estado = p_nuevo, estado_previo = null, estado_desde = now(), updated_at = now(),
           cerrado_en = case when p_nuevo = 'recibido_en_tienda' and not v.es_para_cliente then now() else cerrado_en end
     where id = p_id returning * into v;
  end if;

  insert into public.pf_historial (pendiente_id, estado_anterior, estado_nuevo, nota, cambiado_por, cambiado_por_nombre, rol)
  values (p_id, v_ant, p_nuevo, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), public.pf_nombre_actual(), v_rol);
  return v;
end; $$;
revoke execute on function public.pf_aplicar(uuid, text, text) from public;

create or replace function public.pf_resolver_problema(p_id uuid, p_nota text default null)
returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
declare v public.pf_pendientes;
begin
  if not (public.pf_es_tienda() or public.pf_es_fabrica()) then raise exception 'No tienes permiso.'; end if;
  select * into v from public.pf_pendientes where id = p_id for update;
  if v.id is null then raise exception 'Pendiente no encontrado.'; end if;
  if v.estado <> 'con_problema' then raise exception 'Este pendiente no está marcado con problema.'; end if;
  update public.pf_pendientes
     set estado = v.estado_previo, estado_previo = null, estado_desde = now(), updated_at = now(),
         cerrado_en = case
           when v.estado_previo = 'recibido_en_tienda' and not v.es_para_cliente then now()
           when v.estado_previo = 'entregado' then now()
           else cerrado_en
         end
   where id = p_id returning * into v;
  insert into public.pf_historial (pendiente_id, estado_anterior, estado_nuevo, nota, cambiado_por, cambiado_por_nombre, rol)
  values (p_id, 'con_problema', v.estado, coalesce(nullif(btrim(coalesce(p_nota, '')), ''), 'Problema resuelto'),
          auth.uid(), public.pf_nombre_actual(), public.current_user_role());
  return v;
end; $$;

-- Marcar como entregado: solo pendientes de cliente, solo desde
-- recibido_en_tienda, solo los 3 roles de pf_puede_entregar().
create or replace function public.pf_marcar_entregado(p_id uuid, p_recogio text default null)
returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
declare v public.pf_pendientes;
begin
  if not public.pf_puede_entregar() then raise exception 'No tienes permiso para marcar una entrega.'; end if;
  select * into v from public.pf_pendientes where id = p_id for update;
  if v.id is null then raise exception 'Pendiente no encontrado.'; end if;
  if not v.es_para_cliente then raise exception 'Este pendiente no es de un cliente.'; end if;
  if v.estado <> 'recibido_en_tienda' then raise exception 'Este pendiente todavía no está listo para entregar.'; end if;

  update public.pf_pendientes
     set estado = 'entregado', estado_previo = null, estado_desde = now(), updated_at = now(),
         cerrado_en = now(), entregado_en = now(), entregado_por = auth.uid(),
         entregado_por_nombre = public.pf_nombre_actual(),
         recogio = nullif(btrim(coalesce(p_recogio, '')), '')
   where id = p_id returning * into v;

  insert into public.pf_historial (pendiente_id, estado_anterior, estado_nuevo, nota, cambiado_por, cambiado_por_nombre, rol)
  values (p_id, 'recibido_en_tienda', 'entregado',
          case when v.recogio is not null then 'Recogió: ' || v.recogio else null end,
          auth.uid(), public.pf_nombre_actual(), public.current_user_role());
  return v;
end; $$;
revoke execute on function public.pf_marcar_entregado(uuid, text) from public;
grant execute on function public.pf_marcar_entregado(uuid, text) to authenticated;
