-- Inventario: catalogo de insumos/instrumentos y pedidos.
-- Fecha: 2026-09-30
--
-- Alcance (decidido con la clinica):
--   - Solo catalogo y pedidos. NO lleva existencias, minimos ni movimientos.
--   - Sin proveedor ni precios (cambian seguido y no se conectan con nada).
--   - Sin relacion con pacientes/citas/cobros. Solo usuario (quien crea/genera).
--
-- Catalogo (inv_articulo): categoria Odontologia | Ortodoncia | Instrumento.
--   Cada variante es su propio articulo (Resina fluida A1, A2...; Arco 16x22 Acero Sup/Inf).
--   Eliminar = desactivar (activoA = 0) para que los pedidos viejos conserven su historial;
--   crear uno con el mismo nombre y categoria lo reactiva.
--
-- Pedido (inv_pedido): Borrador (se edita/borra) -> Generado (listo para enviarlo; se puede
--   editar si falto algo y sigue Generado).
--   El detalle guarda una copia del nombre/categoria del articulo: si despues se renombra
--   o desactiva el articulo, el pedido ya hecho no cambia. idArticulo NULL = renglon libre.
--
-- Orden al desplegar: primero este SQL, despues el backend.

CREATE TABLE IF NOT EXISTS inv_articulo (
  idArticulo INT NOT NULL AUTO_INCREMENT,
  categoriaA ENUM('Odontologia','Ortodoncia','Instrumento') NOT NULL,
  nombreA VARCHAR(150) NOT NULL,
  unidadA VARCHAR(30) NULL,
  activoA TINYINT(1) NOT NULL DEFAULT 1,
  creadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizadoEn DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idArticulo),
  UNIQUE KEY uq_inv_articulo_categoria_nombre (categoriaA, nombreA)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inv_pedido (
  idPedido INT NOT NULL AUTO_INCREMENT,
  estadoP ENUM('Borrador','Generado') NOT NULL DEFAULT 'Borrador',
  notaP VARCHAR(500) NULL,
  creadoPorUsuarioId INT NULL,
  creadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizadoEn DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  generadoPorUsuarioId INT NULL,
  generadoEn DATETIME NULL,
  PRIMARY KEY (idPedido),
  KEY idx_inv_pedido_estado_creado (estadoP, creadoEn),
  CONSTRAINT fk_inv_pedido_creado_por
    FOREIGN KEY (creadoPorUsuarioId) REFERENCES usuario(idUsuario),
  CONSTRAINT fk_inv_pedido_generado_por
    FOREIGN KEY (generadoPorUsuarioId) REFERENCES usuario(idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inv_pedido_detalle (
  idDetalle INT NOT NULL AUTO_INCREMENT,
  idPedido INT NOT NULL,
  idArticulo INT NULL,
  categoriaD VARCHAR(20) NULL,
  descripcionD VARCHAR(150) NOT NULL,
  cantidadD INT NOT NULL,
  unidadD VARCHAR(30) NULL,
  notaD VARCHAR(200) NULL,
  ordenD INT NOT NULL DEFAULT 0,
  PRIMARY KEY (idDetalle),
  KEY idx_inv_detalle_pedido (idPedido, ordenD),
  KEY idx_inv_detalle_articulo (idArticulo),
  CONSTRAINT fk_inv_detalle_pedido
    FOREIGN KEY (idPedido) REFERENCES inv_pedido(idPedido) ON DELETE CASCADE,
  CONSTRAINT fk_inv_detalle_articulo
    FOREIGN KEY (idArticulo) REFERENCES inv_articulo(idArticulo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Catalogo inicial (hoja de pedido manual de la clinica). Se puede editar desde la vista.
INSERT IGNORE INTO inv_articulo (categoriaA, nombreA, unidadA) VALUES
  ('Odontologia', 'Anestesico 2%', 'Caja'),
  ('Odontologia', 'Agujas cortas', 'Caja'),
  ('Odontologia', 'Acido', 'Bolsa'),
  ('Odontologia', 'Adhesivo', 'Unidad'),
  ('Odontologia', 'Resina fluida A1', 'Unidad'),
  ('Odontologia', 'Resina fluida A2', 'Unidad'),
  ('Odontologia', 'Resina fluida A3', 'Unidad'),
  ('Odontologia', 'Brochas para profilaxis', 'Unidad'),
  ('Odontologia', 'Eyectores', 'Bolsa'),
  ('Ortodoncia', 'Laminas para guardas 0.60', 'Unidad'),
  ('Ortodoncia', 'Laminas para guardas 0.40', 'Unidad'),
  ('Ortodoncia', 'Orthocem', 'Unidad'),
  ('Ortodoncia', 'Ligas negras', 'Unidad'),
  ('Ortodoncia', 'Ligas azul oscuro', 'Unidad'),
  ('Ortodoncia', 'Ligas aqua', 'Unidad'),
  ('Ortodoncia', 'Ligas morado', 'Unidad'),
  ('Ortodoncia', 'Ligas gris', 'Unidad'),
  ('Ortodoncia', 'Ligas rojo', 'Unidad'),
  ('Ortodoncia', 'Arco 12 Thermo Sup', 'Unidad'),
  ('Ortodoncia', 'Arco 12 Thermo Inf', 'Unidad'),
  ('Ortodoncia', 'Arco 16x22 Acero Sup', 'Unidad'),
  ('Ortodoncia', 'Arco 16x22 Acero Inf', 'Unidad'),
  ('Ortodoncia', 'Arco 16x22 Thermo Sup', 'Unidad'),
  ('Ortodoncia', 'Arco 16x22 Thermo Inf', 'Unidad');

DROP PROCEDURE IF EXISTS `sp_inv_articulo_listar`;
DROP PROCEDURE IF EXISTS `sp_inv_articulo_crear`;
DROP PROCEDURE IF EXISTS `sp_inv_articulo_actualizar`;
DROP PROCEDURE IF EXISTS `sp_inv_articulo_eliminar`;
DROP PROCEDURE IF EXISTS `sp_inv_pedido_listar`;
DROP PROCEDURE IF EXISTS `sp_inv_pedido_detalle_listar`;
DROP PROCEDURE IF EXISTS `sp_inv_pedido_guardar`;
DROP PROCEDURE IF EXISTS `sp_inv_pedido_detalle_limpiar`;
DROP PROCEDURE IF EXISTS `sp_inv_pedido_detalle_agregar`;
DROP PROCEDURE IF EXISTS `sp_inv_pedido_generar`;
DROP PROCEDURE IF EXISTS `sp_inv_pedido_eliminar`;

DELIMITER $$

CREATE PROCEDURE `sp_inv_articulo_listar`()
BEGIN
  SELECT
    a.idArticulo,
    a.categoriaA,
    a.nombreA,
    a.unidadA
  FROM inv_articulo a
  WHERE a.activoA = 1
  ORDER BY FIELD(a.categoriaA, 'Odontologia', 'Ortodoncia', 'Instrumento'), a.nombreA;
END $$

-- Si ya existe (misma categoria y nombre) inactivo, lo reactiva. Si esta activo: error 45000.
CREATE PROCEDURE `sp_inv_articulo_crear`(
  IN p_categoriaA VARCHAR(20),
  IN p_nombreA VARCHAR(150),
  IN p_unidadA VARCHAR(30)
)
BEGIN
  DECLARE v_id INT DEFAULT NULL;
  DECLARE v_activo TINYINT DEFAULT NULL;

  SELECT idArticulo, activoA INTO v_id, v_activo
  FROM inv_articulo
  WHERE categoriaA = p_categoriaA AND nombreA = TRIM(p_nombreA)
  LIMIT 1;

  IF v_id IS NOT NULL AND v_activo = 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ya existe un articulo con ese nombre en la categoria';
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE inv_articulo
    SET activoA = 1, unidadA = NULLIF(TRIM(p_unidadA), '')
    WHERE idArticulo = v_id;
  ELSE
    INSERT INTO inv_articulo (categoriaA, nombreA, unidadA)
    VALUES (p_categoriaA, TRIM(p_nombreA), NULLIF(TRIM(p_unidadA), ''));
    SET v_id = LAST_INSERT_ID();
  END IF;

  SELECT v_id AS idArticulo;
END $$

CREATE PROCEDURE `sp_inv_articulo_actualizar`(
  IN p_idArticulo INT,
  IN p_categoriaA VARCHAR(20),
  IN p_nombreA VARCHAR(150),
  IN p_unidadA VARCHAR(30)
)
BEGIN
  IF EXISTS (
    SELECT 1 FROM inv_articulo
    WHERE categoriaA = p_categoriaA AND nombreA = TRIM(p_nombreA) AND idArticulo <> p_idArticulo
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ya existe un articulo con ese nombre en la categoria';
  END IF;

  UPDATE inv_articulo
  SET categoriaA = p_categoriaA,
      nombreA = TRIM(p_nombreA),
      unidadA = NULLIF(TRIM(p_unidadA), '')
  WHERE idArticulo = p_idArticulo AND activoA = 1;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$

CREATE PROCEDURE `sp_inv_articulo_eliminar`(
  IN p_idArticulo INT
)
BEGIN
  UPDATE inv_articulo SET activoA = 0
  WHERE idArticulo = p_idArticulo AND activoA = 1;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$

CREATE PROCEDURE `sp_inv_pedido_listar`()
BEGIN
  SELECT
    p.idPedido,
    p.estadoP,
    p.notaP,
    DATE_FORMAT(p.creadoEn, '%Y-%m-%d %H:%i') AS creadoEn,
    DATE_FORMAT(p.generadoEn, '%Y-%m-%d %H:%i') AS generadoEn,
    uc.NombreU AS creadoPor,
    ug.NombreU AS generadoPor,
    (SELECT COUNT(*) FROM inv_pedido_detalle d WHERE d.idPedido = p.idPedido) AS totalRenglones
  FROM inv_pedido p
  LEFT JOIN usuario uc ON uc.idUsuario = p.creadoPorUsuarioId
  LEFT JOIN usuario ug ON ug.idUsuario = p.generadoPorUsuarioId
  ORDER BY (p.estadoP = 'Borrador') DESC, p.creadoEn DESC, p.idPedido DESC;
END $$

CREATE PROCEDURE `sp_inv_pedido_detalle_listar`(
  IN p_idPedido INT
)
BEGIN
  SELECT
    d.idDetalle,
    d.idPedido,
    d.idArticulo,
    d.categoriaD,
    d.descripcionD,
    d.cantidadD,
    d.unidadD,
    d.notaD,
    d.ordenD
  FROM inv_pedido_detalle d
  WHERE d.idPedido = p_idPedido
  ORDER BY d.ordenD, d.idDetalle;
END $$

-- p_idPedido = 0 crea un borrador nuevo. Un pedido Generado tambien se puede editar (sigue Generado).
CREATE PROCEDURE `sp_inv_pedido_guardar`(
  IN p_idPedido INT,
  IN p_notaP VARCHAR(500),
  IN p_usuarioId INT
)
BEGIN
  DECLARE v_estado VARCHAR(20) DEFAULT NULL;

  IF p_idPedido IS NULL OR p_idPedido = 0 THEN
    INSERT INTO inv_pedido (estadoP, notaP, creadoPorUsuarioId)
    VALUES ('Borrador', NULLIF(TRIM(p_notaP), ''), p_usuarioId);
    SELECT LAST_INSERT_ID() AS idPedido;
  ELSE
    SELECT estadoP INTO v_estado FROM inv_pedido WHERE idPedido = p_idPedido FOR UPDATE;
    IF v_estado IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pedido no encontrado';
    END IF;
    UPDATE inv_pedido SET notaP = NULLIF(TRIM(p_notaP), '') WHERE idPedido = p_idPedido;
    SELECT p_idPedido AS idPedido;
  END IF;
END $$

CREATE PROCEDURE `sp_inv_pedido_detalle_limpiar`(
  IN p_idPedido INT
)
BEGIN
  DELETE FROM inv_pedido_detalle WHERE idPedido = p_idPedido;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$

CREATE PROCEDURE `sp_inv_pedido_detalle_agregar`(
  IN p_idPedido INT,
  IN p_idArticulo INT,
  IN p_categoriaD VARCHAR(20),
  IN p_descripcionD VARCHAR(150),
  IN p_cantidadD INT,
  IN p_unidadD VARCHAR(30),
  IN p_notaD VARCHAR(200),
  IN p_ordenD INT
)
BEGIN
  INSERT INTO inv_pedido_detalle
    (idPedido, idArticulo, categoriaD, descripcionD, cantidadD, unidadD, notaD, ordenD)
  VALUES
    (p_idPedido, NULLIF(p_idArticulo, 0), NULLIF(TRIM(p_categoriaD), ''), TRIM(p_descripcionD),
     p_cantidadD, NULLIF(TRIM(p_unidadD), ''), NULLIF(TRIM(p_notaD), ''), p_ordenD);
  SELECT LAST_INSERT_ID() AS idDetalle;
END $$

CREATE PROCEDURE `sp_inv_pedido_generar`(
  IN p_idPedido INT,
  IN p_usuarioId INT
)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM inv_pedido_detalle WHERE idPedido = p_idPedido) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El pedido no tiene articulos';
  END IF;

  UPDATE inv_pedido
  SET estadoP = 'Generado',
      generadoPorUsuarioId = p_usuarioId,
      generadoEn = NOW()
  WHERE idPedido = p_idPedido AND estadoP = 'Borrador';
  SELECT ROW_COUNT() AS filasAfectadas;
END $$

CREATE PROCEDURE `sp_inv_pedido_eliminar`(
  IN p_idPedido INT
)
BEGIN
  DELETE FROM inv_pedido WHERE idPedido = p_idPedido;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$

DELIMITER ;
