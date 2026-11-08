const router = require('express').Router();
const { query, transaccion } = require('../db');
const { error } = require('../lib/http');
const v = require('../lib/validar');
const { auditar } = require('../lib/audit');
const { subir, quitarArchivos } = require('../lib/upload');
const { avisar, staffActivo, clienteComoDestino, programadorComoDestino } = require('../lib/notify');
const { emitir, salaUsuario, salaIncidente } = require('../socket');
const { PRIORIDADES, TIPOS_INCIDENTE } = require('../config');
const { autenticar, permitir, soloStaff } = require('../middleware/auth');

router.use(autenticar);

const COLUMNAS = `
    i.id_incidente AS id, i.numero_ticket, i.tipo, i.prioridad, i.asunto, i.descripcion, i.estado,
    i.fecha_registro, i.fecha_atencion, i.fecha_solucion, i.fecha_aprobacion, i.fecha_cierre,
    i.solucion, i.sla_limite, i.revisiones,
    i.id_cliente, c.razon_social AS cliente, c.ruc, c.responsable, c.correo AS cliente_correo, c.celular AS cliente_celular,
    i.id_programador, s.nombre AS programador`;
const ORIGEN = `
    FROM incidentes i
    JOIN clientes c ON c.id_cliente = i.id_cliente
    LEFT JOIN staff s ON s.id_usuario = i.id_programador`;

const PRIORIDAD_ORDEN = `FIELD(i.prioridad, ${PRIORIDADES.map(p => `'${p.nombre}'`).join(', ')})`;

const segundos = (desde, hasta) => (desde && hasta ? Math.max(0, Math.round((new Date(hasta) - new Date(desde)) / 1000)) : null);

// Estado del SLA de primera atención
function calcularSla(inc) {
    const limite = new Date(inc.sla_limite);
    if (inc.fecha_atencion) {
        return { estado: new Date(inc.fecha_atencion) <= limite ? 'cumplido' : 'incumplido', limite };
    }
    return { estado: new Date() > limite ? 'vencido' : 'en_curso', limite };
}

function acciones(user, inc) {
    const lista = [];
    const abierto = inc.estado !== 'Cerrado';
    if (user.tipo === 'staff') {
        if (inc.estado === 'Pendiente') lista.push('atender');
        if (inc.estado === 'Pendiente' || inc.estado === 'En Atención') lista.push('solucionar');
        if (inc.estado === 'Aprobado por Cliente') lista.push('cerrar');
        if (abierto) lista.push('observar', 'adjuntar');
        if (abierto && user.rol === 'administrador') lista.push('asignar');
    } else if (inc.id_cliente === user.id) {
        if (inc.estado === 'Solucionado') lista.push('aprobar', 'revision');
        if (abierto) lista.push('adjuntar');
    }
    if (abierto) lista.push('chatear');
    return lista;
}

function presentar(inc, user) {
    return {
        ...inc,
        sla: calcularSla(inc),
        tiempo_atencion: segundos(inc.fecha_registro, inc.fecha_atencion),
        tiempo_solucion: segundos(inc.fecha_registro, inc.fecha_solucion),
        acciones: acciones(user, inc)
    };
}

// Carga un incidente verificando que el usuario tenga acceso (el cliente solo ve los suyos)
async function cargar(id, user) {
    const [inc] = await query(`SELECT ${COLUMNAS} ${ORIGEN} WHERE i.id_incidente = ?`, [id]);
    if (!inc || (user.tipo === 'cliente' && inc.id_cliente !== user.id)) throw error(404, 'Incidente no encontrado');
    return inc;
}

const idParam = req => v.entero(req.params.id, 'Incidente');

async function registrarSeguimiento(q, inc, user, tipo, observacion = null) {
    await q(
        `INSERT INTO seguimiento (id_incidente, autor_tipo, id_autor, autor_nombre, tipo, observacion, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [inc.id, user ? user.tipo : 'sistema', user ? user.id : null, user ? user.nombre : 'Sistema', tipo, observacion, new Date()]
    );
}

async function guardarArchivos(q, inc, user, archivos) {
    for (const a of archivos) {
        await q(
            `INSERT INTO archivos (id_incidente, subido_por_tipo, subido_por_nombre, nombre_archivo, ruta, mime, tamano, creado_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [inc.id, user.tipo, user.nombre, a.nombre, a.ruta, a.mime, a.tamano, new Date()]
        );
    }
}

// Avisa a las pantallas abiertas que el incidente cambió (listas, detalle, dashboard)
function difundirCambio(inc) {
    const datos = { id: inc.id };
    emitir('staff', 'incidente:cambio', datos);
    emitir(salaUsuario('cliente', inc.id_cliente), 'incidente:cambio', datos);
    emitir(salaIncidente(inc.id), 'incidente:cambio', datos);
}

const etiqueta = inc => inc.numero_ticket;

// ---------- Catálogos ----------

router.get('/catalogos', (req, res) => {
    res.json({ prioridades: PRIORIDADES, tipos: TIPOS_INCIDENTE });
});

// ---------- Listado ----------

router.get('/', async (req, res) => {
    const { page, limit, offset } = v.pagina(req.query);
    const filtros = [];
    const params = [];
    const esCliente = req.user.tipo === 'cliente';

    if (esCliente) {
        filtros.push('i.id_cliente = ?');
        params.push(req.user.id);
    } else if (req.query.id_cliente) {
        filtros.push('i.id_cliente = ?');
        params.push(v.entero(req.query.id_cliente, 'Cliente'));
    }
    if (req.query.estado) {
        filtros.push('i.estado = ?');
        params.push(String(req.query.estado));
    }
    if (req.query.abiertos === '1') filtros.push(`i.estado <> 'Cerrado'`);
    if (req.query.prioridad) {
        filtros.push('i.prioridad = ?');
        params.push(String(req.query.prioridad));
    }
    if (!esCliente && req.query.id_programador) {
        if (req.query.id_programador === 'sin') {
            filtros.push('i.id_programador IS NULL');
        } else {
            filtros.push('i.id_programador = ?');
            params.push(v.entero(req.query.id_programador, 'Programador'));
        }
    }
    if (req.query.desde) {
        filtros.push('i.fecha_registro >= ?');
        params.push(new Date(`${req.query.desde}T00:00:00`));
    }
    if (req.query.hasta) {
        filtros.push('i.fecha_registro <= ?');
        params.push(new Date(`${req.query.hasta}T23:59:59`));
    }
    if (req.query.q) {
        const q = v.like(req.query.q);
        filtros.push('(i.numero_ticket LIKE ? OR i.asunto LIKE ? OR c.razon_social LIKE ? OR c.ruc LIKE ?)');
        params.push(q, q, q, q);
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    // Para el personal: abiertos primero, luego por prioridad y antigüedad. Para el cliente: más recientes primero.
    const orden = req.query.orden === 'reciente' || esCliente
        ? 'i.fecha_registro DESC'
        : `(i.estado = 'Cerrado'), ${PRIORIDAD_ORDEN}, i.fecha_registro ASC`;

    const lector = esCliente ? 'staff' : 'cliente'; // mensajes que el usuario aún no ha leído son los de la otra parte
    const [{ total }] = await query(`SELECT COUNT(*) AS total ${ORIGEN} ${where}`, params);
    const filas = await query(
        `SELECT ${COLUMNAS},
            (SELECT COUNT(*) FROM mensajes m
              WHERE m.id_incidente = i.id_incidente AND m.autor_tipo = ?
                AND m.id > COALESCE((SELECT l.ultimo_id FROM chat_lecturas l
                                      WHERE l.id_incidente = i.id_incidente AND l.lector_tipo = ? AND l.id_lector = ?), 0)
            ) AS sin_leer
         ${ORIGEN} ${where} ORDER BY ${orden} LIMIT ? OFFSET ?`,
        [lector, req.user.tipo, req.user.id, ...params, limit, offset]
    );
    res.json({ datos: filas.map(f => presentar(f, req.user)), total, page, limit });
});

// ---------- Creación (solo clientes) ----------

router.post('/', permitir('cliente'), subir('archivos', { multiple: true }), async (req, res) => {
    try {
        const prioridad = PRIORIDADES.find(p => p.nombre === req.body.prioridad);
        if (!prioridad) throw error(400, 'Selecciona una prioridad válida');
        const tipo = v.opcion(req.body.tipo, TIPOS_INCIDENTE, 'Tipo de incidente');
        const asunto = v.texto(req.body.asunto, 'El asunto', { min: 5, max: 200 });
        const descripcion = v.texto(req.body.descripcion, 'La descripción', { min: 10, max: 5000 });

        const ahora = new Date();
        const limiteSla = new Date(ahora.getTime() + prioridad.slaHoras * 3600 * 1000);

        const id = await transaccion(async q => {
            const r = await q(
                `INSERT INTO incidentes (id_cliente, tipo, prioridad, asunto, descripcion, estado, fecha_registro, sla_limite)
                 VALUES (?, ?, ?, ?, ?, 'Pendiente', ?, ?)`,
                [req.user.id, tipo, prioridad.nombre, asunto, descripcion, ahora, limiteSla]
            );
            const numero = `INC-${ahora.getFullYear()}-${String(r.insertId).padStart(5, '0')}`;
            await q('UPDATE incidentes SET numero_ticket = ? WHERE id_incidente = ?', [numero, r.insertId]);
            const inc = { id: r.insertId };
            await registrarSeguimiento(q, inc, req.user, 'creacion', 'Incidente registrado');
            await guardarArchivos(q, inc, req.user, req.archivos);
            return r.insertId;
        });

        const inc = await cargar(id, req.user);
        await auditar(req.user, 'crear_incidente', 'incidente', id, `${inc.numero_ticket} · ${prioridad.nombre}`, req.ip);
        await avisar(await staffActivo(), {
            tipo: 'nuevo_incidente',
            mensaje: `Nuevo incidente ${inc.numero_ticket} (${inc.prioridad}) de ${inc.cliente}: ${inc.asunto}`,
            idIncidente: id,
            correo: true
        });
        difundirCambio(inc);
        res.status(201).json({ id, numero_ticket: inc.numero_ticket });
    } catch (err) {
        quitarArchivos(req.archivos);
        throw err;
    }
});

// ---------- Detalle ----------

router.get('/:id', async (req, res) => {
    const inc = await cargar(idParam(req), req.user);
    const [seguimiento, archivos, [encuesta]] = await Promise.all([
        query('SELECT id, autor_tipo, autor_nombre, tipo, observacion, creado_en FROM seguimiento WHERE id_incidente = ? ORDER BY id', [inc.id]),
        query('SELECT id, subido_por_tipo, subido_por_nombre, nombre_archivo, ruta, mime, tamano, creado_en FROM archivos WHERE id_incidente = ? ORDER BY id', [inc.id]),
        query('SELECT calificacion, comentario, creado_en FROM encuestas WHERE id_incidente = ?', [inc.id])
    ]);
    const detalle = presentar(inc, req.user);
    if (req.user.tipo === 'cliente' && !encuesta && ['Aprobado por Cliente', 'Cerrado'].includes(inc.estado)) detalle.acciones.push('calificar');
    res.json({ ...detalle, seguimiento, archivos, encuesta: encuesta || null });
});

// ---------- Acciones del personal ----------

router.post('/:id/atender', soloStaff, async (req, res) => {
    const id = idParam(req);
    const inc = await cargar(id, req.user);
    const r = await query(
        `UPDATE incidentes SET estado = 'En Atención', fecha_atencion = ?, id_programador = COALESCE(id_programador, ?)
         WHERE id_incidente = ? AND estado = 'Pendiente'`,
        [new Date(), req.user.rol === 'programador' ? req.user.id : null, id]
    );
    if (!r.affectedRows) throw error(409, 'El incidente ya no está pendiente');
    await registrarSeguimiento(query, inc, req.user, 'atencion', `Atención iniciada por ${req.user.nombre}`);
    await auditar(req.user, 'atender_incidente', 'incidente', id, etiqueta(inc), req.ip);
    await avisar(await clienteComoDestino(inc.id_cliente), {
        tipo: 'estado', mensaje: `Tu incidente ${etiqueta(inc)} ahora está En Atención`, idIncidente: id, correo: true
    });
    difundirCambio(inc);
    res.json({ mensaje: 'Incidente en atención' });
});

router.post('/:id/observaciones', soloStaff, async (req, res) => {
    const id = idParam(req);
    const inc = await cargar(id, req.user);
    if (inc.estado === 'Cerrado') throw error(409, 'El incidente está cerrado');
    const observacion = v.texto(req.body.observacion, 'La observación', { max: 2000 });
    await registrarSeguimiento(query, inc, req.user, 'observacion', observacion);
    await auditar(req.user, 'observacion_incidente', 'incidente', id, etiqueta(inc), req.ip);
    await avisar(await clienteComoDestino(inc.id_cliente), {
        tipo: 'observacion', mensaje: `Nueva observación en tu incidente ${etiqueta(inc)}`, idIncidente: id, agrupar: true
    });
    difundirCambio(inc);
    res.status(201).json({ mensaje: 'Observación registrada' });
});

router.post('/:id/solucion', soloStaff, subir('archivos', { multiple: true }), async (req, res) => {
    try {
        const id = idParam(req);
        const inc = await cargar(id, req.user);
        const solucion = v.texto(req.body.solucion, 'La solución', { min: 5, max: 5000 });
        const ahora = new Date();

        await transaccion(async q => {
            const r = await q(
                `UPDATE incidentes SET estado = 'Solucionado', solucion = ?, fecha_solucion = ?,
                        fecha_atencion = COALESCE(fecha_atencion, ?), id_programador = COALESCE(id_programador, ?)
                 WHERE id_incidente = ? AND estado IN ('Pendiente', 'En Atención')`,
                [solucion, ahora, ahora, req.user.rol === 'programador' ? req.user.id : null, id]
            );
            if (!r.affectedRows) throw error(409, 'El incidente no se puede marcar como solucionado en su estado actual');
            await registrarSeguimiento(q, inc, req.user, 'solucion', solucion);
            await guardarArchivos(q, inc, req.user, req.archivos);
        });

        await auditar(req.user, 'solucionar_incidente', 'incidente', id, etiqueta(inc), req.ip);
        await avisar(await clienteComoDestino(inc.id_cliente), {
            tipo: 'estado',
            mensaje: `Tu incidente ${etiqueta(inc)} fue marcado como Solucionado. Revísalo y apruébalo o solicita una revisión.`,
            idIncidente: id,
            correo: true
        });
        difundirCambio(inc);
        res.json({ mensaje: 'Incidente marcado como solucionado' });
    } catch (err) {
        quitarArchivos(req.archivos);
        throw err;
    }
});

router.post('/:id/cerrar', soloStaff, async (req, res) => {
    const id = idParam(req);
    const inc = await cargar(id, req.user);
    const r = await query(
        `UPDATE incidentes SET estado = 'Cerrado', fecha_cierre = ? WHERE id_incidente = ? AND estado = 'Aprobado por Cliente'`,
        [new Date(), id]
    );
    if (!r.affectedRows) throw error(409, 'Solo se pueden cerrar incidentes aprobados por el cliente');
    await registrarSeguimiento(query, inc, req.user, 'cierre', 'Incidente cerrado');
    await auditar(req.user, 'cerrar_incidente', 'incidente', id, etiqueta(inc), req.ip);
    await avisar(await clienteComoDestino(inc.id_cliente), {
        tipo: 'estado', mensaje: `Tu incidente ${etiqueta(inc)} fue cerrado. Cuéntanos cómo fue la atención.`, idIncidente: id, correo: true
    });
    difundirCambio(inc);
    res.json({ mensaje: 'Incidente cerrado' });
});

router.put('/:id/asignar', permitir('administrador'), async (req, res) => {
    const id = idParam(req);
    const inc = await cargar(id, req.user);
    if (inc.estado === 'Cerrado') throw error(409, 'El incidente está cerrado');

    const idProgramador = req.body.id_programador ? v.entero(req.body.id_programador, 'Programador') : null;
    let programador = null;
    if (idProgramador) {
        [programador] = await query(
            `SELECT id_usuario, nombre, correo FROM staff WHERE id_usuario = ? AND rol = 'programador' AND estado = 'activo'`,
            [idProgramador]
        );
        if (!programador) throw error(400, 'Programador no válido');
    }
    await query('UPDATE incidentes SET id_programador = ? WHERE id_incidente = ?', [idProgramador, id]);
    await registrarSeguimiento(query, inc, req.user, 'asignacion', programador ? `Asignado a ${programador.nombre}` : 'Asignación retirada');
    await auditar(req.user, 'asignar_incidente', 'incidente', id, `${etiqueta(inc)} → ${programador ? programador.nombre : 'sin asignar'}`, req.ip);
    if (programador) {
        await avisar([{ tipo: 'staff', id: programador.id_usuario, correo: programador.correo }], {
            tipo: 'asignacion', mensaje: `Se te asignó el incidente ${etiqueta(inc)} (${inc.prioridad})`, idIncidente: id, correo: true
        });
    }
    difundirCambio(inc);
    res.json({ mensaje: 'Asignación actualizada' });
});

// ---------- Acciones del cliente ----------

router.post('/:id/aprobar', permitir('cliente'), async (req, res) => {
    const id = idParam(req);
    const inc = await cargar(id, req.user);
    const r = await query(
        `UPDATE incidentes SET estado = 'Aprobado por Cliente', fecha_aprobacion = ?
         WHERE id_incidente = ? AND id_cliente = ? AND estado = 'Solucionado'`,
        [new Date(), id, req.user.id]
    );
    if (!r.affectedRows) throw error(409, 'El incidente no está pendiente de aprobación');
    await registrarSeguimiento(query, inc, req.user, 'aprobacion', `Servicio aprobado por ${req.user.nombre}`);
    await auditar(req.user, 'aprobar_incidente', 'incidente', id, etiqueta(inc), req.ip);
    await avisar(await programadorComoDestino(inc.id_programador), {
        tipo: 'estado', mensaje: `El cliente aprobó el incidente ${etiqueta(inc)}. Ya puede cerrarse.`, idIncidente: id, correo: true
    });
    difundirCambio(inc);
    res.json({ mensaje: 'Servicio aprobado' });
});

router.post('/:id/revision', permitir('cliente'), async (req, res) => {
    const id = idParam(req);
    const inc = await cargar(id, req.user);
    const motivo = v.texto(req.body.motivo, 'El motivo de la revisión', { min: 5, max: 2000 });
    const r = await query(
        `UPDATE incidentes SET estado = 'En Atención', fecha_solucion = NULL, fecha_aprobacion = NULL, revisiones = revisiones + 1
         WHERE id_incidente = ? AND id_cliente = ? AND estado = 'Solucionado'`,
        [id, req.user.id]
    );
    if (!r.affectedRows) throw error(409, 'El incidente no está pendiente de aprobación');
    await registrarSeguimiento(query, inc, req.user, 'revision', motivo);
    await auditar(req.user, 'solicitar_revision', 'incidente', id, etiqueta(inc), req.ip);
    await avisar(await programadorComoDestino(inc.id_programador), {
        tipo: 'estado', mensaje: `El cliente solicitó revisión de ${etiqueta(inc)}: ${motivo.slice(0, 120)}`, idIncidente: id, correo: true
    });
    difundirCambio(inc);
    res.json({ mensaje: 'Revisión solicitada' });
});

router.post('/:id/encuesta', permitir('cliente'), async (req, res) => {
    const id = idParam(req);
    const inc = await cargar(id, req.user);
    if (!['Aprobado por Cliente', 'Cerrado'].includes(inc.estado)) throw error(409, 'Solo puedes calificar un servicio aprobado');
    const calificacion = Number(req.body.calificacion);
    if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) throw error(400, 'La calificación debe ser de 1 a 5');
    const comentario = v.texto(req.body.comentario, 'El comentario', { max: 500, opcional: true });

    try {
        await query(
            'INSERT INTO encuestas (id_incidente, id_cliente, calificacion, comentario, creado_en) VALUES (?, ?, ?, ?, ?)',
            [id, req.user.id, calificacion, comentario, new Date()]
        );
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw error(409, 'Ya calificaste este servicio');
        throw err;
    }
    await auditar(req.user, 'calificar_servicio', 'incidente', id, `${calificacion}/5`, req.ip);
    difundirCambio(inc);
    res.status(201).json({ mensaje: '¡Gracias por tu calificación!' });
});

// ---------- Archivos adjuntos del incidente (cliente propietario o personal) ----------

router.post('/:id/archivos', subir('archivos', { multiple: true }), async (req, res) => {
    try {
        const id = idParam(req);
        const inc = await cargar(id, req.user);
        if (inc.estado === 'Cerrado') throw error(409, 'El incidente está cerrado');
        if (!req.archivos.length) throw error(400, 'Selecciona al menos un archivo');
        const [{ total }] = await query('SELECT COUNT(*) AS total FROM archivos WHERE id_incidente = ?', [id]);
        if (total + req.archivos.length > 30) throw error(400, 'Se alcanzó el máximo de archivos para este incidente');

        await transaccion(async q => {
            await guardarArchivos(q, inc, req.user, req.archivos);
            await registrarSeguimiento(q, inc, req.user, 'archivo', `Adjuntó: ${req.archivos.map(a => a.nombre).join(', ')}`);
        });
        await auditar(req.user, 'adjuntar_archivo', 'incidente', id, etiqueta(inc), req.ip);
        difundirCambio(inc);
        res.status(201).json({ mensaje: 'Archivos adjuntados' });
    } catch (err) {
        quitarArchivos(req.archivos);
        throw err;
    }
});

// ---------- Chat del incidente ----------

const COLUMNAS_MENSAJE = `id, id_incidente, autor_tipo, id_autor, autor_nombre, texto,
    archivo_nombre, archivo_ruta, archivo_mime, archivo_tamano, creado_en`;

router.get('/:id/mensajes', async (req, res) => {
    const id = idParam(req);
    await cargar(id, req.user);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 50));
    const antes = parseInt(req.query.antes, 10) || null;

    const filas = await query(
        `SELECT ${COLUMNAS_MENSAJE} FROM mensajes WHERE id_incidente = ? ${antes ? 'AND id < ?' : ''}
         ORDER BY id DESC LIMIT ?`,
        antes ? [id, antes, limite + 1] : [id, limite + 1]
    );
    const hayMas = filas.length > limite;
    res.json({ mensajes: filas.slice(0, limite).reverse(), hay_mas: hayMas });
});

router.post('/:id/mensajes', subir('archivo'), async (req, res) => {
    try {
        const id = idParam(req);
        const inc = await cargar(id, req.user);
        if (inc.estado === 'Cerrado') throw error(409, 'El incidente está cerrado: el chat es de solo lectura');

        const texto = v.texto(req.body.texto, 'El mensaje', { max: 2000, opcional: true });
        const archivo = req.archivos[0] || null;
        if (!texto && !archivo) throw error(400, 'Escribe un mensaje o adjunta una imagen/PDF');

        const r = await query(
            `INSERT INTO mensajes (id_incidente, autor_tipo, id_autor, autor_nombre, texto,
                                   archivo_nombre, archivo_ruta, archivo_mime, archivo_tamano, creado_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, req.user.tipo, req.user.id, req.user.nombre, texto,
                archivo?.nombre ?? null, archivo?.ruta ?? null, archivo?.mime ?? null, archivo?.tamano ?? null, new Date()]
        );
        const [mensaje] = await query(`SELECT ${COLUMNAS_MENSAJE} FROM mensajes WHERE id = ?`, [r.insertId]);
        // quien escribe ya "leyó" hasta su propio mensaje
        await marcarLeido(id, req.user, mensaje.id);

        emitir(salaIncidente(id), 'mensaje', mensaje);

        const resumen = texto ? texto.slice(0, 80) : (archivo.mime.startsWith('image/') ? '📷 Imagen' : '📄 PDF');
        const destinos = req.user.tipo === 'cliente'
            ? await programadorComoDestino(inc.id_programador)
            : await clienteComoDestino(inc.id_cliente);
        await avisar(destinos, {
            tipo: 'mensaje',
            mensaje: `${req.user.nombre} en ${etiqueta(inc)}: ${resumen}`,
            idIncidente: id,
            agrupar: true
        });
        // Solo refresca contadores de "sin leer" en las listas (el detalle no necesita recargarse)
        emitir('staff', 'chat:nuevo', { id });
        emitir(salaUsuario('cliente', inc.id_cliente), 'chat:nuevo', { id });
        res.status(201).json(mensaje);
    } catch (err) {
        quitarArchivos(req.archivos);
        throw err;
    }
});

async function marcarLeido(idIncidente, user, hastaId = null) {
    const [{ ultimo }] = await query('SELECT COALESCE(MAX(id), 0) AS ultimo FROM mensajes WHERE id_incidente = ?', [idIncidente]);
    const valor = hastaId ?? ultimo;
    await query(
        `INSERT INTO chat_lecturas (id_incidente, lector_tipo, id_lector, ultimo_id) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE ultimo_id = GREATEST(ultimo_id, VALUES(ultimo_id))`,
        [idIncidente, user.tipo, user.id, valor]
    );
}

// Marca el chat como leído (y descarta los avisos de mensajes de este incidente)
router.post('/:id/leido', async (req, res) => {
    const id = idParam(req);
    await cargar(id, req.user);
    await marcarLeido(id, req.user);
    await query(
        `UPDATE avisos SET leido = 1 WHERE destinatario_tipo = ? AND id_destinatario = ? AND id_incidente = ? AND tipo = 'mensaje'`,
        [req.user.tipo, req.user.id, id]
    );
    res.json({ ok: true });
});

module.exports = router;
