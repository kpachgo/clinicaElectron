// backend/controllers/auth.controller.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const authService = require("../services/auth.service");
const licenciaService = require("../services/licencia.service");
const { badRequest, serverError } = require("../utils/http");

const EMAIL_MAX_LEN = 60;
const SECURITY_QUESTION_MAX_LEN = 120;
const SECURITY_ANSWER_MAX_LEN = 120;
const PASSWORD_MIN_LEN = 6;
const PASSWORD_MAX_LEN = 72;

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
}

function isHiddenRegisterEnabled() {
    const raw = String(process.env.AUTH_HIDDEN_REGISTER_ENABLED || "").trim().toLowerCase();
    return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

function isTransientDbError(err) {
    const code = String(err?.code || "").toUpperCase();
    if (!code) return false;
    return (
        code.includes("ETIMEDOUT") ||
        code.includes("ECONNRESET") ||
        code.includes("ECONNREFUSED") ||
        code.includes("PROTOCOL_CONNECTION_LOST")
    );
}

function handleAuthError(res, err, fallbackMessage) {
    if (authService.isMissingSecurityColumnsError?.(err)) {
        return res.status(503).json({
            ok: false,
            code: "security_columns_missing",
            message: "Falta migracion de pregunta de seguridad en BD"
        });
    }

    if (isTransientDbError(err)) {
        return res.status(503).json({
            ok: false,
            message: "Base de datos temporalmente no disponible. Intente de nuevo."
        });
    }
    return serverError(res, err, fallbackMessage);
}

function getHttpStatusByLicenseCode(code) {
    const value = String(code || "");
    if (value.startsWith("db_no_disponible")) return 503;
    if (value === "sp_no_disponible") return 503;
    return 403;
}

async function login(req, res) {
    try {
        const correo = normalizeEmail(req.body?.correo);
        const password = String(req.body?.password || "");

        if (!correo || !password) {
            return badRequest(res, "Correo y contrasena requeridos");
        }
        if (correo.length > EMAIL_MAX_LEN) {
            return badRequest(res, "Correo invalido");
        }

        const runtimeStatus = licenciaService.getRuntimeStatus();
        if (!runtimeStatus?.startup?.ok) {
            return res.status(getHttpStatusByLicenseCode(runtimeStatus.startup.code)).json({
                ok: false,
                code: runtimeStatus.startup.code,
                message: runtimeStatus.startup.message
            });
        }

        const usageStatus = await licenciaService.validateSystemUsageConfigured({ force: true });
        if (!usageStatus?.ok) {
            return res.status(getHttpStatusByLicenseCode(usageStatus.code)).json({
                ok: false,
                code: usageStatus.code,
                message: usageStatus.message
            });
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
        return handleAuthError(res, error, "Error interno del servidor");
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
            idRol,
            idDoctor,
            preguntaSeguridad,
            respuestaSeguridad
        } = req.body || {};

        if (!correo || !password || !nombre || !idRol) {
            return badRequest(res, "Datos incompletos para registro");
        }

        const correoLimpio = normalizeEmail(correo);
        const nombreLimpio = normalizeText(nombre);
        const idRolNum = Number(idRol);
        const idDoctorNum = idDoctor === "" || idDoctor == null
            ? null
            : Number(idDoctor);

        const preguntaSeguridadNorm = authService.normalizeSecurityQuestion(preguntaSeguridad);
        const respuestaSeguridadNorm = authService.normalizeSecurityAnswer(respuestaSeguridad);
        const hasPreguntaSeguridad = !!preguntaSeguridadNorm;
        const hasRespuestaSeguridad = !!respuestaSeguridadNorm;

        if (!correoLimpio || correoLimpio.length > EMAIL_MAX_LEN) {
            return badRequest(res, "Correo invalido o demasiado largo");
        }

        if (!nombreLimpio || nombreLimpio.length > 60) {
            return badRequest(res, "Nombre invalido o demasiado largo");
        }

        if (!Number.isInteger(idRolNum) || idRolNum <= 0) {
            return badRequest(res, "idRol invalido");
        }

        if (hasPreguntaSeguridad !== hasRespuestaSeguridad) {
            return badRequest(res, "Para seguridad debe enviar pregunta y respuesta juntas");
        }

        if (hasPreguntaSeguridad && preguntaSeguridadNorm.length > SECURITY_QUESTION_MAX_LEN) {
            return badRequest(res, "Pregunta de seguridad demasiado larga");
        }

        if (hasRespuestaSeguridad && respuestaSeguridadNorm.length > SECURITY_ANSWER_MAX_LEN) {
            return badRequest(res, "Respuesta de seguridad demasiado larga");
        }

        const rolRegistro = await authService.obtenerRolPorId(idRolNum);
        if (!rolRegistro) {
            return badRequest(res, "idRol no existe");
        }

        const cargoDerivado = String(rolRegistro.nombreR || "").trim();
        if (!cargoDerivado || cargoDerivado.length > 20) {
            return badRequest(res, "Cargo derivado del rol invalido");
        }

        if (idDoctorNum !== null && (!Number.isInteger(idDoctorNum) || idDoctorNum <= 0)) {
            return badRequest(res, "idDoctor invalido");
        }

        if (String(password).length < PASSWORD_MIN_LEN) {
            return badRequest(res, "La contrasena debe tener al menos 6 caracteres");
        }

        const passwordHash = await bcrypt.hash(String(password), 10);

        const idUsuario = await authService.crearUsuario({
            correo: correoLimpio,
            passwordHash,
            nombre: nombreLimpio,
            cargo: cargoDerivado,
            idRol: idRolNum,
            idDoctor: idDoctorNum
        });

        let securityQuestionStored = null;
        if (hasPreguntaSeguridad && hasRespuestaSeguridad && idUsuario) {
            securityQuestionStored = await authService.configurarPreguntaSeguridadPorIdUsuario(
                idUsuario,
                preguntaSeguridadNorm,
                respuestaSeguridadNorm,
                { ignoreMissingColumns: true }
            );
        }

        return res.status(201).json({
            ok: true,
            idUsuario,
            securityQuestionStored
        });

    } catch (error) {
        if (error?.sqlState === "45000" && String(error?.message || "").includes("EL_CORREO_YA_EXISTE")) {
            return res.status(409).json({
                ok: false,
                message: "El correo ya existe"
            });
        }

        return handleAuthError(res, error, "Error al crear usuario");
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
        return handleAuthError(res, error, "Error al cargar catalogos de registro");
    }
}

async function passwordRecoveryQuestion(req, res) {
    try {
        const correo = normalizeEmail(req.body?.correo);
        if (!correo) {
            return badRequest(res, "Correo requerido");
        }
        if (correo.length > EMAIL_MAX_LEN) {
            return badRequest(res, "Correo invalido");
        }

        const usuario = await authService.obtenerUsuarioRecuperacionPorCorreo(correo);
        if (!usuario) {
            return res.json({
                ok: true,
                mode: "not_found",
                message: "Si el correo existe y tiene pregunta configurada podra recuperarse"
            });
        }

        if (!usuario.hasSecurityQuestion) {
            return res.json({
                ok: true,
                mode: "setup_required",
                message: "Este usuario no tiene pregunta configurada"
            });
        }

        return res.json({
            ok: true,
            mode: "question",
            preguntaSeguridad: usuario.preguntaSeguridad
        });
    } catch (error) {
        return handleAuthError(res, error, "Error consultando recuperacion de contrasena");
    }
}

async function passwordRecoveryReset(req, res) {
    try {
        const correo = normalizeEmail(req.body?.correo);
        const respuestaSeguridad = authService.normalizeSecurityAnswer(req.body?.respuestaSeguridad);
        const nuevaPassword = String(req.body?.nuevaPassword || "");

        if (!correo || !respuestaSeguridad || !nuevaPassword) {
            return badRequest(res, "Correo, respuesta y nueva contrasena son obligatorios");
        }
        if (correo.length > EMAIL_MAX_LEN) {
            return badRequest(res, "Correo invalido");
        }
        if (respuestaSeguridad.length > SECURITY_ANSWER_MAX_LEN) {
            return badRequest(res, "Respuesta de seguridad demasiado larga");
        }
        if (nuevaPassword.length < PASSWORD_MIN_LEN) {
            return badRequest(res, "La nueva contrasena debe tener al menos 6 caracteres");
        }
        if (nuevaPassword.length > PASSWORD_MAX_LEN) {
            return badRequest(res, "La nueva contrasena es demasiado larga");
        }

        const result = await authService.validarRespuestaSeguridad({
            correo,
            respuestaSeguridad
        });

        if (!result.ok) {
            if (result.code === "NOT_FOUND") {
                return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
            }
            if (result.code === "SECURITY_NOT_CONFIGURED") {
                return res.status(409).json({ ok: false, message: "Este usuario no tiene pregunta configurada" });
            }
            if (result.code === "ANSWER_INVALID") {
                return res.status(401).json({ ok: false, message: "Respuesta de seguridad incorrecta" });
            }
            return res.status(400).json({ ok: false, message: "No se pudo validar la recuperacion" });
        }

        const nuevaPasswordHash = await bcrypt.hash(nuevaPassword, 10);
        await authService.cambiarPasswordPorIdUsuario(result.idUsuario, nuevaPasswordHash);

        return res.json({
            ok: true,
            message: "Contrasena actualizada correctamente"
        });
    } catch (error) {
        return handleAuthError(res, error, "Error al restablecer contrasena");
    }
}

async function passwordRecoverySetup(req, res) {
    try {
        const correo = normalizeEmail(req.body?.correo);
        const passwordActual = String(req.body?.passwordActual || "");
        const preguntaSeguridad = authService.normalizeSecurityQuestion(req.body?.preguntaSeguridad);
        const respuestaSeguridad = authService.normalizeSecurityAnswer(req.body?.respuestaSeguridad);
        const nuevaPassword = String(req.body?.nuevaPassword || "");

        if (!correo || !passwordActual || !preguntaSeguridad || !respuestaSeguridad) {
            return badRequest(res, "Correo, contrasena actual, pregunta y respuesta son obligatorios");
        }
        if (correo.length > EMAIL_MAX_LEN) {
            return badRequest(res, "Correo invalido");
        }
        if (preguntaSeguridad.length > SECURITY_QUESTION_MAX_LEN) {
            return badRequest(res, "Pregunta de seguridad demasiado larga");
        }
        if (respuestaSeguridad.length > SECURITY_ANSWER_MAX_LEN) {
            return badRequest(res, "Respuesta de seguridad demasiado larga");
        }
        if (nuevaPassword && nuevaPassword.length < PASSWORD_MIN_LEN) {
            return badRequest(res, "La nueva contrasena debe tener al menos 6 caracteres");
        }
        if (nuevaPassword && nuevaPassword.length > PASSWORD_MAX_LEN) {
            return badRequest(res, "La nueva contrasena es demasiado larga");
        }

        const nuevaPasswordHash = nuevaPassword
            ? await bcrypt.hash(nuevaPassword, 10)
            : null;

        const result = await authService.configurarPreguntaConPasswordActual({
            correo,
            passwordActual,
            preguntaSeguridad,
            respuestaSeguridad,
            nuevaPasswordHash
        });

        if (!result.ok) {
            if (result.code === "PASSWORD_INVALID") {
                return res.status(401).json({
                    ok: false,
                    message: "Correo o contrasena actual incorrectos"
                });
            }

            return res.status(400).json({
                ok: false,
                message: "No se pudo configurar seguridad"
            });
        }

        return res.json({
            ok: true,
            message: nuevaPassword
                ? "Pregunta configurada y contrasena actualizada"
                : "Pregunta configurada correctamente"
        });
    } catch (error) {
        return handleAuthError(res, error, "Error configurando recuperacion de contrasena");
    }
}

module.exports = {
    login,
    registroOculto,
    registroCatalogos,
    passwordRecoveryQuestion,
    passwordRecoveryReset,
    passwordRecoverySetup
};
