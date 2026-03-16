function roleMiddleware(rolesPermitidos = []) {
    return (req, res, next) => {
        const user = req.user;

        if (!user || !user.rol) {
            return res.status(403).json({
                ok: false,
                message: "Rol no definido"
            });
        }

        if (!rolesPermitidos.includes(user.rol)) {
            return res.status(403).json({
                ok: false,
                message: "No tiene permisos para esta acción"
            });
        }

        next();
    };
}

module.exports = roleMiddleware;
