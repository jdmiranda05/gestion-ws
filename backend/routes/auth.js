const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');
const { error } = require('../lib/http');
const v = require('../lib/validar');
const { auditar } = require('../lib/audit');
const mailer = require('../lib/mailer');
const { autenticar } = require('../middleware/auth');
const { limitar } = require('../middleware/limite');

const limiteRecuperar = limitar({ max: 5, ventanaMs: 15 * 60 * 1000, mensaje: 'Demasiadas solicitudes. Espera unos minutos.' });

// Hash ficticio para igualar tiempos de respuesta cuando la cuenta no existe
const HASH_FALSO = bcrypt.hashSync('sin-cuenta', 10);

const firmar = (tipo, id) => jwt.sign({ tipo, id }, process.env.JWT_SECRET, { expiresIn: '8h' });
const sha256 = texto => crypto.createHash('sha256').update(texto).digest('hex');

function respuestaSesion(tipo, fila) {
    if (tipo === 'cliente') {
        return {
            token: firmar('cliente', fila.id_cliente),
            usuario: { tipo, id: fila.id_cliente, rol: 'cliente', nombre: fila.razon_social, identificador: fila.ruc }
        };
    }
    return {
        token: firmar('staff', fila.id_usuario),
        usuario: { tipo, id: fila.id_usuario, rol: fila.rol, nombre: fila.nombre, identificador: fila.usuario }
    };
}

// Busca la cuenta por RUC (clientes) o por usuario (programadores / administradores)
async function buscarCuenta(identificador) {
    const id = String(identificador || '').trim();
    if (/^\d{11}$/.test(id)) {
        const [c] = await query('SELECT * FROM clientes WHERE ruc = ?', [id]);
        if (c) return { tipo: 'cliente', fila: c };
    }
    const [s] = await query('SELECT * FROM staff WHERE usuario = ?', [id]);
    return s ? { tipo: 'staff', fila: s } : null;
}

router.post('/login', async (req, res) => {
    const { identificador, password } = req.body || {};
    if (!identificador || !password) throw error(400, 'Ingresa tu RUC y contraseña');

    const cuenta = await buscarCuenta(identificador);
    const hash = cuenta ? cuenta.fila.password : HASH_FALSO;
    const coincide = await bcrypt.compare(String(password), hash);
    if (!cuenta || !coincide) throw error(401, 'RUC o contraseña incorrectos');
    if (cuenta.fila.estado !== 'activo') throw error(403, 'Tu cuenta está desactivada. Contacta al administrador.');

    const sesion = respuestaSesion(cuenta.tipo, cuenta.fila);
    await auditar(sesion.usuario, 'login', cuenta.tipo === 'cliente' ? 'cliente' : 'usuario', sesion.usuario.id, null, req.ip);
    res.json(sesion);
});

// Recuperación de contraseña: envía un enlace de un solo uso al correo registrado
router.post('/recuperar', limiteRecuperar, async (req, res) => {
    const respuesta = { mensaje: 'Si la cuenta existe y tiene un correo registrado, recibirás un enlace para restablecer la contraseña.' };
    const cuenta = await buscarCuenta(req.body.identificador);
    if (!cuenta || cuenta.fila.estado !== 'activo' || !cuenta.fila.correo) return res.json(respuesta);

    const token = crypto.randomBytes(32).toString('hex');
    const idCuenta = cuenta.tipo === 'cliente' ? cuenta.fila.id_cliente : cuenta.fila.id_usuario;
    await query(
        'INSERT INTO password_resets (cuenta_tipo, id_cuenta, token_hash, expira_en) VALUES (?, ?, ?, ?)',
        [cuenta.tipo, idCuenta, sha256(token), new Date(Date.now() + 60 * 60 * 1000)]
    );

    const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const enlace = `${base}/login.html?reset=${token}`;
    const enviado = await mailer.enviar(
        cuenta.fila.correo,
        'Restablecer contraseña - Mesa de Ayuda',
        `Recibimos una solicitud para restablecer tu contraseña.\n\nUsa este enlace (válido por 1 hora):\n${enlace}\n\nSi no fuiste tú, ignora este mensaje.`
    );
    if (!enviado && process.env.NODE_ENV !== 'production') {
        console.log(`[SMTP no configurado] Enlace de recuperación para ${cuenta.fila.ruc || cuenta.fila.usuario}: ${enlace}`);
    }
    await auditar({ tipo: cuenta.tipo, id: idCuenta, nombre: cuenta.fila.razon_social || cuenta.fila.nombre }, 'recuperar_password', 'cuenta', idCuenta, null, req.ip);
    res.json(respuesta);
});

router.post('/restablecer', limiteRecuperar, async (req, res) => {
    const password = v.password(req.body.password);
    const [reg] = await query(
        'SELECT * FROM password_resets WHERE token_hash = ? AND usado = 0 AND expira_en > ?',
        [sha256(String(req.body.token || '')), new Date()]
    );
    if (!reg) throw error(400, 'El enlace no es válido o ya expiró');

    const hash = await bcrypt.hash(password, 10);
    if (reg.cuenta_tipo === 'cliente') {
        await query('UPDATE clientes SET password = ? WHERE id_cliente = ?', [hash, reg.id_cuenta]);
    } else {
        await query('UPDATE staff SET password = ? WHERE id_usuario = ?', [hash, reg.id_cuenta]);
    }
    await query('UPDATE password_resets SET usado = 1 WHERE id = ?', [reg.id]);
    await auditar({ tipo: reg.cuenta_tipo, id: reg.id_cuenta, nombre: 'Usuario' }, 'restablecer_password', 'cuenta', reg.id_cuenta, null, req.ip);
    res.json({ mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
});

// ---- Rutas con sesión ----

router.get('/me', autenticar, async (req, res) => {
    if (req.user.tipo === 'cliente') {
        const [c] = await query(
            'SELECT ruc, razon_social, responsable, correo, celular FROM clientes WHERE id_cliente = ?',
            [req.user.id]
        );
        return res.json({ ...req.user, perfil: c });
    }
    res.json({ ...req.user, perfil: { nombre: req.user.nombre, usuario: req.user.identificador, correo: req.user.correo } });
});

router.put('/perfil', autenticar, async (req, res) => {
    if (req.user.tipo === 'cliente') {
        await query(
            'UPDATE clientes SET responsable = ?, correo = ?, celular = ? WHERE id_cliente = ?',
            [v.texto(req.body.responsable, 'El responsable', { min: 3, max: 120 }), v.correo(req.body.correo), v.celular(req.body.celular), req.user.id]
        );
    } else {
        await query(
            'UPDATE staff SET nombre = ?, correo = ? WHERE id_usuario = ?',
            [v.texto(req.body.nombre, 'El nombre', { min: 3, max: 120 }), v.correo(req.body.correo, true), req.user.id]
        );
    }
    await auditar(req.user, 'editar_perfil', 'cuenta', req.user.id, null, req.ip);
    res.json({ mensaje: 'Datos actualizados' });
});

router.put('/password', autenticar, async (req, res) => {
    const nueva = v.password(req.body.nueva);
    const [fila] = req.user.tipo === 'cliente'
        ? await query('SELECT password FROM clientes WHERE id_cliente = ?', [req.user.id])
        : await query('SELECT password FROM staff WHERE id_usuario = ?', [req.user.id]);
    if (!(await bcrypt.compare(String(req.body.actual || ''), fila.password))) {
        throw error(400, 'La contraseña actual es incorrecta');
    }
    const hash = await bcrypt.hash(nueva, 10);
    if (req.user.tipo === 'cliente') {
        await query('UPDATE clientes SET password = ? WHERE id_cliente = ?', [hash, req.user.id]);
    } else {
        await query('UPDATE staff SET password = ? WHERE id_usuario = ?', [hash, req.user.id]);
    }
    await auditar(req.user, 'cambiar_password', 'cuenta', req.user.id, null, req.ip);
    res.json({ mensaje: 'Contraseña actualizada correctamente' });
});

module.exports = router;
