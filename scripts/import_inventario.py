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

En vez de generar 465 bloques de SQL repetidos (~360KB, incómodo de pegar),
genera UNA sola llamada a la función public.inv_importar_inicial(jsonb)
(V90) con los datos en un arreglo JSON compacto — la función hace el mismo
trabajo idempotente del lado del servidor (crea sección/artículo si no
existen; el movimiento de conteo inicial solo se inserta si todavía no hay
ninguno con ese motivo, así que correrlo dos veces no duplica).

Antes de escribir el .sql, imprime el resumen por sección (artículos y
piezas) para revisar contra el Google Sheet.

Uso:  python3 scripts/import_inventario.py
"""
import csv
import json
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

    # --- SQL: una sola llamada a inv_importar_inicial(jsonb) (V90) ---
    filas = [
        {"seccion": seccion, "prenda": prenda, "talla": talla, "piezas": piezas}
        for (seccion, prenda, talla), piezas in articulos.items()
    ]
    payload = json.dumps(filas, ensure_ascii=False)
    sql = (
        "-- Generado por scripts/import_inventario.py — NO se aplicó solo. Pégalo\n"
        "-- completo en el SQL Editor de Supabase una sola vez. Llama a\n"
        "-- inv_importar_inicial (V90), que es idempotente del lado del servidor:\n"
        "-- correrlo dos veces no duplica secciones/artículos ni el conteo inicial.\n"
        "select public.inv_importar_inicial(\n"
        f"  {q(payload)}::jsonb\n"
        ");\n"
    )

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(sql)
    print()
    print(f"SQL escrito en {OUT} ({len(sql)} caracteres, {len(filas)} filas). Revisa el resumen de arriba antes de aplicarlo.")


if __name__ == "__main__":
    main()
