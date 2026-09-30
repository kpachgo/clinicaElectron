DROP PROCEDURE IF EXISTS `sp_inv_pedido_guardar`;
DELIMITER $$
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
DELIMITER ;
