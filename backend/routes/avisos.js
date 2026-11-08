const router = require('express').Router();
const { query } = require('../db');
const v = require('../lib/validar');
const { autenticar } = require('../middleware/auth');

router.use(autenticar);

const dueno = req => [req.user.tipo, req.user.id];

router.get('/', async (req, res) => {
    const [tipo, id] = dueno(req);
    const avisos = await query(
        `SELECT id, tipo, mensaje, id_incidente, leido, creado_en FROM avisos
         WHERE destinatario_tipo = ? AND id_destinatario = ? ORDER BY id DESC LIMIT 30`,
        [tipo, id]
    );
    const [{ sin_leer }] = await query(
        'SELECT COUNT(*) AS sin_leer FROM avisos WHERE destinatario_tipo = ? AND id_destinatario = ? AND leido = 0',
        [tipo, id]
    );
    res.json({ avisos, sin_leer });
});

router.put('/leer', async (req, res) => {
    const [tipo, id] = dueno(req);
    await query('UPDATE avisos SET leido = 1 WHERE destinatario_tipo = ? AND id_destinatario = ?', [tipo, id]);
    res.json({ ok: true });
});

router.put('/:id/leer', async (req, res) => {
    const [tipo, id] = dueno(req);
    await query(
        'UPDATE avisos SET leido = 1 WHERE id = ? AND destinatario_tipo = ? AND id_destinatario = ?',
        [v.entero(req.params.id, 'Aviso'), tipo, id]
    );
    res.json({ ok: true });
});

module.exports = router;
