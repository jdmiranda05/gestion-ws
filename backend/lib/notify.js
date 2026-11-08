const { query } = require('../db');
const mailer = require('./mailer');
const { emitir, salaUsuario } = require('../socket');

// Staff activo (opcionalmente solo algunos roles) como destinatarios de avisos
async function staffActivo(roles = ['programador', 'administrador']) {
    const filas = await query(
        `SELECT id_usuario AS id, correo FROM staff WHERE estado = 'activo' AND rol IN (?)`,
        [roles]
    );
    return filas.map(f => ({ tipo: 'staff', id: f.id, correo: f.correo }));
}

async function clienteComoDestino(idCliente) {
    const [c] = await query('SELECT id_cliente AS id, correo FROM clientes WHERE id_cliente = ?', [idCliente]);
    return c ? [{ tipo: 'cliente', id: c.id, correo: c.correo }] : [];
}

async function programadorComoDestino(idProgramador) {
    if (!idProgramador) return staffActivo(['programador']);
    const [s] = await query(`SELECT id_usuario AS id, correo FROM staff WHERE id_usuario = ? AND estado = 'activo'`, [idProgramador]);
    return s ? [{ tipo: 'staff', id: s.id, correo: s.correo }] : staffActivo(['programador']);
}

// destinatarios: [{ tipo: 'cliente' | 'staff', id, correo? }]
// agrupar: si ya existe un aviso sin leer igual (mismo tipo e incidente), lo actualiza en vez de duplicarlo
// (evita llenar la campana con un aviso por cada mensaje de chat).
async function avisar(destinatarios, { tipo, mensaje, idIncidente = null, correo = false, agrupar = false }) {
    const ahora = new Date();
    for (const d of destinatarios) {
        let id = null;
        if (agrupar) {
            const [previo] = await query(
                `SELECT id FROM avisos WHERE destinatario_tipo = ? AND id_destinatario = ? AND tipo = ?
                 AND id_incidente <=> ? AND leido = 0 ORDER BY id DESC LIMIT 1`,
                [d.tipo, d.id, tipo, idIncidente]
            );
            if (previo) {
                id = previo.id;
                await query('UPDATE avisos SET mensaje = ?, creado_en = ? WHERE id = ?', [mensaje, ahora, id]);
            }
        }
        if (!id) {
            const res = await query(
                `INSERT INTO avisos (destinatario_tipo, id_destinatario, tipo, mensaje, id_incidente, leido, creado_en)
                 VALUES (?, ?, ?, ?, ?, 0, ?)`,
                [d.tipo, d.id, tipo, mensaje, idIncidente, ahora]
            );
            id = res.insertId;
        }
        emitir(salaUsuario(d.tipo, d.id), 'aviso', {
            id, tipo, mensaje, id_incidente: idIncidente, leido: 0, creado_en: ahora
        });
        if (correo && d.correo) {
            mailer.enviar(d.correo, `Mesa de Ayuda: ${mensaje.slice(0, 80)}`, mensaje);
        }
    }
}

module.exports = { avisar, staffActivo, clienteComoDestino, programadorComoDestino };
