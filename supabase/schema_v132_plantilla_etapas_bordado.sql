-- =====================================================================
-- V132 — Órdenes de tipo "bordado": solo pasan por bordado y terminado
-- =====================================================================
-- El tipo de orden 'bordado' no tenía plantilla de etapas (plantillas_etapas), así
-- que una orden nueva de ese tipo no recibía la etapa 'terminado' (y 'bordado'
-- solo salía por el default 3). Las prendas ya vienen listas: solo hay que
-- bordarlas y terminarlas.
--
-- create_order copia la plantilla del tipo a orden_etapas, EXCEPTO 'bordado', que
-- se decide por las prendas (lleva_bordado) y toma su secuencia de la plantilla.
-- El frontend marca lleva_bordado en todas las prendas de una orden de bordado,
-- así que con estas dos filas cada orden nueva queda con: bordado (1) → terminado (2).
--
-- Aditivo: dos filas nuevas (no cambia ninguna función ni tabla ni las órdenes
-- que ya existen; no hay ninguna orden de tipo bordado hoy).
-- =====================================================================
do $$
begin
  if not exists (select 1 from public.order_types where key = 'bordado') then
    raise exception 'V132: no existe el tipo de orden bordado.';
  end if;
  if exists (select 1 from public.plantillas_etapas where order_type_key = 'bordado') then
    raise exception 'V132: el tipo bordado ya tiene plantilla de etapas; no se toca.';
  end if;
end $$;

insert into public.plantillas_etapas (order_type_key, etapa, orden_secuencia) values
  ('bordado', 'bordado', 1),
  ('bordado', 'terminado', 2)
on conflict (order_type_key, etapa) do nothing;

-- Verificación (después de correr):
--   select etapa, orden_secuencia from public.plantillas_etapas where order_type_key = 'bordado' order by orden_secuencia;
--   -- esperado: bordado 1, terminado 2
