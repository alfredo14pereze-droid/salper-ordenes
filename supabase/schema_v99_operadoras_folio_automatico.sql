-- =====================================================================
-- V99 — Operadoras: folio de empleado y número consecutivos automáticos
-- =====================================================================
-- Antes, folio_empleado ("EMP036") y numero_operadora se escribían a
-- mano al dar de alta a alguien (el placeholder "EMP036" del formulario
-- era solo un ejemplo de formato, no un valor calculado). Pedido
-- explícito del usuario: que al AGREGAR una persona nueva, ambos se
-- asignen solos — el siguiente consecutivo, no una sugerencia editable.
--
-- Patrón confirmado en los datos reales: folio_empleado = 'EMP' + el
-- numero_operadora con 3 dígitos (numero 1 -> "EMP001", 36 -> "EMP036").
-- numero_operadora nuevo = el máximo actual + 1 (no se rellenan los
-- huecos de números dados de baja — siempre avanza).
--
-- Solo aplica a ALTAS (p_id is null). Editar a alguien que ya existe
-- sigue permitiendo corregir folio/número a mano, por si hubo un error —
-- mismo comportamiento de siempre para ese caso.
-- =====================================================================
create or replace function public.prod_guardar_operadora(
  p_id uuid, p_folio_empleado text, p_numero integer, p_nombre text, p_puesto text,
  p_participa boolean, p_activo boolean
) returns public.prod_operadoras
language plpgsql security definer set search_path = public as $$
declare
  v_row public.prod_operadoras;
  v_numero integer;
  v_folio_empleado text;
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para editar operadoras.';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'El nombre es obligatorio.';
  end if;

  if p_id is null then
    -- Alta: folio y número siempre calculados, se ignora lo que llegue en
    -- p_folio_empleado/p_numero.
    select coalesce(max(numero_operadora), 0) + 1 into v_numero from public.prod_operadoras;
    v_folio_empleado := 'EMP' || lpad(v_numero::text, 3, '0');

    insert into public.prod_operadoras (folio_empleado, numero_operadora, nombre, puesto, participa_bonos, activo)
    values (v_folio_empleado, v_numero, btrim(p_nombre), nullif(btrim(coalesce(p_puesto, '')), ''),
            coalesce(p_participa, false), coalesce(p_activo, true))
    returning * into v_row;
  else
    -- Edición: mismo comportamiento de siempre (folio/número a mano, por si hay que corregir algo).
    if btrim(coalesce(p_folio_empleado, '')) = '' then
      raise exception 'El folio de empleado es obligatorio.';
    end if;
    if exists (select 1 from public.prod_operadoras o
               where o.folio_empleado = btrim(p_folio_empleado) and o.id is distinct from p_id) then
      raise exception 'Ya existe una persona con el folio de empleado %.', btrim(p_folio_empleado);
    end if;
    if p_numero is not null and exists (select 1 from public.prod_operadoras o
                                        where o.numero_operadora = p_numero and o.id is distinct from p_id) then
      raise exception 'El número de operadora % ya está asignado.', p_numero;
    end if;

    update public.prod_operadoras
       set folio_empleado = btrim(p_folio_empleado), numero_operadora = p_numero, nombre = btrim(p_nombre),
           puesto = nullif(btrim(coalesce(p_puesto, '')), ''), participa_bonos = coalesce(p_participa, participa_bonos),
           activo = coalesce(p_activo, activo), updated_at = now()
     where id = p_id
    returning * into v_row;
    if v_row.id is null then raise exception 'La operadora no existe.'; end if;
  end if;
  return v_row;
end; $$;
