const { query } = require('../db');

// Registra una acción en la bitácora de auditoría. Nunca interrumpe la operación principal.
async function auditar(actor, accion, entidad, idEntidad = null, detalle = null, ip = null) {
    try {
        await query(
            `INSERT INTO auditoria (actor_tipo, id_actor, actor_nombre, accion, entidad, id_entidad, detalle, ip, creado_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                actor.tipo || 'sistema',
                actor.id ?? null,
                actor.nombre || 'Sistema',
                accion,
                entidad,
                idEntidad,
                detalle ? String(detalle).slice(0, 500) : null,
                ip,
                new Date()
            ]
        );
    } catch (err) {
        console.error('Error de auditoría:', err.message);
    }
}

module.exports = { auditar };
