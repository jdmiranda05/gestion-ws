const router = require('express').Router();
const bcrypt = require('bcrypt');
const { query } = require('../db');
const { error } = require('../lib/http');
const v = require('../lib/validar');
const { auditar } = require('../lib/audit');
const { autenticar, permitir, soloStaff } = require('../middleware/auth');

router.use(autenticar);

// Lista simple para filtros (programadores y administradores)
router.get('/opciones', soloStaff, async (req, res) => {
    res.json(await query('SELECT id_cliente AS id, razon_social, ruc FROM clientes ORDER BY razon_social'));
});

// Gestión de clientes: solo administrador
router.use(permitir('administrador'));

router.get('/', async (req, res) => {
    const { page, limit, offset } = v.pagina(req.query);
    const filtros = [];
    const params = [];

    if (req.query.q) {
        filtros.push('(ruc LIKE ? OR razon_social LIKE ? OR responsable LIKE ? OR correo LIKE ?)');
        const q = v.like(req.query.q);
        params.push(q, q, q, q);
    }
    if (['activo', 'inactivo'].includes(req.query.estado)) {
        filtros.push('estado = ?');
        params.push(req.query.estado);
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM clientes ${where}`, params);
    const datos = await query(
        `SELECT c.id_cliente AS id, c.ruc, c.razon_social, c.responsable, c.correo, c.celular, c.estado, c.creado_en,
                (SELECT COUNT(*) FROM incidentes i WHERE i.id_cliente = c.id_cliente) AS incidentes
         FROM clientes c ${where} ORDER BY c.razon_social LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    res.json({ datos, total, page, limit });
});

function leerDatos(body, { conPassword }) {
    const datos = {
        razon_social: v.texto(body.razon_social, 'La razón social', { min: 3, max: 150 }),
        responsable: v.texto(body.responsable, 'El nombre del responsable', { min: 3, max: 120 }),
        correo: v.correo(body.correo),
        celular: v.celular(body.celular)
    };
    if (conPassword) datos.password = v.password(body.password);
    else if (body.password) datos.password = v.password(body.password);
    return datos;
}

router.post('/', async (req, res) => {
    const ruc = v.ruc(req.body.ruc);
    const datos = leerDatos(req.body, { conPassword: true });
    const [existe] = await query('SELECT id_cliente FROM clientes WHERE ruc = ?', [ruc]);
    if (existe) throw error(409, 'Ya existe un cliente con ese RUC');

    const r = await query(
        `INSERT INTO clientes (ruc, razon_social, responsable, correo, celular, password, estado, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, 'activo', ?)`,
        [ruc, datos.razon_social, datos.responsable, datos.correo, datos.celular, await bcrypt.hash(datos.password, 10), new Date()]
    );
    await auditar(req.user, 'crear_cliente', 'cliente', r.insertId, `${datos.razon_social} (${ruc})`, req.ip);
    res.status(201).json({ id: r.insertId, mensaje: 'Cliente registrado' });
});

router.put('/:id', async (req, res) => {
    const id = v.entero(req.params.id, 'Cliente');
    const datos = leerDatos(req.body, { conPassword: false });
    const [cliente] = await query('SELECT id_cliente FROM clientes WHERE id_cliente = ?', [id]);
    if (!cliente) throw error(404, 'Cliente no encontrado');

    const campos = ['razon_social = ?', 'responsable = ?', 'correo = ?', 'celular = ?'];
    const params = [datos.razon_social, datos.responsable, datos.correo, datos.celular];
    if (datos.password) {
        campos.push('password = ?');
        params.push(await bcrypt.hash(datos.password, 10));
    }
    await query(`UPDATE clientes SET ${campos.join(', ')} WHERE id_cliente = ?`, [...params, id]);
    await auditar(req.user, 'editar_cliente', 'cliente', id, datos.razon_social + (datos.password ? ' (contraseña restablecida)' : ''), req.ip);
    res.json({ mensaje: 'Cliente actualizado' });
});

router.patch('/:id/estado', async (req, res) => {
    const id = v.entero(req.params.id, 'Cliente');
    const estado = v.opcion(req.body.estado, ['activo', 'inactivo'], 'Estado');
    const r = await query('UPDATE clientes SET estado = ? WHERE id_cliente = ?', [estado, id]);
    if (!r.affectedRows) throw error(404, 'Cliente no encontrado');
    await auditar(req.user, estado === 'activo' ? 'activar_cliente' : 'desactivar_cliente', 'cliente', id, null, req.ip);
    res.json({ mensaje: estado === 'activo' ? 'Cliente activado' : 'Cliente desactivado' });
});

module.exports = router;
