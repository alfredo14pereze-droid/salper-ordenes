-- =====================================================================
-- V213 — Cotizaciones web (página pública, Fase 2) — 2026-11-18
-- =====================================================================
-- Solicitudes del formulario de cotización de salperdeportes.com (#cotizar).
--
-- Cómo entra una cotización: SOLO por la función de Vercel /api/cotizacion,
-- que valida, revisa el honeypot, aplica el límite por IP e inserta con la
-- service role key (variable de entorno del servidor). Desde el navegador
-- NADIE puede insertar ni leer: anon no tiene ningún permiso sobre la tabla
-- y authenticated solo puede leer si es admin_general o admin_tienda.
--
-- Quién la ve / cambia el estado: admin_general (el "super_admin" del
-- pedido) y admin_tienda. Leer = RLS; cambiar estado = la función
-- cotizacion_web_cambiar_estado (security definer), igual que el resto del
-- sistema (sin políticas de escritura para el cliente).
--
-- ip_hash: huella HMAC-SHA256 de la IP (la calcula /api/cotizacion), solo
-- para el límite de envíos por IP. No se guarda la IP.
--
-- Aditivo: 1 tabla nueva + 1 función nueva. NO toca tablas, roles ni
-- permisos existentes. Se puede correr dos veces sin duplicar nada.
-- =====================================================================

create table if not exists public.cotizaciones_web (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  nombre           text not null check (char_length(btrim(nombre)) between 2 and 120),
  empresa          text check (empresa is null or char_length(empresa) <= 160),
  telefono         text not null check (char_length(telefono) between 7 and 30),
  correo           text not null check (char_length(correo) between 5 and 160),
  sector           text check (sector is null or char_length(sector) <= 80),
  productos        text[] not null default '{}',
  cantidad_aprox   text check (cantidad_aprox is null or char_length(cantidad_aprox) <= 40),
  personalizacion  text[] not null default '{}',
  fecha_deseada    date,
  mensaje          text check (mensaje is null or char_length(mensaje) <= 2000),
  estado           text not null default 'nueva'
                   check (estado in ('nueva', 'contactado', 'cotizado', 'ganado', 'perdido')),
  origen           text not null default 'web',
  ip_hash          text,
  actualizado_en   timestamptz,
  actualizado_por  uuid references auth.users (id)
);

create index if not exists cotizaciones_web_created_idx on public.cotizaciones_web (created_at desc);
create index if not exists cotizaciones_web_estado_idx  on public.cotizaciones_web (estado);
create index if not exists cotizaciones_web_ip_idx      on public.cotizaciones_web (ip_hash, created_at);

alter table public.cotizaciones_web enable row level security;

-- Nadie desde el navegador: se quitan todos los permisos de anon y
-- authenticated, y a authenticated solo se le devuelve SELECT (filtrado por RLS).
revoke all on public.cotizaciones_web from anon, authenticated, public;
grant select on public.cotizaciones_web to authenticated;
-- La función de Vercel entra con la service role key (se salta RLS).
grant select, insert on public.cotizaciones_web to service_role;

drop policy if exists "Cotizaciones web lectura admins" on public.cotizaciones_web;
create policy "Cotizaciones web lectura admins" on public.cotizaciones_web
  for select to authenticated
  using (coalesce(public.current_user_role(), '') in ('admin_general', 'admin_tienda'));

-- Cambiar estado (nueva → contactado → cotizado → ganado / perdido).
create or replace function public.cotizacion_web_cambiar_estado(p_id uuid, p_estado text)
returns public.cotizaciones_web
language plpgsql security definer set search_path = public as $$
declare v_row public.cotizaciones_web;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_general', 'admin_tienda') then
    raise exception 'No tienes permiso para cambiar cotizaciones web.';
  end if;
  if coalesce(p_estado, '') not in ('nueva', 'contactado', 'cotizado', 'ganado', 'perdido') then
    raise exception 'Estado no válido.';
  end if;
  update public.cotizaciones_web
     set estado = p_estado, actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_id
  returning * into v_row;
  if not found then raise exception 'La cotización no existe.'; end if;
  return v_row;
end; $$;

revoke execute on function public.cotizacion_web_cambiar_estado(uuid, text) from public, anon;
grant execute on function public.cotizacion_web_cambiar_estado(uuid, text) to authenticated;

-- Comprobación (debe regresar 1 fila con rls = true):
select relname, relrowsecurity as rls
from pg_class where oid = 'public.cotizaciones_web'::regclass;
