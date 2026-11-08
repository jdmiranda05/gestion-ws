const router = require('express').Router();
const bcrypt = require('bcrypt');
const { query } = require('../db');
const { error } = require('../lib/http');
const v = require('../lib/validar');
const { auditar } = require('../lib/audit');
const { ROLES_STAFF } = require('../config');
const { autenticar, permitir, soloStaff } = require('../middleware/auth');

router.use(autenticar);

// Programadores activos (para asignar y filtrar)
router.get('/programadores', soloStaff, async (req, res) => {
    res.json(await query(
        `SELECT id_usuario AS id, nombre FROM staff WHERE rol = 'programador' AND estado = 'activo' ORDER BY nombre`
    ));
});

router.use(permitir('administrador'));

router.get('/', async (req, res) => {
    const filtros = [];
    const params = [];
    if (req.query.q) {
        filtros.push('(nombre LIKE ? OR usuario LIKE ?)');
        params.push(v.like(req.query.q), v.like(req.query.q));
    }
    if (ROLES_STAFF.includes(req.query.rol)) {
        filtros.push('rol = ?');
        params.push(req.query.rol);
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    res.json(await query(
        `SELECT id_usuario AS id, nombre, usuario, correo, rol, estado, creado_en FROM staff ${where} ORDER BY rol, nombre`,
        params
    ));
});

router.post('/', async (req, res) => {
    const nombre = v.texto(req.body.nombre, 'El nombre', { min: 3, max: 120 });
    const usuario = v.texto(req.body.usuario, 'El usuario', { min: 3, max: 40 });
    if (!/^[A-Za-z0-9._-]+$/.test(usuario)) throw error(400, 'El usuario solo admite letras, números, punto, guion y guion bajo');
    const correo = v.correo(req.body.correo, true);
    const rol = v.opcion(req.body.rol, ROLES_STAFF, 'Rol');
    const password = v.password(req.body.password);

    const [existe] = await query('SELECT id_usuario FROM staff WHERE usuario = ?', [usuario]);
    if (existe) throw error(409, 'Ese nombre de usuario ya está en uso');

    const r = await query(
        'INSERT INTO staff (nombre, usuario, correo, password, rol, estado, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [nombre, usuario, correo, await bcrypt.hash(password, 10), rol, 'activo', new Date()]
    );
    await auditar(req.user, 'crear_usuario', 'usuario', r.insertId, `${usuario} (${rol})`, req.ip);
    res.status(201).json({ id: r.insertId, mensaje: 'Usuario creado' });
});

// Impide dejar el sistema sin administradores activos
async function validarUltimoAdmin(id, cambio) {
    const [u] = await query('SELECT rol, estado FROM staff WHERE id_usuario = ?', [id]);
    if (!u) throw error(404, 'Usuario no encontrado');
    const dejaDeSerAdminActivo = u.rol === 'administrador' && u.estado === 'activo' &&
        (cambio.estado === 'inactivo' || (cambio.rol && cambio.rol !== 'administrador'));
    if (dejaDeSerAdminActivo) {
        const [{ total }] = await query(`SELECT COUNT(*) AS total FROM staff WHERE rol = 'administrador' AND estado = 'activo'`);
        if (total <= 1) throw error(400, 'Debe existir al menos un administrador activo');
    }
}

router.put('/:id', async (req, res) => {
    const id = v.entero(req.params.id, 'Usuario');
    const nombre = v.texto(req.body.nombre, 'El nombre', { min: 3, max: 120 });
    const correo = v.correo(req.body.correo, true);
    const rol = v.opcion(req.body.rol, ROLES_STAFF, 'Rol');
    await validarUltimoAdmin(id, { rol });

    const campos = ['nombre = ?', 'correo = ?', 'rol = ?'];
    const params = [nombre, correo, rol];
    if (req.body.password) {
        campos.push('password = ?');
        params.push(await bcrypt.hash(v.password(req.body.password), 10));
    }
    await query(`UPDATE staff SET ${campos.join(', ')} WHERE id_usuario = ?`, [...params, id]);
    await auditar(req.user, 'editar_usuario', 'usuario', id, `${nombre} (${rol})` + (req.body.password ? ' (contraseña restablecida)' : ''), req.ip);
    res.json({ mensaje: 'Usuario actualizado' });
});

router.patch('/:id/estado', async (req, res) => {
    const id = v.entero(req.params.id, 'Usuario');
    const estado = v.opcion(req.body.estado, ['activo', 'inactivo'], 'Estado');
    if (id === req.user.id && estado === 'inactivo') throw error(400, 'No puedes desactivar tu propia cuenta');
    await validarUltimoAdmin(id, { estado });
    await query('UPDATE staff SET estado = ? WHERE id_usuario = ?', [estado, id]);
    await auditar(req.user, estado === 'activo' ? 'activar_usuario' : 'desactivar_usuario', 'usuario', id, null, req.ip);
    res.json({ mensaje: estado === 'activo' ? 'Usuario activado' : 'Usuario desactivado' });
});

module.exports = router;
