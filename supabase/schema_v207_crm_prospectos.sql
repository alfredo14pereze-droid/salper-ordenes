-- =====================================================================
-- V207 — CRM de prospectos, Parte 1 (2026-11-13)
-- =====================================================================
-- Reemplaza el Excel "Formato reporte prospectos": empresas a las que les
-- ofrecemos uniformes, sus contactos, la bitácora de cada contacto y los
-- recordatorios de "volver a contactar".
--
-- Quién puede qué (se cambia en "Roles y permisos", sin tocar código):
--   · crm.usar     → ver y editar todo el CRM: admin_general ("super_admin"
--                    del pedido), admin_tienda y ventas. Fábrica no lo ve.
--   · crm.importar → subir el CSV del Excel viejo: solo admin_general.
--
-- Igual que el resto del sistema: lectura con RLS (solo quien tiene
-- crm.usar), sin políticas de escritura para el cliente; todo cambio pasa
-- por las funciones crm_* (security definer), que revisan el permiso.
--
-- Eliminar empresa = soft-delete (`eliminada_en`), como en órdenes.
--
-- Aditivo: 4 tablas nuevas (crm_*), 2 permisos, funciones crm_*.
-- NO modifica ninguna tabla existente (cliente_id solo apunta a clientes).
-- Se puede correr dos veces sin duplicar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permisos
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('crm.usar', 'CRM', 'Usar el CRM',
   'Ver y editar prospectos, contactos, bitácora y seguimientos.', 'editar', 80),
  ('crm.importar', 'CRM', 'Importar prospectos',
   'Subir el CSV del Excel de prospectos (herramienta de una sola vez).', 'editar', 81)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave) values
  ('admin_general', 'crm.usar'),
  ('admin_tienda',  'crm.usar'),
  ('ventas',        'crm.usar'),
  ('admin_general', 'crm.importar')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) Normalización del nombre de empresa (anti-duplicados)
--    "Grupo Peñoles, S.A. de C.V." = "grupo penoles" = "GRUPO  PEÑOLES SA DE CV"
--    Sin acentos, minúsculas, sin puntuación, sin razón social al final,
--    espacios simples. translate (no unaccent) para poder ser IMMUTABLE.
-- ---------------------------------------------------------------------
create or replace function public.crm_norm_empresa(p text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(lower(coalesce(p, '')), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'),
        '[^a-z0-9 ]', ' ', 'g'),                       -- puntuación fuera
      '(\s(s\s*a\s*p\s*i|s\s*a|s\s*de\s*r\s*l|s\s*c|a\s*c)(\s*de\s*c\s*v)?)\s*$', '', 'g'),
    '\s+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------
-- 3) Tablas
-- ---------------------------------------------------------------------
create table if not exists public.crm_empresas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (btrim(nombre) <> ''),
  nombre_norm     text generated always as (public.crm_norm_empresa(nombre)) stored,
  ubicacion       text,
  segmento        text check (segmento in ('industrial','salud','escuela','corporativo','alimentos','transporte','otro')),
  estatus         text not null default 'nuevo' check (estatus in
                    ('nuevo','catalogo_enviado','en_conversacion','visita_reunion','cotizado','ganado','perdido','en_pausa')),
  motivo_perdida  text,
  mes_compra      smallint check (mes_compra between 1 and 12),
  monto_cotizado  numeric(12,2),
  monto_vendido   numeric(12,2),
  origen          text,
  cliente_id      uuid references public.clientes(id),   -- se llena al ganar (Parte 3)
  responsable_id  uuid references public.profiles(id),
  creado_por      uuid,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  eliminada_en    timestamptz
);
create index if not exists crm_empresas_norm_idx on public.crm_empresas (nombre_norm) where eliminada_en is null;
create index if not exists crm_empresas_estatus_idx on public.crm_empresas (estatus) where eliminada_en is null;

create table if not exists public.crm_contactos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.crm_empresas(id) on delete cascade,
  nombre        text not null check (btrim(nombre) <> ''),
  puesto        text,
  telefono      text,
  correo        text,
  notas         text,
  es_principal  boolean not null default false,
  creado_en     timestamptz not null default now()
);
create index if not exists crm_contactos_empresa_idx on public.crm_contactos (empresa_id);
-- Un solo contacto principal por empresa.
create unique index if not exists crm_contactos_principal_uq on public.crm_contactos (empresa_id) where es_principal;

create table if not exists public.crm_actividades (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.crm_empresas(id) on delete cascade,
  contacto_id   uuid references public.crm_contactos(id) on delete set null,
  tipo          text not null check (tipo in ('llamada','correo','whatsapp','visita','reunion','videollamada','nota')),
  fecha         date not null,
  nota          text,
  usuario_id    uuid,
  creado_en     timestamptz not null default now()
);
create index if not exists crm_actividades_empresa_idx on public.crm_actividades (empresa_id, fecha desc);

create table if not exists public.crm_seguimientos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.crm_empresas(id) on delete cascade,
  fecha          date not null,
  nota           text,
  asignado_a     uuid references public.profiles(id),
  completado_en  timestamptz,
  creado_por     uuid,
  creado_en      timestamptz not null default now()
);
create index if not exists crm_seguimientos_pendientes_idx on public.crm_seguimientos (fecha) where completado_en is null;
create index if not exists crm_seguimientos_empresa_idx on public.crm_seguimientos (empresa_id);

-- ---------------------------------------------------------------------
-- 4) RLS: solo lectura, y solo con crm.usar
-- ---------------------------------------------------------------------
alter table public.crm_empresas     enable row level security;
alter table public.crm_contactos    enable row level security;
alter table public.crm_actividades  enable row level security;
alter table public.crm_seguimientos enable row level security;

drop policy if exists "CRM lectura empresas" on public.crm_empresas;
create policy "CRM lectura empresas" on public.crm_empresas
  for select to authenticated using (eliminada_en is null and public.tiene_permiso('crm.usar'));

drop policy if exists "CRM lectura contactos" on public.crm_contactos;
create policy "CRM lectura contactos" on public.crm_contactos
  for select to authenticated using (public.tiene_permiso('crm.usar'));

drop policy if exists "CRM lectura actividades" on public.crm_actividades;
create policy "CRM lectura actividades" on public.crm_actividades
  for select to authenticated using (public.tiene_permiso('crm.usar'));

drop policy if exists "CRM lectura seguimientos" on public.crm_seguimientos;
create policy "CRM lectura seguimientos" on public.crm_seguimientos
  for select to authenticated using (public.tiene_permiso('crm.usar'));

revoke all on public.crm_empresas, public.crm_contactos, public.crm_actividades, public.crm_seguimientos
  from public, anon, authenticated;
grant select on public.crm_empresas, public.crm_contactos, public.crm_actividades, public.crm_seguimientos
  to authenticated;

-- ---------------------------------------------------------------------
-- 5) Funciones de escritura (todas revisan crm.usar)
-- ---------------------------------------------------------------------

-- Empresas que se parecen a un nombre (para avisar antes de crear otra).
-- Parecida = mismo nombre normalizado, o uno contiene al otro (≥ 4 letras).
create or replace function public.crm_empresas_parecidas(p_nombre text, p_excluir uuid default null)
returns table (id uuid, nombre text, ubicacion text, estatus text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nombre, e.ubicacion, e.estatus
    from public.crm_empresas e
   where public.tiene_permiso('crm.usar')
     and e.eliminada_en is null
     and e.id is distinct from p_excluir
     and length(public.crm_norm_empresa(p_nombre)) > 0
     and (e.nombre_norm = public.crm_norm_empresa(p_nombre)
          or (length(public.crm_norm_empresa(p_nombre)) >= 4
              and (e.nombre_norm like '%' || public.crm_norm_empresa(p_nombre) || '%'
                   or public.crm_norm_empresa(p_nombre) like '%' || e.nombre_norm || '%')))
   order by (e.nombre_norm = public.crm_norm_empresa(p_nombre)) desc, e.nombre
   limit 10
$$;

-- Crear (p_id null) o editar los datos generales de una empresa.
-- El estatus NO se cambia aquí (ver crm_cambiar_estatus); al crear queda 'nuevo'.
create or replace function public.crm_guardar_empresa(
  p_id uuid,
  p_nombre text,
  p_ubicacion text default null,
  p_segmento text default null,
  p_origen text default null,
  p_mes_compra smallint default null,
  p_monto_cotizado numeric default null,
  p_monto_vendido numeric default null,
  p_responsable_id uuid default null
) returns public.crm_empresas
language plpgsql security definer set search_path = public as $$
declare v_row public.crm_empresas;
begin
  if not public.tiene_permiso('crm.usar') then
    raise exception 'No tienes permiso para usar el CRM.';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'Escribe el nombre de la empresa.';
  end if;

  if p_id is null then
    insert into public.crm_empresas (nombre, ubicacion, segmento, origen, mes_compra,
                                     monto_cotizado, monto_vendido, responsable_id, creado_por)
    values (btrim(p_nombre), nullif(btrim(coalesce(p_ubicacion, '')), ''), nullif(p_segmento, ''),
            nullif(btrim(coalesce(p_origen, '')), ''), p_mes_compra, p_monto_cotizado, p_monto_vendido,
            coalesce(p_responsable_id, auth.uid()), auth.uid())
    returning * into v_row;
  else
    update public.crm_empresas
       set nombre = btrim(p_nombre),
           ubicacion = nullif(btrim(coalesce(p_ubicacion, '')), ''),
           segmento = nullif(p_segmento, ''),
           origen = nullif(btrim(coalesce(p_origen, '')), ''),
           mes_compra = p_mes_compra,
           monto_cotizado = p_monto_cotizado,
           monto_vendido = p_monto_vendido,
           responsable_id = p_responsable_id,
           actualizado_en = now()
     where id = p_id and eliminada_en is null
    returning * into v_row;
    if not found then raise exception 'La empresa no existe.'; end if;
  end if;
  return v_row;
end; $$;

-- Cambiar estatus.
--   · perdido  → motivo obligatorio.
--   · en_pausa → fecha para volver a contactar obligatoria; crea el seguimiento.
create or replace function public.crm_cambiar_estatus(
  p_id uuid,
  p_estatus text,
  p_motivo_perdida text default null,
  p_fecha_seguimiento date default null,
  p_nota_seguimiento text default null
) returns public.crm_empresas
language plpgsql security definer set search_path = public as $$
declare v_row public.crm_empresas;
begin
  if not public.tiene_permiso('crm.usar') then
    raise exception 'No tienes permiso para usar el CRM.';
  end if;
  if coalesce(p_estatus, '') not in
     ('nuevo','catalogo_enviado','en_conversacion','visita_reunion','cotizado','ganado','perdido','en_pausa') then
    raise exception 'Estatus no válido.';
  end if;
  if p_estatus = 'perdido' and btrim(coalesce(p_motivo_perdida, '')) = '' then
    raise exception 'Escribe por qué se perdió.';
  end if;
  if p_estatus = 'en_pausa' and p_fecha_seguimiento is null then
    raise exception 'Elige la fecha para volver a contactar.';
  end if;

  update public.crm_empresas
     set estatus = p_estatus,
         motivo_perdida = case when p_estatus = 'perdido' then btrim(p_motivo_perdida) else null end,
         actualizado_en = now()
   where id = p_id and eliminada_en is null
  returning * into v_row;
  if not found then raise exception 'La empresa no existe.'; end if;

  if p_estatus = 'en_pausa' then
    insert into public.crm_seguimientos (empresa_id, fecha, nota, asignado_a, creado_por)
    values (p_id, p_fecha_seguimiento,
            coalesce(nullif(btrim(coalesce(p_nota_seguimiento, '')), ''), 'Volver a contactar (estaba en pausa)'),
            coalesce(v_row.responsable_id, auth.uid()), auth.uid());
  end if;
  return v_row;
end; $$;

create or replace function public.crm_eliminar_empresa(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.tiene_permiso('crm.usar') then
    raise exception 'No tienes permiso para usar el CRM.';
  end if;
  update public.crm_empresas set eliminada_en = now(), actualizado_en = now()
   where id = p_id and eliminada_en is null;
  if not found then raise exception 'La empresa no existe.'; end if;
end; $$;

-- Crear (p_id null) o editar un contacto. Si es principal, le quita la marca al anterior.
-- La primera persona que se agrega a una empresa queda como principal.
create or replace function public.crm_guardar_contacto(
  p_id uuid,
  p_empresa_id uuid,
  p_nombre text,
  p_puesto text default null,
  p_telefono text default null,
  p_correo text default null,
  p_notas text default null,
  p_es_principal boolean default false
) returns public.crm_contactos
language plpgsql security definer set search_path = public as $$
declare
  v_row public.crm_contactos;
  v_principal boolean;
begin
  if not public.tiene_permiso('crm.usar') then
    raise exception 'No tienes permiso para usar el CRM.';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'Escribe el nombre del contacto.';
  end if;
  if not exists (select 1 from public.crm_empresas where id = p_empresa_id and eliminada_en is null) then
    raise exception 'La empresa no existe.';
  end if;

  v_principal := coalesce(p_es_principal, false)
    or not exists (select 1 from public.crm_contactos
                    where empresa_id = p_empresa_id and es_principal and id is distinct from p_id);
  if v_principal then
    update public.crm_contactos set es_principal = false
     where empresa_id = p_empresa_id and es_principal and id is distinct from p_id;
  end if;

  if p_id is null then
    insert into public.crm_contactos (empresa_id, nombre, puesto, telefono, correo, notas, es_principal)
    values (p_empresa_id, btrim(p_nombre), nullif(btrim(coalesce(p_puesto, '')), ''),
            nullif(btrim(coalesce(p_telefono, '')), ''), nullif(lower(btrim(coalesce(p_correo, ''))), ''),
            nullif(btrim(coalesce(p_notas, '')), ''), v_principal)
    returning * into v_row;
  else
    update public.crm_contactos
       set nombre = btrim(p_nombre),
           puesto = nullif(btrim(coalesce(p_puesto, '')), ''),
           telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
           correo = nullif(lower(btrim(coalesce(p_correo, ''))), ''),
           notas = nullif(btrim(coalesce(p_notas, '')), ''),
           es_principal = v_principal
     where id = p_id and empresa_id = p_empresa_id
    returning * into v_row;
    if not found then raise exception 'El contacto no existe.'; end if;
  end if;
  update public.crm_empresas set actualizado_en = now() where id = p_empresa_id;
  return v_row;
end; $$;

-- Borrar un contacto (su historial en la bitácora se queda, sin el nombre ligado).
create or replace function public.crm_eliminar_contacto(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.tiene_permiso('crm.usar') then
    raise exception 'No tienes permiso para usar el CRM.';
  end if;
  delete from public.crm_contactos where id = p_id;
  if not found then raise exception 'El contacto no existe.'; end if;
end; $$;

-- Registrar una entrada en la bitácora.
create or replace function public.crm_registrar_actividad(
  p_empresa_id uuid,
  p_tipo text,
  p_fecha date,
  p_nota text default null,
  p_contacto_id uuid default null
) returns public.crm_actividades
language plpgsql security definer set search_path = public as $$
declare v_row public.crm_actividades;
begin
  if not public.tiene_permiso('crm.usar') then
    raise exception 'No tienes permiso para usar el CRM.';
  end if;
  if not exists (select 1 from public.crm_empresas where id = p_empresa_id and eliminada_en is null) then
    raise exception 'La empresa no existe.';
  end if;
  if coalesce(p_tipo, '') not in ('llamada','correo','whatsapp','visita','reunion','videollamada','nota') then
    raise exception 'Tipo de contacto no válido.';
  end if;
  if p_fecha is null then raise exception 'Elige la fecha.'; end if;
  if p_contacto_id is not null and not exists
     (select 1 from public.crm_contactos where id = p_contacto_id and empresa_id = p_empresa_id) then
    raise exception 'Ese contacto no es de esta empresa.';
  end if;

  insert into public.crm_actividades (empresa_id, contacto_id, tipo, fecha, nota, usuario_id)
  values (p_empresa_id, p_contacto_id, p_tipo, p_fecha, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
  returning * into v_row;
  update public.crm_empresas set actualizado_en = now() where id = p_empresa_id;
  return v_row;
end; $$;

-- Crear un recordatorio de "volver a contactar".
create or replace function public.crm_crear_seguimiento(
  p_empresa_id uuid,
  p_fecha date,
  p_nota text default null,
  p_asignado_a uuid default null
) returns public.crm_seguimientos
language plpgsql security definer set search_path = public as $$
declare v_row public.crm_seguimientos;
begin
  if not public.tiene_permiso('crm.usar') then
    raise exception 'No tienes permiso para usar el CRM.';
  end if;
  if p_fecha is null then raise exception 'Elige la fecha.'; end if;
  if not exists (select 1 from public.crm_empresas where id = p_empresa_id and eliminada_en is null) then
    raise exception 'La empresa no existe.';
  end if;

  insert into public.crm_seguimientos (empresa_id, fecha, nota, asignado_a, creado_por)
  values (p_empresa_id, p_fecha, nullif(btrim(coalesce(p_nota, '')), ''),
          coalesce(p_asignado_a, (select responsable_id from public.crm_empresas where id = p_empresa_id), auth.uid()),
          auth.uid())
  returning * into v_row;
  return v_row;
end; $$;

-- Marcar un seguimiento como hecho (o regresarlo a pendiente con p_completado = false).
create or replace function public.crm_completar_seguimiento(p_id uuid, p_completado boolean default true)
returns public.crm_seguimientos
language plpgsql security definer set search_path = public as $$
declare v_row public.crm_seguimientos;
begin
  if not public.tiene_permiso('crm.usar') then
    raise exception 'No tienes permiso para usar el CRM.';
  end if;
  update public.crm_seguimientos
     set completado_en = case when coalesce(p_completado, true) then coalesce(completado_en, now()) else null end
   where id = p_id
  returning * into v_row;
  if not found then raise exception 'El seguimiento no existe.'; end if;
  return v_row;
end; $$;

-- ---------------------------------------------------------------------
-- 6) Importación del Excel (solo crm.importar). Todo o nada.
--    p_filas = arreglo JSON con las columnas del CSV:
--      empresa, ubicacion, segmento, estatus, contacto_nombre, contacto_puesto,
--      telefono, correo, actividad_fecha, actividad_tipo, actividad_nota,
--      seguimiento_fecha, seguimiento_nota
--    · Agrupa por nombre normalizado. Si la empresa YA existe en el CRM se le
--      agregan los contactos/actividades/seguimientos en vez de duplicarla.
--    · Contactos: no se repiten (mismo correo, o mismo nombre si no hay correo).
--    · Actividades y seguimientos idénticos (misma fecha/tipo/nota) no se repiten,
--      así que correrlo dos veces con el mismo archivo no duplica.
--    · Valores no reconocidos de segmento → 'otro'; de estatus → 'nuevo';
--      de tipo de actividad → 'nota'. Fechas YYYY-MM-DD.
--    Regresa cuántos registros se crearon de cada cosa.
-- ---------------------------------------------------------------------
create or replace function public.crm_importar(p_filas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f jsonb;
  v_emp uuid;
  v_con uuid;
  v_norm text;
  v_nombre text; v_correo text; v_fecha date; v_tipo text; v_nota text; v_seg text; v_est text;
  n_emp int := 0; n_con int := 0; n_act int := 0; n_seg int := 0;
begin
  if not public.tiene_permiso('crm.importar') then
    raise exception 'No tienes permiso para importar prospectos.';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'El archivo no trae filas.';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_nombre := btrim(coalesce(f->>'empresa', ''));
    if v_nombre = '' then continue; end if;
    v_norm := public.crm_norm_empresa(v_nombre);

    -- Empresa
    select id into v_emp from public.crm_empresas
     where nombre_norm = v_norm and eliminada_en is null
     order by creado_en limit 1;
    if v_emp is null then
      v_seg := lower(btrim(coalesce(f->>'segmento', '')));
      if v_seg = '' then v_seg := null;
      elsif v_seg not in ('industrial','salud','escuela','corporativo','alimentos','transporte','otro') then v_seg := 'otro';
      end if;
      v_est := lower(btrim(coalesce(f->>'estatus', '')));
      if v_est not in ('nuevo','catalogo_enviado','en_conversacion','visita_reunion','cotizado','ganado','perdido','en_pausa') then
        v_est := 'nuevo';
      end if;
      insert into public.crm_empresas (nombre, ubicacion, segmento, estatus, responsable_id, creado_por, origen)
      values (v_nombre, nullif(btrim(coalesce(f->>'ubicacion', '')), ''), v_seg, v_est,
              auth.uid(), auth.uid(), 'Excel de prospectos')
      returning id into v_emp;
      n_emp := n_emp + 1;
    end if;

    -- Contacto
    v_con := null;
    v_correo := nullif(lower(btrim(coalesce(f->>'correo', ''))), '');
    if btrim(coalesce(f->>'contacto_nombre', '')) <> '' or v_correo is not null then
      select id into v_con from public.crm_contactos c
       where c.empresa_id = v_emp
         and ((v_correo is not null and c.correo = v_correo)
              or (v_correo is null and public.inv_norm(c.nombre) = public.inv_norm(f->>'contacto_nombre')))
       limit 1;
      if v_con is null then
        insert into public.crm_contactos (empresa_id, nombre, puesto, telefono, correo, es_principal)
        values (v_emp,
                coalesce(nullif(btrim(coalesce(f->>'contacto_nombre', '')), ''), v_correo),
                nullif(btrim(coalesce(f->>'contacto_puesto', '')), ''),
                nullif(btrim(coalesce(f->>'telefono', '')), ''),
                v_correo,
                not exists (select 1 from public.crm_contactos where empresa_id = v_emp and es_principal))
        returning id into v_con;
        n_con := n_con + 1;
      end if;
    end if;

    -- Actividad
    if btrim(coalesce(f->>'actividad_fecha', '')) <> '' then
      v_fecha := (f->>'actividad_fecha')::date;
      v_tipo := lower(btrim(coalesce(f->>'actividad_tipo', '')));
      if v_tipo not in ('llamada','correo','whatsapp','visita','reunion','videollamada','nota') then v_tipo := 'nota'; end if;
      v_nota := nullif(btrim(coalesce(f->>'actividad_nota', '')), '');
      if not exists (select 1 from public.crm_actividades
                      where empresa_id = v_emp and fecha = v_fecha and tipo = v_tipo
                        and nota is not distinct from v_nota) then
        insert into public.crm_actividades (empresa_id, contacto_id, tipo, fecha, nota, usuario_id)
        values (v_emp, v_con, v_tipo, v_fecha, v_nota, auth.uid());
        n_act := n_act + 1;
      end if;
    end if;

    -- Seguimiento
    if btrim(coalesce(f->>'seguimiento_fecha', '')) <> '' then
      v_fecha := (f->>'seguimiento_fecha')::date;
      v_nota := nullif(btrim(coalesce(f->>'seguimiento_nota', '')), '');
      if not exists (select 1 from public.crm_seguimientos
                      where empresa_id = v_emp and fecha = v_fecha and nota is not distinct from v_nota) then
        insert into public.crm_seguimientos (empresa_id, fecha, nota, asignado_a, creado_por)
        values (v_emp, v_fecha, v_nota, auth.uid(), auth.uid());
        n_seg := n_seg + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('empresas', n_emp, 'contactos', n_con, 'actividades', n_act, 'seguimientos', n_seg);
end; $$;

-- ---------------------------------------------------------------------
-- 7) Permisos de ejecución: nada para anon/public, todo para authenticated
--    (cada función revisa crm.usar / crm.importar por dentro).
-- ---------------------------------------------------------------------
revoke execute on function public.crm_empresas_parecidas(text, uuid) from public;
revoke execute on function public.crm_guardar_empresa(uuid, text, text, text, text, smallint, numeric, numeric, uuid) from public;
revoke execute on function public.crm_cambiar_estatus(uuid, text, text, date, text) from public;
revoke execute on function public.crm_eliminar_empresa(uuid) from public;
revoke execute on function public.crm_guardar_contacto(uuid, uuid, text, text, text, text, text, boolean) from public;
revoke execute on function public.crm_eliminar_contacto(uuid) from public;
revoke execute on function public.crm_registrar_actividad(uuid, text, date, text, uuid) from public;
revoke execute on function public.crm_crear_seguimiento(uuid, date, text, uuid) from public;
revoke execute on function public.crm_completar_seguimiento(uuid, boolean) from public;
revoke execute on function public.crm_importar(jsonb) from public;

grant execute on function public.crm_empresas_parecidas(text, uuid) to authenticated;
grant execute on function public.crm_guardar_empresa(uuid, text, text, text, text, smallint, numeric, numeric, uuid) to authenticated;
grant execute on function public.crm_cambiar_estatus(uuid, text, text, date, text) to authenticated;
grant execute on function public.crm_eliminar_empresa(uuid) to authenticated;
grant execute on function public.crm_guardar_contacto(uuid, uuid, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.crm_eliminar_contacto(uuid) to authenticated;
grant execute on function public.crm_registrar_actividad(uuid, text, date, text, uuid) to authenticated;
grant execute on function public.crm_crear_seguimiento(uuid, date, text, uuid) to authenticated;
grant execute on function public.crm_completar_seguimiento(uuid, boolean) to authenticated;
grant execute on function public.crm_importar(jsonb) to authenticated;
