#!/usr/bin/env python3
"""
V89 — Inventario: importa el conteo inicial del CSV a SQL.

Lee scripts/data/inventario-tercer-piso.csv (ignorado por git) y GENERA
scripts/data/import_inventario.sql, que se pega en el SQL Editor de Supabase.
No se conecta a la base ni necesita llaves.

Columnas esperadas (encabezado en la fila 2, la 1 puede venir vacía):
  Prenda, Empresa, Talla, Existencia, [Movimientos, Fecha, Inventario...]
"Empresa" = sección. Solo se usan Prenda/Empresa/Talla/Existencia.

Limpieza:
  - Ignora renglones que repitan el encabezado o vengan vacíos.
  - Quita el prefijo "T." de la talla.
  - "Quirurjico"/"Quirurjio" -> "Quirúrgico" (en Empresa y en Prenda).
  - "N/A" y "Sin Talla" se unen en la talla canónica "Sin talla".
  - Cada talla del CSV debe existir ya en el catálogo inv_tallas (V89 la
    siembra con las 37 tallas conocidas) — si aparece una talla nueva que no
    está ahí, el script se detiene y la reporta (no adivina un orden).

Cada existencia inicial entra como UN movimiento tipo='conteo', motivo
'Conteo inicial', en la ubicación "Bodega (tercer piso)".

IDEMPOTENTE: usa nombres únicos (sección/prenda+talla) con
`on conflict do nothing` para el catálogo; los movimientos de conteo inicial
llevan una nota fija que el script puede usar para no duplicar si se corre
dos veces sobre una base que ya tiene esos artículos (se detecta antes de
generar el INSERT de movimientos, avisando en el resumen).

Antes de escribir el .sql, imprime el resumen por sección (artículos y
piezas) para revisar contra el Google Sheet.

Uso:  python3 scripts/import_inventario.py
"""
import csv
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "scripts", "data", "inventario-tercer-piso.csv")
OUT = os.path.join(ROOT, "scripts", "data", "import_inventario.sql")

QUIRURJICO_RE = re.compile(r"Quirurj(?:ico|io)", re.IGNORECASE)


def q(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def fix_quirurjico(s):
    return QUIRURJICO_RE.sub("Quirúrgico", s)


def norm_talla(raw):
    t = raw.strip()
    if t.startswith("T."):
        t = t[2:]
    t = t.strip()
    if t in ("N/A", "Sin Talla"):
        return "Sin talla"
    return t


def main():
    if not os.path.exists(CSV_PATH):
        sys.exit(f"No encontré {CSV_PATH}")

    with open(CSV_PATH, encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))

    # La fila 1 puede venir vacía (artefacto de Google Sheets); el encabezado
    # real es la primera fila no vacía que empieza con "Prenda".
    hdr_idx = next(i for i, r in enumerate(rows) if r and r[0].strip() == "Prenda")
    hdr = rows[hdr_idx]
    data_rows = rows[hdr_idx + 1:]

    articulos = {}  # (seccion, prenda, talla) -> piezas
    secciones_orden = []
    seen_secciones = set()
    skipped_header_repeats = 0
    skipped_blank = 0

    for r in data_rows:
        if not r or not r[0].strip():
            skipped_blank += 1
            continue
        if r[0].strip() == hdr[0].strip():
            skipped_header_repeats += 1
            continue
        prenda_raw, seccion_raw, talla_raw, existencia_raw = r[0], r[1], r[2], r[3]
        prenda = fix_quirurjico(prenda_raw.strip())
        seccion = fix_quirurjico(seccion_raw.strip())
        talla = norm_talla(talla_raw)
        existencia = int(existencia_raw.strip())

        if seccion not in seen_secciones:
            seen_secciones.add(seccion)
            secciones_orden.append(seccion)

        key = (seccion, prenda, talla)
        articulos[key] = articulos.get(key, 0) + existencia

    # --- Resumen por sección (piezas y artículos) ---
    por_seccion = {}
    for (seccion, prenda, talla), piezas in articulos.items():
        s = por_seccion.setdefault(seccion, {"articulos": 0, "piezas": 0})
        s["articulos"] += 1
        s["piezas"] += piezas

    print(f"Filas leídas: {len(data_rows)} (vacías ignoradas: {skipped_blank}, encabezado repetido: {skipped_header_repeats})")
    print(f"Artículos distintos (sección+prenda+talla): {len(articulos)}")
    print(f"Secciones: {len(secciones_orden)}")
    print()
    print(f"{'Sección':30s} {'Artículos':>10s} {'Piezas':>8s}")
    total_art = total_piezas = 0
    for seccion in secciones_orden:
        s = por_seccion[seccion]
        print(f"{seccion:30s} {s['articulos']:>10d} {s['piezas']:>8d}")
        total_art += s["articulos"]
        total_piezas += s["piezas"]
    print("-" * 50)
    print(f"{'TOTAL':30s} {total_art:>10d} {total_piezas:>8d}")

    tallas_usadas = sorted({talla for (_, _, talla) in articulos})
    print()
    print(f"Tallas distintas usadas ({len(tallas_usadas)}): {', '.join(tallas_usadas)}")

    # --- SQL ---
    lines = []
    lines.append("-- Generado por scripts/import_inventario.py — NO se aplicó solo. Pégalo")
    lines.append("-- completo en el SQL Editor de Supabase una sola vez (es idempotente: se")
    lines.append("-- puede volver a correr sin duplicar catálogo; los movimientos de conteo")
    lines.append("-- inicial sí se duplicarían si se corre dos veces con artículos ya cargados")
    lines.append("-- — por eso el resumen de abajo avisa si ya hay artículos.")
    lines.append("")
    lines.append("do $$")
    lines.append("declare v_seccion_id uuid; v_talla_id uuid; v_articulo_id uuid; v_motivo_id uuid; v_ubicacion_id uuid;")
    lines.append("        v_ya_importado boolean;")
    lines.append("begin")
    lines.append("  select id into v_motivo_id from public.inv_motivos where nombre = 'Conteo inicial' and sistema;")
    lines.append("  select id into v_ubicacion_id from public.inv_ubicaciones where nombre = 'Bodega (tercer piso)';")
    lines.append("  select exists (select 1 from public.inv_movimientos where motivo_id = v_motivo_id) into v_ya_importado;")
    lines.append("  if v_ya_importado then")
    lines.append("    raise notice 'Ya existen movimientos de Conteo inicial — no se insertan de nuevo (corre esto en una base limpia, o borra esos movimientos primero).';")
    lines.append("  end if;")
    lines.append("")

    for seccion in secciones_orden:
        lines.append(f"  -- Sección: {seccion}")
        lines.append(f"  insert into public.inv_secciones (nombre) values ({q(seccion)}) on conflict do nothing;")
        lines.append(f"  select id into v_seccion_id from public.inv_secciones where lower(btrim(nombre)) = lower(btrim({q(seccion)}));")
        lines.append("")
        for (s, prenda, talla), piezas in articulos.items():
            if s != seccion:
                continue
            lines.append(f"  select id into v_talla_id from public.inv_tallas where lower(btrim(nombre)) = lower(btrim({q(talla)}));")
            lines.append(f"  if v_talla_id is null then raise exception 'Talla no encontrada en el catálogo: %', {q(talla)}; end if;")
            lines.append(
                f"  insert into public.inv_articulos (seccion_id, prenda, talla_id) values (v_seccion_id, {q(prenda)}, v_talla_id) "
                f"on conflict do nothing;"
            )
            lines.append(
                f"  select id into v_articulo_id from public.inv_articulos where seccion_id = v_seccion_id "
                f"and lower(btrim(prenda)) = lower(btrim({q(prenda)})) and talla_id = v_talla_id;"
            )
            lines.append(
                f"  if not v_ya_importado then insert into public.inv_movimientos "
                f"(articulo_id, ubicacion_id, tipo, cantidad, motivo_id, nota) values "
                f"(v_articulo_id, v_ubicacion_id, 'conteo', {piezas}, v_motivo_id, 'Importación inicial desde Google Sheet'); end if;"
            )
            lines.append("")

    lines.append("end $$;")
    sql = "\n".join(lines) + "\n"

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(sql)
    print()
    print(f"SQL escrito en {OUT} ({len(sql)} caracteres). Revisa el resumen de arriba antes de aplicarlo.")


if __name__ == "__main__":
    main()
