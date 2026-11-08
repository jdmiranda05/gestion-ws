const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { error } = require('../lib/http');

// Verifica el JWT y carga la cuenta vigente desde la BD (rol y estado siempre actualizados).
// req.user = { tipo: 'cliente' | 'staff', id, rol: 'cliente' | 'programador' | 'administrador', nombre, identificador, correo }
async function autenticar(req, res, next) {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) throw error(401, 'Sesión no iniciada');

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        throw error(401, 'Sesión expirada, vuelve a iniciar sesión');
    }

    if (payload.tipo === 'cliente') {
        const [c] = await query(
            'SELECT id_cliente, razon_social, ruc, correo, estado FROM clientes WHERE id_cliente = ?',
            [payload.id]
        );
        if (!c || c.estado !== 'activo') throw error(401, 'Cuenta no disponible');
        req.user = { tipo: 'cliente', id: c.id_cliente, rol: 'cliente', nombre: c.razon_social, identificador: c.ruc, correo: c.correo };
    } else {
        const [s] = await query(
            'SELECT id_usuario, nombre, usuario, correo, rol, estado FROM staff WHERE id_usuario = ?',
            [payload.id]
        );
        if (!s || s.estado !== 'activo') throw error(401, 'Cuenta no disponible');
        req.user = { tipo: 'staff', id: s.id_usuario, rol: s.rol, nombre: s.nombre, identificador: s.usuario, correo: s.correo };
    }
    next();
}

// Limita el acceso a ciertos roles: permitir('administrador'), permitir('programador', 'administrador')
const permitir = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.rol)) throw error(403, 'No tienes permisos para esta acción');
    next();
};

const soloStaff = permitir('programador', 'administrador');

module.exports = { autenticar, permitir, soloStaff };
