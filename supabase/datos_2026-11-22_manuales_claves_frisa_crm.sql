-- =====================================================================
-- Datos 2026-11-22 — Manuales: claves para los manuales que YA existen
-- de Frisa y CRM (para el "Ver manual completo →" de su botón de ayuda).
-- =====================================================================
-- Requiere V196 y V214 (columna clave).
-- Solo pone la columna `clave` a 7 manuales existentes, buscándolos por
-- sección + título exacto. NO cambia título, contenido, orden ni sección,
-- y NO toca ningún otro manual.
-- Si un manual ya tiene clave, o esa clave ya la usa otro, no hace nada.
-- Si el título se cambió en la app, ese manual simplemente no se liga
-- (sale en el aviso del final). Se puede correr dos veces.
-- =====================================================================
do $$
declare
  v record;
  v_n int;
  v_total int := 0;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'manuales' and column_name = 'clave') then
    raise exception 'Falta aplicar V214 (schema_v214_manuales_clave.sql). No se cambió nada.';
  end if;

  for v in
    select * from (values
      ('Frisa', 'Cómo surtir una orden',                               'frisa-surtido'),
      ('Frisa', 'Cómo hacer el restock: crear una orden de taller FR', 'frisa-restock'),
      ('Frisa', 'Cómo se mantiene el inventario',                      'frisa-niveles'),
      ('Frisa', 'Revisión contra Microsip (cada 10 días)',             'frisa-microsip'),
      ('Frisa', 'Plantas Frisa: subir remisiones y facturas',          'frisa-plantas'),
      ('Frisa', 'Reportes de Frisa',                                   'frisa-reportes'),
      ('CRM',   'Qué es el CRM y quién lo usa',                        'crm')
    ) as t(seccion, titulo, clave)
  loop
    update public.manuales m
       set clave = v.clave
      from public.manual_secciones s
     where s.id = m.seccion_id
       and s.eliminado_en is null
       and lower(btrim(s.nombre)) = lower(v.seccion)
       and m.eliminado_en is null
       and m.titulo = v.titulo
       and m.clave is null
       and not exists (select 1 from public.manuales o
                        where o.clave = v.clave and o.eliminado_en is null);
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    if v_n = 0 and not exists (select 1 from public.manuales where clave = v.clave and eliminado_en is null) then
      raise notice 'No se encontró "%" en la sección %: no se ligó la clave %.', v.titulo, v.seccion, v.clave;
    end if;
  end loop;
  raise notice 'Claves puestas en esta corrida: %', v_total;
end $$;

-- Verificación: debe regresar 7 filas.
-- select clave, titulo from public.manuales
--  where clave in ('frisa-surtido','frisa-restock','frisa-niveles','frisa-microsip','frisa-plantas','frisa-reportes','crm')
--    and eliminado_en is null order by clave;
