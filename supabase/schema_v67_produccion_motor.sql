-- =====================================================================
-- V67 — Producción y Premios · FASE 2: motor de premios
-- =====================================================================
-- TODA la lógica de premios vive AQUÍ (nada duplicado en el frontend):
--   prod_calcular_premios(semana_id)  -> calcula y REGRESA (no guarda): sirve
--                                        para la vista previa.
--   prod_aprobar_semana(semana_id)    -> calcula, guarda el snapshot en
--                                        prod_premios_semana y congela la semana.
--
-- Reglas (fuente de verdad; las macros del Excel tenían errores):
--   valor_generado = Σ piezas × segundos × precio_por_segundo, tomando el
--     SNAPSHOT de cada registro (prod_registros.valor). En semanas importadas
--     viene directo de prod_valor_semana.
--   Participan: participa_bonos = true y activo = true, AUNQUE su valor
--     generado sea 0 (entran al ranking y reciben bono de lugar).
--   lugar = 1 + (participantes con valor generado ESTRICTAMENTE mayor);
--     los empates comparten lugar.
--   premio = bono meta + bono lugar + bono mejora. Cada uno: fila de su tabla
--     con el mayor "desde" <= valor evaluado (solo reglas activas); 0 si
--     ninguna aplica.
--   mejora_% = (actual − anterior) / anterior × 100, contra la semana
--     APROBADA inmediatamente anterior que exista. Sin semana anterior, sin
--     valor de esa persona o anterior = 0 -> "Sin base" (mejora_pct NULL,
--     bono 0). Mejora negativa -> bono 0. La tabla de mejora está en
--     PORCENTAJE (21 = 21%): NO se compara una fracción contra un porcentaje
--     (bug del Excel).
--
-- Permisos: solo admin_general / admin_fabrica (prod_puede_ver_montos()).
-- Ambas funciones son NUEVAS (sin overloads que limpiar).
-- =====================================================================

create or replace function public.prod_calcular_premios(p_semana_id uuid)
returns table (
  operadora_id uuid,
  folio_empleado text,
  numero_operadora integer,
  nombre text,
  valor_generado numeric,
  valor_anterior numeric,
  lugar integer,
  mejora_pct numeric,
  bono_meta numeric,
  bono_lugar numeric,
  bono_mejora numeric,
  total_premio numeric,
  semana_anterior_id uuid
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_sem public.prod_semanas;
  v_prev uuid;
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;

  select * into v_sem from public.prod_semanas s where s.id = p_semana_id;
  if v_sem.id is null then
    raise exception 'Semana no encontrada.';
  end if;

  -- Semana cerrada (aprobada) inmediatamente anterior que EXISTA.
  select s.id into v_prev
  from public.prod_semanas s
  where s.estado = 'aprobada' and s.fecha_inicio < v_sem.fecha_inicio
  order by s.fecha_inicio desc
  limit 1;

  return query
  with part as (
    select o.id as pid, o.folio_empleado as pfolio, o.numero_operadora as pnum, o.nombre as pnombre,
      case
        when v_sem.importada then coalesce(
          (select v.valor_generado from public.prod_valor_semana v where v.semana_id = v_sem.id and v.operadora_id = o.id), 0)
        else coalesce(
          (select sum(r.valor) from public.prod_registros r where r.semana_id = v_sem.id and r.operadora_id = o.id), 0)
      end as val
    from public.prod_operadoras o
    where o.participa_bonos and o.activo
  ),
  rk as (
    select p.*,
      1 + (select count(*) from part q where q.val > p.val)::integer as lug,
      (select v.valor_generado from public.prod_valor_semana v where v.semana_id = v_prev and v.operadora_id = p.pid) as ant
    from part p
  ),
  calc as (
    select rk.*,
      case when rk.ant is null or rk.ant = 0 then null else (rk.val - rk.ant) / rk.ant * 100 end as mej
    from rk
  )
  select
    c.pid, c.pfolio, c.pnum, c.pnombre, c.val, c.ant, c.lug, c.mej,
    m.bono, l.bono, j.bono,
    m.bono + l.bono + j.bono,
    v_prev
  from calc c
  cross join lateral (
    select coalesce((select r.bono from public.prod_reglas_premios r
                     where r.tipo = 'meta' and r.activa and r.desde <= c.val order by r.desde desc limit 1), 0) as bono
  ) m
  cross join lateral (
    select coalesce((select r.bono from public.prod_reglas_premios r
                     where r.tipo = 'lugar' and r.activa and r.desde <= c.lug order by r.desde desc limit 1), 0) as bono
  ) l
  cross join lateral (
    select case when c.mej is null or c.mej < 0 then 0
                else coalesce((select r.bono from public.prod_reglas_premios r
                               where r.tipo = 'mejora' and r.activa and r.desde <= c.mej order by r.desde desc limit 1), 0)
           end as bono
  ) j
  order by c.lug, c.pnombre;
end; $$;
revoke execute on function public.prod_calcular_premios(uuid) from public;
grant execute on function public.prod_calcular_premios(uuid) to authenticated;

create or replace function public.prod_aprobar_semana(p_semana_id uuid)
returns public.prod_semanas
language plpgsql security definer set search_path = public as $$
declare
  v_sem public.prod_semanas;
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para aprobar semanas de producción.';
  end if;

  select * into v_sem from public.prod_semanas s where s.id = p_semana_id for update;
  if v_sem.id is null then
    raise exception 'Semana no encontrada.';
  end if;
  if v_sem.estado = 'aprobada' then
    raise exception 'Esta semana ya está aprobada.';
  end if;

  -- Semanas nuevas: congelar el valor generado por persona (será la "semana
  -- anterior" de las siguientes). Las importadas ya lo traen.
  if not v_sem.importada then
    insert into public.prod_valor_semana (semana_id, operadora_id, valor_generado)
    select v_sem.id, o.id, coalesce(t.total, 0)
    from public.prod_operadoras o
    left join (
      select r.operadora_id, sum(r.valor) as total
      from public.prod_registros r where r.semana_id = v_sem.id group by r.operadora_id
    ) t on t.operadora_id = o.id
    where o.activo or t.total is not null
    on conflict (semana_id, operadora_id) do update set valor_generado = excluded.valor_generado;
  end if;

  delete from public.prod_premios_semana where semana_id = v_sem.id;
  insert into public.prod_premios_semana (
    semana_id, operadora_id, valor_generado, valor_anterior, lugar, mejora_pct,
    bono_meta, bono_lugar, bono_mejora, total_premio
  )
  select v_sem.id, c.operadora_id, c.valor_generado, c.valor_anterior, c.lugar, c.mejora_pct,
         c.bono_meta, c.bono_lugar, c.bono_mejora, c.total_premio
  from public.prod_calcular_premios(v_sem.id) c;

  update public.prod_semanas
     set estado = 'aprobada', aprobada_por = auth.uid(), aprobada_en = now()
   where id = v_sem.id
  returning * into v_sem;
  return v_sem;
end; $$;
revoke execute on function public.prod_aprobar_semana(uuid) from public;
grant execute on function public.prod_aprobar_semana(uuid) to authenticated;
