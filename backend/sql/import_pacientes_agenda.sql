-- Importacion masiva de pacientes + citas en agenda
-- Uso:
-- 1) Edita solo el bloque INSERT INTO tmp_citas_carga con tus filas
-- 2) Ejecuta todo el script
-- 3) Verifica al final el SELECT de control

START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS tmp_citas_carga;
CREATE TEMPORARY TABLE tmp_citas_carga (
  nombre       VARCHAR(100) NOT NULL,
  telefono     VARCHAR(50)  NULL,
  fecha_cita   DATE         NOT NULL,
  hora_cita    VARCHAR(20)  NOT NULL,
  estado       VARCHAR(30)  NOT NULL DEFAULT 'Confirmado',
  comentario   VARCHAR(255) NULL,
  procedimiento VARCHAR(200) NULL
);

-- ==============================
-- PEGA AQUI TUS CITAS (varias filas)
-- ==============================
INSERT INTO tmp_citas_carga (
  nombre, telefono, fecha_cita, hora_cita, estado, comentario, procedimiento
) VALUES
  ('Juana Estela Hernandez Escobar', '7096 6260', '2026-05-03', '10:00 am', 'Confirmado', 'Rellenos', 'Rellenos'),
  ('Matilde Eneida Hernandez Escobar', '7081 1736', '2026-05-03', '10:00 am', 'Confirmado', 'Consulta', 'Consulta'),
  ('Paciente Demo 1', '7000 0001', '2026-05-03', '09:00 am', 'Confirmado', 'Control', 'Control'),
  ('Paciente Demo 2', '7000 0002', '2026-05-03', '11:00 am', 'Pendiente', 'Primera vez', 'Evaluacion');

-- 1) Inserta pacientes que no existan (por nombre + telefono)
INSERT INTO paciente (
  NombreP,
  telefonoP,
  fechaRegistroP,
  estadoP,
  recomendadoP,
  motivoConsultaP,
  tipoTratamientoP,
  ultimaVisitaP
)
SELECT
  t.nombre,
  t.telefono,
  CURDATE(),
  1,
  'Agenda',
  COALESCE(t.procedimiento, 'Consulta'),
  COALESCE(t.procedimiento, 'Consulta'),
  t.fecha_cita
FROM tmp_citas_carga t
LEFT JOIN paciente p
  ON p.NombreP = t.nombre
 AND COALESCE(p.telefonoP, '') = COALESCE(t.telefono, '')
WHERE p.idPaciente IS NULL;

-- 2) Inserta todas las citas en agenda
INSERT INTO agendapersona (
  nombreAP,
  horaAP,
  fechaAP,
  contactoAP,
  estadoAP,
  comentarioAP
)
SELECT
  t.nombre,
  t.hora_cita,
  t.fecha_cita,
  t.telefono,
  t.estado,
  t.comentario
FROM tmp_citas_carga t;

COMMIT;

-- 3) Verificacion rapida
SELECT
  a.idAgendaAP,
  a.nombreAP,
  a.fechaAP,
  a.horaAP,
  a.contactoAP,
  a.estadoAP,
  a.comentarioAP
FROM agendapersona a
WHERE a.fechaAP = '2026-05-03'
ORDER BY a.horaAP, a.nombreAP;
