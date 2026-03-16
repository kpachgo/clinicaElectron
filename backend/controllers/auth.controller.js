// backend/controllers/auth.controller.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const authService = require("../services/auth.service");
const { badRequest, serverError } = require("../utils/http");

function isHiddenRegisterEnabled() {
    const raw = String(process.env.AUTH_HIDDEN_REGISTER_ENABLED || "").trim().toLowerCase();
    return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

async function login(req, res) {
    try {
        const { correo, password } = req.body;

        if (!correo || !password) {
            return badRequest(res, "Correo y contrasena requeridos");
        }

        const usuario = await authService.login(correo, password);

        if (!usuario) {
            return res.status(401).json({
                ok: false,
                message: "Credenciales incorrectas"
            });
        }

        if (!process.env.JWT_SECRET) {
            return serverError(
                res,
                new Error("JWT_SECRET no definido"),
                "Configuracion de autenticacion invalida"
            );
        }

        const token = jwt.sign(
            {
                idUsuario: usuario.idUsuario,
                rol: usuario.rol
            },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );

        res.json({
            ok: true,
            token,
            usuario
        });

    } catch (error) {
        return serverError(res, error, "Error interno del servidor");
    }
}

async function registroOculto(req, res) {
    try {
        if (!isHiddenRegisterEnabled()) {
            return res.status(404).json({
                ok: false,
                message: "Ruta no disponible. Active AUTH_HIDDEN_REGISTER_ENABLED=true"
            });
        }

        const {
            correo,
            password,
            nombre,
            cargo,
            idRol,
            idDoctor
        } = req.body || {};

        if (!correo || !password || !nombre || !cargo || !idRol) {
            return badRequest(res, "Datos incompletos para registro");
        }

        const correoLimpio = String(correo).trim().toLowerCase();
        const nombreLimpio = String(nombre).trim();
        const cargoLimpio = String(cargo).trim();
        const idRolNum = Number(idRol);
        const idDoctorNum = idDoctor === "" || idDoctor == null
            ? null
            : Number(idDoctor);

        if (!correoLimpio || correoLimpio.length > 60) {
            return badRequest(res, "Correo invalido o demasiado largo");
        }

        if (!nombreLimpio || nombreLimpio.length > 60) {
            return badRequest(res, "Nombre invalido o demasiado largo");
        }

        if (!cargoLimpio || cargoLimpio.length > 20) {
            return badRequest(res, "Cargo invalido o demasiado largo");
        }

        if (!Number.isInteger(idRolNum) || idRolNum <= 0) {
            return badRequest(res, "idRol invalido");
        }

        if (idDoctorNum !== null && (!Number.isInteger(idDoctorNum) || idDoctorNum <= 0)) {
            return badRequest(res, "idDoctor invalido");
        }

        if (String(password).length < 6) {
            return badRequest(res, "La contrasena debe tener al menos 6 caracteres");
        }

        const passwordHash = await bcrypt.hash(String(password), 10);

        const idUsuario = await authService.crearUsuario({
            correo: correoLimpio,
            passwordHash,
            nombre: nombreLimpio,
            cargo: cargoLimpio,
            idRol: idRolNum,
            idDoctor: idDoctorNum
        });

        return res.status(201).json({
            ok: true,
            idUsuario
        });

    } catch (error) {
        if (error?.sqlState === "45000" && String(error?.message || "").includes("EL_CORREO_YA_EXISTE")) {
            return res.status(409).json({
                ok: false,
                message: "El correo ya existe"
            });
        }

        return serverError(res, error, "Error al crear usuario");
    }
}

async function registroCatalogos(req, res) {
    try {
        if (!isHiddenRegisterEnabled()) {
            return res.status(404).json({
                ok: false,
                message: "Ruta no disponible. Active AUTH_HIDDEN_REGISTER_ENABLED=true"
            });
        }

        const [roles, doctores] = await Promise.all([
            authService.listarRolesRegistro(),
            authService.listarDoctoresRegistro()
        ]);

        return res.json({
            ok: true,
            data: {
                roles,
                doctores
            }
        });
    } catch (error) {
        return serverError(res, error, "Error al cargar catalogos de registro");
    }
}

module.exports = {
    login,
    registroOculto,
    registroCatalogos
};
