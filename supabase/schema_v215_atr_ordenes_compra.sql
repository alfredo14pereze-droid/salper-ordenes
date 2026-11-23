-- =====================================================================
-- V215 — ATR: órdenes de compra, surtido contra OC y "Qué nos falta"
--
-- Requiere V209 + V210 + V211. Se puede correr dos veces.
--
-- Aditivo:
--   * 3 tablas nuevas: atr_ordenes_compra, atr_oc_lineas, atr_oc_alias.
--   * atr_movimientos: 2 columnas nuevas (oc_linea_id, surtido_id) y 2 tipos
--     nuevos (salida_surtido −, reversa_surtido +). Para permitir los tipos
--     nuevos se vuelven a crear 3 CHECK de la tabla, más amplios: todo lo
--     que ya está guardado los sigue cumpliendo (nada se renombra ni se borra;
--     salida_entrega se queda).
--   * 2 permisos: atr.oc (subir/cancelar OC) y atr.taller (crear orden de
--     taller), para admin_general y admin_fabrica. Surtir usa atr.entregar;
--     deshacer un surtido usa atr.cargar.
--   * Funciones nuevas: atr_oc_guardar, atr_oc_cancelar, atr_surtir_oc,
--     atr_deshacer_surtido, atr_oc_lista, atr_oc_detalle, atr_faltantes,
--     atr_oc_alias_buscar (+ 2 de apoyo y 1 trigger).
--
-- Reglas:
--   * Lo surtido por línea NO se guarda: = −Σ movimientos de esa oc_linea_id
--     (salida_surtido negativos + reversa_surtido positivos).
--   * Estado de la OC se recalcula solo (trigger): nada surtido = abierta,
--     algo = parcial, todo = surtida. Cancelada es manual y no se toca.
--   * Cada surtido lleva un surtido_id (uuid) que agrupa sus líneas: sirve
--     para la hoja de surtido y para deshacerlo completo.
--   * Faltante = max(0, pendiente − existencia − en taller), solo OC abiertas
--     o parciales. En taller = lo pedido en órdenes de ATR sin eliminar cuya
--     etapa Terminado no está completada (solo batas del catálogo de ATR).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Órdenes de compra de ATR
-- ---------------------------------------------------------------------
create table if not exists public.atr_ordenes_compra (
  id                  bigint generated always as identity primary key,
  numero_oc           text not null check (btrim(numero_oc) <> ''),
  fecha_oc            date not null,
  fecha_entrega       date,
  pdf_url             text,              -- ruta del PDF original en Storage (bucket orden-documentos)
  leido_pdf           jsonb,             -- lo que se leyó del PDF, tal cual
  estado              text not null default 'abierta'
                        check (estado in ('abierta', 'parcial', 'surtida', 'cancelada')),
  notas               text,
  creado_por          uuid,
  creado_por_nombre   text,
  creado_en           timestamptz not null default now(),
  cancelada_en        timestamptz,
  cancelada_por       uuid,
  cancelada_por_nombre text,
  motivo_cancelacion  text,
  constraint atr_oc_cancelada_ck check ((estado = 'cancelada') = (cancelada_en is not null))
);

-- Número de OC único entre las no canceladas
create unique index if not exists atr_oc_numero_uq
  on public.atr_ordenes_compra (lower(btrim(numero_oc)))
  where estado <> 'cancelada';
create index if not exists atr_oc_estado_idx
  on public.atr_ordenes_compra (estado, fecha_entrega);

create table if not exists public.atr_oc_lineas (
  id               bigint generated always as identity primary key,
  oc_id            bigint not null references public.atr_ordenes_compra(id) on delete restrict,
  producto_id      uuid not null references public.productos(id) on delete restrict,
  talla            text not null check (btrim(talla) <> ''),
  cantidad_pedida  integer not null check (cantidad_pedida > 0),
  texto_pdf        text,                 -- descripción como venía en el PDF
  constraint atr_oc_linea_uq unique (oc_id, producto_id, talla)
);
create index if not exists atr_oc_lineas_prod_idx on public.atr_oc_lineas (producto_id, talla);

-- Lo aprendido al asignar: descripción del PDF → bata de ATR
create table if not exists public.atr_oc_alias (
  texto_norm      text primary key,
  producto_id     uuid not null references public.productos(id) on delete cascade,
  actualizado_en  timestamptz not null default now()
);

alter table public.atr_ordenes_compra enable row level security;
alter table public.atr_oc_lineas      enable row level security;
alter table public.atr_oc_alias       enable row level security;

drop policy if exists "atr lee oc" on public.atr_ordenes_compra;
create policy "atr lee oc" on public.atr_ordenes_compra
  for select to authenticated using (public.tiene_permiso('atr.ver'));
drop policy if exists "atr lee oc lineas" on public.atr_oc_lineas;
create policy "atr lee oc lineas" on public.atr_oc_lineas
  for select to authenticated using (public.tiene_permiso('atr.ver'));
drop policy if exists "atr lee oc alias" on public.atr_oc_alias;
create policy "atr lee oc alias" on public.atr_oc_alias
  for select to authenticated using (public.tiene_permiso('atr.ver'));

revoke all on public.atr_ordenes_compra, public.atr_oc_lineas, public.atr_oc_alias
  from public, anon, authenticated;
grant select on public.atr_ordenes_compra, public.atr_oc_lineas, public.atr_oc_alias to authenticated;

-- ---------------------------------------------------------------------
-- 2) atr_movimientos: columnas y tipos nuevos
-- ---------------------------------------------------------------------
alter table public.atr_movimientos
  add column if not exists oc_linea_id bigint references public.atr_oc_lineas(id) on delete restrict,
  add column if not exists surtido_id  uuid;

-- Tipos: los de V209 + salida_surtido + reversa_surtido
alter table public.atr_movimientos drop constraint if exists atr_movimientos_tipo_check;
alter table public.atr_movimientos drop constraint if exists atr_mov_tipo_ck;
alter table public.atr_movimientos add constraint atr_mov_tipo_ck check (tipo in (
  'carga_inicial', 'entrada_produccion', 'reversa_produccion',
  'salida_entrega', 'ajuste', 'salida_surtido', 'reversa_surtido'));

alter table public.atr_movimientos drop constraint if exists atr_mov_signo_ck;
alter table public.atr_movimientos add constraint atr_mov_signo_ck check (
  (tipo in ('carga_inicial', 'entrada_produccion', 'reversa_surtido') and cantidad > 0) or
  (tipo in ('salida_entrega', 'reversa_produccion', 'salida_surtido') and cantidad < 0) or
  tipo = 'ajuste');

alter table public.atr_movimientos drop constraint if exists atr_mov_revierte_ck;
alter table public.atr_movimientos add constraint atr_mov_revierte_ck check (
  (tipo in ('reversa_produccion', 'reversa_surtido')) = (revierte_id is not null));

alter table public.atr_movimientos drop constraint if exists atr_mov_surtido_ck;
alter table public.atr_movimientos add constraint atr_mov_surtido_ck check (
  (tipo in ('salida_surtido', 'reversa_surtido')) = (oc_linea_id is not null and surtido_id is not null));

-- Un surtido se deshace una sola vez
create unique index if not exists atr_mov_reversa_surtido_uq
  on public.atr_movimientos (revierte_id) where tipo = 'reversa_surtido';
create index if not exists atr_mov_oc_linea_idx
  on public.atr_movimientos (oc_linea_id) where oc_linea_id is not null;
create index if not exists atr_mov_surtido_idx
  on public.atr_movimientos (surtido_id) where surtido_id is not null;

-- ---------------------------------------------------------------------
-- 3) Permisos
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('atr.oc', 'Inventario ATR', 'Subir y cancelar OC de ATR',
   'Subir órdenes de compra de ATR (con lectura del PDF) y cancelarlas.', 'editar', 83),
  ('atr.taller', 'Inventario ATR', 'Crear órdenes de taller ATR',
   'Crear órdenes de taller desde "Qué nos falta".', 'editar', 84)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave) values
  ('admin_general', 'atr.oc'), ('admin_fabrica', 'atr.oc'),
  ('admin_general', 'atr.taller'), ('admin_fabrica', 'atr.taller')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4) Apoyo
-- ---------------------------------------------------------------------
-- Texto del PDF normalizado para aprender/buscar alias
create or replace function public.atr_texto_norm(p_texto text)
returns text language sql immutable set search_path = public as $$
  select nullif(btrim(regexp_replace(lower(coalesce(p_texto, '')), '\s+', ' ', 'g')), '')
$$;
revoke execute on function public.atr_texto_norm(text) from public, anon, authenticated;

-- Recalcula el estado de una OC (no toca canceladas)
create or replace function public.atr_oc_recalcular(p_oc_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pedido integer;
  v_surtido integer;
begin
  select coalesce(sum(l.cantidad_pedida), 0),
         coalesce(sum(least(l.cantidad_pedida,
           greatest(0, -coalesce((select sum(m.cantidad) from public.atr_movimientos m
                                  where m.oc_linea_id = l.id), 0)))), 0)
    into v_pedido, v_surtido
  from public.atr_oc_lineas l where l.oc_id = p_oc_id;

  update public.atr_ordenes_compra
     set estado = case when v_surtido <= 0 then 'abierta'
                       when v_surtido >= v_pedido then 'surtida'
                       else 'parcial' end
   where id = p_oc_id and estado <> 'cancelada';
end;
$$;
revoke execute on function public.atr_oc_recalcular(bigint) from public, anon, authenticated;

create or replace function public.atr_mov_oc_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.oc_linea_id is not null then
    perform public.atr_oc_recalcular((select oc_id from public.atr_oc_lineas where id = new.oc_linea_id));
  end if;
  return null;
end;
$$;
revoke execute on function public.atr_mov_oc_trg() from public, anon, authenticated;

drop trigger if exists atr_mov_oc_trg on public.atr_movimientos;
create trigger atr_mov_oc_trg
  after insert on public.atr_movimientos
  for each row when (new.oc_linea_id is not null)
  execute function public.atr_mov_oc_trg();

-- ---------------------------------------------------------------------
-- 5) Guardar una OC (después de revisar lo leído del PDF)
--    p_lineas: [{producto_id, talla, cantidad, texto_pdf}]
--    Rechaza número repetido (OC_REPETIDA:) y líneas inválidas.
--    Junta renglones repetidos (misma bata y talla). Aprende alias.
-- ---------------------------------------------------------------------
create or replace function public.atr_oc_guardar(
  p_numero_oc text,
  p_fecha_oc date,
  p_fecha_entrega date,
  p_pdf_url text,
  p_leido_pdf jsonb,
  p_notas text,
  p_lineas jsonb
)
returns public.atr_ordenes_compra
language plpgsql security definer set search_path = public as $$
declare
  v_oc public.atr_ordenes_compra;
  v_num text := btrim(coalesce(p_numero_oc, ''));
begin
  if not public.tiene_permiso('atr.oc') then
    raise exception 'No tienes permiso para subir órdenes de compra de ATR.';
  end if;
  if v_num = '' then raise exception 'Captura el número de OC.'; end if;
  if p_fecha_oc is null then raise exception 'Captura la fecha de la OC.'; end if;

  perform pg_advisory_xact_lock(hashtext('atr_ordenes_compra'));

  if exists (select 1 from public.atr_ordenes_compra
             where lower(btrim(numero_oc)) = lower(v_num) and estado <> 'cancelada') then
    raise exception 'OC_REPETIDA: ya existe la OC % de ATR.', v_num;
  end if;

  -- Valida (producto de ATR, talla, cantidad entera > 0); lanza error si no
  perform 1 from public.atr_lineas_validas(p_lineas);

  insert into public.atr_ordenes_compra
    (numero_oc, fecha_oc, fecha_entrega, pdf_url, leido_pdf, notas, creado_por, creado_por_nombre)
  values
    (v_num, p_fecha_oc, p_fecha_entrega, nullif(btrim(coalesce(p_pdf_url, '')), ''), p_leido_pdf,
     nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), public.atr_usuario_nombre())
  returning * into v_oc;

  insert into public.atr_oc_lineas (oc_id, producto_id, talla, cantidad_pedida, texto_pdf)
  select v_oc.id, (l->>'producto_id')::uuid, upper(btrim(l->>'talla')),
         sum((l->>'cantidad')::integer)::integer,
         string_agg(distinct nullif(btrim(l->>'texto_pdf'), ''), ' / ')
  from jsonb_array_elements(p_lineas) l
  group by 2, 3;

  -- Aprender: descripción del PDF → bata
  insert into public.atr_oc_alias (texto_norm, producto_id)
  select distinct on (public.atr_texto_norm(l->>'texto_pdf'))
         public.atr_texto_norm(l->>'texto_pdf'), (l->>'producto_id')::uuid
  from jsonb_array_elements(p_lineas) l
  where public.atr_texto_norm(l->>'texto_pdf') is not null
  on conflict (texto_norm) do update
    set producto_id = excluded.producto_id, actualizado_en = now();

  return v_oc;
end;
$$;
revoke execute on function public.atr_oc_guardar(text, date, date, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.atr_oc_guardar(text, date, date, text, jsonb, text, jsonb) to authenticated;

-- Alias aprendidos para una lista de descripciones (para la revisión)
create or replace function public.atr_oc_alias_buscar(p_textos text[])
returns table (texto text, producto_id uuid)
language sql stable security definer set search_path = public as $$
  select t, a.producto_id
  from unnest(coalesce(p_textos, '{}')) t
  join public.atr_oc_alias a on a.texto_norm = public.atr_texto_norm(t)
  where public.tiene_permiso('atr.ver')
$$;
revoke execute on function public.atr_oc_alias_buscar(text[]) from public, anon;
grant execute on function public.atr_oc_alias_buscar(text[]) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Cancelar una OC (motivo obligatorio). Lo ya surtido NO se revierte:
--    regresa cuántas piezas tenía surtidas para que la app lo diga.
-- ---------------------------------------------------------------------
create or replace function public.atr_oc_cancelar(p_oc_id bigint, p_motivo text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_estado text;
  v_surtido integer;
begin
  if not public.tiene_permiso('atr.oc') then
    raise exception 'No tienes permiso para cancelar órdenes de compra de ATR.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Escribe por qué se cancela.'; end if;

  select estado into v_estado from public.atr_ordenes_compra where id = p_oc_id for update;
  if not found then raise exception 'No existe esa OC.'; end if;
  if v_estado = 'cancelada' then raise exception 'La OC ya está cancelada.'; end if;

  select coalesce(-sum(m.cantidad), 0)::integer into v_surtido
  from public.atr_movimientos m join public.atr_oc_lineas l on l.id = m.oc_linea_id
  where l.oc_id = p_oc_id;

  update public.atr_ordenes_compra
     set estado = 'cancelada', cancelada_en = now(), cancelada_por = auth.uid(),
         cancelada_por_nombre = public.atr_usuario_nombre(), motivo_cancelacion = btrim(p_motivo)
   where id = p_oc_id;
  return v_surtido;
end;
$$;
revoke execute on function public.atr_oc_cancelar(bigint, text) from public, anon;
grant execute on function public.atr_oc_cancelar(bigint, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7) Surtir una OC (parcial o total)
--    p_lineas: [{oc_linea_id, cantidad}]  (cantidad 0 o vacía = no se surte)
--    * no más que lo pendiente de cada línea;
--    * si alguna talla quedaría en negativo y no viene p_permitir_negativo,
--      avisa con NEGATIVO: y no guarda.
--    Regresa el surtido_id (para la hoja de surtido y para deshacerlo).
-- ---------------------------------------------------------------------
create or replace function public.atr_surtir_oc(
  p_oc_id bigint,
  p_lineas jsonb,
  p_nota text default null,
  p_permitir_negativo boolean default false
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_estado text;
  v_surtido uuid := gen_random_uuid();
  v_malo text;
  v_faltan text;
  v_n integer;
begin
  if not public.tiene_permiso('atr.entregar') then
    raise exception 'No tienes permiso para surtir órdenes de compra de ATR.';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'No hay líneas que surtir.';
  end if;

  perform pg_advisory_xact_lock(hashtext('atr_movimientos'));

  select estado into v_estado from public.atr_ordenes_compra where id = p_oc_id for update;
  if not found then raise exception 'No existe esa OC.'; end if;
  if v_estado = 'cancelada' then raise exception 'La OC está cancelada.'; end if;
  if v_estado = 'surtida' then raise exception 'La OC ya está surtida completa.'; end if;

  create temp table if not exists atr_tmp_surtir (
    oc_linea_id bigint, producto_id uuid, talla text, nombre text,
    cantidad integer, pendiente integer, existencia integer
  ) on commit drop;
  truncate atr_tmp_surtir;

  -- Cantidades válidas: enteros ≥ 0
  select string_agg(coalesce(l->>'oc_linea_id', '—') || ' = ' || coalesce(l->>'cantidad', '—'), ', ')
    into v_malo
  from jsonb_array_elements(p_lineas) l
  where coalesce(l->>'cantidad', '') <> ''
    and not (l->>'cantidad') ~ '^\s*[0-9]{1,7}\s*$';
  if v_malo is not null then raise exception 'Cantidad inválida (línea %).', v_malo; end if;

  insert into atr_tmp_surtir (oc_linea_id, cantidad)
  select (l->>'oc_linea_id')::bigint, sum(nullif(btrim(coalesce(l->>'cantidad', '')), '')::integer)
  from jsonb_array_elements(p_lineas) l
  group by 1;
  delete from atr_tmp_surtir where coalesce(cantidad, 0) = 0;

  if not exists (select 1 from atr_tmp_surtir) then
    raise exception 'Captura al menos una cantidad a surtir.';
  end if;
  if exists (select 1 from atr_tmp_surtir t
             where not exists (select 1 from public.atr_oc_lineas l
                               where l.id = t.oc_linea_id and l.oc_id = p_oc_id)) then
    raise exception 'Hay líneas que no son de esta OC.';
  end if;

  update atr_tmp_surtir t
     set producto_id = l.producto_id, talla = l.talla, nombre = p.nombre,
         pendiente = l.cantidad_pedida + coalesce((select sum(m.cantidad) from public.atr_movimientos m
                                                   where m.oc_linea_id = l.id), 0),
         existencia = coalesce((select sum(m.cantidad) from public.atr_movimientos m
                                where m.producto_id = l.producto_id and m.talla = l.talla), 0)
    from public.atr_oc_lineas l join public.productos p on p.id = l.producto_id
   where l.id = t.oc_linea_id;

  select string_agg(nombre || ' ' || talla || ' (pendiente ' || pendiente || ', capturaste ' || cantidad || ')', '; ')
    into v_malo from atr_tmp_surtir where cantidad > pendiente;
  if v_malo is not null then
    raise exception 'No se puede surtir más de lo pendiente: %', v_malo;
  end if;

  -- Negativos: por bata+talla (dos líneas de la misma talla no deberían
  -- existir en una OC, pero se suma por si acaso)
  select string_agg(nombre || ' ' || talla || ' (hay ' || existencia || ', salen ' || sale || ')', '; ')
    into v_faltan
  from (select nombre, talla, max(existencia) as existencia, sum(cantidad) as sale
        from atr_tmp_surtir group by nombre, talla) x
  where existencia - sale < 0;
  if v_faltan is not null and not coalesce(p_permitir_negativo, false) then
    raise exception 'NEGATIVO: %', v_faltan;
  end if;

  insert into public.atr_movimientos
    (producto_id, talla, tipo, cantidad, oc_linea_id, surtido_id, nota, usuario_id, usuario_nombre)
  select producto_id, talla, 'salida_surtido', -cantidad, oc_linea_id, v_surtido,
         nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), public.atr_usuario_nombre()
  from atr_tmp_surtir;
  get diagnostics v_n = row_count;

  return v_surtido;
end;
$$;
revoke execute on function public.atr_surtir_oc(bigint, jsonb, text, boolean) from public, anon;
grant execute on function public.atr_surtir_oc(bigint, jsonb, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 8) Deshacer un surtido completo: movimientos de signo contrario,
--    sin borrar nada. Regresa cuántas líneas se revirtieron.
-- ---------------------------------------------------------------------
create or replace function public.atr_deshacer_surtido(p_surtido_id uuid, p_motivo text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_mov record;
  v_n integer := 0;
  v_quien text := public.atr_usuario_nombre();
begin
  if not public.tiene_permiso('atr.cargar') then
    raise exception 'No tienes permiso para deshacer surtidos de ATR.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Escribe por qué se deshace el surtido.'; end if;

  perform pg_advisory_xact_lock(hashtext('atr_movimientos'));

  if exists (select 1 from public.atr_movimientos m
             join public.atr_oc_lineas l on l.id = m.oc_linea_id
             join public.atr_ordenes_compra o on o.id = l.oc_id
             where m.surtido_id = p_surtido_id and o.estado = 'cancelada') then
    raise exception 'La OC de ese surtido está cancelada.';
  end if;

  for v_mov in
    select * from public.atr_movimientos
    where surtido_id = p_surtido_id and tipo = 'salida_surtido' and revertido_en is null
    for update
  loop
    update public.atr_movimientos set revertido_en = now() where id = v_mov.id;
    insert into public.atr_movimientos
      (producto_id, talla, tipo, cantidad, oc_linea_id, surtido_id, revierte_id, nota, usuario_id, usuario_nombre)
    values
      (v_mov.producto_id, v_mov.talla, 'reversa_surtido', -v_mov.cantidad, v_mov.oc_linea_id,
       v_mov.surtido_id, v_mov.id, btrim(p_motivo), auth.uid(), v_quien);
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then raise exception 'Ese surtido no existe o ya se deshizo.'; end if;
  return v_n;
end;
$$;
revoke execute on function public.atr_deshacer_surtido(uuid, text) from public, anon;
grant execute on function public.atr_deshacer_surtido(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9) Lecturas para la app (solo con atr.ver)
-- ---------------------------------------------------------------------
-- Lista de OC con piezas pedidas / surtidas
create or replace function public.atr_oc_lista()
returns table (
  id bigint, numero_oc text, fecha_oc date, fecha_entrega date, estado text, pdf_url text,
  notas text, creado_por_nombre text, creado_en timestamptz, cancelada_en timestamptz,
  motivo_cancelacion text, lineas integer, pedido integer, surtido integer
)
language sql stable security definer set search_path = public as $$
  select o.id, o.numero_oc, o.fecha_oc, o.fecha_entrega, o.estado, o.pdf_url, o.notas,
         o.creado_por_nombre, o.creado_en, o.cancelada_en, o.motivo_cancelacion,
         count(l.id)::integer,
         coalesce(sum(l.cantidad_pedida), 0)::integer,
         coalesce(sum(least(l.cantidad_pedida, greatest(0, -coalesce(s.mov, 0)))), 0)::integer
  from public.atr_ordenes_compra o
  left join public.atr_oc_lineas l on l.oc_id = o.id
  left join lateral (select sum(m.cantidad) as mov from public.atr_movimientos m
                     where m.oc_linea_id = l.id) s on true
  where public.tiene_permiso('atr.ver')
  group by o.id
$$;
revoke execute on function public.atr_oc_lista() from public, anon;
grant execute on function public.atr_oc_lista() to authenticated;

-- Líneas de una OC: pedido / surtido / pendiente / existencia actual
create or replace function public.atr_oc_detalle(p_oc_id bigint)
returns table (
  oc_linea_id bigint, producto_id uuid, producto text, color text, con_bolsa boolean,
  talla text, texto_pdf text, pedido integer, surtido integer, pendiente integer, existencia integer
)
language sql stable security definer set search_path = public as $$
  select l.id, l.producto_id, p.nombre, p.color,
         coalesce((p.especificaciones->>'bolsa')::boolean, false),
         l.talla, l.texto_pdf, l.cantidad_pedida,
         s.surtido, greatest(0, l.cantidad_pedida - s.surtido),
         coalesce((select sum(m.cantidad) from public.atr_movimientos m
                   where m.producto_id = l.producto_id and m.talla = l.talla), 0)::integer
  from public.atr_oc_lineas l
  join public.productos p on p.id = l.producto_id
  cross join lateral (
    select greatest(0, -coalesce(sum(m.cantidad), 0))::integer as surtido
    from public.atr_movimientos m where m.oc_linea_id = l.id
  ) s
  where l.oc_id = p_oc_id and public.tiene_permiso('atr.ver')
  order by p.nombre, array_position(array['CH','M','L','XL','2XL','3XL','4XL'], l.talla), l.talla
$$;
revoke execute on function public.atr_oc_detalle(bigint) from public, anon;
grant execute on function public.atr_oc_detalle(bigint) to authenticated;

-- "Qué nos falta": por bata + talla, solo OC abiertas o parciales.
-- en_taller_ordenes: [{order_id, order_number, cantidad}] para mostrar de dónde sale.
create or replace function public.atr_faltantes()
returns table (
  producto_id uuid, producto text, color text, con_bolsa boolean, talla text,
  pendiente integer, existencia integer, en_taller integer, faltante integer,
  en_taller_ordenes jsonb
)
language sql stable security definer set search_path = public as $$
  with pend as (
    select l.producto_id, l.talla,
           sum(greatest(0, l.cantidad_pedida + coalesce(
             (select sum(m.cantidad) from public.atr_movimientos m where m.oc_linea_id = l.id), 0)))::integer as pendiente
    from public.atr_oc_lineas l
    join public.atr_ordenes_compra o on o.id = l.oc_id
    where o.estado in ('abierta', 'parcial')
    group by 1, 2
  ), exist as (
    select m.producto_id, m.talla, sum(m.cantidad)::integer as existencia
    from public.atr_movimientos m group by 1, 2
  ), taller_lineas as (
    select p.id as producto_id, upper(btrim(sz.s->>'talla')) as talla,
           o.id as order_id, o.order_number,
           floor((sz.s->>'cantidad')::numeric)::integer as cantidad
    from public.orders o
    cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it(i)
    join public.productos p on p.id::text = it.i->>'producto_id' and p.cliente_id = o.client_id
    cross join lateral jsonb_array_elements(coalesce(it.i->'sizes', '[]'::jsonb)) sz(s)
    where o.client_id = public.atr_cliente_id()
      and o.eliminada_en is null
      and not exists (select 1 from public.orden_etapas e
                      where e.order_id = o.id and e.etapa = 'terminado' and e.estado = 'completado')
      and coalesce(btrim(sz.s->>'talla'), '') <> ''
      and coalesce(sz.s->>'cantidad', '') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
      and floor((sz.s->>'cantidad')::numeric) > 0
  ), taller as (
    select producto_id, talla, sum(cantidad)::integer as en_taller,
           jsonb_agg(jsonb_build_object('order_id', order_id, 'order_number', order_number, 'cantidad', cantidad)
                     order by order_number) as ordenes
    from taller_lineas group by 1, 2
  )
  select pd.producto_id, p.nombre, p.color,
         coalesce((p.especificaciones->>'bolsa')::boolean, false),
         pd.talla, pd.pendiente,
         coalesce(e.existencia, 0),
         coalesce(t.en_taller, 0),
         greatest(0, pd.pendiente - greatest(0, coalesce(e.existencia, 0)) - coalesce(t.en_taller, 0)),
         coalesce(t.ordenes, '[]'::jsonb)
  from pend pd
  join public.productos p on p.id = pd.producto_id
  left join exist e on e.producto_id = pd.producto_id and e.talla = pd.talla
  left join taller t on t.producto_id = pd.producto_id and t.talla = pd.talla
  where pd.pendiente > 0 and public.tiene_permiso('atr.ver')
  order by p.nombre, array_position(array['CH','M','L','XL','2XL','3XL','4XL'], pd.talla), pd.talla
$$;
revoke execute on function public.atr_faltantes() from public, anon;
grant execute on function public.atr_faltantes() to authenticated;

-- ---------------------------------------------------------------------
-- Comprobación (debe dar: 3 · 2 · 4 · 11 · 1 · 0 · false)
--   tablas nuevas · columnas nuevas · roles con atr.oc/atr.taller ·
--   funciones nuevas · trigger · CHECK viejo de tipo (ya no debe existir) ·
--   anon puede surtir
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_tables where schemaname = 'public'
     and tablename in ('atr_ordenes_compra', 'atr_oc_lineas', 'atr_oc_alias'))            as tablas,
  (select count(*) from information_schema.columns where table_schema = 'public'
     and table_name = 'atr_movimientos' and column_name in ('oc_linea_id', 'surtido_id')) as columnas,
  (select count(*) from public.rol_permisos where clave in ('atr.oc', 'atr.taller'))       as roles_permiso,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in (
     'atr_texto_norm', 'atr_oc_recalcular', 'atr_mov_oc_trg', 'atr_oc_guardar', 'atr_oc_alias_buscar',
     'atr_oc_cancelar', 'atr_surtir_oc', 'atr_deshacer_surtido', 'atr_oc_lista', 'atr_oc_detalle',
     'atr_faltantes'))                                                                    as funciones,
  (select count(*) from pg_trigger where tgname = 'atr_mov_oc_trg' and not tgisinternal)  as trigger_oc,
  (select count(*) from pg_constraint where conrelid = 'public.atr_movimientos'::regclass
     and conname = 'atr_movimientos_tipo_check')                                         as check_viejo,
  has_function_privilege('anon', 'public.atr_surtir_oc(bigint, jsonb, text, boolean)', 'EXECUTE') as anon_puede;
