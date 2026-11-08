const router = require('express').Router();
const fs = require('fs');
const { query } = require('../db');
const { error } = require('../lib/http');
const { rutaArchivo } = require('../lib/upload');
const { autenticar } = require('../middleware/auth');

router.use(autenticar);

// Los archivos no son públicos: solo los ve el personal o el cliente dueño del incidente.
router.get('/:ruta', async (req, res) => {
    const { ruta } = req.params;
    if (!/^[a-f0-9-]{36}\.[a-z]{3,4}$/.test(ruta)) throw error(404, 'Archivo no encontrado');

    const [archivo] = await query(
        `SELECT a.id_incidente, a.nombre_archivo AS nombre, a.mime FROM archivos a WHERE a.ruta = ?
         UNION ALL
         SELECT m.id_incidente, m.archivo_nombre, m.archivo_mime FROM mensajes m WHERE m.archivo_ruta = ?`,
        [ruta, ruta]
    );
    if (!archivo) throw error(404, 'Archivo no encontrado');

    if (req.user.tipo === 'cliente') {
        const [inc] = await query('SELECT id_cliente FROM incidentes WHERE id_incidente = ?', [archivo.id_incidente]);
        if (!inc || inc.id_cliente !== req.user.id) throw error(404, 'Archivo no encontrado');
    }

    const ruta_fisica = rutaArchivo(ruta);
    if (!fs.existsSync(ruta_fisica)) throw error(404, 'Archivo no encontrado');

    const disposicion = req.query.descargar === '1' ? 'attachment' : 'inline';
    res.set({
        'Content-Type': archivo.mime,
        'Content-Disposition': `${disposicion}; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'Cache-Control': 'private, max-age=3600'
    });
    res.sendFile(ruta_fisica);
});

module.exports = router;
