const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { query } = require('./db');

let io = null;

const salaUsuario = (tipo, id) => `u:${tipo}:${id}`;
const salaIncidente = id => `i:${id}`;

function emitir(sala, evento, datos) {
    if (io) io.to(sala).emit(evento, datos);
}

async function puedeVer(user, idIncidente) {
    const [inc] = await query('SELECT id_cliente FROM incidentes WHERE id_incidente = ?', [idIncidente]);
    if (!inc) return false;
    return user.tipo === 'staff' || inc.id_cliente === user.id;
}

function iniciar(httpServer) {
    io = new Server(httpServer);

    io.use(async (socket, next) => {
        try {
            const payload = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
            const [cuenta] = payload.tipo === 'cliente'
                ? await query('SELECT razon_social AS nombre, estado FROM clientes WHERE id_cliente = ?', [payload.id])
                : await query('SELECT nombre, estado FROM staff WHERE id_usuario = ?', [payload.id]);
            if (!cuenta || cuenta.estado !== 'activo') return next(new Error('no autorizado'));
            socket.data.user = { tipo: payload.tipo, id: payload.id, nombre: cuenta.nombre };
            next();
        } catch {
            next(new Error('no autorizado'));
        }
    });

    io.on('connection', socket => {
        const user = socket.data.user;
        socket.join(salaUsuario(user.tipo, user.id));
        if (user.tipo === 'staff') socket.join('staff');

        socket.on('incidente:unirse', async (id, ack) => {
            const ok = await puedeVer(user, Number(id)).catch(() => false);
            if (ok) socket.join(salaIncidente(Number(id)));
            if (typeof ack === 'function') ack(ok);
        });

        socket.on('incidente:salir', id => socket.leave(salaIncidente(Number(id))));

        socket.on('escribiendo', id => {
            if (socket.rooms.has(salaIncidente(Number(id)))) {
                socket.to(salaIncidente(Number(id))).emit('escribiendo', { id: Number(id), nombre: user.nombre });
            }
        });
    });
}

module.exports = { iniciar, emitir, salaUsuario, salaIncidente };
