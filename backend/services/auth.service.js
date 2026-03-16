const db = require("../config/db");
const bcrypt = require("bcrypt");   // 👈 ARRIBA

async function login(correo, password) {
    const [rows] = await db.query(
        "CALL sp_login_usuario(?)",
        [correo]
    );

    const usuario = rows[0][0];
    if (!usuario) return null;

    const passwordValida = await bcrypt.compare(
        password,
        usuario.passwordU
    );

    if (!passwordValida) return null;

    return {
        idUsuario: usuario.idUsuario,
        correo: usuario.correoU,
        nombre: usuario.NombreU,
        cargo: usuario.Cargo,
        idRol: usuario.idRol,
        rol: usuario.nombreR
    };
}

async function crearUsuario({ correo, passwordHash, nombre, cargo, idRol, idDoctor }) {
    const [rows] = await db.query(
        "CALL sp_usuario_crear(?, ?, ?, ?, ?, ?)",
        [
            correo,
            passwordHash,
            nombre,
            cargo,
            idRol,
            idDoctor ?? null
        ]
    );

    return rows?.[0]?.[0]?.idUsuario ?? null;
}

async function listarRolesRegistro() {
    const [rows] = await db.query(
        "SELECT idRol, nombreR FROM rol ORDER BY nombreR ASC"
    );

    return rows || [];
}

async function listarDoctoresRegistro() {
    const [rows] = await db.query("CALL sp_doctor_listar_select()");
    return rows?.[0] || [];
}

module.exports = {
    login,
    crearUsuario,
    listarRolesRegistro,
    listarDoctoresRegistro
};
