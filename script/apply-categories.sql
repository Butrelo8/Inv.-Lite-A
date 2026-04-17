-- Apply categories from inventory-export-updated.csv
-- Run this in your PostgreSQL client (DBeaver, psql) after placing the CSV logic here.
-- Each UPDATE matches by code + name + serial_number to avoid duplicating rows.

-- Drones
UPDATE inventory_items SET category = 'Drones' WHERE code = 'DD00001' AND name = 'AIR 3S' AND (serial_number IS NULL OR serial_number = '');
UPDATE inventory_items SET category = 'Drones' WHERE code = 'DD00001' AND name = 'Dron DJI MINI 4 PRO' AND serial_number = '41581F 6Z9C2 3A800 3AABF';
UPDATE inventory_items SET category = 'Drones' WHERE code = 'DD00001' AND name = 'Control DJI MINI' AND serial_number = 'GUZBLA4O2103ED';

-- Water Sampling
UPDATE inventory_items SET category = 'Water Sampling' WHERE code = 'BH00001' AND name = 'Kit de botella de agua acrílica horizontal Wildco Beta';

-- Office Equipment
UPDATE inventory_items SET category = 'Office Equipment' WHERE code = 'ME00001' AND name = 'Escáner de Documentos Dúplex a Color Epson DS-530 II';
UPDATE inventory_items SET category = 'Office Equipment' WHERE code = 'IR0001' AND (name LIKE '%Epson Modelo L3560%' OR name LIKE '%Epson Modelo L3260%');
UPDATE inventory_items SET category = 'Office Equipment' WHERE code = 'PL00001' AND name LIKE '%Proyector LCD Epson%';

-- Scientific Monitoring (HOBO loggers)
UPDATE inventory_items SET category = 'Scientific Monitoring' WHERE code = 'ML00001' AND name LIKE '%HOBO UA-002-64%';
UPDATE inventory_items SET category = 'Scientific Monitoring' WHERE code = 'ML00001' AND name LIKE '%Hobo MX Onset MX2201%';
UPDATE inventory_items SET category = 'Scientific Monitoring' WHERE code = 'ML00001' AND name LIKE '%Estación Base USB Óptica HOBO%';

-- Scientific Monitoring (meters, instruments)
UPDATE inventory_items SET category = 'Scientific Monitoring' WHERE code = 'DD00001' AND name LIKE '%Decibelímetro%';
UPDATE inventory_items SET category = 'Scientific Monitoring' WHERE code = 'DD00001' AND name LIKE '%oxígeno disuelto%';
UPDATE inventory_items SET category = 'Scientific Monitoring' WHERE code = 'MD00001' AND (name LIKE '%Luxometro%' OR name LIKE '%Luxómetro%' OR name LIKE '%anemómetro%' OR name LIKE '%Anemómetro%');
UPDATE inventory_items SET category = 'Scientific Monitoring' WHERE code = 'MD00001' AND (name LIKE '%Salinómetro%' OR name LIKE '%pH%' OR name LIKE '%Medidor EC%' OR name LIKE '%Medidor Tds%');
UPDATE inventory_items SET category = 'Scientific Monitoring' WHERE code = 'SP00001' AND name LIKE '%Sonda de profundidad%';
UPDATE inventory_items SET category = 'Scientific Monitoring' WHERE code = 'TM00001' AND name LIKE '%Turbidímetro%';
UPDATE inventory_items SET category = 'Scientific Monitoring' WHERE code = 'AM00001' AND name LIKE '%Anemómetro%';
UPDATE inventory_items SET category = 'Scientific Monitoring' WHERE code = 'LM00001' AND name LIKE '%Luxómetro%';
UPDATE inventory_items SET category = 'Scientific Monitoring' WHERE code = 'RM00001' AND name LIKE '%Refractrometro%';

-- Electronics
UPDATE inventory_items SET category = 'Electronics' WHERE code = 'GP00001' AND name LIKE '%Garmin%';
UPDATE inventory_items SET category = 'Electronics' WHERE code = 'CP00001' AND (name LIKE '%Macbook Pro%' OR name LIKE '%Computadora portátil HP%');
UPDATE inventory_items SET category = 'Electronics' WHERE code = 'DDE00001' AND name LIKE '%Disco Duro Externo%';

-- Cameras
UPDATE inventory_items SET category = 'Cameras' WHERE code = 'CF00001';
UPDATE inventory_items SET category = 'Cameras' WHERE code = 'BT00001';
UPDATE inventory_items SET category = 'Cameras' WHERE code = 'MC00001';
UPDATE inventory_items SET category = 'Cameras' WHERE code = 'FC00001';
UPDATE inventory_items SET category = 'Cameras' WHERE code = 'EC00001' AND name LIKE '%Estabilizador%';
UPDATE inventory_items SET category = 'Cameras' WHERE code = 'AM00001' AND name LIKE '%Adaptador de montaje%';
UPDATE inventory_items SET category = 'Cameras' WHERE code = 'SD00001' AND name LIKE '%Memoria SD%';
UPDATE inventory_items SET category = 'Cameras' WHERE code = 'LC0001';

-- Safety Equipment
UPDATE inventory_items SET category = 'Safety Equipment' WHERE code = 'CU00001' AND name LIKE '%seguridad industrial%';
UPDATE inventory_items SET category = 'Safety Equipment' WHERE code = 'CC00001' AND name LIKE '%Casco de ingeniero%';

-- Lighting
UPDATE inventory_items SET category = 'Lighting' WHERE code = 'EP00001' AND name LIKE '%Lámpara spot%';

-- Diving Equipment
UPDATE inventory_items SET category = 'Diving Equipment' WHERE code = 'BC00001';
UPDATE inventory_items SET category = 'Diving Equipment' WHERE code = 'BB0001';
UPDATE inventory_items SET category = 'Diving Equipment' WHERE code = 'CB00001';
UPDATE inventory_items SET category = 'Diving Equipment' WHERE code = 'PU0001' AND name = 'Pulpo';
UPDATE inventory_items SET category = 'Diving Equipment' WHERE code = 'R00001' AND name = 'Regulador';
UPDATE inventory_items SET category = 'Diving Equipment' WHERE code = 'VM0001' AND name = 'Varometro';

-- Communication
UPDATE inventory_items SET category = 'Communication' WHERE code = 'RB0001';

-- Field Tools
UPDATE inventory_items SET category = 'Field Tools' WHERE code = 'CM00001' AND name LIKE '%Cinta métrica%';
