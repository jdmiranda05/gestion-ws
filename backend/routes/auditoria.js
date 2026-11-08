const router = require('express').Router();
const { query } = require('../db');
const v = require('../lib/validar');
const { autenticar, permitir } = require('../middleware/auth');

router.use(autenticar, permitir('administrador'));

router.get('/', async (req, res) => {
    const { page, limit, offset } = v.pagina(req.query, 25);
    const filtros = [];
    const params = [];

    if (req.query.q) {
        filtros.push('(actor_nombre LIKE ? OR detalle LIKE ?)');
        params.push(v.like(req.query.q), v.like(req.query.q));
    }
    if (req.query.accion) {
        filtros.push('accion = ?');
        params.push(String(req.query.accion));
    }
    if (req.query.desde) {
        filtros.push('creado_en >= ?');
        params.push(new Date(`${req.query.desde}T00:00:00`));
    }
    if (req.query.hasta) {
        filtros.push('creado_en <= ?');
        params.push(new Date(`${req.query.hasta}T23:59:59`));
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM auditoria ${where}`, params);
    const datos = await query(
        `SELECT id, actor_tipo, actor_nombre, accion, entidad, id_entidad, detalle, ip, creado_en
         FROM auditoria ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const acciones = await query('SELECT DISTINCT accion FROM auditoria ORDER BY accion');
    res.json({ datos, total, page, limit, acciones: acciones.map(a => a.accion) });
});

module.exports = router;
