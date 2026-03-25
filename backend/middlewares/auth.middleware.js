const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            ok: false,
            message: "Token requerido"
        });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            ok: false,
            message: "Token mal formado"
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // 👈 AQUÍ nace req.user
        next();
    } catch (error) {
        return res.status(401).json({
            ok: false,
            message: "Token inválido o expirado"
        });
    }
}

module.exports = authMiddleware;
