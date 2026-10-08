-- Datos (no esquema): consumos de corte que mandó el hermano de Alfredo el
-- 2026-10-07. Todos en metros, como promedio general (sin tallas). No pisa
-- nada: una prenda que ya tenga promedio general se salta.
insert into public.consumos_prenda (prenda, tallas, consumo, unidad)
select v.prenda, null, v.consumo, 'metro'
from (values
  ('Camisa big bang manga larga', 1.50),
  ('Camisa big bang manga corta', 1.45),
  ('Blusa big bang manga larga', 1.30),
  ('Blusa big bang manga corta', 1.15),
  ('Camisa vigilante manga larga', 1.50),
  ('Camisa mezclilla 7oz', 1.40),
  ('Camisola mezclilla 14oz', 1.40),
  ('Camisa de trabajo', 1.40),
  ('Pantalón de vestir caballero/dama', 1.20),
  ('Pantalón escolar', 1.00),
  ('Chamarra diablo adulto', 1.40),
  ('Chamarra cazadora (varias telas)', 1.30),
  ('Bolsa para chamarra', 0.30),
  ('Pantalonera beis adulto', 1.20),
  ('Pantalonera beis niño', 1.00),
  ('Playera sublimada adulto', 0.90),
  ('Playera sublimada dama', 0.75),
  ('Playera sublimada niño', 0.65),
  ('Overol', 2.80),
  ('Casaca', 0.40),
  ('Falda short Tricio', 0.70),
  ('Falda short Tricio (short)', 0.25),
  ('Falda short Domus', 0.66),
  ('Falda short Domus (short)', 0.25),
  ('Falda short Beckmann', 0.68),
  ('Falda short Beckmann (short)', 0.25),
  ('Short adulto', 0.60),
  ('Short niño', 0.45),
  ('Bata ATR', 1.30),
  ('Bata manga larga', 1.60),
  ('Chaleco brigadista', 0.60)
) as v(prenda, consumo)
where not exists (
  select 1 from public.consumos_prenda c
  where c.prenda_normalizada = lower(trim(v.prenda)) and c.tallas is null
);

select count(*) as consumos_cargados from public.consumos_prenda;
