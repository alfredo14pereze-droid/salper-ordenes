-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V28: refuerzo de seguridad — tabla de rate limiting para
-- /api/chat (ver auditoría de seguridad completa en SALPER_Contexto.md).
--
-- Antes de este cambio, cualquier cuenta con sesión (cualquier rol)
-- podía mandar mensajes al chat sin límite — cada uno cuesta dinero real
-- (API de Anthropic). Esta tabla es el "contador" que usa api/chat.js
-- para saber cuántos mensajes ha mandado un usuario en los últimos 5
-- minutos antes de decidir si lo deja pasar.
--
-- Diseño: cada usuario solo puede insertar/ver SUS PROPIAS filas (RLS),
-- igual que el resto del sistema — no hace falta la service role key
-- para esto, api/chat.js usa el propio token del que llama.
--
-- Aditivo: tabla nueva, no toca nada existente.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

create table if not exists public.chat_rate_limit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists chat_rate_limit_user_time_idx
  on public.chat_rate_limit (user_id, created_at desc);

alter table public.chat_rate_limit enable row level security;

drop policy if exists "Cada quien ve solo sus propios mensajes de chat" on public.chat_rate_limit;
create policy "Cada quien ve solo sus propios mensajes de chat" on public.chat_rate_limit
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Cada quien registra solo su propio mensaje de chat" on public.chat_rate_limit;
create policy "Cada quien registra solo su propio mensaje de chat" on public.chat_rate_limit
  for insert to authenticated with check (auth.uid() = user_id);

-- Gotcha de siempre: tablas creadas por SQL Editor no traen GRANT automático.
grant select, insert on public.chat_rate_limit to authenticated;

-- Housekeeping opcional: esta tabla crece para siempre si nadie la
-- limpia. No es grande (una fila por mensaje de chat), pero si algún día
-- quieres purgar filas viejas, esto borra todo lo de más de 1 día:
--   delete from public.chat_rate_limit where created_at < now() - interval '1 day';
