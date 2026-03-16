CREATE TABLE IF NOT EXISTS cola_paciente (
  idColaPaciente INT NOT NULL AUTO_INCREMENT,
  agendaId INT NULL,
  doctorId INT NULL,
  nombrePaciente VARCHAR(160) NOT NULL,
  tratamiento VARCHAR(255) NULL,
  horaAgenda TIME NULL,
  fechaAgenda DATE NULL,
  contacto VARCHAR(40) NULL,
  estado ENUM('En espera', 'Atendido') NOT NULL DEFAULT 'En espera',
  creadoPorUsuarioId INT NULL,
  creadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idColaPaciente),
  KEY idx_cola_fecha_estado (fechaAgenda, estado),
  KEY idx_cola_agenda_estado (agendaId, estado),
  KEY idx_cola_doctor_estado (doctorId, estado),
  KEY idx_cola_creado (creadoEn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
