-- Limpia TODA la base de datos de la clinica y reinicia llaves AUTO_INCREMENT.
-- IMPORTANTE: ejecutar solo despues de hacer un backup.
-- Borra tambien usuarios, roles, doctores, servicios, licencias y configuracion.
-- Despues de ejecutarlo tendras que crear usuarios/licencias/catalogos de nuevo.

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE paciente_seguimiento_contacto;
TRUNCATE TABLE odontograma;
TRUNCATE TABLE fotopaciente;
TRUNCATE TABLE detallecuenta;
TRUNCATE TABLE cuenta;
TRUNCATE TABLE descuento;
TRUNCATE TABLE citaspaciente;
TRUNCATE TABLE cola_paciente;
TRUNCATE TABLE agendapersona;
TRUNCATE TABLE paciente;

TRUNCATE TABLE seguridad_protocolo_config;
TRUNCATE TABLE usuario;
TRUNCATE TABLE doctor;
TRUNCATE TABLE servicio;
TRUNCATE TABLE rol;

TRUNCATE TABLE licencia_sesiones;
TRUNCATE TABLE licencias;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Base de datos limpiada y llaves reiniciadas' AS resultado;
