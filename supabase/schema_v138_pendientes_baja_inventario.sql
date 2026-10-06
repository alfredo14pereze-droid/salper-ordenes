-- =====================================================================
-- V138 — Pendientes de cliente: "Dado de baja" / "Pendiente de baja" en inventario
-- =====================================================================
-- Para los pendientes que son de un cliente (es_para_cliente) se registra si la
-- prenda ya se dio de baja en el inventario. Los que se quedan en la tienda
-- siguen usando "Inventariado / No inventariado" y no llevan este dato.
--
-- Aditivo: 4 columnas nuevas en pf_pendientes, un trigger que mantiene el dato
-- coherente y una función nueva (pf_marcar_baja). No se tocan pf_crear,
-- pf_editar ni pf_aplicar, y no usa secuencias.
--
-- Los pendientes de cliente que ya existen quedan como "Pendiente de baja".
-- =====================================================================
begin;

alter table public.pf_pendientes
  add column if not exists baja_inventario boolean,
  add column if not exists baja_en timestamptz,
  add column if not exists baja_por uuid references public.profiles(id) on delete set null,
  add column if not exists baja_por_nombre text;

update public.pf_pendientes set baja_inventario = false
where es_para_cliente and baja_inventario is null;

-- De cliente: nunca queda en null (por defecto "pendiente de baja").
-- De tienda: siempre null (si se edita de cliente a tienda, se limpia).
create or replace function public.pf_pendientes_baja_coherente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.es_para_cliente, false) then
    new.baja_inventario := coalesce(new.baja_inventario, false);
  else
    new.baja_inventario := null;
    new.baja_en := null;
    new.baja_por := null;
    new.baja_por_nombre := null;
  end if;
  return new;
end;
$$;

drop trigger if exists pf_pendientes_baja_coherente_trg on public.pf_pendientes;
create trigger pf_pendientes_baja_coherente_trg
  before insert or update of es_para_cliente, baja_inventario on public.pf_pendientes
  for each row execute function public.pf_pendientes_baja_coherente();

-- Marcar / desmarcar la baja. Mismos roles que el resto del flujo de tienda
-- (pf_es_tienda). Deja su renglón en el historial del pendiente.
create or replace function public.pf_marcar_baja(p_id uuid, p_dado_de_baja boolean)
returns public.pf_pendientes
language plpgsql security definer set search_path = public as $$
declare v public.pf_pendientes;
begin
  if not public.pf_es_tienda() then raise exception 'No tienes permiso para marcar la baja en inventario.'; end if;
  if p_dado_de_baja is null then raise exception 'Indica si ya se dio de baja o sigue pendiente.'; end if;
  select * into v from public.pf_pendientes where id = p_id for update;
  if v.id is null then raise exception 'Pendiente no encontrado.'; end if;
  if not v.es_para_cliente then raise exception 'Este pendiente no es de un cliente.'; end if;
  if v.baja_inventario is not distinct from p_dado_de_baja then return v; end if;

  update public.pf_pendientes
     set baja_inventario = p_dado_de_baja, updated_at = now(),
         baja_en = case when p_dado_de_baja then now() else null end,
         baja_por = case when p_dado_de_baja then auth.uid() else null end,
         baja_por_nombre = case when p_dado_de_baja then public.pf_nombre_actual() else null end
   where id = p_id returning * into v;

  insert into public.pf_historial (pendiente_id, estado_anterior, estado_nuevo, nota, cambiado_por, cambiado_por_nombre, rol)
  values (p_id, v.estado, v.estado,
          case when p_dado_de_baja then 'Dado de baja en inventario' else 'Regresó a pendiente de baja en inventario' end,
          auth.uid(), public.pf_nombre_actual(), public.current_user_role());
  return v;
end; $$;
revoke execute on function public.pf_marcar_baja(uuid, boolean) from public, anon;
grant execute on function public.pf_marcar_baja(uuid, boolean) to authenticated;

commit;

-- Verificación (solo lectura):
--   select es_para_cliente, baja_inventario, count(*) from public.pf_pendientes group by 1, 2 order by 1, 2;
--   -- esperado: de cliente → false; de tienda → null
--   select has_function_privilege('anon', 'public.pf_marcar_baja(uuid,boolean)', 'EXECUTE'),          -- false
--          has_function_privilege('authenticated', 'public.pf_marcar_baja(uuid,boolean)', 'EXECUTE'); -- true
